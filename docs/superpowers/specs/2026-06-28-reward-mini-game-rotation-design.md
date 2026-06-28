# Reward Mini-Game Rotation Design

## Summary

Replace the single reward mini-game experience with a tiny rotation of three easy, funny word-review games for kids:

- Twin Rescue
- Hungry Monster
- Balloon Pop

Each game uses the current mission English words, keeps interaction tap-only, plays word pronunciation on card or balloon taps, and unlocks the existing Video Bonus after completion. The games remain local reward UI only. They do not change mastery, lesson progress, storage schema, or the reward video generation pipeline.

## Goals

- Make the reward screen easier and funnier for kids.
- Keep every game simple enough to understand in a few seconds.
- Reuse the current mission word list and existing speech helper.
- Preserve the existing Video Bonus controls and progress behavior.
- Avoid timers, penalties, shuffling, or surprise difficulty.

## Non-Goals

- No new dependency.
- No persisted game progress.
- No mastery schema change.
- No competitive scoring or leaderboard.
- No requirement to finish the reward game for learning mastery.

## Shared Reward Flow

After spelling is complete, the reward screen chooses one mini-game for the session. The selection is local UI state and can be random from the available games.

Each mini-game reports completion through one shared callback. Once complete, the reward screen shows the existing Video Bonus section below or in place of the game completion state.

All games use current mission words. If the mission has too few unique words, the game repeats words as needed while keeping interactions fair and matchable.

## Shared UI Rules

- The reward page keeps a bright, kid-friendly sky-and-garden visual style.
- Text stays short and action-oriented.
- Tap targets are large enough for children.
- Wrong taps should be playful and gentle: wobble, bounce, or small message, with no penalty.
- Tapping a visible word item plays pronunciation with `speak(word, 1)`.
- The game area should fit the reward screen without forcing vertical scroll on common desktop and tablet layouts.

## Mini-Game 1: Twin Rescue

Twin Rescue is the current matching-card game.

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

## Mini-Game 2: Hungry Monster

Hungry Monster asks the child to feed a target word to a funny character.

Rules:

- Show a large character area with a short prompt such as `Feed me: rubber!`.
- Show a small set of word cards below.
- Tapping any card plays pronunciation.
- Tapping the target word clears that card with a flying or popping effect and advances to the next target.
- Tapping a wrong word makes that card wobble and remain visible.

Completion:

- The game completes after the child feeds the required number of target words.

Primary value:

- Very direct listen/read recognition with a funny reaction loop.

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

Add a small reward-game wrapper that chooses and renders one game:

- `RewardGameRotation`
- `TwinRescueGame`
- `HungryMonsterGame`
- `BalloonPopGame`

The wrapper receives the current mission pack, completion state, and the existing Video Bonus props from `RewardInline`.

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

The existing `rewardClearGame` helpers can remain for Twin Rescue, with new helper functions added only if they reduce component complexity.

## Error Handling And Fallbacks

- If no mission words are available, use a tiny fallback set such as `hello`, `good`, and `star`.
- If speech is unavailable, the game still works visually.
- If the selected random game cannot build enough items, fall back to Twin Rescue with repeated words.

## Testing

Unit tests:

- Twin Rescue still clears identical pairs in place.
- Hungry Monster target selection includes a correct visible card.
- Balloon Pop target selection includes a correct visible balloon.
- Word pools can be built from short mission word lists.

UI tests:

- Reward screen renders one mini-game before Video Bonus.
- Clicking a visible word item calls pronunciation.
- Completing each mini-game reveals Video Bonus controls.
- Wrong taps do not advance progress.
- Existing incomplete mastery guidance still appears where applicable.

Verification:

- Run focused reward tests.
- Run full `npm test`.
- Run `npm run build`.

## Implementation Notes

Keep the first implementation compact. The goal is a playable, polished reward rotation, not a full game engine. Prefer simple CSS animations for pops, wobbles, and flying feedback. Avoid new assets unless a small CSS-built character or existing local image can carry the scene cleanly.
