import type { GridIndex, ZonePoint } from "./common";

export type PitchKind = "straight" | "slider" | "curve" | "fork" | "shoot";

/** 5×5 コースグリッドのセル。col 0 = 打者視点で左、row 0 = 上段。中央 3×3(1〜3)がストライク。 */
export type CourseCell = {
  readonly col: GridIndex;
  readonly row: GridIndex;
};

/** 投球の質(ゲージの結果)。ナイス > グッド > ふつう > 失投。CPU 投手は `normal`。 */
export type PitchQuality = "nice" | "good" | "normal" | "miss";

/** 投球コマンド(v3)。`aim` は狙い(連続座標、ゾーン単位。±`PITCH_PARAMS.gauge.aimLimit` に収める)。 */
export type PitchCommand = {
  readonly kind: PitchKind;
  readonly aim: ZonePoint;
  readonly quality: PitchQuality;
};

/** CPU 投手の選択(球種とセル)。reducer がセル中心を `aim`、`quality: "normal"` にして `PitchCommand` にする。 */
export type CpuPitchChoice = {
  readonly kind: PitchKind;
  readonly cell: CourseCell;
};

/**
 * 球種の仕様。`bend` は表示用の軌道の「終盤の曲がり量」(ゾーン単位、`WORLD_PARAMS.pitch.bendGain` を掛ける前)で、判定には使わない。
 * x は + がライト側(画面右)、y は + が上(右投手の実際の向き: スライダー・カーブ = +x、シュート = −x、カーブ・フォーク = 落ちる = −y)。
 */
export type PitchSpec = {
  readonly kind: PitchKind;
  readonly label: string;
  readonly speedOffsetKmh: number;
  readonly cursorScale: { readonly x: number; readonly y: number };
  readonly bend: ZonePoint;
};

/** 投球1球の飛行情報。`seq` は加算後の pitchSeq。 */
export type PitchFlight = {
  readonly seq: number;
  readonly kind: PitchKind;
  readonly aim: ZonePoint;
  readonly landing: ZonePoint;
  readonly speedKmh: number;
  readonly durationMs: number;
  /** 投球の質。CPU 打者の入力ノイズと、ばらつき σ の倍率に効く。 */
  readonly quality: PitchQuality;
};

// ---- 投球入力(人間守備。ゾーンを直接なぞって狙い、離して確定、リングゲージをタップで止める)の状態機械の契約 ----
// 実装は `model/world/sequence/pitch-input.ts`(B1)の `reducePitchInput(state, event, ctx): readonly [PitchInputState, PitchInputEffect]`。

/** `idle` = 待機、`aiming` = 狙いをなぞっている、`gauge` = リングが縮んでいる(停止待ち)、`throwing` = 質が決まり投球へ。 */
export type PitchInputPhase = "idle" | "aiming" | "gauge" | "throwing";

/** 入力の種類(遅延補正の選択に使う)。 */
export type PitchInputKind = "touch" | "mouse" | "key";

/**
 * 投球入力の状態。`aimPointerId` = 狙いをなぞっている指、`dragOrigin` = 相対ドラッグの起点(押下時のゾーン座標と、そのときの狙い)、
 * `carriedPointerId` = 演出のスキップに使った指(**離してもゲージは始まらず、最初の move で狙いの指になる**。複数あるときは最初に下りた `pointerId`)。
 * `gaugeStartMs` = ゲージ開始の時刻(`event.timeStamp` 基準)、`quality`/`errMs` = 停止で決まった質と誤差(それまでは `null`)。
 */
export type PitchInputState = {
  readonly phase: PitchInputPhase;
  readonly aim: ZonePoint;
  readonly aimPointerId: number | null;
  readonly dragOrigin: { readonly pointer: ZonePoint; readonly aim: ZonePoint } | null;
  readonly carriedPointerId: number | null;
  readonly gaugeStartMs: number | null;
  readonly quality: PitchQuality | null;
  readonly errMs: number | null;
};

/**
 * 投球入力のイベント。`point` はゾーン座標(ポインタの位置を `pickZone` で換算したもの)、`timeStamp` は `event.timeStamp`(ms)。
 * `confirm` = 「投げる/とめる!」ボタン・Space/Enter(`idle`/`aiming` では確定、`gauge` では停止)。`key-move` = 矢印キー(狙いの移動量)。
 * `carry` = スキップに使った指(持ち越しの指)の登録。`tick` = ゲージの自動投球の判定用。
 */
export type PitchInputEvent =
  | { readonly type: "pointer-down"; readonly pointerId: number; readonly point: ZonePoint; readonly timeStamp: number; readonly inputKind: PitchInputKind }
  | { readonly type: "pointer-move"; readonly pointerId: number; readonly point: ZonePoint; readonly timeStamp: number }
  | { readonly type: "pointer-up"; readonly pointerId: number; readonly timeStamp: number; readonly inputKind: PitchInputKind }
  | { readonly type: "pointer-cancel"; readonly pointerId: number }
  | { readonly type: "carry"; readonly pointerId: number }
  | { readonly type: "key-move"; readonly dx: number; readonly dy: number }
  | { readonly type: "confirm"; readonly timeStamp: number; readonly inputKind: PitchInputKind }
  | { readonly type: "tick"; readonly timeStamp: number }
  | { readonly type: "reset" };

/** 投球入力の外部条件。`enabled` が偽(人間守備でない)・`holding`(演出中)が真のときは何も起きない。`timeScale` はゲージの長さに反映する。 */
export type PitchInputCtx = {
  readonly enabled: boolean;
  readonly holding: boolean;
  readonly timeScale: number;
};

/** 投球入力の副作用。`gauge-start` = ゲージが始まった、`throw` = 質が決まった(`errMs` は自動投球では `null`)。 */
export type PitchInputEffect =
  | { readonly type: "none" }
  | { readonly type: "gauge-start" }
  | { readonly type: "throw"; readonly aim: ZonePoint; readonly quality: PitchQuality; readonly errMs: number | null };

/** UI・director が見る投球入力の公開ビュー(`gaugeElapsedMs` はゲージ中のみ非 `null`)。 */
export type PitchInputView = {
  readonly phase: PitchInputPhase;
  readonly aim: ZonePoint;
  readonly gaugeElapsedMs: number | null;
  readonly quality: PitchQuality | null;
};
