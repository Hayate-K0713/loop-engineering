import { describe, expect, it } from "vitest";
import type { BattedBall, InPlayResult, PitchResult, PlateOutcome } from "../../types/batting";
import type { InPlayRecord } from "../../types/game";
import { applyPitchResult, LINEUP_SIZE, runnerMovesOf } from "./outcome";
import { formatBases, makeState, parseBases } from "./test-fixtures";

const BALL_MEDIUM: BattedBall = { type: "ground", strength: "medium", direction: "pull" };
const BALL_WEAK: BattedBall = { type: "ground", strength: "weak", direction: "center" };
const BALL_STRONG: BattedBall = { type: "fly", strength: "strong", direction: "opposite" };

const inPlay = (result: InPlayResult, ball: BattedBall = BALL_MEDIUM): PitchResult => ({ kind: "in-play", result, ball });

const EARLIER_IN_PLAY: InPlayRecord = { seq: 3, result: "lineout", ball: { type: "liner", strength: "medium", direction: "center" } };

describe("applyPitchResult: pitches that do not end the at-bat", () => {
  it("ball adds a ball and changes nothing else but lastResult/lastPlate", () => {
    const state = makeState({ count: { balls: 1, strikes: 1 }, lastPlate: "single" });
    const next = applyPitchResult(state, { kind: "ball" });
    expect(next).toEqual({ ...state, count: { balls: 2, strikes: 1 }, lastResult: { kind: "ball" }, lastPlate: null });
  });

  it.each([["called-strike"], ["swinging-strike"]] as const)("%s adds a strike", (kind) => {
    const state = makeState({ count: { balls: 2, strikes: 0 } });
    const next = applyPitchResult(state, { kind });
    expect(next).toEqual({ ...state, count: { balls: 2, strikes: 1 }, lastResult: { kind }, lastPlate: null });
  });

  it("foul adds a strike with fewer than two strikes", () => {
    const next = applyPitchResult(makeState({ count: { balls: 0, strikes: 1 } }), { kind: "foul" });
    expect(next.count).toEqual({ balls: 0, strikes: 2 });
    expect(next.lastPlate).toBeNull();
    expect(next.lastResult).toEqual({ kind: "foul" });
  });

  it("foul leaves the count unchanged with two strikes", () => {
    const state = makeState({ count: { balls: 3, strikes: 2 } });
    expect(applyPitchResult(state, { kind: "foul" })).toEqual({ ...state, lastResult: { kind: "foul" }, lastPlate: null });
  });

  it("keeps lastInPlay as it was", () => {
    const state = makeState({ lastInPlay: EARLIER_IN_PLAY });
    for (const kind of ["ball", "called-strike", "swinging-strike", "foul"] as const) {
      expect(applyPitchResult(state, { kind }).lastInPlay).toBe(EARLIER_IN_PLAY);
    }
  });

  it("does not touch outs, bases, runs, hits or the lineup", () => {
    const state = makeState({
      outs: 1,
      bases: parseBases("12-"),
      lineScore: { away: [2], home: [] },
      hits: { away: 1, home: 0 },
      lineupIndex: { away: 4, home: 2 },
    });
    const next = applyPitchResult(state, { kind: "ball" });
    expect(next.outs).toBe(1);
    expect(next.bases).toEqual(state.bases);
    expect(next.lineScore).toEqual(state.lineScore);
    expect(next.hits).toEqual(state.hits);
    expect(next.lineupIndex).toEqual(state.lineupIndex);
  });
});

describe("applyPitchResult: walk and strikeout", () => {
  it("the fourth ball is a walk: count resets, the batter takes first, the lineup advances", () => {
    const state = makeState({ count: { balls: 3, strikes: 1 }, lineupIndex: { away: 2, home: 5 } });
    const next = applyPitchResult(state, { kind: "ball" });
    expect(next.lastPlate).toBe("walk");
    expect(next.lastResult).toEqual({ kind: "ball" });
    expect(next.count).toEqual({ balls: 0, strikes: 0 });
    expect(formatBases(next.bases)).toBe("1--");
    expect(next.outs).toBe(0);
    expect(next.lineupIndex).toEqual({ away: 3, home: 5 });
    expect(next.hits).toEqual({ away: 0, home: 0 });
  });

  it("a bases-loaded walk forces in a run for the batting side", () => {
    const state = makeState({ count: { balls: 3, strikes: 0 }, bases: parseBases("123") });
    const next = applyPitchResult(state, { kind: "ball" });
    expect(next.lineScore).toEqual({ away: [1], home: [] });
    expect(formatBases(next.bases)).toBe("123");
  });

  it.each([["called-strike"], ["swinging-strike"]] as const)("the third strike (%s) is a strikeout: one out, count resets", (kind) => {
    const state = makeState({ count: { balls: 2, strikes: 2 }, outs: 1, lineupIndex: { away: 8, home: 0 } });
    const next = applyPitchResult(state, { kind });
    expect(next.lastPlate).toBe("strikeout");
    expect(next.outs).toBe(2);
    expect(next.count).toEqual({ balls: 0, strikes: 0 });
    expect(next.lineupIndex.away).toBe(0);
  });

  it("walk and strikeout keep the previous lastInPlay", () => {
    const walk = applyPitchResult(makeState({ count: { balls: 3, strikes: 0 }, lastInPlay: EARLIER_IN_PLAY }), { kind: "ball" });
    const strikeout = applyPitchResult(makeState({ count: { balls: 0, strikes: 2 }, lastInPlay: EARLIER_IN_PLAY }), { kind: "swinging-strike" });
    expect(walk.lastInPlay).toBe(EARLIER_IN_PLAY);
    expect(strikeout.lastInPlay).toBe(EARLIER_IN_PLAY);
  });
});

