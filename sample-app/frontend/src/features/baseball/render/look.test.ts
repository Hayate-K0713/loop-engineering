import { BasicShadowMap, ColorManagement, Color, LinearSRGBColorSpace, NearestFilter, PCFShadowMap, RedFormat } from "three";
import { describe, expect, it } from "vitest";
import {
  LIGHT_LOOK,
  LEGACY_LIGHT_SCALE,
  MAX_PIXEL_RATIO,
  applyRendererLook,
  createToonGradient,
  gradientPixels,
  pixelRatioFor,
  rgbaPixels,
  shadowMapSizeFor,
} from "./look";
import type { RendererLookTarget } from "./look";

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

describe("pixelRatioFor", () => {
  it("low は常に 1、normal は 2 を上限にデバイス比を使う", () => {
    expect(pixelRatioFor("low", 3, false)).toBe(1);
    expect(pixelRatioFor("normal", 3, false)).toBe(MAX_PIXEL_RATIO.fine);
    expect(pixelRatioFor("normal", 1.5, false)).toBe(1.5);
    expect(pixelRatioFor("normal", 0, false)).toBe(1);
    expect(pixelRatioFor("normal", Number.NaN, false)).toBe(1);
  });

  it("coarse(タッチ端末)は 1.5 を上限にし、それ以下のデバイス比はそのまま使う", () => {
    expect(MAX_PIXEL_RATIO.coarse).toBeLessThanOrEqual(1.5);
    expect(pixelRatioFor("normal", 3, true)).toBe(MAX_PIXEL_RATIO.coarse);
    expect(pixelRatioFor("normal", 2, true)).toBe(MAX_PIXEL_RATIO.coarse);
    expect(pixelRatioFor("normal", 1.25, true)).toBe(1.25);
    expect(pixelRatioFor("normal", 1, true)).toBe(1);
    expect(pixelRatioFor("low", 3, true)).toBe(1);
  });

  it("coarse でも上限は fine を超えない", () => {
    for (const dpr of [0.5, 1, 1.5, 2, 3]) {
      expect(pixelRatioFor("normal", dpr, true)).toBeLessThanOrEqual(pixelRatioFor("normal", dpr, false));
    }
  });
});

describe("shadowMapSizeFor", () => {
  it("coarse は 1024、それ以外は LIGHT_LOOK.sun.shadow.mapSize", () => {
    expect(shadowMapSizeFor(true)).toBe(1024);
    expect(shadowMapSizeFor(false)).toBe(LIGHT_LOOK.sun.shadow.mapSize);
  });
});

describe("applyRendererLook", () => {
  const makeTarget = (): RendererLookTarget => ({ outputColorSpace: "srgb", shadowMap: { enabled: false, type: BasicShadowMap } });

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
    expect(Array.from(texture.image.data ?? [])).toEqual([110, 190, 255]);
  });
});
