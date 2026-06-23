import { imagePromptForWord, requestAgnesImage } from "./agnes";
import type { AgnesSettings, LessonPack, StoryScene, WordEntry } from "../types";

export const TEXT_FREE_ASSET_VERSION = 6;

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
          imageUrl: ""
        },
        {
          id: "story-2",
          title: "Word Clues",
          text: `A glowing clue whispers the word "${clueWord.word}" and lights up a path.`,
          textZh: `闪光的线索悄悄说出单词“${clueWord.meaningZh}”，并点亮一条小路。`,
          imageBlob: svgBlob(1),
          imageUrl: ""
        },
        {
          id: "story-3",
          title: "Star Words",
          text: `Every time Momo says "${starWord.word}" correctly, a new star appears.`,
          textZh: `每当 Momo 正确地说出“${starWord.meaningZh}”，就会出现一颗新星星。`,
          imageBlob: svgBlob(2),
          imageUrl: ""
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
    words,
    assets,
    storyScenes
  });
}

export async function buildAgnesLessonPack(
  words: WordEntry[],
  settings: AgnesSettings,
  meta: LessonPackMeta,
  style: { id: string; descriptor: string; note?: string }
): Promise<LessonPack> {
  // The resolved style descriptor is provided by the caller (see
  // src/lib/styles.ts resolveStyleDescriptor) so the kid's per-lesson style
  // choice — including free-text — drives the look of every picture.
  const imageBlobs = await Promise.all(
    words.map((word) => requestAgnesImage(settings, imagePromptForWord(word, style.descriptor)))
  );
  const base = buildSampleLessonPack(words, meta, { id: style.id, note: style.note });
  // Revoke the sample-pack's object URLs immediately since we are about to
  // replace every imageBlob and rebuild fresh URLs below.
  for (const url of collectObjectUrls(base)) URL.revokeObjectURL(url);

  return withObjectUrls({
    ...base,
    source: "agnes",
    assets: words.map((word, index) => ({
      wordId: word.id,
      imageBlob: imageBlobs[index],
      imageUrl: "",
      source: "agnes"
    })),
    // Story scenes reuse word images by reference. Structured clone preserves
    // identity within a single IndexedDB record so storing the same Blob in
    // multiple slots stays cheap.
    storyScenes: base.storyScenes.map((scene, index) => ({
      ...scene,
      imageBlob: imageBlobs[index % imageBlobs.length],
      imageUrl: ""
    }))
  });
}

export function getWordImage(pack: LessonPack, wordId: string): string {
  return pack.assets.find((asset) => asset.wordId === wordId)?.imageUrl ?? pack.assets[0]?.imageUrl ?? "";
}
