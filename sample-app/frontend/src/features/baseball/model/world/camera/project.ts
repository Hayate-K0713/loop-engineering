import type { CameraPose, Vec3 } from "../../../types/scene";
import type { ScreenRect } from "../../../types/stage";

// ピンホール投影(three の `PerspectiveCamera` + `setViewOffset` と同じ結果になる純粋関数)。three は import しない。
// 縦 FOV `fovDeg`、縦横比 `size.width / size.height`、`lookAt(target)`(上方向は +y)、`lift` は three の
// `setViewOffset(W, H, 0, lift × H, W, H)` と同じく、画面全体を `lift × H` px 上へずらす。

const DEG_TO_RAD = Math.PI / 180;
const UP: Vec3 = { x: 0, y: 1, z: 0 };

/** 描画サイズ(CSS px)。 */
export type ViewSize = { readonly width: number; readonly height: number };

/** 画面座標(キャンバス左上基準の CSS px)。`depth` はカメラの前方向への距離(m)で、0 以下ならカメラの背後(x・y は NaN)。 */
export type ProjectedPoint = { readonly x: number; readonly y: number; readonly depth: number };

/** ゾーン枠の寸法(ワールド m)。`WORLD_PARAMS.zone` と同じ形。 */
export type ZoneBox = { readonly halfWidth: number; readonly bottom: number; readonly top: number; readonly planeZ: number };

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function normalize(a: Vec3): Vec3 {
  const length = Math.hypot(a.x, a.y, a.z);
  return length > 0 ? { x: a.x / length, y: a.y / length, z: a.z / length } : { x: 0, y: 0, z: -1 };
}

/** カメラの前・右・上の正規直交基底。真上/真下を向く場合は右を +x にする。 */
function basisOf(pose: CameraPose): { readonly forward: Vec3; readonly right: Vec3; readonly up: Vec3 } {
  const forward = normalize(sub(pose.target, pose.position));
  const side = cross(forward, UP);
  const right = Math.hypot(side.x, side.y, side.z) > 1e-9 ? normalize(side) : { x: 1, y: 0, z: 0 };
  return { forward, right, up: cross(right, forward) };
}

/**
 * ワールドの点を画面座標へ投影する(`lift` 込み)。
 * `x = (0.5 + 0.5 · ndcX) · W`、`y = (0.5 − 0.5 · ndcY − lift) · H`(下向きが正)。
 */
export function projectPoint(pose: CameraPose, size: ViewSize, point: Vec3): ProjectedPoint {
  const { forward, right, up } = basisOf(pose);
  const rel = sub(point, pose.position);
  const depth = dot(rel, forward);
  if (!(depth > 0)) {
    return { x: Number.NaN, y: Number.NaN, depth };
  }
  const tanHalfV = Math.tan((pose.fovDeg * DEG_TO_RAD) / 2);
  const aspect = size.width / size.height;
  const ndcX = dot(rel, right) / depth / (tanHalfV * aspect);
  const ndcY = dot(rel, up) / depth / tanHalfV;
  return { x: (0.5 + 0.5 * ndcX) * size.width, y: (0.5 - 0.5 * ndcY - pose.lift) * size.height, depth };
}

/** ゾーン枠(ゾーン平面上の矩形)の4隅を投影した画面矩形。 */
export function zoneRectOf(pose: CameraPose, size: ViewSize, zone: ZoneBox): ScreenRect {
  const corners: readonly Vec3[] = [
    { x: -zone.halfWidth, y: zone.bottom, z: zone.planeZ },
    { x: zone.halfWidth, y: zone.bottom, z: zone.planeZ },
    { x: zone.halfWidth, y: zone.top, z: zone.planeZ },
    { x: -zone.halfWidth, y: zone.top, z: zone.planeZ },
  ];
  const projected = corners.map((corner) => projectPoint(pose, size, corner));
  const xs = projected.map((point) => point.x);
  const ys = projected.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}
