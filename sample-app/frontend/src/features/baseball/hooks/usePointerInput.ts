import { useRef, type PointerEvent, type PointerEventHandler } from "react";
import { clampCursor } from "../model/batting/cursor";
import { routeStagePointer } from "../model/world/sequence/input-route";
import { zoneDeltaFromScreenDelta } from "../model/world/space/coords";
import type { ZonePoint } from "../types/common";
import type { ScreenRect } from "../types/stage";

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
  /** 演出中(`isHolding`)。pointerdown の振り分けは `routeStagePointer` に任せ、ここでは直接分岐しない。 */
  readonly holding: boolean;
  /** 人間がスイングできる(`GameView.swingReady`)。 */
  readonly swingReady: boolean;
  /** 演出のスキップ。 */
  readonly onSkip: () => void;
  /** 画面座標(client)→ゾーン座標。ゾーン平面に当たらなければ `null`(`useStage3d`)。 */
  readonly pickZone: (clientX: number, clientY: number) => ZonePoint | null;
  /** 打撃カメラでのゾーン枠の画面矩形(`useStage3d`)。タッチのドラッグ量の換算に使う。 */
  readonly getZoneRect: () => ScreenRect | null;
  /** 現在のカーソル位置。タッチのドラッグ開始時の位置の記録に使う。 */
  readonly getCursor: () => ZonePoint;
  /** カーソルをゾーン座標へ移動する(ref の更新)。 */
  readonly moveCursorTo: (point: ZonePoint) => void;
  /** 現在のカーソル位置でスイングする(`swingReady` の判定は呼び出し先が行う)。 */
  readonly onSwing: () => void;
};

/** タッチの相対ドラッグ。開始時の指の位置とカーソル位置を覚え、移動量だけカーソルを動かす。 */
type DragState = {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly startCursor: ZonePoint;
};

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

/**
 * ステージの入力面のポインタ操作。pointerdown は `routeStagePointer` の結果で振り分ける
 * (`skip` → スキップのみ / `swing` → カーソルをその位置へ移動して即スイング / `drag-start` → 相対ドラッグの開始 / `ignore` → 何もしない)。
 * pointermove: ドラッグ中ならタッチの相対移動、そうでなければ(人間打撃中の)マウス/ペンの絶対位置追従。タッチはドラッグ中以外では動かさない。
 * ハンドラは毎レンダーで作り直されるので、クロージャは常に最新の props を見る。ドラッグ状態は ref に持つ(再レンダーを起こさない)。
 */
export function usePointerInput(options: UsePointerInputOptions): PointerHandlers {
  const { enabled, holding, swingReady, onSkip, getCursor, onSwing } = options;
  const dragRef = useRef<DragState | null>(null);

  const onPointerDown: PointerEventHandler<HTMLElement> = (event) => {
    const action = routeStagePointer({
      holding,
      enabled,
      swingReady,
      pointerType: event.pointerType,
      isPrimary: event.isPrimary,
      button: event.button,
    });
    switch (action) {
      case "skip":
        onSkip();
        break;
      case "swing":
        followPointer(event, options);
        onSwing();
        break;
      case "drag-start":
        dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startCursor: getCursor() };
        event.currentTarget.setPointerCapture(event.pointerId);
        break;
      case "ignore":
        break;
    }
  };

  const onPointerMove: PointerEventHandler<HTMLElement> = (event) => {
    if (!enabled) {
      return;
    }
    const drag = dragRef.current;
    if (drag !== null) {
      if (drag.pointerId === event.pointerId) {
        dragCursor(event, drag, options);
      }
    } else if (event.pointerType !== "touch") {
      followPointer(event, options);
    }
  };

  const endDrag: PointerEventHandler<HTMLElement> = (event) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
    releaseCapture(event);
  };

  return { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag };
}
