// SceneFrame のポーズをキャラクター(`CharacterParts`)のボーンへ適用する(明示フィールドの代入)。
// 回転はすべて親から見た Euler XYZ。ボーンとポーズの対応は `render/character/parts.ts` の取り決めどおり:
// torso→torso、head→head、armL/R→upperArmL/R、elbowL/R→foreArmL/R、legL/R→thighL/R、kneeL/R→shinL/R。pelvis は入力なし(恒等)。
import type { Bone } from "three";
import type { BatPose, BatterPose, CharacterPose, Rot3 } from "../types/scene";
import { applyExpression } from "./character-look";
import type { CharacterParts } from "./character/parts";

function setRotation(bone: Bone | null, rotation: Rot3): void {
  if (!bone) return;
  bone.rotation.x = rotation.x;
  bone.rotation.y = rotation.y;
  bone.rotation.z = rotation.z;
}

/** 足元の位置・向き・拡大率・可視、各ボーンの回転(肘・膝を含む)、表情を適用する。 */
export function applyPose(parts: CharacterParts, pose: CharacterPose): void {
  const { root, bones } = parts;
  root.visible = pose.visible;
  root.position.x = pose.position.x;
  root.position.y = pose.position.y;
  root.position.z = pose.position.z;
  root.rotation.y = pose.yaw;
  root.scale.setScalar(pose.scale);
  setRotation(bones.torso, pose.torso);
  setRotation(bones.head, pose.head);
  setRotation(bones.upperArmL, pose.armL);
  setRotation(bones.upperArmR, pose.armR);
  setRotation(bones.foreArmL, pose.elbowL);
  setRotation(bones.foreArmR, pose.elbowR);
  setRotation(bones.thighL, pose.legL);
  setRotation(bones.thighR, pose.legR);
  setRotation(bones.shinL, pose.kneeL);
  setRotation(bones.shinR, pose.kneeR);
  applyExpression(parts, pose.expression);
}

/** `BatPose.lengthScale` として使える値(有限の正数)か。0・負・NaN だとバットの行列が縮退するので 1(標準の長さ)に戻す。 */
function usableLengthScale(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/**
 * バットのボーン(`bones.bat`)に `BatPose` を適用する。
 * - 回転: スイング(`sweepYaw` = y 軸)の中にチルト(`tilt` = x 軸)が入る入れ子なので、Euler の順序 YXZ で `(tilt, sweepYaw, 0)`。
 * - 高さ: `position.y = height`(x・z はボーン本来の位置 = 握りのオフセットのまま。伸ばさない)。
 * - 長さ: バット軸(ボーンの局所 +z)の方向だけ `scale.z = lengthScale`。太さ(x・y)は変えない。
 * - 不可視: バットの頂点は体の `SkinnedMesh` に統合されていて個別に隠せないので、ボーンを縮退(拡大率 0)させて見えなくする。
 */
function applyBat(bone: Bone, bat: BatPose): void {
  bone.visible = bat.visible;
  bone.rotation.order = "YXZ";
  bone.rotation.x = bat.tilt;
  bone.rotation.y = bat.sweepYaw;
  bone.rotation.z = 0;
  bone.position.y = bat.height;
  if (bat.visible) {
    bone.scale.set(1, 1, usableLengthScale(bat.lengthScale));
  } else {
    bone.scale.set(0, 0, 0);
  }
}

/** 打者のポーズ。体に加えて、バットの回転・傾き・高さ・長さ・可視を適用する(バットのボーンを持たないキャラクターでは体のみ)。 */
export function applyBatterPose(parts: CharacterParts, pose: BatterPose): void {
  applyPose(parts, pose);
  const bat = parts.bones.bat;
  if (!bat) return;
  applyBat(bat, pose.bat);
}
