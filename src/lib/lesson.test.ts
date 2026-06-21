import { describe, expect, it } from "vitest";
import { selectDailyWords } from "../data/vocabulary";
import { buildSampleLessonPack } from "./lesson";

describe("lesson pack generation", () => {
  it("builds a playable sample School Planet pack with assets and story scenes", () => {
    const words = selectDailyWords("school", 5);
    const pack = buildSampleLessonPack(words);

    expect(pack.source).toBe("sample");
    expect(pack.words).toHaveLength(5);
    expect(pack.assets).toHaveLength(5);
    expect(pack.storyScenes.length).toBeGreaterThanOrEqual(3);
    expect(pack.assets.every((asset) => asset.imageUrl.startsWith("data:image/svg+xml"))).toBe(true);
  });
});

