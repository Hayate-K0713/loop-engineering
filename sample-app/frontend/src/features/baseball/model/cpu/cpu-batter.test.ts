import { describe, expect, it } from "vitest";
import type { RngState, ZonePoint } from "../../types/common";
import type { CpuBatDecision, SwingInput } from "../../types/batting";
import type { Count } from "../../types/game";
import type { PitchFlight, PitchKind } from "../../types/pitch";
import type { BatterProfile, PitcherProfile } from "../../types/team";
import { getPitchSpec } from "../pitch/kinds";
import { PITCH_PARAMS } from "../pitch/params";
import { createRng, nextFloat } from "../rng/rng";
import { type DecideCpuBatInput, decideCpuBat } from "./cpu-batter";
import { CPU_PARAMS, type DifficultyParams, getDifficulty } from "./difficulty";

const DRAWS = 10000;

const ZONE_CENTER: ZonePoint = { x: 0, y: 0 };
const BALL_ZONE: ZonePoint = { x: 1.6, y: 0.2 };
const NO_COUNT: Count = { balls: 0, strikes: 0 };
const TWO_STRIKES: Count = { balls: 0, strikes: 2 };

const PITCHER: PitcherProfile = { id: "p", name: "テスト投手", speedKmh: 145, control: 70, stamina: 70, repertoire: ["straight", "slider", "curve"] };

function batterWith(power: number): BatterProfile {
  return { id: "b", name: "テスト打者", meet: 60, power, trajectory: 2 };
}

/** 球種ごとの球速から飛行時間を求めた投球(CPU 打者の判断に必要な項目のみ)。 */
function flightOf(kind: PitchKind, landing: ZonePoint): PitchFlight {
  const speedKmh = PITCHER.speedKmh + getPitchSpec(kind).speedOffsetKmh;
  return { seq: 1, kind, aim: landing, landing, speedKmh, durationMs: Math.round(PITCH_PARAMS.flightMsKmh / speedKmh) };
}

function inputWith(overrides: Partial<DecideCpuBatInput> = {}): DecideCpuBatInput {
  return {
    flight: flightOf("straight", ZONE_CENTER),
    count: NO_COUNT,
    batter: batterWith(50),
    pitcher: PITCHER,
    difficulty: getDifficulty("normal"),
    ...overrides,
  };
}

/** 同じ入力で `times` 回判断し、状態を引き回して判断の列を返す。 */
function decideMany(seed: number, times: number, input: DecideCpuBatInput): CpuBatDecision[] {
  const decisions: CpuBatDecision[] = [];
  let rng: RngState = createRng(seed);
  for (let i = 0; i < times; i += 1) {
    const [decision, next] = decideCpuBat(rng, input);
    decisions.push(decision);
    rng = next;
  }
  return decisions;
}

function swingsOf(decisions: readonly CpuBatDecision[]): SwingInput[] {
  return decisions.flatMap((decision) => (decision.type === "swing" ? [decision.input] : []));
}

