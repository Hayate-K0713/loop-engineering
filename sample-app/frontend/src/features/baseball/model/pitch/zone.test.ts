import { describe, expect, it } from "vitest";
import type { CourseCell } from "../../types/pitch";
import { ALL_CELLS, cellToPoint, clamp, isStrike, isStrikeCell, RING_CELLS, ZONE_CELLS } from "./zone";

const cellKey = (cell: CourseCell): string => `${cell.col}-${cell.row}`;

describe("cellToPoint", () => {
  it("中央 (2,2) は原点", () => {
    const point = cellToPoint({ col: 2, row: 2 });
    expect(point.x).toBeCloseTo(0, 12);
    expect(point.y).toBeCloseTo(0, 12);
  });

  it("(1,1) は左上寄り (-2/3, +2/3)", () => {
    const point = cellToPoint({ col: 1, row: 1 });
    expect(point.x).toBeCloseTo(-2 / 3, 12);
    expect(point.y).toBeCloseTo(2 / 3, 12);
  });

  it("(0,0) は左上隅 (-4/3, +4/3)", () => {
    const point = cellToPoint({ col: 0, row: 0 });
    expect(point.x).toBeCloseTo(-4 / 3, 12);
    expect(point.y).toBeCloseTo(4 / 3, 12);
  });

  it("(4,4) は右下隅 (+4/3, -4/3)。col が増えると x が増え、row が増えると y が減る", () => {
    const point = cellToPoint({ col: 4, row: 4 });
    expect(point.x).toBeCloseTo(4 / 3, 12);
    expect(point.y).toBeCloseTo(-4 / 3, 12);
  });

  it("隣り合うセルの中心は 2/3 離れている", () => {
    const origin = cellToPoint({ col: 2, row: 2 });
    expect(cellToPoint({ col: 3, row: 2 }).x - origin.x).toBeCloseTo(2 / 3, 12);
    expect(origin.y - cellToPoint({ col: 2, row: 3 }).y).toBeCloseTo(2 / 3, 12);
  });
});

describe("isStrike", () => {
  it("境界 (1,1) は真", () => {
    expect(isStrike({ x: 1, y: 1 })).toBe(true);
    expect(isStrike({ x: -1, y: -1 })).toBe(true);
  });

  it("(1.0001, 0) は偽", () => {
    expect(isStrike({ x: 1.0001, y: 0 })).toBe(false);
    expect(isStrike({ x: 0, y: -1.0001 })).toBe(false);
  });

  it("原点は真", () => {
    expect(isStrike({ x: 0, y: 0 })).toBe(true);
  });
});

describe("セル定数と isStrikeCell", () => {
  it("ALL_CELLS は 25 セルで重複がない", () => {
    expect(ALL_CELLS).toHaveLength(25);
    expect(new Set(ALL_CELLS.map(cellKey)).size).toBe(25);
  });

  it("isStrikeCell は 25 セル中ちょうど 9 が真", () => {
    expect(ALL_CELLS.filter(isStrikeCell)).toHaveLength(9);
  });

  it("ZONE_CELLS は 9 セルで全て中央 3×3、RING_CELLS は 16 セルで全て外周", () => {
    expect(ZONE_CELLS).toHaveLength(9);
    expect(RING_CELLS).toHaveLength(16);
    expect(ZONE_CELLS.every(isStrikeCell)).toBe(true);
    expect(RING_CELLS.some(isStrikeCell)).toBe(false);
  });

  it("ZONE_CELLS と RING_CELLS で ALL_CELLS を過不足なく分け合う", () => {
    const union = new Set([...ZONE_CELLS, ...RING_CELLS].map(cellKey));
    expect(union).toEqual(new Set(ALL_CELLS.map(cellKey)));
  });

  it("セル中心の座標がストライクかどうかは isStrikeCell と一致する", () => {
    expect(ALL_CELLS.every((cell) => isStrike(cellToPoint(cell)) === isStrikeCell(cell))).toBe(true);
  });
});

describe("clamp", () => {
  it("範囲内はそのまま、範囲外は境界に収める", () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(-3, 0, 1)).toBe(0);
    expect(clamp(7, 0, 1)).toBe(1);
    expect(clamp(-5, -2, 2)).toBe(-2);
  });
});
