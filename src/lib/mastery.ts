import type { MasteryLane, MissionMastery, WordEntry, WordMastery } from "../types";

export type PracticeGap = {
  lane: "meaning" | "write";
  label: "Meaning" | "Spelling";
  completed: number;
  total: number;
  missingWords: string[];
};

function emptyLane() {
  return { correct: 0, wrong: 0, completed: false };
}

function emptyWordMastery(): WordMastery {
  return {
    meaning: emptyLane(),
    say: emptyLane(),
    write: emptyLane()
  };
}

export function createEmptyMastery(wordIds: string[]): MissionMastery {
  return Object.fromEntries(wordIds.map((wordId) => [wordId, emptyWordMastery()]));
}

export function recordMasteryResult(
  mastery: MissionMastery,
  wordId: string,
  lane: MasteryLane,
  correct: boolean
): MissionMastery {
  const current = mastery[wordId] ?? emptyWordMastery();
  const nextLane = {
    ...current[lane],
    correct: current[lane].correct + (correct ? 1 : 0),
    wrong: current[lane].wrong + (correct ? 0 : 1),
    completed: current[lane].completed || correct
  };

  return {
    ...mastery,
    [wordId]: {
      ...current,
      [lane]: nextLane
    }
  };
}

export function isMissionComplete(mastery: MissionMastery): boolean {
  const entries = Object.values(mastery);
  return entries.length > 0 && entries.every((word) => word.meaning.completed && word.write.completed);
}

export function laneProgress(mastery: MissionMastery, lane: MasteryLane): { completed: number; total: number } {
  const entries = Object.values(mastery);
  return {
    completed: entries.filter((word) => word[lane].completed).length,
    total: entries.length
  };
}

export function rewardPracticeGaps(mastery: MissionMastery, words: WordEntry[]): PracticeGap[] {
  const requiredStages: Pick<PracticeGap, "lane" | "label">[] = [
    { lane: "meaning", label: "Meaning" },
    { lane: "write", label: "Spelling" }
  ];

  return requiredStages.map(({ lane, label }) => {
    const missingWords = words
      .filter((word) => !mastery[word.id]?.[lane].completed)
      .map((word) => word.word);

    return {
      lane,
      label,
      completed: words.length - missingWords.length,
      total: words.length,
      missingWords
    };
  }).filter((gap) => gap.missingWords.length > 0);
}
