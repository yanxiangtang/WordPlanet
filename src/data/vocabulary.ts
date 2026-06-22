import type { VocabularyBook, VocabularySet, WordEntry, WordLevel } from "../types";

type RawWord = {
  word: string;
  meaning: string;
  type: string;
  fullForm?: string;
};

type RawUnit = {
  unit: number;
  title: string;
  words: RawWord[];
};

type RawBook = {
  id: string;
  name: string;
  units: RawUnit[];
};

type RawSet = {
  id: string;
  name: string;
  description?: string;
  sourceNote?: string;
  books: RawBook[];
};

// Each vocabulary set is a JSON file under ./vocabulary. Dropping a new file in
// that folder auto-registers it — no index to maintain. Eager so the registry
// is available synchronously at module load (works under Vite and Vitest).
const setModules = import.meta.glob<{ default: RawSet }>("./vocabulary/*.json", { eager: true });

const REGISTRY: RawSet[] = Object.values(setModules)
  .map((module) => module.default)
  .sort((a, b) => a.name.localeCompare(b.name));

function slugify(word: string): string {
  return word
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function spellingDifficultyFor(word: string): WordEntry["spellingDifficulty"] {
  return word.length > 8 ? "tricky" : word.length > 6 ? "medium" : "easy";
}

// JSON words only carry word/meaning/type/fullForm. Derive the remaining
// WordEntry fields the lesson/agnes layers expect. Example sentences are left
// empty by design — the source word lists do not include them.
function deriveWordEntry(setId: string, bookId: string, raw: RawWord, idSuffix: string): WordEntry {
  return {
    id: `${setId}-${bookId}-${idSuffix}`,
    word: raw.word,
    meaningZh: raw.meaning,
    topic: setId,
    level: "A1 Movers" as WordLevel,
    example: "",
    exampleZh: "",
    imagePromptHint: `a child-friendly illustration of ${raw.word}`,
    spellingDifficulty: spellingDifficultyFor(raw.word),
    pronunciationNote: "Listen, then repeat clearly."
  };
}

function findSet(setId: string): RawSet | undefined {
  return REGISTRY.find((set) => set.id === setId);
}

function findBook(set: RawSet, bookId: string): RawBook | undefined {
  return set.books.find((book) => book.id === bookId);
}

export function listVocabularySets(): VocabularySet[] {
  return REGISTRY.map((set) => ({
    id: set.id,
    name: set.name,
    description: set.description,
    books: set.books.map((book): VocabularyBook => ({
      id: book.id,
      name: book.name,
      wordCount: book.units.reduce((total, unit) => total + unit.words.length, 0)
    }))
  }));
}

export function getVocabularySet(setId: string): VocabularySet | undefined {
  return listVocabularySets().find((set) => set.id === setId);
}

export function listBooks(setId: string): VocabularyBook[] {
  return getVocabularySet(setId)?.books ?? [];
}

export function getBookWords(setId: string, bookId: string): WordEntry[] {
  const set = findSet(setId);
  if (!set) return [];
  const book = findBook(set, bookId);
  if (!book) return [];

  const rawWords = book.units.flatMap((unit) => unit.words);
  const usedIds = new Set<string>();

  return rawWords.map((raw) => {
    // Guard against slug collisions (e.g. "Hi." vs "Hi") so each word keeps a
    // unique id for asset keying and mastery tracking.
    let suffix = slugify(raw.word) || "word";
    let candidate = suffix;
    let index = 2;
    while (usedIds.has(candidate)) {
      candidate = `${suffix}-${index}`;
      index += 1;
    }
    usedIds.add(candidate);
    return deriveWordEntry(setId, bookId, raw, candidate);
  });
}

export function selectMissionWords(setId: string, bookId: string, count: number): WordEntry[] {
  return getBookWords(setId, bookId).slice(0, count);
}