describe("applyPitchResult: in-play results", () => {
  it("a single puts the batter on first, counts a hit for the batting side and sets lastPlate/lastInPlay", () => {
    const state = makeState({ pitchSeq: 7, count: { balls: 2, strikes: 1 } });
    const next = applyPitchResult(state, inPlay("single", BALL_STRONG));
    expect(next.lastPlate).toBe("single");
    expect(next.lastResult).toEqual(inPlay("single", BALL_STRONG));
    expect(next.lastInPlay).toEqual({ seq: 7, result: "single", ball: BALL_STRONG });
    expect(formatBases(next.bases)).toBe("1--");
    expect(next.hits).toEqual({ away: 1, home: 0 });
    expect(next.count).toEqual({ balls: 0, strikes: 0 });
    expect(next.lineupIndex).toEqual({ away: 1, home: 0 });
  });

  it("lastInPlay.seq is the pitchSeq of the resolved pitch and is replaced by the next in-play", () => {
    const first = applyPitchResult(makeState({ pitchSeq: 4 }), inPlay("flyout"));
    const second = applyPitchResult({ ...first, pitchSeq: 9 }, inPlay("double", BALL_STRONG));
    expect(first.lastInPlay?.seq).toBe(4);
    expect(second.lastInPlay).toEqual({ seq: 9, result: "double", ball: BALL_STRONG });
  });

  it.each([
    ["single", true],
    ["double", true],
    ["triple", true],
    ["homerun", true],
    ["groundout", false],
    ["flyout", false],
    ["lineout", false],
    ["error", false],
  ] as const)("%s counts as a hit: %s", (result, isHit) => {
    const next = applyPitchResult(makeState(), inPlay(result));
    expect(next.hits.away).toBe(isHit ? 1 : 0);
    expect(next.hits.home).toBe(0);
  });

  it("a double play does not count as a hit and adds two outs", () => {
    const state = makeState({ bases: parseBases("1--") });
    const next = applyPitchResult(state, inPlay("doublePlay"));
    expect(next.hits.away).toBe(0);
    expect(next.outs).toBe(2);
    expect(next.lastPlate).toBe("doublePlay");
    expect(formatBases(next.bases)).toBe("---");
  });

  it("an error counts against the fielding side only, not as a hit", () => {
    const top = applyPitchResult(makeState({ half: "top" }), inPlay("error"));
    expect(top.errors).toEqual({ away: 0, home: 1 });
    expect(top.hits).toEqual({ away: 0, home: 0 });
    expect(top.outs).toBe(0);
    expect(formatBases(top.bases)).toBe("1--");

    const bottom = applyPitchResult(makeState({ half: "bottom", lineScore: { away: [0], home: [0] } }), inPlay("error"));
    expect(bottom.errors).toEqual({ away: 1, home: 0 });
  });

  it("outs and strikeouts do not count errors", () => {
    expect(applyPitchResult(makeState(), inPlay("groundout")).errors).toEqual({ away: 0, home: 0 });
  });

  it("uses the batted-ball strength for runner movement", () => {
    const weak = applyPitchResult(makeState({ bases: parseBases("--3") }), inPlay("groundout", BALL_WEAK));
    const medium = applyPitchResult(makeState({ bases: parseBases("--3") }), inPlay("groundout", BALL_MEDIUM));
    expect(weak.lineScore.away).toEqual([0]);
    expect(formatBases(weak.bases)).toBe("--3");
    expect(medium.lineScore.away).toEqual([1]);
    expect(formatBases(medium.bases)).toBe("---");
  });

  it("a sacrifice fly scores the runner from third", () => {
    const next = applyPitchResult(makeState({ bases: parseBases("1-3"), outs: 1 }), inPlay("flyout", BALL_STRONG));
    expect(next.outs).toBe(2);
    expect(next.lineScore.away).toEqual([1]);
    expect(formatBases(next.bases)).toBe("1--");
  });
});

