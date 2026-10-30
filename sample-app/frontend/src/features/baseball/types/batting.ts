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

/**
 * スイング入力。`atMs` は投球開始(リリース)からの経過ゲーム時間(遅延補正後の判定時刻。過去になりうる)。
 * v3: `cursor` は**有効カーソル**(ロックオン適用後。タップは押下時刻の進行度で計算したもの)、`assistK` はその引き寄せ量 k(0〜1)。
 * `assistK` の省略は 0(= v2 と同じ判定)。
 */
export type SwingInput = {
  readonly kind: SwingKind;
  readonly cursor: ZonePoint;
  readonly atMs: number;
  readonly assistK?: number;
};

/** 予告(着弾点の印)の見せ方。`exact` = 着弾点の点、`fade` = 着弾点を含む薄い円(中心はずらす)、`none` = 出さない(リングは出る)。 */
export type PreviewMode = "exact" | "fade" | "none";

/**
 * 難易度ごとのアシスト(ロックオン・予告・質の補正)。値の表は `model/batting/assist.ts` の `ASSIST_TABLE`。
 * `lockStrength` = 引き寄せの最大割合(0〜1)、`captureRadius` = これより遠い(ゾーン単位)ボールは引き寄せない、
 * `rampStart`/`rampEnd` = 引き寄せが効き始める/最大になる飛行の進行度、`fadeRadius`/`fadeJitter` = `fade` の円の半径とずれの上限(`exact` では 0)、
 * `qualityPenalty` = 質 q を `1 − qualityPenalty × k` 倍する係数。
 */
export type AssistParams = {
  readonly lockStrength: number;
  readonly captureRadius: number;
  readonly rampStart: number;
  readonly rampEnd: number;
  readonly preview: PreviewMode;
  readonly fadeRadius: number;
  readonly fadeJitter: number;
  readonly qualityPenalty: number;
};

/** スイングを起こした入力の種類(試遊ログ・診断用)。`tap` = 1 本目の指のタップ、`touch-second` = 2 本目以降の指、`button` = スイングボタン。 */
export type SwingSource = "tap" | "touch-second" | "button" | "key" | "mouse";

/**
 * スイングの付随情報(試遊ログ・診断用。判定には使わない)。座標はゾーン単位。
 * `raw` = 指で動かした素のカーソル(押下時刻)、`effective` = ロックオン後の有効カーソル(= `SwingInput.cursor`)。
 * `pressTimeStamp` = 押下の `event.timeStamp`。`tapHoldMs`/`tapMovePx` はタップのときの持続と押下からの移動量(それ以外は `null`)、
 * `fingerTravelPx` = 指の総移動量(指でないときは `null`)。
 */
export type SwingMeta = {
  readonly source: SwingSource;
  readonly pressTimeStamp: number;
  readonly raw: ZonePoint;
  readonly effective: ZonePoint;
  readonly assistK: number;
  readonly tapHoldMs: number | null;
  readonly tapMovePx: number | null;
  readonly fingerTravelPx: number | null;
};

/**
 * 押したのにスイングにならなかった理由(試遊ログ・ヒント用。タップ方式)。
 * `tap-too-long` = 持続が 180ms 超、`tap-moved` = 移動が 10px 超、`not-ready` = 到達の後(`swingReady` が偽)・リリース前の押下、
 * `holding` = 演出中(押下はスキップに使われる)、`cancel` = pointercancel、`held-release` = スキップに使った指の離し。
 */
export type IgnoredInputReason = "not-ready" | "holding" | "tap-too-long" | "tap-moved" | "cancel" | "held-release";

/** 接触の質の段階(タイミングのピルの 2 行目。「芯」「ふつう」「かすり」「ミス」)。 */
export type ContactQuality = "core" | "normal" | "graze" | "miss";

/** スイング直後のタイミングのピル(2 行)の内容。1 行目 = `timing`(早い/ジャスト/遅い + ms)、2 行目 = `quality`。 */
export type ContactFeedback = {
  readonly timing: TimingCue;
  readonly quality: ContactQuality;
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
