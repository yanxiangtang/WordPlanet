// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addRewardGameTrophy,
  loadLastPickedRewardGame,
  loadRewardGameTrophies,
  saveLastPickedRewardGame,
  saveRewardGameTrophies,
  type RewardGameKind
} from "./rewardGameTrophies";

const TROPHIES_KEY = "word-planet:reward-game-trophies:v1";
const LAST_PICK_KEY = "word-planet:reward-game-last-pick:v1";

// Node 22+ ships an experimental localStorage that's disabled unless
// --localstorage-file is passed; that shadowing leaves jsdom's localStorage
// unreachable in this lib test. Install a tiny in-memory shim per test.
function installMemoryStorage(): Storage {
  const data = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => (data.has(key) ? (data.get(key) as string) : null),
    key: (index) => Array.from(data.keys())[index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, String(value));
    }
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
    writable: true
  });
  return storage;
}

describe("reward game trophies", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = installMemoryStorage();
  });

  afterEach(() => {
    storage.clear();
  });

  it("returns an empty list when nothing is stored", () => {
    expect(loadRewardGameTrophies()).toEqual([]);
  });

  it("round-trips a save and load", () => {
    saveRewardGameTrophies(["monster", "balloon"]);
    expect(loadRewardGameTrophies()).toEqual(["monster", "balloon"]);
  });

  it("dedupes when adding the same trophy twice and returns the same array reference", () => {
    const start: RewardGameKind[] = ["twin"];
    const afterFirst = addRewardGameTrophy(start, "monster");
    expect(afterFirst).toEqual(["twin", "monster"]);

    const afterDuplicate = addRewardGameTrophy(afterFirst, "monster");
    expect(afterDuplicate).toBe(afterFirst);
  });

  it("falls back to an empty list on malformed JSON", () => {
    storage.setItem(TROPHIES_KEY, "{not json");
    expect(loadRewardGameTrophies()).toEqual([]);
  });

  it("filters out unknown kinds and duplicates while loading", () => {
    storage.setItem(
      TROPHIES_KEY,
      JSON.stringify({ earned: ["monster", "monster", "rocket", 5, "balloon"] })
    );
    expect(loadRewardGameTrophies()).toEqual(["monster", "balloon"]);
  });

  it("returns null for last-picked game when nothing is stored", () => {
    expect(loadLastPickedRewardGame()).toBeNull();
  });

  it("round-trips a last-picked game across save and load", () => {
    saveLastPickedRewardGame("balloon");
    expect(loadLastPickedRewardGame()).toBe("balloon");
  });

  it("clears the last-picked game when saving null", () => {
    saveLastPickedRewardGame("monster");
    expect(loadLastPickedRewardGame()).toBe("monster");
    saveLastPickedRewardGame(null);
    expect(loadLastPickedRewardGame()).toBeNull();
    expect(storage.getItem(LAST_PICK_KEY)).toBeNull();
  });

  it("treats an unknown last-picked kind as no selection", () => {
    storage.setItem(LAST_PICK_KEY, JSON.stringify({ kind: "rocket" }));
    expect(loadLastPickedRewardGame()).toBeNull();
  });
});
