import { describe, expect, it } from "vitest";
import type { BattedBall, BattedLanding, BattedType, Direction, InPlayResult, Strength } from "../../types/batting";
import { computeBattedLanding, findLandingBand } from "./batted-landing";
import { LANDING_BANDS, LANDING_PARAMS } from "./params";

const RESULTS: readonly InPlayResult[] = ["groundout", "doublePlay", "flyout", "lineout", "single", "double", "triple", "homerun", "error"];
const TYPES: readonly BattedType[] = ["ground", "liner", "fly"];
const STRENGTHS: readonly Strength[] = ["weak", "medium", "strong"];
const DIRECTIONS: readonly Direction[] = ["pull", "center", "opposite"];
const SEQS: readonly number[] = Array.from({ length: 200 }, (_, i) => i + 1);

/** 打球タイプ × 強さ × 方向の 27 通り。 */
const ALL_BALLS: readonly BattedBall[] = TYPES.flatMap((type) =>
  STRENGTHS.flatMap((strength) => DIRECTIONS.map((direction): BattedBall => ({ type, strength, direction }))),
);

/** 条件に合う打球 × seq 1〜200 の全落下点。 */
function landingsFor(result: InPlayResult, predicate: (ball: BattedBall) => boolean = () => true): BattedLanding[] {
  return ALL_BALLS.filter(predicate).flatMap((ball) => SEQS.map((seq) => computeBattedLanding(ball, result, seq)));
}

/** 全 InPlayResult の全落下点(1 回だけ計算して使い回す)。 */
const EVERY_LANDING: readonly BattedLanding[] = RESULTS.flatMap((result) => landingsFor(result));

/** 条件を満たさない点が無いことを確認する(違反があれば、その点が失敗メッセージに出る)。 */
function expectAll(landings: readonly BattedLanding[], predicate: (landing: BattedLanding) => boolean): void {
  expect(landings.length).toBeGreaterThan(0);
  expect(landings.filter((landing) => !predicate(landing)).slice(0, 3)).toEqual([]);
}

