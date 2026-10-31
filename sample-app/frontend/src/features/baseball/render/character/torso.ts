// 胴(上着)・腰(ズボン)・ベルト・縞・襟と、背番号を貼る曲面の板。character 分冊 §3-4-4。
// 胴・腰の幅は体格の倍率 `ctx.build`(slim 0.9 / normal 1.0 / stocky 1.15)で変わる(頭の大きさは固定)。
// 上着の頂点には胴の縞(ピンストライプ)用の円筒 UV を付ける(`bodyMaterial.map` を貼ったときだけ効く。他の部品の UV は (0, 0))。
import { BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute } from "three";
import { anchor, tube } from "./geometry-merge";
import type { PartContext, SkinPart } from "./geometry-merge";

/** 上着の高さと半径(胴のボーンの局所。足元から見て骨盤の少し上〜肩)。 */
const JERSEY = { height: 0.56, top: 0.27, bottom: 0.31, depth: 0.9 } as const;

/** 胴のボーンの局所の高さ y での上着の半径(x 方向。体格の倍率を掛ける前)。 */
function jerseyRadiusAt(y: number): number {
  return JERSEY.bottom + ((JERSEY.top - JERSEY.bottom) * y) / JERSEY.height;
}

/** 上着・ベルト・縞・襟(ボーン `torso`)と、ズボンの腰(ボーン `pelvis`)。 */
export function torsoParts(ctx: PartContext): SkinPart[] {
  const { build, colors, detail } = ctx;
  const radial = detail.radial + 4;
  const jersey = tube({ top: JERSEY.top * build, bottom: JERSEY.bottom * build }, JERSEY.height, anchor(ctx, "torso", [0, JERSEY.height / 2, 0]), radial, {
    depth: JERSEY.depth,
  });
  const hips = tube({ top: 0.3 * build, bottom: 0.29 * build }, 0.13, anchor(ctx, "pelvis"), radial, { depth: JERSEY.depth });
  const belt = tube({ top: 0.315 * build, bottom: 0.315 * build }, 0.06, anchor(ctx, "torso", [0, 0.03, 0]), radial, { depth: JERSEY.depth });
  const parts: SkinPart[] = [
    { geometry: jersey, joint: "torso", color: colors.base, shade: [0.8, 1], uv: "cylinder" },
    { geometry: hips, joint: "pelvis", color: colors.pants, shade: [0.85, 1] },
    { geometry: belt, joint: "torso", color: colors.accent, shade: [0.9, 0.9] },
  ];
  if (detail.near) {
    const stripeRadius = (jerseyRadiusAt(0.42) + 0.006) * build;
    const stripe = tube({ top: stripeRadius, bottom: stripeRadius }, 0.045, anchor(ctx, "torso", [0, 0.42, 0]), radial, { depth: JERSEY.depth });
    const collar = tube({ top: 0.17, bottom: 0.19 }, 0.05, anchor(ctx, "torso", [0, JERSEY.height, 0]), radial, { depth: JERSEY.depth });
    parts.push({ geometry: stripe, joint: "torso", color: colors.accent }, { geometry: collar, joint: "torso", color: colors.accent });
  }
  return parts;
}

/** 背番号の貼り板の大きさ(m)と位置(胴のボーンの局所の高さ)。 */
const DECAL = { halfAngle: 0.55, bottomY: 0.19, topY: 0.43, lift: 0.008 } as const;

/**
 * 背番号を貼る曲面の板(胴のボーンの局所座標。背中 = −z の側で上着の表面から少し浮かせる)。
 * UV は上端が v = 0・下端が v = 1(`FACE_PATCH` と同じ向き)、u は背中側から見て右(−x)へ 0 → 1。
 */
export function numberDecalGeometry(ctx: PartContext): BufferGeometry {
  const columns = ctx.detail.decal;
  const radius = jerseyRadiusAt((DECAL.bottomY + DECAL.topY) / 2) * ctx.build + DECAL.lift;
  const rx = radius;
  const rz = radius * JERSEY.depth;
  const position: number[] = [];
  const normal: number[] = [];
  const uv: number[] = [];
  for (const [y, v] of [
    [DECAL.topY, 0],
    [DECAL.bottomY, 1],
  ] as const) {
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const angle = DECAL.halfAngle * (2 * u - 1);
      position.push(-rx * Math.sin(angle), y, -rz * Math.cos(angle));
      const nx = -Math.sin(angle) / rx;
      const nz = -Math.cos(angle) / rz;
      const length = Math.hypot(nx, nz) || 1;
      normal.push(nx / length, 0, nz / length);
      uv.push(u, v);
    }
  }
  const index: number[] = [];
  for (let column = 0; column < columns; column += 1) {
    const a = column;
    const b = a + columns + 1;
    index.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(position, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normal, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  geometry.setIndex(new Uint16BufferAttribute(index, 1));
  return geometry;
}
