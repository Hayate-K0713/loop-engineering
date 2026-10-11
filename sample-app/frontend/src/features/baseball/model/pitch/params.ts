import type { ZonePoint } from "../../types/common";

/** 投球・飛行まわりの定数。数値はすべて仮値で、balance.test.ts とプレイで調整する。 */
type PitchParams = {
  /** 狙いからの着弾のばらつきの基準(ゾーン単位の標準偏差)。 */
  readonly baseSigma: number;
  /** コントロールが低いほどばらつきを増やす係数。 */
  readonly controlSigmaFactor: number;
  /** スタミナ 1 あたりに投げられる球数(球数上限 = stamina × この値)。 */
  readonly pitchesPerStamina: number;
  /** スタミナ残量比がこの値を下回ると疲労が始まる。 */
  readonly fatigueStartRatio: number;
  /** 疲労 1(最大)のときのばらつきの増加率。 */
  readonly fatigueSigmaGain: number;
  /** 疲労 1(最大)のときの球速低下(km/h)。 */
  readonly fatigueSlowKmh: number;
  /** 飛行時間(ms) = この値 / 球速(km/h)。140km/h でおよそ 1357ms。 */
  readonly flightMsKmh: number;
  /** 着弾点を ±この値にクランプする。 */
  readonly landingLimit: number;
  /** ゾーン SVG の表示範囲の半幅。 */
  readonly viewHalfExtent: number;
  /** ストライクゾーンの半幅。 */
  readonly zoneHalf: number;
  /** 5×5 グリッドの半幅。 */
  readonly gridHalf: number;
  /** ボールの表示半径。 */
  readonly ballRadius: number;
  /** ボールの表示上の開始位置(リリース地点)。 */
  readonly startPoint: ZonePoint;
  /** ボールの表示上の開始スケール(着弾で 1)。 */
  readonly startScale: number;
};

export const PITCH_PARAMS: PitchParams = {
  baseSigma: 0.28,
  controlSigmaFactor: 1.0,
  pitchesPerStamina: 2.2,
  fatigueStartRatio: 0.6,
  fatigueSigmaGain: 0.8,
  fatigueSlowKmh: 10,
  flightMsKmh: 190000,
  landingLimit: 2.0,
  viewHalfExtent: 2.0,
  zoneHalf: 1.0,
  gridHalf: 5 / 3,
  ballRadius: 0.12,
  startPoint: { x: 0, y: 0.4 },
  startScale: 0.25,
};
