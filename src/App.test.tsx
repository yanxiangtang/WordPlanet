import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { selectMissionWords } from "./data/vocabulary";
import { buildSampleLessonPack } from "./lib/lesson";
import { createEmptyMastery, recordMasteryResult } from "./lib/mastery";
import { defaultParentControlSettings, defaultProfile, defaultSettings, defaultVocabularySelection, storage } from "./lib/storage";
import App, { canStartRewardPipeline, LessonBoard, Notice, ParentControlScreen, SummaryScreen } from "./App";
import type { LessonPack, UnitCoverAsset, VideoTaskState, VocabularySet } from "./types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom doesn't implement URL.createObjectURL / revokeObjectURL, but the app
// uses them whenever it hydrates a pack so previews can render. Stub them
// before any test runs so component renders don't blow up.
beforeAll(() => {
  if (!globalThis.localStorage) {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear()
      },
      configurable: true
    });
  }
  if (!URL.createObjectURL) {
    URL.createObjectURL = vi.fn(() => "blob:mock-url");
  }
  if (!URL.revokeObjectURL) {
    URL.revokeObjectURL = vi.fn();
  }
});

const vocabularySets: VocabularySet[] = [
  {
    id: "yilin-grade3",
    name: "Yilin Grade 3",
    books: [{ id: "3A", name: "Book 3A", wordCount: 5 }]
  }
];
const bookUnits = [
  { unitNumber: 1, title: "Hello!", wordCount: 5 }
];
const unitSummaries = {
  1: { hasPack: false, hasVideo: false, hasProgress: false, complete: false }
};

const SETTINGS_KEY = "word-planet:settings:v1";
const ONE_PIXEL_B64 = "aQ==";

function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

async function flushAsyncWork(ticks = 4): Promise<void> {
  for (let i = 0; i < ticks; i += 1) await Promise.resolve();
}

function saveApiSettings() {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      ...defaultSettings,
      apiKey: "agnes-key",
      baseUrl: "https://agnes.test"
    })
  );
}

function NoticeHarness({ text, dismissible }: { text: string; dismissible: boolean }) {
  const [message, setMessage] = useState(text);
  return <Notice text={message} dismissible={dismissible} onDismiss={() => setMessage("")} />;
}

describe("notice banner", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it("lets dismissible failure notices be closed", () => {
    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);

    act(() => {
      root?.render(<NoticeHarness text="Reward video generation failed." dismissible={true} />);
    });

    expect(mount.textContent).toContain("Reward video generation failed.");
    const close = mount.querySelector<HTMLButtonElement>('[aria-label="Dismiss notice"]');
    expect(close).not.toBeNull();

    act(() => close?.click());

    expect(mount.textContent).not.toContain("Reward video generation failed.");
  });

  it("does not show a close action for ongoing status notices", () => {
    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);

    act(() => {
      root?.render(<NoticeHarness text="Asking Agnes to generate the reward video..." dismissible={false} />);
    });

    expect(mount.textContent).toContain("Asking Agnes to generate the reward video...");
    expect(mount.querySelector<HTMLButtonElement>('[aria-label="Dismiss notice"]')).toBeNull();
  });
});

describe("lesson generation indication", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it("uses inline busy state instead of standalone status bars", () => {
    const words = selectMissionWords("yilin-grade3", "3A", 5);
    const covers: Record<number, UnitCoverAsset> = {};
    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);

    act(() => {
      root?.render(
        <LessonBoard
          units={bookUnits}
          selection={defaultVocabularySelection}
          summaries={unitSummaries}
          covers={covers}
          words={words}
          missionReady={false}
          isGenerating={true}
          selectedStyleLabel="Dreamy watercolor"
          selectedStyleEmoji="🌈"
          onSelectUnit={() => {}}
          onStart={() => {}}
          onSample={() => {}}
          onPickStyle={() => {}}
          onUnitVisible={() => {}}
        />
      );
    });

    expect(mount.querySelector(".dashboard-notice-row")).toBeNull();
    expect(mount.querySelector(".setup-status-row")).toBeNull();
    expect(mount.querySelector(".request-spinner")).toBeNull();
    expect(mount.querySelector(".inline-busy-status")).toBeNull();
    expect(mount.textContent).not.toContain("Agnes is generating lesson images");

    const busyButton = mount.querySelector<HTMLButtonElement>(".primary-button.busy-button");
    expect(busyButton).not.toBeNull();
    expect(busyButton?.textContent).toContain("Preparing lesson");
    expect(busyButton?.getAttribute("aria-live")).toBe("polite");
  });
});

