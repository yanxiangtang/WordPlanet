import { describe, expect, it } from "vitest";
import {
  base64ToBlob,
  buildAgnesConnectionTestRequest,
  buildChatCompletionRequest,
  buildExamplePrompt,
  buildImageGenerationRequest,
  buildUnitCoverPrompt,
  buildVideoTaskRequest,
  extractVideoResultUrl,
  imagePromptForWord,
  normalizeAgnesBaseUrl,
  parseExampleResponse
} from "./agnes";
import { selectMissionWords } from "../data/vocabulary";

describe("Agnes API helpers", () => {
  it("normalizes the Agnes base URL without duplicating /v1", () => {
    expect(normalizeAgnesBaseUrl("https://apihub.agnes-ai.com/v1")).toBe("https://apihub.agnes-ai.com");
    expect(normalizeAgnesBaseUrl("https://apihub.agnes-ai.com/")).toBe("https://apihub.agnes-ai.com");
  });

  it("builds a connection test request against the normalized /v1/models endpoint", () => {
    const request = buildAgnesConnectionTestRequest({
      apiKey: "agnes-key",
      baseUrl: "https://apihub.agnes-ai.com/v1/",
      imageModel: "agnes-image-2.0-flash",
      videoModel: "agnes-video-v2.0",
      textModel: "gpt-4o-mini"
    });

    expect(request.url).toBe("https://apihub.agnes-ai.com/v1/models");
    expect(request.init.method).toBe("GET");
    expect(request.init.headers).toEqual({ Authorization: "Bearer agnes-key" });
  });

  it("builds image generation requests with response_format inside extra_body", () => {
    const body = buildImageGenerationRequest({
      model: "agnes-image-2.0-flash",
      prompt: "child-safe library image",
      size: "1024x768",
      responseFormat: "b64_json"
    });

    expect(body).toEqual({
      model: "agnes-image-2.0-flash",
      prompt: "child-safe library image",
      size: "1024x768",
      extra_body: {
        response_format: "b64_json"
      }
    });
  });

  it("builds short video reward requests and extracts the completed video URL", () => {
    const body = buildVideoTaskRequest({
      model: "agnes-video-v2.0",
      prompt: "a child-safe library reward scene",
      image: "data:image/png;base64,abc"
    });

    expect(body.num_frames).toBe(81);
    expect(body.frame_rate).toBe(16);
    expect(body.image).toBe("data:image/png;base64,abc");
    expect(extractVideoResultUrl({ status: "completed", remixed_from_video_id: "https://example.com/video.mp4" })).toBe(
      "https://example.com/video.mp4"
    );
  });

  it("asks Agnes for picture clues without readable letters or the target word", () => {
    const word = selectMissionWords("yilin-grade3", "3A", 5)[1];
    const prompt = imagePromptForWord(word);

    expect(prompt).not.toContain(`word "${word.word}"`);
    expect(prompt).toMatch(/Do not write the English word/i);
    expect(prompt).toMatch(/no readable text/i);
    expect(prompt).toMatch(/letters, captions, labels, signs/i);
  });

  it("splices a resolved style descriptor into the Art style slot", () => {
    const word = selectMissionWords("yilin-grade3", "3A", 5)[1];
    const descriptor = "Flat 2D cartoon in the style of a cheerful pig family";
    const prompt = imagePromptForWord(word, descriptor);

    expect(prompt).toContain(`Art style: ${descriptor}.`);
  });

  it("builds text-free unit cover prompts from unit title, words, and style", () => {
    const words = selectMissionWords("yilin-grade3", "3A", 5, 2);
    const descriptor = "Warm 3D cartoon classroom adventure";
    const prompt = buildUnitCoverPrompt(
      { unitNumber: 2, title: "I'm Liu Tao" },
      words,
      descriptor
    );

    expect(prompt).toContain("Unit 2");
    expect(prompt).toContain("I'm Liu Tao");
    expect(prompt).toContain(words[0].word);
    expect(prompt).toContain(words[1].word);
    expect(prompt).toContain(`Art style: ${descriptor}.`);
    expect(prompt).toMatch(/child-safe/i);
    expect(prompt).toMatch(/No readable text/i);
    expect(prompt).toMatch(/no letters/i);
    expect(prompt).toMatch(/no watermark/i);
  });

  it("decodes base64 strings into Blobs with the requested MIME type", async () => {
    // "WordPlanet" as raw bytes — round-trip via base64 to confirm we get the
    // same bytes back without the ~33% inflation a data URI string would carry.
    const original = new TextEncoder().encode("WordPlanet");
    const b64 = btoa(String.fromCharCode(...original));
    const blob = base64ToBlob(b64, "image/png");

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBe(original.byteLength);

    const buffer = await blob.arrayBuffer();
    // Compare as plain arrays — under jsdom's Blob polyfill the ArrayBuffer
    // can come from a different realm, which trips Vitest's strict-prototype
    // toEqual on typed arrays.
    expect(Array.from(new Uint8Array(buffer))).toEqual(Array.from(original));
  });

  it("asks the chat model for one example per word, anchored on the Chinese meaning", () => {
    const prompt = buildExamplePrompt([
      { word: "apple", meaningZh: "苹果" },
      { word: "run", meaningZh: "跑" }
    ]);

    expect(prompt.system).toMatch(/8-10 year old/i);
    expect(prompt.system).toMatch(/Output JSON only/i);
    expect(prompt.user).toContain("1. apple — 苹果");
    expect(prompt.user).toContain("2. run — 跑");
    expect(prompt.user).toMatch(/"examples":\s*\[/);
  });

  it("requests JSON object responses from the chat model", () => {
    const body = buildChatCompletionRequest({
      model: "gpt-4o-mini",
      system: "system msg",
      user: "user msg"
    });

    expect(body.model).toBe("gpt-4o-mini");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages).toEqual([
      { role: "system", content: "system msg" },
      { role: "user", content: "user msg" }
    ]);
  });

  it("parses chat-completion JSON with an examples array", () => {
    const parsed = parseExampleResponse(
      JSON.stringify({
        examples: [
          { word: "apple", example: "I eat an apple.", exampleZh: "我吃一个苹果。" },
          { word: "run", example: "We run in the park.", exampleZh: "我们在公园里跑。" }
        ]
      })
    );

    expect(parsed).toEqual([
      { word: "apple", example: "I eat an apple.", exampleZh: "我吃一个苹果。" },
      { word: "run", example: "We run in the park.", exampleZh: "我们在公园里跑。" }
    ]);
  });

  it("also accepts a bare top-level array and drops rows missing fields", () => {
    const parsed = parseExampleResponse(
      JSON.stringify([
        { word: "apple", example: "I eat an apple.", exampleZh: "我吃一个苹果。" },
        { word: "run", example: "We run." }, // missing exampleZh — drop
        { word: "", example: "x", exampleZh: "y" } // blank word — drop
      ])
    );

    expect(parsed).toHaveLength(1);
    expect(parsed[0].word).toBe("apple");
  });

  it("returns an empty list when the chat reply is not valid JSON", () => {
    expect(parseExampleResponse("oops not json")).toEqual([]);
  });
});
