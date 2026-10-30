import type { PitchQuality } from "../../types/pitch";

/** 質ごとの値(ナイス・グッド・ふつう・失投)。 */
type PerQuality<T> = { readonly [Q in PitchQuality]: T };

/**
 * 守備のリングゲージ(狙いを確定したあと、縮むリングが照準に重なる瞬間にタップする)。
 * `ringMs` = リングが縮む時間(ゲージ開始から終点まで)、`graceMs` = 終点を過ぎても縮み続け自動投球(失投)になるまでの猶予、
 * `stopGuardMs` = ゲージ開始からこの間の停止は無視(ダブルクリックの誤爆防止)、`windows` = 誤差 |e|(ms)の上限(ナイス/グッド/ふつう。超えると失投)、
 * `sigmaScale` = 質ごとの着弾のばらつきの倍率、`missPull` = 失投のとき狙いを `(x, y)` へ `ratio` だけ引き寄せる、`aimLimit` = 狙いの座標の上限(±)。
 */
type GaugeParams = {
  readonly ringMs: number;
  readonly graceMs: number;
  readonly stopGuardMs: number;
  readonly windows: { readonly nice: number; readonly good: number; readonly normal: number };
  readonly sigmaScale: PerQuality<number>;
  readonly missPull: { readonly x: number; readonly y: number; readonly ratio: number };
  readonly aimLimit: number;
};

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
  /** 守備のリングゲージ(v3)。 */
  readonly gauge: GaugeParams;
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
  gauge: {
    ringMs: 900,
    graceMs: 300,
    stopGuardMs: 250,
    windows: { nice: 40, good: 90, normal: 160 },
    sigmaScale: { nice: 0.35, good: 0.65, normal: 1.0, miss: 1.7 },
    missPull: { x: 0, y: 0.15, ratio: 0.6 },
    aimLimit: 1.67,
  },
};
