import type { BattedType, InPlayResult, Strength } from "../../types/batting";

// 打撃判定の定数。数値はすべて仮値で、balance.test.ts とプレイで調整する。
// 操作性の修正(H0)で `lateCutoffMs`〜`maxTapSpanMs` を足し、`linerHalfBand`・`mediumFrom`・`strongFrom` を出発値に変えた(H3b が調整)。
// 入力座標はすべてゾーン単位(ストライクゾーン = [-1, 1]²)。

/** 打撃判定(接触・打球形成)の定数。 */
type BattingParams = {
  /** ミート打ちのカーソル半径 rx の基準値(ミート能力 0 のとき)。 */
  readonly meetBaseRx: number;
  /** ミート能力 1 あたりの rx の増分。 */
  readonly meetRxPerAbility: number;
  /** カーソルの縦横比(ry = rx × aspect。横長の楕円)。 */
  readonly aspect: number;
  /** 強振のカーソル半径の倍率(小さいほど当てにくい)。 */
  readonly powerScale: number;
  /** カーソル座標のクランプ範囲(±この値)。 */
  readonly cursorLimit: number;
  /** キーボード操作のカーソル移動速度(ゾーン単位/秒)。 */
  readonly keyboardSpeed: number;
  /** 接触が成立するタイミング誤差の窓(±ms)。 */
  readonly contactWindowMs: number;
  /** 強振の窓の倍率。 */
  readonly powerWindowScale: number;
  /** |Δt| / 窓 がこの値以上ならファウル。 */
  readonly foulRatio: number;
  /** |Δt| / 窓 がこの値未満なら方向は center(それ以外は早遅で pull / opposite)。 */
  readonly centerRatio: number;
  /** ゾーン端の質低下が始まる位置(max(|x|, |y|) がこの値を超えると質が落ちる)。 */
  readonly edgePenaltyStart: number;
  /** ゾーン端から外側へ 1 進むごとの質の低下率。 */
  readonly edgePenaltyPerUnit: number;
  /** ライナーとなる高さの半幅(カーソル半径 ry 単位)。 */
  readonly linerHalfBand: number;
  /** 弾道 1 段階あたりの、ライナー帯のずらし量。 */
  readonly trajectoryShiftPerLevel: number;
  /** 強さのスコアのパワー項の基準値。 */
  readonly powerBase: number;
  /** パワー能力 1 あたりのパワー項の増分。 */
  readonly powerPerAbility: number;
  /** スイング種別ごとの強さ係数。 */
  readonly kindFactor: { readonly meet: number; readonly power: number };
  /** 打球方向ごとの強さ係数。 */
  readonly directionFactor: { readonly pull: number; readonly center: number; readonly opposite: number };
  /** スコアがこの値以上で medium。 */
  readonly mediumFrom: number;
  /** スコアがこの値以上で strong。 */
  readonly strongFrom: number;
  /** 人間打者の見逃し確定(入力イベント時刻の締切)= 到達時刻 D + この値(ms)。遅延補正前の時刻で比べる。 */
  readonly lateCutoffMs: number;
  /** 接触判定の当たり範囲にボール半径を足す量(ゾーン単位。楕円の rx に足す)。 */
  readonly ballReachX: number;
  /** 接触判定の当たり範囲にボール半径を足す量(ゾーン単位。楕円の ry に足す)。 */
  readonly ballReachY: number;
  /** 入力種別ごとの遅延補正(ゲート ms。`timeScale` で換算しない)。 */
  readonly inputLatencyMs: { readonly touch: number; readonly mouse: number; readonly key: number };
  /** `event.timeStamp` を使ってよい、ハンドラを起動したイベントからの経過の上限(ms)。 */
  readonly maxEventAgeMs: number;
  /** タップ(押下→離し)で `event.timeStamp` を使ってよい、押下から離しまでの上限(ms)。 */
  readonly maxTapSpanMs: number;
};

