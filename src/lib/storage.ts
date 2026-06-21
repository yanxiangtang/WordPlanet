import type { AgnesSettings, ChildProfile, LessonPack, MissionMastery, VideoTaskState } from "../types";

const SETTINGS_KEY = "word-planet:settings:v1";
const PROFILE_KEY = "word-planet:profile:v1";
const DB_NAME = "word-planet";
const DB_VERSION = 1;

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
  englishLevel: "intermediate"
};

function readJson<T>(key: string, fallback: T): T {
  try {
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
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadProfile(): ChildProfile {
  return readJson(PROFILE_KEY, defaultProfile);
}

export function saveProfile(profile: ChildProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of ["lessons", "mastery", "video"]) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function put<T>(storeName: string, key: string, value: T): Promise<void> {
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

export const storage = {
  getLesson: () => get<LessonPack>("lessons", "active"),
  saveLesson: (lesson: LessonPack) => put("lessons", "active", lesson),
  getMastery: () => get<MissionMastery>("mastery", "active"),
  saveMastery: (mastery: MissionMastery) => put("mastery", "active", mastery),
  getVideo: () => get<VideoTaskState>("video", "active"),
  saveVideo: (video: VideoTaskState) => put("video", "active", video)
};
