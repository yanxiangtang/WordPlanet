import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { selectMissionWords } from "./data/vocabulary";
import { buildPendingAgnesLessonPack, buildSampleLessonPack } from "./lib/lesson";
import { REWARD_VIDEO_PROMPT_VERSION } from "./lib/agnes";
import { createEmptyMastery, recordMasteryResult } from "./lib/mastery";
import { defaultParentControlSettings, defaultProfile, defaultSettings, defaultVocabularySelection, storage } from "./lib/storage";
import { speak } from "./lib/speech";
import App, { canStartRewardPipeline, LessonBoard, Notice, ParentControlScreen, RewardInline, SummaryScreen } from "./App";
import type { LessonPack, UnitCoverAsset, VideoTaskState, VocabularySet } from "./types";

vi.mock("./lib/speech", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/speech")>();
  return {
    ...actual,
    speak: vi.fn()
  };
});

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

  it("moves missing reward practice details into compact mission step badges", async () => {
    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);
    const totalWords = selectMissionWords(
      defaultVocabularySelection.setId,
      defaultVocabularySelection.bookId,
      defaultVocabularySelection.wordsPerMission,
      defaultVocabularySelection.unitNumber
    ).length;

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

    const rewardStep = Array.from(mount.querySelectorAll<HTMLButtonElement>(".mission-stepper-item")).find((button) =>
      button.textContent?.includes("Reward")
    );
    await act(async () => {
      rewardStep?.click();
      await Promise.resolve();
    });

    const rewardPanel = mount.querySelector<HTMLElement>(".inline-activity.reward");
    expect(rewardPanel?.textContent).not.toContain("Finish the missing practice below to unlock the video");
    expect(rewardPanel?.textContent).toContain("Tap a word, then find its twin.");

    const gameStep = Array.from(mount.querySelectorAll<HTMLButtonElement>(".mission-stepper-item")).find((button) =>
      button.textContent?.includes("Game")
    );
    const spellStep = Array.from(mount.querySelectorAll<HTMLButtonElement>(".mission-stepper-item")).find((button) =>
      button.textContent?.includes("Spell")
    );
    expect(gameStep?.querySelector(".stepper-progress-badge")?.textContent).toBe(`0/${totalWords}`);
    expect(spellStep?.querySelector(".stepper-progress-badge")?.textContent).toBe(`0/${totalWords}`);
    expect(gameStep?.textContent).not.toContain(`Meaning 0/${totalWords}`);
    expect(spellStep?.textContent).not.toContain(`Spelling 0/${totalWords}`);
  });

  it("updates the phase bar meaning badge as meaning practice is completed", async () => {
    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);
    const totalWords = selectMissionWords(
      defaultVocabularySelection.setId,
      defaultVocabularySelection.bookId,
      defaultVocabularySelection.wordsPerMission,
      defaultVocabularySelection.unitNumber
    ).length;

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

    const knowIt = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("I know it")
    );
    await act(async () => {
      knowIt?.click();
      await Promise.resolve();
    });

    const gameStep = Array.from(mount.querySelectorAll<HTMLButtonElement>(".mission-stepper-item")).find((button) =>
      button.textContent?.includes("Game")
    );
    expect(gameStep?.querySelector(".stepper-progress-badge")?.textContent).toBe(`1/${totalWords}`);
    expect(gameStep?.textContent).not.toContain(`Meaning 1/${totalWords}`);
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

  it("returns from parent controls to the learning page that opened them", async () => {
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

    expect(mount.querySelector<HTMLElement>(".mission-stepper-item.active")?.textContent).toContain("Spell");

    const avatarButton = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes(defaultProfile.nickname)
    );
    await act(async () => {
      avatarButton?.click();
      await Promise.resolve();
    });

    const returnButton = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Return to Learning")
    );
    await act(async () => {
      returnButton?.click();
      await Promise.resolve();
    });

    expect(mount.querySelector(".lesson-board")).toBeNull();
    expect(mount.querySelector<HTMLElement>(".mission-stepper-item.active")?.textContent).toContain("Spell");
    expect(window.location.search).toContain("page=spell");
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
    vi.useRealTimers();
    vi.restoreAllMocks();
    root = undefined;
    container = undefined;
  });

  it("auto-checks a full wrong spelling answer and lets a box remove one character", async () => {
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

    expect(
      Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).some((button) => button.textContent?.trim() === "Check")
    ).toBe(false);

    const word = selectMissionWords(
      defaultVocabularySelection.setId,
      defaultVocabularySelection.bookId,
      defaultVocabularySelection.wordsPerMission,
      defaultVocabularySelection.unitNumber
    )[0];
    const tileButtons = Array.from(mount.querySelectorAll<HTMLButtonElement>(".letter-bank button"));
    const displayedAttempt = tileButtons.map((button) => button.textContent ?? "").join("");
    const wrongButtons = displayedAttempt === word.word ? [...tileButtons].reverse() : tileButtons;

    for (const button of wrongButtons) {
      await act(async () => {
        button.click();
        await Promise.resolve();
      });
    }

    expect(mount.querySelector(".spell-feedback.retry")?.textContent).toContain("Try again");
    expect(mount.querySelector(".spell-answer.retry.shake")).not.toBeNull();
    expect(mount.querySelectorAll(".spell-box.filled").length).toBe(word.word.length);

    await act(async () => {
      mount.querySelector<HTMLButtonElement>(".spell-box.filled")?.click();
      await Promise.resolve();
    });

    expect(mount.querySelector(".spell-feedback")).toBeNull();
    expect(mount.querySelectorAll(".spell-box.filled").length).toBe(word.word.length - 1);
  });

  it("auto-checks a correct spelling answer and turns the boxes green", async () => {
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

    const word = selectMissionWords(
      defaultVocabularySelection.setId,
      defaultVocabularySelection.bookId,
      defaultVocabularySelection.wordsPerMission,
      defaultVocabularySelection.unitNumber
    )[0];

    for (const letter of word.word.split("")) {
      const button = Array.from(mount.querySelectorAll<HTMLButtonElement>(".letter-bank button")).find(
        (candidate) => candidate.textContent === letter && !candidate.disabled
      );
      await act(async () => {
        button?.click();
        await Promise.resolve();
      });
    }

    expect(mount.querySelector(".spell-feedback.correct")).toBeNull();
    expect(mount.textContent).not.toContain(`Great spelling: ${word.word}!`);
    expect(mount.textContent).not.toContain(`Your answer: ${word.word}`);
    expect(mount.querySelector(".spell-answer.correct")).not.toBeNull();
  });

  it("moves to the next spelling word before unlocking reward", async () => {
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

    const firstPrompt = mount.querySelector<HTMLElement>(".inline-activity.spell h3")?.textContent;
    const continueButton = mount.querySelector<HTMLButtonElement>(".spelling-actions .finish-button");

    await act(async () => {
      continueButton?.click();
      await Promise.resolve();
    });

    expect(mount.querySelector(".inline-activity.spell")).not.toBeNull();
    expect(mount.querySelector<HTMLElement>(".inline-activity.spell h3")?.textContent).not.toBe(firstPrompt);
    expect(mount.querySelector<HTMLElement>(".mission-stepper-item.active")?.textContent).toContain("Spell");
    expect(mount.querySelector(".inline-activity.reward")).toBeNull();
  });
});

