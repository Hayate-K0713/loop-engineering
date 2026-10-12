import { ColorManagement, Color, LinearSRGBColorSpace, NearestFilter, PCFShadowMap, RedFormat } from "three";
import { describe, expect, it } from "vitest";
import {
  LIFT_FULL_ASPECT,
  LIFT_ZERO_ASPECT,
  LIGHT_LOOK,
  LEGACY_LIGHT_SCALE,
  MIN_HALF_WIDTH_TAN,
  PORTRAIT_LIFT,
  applyRendererLook,
  createToonGradient,
  fovFor,
  framingLift,
  gradientPixels,
  pixelRatioFor,
  rgbaPixels,
} from "./look";
import type { RendererLookTarget } from "./look";

const BASE_FOV = 34;
const RAD_TO_DEG = 180 / Math.PI;
const ASPECTS = [0.4, 0.5, 0.6, 0.75, 0.8, 1, 1.2, 1.6, 2, 3];

describe("色管理", () => {
  it("r128 の描画経路に合わせ、16進の色が変換されずにそのまま保持される", () => {
    expect(ColorManagement.enabled).toBe(false);
    expect(new Color().setHex(0x2f63c8).getHex()).toBe(0x2f63c8);
  });

  it("ライト強度はモックの値に π を掛けた物理単位になっている", () => {
    expect(LIGHT_LOOK.sun.intensity).toBeCloseTo(0.7 * LEGACY_LIGHT_SCALE, 12);
    expect(LIGHT_LOOK.hemisphere.intensity).toBeCloseTo(0.55 * LEGACY_LIGHT_SCALE, 12);
  });
});

describe("fovFor", () => {
  it("max(base, 2·atan(MIN_HALF_WIDTH_TAN / aspect)) に一致する", () => {
    for (const aspect of ASPECTS) {
      const expected = Math.max(BASE_FOV, 2 * Math.atan(MIN_HALF_WIDTH_TAN / aspect) * RAD_TO_DEG);
      expect(fovFor(BASE_FOV, aspect)).toBeCloseTo(expected, 9);
    }
  });

  it("aspect が十分大きいとき base に一致する", () => {
    expect(fovFor(BASE_FOV, 3)).toBe(BASE_FOV);
  });

  it("base を下回らず、縦横比に対して単調非増加", () => {
    const fovs = ASPECTS.map((aspect) => fovFor(BASE_FOV, aspect));
    for (const fov of fovs) expect(fov).toBeGreaterThanOrEqual(BASE_FOV);
    fovs.slice(1).forEach((fov, i) => expect(fov).toBeLessThanOrEqual(fovs.at(i) ?? Infinity));
  });

  it("不正な aspect は base を返す", () => {
    expect(fovFor(BASE_FOV, 0)).toBe(BASE_FOV);
    expect(fovFor(BASE_FOV, Number.NaN)).toBe(BASE_FOV);
  });
});

describe("framingLift", () => {
  it("LIFT_ZERO_ASPECT 以上で 0、LIFT_FULL_ASPECT 以下で PORTRAIT_LIFT", () => {
    expect(framingLift(LIFT_ZERO_ASPECT)).toBe(0);
    expect(framingLift(LIFT_ZERO_ASPECT + 1)).toBe(0);
    expect(framingLift(LIFT_FULL_ASPECT)).toBe(PORTRAIT_LIFT);
    expect(framingLift(LIFT_FULL_ASPECT / 2)).toBe(PORTRAIT_LIFT);
  });

  it("その間は単調非増加で [0, PORTRAIT_LIFT] に収まる", () => {
    const lifts = ASPECTS.map((aspect) => framingLift(aspect));
    for (const lift of lifts) {
      expect(lift).toBeGreaterThanOrEqual(0);
      expect(lift).toBeLessThanOrEqual(PORTRAIT_LIFT);
    }
    lifts.slice(1).forEach((lift, i) => expect(lift).toBeLessThanOrEqual(lifts.at(i) ?? Infinity));
  });

  it("中間の縦横比では線形に補間される", () => {
    const mid = (LIFT_FULL_ASPECT + LIFT_ZERO_ASPECT) / 2;
    expect(framingLift(mid)).toBeCloseTo(PORTRAIT_LIFT / 2, 12);
  });
});

describe("pixelRatioFor", () => {
  it("low は常に 1、normal は 2 を上限にデバイス比を使う", () => {
    expect(pixelRatioFor("low", 3)).toBe(1);
    expect(pixelRatioFor("normal", 3)).toBe(Math.min(2, 3));
    expect(pixelRatioFor("normal", 1.5)).toBe(1.5);
    expect(pixelRatioFor("normal", 0)).toBe(1);
  });
});

describe("applyRendererLook", () => {
  const makeTarget = (): RendererLookTarget => ({ outputColorSpace: "srgb", shadowMap: { enabled: false, type: 3 } });

  it("線形出力と PCFShadowMap に設定し、影は normal のときだけ有効", () => {
    const normal = makeTarget();
    applyRendererLook(normal, "normal");
    expect(normal.outputColorSpace).toBe(LinearSRGBColorSpace);
    expect(normal.shadowMap.type).toBe(PCFShadowMap);
    expect(normal.shadowMap.enabled).toBe(true);
    const low = makeTarget();
    applyRendererLook(low, "low");
    expect(low.shadowMap.enabled).toBe(false);
  });
});

describe("ピクセル列", () => {
  it("rgbaPixels は RGBA で行順に並び、alpha は 255", () => {
    const pixels = rgbaPixels(2, 2, (x, y) => (y === 0 ? 0x102030 : 0x405060 + x));
    expect(Array.from(pixels)).toEqual([0x10, 0x20, 0x30, 255, 0x10, 0x20, 0x30, 255, 0x40, 0x50, 0x60, 255, 0x40, 0x50, 0x61, 255]);
  });

  it("gradientPixels は長さが height × 4 で、両端が先頭と末尾の色", () => {
    const stops = [0x3a7bd5, 0x8cc5f2, 0xf3e7c9];
    const pixels = gradientPixels(stops, 256);
    expect(pixels).toHaveLength(256 * 4);
    expect(Array.from(pixels.slice(0, 4))).toEqual([0x3a, 0x7b, 0xd5, 255]);
    expect(Array.from(pixels.slice(-4))).toEqual([0xf3, 0xe7, 0xc9, 255]);
  });

  it("gradientPixels の中間は区間ごとに補間される", () => {
    const pixels = gradientPixels([0x000000, 0xffffff], 3);
    expect(Array.from(pixels.slice(4, 8))).toEqual([128, 128, 128, 255]);
  });
});

describe("createToonGradient", () => {
  it("3段の RedFormat・NearestFilter の DataTexture", () => {
    const texture = createToonGradient();
    expect(texture.format).toBe(RedFormat);
    expect(texture.minFilter).toBe(NearestFilter);
    expect(texture.magFilter).toBe(NearestFilter);
    expect(texture.image.width).toBe(3);
    expect(texture.image.height).toBe(1);
    expect(Array.from(texture.image.data)).toEqual([110, 190, 255]);
  });
});
