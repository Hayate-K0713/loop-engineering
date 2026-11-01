import { describe, expect, it } from "vitest";
import type { Rot3, Vec3 } from "../../../types/scene";
import { elbowPosition, footPosition, handPosition, headPosition, inverseRotateEuler, kneePosition, rotateEuler, shoulderPosition } from "./fk";
import { jointPose, type JointPose, type PoseRoot } from "./pose";
import { CHARACTER_RIG, IDLE_POSE } from "./rig";

const ZERO: Rot3 = { x: 0, y: 0, z: 0 };
const STRAIGHT: JointPose = jointPose({});
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

  it("inverseRotateEuler は rotateEuler を打ち消す", () => {
    const rotation: Rot3 = { x: 1.1, y: -0.7, z: 2.4 };
    const original: Vec3 = { x: 0.3, y: -0.8, z: 0.5 };
    expectVec(inverseRotateEuler(rotateEuler(original, rotation), rotation), original);
  });
});

describe("handPosition(肘なし = まっすぐ)", () => {
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

  it("手先は肩から常に armLength の距離にある(肘をまっすぐにしたとき): 胴体・腕を様々に回しても(armLength = 0 の手先が肩)", () => {
    const shoulderRig = { ...CHARACTER_RIG, armLength: 0 };
    const poses: readonly JointPose[] = [
      { ...IDLE_POSE, elbowL: ZERO, elbowR: ZERO },
      { ...STRAIGHT, armR: { x: 2.1, y: 0.4, z: -0.6 }, torso: { x: 0.3, y: -0.5, z: 0.1 } },
      { ...STRAIGHT, armR: { x: -1.3, y: 0, z: 0.5 }, torso: { x: -0.2, y: 0.9, z: 0 } },
    ];
    for (const pose of poses) {
      const shoulder = handPosition(pose, shoulderRig, ORIGIN_ROOT);
      const hand = handPosition(pose, CHARACTER_RIG, ORIGIN_ROOT);
      expect(Math.hypot(hand.x - shoulder.x, hand.y - shoulder.y, hand.z - shoulder.z)).toBeCloseTo(armLength, 9);
    }
  });

  it("肘の回転を持たない入力(従来の 6 関節だけのポーズ)でも手先が出る(肘はまっすぐ)", () => {
    const sixJoints = { torso: ZERO, armL: ZERO, armR: { x: -Math.PI / 2, y: 0, z: 0 } };
    expectVec(handPosition(sixJoints, CHARACTER_RIG, ORIGIN_ROOT), { x: -shoulderX, y: torsoY + shoulderY, z: armLength });
  });
});

