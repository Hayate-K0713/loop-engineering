import { describe, expect, it } from "vitest";
import type { Rot3, Vec3 } from "../../../types/scene";
import { handPosition, rotateEuler } from "./fk";
import type { JointPose, PoseRoot } from "./pose";
import { CHARACTER_RIG, IDLE_POSE } from "./rig";

const ZERO: Rot3 = { x: 0, y: 0, z: 0 };
const STRAIGHT: JointPose = { torso: ZERO, head: ZERO, armL: ZERO, armR: ZERO, legL: ZERO, legR: ZERO };
const ORIGIN_ROOT: PoseRoot = { position: { x: 0, y: 0, z: 0 }, yaw: 0, scale: 1 };

function expectVec(actual: Vec3, expected: Vec3): void {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
  expect(actual.z).toBeCloseTo(expected.z, 9);
}

describe("rotateEuler", () => {
  it("回転なしは恒等", () => {
    expectVec(rotateEuler({ x: 1, y: 2, z: 3 }, ZERO), { x: 1, y: 2, z: 3 });
  });

  it("軸ごとの回転(three の右手系): x 軸まわり +90° で +y → +z、y 軸まわり +90° で +z → +x、z 軸まわり +90° で +x → +y", () => {
    expectVec(rotateEuler({ x: 0, y: 1, z: 0 }, { x: Math.PI / 2, y: 0, z: 0 }), { x: 0, y: 0, z: 1 });
    expectVec(rotateEuler({ x: 0, y: 0, z: 1 }, { x: 0, y: Math.PI / 2, z: 0 }), { x: 1, y: 0, z: 0 });
    expectVec(rotateEuler({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: Math.PI / 2 }), { x: 0, y: 1, z: 0 });
  });

  it("XYZ 順の Euler は Rx · Ry · Rz(Z → Y → X の順に掛ける): x と z を同時に 90° 回すと +x は +z へ", () => {
    // Rz(90°): +x → +y、続けて Rx(90°): +y → +z
    expectVec(rotateEuler({ x: 1, y: 0, z: 0 }, { x: Math.PI / 2, y: 0, z: Math.PI / 2 }), { x: 0, y: 0, z: 1 });
  });

  it("長さを保つ", () => {
    const rotated = rotateEuler({ x: 0.3, y: -0.8, z: 0.5 }, { x: 1.1, y: -0.7, z: 2.4 });
    expect(Math.hypot(rotated.x, rotated.y, rotated.z)).toBeCloseTo(Math.hypot(0.3, 0.8, 0.5), 12);
  });
});

describe("handPosition", () => {
  const { shoulderX, shoulderY, torsoY, armLength } = CHARACTER_RIG;

  it("直立で腕を下ろした手先は、肩の真下(右手は −x、左手は +x)", () => {
    expectVec(handPosition(STRAIGHT, CHARACTER_RIG, ORIGIN_ROOT), { x: -shoulderX, y: torsoY + shoulderY - armLength, z: 0 });
    expectVec(handPosition(STRAIGHT, CHARACTER_RIG, ORIGIN_ROOT, "armL"), { x: shoulderX, y: torsoY + shoulderY - armLength, z: 0 });
  });

  it("腕を x 軸まわりに −90° 回すと、手先は肩の高さで前(+z)へ伸びる", () => {
    const pose: JointPose = { ...STRAIGHT, armR: { x: -Math.PI / 2, y: 0, z: 0 } };
    expectVec(handPosition(pose, CHARACTER_RIG, ORIGIN_ROOT), { x: -shoulderX, y: torsoY + shoulderY, z: armLength });
  });

  it("腕を x 軸まわりに +180° 回すと、手先は肩の真上", () => {
    const pose: JointPose = { ...STRAIGHT, armR: { x: Math.PI, y: 0, z: 0 } };
    expectVec(handPosition(pose, CHARACTER_RIG, ORIGIN_ROOT), { x: -shoulderX, y: torsoY + shoulderY + armLength, z: 0 });
  });

  it("胴体を前(+z)へ倒すと肩が前へ動く(胴体 x 軸まわり +90° で肩の高さ分だけ前に出る)", () => {
    const pose: JointPose = { ...STRAIGHT, torso: { x: Math.PI / 2, y: 0, z: 0 } };
    // 腕は胴体基準で下向き(0, −L, 0) → 胴体 +90° で (0, 0, −L)、肩 (0, shoulderY, 0) → (0, 0, shoulderY)
    expectVec(handPosition(pose, CHARACTER_RIG, ORIGIN_ROOT), { x: -shoulderX, y: torsoY, z: shoulderY - armLength });
  });

  it("足元の位置・yaw・scale を最後に掛ける(位置 + yaw 回転 + 拡大)", () => {
    const base = handPosition(STRAIGHT, CHARACTER_RIG, ORIGIN_ROOT);
    const moved = handPosition(STRAIGHT, CHARACTER_RIG, { position: { x: 5, y: 1, z: -7 }, yaw: 0, scale: 1 });
    expectVec(moved, { x: base.x + 5, y: base.y + 1, z: base.z - 7 });

    const scaled = handPosition(STRAIGHT, CHARACTER_RIG, { position: { x: 0, y: 0, z: 0 }, yaw: 0, scale: 2 });
    expectVec(scaled, { x: base.x * 2, y: base.y * 2, z: base.z * 2 });

    // yaw π/2: 局所 +x → ワールド −z(y 軸まわり +90° で +x は −z へ)
    const turned = handPosition(STRAIGHT, CHARACTER_RIG, { position: { x: 0, y: 0, z: 0 }, yaw: Math.PI / 2, scale: 1 });
    expectVec(turned, { x: 0, y: base.y, z: -base.x });
    // yaw π: x と z が反転(捕手は yaw π で投手側を向く)
    const reversed = handPosition(STRAIGHT, CHARACTER_RIG, { position: { x: 0, y: 0, z: 0 }, yaw: Math.PI, scale: 1 });
    expectVec(reversed, { x: -base.x, y: base.y, z: 0 });
  });

  it("手先は肩から常に armLength の距離にある: 胴体・腕を様々に回しても(armLength = 0 の手先が肩)", () => {
    const shoulderRig = { ...CHARACTER_RIG, armLength: 0 };
    const poses: readonly JointPose[] = [
      IDLE_POSE,
      { ...STRAIGHT, armR: { x: 2.1, y: 0.4, z: -0.6 }, torso: { x: 0.3, y: -0.5, z: 0.1 } },
      { ...STRAIGHT, armR: { x: -1.3, y: 0, z: 0.5 }, torso: { x: -0.2, y: 0.9, z: 0 } },
    ];
    for (const pose of poses) {
      const shoulder = handPosition(pose, shoulderRig, ORIGIN_ROOT);
      const hand = handPosition(pose, CHARACTER_RIG, ORIGIN_ROOT);
      expect(Math.hypot(hand.x - shoulder.x, hand.y - shoulder.y, hand.z - shoulder.z)).toBeCloseTo(armLength, 9);
    }
  });
});
