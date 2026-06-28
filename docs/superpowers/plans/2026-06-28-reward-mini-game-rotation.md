# Reward Mini-Game Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a three-game reward rotation with Twin Rescue, Hungry Monster, and Balloon Pop, all using current mission words and unlocking the existing Video Bonus.

**Architecture:** Keep the reward experience inside `RewardInline` but split game-specific logic into small helper functions in `src/lib/rewardClearGame.ts`. Add a `RewardGameRotation` wrapper in `src/App.tsx` that chooses one game and renders focused child components sharing a completion callback. Reuse current speech and video reward pipeline.

**Tech Stack:** React, TypeScript, Vite, Vitest, DOM tests, CSS animations, existing `speak` helper.

---

### Task 1: Reward Helper APIs

**Files:**
- Modify: `src/lib/rewardClearGame.ts`
- Modify: `src/lib/rewardClearGame.test.ts`

- [ ] **Step 1: Write failing helper tests**

Add tests that describe the new generic word-pool and choice-set behavior:

```ts
it("builds a repeated reward word pool from short word lists", () => {
  const pool = buildRewardWordPool(sampleWords.slice(0, 2), 5);

  expect(pool).toHaveLength(5);
  expect(pool.map((item) => item.word)).toEqual([
    sampleWords[0].word,
    sampleWords[1].word,
    sampleWords[0].word,
    sampleWords[1].word,
    sampleWords[0].word
  ]);
});

it("builds target choices with the target included", () => {
  const choices = buildRewardChoices(sampleWords, sampleWords[1], 4, "monster");

  expect(choices).toHaveLength(4);
  expect(choices.some((choice) => choice.wordId === sampleWords[1].id)).toBe(true);
  expect(new Set(choices.map((choice) => choice.id)).size).toBe(4);
});
```

- [ ] **Step 2: Run helper tests and verify RED**

Run: `npm test -- src/lib/rewardClearGame.test.ts`

Expected: FAIL because `buildRewardWordPool` and `buildRewardChoices` do not exist.

- [ ] **Step 3: Implement helper APIs**

Add exports:

```ts
export type RewardWordItem = {
  id: string;
  wordId: string;
  token: string;
  word: string;
};

export function buildRewardWordPool(words: WordEntry[], count: number): RewardWordItem[] {
  const source = words.length > 0 ? words : FALLBACK_REWARD_WORDS;
  return Array.from({ length: count }, (_, index) => {
    const word = source[index % source.length];
    return {
      id: `reward-item-${word.id}-${index}`,
      wordId: word.id,
      token: `word:${word.id}`,
      word: word.word
    };
  });
}

export function buildRewardChoices(
  words: WordEntry[],
  target: WordEntry,
  count: number,
  seed: string
): RewardWordItem[] {
  const pool = buildRewardWordPool(words.filter((word) => word.id !== target.id), Math.max(0, count - 1));
  const targetItem: RewardWordItem = {
    id: `reward-choice-${target.id}-${seed}`,
    wordId: target.id,
    token: `word:${target.id}`,
    word: target.word
  };
  return shuffleRewardItems([targetItem, ...pool], seed).slice(0, count);
}
```

- [ ] **Step 4: Run helper tests and verify GREEN**

Run: `npm test -- src/lib/rewardClearGame.test.ts`

Expected: PASS.

### Task 2: Reward Rotation Shell

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Write failing UI test for game rotation**

Add a test that renders `RewardInline` with deterministic game selection and expects one mini-game before Video Bonus:

```tsx
it("renders a selected reward mini-game before the video bonus", () => {
  const mount = document.createElement("div");
  container = mount;
  document.body.append(mount);
  root = createRoot(mount);
  const words = selectMissionWords("yilin-grade3", "3A", 5);
  const pack = buildSampleLessonPack(words, { setId: "monster-game", title: "Test mission" });
  const video: VideoTaskState = { status: "completed", progress: 100, url: "blob:reward", promptVersion: REWARD_VIDEO_PROMPT_VERSION };

  act(() => {
    root?.render(<RewardInline complete={true} pack={pack} video={video} onCreate={() => {}} onSummary={() => {}} rewardGame="monster" />);
  });

  expect(mount.querySelector(".reward-clear-game")).not.toBeNull();
  expect(mount.textContent).toContain("Hungry Monster");
  expect(mount.textContent).not.toContain("Video Bonus");
});
```

- [ ] **Step 2: Run focused UI test and verify RED**

Run: `npm test -- src/App.test.tsx -t "selected reward mini-game"`

Expected: FAIL because `RewardInline` does not accept `rewardGame` and Hungry Monster does not render.

- [ ] **Step 3: Implement rotation shell**

Add:

```ts
type RewardGameKind = "twin" | "monster" | "balloon";
const REWARD_GAME_KINDS: RewardGameKind[] = ["twin", "monster", "balloon"];

function pickRewardGame(packId: string): RewardGameKind {
  const index = Math.abs(hashRewardGameKey(packId)) % REWARD_GAME_KINDS.length;
  return REWARD_GAME_KINDS[index];
}
```