describe("applyPitchResult: scoring and bookkeeping", () => {
  it("adds runs to the current half-inning of the batting side and keeps earlier innings", () => {
    const top = makeState({ inning: 3, half: "top", lineScore: { away: [1, 0, 2], home: [0, 4] }, bases: parseBases("12-") });
    const nextTop = applyPitchResult(top, inPlay("homerun", BALL_STRONG));
    expect(nextTop.lineScore).toEqual({ away: [1, 0, 5], home: [0, 4] });

    const bottom = makeState({ inning: 2, half: "bottom", lineScore: { away: [1, 0], home: [3, 0] }, bases: parseBases("1--") });
    const nextBottom = applyPitchResult(bottom, inPlay("double", BALL_STRONG));
    expect(nextBottom.lineScore).toEqual({ away: [1, 0], home: [3, 0] });
  });

  it("scores in the bottom half go to the home side", () => {
    const bottom = makeState({ inning: 2, half: "bottom", lineScore: { away: [1, 0], home: [3, 0] }, bases: parseBases("-2-") });
    const next = applyPitchResult(bottom, inPlay("single"));
    expect(next.lineScore).toEqual({ away: [1, 0], home: [3, 1] });
    expect(next.hits).toEqual({ away: 0, home: 1 });
    expect(next.lineupIndex).toEqual({ away: 0, home: 1 });
  });

  it("the lineup index wraps from the last batter back to the first", () => {
    const state = makeState({ lineupIndex: { away: LINEUP_SIZE - 1, home: 3 } });
    const next = applyPitchResult(state, inPlay("lineout"));
    expect(next.lineupIndex).toEqual({ away: 0, home: 3 });
  });

  it("the third out ends the at-bat without a run, clears the bases and still advances the lineup", () => {
    const state = makeState({ outs: 2, bases: parseBases("--3"), lineupIndex: { away: 1, home: 0 } });
    const next = applyPitchResult(state, inPlay("groundout", BALL_STRONG));
    expect(next.outs).toBe(3);
    expect(next.lineScore.away).toEqual([0]);
    expect(formatBases(next.bases)).toBe("---");
    expect(next.lineupIndex.away).toBe(2);
    expect(next.lastPlate).toBe("groundout");
  });

  it("does not change the half-inning even when outs reach three", () => {
    const next = applyPitchResult(makeState({ outs: 2, inning: 4, half: "top" }), inPlay("lineout"));
    expect(next.inning).toBe(4);
    expect(next.half).toBe("top");
    expect(next.phase).toEqual({ kind: "await-pitch" });
  });

  it("leaves rng, pitchSeq, pitch counts, log and lastPitchKind untouched", () => {
    const state = makeState({ rng: 99, pitchSeq: 12, pitchCounts: { away: 3, home: 9 }, lastPitchKind: "slider", log: [{ seq: 1, text: "ボール" }] });
    const next = applyPitchResult(state, inPlay("single"));
    expect(next.rng).toBe(99);
    expect(next.pitchSeq).toBe(12);
    expect(next.pitchCounts).toEqual({ away: 3, home: 9 });
    expect(next.lastPitchKind).toBe("slider");
    expect(next.log).toEqual([{ seq: 1, text: "ボール" }]);
  });

  it("does not mutate its input", () => {
    const state = makeState({ bases: parseBases("123"), count: { balls: 3, strikes: 2 }, lineScore: { away: [1], home: [] } });
    const snapshot = structuredClone(state);
    applyPitchResult(state, { kind: "ball" });
    applyPitchResult(state, inPlay("homerun", BALL_STRONG));
    expect(state).toEqual(snapshot);
  });

  it("is deterministic: the same input gives equal output", () => {
    const state = makeState({ bases: parseBases("1-3"), outs: 1 });
    expect(applyPitchResult(state, inPlay("double", BALL_STRONG))).toEqual(applyPitchResult(state, inPlay("double", BALL_STRONG)));
  });
});

