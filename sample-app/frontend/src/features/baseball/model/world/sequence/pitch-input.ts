// 投球入力(人間守備)の状態機械(純関数)。`idle` → `aiming`(ゾーンをなぞって狙う)→ `gauge`(離して確定、リングが縮む)→ `throwing`(停止で質が決まる)。
// 時刻はすべて `event.timeStamp`(ms)。React・DOM・three には依存せず、hooks(`usePitchingControls`)がイベントを渡して副作用(`effect`)で動く。
//
// 規則の要約:
// - `ctx.enabled` が偽・`ctx.holding` が真のときは、状態を変えるイベントをすべて無視する。例外は状態の後始末(`reset`・`pointer-cancel`・`carry`、持ち越しの指の `pointer-up`)。
// - 持ち越しの指(演出のスキップに使った指。`carry` で登録)は、離してもゲージを始めず(`none`)、最初の `pointer-move` で狙いの指になる。複数あるときは最初に登録された(= 最初に下りた)指だけを覚える。
// - ゲージ中の停止は、ゲージ開始後の `pointer-down`・`confirm` だけが数える。ゲージ開始から `stopGuardMs` 未満の停止は無視する。`ringMs + graceMs` に達したら `tick` で自動投球(失投)。
// - ゲージ中の `pointer-move`・`key-move` は狙いを変えない。

import type { ZonePoint } from "../../../types/common";
import type { PitchInputCtx, PitchInputEffect, PitchInputEvent, PitchInputKind, PitchInputState, PitchInputView } from "../../../types/pitch";
import { clampAim, gaugeErrorMs, gaugeRingAt, isStopAccepted, pitchQualityOf } from "../../pitch/gauge";

/** 投球入力の初期状態(狙いは中央)。 */
export const INITIAL_PITCH_INPUT_STATE: PitchInputState = {
  phase: "idle",
  aim: { x: 0, y: 0 },
  aimPointerId: null,
  dragOrigin: null,
  carriedPointerId: null,
  gaugeStartMs: null,
  quality: null,
  errMs: null,
};

type Result = readonly [PitchInputState, PitchInputEffect];
type PointerDownEvent = Extract<PitchInputEvent, { readonly type: "pointer-down" }>;
type PointerMoveEvent = Extract<PitchInputEvent, { readonly type: "pointer-move" }>;
type PointerUpEvent = Extract<PitchInputEvent, { readonly type: "pointer-up" }>;

const NONE: PitchInputEffect = { type: "none" };

function unchanged(state: PitchInputState): Result {
  return [state, NONE];
}

/** 狙いを決める段階(`idle`・`aiming`)か。 */
function isAimingPhase(state: PitchInputState): boolean {
  return state.phase === "idle" || state.phase === "aiming";
}

/** 公開ビュー。`gaugeElapsedMs` はゲージ中だけ `nowMs − gaugeStartMs`(負にはしない)、それ以外は `null`。 */
export function pitchInputViewOf(state: PitchInputState, nowMs: number): PitchInputView {
  const elapsed = state.phase === "gauge" && state.gaugeStartMs !== null ? Math.max(0, nowMs - state.gaugeStartMs) : null;
  return { phase: state.phase, aim: state.aim, gaugeElapsedMs: elapsed, quality: state.quality };
}

// ---- 狙いの決定 ----

/** ゲージを始める(狙いの確定)。`timeStamp` が非有限なら何もしない。 */
function startGauge(state: PitchInputState, timeStamp: number): Result {
  if (!Number.isFinite(timeStamp)) {
    return unchanged(state);
  }
  const next: PitchInputState = { ...state, phase: "gauge", aimPointerId: null, dragOrigin: null, gaugeStartMs: timeStamp, quality: null, errMs: null };
  return [next, { type: "gauge-start" }];
}

