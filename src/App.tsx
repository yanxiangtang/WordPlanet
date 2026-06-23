import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronDown,
  ClipboardList,
  Gamepad2,
  Gem,
  Info,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mic,
  Pencil,
  Play,
  RefreshCcw,
  Sparkles,
  Star,
  Trash2,
  Trophy,
  Users,
  Volume2,
  X,
  type LucideIcon
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { getVocabularySet, listBookUnits, listVocabularySets, selectMissionWords } from "./data/vocabulary";
import {
  blobToDataUri,
  createAgnesVideoTask,
  fetchAgnesVideoBlob,
  pollAgnesVideo,
  testAgnesConnection,
  videoRewardPrompt
} from "./lib/agnes";
import {
  buildAgnesLessonPack,
  buildSampleLessonPack,
  collectObjectUrls,
  getWordImage,
  TEXT_FREE_ASSET_VERSION,
  withObjectUrls
} from "./lib/lesson";
import { createEmptyMastery, isMissionComplete, laneProgress, recordMasteryResult } from "./lib/mastery";
import { listenForWord, speak, speechRecognitionSupported } from "./lib/speech";
import { buildShuffledLetterTiles } from "./lib/spelling";
import { DEFAULT_STYLE_ID, getStyle, resolveStyleDescriptor, VISUAL_STYLES, type VisualStyle } from "./lib/styles";
import {
  defaultProfile,
  defaultSettings,
  defaultVocabularySelection,
  loadParentControlSettings,
  loadProfile,
  loadSettings,
  loadVocabularySelection,
  saveLearningPageState,
  saveParentControlSettings,
  saveProfile,
  saveSettings,
  saveVocabularySelection,
  storage,
  unitStorageKey
} from "./lib/storage";
import type {
  AgnesSettings,
  ChildProfile,
  LearningScreen,
  LessonPack,
  MissionMastery,
  ParentControlSettings,
  VideoTaskState,
  VocabularySelection,
  VocabularySet,
  VocabularyUnit,
  WordEntry
} from "./types";

type Screen = "setup" | LearningScreen;
const URL_SCREENS = new Set<Screen>(["home", "learn", "story", "game", "spell", "reward", "summary", "setup"]);

type UnitLessonSummary = {
  hasPack: boolean;
  hasVideo: boolean;
  hasProgress: boolean;
  complete: boolean;
};

function readScreenFromUrl(): Screen | null {
  if (typeof window === "undefined") return null;
  const page = new URLSearchParams(window.location.search).get("page");
  return page && URL_SCREENS.has(page as Screen) ? (page as Screen) : null;
}

function writeScreenToUrl(screen: Screen): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("page", screen);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