describe("applyPitchResult: lastPlate contract", () => {
  it("is null for every pitch that keeps the at-bat going and the outcome for every pitch that ends it", () => {
    const continuing: readonly PitchResult[] = [{ kind: "ball" }, { kind: "called-strike" }, { kind: "swinging-strike" }, { kind: "foul" }];
    for (const result of continuing) {
      expect(applyPitchResult(makeState(), result).lastPlate).toBeNull();
    }
    const results: readonly InPlayResult[] = ["groundout", "flyout", "lineout", "single", "double", "triple", "homerun", "error"];
    for (const result of results) {
      expect(applyPitchResult(makeState(), inPlay(result)).lastPlate).toBe(result);
    }
  });

  it("is null again on the first pitch after an at-bat ended", () => {
    const ended = applyPitchResult(makeState(), inPlay("single"));
    expect(ended.lastPlate).toBe("single");
    expect(applyPitchResult(ended, { kind: "ball" }).lastPlate).toBeNull();
  });
});

describe("applyPitchResult: lastAdvance", () => {
  it("is null for every pitch that keeps the at-bat going, even if the previous pitch recorded one", () => {
    const ended = applyPitchResult(makeState({ pitchSeq: 3, bases: parseBases("1--") }), inPlay("single"));
    expect(ended.lastAdvance).not.toBeNull();
    for (const kind of ["ball", "called-strike", "swinging-strike", "foul"] as const) {
      expect(applyPitchResult({ ...ended, pitchSeq: 4 }, { kind }).lastAdvance).toBeNull();
    }
  });

  it("records the advance with the pitchSeq of the resolved pitch, from the bases before the pitch", () => {
    const next = applyPitchResult(makeState({ pitchSeq: 8, bases: parseBases("12-") }), inPlay("single"));
    expect(next.lastAdvance).toEqual({
      seq: 8,
      before: parseBases("12-"),
      after: parseBases("12-"),
      scored: 1,
      batterTo: 1,
      advances: [
        { from: 2, to: 4 },
        { from: 1, to: 2 },
      ],
    });
  });

  it("records a walk and a strikeout too", () => {
    const walk = applyPitchResult(makeState({ pitchSeq: 2, count: { balls: 3, strikes: 0 }, bases: parseBases("123") }), { kind: "ball" });
    expect(walk.lastAdvance).toEqual({
      seq: 2,
      before: parseBases("123"),
      after: parseBases("123"),
      scored: 1,
      batterTo: 1,
      advances: [
        { from: 3, to: 4 },
        { from: 2, to: 3 },
        { from: 1, to: 2 },
      ],
    });
    const strikeout = applyPitchResult(makeState({ pitchSeq: 3, count: { balls: 0, strikes: 2 }, bases: parseBases("1--") }), { kind: "called-strike" });
    expect(strikeout.lastAdvance).toEqual({
      seq: 3,
      before: parseBases("1--"),
      after: parseBases("1--"),
      scored: 0,
      batterTo: 0,
      advances: [{ from: 1, to: 1 }],
    });
  });

  it("does not change anything else: the rest of the state is the same as before the record existed", () => {
    const state = makeState({ pitchSeq: 6, bases: parseBases("1-3"), outs: 1 });
    const { lastAdvance, ...rest } = applyPitchResult(state, inPlay("flyout", BALL_STRONG));
    expect(lastAdvance?.seq).toBe(6);
    expect(rest.outs).toBe(2);
    expect(rest.lineScore.away).toEqual([1]);
    expect(formatBases(rest.bases)).toBe("1--");
  });
});

function resultFor(plate: PlateOutcome, ball: BattedBall): PitchResult {
  switch (plate) {
    case "walk":
      return { kind: "ball" };
    case "strikeout":
      return { kind: "called-strike" };
    default:
      return inPlay(plate, ball);
  }
}

