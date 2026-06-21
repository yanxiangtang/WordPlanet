import { beforeEach, describe, expect, it } from "vitest";
import { defaultSettings, loadSettings, saveSettings } from "./storage";

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
});
