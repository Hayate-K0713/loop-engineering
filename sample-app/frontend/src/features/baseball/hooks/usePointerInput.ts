import { useEffect, useRef, type PointerEvent, type PointerEventHandler, type RefObject } from "react";
import { clampCursor } from "../model/batting/cursor";
import {
  isTapGesture,
  routeStageMove,
  routeStagePointer,
  routeStageRelease,
  tapReleaseReason,
  TAP_ARRIVAL_HOLD_MS,
  TAP_MAX_MOVE_PX,
} from "../model/world/sequence/input-route";
import { zoneDeltaFromScreenDelta } from "../model/world/space/coords";
import type { IgnoredInputReason, SwingMeta, SwingOrigin } from "../types/batting";
import type { ZonePoint } from "../types/common";
import type { ScreenRect } from "../types/stage";
import { useLatest } from "./useLatest";

/** ステージの入力面(div)のポインタ4ハンドラ(そのまま props に展開できる形)。 */
export type PointerHandlers = {
  readonly onPointerDown: PointerEventHandler<HTMLElement>;
  readonly onPointerMove: PointerEventHandler<HTMLElement>;
  readonly onPointerUp: PointerEventHandler<HTMLElement>;
  readonly onPointerCancel: PointerEventHandler<HTMLElement>;
};

type UsePointerInputOptions = {
  /** 人間打撃時のみ真。偽の間はカーソル・スイング・ドラッグの入力を無視する(スキップは `holding` で別に振り分ける)。 */
  readonly enabled: boolean;
  /** 演出中(`isHolding`)。振り分けは `route*` に任せ、ここでは直接分岐しない(各 `route*` へ渡すだけ)。 */
  readonly holding: boolean;
  /** 人間がスイングできる(`GameView.swingReady`)。pointerdown のときに真ならタップ候補にする。 */
  readonly swingReady: boolean;
  /** 演出のスキップ。 */
  readonly onSkip: () => void;
  /** 画面座標(client)→ゾーン座標。ゾーン平面に当たらなければ `null`(`useStage3d`)。 */
  readonly pickZone: (clientX: number, clientY: number) => ZonePoint | null;
  /** 打撃カメラでのゾーン枠の画面矩形(`useStage3d`)。タッチのドラッグ量の換算に使う。 */
  readonly getZoneRect: () => ScreenRect | null;
  /** 現在のカーソル位置。タッチのドラッグ開始時・タップ候補の位置の記録に使う。 */
  readonly getCursor: () => ZonePoint;
  /** カーソルをゾーン座標へ移動する(ref の更新。画面内への制限は呼び出し先が適用する)。 */
  readonly moveCursorTo: (point: ZonePoint) => void;
  /**
   * スイングを試みる(`swingReady` の判定は呼び出し先が行う)。`cursorAtDown` があればそのカーソル位置(素のカーソル)で、なければ現在のカーソル位置で振る
   * (タップのスイングは、タップ中にカーソルが動いても押下時点の位置を使う)。`detail` = 入力の種類とタップの計測値(試遊ログ用。判定には使わない)。
   */
  readonly onSwing: (origin: SwingOrigin, cursorAtDown: ZonePoint | undefined, detail: SwingDetail) => void;
  /** 押したのにスイングにならなかった(タッチの離し・pointercancel)。理由は `tapReleaseReason` の分類(ヒント・ログ用)。 */
  readonly onIgnored: (reason: IgnoredInputReason) => void;
  /** pointercancel を受けた(記録用。指の状態を持っていたものだけ)。 */
  readonly onPointerCancel: () => void;
  /** 到達通知の保留(`usePitchFlight`)。タップ候補の指がある間だけ保留する。 */
  readonly holdArrivalFor: (ms: number) => void;
  /** 保留を解く(`usePitchFlight`)。 */
  readonly releaseArrival: () => void;
};

/** タッチの相対ドラッグ。開始時の指の位置とカーソル位置を覚え、移動量だけカーソルを動かす。 */
type DragState = {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly startCursor: ZonePoint;
};

/** タップ候補(1 本目の指が `drag-start` を受け、そのとき `swingReady` が真だった)。`movedPx` は押下位置からの最大の移動量。 */
type TapCandidate = {
  readonly pointerId: number;
  readonly downTimeStamp: number;
  readonly startX: number;
  readonly startY: number;
  readonly cursorAtDown: ZonePoint;
  movedPx: number;
};

/** スイングを起こした入力の付随情報(`SwingMeta` のうち入力の種類とタップの計測値。試遊ログ用)。 */
export type SwingDetail = Pick<SwingMeta, "source" | "tapHoldMs" | "tapMovePx" | "fingerTravelPx">;

