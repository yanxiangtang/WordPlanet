import { pickArtStyle } from "./agnes";

// A kid-selectable visual style for lesson pictures and reward videos. Each
// curated entry is written to *evoke* a look kids recognize (cheerful pig
// family, talking rescue vehicles, etc.) without naming any trademarked IP —
// image models refuse named brands, and we want the prompts to stay portable.
export type VisualStyle = {
  id: string;
  // English UI text the kid reads when picking.
  label: string;
  emoji: string;
  // Prompt fragment spliced into the "Art style: …" slot of an Agnes prompt.
  descriptor: string;
};

export const DEFAULT_STYLE_ID = "auto";

export const VISUAL_STYLES: VisualStyle[] = [
  {
    id: "auto",
    label: "Surprise Me",
    emoji: "🎲",
    // Placeholder — the real descriptor for "auto" is resolved per group via
    // pickArtStyle so different missions rotate looks. Never used directly.
    descriptor: ""
  },
  {
    id: "cartoon-pigs",
    label: "Cartoon Pigs",
    emoji: "🐷",
    descriptor:
      "Flat 2D cartoon in the style of a cheerful pig family on green hills, bold clean outlines, bright primary colors, friendly and simple"
  },
  {
    id: "race-cars",
    label: "Race Car Heroes",
    emoji: "🚗",
    descriptor:
      "3D cartoon of friendly talking vehicles and rescue cars with expressive faces, bold colorful, action-adventure for kids"
  },
  {
    id: "storybook",
    label: "Storybook Watercolor",
    emoji: "📖",
    descriptor:
      "Hand-drawn storybook watercolor illustration, soft pastel colors, cozy and whimsical"
  },
  {
    id: "anime",
    label: "Anime Cute",
    emoji: "🌸",
    descriptor:
      "Cute Japanese-style anime illustration, big sparkling eyes, playful colorful scenery"
  },
  {
    id: "claymation",
    label: "Claymation",
    emoji: "🧱",
    descriptor:
      "Claymation plasticine cartoon style, soft sculpted 3D shapes, tactile and fun"
  },
  {
    id: "crayon",
    label: "Crayon Doodle",
    emoji: "🖍️",
    descriptor:
      "Crayon and colored-pencil children's drawing style, doodle-like, playful hand-made textures"
  },
  {
    id: "kawaii",
    label: "Kawaii Chibi",
    emoji: "🥰",
    descriptor:
      "Kawaii chibi cartoon style, super cute simplified rounded characters, adorable and friendly"
  },
  {
    id: "3d-animation",
    label: "3D Animation",
    emoji: "🎬",
    descriptor:
      "Pixar-style 3D cartoon animation, soft rounded shapes, warm cheerful lighting, expressive characters"
  },
  {
    id: "flat-vector",
    label: "Flat Vector",
    emoji: "🟦",
    descriptor:
      "Flat 2D vector cartoon illustration, bold clean outlines, bright primary colors, simple shapes"
  },
  {
    id: "comic",
    label: "Comic Book",
    emoji: "💥",
    descriptor:
      "Cel-shaded comic cartoon style, lively dynamic poses, bright saturated colors"
  },
  {
    id: "pixel",
    label: "Pixel Art",
    emoji: "👾",
    descriptor:
      "Retro pixel-art cartoon illustration, chunky pixels, bright limited palette, playful and game-like"
  },
  {
    id: "dinosaurs",
    label: "Dino World",
    emoji: "🦕",
    descriptor:
      "Cute cartoon dinosaurs in a lush prehistoric jungle, friendly smiling dinos, bright adventurous colors"
  },
  {
    id: "robots",
    label: "Robot Friends",
    emoji: "🤖",
    descriptor:
      "Cute cartoon robots with friendly glowing eyes, rounded bolts and gears, bright futuristic colors"
  },
  {
    id: "space",
    label: "Space Adventure",
    emoji: "🚀",
    descriptor:
      "Cartoon space adventure, friendly astronauts and rockets among stars and planets, bright cosmic colors"
  }
];

// Words we never want reaching an image prompt even when a kid types them.
// Kept small and obvious — this is a soft guardrail, not a substitute for the
// child-safe constraints every prompt already carries.
const UNSAFE_TERMS = [
  "blood",
  "kill",
  "gun",
  "weapon",
  "nude",
  "naked",
  "sex",
  "violence",
  "drug",
  "scary",
  "dead",
  "dying"
];

const FREE_TEXT_MAX = 80;

export function getStyle(id: string): VisualStyle | undefined {
  return VISUAL_STYLES.find((style) => style.id === id);
}

// Trim, collapse runs of whitespace, cap length, and strip unsafe terms so a
// kid's free-text "describe your world" can't smuggle something inappropriate
// into the image prompt. Returns "" when nothing usable remains.
export function sanitizeFreeText(input: string): string {
  const collapsed = input.trim().replace(/\s+/g, " ").slice(0, FREE_TEXT_MAX);
  if (!collapsed) return "";
  const lowered = collapsed.toLowerCase();
  const cleaned = collapsed
    .split(" ")
    .filter((token) => {
      const t = token.toLowerCase().replace(/[^a-z]/g, "");
      return !UNSAFE_TERMS.some((term) => t === term || t.includes(term));
    })
    .join(" ")
    .trim();
  return cleaned;
}

// Resolve the prompt descriptor to splice into an Agnes "Art style: …" slot.
//
// - "auto" → delegate to pickArtStyle(seed) so different practice groups still
//   rotate looks (preserving the original variety behavior).
// - a known curated id → that style's descriptor, unless freeText is provided
//   and sanitizes to something non-empty (then the kid's note wins, wrapped in
//   a child-safe base so it can't override the cartoon-only constraint).
// - unknown id → fall back to "auto".
export function resolveStyleDescriptor(styleId: string, freeText: string | undefined, seed: string): string {
  const id = getStyle(styleId) ? styleId : DEFAULT_STYLE_ID;
  const note = freeText ? sanitizeFreeText(freeText) : "";
  if (note) {
    return `${note} style, illustrated, cartoonish, child-safe`;
  }
  if (id === DEFAULT_STYLE_ID) {
    return pickArtStyle(seed);
  }
  const style = getStyle(id);
  return style?.descriptor || pickArtStyle(seed);
}
