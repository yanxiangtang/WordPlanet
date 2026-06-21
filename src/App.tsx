import {
  ArrowRight,
  Backpack,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronDown,
  ClipboardList,
  Gamepad2,
  Gem,
  GraduationCap,
  ImageIcon,
  Info,
  Loader2,
  Mic,
  Pencil,
  Play,
  RefreshCcw,
  Rocket,
  Settings,
  Sparkles,
  School,
  Star,
  Trophy,
  Users,
  Volume2
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { selectDailyWords } from "./data/vocabulary";
import { createAgnesVideoTask, pickArtStyle, pollAgnesVideo, testAgnesConnection, videoRewardPrompt } from "./lib/agnes";
import { buildAgnesLessonPack, buildSampleLessonPack, getWordImage, TEXT_FREE_ASSET_VERSION } from "./lib/lesson";
import { createEmptyMastery, isMissionComplete, laneProgress, recordMasteryResult } from "./lib/mastery";
import { listenForWord, speak, speechRecognitionSupported } from "./lib/speech";
import { buildShuffledLetterTiles } from "./lib/spelling";
import {
  defaultProfile,
  defaultSettings,
  loadProfile,
  loadSettings,
  saveProfile,
  saveSettings,
  storage
} from "./lib/storage";
import type { AgnesSettings, ChildProfile, LessonPack, MissionMastery, VideoTaskState, WordEntry } from "./types";

type Screen = "setup" | "home" | "learn" | "story" | "game" | "spell" | "reward" | "summary";

const dailyWords = selectDailyWords("school", 5);

function App() {
  const [settings, setSettings] = useState<AgnesSettings>(() => (typeof window === "undefined" ? defaultSettings : loadSettings()));
  const [profile, setProfile] = useState<ChildProfile>(() => (typeof window === "undefined" ? defaultProfile : loadProfile()));
  const [screen, setScreen] = useState<Screen>("setup");
  const [pack, setPack] = useState<LessonPack | null>(null);
  const [mastery, setMastery] = useState<MissionMastery>(() => createEmptyMastery(dailyWords.map((word) => word.id)));
  const [video, setVideo] = useState<VideoTaskState>({ status: "idle", progress: 0 });
  const [activeIndex, setActiveIndex] = useState(0);
  const [isGenerating, setGenerating] = useState(false);
  const [notice, setNotice] = useState("Sample mission is ready. Add an Agnes key when you want generated images and video.");
  const [spellInput, setSpellInput] = useState("");
  const [speechMessage, setSpeechMessage] = useState("");

  const activeWord = pack?.words[activeIndex] ?? dailyWords[activeIndex];
  const dashboardPack = pack ?? buildSampleLessonPack(dailyWords);
  const missionReady = Boolean(pack);
  const complete = useMemo(() => isMissionComplete(mastery), [mastery]);
  const hasApiKey = settings.apiKey.trim().length > 0;

  useEffect(() => {
    let active = true;
    async function hydrate() {
      try {
        const [storedPack, storedMastery, storedVideo] = await Promise.all([
          storage.getLesson(),
          storage.getMastery(),
          storage.getVideo()
        ]);
        if (!active) return;
        if (storedPack?.assetPromptVersion === TEXT_FREE_ASSET_VERSION) {
          setPack(storedPack);
          setScreen("home");
        } else if (storedPack) {
          setNotice("Stored lesson images used an older prompt. Reload the sample or generate a fresh text-free mission.");
        }
        if (storedMastery) setMastery(storedMastery);
        if (storedVideo) setVideo(storedVideo);
      } catch {
        setNotice("Browser storage was unavailable, so this session will use memory only.");
      }
    }
    hydrate();
    return () => {
      active = false;
    };
  }, []);

  function persistSettings(next: AgnesSettings) {
    setSettings(next);
    saveSettings(next);
  }

  function persistProfile(next: ChildProfile) {
    setProfile(next);
    saveProfile(next);
  }

  async function persistMastery(next: MissionMastery) {
    setMastery(next);
    await storage.saveMastery(next);
  }

  async function startMission(forceSample = false) {
    setGenerating(true);
    setNotice(forceSample || !hasApiKey ? "Loading the built-in School Planet sample mission." : "Asking Agnes to generate your lesson images.");
    try {
      const nextPack =
        hasApiKey && !forceSample ? await buildAgnesLessonPack(dailyWords, settings) : buildSampleLessonPack(dailyWords);
      const nextMastery = createEmptyMastery(nextPack.words.map((word) => word.id));
      setPack(nextPack);
      setMastery(nextMastery);
      setVideo({ status: "idle", progress: 0 });
      setActiveIndex(0);
      setScreen("home");
      await Promise.all([storage.saveLesson(nextPack), storage.saveMastery(nextMastery), storage.saveVideo({ status: "idle", progress: 0 })]);
      setNotice(nextPack.source === "agnes" ? "Agnes lesson pack saved in this browser." : "Sample mission saved in this browser.");
    } catch (error) {
      const fallback = buildSampleLessonPack(dailyWords);
      setPack(fallback);
      setMastery(createEmptyMastery(fallback.words.map((word) => word.id)));
      setScreen("home");
      await storage.saveLesson(fallback);
      setNotice(error instanceof Error ? `${error.message}. Loaded sample mission instead.` : "Loaded sample mission instead.");
    } finally {
      setGenerating(false);
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
      const style = pickArtStyle(pack.words.map((word) => word.id).join("-"));
      const task = await createAgnesVideoTask(settings, videoRewardPrompt(pack, style), pack.assets[0]?.imageUrl);
      setVideo(task);
      await storage.saveVideo(task);
      setNotice("Video reward task created. You can poll while Agnes works.");
    } catch (error) {
      const failed = {
        status: "failed" as const,
        progress: 0,
        error: error instanceof Error ? error.message : "Video generation failed."
      };
      setVideo(failed);
      await storage.saveVideo(failed);
    }
  }

  async function pollVideoReward() {
    if (!video.videoId) return;
    try {
      const next = await pollAgnesVideo(settings, video.videoId);
      setVideo(next);
      await storage.saveVideo(next);
    } catch (error) {
      setVideo({
        ...video,
        status: "failed",
        error: error instanceof Error ? error.message : "Could not poll video."
      });
    }
  }

  return (
    <div className={`app-shell theme-${profile.gender}`}>
      <TopBar profile={profile} onSetup={() => setScreen("setup")} />
      <main className="main-stage">
        {screen === "setup" ? (
          <section className="setup-panel">
            <Notice text={notice} />
            {isGenerating && <RequestSpinner label="Working on your mission…" />}
            <SetupScreen
              settings={settings}
              profile={profile}
              onSettings={persistSettings}
              onProfile={persistProfile}
              onStart={() => startMission(false)}
              isGenerating={isGenerating}
            />
            <button className="secondary-button setup-back" onClick={() => setScreen("home")}>
              Back to Mission
              <ArrowRight size={18} />
            </button>
          </section>
        ) : (
          <MissionDashboard
            pack={dashboardPack}
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
            onSetup={() => setScreen("setup")}
            onGenerate={() => startMission(false)}
            onSample={() => startMission(true)}
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
          />
        )}
      </main>
    </div>
  );
}

function MissionDashboard({
  pack,
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
  onSetup,
  onGenerate,
  onSample,
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
  onGameAnswer
}: {
  pack: LessonPack;
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
  onSetup: () => void;
  onGenerate: () => void;
  onSample: () => void;
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
}) {
  return (
    <section className="mission-dashboard" aria-label="School Planet mission dashboard">
      <div className="dashboard-notice-row">
        <Notice text={notice} />
        {isGenerating && <RequestSpinner label="Working on your mission…" />}
      </div>

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
        onInput={onInput}
        onCheckSpell={onCheckSpell}
        onCreateVideo={onCreateVideo}
        onPollVideo={onPollVideo}
        onGameAnswer={onGameAnswer}
      />

      <BottomNav profile={profile} active={screen} onHome={onHome} onSetup={onSetup} onSummary={onSummary} />
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
  onInput,
  onCheckSpell,
  onCreateVideo,
  onPollVideo,
  onGameAnswer
}: {
  pack: LessonPack;
  activeWord: WordEntry;
  settings: AgnesSettings;
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
  onInput: (value: string) => void;
  onCheckSpell: () => void;
  onCreateVideo: () => void;
  onPollVideo: () => void;
  onGameAnswer: (word: WordEntry, correct: boolean) => void;
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
        buttonText={missionReady ? "开始游戏" : "生成课程"}
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

      {screen === "story" && <StoryQuestInline pack={pack} onContinue={onGame} />}
      {screen === "game" && <PictureGameInline pack={pack} onAnswer={onGameAnswer} onContinue={onSpell} />}
      {screen === "spell" && (
        <SpellingInline
          word={activeWord}
          settings={settings}
          spellInput={spellInput}
          onInput={onInput}
          onCheck={onCheckSpell}
          onContinue={onReward}
        />
      )}
      {screen === "reward" && (
        <RewardInline
          complete={complete}
          video={video}
          onCreate={onCreateVideo}
          onPoll={onPollVideo}
          onSummary={onSummary}
          onSample={onSample}
        />
      )}
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

function BottomNav({
  profile,
  active,
  onHome,
  onSetup,
  onSummary
}: {
  profile: ChildProfile;
  active: Screen;
  onHome: () => void;
  onSetup: () => void;
  onSummary: () => void;
}) {
  return (
    <nav className="bottom-nav" aria-label="Main sections">
      <button className={active === "home" || active === "learn" ? "active" : ""} onClick={onHome}>
        <BookOpen />
        <span>学习</span>
      </button>
      <button className={active === "story" || active === "game" || active === "spell" ? "active" : ""} onClick={onHome}>
        <ClipboardList />
        <span>任务</span>
      </button>
      <button onClick={onHome}>
        <Backpack />
        <span>我的背包</span>
      </button>
      <button className={active === "summary" ? "active" : ""} onClick={onSummary}>
        <Trophy />
        <span>排行榜</span>
      </button>
      <button onClick={onSetup}>
        <Users />
        <span>家长中心</span>
      </button>
      <span className="bottom-profile">{profile.nickname}</span>
    </nav>
  );
}

function TopBar({ profile, onSetup }: { profile: ChildProfile; onSetup: () => void }) {
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
        <School size={42} />
        <span>Mission</span>
        <strong>School Planet</strong>
      </div>
      <div className="top-actions">
        <span className="star-pill">
          <Star size={19} fill="currentColor" /> 120
        </span>
        <span className="star-pill gem-pill">
          <Gem size={18} fill="currentColor" /> 25
        </span>
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

type TestState = { status: "idle" | "testing" | "ok" | "error"; message?: string };

function TestRow({
  label,
  state,
  disabled,
  onTest
}: {
  label: string;
  state: TestState;
  disabled: boolean;
  onTest: () => void;
}) {
  return (
    <div className="test-row">
      <button
        className="secondary-button test-button"
        type="button"
        onClick={onTest}
        disabled={disabled || state.status === "testing"}
      >
        {state.status === "testing" ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
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

function SetupScreen({
  settings,
  profile,
  onSettings,
  onProfile,
  onStart,
  isGenerating
}: {
  settings: AgnesSettings;
  profile: ChildProfile;
  onSettings: (settings: AgnesSettings) => void;
  onProfile: (profile: ChildProfile) => void;
  onStart: () => void;
  isGenerating: boolean;
}) {
  const [agnesTest, setAgnesTest] = useState<TestState>({ status: "idle" });

  async function runTest(setState: (state: TestState) => void, action: () => Promise<void>) {
    setState({ status: "testing" });
    try {
      await action();
      setState({ status: "ok", message: "Connected" });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Test failed" });
    }
  }

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
          disabled={isGenerating || !settings.apiKey.trim()}
          onTest={() => runTest(setAgnesTest, () => testAgnesConnection(settings))}
        />
        <p className="fine-print">Pronunciation uses your browser's built-in voice.</p>
        <button className="primary-button" onClick={onStart} disabled={isGenerating}>
          {isGenerating ? "Generating..." : "Start Learning"}
          <ArrowRight size={18} />
        </button>
      </section>
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
        <h2>Today’s School Planet words</h2>
        <p>Learn, listen, say, write, then unlock a video reward.</p>
      </div>
      <div className="word-strip">
        {(pack?.words ?? dailyWords).map((word) => (
          <span key={word.id}>{word.word}</span>
        ))}
      </div>
      <div className="button-row">
        <button className="primary-button" onClick={pack ? onBegin : onGenerate} disabled={isGenerating}>
          {pack ? "Start Adventure" : isGenerating ? "Generating..." : "Generate Lesson Pack"}
          <ArrowRight size={18} />
        </button>
        <button className="secondary-button" onClick={onSample} disabled={isGenerating}>
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

function SummaryScreen({ mastery, onRestart }: { mastery: MissionMastery; onRestart: () => void }) {
  const meaning = laneProgress(mastery, "meaning");
  const say = laneProgress(mastery, "say");
  const write = laneProgress(mastery, "write");
  return (
    <div className="summary-screen">
      <Sparkles size={58} />
      <h2>Great mission!</h2>
      <p>今天你完成了 School Planet 的单词任务。</p>
      <div className="summary-grid">
        <span>Meaning: {meaning.completed}/{meaning.total}</span>
        <span>Say: {say.completed}/{say.total}</span>
        <span>Write: {write.completed}/{write.total}</span>
      </div>
      <button className="primary-button" onClick={onRestart}>Back to Mission</button>
    </div>
  );
}

export default App;
