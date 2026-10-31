// キャラクター 1 体の造形(`SkinnedMesh` 方式)。character 分冊 §3-4-10。
// 体(頭・髪・ヘルメット/帽子・胴・腕・脚・靴・グローブ・バット)を自前の `mergeGeometries` で 1 つの `BufferGeometry` に統合し、
// 各頂点を 1 本のボーンに剛体として割り当てて(重み 1.0)、`Skeleton` + `Bone` で 1 つの `SkinnedMesh` にする。
// 輪郭は法線方向に押し出した複製の `SkinnedMesh`(同じ `Skeleton` を共有・`BackSide`)で、近景だけ。顔と背番号は通常の `Mesh`。
// 近景 = 体 1 + 輪郭 1 + 顔 1 + 背番号 1(= 4 draw call。影のパスを除く)、遠景 = 体 1 + 顔 1(= 2)。
//
// 色(肌・髪・ユニフォーム)と髪型・体格は造形のときに頂点カラー・形状として焼く(造形のやり直しで変える)。
// 顔アトラス・背番号・胴の縞のテクスチャは貼らない(`applyLook`(`render/character-look.ts`)が貼る)。貼るまで顔・背番号の板は白い。
// 階調テクスチャ(`gradient`)は呼び出し側(stage)が持つ共有物で、ここでは破棄しない。
import { BackSide, Mesh, MeshBasicMaterial, MeshToonMaterial, SkinnedMesh } from "three";
import type { BufferGeometry, DataTexture } from "three";
import type { BuildKind } from "../../types/team";
import type { CharacterLookData, CharacterSlot } from "../../types/scene";
import type { CharacterRig } from "../../types/stage";
import { OUTLINE_COLOR, PALETTE } from "../look";
import { gearParts } from "./gear";
import { mergeGeometries } from "./geometry-merge";
import type { BodyColors, PartContext, SkinPart } from "./geometry-merge";
import { faceGeometry, headParts } from "./head";
import { hairParts } from "./hair";
import { headwearParts } from "./headwear";
import { limbParts } from "./limbs";
import { detailFor } from "./lod";
import type { CharacterLod } from "./lod";
import { OUTLINE_THICKNESS, createOutlineGeometry } from "./outline";
import { WIPE_LAYER } from "./parts";
import type { CharacterParts } from "./parts";
import { buildSkeleton } from "./skeleton";
import type { CharacterSkeleton } from "./skeleton";
import { numberDecalGeometry, torsoParts } from "./torso";

export type { CharacterLod } from "./lod";

/** 造形に必要な、スロットによらない共有物。 */
export type CharacterEnv = {
  /** 関節の寸法(`CHARACTER_RIG`)。 */
  readonly rig: CharacterRig;
  /** トゥーンの階調テクスチャ(`createToonGradient`。共有。破棄は呼び出し側)。 */
  readonly gradient: DataTexture;
};

/** 肌色のパレット(0〜4。`model/character/look.ts` の `SKIN_PALETTE` と同じ値の複製)。 */
const SKIN_TONES: readonly number[] = [0xffe3cf, 0xf5c9a6, 0xe0a47a, 0xb97a50, 0x7e4c2f];

/** バットの握りの色。 */
const GRIP_COLOR = 0x3a2a22;

/** 体格の幅の倍率(`WORLD_PARAMS.character.build` と同じ値の複製)。 */
function buildWidth(build: BuildKind): number {
  switch (build) {
    case "slim":
      return 0.9;
    case "normal":
      return 1;
    case "stocky":
      return 1.15;
  }
}

function hasGlove(slot: CharacterSlot): boolean {
  return slot === "pitcher" || slot === "catcher" || slot.startsWith("fielder");
}

function colorsOf(look: CharacterLookData): BodyColors {
  const { uniform } = look;
  return {
    skin: SKIN_TONES.at(look.skin) ?? SKIN_TONES.at(1) ?? PALETTE.skin,
    hair: look.hair.color,
    base: uniform.base,
    pants: uniform.pants,
    accent: uniform.accent,
    socks: uniform.socks,
    cap: uniform.cap,
    helmet: uniform.helmet,
    shoe: PALETTE.shoe,
    glove: PALETTE.glove,
    wood: PALETTE.bat,
    grip: GRIP_COLOR,
  };
}

function bodyParts(ctx: PartContext, look: CharacterLookData): SkinPart[] {
  return [...headParts(ctx), ...hairParts(ctx, look.hair.style), ...headwearParts(ctx), ...torsoParts(ctx), ...limbParts(ctx), ...gearParts(ctx)];
}

function overlayMaterial(offset: number, depthWrite: boolean): MeshBasicMaterial {
  return new MeshBasicMaterial({ transparent: true, depthWrite, polygonOffset: true, polygonOffsetFactor: offset, polygonOffsetUnits: offset });
}