Extend `RewardInline` props with optional `rewardGame?: RewardGameKind`, derive `activeGame`, and render `RewardGameRotation` before Video Bonus.

- [ ] **Step 4: Run focused UI test and verify GREEN**

Run: `npm test -- src/App.test.tsx -t "selected reward mini-game"`

Expected: PASS.

### Task 3: Hungry Monster Game

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing Hungry Monster tests**

Add tests:

```tsx
it("feeds the Hungry Monster only when the target word is tapped", () => {
  renderReward("monster");
  const progress = () => mount.querySelector(".rescue-meter-copy")?.textContent ?? "";
  const target = mount.querySelector<HTMLElement>("[data-current-target]")?.dataset.currentTarget ?? "";
  const wrong = Array.from(mount.querySelectorAll<HTMLButtonElement>(".reward-choice-card")).find((button) => button.dataset.word !== target);
  const right = Array.from(mount.querySelectorAll<HTMLButtonElement>(".reward-choice-card")).find((button) => button.dataset.word === target);

  act(() => wrong?.click());
  expect(progress()).toContain("0/");

  act(() => right?.click());
  expect(progress()).toContain("1/");
  expect(speak).toHaveBeenCalledWith(target, 1);
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `npm test -- src/App.test.tsx -t "Hungry Monster"`

Expected: FAIL because Hungry Monster behavior is not implemented.

- [ ] **Step 3: Implement Hungry Monster**

Add `HungryMonsterGame` with:

- 10 target words from `buildRewardWordPool`.
- 4 visible choices from `buildRewardChoices`.
- Correct tap advances progress and target index.
- Wrong tap sets feedback class and does not advance.
- Every tap calls `speak(choice.word, 1)`.

- [ ] **Step 4: Add CSS**

Add `.reward-monster-stage`, `.reward-monster-face`, `.reward-choice-grid`, `.reward-choice-card`, `.reward-choice-card.wrong`, and `.reward-choice-card.correct` styles.

- [ ] **Step 5: Run focused test and verify GREEN**

Run: `npm test -- src/App.test.tsx -t "Hungry Monster"`

Expected: PASS.

### Task 4: Balloon Pop Game

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing Balloon Pop tests**

Add tests:

```tsx
it("pops only the matching Balloon Pop word", () => {
  renderReward("balloon");
  const progress = () => mount.querySelector(".rescue-meter-copy")?.textContent ?? "";
  const target = mount.querySelector<HTMLElement>("[data-current-target]")?.dataset.currentTarget ?? "";
  const wrong = Array.from(mount.querySelectorAll<HTMLButtonElement>(".reward-balloon")).find((button) => button.dataset.word !== target);
  const right = Array.from(mount.querySelectorAll<HTMLButtonElement>(".reward-balloon")).find((button) => button.dataset.word === target);

  act(() => wrong?.click());
  expect(progress()).toContain("0/");

  act(() => right?.click());
  expect(progress()).toContain("1/");
  expect(speak).toHaveBeenCalledWith(target, 1);
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `npm test -- src/App.test.tsx -t "Balloon Pop"`

Expected: FAIL because Balloon Pop behavior is not implemented.

- [ ] **Step 3: Implement Balloon Pop**

Add `BalloonPopGame` with:

- 10 target words from `buildRewardWordPool`.
- 5 visible balloons from `buildRewardChoices`.
- Correct tap advances and refreshes choices.
- Wrong tap bounces only the wrong balloon.
- Every tap calls `speak(choice.word, 1)`.

- [ ] **Step 4: Add CSS**

Add `.reward-balloon-stage`, `.reward-balloon-cloud`, `.reward-balloon`, `.reward-balloon.pop`, and `.reward-balloon.wrong` styles.

- [ ] **Step 5: Run focused test and verify GREEN**

Run: `npm test -- src/App.test.tsx -t "Balloon Pop"`

Expected: PASS.

### Task 5: Twin Rescue Integration And Completion

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Update existing Twin Rescue tests**

Change existing reward tests to render `rewardGame="twin"` where they need the card board. Keep assertions that matching cards clear in place and clicking a card speaks pronunciation.

- [ ] **Step 2: Run focused Twin Rescue tests**

Run: `npm test -- src/App.test.tsx -t "reward clear game"`

Expected: PASS after prop updates.

- [ ] **Step 3: Wire completion to Video Bonus for all games**

Ensure `RewardGameRotation` sets `gameComplete` in `RewardInline` for each child game and keeps Video Bonus rendering unchanged.

- [ ] **Step 4: Run completion tests**

Run: `npm test -- src/App.test.tsx -t "reveals the video bonus"`

Expected: PASS for Twin Rescue, Hungry Monster, and Balloon Pop completion tests.

### Task 6: Verification

**Files:**
- Modify only if tests expose issues.

- [ ] **Step 1: Run full test suite**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: build exits successfully.

- [ ] **Step 3: Review status**

Run: `git status --short`

Expected: modified implementation and test files plus this plan document.