// Wait a fixed number of milliseconds; used to pace the parent-side video
// regeneration poll loop so we don't hammer Agnes' status endpoint.
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Clamp a stored selection to a set/book that still exists (vocabulary JSON
// files can change), falling back to the first available set/book.
function resolveSelection(selection: VocabularySelection): VocabularySelection {
  const sets = listVocabularySets();
  if (sets.length === 0) return selection;
  const set = sets.find((item) => item.id === selection.setId) ?? sets[0];
  const book = set.books.find((item) => item.id === selection.bookId) ?? set.books[0];
  const units = book ? listBookUnits(set.id, book.id) : [];
  const unit = units.find((item) => item.unitNumber === selection.unitNumber) ?? units[0];
  return {
    ...selection,
    setId: set.id,
    bookId: book?.id ?? selection.bookId,
    unitNumber: unit?.unitNumber ?? selection.unitNumber
  };
}

function App() {
  const [settings, setSettings] = useState<AgnesSettings>(() => (typeof window === "undefined" ? defaultSettings : loadSettings()));
  const [profile, setProfile] = useState<ChildProfile>(() => (typeof window === "undefined" ? defaultProfile : loadProfile()));
  const [parentControls, setParentControls] = useState<ParentControlSettings>(() =>
    typeof window === "undefined" ? { password: "", createdAt: null } : loadParentControlSettings()
  );
  const [parentUnlocked, setParentUnlocked] = useState(false);
  const [screen, setScreen] = useState<Screen>(() => readScreenFromUrl() ?? "home");
  const [pack, setPack] = useState<LessonPack | null>(null);
  const [selection, setSelection] = useState<VocabularySelection>(() =>
    resolveSelection(typeof window === "undefined" ? defaultVocabularySelection : loadVocabularySelection())
  );
  const vocabularySets = useMemo<VocabularySet[]>(() => listVocabularySets(), []);
  const bookUnits = useMemo(
    () => listBookUnits(selection.setId, selection.bookId),
    [selection.setId, selection.bookId]
  );
  const missionWords = useMemo(
    () => selectMissionWords(selection.setId, selection.bookId, selection.wordsPerMission, selection.unitNumber),
    [selection.setId, selection.bookId, selection.unitNumber, selection.wordsPerMission]
  );
  const missionTitle = useMemo(() => {
    const set = getVocabularySet(selection.setId);
    const book = set?.books.find((item) => item.id === selection.bookId);
    const unit = bookUnits.find((item) => item.unitNumber === selection.unitNumber);
    return [book?.name ?? set?.name, unit ? `Unit ${unit.unitNumber}: ${unit.title}` : null].filter(Boolean).join(" · ") || "Word Planet";
  }, [bookUnits, selection.setId, selection.bookId, selection.unitNumber]);
  const lessonMeta = useMemo(
    () => ({ setId: `${selection.setId}-${selection.bookId}-unit-${selection.unitNumber}`, title: missionTitle }),
    [selection.setId, selection.bookId, selection.unitNumber, missionTitle]
  );
  const activeUnitKey = useMemo(() => unitStorageKey(selection), [selection.setId, selection.bookId, selection.unitNumber]);
  const [mastery, setMastery] = useState<MissionMastery>(() => createEmptyMastery(missionWords.map((word) => word.id)));
  const [video, setVideo] = useState<VideoTaskState>({ status: "idle", progress: 0 });
  const [unitSummaries, setUnitSummaries] = useState<Record<number, UnitLessonSummary>>({});
  const [detailUnitNumber, setDetailUnitNumber] = useState<number>(selection.unitNumber);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isGenerating, setGenerating] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState(() =>
    settings.apiKey.trim().length > 0
      ? ""
      : "Sample mission is ready. Add an Agnes key when you want generated images and video."
  );
  const [spellInput, setSpellInput] = useState("");
  const [speechMessage, setSpeechMessage] = useState("");
  const [isVideoBusy, setIsVideoBusy] = useState(false);

  // Object URLs for cached image/video Blobs are minted here so we can revoke
  // them in one place. Every code path that swaps `pack` or replaces the video
  // blob must route through replacePackUrls / replaceVideoUrl — otherwise the
  // old URLs leak until page unload (each one is GC-rooted by the browser).
  const objectUrlsRef = useRef<string[]>([]);
  const videoUrlRef = useRef<string | null>(null);
  const videoPollRef = useRef<{ cancelled: boolean } | null>(null);

  function replacePackUrls(nextPack: LessonPack | null) {
    for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
    objectUrlsRef.current = nextPack ? collectObjectUrls(nextPack) : [];
  }

  function replaceVideoUrl(nextUrl: string | null) {
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    videoUrlRef.current = nextUrl;
  }

  function cancelVideoPoll() {
    if (videoPollRef.current) videoPollRef.current.cancelled = true;
    videoPollRef.current = null;
  }

  async function loadUnitState(nextSelection: VocabularySelection, restorePage: boolean) {
    const key = unitStorageKey(nextSelection);
    const words = selectMissionWords(
      nextSelection.setId,
      nextSelection.bookId,
      nextSelection.wordsPerMission,
      nextSelection.unitNumber
    );
    const emptyMastery = createEmptyMastery(words.map((word) => word.id));

    cancelVideoPoll();
    replacePackUrls(null);
    replaceVideoUrl(null);
    setPack(null);
    setMastery(emptyMastery);
    setVideo({ status: "idle", progress: 0 });
    setActiveIndex(0);
    setSpellInput("");

    try {
      const [storedPack, storedMastery, storedVideo, storedPage] = await Promise.all([
        storage.getLesson(key),
        storage.getMastery(key),
        storage.getVideo(key),
        storage.getLearningPageState(key)
      ]);

      if (storedPack?.assetPromptVersion === TEXT_FREE_ASSET_VERSION) {
        const hydrated = withObjectUrls(storedPack);
        replacePackUrls(hydrated);
        setPack(hydrated);
      }
      if (storedMastery) setMastery(storedMastery);
      if (storedVideo) {
        if (storedVideo.blob) {
          const objUrl = URL.createObjectURL(storedVideo.blob);
          replaceVideoUrl(objUrl);
          setVideo({ ...storedVideo, url: objUrl });
        } else {
          setVideo(storedVideo);
        }
      }
      const urlScreen = readScreenFromUrl();
      if (restorePage && urlScreen) {
        setScreen(urlScreen);
      } else if (restorePage && storedPage) {
        setActiveIndex(Math.min(storedPage.activeIndex, Math.max(words.length - 1, 0)));
        setSpellInput(storedPage.spellInput);
        setScreen(storedPage.screen);
      } else {
        setScreen("home");
      }
    } catch {
      setScreen(restorePage ? readScreenFromUrl() ?? "home" : "home");
      setNotice("Browser storage was unavailable, so this unit will use memory only.");
    }
  }

  async function refreshUnitSummaries(targetSelection = selection) {
    const units = listBookUnits(targetSelection.setId, targetSelection.bookId);
    const entries = await Promise.all(
      units.map(async (unit) => {
        const key = unitStorageKey({ ...targetSelection, unitNumber: unit.unitNumber });
        try {
          const [storedPack, storedMastery, storedVideo] = await Promise.all([
            storage.getLesson(key),
            storage.getMastery(key),
            storage.getVideo(key)
          ]);
          return [
            unit.unitNumber,
            {
              hasPack: Boolean(storedPack),
              hasVideo: storedVideo?.status === "completed" && Boolean(storedVideo.blob || storedVideo.url),
              hasProgress: Boolean(storedMastery && Object.values(storedMastery).some((word) =>
                Object.values(word).some((lane) => lane.correct > 0 || lane.wrong > 0 || lane.completed)
              )),
              complete: storedMastery ? isMissionComplete(storedMastery) : false
            }
          ] as const;
        } catch {
          return [
            unit.unitNumber,
            { hasPack: false, hasVideo: false, hasProgress: false, complete: false }
          ] as const;
        }
      })
    );
    setUnitSummaries(Object.fromEntries(entries));
  }

  const activeWord = pack?.words[activeIndex] ?? missionWords[activeIndex];
  const dashboardPack = pack ?? buildSampleLessonPack(missionWords, lessonMeta);
  const missionReady = Boolean(pack);
  const complete = useMemo(() => isMissionComplete(mastery), [mastery]);
  const hasApiKey = settings.apiKey.trim().length > 0;
  const currentUnitSummary = useMemo<UnitLessonSummary>(
    () => ({
      hasPack: Boolean(pack),
      hasVideo: video.status === "completed" && Boolean(video.blob || video.url),
      hasProgress: Object.values(mastery).some((word) =>
        Object.values(word).some((lane) => lane.correct > 0 || lane.wrong > 0 || lane.completed)
      ),
      complete
    }),
    [complete, mastery, pack, video.blob, video.status, video.url]
  );
  const effectiveUnitSummaries = useMemo(
    () => ({ ...unitSummaries, [selection.unitNumber]: currentUnitSummary }),
    [currentUnitSummary, selection.unitNumber, unitSummaries]
  );

  // Resolve the kid's chosen visual style into the descriptor Agnes receives.
  // "auto" rotates a style per practice group via pickArtStyle; a curated id
  // fixes the look; a non-empty free-text note overrides the curated descriptor
  // (sanitized inside resolveStyleDescriptor).
  const missionSeed = useMemo(() => missionWords.map((word) => word.id).join("-"), [missionWords]);
  const visualStyle = useMemo<{ id: string; descriptor: string; note?: string }>(
    () => ({
      id: profile.visualStyleId ?? DEFAULT_STYLE_ID,
      descriptor: resolveStyleDescriptor(profile.visualStyleId, profile.visualStyleNote, missionSeed),
      note: profile.visualStyleNote
    }),
    [profile.visualStyleId, profile.visualStyleNote, missionSeed]
  );
  const currentStyleLabel = getStyle(profile.visualStyleId ?? DEFAULT_STYLE_ID)?.label ?? "Surprise Me";
  const currentStyleEmoji = getStyle(profile.visualStyleId ?? DEFAULT_STYLE_ID)?.emoji ?? "🎲";

  // A style pick that would throw away already-generated Agnes media must be
  // confirmed before regenerating (regen costs API credits). When set, the
  // ConfirmStyleChange modal is shown; null means no confirmation pending.
  const [pendingStyle, setPendingStyle] = useState<{ id: string; note?: string; label: string } | null>(null);
  const [stylePickerOpen, setStylePickerOpen] = useState(false);

  // A short celebratory overlay shown when the kid finishes an activity before
  // the next one opens — turns the Story→Game→Spelling→Video rail into a
  // journey rather than a panel swap. Cleared by a timeout after the cheer.
  const [celebration, setCelebration] = useState<{ cheer: string } | null>(null);
  const celebrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function transitionWithCheer(cheer: string, next: Screen) {
    if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
    setCelebration({ cheer });
    celebrationTimerRef.current = setTimeout(() => {
      setCelebration(null);
      celebrationTimerRef.current = null;
      setScreen(next);
    }, 1100);
  }

  useEffect(() => {
    let active = true;
    async function hydrate() {
      await loadUnitState(selection, true);
      if (!active) return;
      await refreshUnitSummaries(selection);
      if (active) setHydrated(true);
    }
    hydrate();
    return () => {
      active = false;
    };
  }, []);

  // Revoke every cached-media object URL when the app unmounts. The body runs
  // once thanks to the empty dep array; running it inside the hydration effect
  // would revoke URLs on Strict-Mode double-invokes and break image rendering.
  useEffect(
    () => () => {
      replacePackUrls(null);
      replaceVideoUrl(null);
      cancelVideoPoll();
      if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (!hydrated) return;
    writeScreenToUrl(screen);
    if (screen === "setup") return;
    const pageState = {
      screen,
      activeIndex,
      spellInput
    };
    saveLearningPageState(pageState);
    storage.saveLearningPageState(pageState, activeUnitKey).catch(() => {});
  }, [activeIndex, activeUnitKey, hydrated, screen, spellInput]);

  function persistSettings(next: AgnesSettings) {
    setSettings(next);
    saveSettings(next);
  }

  function persistSelection(next: VocabularySelection) {
    const resolved = resolveSelection(next);
    setSelection(resolved);
    saveVocabularySelection(resolved);
  }

  async function switchToUnit(next: VocabularySelection, openDetail = true) {
    const resolved = resolveSelection(next);
    persistSelection(resolved);
    setDetailUnitNumber(resolved.unitNumber);
    await loadUnitState(resolved, false);
    await refreshUnitSummaries(resolved);
    const unit = listBookUnits(resolved.setId, resolved.bookId).find((item) => item.unitNumber === resolved.unitNumber);
    setNotice(openDetail && unit ? `Lesson detail ready: Unit ${unit.unitNumber} ${unit.title}.` : "Lesson book updated.");
  }

  function persistProfile(next: ChildProfile) {
    setProfile(next);
    saveProfile(next);
  }

  function persistParentControls(next: ParentControlSettings) {
    setParentControls(next);
    saveParentControlSettings(next);
  }

  async function persistMastery(next: MissionMastery) {
    setMastery(next);
    await storage.saveMastery(next, activeUnitKey);
    await refreshUnitSummaries();
  }

  async function startMission(forceSample = false, nextScreen: Screen = "home"): Promise<LessonPack | null> {
    if (isGenerating) return null;
    setGenerating(true);
    cancelVideoPoll();
    setNotice(forceSample || !hasApiKey ? "Loading the built-in sample mission." : "Asking Agnes to generate your lesson images.");
    try {
      const nextPack =
        hasApiKey && !forceSample
          ? await buildAgnesLessonPack(missionWords, settings, lessonMeta, visualStyle)
          : buildSampleLessonPack(missionWords, lessonMeta, { id: visualStyle.id, note: visualStyle.note });
      const nextMastery = createEmptyMastery(nextPack.words.map((word) => word.id));
      replacePackUrls(nextPack);
      replaceVideoUrl(null);
      setPack(nextPack);
      setMastery(nextMastery);
      setVideo({ status: "idle", progress: 0 });
      setActiveIndex(0);
      setScreen(nextScreen);
      await Promise.all([
        storage.saveLesson(nextPack, activeUnitKey),
        storage.saveMastery(nextMastery, activeUnitKey),
        storage.saveVideo({ status: "idle", progress: 0 }, activeUnitKey)
      ]);
      await refreshUnitSummaries();
      setNotice(nextPack.source === "agnes" ? "Agnes lesson pack saved in this browser." : "Sample mission saved in this browser.");
      return nextPack;
    } catch (error) {
      const fallback = buildSampleLessonPack(missionWords, lessonMeta, { id: visualStyle.id, note: visualStyle.note });
      replacePackUrls(fallback);
      setPack(fallback);
      setMastery(createEmptyMastery(fallback.words.map((word) => word.id)));
      setVideo({ status: "idle", progress: 0 });
      setScreen(nextScreen);
      await storage.saveLesson(fallback, activeUnitKey);
      await refreshUnitSummaries();
      setNotice(error instanceof Error ? `${error.message}. Loaded sample mission instead.` : "Loaded sample mission instead.");
      return fallback;
    } finally {
      setGenerating(false);
    }
  }

  // Re-generate the current mission's pictures in a new visual style WITHOUT
  // resetting mastery — the kid keeps their Story/Game/Spelling progress. Used
  // by the style-change "Redraw now" confirmation. Mirrors the generation shape
  // of startMission but preserves activeIndex/mastery.
  async function regeneratePictures() {
    if (isGenerating) return;
    if (!hasApiKey) return;
    setGenerating(true);
    setNotice("Redrawing your pictures in the new style.");
    try {
      const nextPack = await buildAgnesLessonPack(missionWords, settings, lessonMeta, visualStyle);
      replacePackUrls(nextPack);
      setPack(nextPack);
      setActiveIndex((value) => Math.min(value, Math.max(nextPack.words.length - 1, 0)));
      await storage.saveLesson(nextPack, activeUnitKey);
      await refreshUnitSummaries();
      setNotice("Pictures redrawn in your new style.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not redraw pictures.");
    } finally {
      setGenerating(false);
    }
  }

  // Apply a style the kid just picked. If real Agnes media already exists for
  // the current pack, surface a confirmation modal (regen costs credits) before
  // redrawing; otherwise just persist the pick — the next mission uses it.
  function applyStylePick(id: string, note?: string) {
    const label = getStyle(id)?.label ?? "Surprise Me";
    const styleChanged = id !== (profile.visualStyleId ?? DEFAULT_STYLE_ID) || (note ?? "") !== (profile.visualStyleNote ?? "");
    persistProfile({ ...profile, visualStyleId: id, visualStyleNote: note });
    setStylePickerOpen(false);
    if (!styleChanged) return;
    const hasGeneratedMedia = pack?.source === "agnes" || (video.status === "completed" && Boolean(video.blob || video.url));
    if (hasGeneratedMedia && hasApiKey) {
      setPendingStyle({ id, note, label });
    } else {
      setNotice(`Style set to ${label}. Your next mission will use it.`);
    }
  }

  async function deleteCachedPictures() {
    try {
      await storage.deleteLesson(activeUnitKey);
      replacePackUrls(null);
      setPack(null);
      setActiveIndex(0);
      setScreen("home");
      await refreshUnitSummaries();
      setNotice("Selected unit pictures were cleared. Progress was kept.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete cached pictures.");
    }
  }

  async function deleteCachedVideo() {
    const idleVideo: VideoTaskState = { status: "idle", progress: 0 };
    try {
      cancelVideoPoll();
      await storage.deleteVideo(activeUnitKey);
      replaceVideoUrl(null);
      setVideo(idleVideo);
      setIsVideoBusy(false);
      await refreshUnitSummaries();
      setNotice("Selected unit reward video was cleared. Progress was kept.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete cached video.");
    }
  }

  async function mark(word: WordEntry, lane: "meaning" | "say" | "write", correct: boolean) {
    const next = recordMasteryResult(mastery, word.id, lane, correct);
    await persistMastery(next);
  }

  async function checkSpeech(word: WordEntry) {
    if (!speechRecognitionSupported()) {
      setSpeechMessage("Microphone scoring is not available in this browser. Listen and repeat still counts as practice.");
      await mark(word, "say", true);
      return;
    }

    setSpeechMessage("Listening...");
    try {
      const result = await listenForWord(word.word);
      setSpeechMessage(result.matched ? `Nice! I heard "${result.transcript}".` : `I heard "${result.transcript}". Try once more.`);
      await mark(word, "say", result.matched);
    } catch (error) {
      setSpeechMessage(error instanceof Error ? error.message : "Could not hear clearly.");
      await mark(word, "say", false);
    }
  }

  async function handleSpell(word: WordEntry) {
    const correct = spellInput.trim().toLowerCase() === word.word.toLowerCase();
    await mark(word, "write", correct);
    setSpellInput("");
    setNotice(correct ? `Great spelling: ${word.word}!` : `Good try. The word is ${word.word}.`);
  }

  async function startVideoReward() {
    if (!pack) return;
    if (!hasApiKey) {
      setVideo({
        status: "completed",
        progress: 100,
        url: undefined,
        error: "Sample reward: add an Agnes key to generate a real video."
      });
      return;
    }

    try {
      // Agnes expects the seed image as a data URI string — blob: URLs are
      // tab-scoped and won't fetch over HTTP. Re-encode the cached Blob.
      const seedDataUri = pack.assets[0]?.imageBlob
        ? await blobToDataUri(pack.assets[0].imageBlob)
        : undefined;
      const task = await createAgnesVideoTask(settings, videoRewardPrompt(pack, visualStyle.descriptor), seedDataUri);
      setVideo(task);
      await storage.saveVideo(task, activeUnitKey);
      await refreshUnitSummaries();
      setNotice("Video reward task created. You can poll while Agnes works.");
    } catch (error) {
      const failed = {
        status: "failed" as const,
        progress: 0,
        error: error instanceof Error ? error.message : "Video generation failed."
      };
      setVideo(failed);
      await storage.saveVideo(failed, activeUnitKey);
      await refreshUnitSummaries();
    }
  }

  async function pollVideoReward() {
    if (!video.videoId) return;
    try {
      const next = await pollAgnesVideo(settings, video.videoId);
      if (next.status === "completed" && next.url) {
        // Capture the bytes before Agnes' CDN URL rotates — without this the
        // cached entry would 404 the next time the kid opens the reward.
        const blob = await fetchAgnesVideoBlob(next.url);
        const objUrl = URL.createObjectURL(blob);
        replaceVideoUrl(objUrl);
        const final: VideoTaskState = { ...next, blob, url: objUrl };
        setVideo(final);
        await storage.saveVideo(final, activeUnitKey);
        await refreshUnitSummaries();
      } else {
        setVideo(next);
        await storage.saveVideo(next, activeUnitKey);
        await refreshUnitSummaries();
      }
    } catch (error) {
      setVideo({
        ...video,
        status: "failed",
        error: error instanceof Error ? error.message : "Could not poll video."
      });
    }
  }

  function needsRewardVideo(): boolean {
    return video.status === "idle" || video.status === "failed" || (video.status === "completed" && !video.url && !video.blob);
  }

  // Lesson-start auto-generation variant: creates a fresh video task and walks
  // the Agnes status endpoint until it completes or fails, downloading the bytes
  // on success. Cancellation tokens unwind cleanly when the parent deletes the
  // video, switches vocabulary, or unmounts the app mid-poll.
  async function generateRewardVideoForPack(targetPack: LessonPack) {
    if (isVideoBusy) return;
    if (!hasApiKey) {
      return;
    }

    cancelVideoPoll();
    const token = { cancelled: false };
    videoPollRef.current = token;
    setIsVideoBusy(true);

    try {
      setNotice("Asking Agnes to generate the reward video…");
      const seedDataUri = targetPack.assets[0]?.imageBlob
        ? await blobToDataUri(targetPack.assets[0].imageBlob)
        : undefined;
      const task = await createAgnesVideoTask(settings, videoRewardPrompt(targetPack, visualStyle.descriptor), seedDataUri);
      if (token.cancelled) return;

      const queued: VideoTaskState = { ...task, blob: undefined, url: undefined };
      setVideo(queued);
      await storage.saveVideo(queued, activeUnitKey);

      const videoId = task.videoId;
      if (!videoId) throw new Error("Agnes did not return a video id.");

      // Poll every ~5s. Each loop body checks the cancellation flag after each
      // await so a Delete or vocab-change interrupts within one tick.
      while (!token.cancelled) {
        await sleep(5000);
        if (token.cancelled) return;
        const next = await pollAgnesVideo(settings, videoId);
        if (token.cancelled) return;

        if (next.status === "completed" && next.url) {
          setNotice("Downloading reward video…");
          const blob = await fetchAgnesVideoBlob(next.url);
          if (token.cancelled) return;
          const objUrl = URL.createObjectURL(blob);
          replaceVideoUrl(objUrl);
          const final: VideoTaskState = { ...next, blob, url: objUrl };
          setVideo(final);
          await storage.saveVideo(final, activeUnitKey);
          await refreshUnitSummaries();
          setNotice("Reward video cached.");
          return;
        }
        if (next.status === "failed") {
          setVideo(next);
          await storage.saveVideo(next, activeUnitKey);
          await refreshUnitSummaries();
          setNotice(next.error ?? "Reward video generation failed.");
          return;
        }
        // Still queued/running — surface progress without keeping a stale URL.
        setVideo({ ...next, blob: undefined, url: undefined });
      }
    } catch (error) {
      if (!token.cancelled) {
        const message = error instanceof Error ? error.message : "Reward video failed.";
        setVideo((prev) => ({ ...prev, status: "failed", progress: prev.progress ?? 0, error: message }));
        setNotice(message);
      }
    } finally {
      if (videoPollRef.current === token) videoPollRef.current = null;
      setIsVideoBusy(false);
    }
  }

  async function beginLesson() {
    let lessonPack = pack;
    if (!lessonPack) {
      lessonPack = await startMission(false, "learn");
    } else {
      setScreen("learn");
    }
    if (lessonPack && needsRewardVideo()) {
      void generateRewardVideoForPack(lessonPack);
    }
  }

  async function chooseLessonUnit(unitNumber: number) {
    await switchToUnit({ ...selection, unitNumber }, true);
  }

  const isLessonPicker = screen === "home";

  return (
    <div className={`app-shell theme-${profile.gender} ${isLessonPicker ? "lesson-picker-shell" : ""}`}>
      <TopBar
        profile={profile}
        missionTitle={missionTitle}
        styleEmoji={currentStyleEmoji}
        styleLabel={currentStyleLabel}
        compact={isLessonPicker}
        onPickStyle={() => setStylePickerOpen(true)}
        onSetup={() => setScreen("setup")}
      />
      <main className="main-stage">
        {screen === "setup" ? (
          <section className="setup-panel">
            <div className="setup-status-row">
              <Notice text={notice} />
              {isGenerating && <RequestSpinner label="Working on your mission…" />}
            </div>
            <ParentControlScreen
              settings={settings}
              profile={profile}
              parentControls={parentControls}
              selection={selection}
              vocabularySets={vocabularySets}
              bookUnits={bookUnits}
              unitSummaries={effectiveUnitSummaries}
              unlocked={parentUnlocked}
              pack={pack}
              video={video}
              onSettings={persistSettings}
              onProfile={persistProfile}
              onParentControls={persistParentControls}
              onSelection={(next) => void switchToUnit(next, false)}
              onUnlock={() => setParentUnlocked(true)}
              onDeletePictures={deleteCachedPictures}
              onDeleteVideo={deleteCachedVideo}
              isVideoBusy={isVideoBusy}
            />
            <button className="secondary-button setup-back" onClick={() => setScreen("home")}>
              Return to Learning
              <ArrowRight size={18} />
            </button>
          </section>
        ) : (
          <MissionDashboard
            pack={dashboardPack}
            units={bookUnits}
            selection={selection}
            unitSummaries={effectiveUnitSummaries}
            settings={settings}
            mastery={mastery}
            video={video}
            activeIndex={activeIndex}
            activeWord={activeWord}
            profile={profile}
            screen={screen}
            spellInput={spellInput}
            speechMessage={speechMessage}
            complete={complete}
            isGenerating={isGenerating}
            missionReady={missionReady}
            notice={notice}
            celebration={celebration}
            onGenerate={beginLesson}
            onSample={() => startMission(true, screen === "home" ? "learn" : "home")}
            onSelectUnit={(unitNumber) => void chooseLessonUnit(unitNumber)}
            onBackWord={() => setActiveIndex((value) => Math.max(0, value - 1))}
            onNextWord={() => setActiveIndex((value) => Math.min(dashboardPack.words.length - 1, value + 1))}
            onMarkMeaning={() => mark(activeWord, "meaning", true)}
            onSay={() => checkSpeech(activeWord)}
            onStory={() => setScreen("story")}
            onGame={() => setScreen("game")}
            onSpell={() => setScreen("spell")}
            onReward={() => setScreen("reward")}
            onSummary={() => setScreen("summary")}
            onHome={() => setScreen("home")}
            onInput={setSpellInput}
            onCheckSpell={() => handleSpell(activeWord)}
            onCreateVideo={startVideoReward}
            onPollVideo={pollVideoReward}
            onGameAnswer={(word, correct) => mark(word, "meaning", correct)}
            onStoryContinue={() => transitionWithCheer("Story complete!", "game")}
            onGameContinue={() => transitionWithCheer("Great matching!", "spell")}
            onSpellContinue={() => transitionWithCheer("Super spelling!", "reward")}
            onRewardSummary={() => transitionWithCheer("Mission complete! 🎉", "summary")}
          />
        )}
      </main>
      {stylePickerOpen && (
        <VisualStylePicker
          currentId={profile.visualStyleId ?? DEFAULT_STYLE_ID}
          currentNote={profile.visualStyleNote}
          onClose={() => setStylePickerOpen(false)}
          onApply={(id, note) => applyStylePick(id, note)}
        />
      )}
      {pendingStyle && (
        <ConfirmStyleChange
          label={pendingStyle.label}
          hasVideo={Boolean(video.status === "completed" && (video.blob || video.url))}
          onCancel={() => setPendingStyle(null)}
          onApplyNext={() => {
            setPendingStyle(null);
            setNotice(`Style set to ${pendingStyle.label}. Your next mission will use it.`);
          }}
          onRedraw={() => {
            setPendingStyle(null);
            void regeneratePictures();
          }}
        />
      )}
    </div>
  );
}

