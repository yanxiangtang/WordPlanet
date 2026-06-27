import type { AgnesSettings, LessonPack, StoryText, VideoTaskState, VocabularyUnit, WordEntry } from "../types";

export type ImageResponseFormat = "url" | "b64_json";

// Optional per-call signal so the media scheduler can cancel an in-flight
// Agnes request — `fetch` ties the signal to the underlying socket. Every
// network helper accepts it; passing `undefined` keeps the legacy behavior.
export type AgnesCallOptions = { signal?: AbortSignal };

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
  // Agnes Video V2.0 accepts only publicly accessible image URLs here.
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

// Tagged HTTP error so the media scheduler's default retry policy can
// inspect `.status` instead of reaching into the message string. Network
// errors thrown by `fetch` (TypeError) keep their original shape — the
// scheduler retries those by class.
export class HttpAgnesError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpAgnesError";
    this.status = status;
  }
}

export async function testAgnesConnection(settings: AgnesSettings): Promise<void> {
  const request = buildAgnesConnectionTestRequest(settings);
  const response = await fetch(request.url, request.init);
  if (!response.ok) throw new HttpAgnesError(`Agnes connection failed: ${response.status}`, response.status);
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
  const image = params.image && /^https?:\/\//i.test(params.image) ? params.image : undefined;
  return {
    model: params.model,
    prompt: params.prompt,
    ...(image ? { image } : {}),
    num_frames: 121,
    frame_rate: 24
  };
}

export function extractVideoResultUrl(result: Record<string, unknown>): string | undefined {
  const status = typeof result.status === "string" ? result.status : "";
  if (status !== "completed") return undefined;
  const remixed = result.remixed_from_video_id;
  const url = result.video_url;
  return typeof remixed === "string" ? remixed : typeof url === "string" ? url : undefined;
}

export function extractAgnesErrorMessage(error: unknown): string | undefined {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return undefined;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : undefined;
}

