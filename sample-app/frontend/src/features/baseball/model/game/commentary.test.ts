import { describe, expect, it } from "vitest";
import type { BattedBall, InPlayResult, PitchResult, PlateOutcome } from "../../types/batting";
import {
  buildResolutionLines,
  describeGameEnd,
  describeInPlay,
  describePitchResult,
  describePlateOutcome,
  describeRuns,
  INNING_CHANGE_TEXT,
  type ResolutionSummary,
} from "./commentary";

const BALL: BattedBall = { type: "ground", strength: "medium", direction: "center" };

const IN_PLAY_RESULTS: readonly InPlayResult[] = ["groundout", "doublePlay", "flyout", "lineout", "single", "double", "triple", "homerun", "error"];

const PITCH_RESULTS: readonly PitchResult[] = [
  { kind: "ball" },
  { kind: "called-strike" },
  { kind: "swinging-strike" },
  { kind: "foul" },
  ...IN_PLAY_RESULTS.map((result): PitchResult => ({ kind: "in-play", result, ball: BALL })),
];

const PLATE_OUTCOMES: readonly PlateOutcome[] = ["walk", "strikeout", ...IN_PLAY_RESULTS];

describe("describeInPlay", () => {
  it("returns a non-empty string for every in-play result", () => {
    for (const result of IN_PLAY_RESULTS) {
      expect(describeInPlay(result).length).toBeGreaterThan(0);
    }
  });

  it("uses a distinct phrase for every in-play result", () => {
    const texts = new Set(IN_PLAY_RESULTS.map(describeInPlay));
    expect(texts.size).toBe(IN_PLAY_RESULTS.length);
  });

  it.each([
    ["single", "ヒット"],
    ["double", "二塁打"],
    ["triple", "三塁打"],
    ["homerun", "ホームラン"],
    ["doublePlay", "併殺打"],
  ] as const)("describes %s as %s", (result, text) => {
    expect(describeInPlay(result)).toBe(text);
  });
});

describe("describePitchResult", () => {
  it("returns a non-empty string for every pitch result", () => {
    for (const result of PITCH_RESULTS) {
      expect(describePitchResult(result).length).toBeGreaterThan(0);
    }
  });

  it("describes the non-in-play results", () => {
    expect(describePitchResult({ kind: "ball" })).toBe("ボール");
    expect(describePitchResult({ kind: "called-strike" })).toBe("見逃しストライク");
    expect(describePitchResult({ kind: "swinging-strike" })).toBe("空振り");
    expect(describePitchResult({ kind: "foul" })).toBe("ファウル");
  });

  it("describes an in-play result by its in-play phrase", () => {
    expect(describePitchResult({ kind: "in-play", result: "homerun", ball: BALL })).toBe(describeInPlay("homerun"));
  });
});

describe("describePlateOutcome", () => {
  it("returns a non-empty string for every plate outcome", () => {
    for (const outcome of PLATE_OUTCOMES) {
      expect(describePlateOutcome(outcome).length).toBeGreaterThan(0);
    }
  });

  it("describes walk and strikeout", () => {
    expect(describePlateOutcome("walk")).toBe("四球");
    expect(describePlateOutcome("strikeout")).toBe("三振");
  });

  it("falls back to the in-play phrase", () => {
    expect(describePlateOutcome("double")).toBe(describeInPlay("double"));
  });
});

describe("describeRuns / describeGameEnd", () => {
  it("includes the number of runs", () => {
    expect(describeRuns(1)).toBe("1点が入りました");
    expect(describeRuns(4)).toBe("4点が入りました");
  });

  it("announces the end of the game with the result", () => {
    expect(describeGameEnd("away")).toContain("試合終了");
    expect(describeGameEnd("home")).toContain("試合終了");
    expect(describeGameEnd(null)).toContain("試合終了");
    expect(describeGameEnd(null)).toContain("引き分け");
    expect(describeGameEnd("away")).not.toBe(describeGameEnd("home"));
  });
});

describe("buildResolutionLines", () => {
  const base: ResolutionSummary = { result: { kind: "ball" }, plate: null, runs: 0, inningEnded: false, gameOver: null };

  it("emits only the pitch line while the at-bat continues", () => {
    expect(buildResolutionLines(base)).toEqual(["ボール"]);
    expect(buildResolutionLines({ ...base, result: { kind: "foul" } })).toEqual(["ファウル"]);
  });

  it("emits the pitch line and the plate line for a walk or strikeout", () => {
    expect(buildResolutionLines({ ...base, plate: "walk" })).toEqual(["ボール", "四球"]);
    expect(buildResolutionLines({ ...base, result: { kind: "swinging-strike" }, plate: "strikeout" })).toEqual(["空振り", "三振"]);
  });

  it("emits only the plate line for an in-play result", () => {
    const summary: ResolutionSummary = { ...base, result: { kind: "in-play", result: "single", ball: BALL }, plate: "single" };
    expect(buildResolutionLines(summary)).toEqual(["ヒット"]);
  });

  it("appends the runs line when runs scored", () => {
    const summary: ResolutionSummary = { ...base, result: { kind: "in-play", result: "homerun", ball: BALL }, plate: "homerun", runs: 2 };
    expect(buildResolutionLines(summary)).toEqual(["ホームラン", "2点が入りました"]);
  });

  it("appends the inning change line when the inning ended", () => {
    const summary: ResolutionSummary = { ...base, result: { kind: "swinging-strike" }, plate: "strikeout", inningEnded: true };
    expect(buildResolutionLines(summary)).toEqual(["空振り", "三振", INNING_CHANGE_TEXT]);
  });

  it("appends the game end line instead of the inning change line when the game is over", () => {
    const summary: ResolutionSummary = {
      ...base,
      result: { kind: "swinging-strike" },
      plate: "strikeout",
      inningEnded: true,
      gameOver: { winner: "home" },
    };
    expect(buildResolutionLines(summary)).toEqual(["空振り", "三振", describeGameEnd("home")]);
  });

  it("orders a walk-off as plate, runs, then game end", () => {
    const summary: ResolutionSummary = {
      ...base,
      result: { kind: "in-play", result: "double", ball: BALL },
      plate: "double",
      runs: 1,
      gameOver: { winner: "home" },
    };
    expect(buildResolutionLines(summary)).toEqual(["二塁打", "1点が入りました", describeGameEnd("home")]);
  });

  it("returns a non-empty list for every pitch result", () => {
    for (const result of PITCH_RESULTS) {
      expect(buildResolutionLines({ ...base, result }).length).toBeGreaterThan(0);
    }
  });
});
