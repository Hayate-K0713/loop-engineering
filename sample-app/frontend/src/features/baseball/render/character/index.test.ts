import { Euler, Group, Matrix4, Mesh, SkinnedMesh, Uint16BufferAttribute, Vector3 } from "three";
import type { BufferGeometry, MeshBasicMaterial, Object3D } from "three";
import { describe, expect, it } from "vitest";
import type { CharacterLookData } from "../../types/scene";
import type { BuildKind } from "../../types/team";
import { createToonGradient } from "../look";
import { makeLookData, makeRig } from "../test-fixtures";
import { createCharacterParts } from "./index";
import type { CharacterLod } from "./index";
import { TRIANGLE_LIMIT, triangleCount } from "./lod";
import { JOINT_ORDER, WIPE_LAYER } from "./parts";
import type { CharacterParts } from "./parts";

const gradient = createToonGradient();

function make(slot: CharacterLookData["slot"], lod: CharacterLod, overrides: Partial<CharacterLookData> = {}): CharacterParts {
  return createCharacterParts(makeLookData({ slot, ...overrides }), lod, { rig: makeRig(), gradient });
}

function meshesOf(root: Object3D): Mesh[] {
  const found: Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof Mesh) found.push(object);
  });
  return found;
}

/** 指定したボーンに割り当てられた頂点の、bind pose の位置。 */
function verticesOfBone(geometry: BufferGeometry, bone: number): Vector3[] {
  const positions = geometry.getAttribute("position");
  const skinIndex = geometry.getAttribute("skinIndex");
  const found: Vector3[] = [];
  for (let i = 0; i < positions.count; i += 1) {
    if (skinIndex.getX(i) === bone) found.push(new Vector3(positions.getX(i), positions.getY(i), positions.getZ(i)));
  }
  return found;
}

function extentX(points: readonly Vector3[]): number {
  const xs = points.map((point) => point.x);
  return Math.max(...xs) - Math.min(...xs);
}

describe("createCharacterParts: メッシュ数(draw call)", () => {
  it("近景は 体 1 + 輪郭 1 + 顔 1 + 背番号 1 = 4(影を除く)", () => {
    const parts = make("pitcher", "near");
    const meshes = meshesOf(parts.root);
    expect(meshes).toHaveLength(4);
    expect(meshes.filter((mesh) => mesh instanceof SkinnedMesh)).toHaveLength(2);
    expect(parts.outline).not.toBeNull();
    expect(parts.numberDecal).not.toBeNull();
    expect(parts.decalMaterial).not.toBeNull();
  });

  it("遠景は 体 1 + 顔 1 = 2(輪郭・背番号なし)", () => {
    const parts = make("fielder3", "far");
    expect(meshesOf(parts.root)).toHaveLength(2);
    expect(parts.outline).toBeNull();
    expect(parts.numberDecal).toBeNull();
    expect(parts.decalMaterial).toBeNull();
  });

  it("体だけが影を落とす(近景のみ。輪郭・顔・背番号は落とさない)", () => {
    const near = make("batter", "near");
    expect(near.body.castShadow).toBe(true);
    for (const mesh of meshesOf(near.root).filter((item) => item !== near.body)) expect(mesh.castShadow).toBe(false);
    expect(make("batter", "far").body.castShadow).toBe(false);
  });
});

describe("createCharacterParts: 三角形", () => {
  const slots: readonly CharacterLookData["slot"][] = ["batter", "pitcher", "catcher", "fielder0", "runner0"];

  it("近景は 体 + 顔 + 背番号 ≤ 4000、輪郭込みで ≤ 6000", () => {
    for (const slot of slots) {
      for (const build of ["slim", "normal", "stocky"] as const) {
        const parts = make(slot, "near", { build });
        const withoutOutline = meshesOf(parts.root)
          .filter((mesh) => mesh !== parts.outline)
          .reduce((sum, mesh) => sum + triangleCount(mesh.geometry), 0);
        const all = meshesOf(parts.root).reduce((sum, mesh) => sum + triangleCount(mesh.geometry), 0);
        expect(withoutOutline).toBeLessThanOrEqual(TRIANGLE_LIMIT.near);
        expect(all).toBeLessThanOrEqual(TRIANGLE_LIMIT.nearWithOutline);
      }
    }
  });

  it("遠景は 体 + 顔 ≤ 1200(全髪型・全体格)", () => {
    for (const style of ["short", "side", "long", "round", "buzz", "ponytail"] as const) {
      for (const build of ["slim", "normal", "stocky"] as const) {
        const parts = make("batter", "far", { build, hair: { style, color: 0x2a1c14 } });
        const total = meshesOf(parts.root).reduce((sum, mesh) => sum + triangleCount(mesh.geometry), 0);
        expect(total).toBeLessThanOrEqual(TRIANGLE_LIMIT.far);
      }
    }
  });

  it("輪郭の三角形の数は体と同じ", () => {
    const parts = make("pitcher", "near");
    expect(triangleCount(parts.outline?.geometry ?? parts.body.geometry)).toBe(triangleCount(parts.body.geometry));
  });
});

