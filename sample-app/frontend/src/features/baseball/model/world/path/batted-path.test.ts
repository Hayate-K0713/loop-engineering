import { describe, expect, it } from "vitest";
import type { BattedBall, BattedType, Direction, InPlayResult, Strength } from "../../../types/batting";
import type { Vec3 } from "../../../types/scene";
import { computeBattedLanding } from "../../batting/batted-landing";
import { LANDING_PARAMS } from "../../batting/params";
import { resultEntries } from "../../batting/result-table";
import { landingToWorld } from "../space/coords";
import { buildStageGeometry, standsHeightAt } from "../space/geometry";
import { WORLD_PARAMS } from "../space/params";
import { type BattedPlan, battedBallAt, planBattedBall, planFoul } from "./batted-path";

const TYPES: readonly BattedType[] = ["ground", "liner", "fly"];
const STRENGTHS: readonly Strength[] = ["weak", "medium", "strong"];
const DIRECTIONS: readonly Direction[] = ["pull", "center", "opposite"];
const SEQS: readonly number[] = Array.from({ length: 50 }, (_, i) => i + 1);
const START: Vec3 = { x: 0.08, y: 0.72, z: -0.2 };
const STANDS = buildStageGeometry().stands;
const SAMPLE_COUNT = 120;

type Case = {
  readonly ball: BattedBall;
  readonly result: InPlayResult;
  readonly seq: number;
  readonly plan: BattedPlan;
};

const ALL_BALLS: readonly BattedBall[] = TYPES.flatMap((type) =>
  STRENGTHS.flatMap((strength) => DIRECTIONS.map((direction): BattedBall => ({ type, strength, direction }))),
);

/** その打球で重みが正の(= 到達する)結果。 */
function reachableResults(ball: BattedBall): readonly InPlayResult[] {
  return resultEntries(ball, true)
    .filter((entry) => entry.weight > 0)
    .map((entry) => entry.value);
}

function casesOf(ball: BattedBall, result: InPlayResult): readonly Case[] {
  return SEQS.map((seq): Case => ({ ball, result, seq, plan: planBattedBall(ball, result, seq, START) }));
}

/** RESULT_TABLE で重みが正の(打球タイプ × 強さ × 結果)× 方向3種 × seq 1〜50 の全計画。到達しない組み合わせは含まない。 */
const CASES: readonly Case[] = ALL_BALLS.flatMap((ball) => reachableResults(ball).flatMap((result) => casesOf(ball, result)));

const HOMERUNS = CASES.filter((item) => item.result === "homerun");
const IN_PLAY_FIELD = CASES.filter((item) => item.result !== "homerun");

/** 計画を 0 〜 hangMs で等分したサンプルの位置。 */
function samplesOf(plan: BattedPlan): readonly Vec3[] {
  return Array.from({ length: SAMPLE_COUNT + 1 }, (_, i) => battedBallAt(plan, (i / SAMPLE_COUNT) * plan.hangMs));
}

/** 条件を満たさないケースの先頭3件(失敗メッセージ用)。 */
function failures(cases: readonly Case[], predicate: (item: Case) => boolean): readonly string[] {
  return cases
    .filter((item) => !predicate(item))
    .slice(0, 3)
    .map((item) => `${item.ball.type}/${item.ball.strength}/${item.ball.direction}/${item.result}/seq${item.seq}`);
}

/** y の局所的な極大の数。 */
function countLocalMaxima(values: readonly number[]): number {
  return values.filter((value, i) => i > 0 && i < values.length - 1 && value > (values.at(i - 1) ?? 0) && value > (values.at(i + 1) ?? 0)).length;
}

describe("planBattedBall: 組み合わせの網羅", () => {
  it("到達する(タイプ × 強さ × 結果)× 方向 × seq を列挙している(ground の homerun は含まない)", () => {
    expect(CASES.length).toBeGreaterThan(3000);
    expect(HOMERUNS.length).toBeGreaterThan(0);
    expect(HOMERUNS.every((item) => item.ball.type !== "ground")).toBe(true);
  });
});

