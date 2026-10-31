import { describe, expect, it } from "vitest";
import { WORLD_PARAMS } from "../world/space/params";
import { CHARACTER_SLOTS } from "./look";
import { framingScaleAt, framingScaleOf } from "./framing-scale";

const BLENDS = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
const ALWAYS_ONE = CHARACTER_SLOTS.filter((slot) => slot !== "batter" && slot !== "pitcher");

describe("framingScaleAt", () => {
  it("cameraBlend = 0 では打者 0.70・投手 1.30(構図の倍率)", () => {
    expect(framingScaleAt("batter", 0)).toBeCloseTo(WORLD_PARAMS.actors.framingScale.batter, 12);
    expect(framingScaleAt("pitcher", 0)).toBeCloseTo(WORLD_PARAMS.actors.framingScale.pitcher, 12);
    expect(framingScaleOf("batter")).toBeCloseTo(0.7, 12);
    expect(framingScaleOf("pitcher")).toBeCloseTo(1.3, 12);
  });

  it("cameraBlend = 1 では全 14 スロットが 1.0", () => {
    expect(CHARACTER_SLOTS.map((slot) => framingScaleAt(slot, 1))).toEqual(CHARACTER_SLOTS.map(() => 1));
  });

  it("走者・野手・捕手は cameraBlend によらず常に 1.0", () => {
    const values = ALWAYS_ONE.flatMap((slot) => BLENDS.map((blend) => framingScaleAt(slot, blend)));
    expect(ALWAYS_ONE).toHaveLength(12);
    expect(values.every((value) => Object.is(value, 1))).toBe(true);
  });

  it("打者・投手は cameraBlend に対して連続で単調に 1.0 へ近づく", () => {
    const step = 0.001;
    const steps = Array.from({ length: 1001 }, (_, index) => index * step);
    for (const slot of ["batter", "pitcher"] as const) {
      const values = steps.map((blend) => framingScaleAt(slot, blend));
      const jumps = values.slice(1).map((value, index) => Math.abs(value - (values.at(index) ?? value)));
      expect(Math.max(...jumps)).toBeLessThan(0.001);
      const distances = values.map((value) => Math.abs(value - 1));
      expect(distances.slice(1).every((distance, index) => distance <= (distances.at(index) ?? 0) + 1e-12)).toBe(true);
    }
  });

  it("中間値は線形補間(打者 blend 0.5 = 0.85・投手 blend 0.5 = 1.15)", () => {
    expect(framingScaleAt("batter", 0.5)).toBeCloseTo(0.85, 12);
    expect(framingScaleAt("pitcher", 0.5)).toBeCloseTo(1.15, 12);
  });

  it("範囲外・非有限の cameraBlend は 0〜1 に丸める(NaN は構図の倍率のまま)", () => {
    expect(framingScaleAt("batter", -3)).toBeCloseTo(0.7, 12);
    expect(framingScaleAt("batter", 5)).toBeCloseTo(1, 12);
    expect(framingScaleAt("pitcher", Number.NaN)).toBeCloseTo(1.3, 12);
  });
});
