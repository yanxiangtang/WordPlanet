import type { MissionMastery } from "../types";

export type ProgressUnitSummary = {
  masteredWords?: number;
  complete?: boolean;
};

export type ProgressStats = {
  stars: number;
  gems: number;
  collectedWords: number;
  completedPlanets: number;
};

export type DailyProgress = {
  count: number;
  lastVisitDate: string;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAILY_PROGRESS_KEY = "word-planet:daily-progress:v1";

function masteredWordCount(mastery: MissionMastery): number {
  return Object.values(mastery).filter((word) => word.meaning.completed && word.write.completed).length;
}

export function buildProgressStats({
  currentMastery,
  unitSummaries
}: {
  currentMastery: MissionMastery;
  unitSummaries: Record<number, ProgressUnitSummary>;
}): ProgressStats {
  const summaryMastered = Object.values(unitSummaries).reduce((sum, summary) => sum + (summary.masteredWords ?? 0), 0);
  const currentMastered = masteredWordCount(currentMastery);
  const collectedWords = Math.max(summaryMastered, currentMastered);
  const completedPlanets = Object.values(unitSummaries).filter((summary) => summary.complete).length;

  return {
    collectedWords,
    completedPlanets,
    gems: collectedWords,
    stars: collectedWords * 10 + completedPlanets * 50
  };
}

export function dateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dayIndex(date: Date): number {
  return Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / MS_PER_DAY);
}

export function recordDailyVisit(current: DailyProgress | undefined, now = new Date()): DailyProgress {
  const today = dateKey(now);
  if (!current?.lastVisitDate) return { count: 1, lastVisitDate: today };
  if (current.lastVisitDate === today) return current;

  const last = new Date(`${current.lastVisitDate}T00:00:00`);
  const nextCount = dayIndex(now) - dayIndex(last) === 1 ? current.count + 1 : 1;
  return { count: nextCount, lastVisitDate: today };
}

export function loadDailyProgress(): DailyProgress {
  try {
    if (typeof localStorage === "undefined") return { count: 0, lastVisitDate: "" };
    const raw = localStorage.getItem(DAILY_PROGRESS_KEY);
    if (!raw) return { count: 0, lastVisitDate: "" };
    const parsed = JSON.parse(raw) as Partial<DailyProgress>;
    return {
      count: typeof parsed.count === "number" && parsed.count > 0 ? Math.floor(parsed.count) : 0,
      lastVisitDate: typeof parsed.lastVisitDate === "string" ? parsed.lastVisitDate : ""
    };
  } catch {
    return { count: 0, lastVisitDate: "" };
  }
}

export function saveDailyProgress(progress: DailyProgress): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(DAILY_PROGRESS_KEY, JSON.stringify(progress));
}
