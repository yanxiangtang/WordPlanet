import { describe, expect, it } from "vitest";
import { pickArtStyle } from "./agnes";
import {
  DEFAULT_STYLE_ID,
  getStyle,
  resolveStyleDescriptor,
  sanitizeFreeText,
  VISUAL_STYLES
} from "./styles";

describe("visual style registry", () => {
  it("exposes a stable default and includes the auto/surprise-me option", () => {
    expect(DEFAULT_STYLE_ID).toBe("auto");
    expect(VISUAL_STYLES.some((style) => style.id === "auto")).toBe(true);
    expect(getStyle(DEFAULT_STYLE_ID)).toBeTruthy();
  });

  it("has unique ids and non-empty labels and descriptors for every curated style", () => {
    const ids = VISUAL_STYLES.map((style) => style.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const style of VISUAL_STYLES) {
      expect(style.label.length).toBeGreaterThan(0);
      // "auto" intentionally leaves its placeholder descriptor empty — it is
      // resolved per-group via pickArtStyle, never used directly.
      if (style.id !== DEFAULT_STYLE_ID) {
        expect(style.descriptor.length).toBeGreaterThan(0);
      }
    }
  });

  it("offers at least 12 curated looks plus the auto option", () => {
    expect(VISUAL_STYLES.length).toBeGreaterThanOrEqual(13);
  });

  it("never names a trademarked character IP directly in a descriptor", () => {
    // Image models refuse named brands; the curated looks evoke the style
    // (cheerful pig family, talking rescue cars) without naming the IP.
    const blocklist = ["peppa", "cory", "disney", "pokemon", "mario", "spongebob"];
    for (const style of VISUAL_STYLES) {
      for (const term of blocklist) {
        expect(style.descriptor.toLowerCase()).not.toContain(term);
      }
    }
  });
});

describe("resolveStyleDescriptor", () => {
  it("returns the curated style descriptor when no free-text note is given", () => {
    const style = getStyle("cartoon-pigs");
    expect(style).toBeTruthy();
    expect(resolveStyleDescriptor("cartoon-pigs", undefined, "some-seed")).toBe(style?.descriptor);
  });

  it("delegates to pickArtStyle for the auto style so groups rotate", () => {
    const seed = "cat-dog-bird";
    expect(resolveStyleDescriptor(DEFAULT_STYLE_ID, undefined, seed)).toBe(pickArtStyle(seed));
  });

  it("is deterministic for the auto style on a fixed seed", () => {
    const a = resolveStyleDescriptor(DEFAULT_STYLE_ID, undefined, "rabbit-fish");
    const b = resolveStyleDescriptor(DEFAULT_STYLE_ID, undefined, "rabbit-fish");
    expect(a).toBe(b);
  });

  it("falls back to auto when given an unknown style id", () => {
    const seed = "apple-banana";
    expect(resolveStyleDescriptor("does-not-exist", undefined, seed)).toBe(pickArtStyle(seed));
  });

  it("wraps a sanitized free-text note in the child-safe base descriptor", () => {
    const descriptor = resolveStyleDescriptor("cartoon-pigs", "dancing dinosaurs at a party", "seed");
    expect(descriptor).toBe("dancing dinosaurs at a party style, illustrated, cartoonish, child-safe");
  });

  it("ignores a free-text note that sanitizes to empty and uses the curated descriptor", () => {
    expect(resolveStyleDescriptor("cartoon-pigs", "   ", "seed")).toBe(getStyle("cartoon-pigs")?.descriptor);
    expect(resolveStyleDescriptor("cartoon-pigs", "blood violence", "seed")).toBe(getStyle("cartoon-pigs")?.descriptor);
  });
});

describe("sanitizeFreeText", () => {
  it("trims and collapses whitespace and caps length", () => {
    expect(sanitizeFreeText("  dancing    dinosaurs  ")).toBe("dancing dinosaurs");
    const long = "x".repeat(200);
    expect(sanitizeFreeText(long).length).toBe(80);
  });

  it("strips unsafe terms but keeps the rest of the phrase", () => {
    expect(sanitizeFreeText("happy bunnies and scary guns")).toBe("happy bunnies and");
  });

  it("returns an empty string when nothing usable remains", () => {
    expect(sanitizeFreeText("")).toBe("");
    expect(sanitizeFreeText("   ")).toBe("");
    expect(sanitizeFreeText("blood kill violence")).toBe("");
  });
});
