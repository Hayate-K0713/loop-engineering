import { readFileSync } from "node:fs";
import { Euler, Quaternion, Vector3 } from "three";
import type { Bone } from "three";
import { describe, expect, it } from "vitest";
import type { Rot3 } from "../types/scene";
import { FACE_PATCH } from "./character/parts";
import { applyLook } from "./character-look";
import { makeFakeParts } from "./fake-parts";
import { applyBatterPose, applyPose } from "./pose-apply";
import { makeBatterPose, makeLookData, makePose } from "./test-fixtures";

function rotationOf(bone: Bone | null): number[] {
  if (!bone) throw new Error("ボーンが無い");
  return bone.rotation.toArray().slice(0, 3).map(Number);
}

function triple(rotation: Rot3): number[] {
  return [rotation.x, rotation.y, rotation.z];
}

describe("applyPose", () => {
  it("root の位置・向き・拡大率・可視が反映される", () => {
    const parts = makeFakeParts();
    const pose = makePose();
    applyPose(parts, pose);
    expect(parts.root.visible).toBe(true);
    expect(parts.root.position.toArray()).toEqual([pose.position.x, pose.position.y, pose.position.z]);
    expect(parts.root.rotation.y).toBe(pose.yaw);
  });

  it("CharacterPose.scale が root の拡大率に反映される", () => {
    const parts = makeFakeParts();
    applyPose(parts, makePose({ scale: 1.3 }));
    expect(parts.root.scale.toArray()).toEqual([1.3, 1.3, 1.3]);
    applyPose(parts, makePose({ scale: 0.7 }));
    expect(parts.root.scale.toArray()).toEqual([0.7, 0.7, 0.7]);
  });

  it("胴・頭・肩・股関節のボーンの回転が反映される", () => {
    const parts = makeFakeParts();
    const pose = makePose();
    applyPose(parts, pose);
    expect(rotationOf(parts.bones.torso)).toEqual(triple(pose.torso));
    expect(rotationOf(parts.bones.head)).toEqual(triple(pose.head));
    expect(rotationOf(parts.bones.upperArmL)).toEqual(triple(pose.armL));
    expect(rotationOf(parts.bones.upperArmR)).toEqual(triple(pose.armR));
    expect(rotationOf(parts.bones.thighL)).toEqual(triple(pose.legL));
    expect(rotationOf(parts.bones.thighR)).toEqual(triple(pose.legR));
  });

  it("肘・膝のボーン(前腕・下腿)の回転が elbowL/R・kneeL/R で反映される", () => {
    const parts = makeFakeParts();
    const pose = makePose({
      elbowL: { x: -0.7, y: 0.1, z: 0 },
      elbowR: { x: -0.9, y: 0, z: 0.2 },
      kneeL: { x: 0.6, y: 0, z: 0 },
      kneeR: { x: 0.4, y: -0.1, z: 0 },
    });
    applyPose(parts, pose);
    expect(rotationOf(parts.bones.foreArmL)).toEqual(triple(pose.elbowL));
    expect(rotationOf(parts.bones.foreArmR)).toEqual(triple(pose.elbowR));
    expect(rotationOf(parts.bones.shinL)).toEqual(triple(pose.kneeL));
    expect(rotationOf(parts.bones.shinR)).toEqual(triple(pose.kneeR));
  });

  it("骨盤・根のボーンはポーズの入力を持たず、回転は恒等のまま", () => {
    const parts = makeFakeParts();
    applyPose(parts, makePose());
    expect(rotationOf(parts.bones.pelvis)).toEqual([0, 0, 0]);
    expect(rotationOf(parts.bones.root)).toEqual([0, 0, 0]);
  });

  it("ボーンの回転は親から見た値(ボーンのワールド回転は親の回転と合成される)", () => {
    const parts = makeFakeParts();
    applyPose(parts, makePose({ yaw: Math.PI / 2, torso: { x: 0, y: 0, z: 0 }, head: { x: 0, y: 0.5, z: 0 } }));
    parts.root.updateMatrixWorld(true);
    const world = parts.bones.head?.getWorldQuaternion(new Quaternion()) ?? new Quaternion();
    const expected = new Quaternion().setFromEuler(new Euler(0, Math.PI / 2 + 0.5, 0));
    expect(world.angleTo(expected)).toBeLessThan(1e-6);
  });

  it("visible=false で root が非表示になり、再度 true で戻る", () => {
    const parts = makeFakeParts();
    applyPose(parts, makePose({ visible: false }));
    expect(parts.root.visible).toBe(false);
    applyPose(parts, makePose({ visible: true }));
    expect(parts.root.visible).toBe(true);
  });

  it("pose.expression が顔のテクスチャの offset に反映され、needsUpdate は立たない", () => {
    const parts = makeFakeParts();
    applyLook(parts, makeLookData());
    const map = parts.faceMaterial.map;
    const version = map?.version;
    applyPose(parts, makePose({ expression: "cheer" }));
    expect(map?.offset.toArray()).toEqual([FACE_PATCH.cheer.offset.x, FACE_PATCH.cheer.offset.y]);
    applyPose(parts, makePose({ expression: "blink" }));
    expect(map?.offset.toArray()).toEqual([FACE_PATCH.blink.offset.x, FACE_PATCH.blink.offset.y]);
    expect(map?.version).toBe(version);
  });

  it("顔のテクスチャが無くても例外にならない", () => {
    const parts = makeFakeParts();
    expect(() => applyPose(parts, makePose({ expression: "shock" }))).not.toThrow();
  });
});