function swingRate(decisions: readonly CpuBatDecision[]): number {
  return swingsOf(decisions).length / decisions.length;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: readonly number[]): number {
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

/** スイングしたときのカーソルの、着弾点からのずれ(x・y をまとめて 1 本の列にする)。 */
function cursorErrors(swings: readonly SwingInput[], landing: ZonePoint): number[] {
  return swings.flatMap((swing) => [swing.cursor.x - landing.x, swing.cursor.y - landing.y]);
}

function near(actual: number, expected: number, tolerance: number): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

describe("decideCpuBat: スイング率", () => {
  it.each(["easy", "normal", "hard"] as const)("%s: ゾーン内・ゾーン外のスイング率が難易度の値と ±0.02", (name) => {
    const difficulty = getDifficulty(name);
    const inZone = swingRate(decideMany(1, DRAWS, inputWith({ difficulty, flight: flightOf("straight", ZONE_CENTER) })));
    const outZone = swingRate(decideMany(2, DRAWS, inputWith({ difficulty, flight: flightOf("straight", BALL_ZONE) })));
    expect(near(inZone, difficulty.zoneSwingRate, 0.02)).toBe(true);
    expect(near(outZone, difficulty.chaseSwingRate, 0.02)).toBe(true);
  });

  it("ストライクゾーンの境界(|x|=1)はゾーン内として扱う", () => {
    const difficulty = getDifficulty("normal");
    const rate = swingRate(decideMany(3, DRAWS, inputWith({ flight: flightOf("straight", { x: 1, y: 0 }) })));
    expect(near(rate, difficulty.zoneSwingRate, 0.02)).toBe(true);
  });

  it("2 ストライクはスイング率が上がる(加算、上限あり)", () => {
    const difficulty = getDifficulty("normal");
    const inZone = swingRate(decideMany(4, DRAWS, inputWith({ count: TWO_STRIKES })));
    const outZone = swingRate(decideMany(5, DRAWS, inputWith({ count: TWO_STRIKES, flight: flightOf("straight", BALL_ZONE) })));
    expect(near(inZone, Math.min(difficulty.zoneSwingRate + CPU_PARAMS.twoStrikeSwingBoost, CPU_PARAMS.maxSwingRate), 0.02)).toBe(true);
    expect(near(outZone, Math.min(difficulty.chaseSwingRate + CPU_PARAMS.twoStrikeSwingBoost, CPU_PARAMS.maxSwingRate), 0.02)).toBe(true);
  });

  it("2 ストライクの補正はスイング率の上限(maxSwingRate)を超えない", () => {
    const eager: DifficultyParams = { ...getDifficulty("hard"), zoneSwingRate: 0.9 };
    const rate = swingRate(decideMany(6, DRAWS, inputWith({ count: TWO_STRIKES, difficulty: eager })));
    expect(near(rate, CPU_PARAMS.maxSwingRate, 0.02)).toBe(true);
  });

  it("3 ボール(2 ストライク未満)はスイング率が threeBallsSwingFactor 倍になる", () => {
    const difficulty = getDifficulty("normal");
    for (const strikes of [0, 1]) {
      const rate = swingRate(decideMany(7, DRAWS, inputWith({ count: { balls: 3, strikes } })));
      expect(near(rate, difficulty.zoneSwingRate * CPU_PARAMS.threeBallsSwingFactor, 0.02)).toBe(true);
    }
  });

  it("3 ボール 2 ストライクは 2 ストライクの補正が優先される(待たない)", () => {
    const full = swingRate(decideMany(8, DRAWS, inputWith({ count: { balls: 3, strikes: 2 } })));
    const twoStrikes = swingRate(decideMany(8, DRAWS, inputWith({ count: TWO_STRIKES })));
    expect(near(full, twoStrikes, 0.001)).toBe(true);
  });
});

describe("decideCpuBat: スイング種別", () => {
  it("2 ストライクは常にミート", () => {
    const swings = swingsOf(decideMany(9, DRAWS, inputWith({ count: TWO_STRIKES, batter: batterWith(100) })));
    expect(swings.length).toBeGreaterThan(0);
    expect(swings.every((swing) => swing.kind === "meet")).toBe(true);
  });

  it("それ以外は powerSwingBase + powerSwingPerAbility × power の確率で強振(±0.02)", () => {
    for (const power of [20, 80]) {
      const swings = swingsOf(decideMany(10, DRAWS * 2, inputWith({ batter: batterWith(power) })));
      const powerRate = swings.filter((swing) => swing.kind === "power").length / swings.length;
      expect(near(powerRate, CPU_PARAMS.powerSwingBase + CPU_PARAMS.powerSwingPerAbility * power, 0.02)).toBe(true);
    }
  });
});

describe("decideCpuBat: カーソルのノイズ", () => {
  it.each(["easy", "normal", "hard"] as const)("%s: ゾーン内のカーソルノイズの標準偏差が cursorSigma ±10%", (name) => {
    const difficulty = getDifficulty(name);
    const swings = swingsOf(decideMany(11, DRAWS, inputWith({ difficulty, count: TWO_STRIKES })));
    const sigma = standardDeviation(cursorErrors(swings, ZONE_CENTER));
    expect(near(sigma, difficulty.cursorSigma, difficulty.cursorSigma * 0.1)).toBe(true);
  });

  it("ゾーン外ではノイズが outsideSigmaScale 倍になる(±10%)", () => {
    const difficulty = getDifficulty("normal");
    const swings = swingsOf(decideMany(12, DRAWS, inputWith({ difficulty, count: TWO_STRIKES, flight: flightOf("straight", BALL_ZONE) })));
    const sigma = standardDeviation(cursorErrors(swings, BALL_ZONE));
    const expected = difficulty.cursorSigma * CPU_PARAMS.outsideSigmaScale;
    expect(near(sigma, expected, expected * 0.1)).toBe(true);
  });

  it("カーソルの平均は着弾点に一致する(偏りなし)", () => {
    const swings = swingsOf(decideMany(13, DRAWS * 2, inputWith({ count: TWO_STRIKES, flight: flightOf("straight", { x: 0.5, y: -0.4 }) })));
    expect(near(mean(swings.map((swing) => swing.cursor.x)), 0.5, 0.02)).toBe(true);
    expect(near(mean(swings.map((swing) => swing.cursor.y)), -0.4, 0.02)).toBe(true);
  });
});

describe("decideCpuBat: タイミング", () => {
  it.each(["easy", "normal", "hard"] as const)("%s: タイミングノイズの標準偏差が timingSigmaMs ±10%", (name) => {
    const difficulty = getDifficulty(name);
    const flight = flightOf("straight", ZONE_CENTER);
    const swings = swingsOf(decideMany(14, DRAWS, inputWith({ difficulty, count: TWO_STRIKES, flight })));
    const sigma = standardDeviation(swings.map((swing) => swing.atMs - flight.durationMs));
    expect(near(sigma, difficulty.timingSigmaMs, difficulty.timingSigmaMs * 0.1)).toBe(true);
  });

  it("ストレートは基準どおりに待つので、atMs - durationMs の平均は 0(|平均| ≤ 3ms)", () => {
    const flight = flightOf("straight", ZONE_CENTER);
    const swings = swingsOf(decideMany(15, DRAWS * 2, inputWith({ count: TWO_STRIKES, flight })));
    expect(Math.abs(mean(swings.map((swing) => swing.atMs - flight.durationMs)))).toBeLessThanOrEqual(3);
  });

  it("遅い球(カーブ)は早振りになり、平均が -speedDiffBiasRatio × (durationMs - fastballDurationMs) と ±3ms で一致する", () => {
    const flight = flightOf("curve", ZONE_CENTER);
    const fastballDurationMs = Math.round(PITCH_PARAMS.flightMsKmh / PITCHER.speedKmh);
    const expected = -CPU_PARAMS.speedDiffBiasRatio * (flight.durationMs - fastballDurationMs);
    const swings = swingsOf(decideMany(16, DRAWS * 2, inputWith({ count: TWO_STRIKES, flight })));
    const actual = mean(swings.map((swing) => swing.atMs - flight.durationMs));
    expect(expected).toBeLessThan(-30);
    expect(near(actual, expected, 3)).toBe(true);
  });

  it("投手の球速が違っても、ストレートを基準に待つ(速い投手のストレートは偏りなし)", () => {
    const fast: PitcherProfile = { ...PITCHER, speedKmh: 155 };
    const flight = { ...flightOf("straight", ZONE_CENTER), speedKmh: 155, durationMs: Math.round(PITCH_PARAMS.flightMsKmh / 155) };
    const swings = swingsOf(decideMany(17, DRAWS * 2, inputWith({ count: TWO_STRIKES, flight, pitcher: fast })));
    expect(Math.abs(mean(swings.map((swing) => swing.atMs - flight.durationMs)))).toBeLessThanOrEqual(3);
  });
});

describe("decideCpuBat: 見送り・決定性", () => {
  it("take には入力(swing の中身)が付かない", () => {
    const takes = decideMany(18, DRAWS, inputWith()).filter((decision) => decision.type === "take");
    expect(takes.length).toBeGreaterThan(0);
    expect(takes.every((decision) => Object.keys(decision).join() === "type")).toBe(true);
  });

  it("take は乱数を 1 個だけ消費する", () => {
    const flight = flightOf("straight", BALL_ZONE);
    for (let seed = 1; seed <= 30; seed += 1) {
      const rng = createRng(seed);
      const [decision, next] = decideCpuBat(rng, inputWith({ flight }));
      if (decision.type === "take") {
        expect(next).toBe(nextFloat(rng)[1]);
      }
    }
  });

  it("同一 rng・同一入力で同一出力", () => {
    const rng = createRng(99);
    expect(decideCpuBat(rng, inputWith({ count: TWO_STRIKES }))).toEqual(decideCpuBat(rng, inputWith({ count: TWO_STRIKES })));
  });
});
