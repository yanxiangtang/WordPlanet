import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSavedLearningPageState,
  defaultParentControlSettings,
  defaultSettings,
  loadLearningPageState,
  loadParentControlSettings,
  loadSettings,
  saveLearningPageState,
  saveParentControlSettings,
  saveSettings
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
});
