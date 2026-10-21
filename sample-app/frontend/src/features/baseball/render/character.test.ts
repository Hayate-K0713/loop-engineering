import { Group, Mesh, MeshToonMaterial } from "three";
import type { Object3D } from "three";
import { describe, expect, it } from "vitest";
import { applyUniforms, buildCharacter, createTeamMaterials } from "./character";
import type { CharacterParts, CharacterStyle } from "./character";
import { DEFAULT_UNIFORMS, createToonGradient } from "./look";
import { makeRig } from "./test-fixtures";

function setup(): { gradient: ReturnType<typeof createToonGradient>; teams: ReturnType<typeof createTeamMaterials> } {
  const gradient = createToonGradient();
  return { gradient, teams: createTeamMaterials(gradient) };
}

function meshCount(root: Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if (object instanceof Mesh) count += 1;
  });
  return count;
}

function usesMaterial(root: Object3D, material: MeshToonMaterial): boolean {
  let found = false;
  root.traverse((object) => {
    if (object instanceof Mesh && object.material === material) found = true;
  });
  return found;
}

function styleOf(accent: MeshToonMaterial, gradient: CharacterStyle["gradient"], overrides: Partial<CharacterStyle> = {}): CharacterStyle {
  return { accent, gradient, glove: false, bat: false, ...overrides };
}

describe("buildCharacter", () => {
  it("joints が全て揃い、関節は root 配下の Group で、メッシュ数が妥当", () => {
    const { gradient, teams } = setup();
    const parts = buildCharacter(makeRig(), styleOf(teams.defense, gradient));
    const joints = Object.values(parts.joints);
    expect(joints).toHaveLength(6);
    for (const joint of joints) {
      expect(joint).toBeInstanceOf(Group);
      expect(joint.parent).not.toBeNull();
    }
    expect(parts.bat).toBeNull();
    expect(meshCount(parts.root)).toBeGreaterThan(20);
    expect(meshCount(parts.root)).toBeLessThan(80);
  });

  it("関節の位置が CharacterRig に追従する", () => {
    const { gradient, teams } = setup();
    const rig = { ...makeRig(), hipX: 0.2, hipY: 0.6, torsoY: 0.7, shoulderX: 0.4, shoulderY: 0.5, headY: 1.1 };
    const { joints } = buildCharacter(rig, styleOf(teams.defense, gradient));
    expect(joints.legL.position.x).toBe(rig.hipX);
    expect(joints.legR.position.x).toBe(-rig.hipX);
    expect(joints.legL.position.y).toBe(rig.hipY);
    expect(joints.torso.position.y).toBe(rig.torsoY);
    expect(joints.armL.position.x).toBe(rig.shoulderX);
    expect(joints.armR.position.y).toBe(rig.shoulderY);
    expect(joints.head.position.y).toBe(rig.headY);
  });

  it("バットは style.bat のときだけ持ち、グローブは style.glove のときだけメッシュが増える", () => {
    const { gradient, teams } = setup();
    const plain = buildCharacter(makeRig(), styleOf(teams.offense, gradient));
    const withBat = buildCharacter(makeRig(), styleOf(teams.offense, gradient, { bat: true }));
    const withGlove = buildCharacter(makeRig(), styleOf(teams.defense, gradient, { glove: true }));
    expect(plain.bat).toBeNull();
    expect(withBat.bat?.swing.children).toContain(withBat.bat?.tilt);
    expect(withBat.root.children).toContain(withBat.bat?.swing);
    expect(meshCount(withBat.root)).toBeGreaterThan(meshCount(plain.root));
    expect(meshCount(withGlove.root)).toBeGreaterThan(meshCount(plain.root));
  });
});

describe("createTeamMaterials / applyUniforms", () => {
  it("攻撃用・守備用の別々の2材質を返し、gradientMap を持つ", () => {
    const { gradient, teams } = setup();
    expect(teams.offense).not.toBe(teams.defense);
    expect(teams.offense.gradientMap).toBe(gradient);
    expect(teams.defense.gradientMap).toBe(gradient);
    expect(teams.offense.color.getHex()).toBe(DEFAULT_UNIFORMS.offense);
    expect(teams.defense.color.getHex()).toBe(DEFAULT_UNIFORMS.defense);
  });

  it("打者は攻撃用、複数の守備側キャラクターは同一の守備用材質を共有する", () => {
    const { gradient, teams } = setup();
    const batter: CharacterParts = buildCharacter(makeRig(), styleOf(teams.offense, gradient, { bat: true }));
    const fielders = [0, 1, 2].map(() => buildCharacter(makeRig(), styleOf(teams.defense, gradient, { glove: true })));
    expect(usesMaterial(batter.root, teams.offense)).toBe(true);
    expect(usesMaterial(batter.root, teams.defense)).toBe(false);
    for (const fielder of fielders) {
      expect(usesMaterial(fielder.root, teams.defense)).toBe(true);
      expect(usesMaterial(fielder.root, teams.offense)).toBe(false);
    }
  });

  it("applyUniforms で2材質の色が指定の色になり、再度呼ぶと入れ替わる", () => {
    const { teams } = setup();
    applyUniforms(teams, { offense: 0x112233, defense: 0xaabbcc });
    expect(teams.offense.color.getHex()).toBe(0x112233);
    expect(teams.defense.color.getHex()).toBe(0xaabbcc);
    applyUniforms(teams, { offense: 0xaabbcc, defense: 0x112233 });
    expect(teams.offense.color.getHex()).toBe(0xaabbcc);
    expect(teams.defense.color.getHex()).toBe(0x112233);
  });
});
