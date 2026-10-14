import type { ZonePoint } from "../../../types/common";
import type { ScreenRect } from "../../../types/stage";
import { BATTING_PARAMS } from "../../batting/params";
import { clamp } from "../../pitch/zone";
import { WORLD_PARAMS } from "./params";

// スイングカーソルの可動範囲(純関数)。ゾーン座標の ±`cursorLimit` に加えて、カーソルの中心が画面の外・下のオーバーレイの下に隠れないようにする。
// 縦長ではゾーンが右寄りになり、ゾーン座標の +1.8 が画面の外(390×844 の打撃で x≈408px)になるため(P19)。

/** 値域 `[low, high]`。 */
type Range = { readonly low: number; readonly high: number };

/** `low > high`(画面が狭すぎて範囲が空)のときは中点 1 点に潰す。 */
function nonEmpty(range: Range): Range {
  if (range.low <= range.high) {
    return range;
  }
  const middle = (range.low + range.high) / 2;
  return { low: middle, high: middle };
}

/** 画面の左右 `[margin, viewWidthPx − margin]` に入るゾーン x の範囲(`±cursorLimit` との共通部分)。 */
function horizontalRange(zoneRect: ScreenRect, viewWidthPx: number, margin: number): Range {
  const limit = BATTING_PARAMS.cursorLimit;
  const half = zoneRect.width / 2;
  const center = zoneRect.left + half;
  return nonEmpty({
    low: Math.max(-limit, (margin - center) / half),
    high: Math.min(limit, (viewWidthPx - margin - center) / half),
  });
}

/**
 * 空き領域の下端(`freeBottomPx`)から `margin` 内側までに入るゾーン y の範囲(上側は `cursorLimit`)。
 * ゾーン枠の下端(y = −1)には必ず届くようにする(構図の式は枠の下端を空き領域の下端より上に収めるので、通常は影響しない)。
 */
function verticalRange(zoneRect: ScreenRect, freeBottomPx: number | null, margin: number): Range {
  const limit = BATTING_PARAMS.cursorLimit;
  if (freeBottomPx === null || !Number.isFinite(freeBottomPx)) {
    return { low: -limit, high: limit };
  }
  const half = zoneRect.height / 2;
  const center = zoneRect.top + half;
  const lowest = (center - (freeBottomPx - margin)) / half;
  return { low: clamp(Math.min(lowest, -1), -limit, limit), high: limit };
}

/**
 * カーソルの中心を可動範囲に収める。
 * - 左右: ゾーン座標の ±`cursorLimit` と「画面の左右端から `edgeMarginPx` 内側」の狭い方(390×844 の打撃で右端は +1.46 付近、左は −1.8)。
 * - 下: `freeBottomPx`(空き領域の下端。`zoneRect` と同じ座標系の CSS px)があれば、その `edgeMarginPx` 内側まで(ゾーン枠の下端 y = −1 には届く)。
 *   省略・`null` は下の制限なし(±`cursorLimit` のみ)。上は ±`cursorLimit` のみ。
 * 範囲内の入力は変えない。ゾーン矩形が潰れている・画面幅が正でないときは ±`cursorLimit` だけを適用する。
 */
export function clampCursorToView(point: ZonePoint, zoneRect: ScreenRect, viewWidthPx: number, freeBottomPx: number | null = null): ZonePoint {
  const limit = BATTING_PARAMS.cursorLimit;
  if (zoneRect.width <= 0 || zoneRect.height <= 0 || !Number.isFinite(viewWidthPx) || viewWidthPx <= 0) {
    return { x: clamp(point.x, -limit, limit), y: clamp(point.y, -limit, limit) };
  }
  const margin = WORLD_PARAMS.input.edgeMarginPx;
  const horizontal = horizontalRange(zoneRect, viewWidthPx, margin);
  const vertical = verticalRange(zoneRect, freeBottomPx, margin);
  return { x: clamp(point.x, horizontal.low, horizontal.high), y: clamp(point.y, vertical.low, vertical.high) };
}
