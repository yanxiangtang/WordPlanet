// Client-side scheduler that wraps every Agnes call.
//
// Three problems prompted this module:
//   1. Each Agnes endpoint used to be called via raw `fetch` with no retry.
//      A single transient 5xx killed lesson generation outright.
//   2. Word images, story images, and unit covers all hit the same image
//      endpoint with no concurrency cap, so a book switch could fire 30+
//      parallel requests and starve the lesson the kid is actually in.
//   3. There was no way to cancel an in-flight reward video when the kid
//      switched units mid-render, so polling kept running on stale state.
//
// The scheduler enforces per-kind concurrency (image / text / video),
// retries transient failures with exponential backoff + jitter, dedupes
// jobs by id so two callers can await the same in-flight request, and
// propagates cancellation through AbortSignal. Every state change is
// broadcast as an event so React glue (`useMediaProgress`) can render
// progress without prop-drilling.

export type MediaJobKind =
  | "unitCover"
  | "lessonImage"
  | "storyText"
  | "storyImage"
  | "rewardVideo";

export type MediaJobFamily = "image" | "text" | "video";

export type MediaJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type MediaSchedulerEvent =
  | { type: "queued"; id: string; kind: MediaJobKind }
  | { type: "started"; id: string; kind: MediaJobKind; attempt: number }
  | { type: "progress"; id: string; kind: MediaJobKind; stage?: string; pct?: number }
  | { type: "succeeded"; id: string; kind: MediaJobKind }
  | { type: "failed"; id: string; kind: MediaJobKind; error: Error; willRetry: boolean }
  | { type: "cancelled"; id: string; kind: MediaJobKind };

export type MediaJob<T> = {
  id: string;
  kind: MediaJobKind;
  priority?: number;
  maxAttempts?: number;
  run: (signal: AbortSignal, onProgress?: (stage: string, pct?: number) => void) => Promise<T>;
};

export type SchedulerConfig = {
  concurrency?: Partial<Record<MediaJobFamily, number>>;
  defaultMaxAttempts?: number;
  baseDelayMs?: number;
  shouldRetry?: (err: unknown) => boolean;
  // Replaceable for tests so backoff doesn't sleep real time.
  delay?: (ms: number) => Promise<void>;
};

export interface MediaScheduler {
  enqueue<T>(job: MediaJob<T>): Promise<T>;
  cancel(id: string): void;
  cancelAll(filter?: (snapshot: { id: string; kind: MediaJobKind }) => boolean): void;
  subscribe(listener: (event: MediaSchedulerEvent) => void): () => void;
  getState(): SchedulerSnapshot;
}

export type SchedulerSnapshot = {
  running: { id: string; kind: MediaJobKind; attempt: number }[];
  queued: { id: string; kind: MediaJobKind }[];
};

const DEFAULT_CONCURRENCY: Record<MediaJobFamily, number> = {
  image: 3,
  text: 2,
  video: 1
};

export function familyForKind(kind: MediaJobKind): MediaJobFamily {
  switch (kind) {
    case "unitCover":
    case "lessonImage":
    case "storyImage":
      return "image";
    case "storyText":
      return "text";
    case "rewardVideo":
      return "video";
  }
}

// Default retry policy: network errors (TypeError), 5xx and 429 are
// transient and worth retrying; other 4xx are caller mistakes / moderation
// rejections and won't get better with retries. The scheduler also recognises
// any error tagged with `.transient = true` so callers can opt into retries
// for custom failure shapes.
export function defaultShouldRetry(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof DOMException && err.name === "AbortError") return false;
  if (err instanceof TypeError) return true;
  if (typeof err === "object" && err !== null && "transient" in err && (err as { transient?: unknown }).transient === true) {
    return true;
  }
  const status = extractStatus(err);
  if (status === undefined) return false;
  if (status === 429) return true;
  if (status >= 500 && status < 600) return true;
  return false;
}

function extractStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const candidate = (err as { status?: unknown }).status;
  if (typeof candidate === "number") return candidate;
  const message = (err as { message?: unknown }).message;
  if (typeof message === "string") {
    const match = message.match(/\b(\d{3})\b/);
    if (match) return Number(match[1]);
  }
  return undefined;
}

type Entry = {
  id: string;
  kind: MediaJobKind;
  family: MediaJobFamily;
  priority: number;
  maxAttempts: number;
  attempt: number;
  controller: AbortController;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  promise: Promise<unknown>;
  run: (signal: AbortSignal, onProgress?: (stage: string, pct?: number) => void) => Promise<unknown>;
};