describe("mission dock navigation", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    container?.remove();
    window.history.replaceState({}, "", "/");
    root = undefined;
    container = undefined;
  });

  it("replaces the old global bottom navigation labels with mission steps", async () => {
    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);

    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
    });

    const sample = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Use Sample Mission")
    );
    await act(async () => {
      sample?.click();
      await Promise.resolve();
    });

    const dock = mount.querySelector<HTMLElement>(".mission-stepper");
    expect(dock).not.toBeNull();
    expect(dock?.getAttribute("aria-label")).toBe("Mission steps");

    for (const label of ["Learn", "Story", "Game", "Spell", "Reward", "Summary"]) {
      expect(dock?.textContent).toContain(label);
    }

    expect(mount.textContent).not.toContain("Backpack");
    expect(mount.textContent).not.toContain("Leaderboard");
    expect(mount.textContent).not.toContain("Missions");
    expect(mount.textContent).not.toContain("Back to Mission");
  });

  it("keeps parent controls reachable from the top bar with a contextual return action", async () => {
    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);

    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
    });

    const avatarButton = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes(defaultProfile.nickname)
    );
    expect(avatarButton).toBeTruthy();

    await act(async () => {
      avatarButton?.click();
      await Promise.resolve();
    });

    expect(mount.textContent).toContain("Return to Learning");
    expect(mount.textContent).not.toContain("Back to Mission");
  });

  it("uses a contextual summary return action", () => {
    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);
    const words = selectMissionWords("yilin-grade3", "3A", 5);
    const mastery = words.slice(0, 2).reduce((current, word) => {
      let next = current;
      next = recordMasteryResult(next, word.id, "meaning", true);
      next = recordMasteryResult(next, word.id, "say", true);
      next = recordMasteryResult(next, word.id, "write", true);
      return next;
    }, createEmptyMastery(words.slice(0, 2).map((word) => word.id)));

    act(() => {
      root?.render(
        <SummaryScreen
          mastery={mastery}
          onContinue={() => {}}
          onPracticeAgain={() => {}}
        />
      );
    });

    expect(mount.textContent).toContain("Continue Learning");
    expect(mount.textContent).toContain("Practice Again");
    expect(mount.textContent).not.toContain("Back to Mission");
  });

  it("restores and updates the current page from the URL", async () => {
    window.history.replaceState({}, "", "/?page=spell");
    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);

    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
    });

    const activeDockItem = mount.querySelector<HTMLElement>(".mission-stepper-item.active");
    expect(activeDockItem?.textContent).toContain("Spell");
    expect(window.location.search).toContain("page=spell");

    const avatarButton = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes(defaultProfile.nickname)
    );

    await act(async () => {
      avatarButton?.click();
      await Promise.resolve();
    });

    expect(window.location.search).toContain("page=setup");
  });
});

describe("interactive spelling practice", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    container?.remove();
    window.history.replaceState({}, "", "/");
    localStorage?.clear();
    root = undefined;
    container = undefined;
  });

  it("keeps a wrong answer visible, shows feedback, and reshuffles tiles", async () => {
    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);

    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
    });

    const sample = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Use Sample Mission")
    );
    await act(async () => {
      sample?.click();
      await Promise.resolve();
    });

    const spellStep = Array.from(mount.querySelectorAll<HTMLButtonElement>(".mission-stepper-item")).find((button) =>
      button.textContent?.includes("Spell")
    );
    await act(async () => {
      spellStep?.click();
      await Promise.resolve();
    });

    const originalButtons = Array.from(mount.querySelectorAll<HTMLButtonElement>(".letter-bank button"));
    const originalTiles = originalButtons.map((button) => button.textContent).join("");
    const partialAttempt = originalButtons[0]?.textContent ?? "";

    await act(async () => {
      originalButtons[0]?.click();
      await Promise.resolve();
    });

    await act(async () => {
      Array.from(mount.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.trim() === "Check")
        ?.click();
      await Promise.resolve();
    });

    const reshuffledTiles = Array.from(mount.querySelectorAll<HTMLButtonElement>(".letter-bank button"))
      .map((button) => button.textContent)
      .join("");

    expect(mount.querySelector<HTMLInputElement>(".spell-input")?.value).toBe(partialAttempt);
    expect(mount.querySelector(".spell-feedback")?.textContent).toContain("Try again");
    expect(reshuffledTiles).not.toBe(originalTiles);
  });
});