describe("reward clear game", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    container?.remove();
    root = undefined;
    container = undefined;
    vi.mocked(speak).mockClear();
  });

  it("renders the clear game before the video bonus", () => {
    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);
    const words = selectMissionWords("yilin-grade3", "3A", 5);
    const pack = buildSampleLessonPack(words, { setId: "test", title: "Test mission" });
    const video: VideoTaskState = { status: "completed", progress: 100, url: "blob:reward", promptVersion: REWARD_VIDEO_PROMPT_VERSION };

    act(() => {
      root?.render(<RewardInline complete={false} pack={pack} video={video} onCreate={() => {}} onSummary={() => {}} />);
    });

    expect(mount.querySelector(".reward-clear-game")).not.toBeNull();
    expect(mount.textContent).toContain("Word Card Rescue");
    expect(mount.textContent).toContain("Tap a word, then find its twin.");
    expect(mount.textContent).not.toContain("Today's Mission");
    expect(mount.textContent).not.toContain("Video Bonus");
    expect(mount.querySelector("video")).toBeNull();
  });

  it("reveals the video bonus after the rescue meter is filled", () => {
    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);
    const words = selectMissionWords("yilin-grade3", "3A", 1);
    const pack = buildSampleLessonPack(words, { setId: "test", title: "Test mission" });
    const video: VideoTaskState = { status: "completed", progress: 100, url: "blob:reward", promptVersion: REWARD_VIDEO_PROMPT_VERSION };

    act(() => {
      root?.render(<RewardInline complete={true} pack={pack} video={video} onCreate={() => {}} onSummary={() => {}} />);
    });

    for (let index = 0; index < 18; index += 1) {
      const byToken = new Map<string, HTMLButtonElement[]>();
      for (const button of Array.from(mount.querySelectorAll<HTMLButtonElement>(".reward-clear-tile.word"))) {
        const token = button.dataset.token ?? "";
        byToken.set(token, [...(byToken.get(token) ?? []), button]);
      }
      const pair = Array.from(byToken.values()).find((items) => items.length >= 2);
      expect(pair).toBeTruthy();
      act(() => {
        pair?.[0].click();
      });
      act(() => {
        pair?.[1].click();
      });
    }

    expect(mount.textContent).toContain("Video Bonus");
    expect(mount.querySelector("video")).not.toBeNull();
  });

  it("selects one card and clears any matching word card on the second click", () => {
    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);
    const words = selectMissionWords("yilin-grade3", "3A", 5);
    const pack = buildSampleLessonPack(words, { setId: "test", title: "Test mission" });
    const video: VideoTaskState = { status: "idle", progress: 0 };

    act(() => {
      root?.render(<RewardInline complete={true} pack={pack} video={video} onCreate={() => {}} onSummary={() => {}} />);
    });

    const byToken = new Map<string, HTMLButtonElement[]>();
    for (const button of Array.from(mount.querySelectorAll<HTMLButtonElement>(".reward-clear-tile.word"))) {
      const token = button.dataset.token ?? "";
      byToken.set(token, [...(byToken.get(token) ?? []), button]);
    }
    const pair = Array.from(byToken.values()).find((items) => items.length >= 2);
    expect(pair).toBeTruthy();

    act(() => {
      pair?.[0].click();
    });

    expect(pair?.[0].classList.contains("selected")).toBe(true);
    const guidance = mount.querySelector(".reward-guidance")?.textContent ?? "";
    expect(guidance).toBe("Card selected. Find its twin.");
    expect(guidance).not.toContain(pair?.[0].textContent ?? "");
    expect(mount.querySelector(".reward-clear-tile.pair-hint")).toBeNull();

    act(() => {
      pair?.[1].click();
    });

    expect(mount.querySelector(".rescue-meter-copy")?.textContent).toContain("2/");
    expect(mount.querySelector(".reward-clear-tile.selected")).toBeNull();
  });

  it("plays the word pronunciation when a card is clicked", () => {
    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);
    const words = selectMissionWords("yilin-grade3", "3A", 5);
    const pack = buildSampleLessonPack(words, { setId: "test", title: "Test mission" });
    const video: VideoTaskState = { status: "idle", progress: 0 };

    act(() => {
      root?.render(<RewardInline complete={true} pack={pack} video={video} onCreate={() => {}} onSummary={() => {}} />);
    });

    const card = mount.querySelector<HTMLButtonElement>(".reward-clear-tile.word");
    expect(card).toBeTruthy();

    act(() => {
      card?.click();
    });

    expect(speak).toHaveBeenCalledWith(card?.textContent, 1);
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

  it("shows a featured style preview and lands Surprise Me on a concrete style", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const saveUnitStyle = vi.spyOn(storage, "saveUnitStyle").mockResolvedValue();
    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);

    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
    });

    const start = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Start Lesson")
    );

    await act(async () => {
      start?.click();
      await Promise.resolve();
    });

    const dialog = mount.querySelector<HTMLElement>("[role='dialog']");
    expect(dialog?.querySelector(".style-featured-preview")).not.toBeNull();
    expect(dialog?.querySelector(".style-featured-title")?.textContent).toContain("Surprise Me");
    expect(dialog?.querySelector<HTMLImageElement>(".style-featured-art")?.getAttribute("src")).toBeTruthy();

    const surprise = Array.from(dialog?.querySelectorAll<HTMLButtonElement>("button") ?? []).find((button) =>
      button.textContent?.includes("Surprise Me")
    );
    await act(async () => {
      surprise?.click();
      vi.advanceTimersByTime(900);
      await Promise.resolve();
    });

    expect(mount.querySelector("[role='dialog']")).not.toBeNull();
    expect(mount.querySelector(".style-featured-title")?.textContent).toContain("Sponge Comedy");
    expect(mount.querySelector(".style-featured-title")?.textContent).not.toContain("Surprise Me");
    expect(mount.querySelector<HTMLButtonElement>(".style-option.selected")?.textContent).toContain("Sponge Comedy");
    expect(mount.querySelector<HTMLInputElement>(".style-freetext input")?.value).toBe("");

    const useStyle = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Use this style")
    );
    await act(async () => {
      useStyle?.click();
      await Promise.resolve();
    });

    expect(saveUnitStyle).toHaveBeenCalledWith(expect.objectContaining({ styleId: "sponge-comedy" }), expect.any(String));
    expect(mount.querySelector("[role='dialog']")).toBeNull();
    expect(mount.querySelector(".word-focus-card")).not.toBeNull();
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

  it("moves to Story when tapping Next on the last learn word", async () => {
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

    const totalWords = selectMissionWords(
      defaultVocabularySelection.setId,
      defaultVocabularySelection.bookId,
      defaultVocabularySelection.wordsPerMission,
      defaultVocabularySelection.unitNumber
    ).length;

    for (let i = 0; i < totalWords; i += 1) {
      const next = mount.querySelector<HTMLButtonElement>(".word-focus-card .primary-button");
      await act(async () => {
        next?.click();
        await Promise.resolve();
      });
    }

    expect(mount.querySelector(".word-focus-card")).toBeNull();
    expect(mount.querySelector<HTMLElement>(".mission-stepper-item.active")?.textContent).toContain("Story");
    expect(mount.querySelector<HTMLElement>(".inline-activity.story")).not.toBeNull();
  });

  it("advances through picture game words before going to spelling", async () => {
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

    const gameStep = Array.from(mount.querySelectorAll<HTMLButtonElement>(".mission-stepper-item")).find((button) =>
      button.textContent?.includes("Game")
    );

    await act(async () => {
      gameStep?.click();
      await Promise.resolve();
    });

    const words = selectMissionWords(
      defaultVocabularySelection.setId,
      defaultVocabularySelection.bookId,
      defaultVocabularySelection.wordsPerMission,
      defaultVocabularySelection.unitNumber
    );

    expect(mount.querySelector<HTMLElement>(".inline-activity.game h3")?.textContent).toContain(words[0].word);
    expect(mount.querySelector<HTMLButtonElement>(".inline-activity.game .primary-button")?.textContent).toContain("Next game");

    await act(async () => {
      mount.querySelector<HTMLButtonElement>(".inline-activity.game .primary-button")?.click();
      await Promise.resolve();
    });

    expect(mount.querySelector(".inline-activity.game")).not.toBeNull();
    expect(mount.querySelector(".inline-activity.spell")).toBeNull();
    expect(mount.querySelector<HTMLElement>(".inline-activity.game h3")?.textContent).toContain(words[1].word);
    expect(mount.querySelector<HTMLElement>(".mission-stepper-item.active")?.textContent).toContain("Game");
  });

  it("shuffles picture game choices so the first option is not always correct", async () => {
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

    const gameStep = Array.from(mount.querySelectorAll<HTMLButtonElement>(".mission-stepper-item")).find((button) =>
      button.textContent?.includes("Game")
    );

    await act(async () => {
      gameStep?.click();
      await Promise.resolve();
    });

    await act(async () => {
      mount.querySelector<HTMLButtonElement>(".inline-activity.game .picture-choice")?.click();
      await Promise.resolve();
    });

    expect(mount.querySelector<HTMLElement>(".choice-feedback")?.textContent).toContain("Good try");
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
    expect(calls.storyText).toBe(1);
    expect(calls.storyImages).toBeGreaterThan(0);
    expect(calls.videos).toBeGreaterThan(0);
  });

  it("restarts stale in-flight reward video state after reload", async () => {
    saveApiSettings();
    const { calls } = installFetchMock();
    const words = selectMissionWords("yilin-grade3", "3A", 5, 1);
    const storedPack = buildPendingAgnesLessonPack(words, { setId: "yilin-grade3-3A-unit-1", title: "Book 3A · Unit 1" }, { id: "auto" });
    vi.spyOn(storage, "getLesson").mockResolvedValue(storedPack);
    vi.spyOn(storage, "getMastery").mockResolvedValue(createEmptyMastery(words.map((word) => word.id)));
    vi.spyOn(storage, "getVideo").mockResolvedValue({ status: "running", stage: "rendering", progress: 40, videoId: "stale-video" });
    vi.spyOn(storage, "getLearningPageState").mockResolvedValue({ screen: "learn", activeIndex: 0, spellInput: "" });
    vi.spyOn(storage, "getUnitCover").mockResolvedValue(undefined);
    vi.spyOn(storage, "getUnitStyle").mockResolvedValue({ styleId: "auto", chosenAt: Date.now() });

    const mount = document.createElement("div");
    container = mount;
    document.body.append(mount);
    root = createRoot(mount);

    await act(async () => {
      root?.render(<App />);
      await flushAsyncWork(80);
    });

    expect(mount.querySelector(".word-focus-card")).not.toBeNull();
    expect(mount.textContent).not.toContain("Sample mission is ready");
    expect(calls.storyText).toBeGreaterThan(0);
    expect(calls.videos).toBeGreaterThan(0);
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
  it("allows reward video generation in the background once a lesson has started", () => {
    const words = selectMissionWords("yilin-grade3", "3A", 5);
    const pack: LessonPack = buildSampleLessonPack(words, { setId: "yilin-grade3", title: "Book 3A" });
    const idleVideo: VideoTaskState = { status: "idle", progress: 0 };

    expect(
      canStartRewardPipeline({
        screen: "home",
        pack,
        hasApiKey: true,
        isVideoBusy: false,
        complete: false,
        video: idleVideo
      })
    ).toBe(false);

    expect(
      canStartRewardPipeline({
        screen: "learn",
        pack,
        hasApiKey: true,
        isVideoBusy: false,
        complete: false,
        video: idleVideo
      })
    ).toBe(true);

    expect(
      canStartRewardPipeline({
        screen: "learn",
        pack,
        hasApiKey: true,
        isVideoBusy: false,
        complete: false,
        video: { status: "running", stage: "rendering", progress: 40, videoId: "stale-video" }
      })
    ).toBe(true);

    expect(
      canStartRewardPipeline({
        screen: "learn",
        pack,
        hasApiKey: true,
        isVideoBusy: true,
        complete: false,
        video: { status: "running", stage: "rendering", progress: 40, videoId: "active-video" }
      })
    ).toBe(false);

    expect(
      canStartRewardPipeline({
        screen: "reward",
        pack,
        hasApiKey: true,
        isVideoBusy: false,
        complete: false,
        video: {
          status: "completed",
          progress: 100,
          promptVersion: REWARD_VIDEO_PROMPT_VERSION,
          blob: new Blob(["video"], { type: "video/mp4" })
        }
      })
    ).toBe(false);

    expect(
      canStartRewardPipeline({
        screen: "reward",
        pack,
        hasApiKey: true,
        isVideoBusy: false,
        complete: false,
        video: {
          status: "completed",
          progress: 100,
          promptVersion: REWARD_VIDEO_PROMPT_VERSION - 1,
          blob: new Blob(["old video"], { type: "video/mp4" })
        }
      })
    ).toBe(true);

    expect(
      canStartRewardPipeline({
        screen: "reward",
        pack,
        hasApiKey: true,
        isVideoBusy: false,
        complete: false,
        video: { status: "failed", progress: 90, error: "Agnes video download failed: 403" }
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
          onDeleteCovers={() => {}}
          isVideoBusy={false}
          coverCount={0}
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
      promptVersion: REWARD_VIDEO_PROMPT_VERSION,
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
          onDeleteCovers={() => {}}
          isVideoBusy={false}
          coverCount={0}
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

  it("opens cached pictures and videos from parent preview actions", () => {
    const words = selectMissionWords("yilin-grade3", "3A", 5);
    const pack = buildSampleLessonPack(words, { setId: "yilin-grade3", title: "Book 3A" });
    const video: VideoTaskState = {
      status: "completed",
      progress: 100,
      promptVersion: REWARD_VIDEO_PROMPT_VERSION,
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
          onDeleteCovers={() => {}}
          isVideoBusy={false}
          coverCount={0}
        />
      );
    });

    const previewPictures = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Preview pictures")
    );
    const previewVideo = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Preview video")
    );

    expect(previewPictures?.disabled).toBe(false);
    expect(previewVideo?.disabled).toBe(false);

    act(() => previewPictures?.click());

    const pictureDialog = mount.querySelector<HTMLElement>("[role='dialog']");
    expect(pictureDialog?.textContent).toContain(words[0].word);
    expect(pictureDialog?.querySelector("img")?.getAttribute("src")).toBe(pack.assets[0].imageUrl);

    act(() => pictureDialog?.querySelector<HTMLButtonElement>('[aria-label="Next media"]')?.click());

    const nextPictureDialog = mount.querySelector<HTMLElement>("[role='dialog']");
    expect(nextPictureDialog?.textContent).toContain(words[1].word);
    expect(nextPictureDialog?.querySelector("img")?.getAttribute("src")).toBe(pack.assets[1].imageUrl);

    act(() => mount.querySelector<HTMLButtonElement>(".media-viewer-close")?.click());
    act(() => previewVideo?.click());

    const videoDialog = mount.querySelector<HTMLElement>("[role='dialog']");
    expect(videoDialog?.textContent).toContain("Cached reward video");
    expect(videoDialog?.querySelector("video")?.getAttribute("src")).toBe(video.url);
  });

  it("opens cached covers from the parent preview action", () => {
    const cover: UnitCoverAsset = {
      setId: "yilin-grade3",
      bookId: "3A",
      unitNumber: 1,
      promptVersion: 1,
      artStyleId: "auto",
      imageBlob: new Blob(["cover"], { type: "image/png" }),
      imageUrl: "blob:unit-cover-1",
      source: "agnes",
      createdAt: 1
    };
    const secondCover: UnitCoverAsset = {
      ...cover,
      unitNumber: 2,
      imageUrl: "blob:unit-cover-2"
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
          pack={null}
          video={{ status: "idle", progress: 0 }}
          coverPreview={cover}
          coverPreviews={[cover, secondCover]}
          onSettings={() => {}}
          onProfile={() => {}}
          onParentControls={() => {}}
          onSelection={() => {}}
          onUnlock={() => {}}
          onDeletePictures={() => {}}
          onDeleteVideo={() => {}}
          onDeleteCovers={() => {}}
          isVideoBusy={false}
          coverCount={1}
        />
      );
    });

    const previewCovers = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Preview covers")
    );
    expect(previewCovers?.disabled).toBe(false);

    act(() => previewCovers?.click());

    const coverDialog = mount.querySelector<HTMLElement>("[role='dialog']");
    expect(coverDialog?.textContent).toContain("Unit 1 cover");
    expect(coverDialog?.querySelector("img")?.getAttribute("src")).toBe(cover.imageUrl);

    act(() => coverDialog?.querySelector<HTMLButtonElement>('[aria-label="Next media"]')?.click());

    const nextCoverDialog = mount.querySelector<HTMLElement>("[role='dialog']");
    expect(nextCoverDialog?.textContent).toContain("Unit 2 cover");
    expect(nextCoverDialog?.querySelector("img")?.getAttribute("src")).toBe(secondCover.imageUrl);
  });

  it("keeps transient reward video URLs in progress state until caching finishes", () => {
    const words = selectMissionWords("yilin-grade3", "3A", 5);
    const pack = buildSampleLessonPack(words, { setId: "yilin-grade3", title: "Book 3A" });
    const downloadingVideo: VideoTaskState = {
      status: "completed",
      stage: "downloading",
      progress: 90,
      url: "https://example.com/transient-reward.mp4"
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
          video={downloadingVideo}
          onSettings={() => {}}
          onProfile={() => {}}
          onParentControls={() => {}}
          onSelection={() => {}}
          onUnlock={() => {}}
          onDeletePictures={() => {}}
          onDeleteVideo={() => {}}
          onDeleteCovers={() => {}}
          isVideoBusy={true}
          coverCount={0}
        />
      );
    });

    expect(mount.querySelector(".video-cache-preview")).toBeNull();
    expect(mount.querySelector("video")).toBeNull();
    expect(mount.querySelector(".video-progress")).toBeNull();
    const videoCard = Array.from(mount.querySelectorAll<HTMLElement>(".media-cache-card")).find((card) =>
      card.querySelector("h2")?.textContent === "Cached video"
    );
    expect(videoCard?.textContent).toContain("0");
    expect(videoCard?.textContent).toContain("Reward videos");
    expect(videoCard?.textContent).not.toContain("Status");
    expect(videoCard?.textContent).not.toContain("Progress");
  });

  it("keeps parent cache cards preview-and-delete only", () => {
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
          onDeleteCovers={() => {}}
          isVideoBusy={false}
          coverCount={0}
        />
      );
    });

    const buttonText = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).map((button) => button.textContent?.trim());
    expect(buttonText.some((text) => text?.includes("Generate lesson pack"))).toBe(false);
    expect(buttonText.some((text) => text?.includes("Regenerate pictures"))).toBe(false);
    expect(buttonText.some((text) => text?.includes("Regenerate video"))).toBe(false);

    const previewPictures = buttonText.find((text) => text === "Preview pictures");
    const deletePictures = buttonText.find((text) => text === "Delete pictures");
    const previewVideo = buttonText.find((text) => text === "Preview video");
    const deleteVideo = buttonText.find((text) => text === "Delete video");
    const previewCovers = buttonText.find((text) => text === "Preview covers");
    expect(previewPictures).toBeTruthy();
    expect(deletePictures).toBeTruthy();
    expect(previewVideo).toBeTruthy();
    expect(deleteVideo).toBeTruthy();
    expect(previewCovers).toBeTruthy();
  });

  it("shows cached video count without status or progress controls", () => {
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
          onDeleteCovers={() => {}}
          isVideoBusy={false}
          coverCount={0}
        />
      );
    });

    expect(mount.textContent).not.toContain("Regenerate video");
    const idleVideoCard = Array.from(mount.querySelectorAll<HTMLElement>(".media-cache-card")).find((card) =>
      card.querySelector("h2")?.textContent === "Cached video"
    );
    expect(idleVideoCard?.textContent).toContain("0");
    expect(idleVideoCard?.textContent).toContain("Reward videos");
    expect(idleVideoCard?.textContent).not.toContain("Status");
    expect(idleVideoCard?.textContent).not.toContain("Progress");
    expect(mount.querySelector(".video-progress")).toBeNull();

    // Re-render in the completed state and verify the card reports a cached
    // video count while lesson start owns generation.
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
          video={{ status: "completed", progress: 100, url: "https://example.com/reward.mp4" }}
          onSettings={() => {}}
          onProfile={() => {}}
          onParentControls={() => {}}
          onSelection={() => {}}
          onUnlock={() => {}}
          onDeletePictures={() => {}}
          onDeleteVideo={() => {}}
          onDeleteCovers={() => {}}
          isVideoBusy={false}
          coverCount={0}
        />
      );
    });

    expect(mount.textContent).not.toContain("Regenerating...");
    const completedVideoCard = Array.from(mount.querySelectorAll<HTMLElement>(".media-cache-card")).find((card) =>
      card.querySelector("h2")?.textContent === "Cached video"
    );
    expect(completedVideoCard?.textContent).toContain("1");
    expect(completedVideoCard?.textContent).toContain("Reward videos");
    expect(completedVideoCard?.textContent).not.toContain("Status");
    expect(completedVideoCard?.textContent).not.toContain("Progress");
    expect(mount.querySelector(".video-progress")).toBeNull();

    const deleteVideo = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Delete video")
    );
    expect(deleteVideo?.disabled).toBe(false);
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
          onDeleteCovers={() => {}}
          isVideoBusy={false}
          coverCount={0}
        />
      );
    });

    const actionRows = Array.from(mount.querySelectorAll<HTMLElement>(".parent-action-row"));
    expect(actionRows).toHaveLength(3);
    const buttonCounts = actionRows.map((row) => row.querySelectorAll<HTMLButtonElement>("button").length).sort();
    expect(buttonCounts).toEqual([2, 2, 2]);
    const cacheCards = Array.from(mount.querySelectorAll<HTMLElement>(".media-cache-card"));
    const coversCard = cacheCards.find((card) => card.querySelector("h2")?.textContent === "Cached covers");
    const videoCard = cacheCards.find((card) => card.querySelector("h2")?.textContent === "Cached video");
    expect(coversCard?.textContent).not.toContain("Preview video");
    expect(videoCard?.textContent).toContain("Preview video");
    for (const row of actionRows) {
      const buttons = Array.from(row.querySelectorAll<HTMLButtonElement>("button"));
      expect(buttons.every((button) => button.classList.contains("parent-action-button"))).toBe(true);
    }
  });

  it("disables delete actions when cache records have no media", () => {
    const words = selectMissionWords("yilin-grade3", "3A", 5);
    const emptyPack: LessonPack = {
      ...buildSampleLessonPack(words, { setId: "yilin-grade3", title: "Book 3A" }),
      assets: [],
      storyScenes: []
    };
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
          pack={emptyPack}
          video={{ status: "completed", progress: 100, promptVersion: REWARD_VIDEO_PROMPT_VERSION }}
          onSettings={() => {}}
          onProfile={() => {}}
          onParentControls={() => {}}
          onSelection={() => {}}
          onUnlock={() => {}}
          onDeletePictures={() => {}}
          onDeleteVideo={() => {}}
          onDeleteCovers={() => {}}
          isVideoBusy={false}
          coverCount={0}
        />
      );
    });

    const deletePictures = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Delete pictures")
    );
    const previewPictures = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Preview pictures")
    );
    const deleteVideo = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Delete video")
    );
    const previewVideo = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Preview video")
    );
    const previewCovers = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Preview covers")
    );
    const deleteCovers = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Delete covers")
    );

    expect(previewPictures?.disabled).toBe(true);
    expect(deletePictures?.disabled).toBe(true);
    expect(previewVideo?.disabled).toBe(true);
    expect(deleteVideo?.disabled).toBe(true);
    expect(previewCovers?.disabled).toBe(true);
    expect(deleteCovers?.disabled).toBe(true);
  });

  it("resets cached unit covers from parent controls", () => {
    const onDeleteCovers = vi.fn();
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
          pack={null}
          video={{ status: "idle", progress: 0 }}
          onSettings={() => {}}
          onProfile={() => {}}
          onParentControls={() => {}}
          onSelection={() => {}}
          onUnlock={() => {}}
          onDeletePictures={() => {}}
          onDeleteVideo={() => {}}
          onDeleteCovers={onDeleteCovers}
          isVideoBusy={false}
          coverCount={bookUnits.length}
        />
      );
    });

    const deleteCovers = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Delete covers")
    );
    expect(deleteCovers?.disabled).toBe(false);

    act(() => deleteCovers?.click());

    expect(onDeleteCovers).toHaveBeenCalledTimes(1);
  });
});