const MOUSE_DETAIL: SwingDetail = { source: "mouse", tapHoldMs: null, tapMovePx: null, fingerTravelPx: null };
const SECOND_FINGER_DETAIL: SwingDetail = { source: "touch-second", tapHoldMs: null, tapMovePx: null, fingerTravelPx: null };

/** この指の pointerdown の結果。`skip` = 演出のスキップに使った指、`drag` = 1 本目の指(ドラッグ開始・タップ候補になりうる)。それ以外の指は記録しない。 */
type FingerKind = "skip" | "drag";

/**
 * ジェスチャの状態(いずれも ref。再レンダーを起こさない)。`held` = 演出のスキップに使った、まだ下りている指の `pointerId`。
 * `fingers` と `abandoned` は離し・キャンセルの理由の分類(`tapReleaseReason`)のためだけの記録で、ジェスチャの分岐には使わない:
 * `fingers` = 指ごとの pointerdown の結果、`abandoned` = 移動が `TAP_MAX_MOVE_PX` を超えて取り消されたタップ候補(離しで `tap-moved` と分類するため)。
 */
type GestureRefs = {
  readonly drag: RefObject<DragState | null>;
  readonly tap: RefObject<TapCandidate | null>;
  readonly held: RefObject<number | null>;
  readonly fingers: RefObject<Map<number, FingerKind>>;
  readonly abandoned: RefObject<TapCandidate | null>;
};

/** ポインタイベントの時刻情報(`event.nativeEvent.timeStamp`。合成イベントの `timeStamp` は 0 のとき `Date.now()` になるため使わない)。タッチ以外はマウス/ペン扱い。 */
export function swingOriginOf(event: { readonly pointerType: string; readonly nativeEvent: { readonly timeStamp: number } }): SwingOrigin {
  const timeStamp = event.nativeEvent.timeStamp;
  return { timeStamp, sourceTimeStamp: timeStamp, inputKind: event.pointerType === "touch" ? "touch" : "mouse" };
}

function releaseCapture(event: PointerEvent<HTMLElement>): void {
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
}

/** マウス/ペンの絶対位置追従(`pickZone` → `clampCursor`)。ゾーン平面に当たらなければ動かさない。 */
function followPointer(event: PointerEvent<HTMLElement>, options: UsePointerInputOptions): void {
  const point = options.pickZone(event.clientX, event.clientY);
  if (point !== null) {
    options.moveCursorTo(clampCursor(point));
  }
}

/** タッチのドラッグ中: 指の移動量をゾーン座標の差分に換算し、開始時のカーソル位置に加える。 */
function dragCursor(event: PointerEvent<HTMLElement>, drag: DragState, options: UsePointerInputOptions): void {
  const rect = options.getZoneRect();
  if (rect === null) {
    return;
  }
  const delta = zoneDeltaFromScreenDelta(event.clientX - drag.startX, event.clientY - drag.startY, rect);
  options.moveCursorTo(clampCursor({ x: drag.startCursor.x + delta.x, y: drag.startCursor.y + delta.y }));
}

/** 相対ドラッグの開始(この時点のカーソル位置を覚える。カーソル自体は動かさない)。 */
function startDrag(event: PointerEvent<HTMLElement>, refs: GestureRefs, options: UsePointerInputOptions): void {
  refs.drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startCursor: options.getCursor() };
  event.currentTarget.setPointerCapture(event.pointerId);
}

/** タップ候補の記録。`swingReady` が真のときだけ候補にし、到達通知を保留する(指を離すまでスイングが確定しないため)。 */
function startTapCandidate(event: PointerEvent<HTMLElement>, refs: GestureRefs, options: UsePointerInputOptions): void {
  if (!options.swingReady) {
    refs.tap.current = null;
    return;
  }
  refs.tap.current = {
    pointerId: event.pointerId,
    downTimeStamp: event.nativeEvent.timeStamp,
    startX: event.clientX,
    startY: event.clientY,
    cursorAtDown: options.getCursor(),
    movedPx: 0,
  };
  options.holdArrivalFor(TAP_ARRIVAL_HOLD_MS);
}

/** ドラッグ中の移動でタップ候補の移動量を更新する。`TAP_MAX_MOVE_PX` を超えたら候補を取り消して到達通知の保留を解く。 */
function trackTapMovement(event: PointerEvent<HTMLElement>, refs: GestureRefs, options: UsePointerInputOptions): void {
  const tap = refs.tap.current;
  if (tap === null || tap.pointerId !== event.pointerId) {
    return;
  }
  tap.movedPx = Math.max(tap.movedPx, Math.hypot(event.clientX - tap.startX, event.clientY - tap.startY));
  if (tap.movedPx > TAP_MAX_MOVE_PX) {
    refs.abandoned.current = tap;
    refs.tap.current = null;
    options.releaseArrival();
  }
}