function MissionDashboard({
  pack,
  units,
  selection,
  unitSummaries,
  settings,
  mastery,
  video,
  activeIndex,
  activeWord,
  profile,
  screen,
  spellInput,
  speechMessage,
  complete,
  isGenerating,
  missionReady,
  notice,
  onGenerate,
  onSample,
  onSelectUnit,
  onBackWord,
  onNextWord,
  onMarkMeaning,
  onSay,
  onStory,
  onGame,
  onSpell,
  onReward,
  onSummary,
  onHome,
  onInput,
  onCheckSpell,
  onCreateVideo,
  onPollVideo,
  onGameAnswer,
  onStoryContinue,
  onGameContinue,
  onSpellContinue,
  onRewardSummary,
  celebration
}: {
  pack: LessonPack;
  units: VocabularyUnit[];
  selection: VocabularySelection;
  unitSummaries: Record<number, UnitLessonSummary>;
  settings: AgnesSettings;
  mastery: MissionMastery;
  video: VideoTaskState;
  activeIndex: number;
  activeWord: WordEntry;
  profile: ChildProfile;
  screen: Screen;
  spellInput: string;
  speechMessage: string;
  complete: boolean;
  isGenerating: boolean;
  missionReady: boolean;
  notice: string;
  onGenerate: () => void;
  onSample: () => void;
  onSelectUnit: (unitNumber: number) => void;
  onBackWord: () => void;
  onNextWord: () => void;
  onMarkMeaning: () => void;
  onSay: () => void;
  onStory: () => void;
  onGame: () => void;
  onSpell: () => void;
  onReward: () => void;
  onSummary: () => void;
  onHome: () => void;
  onInput: (value: string) => void;
  onCheckSpell: () => void;
  onCreateVideo: () => void;
  onPollVideo: () => void;
  onGameAnswer: (word: WordEntry, correct: boolean) => void;
  onStoryContinue: () => void;
  onGameContinue: () => void;
  onSpellContinue: () => void;
  onRewardSummary: () => void;
  celebration: { cheer: string } | null;
}) {
  const showLessonBoard = screen === "home";
  return (
    <section className="mission-dashboard" aria-label="Word Planet mission dashboard">
      <div className="dashboard-notice-row">
        <Notice text={notice} />
        {isGenerating && <RequestSpinner label="Working on your mission…" />}
      </div>

      {showLessonBoard ? (
        <LessonBoard
          units={units}
          selection={selection}
          summaries={unitSummaries}
          words={pack.words}
          missionReady={missionReady}
          isGenerating={isGenerating}
          onSelectUnit={onSelectUnit}
          onStart={onGenerate}
          onSample={onSample}
        />
      ) : (
        <>
          <div className="learning-hero">
            <section className="picture-panel">
              <div className="picture-toolbar">
                <button className="icon-button" onClick={onBackWord} disabled={activeIndex === 0} aria-label="Previous word">
                  <ChevronLeft />
                </button>
                <span>{activeIndex + 1} / {pack.words.length}</span>
              </div>
              <img src={getWordImage(pack, activeWord.id)} alt={`${activeWord.word} illustration`} />
            </section>

            <CurrentWordPanel
              word={activeWord}
              settings={settings}
              onNext={onNextWord}
              onMarkMeaning={onMarkMeaning}
              onSay={onSay}
              speechMessage={speechMessage}
            />

            <ProgressPanel mastery={mastery} />
          </div>

          <ActivityRail
            pack={pack}
            activeWord={activeWord}
            settings={settings}
            mastery={mastery}
            screen={screen}
            video={video}
            complete={complete}
            missionReady={missionReady}
            spellInput={spellInput}
            onGenerate={onGenerate}
            onSample={onSample}
            onStory={onStory}
            onGame={onGame}
            onSpell={onSpell}
            onReward={onReward}
            onSummary={onSummary}
            onHome={onHome}
            onInput={onInput}
            onCheckSpell={onCheckSpell}
            onCreateVideo={onCreateVideo}
            onPollVideo={onPollVideo}
            onGameAnswer={onGameAnswer}
            onStoryContinue={onStoryContinue}
            onGameContinue={onGameContinue}
            onSpellContinue={onSpellContinue}
            onRewardSummary={onRewardSummary}
          />
        </>
      )}

      {!showLessonBoard && (
        <MissionDock
          active={screen}
          complete={complete}
          missionReady={missionReady}
          video={video}
          onLearn={onHome}
          onStory={onStory}
          onGame={missionReady ? onGame : onGenerate}
          onSpell={onSpell}
          onReward={onReward}
          onSummary={onSummary}
        />
      )}
      {celebration && <CelebrationOverlay cheer={celebration.cheer} />}
    </section>
  );
}

