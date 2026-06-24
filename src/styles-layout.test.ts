import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "styles.css"), "utf8");

describe("mission stepper layout", () => {
  it("uses an in-flow stepper instead of a fixed bottom dock", () => {
    const stepperRule = css.match(/\.mission-stepper\s*{(?<body>[^}]*)}/s)?.groups?.body ?? "";

    // The stepper must exist and must not be position: fixed — that was the
    // entire class of bug we walked away from (bottom safe-area math, hero
    // overflow, double-reservation). It now sits in normal flow.
    expect(stepperRule).not.toBe("");
    expect(stepperRule).not.toMatch(/position\s*:\s*fixed/);
    // flex: 0 0 auto pins the stepper to its content height so the hero
    // (flex: 1) below it can claim the remaining vertical space.
    expect(stepperRule).toMatch(/flex\s*:\s*0\s+0\s+auto/);

    // The old dock-reservation machinery must stay gone. These variables and
    // selectors were the source of repeated regressions; reintroducing them
    // means someone is trying to fix the wrong problem again.
    expect(css).not.toContain("--mission-dock-height");
    expect(css).not.toContain("--mission-dock-gap");
    expect(css).not.toMatch(/\.mission-dock\b/);
    expect(css).not.toMatch(/\.app-shell:has\(\.mission-dock\)/);
    expect(css).not.toMatch(/\.main-stage:has\(\.mission-dock\)/);
    expect(css).not.toMatch(/\.mission-dashboard:has\(\s*>\s*\.mission-dock\s*\)/);
  });

  it("keeps the flex chain so the hero claims leftover viewport height", () => {
    const appShellRule = css.match(/\.app-shell\s*{(?<body>[^}]*)}/s)?.groups?.body ?? "";
    const mainStageRule = css.match(/\.main-stage\s*{(?<body>[^}]*)}/s)?.groups?.body ?? "";
    const missionDashboardRule =
      css.match(/\.mission-dashboard\s*{(?<body>[^}]*)}/s)?.groups?.body ?? "";
    const learningHeroRule = css.match(/\.learning-hero\s*{(?<body>[^}]*)}/s)?.groups?.body ?? "";

    // The chain: app-shell column-flex → main-stage flex:1 → dashboard
    // flex:1 → hero flex:1. The hero must grow into the leftover space; if
    // any link is missing it collapses back to content size.
    expect(appShellRule).toMatch(/flex-direction\s*:\s*column/);
    expect(mainStageRule).toMatch(/flex\s*:\s*1\s+1\s+auto/);
    expect(mainStageRule).toMatch(/min-height\s*:\s*0/);
    expect(missionDashboardRule).toMatch(/flex\s*:\s*1\s+1\s+auto/);
    expect(missionDashboardRule).toMatch(/min-height\s*:\s*0/);
    expect(learningHeroRule).toMatch(/flex\s*:\s*1\s+1\s+auto/);
    expect(learningHeroRule).toMatch(/min-height\s*:\s*0/);
    // No 100vh-based height calc — the flex chain replaces it.
    expect(learningHeroRule).not.toMatch(/height\s*:\s*clamp/);

    // Tablet breakpoint must not revert .main-stage to display: block; that
    // override would silently break the flex chain on 901-1100px viewports.
    expect(css).not.toMatch(/@media[^{]*1100px[^{]*{[^}]*\.main-stage\s*{\s*display\s*:\s*block/s);
  });

  it("keeps hero children sized to the hero track, not their content", () => {
    const picturePanelRule = css.match(/\.picture-panel\s*{(?<body>[^}]*)}/s)?.groups?.body ?? "";
    const pictureImageRule = css.match(/\.picture-panel img\s*{(?<body>[^}]*)}/s)?.groups?.body ?? "";
    const heroChildrenRule =
      css.match(/\.picture-panel,\s*\.word-focus-card\s*{(?<body>[^}]*)}/s)?.groups?.body ?? "";
    const wordFocusContentRule =
      css.match(/\.word-focus-content\s*{(?<body>[^}]*)}/s)?.groups?.body ?? "";

    expect(picturePanelRule).toMatch(/grid-template-rows\s*:\s*auto\s+minmax\(0,\s*1fr\)/);
    expect(pictureImageRule).toMatch(/height\s*:\s*100%/);
    expect(pictureImageRule).toMatch(/min-height\s*:\s*0/);
    // Grid items default to min-height: auto, so a tall image or word card
    // would push past the hero's clamped height. The shared rule MUST pin
    // min-height: 0 so the children obey the track.
    expect(heroChildrenRule).toMatch(/min-height\s*:\s*0/);
    // The inner content must not carry a rigid min-height floor — that
    // floor (previously 620px) used to force the word card past the hero.
    expect(wordFocusContentRule).not.toMatch(/min-height\s*:/);
  });
});

describe("lesson picker cover layout", () => {
  it("uses a balanced cover-card grid with a compact detail companion", () => {
    const lessonBoardRule = css.match(/\.lesson-board\s*{(?<body>[^}]*)}/s)?.groups?.body ?? "";
    const headerRule = css.match(/\.lesson-board-header\s*{(?<body>[^}]*)}/s)?.groups?.body ?? "";
    const unitGridRule = css.match(/\.lesson-unit-grid\s*{(?<body>[^}]*)}/s)?.groups?.body ?? "";
    const unitCardRule = css.match(/\.lesson-unit-card\s*{(?<body>[^}]*)}/s)?.groups?.body ?? "";
    const detailRule = css.match(/\.lesson-detail-panel\s*{(?<body>[^}]*)}/s)?.groups?.body ?? "";

    expect(lessonBoardRule).toMatch(/grid-template-columns\s*:\s*minmax\(0,\s*1fr\)\s+minmax\(320px,\s*400px\)/);
    expect(headerRule).toMatch(/grid-column\s*:\s*1\s*\/\s*-1/);
    expect(unitGridRule).toMatch(/grid-template-columns\s*:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
    expect(unitCardRule).toMatch(/grid-template-rows\s*:\s*auto\s+auto\s+minmax\(0,\s*1fr\)\s+auto/);
    expect(detailRule).toMatch(/align-self\s*:\s*start/);
  });

  it("collapses the lesson board below desktop widths", () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*1180px\)[\s\S]*\.lesson-board\s*{[\s\S]*grid-template-columns\s*:\s*1fr/);
    expect(css).toMatch(/@media\s*\(max-width:\s*900px\)[\s\S]*\.lesson-unit-grid\s*{[\s\S]*grid-template-columns\s*:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    expect(css).toMatch(/@media\s*\(max-width:\s*560px\)[\s\S]*\.lesson-unit-grid\s*{[\s\S]*grid-template-columns\s*:\s*1fr/);
  });
});
