import type { RngState, WithRng, ZonePoint } from "../../types/common";
import type { CpuBatDecision, SwingKind } from "../../types/batting";
import type { Count } from "../../types/game";
import type { PitchFlight } from "../../types/pitch";
import type { BatterProfile, PitcherProfile } from "../../types/team";
import { PITCH_PARAMS } from "../pitch/params";
import { isStrike } from "../pitch/zone";
import { nextFloat } from "../rng/rng";
import { nextGaussian } from "../rng/sampling";
import { CPU_PARAMS, type DifficultyParams } from "./difficulty";

/** `decideCpuBat` の入力。`difficulty` は解決済みの `DifficultyParams`(`getDifficulty` で引くのは呼び出し側)。 */
export type DecideCpuBatInput = {
  readonly flight: PitchFlight;
  readonly count: Count;
  readonly batter: BatterProfile;
  readonly pitcher: PitcherProfile;
  readonly difficulty: DifficultyParams;
};

/** スイングする確率。ゾーン内外の基本率に、2 ストライク(加算・上限あり)と 3 ボール(倍率)の補正を掛ける。 */
function swingProbability(inZone: boolean, count: Count, difficulty: DifficultyParams): number {
  const base = inZone ? difficulty.zoneSwingRate : difficulty.chaseSwingRate;
  if (count.strikes === 2) {
    return Math.min(base + CPU_PARAMS.twoStrikeSwingBoost, CPU_PARAMS.maxSwingRate);
  }
  return count.balls === 3 ? base * CPU_PARAMS.threeBallsSwingFactor : base;
}

/** スイング種別。2 ストライクは当てに行く(ミート)、それ以外はパワーに応じた確率で強振。乱数は 2 ストライクのとき消費しない。 */
function chooseSwingKind(rng: RngState, count: Count, batter: BatterProfile): WithRng<SwingKind> {
  if (count.strikes === 2) {
    return ["meet", rng];
  }
  const [roll, next] = nextFloat(rng);
  const powerRate = CPU_PARAMS.powerSwingBase + CPU_PARAMS.powerSwingPerAbility * batter.power;
  return [roll < powerRate ? "power" : "meet", next];
}

/** 着弾点にガウスノイズ(x → y の独立 2 回)を加えたカーソル位置。 */
function noisyCursor(rng: RngState, landing: ZonePoint, sigma: number): WithRng<ZonePoint> {
  const [gaussX, afterX] = nextGaussian(rng);
  const [gaussY, afterY] = nextGaussian(afterX);
  return [{ x: landing.x + gaussX * sigma, y: landing.y + gaussY * sigma }, afterY];
}

/**
 * スイング時刻(リリースからの ms)。CPU 打者は投手のストレート基準でタイミングを取るため、遅い球は早振り(負のバイアス)になる。
 * ストレートではバイアス 0、`timingSigmaMs` のガウスノイズ(乱数 12 個)を加える。
 */
function swingTime(rng: RngState, flight: PitchFlight, pitcher: PitcherProfile, timingSigmaMs: number): WithRng<number> {
  const fastballDurationMs = Math.round(PITCH_PARAMS.flightMsKmh / pitcher.speedKmh);
  const bias = CPU_PARAMS.speedDiffBiasRatio * (flight.durationMs - fastballDurationMs);
  const [gauss, next] = nextGaussian(rng);
  return [flight.durationMs - bias + gauss * timingSigmaMs, next];
}

/**
 * CPU 打者の判断。①スイングするか(乱数 1 個。見送りならここで終わる)→ ②スイング種別(0〜1 個)→ ③カーソル(24 個)→ ④時刻(12 個)の順に消費する。
 * ゾーン外をスイングするときはカーソルノイズが `outsideSigmaScale` 倍になる。
 */
export function decideCpuBat(rng: RngState, input: DecideCpuBatInput): WithRng<CpuBatDecision> {
  const { flight, count, batter, pitcher, difficulty } = input;
  const inZone = isStrike(flight.landing);

  const [roll, afterRoll] = nextFloat(rng);
  if (roll >= swingProbability(inZone, count, difficulty)) {
    return [{ type: "take" }, afterRoll];
  }

  const [kind, afterKind] = chooseSwingKind(afterRoll, count, batter);
  const cursorSigma = difficulty.cursorSigma * (inZone ? 1 : CPU_PARAMS.outsideSigmaScale);
  const [cursor, afterCursor] = noisyCursor(afterKind, flight.landing, cursorSigma);
  const [atMs, afterTime] = swingTime(afterCursor, flight, pitcher, difficulty.timingSigmaMs);
  return [{ type: "swing", input: { kind, cursor, atMs } }, afterTime];
}