function unitStatusLabel(summary?: UnitLessonSummary): string {
  if (summary?.complete) return "Complete";
  if (summary?.hasProgress || summary?.hasPack || summary?.hasVideo) return "In progress";
  return "Not started";
}

function compactUnitStatusLabel(summary?: UnitLessonSummary): string {
  if (summary?.complete) return "Done";
  if (summary?.hasProgress || summary?.hasPack || summary?.hasVideo) return "Started";
  return "New";
}

function LessonBoard({
  units,
  selection,
  summaries,
  words,
  missionReady,
  isGenerating,
  onSelectUnit,
  onStart,
  onSample
}: {
  units: VocabularyUnit[];
  selection: VocabularySelection;
  summaries: Record<number, UnitLessonSummary>;
  words: WordEntry[];
  missionReady: boolean;
  isGenerating: boolean;
  onSelectUnit: (unitNumber: number) => void;
  onStart: () => void;
  onSample: () => void;
}) {
  const selectedUnit = units.find((unit) => unit.unitNumber === selection.unitNumber);
  const selectedSummary = summaries[selection.unitNumber];
  const selectedStatus = unitStatusLabel(selectedSummary);

  return (
    <section className="lesson-board" aria-label="Choose a lesson">
      <div className="lesson-board-header">
        <div>
          <h2>Choose a lesson</h2>
          <p>Pick a unit, preview the words, then start when you are ready.</p>
        </div>
        <span className="lesson-count">{units.length} units</span>
      </div>

      <div className="lesson-unit-grid">
        {units.map((unit) => {
          const summary = summaries[unit.unitNumber];
          const selected = unit.unitNumber === selection.unitNumber;
          return (
            <button
              key={unit.unitNumber}
              className={`lesson-unit-card ${selected ? "selected" : ""}`}
              type="button"
              aria-label={`Unit ${unit.unitNumber}: ${unit.title}. ${unit.wordCount} words. ${unitStatusLabel(summary)}. ${
                summary?.hasPack ? "Pictures saved" : "Pictures needed"
              }. ${summary?.hasVideo ? "Video saved" : "Video later"}.`}
              onClick={() => onSelectUnit(unit.unitNumber)}
            >
              <span className="lesson-unit-number">Unit {unit.unitNumber}</span>
              <strong>{unit.title}</strong>
              <span className="lesson-card-meta">
                <small>{unit.wordCount} words</small>
                <span className={`lesson-status ${unitStatusLabel(summary).toLowerCase().replace(" ", "-")}`}>
                  {compactUnitStatusLabel(summary)}
                </span>
              </span>
              <span className="lesson-media-dots" aria-hidden="true">
                <span className={`media-dot ${summary?.hasPack ? "saved" : ""}`} />
                <span className={`media-dot video ${summary?.hasVideo ? "saved" : ""}`} />
              </span>
            </button>
          );
        })}
      </div>

      <section className="lesson-detail-panel" aria-label="Lesson detail">
        <div>
          <span className="detail-kicker">Lesson detail</span>
          <h3>
            Unit {selectedUnit?.unitNumber ?? selection.unitNumber}
            {selectedUnit ? `: ${selectedUnit.title}` : ""}
          </h3>
          <p>{selectedStatus} · {words.length} mission words</p>
        </div>
        <div className="lesson-word-preview">
          {words.map((word) => (
            <span key={word.id}>{word.word}</span>
          ))}
        </div>
        <div className="button-row">
          <button
            className={`primary-button ${isGenerating ? "busy-button" : ""}`}
            type="button"
            onClick={() => {
              if (!isGenerating) onStart();
            }}
            aria-disabled={isGenerating}
            data-busy={isGenerating ? "true" : undefined}
          >
            {missionReady ? "Resume Lesson" : isGenerating ? "Starting..." : "Start Lesson"}
            <ArrowRight size={18} />
          </button>
          <button
            className={`secondary-button ${isGenerating ? "busy-button" : ""}`}
            type="button"
            onClick={() => {
              if (!isGenerating) onSample();
            }}
            aria-disabled={isGenerating}
            data-busy={isGenerating ? "true" : undefined}
          >
            Use Sample Mission
          </button>
        </div>
      </section>
    </section>
  );
}

function CurrentWordPanel({
  word,
  settings,
  onNext,
  onMarkMeaning,
  onSay,
  speechMessage
}: {
  word: WordEntry;
  settings: AgnesSettings;
  onNext: () => void;
  onMarkMeaning: () => void;
  onSay: () => void;
  speechMessage: string;
}) {
  return (
    <section className="word-focus-card">
      <span className="new-badge">
        <Star size={20} fill="currentColor" />
        New
      </span>
      <h2>{word.word}</h2>
      <p className="meaning">{word.meaningZh}</p>
      <div className="word-audio-row">
        <button className="audio-orb" onClick={() => speak(word.word, 1)} aria-label={`Listen to ${word.word}`}>
          <Volume2 />
        </button>
        <button className="slow-chip" onClick={() => speak(word.word, 0.65)}>
          <span>🐢</span>
          慢速播放
        </button>
      </div>
      <button className="say-button" onClick={onSay}>
        <Mic size={19} />
        Say this word
      </button>
      {speechMessage && <p className="speech-message">{speechMessage}</p>}
      <div className="sentence-box">
        <button className="mini-sound" onClick={() => speak(word.example, 1)}>
          <Volume2 size={16} />
        </button>
        <span>{word.example}</span>
        <small>{word.exampleZh}</small>
      </div>
      <div className="button-row centered">
        <button className="secondary-button" onClick={onMarkMeaning}>
          I know it
        </button>
        <button className="primary-button" onClick={onNext}>
          Next
          <ArrowRight size={18} />
        </button>
      </div>
    </section>
  );
}