function expectDistancesWithin(landings: readonly BattedLanding[], min: number, max: number): void {
  expectAll(landings, (landing) => landing.distance >= min && landing.distance <= max);
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

const CENTER_BALL: BattedBall = { type: "fly", strength: "medium", direction: "center" };

/** 指定した方向の打球すべて(全結果・全タイプ・全強さ・seq 1〜200)の落下点。 */
function landingsOfDirection(direction: Direction): BattedLanding[] {
  return RESULTS.flatMap((result) => landingsFor(result, (ball) => ball.direction === direction));
}

describe("computeBattedLanding: 決定論・乱数非依存", () => {
  it("同一 (ball, result, seq) で厳密に同一の出力", () => {
    for (const ball of ALL_BALLS) {
      expect(computeBattedLanding(ball, "single", 17)).toEqual(computeBattedLanding(ball, "single", 17));
    }
  });

  it("引数は (ball, result, seq) の 3 つだけで RngState を取らない", () => {
    expect(computeBattedLanding).toHaveLength(3);
  });

  it("seq を 1〜200 で変えると同一入力でも点が複数種類に分かれ、各 seq を再計算すると同じ点に戻る", () => {
    const keys = SEQS.map((seq) => {
      const landing = computeBattedLanding(CENTER_BALL, "flyout", seq);
      return `${landing.x},${landing.y}`;
    });
    const recomputed = SEQS.map((seq) => {
      const landing = computeBattedLanding(CENTER_BALL, "flyout", seq);
      return `${landing.x},${landing.y}`;
    });
    expect(new Set(keys).size).toBeGreaterThan(100);
    expect(recomputed).toEqual(keys);
  });
});

describe("computeBattedLanding: 方向ごとの左右範囲", () => {
  it("pull は lateral ∈ [-0.85, -0.25]、x < 0(レフト側)", () => {
    expectAll(landingsOfDirection("pull"), (landing) => landing.lateral >= -0.85 && landing.lateral <= -0.25 && landing.x < 0);
  });

  it("center は lateral ∈ [-0.25, +0.25]", () => {
    expectAll(landingsOfDirection("center"), (landing) => landing.lateral >= -0.25 && landing.lateral <= 0.25);
  });

  it("opposite は lateral ∈ [+0.25, +0.85]、x > 0(ライト側)", () => {
    expectAll(landingsOfDirection("opposite"), (landing) => landing.lateral >= 0.25 && landing.lateral <= 0.85 && landing.x > 0);
  });

  it("全ての落下点がフェア内(|lateral| < 1)", () => {
    expectAll(EVERY_LANDING, (landing) => Math.abs(landing.lateral) < 1);
  });

  it("範囲内に実際にばらつく(各方向で lateral が 1 種類ではない)", () => {
    for (const direction of DIRECTIONS) {
      expect(new Set(landingsOfDirection(direction).map((landing) => landing.lateral)).size).toBeGreaterThan(50);
    }
  });
});

describe("computeBattedLanding: 結果ごとの距離帯(seq 1〜200 で全点が帯内)", () => {
  it("groundout 14〜32、doublePlay 16〜30", () => {
    expectDistancesWithin(landingsFor("groundout"), 14, 32);
    expectDistancesWithin(landingsFor("doublePlay"), 16, 30);
  });

  it("flyout は weak 35〜60 / medium 60〜90 / strong 90〜103", () => {
    expectDistancesWithin(
      landingsFor("flyout", (ball) => ball.strength === "weak"),
      35,
      60,
    );
    expectDistancesWithin(
      landingsFor("flyout", (ball) => ball.strength === "medium"),
      60,
      90,
    );
    expectDistancesWithin(
      landingsFor("flyout", (ball) => ball.strength === "strong"),
      90,
      103,
    );
  });

  it("lineout は weak 25〜45 / medium 40〜70 / strong 55〜90", () => {
    expectDistancesWithin(
      landingsFor("lineout", (ball) => ball.strength === "weak"),
      25,
      45,
    );
    expectDistancesWithin(
      landingsFor("lineout", (ball) => ball.strength === "medium"),
      40,
      70,
    );
    expectDistancesWithin(
      landingsFor("lineout", (ball) => ball.strength === "strong"),
      55,
      90,
    );
  });

  it("single は ground 28〜55 / liner 45〜80 / fly 38〜65", () => {
    expectDistancesWithin(
      landingsFor("single", (ball) => ball.type === "ground"),
      28,
      55,
    );
    expectDistancesWithin(
      landingsFor("single", (ball) => ball.type === "liner"),
      45,
      80,
    );
    expectDistancesWithin(
      landingsFor("single", (ball) => ball.type === "fly"),
      38,
      65,
    );
  });

  it("double 78〜98、triple 98〜104、error 18〜50、homerun 106〜125", () => {
    expectDistancesWithin(landingsFor("double"), 78, 98);
    expectDistancesWithin(landingsFor("triple"), 98, 104);
    expectDistancesWithin(landingsFor("error"), 18, 50);
    expectDistancesWithin(landingsFor("homerun"), 106, 125);
  });

  it("帯の中で実際にばらつく(距離が 1 種類ではない)", () => {
    const distances = SEQS.map((seq) => computeBattedLanding(CENTER_BALL, "double", seq).distance);
    expect(new Set(distances).size).toBeGreaterThan(100);
    expect(Math.max(...distances) - Math.min(...distances)).toBeGreaterThan(10);
  });
});

describe("computeBattedLanding: フェンス", () => {
  it("homerun は常に overFence = true かつ distance ≥ fenceRadius", () => {
    expectAll(landingsFor("homerun"), (landing) => landing.overFence && landing.distance >= LANDING_PARAMS.fenceRadius);
  });

  it("homerun 以外の全 InPlayResult は常に overFence = false かつ distance < fenceRadius", () => {
    for (const result of RESULTS.filter((candidate) => candidate !== "homerun")) {
      expectAll(landingsFor(result), (landing) => !landing.overFence && landing.distance < LANDING_PARAMS.fenceRadius);
    }
  });
});

describe("computeBattedLanding: 凡打の帯", () => {
  it("groundout / doublePlay は内野の範囲(distance ≤ 32 < 2 塁までの距離)", () => {
    const secondBaseDistance = LANDING_PARAMS.baseDistance * Math.sqrt(2);
    for (const result of ["groundout", "doublePlay"] as const) {
      expectAll(landingsFor(result), (landing) => landing.distance <= 32 && landing.distance < secondBaseDistance);
    }
  });

  it("flyout / lineout は強さが上がるほど平均距離が大きく、外野寄りになる", () => {
    for (const result of ["flyout", "lineout"] as const) {
      const [weak, medium, strong] = STRENGTHS.map((strength) =>
        mean(landingsFor(result, (ball) => ball.strength === strength).map((landing) => landing.distance)),
      );
      expect(medium).toBeGreaterThan(weak ?? Number.POSITIVE_INFINITY);
      expect(strong).toBeGreaterThan(medium ?? Number.POSITIVE_INFINITY);
    }
    expect(mean(landingsFor("flyout").map((landing) => landing.distance))).toBeGreaterThan(LANDING_PARAMS.baseDistance * Math.sqrt(2));
  });
});

describe("computeBattedLanding: 座標の整合", () => {
  it("y > 0 かつ y ≤ 125、|x| ≤ viewHalfWidth", () => {
    expectAll(EVERY_LANDING, (landing) => landing.y > 0 && landing.y <= 125 && Math.abs(landing.x) <= LANDING_PARAMS.viewHalfWidth);
  });

  it("distance² ≈ x² + y²、x / y ≈ lateral", () => {
    expectAll(
      EVERY_LANDING,
      (landing) => Math.abs(landing.x ** 2 + landing.y ** 2 - landing.distance ** 2) < 1e-6 && Math.abs(landing.x / landing.y - landing.lateral) < 1e-9,
    );
  });

  it("全落下点が描画範囲(viewTop / viewBottom / viewHalfWidth)に収まる", () => {
    expectAll(
      EVERY_LANDING,
      (landing) => landing.y < LANDING_PARAMS.viewTop && landing.y > LANDING_PARAMS.viewBottom && Math.abs(landing.x) < LANDING_PARAMS.viewHalfWidth,
    );
  });

  it("distance は 14〜125", () => {
    expectDistancesWithin(EVERY_LANDING, 14, 125);
  });

  it("導出式: y = distance / sqrt(1 + lateral²)、x = lateral × y", () => {
    const landing = computeBattedLanding({ type: "ground", strength: "weak", direction: "center" }, "groundout", 1);
    expect(landing.lateral).toBeGreaterThanOrEqual(-0.25);
    expect(landing.lateral).toBeLessThanOrEqual(0.25);
    expect(landing.y).toBeCloseTo(landing.distance / Math.sqrt(1 + landing.lateral ** 2), 12);
    expect(landing.x).toBeCloseTo(landing.lateral * landing.y, 12);
  });
});

describe("computeBattedLanding / findLandingBand: 網羅", () => {
  it("全 InPlayResult(9)× BattedType(3)× Strength(3)× Direction(3)の組み合わせで例外なく値が返る", () => {
    for (const result of RESULTS) {
      for (const ball of ALL_BALLS) {
        expect(() => computeBattedLanding(ball, result, 1)).not.toThrow();
      }
    }
  });

  it("LANDING_BANDS が全ての (result, type, strength) に一致し、距離帯は min < max", () => {
    for (const result of RESULTS) {
      for (const ball of ALL_BALLS) {
        const band = findLandingBand(ball, result);
        expect(band.min).toBeLessThan(band.max);
        expect(LANDING_BANDS).toContain(band);
      }
    }
  });

  it("一致する行が無い結果はプログラミングエラーとして Error を投げる", () => {
    expect(() => findLandingBand(CENTER_BALL, String("unknown") as InPlayResult)).toThrow(Error);
  });
});
