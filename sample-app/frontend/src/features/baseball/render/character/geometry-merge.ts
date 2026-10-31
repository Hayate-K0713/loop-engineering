// 剛体の部品(頭・髪・胴・腕・脚・バットなど)を 1 つの `BufferGeometry` に統合する。three の `BufferGeometryUtils` は使わない。
// 各部品の頂点は 1 本のボーンだけに重み 1.0 で割り当てる(`skinIndex` = `JOINT_ORDER` の添字・`skinWeight` = (1, 0, 0, 0))。
// 統合の後に `SkinnedMesh#bind(skeleton)` を呼ぶこと(部品の座標は「バインド姿勢の root 空間」で書く)。
import {
  Box3,
  BufferGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Uint16BufferAttribute,
  Uint32BufferAttribute,
  Vector3,
} from "three";
import type { CharacterJoint } from "../../types/scene";
import type { CharacterRig } from "../../types/stage";
import type { Detail } from "./lod";
import { JOINT_ORDER } from "./parts";

export type Triple = readonly [number, number, number];

export const ZERO: Triple = [0, 0, 0];

/** 体の色(24bit RGB)。頂点カラーとして焼く。 */
export type BodyColors = {
  readonly skin: number;
  readonly hair: number;
  readonly base: number;
  readonly pants: number;
  readonly accent: number;
  readonly socks: number;
  readonly cap: number;
  readonly helmet: number;
  readonly shoe: number;
  readonly glove: number;
  readonly wood: number;
  readonly grip: number;
};

/** 部品を作る関数が共通で受け取る文脈。 */
export type PartContext = {
  readonly rig: CharacterRig;
  /** 各ボーンのバインド姿勢での位置(root 空間)。 */
  readonly origins: ReadonlyMap<CharacterJoint, Triple>;
  /** 体格の幅の倍率(slim 0.9 / normal 1.0 / stocky 1.15)。 */
  readonly build: number;
  readonly detail: Detail;
  readonly colors: BodyColors;
  /** 打者(ヘルメットとバット)。 */
  readonly batter: boolean;
  /** 左手のグローブ(投手・捕手・野手)。 */
  readonly glove: boolean;
};

/**
 * 統合される 1 部品。`geometry` は位置・法線を持ち、座標はバインド姿勢の root 空間。
 * `shade` = [下端, 上端] の明るさの倍率(部品の高さで補間。裾・脇を暗くする擬似的な陰影)。
 * `uv` = `cylinder` なら胴の縞用に円筒の UV(u = 周方向、v = 上が 0)、`plain` なら (0, 0)。
 */
export type SkinPart = {
  readonly geometry: BufferGeometry;
  readonly joint: CharacterJoint;
  readonly color: number;
  readonly shade?: readonly [number, number];
  readonly uv?: "cylinder" | "plain";
};

/** ボーンの局所の位置を、root 空間の位置にする。 */
export function anchor(ctx: PartContext, joint: CharacterJoint, local: Triple = ZERO): Triple {
  const origin = ctx.origins.get(joint) ?? ZERO;
  return [origin[0] + local[0], origin[1] + local[1], origin[2] + local[2]];
}

function compose(at: Triple, rotation: Triple, scale: Triple): Matrix4 {
  return new Matrix4().compose(new Vector3(...at), new Quaternion().setFromEuler(new Euler(...rotation)), new Vector3(...scale));
}

type Range = readonly [number, number];

type EllipsoidOptions = {
  readonly rotation?: Triple;
  /** 経度(phi)の範囲 [開始, 長さ](rad)。three の `SphereGeometry` と同じ向き(前 = +z は phi = π/2)。 */
  readonly phi?: Range;
  /** 緯度(theta。上の極から)の範囲 [開始, 長さ](rad)。 */
  readonly theta?: Range;
};

/** 楕円体(の一部)。`radii` = 各軸の半径、`at` = 中心。 */
export function ellipsoid(radii: Triple, at: Triple, segments: readonly [number, number], options: EllipsoidOptions = {}): BufferGeometry {
  const [phiStart, phiLength] = options.phi ?? [0, Math.PI * 2];
  const [thetaStart, thetaLength] = options.theta ?? [0, Math.PI];
  const sphere = new SphereGeometry(1, segments[0], segments[1], phiStart, phiLength, thetaStart, thetaLength);
  return sphere.applyMatrix4(compose(at, options.rotation ?? ZERO, radii));
}

