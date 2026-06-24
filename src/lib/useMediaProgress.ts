import { useSyncExternalStore } from "react";
import type { MediaJobKind, MediaScheduler, MediaSchedulerEvent } from "./mediaScheduler";
import { getMediaScheduler } from "./mediaScheduler";

// React glue around the media scheduler so components can render queue
// counts and per-id progress without prop-drilling. The hook subscribes to
// every scheduler event and rebuilds a small immutable snapshot per change.
//
// Snapshot fields:
//   - `running[kind]`: ids currently in flight by kind family
//   - `queued[kind]`: ids waiting on the queue by kind family
//   - `stages[id]`: latest progress event (stage + pct) for that id, useful
//     for the reward pipeline's multi-stage UX
//
// Callers usually only need a derived count for their unit-scoped ids; the
// hook is intentionally cheap (O(scheduler state size) per render) and
// re-renders only when an event lands.

export type MediaProgressSnapshot = {
  running: Record<MediaJobKind, string[]>;
  queued: Record<MediaJobKind, string[]>;
  stages: Record<string, { stage?: string; pct?: number }>;
};

const EMPTY_SNAPSHOT: MediaProgressSnapshot = {
  running: {
    unitCover: [],
    lessonImage: [],
    storyText: [],
    storyImage: [],
    rewardVideo: []
  },
  queued: {
    unitCover: [],
    lessonImage: [],
    storyText: [],
    storyImage: [],
    rewardVideo: []
  },
  stages: {}
};

type Subscriber = (cb: () => void) => () => void;

function makeStore(scheduler: MediaScheduler): {
  subscribe: Subscriber;
  getSnapshot: () => MediaProgressSnapshot;
} {
  let snapshot = computeSnapshot(scheduler, EMPTY_SNAPSHOT.stages);

  function computeSnapshot(
    sched: MediaScheduler,
    stages: Record<string, { stage?: string; pct?: number }>
  ): MediaProgressSnapshot {
    const state = sched.getState();
    const running: Record<MediaJobKind, string[]> = {
      unitCover: [],
      lessonImage: [],
      storyText: [],
      storyImage: [],
      rewardVideo: []
    };
    const queued: Record<MediaJobKind, string[]> = {
      unitCover: [],
      lessonImage: [],
      storyText: [],
      storyImage: [],
      rewardVideo: []
    };
    for (const entry of state.running) running[entry.kind].push(entry.id);
    for (const entry of state.queued) queued[entry.kind].push(entry.id);
    return { running, queued, stages };
  }

  let stages = { ...EMPTY_SNAPSHOT.stages };
  const listeners = new Set<() => void>();
  const unsubscribeScheduler = scheduler.subscribe((event: MediaSchedulerEvent) => {
    if (event.type === "progress") {
      stages = { ...stages, [event.id]: { stage: event.stage, pct: event.pct } };
    } else if (event.type === "succeeded" || event.type === "failed" || event.type === "cancelled") {
      if (stages[event.id]) {
        const next = { ...stages };
        delete next[event.id];
        stages = next;
      }
    }
    snapshot = computeSnapshot(scheduler, stages);
    for (const listener of listeners) listener();
  });

  return {
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
        if (listeners.size === 0) {
          // Keep the scheduler subscription alive across remounts; only
          // tear it down when the module unloads. For now we leave it
          // attached — schedulers are app-lifetime singletons.
          void unsubscribeScheduler;
        }
      };
    },
    getSnapshot: () => snapshot
  };
}

let cachedStore: ReturnType<typeof makeStore> | null = null;
let cachedScheduler: MediaScheduler | null = null;

function getStore(scheduler: MediaScheduler) {
  if (cachedStore && cachedScheduler === scheduler) return cachedStore;
  cachedScheduler = scheduler;
  cachedStore = makeStore(scheduler);
  return cachedStore;
}

export function useMediaProgress(): MediaProgressSnapshot {
  const scheduler = getMediaScheduler();
  const store = getStore(scheduler);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

// Convenience helper for unit-scoped UIs: how many image jobs (lesson or
// story) for a given unit key are still pending or running?
export function countUnitImageJobs(snapshot: MediaProgressSnapshot, unitKey: string): { running: number; queued: number } {
  const matches = (id: string) => id.includes(`:${unitKey}:`) || id.endsWith(`:${unitKey}`);
  const running =
    snapshot.running.lessonImage.filter(matches).length + snapshot.running.storyImage.filter(matches).length;
  const queued =
    snapshot.queued.lessonImage.filter(matches).length + snapshot.queued.storyImage.filter(matches).length;
  return { running, queued };
}
