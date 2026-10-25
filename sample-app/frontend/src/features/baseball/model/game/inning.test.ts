import { describe, expect, it } from "vitest";
import type { Half } from "../../types/common";
import type { GameState, InPlayRecord, Innings } from "../../types/game";
import { EXTRA_INNINGS_MAX, settleInning } from "./inning";
import { formatBases, makeState } from "./test-fixtures";

const ALL_INNINGS: readonly Innings[] = [1, 3, 5, 9];

/** 2イニング以上の試合(最終回より前に別のイニングがある)。 */
const MULTI_INNINGS: readonly Innings[] = [3, 5, 9];

const IN_PLAY: InPlayRecord = { seq: 5, result: "double", ball: { type: "liner", strength: "strong", direction: "pull" } };

/** 合計得点が `total` になるよう、先頭の欄に全得点を置いた `length` 個の得点欄。 */
function cells(length: number, total: number): number[] {
  if (length === 0 && total > 0) {
    throw new Error("cannot place runs in an empty line score");
  }
  return Array.from({ length }, (_, index) => (index === 0 ? total : 0));
}

type Situation = {
  readonly innings: Innings;
  readonly inning: number;
  readonly half: Half;
  readonly outs: number;
  readonly away: number;
  readonly home: number;
};

/** 指定の状況の試合。得点欄の長さは、表なら 先攻=inning・後攻=inning-1、裏なら両方 inning。 */
function situation(s: Situation): GameState {
  return makeState({
    config: { innings: s.innings, humanSide: "away", difficulty: "normal" },
    inning: s.inning,
    half: s.half,
    outs: s.outs,
    bases: { first: true, second: false, third: true },
    count: { balls: 2, strikes: 1 },
    lastPitchKind: "curve",
    lastInPlay: IN_PLAY,
    lineScore: { away: cells(s.inning, s.away), home: cells(s.half === "top" ? s.inning - 1 : s.inning, s.home) },
  });
}

function expectFreshHalf(next: GameState, inning: number, half: Half, tiebreak: boolean): void {
  expect(next.inning).toBe(inning);
  expect(next.half).toBe(half);
  expect(next.outs).toBe(0);
  expect(next.count).toEqual({ balls: 0, strikes: 0 });
  expect(formatBases(next.bases)).toBe(tiebreak ? "12-" : "---");
  expect(next.lastPitchKind).toBeNull();
  expect(next.lastInPlay).toBe(IN_PLAY);
  expect(next.phase).toEqual({ kind: "await-pitch" });
}

describe("settleInning: the half-inning continues", () => {
  it.each(ALL_INNINGS)("returns the same state while outs < 3 (%i-inning game)", (innings) => {
    for (const outs of [0, 1, 2]) {
      const top = situation({ innings, inning: 1, half: "top", outs, away: 2, home: 0 });
      expect(settleInning(top)).toBe(top);
      const bottom = situation({ innings, inning: 1, half: "bottom", outs, away: 2, home: 0 });
      expect(settleInning(bottom)).toBe(bottom);
    }
  });

  it.each(MULTI_INNINGS)("does not end a final-inning top before three outs even if home leads (%i-inning game)", (innings) => {
    const top = situation({ innings, inning: innings, half: "top", outs: 2, away: 0, home: 3 });
    expect(settleInning(top)).toBe(top);
  });

  it.each(MULTI_INNINGS)("does not walk off before the final inning (%i-inning game)", (innings) => {
    const bottom = situation({ innings, inning: 1, half: "bottom", outs: 1, away: 0, home: 4 });
    expect(settleInning(bottom)).toBe(bottom);
  });

  it("does not end the game when the top of the final inning has away leading", () => {
    const top = situation({ innings: 3, inning: 3, half: "top", outs: 1, away: 5, home: 1 });
    expect(settleInning(top)).toBe(top);
  });
});

