# Word Planet — Usability & Kid-Friendliness Review

_Date: 2026-06-28_
_Scope: `src/App.tsx`, reward games, style picker, `src/styles.css`, `PLAN.md`._
_Lens: "Will a 6–10 year old actually love this?"_

---

## ✅ What's already working for kids

| Area | What's there |
|------|---|
| **Concept & framing** | "Word Planet / 单词星球" is a strong, kid-trustable name. Planet/sky/grass gradient background sets the mood. |
| **Per-unit AI art** | Style picker with **Surprise Me** slot-machine roll (`rollSurpriseStyle` in `App.tsx:3074`) is genuinely delightful. Lazy unit-cover generation is smart UX. |
| **Mission rail** | Learn → Story → Game → Spell → Reward → Summary is a clear arc; **CelebrationOverlay** (`App.tsx:3228`) between phases gives micro-payoffs. |
| **Reward variety** | Three rotating mini-games (Word Card Rescue, **Hungry Monster**, **Balloon Pop**) — variety beats repetition for kid retention. |
| **Encouraging tone** | "Good try", "Nice picture match!", auto-spell-check on completion (`App.tsx:2319`), letter-tile spelling instead of keyboard typing — all child-appropriate. |
| **Pronunciation** | Audio orb + 🐢 慢速播放 chip + mic "Say this word" with speech recognition. The slow-turtle button is exactly the kind of detail kids notice. |
| **Themed by gender** | `theme-girl` / `theme-boy` CSS variables (`styles.css:120-150`) swap palettes — nice personal touch. |

---

## 🚩 Top usability gaps (ordered by impact on kids)

### 1. The reward economy is **fake**
`TopBar` shows hardcoded `120 stars` / `25 gems` (`App.tsx:2982-2987`). Kids notice within session two that the number never moves. **This is the single biggest credibility-killer.** Either wire it to real progress (mastered words → gems, completed missions → stars) or remove it until it's real.

### 2. No streak / no comeback
PLAN.md §10.4 designs a streak system; the app has zero streak UI. Streaks are the #1 retention driver for kid apps (Duolingo's moat). Even a `🔥 3-day streak` chip on the home page would change daily-return behavior.

### 3. Where are the **planets**? The framing is missing
The kid-facing copy says *"Choose a lesson"*, *"Lesson detail"*, *"Unit 5"*, *"12 units"* (`App.tsx:1903`, `LessonBoard`). That's a textbook table-of-contents, not a planet map. Kids were promised:

> *"Explore Animal Planet and meet 5 word friends!"*

Reframe units as **planets** with names ("Animal Planet 🦁", "Color Planet 🎨"), and put them on an actual map/orbit, not a grid. The cover art already exists — drop it onto a sky-and-stars layout. This is mostly CSS + copy, not a rewrite.

### 4. No companion / mascot
PLAN §8.6 designs an AI companion that welcomes, hints, and celebrates. Currently the brand has a static 🌍 emoji. Pick one fuzzy alien (give it a name — "Momo the moon dust", "Pip the pocket planet") and have it:
- Wave hello on Home
- React to right/wrong (eyes light up / scrunches face)
- Float at the corner during Spell, holding the target letter
- Pop in for the cheer overlay

This single character will tie everything together emotionally.

### 5. Silent celebrations
`CelebrationOverlay` renders stars and a cheer text but **no sound**. Kid feedback is 60% audio. Add three tiny SFX (built into the bundle, ~5KB each as base64 webm/opus):
- **Ding/chime** on correct
- **Soft boing** on wrong (never harsh)
- **Whoosh + sparkle** on phase complete
- Per-phase voice line ("Story complete!" spoken with `speak()` — you already have TTS plumbing).

### 6. The "I know it" trap
On the Learn screen, "I know it" sits next to "Next" (`App.tsx:2146-2152`). Kids will tap "I know it" without registering anything (it just calls `mark(word, 'meaning', true)` — silent). Either:
- Reward it visibly ("⭐ Word added to your collection!") so it feels earned, OR
- Replace it with a **mini-gesture**: e.g., tap the word three times, or trace it with a finger.

### 7. Word collection is invisible
PLAN §10.2 says every learned word becomes a collectible character (Apple Buddy, Jumping Rabbit, etc.). The codebase clearly has the data but no **"Word Zoo"** page where kids visit their collected friends. Add a simple grid of unlocked cards on Home — kids will replay missions just to fill the empty slots.

