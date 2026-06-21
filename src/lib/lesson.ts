import { imagePromptForWord, requestAgnesImage } from "./agnes";
import type { AgnesSettings, LessonPack, StoryScene, WordEntry } from "../types";

const palette = ["#dbeafe", "#dcfce7", "#fef3c7", "#ffe4e6", "#ede9fe"];
const emojiByWord: Record<string, string> = {
  library: "📚",
  classroom: "🏫",
  homework: "📝",
  dictionary: "📖",
  project: "🔬"
};

function svgDataUrl(label: string, meaning: string, hint: string, index: number): string {
  const bg = palette[index % palette.length];
  const emoji = emojiByWord[label] ?? "⭐";
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768" viewBox="0 0 1024 768">
    <rect width="1024" height="768" rx="56" fill="${bg}"/>
    <circle cx="830" cy="150" r="92" fill="#ffffff" opacity=".55"/>
    <circle cx="170" cy="620" r="130" fill="#ffffff" opacity=".45"/>
    <text x="512" y="310" text-anchor="middle" font-size="170">${emoji}</text>
    <text x="512" y="455" text-anchor="middle" font-family="Arial, sans-serif" font-size="82" font-weight="800" fill="#0f2758">${label}</text>
    <text x="512" y="535" text-anchor="middle" font-family="Arial, sans-serif" font-size="52" fill="#334155">${meaning}</text>
    <text x="512" y="610" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" fill="#64748b">${hint}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function buildSampleLessonPack(words: WordEntry[]): LessonPack {
  const assets = words.map((word, index) => ({
    wordId: word.id,
    imageUrl: svgDataUrl(word.word, word.meaningZh, "School Planet", index),
    source: "sample" as const
  }));

  const storyScenes: StoryScene[] = [
    {
      id: "story-1",
      title: "A New Mission",
      text: `Momo walks into the ${words[0]?.word ?? "library"} and finds a glowing book.`,
      textZh: `Momo 走进${words[0]?.meaningZh ?? "图书馆"}，发现一本发光的书。`,
      imageUrl: svgDataUrl("story", "故事开始", "A glowing school adventure", 0)
    },
    {
      id: "story-2",
      title: "Word Clues",
      text: `The book gives a ${words[2]?.word ?? "homework"} clue and opens a secret map.`,
      textZh: `这本书给出一个${words[2]?.meaningZh ?? "家庭作业"}线索，并打开一张秘密地图。`,
      imageUrl: svgDataUrl("clue", "单词线索", "Find the word clues", 1)
    },
    {
      id: "story-3",
      title: "Star Words",
      text: `Every correct ${words[4]?.word ?? "project"} answer lights up a star.`,
      textZh: `每个正确的${words[4]?.meaningZh ?? "项目"}答案都会点亮一颗星星。`,
      imageUrl: svgDataUrl("stars", "星星奖励", "A bright mission reward", 2)
    }
  ];

  return {
    id: `school-${new Date().toISOString().slice(0, 10)}`,
    topic: "school",
    title: "School Planet",
    createdAt: Date.now(),
    source: "sample",
    words,
    assets,
    storyScenes
  };
}

export async function buildAgnesLessonPack(words: WordEntry[], settings: AgnesSettings): Promise<LessonPack> {
  const imageUrls = await Promise.all(words.map((word) => requestAgnesImage(settings, imagePromptForWord(word))));
  const base = buildSampleLessonPack(words);

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