describe("battedBallAt: 端点と落下点", () => {
  it("sinceContact = 0 で start に厳密一致する", () => {
    expect(failures(CASES, (item) => JSON.stringify(battedBallAt(item.plan, 0)) === JSON.stringify(START))).toEqual([]);
  });

  it("hangMs で x・z が landingToWorld(computeBattedLanding(...)) に一致する(= フィールド図の落下点と同値)", () => {
    const mismatches = failures(CASES, (item) => {
      const expected = landingToWorld(computeBattedLanding(item.ball, item.result, item.seq));
      const actual = battedBallAt(item.plan, item.plan.hangMs);
      return actual.x === expected.x && actual.z === expected.z;
    });
    expect(mismatches).toEqual([]);
  });

  it("p ≥ 1(hangMs 以降)は plan.end に厳密一致し、動かない", () => {
    const mismatches = failures(CASES, (item) => {
      const later = battedBallAt(item.plan, item.plan.hangMs * 3);
      const end = JSON.stringify(item.plan.end);
      return JSON.stringify(later) === end && JSON.stringify(battedBallAt(item.plan, item.plan.hangMs)) === end;
    });
    expect(mismatches).toEqual([]);
  });

  it("負の経過時間は start と同じ", () => {
    const plan = planBattedBall({ type: "fly", strength: "medium", direction: "center" }, "flyout", 5, START);
    expect(battedBallAt(plan, -300)).toEqual(START);
  });

  it("同一入力で deep equal(決定論)で、滞空時間と頂点は有限の正の値(ゴロの頂点は 0)", () => {
    for (const item of CASES.slice(0, 200)) {
      expect(planBattedBall(item.ball, item.result, item.seq, START)).toEqual(item.plan);
    }
    expect(failures(CASES, (item) => Number.isFinite(item.plan.hangMs) && item.plan.hangMs > 0 && Number.isFinite(item.plan.peak))).toEqual([]);
    expect(failures(CASES, (item) => (item.plan.shape === "ground" ? item.plan.peak === 0 : item.plan.peak > 0))).toEqual([]);
  });

  it("shape は打球タイプに従い、ゴロだけが hops(バウンド回数)を持つ", () => {
    expect(failures(CASES, (item) => item.plan.shape === item.ball.type)).toEqual([]);
    expect(failures(CASES, (item) => (item.plan.shape === "ground" ? item.plan.hops >= 1 : item.plan.hops === 0))).toEqual([]);
  });
});

