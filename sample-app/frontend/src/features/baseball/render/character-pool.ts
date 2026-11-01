// キャラクターの固定プール(14 体: 近景 4 + 遠景 10)と、足元の影の円盤(`InstancedMesh` 1 つ)。
// 近景 = 投手・捕手・打者・打者走者(runner0)、遠景 = 走者 1〜3 と野手 7 人(character 分冊 §3-4-10)。
// プールは起動時に 14 体を作り(`setLook` を受け取るまでは仮の見た目)、フレームごとにポーズを書く。
// 色・髪型・体格・肌が変わるスロットは造形からやり直し、顔・背番号・縞のテクスチャは `applyLook` で貼る。
// `window`・`document`・`matchMedia` は使わない(DOM に触れるのは `stage.ts` だけ)。
import { CircleGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from "three";
import type { Object3D } from "three";
import type { CharacterLookData, CharacterPose, CharacterSlot, SceneFrame, UniformColors } from "../types/scene";
import { createCharacterParts } from "./character";
import type { CharacterEnv, CharacterLod } from "./character";
import { applyLook, releaseLook } from "./character-look";
import type { CharacterParts } from "./character/parts";
import { MOVING_HOLD_FRAMES, NEAR_SHADOW_ORDER, placeholderLook, shapeKeyOf, tierSettingsFor } from "./look";
import type { TierSettings } from "./look";
import { applyBatterPose, applyPose } from "./pose-apply";

type SlotDef = {
  readonly slot: CharacterSlot;
  readonly lod: CharacterLod;
  readonly poseOf: (frame: SceneFrame) => CharacterPose | undefined;
};

function far(slot: CharacterSlot, poseOf: SlotDef["poseOf"]): SlotDef {
  return { slot, lod: "far", poseOf };
}

/** プールの 14 枠(`SceneFrame` の固定順に対応)。 */
export const SLOT_DEFS: readonly SlotDef[] = [
  { slot: "pitcher", lod: "near", poseOf: (frame) => frame.pitcher },
  { slot: "catcher", lod: "near", poseOf: (frame) => frame.catcher },
  { slot: "batter", lod: "near", poseOf: (frame) => frame.batter },
  { slot: "runner0", lod: "near", poseOf: (frame) => frame.runners.at(0) },
  far("runner1", (frame) => frame.runners.at(1)),
  far("runner2", (frame) => frame.runners.at(2)),
  far("runner3", (frame) => frame.runners.at(3)),
  far("fielder0", (frame) => frame.fielders.at(0)),
  far("fielder1", (frame) => frame.fielders.at(1)),
  far("fielder2", (frame) => frame.fielders.at(2)),
  far("fielder3", (frame) => frame.fielders.at(3)),
  far("fielder4", (frame) => frame.fielders.at(4)),
  far("fielder5", (frame) => frame.fielders.at(5)),
  far("fielder6", (frame) => frame.fielders.at(6)),
];

/** 足元の影の円盤の半径(m。`CharacterPose.scale` を掛ける)と、足元からの浮かせ量(地面・土との z ファイトを避ける)。 */
const DISC = { radius: 0.5, lift: 0.05, opacity: 0.32, segments: 16 } as const;
/** 位置が変わったとみなす最小の移動量(m)。 */
const MOVE_EPSILON = 0.002;

const FLAT = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);

export type PoolEntry = {
  readonly def: SlotDef;
  parts: CharacterParts;
  /** 造形の鍵(`shapeKeyOf`)。同じ鍵なら造形をやり直さない。 */
  shapeKey: string;
  /** `setLook` を受け取ったか(受け取る前は仮の見た目で、`SceneFrame.uniforms` の色に追従する)。 */
  looked: boolean;
  /** 直近のフレームの位置と、そこから動いていないフレーム数(ティア T3 の遠景の表示判定)。 */
  hasPosition: boolean;
  lastX: number;
  lastY: number;
  lastZ: number;
  idleFrames: number;
};

export type CharacterPool = {
  readonly parent: Object3D;
  readonly env: CharacterEnv;
  readonly entries: readonly PoolEntry[];
  readonly discs: InstancedMesh;
  placeholder: UniformColors;
  /** ワイプの対象(その枠だけ `WIPE_LAYER` を有効にしている)。 */
  wipeSlot: CharacterSlot | null;
  settings: TierSettings;
  /** 影マップを使っているか(偽なら近景にも足元の円盤を出す)。 */
  shadowMapOn: boolean;
};

function createEntry(def: SlotDef, env: CharacterEnv, uniforms: UniformColors): PoolEntry {
  const look = placeholderLook(def.slot, uniforms);
  const parts = createCharacterParts(look, def.lod, env);
  parts.root.visible = false;
  return { def, parts, shapeKey: shapeKeyOf(look), looked: false, hasPosition: false, lastX: 0, lastY: 0, lastZ: 0, idleFrames: 0 };
}