type BodyMeshes = {
  readonly body: SkinnedMesh;
  readonly bodyMaterial: MeshToonMaterial;
  readonly outline: SkinnedMesh | null;
  readonly outlineMaterial: MeshBasicMaterial | null;
};

/** 体(と近景なら輪郭)の `SkinnedMesh` を作って `root` に置き、同じ `skeleton` にバインドする。 */
function createBodyMeshes(ctx: PartContext, look: CharacterLookData, rigged: CharacterSkeleton, gradient: DataTexture): BodyMeshes {
  const { root, skeleton } = rigged;
  const geometry = mergeGeometries(bodyParts(ctx, look));
  const bodyMaterial = new MeshToonMaterial({ vertexColors: true, gradientMap: gradient });
  const body = new SkinnedMesh(geometry, bodyMaterial);
  body.name = "body";
  body.castShadow = ctx.detail.near;
  // `SkinnedMesh` の境界球は bind pose から計算されるが、ポーズで大きく動く(バットの振りなど)ので、カリングしない。
  body.frustumCulled = false;
  root.add(body);
  root.updateMatrixWorld(true);
  body.bind(skeleton);
  if (!ctx.detail.near) return { body, bodyMaterial, outline: null, outlineMaterial: null };
  const outlineMaterial = new MeshBasicMaterial({ color: OUTLINE_COLOR, side: BackSide });
  const outline = new SkinnedMesh(createOutlineGeometry(geometry, OUTLINE_THICKNESS), outlineMaterial);
  outline.name = "outline";
  outline.frustumCulled = false;
  root.add(outline);
  // 同じ `Skeleton` を共有する(逆バインド行列は体のものを使う。`bind` に行列を渡すと再計算しない)。
  outline.bind(skeleton, body.bindMatrix);
  return { body, bodyMaterial, outline, outlineMaterial };
}

type Overlays = {
  readonly face: Mesh;
  readonly faceMaterial: MeshBasicMaterial;
  readonly numberDecal: Mesh | null;
  readonly decalMaterial: MeshBasicMaterial | null;
};

/** 顔(頭のボーンの子)と背番号(近景のみ。胴のボーンの子)の通常の `Mesh`。 */
function createOverlays(ctx: PartContext, rigged: CharacterSkeleton): Overlays {
  const faceMaterial = overlayMaterial(-1, true);
  const face = new Mesh(faceGeometry(ctx.detail.face), faceMaterial);
  face.name = "face";
  rigged.bones.head?.add(face);
  if (!ctx.detail.near) return { face, faceMaterial, numberDecal: null, decalMaterial: null };
  const decalMaterial = overlayMaterial(-2, false);
  const numberDecal = new Mesh(numberDecalGeometry(ctx), decalMaterial);
  numberDecal.name = "number";
  rigged.bones.torso?.add(numberDecal);
  return { face, faceMaterial, numberDecal, decalMaterial };
}

/**
 * キャラクター 1 体を作る。`look.slot` から役割が決まる(`batter` = ヘルメット + バット + ボーン 13 本、
 * `pitcher`/`catcher`/`fielder*` = 帽子 + 左手のグローブ、`runner*` = 帽子)。`lod` = `near`(体 + 輪郭 + 顔 + 背番号)・`far`(体 + 顔)。
 * 足元が `root` の原点・向きは +z。ポーズは `bones` の回転(親から見た値)と `root` の位置・`yaw`・`scale` で与える。
 */
export function createCharacterParts(look: CharacterLookData, lod: CharacterLod, env: CharacterEnv): CharacterParts {
  const batter = look.slot === "batter";
  const detail = detailFor(lod);
  const build = buildWidth(look.build);
  const rigged = buildSkeleton(env.rig, build, batter);
  const ctx: PartContext = { rig: env.rig, origins: rigged.origins, build, detail, colors: colorsOf(look), batter, glove: hasGlove(look.slot) };
  const { body, bodyMaterial, outline, outlineMaterial } = createBodyMeshes(ctx, look, rigged, env.gradient);
  const { face, faceMaterial, numberDecal, decalMaterial } = createOverlays(ctx, rigged);
  const { root, skeleton, bones } = rigged;
  const meshes = [body, outline, face, numberDecal].filter((mesh): mesh is Mesh | SkinnedMesh => mesh !== null);
  let disposed = false;
  return {
    root,
    skeleton,
    bones,
    body,
    outline,
    face,
    faceMaterial,
    numberDecal,
    decalMaterial,
    bodyMaterial,
    setWipeLayer(on: boolean): void {
      for (const mesh of meshes) {
        if (on) mesh.layers.enable(WIPE_LAYER);
        else mesh.layers.disable(WIPE_LAYER);
      }
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const geometry of new Set<BufferGeometry>(meshes.map((mesh) => mesh.geometry))) geometry.dispose();
      for (const material of [bodyMaterial, outlineMaterial, faceMaterial, decalMaterial]) {
        material?.map?.dispose();
        material?.dispose();
      }
      skeleton.dispose();
    },
  };
}
