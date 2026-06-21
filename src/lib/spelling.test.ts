import { describe, expect, test } from "vitest";
import { buildShuffledLetterTiles } from "./spelling";

describe("spelling letter tiles", () => {
  test("builds stable shuffled tiles that keep every letter", () => {
    const tiles = buildShuffledLetterTiles("library");

    expect(tiles.map((tile) => tile.letter).join("")).not.toBe("library");
    expect(tiles.map((tile) => tile.letter).sort().join("")).toBe("abilrry");
    expect(new Set(tiles.map((tile) => tile.id)).size).toBe(7);
  });
});