describe("settleInning: end of a top half", () => {
  it.each(ALL_INNINGS)("moves to the bottom of the same inning when home is not ahead in the final inning (%i-inning game)", (innings) => {
    const scores: readonly (readonly [number, number])[] =
      innings === 1
        ? [
            [0, 0],
            [3, 0],
          ]
        : [
            [0, 0],
            [3, 0],
            [3, 3],
          ];
    for (const [away, home] of scores) {
      const next = settleInning(situation({ innings, inning: innings, half: "top", outs: 3, away, home }));
      expectFreshHalf(next, innings, "bottom", false);
      expect(next.lineScore.home).toHaveLength(innings);
      expect(next.lineScore.home.at(-1)).toBe(0);
      expect(next.lineScore.away).toHaveLength(innings);
    }
  });

  it.each(ALL_INNINGS)("appends a 0 only to the batting side's line score (%i-inning game)", (innings) => {
    const state = situation({ innings, inning: 1, half: "top", outs: 3, away: 1, home: 0 });
    const next = settleInning(state);
    expect(next.lineScore.away).toEqual(state.lineScore.away);
    expect(next.lineScore.home).toEqual([0]);
  });

  it.each(MULTI_INNINGS)("ends the game without a bottom half when home leads after the final top (%i-inning game)", (innings) => {
    const state = situation({ innings, inning: innings, half: "top", outs: 3, away: 1, home: 2 });
    const next = settleInning(state);
    expect(next.phase).toEqual({ kind: "game-over", winner: "home" });
    expect(next.half).toBe("top");
    expect(next.lineScore.home).toHaveLength(innings - 1);
    expect(next.lineScore.away).toHaveLength(innings);
  });

  it.each(MULTI_INNINGS)("goes on to the bottom when home leads before the final inning (%i-inning game)", (innings) => {
    const next = settleInning(situation({ innings, inning: 2, half: "top", outs: 3, away: 0, home: 3 }));
    expect(next.phase).toEqual({ kind: "await-pitch" });
    expectFreshHalf(next, 2, "bottom", false);
  });
});

describe("settleInning: end of a bottom half before the final inning", () => {
  it.each(MULTI_INNINGS)("moves to the top of the next inning (%i-inning game)", (innings) => {
    const state = situation({ innings, inning: 1, half: "bottom", outs: 3, away: 1, home: 2 });
    const next = settleInning(state);
    expectFreshHalf(next, 2, "top", false);
    expect(next.lineScore.away).toEqual([1, 0]);
    expect(next.lineScore.home).toEqual(state.lineScore.home);
  });
});

describe("settleInning: the final inning", () => {
  it.each(ALL_INNINGS)("away wins when it leads after the final bottom (%i-inning game)", (innings) => {
    const next = settleInning(situation({ innings, inning: innings, half: "bottom", outs: 3, away: 4, home: 2 }));
    expect(next.phase).toEqual({ kind: "game-over", winner: "away" });
    expect(next.half).toBe("bottom");
  });

  it.each(ALL_INNINGS)("home wins on a walk-off the moment it takes the lead, whatever the outs (%i-inning game)", (innings) => {
    for (const outs of [0, 1, 2]) {
      const next = settleInning(situation({ innings, inning: innings, half: "bottom", outs, away: 2, home: 3 }));
      expect(next.phase).toEqual({ kind: "game-over", winner: "home" });
      expect(next.outs).toBe(outs);
    }
  });

  it.each(ALL_INNINGS)("only a tie does not end the final bottom before three outs (%i-inning game)", (innings) => {
    const tied = situation({ innings, inning: innings, half: "bottom", outs: 1, away: 2, home: 2 });
    const behind = situation({ innings, inning: innings, half: "bottom", outs: 2, away: 5, home: 2 });
    expect(settleInning(tied)).toBe(tied);
    expect(settleInning(behind)).toBe(behind);
  });

  it.each(ALL_INNINGS)("a tie after the final bottom goes to extra innings with a runner on first and second (%i-inning game)", (innings) => {
    const next = settleInning(situation({ innings, inning: innings, half: "bottom", outs: 3, away: 3, home: 3 }));
    expectFreshHalf(next, innings + 1, "top", true);
    expect(next.lineScore.away).toHaveLength(innings + 1);
    expect(next.lineScore.home).toHaveLength(innings);
  });
});

