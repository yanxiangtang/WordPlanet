import type { AgnesSettings, LessonPack, VideoTaskState, WordEntry } from "../types";

export type ImageResponseFormat = "url" | "b64_json";

export type ImageGenerationParams = {
  model: string;
  prompt: string;
  size: string;
  responseFormat: ImageResponseFormat;
  image?: string[];
};

export type VideoTaskParams = {
  model: string;
  prompt: string;
  image?: string;
};

export function normalizeAgnesBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "").replace(/\/v1$/, "");
}

export function buildAgnesConnectionTestRequest(settings: AgnesSettings): { url: string; init: RequestInit } {
  return {
    url: `${normalizeAgnesBaseUrl(settings.baseUrl)}/v1/models`,
    init: {
      method: "GET",
      headers: {
        Authorization: `Bearer ${settings.apiKey}`
      }
    }
  };
}

export async function testAgnesConnection(settings: AgnesSettings): Promise<void> {
  const request = buildAgnesConnectionTestRequest(settings);
  const response = await fetch(request.url, request.init);
  if (!response.ok) throw new Error(`Agnes connection failed: ${response.status}`);
}

export function buildImageGenerationRequest(params: ImageGenerationParams) {
  return {
    model: params.model,
    prompt: params.prompt,
    size: params.size,
    extra_body: {
      ...(params.image ? { image: params.image } : {}),
      response_format: params.responseFormat
    }
  };
}

export function buildVideoTaskRequest(params: VideoTaskParams) {
  return {
    model: params.model,
    prompt: params.prompt,
    ...(params.image ? { image: params.image } : {}),
    num_frames: 81,
    frame_rate: 16
  };
}

export function extractVideoResultUrl(result: Record<string, unknown>): string | undefined {
  const status = typeof result.status === "string" ? result.status : "";
  if (status !== "completed") return undefined;
  const remixed = result.remixed_from_video_id;
  const url = result.video_url;
  return typeof remixed === "string" ? remixed : typeof url === "string" ? url : undefined;
}

// Child-friendly cartoon / animation art styles. No photorealistic or realistic
// looks — every style is illustrated, playful, and loved by kids. Each practice
// group can rotate to a different style for visual variety.
export const CHILD_ART_STYLES: string[] = [
  "Pixar-style 3D cartoon animation, soft rounded shapes, warm cheerful lighting, expressive characters",
  "Flat 2D vector cartoon illustration, bold clean outlines, bright primary colors, simple shapes",
  "Hand-drawn storybook watercolor illustration, soft pastel colors, cozy and whimsical",
  "Cute Japanese-style anime illustration, big sparkling eyes, playful colorful scenery",
  "Crayon and colored-pencil children's drawing style, doodle-like, playful hand-made textures",
  "Claymation plasticine cartoon style, soft sculpted 3D shapes, tactile and fun",
  "Kawaii chibi cartoon style, super cute simplified rounded characters, adorable and friendly",
  "Cel-shaded comic cartoon style, lively dynamic poses, bright saturated colors"
];

// Deterministically pick an art style from a seed string so the same practice
// group always gets the same style, while different groups vary.
export function pickArtStyle(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % CHILD_ART_STYLES.length;
  return CHILD_ART_STYLES[index];
}

export function imagePromptForWord(word: WordEntry, style: string = CHILD_ART_STYLES[0]): string {
  return [
    "Child-safe English vocabulary picture clue for a Chinese-speaking learner.",
    `Target concept: ${word.word}. Chinese meaning for context: ${word.meaningZh}. This concept is metadata for choosing the visual subject only, never visible writing.`,
    `Show only the visual scene or object: ${word.imagePromptHint}.`,
    `Art style: ${style}.`,
    "Bright, friendly, non-scary, made for school-age children who love cartoons.",
    "Not photorealistic, no realistic photo look, no live-action — always illustrated and cartoonish.",
    "Do not write the English word, Chinese meaning, spelling letters, or phonics in the image.",
    "No readable text anywhere: no letters, captions, labels, signs, handwriting, book text, screen text, board text, posters, watermark, or private information.",
    "If the scene includes a board, book, paper, screen, poster, or sign, keep it blank or use simple unreadable shapes only."
  ].join(" ");
}

