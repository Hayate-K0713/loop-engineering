// 1 体 1 本のスケルトン(`Bone` 12 本。打者はバットのボーンを加えて 13 本)。ボーンの並びは `JOINT_ORDER`(= `skinIndex`)。
// 階層: root > pelvis > { torso > { head, upperArmL > foreArmL, upperArmR > foreArmR }, thighL > shinL, thighR > shinR }、
// 打者のみ root > bat。ボーンの寸法は `CharacterRig`(model の `CHARACTER_RIG` と同じ値)から作る(二重に持たない)。
// `bat` のボーンは `BatPose` を 1 本で受ける: 回転の順序は YXZ(= スイング `sweepYaw`(y)の中にチルト `tilt`(x))、`position.y` = 高さ、
// `scale.z` = バット軸(+z)の長さの倍率(`lengthScale`)。位置の x・z(握りのオフセット)は変えない。
import { Bone, Group, Skeleton } from "three";
import type { CharacterJoint } from "../../types/scene";
import type { CharacterRig } from "../../types/stage";
import type { Triple } from "./geometry-merge";
import { JOINT_ORDER } from "./parts";

/** バットのボーンの位置(スイングの高さの初期値と、握りの前後のオフセット。モックの値)。 */
export const BAT_ORIGIN: Triple = [0, 1, 0.05];

export type CharacterSkeleton = {
  readonly root: Group;
  readonly skeleton: Skeleton;
  readonly bones: Readonly<Record<CharacterJoint, Bone | null>>;
  /** 各ボーンのバインド姿勢での位置(root 空間)。 */
  readonly origins: ReadonlyMap<CharacterJoint, Triple>;
};

type JointSpec = { readonly joint: CharacterJoint; readonly parent: CharacterJoint | null; readonly offset: Triple };

/** 関節の親子と、親から見た位置。`build` で肩・股関節の左右位置を体格に合わせる。 */
function jointTable(rig: CharacterRig, build: number, withBat: boolean): readonly JointSpec[] {
  const shoulderX = rig.shoulderX * (1 + (build - 1) * 0.8);
  const hipX = rig.hipX * build;
  const table: JointSpec[] = [
    { joint: "root", parent: null, offset: [0, 0, 0] },
    { joint: "pelvis", parent: "root", offset: [0, rig.hipY, 0] },
    { joint: "torso", parent: "pelvis", offset: [0, rig.torsoY - rig.hipY, 0] },
    { joint: "head", parent: "torso", offset: [0, rig.headY, 0] },
    { joint: "upperArmL", parent: "torso", offset: [shoulderX, rig.shoulderY, 0] },
    { joint: "foreArmL", parent: "upperArmL", offset: [0, -rig.upperArm, 0] },
    { joint: "upperArmR", parent: "torso", offset: [-shoulderX, rig.shoulderY, 0] },
    { joint: "foreArmR", parent: "upperArmR", offset: [0, -rig.upperArm, 0] },
    { joint: "thighL", parent: "pelvis", offset: [hipX, 0, 0] },
    { joint: "shinL", parent: "thighL", offset: [0, -rig.thigh, 0] },
    { joint: "thighR", parent: "pelvis", offset: [-hipX, 0, 0] },
    { joint: "shinR", parent: "thighR", offset: [0, -rig.thigh, 0] },
  ];
  if (withBat) table.push({ joint: "bat", parent: "root", offset: BAT_ORIGIN });
  return table;
}

/**
 * スケルトンを作る。`root`(Group)の子にボーンの木を置く。ボーンはバインド姿勢(回転なし)で、`updateMatrixWorld` 済み。
 * `skeleton.bones` は `JOINT_ORDER` の順(打者以外は `bat` を除く先頭 12 本)。
 */
export function buildSkeleton(rig: CharacterRig, build: number, withBat: boolean): CharacterSkeleton {
  const root = new Group();
  const created = new Map<CharacterJoint, Bone>();
  const origins = new Map<CharacterJoint, Triple>();
  for (const spec of jointTable(rig, build, withBat)) {
    const bone = new Bone();
    bone.name = spec.joint;
    bone.position.set(...spec.offset);
    const parent = spec.parent === null ? undefined : created.get(spec.parent);
    (parent ?? root).add(bone);
    const parentOrigin = (spec.parent === null ? undefined : origins.get(spec.parent)) ?? [0, 0, 0];
    origins.set(spec.joint, [parentOrigin[0] + spec.offset[0], parentOrigin[1] + spec.offset[1], parentOrigin[2] + spec.offset[2]]);
    created.set(spec.joint, bone);
  }
  const ordered = JOINT_ORDER.flatMap((joint) => {
    const bone = created.get(joint);
    return bone ? [bone] : [];
  });
  const bat = created.get("bat");
  if (bat) bat.rotation.order = "YXZ";
  const bone = (joint: CharacterJoint): Bone | null => created.get(joint) ?? null;
  const bones: Record<CharacterJoint, Bone | null> = {
    root: bone("root"),
    pelvis: bone("pelvis"),
    torso: bone("torso"),
    head: bone("head"),
    upperArmL: bone("upperArmL"),
    foreArmL: bone("foreArmL"),
    upperArmR: bone("upperArmR"),
    foreArmR: bone("foreArmR"),
    thighL: bone("thighL"),
    shinL: bone("shinL"),
    thighR: bone("thighR"),
    shinR: bone("shinR"),
    bat: bone("bat"),
  };
  root.updateMatrixWorld(true);
  return { root, skeleton: new Skeleton(ordered), bones, origins };
}