type TubeOptions = {
  readonly rotation?: Triple;
  /** 前後(z)方向の倍率(胴を前後に薄くする)。 */
  readonly depth?: number;
  readonly openEnded?: boolean;
  /** 周方向の範囲 [開始, 長さ](rad)。 */
  readonly theta?: Range;
};

/** y 軸方向の円柱(上の半径・下の半径・高さ)。`at` = 中心。 */
export function tube(
  radii: { readonly top: number; readonly bottom: number },
  height: number,
  at: Triple,
  radial: number,
  options: TubeOptions = {},
): BufferGeometry {
  const [thetaStart, thetaLength] = options.theta ?? [0, Math.PI * 2];
  const cylinder = new CylinderGeometry(radii.top, radii.bottom, height, radial, 1, options.openEnded ?? false, thetaStart, thetaLength);
  return cylinder.applyMatrix4(compose(at, options.rotation ?? ZERO, [1, 1, options.depth ?? 1]));
}

function channels(hex: number): readonly [number, number, number] {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];
}

type Buffers = {
  readonly position: number[];
  readonly normal: number[];
  readonly color: number[];
  readonly uv: number[];
  readonly skinIndex: number[];
  readonly skinWeight: number[];
  readonly index: number[];
};

function appendVertices(part: SkinPart, out: Buffers): number {
  const { geometry } = part;
  const positions = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");
  geometry.computeBoundingBox();
  const box = geometry.boundingBox ?? new Box3();
  const height = box.max.y - box.min.y || 1;
  const centerX = (box.min.x + box.max.x) / 2;
  const centerZ = (box.min.z + box.max.z) / 2;
  const [shadeBottom, shadeTop] = part.shade ?? [1, 1];
  const [red, green, blue] = channels(part.color);
  const bone = Math.max(0, JOINT_ORDER.indexOf(part.joint));
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const t = (y - box.min.y) / height;
    const shade = shadeBottom * (1 - t) + shadeTop * t;
    out.position.push(x, y, z);
    out.normal.push(normals.getX(i), normals.getY(i), normals.getZ(i));
    out.color.push(red * shade, green * shade, blue * shade);
    if (part.uv === "cylinder") out.uv.push(Math.atan2(x - centerX, z - centerZ) / (Math.PI * 2) + 0.5, 1 - t);
    else out.uv.push(0, 0);
    out.skinIndex.push(bone, 0, 0, 0);
    out.skinWeight.push(1, 0, 0, 0);
  }
  return positions.count;
}

function appendIndices(geometry: BufferGeometry, base: number, out: number[]): void {
  const { index } = geometry;
  const count = index ? index.count : geometry.getAttribute("position").count;
  for (let i = 0; i < count; i += 1) out.push(base + (index ? index.getX(i) : i));
}

/**
 * 部品を 1 つのジオメトリに統合する。属性は `position`・`normal`・`color`(頂点カラー)・`uv`・`skinIndex`(Uint16)・`skinWeight`(Float32)で、
 * すべて同じ頂点数。統合に使った部品のジオメトリは破棄する。
 */
export function mergeGeometries(parts: readonly SkinPart[]): BufferGeometry {
  const out: Buffers = { position: [], normal: [], color: [], uv: [], skinIndex: [], skinWeight: [], index: [] };
  let base = 0;
  for (const part of parts) {
    const added = appendVertices(part, out);
    appendIndices(part.geometry, base, out.index);
    base += added;
    part.geometry.dispose();
  }
  const merged = new BufferGeometry();
  merged.setAttribute("position", new Float32BufferAttribute(out.position, 3));
  merged.setAttribute("normal", new Float32BufferAttribute(out.normal, 3));
  merged.setAttribute("color", new Float32BufferAttribute(out.color, 3));
  merged.setAttribute("uv", new Float32BufferAttribute(out.uv, 2));
  merged.setAttribute("skinIndex", new Uint16BufferAttribute(out.skinIndex, 4));
  merged.setAttribute("skinWeight", new Float32BufferAttribute(out.skinWeight, 4));
  merged.setIndex(base > 65535 ? new Uint32BufferAttribute(out.index, 1) : new Uint16BufferAttribute(out.index, 1));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}
