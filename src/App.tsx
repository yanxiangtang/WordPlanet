import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Eye,
  Gamepad2,
  Gem,
  LayoutGrid,
  Loader2,
  Mic,
  Pencil,
  Play,
  RefreshCcw,
  Sparkles,
  Star,
  Trash2,
  Trophy,
  Volume2,
  X,
  type LucideIcon
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getUnitWords, getVocabularySet, listBookUnits, listVocabularySets, selectMissionWords } from "./data/vocabulary";
import {
  buildStoryScenePrompt,
  buildUnitCoverPrompt,
  createAgnesVideoTask,
  fetchAgnesVideoBlob,
  imagePromptForWord,
  pollAgnesVideo,
  REWARD_VIDEO_PROMPT_VERSION,
  requestAgnesImage,
  requestAgnesStory,
  STORY_TEXT_PROMPT_VERSION,
  testAgnesConnection,
  UNIT_COVER_PROMPT_VERSION,
  videoRewardPrompt,
  videoRewardPromptFromStory
} from "./lib/agnes";
import {
  buildPendingAgnesLessonPack,
  buildSampleLessonPack,
  collectObjectUrls,
  getWordImage,
  TEXT_FREE_ASSET_VERSION,
  upsertStoryScene,
  withObjectUrls
} from "./lib/lesson";
import { getMediaScheduler } from "./lib/mediaScheduler";
import { playFeedback } from "./lib/audioFeedback";
import {
  createEmptyMastery,
  isMissionComplete,
  laneProgress,
  recordMasteryResult,
  rewardPracticeGaps,
  type PracticeGap
} from "./lib/mastery";
import {
  buildRewardBoard,
  buildRewardChoices,
  buildRewardWordPool,
  clearRewardPair,
  hasRewardMove,
  type RewardCell,
  type RewardBoard,
  type RewardTile,
  type RewardWordItem
} from "./lib/rewardClearGame";
import { buildProgressStats, loadDailyProgress, recordDailyVisit, saveDailyProgress, type DailyProgress, type ProgressStats } from "./lib/progress";
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
  isUnitCoverFresh,
  storage,
  unitCoverStorageKey,
  unitStorageKey
} from "./lib/storage";
import type {
  AgnesSettings,
  ChildProfile,
  LearningScreen,
  LessonPack,
  MissionMastery,
  ParentControlSettings,
  StoryText,
  UnitCoverAsset,
  UnitStylePick,
  VideoTaskState,
  VocabularySelection,
  VocabularySet,
  VocabularyUnit,
  WordEntry
} from "./types";

type Screen = "setup" | LearningScreen;
const URL_SCREENS = new Set<Screen>(["home", "learn", "story", "game", "spell", "reward", "summary", "setup"]);
const LESSON_STARTED_SCREENS = new Set<Screen>(["learn", "story", "game", "spell", "reward", "summary"]);

type UnitLessonSummary = {
  hasPack: boolean;
  hasVideo: boolean;
  hasProgress: boolean;
  complete: boolean;
  masteredWords?: number;
};

type SpellingFeedback = {
  kind: "correct" | "retry";
  attempt: string;
  word: string;
};

function lessonPackMatchesWords(pack: LessonPack | undefined, words: WordEntry[]): pack is LessonPack {
  return Boolean(
    pack &&
      pack.words.length === words.length &&
      pack.words.every((word, index) => word.id === words[index]?.id)
  );
}

function masteryMatchesWords(mastery: MissionMastery | undefined, words: WordEntry[]): mastery is MissionMastery {
  if (!mastery) return false;
  const expectedIds = new Set(words.map((word) => word.id));
  const savedIds = Object.keys(mastery);
  return savedIds.length === expectedIds.size && savedIds.every((id) => expectedIds.has(id));
}

function needsRewardVideoState(video: VideoTaskState): boolean {
  return video.status === "idle" || isRewardVideoInFlight(video) || (video.status === "completed" && !isRewardVideoReady(video));
}

function isRewardVideoReady(video: VideoTaskState): boolean {
  return video.status === "completed" && !video.stage && video.promptVersion === REWARD_VIDEO_PROMPT_VERSION && Boolean(video.blob || video.url);
}

function isRewardVideoInFlight(video: VideoTaskState): boolean {
  return video.status === "queued" || video.status === "running" || Boolean(video.stage);
}

function freshStory(story: StoryText | undefined): StoryText | undefined {
  return story?.promptVersion === STORY_TEXT_PROMPT_VERSION ? story : undefined;
}

export function canStartRewardPipeline({
  screen,
  pack,
  hasApiKey,
  isVideoBusy,
  video
}: {
  screen: Screen;
  pack: LessonPack | null;
  hasApiKey: boolean;
  isVideoBusy: boolean;
  complete: boolean;
  video: VideoTaskState;
}): boolean {
  return LESSON_STARTED_SCREENS.has(screen) && Boolean(pack) && hasApiKey && !isVideoBusy && needsRewardVideoState(video);
}

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

function isOngoingNoticeText(text: string): boolean {
  return /^(Loading|Asking|Downloading|Redrawing|Writing|Drawing|Almost ready)/.test(text);
}

