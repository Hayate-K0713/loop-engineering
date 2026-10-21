import type { Vec3 } from "../../../types/scene";

// 3D 座標の最小限のベクトル演算(表示専用の純粋関数)。

/** `a + (b − a) × t`。`t` はクランプしない。`t = 0` は `a`、`t = 1` は `b` に厳密一致する(浮動小数の誤差を残さない)。 */
export function lerp(a: number, b: number, t: number): number {
  return t === 1 ? b : a + (b - a) * t;
}

/** 2点の線形補間。`t = 0` で `a` に厳密一致する。 */
export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

export function addVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** 水平面(XZ)上の距離(y は無視する)。 */
export function distanceXZ(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
