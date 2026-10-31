// 頭(少し縦長の楕円体 + あご + 耳)と、顔のパッチ(通常の `Mesh` の球面パッチ)。character 分冊 §3-4-2。
// 頭の寸法はモックの頭(半径 0.46)に対し x 1.0・y 0.95・z 0.95。顔のパッチは頭の前面(水平 ±55°・垂直 −35°〜+30°)で、半径 ×1.003。
import { BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute } from "three";
import { anchor, ellipsoid } from "./geometry-merge";
import type { PartContext, SkinPart, Triple } from "./geometry-merge";

/** 頭の楕円体の半径(m)。 */
export const HEAD_RADII: Triple = [0.46, 0.437, 0.437];

/** 顔のパッチの範囲(度)。水平は +z(正面)から ±、垂直は水平面から上を +。 */
const FACE_RANGE = { azimuth: 55, elevationTop: 30, elevationBottom: -35 } as const;

/** 顔のパッチを頭の表面から浮かせる倍率(z ファイティング回避)。 */
const FACE_LIFT = 1.003;

/** 肌色の頂点カラーの陰影([あご側, 頭頂側])。 */
const HEAD_SHADE: readonly [number, number] = [0.94, 1];

/** 頭・あご・耳。ボーンは `head`。 */
export function headParts(ctx: PartContext): SkinPart[] {
  const { detail, colors } = ctx;
  const at = anchor(ctx, "head");
  const parts: SkinPart[] = [{ geometry: ellipsoid(HEAD_RADII, at, detail.head), joint: "head", color: colors.skin, shade: HEAD_SHADE }];
  if (!detail.near) return parts;
  // あごは顔のパッチ(垂直 −35° まで)の内側に収め、パッチの下に少しだけはみ出させる(パッチと同じ面で z ファイティングしないように)。
  parts.push({ geometry: ellipsoid([0.17, 0.11, 0.14], anchor(ctx, "head", [0, -0.34, 0.1]), detail.small), joint: "head", color: colors.skin });
  for (const side of [1, -1]) {
    const geometry = ellipsoid([0.055, 0.09, 0.07], anchor(ctx, "head", [side * 0.455, -0.03, -0.03]), detail.small);
    parts.push({ geometry, joint: "head", color: colors.skin, shade: [0.9, 0.9] });
  }
  return parts;
}

function degrees(value: number): number {
  return (value * Math.PI) / 180;
}

/**
 * 顔のパッチのジオメトリ(頭のボーンの局所座標。頭の中心が原点)。
 * UV は **パッチの上端が v = 0、下端が v = 1**(`FACE_PATCH` の向き)、u は +x(画面の右)へ 0 → 1。三角形は経度×緯度 × 2。
 */
export function faceGeometry(segments: readonly [number, number]): BufferGeometry {
  const [columns, rows] = segments;
  const [rx, ry, rz] = HEAD_RADII;
  const position: number[] = [];
  const normal: number[] = [];
  const uv: number[] = [];
  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    const elevation = degrees(FACE_RANGE.elevationTop * (1 - v) + FACE_RANGE.elevationBottom * v);
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const azimuth = degrees(-FACE_RANGE.azimuth * (1 - u) + FACE_RANGE.azimuth * u);
      const x = rx * Math.cos(elevation) * Math.sin(azimuth);
      const y = ry * Math.sin(elevation);
      const z = rz * Math.cos(elevation) * Math.cos(azimuth);
      position.push(x * FACE_LIFT, y * FACE_LIFT, z * FACE_LIFT);
      const nx = x / (rx * rx);
      const ny = y / (ry * ry);
      const nz = z / (rz * rz);
      const length = Math.hypot(nx, ny, nz) || 1;
      normal.push(nx / length, ny / length, nz / length);
      uv.push(u, v);
    }
  }
  const index: number[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      const b = a + columns + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(position, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normal, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  geometry.setIndex(new Uint16BufferAttribute(index, 1));
  return geometry;
}
