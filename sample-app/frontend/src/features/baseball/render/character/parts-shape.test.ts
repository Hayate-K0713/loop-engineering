import { Vector3 } from "three";
import type { BufferGeometry } from "three";
import { describe, expect, it } from "vitest";
import type { HairStyle } from "../../types/team";
import { ellipsoid, mergeGeometries, tube } from "./geometry-merge";
import type { SkinPart } from "./geometry-merge";
import { hairParts } from "./hair";
import { HEAD_RADII, faceGeometry, headParts } from "./head";
import { headwearParts } from "./headwear";
import { triangleCount } from "./lod";
import { createOutlineGeometry } from "./outline";
import { JOINT_ORDER } from "./parts";
import { makeContext } from "./test-context";
import { numberDecalGeometry } from "./torso";

const STYLES: readonly HairStyle[] = ["short", "side", "long", "round", "buzz", "ponytail"];

function points(geometry: BufferGeometry): Vector3[] {
  const position = geometry.getAttribute("position");
  const found: Vector3[] = [];
  for (let i = 0; i < position.count; i += 1) found.push(new Vector3(position.getX(i), position.getY(i), position.getZ(i)));
  return found;
}

function triangles(parts: readonly SkinPart[]): number {
  return parts.reduce((sum, part) => sum + triangleCount(part.geometry), 0);
}

describe("髪(6 種)", () => {
  it("近景は 1 種 ≤ 120 三角形、遠景はさらに少ない。ボーンは head", () => {
    for (const style of STYLES) {
      const near = hairParts(makeContext("near"), style);
      const far = hairParts(makeContext("far"), style);
      expect(triangles(near)).toBeLessThanOrEqual(120);
      expect(triangles(far)).toBeLessThan(triangles(near));
      for (const part of near) expect(part.joint).toBe("head");
    }
  });

  it("髪型ごとに形が違う(頂点の範囲が全て同じにならない)", () => {
    const extents = STYLES.map((style) => {
      const box = mergeGeometries(hairParts(makeContext("near"), style));
      return `${box.boundingBox?.min.y.toFixed(3)}:${box.boundingBox?.min.z.toFixed(3)}:${triangleCount(box)}`;
    });
    expect(new Set(extents).size).toBeGreaterThanOrEqual(5);
  });

  it("髪の殻は顔のパッチ(前 ±55°)にかからない(後ろと横だけ)", () => {
    const ctx = makeContext("near");
    for (const style of ["short", "buzz"] as const) {
      const merged = mergeGeometries(hairParts(ctx, style));
      const head = ctx.origins.get("head") ?? [0, 0, 0];
      const frontMost = Math.max(...points(merged).map((point) => point.z - head[2]));
      expect(frontMost).toBeLessThan(HEAD_RADII[2] * Math.sin(Math.PI / 2 - (55 * Math.PI) / 180) + 0.14);
    }
  });
});

describe("ヘルメット・帽子", () => {
  it("打者のヘルメットは左耳(+x。投手側)にフラップがあり、帽子は左右対称", () => {
    const helmet = mergeGeometries(headwearParts(makeContext("near", { batter: true })));
    const cap = mergeGeometries(headwearParts(makeContext("near")));
    const head = makeContext("near").origins.get("head")?.[0] ?? 0;
    const side = (geometry: BufferGeometry): { left: number; right: number } => {
      const xs = points(geometry).map((point) => point.x - head);
      return { left: Math.max(...xs), right: -Math.min(...xs) };
    };
    expect(side(helmet).left).toBeGreaterThan(side(helmet).right + 0.005);
    expect(side(cap).left).toBeCloseTo(side(cap).right, 6);
  });

  it("頭の外径は素の頭より 4〜12% 大きい(ヘルメット・帽子込み)", () => {
    for (const batter of [true, false]) {
      const ctx = makeContext("near", { batter });
      const wear = mergeGeometries(headwearParts(ctx));
      const width = (wear.boundingBox?.max.x ?? 0) - (wear.boundingBox?.min.x ?? 0);
      const ratio = width / (HEAD_RADII[0] * 2);
      expect(ratio).toBeGreaterThan(1.04);
      expect(ratio).toBeLessThan(1.3);
    }
  });
});

describe("顔のパッチ", () => {
  it("UV はパッチの上端が v = 0・下端が v = 1、u は +x へ 0 → 1。頭の表面の外側 ×1.003", () => {
    const geometry = faceGeometry([12, 8]);
    const position = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    let top = { y: -Infinity, v: 0 };
    let right = { x: -Infinity, u: 0 };
    for (let i = 0; i < position.count; i += 1) {
      if (position.getY(i) > top.y) top = { y: position.getY(i), v: uv.getY(i) };
      if (position.getX(i) > right.x) right = { x: position.getX(i), u: uv.getX(i) };
    }
    expect(top.v).toBe(0);
    expect(right.u).toBe(1);
    const [rx, ry, rz] = HEAD_RADII;
    for (const point of points(geometry)) {
      const inside = (point.x / (rx * 1.003)) ** 2 + (point.y / (ry * 1.003)) ** 2 + (point.z / (rz * 1.003)) ** 2;
      expect(inside).toBeCloseTo(1, 6);
      expect(point.z).toBeGreaterThan(0);
    }
  });

  it("三角形の向きは外向き(+z 側から見て反時計回り)", () => {
    const geometry = faceGeometry([4, 4]);
    const index = geometry.getIndex();
    const position = geometry.getAttribute("position");
    const a = new Vector3(position.getX(index?.getX(0) ?? 0), position.getY(index?.getX(0) ?? 0), position.getZ(index?.getX(0) ?? 0));
    const b = new Vector3(position.getX(index?.getX(1) ?? 0), position.getY(index?.getX(1) ?? 0), position.getZ(index?.getX(1) ?? 0));
    const c = new Vector3(position.getX(index?.getX(2) ?? 0), position.getY(index?.getX(2) ?? 0), position.getZ(index?.getX(2) ?? 0));
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    expect(normal.dot(a)).toBeGreaterThan(0);
  });

  it("頭の部品は近景で あご・耳 を足し、遠景は頭だけ", () => {
    expect(headParts(makeContext("near"))).toHaveLength(4);
    expect(headParts(makeContext("far"))).toHaveLength(1);
  });
});

