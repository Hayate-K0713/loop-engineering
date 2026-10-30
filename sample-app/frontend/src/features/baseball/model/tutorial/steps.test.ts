import { describe, expect, it } from "vitest";
import type { IgnoredInputReason } from "../../types/batting";
import { firstBallHint, FIRST_BALL_HINT_COUNT, MAX_TAP_HINTS, tapHintFor, tutorialStepsFor, type TutorialMode } from "./steps";

const MODES: readonly TutorialMode[] = ["batting", "pitching"];
const REASONS: readonly IgnoredInputReason[] = ["not-ready", "holding", "tap-too-long", "tap-moved", "cancel", "held-release"];

describe("tutorialStepsFor", () => {
  it("どちらのモードも 3 ページで、id が一意・タイトルと本文が空でない", () => {
    for (const mode of MODES) {
      const steps = tutorialStepsFor(mode);
      expect(steps).toHaveLength(3);
      expect(new Set(steps.map((step) => step.id)).size).toBe(3);
      for (const step of steps) {
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.body.length).toBeGreaterThan(0);
      }
    }
  });

  it("打撃は ドラッグ → 予告 → タップ の順の絵、投球は 球種 → 狙い → ゲージ の順の絵", () => {
    expect(tutorialStepsFor("batting").map((step) => step.illustration)).toEqual(["drag", "preview", "tap"]);
    expect(tutorialStepsFor("pitching").map((step) => step.illustration)).toEqual(["select", "aim", "gauge"]);
  });

  it("打撃の文言はタップ方式で、『指を離してスイング』とは書かない", () => {
    const text = tutorialStepsFor("batting")
      .map((step) => step.body)
      .join("");
    expect(text).toContain("タップ");
    expect(text).not.toContain("はなして");
    expect(text).not.toContain("離");
  });

  it("最後のページに音の注意が入る", () => {
    for (const mode of MODES) {
      expect(tutorialStepsFor(mode).at(-1)?.body).toContain("マナーモード");
    }
  });
});

describe("firstBallHint", () => {
  it("最初の 5 球だけ文言を返し、6 球目からは null", () => {
    for (const mode of MODES) {
      for (let balls = 0; balls < FIRST_BALL_HINT_COUNT; balls += 1) {
        expect(firstBallHint(mode, balls)).not.toBeNull();
      }
      expect(firstBallHint(mode, FIRST_BALL_HINT_COUNT)).toBeNull();
    }
  });

  it("打撃と投球で文言が違う", () => {
    expect(firstBallHint("batting", 0)).not.toBe(firstBallHint("pitching", 0));
  });
});

describe("tapHintFor", () => {
  it("長押し・移動のときだけ、3 回までヒントを返す", () => {
    for (const reason of ["tap-too-long", "tap-moved"] as const) {
      for (let shown = 0; shown < MAX_TAP_HINTS; shown += 1) {
        expect(tapHintFor(reason, shown)).toContain("ポンと おす");
      }
      expect(tapHintFor(reason, MAX_TAP_HINTS)).toBeNull();
    }
  });

  it("それ以外の理由ではヒントを出さない", () => {
    const others = REASONS.filter((reason) => reason !== "tap-too-long" && reason !== "tap-moved");
    expect(others).toHaveLength(4);
    for (const reason of others) {
      expect(tapHintFor(reason, 0)).toBeNull();
    }
  });
});
