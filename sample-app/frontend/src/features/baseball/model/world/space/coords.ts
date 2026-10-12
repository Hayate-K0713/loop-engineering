import type { ZonePoint } from "../../../types/common";
import type { CourseCell } from "../../../types/pitch";
import type { Vec3 } from "../../../types/scene";
import type { ScreenRect } from "../../../types/stage";
import { cellToPoint } from "../../pitch/zone";
import { WORLD_PARAMS } from "./params";

// ゾーン座標([-1, 1]²)・グリッドのセル・落下点(フィールド図の座標)とワールド座標(m)の変換。

const { halfWidth, bottom, top, planeZ } = WORLD_PARAMS.zone;

/** ゾーン中心の高さ(m)。 */
export const ZONE_CENTER_Y = (top + bottom) / 2;

/** ゾーンの半高(m)。 */
export const ZONE_HALF_HEIGHT = (top - bottom) / 2;

/** ゾーン座標をワールドの点へ変換する(ゾーン平面上。±1 を超える外挿も線形)。 */
export function zoneToWorld(point: ZonePoint): Vec3 {
  return { x: point.x * halfWidth, y: ZONE_CENTER_Y + point.y * ZONE_HALF_HEIGHT, z: planeZ };
}

/** ワールドの点をゾーン平面へ射影して、ゾーン座標へ戻す(`zoneToWorld` の逆写像。z は無視する)。 */
export function worldToZone(point: Vec3): ZonePoint {
  return { x: point.x / halfWidth, y: (point.y - ZONE_CENTER_Y) / ZONE_HALF_HEIGHT };
}

/** 5×5 グリッドのセル中心のワールド座標。 */
export function cellToWorld(cell: CourseCell): Vec3 {
  return zoneToWorld(cellToPoint(cell));
}

/** フィールド図の落下点(原点 = 本塁、y = センター方向)をワールドの地面の点へ変換する(`(x, 0, −y)`)。 */
export function landingToWorld(landing: { readonly x: number; readonly y: number }): Vec3 {
  // `-y` だと y = 0 のとき -0 になるため、0 から引く。
  return { x: landing.x, y: 0, z: 0 - landing.y };
}

/**
 * 画面上の移動量(CSS px)を、ゾーン座標の差分へ変換する。ゾーン枠の画面矩形の幅・高さが ±1(= 2)に対応し、
 * `dy` は下向きが正なのでゾーンの y(上が正)は符号を反転する。矩形が潰れているときは 0 を返す。
 */
export function zoneDeltaFromScreenDelta(dx: number, dy: number, rect: ScreenRect): ZonePoint {
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: 0, y: 0 };
  }
  return { x: (dx / rect.width) * 2, y: ((0 - dy) / rect.height) * 2 };
}