describe("battedBallAt: 高さ", () => {
  it("ホームラン以外は終点の y = 0 かつ全区間で y ≥ 0(overFence でもない)", () => {
    expect(failures(IN_PLAY_FIELD, (item) => item.plan.end.y === 0 && !item.plan.overFence)).toEqual([]);
    expect(failures(IN_PLAY_FIELD, (item) => samplesOf(item.plan).every((point) => point.y >= 0))).toEqual([]);
  });

  it("ホームランは終点がフェンス半径以遠でスタンド斜面の上(y > 0)にあり、全区間で y ≥ 0", () => {
    expect(failures(HOMERUNS, (item) => item.plan.overFence)).toEqual([]);
    expect(failures(HOMERUNS, (item) => Math.hypot(item.plan.end.x, item.plan.end.z) >= LANDING_PARAMS.fenceRadius)).toEqual([]);
    expect(failures(HOMERUNS, (item) => item.plan.end.y > 0)).toEqual([]);
    expect(
      failures(HOMERUNS, (item) => {
        const distance = Math.hypot(item.plan.end.x, item.plan.end.z);
        return Math.abs(item.plan.end.y - standsHeightAt(STANDS, distance)) < 1e-9;
      }),
    ).toEqual([]);
    expect(failures(HOMERUNS, (item) => samplesOf(item.plan).every((point) => point.y >= 0))).toEqual([]);
  });

  it("フライ/ライナーの頂点(始点と終点を結ぶ直線からの持ち上げの最大)が peak の ±1%", () => {
    const aerial = CASES.filter((item) => item.plan.shape !== "ground");
    const mismatches = failures(aerial, (item) => {
      const { plan } = item;
      const lift = Math.max(
        ...samplesOf(plan).map((point, i) => {
          const baseline = plan.start.y + (plan.end.y - plan.start.y) * (i / SAMPLE_COUNT);
          return point.y - baseline;
        }),
      );
      return Math.abs(lift - plan.peak) <= plan.peak * 0.01;
    });
    expect(mismatches).toEqual([]);
  });

  it("ライナーはフライより低く(同じ距離なら頂点が小さい)、ゴロは頂点 0", () => {
    const fly = planBattedBall({ type: "fly", strength: "medium", direction: "center" }, "single", 3, START);
    const liner = planBattedBall({ type: "liner", strength: "medium", direction: "center" }, "single", 3, START);
    const ground = planBattedBall({ type: "ground", strength: "medium", direction: "center" }, "single", 3, START);
    expect(liner.peak / Math.hypot(liner.end.x, liner.end.z)).toBeLessThan(fly.peak / Math.hypot(fly.end.x, fly.end.z));
    expect(ground.peak).toBe(0);
  });

  it("ゴロは y ≥ 0 でバウンドする(区間内で y が複数回極大になる)", () => {
    const grounders = CASES.filter((item) => item.plan.shape === "ground");
    expect(grounders.length).toBeGreaterThan(0);
    expect(failures(grounders, (item) => samplesOf(item.plan).every((point) => point.y >= 0))).toEqual([]);
    expect(
      failures(grounders, (item) => countLocalMaxima(Array.from({ length: 600 }, (_, i) => battedBallAt(item.plan, (i / 599) * item.plan.hangMs).y)) >= 2),
    ).toEqual([]);
  });

  it("ゴロのバウンドは減衰する(後の山ほど低い)", () => {
    const plan = planBattedBall({ type: "ground", strength: "medium", direction: "center" }, "single", 3, START);
    const ys = Array.from({ length: 600 }, (_, i) => battedBallAt(plan, (i / 599) * plan.hangMs).y);
    const peaks = ys.filter((value, i) => i > 0 && i < ys.length - 1 && value > (ys.at(i - 1) ?? 0) && value > (ys.at(i + 1) ?? 0));
    expect(peaks.every((peak, i) => i === 0 || peak < (peaks.at(i - 1) ?? 0))).toBe(true);
  });
});

/** 重力加速度(m/s²)。見かけの重力 = 8·頂点 ÷ 滞空²(s)を G 単位で表す。 */
const GRAVITY = 9.8;

function aerialParamsOf(shape: "fly" | "liner"): typeof WORLD_PARAMS.batted.fly {
  return shape === "fly" ? WORLD_PARAMS.batted.fly : WORLD_PARAMS.batted.liner;
}

/** `WORLD_PARAMS.batted` の式どおりの滞空(ms)。 */
function expectedHangMs(shape: "fly" | "liner", distance: number): number {
  const params = aerialParamsOf(shape);
  return params.hangBaseMs + params.hangPerMeterMs * distance;
}

/** 頂点の持ち上げ(m)と滞空(ms)から求めた見かけの重力(G)。 */
function apparentGravityOf(peak: number, hangMs: number): number {
  const seconds = hangMs / 1000;
  return (8 * peak) / (seconds * seconds) / GRAVITY;
}

