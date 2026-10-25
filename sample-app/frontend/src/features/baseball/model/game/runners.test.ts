import { describe, expect, it } from "vitest";
import type { PlateOutcome, Strength } from "../../types/batting";
import { advanceRunners, EMPTY_BASES, OUTS_PER_INNING, type RunnerPlay } from "./runners";
import { formatBases, parseBases } from "./test-fixtures";

/** 塁状況の表記("1-3" = 1塁・3塁)。表の各行の並び順。 */
const ALL_BASES = ["---", "1--", "-2-", "--3", "12-", "1-3", "-23", "123"] as const;

/** [走者(前), 走者(後), 得点]。いずれも打席前のアウト数が 0 のとき(3アウトにならない)の期待値。 */
type Row = [before: string, after: string, runs: number];

type PlayCase = {
  readonly name: string;
  readonly play: RunnerPlay;
  readonly outsAdded: number;
  readonly rows: readonly Row[];
};

const play = (kind: PlateOutcome, strength: Strength | null = null): RunnerPlay => ({ kind, strength });

const CASES: readonly PlayCase[] = [
  {
    name: "walk",
    play: play("walk"),
    outsAdded: 0,
    rows: [
      ["---", "1--", 0],
      ["1--", "12-", 0],
      ["-2-", "12-", 0],
      ["--3", "1-3", 0],
      ["12-", "123", 0],
      ["1-3", "123", 0],
      ["-23", "123", 0],
      ["123", "123", 1],
    ],
  },
  {
    name: "single",
    play: play("single", "medium"),
    outsAdded: 0,
    rows: [
      ["---", "1--", 0],
      ["1--", "12-", 0],
      ["-2-", "1--", 1],
      ["--3", "1--", 1],
      ["12-", "12-", 1],
      ["1-3", "12-", 1],
      ["-23", "1--", 2],
      ["123", "12-", 2],
    ],
  },
  {
    name: "double",
    play: play("double", "strong"),
    outsAdded: 0,
    rows: [
      ["---", "-2-", 0],
      ["1--", "-23", 0],
      ["-2-", "-2-", 1],
      ["--3", "-2-", 1],
      ["12-", "-23", 1],
      ["1-3", "-23", 1],
      ["-23", "-2-", 2],
      ["123", "-23", 2],
    ],
  },
  {
    name: "triple",
    play: play("triple", "strong"),
    outsAdded: 0,
    rows: [
      ["---", "--3", 0],
      ["1--", "--3", 1],
      ["-2-", "--3", 1],
      ["--3", "--3", 1],
      ["12-", "--3", 2],
      ["1-3", "--3", 2],
      ["-23", "--3", 2],
      ["123", "--3", 3],
    ],
  },
  {
    name: "homerun",
    play: play("homerun", "strong"),
    outsAdded: 0,
    rows: [
      ["---", "---", 1],
      ["1--", "---", 2],
      ["-2-", "---", 2],
      ["--3", "---", 2],
      ["12-", "---", 3],
      ["1-3", "---", 3],
      ["-23", "---", 3],
      ["123", "---", 4],
    ],
  },
  {
    name: "groundout (weak: forced advances only)",
    play: play("groundout", "weak"),
    outsAdded: 1,
    rows: [
      ["---", "---", 0],
      ["1--", "-2-", 0],
      ["-2-", "-2-", 0],
      ["--3", "--3", 0],
      ["12-", "-23", 0],
      ["1-3", "-23", 0],
      ["-23", "-23", 0],
      ["123", "-23", 1],
    ],
  },
  {
    name: "groundout (medium: every runner advances one base)",
    play: play("groundout", "medium"),
    outsAdded: 1,
    rows: [
      ["---", "---", 0],
      ["1--", "-2-", 0],
      ["-2-", "--3", 0],
      ["--3", "---", 1],
      ["12-", "-23", 0],
      ["1-3", "-2-", 1],
      ["-23", "--3", 1],
      ["123", "-23", 1],
    ],
  },
  {
    name: "groundout (strong: every runner advances one base)",
    play: play("groundout", "strong"),
    outsAdded: 1,
    rows: [
      ["---", "---", 0],
      ["1--", "-2-", 0],
      ["-2-", "--3", 0],
      ["--3", "---", 1],
      ["12-", "-23", 0],
      ["1-3", "-2-", 1],
      ["-23", "--3", 1],
      ["123", "-23", 1],
    ],
  },
  {
    name: "groundout (unknown strength is treated as weak)",
    play: play("groundout", null),
    outsAdded: 1,
    rows: [
      ["1--", "-2-", 0],
      ["-2-", "-2-", 0],
      ["--3", "--3", 0],
      ["123", "-23", 1],
    ],
  },
  {
    name: "doublePlay (batter and the runner on first are out)",
    play: play("doublePlay", "medium"),
    outsAdded: 2,
    rows: [
      ["1--", "---", 0],
      ["12-", "--3", 0],
      ["1-3", "---", 1],
      ["123", "--3", 1],
    ],
  },
  {
    name: "flyout (weak: runners hold)",
    play: play("flyout", "weak"),
    outsAdded: 1,
    rows: ALL_BASES.map((bases): Row => [bases, bases, 0]),
  },
  {
    name: "flyout (medium: sacrifice fly scores the runner on third)",
    play: play("flyout", "medium"),
    outsAdded: 1,
    rows: [
      ["---", "---", 0],
      ["1--", "1--", 0],
      ["-2-", "-2-", 0],
      ["--3", "---", 1],
      ["12-", "12-", 0],
      ["1-3", "1--", 1],
      ["-23", "-2-", 1],
      ["123", "12-", 1],
    ],
  },
  {
    name: "flyout (strong: sacrifice fly scores the runner on third)",
    play: play("flyout", "strong"),
    outsAdded: 1,
    rows: [
      ["--3", "---", 1],
      ["1-3", "1--", 1],
      ["-23", "-2-", 1],
      ["123", "12-", 1],
      ["12-", "12-", 0],
    ],
  },
  {
    name: "lineout (runners hold)",
    play: play("lineout", "strong"),
    outsAdded: 1,
    rows: ALL_BASES.map((bases): Row => [bases, bases, 0]),
  },
  {
    name: "strikeout (runners hold)",
    play: play("strikeout"),
    outsAdded: 1,
    rows: ALL_BASES.map((bases): Row => [bases, bases, 0]),
  },
  {
    name: "error (batter reaches first, every runner advances one base)",
    play: play("error", "medium"),
    outsAdded: 0,
    rows: [
      ["---", "1--", 0],
      ["1--", "12-", 0],
      ["-2-", "1-3", 0],
      ["--3", "1--", 1],
      ["12-", "123", 0],
      ["1-3", "12-", 1],
      ["-23", "1-3", 1],
      ["123", "123", 1],
    ],
  },
];