describe("kid lesson board", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    container?.remove();
    window.history.replaceState({}, "", "/");
    localStorage?.clear();
    root = undefined;
    container = undefined;
  });

  it("shows unit lesson cards on the child home screen", async () => {
    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);

    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
    });

    expect(mount.textContent).toContain("Choose a lesson");
    expect(mount.textContent).toContain("Unit 1");
    expect(mount.textContent).toContain("Hello!");
    expect(mount.textContent).toContain("Unit 2");
    expect(mount.textContent).toContain("I'm Liu Tao");
    expect(mount.querySelectorAll(".lesson-cover-placeholder").length).toBeGreaterThan(0);
    expect(mount.querySelector(".mission-stepper")).toBeNull();
  });

  it("opens the style picker before starting a fresh unit lesson", async () => {
    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);

    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
    });

    const unitTwo = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Unit 2")
    );

    await act(async () => {
      unitTwo?.click();
      await Promise.resolve();
    });

    expect(mount.textContent).toContain("Lesson detail");
    expect(mount.textContent).toContain("are");
    expect(mount.textContent).toContain("you");
    expect(mount.textContent).toContain("Start Lesson");
    expect(mount.querySelector(".lesson-detail-cover")).not.toBeNull();
    expect(mount.querySelector(".mission-stepper")).toBeNull();

    const start = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Start Lesson")
    );

    await act(async () => {
      start?.click();
      await Promise.resolve();
    });

    const dialog = mount.querySelector<HTMLElement>("[role='dialog']");
    expect(dialog?.textContent).toContain("Style for");
    expect(mount.querySelector(".lesson-board")).not.toBeNull();
    expect(mount.querySelector(".mission-stepper")).toBeNull();
  });

  it("starts the selected unit when using the sample mission from lesson detail", async () => {
    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);

    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
    });

    const unitTwo = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Unit 2")
    );

    await act(async () => {
      unitTwo?.click();
      await Promise.resolve();
    });

    const sample = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Use Sample Mission")
    );

    await act(async () => {
      sample?.click();
      await Promise.resolve();
    });

    expect(mount.querySelector(".lesson-board")).toBeNull();
    expect(mount.querySelector<HTMLElement>(".word-focus-card")?.textContent).toContain("are");
  });

  it("shows a Style for this unit row with a Change action on the lesson detail", async () => {
    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);

    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
    });

    const styleRow = mount.querySelector<HTMLElement>(".lesson-style-row");
    expect(styleRow).not.toBeNull();
    expect(styleRow?.textContent).toContain("Style for this unit");
    expect(styleRow?.textContent).not.toContain("tap Change to confirm");

    const change = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent?.trim() === "Change"
    );
    expect(change).toBeTruthy();

    await act(async () => {
      change?.click();
      await Promise.resolve();
    });

    const dialog = mount.querySelector<HTMLElement>("[role='dialog']");
    expect(dialog?.textContent).toContain("Style for");
  });

  it("does not expose style changes from the header during a lesson", async () => {
    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);

    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
    });

    const sample = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Use Sample Mission")
    );

    await act(async () => {
      sample?.click();
      await Promise.resolve();
    });

    expect(mount.querySelector(".lesson-board")).toBeNull();
    expect(mount.querySelector(".style-chip")).toBeNull();
    expect(mount.querySelector("[role='dialog']")).toBeNull();
  });

  it("allows changing unit style after the unit has started", () => {
    const words = selectMissionWords("yilin-grade3", "3A", 5);
    const covers: Record<number, UnitCoverAsset> = {};
    let pickedStyle = false;
    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);

    act(() => {
      root?.render(
        <LessonBoard
          units={bookUnits}
          selection={defaultVocabularySelection}
          summaries={unitSummaries}
          covers={covers}
          words={words}
          missionReady={true}
          isGenerating={false}
          selectedStyleLabel="Dreamy watercolor"
          selectedStyleEmoji="🌈"
          onSelectUnit={() => {}}
          onStart={() => {}}
          onSample={() => {}}
          onPickStyle={() => {
            pickedStyle = true;
          }}
          onUnitVisible={() => {}}
        />
      );
    });

    const styleRow = mount.querySelector<HTMLElement>(".lesson-style-row");
    expect(styleRow).not.toBeNull();
    expect(styleRow?.textContent).toContain("Style for this unit");
    const change = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent?.trim() === "Change"
    );
    expect(change).toBeTruthy();

    act(() => change?.click());

    expect(pickedStyle).toBe(true);
  });
});

