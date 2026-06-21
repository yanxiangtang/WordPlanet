import { describe, expect, it } from "vitest";
import { getCuratedVocabulary, getTopicWords, selectDailyWords } from "./vocabulary";

describe("curated vocabulary seed", () => {
  it("ships a substantial Cambridge-inspired seed with a polished School Planet", () => {
    const words = getCuratedVocabulary();
    const school = getTopicWords("school");

    expect(words.length).toBeGreaterThanOrEqual(80);
    expect(school.length).toBeGreaterThanOrEqual(20);
    expect(school.some((entry) => entry.word === "library" && entry.meaningZh === "图书馆")).toBe(true);
  });

  it("selects a deterministic five-word daily mission for School Planet", () => {
    const words = selectDailyWords("school", 5);

    expect(words).toHaveLength(5);
    expect(words.map((entry) => entry.word)).toEqual([
      "library",
      "classroom",
      "homework",
      "dictionary",
      "project"
    ]);
  });
});

