import { describe, expect, it } from "vitest";
import { portraitBlendAt } from "../camera/rig";
import { WORLD_PARAMS } from "../space/params";
import { batterSwingPose } from "./batter";
import { batLengthScaleFor, batTipX, batterRootFor } from "./batter-layout";
import { rotateEuler } from "./fk";
import { SWING_CONTACT_PROGRESS } from "./rig";

const BATTER = WORLD_PARAMS.actors.batter;
const LANDSCAPE_ASPECTS = [1, 1.2, 4 / 3, 16 / 9, 2.4];
const PORTRAIT_ASPECTS = [0.3, 0.46, 390 / 844, 0.6, 0.7];
const BETWEEN_ASPECTS = Array.from({ length: 31 }, (_, i) => 0.7 + i * 0.01);

function isNonDecreasing(values: readonly number[]): boolean {
  return values.every((value, i) => i === 0 || value >= (values.at(i - 1) ?? 0));
}

/**
 * バット先端のワールド x を、位置・向き・拡大率から FK で求める(式を使わない独立の計算)。
 * 先端はチルトのグループ(x 回転 tilt)の +z に `0.975 × lengthScale`、スイングのグループ(y 回転 sweepYaw・位置 (0, height, 0.05))を経て、
 * 打者の root(y 回転 yaw・拡大率 scale・位置)に掛かる。
 */
function tipXByFk(aspect: number): number {
  const root = batterRootFor(aspect);
  const bat = batterSwingPose(SWING_CONTACT_PROGRESS, 0.72, portraitBlendAt(aspect)).bat;
  const tilted = rotateEuler({ x: 0, y: 0, z: 0.975 * batLengthScaleFor(aspect) }, { x: bat.tilt, y: 0, z: 0 });
  const swung = rotateEuler(tilted, { x: 0, y: bat.sweepYaw, z: 0 });
  const local = rotateEuler({ x: swung.x, y: swung.y + bat.height, z: swung.z + 0.05 }, { x: 0, y: root.yaw, z: 0 });
  return local.x * root.scale + root.position.x;
}

describe("batterRootFor", () => {
  it.each(LANDSCAPE_ASPECTS)("横長(アスペクト %f ≥ 1.0)は v2 と厳密に同値(x −0.8・scale 0.92・y 0・z 0.05・yaw π/2)", (aspect) => {
    const root = batterRootFor(aspect);
    expect(root.position).toEqual({ x: BATTER.position.x, y: BATTER.position.y, z: BATTER.position.z });
    expect(root.scale).toBeCloseTo(BATTER.scale, 12);
    expect(root.yaw).toBeCloseTo(BATTER.yaw, 12);
    expect(BATTER.position.x).toBeCloseTo(-0.8, 12);
    expect(BATTER.scale).toBeCloseTo(0.92, 12);
  });

  it.each(PORTRAIT_ASPECTS)("縦長(アスペクト %f ≤ 0.7)は x −0.65・scale 0.70", (aspect) => {
    const root = batterRootFor(aspect);
    expect(root.position.x).toBeCloseTo(BATTER.portraitX, 12);
    expect(root.scale).toBeCloseTo(BATTER.portraitScale, 12);
    expect(BATTER.portraitX).toBeCloseTo(-0.65, 12);
    expect(BATTER.portraitScale).toBeCloseTo(0.7, 12);
    expect(root.position.y).toBe(BATTER.position.y);
    expect(root.position.z).toBe(BATTER.position.z);
    expect(root.yaw).toBe(BATTER.yaw);
  });

  it("縦横比の補間域では、x・scale が縦横比の補間 k で横長と縦長を混ぜ、アスペクトについて単調で、端と連続する", () => {
    const roots = BETWEEN_ASPECTS.map(batterRootFor);
    roots.forEach((root, i) => {
      const k = portraitBlendAt(BETWEEN_ASPECTS.at(i) ?? 1);
      expect(root.position.x).toBeCloseTo(BATTER.position.x * (1 - k) + BATTER.portraitX * k, 12);
      expect(root.scale).toBeCloseTo(BATTER.scale * (1 - k) + BATTER.portraitScale * k, 12);
    });
    expect(isNonDecreasing(roots.map((root) => root.scale))).toBe(true);
    expect(isNonDecreasing(roots.map((root) => -root.position.x))).toBe(true);
    const steps = roots.slice(1).map((root, i) => Math.abs(root.scale - (roots.at(i)?.scale ?? root.scale)));
    expect(Math.max(...steps)).toBeLessThan(0.02);
  });

  it("無効な縦横比(NaN・0・負)は横長", () => {
    for (const aspect of [Number.NaN, 0, -1]) {
      expect(batterRootFor(aspect)).toEqual(batterRootFor(16 / 9));
    }
  });

  it("呼び出しごとに新しい値(定数を共有しない)", () => {
    const a = batterRootFor(0.46);
    const b = batterRootFor(0.46);
    expect(a).toEqual(b);
    expect(a.position).not.toBe(b.position);
  });
});

