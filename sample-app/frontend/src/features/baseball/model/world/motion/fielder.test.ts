import { describe, expect, it } from "vitest";
import { catcherPose, fielderIdlePose, fielderRunPose } from "./fielder";
import { IDLE_POSE, RUN_MOTION } from "./rig";
import { adjacentPairs, expectValidPose, FRAME_MS, grid, MAX_JOINT_STEP, maxJointDelta } from "./test-helpers";

const RUN_GRID = grid(0, 6000, FRAME_MS);

describe("fielderIdlePose", () => {
  it("有効なポーズ(有限・±2π 以内)で、呼ぶたびに同じ", () => {
    expectValidPose(fielderIdlePose());
    expect(fielderIdlePose()).toEqual(fielderIdlePose());
  });

  it("腕は軽く下ろし、脚と胴体は直立", () => {
    const idle = fielderIdlePose();
    expect(idle).toEqual(IDLE_POSE);
    expect(idle.legL).toEqual({ x: 0, y: 0, z: 0 });
    expect(idle.legR).toEqual({ x: 0, y: 0, z: 0 });
    expect(idle.torso).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe("fielderRunPose", () => {
  it("走り出し(0ms)は待機姿勢と一致する(負の時間も同じ)", () => {
    expect(fielderRunPose(0)).toEqual(fielderIdlePose());
    expect(fielderRunPose(-250)).toEqual(fielderIdlePose());
    expect(fielderRunPose(Number.NaN)).toEqual(fielderIdlePose());
  });

  it("全関節の角度が有限で ±2π 以内(長時間でも)", () => {
    for (const ms of [...RUN_GRID, 1e6, 3.6e6]) {
      expectValidPose(fielderRunPose(ms));
    }
  });

  it("連続性: 16ms 刻みに走査して、隣接サンプルの各関節の差が 0.5rad 以下", () => {
    for (const [a, b] of adjacentPairs(RUN_GRID.map(fielderRunPose))) {
      expect(maxJointDelta(a, b)).toBeLessThanOrEqual(MAX_JOINT_STEP);
    }
  });

  it("脚と腕は逆位相で、振れ幅は RUN_MOTION の範囲内", () => {
    for (const ms of RUN_GRID) {
      const pose = fielderRunPose(ms);
      expect(pose.legL.x).toBeCloseTo(-pose.legR.x, 12);
      expect(Math.abs(pose.legL.x)).toBeLessThanOrEqual(RUN_MOTION.legSwing + 1e-12);
      expect(pose.armL.x - IDLE_POSE.armL.x).toBeCloseTo(-(pose.armR.x - IDLE_POSE.armR.x), 12);
      expect(Math.abs(pose.armR.x - IDLE_POSE.armR.x)).toBeLessThanOrEqual(RUN_MOTION.armSwing + 1e-12);
      // 脚が前へ出るとき(legL.x が正)は同じ側の腕が後ろへ(armL.x が待機より小さい)
      expect(Math.sign(pose.legL.x) * Math.sign(pose.armL.x - IDLE_POSE.armL.x)).toBeLessThanOrEqual(0);
    }
  });

  it("周期運動: 1周期(2π / 角速度)後に同じポーズに戻る", () => {
    const periodMs = ((Math.PI * 2) / RUN_MOTION.cycleRadPerSec) * 1000;
    const start = 500;
    expect(maxJointDelta(fielderRunPose(start), fielderRunPose(start + periodMs))).toBeLessThan(1e-9);
  });

  it("前傾は走り出しから leanRampMs かけて入り、以降は一定", () => {
    expect(fielderRunPose(RUN_MOTION.leanRampMs / 2).torso.x).toBeCloseTo(RUN_MOTION.lean / 2, 12);
    expect(fielderRunPose(RUN_MOTION.leanRampMs).torso.x).toBeCloseTo(RUN_MOTION.lean, 12);
    expect(fielderRunPose(5000).torso.x).toBeCloseTo(RUN_MOTION.lean, 12);
  });
});

describe("catcherPose", () => {
  it("有効なポーズで、待機姿勢とは異なる(前かがみ)", () => {
    const catcher = catcherPose();
    expectValidPose(catcher);
    expect(catcher.torso.x).toBeGreaterThan(IDLE_POSE.torso.x);
    expect(maxJointDelta(catcher, fielderIdlePose())).toBeGreaterThan(0);
    expect(catcherPose()).toEqual(catcher);
  });
});
