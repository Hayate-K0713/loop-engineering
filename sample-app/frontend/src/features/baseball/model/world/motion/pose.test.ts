import { describe, expect, it } from "vitest";
import {
  applyEase,
  clamp01,
  lerpPose,
  lerpRot,
  mix,
  placeBatter,
  placeCharacter,
  sampleKeyframes,
  smoothstep,
  type BatterJoints,
  type JointPose,
  type Keyframes,
  type KeyframeEase,
  type PoseRoot,
} from "./pose";
import { grid } from "./test-helpers";

const ZERO = { x: 0, y: 0, z: 0 };
const POSE_A: JointPose = {
  torso: { x: 0.1, y: -0.2, z: 0.3 },
  head: ZERO,
  armL: { x: 1, y: 2, z: 3 },
  armR: { x: -1, y: -2, z: -3 },
  legL: { x: 0.7, y: 0, z: 0 },
  legR: { x: 0, y: 0.7, z: 0 },
};
const POSE_B: JointPose = {
  torso: { x: 0.5, y: 0.2, z: -0.3 },
  head: { x: 0.4, y: 0.4, z: 0.4 },
  armL: { x: -1, y: -2, z: -3 },
  armR: { x: 1, y: 2, z: 3 },
  legL: { x: -0.7, y: 0, z: 0 },
  legR: { x: 0, y: -0.7, z: 0 },
};
const EASES: readonly KeyframeEase[] = ["linear", "smooth", "in", "out"];

describe("clamp01 / mix / smoothstep", () => {
  it("clamp01 は 0〜1 に収め、NaN は 0", () => {
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(0.4)).toBeCloseTo(0.4, 12);
    expect(clamp01(7)).toBe(1);
    expect(clamp01(Number.NaN)).toBe(0);
  });

  it("mix は端点で厳密に a・b に一致する(浮動小数の誤差を出さない)", () => {
    expect(Object.is(mix(0.1, 0.7, 0), 0.1)).toBe(true);
    expect(Object.is(mix(0.1, 0.7, 1), 0.7)).toBe(true);
    expect(mix(-2, 4, 0.5)).toBeCloseTo(1, 12);
  });

  it("smoothstep は端点 0・1、中点 0.5 で、単調非減少", () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(0.5)).toBeCloseTo(0.5, 12);
    const values = grid(0, 1, 0.05).map(smoothstep);
    expect(values.every((value, index) => index === 0 || value >= (values.at(index - 1) ?? 0))).toBe(true);
  });
});

describe("applyEase", () => {
  it.each(EASES)("%s は 0 → 0、1 → 1 で、範囲外は端に収める", (ease) => {
    expect(applyEase(ease, 0)).toBe(0);
    expect(applyEase(ease, 1)).toBe(1);
    expect(applyEase(ease, -1)).toBe(0);
    expect(applyEase(ease, 2)).toBe(1);
  });

  it.each(EASES)("%s は 0〜1 で単調非減少", (ease) => {
    const values = grid(0, 1, 0.02).map((k) => applyEase(ease, k));
    expect(values.every((value, index) => index === 0 || value >= (values.at(index - 1) ?? 0))).toBe(true);
  });

  it("in は遅く始まり(0.5 → 0.25)、out は速く始まる(0.5 → 0.75)、linear は等速", () => {
    expect(applyEase("in", 0.5)).toBeCloseTo(0.25, 12);
    expect(applyEase("out", 0.5)).toBeCloseTo(0.75, 12);
    expect(applyEase("linear", 0.3)).toBeCloseTo(0.3, 12);
  });
});

describe("lerpRot / lerpPose", () => {
  it("lerpRot の端点と中点", () => {
    expect(lerpRot(POSE_A.torso, POSE_B.torso, 0)).toEqual(POSE_A.torso);
    expect(lerpRot(POSE_A.torso, POSE_B.torso, 1)).toEqual(POSE_B.torso);
    const mid = lerpRot(POSE_A.torso, POSE_B.torso, 0.5);
    expect(mid.x).toBeCloseTo(0.3, 12);
    expect(mid.y).toBeCloseTo(0, 12);
    expect(mid.z).toBeCloseTo(0, 12);
  });

  it("lerpPose(a, b, 0) は a、(a, b, 1) は b に全フィールド一致する", () => {
    expect(lerpPose(POSE_A, POSE_B, 0)).toEqual(POSE_A);
    expect(lerpPose(POSE_A, POSE_B, 1)).toEqual(POSE_B);
  });

  it("lerpPose の中点は6関節それぞれの中点", () => {
    const mid = lerpPose(POSE_A, POSE_B, 0.5);
    expect(mid.armL).toEqual({ x: 0, y: 0, z: 0 });
    expect(mid.armR).toEqual({ x: 0, y: 0, z: 0 });
    expect(mid.legL.x).toBeCloseTo(0, 12);
    expect(mid.head.x).toBeCloseTo(0.2, 12);
    expect(mid.legR.y).toBeCloseTo(0, 12);
  });

  it("入力を変更しない", () => {
    const before = structuredClone(POSE_A);
    lerpPose(POSE_A, POSE_B, 0.3);
    expect(POSE_A).toEqual(before);
  });
});