function hashString(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededShuffle<T>(items: T[], seed: string): T[] {
  const shuffled = [...items];
  let state = hashString(seed) || 1;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = Math.imul(state ^ (state >>> 15), 2246822519) >>> 0;
    const swapIndex = state % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
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
  const [screen, setScreen] = useState<Screen>(() => readScreenFromUrl() ?? "home");
  const [setupReturnScreen, setSetupReturnScreen] = useState<LearningScreen>(() => {
    const initialScreen = readScreenFromUrl();
    return initialScreen && initialScreen !== "setup" ? initialScreen : "home";
  });
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
    return [book?.name ?? set?.name, unit ? `Planet ${unit.unitNumber}: ${unit.title}` : null].filter(Boolean).join(" · ") || "Word Planet";
  }, [bookUnits, selection.setId, selection.bookId, selection.unitNumber]);
  const lessonMeta = useMemo(
    () => ({ setId: `${selection.setId}-${selection.bookId}-unit-${selection.unitNumber}`, title: missionTitle }),
    [selection.setId, selection.bookId, selection.unitNumber, missionTitle]
  );
  const activeUnitKey = useMemo(() => unitStorageKey(selection), [selection.setId, selection.bookId, selection.unitNumber]);
  const [mastery, setMastery] = useState<MissionMastery>(() => createEmptyMastery(missionWords.map((word) => word.id)));
  const [video, setVideo] = useState<VideoTaskState>({ status: "idle", progress: 0 });
  const [unitSummaries, setUnitSummaries] = useState<Record<number, UnitLessonSummary>>({});
  const [unitCovers, setUnitCovers] = useState<Record<number, UnitCoverAsset>>({});
  // Per-unit style picks for the current book (keyed by unitStorageKey).
  // Hydrated alongside unit covers; the picker requires a pick before
  // generating lesson images for a unit. Falling back to the profile
  // default when a unit has no pick lets returning users keep the look
  // they had before the per-unit refactor.
  const [unitStylePicks, setUnitStylePicks] = useState<Record<string, UnitStylePick>>({});
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
  const [spellFeedback, setSpellFeedback] = useState<SpellingFeedback | null>(null);
  const [spellShuffleSeed, setSpellShuffleSeed] = useState(0);
  const [speechMessage, setSpeechMessage] = useState("");
  const [isVideoBusy, setIsVideoBusy] = useState(false);
  const [dailyProgress, setDailyProgress] = useState<DailyProgress>(() =>
    typeof window === "undefined" ? { count: 0, lastVisitDate: "" } : loadDailyProgress()
  );

  // Object URLs for cached image/video Blobs are minted here so we can revoke
  // them in one place. Every code path that swaps `pack` or replaces the video
  // blob must route through replacePackUrls / replaceVideoUrl — otherwise the
  // old URLs leak until page unload (each one is GC-rooted by the browser).
  const objectUrlsRef = useRef<string[]>([]);
  const unitCoverUrlsRef = useRef<string[]>([]);
  const videoUrlRef = useRef<string | null>(null);
  const videoPollRef = useRef<{ cancelled: boolean } | null>(null);
  const activeUnitKeyRef = useRef(activeUnitKey);
  const unitMediaRunRef = useRef<string | null>(null);
  const startAfterStylePickRef = useRef<Screen | null>(null);
  const storySceneGenerationRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    activeUnitKeyRef.current = activeUnitKey;
  }, [activeUnitKey]);

  function replacePackUrls(nextPack: LessonPack | null) {
    for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
    objectUrlsRef.current = nextPack ? collectObjectUrls(nextPack) : [];
  }

  function replaceVideoUrl(nextUrl: string | null) {
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    videoUrlRef.current = nextUrl;
  }

  function replaceUnitCoverMap(nextCovers: Record<number, UnitCoverAsset>) {
    revokeUnitCoverUrls();
    unitCoverUrlsRef.current = Object.values(nextCovers)
      .map((cover) => cover.imageUrl)
      .filter((url): url is string => Boolean(url));
    setUnitCovers(nextCovers);
  }

  function revokeUnitCoverUrls() {
    for (const url of unitCoverUrlsRef.current) URL.revokeObjectURL(url);
    unitCoverUrlsRef.current = [];
  }

  function upsertUnitCover(nextCover: UnitCoverAsset) {
    setUnitCovers((current) => {
      const previousUrl = current[nextCover.unitNumber]?.imageUrl;
      if (previousUrl && previousUrl !== nextCover.imageUrl) {
        URL.revokeObjectURL(previousUrl);
        unitCoverUrlsRef.current = unitCoverUrlsRef.current.filter((url) => url !== previousUrl);
      }
      if (nextCover.imageUrl) unitCoverUrlsRef.current.push(nextCover.imageUrl);
      return { ...current, [nextCover.unitNumber]: nextCover };
    });
  }

  function cancelVideoPoll() {
    if (videoPollRef.current) videoPollRef.current.cancelled = true;
    videoPollRef.current = null;
  }

  function isCurrentMediaRun(unitKey: string, runId: string): boolean {
    return unitMediaRunRef.current === `${unitKey}:${runId}` && activeUnitKeyRef.current === unitKey;
  }

  function activeMediaRunIdForUnit(unitKey: string): string | null {
    const prefix = `${unitKey}:`;
    return unitMediaRunRef.current?.startsWith(prefix) ? unitMediaRunRef.current.slice(prefix.length) : null;
  }

  function cancelUnitMediaJobs(unitKey: string) {
    scheduler.cancelAll(({ id }) => id.includes(`:${unitKey}:`) || id.endsWith(`:${unitKey}`));
    if (unitMediaRunRef.current?.startsWith(`${unitKey}:`)) unitMediaRunRef.current = null;
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
    // Cancel any in-flight unit-scoped scheduler jobs (lesson images,
    // story text/images, reward video) for the previous unit so they
    // don't race the freshly hydrated state.
    const previousKey = activeUnitKey;
    if (previousKey && previousKey !== key) {
      cancelUnitMediaJobs(previousKey);
    }
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

      const storedPackIsCurrent =
        storedPack?.assetPromptVersion === TEXT_FREE_ASSET_VERSION && lessonPackMatchesWords(storedPack, words);
      if (storedPackIsCurrent) {
        const hydrated = withObjectUrls(storedPack);
        replacePackUrls(hydrated);
        setPack(hydrated);
      } else if (storedPack) {
        void storage.deleteLesson(key);
      }
      if (masteryMatchesWords(storedMastery, words)) setMastery(storedMastery);
      if (storedVideo) {
        if (isRewardVideoInFlight(storedVideo)) {
          const idleVideo: VideoTaskState = { status: "idle", progress: 0 };
          setVideo(idleVideo);
          void storage.saveVideo(idleVideo, key);
        } else if (storedVideo.blob) {
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
          const words = getUnitWords(targetSelection.setId, targetSelection.bookId, unit.unitNumber);
          const hasCurrentPack =
            storedPack?.assetPromptVersion === TEXT_FREE_ASSET_VERSION && lessonPackMatchesWords(storedPack, words);
          const hasCurrentMastery = masteryMatchesWords(storedMastery, words);
          return [
            unit.unitNumber,
            {
              hasPack: hasCurrentPack,
              hasVideo: storedVideo ? isRewardVideoReady(storedVideo) : false,
              hasProgress: Boolean(hasCurrentMastery && Object.values(storedMastery).some((word) =>
                Object.values(word).some((lane) => lane.correct > 0 || lane.wrong > 0 || lane.completed)
              )),
              complete: hasCurrentMastery ? isMissionComplete(storedMastery) : false,
              masteredWords: hasCurrentMastery
                ? Object.values(storedMastery).filter((word) => word.meaning.completed && word.write.completed).length
                : 0
            }
          ] as const;
        } catch {
          return [
            unit.unitNumber,
            { hasPack: false, hasVideo: false, hasProgress: false, complete: false, masteredWords: 0 }
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

  useEffect(() => {
    setSpellFeedback(null);
    setSpellShuffleSeed(0);
  }, [activeWord.id]);

  const hasApiKey = settings.apiKey.trim().length > 0;
  const currentUnitSummary = useMemo<UnitLessonSummary>(
    () => ({
      hasPack: Boolean(pack),
      hasVideo: isRewardVideoReady(video),
      hasProgress: Object.values(mastery).some((word) =>
        Object.values(word).some((lane) => lane.correct > 0 || lane.wrong > 0 || lane.completed)
      ),
      complete,
      masteredWords: Object.values(mastery).filter((word) => word.meaning.completed && word.write.completed).length
    }),
    [complete, mastery, pack, video.blob, video.stage, video.status, video.url]
  );
  const effectiveUnitSummaries = useMemo(
    () => ({ ...unitSummaries, [selection.unitNumber]: currentUnitSummary }),
    [currentUnitSummary, selection.unitNumber, unitSummaries]
  );
  const progressStats = useMemo(
    () => buildProgressStats({ currentMastery: mastery, unitSummaries: effectiveUnitSummaries }),
    [effectiveUnitSummaries, mastery]
  );
  const collectedWords = useMemo(
    () => dashboardPack.words.filter((word) => mastery[word.id]?.meaning.completed && mastery[word.id]?.write.completed),
    [dashboardPack.words, mastery]
  );

  // Resolve the kid's chosen visual style into the descriptor Agnes receives.
  // A per-unit pick (saved in IDB via storage.saveUnitStyle) wins over the
  // profile-level default. "auto" rotates a style per practice group via
  // pickArtStyle; a curated id fixes the look; a non-empty free-text note
  // overrides the curated descriptor (sanitized inside resolveStyleDescriptor).
  const missionSeed = useMemo(() => missionWords.map((word) => word.id).join("-"), [missionWords]);
  const currentUnitPick = unitStylePicks[activeUnitKey];
  const visualStyle = useMemo<{ id: string; descriptor: string; note?: string }>(
    () => {
      const id = currentUnitPick?.styleId ?? profile.visualStyleId ?? DEFAULT_STYLE_ID;
      const note = currentUnitPick?.styleNote ?? profile.visualStyleNote;
      return {
        id,
        descriptor: resolveStyleDescriptor(id, note, missionSeed),
        note
      };
    },
    [currentUnitPick?.styleId, currentUnitPick?.styleNote, profile.visualStyleId, profile.visualStyleNote, missionSeed]
  );
  const unitStyleLabel = getStyle(currentUnitPick?.styleId ?? profile.visualStyleId ?? DEFAULT_STYLE_ID)?.label ?? "Surprise Me";
  const unitStyleEmoji = getStyle(currentUnitPick?.styleId ?? profile.visualStyleId ?? DEFAULT_STYLE_ID)?.emoji ?? "🎲";
  const hasUnitStylePick = Boolean(currentUnitPick);

  // The media scheduler is a module-singleton; the App holds the reference
  // for ergonomic cancellation when units switch.
  const scheduler = useMemo(() => getMediaScheduler(), []);

  // Resolve a style for a unit that may differ from the active unit (used
  // by the picker board to render each card's intended look).
  function resolveStyleForUnit(unitKey: string): { id: string; descriptor: string; note?: string } {
    const pick = unitStylePicks[unitKey];
    const id = pick?.styleId ?? profile.visualStyleId ?? DEFAULT_STYLE_ID;
    const note = pick?.styleNote ?? profile.visualStyleNote;
    return { id, descriptor: resolveStyleDescriptor(id, note, unitKey), note };
  }

  // Lazy unit-cover generation.
  //
  // The previous implementation eagerly walked every unit in the book and
  // generated covers serially on every render — that burned credits on
  // units the kid never opened and stalled book switches. The new flow:
  //
  //   1. On book switch, read all cached covers from IDB into local state
  //      so the picker grid renders instantly for previously-visited units.
  //   2. The LessonBoard hands each card an `onVisible(unitNumber)` handler
  //      wired to an IntersectionObserver. The first time a card scrolls
  //      into view, this enqueues a low-priority cover job through the
  //      media scheduler. Dedupe via the job id keeps a double-mount or
  //      rapid scroll from re-firing.
  //   3. Style changes are scoped to the unit whose pick changed — we no
  //      longer regenerate every cover in the book when one style flips.
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;

    async function hydrateCachedCovers() {
      replaceUnitCoverMap({});
      const cachedCovers: Record<number, UnitCoverAsset> = {};
      for (const unit of bookUnits) {
        const key = unitCoverStorageKey({ ...selection, unitNumber: unit.unitNumber });
        try {
          const storedCover = await storage.getUnitCover(key);
          if (storedCover) {
            cachedCovers[unit.unitNumber] = {
              ...storedCover,
              imageUrl: URL.createObjectURL(storedCover.imageBlob)
            };
          }
        } catch {
          // Cached covers are decorative; failing to read one just means
          // we'll regenerate when the card scrolls into view.
        }
      }
      if (cancelled) {
        for (const cover of Object.values(cachedCovers)) URL.revokeObjectURL(cover.imageUrl);
        return;
      }
      replaceUnitCoverMap(cachedCovers);
    }

    void hydrateCachedCovers();
    return () => {
      cancelled = true;
    };
  }, [bookUnits, hydrated, selection.bookId, selection.setId]);

  // Load per-unit style picks for the current book whenever it changes.
  // Picks are persistent (storage.saveUnitStyle) so the picker can show
  // "Style for this unit" before any lesson is generated.
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    async function loadUnitStyles() {
      const next: Record<string, UnitStylePick> = {};
      await Promise.all(
        bookUnits.map(async (unit) => {
          const key = unitStorageKey({ ...selection, unitNumber: unit.unitNumber });
          try {
            const pick = await storage.getUnitStyle(key);
            if (pick) next[key] = pick;
          } catch {
            // Missing picks are fine — the resolver falls back to profile.
          }
        })
      );
      if (!cancelled) setUnitStylePicks(next);
    }
    void loadUnitStyles();
    return () => {
      cancelled = true;
    };
  }, [bookUnits, hydrated, selection.bookId, selection.setId]);

  // Triggered by LessonBoard when a unit card scrolls into view. Generates
  // the cover only when a fresh one isn't already cached for the unit's
  // current style. Routed through the scheduler at low priority so a
  // simultaneous lesson-image burst preempts it.
  async function requestUnitCover(unit: VocabularyUnit) {
    if (!hasApiKey) return;
    const unitKey = unitStorageKey({ ...selection, unitNumber: unit.unitNumber });
    const coverKey = unitCoverStorageKey({ ...selection, unitNumber: unit.unitNumber });
    const style = resolveStyleForUnit(unitKey);
    const criteria = { promptVersion: UNIT_COVER_PROMPT_VERSION, artStyleId: style.id, artStyleNote: style.note };
    if (isUnitCoverFresh(unitCovers[unit.unitNumber], criteria)) return;
    try {
      const cached = await storage.getUnitCover(coverKey);
      if (isUnitCoverFresh(cached, criteria)) {
        upsertUnitCover({ ...cached, imageUrl: URL.createObjectURL(cached.imageBlob) });
        return;
      }
    } catch {
      // Fall through and generate.
    }
    try {
      const words = getUnitWords(selection.setId, selection.bookId, unit.unitNumber);
      const imageBlob = await scheduler.enqueue({
        id: `unitCover:${coverKey}`,
        kind: "unitCover",
        priority: -1,
        run: (signal) =>
          requestAgnesImage(settings, buildUnitCoverPrompt(unit, words, style.descriptor), { signal })
      });
      const nextCover: UnitCoverAsset = {
        setId: selection.setId,
        bookId: selection.bookId,
        unitNumber: unit.unitNumber,
        promptVersion: UNIT_COVER_PROMPT_VERSION,
        artStyleId: style.id,
        artStyleNote: style.note,
        imageBlob,
        imageUrl: URL.createObjectURL(imageBlob),
        source: "agnes",
        createdAt: Date.now()
      };
      await storage.saveUnitCover(nextCover, coverKey);
      upsertUnitCover(nextCover);
    } catch {
      // Unit covers are decorative; failed background generation should not
      // interrupt choosing or starting a lesson.
    }
  }

  // A style pick that would throw away already-generated Agnes media must be
  // confirmed before regenerating (regen costs API credits). When set, the
  // ConfirmStyleChange modal is shown; null means no confirmation pending.
  const [pendingStyle, setPendingStyle] = useState<{ id: string; descriptor: string; note?: string; label: string } | null>(null);
  const [stylePickerOpen, setStylePickerOpen] = useState(false);

  // A short celebratory overlay shown when the kid finishes an activity before
  // the next one opens — turns the Story→Game→Spelling→Video rail into a
  // journey rather than a panel swap. Cleared by a timeout after the cheer.
  const [celebration, setCelebration] = useState<{ cheer: string } | null>(null);
  const celebrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function transitionWithCheer(cheer: string, next: Screen) {
    if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
    playFeedback("complete");
    speak(cheer.replace(/[^\w\s!]/g, ""), 1);
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
      revokeUnitCoverUrls();
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
    setNotice(openDetail && unit ? `Planet ${unit.unitNumber} is ready: ${unit.title}.` : "Planet book updated.");
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

  function recordDailyLearning() {
    const next = recordDailyVisit(dailyProgress);
    setDailyProgress(next);
    saveDailyProgress(next);
  }

  function makeMediaRunId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function selectedStyleFromPick(id: string, note?: string): { id: string; descriptor: string; note?: string } {
    return { id, descriptor: resolveStyleDescriptor(id, note, missionSeed), note };
  }

  function replaceWordAssetFromBackground(unitKey: string, runId: string, wordId: string, imageBlob: Blob) {
    setPack((prev) => {
      if (!prev || !isCurrentMediaRun(unitKey, runId)) return prev;
      const existing = prev.assets.find((asset) => asset.wordId === wordId);
      if (!existing) return prev;
      if (existing.imageUrl) {
        URL.revokeObjectURL(existing.imageUrl);
        objectUrlsRef.current = objectUrlsRef.current.filter((url) => url !== existing.imageUrl);
      }
      const imageUrl = URL.createObjectURL(imageBlob);
      objectUrlsRef.current.push(imageUrl);
      const nextPack: LessonPack = {
        ...prev,
        assets: prev.assets.map((asset) =>
          asset.wordId === wordId ? { ...asset, imageBlob, imageUrl, source: "agnes" } : asset
        )
      };
      void storage.saveLesson(nextPack, unitKey);
      return nextPack;
    });
  }

  function saveStoryOnCurrentPack(unitKey: string, runId: string | null, story: StoryText) {
    setPack((prev) => {
      if (!prev || (runId && !isCurrentMediaRun(unitKey, runId))) return prev;
      const nextPack: LessonPack = { ...prev, storyText: story };
      void storage.saveLesson(nextPack, unitKey);
      return nextPack;
    });
  }

  async function generateUnitCoverForStyle(
    targetSelection: VocabularySelection,
    style: { id: string; descriptor: string; note?: string },
    unitKey: string,
    runId: string
  ) {
    const unit = listBookUnits(targetSelection.setId, targetSelection.bookId).find((item) => item.unitNumber === targetSelection.unitNumber);
    if (!unit) return;
    const coverKey = unitCoverStorageKey(targetSelection);
    const criteria = { promptVersion: UNIT_COVER_PROMPT_VERSION, artStyleId: style.id, artStyleNote: style.note };
    try {
      const cached = await storage.getUnitCover(coverKey);
      if (isUnitCoverFresh(cached, criteria)) {
        if (!isCurrentMediaRun(unitKey, runId)) return;
        upsertUnitCover({ ...cached, imageUrl: URL.createObjectURL(cached.imageBlob) });
        return;
      }
    } catch {
      // Fall through and generate a fresh cover.
    }

    try {
      const words = getUnitWords(targetSelection.setId, targetSelection.bookId, targetSelection.unitNumber);
      const imageBlob = await scheduler.enqueue({
        id: `unitCover:${coverKey}:${runId}`,
        kind: "unitCover",
        priority: 1,
        run: (signal) =>
          requestAgnesImage(settings, buildUnitCoverPrompt(unit, words, style.descriptor), { signal })
      });
      if (!isCurrentMediaRun(unitKey, runId)) return;
      const nextCover: UnitCoverAsset = {
        setId: targetSelection.setId,
        bookId: targetSelection.bookId,
        unitNumber: targetSelection.unitNumber,
        promptVersion: UNIT_COVER_PROMPT_VERSION,
        artStyleId: style.id,
        artStyleNote: style.note,
        imageBlob,
        imageUrl: URL.createObjectURL(imageBlob),
        source: "agnes",
        createdAt: Date.now()
      };
      await storage.saveUnitCover(nextCover, coverKey);
      if (isCurrentMediaRun(unitKey, runId)) upsertUnitCover(nextCover);
    } catch {
      // Covers are decorative; failed generation should not interrupt play.
    }
  }

  async function refreshUnitCoverForStyle(
    targetSelection: VocabularySelection,
    style: { id: string; descriptor: string; note?: string }
  ) {
    const unit = listBookUnits(targetSelection.setId, targetSelection.bookId).find((item) => item.unitNumber === targetSelection.unitNumber);
    if (!unit) return;
    const coverKey = unitCoverStorageKey(targetSelection);
    const criteria = { promptVersion: UNIT_COVER_PROMPT_VERSION, artStyleId: style.id, artStyleNote: style.note };
    try {
      const cached = await storage.getUnitCover(coverKey);
      if (isUnitCoverFresh(cached, criteria)) {
        upsertUnitCover({ ...cached, imageUrl: URL.createObjectURL(cached.imageBlob) });
        return;
      }
    } catch {
      // Fall through and generate a fresh cover.
    }

    try {
      const words = getUnitWords(targetSelection.setId, targetSelection.bookId, targetSelection.unitNumber);
      const imageBlob = await scheduler.enqueue({
        id: `unitCover:${coverKey}:${style.id}:${style.note ?? ""}`,
        kind: "unitCover",
        priority: 1,
        run: (signal) =>
          requestAgnesImage(settings, buildUnitCoverPrompt(unit, words, style.descriptor), { signal })
      });
      const nextCover: UnitCoverAsset = {
        setId: targetSelection.setId,
        bookId: targetSelection.bookId,
        unitNumber: targetSelection.unitNumber,
        promptVersion: UNIT_COVER_PROMPT_VERSION,
        artStyleId: style.id,
        artStyleNote: style.note,
        imageBlob,
        imageUrl: URL.createObjectURL(imageBlob),
        source: "agnes",
        createdAt: Date.now()
      };
      await storage.saveUnitCover(nextCover, coverKey);
      upsertUnitCover(nextCover);
    } catch {
      // Unit covers are decorative; failed generation should not block style selection.
    }
  }

  async function generateStoryMediaForPack(
    targetPack: LessonPack,
    style: { id: string; descriptor: string; note?: string },
    unitKey: string,
    runId: string
  ) {
    const storyKey = `${unitKey}:${targetPack.id}:${style.id}:${style.note ?? ""}`;
    if (storySceneGenerationRef.current.has(storyKey)) return;
    storySceneGenerationRef.current.add(storyKey);
    try {
      let story = freshStory(targetPack.storyText);
      if (!story) {
        story = await scheduler.enqueue({
          id: `storyText:${unitKey}:${runId}`,
          kind: "storyText",
          run: (signal) =>
            requestAgnesStory(
              settings,
              targetPack.words.map((word) => ({ word: word.word, meaningZh: word.meaningZh })),
              { signal }
            )
        });
        if (!isCurrentMediaRun(unitKey, runId)) return;
        story = { ...story, generatedAt: Date.now(), promptVersion: STORY_TEXT_PROMPT_VERSION };
        saveStoryOnCurrentPack(unitKey, runId, story);
      }

      for (let i = 0; i < story.sentences.length; i += 1) {
        const sentence = story.sentences[i];
        try {
          const blob = await scheduler.enqueue({
            id: `storyImage:${unitKey}:${i}:${runId}`,
            kind: "storyImage",
            run: (signal) =>
              requestAgnesImage(
                settings,
                buildStoryScenePrompt(sentence, style.descriptor, targetPack.words),
                { signal }
              )
          });
          if (!isCurrentMediaRun(unitKey, runId)) return;
          setPack((prev) => {
            if (!prev || !isCurrentMediaRun(unitKey, runId)) return prev;
            const nextScene = {
              id: `story-${i + 1}`,
              title: sentence.title,
              text: sentence.en,
              textZh: sentence.zh,
              imageBlob: blob,
              imageUrl: URL.createObjectURL(blob),
              source: "agnes" as const
            };
            const nextPack = upsertStoryScene(prev, nextScene);
            objectUrlsRef.current.push(nextScene.imageUrl);
            void storage.saveLesson(nextPack, unitKey);
            return nextPack;
          });
        } catch {
          // A single scene failure leaves that slot as a Story placeholder.
        }
      }
    } catch {
      // Story text failure leaves Story placeholders in place.
    } finally {
      storySceneGenerationRef.current.delete(storyKey);
    }
  }

  function startBackgroundUnitMedia(
    targetPack: LessonPack,
    targetSelection: VocabularySelection,
    style: { id: string; descriptor: string; note?: string },
    unitKey: string,
    runId: string
  ) {
    void generateUnitCoverForStyle(targetSelection, style, unitKey, runId);
    for (const word of targetPack.words) {
      void scheduler.enqueue({
        id: `lessonImage:${unitKey}:${word.id}:${runId}`,
        kind: "lessonImage",
        run: (signal) => requestAgnesImage(settings, imagePromptForWord(word, style.descriptor), { signal })
      })
        .then((blob) => replaceWordAssetFromBackground(unitKey, runId, word.id, blob))
        .catch(() => {
          // Keep the placeholder image for this word.
        });
    }
    void generateStoryMediaForPack(targetPack, style, unitKey, runId);
  }

  async function startMission(
    forceSample = false,
    nextScreen: Screen = "home",
    styleOverride: { id: string; descriptor: string; note?: string } = visualStyle
  ): Promise<LessonPack | null> {
    if (isGenerating) return null;
    setGenerating(true);
    cancelVideoPoll();
    setNotice(forceSample || !hasApiKey ? "Loading the built-in sample mission." : "Preparing your lesson while pictures draw.");
    try {
      const unitKey = activeUnitKey;
      const targetSelection = selection;
      let runId = "";
      if (hasApiKey && !forceSample) {
        cancelUnitMediaJobs(unitKey);
        runId = makeMediaRunId();
        unitMediaRunRef.current = `${unitKey}:${runId}`;
      }
      const nextPack = hasApiKey && !forceSample
        ? buildPendingAgnesLessonPack(missionWords, lessonMeta, { id: styleOverride.id, note: styleOverride.note })
        : buildSampleLessonPack(missionWords, lessonMeta, { id: styleOverride.id, note: styleOverride.note });
      const nextMastery = createEmptyMastery(nextPack.words.map((word) => word.id));
      storyEnsureRef.current = null;
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
      if (nextPack.source === "agnes") {
        startBackgroundUnitMedia(nextPack, targetSelection, styleOverride, unitKey, runId);
      }
      setNotice(nextPack.source === "agnes" ? "Lesson ready. Pictures are drawing in the background." : "Sample mission saved in this browser.");
      return nextPack;
    } catch (error) {
      const fallback = buildSampleLessonPack(missionWords, lessonMeta, { id: styleOverride.id, note: styleOverride.note });
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
  async function regeneratePictures(styleOverride: { id: string; descriptor: string; note?: string } = visualStyle) {
    if (isGenerating) return;
    if (!hasApiKey) return;
    setGenerating(true);
    setNotice("Redrawing your pictures in the new style.");
    const unitKey = activeUnitKey;
    const targetSelection = selection;
    cancelUnitMediaJobs(unitKey);
    cancelVideoPoll();
    const idleVideo: VideoTaskState = { status: "idle", progress: 0 };
    replaceVideoUrl(null);
    setVideo(idleVideo);
    void storage.saveVideo(idleVideo, unitKey);
    try {
      const runId = makeMediaRunId();
      unitMediaRunRef.current = `${unitKey}:${runId}`;
      const nextPack = buildPendingAgnesLessonPack(missionWords, lessonMeta, { id: styleOverride.id, note: styleOverride.note });
      storyEnsureRef.current = null;
      replacePackUrls(nextPack);
      setPack(nextPack);
      setActiveIndex((value) => Math.min(value, Math.max(nextPack.words.length - 1, 0)));
      await storage.saveLesson(nextPack, activeUnitKey);
      await refreshUnitSummaries();
      startBackgroundUnitMedia(nextPack, targetSelection, styleOverride, unitKey, runId);
      setNotice("Pictures are redrawing in your new style.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not redraw pictures.");
    } finally {
      setGenerating(false);
    }
  }

  // Apply a per-unit style pick (the kid is choosing the look for the unit
  // they're about to or are currently playing). If real Agnes media exists
  // for this unit, surface a confirmation modal before regenerating; a
  // missing pack just persists the pick so the next Start uses it.
  async function applyStylePick(id: string, note?: string) {
    const label = getStyle(id)?.label ?? "Surprise Me";
    const styleChanged = id !== (currentUnitPick?.styleId ?? profile.visualStyleId ?? DEFAULT_STYLE_ID) ||
      (note ?? "") !== (currentUnitPick?.styleNote ?? profile.visualStyleNote ?? "");
    const selectedStyle = selectedStyleFromPick(id, note);
    const startAfterPick = startAfterStylePickRef.current;
    startAfterStylePickRef.current = null;
    const pick: UnitStylePick = { styleId: id, styleNote: note, chosenAt: Date.now() };
    setUnitStylePicks((current) => ({ ...current, [activeUnitKey]: pick }));
    try {
      await storage.saveUnitStyle(pick, activeUnitKey);
    } catch {
      // Persisted picks are nice-to-have; the in-memory copy still drives
      // generation for this session.
    }
    setStylePickerOpen(false);
    if (!styleChanged && !startAfterPick) return;
    const hasGeneratedMedia = pack?.source === "agnes" || isRewardVideoReady(video);
    if (hasGeneratedMedia && hasApiKey) {
      setPendingStyle({ ...selectedStyle, label });
    } else if (startAfterPick) {
      await startMission(false, startAfterPick, selectedStyle);
    } else if (hasApiKey && !pack) {
      await refreshUnitCoverForStyle(selection, selectedStyle);
      setNotice(`Style set to ${label}. The cover is updating for this unit.`);
    } else if (hasApiKey && styleChanged) {
      await regeneratePictures(selectedStyle);
    } else {
      setNotice(`Style set to ${label}. The next start of this unit will use it.`);
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

  async function deleteCachedCovers() {
    try {
      for (const unit of bookUnits) {
        const coverKey = unitCoverStorageKey({ ...selection, unitNumber: unit.unitNumber });
        scheduler.cancelAll(({ id }) => id.startsWith(`unitCover:${coverKey}`));
        await storage.deleteUnitCover(coverKey);
      }
      replaceUnitCoverMap({});
      setNotice("Selected book covers were cleared.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete cached covers.");
    }
  }

  async function mark(word: WordEntry, lane: "meaning" | "say" | "write", correct: boolean) {
    const next = recordMasteryResult(mastery, word.id, lane, correct);
    if (correct) {
      recordDailyLearning();
      playFeedback("correct");
      if (lane === "meaning") setNotice(`${word.word} joined your Word Zoo!`);
    } else {
      playFeedback("wrong");
    }
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
    } catch {
      setSpeechMessage("My ears wiggled. Say it once more!");
      await mark(word, "say", false);
    }
  }

  async function handleSpell(word: WordEntry) {
    const attempt = spellInput.trim();
    const correct = attempt.toLowerCase() === word.word.toLowerCase();
    await mark(word, "write", correct);
    setSpellFeedback({ kind: correct ? "correct" : "retry", attempt, word: word.word });
    if (!correct) {
      speak("oopsie", 1.05);
      setNotice(`Good try. The word is ${word.word}.`);
    }
  }

  const handleSpellInput = useCallback((value: string) => {
    setSpellInput(value);
    setSpellFeedback(null);
  }, []);

  async function startVideoReward() {
    if (!pack) return;
    if (!complete) {
      setNotice("Finish the meaning and spelling stages before creating the reward video.");
      return;
    }
    if (!hasApiKey) {
      setVideo({
        status: "completed",
        progress: 100,
        url: undefined,
        error: "Sample reward: add an Agnes key to generate a real video."
      });
      return;
    }
    // Manual retry button — runs the same pipeline as the lesson-start
    // auto-trigger.
    await runRewardPipeline(pack);
  }

  // Reward pipeline: write a kid-friendly story with the text LLM, then
  // submit a video task, poll until ready, and download the bytes.
  //
  // The pipeline starts in the background once a real lesson opens so the
  // slow video work can overlap with learning. Each step is funnelled
  // through the media scheduler so transient Agnes errors retry
  // transparently and a unit switch / style change can cancel the whole
  // chain via cancelAll.
  async function runRewardPipeline(targetPack: LessonPack) {
    if (isVideoBusy) return;
    if (!hasApiKey) return;

    cancelVideoPoll();
    const token = { cancelled: false };
    videoPollRef.current = token;
    setIsVideoBusy(true);
    const unitKey = activeUnitKey;

    try {
      // ----- 1. Story text -----
      setVideo({ status: "running", stage: "writing-story", progress: 5 });
      setNotice("Writing your reward story…");
      let story: StoryText | undefined = freshStory(targetPack.storyText);
      if (!story) {
        const activeRunId = activeMediaRunIdForUnit(unitKey);
        try {
          story = await scheduler.enqueue({
            id: activeRunId ? `storyText:${unitKey}:${activeRunId}` : `storyText:${unitKey}`,
            kind: "storyText",
            run: (signal) =>
              requestAgnesStory(
                settings,
                targetPack.words.map((word) => ({ word: word.word, meaningZh: word.meaningZh })),
                { signal }
              )
          });
          if (activeRunId && !isCurrentMediaRun(unitKey, activeRunId)) return;
          story = { ...story, generatedAt: Date.now(), promptVersion: STORY_TEXT_PROMPT_VERSION };
          saveStoryOnCurrentPack(unitKey, activeRunId, story);
        } catch {
          // Story is nice-to-have for the video; fall back to the word-list
          // prompt rather than blocking the reward entirely.
          story = undefined;
        }
      }
      if (token.cancelled) return;

      // ----- 2. Create video task -----
      setVideo({ status: "running", stage: "creating-task", progress: 25 });
      setNotice("Asking Agnes to draw your reward video…");
      const prompt = story
        ? videoRewardPromptFromStory(story, visualStyle.descriptor)
        : videoRewardPrompt(targetPack, visualStyle.descriptor);
      const task = await scheduler.enqueue({
        id: `rewardVideo:${unitKey}:create`,
        kind: "rewardVideo",
        run: (signal) => createAgnesVideoTask(settings, prompt, undefined, { signal })
      });
      if (token.cancelled) return;

      const queued: VideoTaskState = { ...task, promptVersion: REWARD_VIDEO_PROMPT_VERSION, stage: "creating-task", blob: undefined, url: undefined };
      setVideo(queued);
      await storage.saveVideo(queued, unitKey);

      const videoId = task.videoId;
      if (!videoId) throw new Error("Agnes did not return a video id.");

      // ----- 3. Poll until ready -----
      setVideo({ ...queued, status: "running", stage: "rendering", progress: 40 });
      setNotice("Drawing your reward video — about a minute.");
      let pollAttempt = 0;
      while (!token.cancelled) {
        await sleep(5000);
        if (token.cancelled) return;
        pollAttempt += 1;
        const next = await scheduler.enqueue({
          id: `rewardVideo:${unitKey}:poll:${pollAttempt}`,
          kind: "rewardVideo",
          run: (signal) => pollAgnesVideo(settings, videoId, { signal })
        });
        if (token.cancelled) return;

        if (next.status === "completed" && next.url) {
          // ----- 4. Download bytes -----
          setVideo({ ...next, promptVersion: REWARD_VIDEO_PROMPT_VERSION, stage: "downloading", progress: 90 });
          setNotice("Almost ready — downloading your video…");
          try {
            const blob = await scheduler.enqueue({
              id: `rewardVideo:${unitKey}:download`,
              kind: "rewardVideo",
              run: (signal) => fetchAgnesVideoBlob(next.url!, { signal })
            });
            if (token.cancelled) return;
            const objUrl = URL.createObjectURL(blob);
            replaceVideoUrl(objUrl);
            const final: VideoTaskState = { ...next, promptVersion: REWARD_VIDEO_PROMPT_VERSION, stage: undefined, blob, url: objUrl, progress: 100 };
            setVideo(final);
            await storage.saveVideo(final, unitKey);
            await refreshUnitSummaries();
            setNotice("Reward video cached.");
          } catch {
            if (token.cancelled) return;
            const final: VideoTaskState = { ...next, promptVersion: REWARD_VIDEO_PROMPT_VERSION, stage: undefined, blob: undefined, progress: 100 };
            replaceVideoUrl(null);
            setVideo(final);
            await storage.saveVideo(final, unitKey);
            await refreshUnitSummaries();
            setNotice("Reward video ready. Browser cache was skipped.");
          }
          return;
        }
        if (next.status === "failed") {
          setVideo({ ...next, stage: undefined });
          await storage.saveVideo({ ...next, stage: undefined }, unitKey);
          await refreshUnitSummaries();
          setNotice(next.error ?? "Reward video generation failed.");
          return;
        }
        // Still running — surface progress without keeping a stale URL.
        setVideo({ ...next, promptVersion: REWARD_VIDEO_PROMPT_VERSION, stage: "rendering", blob: undefined, url: undefined });
      }
    } catch (error) {
      if (!token.cancelled) {
        const message = error instanceof Error ? error.message : "Reward video failed.";
        setVideo((prev) => ({ ...prev, status: "failed", stage: undefined, progress: prev.progress ?? 0, error: message }));
        setNotice(message);
      }
    } finally {
      if (videoPollRef.current === token) videoPollRef.current = null;
      setIsVideoBusy(false);
    }
  }

  // Lazy story-scene generation. The Story screen used to render the three
  // sample story slots that simply reused word images by reference. We now
  // wait for the kid to actually open Story, ask the LLM for a kid story
  // (reusing the cached pack.storyText when it already exists), then
  // generate one Agnes image per sentence and stream each scene into the
  // pack as soon as the Blob lands.
  async function ensureStoryScenes(targetPack: LessonPack) {
    if (!hasApiKey) return;
    if (targetPack.source !== "agnes") return;
    if (targetPack.storyScenes.length > 0 && targetPack.storyScenes.every((scene) => scene.source === "agnes")) return;

    const unitKey = activeUnitKey;
    const storyKey = `${unitKey}:${targetPack.id}:${visualStyle.id}:${visualStyle.note ?? ""}`;
    if (storySceneGenerationRef.current.has(storyKey)) return;
    storySceneGenerationRef.current.add(storyKey);
    try {
      let story = freshStory(targetPack.storyText);
      if (!story) {
        story = await scheduler.enqueue({
          id: `storyText:${unitKey}`,
          kind: "storyText",
          run: (signal) =>
            requestAgnesStory(
              settings,
              targetPack.words.map((word) => ({ word: word.word, meaningZh: word.meaningZh })),
              { signal }
            )
        });
        story = { ...story, generatedAt: Date.now(), promptVersion: STORY_TEXT_PROMPT_VERSION };
        const withStory = { ...targetPack, storyText: story };
        setPack(withStory);
        await storage.saveLesson(withStory, unitKey);
        targetPack = withStory;
      }

      // Generate one image per sentence sequentially; the scheduler keeps
      // them from clogging the image lane and they stream into the pack
      // one-by-one so the Story screen can show a "scene N/3" placeholder.
      const sentences = story.sentences;
      for (let i = 0; i < sentences.length; i += 1) {
        const sentence = sentences[i];
        try {
          const blob = await scheduler.enqueue({
            id: `storyImage:${unitKey}:${i}`,
            kind: "storyImage",
            run: (signal) =>
              requestAgnesImage(
                settings,
                buildStoryScenePrompt(sentence, visualStyle.descriptor, targetPack.words),
                { signal }
              )
          });
          setPack((prev) => {
            if (!prev) return prev;
            const nextScene = {
              id: `story-${i + 1}`,
              title: sentence.title,
              text: sentence.en,
              textZh: sentence.zh,
              imageBlob: blob,
              imageUrl: URL.createObjectURL(blob),
              source: "agnes" as const
            };
            const nextPack = upsertStoryScene(prev, nextScene);
            objectUrlsRef.current.push(nextScene.imageUrl);
            void storage.saveLesson(nextPack, unitKey);
            return nextPack;
          });
        } catch {
          // A single scene failure shouldn't block the rest. The slot stays
          // unfilled; StoryQuestInline shows a "drawing scene…" placeholder.
        }
      }
    } catch {
      // Story-text failure — leave scenes empty; the screen shows a
      // friendly fallback.
    } finally {
      storySceneGenerationRef.current.delete(storyKey);
    }
  }

  async function beginLesson() {
    if (!pack && !hasUnitStylePick) {
      // Force a per-unit style pick before creating the first lesson for the unit.
      setNotice("Pick a style for this unit, then we'll start.");
      startAfterStylePickRef.current = "learn";
      setStylePickerOpen(true);
      return;
    }
    if (!pack) {
      await startMission(false, "learn");
    } else {
      setScreen("learn");
    }
  }

  // When the kid lands on the Story screen for the first time with a real
  // Agnes pack, kick off the lazy story-scene generator. The effect is
  // intentionally one-shot per (pack id, screen=story) entry — re-renders
  // while still on Story don't re-fire because the pack's scenes get
  // populated as the work progresses.
  const storyEnsureRef = useRef<string | null>(null);
  useEffect(() => {
    if (screen !== "story") return;
    if (!pack) return;
    if (pack.source !== "agnes") return;
    if (storyEnsureRef.current === pack.id) return;
    if (pack.storyScenes.length > 0 && pack.storyScenes.every((scene) => scene.source === "agnes")) return;
    storyEnsureRef.current = pack.id;
    void ensureStoryScenes(pack);
  }, [pack, screen]);

  // Reward auto-trigger: once the lesson starts, run the story → video
  // pipeline unless a usable video already exists.
  useEffect(() => {
    if (!canStartRewardPipeline({ screen, pack, hasApiKey, isVideoBusy, complete, video })) return;
    void runRewardPipeline(pack as LessonPack);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete, pack, screen, video.status, video.blob, video.url]);

  async function chooseLessonUnit(unitNumber: number) {
    await switchToUnit({ ...selection, unitNumber }, true);
  }

  function advanceLearnWord() {
    if (activeIndex >= dashboardPack.words.length - 1) {
      setScreen("story");
      return;
    }
    setActiveIndex((value) => Math.min(dashboardPack.words.length - 1, value + 1));
  }

  function resetSpellState() {
    setSpellInput("");
    setSpellFeedback(null);
    setSpellShuffleSeed((value) => value + 1);
  }

  function openSpellPractice() {
    setActiveIndex(0);
    resetSpellState();
    setScreen("spell");
  }

  function continueGameToSpell() {
    setActiveIndex(0);
    resetSpellState();
    transitionWithCheer("Great matching!", "spell");
  }

  function advanceSpellWord() {
    if (activeIndex >= dashboardPack.words.length - 1) {
      transitionWithCheer("Super spelling!", "reward");
      return;
    }
    resetSpellState();
    setActiveIndex((value) => Math.min(dashboardPack.words.length - 1, value + 1));
  }

  function openParentControls() {
    if (screen !== "setup") setSetupReturnScreen(screen);
    setScreen("setup");
  }

  const isLessonPicker = screen === "home";
  const busy = isGenerating || isVideoBusy;
  const visibleNotice = notice && !busy && !isOngoingNoticeText(notice) ? notice : "";
  const noticeDismissible = Boolean(visibleNotice);

  return (
    <div className={`app-shell theme-${profile.gender} ${isLessonPicker ? "lesson-picker-shell" : ""}`}>
      <TopBar
        profile={profile}
        missionTitle={missionTitle}
        progress={progressStats}
        streakCount={dailyProgress.count}
        compact={isLessonPicker}
        onSetup={openParentControls}
      />
      <main className="main-stage">
        {screen === "setup" ? (
          <section className="setup-panel">
            {visibleNotice && <Notice text={visibleNotice} dismissible={noticeDismissible} onDismiss={() => setNotice("")} />}
            <ParentControlScreen
              settings={settings}
              profile={profile}
              parentControls={parentControls}
              selection={selection}
              vocabularySets={vocabularySets}
              bookUnits={bookUnits}
              unitSummaries={effectiveUnitSummaries}
              unlocked={true}
              pack={pack}
              video={video}
              onSettings={persistSettings}
              onProfile={persistProfile}
              onParentControls={persistParentControls}
              onSelection={(next) => void switchToUnit(next, false)}
              onUnlock={() => {}}
              onDeletePictures={deleteCachedPictures}
              onDeleteVideo={deleteCachedVideo}
              onDeleteCovers={deleteCachedCovers}
              isVideoBusy={isVideoBusy}
              coverCount={Object.keys(unitCovers).length}
              coverPreview={Object.values(unitCovers).sort((left, right) => left.unitNumber - right.unitNumber)[0]}
              coverPreviews={Object.values(unitCovers).sort((left, right) => left.unitNumber - right.unitNumber)}
            />
            <button className="secondary-button setup-back" onClick={() => setScreen(setupReturnScreen)}>
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
            unitCovers={unitCovers}
            settings={settings}
            mastery={mastery}
            video={video}
            activeIndex={activeIndex}
            activeWord={activeWord}
            screen={screen}
            spellInput={spellInput}
            spellFeedback={spellFeedback}
            spellShuffleSeed={spellShuffleSeed}
            speechMessage={speechMessage}
            complete={complete}
            progress={progressStats}
            streakCount={dailyProgress.count}
            collectedWords={collectedWords}
            isGenerating={isGenerating}
            missionReady={missionReady}
            notice={visibleNotice}
            noticeDismissible={noticeDismissible}
            onDismissNotice={() => setNotice("")}
            celebration={celebration}
            unitStyleLabel={unitStyleLabel}
            unitStyleEmoji={unitStyleEmoji}
            hasUnitStylePick={hasUnitStylePick}
            hasApiKey={hasApiKey}
            onPickUnitStyle={() => setStylePickerOpen(true)}
            onUnitVisible={(unit) => void requestUnitCover(unit)}
            onGenerate={beginLesson}
            onSample={() => startMission(true, screen === "home" ? "learn" : "home")}
            onSelectUnit={(unitNumber) => void chooseLessonUnit(unitNumber)}
            onBackWord={() => setActiveIndex((value) => Math.max(0, value - 1))}
            onNextWord={advanceLearnWord}
            onMarkMeaning={() => mark(activeWord, "meaning", true)}
            onSay={() => checkSpeech(activeWord)}
            onStory={() => setScreen("story")}
            onGame={() => setScreen("game")}
            onSpell={openSpellPractice}
            onReward={() => setScreen("reward")}
            onSummary={() => setScreen("summary")}
            onHome={() => setScreen("home")}
            onLearn={() => setScreen("learn")}
            onInput={handleSpellInput}
            onCheckSpell={() => handleSpell(activeWord)}
            onCreateVideo={startVideoReward}
            onGameAnswer={(word, correct) => mark(word, "meaning", correct)}
            onStoryContinue={() => transitionWithCheer("Story complete!", "game")}
            onGameContinue={continueGameToSpell}
            onSpellContinue={advanceSpellWord}
            onRewardSummary={() => transitionWithCheer("Mission complete! 🎉", "summary")}
          />
        )}
      </main>
      {stylePickerOpen && (
        <VisualStylePicker
          scope="unit"
          unitLabel={`Planet ${selection.unitNumber}`}
          currentId={currentUnitPick?.styleId ?? profile.visualStyleId ?? DEFAULT_STYLE_ID}
          currentNote={currentUnitPick?.styleNote ?? profile.visualStyleNote}
          onClose={() => setStylePickerOpen(false)}
          onApply={(id, note) => void applyStylePick(id, note)}
        />
      )}
      {pendingStyle && (
        <ConfirmStyleChange
          label={pendingStyle.label}
          hasVideo={isRewardVideoReady(video)}
          onCancel={() => setPendingStyle(null)}
          onApplyNext={() => {
            setPendingStyle(null);
            setNotice(`Style set to ${pendingStyle.label}. The next time you start this unit it will use the new look.`);
          }}
          onRedraw={() => {
            setPendingStyle(null);
            void regeneratePictures(pendingStyle);
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
  unitCovers,
  settings,
  mastery,
  video,
  activeIndex,
  activeWord,
  screen,
  spellInput,
  spellFeedback,
  spellShuffleSeed,
  speechMessage,
  complete,
  progress,
  streakCount,
  collectedWords,
  isGenerating,
  missionReady,
  notice,
  noticeDismissible,
  onDismissNotice,
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
  onLearn,
  onInput,
  onCheckSpell,
  onCreateVideo,
  onGameAnswer,
  onStoryContinue,
  onGameContinue,
  onSpellContinue,
  onRewardSummary,
  celebration,
  unitStyleLabel,
  unitStyleEmoji,
  hasUnitStylePick,
  hasApiKey,
  onPickUnitStyle,
  onUnitVisible
}: {
  pack: LessonPack;
  units: VocabularyUnit[];
  selection: VocabularySelection;
  unitSummaries: Record<number, UnitLessonSummary>;
  unitCovers: Record<number, UnitCoverAsset>;
  settings: AgnesSettings;
  mastery: MissionMastery;
  video: VideoTaskState;
  activeIndex: number;
  activeWord: WordEntry;
  screen: Screen;
  spellInput: string;
  spellFeedback: SpellingFeedback | null;
  spellShuffleSeed: number;
  speechMessage: string;
  complete: boolean;
  progress: ProgressStats;
  streakCount: number;
  collectedWords: WordEntry[];
  isGenerating: boolean;
  missionReady: boolean;
  notice: string;
  noticeDismissible: boolean;
  onDismissNotice: () => void;
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
  onLearn: () => void;
  onInput: (value: string) => void;
  onCheckSpell: () => void;
  onCreateVideo: () => void;
  onGameAnswer: (word: WordEntry, correct: boolean) => void;
  onStoryContinue: () => void;
  onGameContinue: () => void;
  onSpellContinue: () => void;
  onRewardSummary: () => void;
  celebration: { cheer: string } | null;
  unitStyleLabel: string;
  unitStyleEmoji: string;
  hasUnitStylePick: boolean;
  hasApiKey: boolean;
  onPickUnitStyle: () => void;
  onUnitVisible: (unit: VocabularyUnit) => void;
}) {
  const showLessonBoard = screen === "home";
  const showNoticeRow = Boolean(notice);
  const practiceGaps = rewardPracticeGaps(mastery, pack.words);
  return (
    <section className="mission-dashboard" aria-label="Word Planet mission dashboard">
      {showNoticeRow && (
        <div className="dashboard-notice-row">
          <Notice text={notice} dismissible={noticeDismissible} onDismiss={onDismissNotice} />
        </div>
      )}

      {showLessonBoard ? (
        <LessonBoard
          units={units}
          selection={selection}
          summaries={unitSummaries}
          covers={unitCovers}
          words={pack.words}
          missionReady={missionReady}
          isGenerating={isGenerating}
          progress={progress}
          streakCount={streakCount}
          collectedWords={collectedWords}
          selectedStyleLabel={unitStyleLabel}
          selectedStyleEmoji={unitStyleEmoji}
          onSelectUnit={onSelectUnit}
          onStart={onGenerate}
          onSample={onSample}
          onPickStyle={onPickUnitStyle}
          onUnitVisible={onUnitVisible}
        />
      ) : (
        <>
          <MissionStepper
            active={screen}
            complete={complete}
            gaps={practiceGaps}
            missionReady={missionReady}
            video={video}
            onLesson={onHome}
            onLearn={onLearn}
            onStory={onStory}
            onGame={missionReady ? onGame : onGenerate}
            onSpell={onSpell}
            onReward={onReward}
            onSummary={onSummary}
          />
          {screen === "learn" && (
            <div className="learning-hero">
              <section className="picture-panel">
                <img src={getWordImage(pack, activeWord.id)} alt={`${activeWord.word} illustration`} />
              </section>

              <CurrentWordPanel
                word={activeWord}
                settings={settings}
                activeIndex={activeIndex}
                totalWords={pack.words.length}
                onBack={onBackWord}
                onNext={onNextWord}
                onMarkMeaning={onMarkMeaning}
                onSay={onSay}
                speechMessage={speechMessage}
              />
            </div>
          )}

          {screen !== "learn" && (
            <section className="active-activity" aria-label="Current activity">
              {screen === "story" && <StoryQuestInline pack={pack} onContinue={onStoryContinue} />}
              {screen === "game" && <PictureGameInline pack={pack} onAnswer={onGameAnswer} onContinue={onGameContinue} />}
              {screen === "spell" && (
                <SpellingInline
                  word={activeWord}
                  settings={settings}
                  activeIndex={activeIndex}
                  totalWords={pack.words.length}
                  spellInput={spellInput}
                  feedback={spellFeedback}
                  shuffleSeed={spellShuffleSeed}
                  onInput={onInput}
                  onCheck={onCheckSpell}
                  onContinue={onSpellContinue}
                />
              )}
              {screen === "reward" && (
                <RewardInline
                  complete={complete}
                  pack={pack}
                  video={video}
                  onCreate={onCreateVideo}
                  onSummary={onRewardSummary}
                />
              )}
              {screen === "summary" && <SummaryScreen mastery={mastery} onContinue={onHome} onPracticeAgain={onSpell} />}
            </section>
          )}
        </>
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

export function LessonBoard({
  units,
  selection,
  summaries,
  covers,
  words,
  missionReady,
  isGenerating,
  progress,
  streakCount,
  collectedWords,
  selectedStyleLabel,
  selectedStyleEmoji,
  onSelectUnit,
  onStart,
  onSample,
  onPickStyle,
  onUnitVisible
}: {
  units: VocabularyUnit[];
  selection: VocabularySelection;
  summaries: Record<number, UnitLessonSummary>;
  covers: Record<number, UnitCoverAsset>;
  words: WordEntry[];
  missionReady: boolean;
  isGenerating: boolean;
  progress?: ProgressStats;
  streakCount?: number;
  collectedWords?: WordEntry[];
  selectedStyleLabel: string;
  selectedStyleEmoji: string;
  onSelectUnit: (unitNumber: number) => void;
  onStart: () => void;
  onSample: () => void;
  onPickStyle: () => void;
  onUnitVisible: (unit: VocabularyUnit) => void;
}) {
  const selectedUnit = units.find((unit) => unit.unitNumber === selection.unitNumber);
  const selectedSummary = summaries[selection.unitNumber];
  const selectedCover = covers[selection.unitNumber];
  const selectedStatus = unitStatusLabel(selectedSummary);

  return (
    <section className="lesson-board planet-board" aria-label="Choose a planet">
      <div className="lesson-board-header">
        <div>
          <h2>Choose a planet</h2>
          <p>Pick a planet, meet its word friends, then launch your mission.</p>
        </div>
        <span className="lesson-count">{units.length} planets</span>
      </div>

      <CompanionBubble
        mood="home"
        message={`Pip saved your map. ${streakCount ? `${streakCount}-day streak!` : "Start today's streak!"}`}
      />

      <button
        className="daily-mystery-box"
        type="button"
        aria-label="Open daily mystery box"
        onClick={() => {
          playFeedback("complete");
          speak("Mystery hint. Listen, match, spell, and your word zoo grows.", 0.95);
        }}
      >
        <div>
          <span className="mystery-box-icon" aria-hidden="true">?</span>
          <strong>Daily mystery box</strong>
          <small>Tap for today's tiny hint.</small>
        </div>
        <span>{progress?.collectedWords ?? 0} word friends</span>
      </button>

      <div className="lesson-unit-grid">
        {units.map((unit) => {
          const summary = summaries[unit.unitNumber];
          const selected = unit.unitNumber === selection.unitNumber;
          const hasCover = Boolean(covers[unit.unitNumber]?.imageUrl);
          return (
            <UnitCard
              key={unit.unitNumber}
              unit={unit}
              summary={summary}
              selected={selected}
              hasCover={hasCover}
              coverUrl={covers[unit.unitNumber]?.imageUrl}
              busy={isGenerating && selected}
              onSelect={() => onSelectUnit(unit.unitNumber)}
              onVisible={() => onUnitVisible(unit)}
            />
          );
        })}
      </div>

      <section className="lesson-detail-panel" aria-label="Planet detail">
        <div className="lesson-detail-cover" aria-hidden="true">
          {selectedCover?.imageUrl ? (
            <img src={selectedCover.imageUrl} alt="" />
          ) : (
            <span className={`lesson-cover-placeholder tone-${(((selectedUnit?.unitNumber ?? selection.unitNumber) - 1) % 5) + 1}`} />
          )}
        </div>
        <div>
          <span className="detail-kicker">Planet detail</span>
          <h3>
            Planet {selectedUnit?.unitNumber ?? selection.unitNumber}
            {selectedUnit ? `: ${selectedUnit.title}` : ""}
          </h3>
          <p>{selectedStatus} · {words.length} mission words</p>
        </div>
        <div className="lesson-word-preview">
          {words.map((word) => (
            <span key={word.id}>{word.word}</span>
          ))}
        </div>
        <div className="lesson-style-row" aria-label="Style for this unit">
          <span className="lesson-style-row-label">
            <Sparkles size={16} />
            Style for this unit
          </span>
          <span className="lesson-style-row-value">
            <span aria-hidden="true">{selectedStyleEmoji}</span>
            <strong>{selectedStyleLabel}</strong>
          </span>
          {!isGenerating && (
            <button className="link-button" type="button" onClick={onPickStyle}>
              Change
            </button>
          )}
        </div>
        <div className="button-row">
          <button
            className={`primary-button ${isGenerating ? "busy-button" : ""}`}
            type="button"
            onClick={() => {
              if (!isGenerating) onStart();
            }}
            aria-disabled={isGenerating}
            aria-live={isGenerating ? "polite" : undefined}
            data-busy={isGenerating ? "true" : undefined}
          >
            {isGenerating && <Loader2 className="spin" size={18} />}
            {missionReady ? "Resume Lesson" : isGenerating ? "Preparing lesson" : "Start Lesson"}
            {!isGenerating && <ArrowRight size={18} />}
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

      <WordZooPreview words={collectedWords ?? []} />
    </section>
  );
}

function CompanionBubble({ mood, message }: { mood: "home" | "learn" | "cheer"; message: string }) {
  return (
    <aside className={`companion-bubble ${mood}`} aria-label="Pip the pocket planet">
      <span className="companion-face" aria-hidden="true">✦</span>
      <p>{message}</p>
    </aside>
  );
}

function WordZooPreview({ words }: { words: WordEntry[] }) {
  const previewWords = words.slice(0, 6);
  return (
    <section className="word-zoo-preview" aria-label="Word Zoo">
      <div className="word-zoo-header">
        <strong>Word Zoo</strong>
        <span>{words.length} collected</span>
      </div>
      <div className="word-zoo-grid">
        {previewWords.length > 0 ? (
          previewWords.map((word) => (
            <span className="word-zoo-card" key={word.id}>
              <b>{word.word}</b>
              <small>{word.meaningZh}</small>
            </span>
          ))
        ) : (
          <span className="word-zoo-empty">Master a word to hatch your first friend.</span>
        )}
      </div>
    </section>
  );
}

// A single picker-grid tile that registers itself with an IntersectionObserver
// and asks the App to generate its cover on first visibility. Once the
// observer has fired we tear it down so re-renders don't re-fire the
// scheduler enqueue (the scheduler dedupes by job id, but skipping the
// extra call keeps things tidy).
function UnitCard({
  unit,
  summary,
  selected,
  hasCover,
  coverUrl,
  busy,
  onSelect,
  onVisible
}: {
  unit: VocabularyUnit;
  summary?: UnitLessonSummary;
  selected: boolean;
  hasCover: boolean;
  coverUrl?: string;
  busy?: boolean;
  onSelect: () => void;
  onVisible: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const firedRef = useRef(false);
  useEffect(() => {
    if (hasCover) return;
    if (firedRef.current) return;
    const node = buttonRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      // Older browsers / jsdom: just request immediately so something fills in.
      firedRef.current = true;
      onVisible();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !firedRef.current) {
            firedRef.current = true;
            onVisible();
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasCover, onVisible]);

  return (
    <button
      ref={buttonRef}
      className={`lesson-unit-card ${selected ? "selected" : ""} ${busy ? "busy" : ""}`}
      type="button"
      aria-label={`Planet ${unit.unitNumber}: ${unit.title}. ${unit.wordCount} words. ${unitStatusLabel(summary)}.`}
      onClick={onSelect}
    >
      <span className="lesson-card-cover" aria-hidden="true">
        {coverUrl ? (
          <img src={coverUrl} alt="" />
        ) : (
          <span className={`lesson-cover-placeholder tone-${((unit.unitNumber - 1) % 5) + 1}`} />
        )}
      </span>
      <span className="lesson-card-top">
        <span className="lesson-unit-number">Planet {unit.unitNumber}</span>
        <span className={`lesson-status ${unitStatusLabel(summary).toLowerCase().replace(" ", "-")}`}>
          {busy ? "Generating" : compactUnitStatusLabel(summary)}
        </span>
      </span>
      <strong>{unit.title}</strong>
      <span className="lesson-card-meta">
        <small>{unit.wordCount} words</small>
      </span>
    </button>
  );
}

function CurrentWordPanel({
  word,
  settings,
  activeIndex,
  totalWords,
  onBack,
  onNext,
  onMarkMeaning,
  onSay,
  speechMessage
}: {
  word: WordEntry;
  settings: AgnesSettings;
  activeIndex: number;
  totalWords: number;
  onBack: () => void;
  onNext: () => void;
  onMarkMeaning: () => void;
  onSay: () => void;
  speechMessage: string;
}) {
  return (
    <section className="word-focus-card">
      <div className="word-progress-toolbar">
        <span>{activeIndex + 1} / {totalWords}</span>
      </div>
      <div className="word-focus-content">
        <span className="new-badge">
          <Star size={20} fill="currentColor" />
          New
        </span>
        <div className="word-title-group">
          <h2>{word.word}</h2>
          <p className="meaning">{word.meaningZh}</p>
        </div>
        <div className="word-audio-row">
          <button className="audio-orb" onClick={() => speak(word.word, 1)} aria-label={`Listen to ${word.word}`}>
            <Volume2 />
          </button>
          <button className="slow-chip" onClick={() => speak(word.word, 0.65)}>
            <span>🐢</span>
            慢速播放
          </button>
        </div>
        <div className="word-action-cluster">
          <button className="say-button" onClick={onSay}>
            <Mic size={19} />
            Say this word
          </button>
          {speechMessage && <p className="speech-message">{speechMessage}</p>}
          {word.example && (
            <div className="sentence-box">
              <button className="mini-sound" onClick={() => speak(word.example, 1)}>
                <Volume2 size={16} />
              </button>
              <span>{word.example}</span>
              {word.exampleZh && <small>{word.exampleZh}</small>}
            </div>
          )}
          <div className="button-row centered">
            <button className="icon-button word-nav-button" onClick={onBack} disabled={activeIndex === 0} aria-label="Previous word">
              <ChevronLeft />
            </button>
            <button className="secondary-button" onClick={onMarkMeaning}>
              I know it
            </button>
            <button className="primary-button" onClick={onNext}>
              Next
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function StoryQuestInline({ pack, onContinue }: { pack: LessonPack; onContinue: () => void }) {
  const [sceneIndex, setSceneIndex] = useState(0);
  // Total scene slots: real Agnes packs aim for 3 lazy scenes; sample packs
  // ship 3 placeholder scenes. While Agnes scenes are still streaming in,
  // we render placeholders for slots that don't have a scene yet so the
  // kid sees progress without being blocked.
  const expectedScenes = pack.source === "agnes" ? 3 : Math.max(pack.storyScenes.length, 1);
  const scene = pack.storyScenes[sceneIndex];
  const totalReady = pack.storyScenes.length;
  const showPlaceholder = !scene && pack.source === "agnes";

  function back() {
    setSceneIndex((value) => Math.max(0, value - 1));
  }
  function next() {
    if (sceneIndex < expectedScenes - 1) {
      setSceneIndex((value) => Math.min(expectedScenes - 1, value + 1));
    } else {
      onContinue();
    }
  }

  const sceneWords = useMemo(() => scene?.text.split(/(\s+)/) ?? [], [scene?.text]);

  return (
    <div className="inline-activity story">
      {showPlaceholder ? (
        <div className="story-scene-placeholder">
          <Loader2 className="spin" size={42} />
          <span>Drawing scene {sceneIndex + 1}…</span>
        </div>
      ) : scene ? (
        <img src={scene.imageUrl} alt={scene.title} />
      ) : null}
      <div>
        <h3>{scene?.title ?? `Scene ${sceneIndex + 1}`}</h3>
        {scene?.text ? (
          <p className="story-readable-text">
            {sceneWords.map((part, index) => {
              if (/^\s+$/.test(part)) return part;
              const cleanWord = part.replace(/^[^\w]+|[^\w]+$/g, "");
              return (
                <button
                  className="story-word-button"
                  key={`${part}-${index}`}
                  type="button"
                  onClick={() => cleanWord && speak(cleanWord, 0.9)}
                >
                  {part}
                </button>
              );
            })}
          </p>
        ) : (
          <p>Your story scene is being drawn…</p>
        )}
        {scene?.textZh && <small>{scene.textZh}</small>}
        {scene?.text && (
          <button className="secondary-button story-read-button" type="button" onClick={() => speak(scene.text, 0.88)}>
            <Volume2 size={18} />
            Read scene
          </button>
        )}
        <div className="story-scene-progress" aria-label="Story scenes ready">
          {Array.from({ length: expectedScenes }).map((_, i) => (
            <span key={i} className={`story-scene-dot ${i < totalReady ? "ready" : "pending"} ${i === sceneIndex ? "current" : ""}`} />
          ))}
        </div>
        <div className="button-row">
          <button className="secondary-button" type="button" onClick={back} disabled={sceneIndex === 0}>
            <ChevronLeft size={18} />
            Back
          </button>
          <button className="primary-button" type="button" onClick={next}>
            {sceneIndex < expectedScenes - 1 ? "Next scene" : "Start Picture Game"}
            {sceneIndex < expectedScenes - 1 ? <ArrowRight size={18} /> : <Gamepad2 size={18} />}
          </button>
        </div>
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
  const [gameIndex, setGameIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const target = pack.words[Math.min(gameIndex, pack.words.length - 1)] ?? pack.words[0];
  const selectedCorrect = selectedId === target.id;
  const isLastGame = gameIndex >= pack.words.length - 1;
  const choices = useMemo(() => {
    const baseChoices = pack.words.slice(0, 3).some((word) => word.id === target.id)
      ? pack.words.slice(0, 3)
      : [target, ...pack.words.filter((word) => word.id !== target.id).slice(0, 2)];
    const shuffled = seededShuffle(baseChoices, `${pack.id}:${target.id}:${gameIndex}`);
    if (shuffled.length > 1 && shuffled[0]?.id === target.id) {
      return [...shuffled.slice(1), shuffled[0]];
    }
    return shuffled;
  }, [gameIndex, pack.id, pack.words, target.id]);

  function choose(word: WordEntry) {
    setSelectedId(word.id);
    onAnswer(target, word.id === target.id);
  }

  function advance() {
    if (isLastGame) {
      onContinue();
      return;
    }
    setGameIndex((value) => Math.min(pack.words.length - 1, value + 1));
    setSelectedId(null);
  }

  return (
    <div className="inline-activity game">
      <div>
        <h3>Which one is a {target.word}?</h3>
        <button className="secondary-button picture-prompt-audio" type="button" onClick={() => speak(target.word, 0.9)}>
          <Volume2 size={18} />
          Hear the word
        </button>
        <div className="mini-choice-grid">
          {choices.map((word) => (
            <button
              className="picture-choice"
              key={word.id}
              onClick={() => choose(word)}
              onMouseEnter={() => speak(word.word, 0.95)}
              onFocus={() => speak(word.word, 0.95)}
            >
              <img src={getWordImage(pack, word.id)} alt={`${word.word} picture`} />
              <span>{word.word}</span>
              <small>{word.meaningZh}</small>
              {selectedId === word.id && selectedCorrect && <Check className="choice-check" />}
            </button>
          ))}
        </div>
        {selectedId && (
          <p className="choice-feedback">{selectedCorrect ? "Nice picture match!" : "Good try. Look at the picture clue again."}</p>
        )}
        <button className="primary-button" onClick={advance}>
          {isLastGame ? "Go to Spelling" : "Next game"}
          {isLastGame ? <Pencil size={18} /> : <ArrowRight size={18} />}
        </button>
      </div>
    </div>
  );
}

function SpellingInline({
  word,
  settings,
  activeIndex,
  totalWords,
  spellInput,
  feedback,
  shuffleSeed,
  onInput,
  onCheck,
  onContinue
}: {
  word: WordEntry;
  settings: AgnesSettings;
  activeIndex: number;
  totalWords: number;
  spellInput: string;
  feedback: SpellingFeedback | null;
  shuffleSeed: number;
  onInput: (value: string) => void;
  onCheck: () => void;
  onContinue: () => void;
}) {
  const tiles = useMemo(() => buildShuffledLetterTiles(word.word, shuffleSeed), [shuffleSeed, word.word]);
  const [selectedTiles, setSelectedTiles] = useState<string[]>([]);
  const lastAutoCheckedRef = useRef<string | null>(null);
  const selectedLetters = selectedTiles.map((tileId) => tiles.find((tile) => tile.id === tileId)?.letter ?? "");

  useEffect(() => {
    setSelectedTiles([]);
    onInput("");
  }, [onInput, word.id]);

  useEffect(() => {
    setSelectedTiles([]);
  }, [shuffleSeed]);

  const isLastWord = activeIndex >= totalWords - 1;

  useEffect(() => {
    if (spellInput.length !== word.word.length) {
      lastAutoCheckedRef.current = null;
      return;
    }
    if (lastAutoCheckedRef.current === spellInput) return;
    lastAutoCheckedRef.current = spellInput;
    onCheck();
  }, [onCheck, spellInput, word.word.length]);

  function selectTile(tileId: string, letter: string) {
    if (selectedTiles.includes(tileId) || spellInput.length >= word.word.length) return;
    const nextTiles = [...selectedTiles, tileId];
    setSelectedTiles(nextTiles);
    onInput(`${spellInput}${letter}`);
  }

  function removeSelectedTile(index: number) {
    if (!selectedTiles[index]) return;
    const nextTiles = selectedTiles.filter((_, tileIndex) => tileIndex !== index);
    setSelectedTiles(nextTiles);
    onInput(
      nextTiles
        .map((tileId) => tiles.find((tile) => tile.id === tileId)?.letter ?? "")
        .join("")
    );
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
        <div
          className={`spell-answer ${feedback?.kind ?? ""} ${feedback?.kind === "retry" ? "shake" : ""}`}
          aria-label="Spelling answer"
        >
          {Array.from({ length: word.word.length }).map((_, index) => {
            const letter = selectedLetters[index];
            return (
              <button
                key={index}
                className={`spell-box ${letter ? "filled" : "empty"}`}
                type="button"
                onClick={() => removeSelectedTile(index)}
                disabled={!letter}
                aria-label={letter ? `Remove ${letter}` : `Letter ${index + 1}`}
              >
                {letter}
              </button>
            );
          })}
        </div>
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
        {feedback?.kind === "retry" && (
          <div className={`spell-feedback ${feedback.kind}`} role="status" aria-live="polite">
            <strong>Try again</strong>
            <span>Your answer: {feedback.attempt || "(blank)"}</span>
            <span>The word is {feedback.word}.</span>
            <button className="secondary-button" type="button" onClick={clearAnswer}>
              Try again
            </button>
          </div>
        )}
        <div className="button-row spelling-actions">
          <button className="secondary-button" onClick={clearAnswer} type="button">Clear</button>
          <button className="finish-button" onClick={onContinue}>
            {isLastWord ? "Unlock Reward Game" : "Next word"}
            {isLastWord ? <Play size={18} /> : <ArrowRight size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}

const REWARD_BOARD_SIZE = 6;
const REWARD_MILESTONES = [6, 12, 24, 36];
export type RewardGameKind = "twin" | "monster" | "balloon";
const REWARD_GAME_KINDS: RewardGameKind[] = ["twin", "monster", "balloon"];

function hashRewardGameKey(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash, 31) + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

function pickRewardGame(packId: string): RewardGameKind {
  const index = Math.abs(hashRewardGameKey(packId)) % REWARD_GAME_KINDS.length;
  return REWARD_GAME_KINDS[index];
}

function rewardItemToWordEntry(item: RewardWordItem): WordEntry {
  return {
    id: item.wordId,
    word: item.word,
    meaningZh: item.word,
    wordType: "noun",
    topic: "reward",
    level: "A1 Movers",
    example: "",
    exampleZh: "",
    imagePromptHint: "",
    spellingDifficulty: "easy",
    pronunciationNote: ""
  };
}

function wordEntryForRewardItem(pack: LessonPack, item: RewardWordItem): WordEntry {
  return pack.words.find((word) => word.id === item.wordId) ?? rewardItemToWordEntry(item);
}

function HungryMonsterGame({ pack, onComplete }: { pack: LessonPack; onComplete: () => void }) {
  const targetTotal = 10;
  const targets = useMemo(() => buildRewardWordPool(pack.words, targetTotal), [pack.id, pack.words]);
  const [progress, setProgress] = useState(0);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const currentTarget = targets[Math.min(progress, targets.length - 1)];
  const targetWord = currentTarget ? wordEntryForRewardItem(pack, currentTarget) : null;
  const choices = useMemo(
    () => (targetWord ? buildRewardChoices(pack.words, targetWord, 4, `${pack.id}-monster-${progress}`) : []),
    [pack, pack.id, progress, targetWord]
  );
  const rescuePercent = Math.min(100, Math.round((progress / targetTotal) * 100));

  useEffect(() => {
    setProgress(0);
    setFeedbackId(null);
  }, [pack.id]);

  function chooseWord(choice: RewardWordItem) {
    if (!targetWord || progress >= targetTotal) return;
    speak(choice.word, 1);
    setFeedbackId(choice.id);
    if (choice.wordId !== targetWord.id) return;

    const nextProgress = progress + 1;
    setProgress(nextProgress);
    if (nextProgress >= targetTotal) onComplete();
  }

  return (
    <div className="reward-board-shell reward-mini-game">
      <div className="reward-monster-stage">
        <div className="reward-monster-face" aria-hidden="true">
          <span className="monster-eye" />
          <span className="monster-eye" />
          <span className="monster-mouth" />
        </div>
        <div className="reward-target-card" data-current-target={targetWord?.word ?? ""}>
          <span>Feed me</span>
          <strong>{targetWord?.word ?? "hello"}</strong>
        </div>
      </div>
      <div className="rescue-meter" aria-label="Snack meter">
        <span style={{ width: `${rescuePercent}%` }} />
      </div>
      <div className="rescue-meter-copy">{progress}/{targetTotal} snacks delivered</div>
      <div className="reward-choice-grid" aria-label="Monster word choices">
        {choices.map((choice) => {
          const feedbackClass =
            feedbackId === choice.id ? (choice.wordId === targetWord?.id ? "correct" : "wrong") : "";
          return (
            <button
              className={`reward-choice-card ${feedbackClass}`}
              key={choice.id}
              type="button"
              onClick={() => chooseWord(choice)}
              data-word={choice.word}
              disabled={progress >= targetTotal}
            >
              <span className="reward-card-sound" aria-hidden="true"><Volume2 size={12} /></span>
              <span className="reward-card-word">{choice.word}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BalloonPopGame({ pack, onComplete }: { pack: LessonPack; onComplete: () => void }) {
  const targetTotal = 10;
  const targets = useMemo(() => buildRewardWordPool(pack.words, targetTotal), [pack.id, pack.words]);
  const [progress, setProgress] = useState(0);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const currentTarget = targets[Math.min(progress, targets.length - 1)];
  const targetWord = currentTarget ? wordEntryForRewardItem(pack, currentTarget) : null;
  const balloons = useMemo(
    () => (targetWord ? buildRewardChoices(pack.words, targetWord, 5, `${pack.id}-balloon-${progress}`) : []),
    [pack, pack.id, progress, targetWord]
  );
  const rescuePercent = Math.min(100, Math.round((progress / targetTotal) * 100));

  useEffect(() => {
    setProgress(0);
    setFeedbackId(null);
  }, [pack.id]);

  function popBalloon(choice: RewardWordItem) {
    if (!targetWord || progress >= targetTotal) return;
    speak(choice.word, 1);
    setFeedbackId(choice.id);
    if (choice.wordId !== targetWord.id) return;

    const nextProgress = progress + 1;
    setProgress(nextProgress);
    if (nextProgress >= targetTotal) onComplete();
  }

  return (
    <div className="reward-board-shell reward-mini-game">
      <div className="reward-balloon-stage">
        <div className="reward-target-card reward-balloon-target" data-current-target={targetWord?.word ?? ""}>
          <span>Pop</span>
          <strong>{targetWord?.word ?? "hello"}</strong>
        </div>
        <div className="reward-balloon-cloud" aria-label="Balloon word choices">
          {balloons.map((choice, index) => {
            const feedbackClass =
              feedbackId === choice.id ? (choice.wordId === targetWord?.id ? "pop" : "wrong") : "";
            return (
              <button
                className={`reward-balloon ${feedbackClass}`}
                key={choice.id}
                type="button"
                onClick={() => popBalloon(choice)}
                data-word={choice.word}
                disabled={progress >= targetTotal}
                style={{ ["--balloon-delay" as string]: `${index * 70}ms` }}
              >
                <span className="reward-card-sound" aria-hidden="true"><Volume2 size={12} /></span>
                <span className="reward-card-word">{choice.word}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="rescue-meter" aria-label="Balloon meter">
        <span style={{ width: `${rescuePercent}%` }} />
      </div>
      <div className="rescue-meter-copy">{progress}/{targetTotal} balloons popped</div>
    </div>
  );
}

export function RewardInline({
  complete,
  pack,
  video,
  onCreate,
  onSummary,
  rewardGame
}: {
  complete: boolean;
  pack: LessonPack;
  video: VideoTaskState;
  onCreate: () => void;
  onSummary: () => void;
  rewardGame?: RewardGameKind;
}) {
  const stageCopy = rewardStageCopy(video, complete);
  const videoReady = isRewardVideoReady(video);
  const showVideoPlayer = videoReady && Boolean(video.url);
  const inFlight = isRewardVideoInFlight(video);
  const activeGame = rewardGame ?? pickRewardGame(pack.id);
  const gameTitle = activeGame === "monster" ? "Hungry Monster" : activeGame === "balloon" ? "Balloon Pop" : "Word Card Rescue";
  const gameBubble =
    activeGame === "monster"
      ? "Feed the hungry helper."
      : activeGame === "balloon"
        ? "Pop the matching word."
        : "Pick a word, then find its twin.";
  const rescueTarget = REWARD_BOARD_SIZE * REWARD_BOARD_SIZE;
  const [rescueProgress, setRescueProgress] = useState(0);
  const [gameComplete, setGameComplete] = useState(false);
  const [selectedCell, setSelectedCell] = useState<RewardCell | null>(null);
  const [pairFlash, setPairFlash] = useState<"match" | "miss" | null>(null);
  const [rocketStickers, setRocketStickers] = useState<string[]>([]);
  const [board, setBoard] = useState<RewardBoard>(() =>
    buildRewardBoard({
      words: pack.words,
      pack,
      rows: REWARD_BOARD_SIZE,
      columns: REWARD_BOARD_SIZE,
      seed: pack.id
    })
  );
  const rescuePercent = Math.min(100, Math.round((rescueProgress / rescueTarget) * 100));
  const noMoves = board.length > 0 && !hasRewardMove(board);

  useEffect(() => {
    setBoard(
      buildRewardBoard({
        words: pack.words,
        pack,
        rows: REWARD_BOARD_SIZE,
        columns: REWARD_BOARD_SIZE,
        seed: pack.id
      })
    );
  }, [pack]);

  useEffect(() => {
    setRescueProgress(0);
    setGameComplete(false);
    setSelectedCell(null);
    setPairFlash(null);
    setRocketStickers([]);
  }, [pack.id, activeGame]);

  function clearTile(row: number, col: number) {
    if (gameComplete) return;
    const tile = board[row]?.[col];
    if (!tile) return;
    speak(tile.label, 1);

    if (!selectedCell) {
      setSelectedCell({ row, col });
      setPairFlash(null);
      return;
    }

    if (selectedCell.row === row && selectedCell.col === col) {
      setSelectedCell(null);
      setPairFlash(null);
      return;
    }

    const result = clearRewardPair(board, selectedCell, { row, col });
    if (result.cleared === 0) {
      setSelectedCell({ row, col });
      setPairFlash("miss");
      return;
    }

    const wordClears = result.tiles.filter((tile) => tile.kind === "word").length;
    const nextProgress = Math.min(rescueTarget, rescueProgress + wordClears);
    setSelectedCell(null);
    setPairFlash("match");
    setBoard(result.board);
    setRescueProgress(nextProgress);
    if (nextProgress >= rescueTarget) setGameComplete(true);
  }

  return (
    <div className="inline-activity reward">
      <section className={`reward-clear-game ${gameComplete ? "complete" : ""}`} aria-label="Word Card Rescue">
        <div className="reward-scene-top">
          <div className="reward-clear-header">
            <div>
              <p className="reward-kicker">Reward Game</p>
              <h3>{gameTitle}</h3>
            </div>
            <div className="reward-rescue-bubble">{gameBubble}</div>
          </div>
          <div className="reward-rescue-trail" aria-label="Rescue milestones">
            {REWARD_MILESTONES.map((milestone) => (
              <div className={`reward-milestone ${rescueProgress >= milestone ? "done" : ""}`} key={milestone}>
                <span>{milestone}</span>
                <small>cards</small>
              </div>
            ))}
          </div>
        </div>

        <div className="reward-rescue-layout">
          {activeGame === "monster" ? (
            <HungryMonsterGame pack={pack} onComplete={() => setGameComplete(true)} />
          ) : activeGame === "balloon" ? (
            <BalloonPopGame pack={pack} onComplete={() => setGameComplete(true)} />
          ) : (
            <div className="reward-board-shell">
            <p className={`reward-guidance ${pairFlash ?? ""}`}>
              {gameComplete
                ? "Planet rescued! Your video bonus is unlocked."
                : pairFlash === "miss"
                  ? "Not a match. That card is selected now."
                : selectedCell
                  ? "Card selected. Find its twin."
                : pairFlash === "match"
                    ? "Pair cleared! Pick your next match."
                  : "Tap a word, then find its twin."}
            </p>
            <div className="rescue-meter" aria-label="Rescue meter">
              <span style={{ width: `${rescuePercent}%` }} />
            </div>
            <div className="rescue-meter-copy">{rescueProgress}/{rescueTarget} word cards rescued</div>
            {noMoves && !gameComplete && <p className="reward-guidance">No pairs left. Try the remaining cards again.</p>}
            <div className="reward-clear-board" role="grid" aria-label="Reward word card board">
              {board.map((row, rowIndex) =>
                row.map((tile, colIndex) => {
                  if (!tile) {
                    return (
                      <div
                        className="reward-clear-slot empty"
                        key={`empty-${rowIndex}-${colIndex}`}
                        role="gridcell"
                        aria-label="Cleared card"
                      />
                    );
                  }
                  const isSelected = selectedCell?.row === rowIndex && selectedCell.col === colIndex;
                  return (
                    <button
                      className={`reward-clear-tile ${tile.kind} ${isSelected ? "selected" : ""} ${pairFlash === "match" ? "pair-pop" : ""}`}
                      key={tile.id}
                      type="button"
                      role="gridcell"
                      onClick={() => clearTile(rowIndex, colIndex)}
                      disabled={gameComplete}
                      data-token={tile.token}
                      aria-pressed={isSelected}
                      aria-label={`${tile.label}${isSelected ? ", selected" : ""}`}
                    >
                      <span className="reward-card-sound" aria-hidden="true"><Volume2 size={12} /></span>
                      {tile.kind === "picture" && tile.imageUrl ? (
                        <img src={tile.imageUrl} alt="" />
                      ) : (
                        <span className="reward-card-word">{tile.label}</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
          )}
        </div>
      </section>

      {gameComplete && (
        <section className="video-bonus" aria-label="Video Bonus">
          <div className="video-bonus-header">
            <Trophy size={28} />
            <h3>Video Bonus</h3>
          </div>
          {showVideoPlayer ? (
            <video controls src={video.url} />
          ) : (
            <div className="video-placeholder" role={inFlight ? "status" : undefined} aria-live={inFlight ? "polite" : undefined}>
              {inFlight ? <Loader2 className="spin" size={48} /> : <Play size={58} />}
              <span>{video.error ?? stageCopy}</span>
              {inFlight && video.progress > 0 && (
                <progress className="video-progress" max={100} value={video.progress} aria-label="Reward video progress" />
              )}
              {inFlight && (
                <RocketDecoratingLoop
                  stickers={rocketStickers}
                  onAddSticker={() => {
                    const stickerSet = ["star", "zap", "heart", "moon", "gem"];
                    setRocketStickers((current) => [...current, stickerSet[current.length % stickerSet.length]].slice(-8));
                    playFeedback("correct");
                  }}
                />
              )}
            </div>
          )}
          <div className="button-row centered">
            <button
              className={`primary-button ${inFlight ? "busy-button" : ""}`}
              onClick={onCreate}
              disabled={inFlight}
              aria-disabled={inFlight}
              data-busy={inFlight ? "true" : undefined}
            >
              {videoReady ? "Make a new reward" : inFlight ? "Working..." : "Create reward"}
            </button>
          </div>
        </section>
      )}

      <div className="button-row centered">
        <button className="secondary-button" onClick={onSummary}>Summary</button>
      </div>
    </div>
  );
}

function RocketDecoratingLoop({ stickers, onAddSticker }: { stickers: string[]; onAddSticker: () => void }) {
  return (
    <div className="rocket-loop" aria-label="Decorate the delivery rocket">
      <button className="rocket-button" type="button" onClick={onAddSticker}>
        <span className="rocket-body" aria-hidden="true">
          <span className="rocket-window" />
          {stickers.map((sticker, index) => (
            <span className={`rocket-sticker ${sticker}`} key={`${sticker}-${index}`} />
          ))}
        </span>
        <span>Tap to decorate the rocket</span>
      </button>
    </div>
  );
}

function rewardStageCopy(video: VideoTaskState, complete: boolean): string {
  switch (video.stage) {
    case "writing-story":
      return "✍️ Writing your story…";
    case "creating-task":
      return "🎬 Asking Agnes to draw your video…";
    case "rendering":
      return "🎨 Drawing your video — about a minute.";
    case "downloading":
      return "📥 Almost ready — downloading…";
    default:
      if (video.status === "completed" && !video.url && !video.blob) return "Sample reward ready";
      if (video.status === "failed") return video.error ?? "Reward video failed. Tap to try again.";
      return complete ? "Video status: ready" : "Complete the highlighted phases to unlock your reward.";
  }
}

type MissionStepperItem = {
  id: "lesson" | "learn" | "story" | "game" | "spell" | "reward" | "summary";
  label: string;
  icon: LucideIcon;
  completed: boolean;
  progressLabel?: string;
  disabled?: boolean;
  onClick: () => void;
};

function MissionStepper({
  active,
  complete,
  gaps,
  missionReady,
  video,
  onLesson,
  onLearn,
  onStory,
  onGame,
  onSpell,
  onReward,
  onSummary
}: {
  active: Screen;
  complete: boolean;
  gaps: PracticeGap[];
  missionReady: boolean;
  video: VideoTaskState;
  onLesson: () => void;
  onLearn: () => void;
  onStory: () => void;
  onGame: () => void;
  onSpell: () => void;
  onReward: () => void;
  onSummary: () => void;
}) {
  const activeStep: MissionStepperItem["id"] =
    active === "learn" || active === "story" || active === "game" || active === "spell" || active === "reward" || active === "summary"
      ? active
      : "lesson";
  const meaningGap = gaps.find((gap) => gap.lane === "meaning");
  const spellingGap = gaps.find((gap) => gap.lane === "write");
  const items: MissionStepperItem[] = [
    {
      id: "lesson",
      label: "Lesson",
      icon: LayoutGrid,
      completed: active !== "home",
      onClick: onLesson
    },
    {
      id: "learn",
      label: "Learn",
      icon: BookOpen,
      completed: active !== "home" && active !== "learn",
      disabled: !missionReady,
      onClick: onLearn
    },
    {
      id: "story",
      label: "Story",
      icon: ClipboardList,
      completed: ["game", "spell", "reward", "summary"].includes(active),
      disabled: !missionReady,
      onClick: onStory
    },
    {
      id: "game",
      label: "Game",
      icon: Gamepad2,
      completed: ["spell", "reward", "summary"].includes(active) && !meaningGap,
      progressLabel: meaningGap ? `${meaningGap.completed}/${meaningGap.total}` : undefined,
      disabled: !missionReady,
      onClick: onGame
    },
    {
      id: "spell",
      label: "Spell",
      icon: Pencil,
      completed: ["reward", "summary"].includes(active) && !spellingGap,
      progressLabel: spellingGap ? `${spellingGap.completed}/${spellingGap.total}` : undefined,
      disabled: !missionReady,
      onClick: onSpell
    },
    {
      id: "reward",
      label: "Reward",
      icon: Play,
      completed: video.status === "completed" || active === "summary",
      disabled: !missionReady,
      onClick: onReward
    },
    {
      id: "summary",
      label: "Summary",
      icon: Trophy,
      completed: complete,
      disabled: !complete && active !== "reward" && active !== "summary",
      onClick: onSummary
    }
  ];

  return (
    <nav className="mission-stepper" aria-label="Mission steps">
      {items.map((item, index) => {
        const Icon = item.icon;
        const status = item.id === activeStep ? "active" : item.completed ? "complete" : item.disabled ? "locked" : "ready";
        return (
          <button
            key={item.id}
            className={`mission-stepper-item ${status} ${item.progressLabel ? "needs-practice" : ""}`}
            onClick={item.onClick}
            disabled={item.disabled}
            aria-current={item.id === activeStep ? "step" : undefined}
          >
            <span className="stepper-step">{item.completed ? <Check size={16} /> : index + 1}</span>
            <Icon className="stepper-icon" />
            <span className="stepper-copy">
              <strong>{item.label}</strong>
              {item.progressLabel && <small className="stepper-progress-badge">{item.progressLabel}</small>}
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
  progress,
  streakCount,
  compact,
  onSetup
}: {
  profile: ChildProfile;
  missionTitle: string;
  progress: ProgressStats;
  streakCount: number;
  compact: boolean;
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
            <span className="star-pill">
              <Star size={19} fill="currentColor" /> {progress.stars}
            </span>
            <span className="star-pill gem-pill">
              <Gem size={18} fill="currentColor" /> {progress.gems}
            </span>
            <span className="star-pill streak-pill">
              <Sparkles size={18} /> {Math.max(streakCount, 0)}
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

export function Notice({
  text,
  dismissible = false,
  onDismiss
}: {
  text: string;
  dismissible?: boolean;
  onDismiss?: () => void;
}) {
  if (!text) return null;
  return (
    <div className="notice">
      <Sparkles size={18} />
      <span>{text}</span>
      {dismissible && onDismiss && (
        <button className="notice-close" type="button" aria-label="Dismiss notice" onClick={onDismiss}>
          <X size={16} />
        </button>
      )}
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
  scope = "profile",
  unitLabel,
  onClose,
  onApply
}: {
  currentId: string;
  currentNote?: string;
  scope?: "profile" | "unit";
  unitLabel?: string;
  onClose: () => void;
  onApply: (id: string, note?: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(currentId);
  const [note, setNote] = useState(currentNote ?? "");
  const [isRolling, setIsRolling] = useState(false);
  const rollTimers = useRef<number[]>([]);
  const heading = scope === "unit" ? `Style for ${unitLabel ?? "this unit"} ✨` : "Choose your world ✨";
  const hint =
    scope === "unit"
      ? "Pick a look just for this unit. We'll only start generating once you've chosen one."
      : "Pick a look for your pictures and videos. You can change it any time.";
  const concreteStyles = useMemo(() => VISUAL_STYLES.filter((style) => style.id !== DEFAULT_STYLE_ID), []);
  const selectedStyle = getStyle(selectedId) ?? getStyle(DEFAULT_STYLE_ID) ?? VISUAL_STYLES[0];
  const descriptorSummary =
    selectedId === DEFAULT_STYLE_ID
      ? "Tap Surprise Me to roll through the worlds and land on one picture style."
      : selectedStyle.descriptor.split(",").slice(0, 3).join(",") + ".";

  useEffect(() => {
    return () => {
      for (const timer of rollTimers.current) window.clearTimeout(timer);
    };
  }, []);

  function clearRollTimers() {
    for (const timer of rollTimers.current) window.clearTimeout(timer);
    rollTimers.current = [];
  }

  function randomConcreteStyleId(): string {
    const index = Math.floor(Math.random() * concreteStyles.length);
    return concreteStyles[index]?.id ?? concreteStyles[0]?.id ?? DEFAULT_STYLE_ID;
  }

  function rollSurpriseStyle() {
    clearRollTimers();
    const targetId = randomConcreteStyleId();
    const targetIndex = Math.max(0, concreteStyles.findIndex((style) => style.id === targetId));
    const steps = 9;
    setIsRolling(true);
    setNote("");
    for (let step = 0; step < steps; step += 1) {
      const timer = window.setTimeout(() => {
        const style = concreteStyles[(targetIndex + step) % concreteStyles.length] ?? concreteStyles[0];
        if (style) setSelectedId(style.id);
        if (step === steps - 1) {
          setSelectedId(targetId);
          setIsRolling(false);
          rollTimers.current = [];
        }
      }, 80 * (step + 1));
      rollTimers.current.push(timer);
    }
  }

  function selectStyle(id: string) {
    clearRollTimers();
    setIsRolling(false);
    setSelectedId(id);
  }

  function applySelectedStyle() {
    const id = selectedId === DEFAULT_STYLE_ID ? randomConcreteStyleId() : selectedId;
    onApply(id, id === DEFAULT_STYLE_ID || !note.trim() ? undefined : note);
  }

  return (
    <div className="media-viewer-backdrop" role="presentation" onClick={onClose}>
      <section
        className="media-viewer style-picker"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="media-viewer-header">
          <h2>{heading}</h2>
          <button className="media-viewer-close" type="button" aria-label="Close style picker" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="style-picker-body">
          <p className="style-picker-hint">{hint}</p>
          <div className="style-picker-layout">
            <section className={`style-featured-preview ${isRolling ? "rolling" : ""}`} aria-live="polite">
              <div className="style-featured-art-frame">
                <img className="style-featured-art" src={selectedStyle.thumbnailSrc} alt={`${selectedStyle.label} preview`} />
              </div>
              <div className="style-featured-copy">
                <span className="style-featured-kicker">{isRolling ? "Rolling..." : "Selected world"}</span>
                <h3 className="style-featured-title">{selectedStyle.label}</h3>
                <p>{descriptorSummary}</p>
              </div>
              <button className="secondary-button style-surprise-button" type="button" onClick={rollSurpriseStyle} disabled={isRolling}>
                <Sparkles size={18} />
                {isRolling ? "Rolling..." : "Surprise Me"}
              </button>
            </section>
            <div className="style-option-rail" aria-label="Style choices">
              {concreteStyles.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  className={`style-option style-card ${selectedId === style.id ? "selected" : ""} ${isRolling && selectedId === style.id ? "rolling" : ""}`}
                  onClick={() => selectStyle(style.id)}
                  aria-pressed={selectedId === style.id}
                >
                  <img src={style.thumbnailSrc} alt="" aria-hidden="true" />
                  <span className="style-card-emoji">{style.emoji}</span>
                  <span className="style-card-label">{style.label}</span>
                </button>
              ))}
            </div>
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
            <button className="primary-button" type="button" onClick={applySelectedStyle} disabled={isRolling}>
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
      items?: { title: string; src: string; alt: string }[];
      index?: number;
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
  onDeleteCovers,
  isVideoBusy,
  coverCount,
  coverPreview,
  coverPreviews
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
  onDeleteCovers: () => void;
  isVideoBusy: boolean;
  coverCount: number;
  coverPreview?: UnitCoverAsset;
  coverPreviews?: UnitCoverAsset[];
}) {
  const [agnesTest, setAgnesTest] = useState<TestState>({ status: "idle" });
  const [mediaViewer, setMediaViewer] = useState<MediaViewerState | null>(null);

  async function runTest(setState: (state: TestState) => void, action: () => Promise<void>) {
    setState({ status: "testing" });
    try {
      await action();
      setState({ status: "ok", message: "Connected" });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Test failed" });
    }
  }

  const imageCount = pack?.assets.length ?? 0;
  const storyCount = pack?.storyScenes.length ?? 0;
  const videoReady = isRewardVideoReady(video);
  const videoInFlight = isRewardVideoInFlight(video);
  const hasCachedPictures = imageCount + storyCount > 0;
  const hasCachedVideo = !video.stage && Boolean(video.blob || video.url);
  const videoCount = hasCachedVideo ? 1 : 0;
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
  const firstCachedPicture = cachedPictures[0];
  const canPreviewVideo = !video.stage && Boolean(video.url);
  const coverPreviewItems = (coverPreviews ?? (coverPreview ? [coverPreview] : [])).map((cover) => ({
    title: `Unit ${cover.unitNumber} cover`,
    src: cover.imageUrl,
    alt: `Cached cover for unit ${cover.unitNumber}`
  }));
  const firstCoverPreview = coverPreviewItems[0];
  const canPreviewCover = Boolean(firstCoverPreview?.src);

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
        <p className="fine-print">Changing the set, book, or unit starts a fresh mission word list.</p>
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
          <label>
            Text model
            <input value={settings.textModel} onChange={(event) => onSettings({ ...settings, textModel: event.target.value })} />
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
            {cachedPictures.map((picture, index) => (
              <button
                className="cache-preview-button"
                key={picture.id}
                type="button"
                onClick={() =>
                  setMediaViewer({
                    type: "image",
                    title: picture.title,
                    src: picture.src,
                    alt: picture.alt,
                    items: cachedPictures,
                    index
                  })
                }
              >
                <img src={picture.src} alt={picture.alt} />
                <span>{picture.title}</span>
              </button>
            ))}
          </div>
        )}
        <div className="button-row cache-actions parent-action-row">
          <button
            className="secondary-button parent-action-button"
            type="button"
            onClick={() => {
              if (!firstCachedPicture) return;
              setMediaViewer({
                type: "image",
                title: firstCachedPicture.title,
                src: firstCachedPicture.src,
                alt: firstCachedPicture.alt,
                items: cachedPictures,
                index: 0
              });
            }}
            disabled={!firstCachedPicture}
          >
            <Eye size={18} />
            Preview pictures
          </button>
          <button
            className="secondary-button danger-button parent-action-button"
            type="button"
            onClick={onDeletePictures}
            disabled={!hasCachedPictures}
          >
            <Trash2 size={18} />
            Delete pictures
          </button>
        </div>
      </section>

      <section className="setup-card media-cache-card">
        <h2>Cached covers</h2>
        <div className="cache-stat-grid">
          <span>
            <strong>{coverCount}</strong>
            Unit covers
          </span>
          <span>
            <strong>{bookUnits.length}</strong>
            Book units
          </span>
        </div>
        <div className="button-row cache-actions parent-action-row">
          <button
            className="secondary-button parent-action-button"
            type="button"
            onClick={() => {
              if (!firstCoverPreview) return;
              setMediaViewer({
                type: "image",
                title: firstCoverPreview.title,
                src: firstCoverPreview.src,
                alt: firstCoverPreview.alt,
                items: coverPreviewItems,
                index: 0
              });
            }}
            disabled={!canPreviewCover}
          >
            <Eye size={18} />
            Preview covers
          </button>
          <button
            className="secondary-button danger-button parent-action-button"
            type="button"
            onClick={onDeleteCovers}
            disabled={coverCount === 0}
          >
            <Trash2 size={18} />
            Delete covers
          </button>
        </div>
      </section>

      <section className="setup-card media-cache-card">
        <h2>Cached video</h2>
        <div className="cache-stat-grid">
          <span>
            <strong>{videoCount}</strong>
            Reward videos
          </span>
        </div>
        {videoReady && video.url ? (
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
          <div className="video-cache-empty">{video.error ?? (videoInFlight ? rewardStageCopy(video, true) : "No cached reward video yet.")}</div>
        )}
        <div className="button-row cache-actions parent-action-row">
          <button
            className="secondary-button parent-action-button"
            type="button"
            onClick={() => setMediaViewer({ type: "video", title: "Cached reward video", src: video.url ?? "" })}
            disabled={!canPreviewVideo}
          >
            <Eye size={18} />
            Preview video
          </button>
          <button
            className="secondary-button danger-button parent-action-button"
            type="button"
            onClick={onDeleteVideo}
            disabled={isVideoBusy || !hasCachedVideo}
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
              <>
                <img src={mediaViewer.src} alt={mediaViewer.alt} />
                {mediaViewer.items && mediaViewer.items.length > 1 && (
                  <div className="media-viewer-controls">
                    <button
                      className="secondary-button"
                      type="button"
                      aria-label="Previous media"
                      onClick={() =>
                        setMediaViewer((current) => {
                          if (!current || current.type !== "image" || !current.items?.length) return current;
                          const index = (((current.index ?? 0) - 1 + current.items.length) % current.items.length);
                          const item = current.items[index];
                          return { ...current, ...item, index };
                        })
                      }
                    >
                      <ChevronLeft size={18} />
                      Previous
                    </button>
                    <span>
                      {(mediaViewer.index ?? 0) + 1} / {mediaViewer.items.length}
                    </span>
                    <button
                      className="secondary-button"
                      type="button"
                      aria-label="Next media"
                      onClick={() =>
                        setMediaViewer((current) => {
                          if (!current || current.type !== "image" || !current.items?.length) return current;
                          const index = ((current.index ?? 0) + 1) % current.items.length;
                          const item = current.items[index];
                          return { ...current, ...item, index };
                        })
                      }
                    >
                      Next
                      <ChevronRight size={18} />
                    </button>
                  </div>
                )}
              </>
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
