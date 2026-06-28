# Reward Mini-Game Design

## Summary

The reward phase offers three easy, funny word-review mini-games:

- Twin Rescue (Word Card Rescue)
- Hungry Monster (audio-only listen-and-choose)
- Balloon Pop

Every reward screen opens with a kid-facing chooser — the kid picks which game to play, and any game that has been completed earns a persistent trophy badge. Each game uses the current mission English words, keeps interaction tap-only, plays word pronunciation on taps, and unlocks the existing Video Bonus after completion.

## Goals

- Make the reward screen easier and funnier for kids.
- Let the kid pick which mini-game to play instead of forcing a single rotation.
- Reward repeat completions with a persistent trophy so finishing a game has a visible payoff.
- Keep every game simple enough to understand in a few seconds.
- Reuse the current mission word list and existing speech helper.
- Preserve the existing Video Bonus controls and progress behavior.
- Avoid timers, penalties, shuffling, or surprise difficulty.

## Non-Goals

- No new dependency.
- No mastery schema change.
- No competitive scoring or leaderboard.
- No requirement to finish the reward game for learning mastery.
- No "lock" gate on games — all three are always playable; trophies are cosmetic.

## Shared Reward Flow

After spelling is complete, the reward screen renders the kid's last-picked game directly, or the chooser if no game has been picked yet. A prominent **Pick another game** button on the in-game header is the explicit way back to the chooser; tapping it clears the persisted pick so the next fresh visit opens the chooser again.

The last-picked game is persisted in `localStorage` under `word-planet:reward-game-last-pick:v1` (`{ "kind": "twin" | "monster" | "balloon" }`), so a mid-session refresh returns the kid to the same game instead of bouncing back to the chooser. Pack changes do **not** auto-reset the pick — the kid keeps the game they chose until they switch via the back button.

Each mini-game reports completion through one shared callback. The callback both flips the reward UI into the Video Bonus state and persists a trophy for that game (see Trophies below). Once any game is complete, the existing Video Bonus section appears below the game.

All games use current mission words. If the mission has too few unique words, the game repeats words as needed while keeping interactions fair and matchable.

## Trophies

Trophies are a tiny persistent badge per game id. They are cosmetic — they decorate the chooser card but never lock a game.

- Storage: `localStorage` under `word-planet:reward-game-trophies:v1`.
- Shape: `{ "earned": ("twin" | "monster" | "balloon")[] }`.
- Module: `src/lib/rewardGameTrophies.ts` (`loadRewardGameTrophies`, `saveRewardGameTrophies`, `addRewardGameTrophy`).
- Idempotent: completing the same game twice does not duplicate the trophy and does not re-write storage.
- Reset: clearing site data clears trophies, matching every other localStorage-backed bit of kid state.

The same module exposes `loadLastPickedRewardGame` / `saveLastPickedRewardGame` for the refresh persistence described above. Saving `null` removes the key.

## Shared UI Rules

- The reward page keeps a bright, kid-friendly sky-and-garden visual style.
- Text stays short and action-oriented.
- Tap targets are large enough for children.
- Wrong taps should be playful and gentle: wobble, bounce, or small message, with no penalty.
- Tapping a visible word item plays pronunciation with `speak(word, 1)`.
- The game area should fit the reward screen without forcing vertical scroll on common desktop and tablet layouts.

## Mini-Game 1: Twin Rescue

Twin Rescue is the matching-card game.

Rules:

- Show a board of word cards.
- The child taps one card, then taps an identical word card anywhere.
- Matching cards clear in place.
- Mismatched taps pronounce the clicked word and select that new card.
- No hints reveal the matching card.
- No shuffle, collapse, refill, or rearrangement after clearing.

Completion:

- The game completes when all required pairs are cleared.

Primary value:

- Calm word recognition and visual matching.

## Mini-Game 2: Hungry Monster (listen-and-choose)

Hungry Monster is a pure listen-and-choose drill. The target word is delivered as audio — the kid never sees it on the monster — and they pick the matching word from four visible options.

Rules:

