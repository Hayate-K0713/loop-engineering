import type { GridIndex, ZonePoint } from "../../types/common";
import type { CourseCell } from "../../types/pitch";
import { PITCH_PARAMS } from "./params";

// ゾーン座標: ストライクゾーンを [-1, 1]² に正規化する。5×5 グリッドの 1 セルの幅は 2/3、y は上が正。
// 中央 3×3(col・row とも 1〜3)がストライクで、外周 16 セルがボール球。

const CELL_WIDTH = 2 / 3;
const CENTER_INDEX = 2;
const GRID_INDICES: readonly GridIndex[] = [0, 1, 2, 3, 4];

/** `value` を [min, max] に収める。 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** セルの中心をゾーン座標へ変換する(row 0 が上段 = y 正、col 0 が打者視点で左 = x 負)。 */
export function cellToPoint(cell: CourseCell): ZonePoint {
  return {
    x: (cell.col - CENTER_INDEX) * CELL_WIDTH,
    y: (CENTER_INDEX - cell.row) * CELL_WIDTH,
  };
}

/** 着弾点がストライクゾーン内か(境界を含む)。 */
export function isStrike(point: ZonePoint): boolean {
  return Math.abs(point.x) <= PITCH_PARAMS.zoneHalf && Math.abs(point.y) <= PITCH_PARAMS.zoneHalf;
}

/** セルが中央 3×3(ストライクゾーン内)か。 */
export function isStrikeCell(cell: CourseCell): boolean {
  return cell.col >= 1 && cell.col <= 3 && cell.row >= 1 && cell.row <= 3;
}

/** 25 セル全て(row の昇順、各 row 内は col の昇順)。 */
export const ALL_CELLS: readonly CourseCell[] = GRID_INDICES.flatMap((row) => GRID_INDICES.map((col) => ({ col, row })));

/** ストライクゾーン内の 9 セル。 */
export const ZONE_CELLS: readonly CourseCell[] = ALL_CELLS.filter(isStrikeCell);

/** ゾーン外周の 16 セル。 */
export const RING_CELLS: readonly CourseCell[] = ALL_CELLS.filter((cell) => !isStrikeCell(cell));
