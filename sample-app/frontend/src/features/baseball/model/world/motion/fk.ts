import type { Rot3, Vec3 } from "../../../types/scene";
import type { CharacterRig } from "../../../types/stage";
import type { JointPose, PoseRoot } from "./pose";

// 順運動学: ポーズの関節角から手先のワールド位置を求める(リリース点の機械検証用)。
// three の階層(root → torso → arm → 手先)と同じ変換を、純関数で再現する。`types/` だけに依存する。

/** どちらの手か。`armL` はキャラクターの左(+x 側、グローブ側)、`armR` は右(−x 側、投げる手)。 */
export type HandSide = "armL" | "armR";

function rotateX(v: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c };
}

function rotateY(v: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
}

function rotateZ(v: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c, z: v.z };
}

/** three の Euler(XYZ 順)の回転。行列は Rx · Ry · Rz なので、ベクトルには Z → Y → X の順に掛ける。 */
export function rotateEuler(v: Vec3, rotation: Rot3): Vec3 {
  return rotateX(rotateY(rotateZ(v, rotation.z), rotation.y), rotation.x);
}

function translate(v: Vec3, dx: number, dy: number, dz: number): Vec3 {
  return { x: v.x + dx, y: v.y + dy, z: v.z + dz };
}

/**
 * 手先(腕の先端 = 手の中心)のワールド位置。腕の付け根は胴体基準で `armL` が +shoulderX、`armR` が −shoulderX、
 * 手先は腕の局所座標で (0, −armLength, 0)。足元の `root`(位置・yaw・scale)は最後に掛ける。`hand` の既定は投げる手(右)。
 */
export function handPosition(pose: JointPose, rig: CharacterRig, root: PoseRoot, hand: HandSide = "armR"): Vec3 {
  const armRotation = hand === "armL" ? pose.armL : pose.armR;
  const shoulderX = hand === "armL" ? rig.shoulderX : -rig.shoulderX;
  const inArm: Vec3 = { x: 0, y: -rig.armLength, z: 0 };
  const inTorsoRaw = rotateEuler(inArm, armRotation);
  const inTorso = translate(inTorsoRaw, shoulderX, rig.shoulderY, 0);
  const inRootRaw = rotateEuler(inTorso, pose.torso);
  const inRoot = translate(inRootRaw, 0, rig.torsoY, 0);
  const turned = rotateY(inRoot, root.yaw);
  return translate({ x: turned.x * root.scale, y: turned.y * root.scale, z: turned.z * root.scale }, root.position.x, root.position.y, root.position.z);
}
