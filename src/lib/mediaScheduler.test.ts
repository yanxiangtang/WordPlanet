import { describe, expect, it, vi } from "vitest";
import { createMediaScheduler, defaultShouldRetry } from "./mediaScheduler";

function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (err: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("media scheduler", () => {
  it("honours per-family concurrency caps", async () => {
    const scheduler = createMediaScheduler({ concurrency: { image: 2 }, delay: () => Promise.resolve() });
    const gates: ReturnType<typeof deferred<void>>[] = [];
    let peak = 0;
    let inflight = 0;

    const promises = Array.from({ length: 5 }, (_, i) =>
      scheduler.enqueue({
        id: `job-${i}`,
        kind: "lessonImage",
        run: async () => {
          inflight += 1;
          peak = Math.max(peak, inflight);
          const gate = deferred<void>();
          gates.push(gate);
          await gate.promise;
          inflight -= 1;
          return i;
        }
      })
    );

    // Let the event loop schedule the first batch.
    await Promise.resolve();
    await Promise.resolve();
    expect(inflight).toBe(2);

    // Release jobs one at a time and confirm we never exceed the cap. New
    // gates are appended as additional jobs start, so we iterate by index
    // rather than over a stale slice.
    for (let i = 0; i < promises.length; i += 1) {
      while (!gates[i]) {
        await Promise.resolve();
      }
      gates[i].resolve();
      // Let the running entry resolve and the next one start.
      await Promise.resolve();
      await Promise.resolve();
    }

    await Promise.all(promises);
    expect(peak).toBe(2);
  });

  it("retries transient failures and succeeds on a later attempt", async () => {
    const scheduler = createMediaScheduler({ delay: () => Promise.resolve() });
    let attempts = 0;
    const result = await scheduler.enqueue({
      id: "retry-job",
      kind: "lessonImage",
      maxAttempts: 4,
      run: async () => {
        attempts += 1;
        if (attempts < 3) {
          const err = new Error("Agnes image request failed: 502") as Error & { status?: number };
          err.status = 502;
          throw err;
        }
        return "ok";
      }
    });

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("fails fast on non-retryable 4xx errors", async () => {
    const scheduler = createMediaScheduler({ delay: () => Promise.resolve() });
    let attempts = 0;
    await expect(
      scheduler.enqueue({
        id: "bad-request",
        kind: "lessonImage",
        run: async () => {
          attempts += 1;
          const err = new Error("Agnes image request failed: 400") as Error & { status?: number };
          err.status = 400;
          throw err;
        }
      })
    ).rejects.toThrow(/400/);
    expect(attempts).toBe(1);
  });

  it("dedupes concurrent enqueues with the same id", async () => {
    const scheduler = createMediaScheduler({ delay: () => Promise.resolve() });
    let calls = 0;
    const gate = deferred<string>();
    const job = {
      id: "shared",
      kind: "storyText" as const,
      run: async () => {
        calls += 1;
        return gate.promise;
      }
    };

    const p1 = scheduler.enqueue(job);
    const p2 = scheduler.enqueue(job);
    await Promise.resolve();
    gate.resolve("done");
    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toBe("done");
    expect(b).toBe("done");
    expect(calls).toBe(1);
  });

  it("cancels a running job and rejects its promise", async () => {
    const scheduler = createMediaScheduler({ delay: () => Promise.resolve() });
    const started = vi.fn();
    const promise = scheduler.enqueue({
      id: "to-cancel",
      kind: "rewardVideo",
      run: (signal) =>
        new Promise<string>((_resolve, reject) => {
          started();
          signal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")));
        })
    });
    await Promise.resolve();
    expect(started).toHaveBeenCalled();
    scheduler.cancel("to-cancel");
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("emits queued/started/succeeded events in order", async () => {
    const scheduler = createMediaScheduler({ delay: () => Promise.resolve() });
    const events: string[] = [];
    scheduler.subscribe((event) => events.push(event.type));
    await scheduler.enqueue({
      id: "observe",
      kind: "lessonImage",
      run: async () => "ok"
    });
    expect(events).toEqual(["queued", "started", "succeeded"]);
  });
});

describe("defaultShouldRetry", () => {
  it("retries on TypeError and 5xx/429", () => {
    expect(defaultShouldRetry(new TypeError("network down"))).toBe(true);
    const fivexx = new Error("Agnes image request failed: 503") as Error & { status?: number };
    fivexx.status = 503;
    expect(defaultShouldRetry(fivexx)).toBe(true);
    const tooMany = new Error("Agnes image request failed: 429") as Error & { status?: number };
    tooMany.status = 429;
    expect(defaultShouldRetry(tooMany)).toBe(true);
  });

  it("does not retry on 4xx (other than 429) or AbortError", () => {
    const bad = new Error("Agnes image request failed: 401") as Error & { status?: number };
    bad.status = 401;
    expect(defaultShouldRetry(bad)).toBe(false);
    expect(defaultShouldRetry(new DOMException("aborted", "AbortError"))).toBe(false);
  });
});