// Child-friendly cartoon / animation art styles inspired by famous kids'
// cartoons. Descriptors avoid direct trademarked names so the image prompt
// asks for a visual language, not a protected character or brand.
export const CHILD_ART_STYLES: string[] = [
  "Bright underwater sponge-comedy cartoon look, simple rounded sea-life shapes, clean bold outlines, tropical candy colors, goofy expressive faces",
  "Classic mouse-clubhouse preschool cartoon look, polished 3D rounded characters, cheerful primary colors, friendly stage-like sets",
  "Monster-catching anime adventure look, energetic poses, sparkling effects, cute collectible creature silhouettes, crisp colorful backgrounds",
  "Toy-box 3D adventure animation look, warm cinematic lighting, plastic toy textures, expressive rounded characters, playful room-scale scenes",
  "Musical fairy-tale princess animation look, elegant storybook shapes, glowing palace colors, soft magical lighting, expressive theatrical poses",
  "Gentle blue-dog family cartoon look, flat 2D shapes, warm suburban home colors, soft outlines, playful everyday comedy",
  "Educational magic field-trip cartoon look, bright science-classroom colors, friendly bus adventure energy, clear illustrated shapes",
  "Rounded robot-cat manga cartoon look, clean simple lines, bright gadgets, cheerful futuristic props, cute expressive faces",
  "Action turtle-team Saturday-morning cartoon look, bold comic outlines, neon city colors, dynamic martial-arts poses, playful heroic energy",
  "Superhero-team animated comic look, capes and masks, bright city skyline colors, clean cel shading, brave kid-friendly action",
  "Snow-queen musical animation look, icy crystal colors, soft 3D fairy-tale lighting, graceful expressive characters, magical winter sparkle",
  "High-energy martial-arts anime look, spiky motion shapes, glowing power effects, dramatic clouds, bold saturated action colors",
  "Blocky brick-builder cartoon look, toy construction shapes, bright modular worlds, cheerful adventure colors, clean plastic textures"
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

export const UNIT_COVER_PROMPT_VERSION = 1;

export function buildUnitCoverPrompt(
  unit: Pick<VocabularyUnit, "unitNumber" | "title">,
  words: Pick<WordEntry, "word" | "meaningZh" | "imagePromptHint">[],
  style: string = CHILD_ART_STYLES[0]
): string {
  const wordConcepts = words
    .slice(0, 8)
    .map((word) => `${word.word} (${word.meaningZh}; visual clue: ${word.imagePromptHint})`)
    .join(", ");

  return [
    "Child-safe illustrated cover art for an English vocabulary lesson picker card.",
    `Lesson: Unit ${unit.unitNumber}: ${unit.title}.`,
    `Vocabulary concepts to inspire the scene: ${wordConcepts}.`,
    `Art style: ${style}.`,
    "Create one cohesive cheerful cartoon scene that suggests the lesson theme without spelling any vocabulary word.",
    "Bright, warm, friendly, school-age child audience, playful educational app cover, simple readable composition.",
    "No readable text anywhere: no English words, no Chinese characters, no letters, no captions, no labels, no signs, no handwriting, no book text, no screen text, no watermark.",
    "If the scene includes a book, paper, board, sign, poster, or screen, keep it blank or use unreadable decorative shapes only.",
    "Not photorealistic, no live-action, no scary content, no private information."
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

export async function requestAgnesImage(
  settings: AgnesSettings,
  prompt: string,
  options: AgnesCallOptions = {}
): Promise<Blob> {
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
    ),
    signal: options.signal
  });

  if (!response.ok) {
    throw new HttpAgnesError(`Agnes image request failed: ${response.status}`, response.status);
  }

  const payload = (await response.json()) as { data?: Array<{ b64_json?: string | null; url?: string | null }> };
  const first = payload.data?.[0];
  if (first?.b64_json) return base64ToBlob(first.b64_json, "image/png");
  if (first?.url) {
    const imageResponse = await fetch(first.url, { signal: options.signal });
    if (!imageResponse.ok) throw new HttpAgnesError(`Agnes image download failed: ${imageResponse.status}`, imageResponse.status);
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
export async function fetchAgnesVideoBlob(url: string, options: AgnesCallOptions = {}): Promise<Blob> {
  const response = await fetch(url, { signal: options.signal });
  if (!response.ok) throw new HttpAgnesError(`Agnes video download failed: ${response.status}`, response.status);
  return await response.blob();
}

// === Chat completions ====================================================
//
// Example sentences for the kid's word card are generated up front when a
// lesson pack is built — one call returns one English example + Chinese gloss
// per word in the mission. The pack is then persisted to IndexedDB, so the
// sentences are written once per mission and reused on every reopen (the
// example travels inside `WordEntry.example` / `WordEntry.exampleZh`).
//
// We rely on Agnes' OpenAI-compatible `/v1/chat/completions` endpoint and ask
// for `response_format: json_object` so the model returns structured rows
// instead of free-form prose. The prompt explicitly grounds the sentence in
// the word's Chinese meaning so a polysemous English word doesn't drift onto
// the wrong sense.

export type WordExample = {
  word: string;
  example: string;
  exampleZh: string;
};

export type ExampleSentencePrompt = Pick<WordEntry, "word" | "meaningZh">;

export function buildExamplePrompt(words: ExampleSentencePrompt[]): { system: string; user: string } {
  const wordList = words
    .map((word, index) => `${index + 1}. ${word.word} — ${word.meaningZh}`)
    .join("\n");

  return {
    system:
      "You write short example sentences for 8-10 year old Chinese kids studying English. " +
      "Use only A1/A2 vocabulary, present tense when possible, 5-9 words per English sentence, " +
      "and never quote the Chinese gloss as a translation phrase. Output JSON only.",
    user:
      `For each English word below, write ONE short example sentence in English that uses the word ` +
      `in the meaning shown by its Chinese gloss, and ONE natural Chinese translation of that ` +
      `sentence (not a dictionary definition).\n\nWords:\n${wordList}\n\n` +
      `Return JSON of the form {"examples":[{"word":"…","example":"…","exampleZh":"…"}]}, in the ` +
      `same order, with one entry per word.`
  };
}

export function buildChatCompletionRequest(params: { model: string; system: string; user: string }) {
  return {
    model: params.model,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user }
    ],
    response_format: { type: "json_object" },
    temperature: 0.4
  };
}

// Walk the model's JSON payload looking for a list of {word, example, exampleZh}
// rows. We accept either a top-level `examples` array (the format the prompt
// asks for) or a bare array, since chat models occasionally drop the wrapper.
export function parseExampleResponse(content: string): WordExample[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }

  const candidates: unknown =
    Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { examples?: unknown }).examples)
        ? (parsed as { examples: unknown[] }).examples
        : [];

  if (!Array.isArray(candidates)) return [];

  return candidates
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .map((row) => ({
      word: typeof row.word === "string" ? row.word : "",
      example: typeof row.example === "string" ? row.example.trim() : "",
      exampleZh: typeof row.exampleZh === "string" ? row.exampleZh.trim() : ""
    }))
    .filter((entry) => entry.word && entry.example && entry.exampleZh);
}