function createDiscs(): InstancedMesh {
  const geometry = new CircleGeometry(DISC.radius, DISC.segments);
  const material = new MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: DISC.opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const discs = new InstancedMesh(geometry, material, SLOT_DEFS.length);
  discs.name = "foot-shadows";
  // 位置は毎フレーム変わり、境界球は更新しない。
  discs.frustumCulled = false;
  discs.count = SLOT_DEFS.length;
  return discs;
}

/** 影を落とす近景か(影マップが有効で、ティアが許す数の範囲)。 */
function castsShadow(pool: CharacterPool, entry: PoolEntry): boolean {
  if (!pool.shadowMapOn || entry.def.lod !== "near") return false;
  const rank = NEAR_SHADOW_ORDER.indexOf(entry.def.slot);
  return rank >= 0 && rank < pool.settings.nearCasters;
}

function syncShadow(pool: CharacterPool, entry: PoolEntry): void {
  entry.parts.body.castShadow = castsShadow(pool, entry);
}

/** プールを作って `parent` に並べる。`shadowMapOn` は影マップが有効か(`StageQuality` が `normal` で、ティアが許すとき)。 */
export function createPool(parent: Object3D, env: CharacterEnv, uniforms: UniformColors, shadowMapOn: boolean): CharacterPool {
  const entries = SLOT_DEFS.map((def) => createEntry(def, env, uniforms));
  const discs = createDiscs();
  const pool: CharacterPool = { parent, env, entries, discs, placeholder: uniforms, wipeSlot: null, settings: tierSettingsFor(0), shadowMapOn };
  for (const entry of entries) {
    syncShadow(pool, entry);
    parent.add(entry.parts.root);
  }
  parent.add(discs);
  return pool;
}

export function entryOf(pool: CharacterPool, slot: CharacterSlot): PoolEntry | undefined {
  return pool.entries.find((entry) => entry.def.slot === slot);
}

/** 根の位置・向き・拡大率・可視だけを書く(ティア T2 以降の遠景。ボーンの回転は書かない)。 */
function applyRootOnly(parts: CharacterParts, pose: CharacterPose): void {
  const { root } = parts;
  root.visible = pose.visible;
  root.position.set(pose.position.x, pose.position.y, pose.position.z);
  root.rotation.y = pose.yaw;
  root.scale.setScalar(pose.scale);
}

function trackMotion(entry: PoolEntry, pose: CharacterPose): void {
  const { x, y, z } = pose.position;
  const moved = !entry.hasPosition || Math.hypot(x - entry.lastX, y - entry.lastY, z - entry.lastZ) > MOVE_EPSILON;
  entry.idleFrames = moved ? 0 : entry.idleFrames + 1;
  entry.hasPosition = true;
  entry.lastX = x;
  entry.lastY = y;
  entry.lastZ = z;
}

function applyEntry(pool: CharacterPool, entry: PoolEntry, frame: SceneFrame): void {
  const { parts, def } = entry;
  const pose = def.poseOf(frame);
  if (!pose) {
    parts.root.visible = false;
    return;
  }
  if (def.slot === "batter") applyBatterPose(parts, frame.batter);
  else if (def.lod === "far" && !pool.settings.farJoints) applyRootOnly(parts, pose);
  else applyPose(parts, pose);
  trackMotion(entry, pose);
  if (def.lod === "far" && pool.settings.farMovingOnly && entry.idleFrames > MOVING_HOLD_FRAMES) parts.root.visible = false;
}

const discMatrix = new Matrix4();
const discPosition = new Vector3();
const discScale = new Vector3();

function placeDisc(pool: CharacterPool, entry: PoolEntry, index: number): void {
  const { root } = entry.parts;
  const shown = root.visible && (entry.def.lod === "far" || !pool.shadowMapOn);
  const scale = shown ? root.scale.x * DISC.radius * 2 : 0;
  discPosition.set(root.position.x, root.position.y + DISC.lift, root.position.z);
  discScale.setScalar(scale);
  discMatrix.compose(discPosition, FLAT, discScale);
  pool.discs.setMatrixAt(index, discMatrix);
}

/** フレームのポーズを 14 体に書き、足元の円盤を更新する(位置・向き・拡大率・可視、ボーンの回転、表情)。 */
export function applyPoolFrame(pool: CharacterPool, frame: SceneFrame): void {
  pool.entries.forEach((entry, index) => {
    applyEntry(pool, entry, frame);
    placeDisc(pool, entry, index);
  });
  pool.discs.instanceMatrix.needsUpdate = true;
}