describe("settleInning: extra innings", () => {
  it("allows at most three extra innings", () => {
    expect(EXTRA_INNINGS_MAX).toBe(3);
  });

  it.each(ALL_INNINGS)("starts each extra half-inning with the tiebreak runners (%i-inning game)", (innings) => {
    const top = settleInning(situation({ innings, inning: innings + 1, half: "top", outs: 3, away: 3, home: 3 }));
    expectFreshHalf(top, innings + 1, "bottom", true);
    const bottom = settleInning(situation({ innings, inning: innings + 1, half: "bottom", outs: 3, away: 3, home: 3 }));
    expectFreshHalf(bottom, innings + 2, "top", true);
  });

  it.each(ALL_INNINGS)("home walks off in extra innings (%i-inning game)", (innings) => {
    const next = settleInning(situation({ innings, inning: innings + 1, half: "bottom", outs: 1, away: 3, home: 4 }));
    expect(next.phase).toEqual({ kind: "game-over", winner: "home" });
  });

  it.each(ALL_INNINGS)("away wins when it leads after an extra bottom (%i-inning game)", (innings) => {
    const next = settleInning(situation({ innings, inning: innings + 2, half: "bottom", outs: 3, away: 5, home: 3 }));
    expect(next.phase).toEqual({ kind: "game-over", winner: "away" });
  });

  it.each(ALL_INNINGS)("keeps playing while tied until the last allowed extra inning (%i-inning game)", (innings) => {
    for (const inning of [innings + 1, innings + 2]) {
      const next = settleInning(situation({ innings, inning, half: "bottom", outs: 3, away: 2, home: 2 }));
      expect(next.phase).toEqual({ kind: "await-pitch" });
      expect(next.inning).toBe(inning + 1);
      expect(next.half).toBe("top");
    }
  });

  it.each(ALL_INNINGS)("ends in a draw when still tied after the last extra inning (%i-inning game)", (innings) => {
    const next = settleInning(situation({ innings, inning: innings + EXTRA_INNINGS_MAX, half: "bottom", outs: 3, away: 2, home: 2 }));
    expect(next.phase).toEqual({ kind: "game-over", winner: null });
  });

  it.each(ALL_INNINGS)("a decisive last extra inning still produces a winner (%i-inning game)", (innings) => {
    const next = settleInning(situation({ innings, inning: innings + EXTRA_INNINGS_MAX, half: "bottom", outs: 3, away: 4, home: 2 }));
    expect(next.phase).toEqual({ kind: "game-over", winner: "away" });
  });
});

describe("settleInning: purity", () => {
  it("does not mutate its input and keeps unrelated fields", () => {
    const state = makeState({
      outs: 3,
      pitchSeq: 14,
      rng: 77,
      hits: { away: 2, home: 1 },
      lineupIndex: { away: 4, home: 6 },
      lastInPlay: IN_PLAY,
      lineScore: { away: [1], home: [] },
    });
    const snapshot = structuredClone(state);
    const next = settleInning(state);
    expect(state).toEqual(snapshot);
    expect(next.pitchSeq).toBe(14);
    expect(next.rng).toBe(77);
    expect(next.hits).toEqual({ away: 2, home: 1 });
    expect(next.lineupIndex).toEqual({ away: 4, home: 6 });
    expect(next.lastInPlay).toBe(IN_PLAY);
  });

  it("keeps lastInPlay when the game ends", () => {
    const next = settleInning(situation({ innings: 3, inning: 3, half: "bottom", outs: 3, away: 4, home: 1 }));
    expect(next.lastInPlay).toBe(IN_PLAY);
  });
});
