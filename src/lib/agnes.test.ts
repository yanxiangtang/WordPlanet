import { describe, expect, it } from "vitest";
import {
  buildImageGenerationRequest,
  buildVideoTaskRequest,
  extractVideoResultUrl,
  normalizeAgnesBaseUrl
} from "./agnes";

describe("Agnes API helpers", () => {
  it("normalizes the Agnes base URL without duplicating /v1", () => {
    expect(normalizeAgnesBaseUrl("https://apihub.agnes-ai.com/v1")).toBe("https://apihub.agnes-ai.com");
    expect(normalizeAgnesBaseUrl("https://apihub.agnes-ai.com/")).toBe("https://apihub.agnes-ai.com");
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
});

