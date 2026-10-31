// コード生成の画素(RGBA の `Uint8Array`)から `DataTexture` を作る・共有する・破棄する。
// 顔アトラス・背番号・胴の縞はすべて `model/character/raster` が作った素データで、render はこの関数で three のテクスチャにするだけ。
// 頭径 44px 前後ではセル 96px を約 1/2 に縮小するため、`DataTexture` の既定(NearestFilter・mipmap なし)ではちらつく。
// そのため `LinearFilter`・`LinearMipmapLinearFilter`・`generateMipmaps = true` を明示する(character 分冊 §3-4-2)。
import { ClampToEdgeWrapping, DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, UnsignedByteType } from "three";

/** 画素数と配列の長さが合うか(RGBA = 1 画素 4 byte)。合わないテクスチャは作らない(GPU へのアップロードで例外になる)。 */
export function isValidRgba(rgba: Uint8Array, width: number, height: number): boolean {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && rgba.length === width * height * 4;
}

/**
 * RGBA の画素から `DataTexture` を作る(`flipY` は既定の false のまま。データの先頭の行 = 絵の上端)。
 * 画素の配列は参照のまま保持する(コピーしない)。`repeat` が真なら縞のように繰り返す、偽なら端を引き伸ばす(顔・背番号)。
 * 画素が不正(長さが合わない)なら `null`。
 */
export function createImageTexture(rgba: Uint8Array, width: number, height: number, repeat: boolean): DataTexture | null {
  if (!isValidRgba(rgba, width, height)) return null;
  const texture = new DataTexture(rgba, width, height, RGBAFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  texture.wrapT = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

// 共有テクスチャ(背番号・縞)。素データの配列を鍵にし、参照数が 0 になったら破棄する。
// 顔アトラスは表情の切替で `offset` を書き換えるため、キャラクターごとに専有し、ここでは共有しない。
type SharedEntry = {
  readonly key: Uint8Array;
  readonly texture: DataTexture;
  readonly width: number;
  readonly height: number;
  readonly repeat: boolean;
  refs: number;
};

const sharedByData = new WeakMap<Uint8Array, SharedEntry>();
const sharedByTexture = new WeakMap<DataTexture, SharedEntry>();

/**
 * 同じ素データ(配列の同一性)・同じ寸法なら同じテクスチャを返す(参照数 +1)。使い終わったら `releaseSharedTexture`。
 * 画素が不正なら `null`。
 */
export function acquireSharedTexture(rgba: Uint8Array, width: number, height: number, repeat: boolean): DataTexture | null {
  const existing = sharedByData.get(rgba);
  if (existing && existing.width === width && existing.height === height && existing.repeat === repeat) {
    existing.refs += 1;
    return existing.texture;
  }
  const texture = createImageTexture(rgba, width, height, repeat);
  if (!texture) return null;
  const entry: SharedEntry = { key: rgba, texture, width, height, repeat, refs: 1 };
  sharedByData.set(rgba, entry);
  sharedByTexture.set(texture, entry);
  return texture;
}

/** `acquireSharedTexture` の対。参照数が 0 になったら `dispose()` してキャッシュから外す。共有でないテクスチャは即 `dispose()`。 */
export function releaseSharedTexture(texture: DataTexture): void {
  const entry = sharedByTexture.get(texture);
  if (!entry) {
    texture.dispose();
    return;
  }
  entry.refs -= 1;
  if (entry.refs > 0) return;
  texture.dispose();
  sharedByTexture.delete(texture);
  if (sharedByData.get(entry.key) === entry) sharedByData.delete(entry.key);
}
