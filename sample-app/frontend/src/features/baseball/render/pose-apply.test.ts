import { describe, expect, it } from "vitest";
import { buildCharacter, createTeamMaterials } from "./character";
import type { CharacterStyle } from "./character";
import { createToonGradient } from "./look";
import { applyBatterPose, applyPose } from "./pose-apply";
import { makeBatterPose, makePose, makeRig } from "./test-fixtures";

function build(overrides: Partial<CharacterStyle> = {}): ReturnType<typeof buildCharacter> {
  const gradient = createToonGradient();
  const teams = createTeamMaterials(gradient);
  return buildCharacter(makeRig(), { accent: teams.defense, gradient, glove: false, bat: false, ...overrides });
}

describe("applyPose", () => {
  it("root の位置・向き・拡大率・可視と、各関節の回転が反映される", () => {
    const parts = build();
    const pose = makePose();
    applyPose(parts, pose);
    expect(parts.root.visible).toBe(true);
    expect(parts.root.position.toArray()).toEqual([pose.position.x, pose.position.y, pose.position.z]);
    expect(parts.root.rotation.y).toBe(pose.yaw);
    expect(parts.root.scale.toArray()).toEqual([pose.scale, pose.scale, pose.scale]);
    expect(parts.joints.torso.rotation.toArray().slice(0, 3)).toEqual([pose.torso.x, pose.torso.y, pose.torso.z]);
    expect(parts.joints.head.rotation.toArray().slice(0, 3)).toEqual([pose.head.x, pose.head.y, pose.head.z]);
    expect(parts.joints.armL.rotation.toArray().slice(0, 3)).toEqual([pose.armL.x, pose.armL.y, pose.armL.z]);
    expect(parts.joints.armR.rotation.toArray().slice(0, 3)).toEqual([pose.armR.x, pose.armR.y, pose.armR.z]);
    expect(parts.joints.legL.rotation.toArray().slice(0, 3)).toEqual([pose.legL.x, pose.legL.y, pose.legL.z]);
    expect(parts.joints.legR.rotation.toArray().slice(0, 3)).toEqual([pose.legR.x, pose.legR.y, pose.legR.z]);
  });

  it("visible=false で root が非表示になり、再度 true で戻る", () => {
    const parts = build();
    applyPose(parts, makePose({ visible: false }));
    expect(parts.root.visible).toBe(false);
    applyPose(parts, makePose({ visible: true }));
    expect(parts.root.visible).toBe(true);
  });
});

describe("applyBatterPose", () => {
  it("体に加えてバットの回転・傾き・高さ・可視が反映される", () => {
    const parts = build({ bat: true });
    const pose = makeBatterPose();
    applyBatterPose(parts, pose);
    expect(parts.root.rotation.y).toBe(pose.yaw);
    expect(parts.bat?.swing.rotation.y).toBe(pose.bat.sweepYaw);
    expect(parts.bat?.tilt.rotation.x).toBe(pose.bat.tilt);
    expect(parts.bat?.swing.position.y).toBe(pose.bat.height);
    expect(parts.bat?.swing.visible).toBe(true);
    applyBatterPose(parts, { ...pose, bat: { ...pose.bat, visible: false } });
    expect(parts.bat?.swing.visible).toBe(false);
  });

  it("バットを持たないキャラクターでも体だけ適用して例外にならない", () => {
    const parts = build();
    expect(() => applyBatterPose(parts, makeBatterPose())).not.toThrow();
    expect(parts.root.rotation.y).toBe(makeBatterPose().yaw);
  });
});