describe("滞空と見かけの重力(受け入れ #24・#25)", () => {
  const AERIAL = CASES.filter((item) => item.plan.shape !== "ground");

  it("滞空が WORLD_PARAMS の式(基準 + 距離 × 係数)に一致する(フライ/ライナーの全計画)", () => {
    const mismatches = failures(AERIAL, (item) => {
      const distance = Math.hypot(item.plan.end.x, item.plan.end.z);
      return Math.abs(item.plan.hangMs - expectedHangMs(item.plan.shape === "fly" ? "fly" : "liner", distance)) < 1e-6;
    });
    expect(mismatches).toEqual([]);
  });

  it("外野フライ 81m・ライナー 61m・ホームラン 124m の滞空が下限(3000 / 1500 / 4000ms)以上", () => {
    expect(expectedHangMs("fly", 81)).toBeGreaterThanOrEqual(3000);
    expect(expectedHangMs("liner", 61)).toBeGreaterThanOrEqual(1500);
    expect(expectedHangMs("fly", 124)).toBeGreaterThanOrEqual(4000);
  });

  it("打球の見かけの重力が 2G 以下(フライ/ライナーの全計画)", () => {
    expect(failures(AERIAL, (item) => apparentGravityOf(item.plan.peak, item.plan.hangMs) <= 2)).toEqual([]);
  });

  it("代表的な距離(フライ 81m・ライナー 61m・ホームラン 124m・ファウルの飛球 43m)の見かけの重力が 2G 以下", () => {
    const cases: readonly (readonly ["fly" | "liner", number])[] = [
      ["fly", 81],
      ["liner", 61],
      ["fly", 124],
      ["fly", 43],
    ];
    for (const [shape, distance] of cases) {
      expect(apparentGravityOf(aerialParamsOf(shape).peakRatio * distance, expectedHangMs(shape, distance))).toBeLessThanOrEqual(2);
    }
  });

  it("ファウルの飛球(planFoul)も 2G 以下で、滞空が式どおり", () => {
    for (let seq = 1; seq <= 200; seq += 1) {
      const plan = planFoul(seq, START);
      expect(apparentGravityOf(plan.peak, plan.hangMs)).toBeLessThanOrEqual(2);
      expect(plan.hangMs).toBeCloseTo(expectedHangMs("fly", Math.hypot(plan.end.x - START.x, plan.end.z - START.z)), 6);
    }
  });
});

describe("planFoul", () => {
  const FOULS = Array.from({ length: 200 }, (_, i) => i + 1).map((seq) => ({ seq, plan: planFoul(seq, START) }));

  it("落下点がフェア領域(|x| ≤ |z| かつ z < 0)に入らない", () => {
    const fair = FOULS.filter(({ plan }) => Math.abs(plan.end.x) <= Math.abs(plan.end.z) && plan.end.z < 0);
    expect(fair).toEqual([]);
  });

  it("ファウルライン外側とバックネット方向の両方、左右の両側が出る", () => {
    expect(FOULS.some(({ plan }) => plan.end.z > 0)).toBe(true);
    expect(FOULS.some(({ plan }) => plan.end.z < 0 && Math.abs(plan.end.x) > Math.abs(plan.end.z))).toBe(true);
    expect(FOULS.some(({ plan }) => plan.end.x < 0)).toBe(true);
    expect(FOULS.some(({ plan }) => plan.end.x > 0)).toBe(true);
  });

  it("フライの形で、地面に落ち(y = 0)、フェンス越えではなく、始点・終点に厳密一致し、全区間で y ≥ 0", () => {
    for (const { plan } of FOULS) {
      expect(plan.shape).toBe("fly");
      expect(plan.end.y).toBe(0);
      expect(plan.overFence).toBe(false);
      expect(plan.hangMs).toBeGreaterThan(0);
      expect(plan.hops).toBe(0);
      expect(battedBallAt(plan, 0)).toEqual(START);
      expect(battedBallAt(plan, plan.hangMs)).toEqual(plan.end);
      expect(samplesOf(plan).every((point) => point.y >= 0)).toBe(true);
    }
  });

  it("同じ seq で deep equal(決定論)、seq が違えば落下点が変わる", () => {
    expect(planFoul(17, START)).toEqual(planFoul(17, START));
    expect(new Set(FOULS.map(({ plan }) => `${plan.end.x},${plan.end.z}`)).size).toBeGreaterThan(100);
  });
});
