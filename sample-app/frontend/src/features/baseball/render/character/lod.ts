// キャラクターの LOD(近景・遠景)の分割数と三角形の上限。character 分冊 §3-4-10。
// 近景 = 体 + 輪郭 + 顔 + 背番号、遠景 = 体 + 顔(輪郭・背番号・小さな部品なし)。
// 三角形の上限は `WORLD_PARAMS.character.lod`(model)と同じ値の複製(render は model を import しないため)。
import type { BufferGeometry } from "three";

export type CharacterLod = "near" | "far";

/** 三角形の上限。`near` = 体 + 顔 + 背番号、`nearWithOutline` = 輪郭の複製を含む合計、`far` = 体 + 顔。 */
export const TRIANGLE_LIMIT = { near: 4000, nearWithOutline: 6000, far: 1200 } as const;

/** 球・楕円体の分割数(経度, 緯度)。 */
export type Segments = readonly [number, number];

/** LOD ごとの分割数。 */
export type Detail = {
  /** 近景。顎・耳・ロゴ・襟・縞など小さな部品を作る。 */
  readonly near: boolean;
  /** 頭の楕円体。 */
  readonly head: Segments;
  /** 顔のパッチ。 */
  readonly face: Segments;
  /** 帽子・ヘルメットの半球。 */
  readonly dome: Segments;
  /** 小さな球(耳・顎・肩・肘・膝)。 */
  readonly small: Segments;
  /** 手・靴・グローブ・飾りの球。 */
  readonly medium: Segments;
  /** 髪の殻(経度, 緯度)。 */
  readonly hair: Segments;
  /** 円柱の周方向の分割(胴・腕・脚・バット)。 */
  readonly radial: number;
  /** 背番号の貼り板の経度方向の分割。 */
  readonly decal: number;
};

const NEAR_DETAIL: Detail = {
  near: true,
  head: [18, 12],
  face: [12, 8],
  dome: [18, 5],
  small: [8, 5],
  medium: [10, 6],
  hair: [14, 3],
  radial: 12,
  decal: 8,
};

const FAR_DETAIL: Detail = {
  near: false,
  head: [10, 7],
  face: [6, 4],
  dome: [10, 3],
  small: [6, 4],
  medium: [6, 4],
  hair: [8, 2],
  radial: 8,
  decal: 4,
};

export function detailFor(lod: CharacterLod): Detail {
  return lod === "near" ? NEAR_DETAIL : FAR_DETAIL;
}

/** ジオメトリの三角形の数(index があれば index 数 ÷ 3、なければ頂点数 ÷ 3)。 */
export function triangleCount(geometry: BufferGeometry): number {
  const count = geometry.index ? geometry.index.count : geometry.getAttribute("position").count;
  return Math.floor(count / 3);
}
