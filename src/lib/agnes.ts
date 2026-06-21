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

export function imagePromptForWord(word: WordEntry): string {
  return [
    `Child-safe English vocabulary illustration for the word "${word.word}".`,
    `Meaning for Chinese learners: ${word.meaningZh}.`,
    `Scene: ${word.imagePromptHint}.`,
    "Bright, friendly, non-scary, school-age children style.",
    "No text, no watermark, no private information."
  ].join(" ");
}

export function videoRewardPrompt(pack: LessonPack): string {
  const words = pack.words.map((word) => word.word).join(", ");
  return [
    `Create a short cheerful Word Planet reward video for a child who learned these English words: ${words}.`,
    "Theme: School Planet celebration, friendly space-learning adventure, bright classroom/library visuals.",
    "Safe for children age 9-10, no scary content, no text overlays, no personal information."
  ].join(" ");
}

export async function requestAgnesImage(settings: AgnesSettings, prompt: string): Promise<string> {
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
  if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`;
  if (first?.url) return first.url;
  throw new Error("Agnes image response did not include an image");
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

