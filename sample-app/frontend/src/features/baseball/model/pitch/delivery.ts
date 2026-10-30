import type { RngState, WithRng } from "../../types/common";
import type { PitchCommand, PitchFlight } from "../../types/pitch";
import type { PitcherProfile } from "../../types/team";
import { nextGaussian } from "../rng/sampling";
import { clampAim, pulledAimOf, sigmaScaleOf } from "./gauge";
import { getPitchSpec } from "./kinds";
import { PITCH_PARAMS } from "./params";
import { clamp } from "./zone";

/** `deliverPitch` の入力。 */
export type DeliverPitchInput = {
  readonly pitcher: PitcherProfile;
  readonly command: PitchCommand;
  /** この投球の**前**までの投球数。 */
  readonly pitchCount: number;
  /** 狙いの外し方の倍率。人間投手は 1、CPU 投手は難易度の値。 */
  readonly aimSigmaScale: number;
  /** 加算後の `pitchSeq`(= `state.pitchSeq + 1`)。`flight.seq` になる。 */
  readonly seq: number;
};

/** スタミナ残量比(1 = 満タン、0 = 使い切り)。 */
export function staminaRatio(pitcher: PitcherProfile, pitchCount: number): number {
  return Math.max(0, 1 - pitchCount / (pitcher.stamina * PITCH_PARAMS.pitchesPerStamina));
}

/** 疲労度(0 = 疲労なし、1 = 最大)。残量比が `fatigueStartRatio` を下回ると増える。 */
export function fatigueOf(ratio: number): number {
  const start = PITCH_PARAMS.fatigueStartRatio;
  return clamp((start - ratio) / start, 0, 1);
}

/** 着弾のばらつき(標準偏差、ゾーン単位)。コントロールが低いほど、疲労が大きいほど、投球の質が悪いほど増える。 */
function landingSigma(pitcher: PitcherProfile, fatigue: number, aimSigmaScale: number, qualityScale: number): number {
  const controlTerm = 1 + ((100 - pitcher.control) / 100) * PITCH_PARAMS.controlSigmaFactor;
  const fatigueTerm = 1 + fatigue * PITCH_PARAMS.fatigueSigmaGain;
  return PITCH_PARAMS.baseSigma * controlTerm * fatigueTerm * aimSigmaScale * qualityScale;
}

/**
 * 1 球を投げる。狙い(連続座標。±`aimLimit` に収める)にガウス誤差(x → y の順に 2 回、計 24 個の乱数。質によらず不変)を加えて着弾点を決め、
 * 球速と飛行時間を求める。誤差の σ には質の倍率(`sigmaScaleOf`)を掛け、失投(`miss`)のときは誤差を加える前に狙いを真ん中やや高めへ引き寄せる。
 * `flight.aim` は引き寄せ前の狙い(プレイヤーが指した点。位置ずれ表示の「狙い」)。
 */
export function deliverPitch(rng: RngState, input: DeliverPitchInput): WithRng<PitchFlight> {
  const { pitcher, command, pitchCount, aimSigmaScale, seq } = input;
  const aim = clampAim(command.aim);
  const center = pulledAimOf(aim, command.quality);
  const fatigue = fatigueOf(staminaRatio(pitcher, pitchCount));
  const sigma = landingSigma(pitcher, fatigue, aimSigmaScale, sigmaScaleOf(command.quality));
  const limit = PITCH_PARAMS.landingLimit;

  const [gaussX, afterX] = nextGaussian(rng);
  const [gaussY, afterY] = nextGaussian(afterX);
  const landing = {
    x: clamp(center.x + gaussX * sigma, -limit, limit),
    y: clamp(center.y + gaussY * sigma, -limit, limit),
  };

  const speedKmh = pitcher.speedKmh + getPitchSpec(command.kind).speedOffsetKmh - fatigue * PITCH_PARAMS.fatigueSlowKmh;
  const durationMs = Math.round(PITCH_PARAMS.flightMsKmh / speedKmh);
  return [{ seq, kind: command.kind, aim, landing, speedKmh, durationMs, quality: command.quality }, afterY];
}