describe("stale lesson caches", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    container?.remove();
    window.history.replaceState({}, "", "/");
    localStorage?.clear();
    vi.restoreAllMocks();
    root = undefined;
    container = undefined;
  });

  it("ignores saved lesson packs whose words no longer match the selected unit", async () => {
    const staleWords = selectMissionWords("yilin-grade3", "3A", 5);
    const stalePack = buildSampleLessonPack(staleWords, { setId: "yilin-grade3-3A-unit-1", title: "Book 3A · Unit 1" });
    vi.spyOn(storage, "getLesson").mockResolvedValue(stalePack);
    vi.spyOn(storage, "getMastery").mockResolvedValue(undefined);
    vi.spyOn(storage, "getVideo").mockResolvedValue(undefined);
    vi.spyOn(storage, "getLearningPageState").mockResolvedValue(undefined);
    vi.spyOn(storage, "getUnitCover").mockResolvedValue(undefined);
    vi.spyOn(storage, "getUnitStyle").mockResolvedValue(undefined);

    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);

    await act(async () => {
      root?.render(<App />);
      await flushAsyncWork(8);
    });

    expect(mount.querySelector<HTMLElement>(".lesson-detail-panel")?.textContent).toContain("8 mission words");
    expect(mount.textContent).toContain("Start Lesson");
    expect(mount.textContent).not.toContain("Resume Lesson");
  });
});

