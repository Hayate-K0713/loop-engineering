import type { PointerEvent, PointerEventHandler, RefObject } from "react";
import { clampCursor, clientToZonePoint } from "../model/batting/cursor";
import type { ZonePoint } from "../types/common";

/** `StrikeZoneSvg` のポインタ4ハンドラ(そのまま props に展開できる形)。 */
export type PointerHandlers = {
  readonly onPointerDown: PointerEventHandler<SVGSVGElement>;
  readonly onPointerMove: PointerEventHandler<SVGSVGElement>;
  readonly onPointerUp: PointerEventHandler<SVGSVGElement>;
  readonly onPointerCancel: PointerEventHandler<SVGSVGElement>;
};

type UsePointerInputOptions = {
  /** 人間打撃時のみ真。偽の間はポインタ入力を無視する。 */
  readonly enabled: boolean;
  readonly svgRef: RefObject<SVGSVGElement | null>;
  /** カーソルをゾーン座標へ移動する(ref と SVG 属性の更新)。 */
  readonly moveCursorTo: (point: ZonePoint) => void;
  /** 現在のカーソル位置でスイングする(`swingReady` の判定は呼び出し先が行う)。 */
  readonly onSwing: () => void;
};

/** ポインタ位置をゾーン座標へ変換する。変換は `clientToZonePoint` → `clampCursor` の順(前者は ±viewHalfExtent、後者は ±cursorLimit に収める)。 */
function toCursorPoint(svg: SVGSVGElement | null, event: PointerEvent<SVGSVGElement>): ZonePoint | null {
  if (svg === null) {
    return null;
  }
  return clampCursor(clientToZonePoint({ x: event.clientX, y: event.clientY }, svg.getBoundingClientRect()));
}

function releaseCapture(event: PointerEvent<SVGSVGElement>): void {
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
}

/**
 * ゾーン SVG のポインタ操作。
 * マウス/ペン: 移動でカーソルを追従、primary の pointerdown でその位置へ移動して即スイング。
 * タッチ: ドラッグ(`setPointerCapture`)でカーソルを動かすだけで、スイングはしない(「スイング」ボタンで振る)。
 * ハンドラは毎レンダーで作り直されるので、クロージャは常に最新の props を見る。
 */
export function usePointerInput({ enabled, svgRef, moveCursorTo, onSwing }: UsePointerInputOptions): PointerHandlers {
  const followPointer = (event: PointerEvent<SVGSVGElement>): void => {
    const point = toCursorPoint(svgRef.current, event);
    if (point !== null) {
      moveCursorTo(point);
    }
  };

  const onPointerMove: PointerEventHandler<SVGSVGElement> = (event) => {
    if (enabled) {
      followPointer(event);
    }
  };

  const onPointerDown: PointerEventHandler<SVGSVGElement> = (event) => {
    if (!enabled) {
      return;
    }
    followPointer(event);
    if (event.pointerType === "touch") {
      event.currentTarget.setPointerCapture(event.pointerId);
    } else if (event.isPrimary && event.button === 0) {
      onSwing();
    }
  };

  return { onPointerDown, onPointerMove, onPointerUp: releaseCapture, onPointerCancel: releaseCapture };
}