describe("肘・膝のある FK", () => {
  const { shoulderX, shoulderY, torsoY, upperArm, foreArm, hipX, hipY, thigh, shin } = CHARACTER_RIG;

  it("リグの寸法: 上腕 + 前腕 = armLength、大腿 + 下腿 = hipY", () => {
    expect(upperArm + foreArm).toBeCloseTo(CHARACTER_RIG.armLength, 12);
    expect(thigh + shin).toBeCloseTo(hipY, 12);
  });

  it("肩・肘の位置: 直立で腕を下ろすと、肘は肩の upperArm 下", () => {
    expectVec(shoulderPosition(STRAIGHT, CHARACTER_RIG, ORIGIN_ROOT, "R"), { x: -shoulderX, y: torsoY + shoulderY, z: 0 });
    expectVec(shoulderPosition(STRAIGHT, CHARACTER_RIG, ORIGIN_ROOT, "L"), { x: shoulderX, y: torsoY + shoulderY, z: 0 });
    expectVec(elbowPosition(STRAIGHT, CHARACTER_RIG, ORIGIN_ROOT, "R"), { x: -shoulderX, y: torsoY + shoulderY - upperArm, z: 0 });
  });

  it("肘を −90°(前へ曲げる)と、前腕が前(+z)へ水平に伸び、手先は肘の前腕の長さ分だけ前", () => {
    const pose: JointPose = { ...STRAIGHT, elbowR: { x: -Math.PI / 2, y: 0, z: 0 } };
    expectVec(handPosition(pose, CHARACTER_RIG, ORIGIN_ROOT), { x: -shoulderX, y: torsoY + shoulderY - upperArm, z: foreArm });
  });

  it("肘を曲げると手先が肩に近づく(肩から手先までの距離が armLength 未満)", () => {
    const pose: JointPose = { ...STRAIGHT, elbowR: { x: -1.5, y: 0, z: 0 } };
    const shoulder = shoulderPosition(pose, CHARACTER_RIG, ORIGIN_ROOT, "R");
    const hand = handPosition(pose, CHARACTER_RIG, ORIGIN_ROOT, "armR");
    expect(Math.hypot(hand.x - shoulder.x, hand.y - shoulder.y, hand.z - shoulder.z)).toBeLessThan(CHARACTER_RIG.armLength);
  });

  it("上腕を前へ 90° 上げてから肘を −90° 曲げると、前腕は真上へ向かう(肘の回転は上腕から見た値)", () => {
    const pose: JointPose = { ...STRAIGHT, armR: { x: -Math.PI / 2, y: 0, z: 0 }, elbowR: { x: -Math.PI / 2, y: 0, z: 0 } };
    expectVec(handPosition(pose, CHARACTER_RIG, ORIGIN_ROOT), { x: -shoulderX, y: torsoY + shoulderY + foreArm, z: upperArm });
  });

  it("脚: 直立の膝は股関節の thigh 下、足先は地面(y = 0)。膝を 90°(後ろへ曲げる)と下腿が後ろ(−z)へ水平に伸びる", () => {
    expectVec(kneePosition(STRAIGHT, CHARACTER_RIG, ORIGIN_ROOT, "L"), { x: hipX, y: hipY - thigh, z: 0 });
    expectVec(footPosition(STRAIGHT, CHARACTER_RIG, ORIGIN_ROOT, "L"), { x: hipX, y: 0, z: 0 });
    expectVec(footPosition(STRAIGHT, CHARACTER_RIG, ORIGIN_ROOT, "R"), { x: -hipX, y: 0, z: 0 });
    const bent: JointPose = { ...STRAIGHT, kneeL: { x: Math.PI / 2, y: 0, z: 0 } };
    expectVec(footPosition(bent, CHARACTER_RIG, ORIGIN_ROOT, "L"), { x: hipX, y: hipY - thigh, z: -shin });
  });

  it("大腿を前へ上げると(x が負)膝が前(+z)へ出る。大腿 −90° + 膝 +90° で下腿は真下へ戻る", () => {
    const raised: JointPose = { ...STRAIGHT, legL: { x: -Math.PI / 2, y: 0, z: 0 }, kneeL: { x: Math.PI / 2, y: 0, z: 0 } };
    expectVec(kneePosition(raised, CHARACTER_RIG, ORIGIN_ROOT, "L"), { x: hipX, y: hipY, z: thigh });
    expectVec(footPosition(raised, CHARACTER_RIG, ORIGIN_ROOT, "L"), { x: hipX, y: hipY - shin, z: thigh });
  });

  it("頭の中心は胴体の原点の headY 上で、胴体の回転に従う。頭自身の回転では動かない", () => {
    expectVec(headPosition(STRAIGHT, CHARACTER_RIG, ORIGIN_ROOT), { x: 0, y: torsoY + CHARACTER_RIG.headY, z: 0 });
    const leaned: JointPose = { ...STRAIGHT, torso: { x: Math.PI / 2, y: 0, z: 0 } };
    expectVec(headPosition(leaned, CHARACTER_RIG, ORIGIN_ROOT), { x: 0, y: torsoY, z: CHARACTER_RIG.headY });
    const nod: JointPose = { ...STRAIGHT, head: { x: 1, y: 0.4, z: 0.2 } };
    expectVec(headPosition(nod, CHARACTER_RIG, ORIGIN_ROOT), headPosition(STRAIGHT, CHARACTER_RIG, ORIGIN_ROOT));
  });

  it("足元の位置・yaw・scale は肘・膝・頭にも掛かる(scale 2 で位置が 2 倍)", () => {
    const root: PoseRoot = { position: { x: 0, y: 0, z: 0 }, yaw: 0, scale: 2 };
    const pose: JointPose = { ...STRAIGHT, elbowR: { x: -1, y: 0, z: 0 }, kneeL: { x: 0.5, y: 0, z: 0 } };
    const base = elbowPosition(pose, CHARACTER_RIG, ORIGIN_ROOT, "R");
    const scaled = elbowPosition(pose, CHARACTER_RIG, root, "R");
    expectVec(scaled, { x: base.x * 2, y: base.y * 2, z: base.z * 2 });
    const foot = footPosition(pose, CHARACTER_RIG, ORIGIN_ROOT, "L");
    expectVec(footPosition(pose, CHARACTER_RIG, root, "L"), { x: foot.x * 2, y: foot.y * 2, z: foot.z * 2 });
  });
});
