import type { Rot3, Vec3 } from "../../../types/scene";
import type { CharacterRig } from "../../../types/stage";
import type { PoseRoot } from "./pose";

// 順運動学: ポーズの関節角から関節・手先・足先のワールド位置を求める(リリース点・捕球点・構えの検証用)。
// three の階層(root → pelvis → torso → upperArm → foreArm → 手先 / pelvis → thigh → shin → 足先)と同じ変換を、純関数で再現する。
// `types/` だけに依存する。肘・膝の回転は省略できる(省略は回転なし = まっすぐ)。

/** どちらの側か。`L` はキャラクターの左(+x 側、グローブ側)、`R` は右(−x 側、投げる手)。 */
type Side = "L" | "R";

/** 肘・膝を省略できる腕の入力。 */
type ArmPose = {
  readonly torso: Rot3;
  readonly armL: Rot3;
  readonly armR: Rot3;
  readonly elbowL?: Rot3;
  readonly elbowR?: Rot3;
};

/** 膝を省略できる脚の入力。 */
type LegPose = {
  readonly legL: Rot3;
  readonly legR: Rot3;
  readonly kneeL?: Rot3;
  readonly kneeR?: Rot3;
};

/** 頭の入力。 */
type HeadPose = { readonly torso: Rot3; readonly head: Rot3 };

const NO_ROTATION: Rot3 = { x: 0, y: 0, z: 0 };

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

/** `rotateEuler` の逆回転(`rotation` を打ち消す)。行列の転置 Rzᵀ · Ryᵀ · Rxᵀ なので、ベクトルには X → Y → Z の順に掛ける。 */
export function inverseRotateEuler(v: Vec3, rotation: Rot3): Vec3 {
  return rotateZ(rotateY(rotateX(v, -rotation.x), -rotation.y), -rotation.z);
}

/** 関節 1 つ分の変換: 子の座標系の点を、回転してから親の座標系での関節の位置だけ平行移動する。 */
type Link = { readonly rotation: Rot3; readonly offset: Vec3 };

/** 先端の関節から順に並べず、**根に近い関節から先端の関節の順**に並べた `links` を通して、先端の座標系の点を root の座標系へ運ぶ。 */
function throughLinks(tip: Vec3, links: readonly Link[]): Vec3 {
  return links.reduceRight<Vec3>((point, link) => {
    const rotated = rotateEuler(point, link.rotation);
    return { x: rotated.x + link.offset.x, y: rotated.y + link.offset.y, z: rotated.z + link.offset.z };
  }, tip);
}

/** root の座標系の点を、足元の位置・yaw・scale を掛けたワールド座標にする。 */
function toWorld(point: Vec3, root: PoseRoot): Vec3 {
  const turned = rotateY(point, root.yaw);
  return {
    x: turned.x * root.scale + root.position.x,
    y: turned.y * root.scale + root.position.y,
    z: turned.z * root.scale + root.position.z,
  };
}

/** 上腕・前腕の長さ。`armLength`(肩から手先までの総長)を `upperArm : foreArm` の比で配分する(`armLength` = 0 で手先が肩に一致する)。 */
function armSegments(rig: CharacterRig): { readonly upper: number; readonly fore: number } {
  const total = rig.upperArm + rig.foreArm;
  const ratio = total > 0 ? rig.armLength / total : 0;
  return { upper: rig.upperArm * ratio, fore: rig.foreArm * ratio };
}

/** root → torso の関節。 */
function torsoLink(pose: { readonly torso: Rot3 }, rig: CharacterRig): Link {
  return { rotation: pose.torso, offset: { x: 0, y: rig.torsoY, z: 0 } };
}

/** 肩までの関節の列(root → torso → upperArm)。 */
function shoulderLinks(pose: ArmPose, rig: CharacterRig, side: Side): readonly Link[] {
  const shoulderX = side === "L" ? rig.shoulderX : -rig.shoulderX;
  return [torsoLink(pose, rig), { rotation: side === "L" ? pose.armL : pose.armR, offset: { x: shoulderX, y: rig.shoulderY, z: 0 } }];
}

