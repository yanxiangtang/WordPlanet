import type {
  AgnesSettings,
  ChildProfile,
  LearningPageState,
  LearningScreen,
  LessonPack,
  MissionMastery,
  ParentControlSettings,
  VideoTaskState,
  VocabularySelection
} from "../types";

const SETTINGS_KEY = "word-planet:settings:v1";
const PROFILE_KEY = "word-planet:profile:v1";
const PARENT_CONTROLS_KEY = "word-planet:parent-controls:v1";
const LEARNING_PAGE_KEY = "word-planet:learning-page:v1";
const VOCAB_SELECTION_KEY = "word-planet:vocabulary-selection:v1";
const DB_NAME = "word-planet";
const DB_VERSION = 3;
const RESTORABLE_SCREENS = new Set<LearningScreen>(["home", "learn", "story", "game", "spell", "reward", "summary"]);
const WORDS_PER_MISSION_OPTIONS = [5, 8, 10];

export const defaultSettings: AgnesSettings = {
  apiKey: "",
  baseUrl: "https://apihub.agnes-ai.com",
  imageModel: "agnes-image-2.0-flash",
  videoModel: "agnes-video-v2.0"
};

export const defaultProfile: ChildProfile = {
  nickname: "Momo",
  age: 9,
  gender: "boy",
  nativeLanguage: "Chinese",
  englishLevel: "intermediate",
  visualStyleId: "auto"
};

export const defaultParentControlSettings: ParentControlSettings = {
  password: "",
  createdAt: null
};

export const defaultLearningPageState: LearningPageState = {
  screen: "home",
  activeIndex: 0,
  spellInput: ""
};

export const defaultVocabularySelection: VocabularySelection = {
  setId: "yilin-grade3",
  bookId: "3A",
  unitNumber: 1,
  wordsPerMission: 5
};

function readJson<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === "undefined") return fallback;
    const raw = localStorage.getItem(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadSettings(): AgnesSettings {
  const saved = readJson<Partial<AgnesSettings>>(SETTINGS_KEY, defaultSettings);
  return {
    ...defaultSettings,
    ...saved
  };
}

export function saveSettings(settings: AgnesSettings): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadProfile(): ChildProfile {
  return readJson(PROFILE_KEY, defaultProfile);
}

export function saveProfile(profile: ChildProfile): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function loadParentControlSettings(): ParentControlSettings {
  const saved = readJson<Partial<ParentControlSettings>>(PARENT_CONTROLS_KEY, defaultParentControlSettings);
  return {
    password: typeof saved.password === "string" ? saved.password : "",
    createdAt: typeof saved.createdAt === "number" ? saved.createdAt : null
  };
}

export function saveParentControlSettings(settings: ParentControlSettings): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(PARENT_CONTROLS_KEY, JSON.stringify(settings));
}

export function loadLearningPageState(): LearningPageState {
  const saved = readJson<Partial<LearningPageState>>(LEARNING_PAGE_KEY, defaultLearningPageState);
  const screen = typeof saved.screen === "string" && RESTORABLE_SCREENS.has(saved.screen as LearningScreen) ? saved.screen : "home";
  const activeIndex = typeof saved.activeIndex === "number" && saved.activeIndex >= 0 ? Math.floor(saved.activeIndex) : 0;
  const spellInput = typeof saved.spellInput === "string" ? saved.spellInput : "";
  return { screen, activeIndex, spellInput };
}

export function saveLearningPageState(state: LearningPageState): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(LEARNING_PAGE_KEY, JSON.stringify(state));
}

export function clearSavedLearningPageState(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(LEARNING_PAGE_KEY);
}

export function loadVocabularySelection(): VocabularySelection {
  const saved = readJson<Partial<VocabularySelection>>(VOCAB_SELECTION_KEY, defaultVocabularySelection);
  const wordsPerMission = Number(saved.wordsPerMission);
  const unitNumber = Number(saved.unitNumber);
  return {
    setId: typeof saved.setId === "string" && saved.setId ? saved.setId : defaultVocabularySelection.setId,
    bookId: typeof saved.bookId === "string" && saved.bookId ? saved.bookId : defaultVocabularySelection.bookId,
    unitNumber: Number.isFinite(unitNumber) && unitNumber > 0 ? Math.floor(unitNumber) : defaultVocabularySelection.unitNumber,
    wordsPerMission: WORDS_PER_MISSION_OPTIONS.includes(wordsPerMission)
      ? wordsPerMission
      : defaultVocabularySelection.wordsPerMission
  };
}

export function saveVocabularySelection(selection: VocabularySelection): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(VOCAB_SELECTION_KEY, JSON.stringify(selection));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = request.transaction;
      for (const store of ["lessons", "mastery", "video", "learning"]) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
      }
      // v1 -> v2: previous records held base64 data URI strings / Agnes CDN
      // URLs. Both schemas are incompatible with the new Blob-backed format,
      // so drop them — fresh records will be regenerated on demand.
      if (event.oldVersion < 2 && tx) {
        for (const store of ["lessons", "video"]) {
          try {
            tx.objectStore(store).clear();
          } catch {
            // Store was just created above; nothing to clear.
          }
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function unitStorageKey(selection: Pick<VocabularySelection, "setId" | "bookId" | "unitNumber">): string {
  return `${selection.setId}:${selection.bookId}:unit-${selection.unitNumber}`;
}

async function put<T>(storeName: string, key: string, value: T): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function get<T>(storeName: string, key: string): Promise<T | undefined> {
  if (typeof indexedDB === "undefined") return undefined;
  const db = await openDb();
  const value = await new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return value;
}

async function remove(storeName: string, key: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// Strip transient object-URL fields so only persistent Blob bytes are stored.
// Object URLs (`blob:…`) are tab-scoped and meaningless across reloads, and
// would also waste space in the IDB record.
function stripLessonObjectUrls(lesson: LessonPack): LessonPack {
  return {
    ...lesson,
    assets: lesson.assets.map((asset) => ({ ...asset, imageUrl: "" })),
    storyScenes: lesson.storyScenes.map((scene) => ({ ...scene, imageUrl: "" }))
  };
}

function stripVideoObjectUrl(video: VideoTaskState): VideoTaskState {
  if (video.url === undefined) return video;
  const { url: _stripped, ...rest } = video;
  return rest;
}

export const storage = {
  getLesson: (key = "active") => get<LessonPack>("lessons", key),
  saveLesson: (lesson: LessonPack, key = "active") => put("lessons", key, stripLessonObjectUrls(lesson)),
  deleteLesson: (key = "active") => remove("lessons", key),
  getMastery: (key = "active") => get<MissionMastery>("mastery", key),
  saveMastery: (mastery: MissionMastery, key = "active") => put("mastery", key, mastery),
  getVideo: (key = "active") => get<VideoTaskState>("video", key),
  saveVideo: (video: VideoTaskState, key = "active") => put("video", key, stripVideoObjectUrl(video)),
  deleteVideo: (key = "active") => remove("video", key),
  getLearningPageState: (key = "active") => get<LearningPageState>("learning", key),
  saveLearningPageState: (state: LearningPageState, key = "active") => put("learning", key, state)
};
