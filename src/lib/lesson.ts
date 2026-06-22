import { imagePromptForWord, pickArtStyle, requestAgnesImage } from "./agnes";
import type { AgnesSettings, LessonPack, StoryScene, WordEntry } from "../types";

export const TEXT_FREE_ASSET_VERSION = 4;

const palette = ["#dbeafe", "#dcfce7", "#fef3c7", "#ffe4e6", "#ede9fe"];

function schoolSymbolSvg(label: string): string {
  if (label === "library") {
    return `
      <rect x="188" y="250" width="648" height="300" rx="28" fill="#f8fafc" stroke="#94a3b8" stroke-width="10"/>
      <rect x="245" y="310" width="94" height="190" rx="10" fill="#f97316"/>
      <rect x="365" y="285" width="84" height="215" rx="10" fill="#22c55e"/>
      <rect x="475" y="330" width="78" height="170" rx="10" fill="#3b82f6"/>
      <rect x="578" y="300" width="92" height="200" rx="10" fill="#eab308"/>
      <rect x="696" y="270" width="76" height="230" rx="10" fill="#a855f7"/>
      <rect x="225" y="510" width="574" height="22" rx="11" fill="#64748b"/>`;
  }
  if (label === "classroom") {
    return `
      <rect x="210" y="145" width="604" height="245" rx="24" fill="#2f855a" stroke="#8b5e34" stroke-width="18"/>
      <rect x="256" y="440" width="138" height="88" rx="10" fill="#f59e0b"/>
      <rect x="442" y="430" width="150" height="98" rx="10" fill="#f59e0b"/>
      <rect x="640" y="440" width="138" height="88" rx="10" fill="#f59e0b"/>
      <circle cx="325" cy="405" r="34" fill="#facc15"/>
      <circle cx="520" cy="392" r="34" fill="#93c5fd"/>
      <circle cx="710" cy="405" r="34" fill="#fda4af"/>
      <rect x="468" y="530" width="88" height="140" rx="12" fill="#94a3b8"/>`;
  }
  if (label === "homework") {
    return `
      <rect x="285" y="150" width="360" height="455" rx="28" fill="#ffffff" stroke="#94a3b8" stroke-width="10"/>
      <circle cx="375" cy="255" r="18" fill="#93c5fd"/>
      <circle cx="375" cy="350" r="18" fill="#93c5fd"/>
      <circle cx="375" cy="445" r="18" fill="#93c5fd"/>
      <rect x="600" y="345" width="70" height="260" rx="24" fill="#f97316" transform="rotate(38 635 475)"/>
      <polygon points="705,575 762,628 685,651" fill="#78350f"/>`;
  }
  if (label === "dictionary") {
    return `
      <path d="M218 230c96-38 194-28 294 30v330c-100-58-198-68-294-30z" fill="#ffffff" stroke="#3b82f6" stroke-width="12"/>
      <path d="M806 230c-96-38-194-28-294 30v330c100-58 198-68 294-30z" fill="#ffffff" stroke="#3b82f6" stroke-width="12"/>
      <path d="M512 260v330" stroke="#64748b" stroke-width="10"/>
      <circle cx="352" cy="372" r="42" fill="#fbbf24"/>
      <rect x="610" y="348" width="105" height="48" rx="24" fill="#86efac"/>
      <rect x="300" y="480" width="110" height="42" rx="21" fill="#fda4af"/>
      <circle cx="676" cy="484" r="34" fill="#c4b5fd"/>`;
  }
  if (label === "project") {
    return `
      <rect x="250" y="160" width="524" height="330" rx="28" fill="#f8fafc" stroke="#38bdf8" stroke-width="12"/>
      <circle cx="382" cy="292" r="58" fill="#a7f3d0"/>
      <path d="M552 360l74-130 74 130z" fill="#fca5a5"/>
      <rect x="315" y="535" width="395" height="64" rx="32" fill="#f59e0b"/>
      <rect x="392" y="490" width="42" height="92" rx="12" fill="#64748b"/>
      <rect x="590" y="490" width="42" height="92" rx="12" fill="#64748b"/>`;
  }
  return `
    <circle cx="512" cy="350" r="150" fill="#93c5fd"/>
    <path d="M392 420c76 66 164 66 240 0" fill="none" stroke="#0f2758" stroke-width="18" stroke-linecap="round"/>
    <circle cx="455" cy="315" r="20" fill="#0f2758"/>
    <circle cx="570" cy="315" r="20" fill="#0f2758"/>`;
}