describe("createCharacterParts: 体格", () => {
  it("胴の幅(胴のボーンの頂点)が 0.9 : 1.0 : 1.15", () => {
    const width = (build: BuildKind): number => {
      const parts = make("pitcher", "near", { build });
      return extentX(verticesOfBone(parts.body.geometry, JOINT_ORDER.indexOf("torso")));
    };
    const normal = width("normal");
    expect(width("slim") / normal).toBeCloseTo(0.9, 6);
    expect(width("stocky") / normal).toBeCloseTo(1.15, 6);
  });

  it("脚の幅(大腿のボーンの頂点)が 0.9 : 1.0 : 1.15。頭の大きさは体格で変わらない", () => {
    const thigh = JOINT_ORDER.indexOf("thighL");
    const head = JOINT_ORDER.indexOf("head");
    const measure = (build: BuildKind): { leg: number; head: number } => {
      const { body } = make("pitcher", "near", { build });
      return { leg: extentX(verticesOfBone(body.geometry, thigh)), head: extentX(verticesOfBone(body.geometry, head)) };
    };
    const normal = measure("normal");
    expect(measure("slim").leg / normal.leg).toBeCloseTo(0.9, 6);
    expect(measure("stocky").leg / normal.leg).toBeCloseTo(1.15, 6);
    expect(measure("stocky").head).toBeCloseTo(normal.head, 9);
  });
});

describe("createCharacterParts: ボーン・スケルトン", () => {
  it("ボーンは 12 本、打者はバットを加えて 13 本。並びは JOINT_ORDER", () => {
    const pitcher = make("pitcher", "near");
    const batter = make("batter", "near");
    expect(pitcher.skeleton.bones).toHaveLength(12);
    expect(batter.skeleton.bones).toHaveLength(13);
    expect(pitcher.bones.bat).toBeNull();
    expect(batter.bones.bat).not.toBeNull();
    expect(batter.skeleton.bones.map((bone) => bone.name)).toEqual([...JOINT_ORDER]);
    expect(pitcher.skeleton.bones.map((bone) => bone.name)).toEqual(JOINT_ORDER.slice(0, 12));
    expect(make("fielder0", "far").skeleton.bones).toHaveLength(12);
  });

  it("体と輪郭が同じ Skeleton を共有し、bind 行列も同じ", () => {
    const parts = make("batter", "near");
    expect(parts.outline?.skeleton).toBe(parts.skeleton);
    expect(parts.body.skeleton).toBe(parts.skeleton);
    expect(parts.outline?.bindMatrix.equals(parts.body.bindMatrix)).toBe(true);
  });

  it("関節の位置が CharacterRig に追従する(normal の体格)", () => {
    const rig = makeRig();
    const { bones } = make("pitcher", "near");
    expect(bones.pelvis?.position.y).toBeCloseTo(rig.hipY, 9);
    expect(bones.torso?.position.y).toBeCloseTo(rig.torsoY - rig.hipY, 9);
    expect(bones.head?.position.y).toBeCloseTo(rig.headY, 9);
    expect(bones.upperArmL?.position.x).toBeCloseTo(rig.shoulderX, 9);
    expect(bones.upperArmR?.position.x).toBeCloseTo(-rig.shoulderX, 9);
    expect(bones.foreArmL?.position.y).toBeCloseTo(-rig.upperArm, 9);
    expect(bones.thighL?.position.x).toBeCloseTo(rig.hipX, 9);
    expect(bones.shinR?.position.y).toBeCloseTo(-rig.thigh, 9);
  });

  it("顔は頭のボーンの子、背番号は胴のボーンの子(通常の Mesh)", () => {
    const parts = make("catcher", "near");
    expect(parts.face.parent).toBe(parts.bones.head);
    expect(parts.numberDecal?.parent).toBe(parts.bones.torso);
    expect(parts.face).not.toBeInstanceOf(SkinnedMesh);
    expect(parts.numberDecal).not.toBeInstanceOf(SkinnedMesh);
  });

  it("ワイプ用レイヤーを全メッシュ(体・輪郭・顔・背番号)に切り替える", () => {
    const parts = make("pitcher", "near");
    const meshes = meshesOf(parts.root);
    parts.setWipeLayer(true);
    for (const mesh of meshes) expect(mesh.layers.isEnabled(WIPE_LAYER)).toBe(true);
    parts.setWipeLayer(false);
    for (const mesh of meshes) expect(mesh.layers.isEnabled(WIPE_LAYER)).toBe(false);
  });
});