describe("non-blocking Agnes unit media generation", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    container?.remove();
    window.history.replaceState({}, "", "/");
    localStorage?.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
    root = undefined;
    container = undefined;
  });

  function installFetchMock() {
    const firstWordImage = deferred<Response>();
    const calls = {
      wordImages: 0,
      unitCovers: 0,
      storyText: 0,
      storyImages: 0,
      videos: 0
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as { prompt?: string } : {};
      const prompt = body.prompt ?? "";

      if (prompt.includes("lesson picker card")) {
        calls.unitCovers += 1;
        return jsonResponse({ data: [{ b64_json: ONE_PIXEL_B64 }] });
      }
      if (prompt.includes("story scene")) {
        calls.storyImages += 1;
        return jsonResponse({ data: [{ b64_json: ONE_PIXEL_B64 }] });
      }
      if (prompt.includes("picture clue")) {
        calls.wordImages += 1;
        if (calls.wordImages === 1) return firstWordImage.promise;
        return jsonResponse({ data: [{ b64_json: ONE_PIXEL_B64 }] });
      }
      if (String(_input).includes("/v1/chat/completions")) {
        calls.storyText += 1;
        return jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  story: {
                    text: "Momo waves hello. Momo meets a friend. Momo says goodbye.",
                    textZh: "Momo 挥手问好。Momo 遇见朋友。Momo 说再见。",
                    sentences: [
                      { en: "Momo waves hello.", zh: "Momo 挥手问好。", title: "Hello Wave" },
                      { en: "Momo meets a friend.", zh: "Momo 遇见朋友。", title: "New Friend" },
                      { en: "Momo says goodbye.", zh: "Momo 说再见。", title: "Goodbye" }
                    ]
                  }
                })
              }
            }
          ]
        });
      }
      if (String(_input).includes("/v1/videos") || String(_input).includes("/agnesapi")) {
        calls.videos += 1;
        return jsonResponse({ video_id: "video-1", status: "queued", progress: 0 });
      }

      return jsonResponse({ data: [{ b64_json: ONE_PIXEL_B64 }] });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    return { calls, firstWordImage };
  }

  it("starts a styled Agnes lesson before word images finish and queues the unit cover", async () => {
    saveApiSettings();
    const { calls } = installFetchMock();
    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);

    await act(async () => {
      root?.render(<App />);
      await flushAsyncWork();
    });

    const start = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Start Lesson")
    );
    await act(async () => {
      start?.click();
      await flushAsyncWork();
    });

    const useStyle = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Use this style")
    );
    await act(async () => {
      useStyle?.click();
      await flushAsyncWork(8);
    });

    expect(mount.querySelector(".lesson-board")).toBeNull();
    expect(mount.querySelector(".word-focus-card")).not.toBeNull();
    expect(calls.wordImages).toBeGreaterThan(0);
    expect(calls.unitCovers).toBeGreaterThan(0);
    expect(calls.storyText).toBeGreaterThan(0);
    expect(calls.storyImages).toBeGreaterThan(0);
  });

  it("streams completed word images into the already-open lesson", async () => {
    saveApiSettings();
    const { firstWordImage } = installFetchMock();
    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);

    await act(async () => {
      root?.render(<App />);
      await flushAsyncWork();
    });
    const start = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Start Lesson")
    );
    await act(async () => {
      start?.click();
      await flushAsyncWork();
    });
    const useStyle = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Use this style")
    );
    await act(async () => {
      useStyle?.click();
      await flushAsyncWork(8);
    });

    const initialSrc = mount.querySelector<HTMLImageElement>(".picture-panel img")?.src;
    expect(initialSrc).toBeTruthy();

    await act(async () => {
      firstWordImage.resolve(jsonResponse({ data: [{ b64_json: ONE_PIXEL_B64 }] }));
      await flushAsyncWork(10);
    });

    expect(mount.querySelector<HTMLImageElement>(".picture-panel img")?.src).not.toBe(initialSrc);
  });

  it("requests a fresh selected unit cover after changing style before start", async () => {
    saveApiSettings();
    const { calls } = installFetchMock();
    let objectUrlIndex = 0;
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      objectUrlIndex += 1;
      return `blob:style-cover-${objectUrlIndex}`;
    });
    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);

    await act(async () => {
      root?.render(<App />);
      await flushAsyncWork(20);
    });
    const coverCallsBeforeStyleChange = calls.unitCovers;

    const change = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent?.trim() === "Change"
    );
    await act(async () => {
      change?.click();
      await flushAsyncWork();
    });

    const spongeStyle = Array.from(mount.querySelectorAll<HTMLButtonElement>(".style-card")).find((button) =>
      button.textContent?.includes("Sponge Comedy")
    );
    await act(async () => {
      spongeStyle?.click();
      await flushAsyncWork();
    });

    const useStyle = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Use this style")
    );
    await act(async () => {
      useStyle?.click();
      await flushAsyncWork(8);
    });

    expect(mount.querySelector(".lesson-board")).not.toBeNull();
    expect(mount.textContent).toContain("Start Lesson");
    expect(mount.textContent).not.toContain("Resume Lesson");
    expect(calls.unitCovers).toBeGreaterThan(coverCallsBeforeStyleChange);
    expect(mount.querySelector<HTMLImageElement>(".lesson-unit-card.selected .lesson-card-cover img")?.src).toBeTruthy();
  });
});

describe("reward pipeline gating", () => {
  it("only allows reward video generation after mission completion", () => {
    const words = selectMissionWords("yilin-grade3", "3A", 5);
    const pack: LessonPack = buildSampleLessonPack(words, { setId: "yilin-grade3", title: "Book 3A" });
    const idleVideo: VideoTaskState = { status: "idle", progress: 0 };

    expect(
      canStartRewardPipeline({
        screen: "reward",
        pack,
        hasApiKey: true,
        isVideoBusy: false,
        complete: false,
        video: idleVideo
      })
    ).toBe(false);

    expect(
      canStartRewardPipeline({
        screen: "reward",
        pack,
        hasApiKey: true,
        isVideoBusy: false,
        complete: true,
        video: idleVideo
      })
    ).toBe(true);

    expect(
      canStartRewardPipeline({
        screen: "reward",
        pack,
        hasApiKey: true,
        isVideoBusy: false,
        complete: true,
        video: { status: "completed", progress: 100, blob: new Blob(["video"], { type: "video/mp4" }) }
      })
    ).toBe(false);
  });
});