describe("applyBatterPose", () => {
  it("体に加えてバットの回転・高さ・可視が反映される(YXZ 順で tilt が x、sweepYaw が y)", () => {
    const parts = makeFakeParts({ batter: true });
    const pose = makeBatterPose();
    applyBatterPose(parts, pose);
    const bat = parts.bones.bat;
    expect(parts.root.rotation.y).toBe(pose.yaw);
    expect(bat?.rotation.order).toBe("YXZ");
    expect(bat?.rotation.y).toBe(pose.bat.sweepYaw);
    expect(bat?.rotation.x).toBe(pose.bat.tilt);
    expect(bat?.rotation.z).toBe(0);
    expect(bat?.position.y).toBe(pose.bat.height);
    expect(bat?.visible).toBe(true);
    applyBatterPose(parts, { ...pose, bat: { ...pose.bat, visible: false } });
    expect(bat?.visible).toBe(false);
  });

  it("スイング(y 軸)の中にチルト(x 軸)が入る入れ子と同じ向きになる(バット軸 +z の行き先)", () => {
    const parts = makeFakeParts({ batter: true });
    const pose = makeBatterPose();
    applyBatterPose(parts, { ...pose, yaw: 0, bat: { ...pose.bat, sweepYaw: 0.8, tilt: -0.6 } });
    parts.root.updateMatrixWorld(true);
    const axis = new Vector3(0, 0, 1).applyQuaternion(parts.bones.bat?.getWorldQuaternion(new Quaternion()) ?? new Quaternion());
    const nested = new Vector3(0, 0, 1).applyAxisAngle(new Vector3(1, 0, 0), -0.6).applyAxisAngle(new Vector3(0, 1, 0), 0.8);
    expect(axis.distanceTo(nested)).toBeLessThan(1e-6);
  });

  it("lengthScale はバット軸(ボーンの局所 z)だけを拡大し、太さと位置のオフセットは伸ばさない", () => {
    const parts = makeFakeParts({ batter: true });
    const pose = makeBatterPose();
    const bat = parts.bones.bat;
    if (!bat) throw new Error("バットのボーンが無い");
    bat.position.x = 0.02;
    bat.position.z = 0.05;
    applyBatterPose(parts, { ...pose, bat: { ...pose.bat, lengthScale: 1.4 } });
    expect(bat.scale.toArray()).toEqual([1, 1, 1.4]);
    expect(bat.position.x).toBeCloseTo(0.02, 9);
    expect(bat.position.z).toBeCloseTo(0.05, 9);
  });

  it("バットを再表示したとき、直前に隠す前の長さに戻る(隠すための縮退が残らない)", () => {
    const parts = makeFakeParts({ batter: true });
    const pose = makeBatterPose();
    applyBatterPose(parts, { ...pose, bat: { ...pose.bat, visible: false, lengthScale: 1.2 } });
    expect(parts.bones.bat?.scale.toArray()).toEqual([0, 0, 0]);
    applyBatterPose(parts, { ...pose, bat: { ...pose.bat, visible: true, lengthScale: 1.2 } });
    expect(parts.bones.bat?.scale.toArray()).toEqual([1, 1, 1.2]);
  });

  it("lengthScale が 0・負・NaN・無限大のときは標準の長さ(1)に戻す", () => {
    const parts = makeFakeParts({ batter: true });
    const pose = makeBatterPose();
    for (const lengthScale of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      applyBatterPose(parts, { ...pose, bat: { ...pose.bat, lengthScale } });
      expect(parts.bones.bat?.scale.z).toBe(1);
    }
  });

  it("バットのボーンを持たないキャラクターでも体だけ適用して例外にならない", () => {
    const parts = makeFakeParts();
    expect(parts.bones.bat).toBeNull();
    expect(() => applyBatterPose(parts, makeBatterPose())).not.toThrow();
    expect(parts.root.rotation.y).toBe(makeBatterPose().yaw);
  });
});

describe("render セグメントの規約", () => {
  it("pose-apply.ts は document・window・model を使わない", () => {
    const source = readFileSync("src/features/baseball/render/pose-apply.ts", "utf8");
    expect(/\b(document|window)\b/.test(source)).toBe(false);
    expect(/from "\.\.\/(model|hooks|ui)/.test(source)).toBe(false);
  });
});
