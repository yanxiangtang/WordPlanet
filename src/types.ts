export type WordLevel = "A1 Movers" | "A2 Flyers" | "A2 Key";

export type MasteryLane = "meaning" | "say" | "write";

export type WordEntry = {
  id: string;
  word: string;
  meaningZh: string;
  wordType: string;
  topic: string;
  level: WordLevel;
  example: string;
  exampleZh: string;
  imagePromptHint: string;
  spellingDifficulty: "easy" | "medium" | "tricky";
  pronunciationNote: string;
};

export type VocabularyBook = {
  id: string;
  name: string;
  wordCount: number;
};

export type VocabularyUnit = {
  unitNumber: number;
  title: string;
  wordCount: number;
};

export type VocabularySet = {
  id: string;
  name: string;
  description?: string;
  books: VocabularyBook[];
};

export type VocabularySelection = {
  setId: string;
  bookId: string;
  unitNumber: number;
  wordsPerMission: number;
};

export type AgnesSettings = {
  apiKey: string;
  baseUrl: string;
  imageModel: string;
  videoModel: string;
  textModel: string;
};

export type ParentControlSettings = {
  password: string;
  createdAt: number | null;
};

export type LearningScreen = "home" | "learn" | "story" | "game" | "spell" | "reward" | "summary";

export type LearningPageState = {
  screen: LearningScreen;
  activeIndex: number;
  spellInput: string;
};

export type ChildProfile = {
  nickname: string;
  age: number;
  gender: "girl" | "boy";
  nativeLanguage: "Chinese";
  englishLevel: "intermediate";
  // Kid-selected visual style id (see src/lib/styles.ts). "auto" rotates a
  // style per practice group; a curated id fixes the look for that mission.
  visualStyleId: string;
  // Optional free-text "describe your world" note. When non-empty (after
  // sanitization) it overrides the curated style's descriptor.
  visualStyleNote?: string;
};

export type LessonAsset = {
  wordId: string;
  // Raw bytes — persisted in IndexedDB so the cache survives Agnes CDN expiry.
  imageBlob: Blob;
  // Transient object URL rebuilt from imageBlob on hydration; not persisted.
  imageUrl: string;
  source: "agnes" | "sample";
};

export type UnitCoverAsset = {
  setId: string;
  bookId: string;
  unitNumber: number;
  promptVersion: number;
  artStyleId: string;
  artStyleNote?: string;
  // Raw bytes — persisted in IndexedDB so unit covers render without a fresh
  // Agnes call after reload.
  imageBlob: Blob;
  // Transient object URL rebuilt from imageBlob on hydration; not persisted.
  imageUrl: string;
  source: "agnes" | "sample";
  createdAt: number;
};

export type StoryScene = {
  id: string;
  title: string;
  text: string;
  textZh: string;
  // Raw bytes — persisted; see LessonAsset.imageBlob.
  imageBlob: Blob;
  // Transient object URL rebuilt from imageBlob on hydration; not persisted.
  imageUrl: string;
  // "sample" scenes are the inline SVG placeholders that ship with the
  // built-in sample pack. "agnes" scenes are real Agnes-generated images
  // produced lazily when the kid first enters the Story screen. The lazy
  // generator skips scenes already marked "agnes" so re-entering Story
  // doesn't re-fire the Agnes call.
  source?: "agnes" | "sample";
};

// LLM-written narrative that ties a mission's vocabulary into a short kid story.
// Generated once when the lesson starts (or lazily on Story for packs that
// predate background video generation) and persisted on the lesson pack so
// reloads don't re-spend the credit. The story drives the reward-video prompt
// AND the per-scene image prompts on the Story screen.
export type StoryText = {
  text: string;
  textZh: string;
  sentences: { en: string; zh: string; title: string }[];
  generatedAt: number;
  promptVersion: number;
};

// Per-unit style choice. The kid picks/confirms one of these on the lesson
// picker before tapping Start; lesson images are only generated once a pick
// exists. Persisted in IDB so the choice survives reloads.
export type UnitStylePick = {
  styleId: string;
  styleNote?: string;
  chosenAt: number;
};

export type LessonPack = {
  id: string;
  topic: string;
  title: string;
  createdAt: number;
  assetPromptVersion: number;
  source: "agnes" | "sample";
  // Style id (and optional free-text note) the pack's art was generated with.
  // Compared against the kid's current selection so a style change can detect a
  // stale pack and prompt for regeneration.
  artStyleId: string;
  artStyleNote?: string;
  // Per-unit style choice that drove this pack. Mirrors artStyleId/Note at
  // generation time but records the kid's explicit unit-scoped pick rather
  // than the resolved descriptor. Used by the picker to surface "Style for
  // this unit" without going back to IDB.
  unitStyleId?: string;
  unitStyleNote?: string;
  // LLM-written story for this mission. Filled by the background reward
  // pipeline or lazily by the Story screen, then cached so subsequent visits
  // reuse it.
  storyText?: StoryText;
  words: WordEntry[];
  assets: LessonAsset[];
  storyScenes: StoryScene[];
};

export type LaneScore = {
  correct: number;
  wrong: number;
  completed: boolean;
};

export type WordMastery = Record<MasteryLane, LaneScore>;
export type MissionMastery = Record<string, WordMastery>;

export type VideoTaskState = {
  videoId?: string;
  taskId?: string;
  status: "idle" | "queued" | "running" | "completed" | "failed";
  progress: number;
  // Prompt version that produced this video. Missing/older versions are stale
  // and should be regenerated because video prompts are cached separately from
  // lesson image/story prompts.
  promptVersion?: number;
  // Multi-stage progress label for the reward pipeline. "writing-story" runs
  // the LLM story call; "creating-task" submits the Agnes video task;
  // "rendering" is the polling loop; "downloading" pulls the finished CDN
  // blob. Optional so old cached records hydrate cleanly.
  stage?: "writing-story" | "creating-task" | "rendering" | "downloading";
  // Raw bytes of the completed video — persisted so the cache survives Agnes
  // CDN expiry. Absent while queued/running and on sample/error states.
  blob?: Blob;
  // Playable URL. Blob object URLs are rebuilt from blob on hydration and not
  // persisted; remote Agnes URLs may be kept as a fallback when byte caching fails.
  url?: string;
  error?: string;
};
