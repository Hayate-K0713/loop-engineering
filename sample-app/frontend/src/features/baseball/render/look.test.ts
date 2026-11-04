import { BasicShadowMap, ColorManagement, Color, LinearSRGBColorSpace, NearestFilter, PCFShadowMap, PerspectiveCamera, RedFormat } from "three";
import { describe, expect, it } from "vitest";
import type { QualityTier } from "../types/scene";
import {
  LIGHT_LOOK,
  LEGACY_LIGHT_SCALE,
  MAX_PIXEL_RATIO,
  applyRendererLook,
  createToonGradient,
  gradientPixels,
  pixelRatioFor,
  pixelRatioForTier,
  placeCamera,
  placeholderLook,
  rgbaPixels,
  shadowMapSizeFor,
  shadowMapSizeForTier,
  shapeKeyOf,
  tierSettingsFor,
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

  it("太陽は打者の背中の右上から。打者(ゾーンの左)の影は左の画面外へ伸び、ゾーン・ボールの上に落ちない", () => {
    const { position, target } = LIGHT_LOOK.sun;
    const travel = { x: target.x - position.x, y: target.y - position.y, z: target.z - position.z };
    // 影は光の進む向きの水平成分へ伸びる。x が負 = 左(ゾーンと反対側)。
    expect(travel.x).toBeLessThan(0);
    expect(Math.abs(travel.x)).toBeGreaterThan(Math.abs(travel.z));
    // 背中側(+z)から照らす(後ろ姿が暗くならない)。
    expect(position.z).toBeGreaterThan(0);
    // 仰角が高く、影は短い(打者の身長 1.8m の影が 1.6m 以内)。
    const elevation = Math.atan2(-travel.y, Math.hypot(travel.x, travel.z));
    expect(1.8 / Math.tan(elevation)).toBeLessThan(1.6);
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

describe("品質ティア", () => {
  it("画素比の上限は T0 1.5・T1 1.25・T2 1.0・T3 0.85(デバイス比とも小さい方を取る)", () => {
    expect([0, 1, 2, 3].map((tier) => tierSettingsFor(tier as QualityTier).pixelRatioCap)).toEqual([1.5, 1.25, 1, 0.85]);
    expect(pixelRatioForTier("normal", 3, false, 0)).toBe(1.5);
    expect(pixelRatioForTier("normal", 1.2, false, 0)).toBeCloseTo(1.2, 9);
    expect(pixelRatioForTier("normal", 3, false, 3)).toBeCloseTo(0.85, 9);
    expect(pixelRatioForTier("low", 3, false, 0)).toBe(1);
  });

  it("影マップは T0 = 基準値・T1 = 512・T2 以降 = 0(影なし)", () => {
    expect([0, 1, 2, 3].map((tier) => shadowMapSizeForTier(tier as QualityTier, 1024))).toEqual([1024, 512, 0, 0]);
    expect(shadowMapSizeForTier(0, 2048)).toBe(2048);
    expect(shadowMapSizeForTier(1, 256)).toBe(256);
  });

  it("近景で影を落とす数は 4・3・0・0、遠景の関節は T2 から止まり、ワイプは T3 でなくなる", () => {
    const settings = [0, 1, 2, 3].map((tier) => tierSettingsFor(tier as QualityTier));
    expect(settings.map((item) => item.nearCasters)).toEqual([4, 3, 0, 0]);
    expect(settings.map((item) => item.farJoints)).toEqual([true, true, false, false]);
    expect(settings.map((item) => item.farMovingOnly)).toEqual([false, false, false, true]);
    expect(settings.map((item) => item.wipe)).toEqual([true, true, true, false]);
  });
});

describe("placeholderLook / shapeKeyOf", () => {
  it("攻撃側のスロットは offense、他は defense の色を着る", () => {
    const uniforms = { offense: 0x112233, defense: 0x445566 };
    expect(placeholderLook("batter", uniforms).uniform.helmet).toBe(0x112233);
    expect(placeholderLook("runner2", uniforms).uniform.cap).toBe(0x112233);
    expect(placeholderLook("pitcher", uniforms).uniform.cap).toBe(0x445566);
    expect(placeholderLook("fielder3", uniforms).uniform.accent).toBe(0x445566);
  });

  it("造形の鍵は色・髪型・体格・肌で変わり、顔のテクスチャ(素データ)では変わらない", () => {
    const base = placeholderLook("pitcher", { offense: 1, defense: 2 });
    expect(shapeKeyOf(base)).toBe(shapeKeyOf({ ...base, faceAtlas: { ...base.faceAtlas, rgba: new Uint8Array(4) } }));
    expect(shapeKeyOf(base)).not.toBe(shapeKeyOf({ ...base, build: "stocky" }));
    expect(shapeKeyOf(base)).not.toBe(shapeKeyOf({ ...base, hair: { ...base.hair, style: "long" } }));
    expect(shapeKeyOf(base)).not.toBe(shapeKeyOf({ ...base, uniform: { ...base.uniform, cap: 0x123456 } }));
  });
});

describe("placeCamera", () => {
  it("姿勢の FOV・位置・縦横比を写し、lift があれば viewOffset を付ける", () => {
    const camera = new PerspectiveCamera();
    const pose = { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 }, fovDeg: 30, lift: 0.1 };
    placeCamera(camera, pose, { width: 200, height: 100 });
    expect(camera.fov).toBe(30);
    expect(camera.aspect).toBe(2);
    expect(camera.position.toArray()).toEqual([1, 2, 3]);
    expect(camera.view?.enabled).toBe(true);
    placeCamera(camera, { ...pose, lift: 0 }, { width: 200, height: 100 });
    expect(camera.view?.enabled ?? false).toBe(false);
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
