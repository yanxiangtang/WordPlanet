import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  Gamepad2,
  GraduationCap,
  ImageIcon,
  Mic,
  Pencil,
  Play,
  RefreshCcw,
  Rocket,
  Settings,
  Sparkles,
  Star,
  Trophy,
  Volume2
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { selectDailyWords } from "./data/vocabulary";
import { createAgnesVideoTask, pollAgnesVideo, videoRewardPrompt } from "./lib/agnes";
import { buildAgnesLessonPack, buildSampleLessonPack, getWordImage } from "./lib/lesson";
import { createEmptyMastery, isMissionComplete, laneProgress, recordMasteryResult } from "./lib/mastery";
import { listenForWord, speak, speechRecognitionSupported } from "./lib/speech";
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
        if (storedPack) {
          setPack(storedPack);
          setScreen("home");
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
      const task = await createAgnesVideoTask(settings, videoRewardPrompt(pack), pack.assets[0]?.imageUrl);
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
    <div className="app-shell">
      <TopBar profile={profile} onSetup={() => setScreen("setup")} />
      <main className="main-stage">
        <aside className="mission-sidebar">
          <div className="companion-card">
            <div className="rocket-buddy">
              <Rocket size={42} />
            </div>
            <h2>Hi {profile.nickname}!</h2>
            <p>Today we explore School Planet with pictures, sounds, story clues, and star words.</p>
          </div>
          <ProgressPanel mastery={mastery} />
          <button className="secondary-button" onClick={() => startMission(true)} disabled={isGenerating}>
            <RefreshCcw size={18} />
            Reload sample
          </button>
        </aside>

        <section className="content-panel">
          <Notice text={notice} />
          {screen === "setup" && (
            <SetupScreen
              settings={settings}
              profile={profile}
              onSettings={persistSettings}
              onProfile={persistProfile}
              onStart={() => startMission(false)}
              isGenerating={isGenerating}
            />
          )}
          {screen === "home" && (
            <HomeScreen
              pack={pack}
              isGenerating={isGenerating}
              onGenerate={() => startMission(false)}
              onSample={() => startMission(true)}
              onBegin={() => setScreen("learn")}
            />
          )}
          {screen === "learn" && pack && (
            <LearnScreen
              pack={pack}
              activeIndex={activeIndex}
              word={activeWord}
              onBack={() => setScreen("home")}
              onNext={() => {
                if (activeIndex < pack.words.length - 1) setActiveIndex((value) => value + 1);
                else setScreen("story");
              }}
              onMarkMeaning={() => mark(activeWord, "meaning", true)}
              onSay={() => checkSpeech(activeWord)}
              speechMessage={speechMessage}
            />
          )}
          {screen === "story" && pack && <StoryScreen pack={pack} onContinue={() => setScreen("game")} />}
          {screen === "game" && pack && (
            <GameScreen pack={pack} onAnswer={(word) => mark(word, "meaning", true)} onContinue={() => setScreen("spell")} />
          )}
          {screen === "spell" && pack && (
            <SpellScreen
              pack={pack}
              activeWord={activeWord}
              activeIndex={activeIndex}
              spellInput={spellInput}
              onInput={setSpellInput}
              onCheck={() => handleSpell(activeWord)}
              onPrev={() => setActiveIndex((value) => Math.max(0, value - 1))}
              onNext={() => setActiveIndex((value) => Math.min(pack.words.length - 1, value + 1))}
              onContinue={() => setScreen("reward")}
            />
          )}
          {screen === "reward" && pack && (
            <RewardScreen
              complete={complete}
              video={video}
              onCreate={startVideoReward}
              onPoll={pollVideoReward}
              onSummary={() => setScreen("summary")}
            />
          )}
          {screen === "summary" && <SummaryScreen mastery={mastery} onRestart={() => setScreen("home")} />}
        </section>
      </main>
    </div>
  );
}

function TopBar({ profile, onSetup }: { profile: ChildProfile; onSetup: () => void }) {
  return (
    <header className="top-bar">
      <div className="brand-mark">
        <div className="planet-face">🪐</div>
        <div>
          <h1>Word Planet</h1>
          <strong>单词星球</strong>
        </div>
      </div>
      <div className="mission-pill">
        <GraduationCap size={34} />
        <span>Mission</span>
        <strong>School Planet</strong>
      </div>
      <div className="top-actions">
        <span className="star-pill">
          <Star size={19} fill="currentColor" /> 120
        </span>
        <button className="avatar-button" onClick={onSetup}>
          <Settings size={18} />
          {profile.nickname}
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
  return (
    <div className="setup-grid">
      <section className="setup-card">
        <h2>Parent setup</h2>
        <label>
          Child nickname
          <input value={profile.nickname} onChange={(event) => onProfile({ ...profile, nickname: event.target.value })} />
        </label>
        <label>
          Age
          <input
            type="number"
            min={8}
            max={10}
            value={profile.age}
            onChange={(event) => onProfile({ ...profile, age: Number(event.target.value) })}
          />
        </label>
        <p className="fine-print">Designed for Chinese-speaking intermediate learners age 9-10.</p>
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
      <h3>单词掌握进度</h3>
      <MasteryRow icon={<BookOpen />} label="Meaning 含义理解" lane="meaning" mastery={mastery} color="green" />
      <MasteryRow icon={<Mic />} label="Say 发音跟读" lane="say" mastery={mastery} color="blue" />
      <MasteryRow icon={<Pencil />} label="Write 拼写默写" lane="write" mastery={mastery} color="orange" />
    </div>
  );
}

function MasteryRow({
  icon,
  label,
  lane,
  mastery,
  color
}: {
  icon: React.ReactNode;
  label: string;
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
        <strong>{label}</strong>
        <div className="meter">
          <span style={{ width: `${percent}%` }} />
        </div>
      </div>
      <b>{progress.completed}/{progress.total}</b>
    </div>
  );
}

function LearnScreen({
  pack,
  word,
  activeIndex,
  onBack,
  onNext,
  onMarkMeaning,
  onSay,
  speechMessage
}: {
  pack: LessonPack;
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
          <button className="round-action" onClick={() => speak(word.word)}>
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
          <button className="mini-sound" onClick={() => speak(word.example)}>
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
  onAnswer: (word: WordEntry) => void;
  onContinue: () => void;
}) {
  const target = pack.words[0];
  return (
    <div className="activity-screen">
      <h2>Picture Game 图片挑战</h2>
      <p>Which one is a <strong>{target.word}</strong>?</p>
      <div className="choice-grid">
        {pack.words.slice(0, 3).map((word) => (
          <button className="picture-choice" key={word.id} onClick={() => onAnswer(word)}>
            <img src={getWordImage(pack, word.id)} alt={word.word} />
            <span>{word.word}</span>
            {word.id === target.id && <Check className="choice-check" />}
          </button>
        ))}
      </div>
      <button className="primary-button" onClick={onContinue}>
        Go to Spelling
        <Pencil size={18} />
      </button>
    </div>
  );
}

function SpellScreen({
  pack,
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
          <button className="secondary-button" onClick={() => speak(activeWord.word)}>
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

