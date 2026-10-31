// 髪(6 種。1 種 ≤ 120 三角形)。ヘルメット・帽子の下から、後ろ髪・もみあげ・うなじが見える(打者の後ろ姿で最も目立つ)。character 分冊 §3-4-3。
// 髪はボーン `head` に付く。頭の楕円体より少し大きい「殻」(後ろ・横の半周)を基本に、スタイルごとの飾りを足す。
import type { BufferGeometry } from "three";
import type { HairStyle } from "../../types/team";
import { anchor, ellipsoid } from "./geometry-merge";
import type { PartContext, SkinPart, Triple } from "./geometry-merge";
import type { Segments } from "./lod";
import { HEAD_RADII } from "./head";

const HAIR_SHADE: readonly [number, number] = [0.82, 1];

/** 髪の殻の経度の範囲(rad)。three の phi で後ろ半分(π〜2π)の両端を少し前(耳の前)まで伸ばす。顔のパッチ(前 ±55°)とは重ならない。 */
const BACK_PHI: readonly [number, number] = [Math.PI - 0.3, Math.PI + 0.6];

function degrees(value: number): number {
  return (value * Math.PI) / 180;
}

/** 頭の楕円体を `scale` 倍した殻。`elevation` = [上端, 下端](度。水平面から上が +)。 */
function shell(ctx: PartContext, scale: number, elevation: readonly [number, number], segments: Segments = ctx.detail.hair): BufferGeometry {
  const [top, bottom] = elevation;
  const radii: Triple = [HEAD_RADII[0] * scale, HEAD_RADII[1] * scale, HEAD_RADII[2] * scale];
  return ellipsoid(radii, anchor(ctx, "head"), segments, { phi: BACK_PHI, theta: [degrees(90 - top), degrees(top - bottom)] });
}

/** 頭のボーンの局所座標で置く飾りの楕円体。 */
function lump(ctx: PartContext, radii: Triple, at: Triple, rotation: Triple = [0, 0, 0]): BufferGeometry {
  return ellipsoid(radii, anchor(ctx, "head", at), [4, 3], { rotation });
}

/** 左右対称のもみあげ(近景のみ)。 */
function sideburns(ctx: PartContext, length: number): BufferGeometry[] {
  if (!ctx.detail.near) return [];
  return [1, -1].map((side) => lump(ctx, [0.045, length, 0.06], [side * 0.44, -0.09 - (length - 0.1) * 0.5, 0.14]));
}

function styleGeometries(ctx: PartContext, style: HairStyle): BufferGeometry[] {
  const near = ctx.detail.near;
  switch (style) {
    case "short":
      return [shell(ctx, 1.03, [30, -24]), ...sideburns(ctx, 0.1)];
    case "side":
      return [shell(ctx, 1.03, [30, -24]), ...sideburns(ctx, 0.1).slice(0, 1), lump(ctx, [0.06, 0.16, 0.14], [-0.45, -0.15, 0.02])];
    case "long":
      return [
        shell(ctx, 1.035, [30, -45], near ? [10, 3] : ctx.detail.hair),
        ellipsoid([0.36, 0.42, 0.15], anchor(ctx, "head", [0, -0.32, -0.33]), near ? [8, 4] : [4, 2]),
      ];
    case "round":
      return [shell(ctx, 1.07, [12, -20]), ...(near ? [1, -1].map((side) => lump(ctx, [0.1, 0.1, 0.1], [side * 0.47, -0.02, -0.06])) : [])];
    case "buzz":
      return [shell(ctx, 1.012, [30, -12])];
    case "ponytail":
      return [
        shell(ctx, 1.03, [30, -24], near ? [10, 3] : ctx.detail.hair),
        ellipsoid([0.12, 0.28, 0.12], anchor(ctx, "head", [0, -0.22, -0.52]), near ? [5, 4] : [4, 3], { rotation: [0.25, 0, 0] }),
        lump(ctx, [0.07, 0.07, 0.07], [0, 0.0, -0.46]),
      ];
  }
}

/** 髪型に応じた部品(ボーン `head`、色 = `colors.hair`)。 */
export function hairParts(ctx: PartContext, style: HairStyle): SkinPart[] {
  return styleGeometries(ctx, style).map((geometry) => ({ geometry, joint: "head" as const, color: ctx.colors.hair, shade: HAIR_SHADE }));
}