export function createMediaScheduler(config: SchedulerConfig = {}): MediaScheduler {
  const concurrency: Record<MediaJobFamily, number> = {
    ...DEFAULT_CONCURRENCY,
    ...(config.concurrency ?? {})
  };
  const defaultMaxAttempts = config.defaultMaxAttempts ?? 3;
  const baseDelayMs = config.baseDelayMs ?? 800;
  const shouldRetry = config.shouldRetry ?? defaultShouldRetry;
  const delay =
    config.delay ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const queues: Record<MediaJobFamily, Entry[]> = { image: [], text: [], video: [] };
  const running: Record<MediaJobFamily, Set<Entry>> = {
    image: new Set(),
    text: new Set(),
    video: new Set()
  };
  const inflight = new Map<string, Entry>();
  const listeners = new Set<(event: MediaSchedulerEvent) => void>();

  function emit(event: MediaSchedulerEvent) {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // Listener errors must not stall the scheduler.
      }
    }
  }

  function pump(family: MediaJobFamily) {
    while (running[family].size < concurrency[family] && queues[family].length > 0) {
      // Highest priority first; ties broken by insertion order (queues are
      // FIFO, so we splice the first index with the max priority).
      let bestIdx = 0;
      for (let i = 1; i < queues[family].length; i += 1) {
        if (queues[family][i].priority > queues[family][bestIdx].priority) bestIdx = i;
      }
      const [entry] = queues[family].splice(bestIdx, 1);
      void executeEntry(entry);
    }
  }

  async function executeEntry(entry: Entry) {
    running[entry.family].add(entry);
    try {
      while (true) {
        if (entry.controller.signal.aborted) {
          finishCancelled(entry);
          return;
        }
        entry.attempt += 1;
        emit({ type: "started", id: entry.id, kind: entry.kind, attempt: entry.attempt });
        try {
          const result = await entry.run(entry.controller.signal, (stage, pct) =>
            emit({ type: "progress", id: entry.id, kind: entry.kind, stage, pct })
          );
          if (entry.controller.signal.aborted) {
            finishCancelled(entry);
            return;
          }
          inflight.delete(entry.id);
          emit({ type: "succeeded", id: entry.id, kind: entry.kind });
          entry.resolve(result);
          return;
        } catch (error) {
          if (entry.controller.signal.aborted) {
            finishCancelled(entry);
            return;
          }
          const canRetry = entry.attempt < entry.maxAttempts && shouldRetry(error);
          emit({
            type: "failed",
            id: entry.id,
            kind: entry.kind,
            error: error instanceof Error ? error : new Error(String(error)),
            willRetry: canRetry
          });
          if (!canRetry) {
            inflight.delete(entry.id);
            entry.reject(error);
            return;
          }
          const wait = Math.random() * baseDelayMs * 2 ** (entry.attempt - 1);
          await delay(wait);
        }
      }
    } finally {
      running[entry.family].delete(entry);
      pump(entry.family);
    }
  }

  function finishCancelled(entry: Entry) {
    inflight.delete(entry.id);
    emit({ type: "cancelled", id: entry.id, kind: entry.kind });
    entry.reject(new DOMException("Cancelled", "AbortError"));
  }

  function enqueue<T>(job: MediaJob<T>): Promise<T> {
    const existing = inflight.get(job.id);
    if (existing) return existing.promise as Promise<T>;

    const family = familyForKind(job.kind);
    const controller = new AbortController();
    let resolveOuter!: (value: unknown) => void;
    let rejectOuter!: (reason: unknown) => void;
    const promise = new Promise<unknown>((resolve, reject) => {
      resolveOuter = resolve;
      rejectOuter = reject;
    });
    const entry: Entry = {
      id: job.id,
      kind: job.kind,
      family,
      priority: job.priority ?? 0,
      maxAttempts: job.maxAttempts ?? defaultMaxAttempts,
      attempt: 0,
      controller,
      resolve: resolveOuter,
      reject: rejectOuter,
      promise,
      run: job.run as Entry["run"]
    };
    inflight.set(job.id, entry);
    queues[family].push(entry);
    emit({ type: "queued", id: job.id, kind: job.kind });
    pump(family);
    return promise as Promise<T>;
  }

  function cancel(id: string) {
    const entry = inflight.get(id);
    if (!entry) return;
    entry.controller.abort();
    // If the entry is still queued (not running), pop it now and emit
    // cancelled — otherwise the running loop will notice the aborted signal
    // and finish the cancellation itself.
    const queue = queues[entry.family];
    const idx = queue.indexOf(entry);
    if (idx !== -1) {
      queue.splice(idx, 1);
      finishCancelled(entry);
    }
  }

  function cancelAll(filter?: (snapshot: { id: string; kind: MediaJobKind }) => boolean) {
    const targets: string[] = [];
    for (const entry of inflight.values()) {
      if (!filter || filter({ id: entry.id, kind: entry.kind })) targets.push(entry.id);
    }
    for (const id of targets) cancel(id);
  }

  function subscribe(listener: (event: MediaSchedulerEvent) => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function getState(): SchedulerSnapshot {
    return {
      running: Object.values(running)
        .flatMap((set) => Array.from(set))
        .map((entry) => ({ id: entry.id, kind: entry.kind, attempt: entry.attempt })),
      queued: Object.values(queues)
        .flat()
        .map((entry) => ({ id: entry.id, kind: entry.kind }))
    };
  }

  return { enqueue, cancel, cancelAll, subscribe, getState };
}

// Module-singleton used by App.tsx and the React glue hook. Tests can
// construct their own instance via `createMediaScheduler` for isolation.
let sharedScheduler: MediaScheduler | null = null;

export function getMediaScheduler(): MediaScheduler {
  if (!sharedScheduler) sharedScheduler = createMediaScheduler();
  return sharedScheduler;
}

// Reset hook used by tests; not part of the public app API.
export function __resetMediaSchedulerForTests(next: MediaScheduler | null): void {
  sharedScheduler = next;
}
