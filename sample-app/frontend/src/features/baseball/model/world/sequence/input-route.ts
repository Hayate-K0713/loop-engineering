// ステージ入力面の入力の振り分け(純関数)。演出のスキップ(N14)とスイング・ドラッグ・タップが衝突しないことを、判定表の全組み合わせのテストで保証する。
// hooks はこの戻り値で分岐するだけで、`holding` を自分で見て分岐しない。

import type { IgnoredInputReason } from "../../../types/batting";

/** タップとみなす指の持続の上限(ms。2 つのイベントの `timeStamp` の差)。 */
export const TAP_MAX_DURATION_MS = 180;

/** タップとみなす指の移動量の上限(CSS px)。 */
export const TAP_MAX_MOVE_PX = 10;

/** タップ候補の指がある間、到達通知(`PITCH_ARRIVED`)を保留する最長の時間(ms)。この後は指を離すイベントが届かなくても通知する。 */
export const TAP_ARRIVAL_HOLD_MS = 200;

/**
 * pointerdown の振り分け結果。
 * - `skip`: 演出をスキップする。
 * - `swing`: カーソルをポインタ位置へ移動して即スイングを試みる(マウス/ペン。可否は呼び出し先が `swingReady` で判定)。
 * - `swing-here`: カーソルを動かさず、現在のカーソル位置で即スイングを試みる(2 本目以降の指)。
 * - `drag-start`: 相対ドラッグの開始(1 本目の指)。同時にタップ候補を記録する。
 * - `ignore`: 何もしない。
 */
export type StagePointerAction = "skip" | "swing" | "swing-here" | "drag-start" | "ignore";

export type StagePointerInput = {
  /** 演出中(`isHolding`)。真なら主ポインタ操作は常にスキップ。 */
  readonly holding: boolean;
  /** 人間打撃中(入力面でカーソル操作を受け付ける)。 */
  readonly enabled: boolean;
  /** スイングできる状態。振り分けには使わない(`holding` と同時に真になっても `holding` を優先する)。 */
  readonly swingReady: boolean;
  /** `PointerEvent.pointerType` をそのまま渡す(`"mouse"`・`"pen"`・`"touch"` 以外は、マウス/ペンと同じ扱い)。 */
  readonly pointerType: string;
  readonly isPrimary: boolean;
  readonly button: number;
};

/** 主ポインタ操作か。マウス/ペンは `isPrimary` かつ `button === 0`、タッチの 1 本目の指は `isPrimary` のみ(`button` は見ない)。 */
function isPrimaryAction(input: StagePointerInput): boolean {
  return input.pointerType === "touch" ? input.isPrimary : input.isPrimary && input.button === 0;
}

/** タッチの 2 本目以降の指(`isPrimary` でない)。`holding`・`enabled` でなければ現在のカーソル位置で即スイング(スキップには使わない)。 */
function routeSecondaryTouch(input: StagePointerInput): StagePointerAction {
  return input.holding || !input.enabled ? "ignore" : "swing-here";
}

/**
 * 入力面の pointerdown の振り分け。
 * - マウス/ペン: 主ポインタ操作(`isPrimary` かつ `button === 0`)でなければ `ignore`。`holding` なら `skip`、`enabled` でなければ `ignore`、それ以外は `swing`。
 * - タッチ・1 本目の指: `holding` なら `skip`、`enabled` でなければ `ignore`、それ以外は `drag-start`。
 * - タッチ・2 本目以降の指: `holding` または `enabled` でなければ `ignore`(スキップには使わない)、それ以外は `swing-here`。
 */
export function routeStagePointer(input: StagePointerInput): StagePointerAction {
  if (input.pointerType === "touch" && !input.isPrimary) {
    return routeSecondaryTouch(input);
  }
  if (!isPrimaryAction(input)) {
    return "ignore";
  }
  if (input.holding) {
    return "skip";
  }
  if (!input.enabled) {
    return "ignore";
  }
  return input.pointerType === "touch" ? "drag-start" : "swing";
}

/** pointermove の振り分け結果。`drag` = 相対移動、`drag-start` = 押しっぱなしの指でドラッグ開始(この move 自体ではカーソルを動かさない)、`follow` = 絶対位置追従。 */
export type StageMoveAction = "drag" | "drag-start" | "follow" | "ignore";

export type StageMoveInput = {
  readonly holding: boolean;
  readonly enabled: boolean;
  /** `PointerEvent.pointerType`(`"touch"` 以外はマウス/ペンと同じ扱い)。 */
  readonly pointerType: string;
  /** 相対ドラッグ中(1 本目の指が `drag-start` を受けて動いている)。 */
  readonly dragging: boolean;
  /** スキップに使った指がまだ下りている。 */
  readonly held: boolean;
};

/**
 * 入力面の pointermove の振り分け。
 * - `enabled` でなければ `ignore`。マウス/ペンは `follow`。
 * - タッチ: ドラッグ中は `drag`。ドラッグ中でなく `held` かつ `holding` でなければ `drag-start`(演出中に置いた指の、演出終了後の最初の move)。それ以外は `ignore`。
 */
export function routeStageMove(input: StageMoveInput): StageMoveAction {
  if (!input.enabled) {
    return "ignore";
  }
  if (input.pointerType !== "touch") {
    return "follow";
  }
  if (input.dragging) {
    return "drag";
  }
  return input.held && !input.holding ? "drag-start" : "ignore";
}

