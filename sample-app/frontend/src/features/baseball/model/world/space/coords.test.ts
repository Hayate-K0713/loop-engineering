import { describe, expect, it } from "vitest";
import type { ZonePoint } from "../../../types/common";
import type { ScreenRect } from "../../../types/stage";
import { cellToWorld, landingToWorld, worldToZone, zoneDeltaFromScreenDelta, zoneToWorld } from "./coords";

// ゾーン実寸(0.26 / 0.42 / 1.02 / 0.03)はステップ G でも変更しないため、リテラルで固定してよい。

const GRID_STEPS: readonly number[] = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2];
const GRID_POINTS: readonly ZonePoint[] = GRID_STEPS.flatMap((x) => GRID_STEPS.map((y): ZonePoint => ({ x, y })));

describe("zoneToWorld", () => {
  it("原点はゾーン中心 (0, 0.72, 0.03)", () => {
    const world = zoneToWorld({ x: 0, y: 0 });
    expect(world.x).toBeCloseTo(0, 12);
    expect(world.y).toBeCloseTo(0.72, 12);
    expect(world.z).toBeCloseTo(0.03, 12);
  });

  it("(±1, ±1) が枠の4隅 (±0.26, 0.42/1.02)", () => {
    expect(zoneToWorld({ x: 1, y: 1 }).x).toBeCloseTo(0.26, 12);
    expect(zoneToWorld({ x: -1, y: 1 }).x).toBeCloseTo(-0.26, 12);
    expect(zoneToWorld({ x: 1, y: 1 }).y).toBeCloseTo(1.02, 12);
    expect(zoneToWorld({ x: 1, y: -1 }).y).toBeCloseTo(0.42, 12);
  });

  it("ゾーン外(±2)も線形に外挿し、z は常にゾーン平面", () => {
    expect(zoneToWorld({ x: 2, y: 2 }).x).toBeCloseTo(0.52, 12);
    expect(zoneToWorld({ x: 2, y: 2 }).y).toBeCloseTo(1.32, 12);
    expect(GRID_POINTS.every((point) => zoneToWorld(point).z === zoneToWorld({ x: 0, y: 0 }).z)).toBe(true);
  });
});

describe("worldToZone", () => {
  it("±2 の格子点で zoneToWorld の逆写像になる(1e-9)", () => {
    for (const point of GRID_POINTS) {
      const back = worldToZone(zoneToWorld(point));
      expect(back.x).toBeCloseTo(point.x, 9);
      expect(back.y).toBeCloseTo(point.y, 9);
    }
  });

  it("z は無視する(ゾーン平面への射影)", () => {
    expect(worldToZone({ x: 0.13, y: 0.72, z: 123 })).toEqual(worldToZone({ x: 0.13, y: 0.72, z: -5 }));
  });
});

describe("cellToWorld", () => {
  it("中央セル {2, 2} はゾーン中心", () => {
    const world = cellToWorld({ col: 2, row: 2 });
    expect(world.x).toBeCloseTo(0, 12);
    expect(world.y).toBeCloseTo(0.72, 12);
  });

  it("{0, 0} は左上の遠隅 (−0.347, 1.12)", () => {
    const world = cellToWorld({ col: 0, row: 0 });
    expect(world.x).toBeCloseTo(-0.3467, 4);
    expect(world.y).toBeCloseTo(1.12, 12);
  });

  it("col が増えると x が増え、row が増えると y が減る", () => {
    expect(cellToWorld({ col: 3, row: 2 }).x).toBeGreaterThan(cellToWorld({ col: 2, row: 2 }).x);
    expect(cellToWorld({ col: 2, row: 3 }).y).toBeLessThan(cellToWorld({ col: 2, row: 2 }).y);
  });
});

describe("landingToWorld", () => {
  it("(x, y) → (x, 0, −y)", () => {
    expect(landingToWorld({ x: 10, y: 50 })).toEqual({ x: 10, y: 0, z: -50 });
    expect(landingToWorld({ x: -34, y: 120 })).toEqual({ x: -34, y: 0, z: -120 });
  });

  it("y = 0 でも z は +0(−0 にならない)", () => {
    expect(Object.is(landingToWorld({ x: 1, y: 0 }).z, 0)).toBe(true);
  });
});

describe("zoneDeltaFromScreenDelta", () => {
  const rect: ScreenRect = { left: 100, top: 50, width: 80, height: 120 };

  it("矩形の幅だけ右へ動くと x が +2、高さだけ下へ動くと y が −2", () => {
    expect(zoneDeltaFromScreenDelta(rect.width, 0, rect)).toEqual({ x: 2, y: 0 });
    expect(zoneDeltaFromScreenDelta(0, rect.height, rect)).toEqual({ x: 0, y: -2 });
  });

  it("移動なしは (0, 0)、半分の移動は半分の差分", () => {
    expect(zoneDeltaFromScreenDelta(0, 0, rect)).toEqual({ x: 0, y: 0 });
    expect(zoneDeltaFromScreenDelta(-rect.width / 2, -rect.height / 2, rect)).toEqual({ x: -1, y: 1 });
  });

  it("矩形が潰れているときは (0, 0)", () => {
    expect(zoneDeltaFromScreenDelta(10, 10, { left: 0, top: 0, width: 0, height: 100 })).toEqual({ x: 0, y: 0 });
    expect(zoneDeltaFromScreenDelta(10, 10, { left: 0, top: 0, width: 100, height: 0 })).toEqual({ x: 0, y: 0 });
  });
});