/** この指のドラッグ・スキップ保持・離しの分類用の記録を捨て、ポインタキャプチャを解く。 */
function endPointer(event: PointerEvent<HTMLElement>, refs: GestureRefs): void {
  if (refs.drag.current?.pointerId === event.pointerId) {
    refs.drag.current = null;
  }
  if (refs.held.current === event.pointerId) {
    refs.held.current = null;
  }
  if (refs.abandoned.current?.pointerId === event.pointerId) {
    refs.abandoned.current = null;
  }
  refs.fingers.current.delete(event.pointerId);
  releaseCapture(event);
}

type EndedFinger = {
  /** この指の pointerdown の結果。記録が無い指(2 本目の指のスイング・無視された押下)は通知の対象外。 */
  readonly kind: FingerKind | undefined;
  /** 取り消されたものを含むタップ候補(`tap-moved` の分類に使う)。 */
  readonly candidate: TapCandidate | null;
  readonly cancelled: boolean;
  readonly upTimeStamp: number;
};

/**
 * 指が離れた・キャンセルされたが、スイングにならなかったときの理由を通知する(`tapReleaseReason`。分類は純関数側で、ここは入力を集めて渡すだけ)。
 * 押下の結果が記録されていない指(2 本目の指のスイング・無視された押下)と、理由が無い(マウス/ペン)ときは通知しない。
 */
function reportIgnored(event: PointerEvent<HTMLElement>, ended: EndedFinger, options: UsePointerInputOptions): void {
  if (ended.kind === undefined) {
    return;
  }
  const reason = tapReleaseReason({
    pointerType: event.pointerType,
    cancelled: ended.cancelled,
    held: ended.kind === "skip",
    tapCandidate: ended.candidate !== null,
    downTimeStamp: ended.candidate?.downTimeStamp ?? ended.upTimeStamp,
    upTimeStamp: ended.upTimeStamp,
    movedPx: ended.candidate?.movedPx ?? 0,
    holding: options.holding,
    enabled: options.enabled,
  });
  if (reason !== null) {
    options.onIgnored(reason);
  }
}

/** pointerdown。`routeStagePointer` の結果だけで振り分ける。 */
function handleDown(event: PointerEvent<HTMLElement>, refs: GestureRefs, options: UsePointerInputOptions): void {
  const action = routeStagePointer({
    holding: options.holding,
    enabled: options.enabled,
    swingReady: options.swingReady,
    pointerType: event.pointerType,
    isPrimary: event.isPrimary,
    button: event.button,
  });
  switch (action) {
    case "skip":
      refs.held.current = event.pointerId;
      refs.fingers.current.set(event.pointerId, "skip");
      options.onSkip();
      break;
    case "swing":
      followPointer(event, options);
      options.onSwing(swingOriginOf(event), undefined, MOUSE_DETAIL);
      break;
    case "swing-here":
      options.onSwing(swingOriginOf(event), undefined, SECOND_FINGER_DETAIL);
      break;
    case "drag-start":
      refs.fingers.current.set(event.pointerId, "drag");
      // タップ候補(と到達通知の保留)を先に記録する。`startDrag` 内の `setPointerCapture` が例外を投げても、ドラッグ状態とタップ候補が食い違わない
      // (ドラッグだけ記録されてタップ候補が無い、という状態にならない)。
      startTapCandidate(event, refs, options);
      startDrag(event, refs, options);
      break;
    case "ignore":
      break;
  }
}

/** pointermove。`routeStageMove` の結果だけで振り分ける。 */
function handleMove(event: PointerEvent<HTMLElement>, refs: GestureRefs, options: UsePointerInputOptions): void {
  const drag = refs.drag.current;
  const action = routeStageMove({
    holding: options.holding,
    enabled: options.enabled,
    pointerType: event.pointerType,
    dragging: drag !== null && drag.pointerId === event.pointerId,
    held: drag === null && refs.held.current === event.pointerId,
  });
  switch (action) {
    case "follow":
      followPointer(event, options);
      break;
    case "drag":
      if (drag !== null) {
        dragCursor(event, drag, options);
        trackTapMovement(event, refs, options);
      }
      break;
    case "drag-start":
      refs.held.current = null;
      startDrag(event, refs, options);
      break;
    case "ignore":
      break;
  }
}

/**
 * pointerup。`routeStageRelease` の結果で、押下時点のカーソル位置でのタップのスイングを出す。
 * スイングを**先に**出し、そのあとで必ず到達通知の保留を解く(スイングが出ていれば `flight` が `null` になり、通知は送られない)。
 */