/** 押下。タッチは相対ドラッグ(起点だけ覚えて狙いは動かさない)、それ以外(マウス・ペン)は押した位置へ狙いを置く。 */
function onPointerDown(state: PitchInputState, event: PointerDownEvent): Result {
  if (state.aimPointerId !== null || event.pointerId === state.carriedPointerId) {
    return unchanged(state);
  }
  if (event.inputKind === "touch") {
    return [{ ...state, phase: "aiming", aimPointerId: event.pointerId, dragOrigin: { pointer: event.point, aim: state.aim } }, NONE];
  }
  return [{ ...state, phase: "aiming", aimPointerId: event.pointerId, dragOrigin: null, aim: clampAim(event.point) }, NONE];
}

/** 相対ドラッグなら起点からの移動量を狙いに足し、起点がなければ(マウス)ポインタの位置を狙いにする。±`aimLimit` に収める。 */
function dragAim(state: PitchInputState, point: ZonePoint): ZonePoint {
  const origin = state.dragOrigin;
  if (origin === null) {
    return clampAim(point);
  }
  return clampAim({ x: origin.aim.x + (point.x - origin.pointer.x), y: origin.aim.y + (point.y - origin.pointer.y) });
}

/** 持ち越しの指の最初の move: 狙いの指になる(この move 自体では狙いを動かさず、相対ドラッグの起点にする)。 */
function promoteCarried(state: PitchInputState, event: PointerMoveEvent): Result {
  const next: PitchInputState = {
    ...state,
    phase: "aiming",
    aimPointerId: event.pointerId,
    carriedPointerId: null,
    dragOrigin: { pointer: event.point, aim: state.aim },
  };
  return [next, NONE];
}

function onPointerMove(state: PitchInputState, event: PointerMoveEvent): Result {
  if (!isAimingPhase(state)) {
    return unchanged(state);
  }
  if (state.aimPointerId !== null) {
    return event.pointerId === state.aimPointerId ? [{ ...state, phase: "aiming", aim: dragAim(state, event.point) }, NONE] : unchanged(state);
  }
  if (state.carriedPointerId !== null) {
    return event.pointerId === state.carriedPointerId ? promoteCarried(state, event) : unchanged(state);
  }
  // 押していないポインタの移動(マウスのホバー)。押す前から照準が追従する。
  return [{ ...state, phase: "aiming", aim: clampAim(event.point) }, NONE];
}

/** 離し。狙いの指なら狙いを確定してゲージを始める。それ以外の指(持ち越しの指を含む)の離しは何も起こさない。 */
function onPointerUp(state: PitchInputState, event: PointerUpEvent): Result {
  if (state.phase === "aiming" && state.aimPointerId !== null && event.pointerId === state.aimPointerId) {
    return startGauge(state, event.timeStamp);
  }
  return unchanged(state);
}

function onKeyMove(state: PitchInputState, dx: number, dy: number): Result {
  if (!isAimingPhase(state)) {
    return unchanged(state);
  }
  return [{ ...state, phase: "aiming", aim: clampAim({ x: state.aim.x + dx, y: state.aim.y + dy }) }, NONE];
}

// ---- ゲージの停止・自動投球 ----

function throwWith(state: PitchInputState, errMs: number | null): Result {
  const quality = pitchQualityOf(errMs);
  const next: PitchInputState = { ...state, phase: "throwing", aimPointerId: null, dragOrigin: null, quality, errMs };
  return [next, { type: "throw", aim: state.aim, quality, errMs }];
}

/**
 * ゲージ中の停止(`pointer-down`・`confirm`)。`stopGuardMs` 未満は無視。それ以外は停止の誤差から質を決める
 * (`tick` より先に猶予後の停止が届いても、誤差が窓の外なので失投になる)。
 */
function onStop(state: PitchInputState, timeStamp: number, inputKind: PitchInputKind, timeScale: number): Result {
  const startMs = state.gaugeStartMs;
  if (state.phase !== "gauge" || startMs === null) {
    return unchanged(state);
  }
  if (!isStopAccepted(timeStamp - startMs, timeScale)) {
    return unchanged(state);
  }
  return throwWith(state, gaugeErrorMs({ stopMs: timeStamp, startMs, inputKind, timeScale }));
}