function ActivityRail({
  pack,
  activeWord,
  settings,
  mastery,
  screen,
  video,
  complete,
  missionReady,
  spellInput,
  onGenerate,
  onSample,
  onStory,
  onGame,
  onSpell,
  onReward,
  onSummary,
  onHome,
  onInput,
  onCheckSpell,
  onCreateVideo,
  onPollVideo,
  onGameAnswer,
  onStoryContinue,
  onGameContinue,
  onSpellContinue,
  onRewardSummary
}: {
  pack: LessonPack;
  activeWord: WordEntry;
  settings: AgnesSettings;
  mastery: MissionMastery;
  screen: Screen;
  video: VideoTaskState;
  complete: boolean;
  missionReady: boolean;
  spellInput: string;
  onGenerate: () => void;
  onSample: () => void;
  onStory: () => void;
  onGame: () => void;
  onSpell: () => void;
  onReward: () => void;
  onSummary: () => void;
  onHome: () => void;
  onInput: (value: string) => void;
  onCheckSpell: () => void;
  onCreateVideo: () => void;
  onPollVideo: () => void;
  onGameAnswer: (word: WordEntry, correct: boolean) => void;
  onStoryContinue: () => void;
  onGameContinue: () => void;
  onSpellContinue: () => void;
  onRewardSummary: () => void;
}) {
  return (
    <section className="activity-rail" aria-label="Mission activities">
      <ActivityCard
        number={1}
        tone="story"
        title="Story Quest"
        subtitle="故事探险"
        image={pack.storyScenes[0]?.imageUrl ?? getWordImage(pack, activeWord.id)}
        caption="帮助小宇找到借阅的书籍"
        buttonText="开始故事"
        onClick={onStory}
        completed={screen !== "home"}
      />
      <ActivityCard
        number={2}
        tone="game"
        title="Picture Game"
        subtitle="图片挑战"
        image={getWordImage(pack, pack.words[1]?.id ?? activeWord.id)}
        caption={`Which one is a ${activeWord.word}?`}
        buttonText={missionReady ? "开始游戏" : "开始课程"}
        onClick={missionReady ? onGame : onGenerate}
        completed={screen === "spell" || screen === "reward" || screen === "summary"}
      />
      <ActivityCard
        number={3}
        tone="spell"
        title="Spelling Time"
        subtitle="拼写练习"
        word={activeWord.word}
        caption="听音拼出正确单词"
        buttonText="开始拼写"
        onClick={onSpell}
        completed={screen === "reward" || screen === "summary"}
      />
      <ActivityCard
        number={4}
        tone="video"
        title="Video Time"
        subtitle="观看视频"
        image={pack.storyScenes[1]?.imageUrl ?? getWordImage(pack, activeWord.id)}
        caption="完成获得奖励！"
        buttonText="观看视频"
        onClick={onReward}
        completed={video.status === "completed"}
      />

      {screen === "story" && <StoryQuestInline pack={pack} onContinue={onStoryContinue} />}
      {screen === "game" && <PictureGameInline pack={pack} onAnswer={onGameAnswer} onContinue={onGameContinue} />}
      {screen === "spell" && (
        <SpellingInline
          word={activeWord}
          settings={settings}
          spellInput={spellInput}
          onInput={onInput}
          onCheck={onCheckSpell}
          onContinue={onSpellContinue}
        />
      )}
      {screen === "reward" && (
        <RewardInline
          complete={complete}
          video={video}
          onCreate={onCreateVideo}
          onPoll={onPollVideo}
          onSummary={onRewardSummary}
          onSample={onSample}
        />
      )}
      {screen === "summary" && <SummaryScreen mastery={mastery} onContinue={onHome} onPracticeAgain={onSpell} />}
    </section>
  );
}

function ActivityCard({
  number,
  tone,
  title,
  subtitle,
  image,
  word,
  caption,
  buttonText,
  completed,
  onClick
}: {
  number: number;
  tone: "story" | "game" | "spell" | "video";
  title: string;
  subtitle: string;
  image?: string;
  word?: string;
  caption?: string;
  buttonText: string;
  completed: boolean;
  onClick: () => void;
}) {
  return (
    <article className={`activity-card ${tone}`}>
      <div className="activity-title">
        <b>{number}</b>
        <span>{title}</span>
        <small>{subtitle}</small>
      </div>
      <div className="activity-preview">
        {word ? (
          <div className="spell-preview">
            <strong>{word}</strong>
            <Volume2 size={21} />
            <div>
              {word.split("").map((letter, index) => (
                <span key={`${letter}-${index}`}>{letter}</span>
              ))}
            </div>
          </div>
        ) : (
          image && <img src={image} alt={`${title} preview`} />
        )}
        {tone === "video" && (
          <span className="play-ring">
            <Play fill="currentColor" />
          </span>
        )}
        {completed && (
          <span className="done-dot">
            <Check />
          </span>
        )}
      </div>
      <p>{caption}</p>
      <button className="activity-button" onClick={onClick}>
        {buttonText}
        <ArrowRight size={18} />
      </button>
    </article>
  );
}

function StoryQuestInline({ pack, onContinue }: { pack: LessonPack; onContinue: () => void }) {
  const scene = pack.storyScenes[0];
  return (
    <div className="inline-activity story">
      <img src={scene.imageUrl} alt={scene.title} />
      <div>
        <h3>{scene.title}</h3>
        <p>{scene.text}</p>
        <small>{scene.textZh}</small>
        <button className="primary-button" onClick={onContinue}>
          Start Picture Game
          <Gamepad2 size={18} />
        </button>
      </div>
    </div>
  );
}

function PictureGameInline({
  pack,
  onAnswer,
  onContinue
}: {
  pack: LessonPack;
  onAnswer: (word: WordEntry, correct: boolean) => void;
  onContinue: () => void;
}) {
  const target = pack.words[0];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedCorrect = selectedId === target.id;

  function choose(word: WordEntry) {
    setSelectedId(word.id);
    onAnswer(target, word.id === target.id);
  }

  return (
    <div className="inline-activity game">
      <div>
        <h3>Which one is a {target.word}?</h3>
        <div className="mini-choice-grid">
          {pack.words.slice(0, 3).map((word, index) => (
            <button className="picture-choice" key={word.id} onClick={() => choose(word)}>
              <img src={getWordImage(pack, word.id)} alt={`picture choice ${index + 1}`} />
              <span>Choice {index + 1}</span>
              {selectedId === word.id && selectedCorrect && <Check className="choice-check" />}
            </button>
          ))}
        </div>
        {selectedId && (
          <p className="choice-feedback">{selectedCorrect ? "Nice picture match!" : "Good try. Look at the picture clue again."}</p>
        )}
        <button className="primary-button" onClick={onContinue}>
          Go to Spelling
          <Pencil size={18} />
        </button>
      </div>
    </div>
  );
}

