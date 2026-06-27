import { imagePromptForWord, requestAgnesExamples, requestAgnesImage, type WordExample } from "./agnes";
import type { AgnesSettings, LessonPack, StoryScene, WordEntry } from "../types";

export const TEXT_FREE_ASSET_VERSION = 8;

const palette = ["#dbeafe", "#dcfce7", "#fef3c7", "#ffe4e6", "#ede9fe"];

// Placeholder shape used by the sample lesson pack so the picture-pick activity
// still has something to render before Agnes generates real art. Kept text-free
// (see TEXT_FREE_ASSET_VERSION + lesson.test.ts) so it never gives away the
// answer. The variant index just rotates color so adjacent cards differ.
function placeholderSymbolSvg(variant: number): string {
  const accent = ["#0f2758", "#1d4ed8", "#0f766e", "#b45309", "#7c3aed"][variant % 5];
  return `
    <circle cx="512" cy="350" r="150" fill="#93c5fd"/>
    <path d="M392 420c76 66 164 66 240 0" fill="none" stroke="${accent}" stroke-width="18" stroke-linecap="round"/>
    <circle cx="455" cy="315" r="20" fill="${accent}"/>
    <circle cx="570" cy="315" r="20" fill="${accent}"/>`;
}

function svgMarkup(index: number): string {
  const bg = palette[index % palette.length];
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768" viewBox="0 0 1024 768">
    <rect width="1024" height="768" rx="56" fill="${bg}"/>
    <circle cx="830" cy="150" r="92" fill="#ffffff" opacity=".55"/>
    <circle cx="170" cy="620" r="130" fill="#ffffff" opacity=".45"/>
    ${placeholderSymbolSvg(index)}
  </svg>`;
}

function svgBlob(index: number): Blob {
  return new Blob([svgMarkup(index)], { type: "image/svg+xml" });
}

export type LessonPackMeta = {
  setId: string;
  title: string;
};

// Rebuild transient object URLs from each asset's Blob. Call after building or
// loading a pack so <img>/<video> elements get a `blob:…` src they can render.
// Caller is responsible for revoking these URLs via `collectObjectUrls` when
// the pack is replaced or unmounted (see App.tsx replacePackUrls).
export function withObjectUrls(pack: LessonPack): LessonPack {
  return {
    ...pack,
    assets: pack.assets.map((asset) => ({
      ...asset,
      imageUrl: URL.createObjectURL(asset.imageBlob)
    })),
    storyScenes: pack.storyScenes.map((scene) => ({
      ...scene,
      imageUrl: URL.createObjectURL(scene.imageBlob)
    }))
  };
}

export function collectObjectUrls(pack: LessonPack): string[] {
  return [
    ...pack.assets.map((asset) => asset.imageUrl),
    ...pack.storyScenes.map((scene) => scene.imageUrl)
  ].filter((url): url is string => Boolean(url));
}

export function buildSampleLessonPack(
  words: WordEntry[],
  meta: LessonPackMeta,
  style: { id: string; note?: string } = { id: "auto" }
): LessonPack {
  const assets = words.map((word, index) => ({
    wordId: word.id,
    imageBlob: svgBlob(index),
    imageUrl: "",
    source: "sample" as const
  }));

  // Story scenes weave real mission words into the narrative so the sample pack
  // previews what an Agnes-generated lesson will feel like. Modulo indexing
  // keeps things safe even if a caller passes fewer than 5 words. With zero
  // words there is nothing to narrate, so the scenes are simply omitted — the
  // dashboard handles a story-less pack gracefully.
  const firstWord = words.length ? words[0 % words.length] : null;
  const clueWord = words.length ? words[2 % words.length] : null;
  const starWord = words.length ? words[4 % words.length] : null;
  const storyScenes: StoryScene[] = firstWord && clueWord && starWord
    ? [
        {
          id: "story-1",
          title: "A New Mission",
          text: `Momo opens the Word Planet map and meets the word "${firstWord.word}".`,
          textZh: `Momo 打开单词星球地图，遇到了单词“${firstWord.meaningZh}”。`,
          imageBlob: svgBlob(0),
          imageUrl: "",
          source: "sample"
        },
        {
          id: "story-2",
          title: "Word Clues",
          text: `A glowing clue whispers the word "${clueWord.word}" and lights up a path.`,
          textZh: `闪光的线索悄悄说出单词“${clueWord.meaningZh}”，并点亮一条小路。`,
          imageBlob: svgBlob(1),
          imageUrl: "",
          source: "sample"
        },
        {
          id: "story-3",
          title: "Star Words",
          text: `Every time Momo says "${starWord.word}" correctly, a new star appears.`,
          textZh: `每当 Momo 正确地说出“${starWord.meaningZh}”，就会出现一颗新星星。`,
          imageBlob: svgBlob(2),
          imageUrl: "",
          source: "sample"
        }
      ]
    : [];

  return withObjectUrls({
    id: `${meta.setId}-${new Date().toISOString().slice(0, 10)}`,
    topic: meta.setId,
    title: meta.title,
    createdAt: Date.now(),
    assetPromptVersion: TEXT_FREE_ASSET_VERSION,
    source: "sample",
    artStyleId: style.id,
    artStyleNote: style.note,
    unitStyleId: style.id,
    unitStyleNote: style.note,
    words,
    assets,
    storyScenes
  });
}

export function buildPendingAgnesLessonPack(
  words: WordEntry[],
  meta: LessonPackMeta,
  style: { id: string; note?: string }
): LessonPack {
  const base = buildSampleLessonPack(words, meta, style);
  for (const scene of base.storyScenes) {
    if (scene.imageUrl) URL.revokeObjectURL(scene.imageUrl);
  }
  return {
    ...base,
    source: "agnes",
    unitStyleId: style.id,
    unitStyleNote: style.note,
    storyScenes: []
  };
}

// Dependencies the Agnes lesson-pack builder needs from its caller. The
// `imageBlobFetcher` indirection lets the App route every per-word image
// request through the media scheduler (concurrency cap + retry) while
// keeping the builder pure and unit-testable.
export type AgnesLessonPackDeps = {
  // Generate one PNG/JPEG/SVG Blob from a single prompt.
  imageBlobFetcher: (prompt: string, index: number, word: WordEntry) => Promise<Blob>;
  // Generate example sentences for the mission words. Failures may resolve
  // to an empty array to keep the lesson playable.
  exampleFetcher?: (words: Pick<WordEntry, "word" | "meaningZh">[]) => Promise<WordExample[]>;
  // Fallback Blob when a word's image generation fails after the scheduler
  // exhausted its retries. Defaults to the sample SVG so the lesson still
  // has a picture in that slot.
  fallbackBlobFor?: (word: WordEntry, index: number) => Blob;
};

export async function buildAgnesLessonPack(
  words: WordEntry[],
  settings: AgnesSettings,
  meta: LessonPackMeta,
  style: { id: string; descriptor: string; note?: string },
  deps: AgnesLessonPackDeps = {
    imageBlobFetcher: (prompt) => requestAgnesImage(settings, prompt)
  }
): Promise<LessonPack> {
  // Word images run through the injected fetcher (the App threads each call
  // through the media scheduler so we get concurrency caps + retry on 5xx /
  // 429). A single image failure no longer kills the whole pack: the
  // scheduler retries, and if it exhausts its budget we drop in the sample
  // SVG for that one word and keep going.
  //
  // Example sentences are generated alongside images so the chat-completion
  // failure mode is local: an empty `examples` list leaves the example
  // fields blank rather than rebuilding everything.
  const fallbackBlobFor = deps.fallbackBlobFor ?? ((_word, index) => svgBlob(index));
  const fetchExamples =
    deps.exampleFetcher ?? ((items) => requestAgnesExamples(settings, items));

  const [imageBlobs, examples] = await Promise.all([
    Promise.all(
      words.map(async (word, index) => {
        try {
          return await deps.imageBlobFetcher(imagePromptForWord(word, style.descriptor), index, word);
        } catch {
          return fallbackBlobFor(word, index);
        }
      })
    ),
    fetchExamples(words.map((word) => ({ word: word.word, meaningZh: word.meaningZh }))).catch(
      (): WordExample[] => []
    )
  ]);

  const wordsWithExamples = mergeWordsWithExamples(words, examples);

  const base = buildSampleLessonPack(wordsWithExamples, meta, { id: style.id, note: style.note });
  // Revoke the sample-pack's object URLs immediately since we are about to
  // replace every imageBlob and rebuild fresh URLs below.
  for (const url of collectObjectUrls(base)) URL.revokeObjectURL(url);

  return withObjectUrls({
    ...base,
    source: "agnes",
    unitStyleId: style.id,
    unitStyleNote: style.note,
    assets: wordsWithExamples.map((word, index) => ({
      wordId: word.id,
      imageBlob: imageBlobs[index],
      imageUrl: "",
      source: "agnes"
    })),
    // Story scenes start empty for Agnes packs — they are filled lazily on
    // first Story-screen entry (see ensureStoryScenes in App.tsx) so each
    // scene gets a distinct illustration tied to the LLM-written story
    // rather than recycling a word picture by reference.
    storyScenes: []
  });
}

// Match the chat-completion rows back onto the original mission words.
// Models occasionally drop a row, reorder them, or pluralize/lowercase the
// echoed `word`, so we match on the original list order first and only fall
// back to a normalized name lookup. Words with no example come back unchanged
// (empty example fields) and render as a hidden sentence box in the UI.
export function mergeWordsWithExamples(words: WordEntry[], examples: WordExample[]): WordEntry[] {
  if (!examples.length) return words;

  const byName = new Map<string, WordExample>();
  for (const example of examples) {
    byName.set(example.word.trim().toLowerCase(), example);
  }

  return words.map((word, index) => {
    const match = examples[index]?.word.trim().toLowerCase() === word.word.trim().toLowerCase()
      ? examples[index]
      : byName.get(word.word.trim().toLowerCase());
    if (!match) return word;
    return { ...word, example: match.example, exampleZh: match.exampleZh };
  });
}

export function getWordImage(pack: LessonPack, wordId: string): string {
  return pack.assets.find((asset) => asset.wordId === wordId)?.imageUrl ?? pack.assets[0]?.imageUrl ?? "";
}

// Insert or replace a single story scene by id, leaving the other scenes
// untouched. Used by the lazy story-scene generator in App.tsx so each new
// Agnes-generated scene streams into the pack as soon as its image Blob
// arrives. Returns a new pack so React can compare references.
export function upsertStoryScene(pack: LessonPack, scene: StoryScene): LessonPack {
  const next = pack.storyScenes.slice();
  const existing = next.findIndex((entry) => entry.id === scene.id);
  if (existing === -1) next.push(scene);
  else next[existing] = scene;
  return { ...pack, storyScenes: next };
}
