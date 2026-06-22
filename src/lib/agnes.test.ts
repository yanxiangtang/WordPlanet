import { describe, expect, it } from "vitest";
import {
  base64ToBlob,
  buildAgnesConnectionTestRequest,
  buildImageGenerationRequest,
  buildVideoTaskRequest,
  extractVideoResultUrl,
  imagePromptForWord,
  normalizeAgnesBaseUrl
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
      videoModel: "agnes-video-v2.0"
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
});