const ALL_OUTCOMES: readonly PlateOutcome[] = [
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

describe("advanceRunners: movement table (0 outs before the play)", () => {
  for (const testCase of CASES) {
    describe(testCase.name, () => {
      for (const [before, after, runs] of testCase.rows) {
        it(`${before} -> ${after}, ${runs} run(s)`, () => {
          const result = advanceRunners(parseBases(before), 0, testCase.play);
          expect(formatBases(result.bases)).toBe(after);
          expect(result.runs).toBe(runs);
          expect(result.outsAdded).toBe(testCase.outsAdded);
        });
      }
    });
  }

  it("covers every plate outcome", () => {
    const covered = new Set(CASES.map((testCase) => testCase.play.kind));
    expect([...covered].sort()).toEqual([...ALL_OUTCOMES].sort());
  });

  it("covers all 8 base situations for the main movement rows", () => {
    for (const kind of ["walk", "single", "double", "triple", "homerun", "error"]) {
      const testCase = CASES.find((candidate) => candidate.play.kind === kind);
      expect(testCase?.rows.map((row) => row[0])).toEqual([...ALL_BASES]);
    }
  });
});

describe("advanceRunners: every outcome x every base situation x every out count", () => {
  const isLegal = (kind: PlateOutcome, bases: string, outs: number): boolean => kind !== "doublePlay" || (bases.startsWith("1") && outs < 2);

  it("conserves runners: runners before + batter = runs + runners after + outs added (when the inning does not end)", () => {
    for (const testCase of CASES) {
      for (const bases of ALL_BASES) {
        for (const outs of [0, 1, 2]) {
          if (!isLegal(testCase.play.kind, bases, outs) || outs + testCase.outsAdded >= OUTS_PER_INNING) {
            continue;
          }
          const before = parseBases(bases);
          const result = advanceRunners(before, outs, testCase.play);
          const countOf = (value: string): number => value.replaceAll("-", "").length;
          expect(countOf(bases) + 1).toBe(result.runs + countOf(formatBases(result.bases)) + result.outsAdded);
        }
      }
    }
  });

  it("scores nothing and clears the bases when the play makes the third out", () => {
    for (const testCase of CASES) {
      for (const bases of ALL_BASES) {
        for (const outs of [0, 1, 2]) {
          if (!isLegal(testCase.play.kind, bases, outs) || outs + testCase.outsAdded < OUTS_PER_INNING) {
            continue;
          }
          const result = advanceRunners(parseBases(bases), outs, testCase.play);
          expect(result.runs).toBe(0);
          expect(result.bases).toEqual(EMPTY_BASES);
          expect(result.outsAdded).toBe(testCase.outsAdded);
        }
      }
    }
  });

  it("matches the 0-out table whenever the inning does not end", () => {
    for (const testCase of CASES) {
      for (const [before] of testCase.rows) {
        for (const outs of [0, 1, 2]) {
          if (!isLegal(testCase.play.kind, before, outs) || outs + testCase.outsAdded >= OUTS_PER_INNING) {
            continue;
          }
          expect(advanceRunners(parseBases(before), outs, testCase.play)).toEqual(advanceRunners(parseBases(before), 0, testCase.play));
        }
      }
    }
  });

  it("outsAdded is 0 for walks, hits and errors, 1 for plain outs, 2 for a double play", () => {
    const expected = new Map<PlateOutcome, number>([
      ["walk", 0],
      ["single", 0],
      ["double", 0],
      ["triple", 0],
      ["homerun", 0],
      ["error", 0],
      ["groundout", 1],
      ["flyout", 1],
      ["lineout", 1],
      ["strikeout", 1],
      ["doublePlay", 2],
    ]);
    for (const kind of ALL_OUTCOMES) {
      expect(advanceRunners(parseBases("1--"), 0, play(kind, "medium")).outsAdded).toBe(expected.get(kind));
    }
  });
});

describe("advanceRunners: specific rules", () => {
  it("single: the runner on first stops at second; second and third runners score", () => {
    const result = advanceRunners(parseBases("123"), 1, play("single", "medium"));
    expect(formatBases(result.bases)).toBe("12-");
    expect(result.runs).toBe(2);
  });

  it("a sacrifice fly needs fewer than 2 outs: with 2 outs the third out ends the inning without a run", () => {
    expect(advanceRunners(parseBases("--3"), 1, play("flyout", "strong")).runs).toBe(1);
    expect(advanceRunners(parseBases("--3"), 2, play("flyout", "strong")).runs).toBe(0);
  });

  it("a sacrifice fly needs a runner on third and medium or strong contact", () => {
    expect(advanceRunners(parseBases("1-3"), 0, play("flyout", "weak")).runs).toBe(0);
    expect(advanceRunners(parseBases("-2-"), 0, play("flyout", "strong")).runs).toBe(0);
  });

  it("a bases-loaded walk forces in a run", () => {
    const result = advanceRunners(parseBases("123"), 2, play("walk"));
    expect(result.runs).toBe(1);
    expect(formatBases(result.bases)).toBe("123");
  });

  it("a walk with a runner only on second does not move that runner", () => {
    expect(formatBases(advanceRunners(parseBases("-2-"), 0, play("walk")).bases)).toBe("12-");
  });

  it("a ground-ball double play with 0 outs lets the runner on third score", () => {
    const result = advanceRunners(parseBases("1-3"), 0, play("doublePlay", "medium"));
    expect(result.runs).toBe(1);
    expect(result.outsAdded).toBe(2);
  });

  it("a ground-ball double play with 1 out is the third out: no run scores", () => {
    const result = advanceRunners(parseBases("1-3"), 1, play("doublePlay", "medium"));
    expect(result.runs).toBe(0);
    expect(result.bases).toEqual(EMPTY_BASES);
  });

  it("a home run scores the batter and every runner even with 2 outs", () => {
    expect(advanceRunners(parseBases("123"), 2, play("homerun", "strong")).runs).toBe(4);
  });

  it("an error is not an out and the batter reaches first", () => {
    const result = advanceRunners(parseBases("---"), 2, play("error", "weak"));
    expect(result.outsAdded).toBe(0);
    expect(formatBases(result.bases)).toBe("1--");
  });

  it("does not mutate the input bases", () => {
    const bases = parseBases("123");
    advanceRunners(bases, 0, play("homerun", "strong"));
    expect(bases).toEqual({ first: true, second: true, third: true });
  });
});

describe("advanceRunners: doublePlay precondition", () => {
  it.each(["---", "-2-", "--3", "-23"])("throws when there is no runner on first (%s)", (bases) => {
    expect(() => advanceRunners(parseBases(bases), 0, play("doublePlay", "medium"))).toThrow(Error);
  });

  it.each(["1--", "12-", "1-3", "123"])("throws with 2 outs even if the runner is on first (%s)", (bases) => {
    expect(() => advanceRunners(parseBases(bases), 2, play("doublePlay", "medium"))).toThrow(Error);
  });

  it("does not throw when the precondition holds", () => {
    expect(advanceRunners(parseBases("1--"), 1, play("doublePlay", "medium")).outsAdded).toBe(2);
  });
});
