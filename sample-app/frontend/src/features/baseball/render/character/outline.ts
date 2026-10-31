// 輪郭: 体のジオメトリを頂点の法線方向に押し出した複製(CPU で 1 回だけ作る)。`BackSide` の黒い材質の 2 つ目の `SkinnedMesh` に使い、
// 体と同じ `Skeleton` を共有する(`skinIndex`・`skinWeight` は体と同じ)。character 分冊 §3-4-10。
// 円柱のふたと側面のように同じ位置で法線が割れる頂点は、位置ごとに法線を平均してから押し出す(継ぎ目で殻が割れないように)。
import type { BufferGeometry } from "three";

/** 輪郭の太さ(m)。押し出す距離で、体の大きさによらず一定。 */
export const OUTLINE_THICKNESS = 0.018;

/** 同じ位置とみなす精度(m)。 */
const WELD = 1e-4;

function positionKey(x: number, y: number, z: number): string {
  return `${Math.round(x / WELD)},${Math.round(y / WELD)},${Math.round(z / WELD)}`;
}

/**
 * 体のジオメトリから輪郭用のジオメトリを作る。三角形の数・頂点の並び・`skinIndex`・`skinWeight` は元と同じで、
 * `position` だけを平均した法線の方向に `thickness` 押し出す。`normal`・`color`・`uv` は持たない(`MeshBasicMaterial` に不要)。
 */
export function createOutlineGeometry(body: BufferGeometry, thickness: number = OUTLINE_THICKNESS): BufferGeometry {
  const outline = body.clone();
  const positions = outline.getAttribute("position");
  const normals = outline.getAttribute("normal");
  const sums = new Map<string, [number, number, number]>();
  for (let i = 0; i < positions.count; i += 1) {
    const key = positionKey(positions.getX(i), positions.getY(i), positions.getZ(i));
    const sum = sums.get(key) ?? [0, 0, 0];
    sums.set(key, [sum[0] + normals.getX(i), sum[1] + normals.getY(i), sum[2] + normals.getZ(i)]);
  }
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const [nx, ny, nz] = sums.get(positionKey(x, y, z)) ?? [0, 0, 0];
    const length = Math.hypot(nx, ny, nz) || 1;
    positions.setXYZ(i, x + (nx / length) * thickness, y + (ny / length) * thickness, z + (nz / length) * thickness);
  }
  positions.needsUpdate = true;
  outline.deleteAttribute("normal");
  outline.deleteAttribute("color");
  outline.deleteAttribute("uv");
  outline.computeBoundingBox();
  outline.computeBoundingSphere();
  return outline;
}