- Show a large monster character with a "Feed me the word" prompt and a big **Listen** button. The target word is never shown as text.
- Speak the target word once when each round starts.
- Tapping **Listen** replays the target word as many times as the kid wants.
- Show four large word cards below with the word text visible so the kid can read and choose.
- Tapping the correct card pops it with a pronounce-and-advance effect.
- Tapping a wrong card wobbles it and replays the target word so the kid can compare; the kid keeps trying with no progress penalty.

Completion:

- The game completes after the child feeds the required number of target words.

Primary value:

- Direct listen-to-read recognition — the kid has to map an audio cue to written English.

## Mini-Game 3: Balloon Pop

Balloon Pop asks the child to pop the matching word balloon.

Rules:

- Show several large word balloons.
- Show and speak one target word.
- Tapping any balloon plays pronunciation.
- Tapping the target balloon pops it with a star effect and advances progress.
- Tapping a wrong balloon makes it bounce and remain visible.
- Refill or replace popped balloons without changing the whole screen abruptly.

Completion:

- The game completes after the child pops the required number of target balloons.

Primary value:

- Fast, playful recognition with more motion than the card game.

## Progress

Use a short shared progress meter. Recommended lengths:

- Twin Rescue: 12 pairs or fewer on smaller screens.
- Hungry Monster: 10 to 12 correct feeds.
- Balloon Pop: 10 to 12 correct pops.

The meter should use plain English such as:

- `6/12 words rescued`
- `5/10 snacks delivered`
- `7/10 balloons popped`

The exact label can vary by game, but completion should feel quick.

## Components

- `RewardInline` — owns the chooser/game branching, the trophy callback wiring, and the Video Bonus section.
- `RewardGameChooser` — the kid-facing card grid with trophy badges.
- `HungryMonsterGame` — audio-only listen-and-choose component.
- `BalloonPopGame` — balloon component.
- (Twin Rescue is rendered inline inside `RewardInline`.)

`RewardInline` accepts an optional `rewardGame` prop that pre-selects a game and is used by tests as a force-render hatch, plus `earnedRewardGames` and `onGameEarned` for trophy plumbing.

Each game owns only local UI state:

- visible items
- selected card or current target
- progress count
- short feedback state
- completion callback

## Data Helpers

Keep helper logic pure where practical:

- Build repeated word pools from current mission words.
- Pick target sequences.
- Build pair boards for Twin Rescue.
- Build visible choice sets for Hungry Monster and Balloon Pop.
- Check correct or incorrect taps.

The existing `rewardClearGame` helpers stay for Twin Rescue, Hungry Monster, and Balloon Pop.

## Error Handling And Fallbacks

- If no mission words are available, use a tiny fallback set such as `hello`, `good`, and `star`.
- If speech is unavailable, the game still works visually.
- If `localStorage` is unavailable or throws (Safari private mode, quota), trophy load returns `[]` and save is a silent no-op — the kid simply loses persistence.

## Testing

Unit tests:

- Trophy module: empty default, round-trip, dedupe, malformed JSON fallback, unknown-kind filter.
- Twin Rescue still clears identical pairs in place.
- Hungry Monster target selection includes a correct visible card.
- Balloon Pop target selection includes a correct visible balloon.
- Word pools can be built from short mission word lists.

UI tests:

- Reward screen opens with the chooser and renders three game cards.
- Tapping a chooser card renders that game; "Pick another game" returns to the chooser.
- Hungry Monster choice cards have no visible word and speak the target on each round.
- Completing a game fires `onGameEarned` with the right kind.
- Earned games show a trophy badge in the chooser.
- Clicking a visible word item calls pronunciation.
- Completing each mini-game reveals Video Bonus controls.
- Wrong taps do not advance progress.

Verification:

- Run focused reward tests.
- Run full `npm test`.
- Run `npm run build`.

## Implementation Notes

Keep the implementation compact. The goal is a playable, polished reward set, not a full game engine. Prefer simple CSS animations for pops, wobbles, and flying feedback. Avoid new assets unless a small CSS-built character or existing local image can carry the scene cleanly.

