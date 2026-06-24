import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { selectMissionWords } from "./data/vocabulary";
import { buildSampleLessonPack } from "./lib/lesson";
import { createEmptyMastery, recordMasteryResult } from "./lib/mastery";
import { defaultParentControlSettings, defaultProfile, defaultSettings, defaultVocabularySelection } from "./lib/storage";
import App, { Notice, ParentControlScreen, SummaryScreen } from "./App";
import type { VideoTaskState, VocabularySet } from "./types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom doesn't implement URL.createObjectURL / revokeObjectURL, but the app
// uses them whenever it hydrates a pack so previews can render. Stub them
// before any test runs so component renders don't blow up.
beforeAll(() => {
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

  it("opens lesson detail before starting a unit lesson", async () => {
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

    expect(mount.textContent).toContain("are");
    expect(mount.textContent).not.toContain("Hello!");
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