describe("SkinnedMesh の確認事項(r186)", () => {
  it("1. 境界: 体・輪郭は frustumCulled = false(ポーズで大きく動くため)", () => {
    const parts = make("batter", "near");
    expect(parts.body.frustumCulled).toBe(false);
    expect(parts.outline?.frustumCulled).toBe(false);
  });

  it("2. 破棄: ジオメトリ・材質・ボーンのテクスチャが 1 回ずつ。2 回呼んでも増えない", () => {
    const parts = make("batter", "near");
    parts.skeleton.computeBoneTexture();
    const boneTexture = parts.skeleton.boneTexture;
    const events: string[] = [];
    const track = (name: string, resource: { addEventListener(type: "dispose", listener: () => void): void }): void => {
      resource.addEventListener("dispose", () => events.push(name));
    };
    track("body.geometry", parts.body.geometry);
    track("outline.geometry", parts.outline?.geometry ?? parts.body.geometry);
    track("face.geometry", parts.face.geometry);
    track("number.geometry", parts.numberDecal?.geometry ?? parts.face.geometry);
    track("body.material", parts.bodyMaterial);
    if (parts.outline) track("outline.material", parts.outline.material as MeshBasicMaterial);
    track("face.material", parts.faceMaterial);
    track("decal.material", parts.decalMaterial ?? parts.faceMaterial);
    if (boneTexture) track("boneTexture", boneTexture);
    parts.dispose();
    parts.dispose();
    expect(parts.skeleton.boneTexture).toBeNull();
    expect([...new Set(events)].sort()).toEqual(events.slice().sort());
    expect(events).toHaveLength(9);
  });

  it("3. 共有 Skeleton: update() を 1 フレームに 2 回呼んでも同じ結果(体・輪郭が同じ行列を使う)", () => {
    const parts = make("batter", "near");
    const { bones } = parts;
    if (bones.upperArmR) bones.upperArmR.rotation.x = 1.2;
    if (bones.bat) bones.bat.rotation.y = 0.7;
    parts.root.updateMatrixWorld(true);
    parts.skeleton.update();
    const once = Array.from(parts.skeleton.boneMatrices ?? []);
    parts.skeleton.update();
    const twice = Array.from(parts.skeleton.boneMatrices ?? []);
    expect(twice).toEqual(once);
    expect(once).toHaveLength(13 * 16);
  });

  it("4. 属性: skinIndex は Uint16、skinWeight は Float32、全属性が同じ頂点数。重みは 1 本のボーンに 1.0", () => {
    const { body } = make("batter", "near");
    const { geometry } = body;
    const count = geometry.getAttribute("position").count;
    expect(geometry.getAttribute("skinIndex")).toBeInstanceOf(Uint16BufferAttribute);
    expect(geometry.getAttribute("skinIndex").array).toBeInstanceOf(Uint16Array);
    expect(geometry.getAttribute("skinWeight").array).toBeInstanceOf(Float32Array);
    for (const name of ["normal", "color", "uv", "skinIndex", "skinWeight"]) expect(geometry.getAttribute(name).count).toBe(count);
    const weights = geometry.getAttribute("skinWeight");
    const indices = geometry.getAttribute("skinIndex");
    let allRigid = true;
    for (let i = 0; i < count; i += 1) {
      const rigid = weights.getX(i) === 1 && weights.getY(i) === 0 && weights.getZ(i) === 0 && weights.getW(i) === 0;
      if (!rigid || indices.getX(i) >= 13 || indices.getY(i) !== 0) allRigid = false;
    }
    expect(allRigid).toBe(true);
    expect(body.bindMatrix.equals(new Matrix4().identity())).toBe(true);
  });

  it("4. bind pose で頂点は動かず、ボーンを回すとそのボーンの頂点だけが動く(剛体)", () => {
    const parts = make("pitcher", "near");
    const { body, bones } = parts;
    const head = JOINT_ORDER.indexOf("head");
    const positions = body.geometry.getAttribute("position");
    const skinIndex = body.geometry.getAttribute("skinIndex");
    const skinned = (index: number): Vector3 => body.getVertexPosition(index, new Vector3());
    const raw = (index: number): Vector3 => new Vector3(positions.getX(index), positions.getY(index), positions.getZ(index));
    let restDelta = 0;
    for (let i = 0; i < positions.count; i += 1) restDelta = Math.max(restDelta, skinned(i).distanceTo(raw(i)));
    expect(restDelta).toBeLessThan(1e-5);
    if (bones.head) bones.head.rotation.y = 0.8;
    parts.root.updateMatrixWorld(true);
    let headMoved = 0;
    let othersMoved = 0;
    for (let i = 0; i < positions.count; i += 1) {
      const delta = skinned(i).distanceTo(raw(i));
      if (skinIndex.getX(i) === head) headMoved = Math.max(headMoved, delta);
      else othersMoved = Math.max(othersMoved, delta);
    }
    expect(headMoved).toBeGreaterThan(0.1);
    expect(othersMoved).toBeLessThan(1e-5);
  });

  it("4. 輪郭も同じ骨で動く(体の頂点と同じ向きに変形する)", () => {
    const parts = make("pitcher", "near");
    if (parts.bones.thighL) parts.bones.thighL.rotation.x = -0.9;
    parts.root.updateMatrixWorld(true);
    const outline = parts.outline;
    expect(outline).not.toBeNull();
    const thigh = JOINT_ORDER.indexOf("thighL");
    const bodyIndex = parts.body.geometry.getAttribute("skinIndex");
    const moved = (mesh: SkinnedMesh): number => {
      const positions = mesh.geometry.getAttribute("position");
      let total = 0;
      for (let i = 0; i < positions.count; i += 1) {
        if (bodyIndex.getX(i) === thigh)
          total += mesh.getVertexPosition(i, new Vector3()).distanceTo(new Vector3(positions.getX(i), positions.getY(i), positions.getZ(i)));
      }
      return total;
    };
    expect(moved(parts.body)).toBeGreaterThan(1);
    expect(outline ? moved(outline) : 0).toBeGreaterThan(1);
  });

  it("5. 影: 体の SkinnedMesh だけが castShadow(深度パスはスケルトンを使う。three が自動で処理)", () => {
    const parts = make("fielder1", "near");
    expect(parts.body.castShadow).toBe(true);
    expect(parts.outline?.castShadow).toBe(false);
    expect(parts.face.castShadow).toBe(false);
    expect(parts.numberDecal?.castShadow).toBe(false);
  });

  it("6. 体の材質は頂点カラー付きのトゥーン(skinning の指定は不要)で、色の属性を持つ", () => {
    const parts = make("fielder1", "near");
    expect(parts.bodyMaterial.vertexColors).toBe(true);
    expect(parts.bodyMaterial.gradientMap).toBe(gradient);
    expect(parts.body.geometry.getAttribute("color").itemSize).toBe(3);
    expect("skinning" in parts.bodyMaterial).toBe(false);
  });
});

