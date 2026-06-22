import { describe, expect, it } from "vitest";
import { getBookWords, selectMissionWords } from "../data/vocabulary";
import { buildSampleLessonPack } from "./lesson";

const META = { setId: "yilin-grade3", title: "译林版三年级上册" };

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
    expect(pack.assets.every((asset) => asset.imageUrl.startsWith("data:image/svg+xml"))).toBe(true);
  });

  it("keeps sample word images text-free for picture selection", () => {
    const words = selectMissionWords("yilin-grade3", "3A", 5);
    const pack = buildSampleLessonPack(words, META);
    const firstWord = getBookWords("yilin-grade3", "3A")[0];
    const image = pack.assets.find((asset) => asset.wordId === firstWord.id)?.imageUrl ?? "";
    const decoded = decodeURIComponent(image);

    expect(decoded).not.toContain(firstWord.word);
    expect(decoded).not.toContain(firstWord.meaningZh);
    expect(decoded).not.toContain("<text");
  });
});
