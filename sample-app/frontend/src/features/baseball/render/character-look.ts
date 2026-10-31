// キャラクターの顔・背番号・胴の縞・表情を `CharacterParts`(E0 の契約)に貼る。
// 素データ(`CharacterLookData`)は hooks が model から作って渡す。render は model を import しない。
// ここは `CharacterParts` のハンドルだけを触る(造形は E5 の `createCharacterParts`)。
//
// 色について: ユニフォーム・髪・肌の色は頂点カラーで、造形のとき(`createCharacterParts(look, lod)`)に塗られる。
// この関数は頂点カラーを塗り直さない(髪型・体格・色が変わるスロットは、呼び出し側が造形からやり直す)。貼るのはテクスチャだけ。
import type { DataTexture, Texture } from "three";
import type { CharacterLookData, FaceExpression } from "../types/scene";
import { FACE_PATCH } from "./character/parts";
import type { CharacterParts, FacePatchCell } from "./character/parts";
import { acquireSharedTexture, createImageTexture, releaseSharedTexture } from "./textures";

/** 胴の縞(ピンストライプ)のテクスチャの一辺(px)。 */
export const PATTERN_SIZE = 64;

const CELLS: ReadonlyMap<string, FacePatchCell> = new Map(Object.entries(FACE_PATCH));

// キャラクターごとの適用状態。`CharacterParts` の中身には足さず、ここで持つ(契約を増やさない)。
type LookState = {
  expression: FaceExpression;
  /** 直近に `offset` へ書き終えた顔のテクスチャと表情。同じ組の再適用で書き込みを省く。 */
  shownMap: Texture | null;
  shownExpression: FaceExpression | null;
  /** 専有している顔のテクスチャと、その素データ。 */
  face: DataTexture | null;
  faceSource: Uint8Array | null;
  /** 共有している背番号・縞のテクスチャ。 */
  decal: DataTexture | null;
  pattern: DataTexture | null;
};

const states = new WeakMap<CharacterParts, LookState>();

function stateOf(parts: CharacterParts): LookState {
  const existing = states.get(parts);
  if (existing) return existing;
  const created: LookState = { expression: "neutral", shownMap: null, shownExpression: null, face: null, faceSource: null, decal: null, pattern: null };
  states.set(parts, created);
  return created;
}

/** 表情に対応する顔アトラスのセルの範囲を `offset`/`repeat` に書く。`needsUpdate`・再アップロードは行わない。 */
function writeExpression(map: Texture, expression: FaceExpression): void {
  const cell = CELLS.get(expression) ?? FACE_PATCH.neutral;
  map.offset.set(cell.offset.x, cell.offset.y);
  map.repeat.set(cell.repeat.x, cell.repeat.y);
}

/**
 * 表情を切り替える。顔アトラスの `offset`(と `repeat`)を `FACE_PATCH` の値にするだけで、`needsUpdate` は立てない(再アップロードなし)。
 * 顔のテクスチャがまだ無いときは表情だけ覚えておき、`applyLook` で貼ったときに反映する。
 */
export function applyExpression(parts: CharacterParts, expression: FaceExpression): void {
  const state = stateOf(parts);
  const map = parts.faceMaterial.map;
  const unchanged = map !== null && state.shownMap === map && state.shownExpression === expression;
  state.expression = expression;
  if (!map) {
    state.shownMap = null;
    return;
  }
  if (unchanged) return;
  writeExpression(map, expression);
  state.shownMap = map;
  state.shownExpression = expression;
}

function applyFace(parts: CharacterParts, state: LookState, atlas: CharacterLookData["faceAtlas"]): void {
  if (state.face && state.faceSource === atlas.rgba && parts.faceMaterial.map === state.face) return;
  const next = createImageTexture(atlas.rgba, atlas.width, atlas.height, false);
  const hadMap = parts.faceMaterial.map !== null;
  parts.faceMaterial.map = next;
  if (hadMap !== (next !== null)) parts.faceMaterial.needsUpdate = true;
  state.face?.dispose();
  state.face = next;
  state.faceSource = next ? atlas.rgba : null;
  state.shownMap = null;
  applyExpression(parts, state.expression);
}

function applyDecal(parts: CharacterParts, state: LookState, decal: CharacterLookData["numberDecal"]): void {
  const material = parts.decalMaterial;
  const previous = state.decal;
  // 遠景(背番号なし)は貼らない。
  const next = material ? acquireSharedTexture(decal.rgba, decal.width, decal.height, false) : null;
  if (material) {
    const hadMap = material.map !== null;
    material.map = next;
    if (hadMap !== (next !== null)) material.needsUpdate = true;
  }
  state.decal = next;
  if (previous) releaseSharedTexture(previous);
}

function applyPattern(parts: CharacterParts, state: LookState, pattern: Uint8Array | null): void {
  const previous = state.pattern;
  // 縞は近景のみ(背番号を持つ = 近景)。素データが無い(無地のチーム)ときは貼らない。
  const next = pattern && parts.decalMaterial ? acquireSharedTexture(pattern, PATTERN_SIZE, PATTERN_SIZE, true) : null;
  const hadMap = parts.bodyMaterial.map !== null;
  parts.bodyMaterial.map = next;
  if (hadMap !== (next !== null)) parts.bodyMaterial.needsUpdate = true;
  state.pattern = next;
  if (previous) releaseSharedTexture(previous);
}

/**
 * 顔アトラス・背番号・胴の縞を `DataTexture` にして貼る。再呼び出しのたびに、古いテクスチャは破棄する。
 * - 顔: 素データの配列が前回と同じなら作り直さない。別なら新しいテクスチャに替えて古いものを `dispose()`(表情は引き継ぐ)。
 * - 背番号・縞: 素データの配列の同一性でキャッシュし、同じ配列を使う他のキャラクターと共有する(参照数が 0 で破棄)。
 * - フィルタは `LinearFilter`・`LinearMipmapLinearFilter`・`generateMipmaps = true`。
 */
export function applyLook(parts: CharacterParts, data: CharacterLookData): void {
  const state = stateOf(parts);
  applyFace(parts, state, data.faceAtlas);
  applyDecal(parts, state, data.numberDecal);
  applyPattern(parts, state, data.uniform.pattern);
}

/**
 * このモジュールが貼ったテクスチャを破棄してマップを外す。`CharacterParts.dispose()` の前後どちらで呼んでもよい(二重の `dispose()` は無害)。
 * 共有の背番号・縞は、他のキャラクターが使っている間は破棄しない。
 */
export function releaseLook(parts: CharacterParts): void {
  const state = states.get(parts);
  if (!state) return;
  if (state.face && parts.faceMaterial.map === state.face) parts.faceMaterial.map = null;
  state.face?.dispose();
  if (state.decal) {
    if (parts.decalMaterial) parts.decalMaterial.map = null;
    releaseSharedTexture(state.decal);
  }
  if (state.pattern) {
    parts.bodyMaterial.map = null;
    releaseSharedTexture(state.pattern);
  }
  states.delete(parts);
}
