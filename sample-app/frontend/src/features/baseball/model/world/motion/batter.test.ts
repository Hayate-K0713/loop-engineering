import { describe, expect, it } from "vitest";
import { batterStancePose, batterSwingPose } from "./batter";
import { BAT_FOLLOW_LIFT, BAT_STANCE_HEIGHT, SWING_CONTACT_PROGRESS, SWING_FOLLOW_END_PROGRESS } from "./rig";
import { adjacentPairs, expectValidAngles, expectValidPose, FRAME_MS, grid, MAX_JOINT_STEP, maxJointDelta } from "./test-helpers";

// 標準のスイングは全体 200ms(progress 0→1)。16ms 刻みの progress の刻み幅。
const NOMINAL_SWING_MS = 200;
const PROGRESS_STEP = FRAME_MS / NOMINAL_SWING_MS;
const PROGRESS_GRID = grid(0, SWING_FOLLOW_END_PROGRESS, PROGRESS_STEP);
// ゾーンの下端・中心・上端の高さ(m)。
const HEIGHTS = [0.42, 0.72, 1.02] as const;

describe("batterStancePose / batterSwingPose の境界", () => {
  it.each(HEIGHTS)("batterSwingPose(0, %d) は構え姿勢に一致する(高さに依存しない)", (height) => {
    expect(batterSwingPose(0, height)).toEqual(batterStancePose());
  });

  it("構えのバットは構えの高さ・先端が上がった向きで、見えている", () => {
    const stance = batterStancePose();
    expect(stance.bat.visible).toBe(true);
    expect(stance.bat.height).toBe(BAT_STANCE_HEIGHT);
    expect(stance.bat.tilt).toBeLessThan(-0.5);
  });

  it("progress の範囲外は端に収まり、NaN は構え", () => {
    expect(batterSwingPose(-0.3, 0.72)).toEqual(batterSwingPose(0, 0.72));
    expect(batterSwingPose(2, 0.72)).toEqual(batterSwingPose(SWING_FOLLOW_END_PROGRESS, 0.72));
    expect(batterSwingPose(Number.NaN, 0.72)).toEqual(batterSwingPose(0, 0.72));
  });

  it("progress 1 の前後で連続している(1 − ε と 1 + ε がほぼ同じ)", () => {
    const before = batterSwingPose(1 - 1e-6, 0.72);
    const after = batterSwingPose(1 + 1e-6, 0.72);
    expect(maxJointDelta(before, after)).toBeLessThan(1e-3);
    expect(Math.abs(before.bat.sweepYaw - after.bat.sweepYaw)).toBeLessThan(1e-3);
    expect(Math.abs(before.bat.tilt - after.bat.tilt)).toBeLessThan(1e-3);
    expect(Math.abs(before.bat.height - after.bat.height)).toBeLessThan(1e-3);
  });

  it("progress 0.66(接触姿勢)の前後でも連続している", () => {
    const before = batterSwingPose(SWING_CONTACT_PROGRESS - 1e-6, 0.72);
    const after = batterSwingPose(SWING_CONTACT_PROGRESS + 1e-6, 0.72);
    expect(maxJointDelta(before, after)).toBeLessThan(1e-3);
    expect(Math.abs(before.bat.height - after.bat.height)).toBeLessThan(1e-3);
  });
});

describe("範囲と連続性(progress 全域)", () => {
  it.each(HEIGHTS)("高さ %d: 全関節とバットの角度が有限で ±2π 以内、バットの高さが有限", (height) => {
    for (const progress of PROGRESS_GRID) {
      const pose = batterSwingPose(progress, height);
      expectValidPose(pose);
      expectValidAngles([pose.bat.sweepYaw, pose.bat.tilt]);
      expect(Number.isFinite(pose.bat.height)).toBe(true);
    }
  });

  it.each(HEIGHTS)("高さ %d: 標準の200msスイングを16ms刻みに走査して、隣接サンプルの各関節・バットの角度の差が 0.5rad 以下(接触・振り切りの切替点を含む)", (height) => {
    for (const [a, b] of adjacentPairs(PROGRESS_GRID.map((progress) => batterSwingPose(progress, height)))) {
      expect(maxJointDelta(a, b)).toBeLessThanOrEqual(MAX_JOINT_STEP);
      expect(Math.abs(a.bat.sweepYaw - b.bat.sweepYaw)).toBeLessThanOrEqual(MAX_JOINT_STEP);
      expect(Math.abs(a.bat.tilt - b.bat.tilt)).toBeLessThanOrEqual(MAX_JOINT_STEP);
    }
  });

  it.each(HEIGHTS)("高さ %d: バットの高さは1フレームで 0.2m 以上飛ばない", (height) => {
    for (const [a, b] of adjacentPairs(PROGRESS_GRID.map((progress) => batterSwingPose(progress, height)))) {
      expect(Math.abs(a.bat.height - b.bat.height)).toBeLessThanOrEqual(0.2);
    }
  });

  it("バットは構え(後ろ)から前へ振られる: sweepYaw は progress に対して単調増加", () => {
    const sweeps = PROGRESS_GRID.map((progress) => batterSwingPose(progress, 0.72).bat.sweepYaw);
    expect(sweeps.every((sweep, index) => index === 0 || sweep >= (sweeps.at(index - 1) ?? 0))).toBe(true);
  });

  it("関節の角度は高さに依存しない(変わるのはバットの高さだけ)", () => {
    for (const progress of PROGRESS_GRID) {
      const low = batterSwingPose(progress, 0.42);
      const high = batterSwingPose(progress, 1.02);
      expect(maxJointDelta(low, high)).toBe(0);
      expect(low.bat.sweepYaw).toBe(high.bat.sweepYaw);
      expect(low.bat.tilt).toBe(high.bat.tilt);
    }
  });
});

describe("接触姿勢(progress 0.66)", () => {
  it.each(HEIGHTS)("高さ %d: バットの高さがボールの高さに一致する", (height) => {
    expect(batterSwingPose(SWING_CONTACT_PROGRESS, height).bat.height).toBeCloseTo(height, 12);
  });

  it("バットはほぼ水平で、ホームベース上(sweepYaw ≈ 0)を横切る", () => {
    const contact = batterSwingPose(SWING_CONTACT_PROGRESS, 0.72);
    expect(Math.abs(contact.bat.tilt)).toBeLessThan(0.2);
    expect(Math.abs(contact.bat.sweepYaw)).toBeLessThan(0.3);
  });

  it("バットの高さは構えから接触まで単調に近づく", () => {
    const heights = grid(0, SWING_CONTACT_PROGRESS, PROGRESS_STEP).map((progress) => batterSwingPose(progress, 0.42).bat.height);
    expect(heights.every((height, index) => index === 0 || height <= (heights.at(index - 1) ?? 0) + 1e-9)).toBe(true);
  });

  it("接触後は肩へ向かって巻き上がり、最大で BAT_FOLLOW_LIFT だけ上がる", () => {
    const end = batterSwingPose(SWING_FOLLOW_END_PROGRESS, 0.72);
    expect(end.bat.height).toBeCloseTo(0.72 + BAT_FOLLOW_LIFT, 12);
    expect(batterSwingPose(1, 0.72).bat.height).toBeGreaterThan(0.72);
    expect(batterSwingPose(1, 0.72).bat.height).toBeLessThan(end.bat.height);
  });
});
