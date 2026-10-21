// 2頭身トゥーンキャラクターの生成(モックの makePlayer の再現)。MeshToonMaterial + 3段の階調 + 背面法の輪郭線。
// ユニフォームのアクセント色(ベルト・縞・帽子・つば)は共有の材質で、色の更新は `applyUniforms` だけで済む。
// 関節の寸法は CharacterRig から読む(world/motion/rig.ts と二重に持たない)。
import { BackSide, CircleGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshToonMaterial, SphereGeometry } from "three";
import type { BufferGeometry, DataTexture, Material } from "three";
import type { UniformColors } from "../types/scene";
import type { CharacterRig } from "../types/stage";
import { DEFAULT_UNIFORMS, OUTLINE_COLOR, OUTLINE_SCALE, PALETTE } from "./look";

/** 攻撃側・守備側で共有するアクセント材質。打者は `offense`、投手・捕手・野手は `defense` を使う。 */
export type TeamMaterials = {
  readonly offense: MeshToonMaterial;
  readonly defense: MeshToonMaterial;
};

export type CharacterStyle = {
  /** ベルト・縞・帽子・つばに使う共有のアクセント材質(`createTeamMaterials` の `offense`/`defense`)。 */
  readonly accent: MeshToonMaterial;
  /** トゥーンの階調テクスチャ(`createToonGradient`)。 */
  readonly gradient: DataTexture;
  /** 左手にグローブを付ける(投手・捕手・野手)。 */
  readonly glove: boolean;
  /** バットを持つ(打者)。 */
  readonly bat: boolean;
};

export type CharacterJoints = {
  readonly torso: Group;
  readonly head: Group;
  readonly armL: Group;
  readonly armR: Group;
  readonly legL: Group;
  readonly legR: Group;
};

/** バット。`swing` が回転(`BatPose.sweepYaw`)と高さ(`height`)、`tilt` が傾き(`BatPose.tilt`)を持つ。 */
export type BatParts = {
  readonly swing: Group;
  readonly tilt: Group;
};

export type CharacterParts = {
  readonly root: Group;
  readonly joints: CharacterJoints;
  readonly bat: BatParts | null;
};

/** キャラクターごとに共有する材質。 */
type Kit = {
  readonly style: CharacterStyle;
  readonly white: MeshToonMaterial;
  readonly skin: MeshToonMaterial;
  readonly shoe: MeshToonMaterial;
  readonly glove: MeshToonMaterial;
  readonly bat: MeshToonMaterial;
  readonly mark: MeshToonMaterial;
  readonly outline: MeshBasicMaterial;
};

/** 攻撃用・守備用のアクセント材質を作る。色は最初の `applyUniforms` までの仮の値。 */
export function createTeamMaterials(gradient: DataTexture): TeamMaterials {
  return {
    offense: new MeshToonMaterial({ color: DEFAULT_UNIFORMS.offense, gradientMap: gradient }),
    defense: new MeshToonMaterial({ color: DEFAULT_UNIFORMS.defense, gradientMap: gradient }),
  };
}

/** 共有のアクセント材質2つの色を更新する(1回の呼び出しで全キャラクターに反映される。変化があるときだけ呼ぶ)。 */
export function applyUniforms(materials: TeamMaterials, uniforms: UniformColors): void {
  materials.offense.color.setHex(uniforms.offense);
  materials.defense.color.setHex(uniforms.defense);
}

function createKit(style: CharacterStyle): Kit {
  const toon = (color: number): MeshToonMaterial => new MeshToonMaterial({ color, gradientMap: style.gradient });
  return {
    style,
    white: toon(PALETTE.uniformWhite),
    skin: toon(PALETTE.skin),
    shoe: toon(PALETTE.shoe),
    glove: toon(PALETTE.glove),
    bat: toon(PALETTE.bat),
    mark: toon(PALETTE.white),
    outline: new MeshBasicMaterial({ color: OUTLINE_COLOR, side: BackSide }),
  };
}

/** 本体と輪郭線(背面法の拡大コピー)を持つ部品。 */
function part(geometry: BufferGeometry, material: Material, kit: Kit, outline = OUTLINE_SCALE): Group {
  const group = new Group();
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = true;
  group.add(mesh);
  if (outline > 0) {
    const shell = new Mesh(geometry, kit.outline);
    shell.scale.setScalar(outline);
    group.add(shell);
  }
  return group;
}

/** 影も輪郭線も無い小さな飾り(マーク・目・頬)。 */
function decal(geometry: BufferGeometry, material: Material): Mesh {
  return new Mesh(geometry, material);
}

function buildLeg(side: 1 | -1, rig: CharacterRig, kit: Kit): Group {
  const leg = new Group();
  leg.position.set(side * rig.hipX, rig.hipY, 0);
  const thigh = part(new CylinderGeometry(0.11, 0.12, 0.42, 12), kit.white, kit);
  thigh.position.y = -0.2;
  const shoe = part(new SphereGeometry(0.12, 12, 8), kit.shoe, kit);
  shoe.scale.set(1, 0.6, 1.5);
  shoe.position.set(0, -0.44, 0.05);
  leg.add(thigh, shoe);
  return leg;
}

