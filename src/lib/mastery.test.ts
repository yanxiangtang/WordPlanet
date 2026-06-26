import { describe, expect, it } from "vitest";
import { selectMissionWords } from "../data/vocabulary";
import { createEmptyMastery, isMissionComplete, recordMasteryResult, rewardPracticeGaps } from "./mastery";

describe("word mastery tracking", () => {
  it("tracks meaning, say, and write lanes independently", () => {
    const initial = createEmptyMastery(["library"]);
    const withMeaning = recordMasteryResult(initial, "library", "meaning", true);
    const withSay = recordMasteryResult(withMeaning, "library", "say", false);
    const withWrite = recordMasteryResult(withSay, "library", "write", true);

    expect(withWrite.library.meaning.correct).toBe(1);
    expect(withWrite.library.say.wrong).toBe(1);
    expect(withWrite.library.write.correct).toBe(1);
  });

  it("requires meaning and writing mastery but treats pronunciation as best-have", () => {
    let mastery = createEmptyMastery(["library", "classroom"]);
    mastery = recordMasteryResult(mastery, "library", "meaning", true);
    mastery = recordMasteryResult(mastery, "library", "write", true);
    mastery = recordMasteryResult(mastery, "classroom", "meaning", true);

    expect(isMissionComplete(mastery)).toBe(false);

    mastery = recordMasteryResult(mastery, "classroom", "write", true);

    expect(isMissionComplete(mastery)).toBe(true);
  });

  it("reports reward gaps for meaning and spelling only", () => {
    const words = selectMissionWords("yilin-grade3", "3A", 5, 1).slice(0, 3);
    let mastery = createEmptyMastery(words.map((word) => word.id));
    mastery = recordMasteryResult(mastery, words[0].id, "meaning", true);
    mastery = recordMasteryResult(mastery, words[0].id, "write", true);
    mastery = recordMasteryResult(mastery, words[1].id, "meaning", true);
    mastery = recordMasteryResult(mastery, words[2].id, "say", true);

    expect(rewardPracticeGaps(mastery, words)).toEqual([
      {
        lane: "meaning",
        label: "Meaning",
        completed: 2,
        total: 3,
        missingWords: [words[2].word]
      },
      {
        lane: "write",
        label: "Spelling",
        completed: 1,
        total: 3,
        missingWords: [words[1].word, words[2].word]
      }
    ]);
  });
});