describe("sampleKeyframes", () => {
  const frames: Keyframes<number> = [
    { at: 0, ease: "linear", pose: 10 },
    { at: 0.5, ease: "linear", pose: 20 },
    { at: 1, ease: "smooth", pose: 40 },
  ];
  const lerpNumber = mix;

  it("表の範囲の外は端のポーズ(NaN は先頭)", () => {
    expect(sampleKeyframes(frames, -1, lerpNumber)).toBe(10);
    expect(sampleKeyframes(frames, 5, lerpNumber)).toBe(40);
    expect(sampleKeyframes(frames, Number.NaN, lerpNumber)).toBe(10);
  });

  it("キーフレームちょうどではそのポーズに一致する", () => {
    expect(sampleKeyframes(frames, 0, lerpNumber)).toBe(10);
    expect(sampleKeyframes(frames, 0.5, lerpNumber)).toBe(20);
    expect(sampleKeyframes(frames, 1, lerpNumber)).toBe(40);
  });

  it("区間の途中は、その区間の ease を掛けて補間する", () => {
    expect(sampleKeyframes(frames, 0.25, lerpNumber)).toBeCloseTo(15, 12);
    // 0.5〜1 は smooth: 中点 0.75 は 30(smoothstep(0.5) = 0.5)、0.625 は smoothstep(0.25) = 0.15625
    expect(sampleKeyframes(frames, 0.75, lerpNumber)).toBeCloseTo(30, 12);
    expect(sampleKeyframes(frames, 0.625, lerpNumber)).toBeCloseTo(20 + 20 * 0.15625, 12);
  });

  it("at が同じキーフレームが並んでも有限値で、後ろのポーズに移る", () => {
    const steps: Keyframes<number> = [
      { at: 0, ease: "linear", pose: 0 },
      { at: 0.5, ease: "linear", pose: 1 },
      { at: 0.5, ease: "linear", pose: 5 },
      { at: 1, ease: "linear", pose: 9 },
    ];
    for (const at of grid(0, 1, 0.05)) {
      expect(Number.isFinite(sampleKeyframes(steps, at, lerpNumber))).toBe(true);
    }
    expect(sampleKeyframes(steps, 0.75, lerpNumber)).toBeCloseTo(7, 12);
  });

  it("キーフレームが1つだけでもそのポーズを返す", () => {
    const single: Keyframes<number> = [{ at: 0.3, ease: "linear", pose: 7 }];
    expect(sampleKeyframes(single, 0, lerpNumber)).toBe(7);
    expect(sampleKeyframes(single, 1, lerpNumber)).toBe(7);
  });

  it("ポーズ(JointPose)の表でも端点に一致する", () => {
    const poses: Keyframes<JointPose> = [
      { at: 0, ease: "linear", pose: POSE_A },
      { at: 1, ease: "smooth", pose: POSE_B },
    ];
    expect(sampleKeyframes(poses, 0, lerpPose)).toEqual(POSE_A);
    expect(sampleKeyframes(poses, 1, lerpPose)).toEqual(POSE_B);
  });
});

describe("placeCharacter / placeBatter", () => {
  const root: PoseRoot = { position: { x: 1, y: 2, z: 3 }, yaw: 0.5, scale: 1.15 };

  it("関節ポーズに足元の配置を足す(既定は visible = true)", () => {
    const placed = placeCharacter(POSE_A, root);
    expect(placed).toEqual({ visible: true, position: root.position, yaw: 0.5, scale: 1.15, ...POSE_A });
    expect(placeCharacter(POSE_A, root, false).visible).toBe(false);
  });

  it("打者はバットを引き継ぐ", () => {
    const joints: BatterJoints = { ...POSE_B, bat: { visible: true, sweepYaw: 0.3, tilt: -0.2, height: 0.8 } };
    const placed = placeBatter(joints, root);
    expect(placed.bat).toEqual(joints.bat);
    expect(placed.torso).toEqual(POSE_B.torso);
    expect(placed.scale).toBeCloseTo(1.15, 12);
    expect(placed.visible).toBe(true);
  });
});
