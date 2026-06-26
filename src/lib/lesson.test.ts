import { describe, expect, it } from "vitest";
import { getBookWords, selectMissionWords } from "../data/vocabulary";
import {
  buildAgnesLessonPack,
  buildPendingAgnesLessonPack,
  buildSampleLessonPack,
  mergeWordsWithExamples,
  TEXT_FREE_ASSET_VERSION
} from "./lesson";
import type { AgnesSettings, WordEntry } from "../types";

const META = { setId: "yilin-grade3", title: "译林版三年级上册" };

async function readSvg(blob: Blob): Promise<string> {
  return new TextDecoder().decode(await blob.arrayBuffer());
}

describe("lesson pack generation", () => {
  it("builds a playable sample pack with assets and story scenes", () => {
    const words = selectMissionWords("yilin-grade3", "3A", 5);
    const pack = buildSampleLessonPack(words, META);

    expect(pack.source).toBe("sample");
    expect(pack.topic).toBe("yilin-grade3");
    expect(pack.title).toBe("译林版三年级上册");
    expect(pack.words).toHaveLength(5);
    expect(pack.assets).toHaveLength(5);
    expect(pack.storyScenes.length).toBeGreaterThanOrEqual(3);
    expect(pack.storyScenes.every((scene) => scene.source === "sample")).toBe(true);
    expect(pack.assets.every((asset) => asset.imageBlob instanceof Blob)).toBe(true);
    expect(pack.assets.every((asset) => asset.imageBlob.type === "image/svg+xml")).toBe(true);
    // Object URLs are minted by withObjectUrls; the exact prefix depends on
    // the host (jsdom stub vs real browser), but they are non-empty strings.
    expect(pack.assets.every((asset) => asset.imageUrl.length > 0)).toBe(true);
  });

  it("keeps sample word images text-free for picture selection", async () => {
    const words = selectMissionWords("yilin-grade3", "3A", 5);
    const pack = buildSampleLessonPack(words, META);
    const firstWord = getBookWords("yilin-grade3", "3A")[0];
    const blob = pack.assets.find((asset) => asset.wordId === firstWord.id)?.imageBlob;
    expect(blob).toBeInstanceOf(Blob);
    const decoded = await readSvg(blob as Blob);

    expect(decoded).not.toContain(firstWord.word);
    expect(decoded).not.toContain(firstWord.meaningZh);
    expect(decoded).not.toContain("<text");
  });

  it("stamps the default style id on a sample pack and carries the asset prompt version", () => {
    const words = selectMissionWords("yilin-grade3", "3A", 5);
    const pack = buildSampleLessonPack(words, META);

    expect(pack.artStyleId).toBe("auto");
    expect(pack.assetPromptVersion).toBe(TEXT_FREE_ASSET_VERSION);
  });

  it("records the style id and free-text note passed to the sample builder", () => {
    const words = selectMissionWords("yilin-grade3", "3A", 5);
    const pack = buildSampleLessonPack(words, META, { id: "cartoon-pigs", note: "dancing pigs" });

    expect(pack.artStyleId).toBe("cartoon-pigs");
    expect(pack.artStyleNote).toBe("dancing pigs");
  });

  it("builds an immediately playable pending Agnes pack with placeholder pictures", () => {
    const words = selectMissionWords("yilin-grade3", "3A", 5);
    const pack = buildPendingAgnesLessonPack(words, META, { id: "sponge-comedy", note: "soft colors" });

    expect(pack.source).toBe("agnes");
    expect(pack.words).toEqual(words);
    expect(pack.assets).toHaveLength(words.length);
    expect(pack.assets.every((asset) => asset.source === "sample")).toBe(true);
    expect(pack.assets.every((asset) => asset.imageBlob.type === "image/svg+xml")).toBe(true);
    expect(pack.assets.every((asset) => asset.imageUrl.length > 0)).toBe(true);
    expect(pack.storyScenes).toEqual([]);
    expect(pack.artStyleId).toBe("sponge-comedy");
    expect(pack.artStyleNote).toBe("soft colors");
    expect(pack.unitStyleId).toBe("sponge-comedy");
    expect(pack.unitStyleNote).toBe("soft colors");
    expect(pack.assetPromptVersion).toBe(TEXT_FREE_ASSET_VERSION);
  });

  it("hydrates word entries with generated example sentences when the chat model returns them in order", () => {
    const words = selectMissionWords("yilin-grade3", "3A", 3);
    const examples = words.map((word, index) => ({
      word: word.word,
      example: `Example ${index} for ${word.word}.`,
      exampleZh: `示例 ${index}。`
    }));

    const merged = mergeWordsWithExamples(words, examples);

    expect(merged[0].example).toBe(`Example 0 for ${words[0].word}.`);
    expect(merged[0].exampleZh).toBe("示例 0。");
    expect(merged).toHaveLength(words.length);
  });

  it("falls back to name-based lookup when the chat model reorders or drops a row", () => {
    const words = selectMissionWords("yilin-grade3", "3A", 3);
    // Drop the first row entirely and reorder the rest. The merge must still
    // find the matching example by word name and leave the dropped word's
    // example empty rather than misaligning the array.
    const examples = [
      { word: words[2].word, example: "third row", exampleZh: "第三行" },
      { word: words[1].word, example: "second row", exampleZh: "第二行" }
    ];

    const merged = mergeWordsWithExamples(words, examples);

    expect(merged[0].example).toBe(""); // dropped
    expect(merged[1].example).toBe("second row");
    expect(merged[2].example).toBe("third row");
  });

  it("returns the original words unchanged when no examples were generated", () => {
    const words = selectMissionWords("yilin-grade3", "3A", 3);
    const merged = mergeWordsWithExamples(words, []);
    expect(merged).toEqual(words);
  });

  it("leaves Agnes-built story scenes empty so they can be generated lazily", async () => {
    const words = selectMissionWords("yilin-grade3", "3A", 3);
    const settings: AgnesSettings = {
      apiKey: "key",
      baseUrl: "https://example.com",
      imageModel: "img",
      videoModel: "vid",
      textModel: "txt"
    };
    const pack = await buildAgnesLessonPack(words, settings, META, { id: "auto", descriptor: "pixar" }, {
      imageBlobFetcher: async (_prompt, index) =>
        new Blob([`agnes-${index}`], { type: "image/png" }),
      exampleFetcher: async () => []
    });

    expect(pack.source).toBe("agnes");
    expect(pack.assets).toHaveLength(words.length);
    expect(pack.storyScenes).toEqual([]);
    expect(pack.unitStyleId).toBe("auto");
    expect(pack.assetPromptVersion).toBe(TEXT_FREE_ASSET_VERSION);
  });

  it("falls back to a sample blob for a single failed word image without killing the pack", async () => {
    const words = selectMissionWords("yilin-grade3", "3A", 3);
    const settings: AgnesSettings = {
      apiKey: "key",
      baseUrl: "https://example.com",
      imageModel: "img",
      videoModel: "vid",
      textModel: "txt"
    };
    const fetcher = async (_prompt: string, index: number, _word: WordEntry) => {
      if (index === 1) throw new Error("Agnes image request failed: 502");
      return new Blob([`agnes-${index}`], { type: "image/png" });
    };
    const pack = await buildAgnesLessonPack(
      words,
      settings,
      META,
      { id: "auto", descriptor: "pixar" },
      { imageBlobFetcher: fetcher, exampleFetcher: async () => [] }
    );
    expect(pack.assets).toHaveLength(3);
    expect(pack.assets[0].imageBlob.type).toBe("image/png");
    // The failed slot falls through to the sample SVG so the lesson is
    // still playable.
    expect(pack.assets[1].imageBlob.type).toBe("image/svg+xml");
    expect(pack.assets[2].imageBlob.type).toBe("image/png");
  });
});
