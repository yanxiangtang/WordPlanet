import { describe, expect, it } from "vitest";
import { createEmptyMastery, recordMasteryResult } from "./mastery";
import { buildProgressStats, recordDailyVisit } from "./progress";

describe("kid progress stats", () => {
  it("turns real mastery into stars, gems, and collected words", () => {
    let mastery = createEmptyMastery(["apple", "banana", "cat"]);
    mastery = recordMasteryResult(mastery, "apple", "meaning", true);
    mastery = recordMasteryResult(mastery, "apple", "write", true);
    mastery = recordMasteryResult(mastery, "banana", "meaning", true);

    const stats = buildProgressStats({
      currentMastery: mastery,
      unitSummaries: {
        1: { masteredWords: 1, complete: false },
        2: { masteredWords: 5, complete: true }
      }
    });

    expect(stats.collectedWords).toBe(6);
    expect(stats.gems).toBe(6);
    expect(stats.stars).toBe(110);
  });

  it("tracks same-day and consecutive-day streaks without double-counting", () => {
    const first = recordDailyVisit(undefined, new Date("2026-06-26T08:00:00"));
    const sameDay = recordDailyVisit(first, new Date("2026-06-26T20:00:00"));
    const nextDay = recordDailyVisit(sameDay, new Date("2026-06-27T08:00:00"));
    const skipped = recordDailyVisit(nextDay, new Date("2026-06-29T08:00:00"));

    expect(first.count).toBe(1);
    expect(sameDay.count).toBe(1);
    expect(nextDay.count).toBe(2);
    expect(skipped.count).toBe(1);
  });
});