export async function requestAgnesExamples(
  settings: AgnesSettings,
  words: ExampleSentencePrompt[],
  options: AgnesCallOptions = {}
): Promise<WordExample[]> {
  if (!words.length) return [];

  const { system, user } = buildExamplePrompt(words);
  const response = await fetch(`${normalizeAgnesBaseUrl(settings.baseUrl)}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildChatCompletionRequest({ model: settings.textModel, system, user })),
    signal: options.signal
  });

  if (!response.ok) throw new HttpAgnesError(`Agnes chat request failed: ${response.status}`, response.status);

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content ?? "";
  return parseExampleResponse(content);
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
  image?: string,
  options: AgnesCallOptions = {}
): Promise<VideoTaskState> {
  const response = await fetch(`${normalizeAgnesBaseUrl(settings.baseUrl)}/v1/videos`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildVideoTaskRequest({ model: settings.videoModel, prompt, image })),
    signal: options.signal
  });

  if (!response.ok) throw new HttpAgnesError(`Agnes video request failed: ${response.status}`, response.status);
  const payload = (await response.json()) as { video_id?: string; task_id?: string; id?: string; status?: string; progress?: number };

  return {
    videoId: payload.video_id,
    taskId: payload.task_id ?? payload.id,
    status: payload.status === "completed" ? "completed" : payload.status === "failed" ? "failed" : "queued",
    progress: payload.progress ?? 0
  };
}

export async function pollAgnesVideo(
  settings: AgnesSettings,
  videoId: string,
  options: AgnesCallOptions = {}
): Promise<VideoTaskState> {
  const url = `${normalizeAgnesBaseUrl(settings.baseUrl)}/agnesapi?video_id=${encodeURIComponent(videoId)}&model_name=${encodeURIComponent(settings.videoModel)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${settings.apiKey}`
    },
    signal: options.signal
  });
  if (!response.ok) throw new HttpAgnesError(`Agnes video poll failed: ${response.status}`, response.status);
  const payload = (await response.json()) as Record<string, unknown>;
  const videoUrl = extractVideoResultUrl(payload);
  const status = typeof payload.status === "string" ? payload.status : "running";

  return {
    videoId,
    status: videoUrl ? "completed" : status === "failed" ? "failed" : "running",
    progress: typeof payload.progress === "number" ? payload.progress : videoUrl ? 100 : 30,
    url: videoUrl,
    error: extractAgnesErrorMessage(payload.error)
  };
}

// === Story text ==========================================================
//
// One short, kid-friendly narrative per mission, written by the text LLM
// when the lesson starts or when an older pack first opens Story. The story drives:
//   * the reward video prompt (so the video reflects what the kid just
//     finished learning rather than just listing the words), and
//   * the Story-screen scene images (so each illustrated scene depicts a
//     specific sentence rather than recycling a word picture).
//
// The story is cached on the `LessonPack` and persisted alongside it, so
// subsequent visits never re-spend the credit.

export const STORY_TEXT_PROMPT_VERSION = 1;

// Number of scenes the Story screen renders. The model is asked to write
// exactly this many sentences; if it returns fewer we pad with the last
// sentence, and if it returns more we slice — see ensureStorySentences.
export const STORY_SCENE_COUNT = 3;

export function buildStoryPrompt(words: Pick<WordEntry, "word" | "meaningZh">[]): { system: string; user: string } {
  const wordList = words.map((word, index) => `${index + 1}. ${word.word} — ${word.meaningZh}`).join("\n");
  return {
    system:
      "You write tiny, cheerful illustrated stories for Chinese-speaking kids aged 8-10 who are learning English. " +
      "Each story is 3 sentences long, uses A1/A2 vocabulary, and weaves the supplied English words in order. " +
      "Sentences are 6-12 English words each, present tense when possible, friendly and never scary. " +
      "Provide a natural Chinese translation for every sentence. Output JSON only.",
    user:
      `Write a 3-sentence kid story that uses these English vocabulary words in order:\n\n${wordList}\n\n` +
      `Return JSON of the form {"story":{"text":"…","textZh":"…","sentences":[{"en":"…","zh":"…","title":"…"}]}}. ` +
      `"text" is the full English story (3 sentences joined with spaces). "textZh" is the full Chinese ` +
      `translation. "sentences" has exactly 3 entries, in order; "title" is a short 2-4 word English heading ` +
      `for that scene.`
  };
}

// Walk the chat-completion JSON looking for the story shape. We accept the
// wrapped form the prompt requests and a bare {text,textZh,sentences} shape
// in case the model drops the wrapper.
export function parseStoryResponse(content: string): StoryText | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }

  const story =
    parsed && typeof parsed === "object" && "story" in parsed && parsed.story && typeof parsed.story === "object"
      ? (parsed as { story: Record<string, unknown> }).story
      : parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : null;
  if (!story) return null;

  const text = typeof story.text === "string" ? story.text.trim() : "";
  const textZh = typeof story.textZh === "string" ? story.textZh.trim() : "";
  const rawSentences = Array.isArray(story.sentences) ? story.sentences : [];
  const sentences = rawSentences
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .map((row) => ({
      en: typeof row.en === "string" ? row.en.trim() : "",
      zh: typeof row.zh === "string" ? row.zh.trim() : "",
      title: typeof row.title === "string" ? row.title.trim() : ""
    }))
    .filter((entry) => entry.en && entry.zh);

  if (!text || !textZh || sentences.length === 0) return null;

  // Pad / slice to STORY_SCENE_COUNT so callers get a stable shape.
  const fitted = sentences.slice(0, STORY_SCENE_COUNT);
  while (fitted.length < STORY_SCENE_COUNT) {
    const last = fitted[fitted.length - 1];
    fitted.push({ ...last, title: last.title || `Scene ${fitted.length + 1}` });
  }

  return {
    text,
    textZh,
    sentences: fitted.map((entry, index) => ({
      ...entry,
      title: entry.title || `Scene ${index + 1}`
    })),
    generatedAt: 0,
    promptVersion: STORY_TEXT_PROMPT_VERSION
  };
}

export async function requestAgnesStory(
  settings: AgnesSettings,
  words: Pick<WordEntry, "word" | "meaningZh">[],
  options: AgnesCallOptions = {}
): Promise<StoryText> {
  if (!words.length) throw new Error("Cannot generate a story without mission words.");

  const { system, user } = buildStoryPrompt(words);
  const response = await fetch(`${normalizeAgnesBaseUrl(settings.baseUrl)}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildChatCompletionRequest({ model: settings.textModel, system, user })),
    signal: options.signal
  });
  if (!response.ok) throw new HttpAgnesError(`Agnes story request failed: ${response.status}`, response.status);
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content ?? "";
  const parsed = parseStoryResponse(content);
  if (!parsed) throw new Error("Agnes story response was not parseable.");
  return parsed;
}

