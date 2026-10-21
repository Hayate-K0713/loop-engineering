import type { BattedBall, BattedLanding, Direction, InPlayResult } from "../../types/batting";
import { LANDING_BANDS, LANDING_PARAMS, type LandingBand, type LateralRange } from "./params";

// フィールド図用の落下点。守備モデルを持たず、BattedBall と InPlayResult から決定論で逆算する。
// 乱数(RngState)は引数に取らず消費しないため、reducer の乱数消費順・シード再現性に影響しない。
// ばらつきは投球通し番号 seq から黄金比数列で作る。`sin/cos/log/exp` は使わず、`sqrt` と四則演算・`floor` のみ。

/** 小数部分(0 以上 1 未満)。 */
function fraction(value: number): number {
  return value - Math.floor(value);
}

type ValueRange = { readonly min: number; readonly max: number };

/** min〜max を t(0〜1)で補間する。 */
function interpolate(range: ValueRange, t: number): number {
  return range.min + t * (range.max - range.min);
}

/** 打球方向ごとの `lateral`(= x / y)の範囲(3 値なので switch で引く)。 */
function lateralRangeOf(direction: Direction): LateralRange {
  switch (direction) {
    case "pull":
      return LANDING_PARAMS.lateral.pull;
    case "center":
      return LANDING_PARAMS.lateral.center;
    case "opposite":
      return LANDING_PARAMS.lateral.opposite;
  }
}

function bandMatches(band: LandingBand, ball: BattedBall, result: InPlayResult): boolean {
  return band.result === result && (band.type === "any" || band.type === ball.type) && (band.strength === "any" || band.strength === ball.strength);
}

/** (結果, タイプ, 強さ)に対応する距離帯(先頭一致)。一致なしは `Error`(プログラミングエラー)。 */
export function findLandingBand(ball: BattedBall, result: InPlayResult): LandingBand {
  const band = LANDING_BANDS.find((candidate) => bandMatches(candidate, ball, result));
  if (band === undefined) {
    throw new Error(`findLandingBand: no band for ${result}/${ball.type}/${ball.strength}`);
  }
  return band;
}

/**
 * フィールド図上の落下点を求める(乱数を消費しない決定論)。同じ入力は常に同じ点になり、`seq` が違えば点が変わる。
 *
 * - 距離: 距離帯 `[min, max]` を `t1 = frac(seq × 0.618…)` で補間。
 * - 左右: 打球方向の範囲を `t2 = frac(seq × 0.7548… + 0.5)` で補間して `lateral`(= x / y)とする。
 * - 座標: `y = distance / sqrt(1 + lateral²)`、`x = lateral × y`(原点 = 本塁、y = センター方向、x = ライト側)。
 */
export function computeBattedLanding(ball: BattedBall, result: InPlayResult, seq: number): BattedLanding {
  const t1 = fraction(seq * LANDING_PARAMS.distanceSeqStep);
  const t2 = fraction(seq * LANDING_PARAMS.lateralSeqStep + LANDING_PARAMS.lateralSeqOffset);
  const distance = interpolate(findLandingBand(ball, result), t1);
  const lateral = interpolate(lateralRangeOf(ball.direction), t2);
  const y = distance / Math.sqrt(1 + lateral * lateral);
  return { x: lateral * y, y, distance, lateral, overFence: distance >= LANDING_PARAMS.fenceRadius };
}