describe("バットのボーン", () => {
  it("swing(y) > tilt(x) > バット(軸 = z。長さ = scale.z)の入れ子と同じ行列になる", () => {
    const parts = make("batter", "near");
    const bat = parts.bones.bat;
    expect(bat?.rotation.order).toBe("YXZ");
    if (!bat) return;
    bat.position.y = 1.2;
    bat.rotation.y = 0.9;
    bat.rotation.x = -0.4;
    bat.scale.z = 1.3;
    parts.root.updateMatrixWorld(true);
    const swing = new Group();
    swing.position.set(0, 1.2, 0.05);
    swing.rotation.y = 0.9;
    const tilt = new Group();
    tilt.rotation.x = -0.4;
    tilt.scale.z = 1.3;
    swing.add(tilt);
    swing.updateMatrixWorld(true);
    const same = bat.matrixWorld.elements.every((value, i) => Math.abs(value - (tilt.matrixWorld.elements.at(i) ?? 0)) < 1e-9);
    expect(same).toBe(true);
    expect(new Euler().setFromRotationMatrix(new Matrix4().extractRotation(bat.matrix), "YXZ").y).toBeCloseTo(0.9, 9);
  });

  it("lengthScale 相当の scale.z はバットの先端を軸方向へ伸ばし、握りの端は動かさない", () => {
    const parts = make("batter", "near");
    const bat = parts.bones.bat;
    const index = JOINT_ORDER.indexOf("bat");
    const points = verticesOfBone(parts.body.geometry, index);
    const tip = points.reduce((best, point) => (point.z > best.z ? point : best), points.at(0) ?? new Vector3());
    const grip = points.reduce((best, point) => (point.z < best.z ? point : best), points.at(0) ?? new Vector3());
    if (bat) bat.scale.z = 2;
    parts.root.updateMatrixWorld(true);
    const positions = parts.body.geometry.getAttribute("position");
    const skinIndex = parts.body.geometry.getAttribute("skinIndex");
    let skinnedTipZ = -Infinity;
    let skinnedGripZ = Infinity;
    for (let i = 0; i < positions.count; i += 1) {
      if (skinIndex.getX(i) !== index) continue;
      const z = parts.body.getVertexPosition(i, new Vector3()).z;
      skinnedTipZ = Math.max(skinnedTipZ, z);
      skinnedGripZ = Math.min(skinnedGripZ, z);
    }
    const origin = 0.05;
    expect(skinnedTipZ).toBeCloseTo(origin + (tip.z - origin) * 2, 5);
    expect(skinnedGripZ).toBeCloseTo(origin + (grip.z - origin) * 2, 5);
    expect(grip.z).toBeGreaterThan(origin - 0.1);
  });

  it("打者以外はバットの頂点を持たない", () => {
    const parts = make("pitcher", "near");
    expect(verticesOfBone(parts.body.geometry, JOINT_ORDER.indexOf("bat"))).toHaveLength(0);
  });
});

