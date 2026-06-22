export type WordLevel = "A1 Movers" | "A2 Flyers" | "A2 Key";

export type MasteryLane = "meaning" | "say" | "write";

export type WordEntry = {
  id: string;
  word: string;
  meaningZh: string;
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

export type VocabularySet = {
  id: string;
  name: string;
  description?: string;
  books: VocabularyBook[];
};

export type VocabularySelection = {
  setId: string;
  bookId: string;
  wordsPerMission: number;
};

export type AgnesSettings = {
  apiKey: string;
  baseUrl: string;
  imageModel: string;
  videoModel: string;
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
};

export type LessonAsset = {
  wordId: string;
  // Raw bytes — persisted in IndexedDB so the cache survives Agnes CDN expiry.
  imageBlob: Blob;
  // Transient object URL rebuilt from imageBlob on hydration; not persisted.
  imageUrl: string;
  source: "agnes" | "sample";
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
};

export type LessonPack = {
  id: string;
  topic: string;
  title: string;
  createdAt: number;
  assetPromptVersion: number;
  source: "agnes" | "sample";
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
  // Raw bytes of the completed video — persisted so the cache survives Agnes
  // CDN expiry. Absent while queued/running and on sample/error states.
  blob?: Blob;
  // Transient object URL rebuilt from blob on hydration; not persisted.
  url?: string;
  error?: string;
};
