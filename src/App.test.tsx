import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { selectMissionWords } from "./data/vocabulary";
import { buildSampleLessonPack } from "./lib/lesson";
import { defaultParentControlSettings, defaultProfile, defaultSettings, defaultVocabularySelection } from "./lib/storage";
import { ParentControlScreen } from "./App";
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
          unlocked={true}
          pack={pack}
          video={video}
          onSettings={() => {}}
          onProfile={() => {}}
          onParentControls={() => {}}
          onSelection={() => {}}
          onUnlock={() => {}}
          onStart={() => {}}
          onRegeneratePictures={() => {}}
          onDeletePictures={() => {}}
          onDeleteVideo={() => {}}
          onRegenerateVideo={() => {}}
          isGenerating={false}
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

  it("uses animated busy states instead of disabling generation actions", () => {
    const words = selectMissionWords("yilin-grade3", "3A", 5);
    const pack = buildSampleLessonPack(words, { setId: "yilin-grade3", title: "Book 3A" });
    const onStart = vi.fn();
    const onRegeneratePictures = vi.fn();
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
          unlocked={true}
          pack={pack}
          video={{ status: "idle", progress: 0 }}
          onSettings={() => {}}
          onProfile={() => {}}
          onParentControls={() => {}}
          onSelection={() => {}}
          onUnlock={() => {}}
          onStart={onStart}
          onRegeneratePictures={onRegeneratePictures}
          onDeletePictures={() => {}}
          onDeleteVideo={() => {}}
          onRegenerateVideo={() => {}}
          isGenerating={true}
          isVideoBusy={false}
        />
      );
    });

    const generate = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Generating...")
    );
    const testAgnes = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Test Agnes connection")
    );
    const regenerate = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Regenerate pictures")
    );

    for (const button of [generate, testAgnes, regenerate]) {
      expect(button?.disabled).toBe(false);
      expect(button?.getAttribute("aria-disabled")).toBe("true");
      expect(button?.getAttribute("data-busy")).toBe("true");
    }

    act(() => generate?.click());
    act(() => testAgnes?.click());
    act(() => regenerate?.click());

    expect(onStart).not.toHaveBeenCalled();
    expect(onRegeneratePictures).not.toHaveBeenCalled();
  });

  it("invokes onRegenerateVideo from the cached-video card and shows a progress bar while busy", () => {
    const words = selectMissionWords("yilin-grade3", "3A", 5);
    const pack = buildSampleLessonPack(words, { setId: "yilin-grade3", title: "Book 3A" });
    const onRegenerateVideo = vi.fn();
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
          unlocked={true}
          pack={pack}
          video={{ status: "idle", progress: 0 }}
          onSettings={() => {}}
          onProfile={() => {}}
          onParentControls={() => {}}
          onSelection={() => {}}
          onUnlock={() => {}}
          onStart={() => {}}
          onRegeneratePictures={() => {}}
          onDeletePictures={() => {}}
          onDeleteVideo={() => {}}
          onRegenerateVideo={onRegenerateVideo}
          isGenerating={false}
          isVideoBusy={false}
        />
      );
    });

    const regenerateVideo = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Regenerate video")
    );
    expect(regenerateVideo).toBeTruthy();
    expect(regenerateVideo?.disabled).toBe(false);
    expect(mount.querySelector(".video-progress")).toBeNull();

    act(() => regenerateVideo?.click());
    expect(onRegenerateVideo).toHaveBeenCalledTimes(1);

    // Re-render in the busy state and verify the progress bar appears and the
    // button announces busy without becoming `disabled` (which would block the
    // existing busy-button animation).
    act(() => {
      root?.render(
        <ParentControlScreen
          settings={{ ...defaultSettings, apiKey: "agnes-key" }}
          profile={defaultProfile}
          parentControls={defaultParentControlSettings}
          selection={defaultVocabularySelection}
          vocabularySets={vocabularySets}
          unlocked={true}
          pack={pack}
          video={{ status: "running", progress: 42 }}
          onSettings={() => {}}
          onProfile={() => {}}
          onParentControls={() => {}}
          onSelection={() => {}}
          onUnlock={() => {}}
          onStart={() => {}}
          onRegeneratePictures={() => {}}
          onDeletePictures={() => {}}
          onDeleteVideo={() => {}}
          onRegenerateVideo={onRegenerateVideo}
          isGenerating={false}
          isVideoBusy={true}
        />
      );
    });

    const busyButton = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Regenerating...")
    );
    expect(busyButton?.getAttribute("data-busy")).toBe("true");
    expect(busyButton?.disabled).toBe(false);

    const progress = mount.querySelector<HTMLProgressElement>(".video-progress");
    expect(progress).not.toBeNull();
    expect(progress?.value).toBe(42);

    // Clicking while busy must not re-fire the prop.
    act(() => busyButton?.click());
    expect(onRegenerateVideo).toHaveBeenCalledTimes(1);

    const deleteVideo = Array.from(mount.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Delete video")
    );
    expect(deleteVideo?.disabled).toBe(true);
  });
});
