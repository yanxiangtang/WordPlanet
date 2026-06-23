import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSavedLearningPageState,
  defaultParentControlSettings,
  defaultSettings,
  defaultVocabularySelection,
  loadLearningPageState,
  loadParentControlSettings,
  loadSettings,
  loadVocabularySelection,
  saveLearningPageState,
  saveParentControlSettings,
  saveSettings,
  saveVocabularySelection,
  unitStorageKey
} from "./storage";

describe("app settings", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        clear: () => store.clear(),
        getItem: (key: string) => store.get(key) ?? null,
        removeItem: (key: string) => store.delete(key),
        setItem: (key: string, value: string) => store.set(key, value)
      },
      configurable: true
    });
    localStorage.clear();
  });

  it("falls back to defaults for missing fields", () => {
    localStorage.setItem(
      "word-planet:settings:v1",
      JSON.stringify({ apiKey: "agnes" })
    );

    expect(loadSettings()).toEqual({
      ...defaultSettings,
      apiKey: "agnes"
    });
  });

  it("persists and reloads saved settings", () => {
    saveSettings({
      ...defaultSettings,
      apiKey: "agnes-key",
      imageModel: "custom-image-model"
    });

    expect(loadSettings()).toMatchObject({
      apiKey: "agnes-key",
      imageModel: "custom-image-model"
    });
  });

  it("loads default parent controls before a password is created", () => {
    expect(loadParentControlSettings()).toEqual(defaultParentControlSettings);
  });

  it("persists browser-local parent control settings", () => {
    saveParentControlSettings({
      password: "2468",
      createdAt: 1710000000000
    });

    expect(loadParentControlSettings()).toEqual({
      password: "2468",
      createdAt: 1710000000000
    });
  });

  it("persists and reloads the learning page state", () => {
    saveLearningPageState({
      screen: "spell",
      activeIndex: 2,
      spellInput: "lib"
    });

    expect(loadLearningPageState()).toEqual({
      screen: "spell",
      activeIndex: 2,
      spellInput: "lib"
    });
  });

  it("falls back to home when saved learning page state is malformed", () => {
    localStorage.setItem("word-planet:learning-page:v1", JSON.stringify({ screen: "settings", activeIndex: -3 }));

    expect(loadLearningPageState()).toEqual({
      screen: "home",
      activeIndex: 0,
      spellInput: ""
    });
  });

  it("clears saved learning page state", () => {
    saveLearningPageState({
      screen: "game",
      activeIndex: 1,
      spellInput: ""
    });

    clearSavedLearningPageState();

    expect(loadLearningPageState()).toEqual({
      screen: "home",
      activeIndex: 0,
      spellInput: ""
    });
  });

  it("loads the default vocabulary selection before one is saved", () => {
    expect(loadVocabularySelection()).toEqual(defaultVocabularySelection);
  });

  it("persists and reloads the vocabulary selection", () => {
    saveVocabularySelection({ setId: "yilin-grade3", bookId: "3B", unitNumber: 2, wordsPerMission: 10 });

    expect(loadVocabularySelection()).toEqual({
      setId: "yilin-grade3",
      bookId: "3B",
      unitNumber: 2,
      wordsPerMission: 10
    });
  });

  it("clamps an invalid words-per-mission count back to the default", () => {
    localStorage.setItem(
      "word-planet:vocabulary-selection:v1",
      JSON.stringify({ setId: "yilin-grade3", bookId: "3A", unitNumber: 1, wordsPerMission: 7 })
    );

    expect(loadVocabularySelection().wordsPerMission).toBe(defaultVocabularySelection.wordsPerMission);
  });

  it("falls back to default ids when stored selection fields are missing", () => {
    localStorage.setItem("word-planet:vocabulary-selection:v1", JSON.stringify({ wordsPerMission: 8 }));

    expect(loadVocabularySelection()).toEqual({
      setId: defaultVocabularySelection.setId,
      bookId: defaultVocabularySelection.bookId,
      unitNumber: defaultVocabularySelection.unitNumber,
      wordsPerMission: 8
    });
  });

  it("clamps a malformed saved unit number back to the default", () => {
    localStorage.setItem(
      "word-planet:vocabulary-selection:v1",
      JSON.stringify({ setId: "yilin-grade3", bookId: "3A", unitNumber: -2, wordsPerMission: 5 })
    );

    expect(loadVocabularySelection()).toEqual({
      setId: "yilin-grade3",
      bookId: "3A",
      unitNumber: defaultVocabularySelection.unitNumber,
      wordsPerMission: 5
    });
  });

  it("builds stable unit-scoped storage keys", () => {
    expect(unitStorageKey({ setId: "yilin-grade3", bookId: "3A", unitNumber: 2 })).toBe("yilin-grade3:3A:unit-2");
  });
});