function svgDataUrl(label: string, index: number): string {
  const bg = palette[index % palette.length];
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768" viewBox="0 0 1024 768">
    <rect width="1024" height="768" rx="56" fill="${bg}"/>
    <circle cx="830" cy="150" r="92" fill="#ffffff" opacity=".55"/>
    <circle cx="170" cy="620" r="130" fill="#ffffff" opacity=".45"/>
    ${schoolSymbolSvg(label)}
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export type LessonPackMeta = {
  setId: string;
  title: string;
};

export function buildSampleLessonPack(words: WordEntry[], meta: LessonPackMeta): LessonPack {
  const assets = words.map((word, index) => ({
    wordId: word.id,
    imageUrl: svgDataUrl(word.word, index),
    source: "sample" as const
  }));

  const storyScenes: StoryScene[] = [
    {
      id: "story-1",
      title: "A New Mission",
      text: `Momo walks into the ${words[0]?.word ?? "library"} and finds a glowing book.`,
      textZh: `Momo 走进${words[0]?.meaningZh ?? "图书馆"}，发现一本发光的书。`,
      imageUrl: svgDataUrl("story", 0)
    },
    {
      id: "story-2",
      title: "Word Clues",
      text: `The book gives a ${words[2]?.word ?? "homework"} clue and opens a secret map.`,
      textZh: `这本书给出一个${words[2]?.meaningZh ?? "家庭作业"}线索，并打开一张秘密地图。`,
      imageUrl: svgDataUrl("clue", 1)
    },
    {
      id: "story-3",
      title: "Star Words",
      text: `Every correct ${words[4]?.word ?? "project"} answer lights up a star.`,
      textZh: `每个正确的${words[4]?.meaningZh ?? "项目"}答案都会点亮一颗星星。`,
      imageUrl: svgDataUrl("stars", 2)
    }
  ];

  return {
    id: `${meta.setId}-${new Date().toISOString().slice(0, 10)}`,
    topic: meta.setId,
    title: meta.title,
    createdAt: Date.now(),
    assetPromptVersion: TEXT_FREE_ASSET_VERSION,
    source: "sample",
    words,
    assets,
    storyScenes
  };
}

export async function buildAgnesLessonPack(
  words: WordEntry[],
  settings: AgnesSettings,
  meta: LessonPackMeta
): Promise<LessonPack> {
  // One art style per practice group, derived from the word set so the group
  // stays visually consistent while different groups rotate styles.
  const style = pickArtStyle(words.map((word) => word.id).join("-"));
  const imageUrls = await Promise.all(
    words.map((word) => requestAgnesImage(settings, imagePromptForWord(word, style)))
  );
  const base = buildSampleLessonPack(words, meta);

  return {
    ...base,
    source: "agnes",
    assets: words.map((word, index) => ({
      wordId: word.id,
      imageUrl: imageUrls[index],
      source: "agnes"
    })),
    storyScenes: base.storyScenes.map((scene, index) => ({
      ...scene,
      imageUrl: imageUrls[index % imageUrls.length]
    }))
  };
}

export function getWordImage(pack: LessonPack, wordId: string): string {
  return pack.assets.find((asset) => asset.wordId === wordId)?.imageUrl ?? pack.assets[0]?.imageUrl ?? "";
}