describe("batLengthScaleFor", () => {
  it.each(LANDSCAPE_ASPECTS)("横長(アスペクト %f)は 1.0(v2 と同値)", (aspect) => {
    expect(batLengthScaleFor(aspect)).toBe(BATTER.batLength);
    expect(BATTER.batLength).toBe(1);
  });

  it.each(PORTRAIT_ASPECTS)("縦長(アスペクト %f)は 1.35", (aspect) => {
    expect(batLengthScaleFor(aspect)).toBeCloseTo(BATTER.portraitBatLength, 12);
    expect(BATTER.portraitBatLength).toBeCloseTo(1.35, 12);
  });

  it("補間域は 1.0〜1.35 を縦横比の補間 k で混ぜ、単調", () => {
    const values = BETWEEN_ASPECTS.map(batLengthScaleFor);
    expect(isNonDecreasing([...values].reverse())).toBe(true);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...values)).toBeLessThanOrEqual(1.35);
  });

  it("motion が返す BatPose.lengthScale は標準の長さ 1(延長はレイアウトで frame が差し替える)", () => {
    expect(batterSwingPose(SWING_CONTACT_PROGRESS, 0.72, 1).bat.lengthScale).toBe(1);
  });
});

describe("batTipX(接触の瞬間のバット先端 x)", () => {
  it("縦長(390×844 = 0.462)は +0.301m(設計の手計算 −0.65 + 0.70 × (0.05 + 0.975 × 1.35 × 0.99375))で、ゾーン右端 0.26m の外(≥ +0.28)", () => {
    const tip = batTipX(390 / 844);
    expect(tip).toBeCloseTo(-0.65 + 0.7 * (0.05 + 0.975 * 1.35 * Math.cos(-0.05) * Math.cos(-0.1)), 12);
    expect(tip).toBeCloseTo(0.301, 3);
    expect(tip).toBeGreaterThanOrEqual(0.28);
    expect(tip).toBeGreaterThan(WORLD_PARAMS.zone.halfWidth);
  });

  it("横長は v2 と同値(−0.8 + 0.92 × (0.05 + 0.975 × 1.0 × cos(−0.05) × cos(−0.1)) ≈ 0.137m)", () => {
    expect(batTipX(16 / 9)).toBeCloseTo(-0.8 + 0.92 * (0.05 + 0.975 * Math.cos(-0.05) * Math.cos(-0.1)), 12);
    expect(batTipX(16 / 9)).toBeCloseTo(0.137, 3);
  });

  it("tilt・sweepYaw を渡すと、その姿勢の先端 x(省略時は接触姿勢)", () => {
    expect(batTipX(0.46, -0.05, -0.1)).toBeCloseTo(batTipX(0.46), 12);
    const along = 0.975 * 1.35 * Math.cos(0.3) * Math.cos(-0.4);
    expect(batTipX(0.46, 0.3, -0.4)).toBeCloseTo(-0.65 + 0.7 * (0.05 + along), 12);
    expect(batTipX(0.46, 0.3, -0.4)).toBeLessThan(batTipX(0.46));
  });

  it.each([0.3, 0.46, 0.6, 0.7, 0.75, 0.85, 1, 4 / 3, 16 / 9])("アスペクト %f: FK(回転行列)で求めた先端 x と一致する", (aspect) => {
    expect(batTipX(aspect)).toBeCloseTo(tipXByFk(aspect), 9);
  });

  it("補間域の先端 x は縦横比について単調(縦長の 0.301 から横長の 0.137 へ)で、横長以上", () => {
    const tips = BETWEEN_ASPECTS.map((aspect) => batTipX(aspect));
    expect(isNonDecreasing([...tips].reverse())).toBe(true);
    expect(Math.min(...tips)).toBeGreaterThanOrEqual(batTipX(16 / 9) - 1e-9);
    expect(Math.max(...tips)).toBeLessThanOrEqual(batTipX(0.46) + 1e-9);
  });
});