// Reward-video prompt seeded with the LLM-written story so the celebration
// scene reflects what the kid just read. `videoRewardPrompt` stays in place
// as the fallback for the rare case where story generation failed but the
// kid still wants a video.
export function videoRewardPromptFromStory(story: StoryText, style: string = CHILD_ART_STYLES[0]): string {
  return [
    "Create a short cheerful Word Planet reward video that illustrates this kid story:",
    story.text,
    `Art style: ${style}.`,
    "Theme: School Planet celebration, friendly space-learning adventure, bright classroom/library visuals.",
    "Not photorealistic, no realistic photo look, no live-action — always illustrated, cartoonish, and loved by kids.",
    "Safe for children age 9-10, no scary content, no text overlays, no personal information."
  ].join(" ");
}

// Per-scene image prompt for the Story screen. Inherits the text-free
// guardrails from imagePromptForWord so the picture never spoils the
// English spelling of any vocabulary word.
export function buildStoryScenePrompt(
  scene: { en: string; zh: string; title: string },
  style: string = CHILD_ART_STYLES[0],
  words: Pick<WordEntry, "word" | "meaningZh">[] = []
): string {
  const wordHints = words
    .slice(0, 6)
    .map((word) => `${word.word} (${word.meaningZh})`)
    .join(", ");
  return [
    "Child-safe illustrated story scene for a Chinese-speaking kid learning English.",
    `Scene title: ${scene.title}.`,
    `English sentence to illustrate: ${scene.en}`,
    `Chinese gloss for context: ${scene.zh}`,
    wordHints ? `Mission vocabulary in the background: ${wordHints}.` : "",
    `Art style: ${style}.`,
    "Bright, friendly, non-scary, made for school-age children who love cartoons.",
    "Not photorealistic, no realistic photo look, no live-action — always illustrated and cartoonish.",
    "No readable text anywhere: no English words, no Chinese characters, no letters, captions, labels, signs, handwriting, book text, screen text, board text, posters, watermark, or private information.",
    "If the scene includes a book, paper, board, sign, poster, or screen, keep it blank or use simple unreadable shapes only."
  ]
    .filter(Boolean)
    .join(" ");
}