/** 肘までの関節の列(root → torso → upperArm → foreArm)。 */
function elbowLinks(pose: ArmPose, rig: CharacterRig, side: Side): readonly Link[] {
  const upper = armSegments(rig).upper;
  return [...shoulderLinks(pose, rig, side), { rotation: (side === "L" ? pose.elbowL : pose.elbowR) ?? NO_ROTATION, offset: { x: 0, y: -upper, z: 0 } }];
}

/** 肩の関節のワールド位置。 */
export function shoulderPosition(pose: ArmPose, rig: CharacterRig, root: PoseRoot, side: Side = "R"): Vec3 {
  return toWorld(throughLinks({ x: 0, y: 0, z: 0 }, shoulderLinks(pose, rig, side)), root);
}

/** 肘のワールド位置。 */
export function elbowPosition(pose: ArmPose, rig: CharacterRig, root: PoseRoot, side: Side = "R"): Vec3 {
  return toWorld(throughLinks({ x: 0, y: 0, z: 0 }, elbowLinks(pose, rig, side)), root);
}

/**
 * 手先(前腕の先端 = 手の中心)のワールド位置。腕の付け根は胴体基準で `armL` が +shoulderX、`armR` が −shoulderX、
 * 肘は上腕の局所座標で (0, −上腕, 0)、手先は前腕の局所座標で (0, −前腕, 0)。足元の `root`(位置・yaw・scale)は最後に掛ける。
 * `hand` の既定は投げる手(右)。肘の回転を省略すると腕はまっすぐ。
 */
export function handPosition(pose: ArmPose, rig: CharacterRig, root: PoseRoot, hand: "armL" | "armR" = "armR"): Vec3 {
  const side: Side = hand === "armL" ? "L" : "R";
  return toWorld(throughLinks({ x: 0, y: -armSegments(rig).fore, z: 0 }, elbowLinks(pose, rig, side)), root);
}

/** 脚の関節の列(root → pelvis → thigh [→ shin])。骨盤は回転しない。 */
function legLinks(pose: LegPose, rig: CharacterRig, side: Side, withShin: boolean): readonly Link[] {
  const hipX = side === "L" ? rig.hipX : -rig.hipX;
  const pelvis: Link = { rotation: NO_ROTATION, offset: { x: 0, y: rig.hipY, z: 0 } };
  const thigh: Link = { rotation: side === "L" ? pose.legL : pose.legR, offset: { x: hipX, y: 0, z: 0 } };
  const shin: Link = { rotation: (side === "L" ? pose.kneeL : pose.kneeR) ?? NO_ROTATION, offset: { x: 0, y: -rig.thigh, z: 0 } };
  return withShin ? [pelvis, thigh, shin] : [pelvis, thigh];
}

/** 膝のワールド位置。 */
export function kneePosition(pose: LegPose, rig: CharacterRig, root: PoseRoot, side: Side = "R"): Vec3 {
  return toWorld(throughLinks({ x: 0, y: -rig.thigh, z: 0 }, legLinks(pose, rig, side, false)), root);
}

/** 足先(下腿の先端 = 足首)のワールド位置。 */
export function footPosition(pose: LegPose, rig: CharacterRig, root: PoseRoot, side: Side = "R"): Vec3 {
  return toWorld(throughLinks({ x: 0, y: -rig.shin, z: 0 }, legLinks(pose, rig, side, true)), root);
}

/** 頭の中心のワールド位置(頭の回転は中心を動かさない)。 */
export function headPosition(pose: HeadPose, rig: CharacterRig, root: PoseRoot): Vec3 {
  return toWorld(throughLinks({ x: 0, y: 0, z: 0 }, [torsoLink(pose, rig), { rotation: pose.head, offset: { x: 0, y: rig.headY, z: 0 } }]), root);
}