describe("runnerMovesOf", () => {
  const run = (bases: string, plate: PlateOutcome, outs = 0, ball: BattedBall = BALL_STRONG) => {
    const before = parseBases(bases);
    const count = plate === "walk" ? { balls: 3, strikes: 0 } : { balls: 0, strikes: 2 };
    const state = makeState({ bases: before, outs, count });
    const result = resultFor(plate, ball);
    const next = applyPitchResult(state, result);
    return { before, next, moves: next.lastAdvance };
  };

  it.each([
    [
      "12-",
      "homerun",
      4,
      3,
      [
        { from: 2, to: 4 },
        { from: 1, to: 4 },
      ],
    ],
    [
      "1-3",
      "double",
      2,
      1,
      [
        { from: 3, to: 4 },
        { from: 1, to: 3 },
      ],
    ],
    [
      "123",
      "triple",
      3,
      3,
      [
        { from: 3, to: 4 },
        { from: 2, to: 4 },
        { from: 1, to: 4 },
      ],
    ],
    [
      "1-3",
      "walk",
      1,
      0,
      [
        { from: 3, to: 3 },
        { from: 1, to: 2 },
      ],
    ],
    ["-2-", "error", 1, 0, [{ from: 2, to: 3 }]],
    [
      "12-",
      "groundout",
      0,
      0,
      [
        { from: 2, to: 3 },
        { from: 1, to: 2 },
      ],
    ],
    [
      "1-3",
      "doublePlay",
      0,
      1,
      [
        { from: 3, to: 4 },
        { from: 1, to: 0 },
      ],
    ],
    [
      "123",
      "doublePlay",
      0,
      1,
      [
        { from: 3, to: 4 },
        { from: 2, to: 3 },
        { from: 1, to: 0 },
      ],
    ],
    [
      "1-3",
      "flyout",
      0,
      1,
      [
        { from: 3, to: 4 },
        { from: 1, to: 1 },
      ],
    ],
    [
      "12-",
      "lineout",
      0,
      0,
      [
        { from: 2, to: 2 },
        { from: 1, to: 1 },
      ],
    ],
  ] as const)("%s %s: batter to %i, %i scored, runners %j", (bases, plate, batterTo, scored, advances) => {
    const ball: BattedBall = plate === "groundout" ? BALL_WEAK : BALL_STRONG;
    const { moves } = run(bases, plate, 0, ball);
    expect(moves?.batterTo).toBe(batterTo);
    expect(moves?.scored).toBe(scored);
    expect(moves?.advances).toEqual(advances);
  });

  it("a third out clears the runners: every runner ends off the bases and nobody scores", () => {
    const { moves } = run("-23", "groundout", 2);
    expect(moves?.after).toEqual(parseBases("---"));
    expect(moves?.scored).toBe(0);
    expect(moves?.advances).toEqual([
      { from: 3, to: 0 },
      { from: 2, to: 0 },
    ]);
  });

  const PLATES: readonly PlateOutcome[] = [
    "walk",
    "strikeout",
    "groundout",
    "doublePlay",
    "flyout",
    "lineout",
    "single",
    "double",
    "triple",
    "homerun",
    "error",
  ];
  const BASES_NOTATION = ["---", "1--", "-2-", "--3", "12-", "1-3", "-23", "123"] as const;

  /** 規則上ありうる組(併殺は 1 塁走者あり・2 アウト未満)。 */
  const cases = PLATES.flatMap((plate) => BASES_NOTATION.flatMap((bases) => [0, 1, 2].map((outs) => ({ plate, bases, outs })))).filter(
    ({ plate, bases, outs }) => plate !== "doublePlay" || (bases.startsWith("1") && outs < 2),
  );

  it("for every result x bases x outs: runners keep their order, never go back, and land on distinct bases that match the bases after", () => {
    const problems = cases.flatMap(({ plate, bases, outs }) => {
      const { next, moves } = run(bases, plate, outs, BALL_STRONG);
      if (moves === null) {
        return [`${plate} ${bases} ${outs}: no record`];
      }
      const landed = moves.advances.map((advance) => advance.to).filter((to) => to >= 1 && to <= 3);
      const batterOnBase = moves.batterTo >= 1 && moves.batterTo <= 3 ? [moves.batterTo] : [];
      const occupied = [...landed, ...batterOnBase].sort();
      const flags = [next.bases.first, next.bases.second, next.bases.third];
      const expected = [1, 2, 3].filter((_, index) => flags.at(index) === true);
      const backwards = moves.advances.filter((advance) => advance.to !== 0 && advance.to < advance.from);
      const homeCount = moves.advances.filter((advance) => advance.to === 4).length + (moves.batterTo === 4 ? 1 : 0);
      const issues: string[] = [];
      if (JSON.stringify(occupied) !== JSON.stringify(expected)) issues.push(`occupied ${occupied.join("")} != after ${expected.join("")}`);
      if (backwards.length > 0) issues.push("went back");
      if (homeCount !== moves.scored) issues.push(`home ${homeCount} != scored ${moves.scored}`);
      if (moves.scored !== next.lineScore.away.reduce((sum, v) => sum + v, 0)) issues.push("scored != runs added");
      return issues.map((issue) => `${plate} ${bases} outs${outs}: ${issue}`);
    });
    expect(problems).toEqual([]);
  });

  it("is a pure derivation: equal input gives equal output, and the bases are passed through", () => {
    const before = parseBases("12-");
    const after = parseBases("123");
    expect(runnerMovesOf(before, after, 0, "walk")).toEqual(runnerMovesOf(before, after, 0, "walk"));
    expect(runnerMovesOf(before, after, 0, "walk")).toMatchObject({ before, after, scored: 0 });
  });
});
