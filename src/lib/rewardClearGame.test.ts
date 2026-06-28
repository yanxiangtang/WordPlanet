import { describe, expect, it } from "vitest";
import type { WordEntry } from "../types";
import {
  buildRewardBoard,
  buildRewardChoices,
  buildRewardWordPool,
  clearRewardPair,
  hasRewardMove,
  type RewardBoard,
  type RewardTile
} from "./rewardClearGame";

const words: WordEntry[] = [
  word("w1", "apple"),
  word("w2", "banana"),
  word("w3", "cake")
];

function word(id: string, value: string): WordEntry {
  return {
    id,
    word: value,
    meaningZh: value,
    wordType: "noun",
    topic: "test",
    level: "A1 Movers",
    example: "",
    exampleZh: "",
    imagePromptHint: "",
    spellingDifficulty: "easy",
    pronunciationNote: ""
  };
}

function tile(token: string, row: number, col: number): RewardTile {
  return {
    id: `${token}-${row}-${col}`,
    token,
    kind: "word",
    label: token,
    wordId: token
  };
}

function board(tokens: string[][]): RewardBoard {
  return tokens.map((row, rowIndex) => row.map((token, colIndex) => tile(token, rowIndex, colIndex)));
}

describe("reward clear game board helpers", () => {
  it("detects matching pairs anywhere on the board", () => {
    const gameBoard = board([
      ["a", "b", "c"],
      ["d", "e", "f"],
      ["g", "h", "a"]
    ]);

    expect(hasRewardMove(gameBoard)).toBe(true);
  });

  it("rejects mismatched pair clears", () => {
    const gameBoard = board([
      ["a", "b"],
      ["c", "d"]
    ]);

    const result = clearRewardPair(gameBoard, { row: 0, col: 0 }, { row: 0, col: 1 });

    expect(result.cleared).toBe(0);
    expect(result.board.map((row) => row.map((item) => item?.token ?? null))).toEqual([
      ["a", "b"],
      ["c", "d"]
    ]);
  });

  it("clears identical non-adjacent pairs in place without moving other cards", () => {
    const gameBoard = board([
      ["a", "b", "c"],
      ["b", "d", "c"],
      ["e", "d", "f"]
    ]);

    const result = clearRewardPair(
      gameBoard,
      { row: 0, col: 1 },
      { row: 1, col: 0 }
    );

    expect(result.cleared).toBe(2);
    expect(result.board).toHaveLength(3);
    expect(result.board.every((row) => row.length === 3)).toBe(true);
    expect(result.board.map((row) => row.map((item) => item?.token ?? null))).toEqual([
      ["a", null, "c"],
      [null, "d", "c"],
      ["e", "d", "f"]
    ]);
  });

  it("detects whether any duplicate pair remains", () => {
    expect(hasRewardMove(board([
      ["a", "b", "c"],
      ["d", "e", "f"],
      ["g", "h", "i"]
    ]))).toBe(false);
    expect(hasRewardMove(board([
      ["a", "b", "c"],
      ["d", "e", "f"],
      ["g", "h", "a"]
    ]))).toBe(true);
  });

  it("creates a full board with a guaranteed starting move", () => {
    const gameBoard = buildRewardBoard({
      words,
      columns: 6,
      rows: 6,
      seed: "unit-test"
    });
    const tokenCounts = new Map<string, number>();
    for (const row of gameBoard) {
      for (const item of row) {
        if (!item) continue;
        tokenCounts.set(item.token, (tokenCounts.get(item.token) ?? 0) + 1);
      }
    }

    expect(gameBoard).toHaveLength(6);
    expect(gameBoard.every((row) => row.length === 6)).toBe(true);
    expect(hasRewardMove(gameBoard)).toBe(true);
    expect(Array.from(tokenCounts.values()).every((count) => count % 2 === 0)).toBe(true);
  });

  it("builds a repeated reward word pool from short word lists", () => {
    const pool = buildRewardWordPool(words.slice(0, 2), 5);

    expect(pool).toHaveLength(5);
    expect(pool.map((item) => item.word)).toEqual([
      words[0].word,
      words[1].word,
      words[0].word,
      words[1].word,
      words[0].word
    ]);
  });

  it("builds target choices with the target included", () => {
    const choices = buildRewardChoices(words, words[1], 4, "monster");

    expect(choices).toHaveLength(4);
    expect(choices.some((choice) => choice.wordId === words[1].id)).toBe(true);
    expect(new Set(choices.map((choice) => choice.id)).size).toBe(4);
  });
});