export const BATTING_PARAMS: BattingParams = {
  meetBaseRx: 0.5,
  meetRxPerAbility: 0.004,
  aspect: 0.6,
  powerScale: 0.65,
  cursorLimit: 1.8,
  keyboardSpeed: 3.0,
  contactWindowMs: 150,
  powerWindowScale: 0.75,
  foulRatio: 0.61,
  centerRatio: 0.25,
  edgePenaltyStart: 0.6,
  edgePenaltyPerUnit: 0.4,
  linerHalfBand: 0.14,
  trajectoryShiftPerLevel: 0.1,
  powerBase: 0.6,
  powerPerAbility: 0.008,
  kindFactor: { meet: 1.0, power: 1.5 },
  directionFactor: { pull: 1.15, center: 1.0, opposite: 0.9 },
  mediumFrom: 0.32,
  strongFrom: 0.68,
  lateCutoffMs: 250,
  ballReachX: 0.23,
  ballReachY: 0.2,
  inputLatencyMs: { touch: 70, mouse: 20, key: 20 },
  maxEventAgeMs: 250,
  maxTapSpanMs: 200,
};

/** `lateral`(= x / y)の範囲。 */
export type LateralRange = {
  readonly min: number;
  readonly max: number;
};

/** 簡易フィールド図の落下点まわりの定数。距離の単位はメートル相当の図上の長さ。 */
type LandingParams = {
  /** フェンスの半径(これ以上がフェンス越え)。 */
  readonly fenceRadius: number;
  /** 塁間の距離。 */
  readonly baseDistance: number;
  /** フィールド図の表示範囲の半幅(x は ±この値)。 */
  readonly viewHalfWidth: number;
  /** フィールド図の表示範囲の上端(y の最大側)。 */
  readonly viewTop: number;
  /** フィールド図の表示範囲の下端(y の最小側)。 */
  readonly viewBottom: number;
  /** 距離のばらつき t1 = frac(seq × この値)。 */
  readonly distanceSeqStep: number;
  /** 左右のばらつき t2 = frac(seq × この値 + lateralSeqOffset)。 */
  readonly lateralSeqStep: number;
  /** t2 の位相のずらし。 */
  readonly lateralSeqOffset: number;
  /** 打球方向ごとの `lateral` の範囲(引っ張り = レフト側 x < 0、流し = ライト側 x > 0)。 */
  readonly lateral: { readonly pull: LateralRange; readonly center: LateralRange; readonly opposite: LateralRange };
};

export const LANDING_PARAMS: LandingParams = {
  fenceRadius: 105,
  baseDistance: 27.4,
  viewHalfWidth: 85,
  viewTop: 130,
  viewBottom: -8,
  distanceSeqStep: 0.6180339887,
  lateralSeqStep: 0.7548776662,
  lateralSeqOffset: 0.5,
  lateral: {
    pull: { min: -0.85, max: -0.25 },
    center: { min: -0.25, max: 0.25 },
    opposite: { min: 0.25, max: 0.85 },
  },
};

/** 落下点の距離帯の 1 行。`any` は任意の打球タイプ・強さに一致する。 */
export type LandingBand = {
  readonly result: InPlayResult;
  readonly type: BattedType | "any";
  readonly strength: Strength | "any";
  readonly min: number;
  readonly max: number;
};

/** 落下点の距離帯の表(先頭一致)。ホームラン以外は `fenceRadius` 未満、ホームランは `fenceRadius` 以上。 */
export const LANDING_BANDS: readonly LandingBand[] = [
  { result: "groundout", type: "any", strength: "any", min: 14, max: 32 },
  { result: "doublePlay", type: "any", strength: "any", min: 16, max: 30 },
  { result: "flyout", type: "any", strength: "weak", min: 35, max: 60 },
  { result: "flyout", type: "any", strength: "medium", min: 60, max: 90 },
  { result: "flyout", type: "any", strength: "strong", min: 90, max: 103 },
  { result: "lineout", type: "any", strength: "weak", min: 25, max: 45 },
  { result: "lineout", type: "any", strength: "medium", min: 40, max: 70 },
  { result: "lineout", type: "any", strength: "strong", min: 55, max: 90 },
  { result: "single", type: "ground", strength: "any", min: 28, max: 55 },
  { result: "single", type: "liner", strength: "any", min: 45, max: 80 },
  { result: "single", type: "fly", strength: "any", min: 38, max: 65 },
  { result: "double", type: "any", strength: "any", min: 78, max: 98 },
  { result: "triple", type: "any", strength: "any", min: 98, max: 104 },
  { result: "homerun", type: "any", strength: "any", min: 106, max: 125 },
  { result: "error", type: "any", strength: "any", min: 18, max: 50 },
];