export function videoRewardPrompt(pack: LessonPack, style: string = CHILD_ART_STYLES[0]): string {
  const words = pack.words.map((word) => word.word).join(", ");
  return [
    `Create a short cheerful Word Planet reward video for a child who learned these English words: ${words}.`,
    `Art style: ${style}.`,
    "Theme: School Planet celebration, friendly space-learning adventure, bright classroom/library visuals.",
    "Not photorealistic, no realistic photo look, no live-action — always illustrated, cartoonish, and loved by kids.",
    "Safe for children age 9-10, no scary content, no text overlays, no personal information."
  ].join(" ");
}

export async function requestAgnesImage(settings: AgnesSettings, prompt: string): Promise<Blob> {
  const response = await fetch(`${normalizeAgnesBaseUrl(settings.baseUrl)}/v1/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(
      buildImageGenerationRequest({
        model: settings.imageModel,
        prompt,
        size: "1024x768",
        responseFormat: "b64_json"
      })
    )
  });

  if (!response.ok) {
    throw new Error(`Agnes image request failed: ${response.status}`);
  }

  const payload = (await response.json()) as { data?: Array<{ b64_json?: string | null; url?: string | null }> };
  const first = payload.data?.[0];
  if (first?.b64_json) return base64ToBlob(first.b64_json, "image/png");
  if (first?.url) {
    const imageResponse = await fetch(first.url);
    if (!imageResponse.ok) throw new Error(`Agnes image download failed: ${imageResponse.status}`);
    return await imageResponse.blob();
  }
  throw new Error("Agnes image response did not include an image");
}

// Decode a base64 string to a typed Blob without going through a data URI.
// Storing the bytes directly avoids the ~33% inflation a base64 string carries
// and keeps large media off the JS string heap.
export function base64ToBlob(b64: string, mime: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// Download the completed Agnes video so we can cache the bytes instead of just
// the CDN URL (which rotates and would otherwise leave a broken <video src>).
export async function fetchAgnesVideoBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Agnes video download failed: ${response.status}`);
  return await response.blob();
}

// Read a Blob into a data URI for endpoints (like Agnes video creation) that
// accept an `image` string seed. Object URLs (`blob:…`) can't leave the tab,
// so a data URI is what we send across.
export function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read blob"));
    reader.readAsDataURL(blob);
  });
}

export async function createAgnesVideoTask(
  settings: AgnesSettings,
  prompt: string,
  image?: string
): Promise<VideoTaskState> {
  const response = await fetch(`${normalizeAgnesBaseUrl(settings.baseUrl)}/v1/videos`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildVideoTaskRequest({ model: settings.videoModel, prompt, image }))
  });

  if (!response.ok) throw new Error(`Agnes video request failed: ${response.status}`);
  const payload = (await response.json()) as { video_id?: string; task_id?: string; id?: string; status?: string; progress?: number };

  return {
    videoId: payload.video_id,
    taskId: payload.task_id ?? payload.id,
    status: payload.status === "completed" ? "completed" : payload.status === "failed" ? "failed" : "queued",
    progress: payload.progress ?? 0
  };
}

export async function pollAgnesVideo(settings: AgnesSettings, videoId: string): Promise<VideoTaskState> {
  const url = `${normalizeAgnesBaseUrl(settings.baseUrl)}/agnesapi?video_id=${encodeURIComponent(videoId)}&model_name=${encodeURIComponent(settings.videoModel)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${settings.apiKey}`
    }
  });
  if (!response.ok) throw new Error(`Agnes video poll failed: ${response.status}`);
  const payload = (await response.json()) as Record<string, unknown>;
  const videoUrl = extractVideoResultUrl(payload);
  const status = typeof payload.status === "string" ? payload.status : "running";

  return {
    videoId,
    status: videoUrl ? "completed" : status === "failed" ? "failed" : "running",
    progress: typeof payload.progress === "number" ? payload.progress : videoUrl ? 100 : 30,
    url: videoUrl,
    error: typeof payload.error === "string" ? payload.error : undefined
  };
}
