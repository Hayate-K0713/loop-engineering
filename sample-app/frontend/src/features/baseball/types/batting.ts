import type { ZonePoint } from "./common";

export type SwingKind = "meet" | "power";

/** スイングカーソル(楕円)の半径。ゾーン単位。 */
export type CursorRadii = {
  readonly rx: number;
  readonly ry: number;
};

/** スイングの入力元。遅延補正の量を決める(タッチ・マウス/ペン・キー)。 */
export type SwingInputKind = "touch" | "mouse" | "key";

/**
 * スイングを起こした入力イベントの時刻情報(いずれも `event.nativeEvent.timeStamp`、ms)。
 * `timeStamp` = 入力が起きた時刻(タップは指を置いた時刻)、`sourceTimeStamp` = ハンドラを起動したイベントの時刻
 * (タップは指を離したイベント。それ以外は `timeStamp` と同じ)。
 */
export type SwingOrigin = {
  readonly timeStamp: number;
  readonly sourceTimeStamp: number;
  readonly inputKind: SwingInputKind;
};

/** スイングのタイミング表示の分類(早い・ジャスト・遅い)。 */
export type TimingLabel = "early" | "just" | "late";

/** タイミング表示。`dtMs` = 判定時刻 `atMs` − 到達時刻(負 = 早い)を四捨五入した整数。 */
export type TimingCue = {
  readonly label: TimingLabel;
  readonly dtMs: number;
};

/** スイング入力。`atMs` は投球開始(リリース)からの経過ゲーム時間(遅延補正後の判定時刻。過去になりうる)。 */
export type SwingInput = {
  readonly kind: SwingKind;
  readonly cursor: ZonePoint;
  readonly atMs: number;
};

export type CpuBatDecision = { readonly type: "take" } | { readonly type: "swing"; readonly input: SwingInput };

export type BattedType = "ground" | "liner" | "fly";
export type Strength = "weak" | "medium" | "strong";
export type Direction = "pull" | "center" | "opposite";

/** フェア打球の性質。 */
export type BattedBall = {
  readonly type: BattedType;
  readonly strength: Strength;
  readonly direction: Direction;
};

export type ContactJudgement = { readonly kind: "miss" } | { readonly kind: "foul" } | { readonly kind: "fair"; readonly ball: BattedBall };

export type InPlayResult = "groundout" | "doublePlay" | "flyout" | "lineout" | "single" | "double" | "triple" | "homerun" | "error";

/** 1球の結果。 */
export type PitchResult =
  | { readonly kind: "ball" }
  | { readonly kind: "called-strike" }
  | { readonly kind: "swinging-strike" }
  | { readonly kind: "foul" }
  | { readonly kind: "in-play"; readonly result: InPlayResult; readonly ball: BattedBall };

/** 打席の終わり方。 */
export type PlateOutcome = "walk" | "strikeout" | InPlayResult;

/**
 * フィールド図上の落下点。
 * 座標系: 原点=本塁、y=本塁からセンター方向(外野側)が正、x=右(ライト側)が正。単位はメートル相当の図上の長さ。
 * `distance = sqrt(x² + y²)`、`lateral = x / y`(±1 がファウルライン=45°)。
 * 値域: `0 < y ≤ 125`、`distance` は 14〜125、`|lateral| ≤ 0.85`(フェア内)、`overFence = distance ≥ fenceRadius`(フェンス半径 105)。
 * 打者の左右は持たず全員右打ち扱い(引っ張り=レフト側 x<0、流し=ライト側 x>0)。
 */
export type BattedLanding = {
  readonly x: number;
  readonly y: number;
  readonly distance: number;
  readonly lateral: number;
  readonly overFence: boolean;
};
