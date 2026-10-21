import { describe, expect, it } from "vitest";
import type { Vec3 } from "../../../types/scene";
import { handPosition } from "./fk";
import { pitcherFollowPose, pitcherWindupPose } from "./pitcher";
import type { PoseRoot } from "./pose";
import { CHARACTER_RIG, IDLE_POSE, PITCHER_FOLLOW_MS } from "./rig";
import { adjacentPairs, isValidPose, FRAME_MS, grid, MAX_JOINT_STEP, maxJointDelta, NOMINAL_WINDUP_MS } from "./test-helpers";

// リリース点は B1 の `WORLD_PARAMS` の値と同じ(motion は space を import できないので、テストで同値を持つ。統合確認はステップ G)。
const RELEASE_POINT: Vec3 = { x: -0.3, y: 1.65, z: -18.1 };
const PITCHER_ROOT: PoseRoot = { position: { x: 0, y: 0.25, z: -18.4 }, yaw: 0, scale: 1 };
const RELEASE_TOLERANCE_M = 0.15;

const WINDUP_U_STEP = FRAME_MS / NOMINAL_WINDUP_MS;
const WINDUP_GRID = grid(0, 1, WINDUP_U_STEP);
const FOLLOW_GRID = grid(0, PITCHER_FOLLOW_MS + 200, FRAME_MS);

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

describe("pitcherWindupPose", () => {
  it("u = 0 は待機姿勢", () => {
    expect(pitcherWindupPose(0)).toEqual(IDLE_POSE);
  });

  it("u = 1(リリース直前)は pitcherFollowPose(0)(リリースの瞬間)と全関節が一致する", () => {
    expect(pitcherWindupPose(1)).toEqual(pitcherFollowPose(0));
  });

  it("範囲外の u は端に収まり、NaN は待機姿勢", () => {
    expect(pitcherWindupPose(-0.5)).toEqual(pitcherWindupPose(0));
    expect(pitcherWindupPose(3)).toEqual(pitcherWindupPose(1));
    expect(pitcherWindupPose(Number.NaN)).toEqual(pitcherWindupPose(0));
  });

  it("全関節の角度が有限で ±2π 以内(u 全域)", () => {
    for (const u of WINDUP_GRID) {
      expect(isValidPose(pitcherWindupPose(u))).toBe(true);
    }
  });

  it("連続性: 標準の windup 長(700ms)で 16ms 刻みに走査して、隣接サンプルの各関節の差が 0.5rad 以下", () => {
    for (const [a, b] of adjacentPairs(WINDUP_GRID.map(pitcherWindupPose))) {
      expect(maxJointDelta(a, b)).toBeLessThanOrEqual(MAX_JOINT_STEP);
    }
  });

  it("windup は決定論的で入力を変更しない(同じ u で deep equal)", () => {
    expect(pitcherWindupPose(0.37)).toEqual(pitcherWindupPose(0.37));
  });

  it("投げる右腕は後ろ→上→前の向き(x の回転が増える向き)に回る: 腕を引いた後(u = 0.62)からリリースまで単調増加", () => {
    const angles = grid(0.62, 1, WINDUP_U_STEP).map((u) => pitcherWindupPose(u).armR.x);
    expect(angles.every((angle, index) => index === 0 || angle >= (angles.at(index - 1) ?? 0))).toBe(true);
  });
});

describe("pitcherFollowPose", () => {
  it("全関節の角度が有限で ±2π 以内", () => {
    for (const ms of FOLLOW_GRID) {
      expect(isValidPose(pitcherFollowPose(ms))).toBe(true);
    }
  });

  it("連続性: 16ms 刻みに走査して、隣接サンプルの各関節の差が 0.5rad 以下", () => {
    for (const [a, b] of adjacentPairs(FOLLOW_GRID.map(pitcherFollowPose))) {
      expect(maxJointDelta(a, b)).toBeLessThanOrEqual(MAX_JOINT_STEP);
    }
  });

  it("負の経過時間は 0 と同じ、pitcherFollowMs 以降は振り切った姿勢で止まる", () => {
    expect(pitcherFollowPose(-100)).toEqual(pitcherFollowPose(0));
    expect(pitcherFollowPose(PITCHER_FOLLOW_MS)).toEqual(pitcherFollowPose(PITCHER_FOLLOW_MS + 5000));
    expect(pitcherFollowPose(Number.NaN)).toEqual(pitcherFollowPose(0));
  });

  it("振り切った姿勢はリリースの姿勢と異なる(体が前へ倒れ、腕が下へ抜ける)", () => {
    const release = pitcherFollowPose(0);
    const finish = pitcherFollowPose(PITCHER_FOLLOW_MS);
    expect(finish.torso.x).toBeGreaterThan(release.torso.x);
    expect(finish.armR.x).toBeGreaterThan(release.armR.x);
  });
});

describe("リリース時の手先(順運動学)", () => {
  const releaseHand = handPosition(pitcherWindupPose(1), CHARACTER_RIG, PITCHER_ROOT);

  it("pitcherWindupPose(1) の右手先が RELEASE_POINT の 0.15m 以内", () => {
    expect(distance(releaseHand, RELEASE_POINT)).toBeLessThanOrEqual(RELEASE_TOLERANCE_M);
  });

  it("pitcherFollowPose(0) の右手先も同じ位置(境界の一致)", () => {
    expect(handPosition(pitcherFollowPose(0), CHARACTER_RIG, PITCHER_ROOT)).toEqual(releaseHand);
  });

  it("リリース時は腕が上から前へ振り抜かれている: 手先は肩より高く、腕を引いた時点より前(+z)にある", () => {
    const shoulderY = PITCHER_ROOT.position.y + CHARACTER_RIG.torsoY + CHARACTER_RIG.shoulderY;
    const cocked = handPosition(pitcherWindupPose(0.62), CHARACTER_RIG, PITCHER_ROOT);
    expect(releaseHand.y).toBeGreaterThan(shoulderY);
    expect(releaseHand.z).toBeGreaterThan(cocked.z);
  });

  it("手先の軌道はリリース前に後ろ(−z)から前(+z)へ進む: u = 0.62 → 1 で z が単調増加", () => {
    const zs = grid(0.62, 1, WINDUP_U_STEP).map((u) => handPosition(pitcherWindupPose(u), CHARACTER_RIG, PITCHER_ROOT).z);
    expect(zs.every((z, index) => index === 0 || z >= (zs.at(index - 1) ?? 0) - 1e-9)).toBe(true);
  });

  it("フォロースルーで手先は低い位置へ抜ける(リリース後に下がる)", () => {
    const finish = handPosition(pitcherFollowPose(PITCHER_FOLLOW_MS), CHARACTER_RIG, PITCHER_ROOT);
    expect(finish.y).toBeLessThan(releaseHand.y);
  });
});
