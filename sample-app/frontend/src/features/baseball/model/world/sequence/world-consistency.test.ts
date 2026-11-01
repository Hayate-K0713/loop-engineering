import { describe, expect, it } from "vitest";
import type { BattedBall, PitchResult, PlateOutcome } from "../../../types/batting";
import type { RunnerMoves } from "../../../types/game";
import type { Vec3 } from "../../../types/scene";
import { applyPitchResult } from "../../game/outcome";
import { makeState, parseBases } from "../../game/test-fixtures";
import { handPosition } from "../motion/fk";
import { pitcherWindupPose } from "../motion/pitcher";
import { CHARACTER_RIG, PITCHER_FOLLOW_MS, SWING_CONTACT_PROGRESS, SWING_FOLLOW_END_PROGRESS } from "../motion/rig";
import { FIELDING, planFielding } from "../path/fielders";
import { planRunners, runnerPositionAt, runnerStandPosition, type RunnerMotion } from "../path/runners";
import { RELEASE_POINT, WORLD_PARAMS } from "../space/params";
import { distanceXZ } from "../space/vec3";

// `motion/`(B2)は `space/`(B1)を import できない並列実装の都合で、同じ意味の数値を `rig.ts` と `params.ts` の両方に持つ。
// 時間軸は sequence が `WORLD_PARAMS` を正として組み、動きは motion の定数で動くので、片方だけ調整するとずれる。ここで一致を固定する
// (ステップ G の見た目調整で片方だけ変えたときに、どちらを直すべきか分かるようにする)。

/** 手先とリリース点の距離の許容(m)。`rig.ts` の `PITCHER_RELEASE_POSE` のコメントと同じ。 */
const RELEASE_TOLERANCE_M = 0.15;

describe("motion と space の同値の定数", () => {
  it("投手が windup の終端(u = 1)で右手先を出す位置が RELEASE_POINT の 0.15m 以内(WORLD_PARAMS の投手の配置で)", () => {
    const hand = handPosition(pitcherWindupPose(1), CHARACTER_RIG, WORLD_PARAMS.actors.pitcher);
    const distance = Math.hypot(hand.x - RELEASE_POINT.x, hand.y - RELEASE_POINT.y, hand.z - RELEASE_POINT.z);
    expect(distance).toBeLessThanOrEqual(RELEASE_TOLERANCE_M);
  });

  it("投手のフォロースルーの長さ: PITCHER_FOLLOW_MS と WORLD_PARAMS.pitcherFollowMs が一致する", () => {
    expect(PITCHER_FOLLOW_MS).toBe(WORLD_PARAMS.pitcherFollowMs);
  });

  it("スイングの接触姿勢の progress: SWING_CONTACT_PROGRESS と WORLD_PARAMS.swing.contactRatio が一致する", () => {
    expect(SWING_CONTACT_PROGRESS).toBeCloseTo(WORLD_PARAMS.swing.contactRatio, 12);
  });

  it("スイングのフォロースルー終端の progress: SWING_FOLLOW_END_PROGRESS と WORLD_PARAMS.swing.followEndProgress が一致する", () => {
    expect(SWING_FOLLOW_END_PROGRESS).toBeCloseTo(WORLD_PARAMS.swing.followEndProgress, 12);
  });
});

// 進塁の演出(走者・捕球・送球)と結果の整合(L5)。全結果 × 塁状況 × アウト数で、reducer が記録する進塁の事実(`lastAdvance`)から
// 走者の計画(`planRunners`)と守備の計画(`planFielding`)を作り、演出が結果と矛盾しないことを確かめる。

