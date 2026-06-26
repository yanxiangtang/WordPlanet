import { describe, expect, test } from "vitest";
import { buildShuffledLetterTiles } from "./spelling";

describe("spelling letter tiles", () => {
  test("builds stable shuffled tiles that keep every letter", () => {
    const tiles = buildShuffledLetterTiles("library");

    expect(tiles.map((tile) => tile.letter).join("")).not.toBe("library");
    expect(tiles.map((tile) => tile.letter).sort().join("")).toBe("abilrry");
    expect(new Set(tiles.map((tile) => tile.id)).size).toBe(7);
  });

  test("varies the shuffled order when the seed changes", () => {
    const first = buildShuffledLetterTiles("planet", 1);
    const second = buildShuffledLetterTiles("planet", 2);

    expect(first.map((tile) => tile.letter).join("")).not.toBe("planet");
    expect(second.map((tile) => tile.letter).join("")).not.toBe("planet");
    expect(first.map((tile) => tile.letter).join("")).not.toBe(second.map((tile) => tile.letter).join(""));
    expect(first.map((tile) => tile.letter).sort().join("")).toBe("aelnpt");
    expect(second.map((tile) => tile.letter).sort().join("")).toBe("aelnpt");
    expect(new Set(first.map((tile) => tile.id)).size).toBe(6);
    expect(new Set(second.map((tile) => tile.id)).size).toBe(6);
  });
});