describe("parent cached media controls", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it("uses unit selection without exposing a words-per-mission control", () => {
    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);

    act(() => {
      root?.render(
        <ParentControlScreen
          settings={defaultSettings}
          profile={defaultProfile}
          parentControls={defaultParentControlSettings}
          selection={defaultVocabularySelection}
          vocabularySets={vocabularySets}
          bookUnits={bookUnits}
          unitSummaries={unitSummaries}
          unlocked={true}
          pack={null}
          video={{ status: "idle", progress: 0 }}
          onSettings={() => {}}
          onProfile={() => {}}
          onParentControls={() => {}}
          onSelection={() => {}}
          onUnlock={() => {}}
          onDeletePictures={() => {}}
          onDeleteVideo={() => {}}
          isVideoBusy={false}
        />
      );
    });

    expect(mount.textContent).toContain("Vocabulary");
    expect(mount.textContent).toContain("Vocabulary set");
    expect(mount.textContent).toContain("Book");
    expect(mount.textContent).toContain("Unit 1");
    expect(mount.textContent).not.toContain("Words per mission");
  });

  it("opens cached pictures and videos directly from their previews", () => {
    const words = selectMissionWords("yilin-grade3", "3A", 5);
    const pack = buildSampleLessonPack(words, { setId: "yilin-grade3", title: "Book 3A" });
    const video: VideoTaskState = {
      status: "completed",
      progress: 100,
      url: "https://example.com/reward.mp4"
    };
    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);

    act(() => {
      root?.render(
        <ParentControlScreen
          settings={defaultSettings}
          profile={defaultProfile}
          parentControls={defaultParentControlSettings}
          selection={defaultVocabularySelection}
          vocabularySets={vocabularySets}
          bookUnits={bookUnits}
          unitSummaries={unitSummaries}
          unlocked={true}
          pack={pack}
          video={video}
          onSettings={() => {}}
          onProfile={() => {}}
          onParentControls={() => {}}
          onSelection={() => {}}
          onUnlock={() => {}}
          onDeletePictures={() => {}}
          onDeleteVideo={() => {}}
          isVideoBusy={false}
        />
      );
    });

    expect(mount.querySelector(".parent-status-card")).toBeNull();
    expect(mount.querySelector("button")?.textContent).not.toContain("Check cached media");
    const pictureButtons = Array.from(mount.querySelectorAll<HTMLButtonElement>(".cache-preview-button"));
    expect(pictureButtons).toHaveLength(pack.assets.length + pack.storyScenes.length);

    act(() => pictureButtons[0].click());

    const dialog = mount.querySelector<HTMLElement>("[role='dialog']");
    expect(dialog?.textContent).toContain(words[0].word);
    expect(dialog?.querySelector("img")?.getAttribute("src")).toBe(pack.assets[0].imageUrl);

    act(() => mount.querySelector<HTMLButtonElement>(".media-viewer-close")?.click());
    act(() => pictureButtons.at(-1)?.click());

    const storyDialog = mount.querySelector<HTMLElement>("[role='dialog']");
    expect(storyDialog?.textContent).toContain(pack.storyScenes.at(-1)?.title);
    expect(storyDialog?.querySelector("img")?.getAttribute("src")).toBe(pack.storyScenes.at(-1)?.imageUrl);

    act(() => mount.querySelector<HTMLButtonElement>(".media-viewer-close")?.click());
    act(() => mount.querySelector<HTMLButtonElement>(".video-open-button")?.click());

    const videoDialog = mount.querySelector<HTMLElement>("[role='dialog']");
    expect(videoDialog?.textContent).toContain("Cached reward video");
    expect(videoDialog?.querySelector("video")?.getAttribute("src")).toBe(video.url);
  });

  it("keeps parent cache cards delete-only", () => {
    const words = selectMissionWords("yilin-grade3", "3A", 5);
    const pack = buildSampleLessonPack(words, { setId: "yilin-grade3", title: "Book 3A" });
    const onDeletePictures = vi.fn();
    const onDeleteVideo = vi.fn();
    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);

    act(() => {
      root?.render(
        <ParentControlScreen
          settings={{ ...defaultSettings, apiKey: "agnes-key" }}
          profile={defaultProfile}
          parentControls={defaultParentControlSettings}
          selection={defaultVocabularySelection}
          vocabularySets={vocabularySets}
          bookUnits={bookUnits}
          unitSummaries={unitSummaries}
          unlocked={true}
          pack={pack}
          video={{ status: "idle", progress: 0 }}
          onSettings={() => {}}
          onProfile={() => {}}
          onParentControls={() => {}}
          onSelection={() => {}}
          onUnlock={() => {}}
          onDeletePictures={onDeletePictures}
          onDeleteVideo={onDeleteVideo}
          isVideoBusy={false}
        />
      );
    });

    const buttonText = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).map((button) => button.textContent?.trim());
    expect(buttonText.some((text) => text?.includes("Generate lesson pack"))).toBe(false);
    expect(buttonText.some((text) => text?.includes("Regenerate pictures"))).toBe(false);
    expect(buttonText.some((text) => text?.includes("Regenerate video"))).toBe(false);

    const deletePictures = buttonText.find((text) => text === "Delete pictures");
    const deleteVideo = buttonText.find((text) => text === "Delete video");
    expect(deletePictures).toBeTruthy();
    expect(deleteVideo).toBeTruthy();
  });

  it("shows video progress in the cached-video card without regeneration controls", () => {
    const words = selectMissionWords("yilin-grade3", "3A", 5);
    const pack = buildSampleLessonPack(words, { setId: "yilin-grade3", title: "Book 3A" });
    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);

    act(() => {
      root?.render(
        <ParentControlScreen
          settings={{ ...defaultSettings, apiKey: "agnes-key" }}
          profile={defaultProfile}
          parentControls={defaultParentControlSettings}
          selection={defaultVocabularySelection}
          vocabularySets={vocabularySets}
          bookUnits={bookUnits}
          unitSummaries={unitSummaries}
          unlocked={true}
          pack={pack}
          video={{ status: "idle", progress: 0 }}
          onSettings={() => {}}
          onProfile={() => {}}
          onParentControls={() => {}}
          onSelection={() => {}}
          onUnlock={() => {}}
          onDeletePictures={() => {}}
          onDeleteVideo={() => {}}
          isVideoBusy={false}
        />
      );
    });

    expect(mount.textContent).not.toContain("Regenerate video");
    expect(mount.querySelector(".video-progress")).toBeNull();

    // Re-render in the busy state and verify the progress bar appears and the
    // parent card remains delete-only while lesson start owns generation.
    act(() => {
      root?.render(
        <ParentControlScreen
          settings={{ ...defaultSettings, apiKey: "agnes-key" }}
          profile={defaultProfile}
          parentControls={defaultParentControlSettings}
          selection={defaultVocabularySelection}
          vocabularySets={vocabularySets}
          bookUnits={bookUnits}
          unitSummaries={unitSummaries}
          unlocked={true}
          pack={pack}
          video={{ status: "running", progress: 42 }}
          onSettings={() => {}}
          onProfile={() => {}}
          onParentControls={() => {}}
          onSelection={() => {}}
          onUnlock={() => {}}
          onDeletePictures={() => {}}
          onDeleteVideo={() => {}}
          isVideoBusy={true}
        />
      );
    });

    expect(mount.textContent).not.toContain("Regenerating...");

    const progress = mount.querySelector<HTMLProgressElement>(".video-progress");
    expect(progress).not.toBeNull();
    expect(progress?.value).toBe(42);

    const deleteVideo = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Delete video")
    );
    expect(deleteVideo?.disabled).toBe(true);
  });

  it("groups parent media actions in stable full-width rows", () => {
    const words = selectMissionWords("yilin-grade3", "3A", 5);
    const pack = buildSampleLessonPack(words, { setId: "yilin-grade3", title: "Book 3A" });
    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);

    act(() => {
      root?.render(
        <ParentControlScreen
          settings={{ ...defaultSettings, apiKey: "agnes-key" }}
          profile={defaultProfile}
          parentControls={defaultParentControlSettings}
          selection={defaultVocabularySelection}
          vocabularySets={vocabularySets}
          bookUnits={bookUnits}
          unitSummaries={unitSummaries}
          unlocked={true}
          pack={pack}
          video={{ status: "idle", progress: 0 }}
          onSettings={() => {}}
          onProfile={() => {}}
          onParentControls={() => {}}
          onSelection={() => {}}
          onUnlock={() => {}}
          onDeletePictures={() => {}}
          onDeleteVideo={() => {}}
          isVideoBusy={false}
        />
      );
    });

    const actionRows = Array.from(mount.querySelectorAll<HTMLElement>(".parent-action-row"));
    expect(actionRows).toHaveLength(2);
    for (const row of actionRows) {
      const buttons = Array.from(row.querySelectorAll<HTMLButtonElement>("button"));
      expect(buttons).toHaveLength(1);
      expect(buttons.every((button) => button.classList.contains("parent-action-button"))).toBe(true);
    }
  });
});