type TapGestureInput = {
  /** pointerdown の `event.timeStamp`(ms)。 */
  readonly downTimeStamp: number;
  /** pointerup の `event.timeStamp`(ms)。 */
  readonly upTimeStamp: number;
  /** 押下位置からの最大の移動量(CSS px)。 */
  readonly movedPx: number;
};

/** タップか。持続 ≤ `TAP_MAX_DURATION_MS` かつ移動 ≤ `TAP_MAX_MOVE_PX`。時間は 2 つのイベントの `timeStamp` の差で測る(ハンドラの実行時刻ではない)。持続が負・`NaN` は偽。 */
export function isTapGesture(input: TapGestureInput): boolean {
  const duration = input.upTimeStamp - input.downTimeStamp;
  return duration >= 0 && duration <= TAP_MAX_DURATION_MS && input.movedPx <= TAP_MAX_MOVE_PX;
}

/** pointerup の振り分け結果。`swing-here` = 押下時点のカーソル位置でスイングを試みる(判定時刻は押下の時刻)。 */
type StageReleaseAction = "swing-here" | "none";

export type StageReleaseInput = {
  /** `PointerEvent.pointerType`。 */
  readonly pointerType: string;
  /** この指の pointerdown が `drag-start` で、そのとき `swingReady` が真だった(タップ候補)。 */
  readonly tapCandidate: boolean;
  /** `isTapGesture` の結果。 */
  readonly tapOk: boolean;
  readonly holding: boolean;
  readonly enabled: boolean;
};

/**
 * 入力面の pointerup の振り分け。タッチのタップ候補が `tapOk` で、`enabled` かつ `holding` でないときだけ `swing-here`。
 * ドラッグした・長押し・スキップに使った指(`tapCandidate` が偽)・マウス/ペンは `none`。
 */
export function routeStageRelease(input: StageReleaseInput): StageReleaseAction {
  const swings = input.pointerType === "touch" && input.tapCandidate && input.tapOk && input.enabled && !input.holding;
  return swings ? "swing-here" : "none";
}

export type TapReleaseInput = {
  /** `PointerEvent.pointerType`。 */
  readonly pointerType: string;
  /** この指が `pointercancel` で終わった(離したのではない)。 */
  readonly cancelled: boolean;
  /** この指の pointerdown が `skip` だった(演出のスキップに使った指)。 */
  readonly held: boolean;
  /** この指の pointerdown が `drag-start` で、そのとき `swingReady` が真だった(タップ候補)。 */
  readonly tapCandidate: boolean;
  /** pointerdown の `event.timeStamp`(ms)。 */
  readonly downTimeStamp: number;
  /** pointerup の `event.timeStamp`(ms)。 */
  readonly upTimeStamp: number;
  /** 押下位置からの最大の移動量(CSS px)。 */
  readonly movedPx: number;
  /** 離した時点で演出中。 */
  readonly holding: boolean;
  /** 離した時点で人間打撃中。 */
  readonly enabled: boolean;
};

/**
 * タッチの指がスイングにならなかった理由の分類(押したのに振れなかったときのヒント・試遊ログ用)。`routeStageRelease` が `none` のとき、
 * 結果が `null` でない理由になる。優先順は `cancel` > `held-release` > `holding` > `not-ready` > `tap-moved` > `tap-too-long`。
 * - `cancel`: `pointercancel`。 `held-release`: スキップに使った指の離し(仕様として振れない)。 `holding`: 離した時点で演出中。
 * - `not-ready`: タップ候補でない(押下が到達の後で `swingReady` が偽だった)、または打撃中でない。 `tap-moved`: 移動が `TAP_MAX_MOVE_PX` 超(`NaN` を含む)。
 * - `tap-too-long`: 持続が `TAP_MAX_DURATION_MS` 超、または負・`NaN`(`isTapGesture` が偽になる残り)。
 * `null` = 理由なし(タップが通る = `routeStageRelease` が `swing-here`、またはマウス/ペンの離し。マウス/ペンは押下でスイングするので離しは無視された入力ではない)。
 * 閾値は `isTapGesture` と共有し、`null` ⇔ `swing-here` が崩れないようにしている。
 */
export function tapReleaseReason(input: TapReleaseInput): IgnoredInputReason | null {
  if (input.pointerType !== "touch") {
    return null;
  }
  if (input.cancelled) {
    return "cancel";
  }
  if (input.held) {
    return "held-release";
  }
  if (input.holding) {
    return "holding";
  }
  if (!input.tapCandidate || !input.enabled) {
    return "not-ready";
  }
  if (!(input.movedPx <= TAP_MAX_MOVE_PX)) {
    return "tap-moved";
  }
  return isTapGesture(input) ? null : "tap-too-long";
}

export type SkipKeyInput = {
  readonly holding: boolean;
  /** `KeyboardEvent.key`。 */
  readonly key: string;
  readonly repeat: boolean;
  /** `event.target.tagName`(要素でなければ空文字)。大文字・小文字は区別しない。 */
  readonly targetTag: string;
};

const SKIP_KEYS: readonly string[] = [" ", "Enter"];

/** スキップにしない入力先(リンクの決定・選択肢・文字入力にキーを譲る)。 */
const NON_SKIP_TARGETS: readonly string[] = ["A", "SELECT", "INPUT", "TEXTAREA"];

/** Space/Enter の keydown がスキップか。`holding` 中の最初の1回(`repeat` でない)で、入力先がリンク・select・input・textarea でないとき真。 */
export function isSkipKey(input: SkipKeyInput): boolean {
  return input.holding && !input.repeat && SKIP_KEYS.includes(input.key) && !NON_SKIP_TARGETS.includes(input.targetTag.toUpperCase());
}
