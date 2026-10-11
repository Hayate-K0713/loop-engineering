import type { GridIndex, ZonePoint } from "./common";

export type PitchKind = "straight" | "slider" | "curve" | "fork" | "shoot";

/** 5×5 コースグリッドのセル。col 0 = 打者視点で左、row 0 = 上段。中央 3×3(1〜3)がストライク。 */
export type CourseCell = {
  readonly col: GridIndex;
  readonly row: GridIndex;
};

export type PitchCommand = {
  readonly kind: PitchKind;
  readonly cell: CourseCell;
};

/** 球種の仕様。`bend` は表示用の軌道の曲がり量で、判定には使わない。 */
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
};

/** ボールの表示位置(表示専用)。 */
export type BallPosition = {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
};
