// Persisted "earned" badges for the three reward mini-games. Kept tiny and
// localStorage-backed, mirroring `progress.ts` rather than going through the
// versioned IndexedDB layer — this is one short array of string ids per kid.
//
// The RewardGameKind union and the canonical kind list live here (not in
// `App.tsx`) so the load/save layer and the App can share them without a
// circular import.

export type RewardGameKind = "twin" | "monster" | "balloon";

export const REWARD_GAME_KINDS: ReadonlyArray<RewardGameKind> = ["twin", "monster", "balloon"];

const TROPHIES_KEY = "word-planet:reward-game-trophies:v1";
const LAST_PICK_KEY = "word-planet:reward-game-last-pick:v1";

function isRewardGameKind(value: unknown): value is RewardGameKind {
  return typeof value === "string" && (REWARD_GAME_KINDS as ReadonlyArray<string>).includes(value);
}

export function loadRewardGameTrophies(): RewardGameKind[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(TROPHIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { earned?: unknown };
    const earned = Array.isArray(parsed?.earned) ? parsed.earned : [];
    const seen = new Set<RewardGameKind>();
    const result: RewardGameKind[] = [];
    for (const item of earned) {
      if (isRewardGameKind(item) && !seen.has(item)) {
        seen.add(item);
        result.push(item);
      }
    }
    return result;
  } catch {
    return [];
  }
}

export function saveRewardGameTrophies(earned: ReadonlyArray<RewardGameKind>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(TROPHIES_KEY, JSON.stringify({ earned: [...earned] }));
  } catch {
    // Swallow quota / disabled-storage errors — trophies are a cosmetic nicety,
    // not something to surface to a kid.
  }
}

// Returns the same array reference when `kind` is already earned so callers
// can compare by identity to skip a redundant save.
export function addRewardGameTrophy(
  current: ReadonlyArray<RewardGameKind>,
  kind: RewardGameKind
): RewardGameKind[] {
  if (current.includes(kind)) return current as RewardGameKind[];
  return [...current, kind];
}

// Remembers which reward game the kid was last playing so the page comes back
// to that game after a refresh instead of dropping back into the chooser. A
// stored value of `null` (cleared via the explicit "Pick another game" button)
// means "show the chooser on next visit".
export function loadLastPickedRewardGame(): RewardGameKind | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(LAST_PICK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { kind?: unknown };
    return isRewardGameKind(parsed?.kind) ? parsed.kind : null;
  } catch {
    return null;
  }
}

export function saveLastPickedRewardGame(kind: RewardGameKind | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (kind === null) {
      localStorage.removeItem(LAST_PICK_KEY);
      return;
    }
    localStorage.setItem(LAST_PICK_KEY, JSON.stringify({ kind }));
  } catch {
    // Same swallow as the trophy save — non-critical.
  }
}
