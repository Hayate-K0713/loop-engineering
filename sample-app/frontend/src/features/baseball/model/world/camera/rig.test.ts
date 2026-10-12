import { describe, expect, it } from "vitest";
import type { CameraPose, Vec3 } from "../../../types/scene";
import { WORLD_PARAMS } from "../space/params";
import { battingCamera, blendCamera, chaseBlendAt, chaseCamera, easeInOut } from "./rig";

const CHASE = WORLD_PARAMS.chaseCamera;
const BALLS: readonly Vec3[] = [
  { x: 0, y: 0.72, z: -0.2 },
  { x: 9, y: 0, z: -62 },
  { x: -34, y: 14, z: -120 },
  { x: 20, y: 30, z: 15 },
];

function distanceBetween(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

describe("battingCamera", () => {
  it("モックの値 (0, 1.25, 3.4) / (0, 1.0, −18) / 34° に一致する", () => {
    expect(battingCamera()).toEqual({
      position: { x: 0, y: 1.25, z: 3.4 },
      target: { x: 0, y: 1.0, z: -18 },
      fovDeg: 34,
    });
  });

  it("呼び出しごとに同じ値", () => {
    expect(battingCamera()).toEqual(battingCamera());
  });
});

describe("chaseCamera", () => {
  it.each(BALLS)("WORLD_PARAMS の係数から計算した位置・注視点に一致する (%o)", (ball) => {
    const pose = chaseCamera(ball);
    expect(pose.position.x).toBeCloseTo(ball.x * CHASE.kx, 12);
    expect(pose.position.y).toBeCloseTo(CHASE.baseY + ball.y * CHASE.ky, 12);
    expect(pose.position.z).toBeCloseTo(CHASE.baseZ + ball.z * CHASE.kz, 12);
    expect(pose.target.x).toBe(ball.x);
    expect(pose.target.y).toBeCloseTo(Math.max(0, ball.y * CHASE.kLook), 12);
    expect(pose.target.z).toBe(ball.z);
    expect(pose.fovDeg).toBe(CHASE.fovDeg);
  });

  it("注視点の高さは負にならない", () => {
    expect(chaseCamera({ x: 0, y: -3, z: -10 }).target.y).toBe(0);
  });

  it("入力を変更しない", () => {
    const ball = { x: 1, y: 2, z: -3 };
    chaseCamera(ball);
    expect(ball).toEqual({ x: 1, y: 2, z: -3 });
  });
});

describe("easeInOut", () => {
  it("端点と中点、範囲外はクランプ", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBe(0.5);
    expect(easeInOut(-1)).toBe(0);
    expect(easeInOut(2)).toBe(1);
  });

  it("単調非減少", () => {
    const values = Array.from({ length: 101 }, (_, i) => easeInOut(i / 100));
    expect(values.every((value, i) => i === 0 || value >= (values.at(i - 1) ?? 0))).toBe(true);
  });
});

describe("blendCamera", () => {
  const a = battingCamera();
  const b: CameraPose = chaseCamera({ x: 9, y: 0, z: -62 });

  it("k = 0 で a、k = 1 で b に厳密一致する", () => {
    expect(blendCamera(a, b, 0)).toEqual(a);
    expect(blendCamera(a, b, 1)).toEqual(b);
  });

  it("k について、a からの距離が単調非減少", () => {
    const distances = Array.from({ length: 21 }, (_, i) => distanceBetween(blendCamera(a, b, i / 20).position, a.position));
    expect(distances.every((distance, i) => i === 0 || distance >= (distances.at(i - 1) ?? 0))).toBe(true);
  });

  it("注視点の割合 targetK を別に指定でき、省略時は k と同じ", () => {
    expect(blendCamera(a, b, 0.4)).toEqual(blendCamera(a, b, 0.4, 0.4));
    const split = blendCamera(a, b, 0, 1);
    expect(split.position).toEqual(a.position);
    expect(split.target).toEqual(b.target);
  });

  it("入力を変更しない", () => {
    const before = structuredClone(a);
    blendCamera(a, b, 0.5);
    expect(a).toEqual(before);
  });
});

describe("chaseBlendAt", () => {
  it("接触時は 0、位置の blend 時間後は位置 1、注視点の blend 時間後は注視点 1", () => {
    expect(chaseBlendAt(0)).toEqual({ position: 0, target: 0 });
    expect(chaseBlendAt(CHASE.positionBlendMs).position).toBe(1);
    expect(chaseBlendAt(CHASE.targetBlendMs).target).toBe(1);
    expect(chaseBlendAt(CHASE.positionBlendMs * 4)).toEqual({ position: 1, target: 1 });
  });

  it("注視点は位置より先に移り(blend 時間が短い)、接触前は 0", () => {
    const sample = Math.min(CHASE.targetBlendMs, CHASE.positionBlendMs) / 2;
    expect(chaseBlendAt(sample).target).toBeGreaterThanOrEqual(chaseBlendAt(sample).position);
    expect(chaseBlendAt(-100)).toEqual({ position: 0, target: 0 });
  });

  it("時刻について単調非減少", () => {
    const positions = Array.from({ length: 60 }, (_, i) => chaseBlendAt(i * 16).position);
    expect(positions.every((value, i) => i === 0 || value >= (positions.at(i - 1) ?? 0))).toBe(true);
  });
});