function onTick(state: PitchInputState, timeStamp: number, timeScale: number): Result {
  const startMs = state.gaugeStartMs;
  if (state.phase !== "gauge" || startMs === null) {
    return unchanged(state);
  }
  return gaugeRingAt(timeStamp - startMs, timeScale).expired ? throwWith(state, null) : unchanged(state);
}

// ---- 後始末(ctx に関わらず処理する) ----

/** 次の球のための初期化。まだ下りている持ち越しの指は残す(離しの `pointer-up` で消える)。 */
function onReset(state: PitchInputState): Result {
  return [{ ...INITIAL_PITCH_INPUT_STATE, carriedPointerId: state.carriedPointerId }, NONE];
}

/** 持ち越しの指の登録。すでに 1 本あれば最初の指を保つ(最初に下りた指が昇格する)。狙いの指自身は登録しない。 */
function onCarry(state: PitchInputState, pointerId: number): Result {
  if (state.carriedPointerId !== null || pointerId === state.aimPointerId) {
    return unchanged(state);
  }
  return [{ ...state, carriedPointerId: pointerId }, NONE];
}

/** 指の中断。持ち越しの指なら登録を消し、狙いの指なら狙いの確定をせずに `idle` へ戻る(狙いの位置は残す)。 */
function onCancel(state: PitchInputState, pointerId: number): Result {
  if (pointerId === state.carriedPointerId) {
    return [{ ...state, carriedPointerId: null }, NONE];
  }
  if (state.phase === "aiming" && pointerId === state.aimPointerId) {
    return [{ ...state, phase: "idle", aimPointerId: null, dragOrigin: null }, NONE];
  }
  return unchanged(state);
}

/** ctx に関わらず処理するイベント(後始末)。該当しなければ `null`。 */
function reduceHousekeeping(state: PitchInputState, event: PitchInputEvent): Result | null {
  switch (event.type) {
    case "reset":
      return onReset(state);
    case "carry":
      return onCarry(state, event.pointerId);
    case "pointer-cancel":
      return onCancel(state, event.pointerId);
    case "pointer-up":
      // 持ち越しの指の離しは、演出中でもゲージを始めず、登録だけ消す。
      return event.pointerId === state.carriedPointerId ? [{ ...state, carriedPointerId: null }, NONE] : null;
    default:
      return null;
  }
}

function reduceGated(state: PitchInputState, event: PitchInputEvent, ctx: PitchInputCtx): Result {
  switch (event.type) {
    case "pointer-down":
      return isAimingPhase(state) ? onPointerDown(state, event) : onStop(state, event.timeStamp, event.inputKind, ctx.timeScale);
    case "pointer-move":
      return onPointerMove(state, event);
    case "pointer-up":
      return onPointerUp(state, event);
    case "key-move":
      return onKeyMove(state, event.dx, event.dy);
    case "confirm":
      return isAimingPhase(state) ? startGauge(state, event.timeStamp) : onStop(state, event.timeStamp, event.inputKind, ctx.timeScale);
    case "tick":
      return onTick(state, event.timeStamp, ctx.timeScale);
    default:
      return unchanged(state);
  }
}

/**
 * 投球入力の遷移。新しい状態と副作用を返す(入力の `state` は書き換えない)。
 * `gauge-start` = ゲージが始まった(離し・`confirm`)。`throw` = 質が決まった(停止なら `errMs` あり、自動投球は `errMs: null` で失投)。
 */
export function reducePitchInput(state: PitchInputState, event: PitchInputEvent, ctx: PitchInputCtx): Result {
  const housekeeping = reduceHousekeeping(state, event);
  if (housekeeping !== null) {
    return housekeeping;
  }
  if (!ctx.enabled || ctx.holding) {
    return unchanged(state);
  }
  return reduceGated(state, event, ctx);
}
