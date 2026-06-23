import { describe, expect, it } from "vitest";
import { getBookWords, selectMissionWords } from "../data/vocabulary";
import { buildSampleLessonPack, TEXT_FREE_ASSET_VERSION } from "./lesson";

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
});
