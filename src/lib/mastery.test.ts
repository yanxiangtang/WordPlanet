import { describe, expect, it } from "vitest";
import { createEmptyMastery, isMissionComplete, recordMasteryResult } from "./mastery";

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
});