function SpellingInline({
  word,
  settings,
  spellInput,
  onInput,
  onCheck,
  onContinue
}: {
  word: WordEntry;
  settings: AgnesSettings;
  spellInput: string;
  onInput: (value: string) => void;
  onCheck: () => void;
  onContinue: () => void;
}) {
  const tiles = useMemo(() => buildShuffledLetterTiles(word.word), [word.word]);
  const [selectedTiles, setSelectedTiles] = useState<string[]>([]);

  useEffect(() => {
    setSelectedTiles([]);
    onInput("");
  }, [onInput, word.id]);

  function selectTile(tileId: string, letter: string) {
    if (selectedTiles.includes(tileId) || spellInput.length >= word.word.length) return;
    setSelectedTiles((current) => [...current, tileId]);
    onInput(`${spellInput}${letter}`);
  }

  function clearAnswer() {
    setSelectedTiles([]);
    onInput("");
  }

  return (
    <div className="inline-activity spell">
      <div>
        <h3>Type the English word for {word.meaningZh}</h3>
        <button className="secondary-button" onClick={() => speak(word.word, 1)}>
          <Volume2 size={18} />
          Hear word
        </button>
        <input
          className="spell-input"
          value={spellInput}
          onChange={(event) => {
            setSelectedTiles([]);
            onInput(event.target.value);
          }}
          placeholder="_ _ _ _ _ _ _"
        />
        <div className="letter-bank">
          {tiles.map((tile) => (
            <button
              key={tile.id}
              type="button"
              onClick={() => selectTile(tile.id, tile.letter)}
              disabled={selectedTiles.includes(tile.id)}
            >
              {tile.letter}
            </button>
          ))}
        </div>
        <div className="button-row spelling-actions">
          <button className="primary-button" onClick={onCheck}>Check</button>
          <button className="secondary-button" onClick={clearAnswer} type="button">Clear</button>
          <button className="finish-button" onClick={onContinue}>
            Unlock Video Reward
            <Play size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

function RewardInline({
  complete,
  video,
  onCreate,
  onPoll,
  onSummary,
  onSample
}: {
  complete: boolean;
  video: VideoTaskState;
  onCreate: () => void;
  onPoll: () => void;
  onSummary: () => void;
  onSample: () => void;
}) {
  return (
    <div className="inline-activity reward">
      {video.url ? (
        <video controls src={video.url} />
      ) : (
        <div className="video-placeholder">
          <Play size={58} />
          <span>{video.error ?? (complete ? "Video status: ready" : "Practice is still open")}</span>
        </div>
      )}
      <div className="button-row centered">
        <button className="primary-button" onClick={onCreate}>Create reward</button>
        <button className="secondary-button" onClick={onPoll} disabled={!video.videoId || video.status === "completed"}>Poll video</button>
        <button className="secondary-button" onClick={onSummary}>Summary</button>
        <button className="secondary-button" onClick={onSample}>Reload sample</button>
      </div>
    </div>
  );
}

type MissionDockItem = {
  id: "learn" | "story" | "game" | "spell" | "reward" | "summary";
  label: string;
  detail: string;
  icon: LucideIcon;
  completed: boolean;
  disabled?: boolean;
  onClick: () => void;
};

function MissionDock({
  active,
  complete,
  missionReady,
  video,
  onLearn,
  onStory,
  onGame,
  onSpell,
  onReward,
  onSummary
}: {
  active: Screen;
  complete: boolean;
  missionReady: boolean;
  video: VideoTaskState;
  onLearn: () => void;
  onStory: () => void;
  onGame: () => void;
  onSpell: () => void;
  onReward: () => void;
  onSummary: () => void;
}) {
  const activeStep = active === "home" || active === "learn" ? "learn" : active;
  const items: MissionDockItem[] = [
    {
      id: "learn",
      label: "Learn",
      detail: "Words",
      icon: BookOpen,
      completed: active !== "home" && active !== "learn",
      onClick: onLearn
    },
    {
      id: "story",
      label: "Story",
      detail: missionReady ? "Quest" : "Load first",
      icon: ClipboardList,
      completed: ["game", "spell", "reward", "summary"].includes(active),
      disabled: !missionReady,
      onClick: onStory
    },
    {
      id: "game",
      label: "Game",
      detail: missionReady ? "Picture" : "Start",
      icon: Gamepad2,
      completed: ["spell", "reward", "summary"].includes(active),
      onClick: onGame
    },
    {
      id: "spell",
      label: "Spell",
      detail: "Letters",
      icon: Pencil,
      completed: ["reward", "summary"].includes(active),
      disabled: !missionReady,
      onClick: onSpell
    },
    {
      id: "reward",
      label: "Reward",
      detail: video.status === "completed" ? "Ready" : "Video",
      icon: Play,
      completed: video.status === "completed" || active === "summary",
      disabled: !missionReady,
      onClick: onReward
    },
    {
      id: "summary",
      label: "Summary",
      detail: complete ? "Done" : "Locked",
      icon: Trophy,
      completed: complete,
      disabled: !complete && active !== "reward" && active !== "summary",
      onClick: onSummary
    }
  ];

  return (
    <nav className="mission-dock" aria-label="Mission steps">
      {items.map((item, index) => {
        const Icon = item.icon;
        const status = item.id === activeStep ? "active" : item.completed ? "complete" : item.disabled ? "locked" : "ready";
        return (
          <button
            key={item.id}
            className={`mission-dock-item ${status}`}
            onClick={item.onClick}
            disabled={item.disabled}
            aria-current={item.id === activeStep ? "step" : undefined}
          >
            <span className="dock-step">{item.completed ? <Check size={16} /> : index + 1}</span>
            <Icon className="dock-icon" />
            <span className="dock-copy">
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function TopBar({
  profile,
  missionTitle,
  styleEmoji,
  styleLabel,
  compact,
  onPickStyle,
  onSetup
}: {
  profile: ChildProfile;
  missionTitle: string;
  styleEmoji: string;
  styleLabel: string;
  compact: boolean;
  onPickStyle: () => void;
  onSetup: () => void;
}) {
  return (
    <header className="top-bar">
      <div className="brand-mark">
        <div className="planet-face">🌍</div>
        <div>
          <h1>Word Planet</h1>
          <strong>单词星球</strong>
        </div>
      </div>
      <div className="mission-pill">
        <BookOpen size={42} />
        <span>Mission</span>
        <strong>{missionTitle}</strong>
      </div>
      <div className="top-actions">
        {!compact && (
          <>
            <button className="style-chip" onClick={onPickStyle} aria-label={`Visual style: ${styleLabel}. Tap to change.`}>
              <span className="style-chip-emoji">{styleEmoji}</span>
              <span className="style-chip-label">{styleLabel}</span>
              <Sparkles size={15} />
            </button>
            <span className="star-pill">
              <Star size={19} fill="currentColor" /> 120
            </span>
            <span className="star-pill gem-pill">
              <Gem size={18} fill="currentColor" /> 25
            </span>
          </>
        )}
        <button className="avatar-button" onClick={onSetup}>
          <span className="avatar-face">{profile.gender === "girl" ? "👧" : "👦"}</span>
          <span>{profile.nickname}</span>
          <ChevronDown size={18} />
        </button>
      </div>
    </header>
  );
}

function Notice({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="notice">
      <Sparkles size={18} />
      {text}
    </div>
  );
}

function RequestSpinner({ label }: { label: string }) {
  return (
    <div className="request-spinner" role="status" aria-live="polite">
      <Loader2 size={18} className="spin" />
      <span>{label}</span>
    </div>
  );
}

// Kid-facing visual style picker. A grid of curated "world" looks plus a
// free-text "describe your world" field. Confirming calls onApply with the
// chosen id and (optionally) the sanitized note; the App decides whether to
// regenerate immediately or queue the change for the next mission.
function VisualStylePicker({
  currentId,
  currentNote,
  onClose,
  onApply
}: {
  currentId: string;
  currentNote?: string;
  onClose: () => void;
  onApply: (id: string, note?: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(currentId);
  const [note, setNote] = useState(currentNote ?? "");

  return (
    <div className="media-viewer-backdrop" role="presentation" onClick={onClose}>
      <section
        className="media-viewer style-picker"
        role="dialog"
        aria-modal="true"
        aria-label="Choose your visual style"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="media-viewer-header">
          <h2>Choose your world ✨</h2>
          <button className="media-viewer-close" type="button" aria-label="Close style picker" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="style-picker-body">
          <p className="style-picker-hint">Pick a look for your pictures and videos. You can change it any time.</p>
          <div className="style-grid">
            {VISUAL_STYLES.map((style) => (
              <button
                key={style.id}
                type="button"
                className={`style-card ${selectedId === style.id ? "selected" : ""}`}
                onClick={() => setSelectedId(style.id)}
                aria-pressed={selectedId === style.id}
              >
                <span className="style-card-emoji">{style.emoji}</span>
                <span className="style-card-label">{style.label}</span>
              </button>
            ))}
          </div>
          <label className="style-freetext">
            <span>Describe your world (optional)</span>
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. dancing dinosaurs at a party"
              maxLength={80}
            />
            <small>Keep it kind and kid-friendly. Your words shape the pictures.</small>
          </label>
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={() => onApply(DEFAULT_STYLE_ID, undefined)}>
              Surprise Me
            </button>
            <button className="primary-button" type="button" onClick={() => onApply(selectedId, note.trim() ? note : undefined)}>
              Use this style
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

// Shown when a style change would discard already-generated Agnes media.
// Redraw now spends credits to refresh immediately; Apply next mission keeps
// the current media and uses the new style on the next lesson.
function ConfirmStyleChange({
  label,
  hasVideo,
  onCancel,
  onApplyNext,
  onRedraw
}: {
  label: string;
  hasVideo: boolean;
  onCancel: () => void;
  onApplyNext: () => void;
  onRedraw: () => void;
}) {
  return (
    <div className="media-viewer-backdrop" role="presentation" onClick={onCancel}>
      <section
        className="media-viewer style-confirm"
        role="dialog"
        aria-modal="true"
        aria-label="Confirm style change"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="media-viewer-header">
          <h2>Switch to {label}?</h2>
        </div>
        <div className="style-confirm-body">
          <p>
            We&apos;ll redraw your pictures{hasVideo ? " and video" : ""} in the new style. This uses your Agnes credits.
          </p>
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={onApplyNext}>
              Apply next mission
            </button>
            <button className="primary-button" type="button" onClick={onRedraw}>
              Redraw now
              <RefreshCcw size={18} />
            </button>
          </div>
          <button className="link-button" type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}

// Brief full-stage cheer between activities. Pure CSS animation — no new deps.
function CelebrationOverlay({ cheer }: { cheer: string }) {
  return (
    <div className="celebration-overlay" role="status" aria-live="polite">
      <div className="celebration-burst" aria-hidden="true">
        <Star size={34} fill="currentColor" />
        <Sparkles size={28} />
        <Star size={22} fill="currentColor" />
      </div>
      <p className="celebration-cheer">{cheer}</p>
    </div>
  );
}

type TestState = { status: "idle" | "testing" | "ok" | "error"; message?: string };

function TestRow({
  label,
  state,
  busy = false,
  disabled,
  onTest
}: {
  label: string;
  state: TestState;
  busy?: boolean;
  disabled: boolean;
  onTest: () => void;
}) {
  const testing = state.status === "testing";
  const unavailable = disabled;
  const working = busy || testing;
  return (
    <div className="test-row">
      <button
        className={`secondary-button test-button ${working ? "busy-button" : ""}`}
        type="button"
        onClick={() => {
          if (!unavailable && !working) onTest();
        }}
        disabled={unavailable}
        aria-disabled={working || unavailable}
        data-busy={working ? "true" : undefined}
      >
        {working ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
        {label}
      </button>
      {state.status === "ok" && (
        <span className="test-status ok">
          <Check size={16} />
          {state.message}
        </span>
      )}
      {state.status === "error" && <span className="test-status error">✗ {state.message}</span>}
    </div>
  );
}

type MediaViewerState =
  | {
      type: "image";
      title: string;
      src: string;
      alt: string;
    }
  | {
      type: "video";
      title: string;
      src: string;
    };

export function ParentControlScreen({
  settings,
  profile,
  parentControls,
  selection,
  vocabularySets,
  bookUnits,
  unitSummaries,
  unlocked,
  pack,
  video,
  onSettings,
  onProfile,
  onParentControls,
  onSelection,
  onUnlock,
  onDeletePictures,
  onDeleteVideo,
  isVideoBusy
}: {
  settings: AgnesSettings;
  profile: ChildProfile;
  parentControls: ParentControlSettings;
  selection: VocabularySelection;
  vocabularySets: VocabularySet[];
  bookUnits: VocabularyUnit[];
  unitSummaries: Record<number, UnitLessonSummary>;
  unlocked: boolean;
  pack: LessonPack | null;
  video: VideoTaskState;
  onSettings: (settings: AgnesSettings) => void;
  onProfile: (profile: ChildProfile) => void;
  onParentControls: (settings: ParentControlSettings) => void;
  onSelection: (selection: VocabularySelection) => void;
  onUnlock: () => void;
  onDeletePictures: () => void;
  onDeleteVideo: () => void;
  isVideoBusy: boolean;
}) {
  const [agnesTest, setAgnesTest] = useState<TestState>({ status: "idle" });
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [mediaViewer, setMediaViewer] = useState<MediaViewerState | null>(null);
  const hasPassword = parentControls.password.trim().length > 0;

  async function runTest(setState: (state: TestState) => void, action: () => Promise<void>) {
    setState({ status: "testing" });
    try {
      await action();
      setState({ status: "ok", message: "Connected" });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Test failed" });
    }
  }

  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = passwordInput.trim();
    if (!value) {
      setPasswordMessage("Please enter a simple parent password.");
      return;
    }
    if (!hasPassword) {
      onParentControls({
        password: value,
        createdAt: Date.now()
      });
      setPasswordInput("");
      setPasswordMessage("");
      onUnlock();
      return;
    }
    if (value === parentControls.password) {
      setPasswordInput("");
      setPasswordMessage("");
      onUnlock();
      return;
    }
    setPasswordMessage("Password did not match.");
  }

  if (!unlocked) {
    return (
      <section className="setup-card parent-gate">
        <div className="parent-gate-icon">
          <LockKeyhole size={34} />
        </div>
        <h2>{hasPassword ? "Parent controls" : "Create parent password"}</h2>
        <p className="fine-print">
          {hasPassword
            ? "Enter the browser-local parent password to manage generated media and Agnes settings."
            : "Choose a simple browser-local password before opening parent controls."}
        </p>
        <form className="parent-password-form" onSubmit={submitPassword}>
          <label>
            Password
            <input
              type="password"
              autoComplete={hasPassword ? "current-password" : "new-password"}
              value={passwordInput}
              onChange={(event) => setPasswordInput(event.target.value)}
              placeholder={hasPassword ? "Enter password" : "Create password"}
            />
          </label>
          {passwordMessage && <p className="parent-error">{passwordMessage}</p>}
          <button className="primary-button" type="submit">
            <KeyRound size={18} />
            {hasPassword ? "Unlock" : "Create and unlock"}
          </button>
        </form>
      </section>
    );
  }

  const imageCount = pack?.assets.length ?? 0;
  const storyCount = pack?.storyScenes.length ?? 0;
  const videoReady = video.status === "completed" && Boolean(video.url);
  const cachedPictures = pack
    ? [
        ...pack.assets.map((asset) => {
          const word = pack.words.find((item) => item.id === asset.wordId);
          const label = word?.word ?? asset.wordId;
          return {
            id: `word-${asset.wordId}`,
            title: label,
            src: asset.imageUrl,
            alt: `Cached picture for ${label}`
          };
        }),
        ...pack.storyScenes.map((scene) => ({
          id: `story-${scene.id}`,
          title: scene.title,
          src: scene.imageUrl,
          alt: `Cached story scene ${scene.title}`
        }))
      ]
    : [];

  return (
    <div className="setup-grid">
      <section className="setup-card">
        <h2>Kid info</h2>
        <label>
          Child nickname
          <input value={profile.nickname} onChange={(event) => onProfile({ ...profile, nickname: event.target.value })} />
        </label>
        <label>
          Age
          <select
            value={profile.age}
            onChange={(event) => onProfile({ ...profile, age: Number(event.target.value) })}
          >
            {[8, 9, 10, 11].map((age) => (
              <option key={age} value={age}>
                {age}
              </option>
            ))}
          </select>
        </label>
        <div className="profile-toggle" role="group" aria-label="Choose kid theme">
          <button
            className={profile.gender === "girl" ? "selected" : ""}
            type="button"
            onClick={() => onProfile({ ...profile, gender: "girl" })}
          >
            Girl
          </button>
          <button
            className={profile.gender === "boy" ? "selected" : ""}
            type="button"
            onClick={() => onProfile({ ...profile, gender: "boy" })}
          >
            Boy
          </button>
        </div>
        <p className="fine-print">Theme changes the look only. Words and learning checks stay the same.</p>
      </section>

      <section className="setup-card">
        <h2>
          <BookOpen size={24} />
          Vocabulary
        </h2>
        <label>
          Vocabulary set
          <select
            value={selection.setId}
            onChange={(event) => {
              const set = vocabularySets.find((item) => item.id === event.target.value);
              onSelection({
                ...selection,
                setId: event.target.value,
                bookId: set?.books[0]?.id ?? selection.bookId,
                unitNumber: 1
              });
            }}
          >
            {vocabularySets.map((set) => (
              <option key={set.id} value={set.id}>
                {set.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Book
          <select value={selection.bookId} onChange={(event) => onSelection({ ...selection, bookId: event.target.value, unitNumber: 1 })}>
            {(vocabularySets.find((item) => item.id === selection.setId)?.books ?? []).map((book) => (
              <option key={book.id} value={book.id}>
                {book.name} ({book.wordCount} words)
              </option>
            ))}
          </select>
        </label>
        <div className="parent-unit-board" aria-label="Unit lesson status">
          {bookUnits.map((unit) => {
            const selected = unit.unitNumber === selection.unitNumber;
            const summary = unitSummaries[unit.unitNumber];
            return (
              <button
                key={unit.unitNumber}
                className={`parent-unit-chip ${selected ? "selected" : ""}`}
                type="button"
                onClick={() => onSelection({ ...selection, unitNumber: unit.unitNumber })}
              >
                <strong>Unit {unit.unitNumber}</strong>
                <span>{unit.title}</span>
                <small>{unitStatusLabel(summary)}</small>
              </button>
            );
          })}
        </div>
        <label>
          Words per mission
          <select
            value={selection.wordsPerMission}
            onChange={(event) => onSelection({ ...selection, wordsPerMission: Number(event.target.value) })}
          >
            {[5, 8, 10].map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>
        <p className="fine-print">Changing the set or book starts a fresh mission word list.</p>
      </section>

      <section className="setup-card">
        <h2>Agnes API</h2>
        <label>
          API key
          <input
            type="password"
            placeholder="Paste Agnes key for personal demo use"
            value={settings.apiKey}
            onChange={(event) => onSettings({ ...settings, apiKey: event.target.value })}
          />
        </label>
        <label>
          Base URL
          <input value={settings.baseUrl} onChange={(event) => onSettings({ ...settings, baseUrl: event.target.value })} />
        </label>
        <div className="settings-row">
          <label>
            Image model
            <input value={settings.imageModel} onChange={(event) => onSettings({ ...settings, imageModel: event.target.value })} />
          </label>
          <label>
            Video model
            <input value={settings.videoModel} onChange={(event) => onSettings({ ...settings, videoModel: event.target.value })} />
          </label>
        </div>
        <TestRow
          label="Test Agnes connection"
          state={agnesTest}
          disabled={!settings.apiKey.trim()}
          onTest={() => runTest(setAgnesTest, () => testAgnesConnection(settings))}
        />
        <p className="fine-print">Pronunciation uses your browser's built-in voice.</p>
      </section>

      <section className="setup-card media-cache-card">
        <h2>Cached pictures</h2>
        <div className="cache-stat-grid">
          <span>
            <strong>{pack ? "Saved" : "Not saved"}</strong>
            Lesson pack
          </span>
          <span>
            <strong>{imageCount}</strong>
            Word pictures
          </span>
          <span>
            <strong>{storyCount}</strong>
            Story scenes
          </span>
          <span>
            <strong>{pack?.source ?? "sample"}</strong>
            Source
          </span>
        </div>
        {cachedPictures.length > 0 && (
          <div className="cache-preview-grid" aria-label="Cached picture previews">
            {cachedPictures.map((picture) => (
              <button
                className="cache-preview-button"
                key={picture.id}
                type="button"
                onClick={() => setMediaViewer({ type: "image", title: picture.title, src: picture.src, alt: picture.alt })}
              >
                <img src={picture.src} alt={picture.alt} />
                <span>{picture.title}</span>
              </button>
            ))}
          </div>
        )}
        <div className="button-row cache-actions parent-action-row">
          <button className="secondary-button danger-button parent-action-button" type="button" onClick={onDeletePictures} disabled={!pack}>
            <Trash2 size={18} />
            Delete pictures
          </button>
        </div>
      </section>

      <section className="setup-card media-cache-card">
        <h2>Cached video</h2>
        <div className="cache-stat-grid">
          <span>
            <strong>{video.status}</strong>
            Status
          </span>
          <span>
            <strong>{video.progress}%</strong>
            Progress
          </span>
        </div>
        {video.url ? (
          <div className="video-cache-preview">
            <video controls src={video.url} />
            <button
              className="secondary-button video-open-button"
              type="button"
              onClick={() => setMediaViewer({ type: "video", title: "Cached reward video", src: video.url ?? "" })}
            >
              <Play size={18} />
              Open video
            </button>
          </div>
        ) : (
          <div className="video-cache-empty">{video.error ?? "No cached reward video yet."}</div>
        )}
        {isVideoBusy && (
          <progress
            className="video-progress"
            max={100}
            value={video.progress}
            aria-label="Reward video generation progress"
          />
        )}
        <div className="button-row cache-actions parent-action-row">
          <button
            className="secondary-button danger-button parent-action-button"
            type="button"
            onClick={onDeleteVideo}
            disabled={isVideoBusy || (!videoReady && video.status === "idle")}
          >
            <Trash2 size={18} />
            Delete video
          </button>
        </div>
      </section>
      {mediaViewer && (
        <div className="media-viewer-backdrop" role="presentation" onClick={() => setMediaViewer(null)}>
          <section
            className="media-viewer"
            role="dialog"
            aria-modal="true"
            aria-label={mediaViewer.title}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="media-viewer-header">
              <h2>{mediaViewer.title}</h2>
              <button className="media-viewer-close" type="button" aria-label="Close media viewer" onClick={() => setMediaViewer(null)}>
                <X size={20} />
              </button>
            </div>
            {mediaViewer.type === "image" ? (
              <img src={mediaViewer.src} alt={mediaViewer.alt} />
            ) : (
              <video controls autoPlay src={mediaViewer.src} />
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function HomeScreen({
  pack,
  isGenerating,
  onGenerate,
  onSample,
  onBegin
}: {
  pack: LessonPack | null;
  isGenerating: boolean;
  onGenerate: () => void;
  onSample: () => void;
  onBegin: () => void;
}) {
  return (
    <div className="home-screen">
      <div>
        <h2>Today’s mission words</h2>
        <p>Learn, listen, say, write, then unlock a video reward.</p>
      </div>
      <div className="word-strip">
        {(pack?.words ?? []).map((word) => (
          <span key={word.id}>{word.word}</span>
        ))}
      </div>
      <div className="button-row">
        <button
          className={`primary-button ${isGenerating ? "busy-button" : ""}`}
          onClick={() => {
            if (!isGenerating) (pack ? onBegin : onGenerate)();
          }}
          aria-disabled={isGenerating}
          data-busy={isGenerating ? "true" : undefined}
        >
          {pack ? "Start Adventure" : isGenerating ? "Starting..." : "Start Lesson"}
          <ArrowRight size={18} />
        </button>
        <button
          className={`secondary-button ${isGenerating ? "busy-button" : ""}`}
          onClick={() => {
            if (!isGenerating) onSample();
          }}
          aria-disabled={isGenerating}
          data-busy={isGenerating ? "true" : undefined}
        >
          Use Sample Mission
        </button>
      </div>
    </div>
  );
}

function ProgressPanel({ mastery }: { mastery: MissionMastery }) {
  return (
    <div className="progress-panel">
      <h3>
        单词掌握进度
        <Info size={18} />
      </h3>
      <MasteryRow icon={<BookOpen />} label="Meaning" hint="含义理解" lane="meaning" mastery={mastery} color="green" />
      <MasteryRow icon={<Mic />} label="Say" hint="发音跟读" lane="say" mastery={mastery} color="blue" />
      <MasteryRow icon={<Pencil />} label="Write" hint="拼写默写" lane="write" mastery={mastery} color="orange" />
    </div>
  );
}

function MasteryRow({
  icon,
  label,
  hint,
  lane,
  mastery,
  color
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  lane: "meaning" | "say" | "write";
  mastery: MissionMastery;
  color: "green" | "blue" | "orange";
}) {
  const progress = laneProgress(mastery, lane);
  const percent = progress.total ? (progress.completed / progress.total) * 100 : 0;
  return (
    <div className={`mastery-row ${color}`}>
      <div className="mastery-icon">{icon}</div>
      <div>
        <strong>{label} <span>{hint}</span></strong>
        <div className="meter">
          <span style={{ width: `${percent}%` }} />
        </div>
        <small>再完成 {Math.max(progress.total - progress.completed, 0)} 题就能获得星星！</small>
      </div>
      <b><Star size={18} fill="currentColor" /> {progress.completed}/{progress.total}</b>
    </div>
  );
}

function LearnScreen({
  pack,
  settings,
  word,
  activeIndex,
  onBack,
  onNext,
  onMarkMeaning,
  onSay,
  speechMessage
}: {
  pack: LessonPack;
  settings: AgnesSettings;
  word: WordEntry;
  activeIndex: number;
  onBack: () => void;
  onNext: () => void;
  onMarkMeaning: () => void;
  onSay: () => void;
  speechMessage: string;
}) {
  return (
    <div className="lesson-grid">
      <section className="image-card">
        <div className="card-toolbar">
          <button className="icon-button" onClick={onBack}>
            <ChevronLeft />
          </button>
          <span>{activeIndex + 1} / {pack.words.length}</span>
        </div>
        <img src={getWordImage(pack, word.id)} alt={`${word.word} illustration`} />
      </section>

      <section className="word-card">
        <span className="new-badge">⭐ New</span>
        <h2>{word.word}</h2>
        <p className="meaning">{word.meaningZh}</p>
        <div className="sound-actions">
          <button className="round-action" onClick={() => speak(word.word, 1)}>
            <Volume2 />
            Listen
          </button>
          <button className="secondary-button" onClick={() => speak(word.word, 0.65)}>
            Slow
          </button>
        </div>
        <button className="say-button" onClick={onSay}>
          <Mic size={19} />
          Say this word
        </button>
        {speechMessage && <p className="speech-message">{speechMessage}</p>}
        <div className="sentence-box">
          <button className="mini-sound" onClick={() => speak(word.example, 1)}>
            <Volume2 size={16} />
          </button>
          <span>{word.example}</span>
          <small>{word.exampleZh}</small>
        </div>
        <div className="button-row centered">
          <button className="secondary-button" onClick={onMarkMeaning}>
            I know it
          </button>
          <button className="primary-button" onClick={onNext}>
            Next
            <ArrowRight size={18} />
          </button>
        </div>
      </section>
    </div>
  );
}

function StoryScreen({ pack, onContinue }: { pack: LessonPack; onContinue: () => void }) {
  return (
    <div className="activity-screen">
      <h2>Story Quest 故事探险</h2>
      <div className="scene-grid">
        {pack.storyScenes.map((scene) => (
          <article className="scene-card" key={scene.id}>
            <img src={scene.imageUrl} alt={scene.title} />
            <h3>{scene.title}</h3>
            <p>{scene.text}</p>
            <small>{scene.textZh}</small>
          </article>
        ))}
      </div>
      <button className="primary-button" onClick={onContinue}>
        Start Picture Game
        <Gamepad2 size={18} />
      </button>
    </div>
  );
}

function GameScreen({
  pack,
  onAnswer,
  onContinue
}: {
  pack: LessonPack;
  onAnswer: (word: WordEntry, correct: boolean) => void;
  onContinue: () => void;
}) {
  const target = pack.words[0];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedCorrect = selectedId === target.id;

  function choose(word: WordEntry) {
    const correct = word.id === target.id;
    setSelectedId(word.id);
    onAnswer(target, correct);
  }

  return (
    <div className="activity-screen">
      <h2>Picture Game 图片挑战</h2>
      <p>Which one is a <strong>{target.word}</strong>?</p>
      <div className="choice-grid">
        {pack.words.slice(0, 3).map((word, index) => (
          <button className="picture-choice" key={word.id} onClick={() => choose(word)}>
            <img src={getWordImage(pack, word.id)} alt={`picture choice ${index + 1}`} />
            <span>Choice {index + 1}</span>
            {selectedId === word.id && selectedCorrect && <Check className="choice-check" />}
          </button>
        ))}
      </div>
      {selectedId && (
        <p className="choice-feedback">{selectedCorrect ? "Nice picture match!" : "Good try. Look at the picture clue again."}</p>
      )}
      <button className="primary-button" onClick={onContinue}>
        Go to Spelling
        <Pencil size={18} />
      </button>
    </div>
  );
}

function SpellScreen({
  pack,
  settings,
  activeWord,
  activeIndex,
  spellInput,
  onInput,
  onCheck,
  onPrev,
  onNext,
  onContinue
}: {
  pack: LessonPack;
  settings: AgnesSettings;
  activeWord: WordEntry;
  activeIndex: number;
  spellInput: string;
  onInput: (value: string) => void;
  onCheck: () => void;
  onPrev: () => void;
  onNext: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="spell-screen">
      <h2>Spelling Time 拼写练习</h2>
      <div className="spell-card">
        <img src={getWordImage(pack, activeWord.id)} alt={activeWord.word} />
        <div>
          <p>Type the English word for <strong>{activeWord.meaningZh}</strong>.</p>
          <button className="secondary-button" onClick={() => speak(activeWord.word, 1)}>
            <Volume2 size={18} />
            Hear word
          </button>
          <input
            className="spell-input"
            value={spellInput}
            onChange={(event) => onInput(event.target.value)}
            placeholder="_ _ _ _ _ _ _"
          />
          <div className="letter-bank">
            {activeWord.word.split("").map((letter, index) => (
              <span key={`${letter}-${index}`}>{letter}</span>
            ))}
          </div>
          <div className="button-row">
            <button className="secondary-button" onClick={onPrev} disabled={activeIndex === 0}>Previous</button>
            <button className="primary-button" onClick={onCheck}>Check</button>
            <button className="secondary-button" onClick={onNext} disabled={activeIndex === pack.words.length - 1}>Next</button>
          </div>
          <button className="finish-button" onClick={onContinue}>
            Unlock Video Reward
            <Play size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

function RewardScreen({
  complete,
  video,
  onCreate,
  onPoll,
  onSummary
}: {
  complete: boolean;
  video: VideoTaskState;
  onCreate: () => void;
  onPoll: () => void;
  onSummary: () => void;
}) {
  return (
    <div className="reward-screen">
      <Trophy size={58} />
      <h2>Video Reward 视频奖励</h2>
      <p>{complete ? "Meaning and writing checks are complete. Your reward is ready to generate." : "You can still practice more, or try the reward now."}</p>
      {video.url ? (
        <video controls src={video.url} />
      ) : (
        <div className="video-placeholder">
          <Play size={58} />
          <span>{video.error ?? `Video status: ${video.status}`}</span>
        </div>
      )}
      <div className="button-row centered">
        <button className="primary-button" onClick={onCreate}>Create reward</button>
        <button className="secondary-button" onClick={onPoll} disabled={!video.videoId || video.status === "completed"}>Poll video</button>
        <button className="secondary-button" onClick={onSummary}>Summary</button>
      </div>
    </div>
  );
}

export function SummaryScreen({
  mastery,
  onContinue,
  onPracticeAgain
}: {
  mastery: MissionMastery;
  onContinue: () => void;
  onPracticeAgain: () => void;
}) {
  const meaning = laneProgress(mastery, "meaning");
  const say = laneProgress(mastery, "say");
  const write = laneProgress(mastery, "write");
  return (
    <div className="summary-screen">
      <Sparkles size={58} />
      <h2>Great mission!</h2>
      <p>今天你完成了单词任务。</p>
      <div className="summary-grid">
        <span>Meaning: {meaning.completed}/{meaning.total}</span>
        <span>Say: {say.completed}/{say.total}</span>
        <span>Write: {write.completed}/{write.total}</span>
      </div>
      <div className="button-row centered">
        <button className="primary-button" onClick={onContinue}>Continue Learning</button>
        <button className="secondary-button" onClick={onPracticeAgain}>Practice Again</button>
      </div>
    </div>
  );
}

export default App;