function handleUp(event: PointerEvent<HTMLElement>, refs: GestureRefs, options: UsePointerInputOptions): void {
  const candidate = refs.tap.current;
  const tap = candidate !== null && candidate.pointerId === event.pointerId ? candidate : null;
  const upTimeStamp = event.nativeEvent.timeStamp;
  const action = routeStageRelease({
    pointerType: event.pointerType,
    tapCandidate: tap !== null,
    tapOk: tap !== null && isTapGesture({ downTimeStamp: tap.downTimeStamp, upTimeStamp, movedPx: tap.movedPx }),
    holding: options.holding,
    enabled: options.enabled,
  });
  if (action === "swing-here" && tap !== null) {
    const detail: SwingDetail = { source: "tap", tapHoldMs: upTimeStamp - tap.downTimeStamp, tapMovePx: tap.movedPx, fingerTravelPx: tap.movedPx };
    options.onSwing({ timeStamp: tap.downTimeStamp, sourceTimeStamp: upTimeStamp, inputKind: "touch" }, tap.cursorAtDown, detail);
  }
  if (action === "none") {
    reportIgnored(event, endedFingerOf(event, refs, tap, false), options);
  }
  if (tap !== null) {
    refs.tap.current = null;
    options.releaseArrival();
  }
  endPointer(event, refs);
}

/** 離し・キャンセルされる指の記録(押下の結果とタップ候補。移動で取り消されたものも含む)をまとめる。 */
function endedFingerOf(event: PointerEvent<HTMLElement>, refs: GestureRefs, tap: TapCandidate | null, cancelled: boolean): EndedFinger {
  const abandoned = refs.abandoned.current;
  return {
    kind: refs.fingers.current.get(event.pointerId),
    candidate: tap ?? (abandoned?.pointerId === event.pointerId ? abandoned : null),
    cancelled,
    upTimeStamp: event.nativeEvent.timeStamp,
  };
}

/** pointercancel。スイングは出さず、タップ候補を捨てて到達通知の保留を解く。押下の結果を持つ指なら、キャンセルと理由を通知する(記録用)。 */
function handleCancel(event: PointerEvent<HTMLElement>, refs: GestureRefs, options: UsePointerInputOptions): void {
  const candidate = refs.tap.current;
  const tap = candidate !== null && candidate.pointerId === event.pointerId ? candidate : null;
  const ended = endedFingerOf(event, refs, tap, true);
  if (ended.kind !== undefined) {
    options.onPointerCancel();
    reportIgnored(event, ended, options);
  }
  if (tap !== null) {
    refs.tap.current = null;
    options.releaseArrival();
  }
  endPointer(event, refs);
}

/**
 * ステージの入力面のポインタ操作。pointerdown/move/up は `routeStagePointer`/`routeStageMove`/`routeStageRelease` の結果だけで振り分ける
 * (`holding` はそれらに渡すだけで、ここでは直接分岐しない)。
 * - マウス/ペン: 動かすとカーソルが追従し、押すとその位置で即スイング。
 * - タッチ: 1 本目の指は相対ドラッグでカーソルを動かす。移動 ≤10px かつ ≤180ms のタップは、押下時点のカーソル位置でスイング(離したときに発火)。
 *   2 本目以降の指は、カーソルを動かさず現在の位置で即スイング。演出中に置いた指は、演出が終わった後の最初の move でドラッグを始める。
 * タップ候補の指がある間は到達通知を保留し(`holdArrivalFor`)、離す・キャンセル・10px 超の移動・unmount で解く(`releaseArrival`)。
 * ハンドラは毎レンダーで作り直されるので、クロージャは常に最新の props を見る。ジェスチャの状態は ref に持つ(再レンダーを起こさない)。
 */
export function usePointerInput(options: UsePointerInputOptions): PointerHandlers {
  const latest = useLatest(options);
  const drag = useRef<DragState | null>(null);
  const tap = useRef<TapCandidate | null>(null);
  const held = useRef<number | null>(null);
  const fingers = useRef<Map<number, FingerKind>>(new Map());
  const abandoned = useRef<TapCandidate | null>(null);
  const refs: GestureRefs = { drag, tap, held, fingers, abandoned };

  // unmount でタップ候補を捨て、保留中の到達通知を解く(指を離すイベントが届かないまま画面が消えても試合が止まらないように)。
  useEffect(
    () => () => {
      drag.current = null;
      tap.current = null;
      held.current = null;
      abandoned.current = null;
      fingers.current.clear();
      latest.current.releaseArrival();
    },
    [latest, drag, tap, held, fingers, abandoned],
  );

  return {
    onPointerDown: (event) => handleDown(event, refs, options),
    onPointerMove: (event) => handleMove(event, refs, options),
    onPointerUp: (event) => handleUp(event, refs, options),
    onPointerCancel: (event) => handleCancel(event, refs, options),
  };
}
