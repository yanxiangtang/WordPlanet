import type { LessonPack, WordEntry } from "../types";

export type RewardTileKind = "word" | "picture" | "bonus";

export type RewardTile = {
  id: string;
  token: string;
  kind: RewardTileKind;
  label: string;
  wordId?: string;
  imageUrl?: string;
};

export type RewardBoard = Array<Array<RewardTile | null>>;

export type RewardCell = {
  row: number;
  col: number;
};

export type RewardWordItem = {
  id: string;
  wordId: string;
  token: string;
  word: string;
};

export type RewardBoardOptions = {
  words: WordEntry[];
  pack?: LessonPack;
  rows?: number;
  columns?: number;
  seed?: string;
};

const DEFAULT_ROWS = 6;
const DEFAULT_COLUMNS = 6;
const FALLBACK_REWARD_WORDS: WordEntry[] = [
  fallbackWord("fallback-hello", "hello"),
  fallbackWord("fallback-good", "good"),
  fallbackWord("fallback-star", "star")
];

function fallbackWord(id: string, value: string): WordEntry {
  return {
    id,
    word: value,
    meaningZh: value,
    wordType: "noun",
    topic: "reward",
    level: "A1 Movers",
    example: "",
    exampleZh: "",
    imagePromptHint: "",
    spellingDifficulty: "easy",
    pronunciationNote: ""
  };
}

function hashString(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextRandom(state: number): number {
  let value = state + 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return value >>> 0;
}

function shuffleRewardItems<T extends { id: string }>(items: T[], seed: string): T[] {
  let state = hashString(seed) || 1;
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = nextRandom(state + index * 97);
    const swapIndex = state % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function makeTileForWord(
  word: WordEntry,
  index: number
): RewardTile {
  return {
    id: `reward-word-${word.id}-${index}`,
    token: `word:${word.id}`,
    kind: "word",
    label: word.word,
    wordId: word.id
  };
}

export function buildRewardWordPool(words: WordEntry[], count: number): RewardWordItem[] {
  const source = words.length > 0 ? words : FALLBACK_REWARD_WORDS;
  return Array.from({ length: Math.max(0, count) }, (_, index) => {
    const word = source[index % source.length];
    return {
      id: `reward-item-${word.id}-${index}`,
      wordId: word.id,
      token: `word:${word.id}`,
      word: word.word
    };
  });
}

export function buildRewardChoices(
  words: WordEntry[],
  target: WordEntry,
  count: number,
  seed: string
): RewardWordItem[] {
  if (count <= 0) return [];
  const otherWords = words.filter((word) => word.id !== target.id);
  const pool = buildRewardWordPool(otherWords, count - 1);
  const targetItem: RewardWordItem = {
    id: `reward-choice-${target.id}-${seed}`,
    wordId: target.id,
    token: `word:${target.id}`,
    word: target.word
  };
  return shuffleRewardItems([targetItem, ...pool], seed).slice(0, count);
}

export function buildRewardBoard({
  words,
  rows = DEFAULT_ROWS,
  columns = DEFAULT_COLUMNS,
  seed = "reward"
}: RewardBoardOptions): RewardBoard {
  if (words.length === 0) return [];

  let state = hashString(seed) || 1;
  const totalTiles = rows * columns;
  const pairTiles: RewardTile[] = [];
  for (let index = 0; index < totalTiles; index += 2) {
    state = nextRandom(state + index * 53);
    const word = words[state % words.length];
    pairTiles.push(makeTileForWord(word, index), makeTileForWord(word, index + 1));
  }
  for (let index = pairTiles.length - 1; index > 0; index -= 1) {
    state = nextRandom(state + index * 101);
    const swapIndex = state % (index + 1);
    [pairTiles[index], pairTiles[swapIndex]] = [pairTiles[swapIndex], pairTiles[index]];
  }

  const board: RewardBoard = [];
  let tileIndex = 0;
  for (let row = 0; row < rows; row += 1) {
    const line: RewardTile[] = [];
    for (let col = 0; col < columns; col += 1) {
      line.push(pairTiles[tileIndex]);
      tileIndex += 1;
    }
    board.push(line);
  }

  if (!hasRewardMove(board) && board[0]?.[0] && board[0]?.[1]) {
    board[0][1] = { ...board[0][0], id: `${board[0][0].id}-pair` };
  }

  return board;
}

export function findRewardGroup(board: RewardBoard, startRow: number, startCol: number): RewardCell[] {
  const start = board[startRow]?.[startCol];
  if (!start) return [];

  const group: RewardCell[] = [];
  const seen = new Set<string>();
  const queue: RewardCell[] = [{ row: startRow, col: startCol }];

  while (queue.length) {
    const current = queue.shift() as RewardCell;
    const key = `${current.row}:${current.col}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const tile = board[current.row]?.[current.col];
    if (!tile || tile.token !== start.token) continue;
    group.push(current);

    queue.push(
      { row: current.row - 1, col: current.col },
      { row: current.row + 1, col: current.col },
      { row: current.row, col: current.col - 1 },
      { row: current.row, col: current.col + 1 }
    );
  }

  return group;
}

export function hasRewardMove(board: RewardBoard): boolean {
  const seen = new Set<string>();
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board[row].length; col += 1) {
      const token = board[row][col]?.token;
      if (!token) continue;
      if (seen.has(token)) return true;
      seen.add(token);
    }
  }
  return false;
}

function clearRewardCells(
  board: RewardBoard,
  cells: RewardCell[]
): { board: RewardBoard; cleared: number; tiles: RewardTile[] } {
  const clearKeys = new Set(cells.map((cell) => `${cell.row}:${cell.col}`));
  const clearedTiles = cells.map((cell) => board[cell.row][cell.col]).filter((tile): tile is RewardTile => Boolean(tile));
  const nextBoard: RewardBoard = board.map((row, rowIndex) =>
    row.map((tile, colIndex) => (clearKeys.has(`${rowIndex}:${colIndex}`) ? null : tile))
  );

  return { board: nextBoard, cleared: clearedTiles.length, tiles: clearedTiles };
}

export function clearRewardPair(
  board: RewardBoard,
  first: RewardCell,
  second: RewardCell
): { board: RewardBoard; cleared: number; tiles: RewardTile[] } {
  const firstTile = board[first.row]?.[first.col];
  const secondTile = board[second.row]?.[second.col];
  if (!firstTile || !secondTile) return { board, cleared: 0, tiles: [] };
  if (first.row === second.row && first.col === second.col) return { board, cleared: 0, tiles: [] };
  if (firstTile.token !== secondTile.token) return { board, cleared: 0, tiles: [] };

  return clearRewardCells(board, [first, second]);
}

export function clearRewardGroup(
  board: RewardBoard,
  startRow: number,
  startCol: number
): { board: RewardBoard; cleared: number; tiles: RewardTile[] } {
  const group = findRewardGroup(board, startRow, startCol);
  if (group.length < 2) return { board, cleared: 0, tiles: [] };

  return clearRewardCells(board, group);
}
