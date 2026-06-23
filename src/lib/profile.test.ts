// @vitest-environment jsdom

import { beforeEach, describe, expect, test } from "vitest";
import { defaultProfile, loadProfile, saveProfile } from "./storage";

describe("kid profile settings", () => {
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

  test("defaults kid info to age 9 and boy theme", () => {
    expect(defaultProfile).toMatchObject({
      nickname: "Momo",
      age: 9,
      gender: "boy"
    });
  });

  test("defaults the visual style to auto", () => {
    expect(defaultProfile.visualStyleId).toBe("auto");
  });

  test("loads older saved profiles with a visual style default", () => {
    localStorage.setItem(
      "word-planet:profile:v1",
      JSON.stringify({ nickname: "Lulu", age: 10, nativeLanguage: "Chinese", englishLevel: "intermediate", gender: "girl" })
    );

    expect(loadProfile()).toMatchObject({
      nickname: "Lulu",
      age: 10,
      gender: "girl",
      visualStyleId: "auto"
    });
  });

  test("loads older saved profiles with a gender default", () => {
    localStorage.setItem(
      "word-planet:profile:v1",
      JSON.stringify({ nickname: "Lulu", age: 10, nativeLanguage: "Chinese", englishLevel: "intermediate" })
    );

    expect(loadProfile()).toMatchObject({
      nickname: "Lulu",
      age: 10,
      gender: "boy"
    });
  });

  test("saves and reloads selected gender", () => {
    saveProfile({ ...defaultProfile, nickname: "Amy", age: 8, gender: "girl" });

    expect(loadProfile()).toMatchObject({
      nickname: "Amy",
      age: 8,
      gender: "girl"
    });
  });
});
