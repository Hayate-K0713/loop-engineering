import { describe, expect, it } from "vitest";
import type { PitchKind } from "../../../types/pitch";
import type { Rot3 } from "../../../types/scene";
import { WORLD_PARAMS } from "../space/params";
import { ballHaloAt, ballSpinAt } from "./ball-look";

const KINDS: readonly PitchKind[] = ["straight", "slider", "curve", "fork", "shoot"];

function magnitudeOf(rotation: Rot3): number {
  return Math.hypot(rotation.x, rotation.y, rotation.z);
}

describe("ballSpinAt", () => {
  it("t = 0 では回転しない", () => {
    for (const kind of KINDS) {
      expect(ballSpinAt(kind, 0)).toEqual({ x: 0, y: 0, z: 0 });
    }
  });

  it("球種ごとの角速度 × 経過秒(rad)になる", () => {
    for (const kind of KINDS) {
      const spin = WORLD_PARAMS.ball.spin[kind];
      const rotation = ballSpinAt(kind, 500);
      expect(rotation.x).toBeCloseTo(spin.x * 0.5, 9);
      expect(rotation.y).toBeCloseTo(spin.y * 0.5, 9);
      expect(rotation.z).toBeCloseTo(spin.z * 0.5, 9);
    }
  });

  it("経過時間に比例して増える(2 倍の時間で 2 倍)", () => {
    for (const kind of KINDS) {
      expect(magnitudeOf(ballSpinAt(kind, 800))).toBeCloseTo(magnitudeOf(ballSpinAt(kind, 400)) * 2, 9);
    }
  });

  it("球種ごとに回転が異なる(全ての組で別の値)", () => {
    const rotations = KINDS.map((kind) => JSON.stringify(ballSpinAt(kind, 500)));
    expect(new Set(rotations).size).toBe(KINDS.length);
  });

  it("フォークの回転が最小(他のどの球種より遅い)", () => {
    const fork = magnitudeOf(ballSpinAt("fork", 500));
    for (const kind of KINDS.filter((k) => k !== "fork")) {
      expect(magnitudeOf(ballSpinAt(kind, 500))).toBeGreaterThan(fork);
    }
  });

  it("負・有限でない経過時間は回転なし", () => {
    expect(ballSpinAt("curve", -100)).toEqual({ x: 0, y: 0, z: 0 });
    expect(ballSpinAt("curve", Number.NaN)).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe("ballHaloAt", () => {
  it("ハローは必須で、常に 0 より大きく 1 以下", () => {
    expect(ballHaloAt()).toBe(WORLD_PARAMS.ball.halo.opacity);
    expect(ballHaloAt()).toBeGreaterThan(0);
    expect(ballHaloAt()).toBeLessThanOrEqual(1);
  });
});
