import { CHILD_ART_STYLES, pickArtStyle } from "./agnes";

// A kid-selectable visual style for lesson pictures and reward videos. Labels
// give kids recognizable famous-cartoon cues; descriptors stay trademark-safe
// by asking for visual language instead of protected characters or brands.
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
    id: "sponge-comedy",
    label: "Sponge Comedy",
    emoji: "🧽",
    descriptor: CHILD_ART_STYLES[0]
  },
  {
    id: "mouse-clubhouse",
    label: "Mouse Clubhouse",
    emoji: "🏰",
    descriptor: CHILD_ART_STYLES[1]
  },
  {
    id: "monster-catchers",
    label: "Monster Catchers",
    emoji: "⚡",
    descriptor: CHILD_ART_STYLES[2]
  },
  {
    id: "toy-box",
    label: "Toy Box Adventure",
    emoji: "🧸",
    descriptor: CHILD_ART_STYLES[3]
  },
  {
    id: "princess-musical",
    label: "Princess Musical",
    emoji: "👑",
    descriptor: CHILD_ART_STYLES[4]
  },
  {
    id: "bluey-family",
    label: "Bluey Family",
    emoji: "💙",
    descriptor: CHILD_ART_STYLES[5]
  },
  {
    id: "magic-school-bus",
    label: "Magic School Bus",
    emoji: "🚌",
    descriptor: CHILD_ART_STYLES[6]
  },
  {
    id: "robot-cat",
    label: "Robot Cat",
    emoji: "🤖",
    descriptor: CHILD_ART_STYLES[7]
  },
  {
    id: "turtle-ninjas",
    label: "Turtle Ninjas",
    emoji: "🥷",
    descriptor: CHILD_ART_STYLES[8]
  },
  {
    id: "superhero-squad",
    label: "Superhero Squad",
    emoji: "🦸",
    descriptor: CHILD_ART_STYLES[9]
  },
  {
    id: "snow-queen",
    label: "Snow Queen",
    emoji: "❄️",
    descriptor: CHILD_ART_STYLES[10]
  },
  {
    id: "dragon-ball-action",
    label: "Dragon Ball Action",
    emoji: "🔥",
    descriptor: CHILD_ART_STYLES[11]
  },
  {
    id: "pocket-builder",
    label: "Pocket Builder",
    emoji: "🧱",
    descriptor: CHILD_ART_STYLES[12]
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
