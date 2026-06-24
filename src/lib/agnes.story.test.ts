import { describe, expect, it } from "vitest";
import {
  buildStoryPrompt,
  buildStoryScenePrompt,
  parseStoryResponse,
  STORY_SCENE_COUNT,
  videoRewardPromptFromStory
} from "./agnes";
import { selectMissionWords } from "../data/vocabulary";

const SAMPLE_STORY = {
  text: "Momo opens the gate. She meets a friendly cat. They play under the sun.",
  textZh: "Momo 打开大门。她遇到一只友好的小猫。他们在阳光下玩耍。",
  sentences: [
    { en: "Momo opens the gate.", zh: "Momo 打开大门。", title: "The Gate" },
    { en: "She meets a friendly cat.", zh: "她遇到一只友好的小猫。", title: "New Friend" },
    { en: "They play under the sun.", zh: "他们在阳光下玩耍。", title: "Sunny Play" }
  ]
};

describe("Agnes story helpers", () => {
  it("asks the chat model to weave the words in order with a structured JSON envelope", () => {
    const prompt = buildStoryPrompt([
      { word: "gate", meaningZh: "大门" },
      { word: "cat", meaningZh: "小猫" },
      { word: "sun", meaningZh: "太阳" }
    ]);

    expect(prompt.system).toMatch(/8-10/);
    expect(prompt.system).toMatch(/Output JSON only/i);
    expect(prompt.user).toContain("1. gate — 大门");
    expect(prompt.user).toContain("2. cat — 小猫");
    expect(prompt.user).toContain("3. sun — 太阳");
    expect(prompt.user).toMatch(/"story":\s*\{/);
    expect(prompt.user).toMatch(/sentences/);
  });

  it("parses a wrapped story response and pads to STORY_SCENE_COUNT", () => {
    const parsed = parseStoryResponse(JSON.stringify({ story: SAMPLE_STORY }));
    expect(parsed).not.toBeNull();
    expect(parsed?.text).toBe(SAMPLE_STORY.text);
    expect(parsed?.sentences).toHaveLength(STORY_SCENE_COUNT);
    expect(parsed?.sentences[0]).toEqual({
      en: "Momo opens the gate.",
      zh: "Momo 打开大门。",
      title: "The Gate"
    });
  });

  it("accepts a bare story shape (no `story` wrapper)", () => {
    const parsed = parseStoryResponse(JSON.stringify(SAMPLE_STORY));
    expect(parsed).not.toBeNull();
    expect(parsed?.sentences[1].title).toBe("New Friend");
  });

  it("pads a short sentence list up to STORY_SCENE_COUNT by repeating the last entry", () => {
    const parsed = parseStoryResponse(
      JSON.stringify({
        text: "Hi.",
        textZh: "你好。",
        sentences: [{ en: "Hi.", zh: "你好。", title: "Hello" }]
      })
    );
    expect(parsed?.sentences).toHaveLength(STORY_SCENE_COUNT);
    expect(parsed?.sentences[STORY_SCENE_COUNT - 1].en).toBe("Hi.");
  });

  it("returns null when the JSON is malformed or empty", () => {
    expect(parseStoryResponse("oops not json")).toBeNull();
    expect(parseStoryResponse(JSON.stringify({ story: { text: "", textZh: "", sentences: [] } }))).toBeNull();
  });

  it("video prompt from story includes the story text and child-safe framing", () => {
    const prompt = videoRewardPromptFromStory({
      ...SAMPLE_STORY,
      generatedAt: 0,
      promptVersion: 1
    });
    expect(prompt).toContain(SAMPLE_STORY.text);
    expect(prompt).toMatch(/no text overlays/i);
    expect(prompt).toMatch(/illustrated/i);
  });

  it("story scene prompt keeps the text-free guardrails and splices the sentence", () => {
    const words = selectMissionWords("yilin-grade3", "3A", 5);
    const prompt = buildStoryScenePrompt(SAMPLE_STORY.sentences[0], "Pixar style", words);
    expect(prompt).toContain(SAMPLE_STORY.sentences[0].en);
    expect(prompt).toContain("Art style: Pixar style");
    expect(prompt).toMatch(/No readable text/i);
    expect(prompt).toMatch(/no letters/i);
    expect(prompt).toContain(words[0].word);
  });
});
