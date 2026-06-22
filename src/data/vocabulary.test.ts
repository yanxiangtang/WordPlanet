import { describe, expect, it } from "vitest";
import { getBookWords, getVocabularySet, listBooks, listVocabularySets, selectMissionWords } from "./vocabulary";

describe("JSON vocabulary sets", () => {
  it("registers the 译林版三年级 set with books 3A and 3B", () => {
    const sets = listVocabularySets();
    expect(sets.length).toBeGreaterThanOrEqual(1);

    const yilin = getVocabularySet("yilin-grade3");
    expect(yilin).toBeDefined();
    expect(yilin?.books.map((book) => book.id)).toEqual(["3A", "3B"]);
  });

  it("flattens a book's units into derived word entries with unique ids", () => {
    const words = getBookWords("yilin-grade3", "3A");
    const bookSummary = listBooks("yilin-grade3").find((book) => book.id === "3A");

    expect(words.length).toBe(bookSummary?.wordCount);
    expect(words.length).toBeGreaterThanOrEqual(80);

    const ids = words.map((word) => word.id);
    expect(new Set(ids).size).toBe(ids.length);

    expect(words.every((word) => word.imagePromptHint.length > 0)).toBe(true);
    expect(words.every((word) => ["easy", "medium", "tricky"].includes(word.spellingDifficulty))).toBe(true);
    expect(words.every((word) => word.topic === "yilin-grade3")).toBe(true);
    expect(words.every((word) => word.example === "")).toBe(true);
  });

  it("selects a deterministic mission slice from the chosen book", () => {
    const words = selectMissionWords("yilin-grade3", "3A", 5);
    const allWords = getBookWords("yilin-grade3", "3A");

    expect(words).toHaveLength(5);
    expect(words).toEqual(allWords.slice(0, 5));
    expect(words[0].word).toBe("Hello!");
  });

  it("returns no words for an unknown set or book", () => {
    expect(getBookWords("missing-set", "3A")).toEqual([]);
    expect(getBookWords("yilin-grade3", "9Z")).toEqual([]);
  });
});