function copyPose(from: CharacterParts, to: CharacterParts): void {
  to.root.visible = from.root.visible;
  to.root.position.copy(from.root.position);
  to.root.rotation.copy(from.root.rotation);
  to.root.scale.copy(from.root.scale);
  const sources = new Map(Object.entries(from.bones));
  for (const [joint, bone] of Object.entries(to.bones)) {
    const source = sources.get(joint);
    if (bone && source) bone.rotation.copy(source.rotation);
  }
}

/** 造形からやり直して同じ枠に差し替える(古い方のテクスチャ・ジオメトリ・スケルトンは破棄する)。 */
function rebuild(pool: CharacterPool, entry: PoolEntry, look: CharacterLookData): void {
  const previous = entry.parts;
  const next = createCharacterParts(look, entry.def.lod, pool.env);
  copyPose(previous, next);
  pool.parent.remove(previous.root);
  pool.parent.add(next.root);
  releaseLook(previous);
  previous.dispose();
  entry.parts = next;
  entry.shapeKey = shapeKeyOf(look);
  syncShadow(pool, entry);
  if (pool.wipeSlot === entry.def.slot) next.setWipeLayer(true);
}

/**
 * 見た目を差し替える。造形に効く値(色・髪型・体格・肌)が変わるときは造形からやり直してから `applyLook` する。
 * 未知のスロットは何もせず `false` を返す。
 */
export function setPoolLook(pool: CharacterPool, slot: CharacterSlot, data: CharacterLookData): boolean {
  const entry = entryOf(pool, slot);
  if (!entry) return false;
  const look = data.slot === slot ? data : { ...data, slot };
  if (shapeKeyOf(look) !== entry.shapeKey) rebuild(pool, entry, look);
  applyLook(entry.parts, look);
  entry.looked = true;
  return true;
}

/** `setLook` を受け取っていない枠を、`SceneFrame.uniforms` の色の仮の見た目に作り直す(色が変わったときだけ)。 */
export function refreshPlaceholders(pool: CharacterPool, uniforms: UniformColors): void {
  if (pool.placeholder.offense === uniforms.offense && pool.placeholder.defense === uniforms.defense) return;
  pool.placeholder = { offense: uniforms.offense, defense: uniforms.defense };
  for (const entry of pool.entries) {
    if (entry.looked) continue;
    const look = placeholderLook(entry.def.slot, pool.placeholder);
    if (shapeKeyOf(look) !== entry.shapeKey) rebuild(pool, entry, look);
  }
}

/** ティアの設定を反映する(影を落とす近景の数・遠景の更新)。レンダラ側(影マップ・画素比)は `stage.ts` が切り替える。 */
export function applyPoolTier(pool: CharacterPool, settings: TierSettings, shadowMapOn: boolean): void {
  pool.settings = settings;
  pool.shadowMapOn = shadowMapOn;
  for (const entry of pool.entries) syncShadow(pool, entry);
}

/** ワイプの対象を切り替える(古い対象の `WIPE_LAYER` を外し、新しい対象に付ける)。`null` = 対象なし。 */
export function setWipeTarget(pool: CharacterPool, slot: CharacterSlot | null): void {
  if (pool.wipeSlot === slot) return;
  if (pool.wipeSlot !== null) entryOf(pool, pool.wipeSlot)?.parts.setWipeLayer(false);
  const next = slot === null ? undefined : entryOf(pool, slot);
  next?.parts.setWipeLayer(true);
  pool.wipeSlot = next ? slot : null;
}

/** 1 体あたりの描画オブジェクト数(近景・遠景。`renderer.info` の実測と合わせて見る)。 */
export function meshesPerCharacter(pool: CharacterPool): { readonly near: number; readonly far: number } {
  const count = (lod: CharacterLod): number => {
    const entry = pool.entries.find((item) => item.def.lod === lod);
    let meshes = 0;
    entry?.parts.root.traverse((object) => {
      if ("isMesh" in object) meshes += 1;
    });
    return meshes;
  };
  return { near: count("near"), far: count("far") };
}

/** 全員を破棄する(テクスチャ・ジオメトリ・材質・スケルトン・円盤)。冪等ではないので 1 回だけ呼ぶ。階調テクスチャは呼び出し側。 */
export function disposePool(pool: CharacterPool): void {
  for (const entry of pool.entries) {
    pool.parent.remove(entry.parts.root);
    releaseLook(entry.parts);
    entry.parts.dispose();
  }
  pool.parent.remove(pool.discs);
  pool.discs.geometry.dispose();
  if (!Array.isArray(pool.discs.material)) pool.discs.material.dispose();
  pool.discs.dispose();
}