describe("役割ごとの造形", () => {
  it("グローブは投手・捕手・野手の前腕(左)に付き、打者・走者には付かない", () => {
    const foreArmL = JOINT_ORDER.indexOf("foreArmL");
    const count = (slot: CharacterLookData["slot"]): number => verticesOfBone(make(slot, "near").body.geometry, foreArmL).length;
    const base = count("runner0");
    expect(count("batter")).toBe(base);
    expect(count("pitcher")).toBeGreaterThan(base);
    expect(count("catcher")).toBeGreaterThan(base);
    expect(count("fielder4")).toBeGreaterThan(base);
  });

  it("全スロットで生成でき、体の頂点の最大高さがおよそ 2.0m(頭・帽子込み)", () => {
    const slots: readonly CharacterLookData["slot"][] = ["pitcher", "catcher", "batter", "runner3", "fielder6"];
    for (const slot of slots) {
      const { body } = make(slot, "near");
      body.geometry.computeBoundingBox();
      const top = body.geometry.boundingBox?.max.y ?? 0;
      expect(top).toBeGreaterThan(1.95);
      expect(top).toBeLessThan(2.15);
    }
  });

  it("色は頂点カラーに焼かれる(ユニフォームの色の頂点が存在する)", () => {
    const { body } = make("pitcher", "near", { uniform: { ...makeLookData().uniform, base: 0x112233 } });
    const color = body.geometry.getAttribute("color");
    let found = false;
    for (let i = 0; i < color.count; i += 1) {
      if (Math.abs(color.getX(i) - 0x11 / 255) < 1e-6 && Math.abs(color.getZ(i) - 0x33 / 255) < 1e-6) found = true;
    }
    expect(found).toBe(true);
  });
});

describe("render/character の import 規約", () => {
  const sources = import.meta.glob<string>("./*.ts", { query: "?raw", import: "default", eager: true });

  it("BufferGeometryUtils・`import * as THREE`・document・window を使わない", () => {
    const files = Object.entries(sources).filter(([name]) => !name.endsWith(".test.ts"));
    expect(files.length).toBeGreaterThan(8);
    for (const [, source] of files) {
      expect(source).not.toMatch(/^import[^\n]*(BufferGeometryUtils|three\/addons|three\/examples)/m);
      expect(source).not.toMatch(/import\s+\*\s+as\s+THREE/);
      expect(source).not.toMatch(/\bdocument\./);
      expect(source).not.toMatch(/\bwindow\./);
    }
  });

  it("render/character は model・hooks・ui・types 以外を import しない(three と render 内と types のみ)", () => {
    const files = Object.entries(sources).filter(([name]) => !name.endsWith(".test.ts"));
    for (const [, source] of files) {
      expect(source).not.toMatch(/from "\.\.\/\.\.\/(model|hooks|ui)/);
    }
  });
});