describe("背番号の板", () => {
  it("背中(−z)側にあり、上端が v = 0・下端が v = 1。u は背中から見て右(−x)へ増える", () => {
    const geometry = numberDecalGeometry(makeContext("near"));
    const position = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    let top = { y: -Infinity, v: 1 };
    let leftMost = { x: Infinity, u: 0 };
    for (let i = 0; i < position.count; i += 1) {
      expect(position.getZ(i)).toBeLessThan(0);
      if (position.getY(i) > top.y) top = { y: position.getY(i), v: uv.getY(i) };
      if (position.getX(i) < leftMost.x) leftMost = { x: position.getX(i), u: uv.getX(i) };
    }
    expect(top.v).toBe(0);
    expect(leftMost.u).toBe(1);
    expect(triangleCount(geometry)).toBeLessThanOrEqual(16);
  });
});

describe("mergeGeometries", () => {
  it("頂点数・三角形の数が部品の合計に一致し、各頂点が指定のボーンだけに重み 1 で割り当たる", () => {
    const parts: SkinPart[] = [
      { geometry: ellipsoid([1, 1, 1], [0, 0, 0], [6, 4]), joint: "head", color: 0xff0000 },
      { geometry: tube({ top: 1, bottom: 1 }, 1, [0, 0, 0], 6), joint: "shinR", color: 0x00ff00, shade: [0.5, 1], uv: "cylinder" },
    ];
    const verticesBefore = parts.reduce((sum, part) => sum + part.geometry.getAttribute("position").count, 0);
    const trianglesBefore = triangles(parts);
    const merged = mergeGeometries(parts);
    expect(merged.getAttribute("position").count).toBe(verticesBefore);
    expect(triangleCount(merged)).toBe(trianglesBefore);
    const skinIndex = merged.getAttribute("skinIndex");
    const first = merged.getAttribute("position").count - 1;
    expect(skinIndex.getX(0)).toBe(JOINT_ORDER.indexOf("head"));
    expect(skinIndex.getX(first)).toBe(JOINT_ORDER.indexOf("shinR"));
    const color = merged.getAttribute("color");
    expect(color.getX(0)).toBeCloseTo(1, 6);
    expect(color.getY(first)).toBeLessThanOrEqual(1);
    expect(color.getY(first)).toBeGreaterThanOrEqual(0.5);
  });

  it("陰影の倍率は部品の高さで補間される(下端 × 下端の倍率、上端 × 上端の倍率)", () => {
    const merged = mergeGeometries([{ geometry: tube({ top: 1, bottom: 1 }, 2, [0, 0, 0], 6), joint: "torso", color: 0xffffff, shade: [0.4, 0.9] }]);
    const position = merged.getAttribute("position");
    const color = merged.getAttribute("color");
    for (let i = 0; i < position.count; i += 1) {
      if (Math.abs(position.getY(i) - 1) < 1e-6) expect(color.getX(i)).toBeCloseTo(0.9, 6);
      if (Math.abs(position.getY(i) + 1) < 1e-6) expect(color.getX(i)).toBeCloseTo(0.4, 6);
    }
  });
});

describe("輪郭のジオメトリ", () => {
  const body = mergeGeometries([
    { geometry: ellipsoid([0.5, 0.5, 0.5], [0, 1, 0], [12, 8]), joint: "head", color: 0xffffff },
    { geometry: tube({ top: 0.3, bottom: 0.3 }, 1, [0, 0, 0], 8), joint: "torso", color: 0xffffff },
  ]);

  it("頂点・三角形・skinIndex・skinWeight は体と同じで、位置だけが外へ一定距離だけ動く", () => {
    const outline = createOutlineGeometry(body, 0.02);
    expect(outline.getAttribute("position").count).toBe(body.getAttribute("position").count);
    expect(triangleCount(outline)).toBe(triangleCount(body));
    expect(Array.from(outline.getAttribute("skinIndex").array)).toEqual(Array.from(body.getAttribute("skinIndex").array));
    expect(Array.from(outline.getAttribute("skinWeight").array)).toEqual(Array.from(body.getAttribute("skinWeight").array));
    for (const name of ["normal", "color", "uv"]) expect(outline.hasAttribute(name)).toBe(false);
    const before = points(body);
    const after = points(outline);
    for (const [index, point] of after.entries()) {
      const moved = point.distanceTo(before.at(index) ?? point);
      expect(moved).toBeCloseTo(0.02, 5);
    }
  });

  it("体の元のジオメトリは変更しない", () => {
    const original = points(body).map((point) => point.toArray());
    createOutlineGeometry(body, 0.05);
    expect(points(body).map((point) => point.toArray())).toEqual(original);
  });
});
