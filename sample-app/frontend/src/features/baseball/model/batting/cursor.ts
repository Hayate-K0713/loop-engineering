import type { CursorRadii, SwingKind } from "../../types/batting";
import type { ZonePoint } from "../../types/common";
import type { BatterProfile } from "../../types/team";
import { PITCH_PARAMS } from "../pitch/params";
import { clamp } from "../pitch/zone";
import { BATTING_PARAMS } from "./params";

/** スイングカーソルの初期位置(ゾーン中心)。 */
export const INITIAL_CURSOR: ZonePoint = { x: 0, y: 0 };

/** カーソルの移動方向。各成分は押下状態に応じた -1 / 0 / 1(y は上が正)。 */
export type CursorDirection = {
  readonly x: number;
  readonly y: number;
};

/** クライアント座標(ポインタ位置)。 */
export type ClientPoint = {
  readonly x: number;
  readonly y: number;
};

/** SVG 要素などの矩形(`DOMRect` と構造的に互換)。 */
export type ViewRect = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

/** カーソル座標を ±`cursorLimit` に収める。 */
export function clampCursor(point: ZonePoint): ZonePoint {
  const limit = BATTING_PARAMS.cursorLimit;
  return { x: clamp(point.x, -limit, limit), y: clamp(point.y, -limit, limit) };
}

/** 押下方向 × `keyboardSpeed`(ゾーン単位/秒)× 経過時間(ms)だけカーソルを動かし、範囲内に収める。 */
export function moveCursor(cursor: ZonePoint, direction: CursorDirection, dtMs: number): ZonePoint {
  const step = (BATTING_PARAMS.keyboardSpeed * dtMs) / 1000;
  return clampCursor({ x: cursor.x + direction.x * step, y: cursor.y + direction.y * step });
}

/**
 * クライアント座標を、SVG 矩形に対するゾーン座標へ変換する(y は反転)。
 * 矩形の中心が (0, 0)、左上隅が (-viewHalfExtent, +viewHalfExtent)。矩形の外は ±`viewHalfExtent` にクランプする。
 * 幅・高さが 0 以下の矩形は中心扱い(ゼロ除算を避ける)。
 */
export function clientToZonePoint(client: ClientPoint, rect: ViewRect): ZonePoint {
  if (rect.width <= 0 || rect.height <= 0) {
    return INITIAL_CURSOR;
  }
  const half = PITCH_PARAMS.viewHalfExtent;
  const ratioX = (client.x - rect.left) / rect.width;
  const ratioY = (client.y - rect.top) / rect.height;
  return {
    x: clamp((ratioX - 0.5) * 2 * half, -half, half),
    y: clamp((0.5 - ratioY) * 2 * half, -half, half),
  };
}

/** 打者のスイングカーソル半径。強振は `powerScale` 倍。球種の打ちにくさ補正は判定時(contact.ts)に掛ける。 */
export function cursorRadii(batter: BatterProfile, kind: SwingKind): CursorRadii {
  const rx = BATTING_PARAMS.meetBaseRx + BATTING_PARAMS.meetRxPerAbility * batter.meet;
  const scale = kind === "power" ? BATTING_PARAMS.powerScale : 1;
  return { rx: rx * scale, ry: rx * BATTING_PARAMS.aspect * scale };
}