### 8. Reward video wait is 60+ seconds of nothing
`runRewardPipeline` polls Agnes for ~1 minute (`App.tsx:1290`). A 6-year-old's patience is 8 seconds. The current placeholder is just `<Loader2>` + text. While the video renders, give the kid an *agency loop*:
- **Decorate the rocket** that "delivers the video" (tap to add stickers).
- Or autoplay a side bubble-pop where each pop reveals one letter of the word "VIDEO COMING".
- Anything that converts wait → play.

### 9. Picture Game choices are unlabeled
`PictureGameInline` (`App.tsx:2256-2278`) renders three pictures with labels "Choice 1", "Choice 2", "Choice 3". The word printed on the card would help readers and a `Volume2` auto-play on hover would help non-readers. Currently a kid who can't read the prompt has no audio fallback.

### 10. Story scenes don't read themselves
`StoryQuestInline` shows the English + Chinese sentence but no audio narration of the story. PLAN §9 specifically calls out "Click a word to hear pronunciation" inside the story. Add (a) a **play-the-whole-scene** button using your existing `speak()` and (b) tap-any-word-for-sound. Both are 20-line additions.

### 11. Error feedback is too literal
- `"Could not hear clearly"` after mic failure → friendlier: *"My ears wiggled! Say it once more 🐰"*
- `"Sample mission saved in this browser."` → kids see this. Either hide all "saved", "cached", "pictures needed" status strings from kid view (they're meta) or rewrite them.
- The `aria-label` `"Pictures saved. Video saved."` on UnitCard (`App.tsx:2058`) leaks to screen readers as well — fine for parents, weird for kids.

---

## 🎉 Quick wins to "make kids love it"

These are low-effort, high-delight micro-additions. Most are 1–2 hours each.

### Funny operations
1. **Tap the planet logo 5×** → it sneezes confetti. (Pure CSS animation + speak("achoo!").)
2. **Spell wrong twice** → letter tiles do a silly shake AND a tiny voice goes "oopsie!" instead of the current silent retry.
3. **Hold a word card** → it stretches like a rubber band and twangs.
4. **Hungry Monster burps** after eating 5 words (use Web Audio + emoji speech bubble "🤭 burp!").
5. **Balloon Pop wrong tap** → the balloon flies up and away (translateY -100vh with rotate) instead of just turning red.
6. **Spelling correct streak** → the letter tiles rain down like Tetris into a confetti pile.
7. **Long-press the avatar** → the kid avatar makes a face and changes accessories (hat, glasses, mustache). Free customization.

### Sensory polish
8. **Vibration on mobile**: `navigator.vibrate(50)` on correct, `vibrate([30,30,30])` on wrong.
9. **Sticker on every mastered word** — a small `🎖️` pinned to the WordCard that animates in.
10. **Day/night background**: detect local time; switch sky gradient to stars + moon after 7 PM. Tiny touch, very memorable.
11. **AI sings the word**: once per session, generate a 3-second sung jingle of one new word via Agnes TTS. Bedtime karaoke moment.

### Motivation hooks
12. **Daily mystery box** on Home: tap to open → reveals one bonus star + the day's hint sentence read by the companion.
13. **Word tree growth** (PLAN §10.1): a literal SVG tree on Home that gains one leaf per mastered word. Kids will grind to grow it.
14. **Friend mode**: let two kids on the same device pass-and-play (just two profiles you can switch). Sibling rivalry → engagement.

### Information design
15. Rename units to planets in copy (`missionTitle`, mission stepper) — text-only change.
16. On Home, show **today's plan as a comic strip** (3 panels: "Meet 5 words → Play game → Earn video") instead of the lesson grid. Move the grid behind a "More planets ↓" pull.
17. The mission stepper progress badges (e.g. `3/5`) are great — extend the same pattern to a streak chip and total-words-collected chip in the TopBar (replacing the fake 120/25).

---

## 🧭 Suggested priority order

If you only do 5 things, do these in this order:

1. **Replace fake stars/gems** with real, growing counters tied to mastery. (½ day)
2. **Add a streak chip + daily mystery box** on Home. (1 day)
3. **Rename units → planets + add the companion mascot** on every screen. (1–2 days)
4. **Add SFX + voice cheers** to the Celebration overlay and right/wrong answers. (½ day)
5. **Build the Word Zoo / collection grid** so progress is visible. (1–2 days)

Then the funny micro-interactions (planet sneeze, hungry monster burp, balloon escape) can be sprinkled in whenever you want to surprise a returning user.

---

## Closing note

The product has unusually strong bones — the AI-image-per-unit pipeline, the rotating reward games, and the style picker are all things competitors don't have. What's missing is the **affective layer**: a face to bond with, sound to feel rewarded, a collection to fill, and a streak to protect. Add those four, and the rest of the app will feel twice as fun without any new features.