function buildTorso(rig: CharacterRig, kit: Kit): Group {
  const torso = new Group();
  torso.position.y = rig.torsoY;
  const body = part(new CylinderGeometry(0.27, 0.31, 0.55, 18), kit.white, kit);
  body.position.y = 0.27;
  const belt = part(new CylinderGeometry(0.315, 0.315, 0.06, 18), kit.style.accent, kit, 0);
  belt.position.y = 0.03;
  const stripe = part(new CylinderGeometry(0.275, 0.29, 0.05, 18), kit.style.accent, kit, 0);
  stripe.position.y = 0.42;
  torso.add(body, belt, stripe);
  return torso;
}

/** 目(黒目・ハイライト)と頬。`x` は顔の中心からの左右位置。 */
function buildFace(): Mesh[] {
  const eyeMaterial = new MeshBasicMaterial({ color: PALETTE.eye });
  const shineMaterial = new MeshBasicMaterial({ color: PALETTE.white });
  const cheekMaterial = new MeshBasicMaterial({ color: PALETTE.cheek, transparent: true, opacity: 0.6 });
  return [-0.15, 0.15].flatMap((x) => {
    const eye = decal(new SphereGeometry(0.06, 12, 10), eyeMaterial);
    eye.scale.set(0.75, 1.5, 0.5);
    eye.position.set(x, -0.02, 0.43);
    const shine = decal(new SphereGeometry(0.018, 8, 6), shineMaterial);
    shine.position.set(x + 0.015, 0.03, 0.47);
    const cheek = decal(new CircleGeometry(0.06, 16), cheekMaterial);
    cheek.position.set(x * 1.75, -0.13, 0.4);
    cheek.rotation.y = x * 2.2;
    return [eye, shine, cheek];
  });
}

function buildHead(rig: CharacterRig, kit: Kit): Group {
  const head = new Group();
  head.position.y = rig.headY;
  const skull = part(new SphereGeometry(0.46, 28, 20), kit.skin, kit);
  const capTop = part(new SphereGeometry(0.48, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), kit.style.accent, kit);
  capTop.position.y = 0.04;
  const brim = part(new CylinderGeometry(0.3, 0.3, 0.04, 24), kit.style.accent, kit);
  brim.scale.set(1, 1, 0.75);
  brim.position.set(0, 0.08, 0.4);
  brim.rotation.x = 0.12;
  const mark = decal(new CircleGeometry(0.1, 20), kit.mark);
  mark.position.set(0, 0.26, 0.42);
  mark.rotation.x = -0.5;
  head.add(skull, capTop, brim, mark, ...buildFace());
  return head;
}

function buildArm(side: 1 | -1, rig: CharacterRig, kit: Kit, withGlove: boolean): Group {
  const arm = new Group();
  arm.position.set(side * rig.shoulderX, rig.shoulderY, 0);
  const sleeveLength = rig.armLength - 0.04;
  const sleeve = part(new CylinderGeometry(0.075, 0.07, sleeveLength, 10), kit.white, kit);
  sleeve.position.y = -sleeveLength / 2;
  const hand = part(new SphereGeometry(0.1, 12, 10), kit.skin, kit);
  hand.position.y = -rig.armLength;
  arm.add(sleeve, hand);
  if (withGlove) {
    const glove = part(new SphereGeometry(0.14, 12, 10), kit.glove, kit);
    glove.scale.set(1, 1.1, 0.6);
    glove.position.y = -(rig.armLength + 0.02);
    arm.add(glove);
  }
  return arm;
}

function buildBat(kit: Kit): BatParts {
  const swing = new Group();
  swing.position.set(0, 1.0, 0.05);
  const tilt = new Group();
  const bat = part(new CylinderGeometry(0.05, 0.028, 0.95, 12), kit.bat, kit);
  bat.rotation.x = Math.PI / 2;
  bat.position.z = 0.5;
  tilt.add(bat);
  swing.add(tilt);
  return { swing, tilt };
}

/** キャラクター1体を作る。足元が `root` の原点で、ポーズは `pose-apply.ts` が `joints` と `bat` に適用する。 */
export function buildCharacter(rig: CharacterRig, style: CharacterStyle): CharacterParts {
  const kit = createKit(style);
  const root = new Group();
  const legL = buildLeg(1, rig, kit);
  const legR = buildLeg(-1, rig, kit);
  const torso = buildTorso(rig, kit);
  const head = buildHead(rig, kit);
  const armL = buildArm(1, rig, kit, style.glove);
  const armR = buildArm(-1, rig, kit, false);
  torso.add(head, armL, armR);
  root.add(legL, legR, torso);
  const bat = style.bat ? buildBat(kit) : null;
  if (bat) root.add(bat.swing);
  return { root, joints: { torso, head, armL, armR, legL, legR }, bat };
}