const RUNNERS = WORLD_PARAMS.runners;
const ALL_PLATES: readonly PlateOutcome[] = [
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
const BALLS: readonly BattedBall[] = [
  { type: "ground", strength: "weak", direction: "center" },
  { type: "fly", strength: "strong", direction: "pull" },
];
const FIRST_BASE_SIDE: Vec3 = { x: 18, y: 0, z: -24 };
const SHORTSTOP_SIDE: Vec3 = { x: -7, y: 0, z: -32 };
const SECOND_BASE_SIDE: Vec3 = { x: 6, y: 0, z: -30 };
const THIRD_BASE_SIDE: Vec3 = { x: -18, y: 0, z: -22 };
const OUTFIELD: Vec3 = { x: 30, y: 0, z: -75 };
/** 内野(一塁手・遊撃手・二塁手・三塁手の担当)と外野の落下点。 */
const LANDINGS: readonly Vec3[] = [FIRST_BASE_SIDE, SHORTSTOP_SIDE, SECOND_BASE_SIDE, THIRD_BASE_SIDE, OUTFIELD];

type Case = { readonly plate: PlateOutcome; readonly bases: string; readonly outs: number; readonly ball: BattedBall };

/** 規則上ありうる組(併殺は一塁走者あり・2 アウト未満)。 */
const CASES: readonly Case[] = ALL_PLATES.flatMap((plate) =>
  BASES_NOTATION.flatMap((bases) => [0, 1, 2].flatMap((outs) => BALLS.map((ball): Case => ({ plate, bases, outs, ball })))),
).filter(({ plate, bases, outs }) => plate !== "doublePlay" || (bases.startsWith("1") && outs < 2));

function resultFor({ plate, ball }: Case): PitchResult {
  switch (plate) {
    case "walk":
      return { kind: "ball" };
    case "strikeout":
      return { kind: "called-strike" };
    default:
      return { kind: "in-play", result: plate, ball };
  }
}

type Resolved = { readonly moves: RunnerMoves; readonly outsAdded: number; readonly runs: number };

/** reducer の結果の適用(`applyPitchResult`)から進塁の事実を取り出す。 */
function resolve(testCase: Case): Resolved {
  const count = testCase.plate === "walk" ? { balls: 3, strikes: 0 } : { balls: 0, strikes: 2 };
  const state = makeState({ bases: parseBases(testCase.bases), outs: testCase.outs, count, pitchSeq: 7 });
  const next = applyPitchResult(state, resultFor(testCase));
  const record = next.lastAdvance;
  if (record === null) {
    throw new Error(`no lastAdvance for ${testCase.plate}`);
  }
  const moves: RunnerMoves = { before: record.before, after: record.after, scored: record.scored, batterTo: record.batterTo, advances: record.advances };
  return { moves, outsAdded: next.outs - state.outs, runs: next.lineScore.away.reduce((sum, value) => sum + value, 0) };
}

/** 位置に最も近い塁(1〜3 は構えの位置、4 は本塁)。 */
function nearestBase(point: Vec3): number {
  const distances = ([1, 2, 3, 4] as const).map((base) => distanceXZ(point, runnerStandPosition(base)));
  return distances.indexOf(Math.min(...distances)) + 1;
}

function motionsOf(moves: RunnerMoves, plate: PlateOutcome): readonly RunnerMotion[] {
  return planRunners(moves, plate).motions.filter((motion): motion is RunnerMotion => motion !== null);
}

function endOf(motion: RunnerMotion): Vec3 {
  return runnerPositionAt(motion, motion.durationMs);
}

function label(testCase: Case): string {
  return `${testCase.plate} ${testCase.bases} outs${testCase.outs}`;
}

describe("進塁の演出と結果の整合(L5)", () => {
  it("全結果 × 塁状況 × アウト数 × 打球: 計画は 4 スロット固定で、スロットの添字と一致し、全体の長さは最大 3.0 秒", () => {
    const problems = CASES.flatMap((testCase) => {
      const plan = planRunners(resolve(testCase).moves, testCase.plate);
      const longest = Math.max(0, ...plan.motions.map((motion) => motion?.durationMs ?? 0));
      const issues: string[] = [];
      if (plan.motions.length !== 4) issues.push("not 4 slots");
      if (plan.motions.some((motion, index) => motion !== null && motion.slot !== index)) issues.push("slot mismatch");
      if (plan.durationMs !== longest || plan.durationMs > RUNNERS.maxMs) issues.push(`duration ${plan.durationMs}`);
      return issues.map((issue) => `${label(testCase)}: ${issue}`);
    });
    expect(problems).toEqual([]);
  });

  it("ホームラン以外: 走者の最終位置(塁上に残る走者)が after と一致し、本塁に着いた走者の数が得点数と一致する", () => {
    const problems = CASES.filter(({ plate }) => plate !== "homerun").flatMap((testCase) => {
      const { moves, runs } = resolve(testCase);
      const motions = motionsOf(moves, testCase.plate);
      const onBase = motions
        .filter((motion) => motion.fate === "safe")
        .map((motion) => nearestBase(endOf(motion)))
        .sort();
      const expected = [moves.after.first, moves.after.second, moves.after.third].flatMap((flag, index) => (flag ? [index + 1] : []));
      const home = motions.filter((motion) => motion.fate === "scored" && nearestBase(endOf(motion)) === 4).length;
      const issues: string[] = [];
      if (onBase.join("") !== expected.join("")) issues.push(`bases ${onBase.join("")} != after ${expected.join("")}`);
      if (home !== moves.scored) issues.push(`home ${home} != scored ${moves.scored}`);
      if (moves.scored !== runs) issues.push(`scored ${moves.scored} != runs ${runs}`);
      return issues.map((issue) => `${label(testCase)}: ${issue}`);
    });
    expect(problems).toEqual([]);
  });

  it("ホームラン: 走者は動かない(所要時間 0・位置が時刻で変わらない)。生還した走者の数 + 打者 = 得点数で、野手は動かさない", () => {
    const homeruns = CASES.filter(({ plate }) => plate === "homerun");
    expect(homeruns.length).toBeGreaterThan(0);
    const problems = homeruns.flatMap((testCase) => {
      const { moves } = resolve(testCase);
      const motions = motionsOf(moves, "homerun");
      const still = motions.every((motion) => motion.durationMs === 0 && runnerPositionAt(motion, 0).x === runnerPositionAt(motion, 3000).x);
      const scoredCount = motions.filter((motion) => motion.fate === "scored").length + 1;
      const ok = planRunners(moves, "homerun").durationMs === 0 && still && scoredCount === moves.scored && planFielding("homerun", OUTFIELD) === null;
      return ok ? [] : [label(testCase)];
    });
    expect(problems).toEqual([]);
  });

  it("アウト: 成立の時刻(捕球または送球の到着)が、そのアウトになる走者の到着より retireMarginMs 以上前(ボールが走者より先に着く)", () => {
    const problems = CASES.flatMap((testCase) => {
      const motions = planRunners(resolve(testCase).moves, testCase.plate).motions;
      return LANDINGS.flatMap((landing) => {
        const retires = planFielding(testCase.plate, landing)?.retires ?? [];
        return retires.flatMap((retire) => {
          const motion = motions.at(retire.slot) ?? null;
          const caught = motion === null && retire.atMs === 0;
          const early = motion !== null && motion.fate === "out" && retire.atMs + FIELDING.retireMarginMs <= motion.durationMs;
          return caught || early ? [] : [`${label(testCase)} slot${retire.slot} at ${retire.atMs}`];
        });
      });
    });
    expect(problems).toEqual([]);
  });

  it("アウトの数: 守備の計画のアウト(三振は捕手)が reducer の追加アウトと一致し、併殺は 2 回送球、ゴロのアウトは打者がアウトの走者", () => {
    const problems = CASES.flatMap((testCase) => {
      const { moves, outsAdded } = resolve(testCase);
      const fielding = planFielding(testCase.plate, SHORTSTOP_SIDE);
      const planned = testCase.plate === "strikeout" ? 1 : (fielding?.retires.length ?? 0);
      const outMotions = motionsOf(moves, testCase.plate).filter((motion) => motion.fate === "out").length;
      const issues: string[] = [];
      if (planned !== outsAdded) issues.push(`outs ${planned} != ${outsAdded}`);
      if (testCase.plate === "doublePlay" && fielding?.throws.length !== 2) issues.push("double play needs 2 throws");
      if (testCase.plate === "groundout" && outMotions !== 1) issues.push("groundout: batter out");
      return issues.map((issue) => `${label(testCase)}: ${issue}`);
    });
    expect(problems).toEqual([]);
  });

  it("安打・失策: 送球せず、アウトの走者はいない(打者走者は塁に着く: 走者が先に着く)", () => {
    const hits = CASES.filter(({ plate }) => ["single", "double", "triple", "error"].includes(plate));
    expect(hits.length).toBeGreaterThan(0);
    const problems = hits.flatMap((testCase) => {
      const fielding = planFielding(testCase.plate, OUTFIELD);
      const motions = motionsOf(resolve(testCase).moves, testCase.plate);
      const batter = motions.find((motion) => motion.slot === 0);
      const noThrow = fielding?.throws.length === 0 && fielding.retires.length === 0;
      const ok = noThrow && motions.every((motion) => motion.fate !== "out") && batter?.fate === "safe";
      return ok ? [] : [label(testCase)];
    });
    expect(problems).toEqual([]);
  });

  it("決定論: 同じ入力は同じ計画", () => {
    const testCase = CASES.find(({ plate, bases }) => plate === "doublePlay" && bases === "123");
    if (testCase === undefined) {
      throw new Error("case not found");
    }
    const { moves } = resolve(testCase);
    expect(planRunners(moves, "doublePlay")).toEqual(planRunners(moves, "doublePlay"));
    expect(planFielding("doublePlay", SHORTSTOP_SIDE)).toEqual(planFielding("doublePlay", SHORTSTOP_SIDE));
  });
});
