export type PlanetTopic =
  | "school"
  | "animals"
  | "food"
  | "weather"
  | "actions"
  | "family"
  | "body"
  | "emotions";

export type WordLevel = "A1 Movers" | "A2 Flyers" | "A2 Key";

export type MasteryLane = "meaning" | "say" | "write";

export type WordEntry = {
  id: string;
  word: string;
  meaningZh: string;
  topic: PlanetTopic;
  level: WordLevel;
  example: string;
  exampleZh: string;
  imagePromptHint: string;
  spellingDifficulty: "easy" | "medium" | "tricky";
  pronunciationNote: string;
};

export type AgnesSettings = {
  apiKey: string;
  baseUrl: string;
  imageModel: string;
  videoModel: string;
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
  imageUrl: string;
  source: "agnes" | "sample";
};

export type StoryScene = {
  id: string;
  title: string;
  text: string;
  textZh: string;
  imageUrl: string;
};

export type LessonPack = {
  id: string;
  topic: PlanetTopic;
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
  url?: string;
  error?: string;
};
