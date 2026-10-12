// SceneFrame のポーズを character.ts のキャラクターへ適用する(明示フィールドの代入)。
import type { Group } from "three";
import type { BatterPose, CharacterPose, Rot3 } from "../types/scene";
import type { CharacterParts } from "./character";

function setRotation(joint: Group, rotation: Rot3): void {
  joint.rotation.x = rotation.x;
  joint.rotation.y = rotation.y;
  joint.rotation.z = rotation.z;
}

/** 足元の位置・向き・拡大率・可視と、各関節の回転を適用する。 */
export function applyPose(parts: CharacterParts, pose: CharacterPose): void {
  const { root, joints } = parts;
  root.visible = pose.visible;
  root.position.x = pose.position.x;
  root.position.y = pose.position.y;
  root.position.z = pose.position.z;
  root.rotation.y = pose.yaw;
  root.scale.setScalar(pose.scale);
  setRotation(joints.torso, pose.torso);
  setRotation(joints.head, pose.head);
  setRotation(joints.armL, pose.armL);
  setRotation(joints.armR, pose.armR);
  setRotation(joints.legL, pose.legL);
  setRotation(joints.legR, pose.legR);
}

/** 打者のポーズ。体に加えて、バットの回転・傾き・高さ・可視を適用する(バットを持たないキャラクターでは体のみ)。 */
export function applyBatterPose(parts: CharacterParts, pose: BatterPose): void {
  applyPose(parts, pose);
  if (!parts.bat) return;
  parts.bat.swing.visible = pose.bat.visible;
  parts.bat.swing.rotation.y = pose.bat.sweepYaw;
  parts.bat.swing.position.y = pose.bat.height;
  parts.bat.tilt.rotation.x = pose.bat.tilt;
}
