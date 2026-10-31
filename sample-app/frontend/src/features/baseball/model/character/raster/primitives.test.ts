import { describe, expect, it } from "vitest";
import {
  arcDistance,
  blendPixel,
  boundsAround,
  capsule,
  circle,
  createBuffer,
  ellipse,
  expand,
  halfPlane,
  hashBytes,
  intersect,
  mixColor,
  paintSdf,
  place,
  polygon,
  readPixel,
  rgbOf,
  roundBox,
  stroke,
  translate,
  union,
} from "./primitives";

describe("距離関数", () => {
  it("円・楕円は中心が負・縁が 0・外側が正", () => {
    expect(circle(10, 10, 4)(10, 10)).toBeCloseTo(-4, 6);
    expect(circle(10, 10, 4)(14, 10)).toBeCloseTo(0, 6);
    expect(ellipse(10, 10, 4, 8)(10, 18)).toBeCloseTo(0, 6);
    expect(ellipse(10, 10, 4, 8)(10, 30)).toBeGreaterThan(0);
  });

  it("カプセル・角丸の長方形・多角形の内外を区別する", () => {
    expect(capsule(0, 0, 10, 0, 2)(5, 0)).toBeCloseTo(-2, 6);
    expect(capsule(0, 0, 10, 0, 2)(5, 5)).toBeCloseTo(3, 6);
    expect(roundBox(0, 0, 5, 3, 1)(0, 0)).toBeLessThan(0);
    expect(roundBox(0, 0, 5, 3, 1)(8, 0)).toBeGreaterThan(0);
    const triangle = polygon([
      [0, 0],
      [10, 0],
      [5, 10],
    ]);
    expect(triangle(5, 3)).toBeLessThan(0);
    expect(triangle(5, 12)).toBeGreaterThan(0);
    expect(triangle(-3, 0)).toBeCloseTo(3, 6);
  });

  it("円弧は弧の上で 0、弧の外の角度では端点までの距離になる", () => {
    const arc = arcDistance(0, 0, 10, Math.PI / 2, 0.5);
    expect(arc(0, 10)).toBeCloseTo(0, 6);
    expect(arc(0, 14)).toBeCloseTo(4, 6);
    const ex = 10 * Math.cos(Math.PI / 2 + 0.5);
    const ey = 10 * Math.sin(Math.PI / 2 + 0.5);
    expect(arc(ex, ey)).toBeCloseTo(0, 6);
    expect(arc(0, -10)).toBeGreaterThan(10);
  });

  it("合成・変形(共通部分・和集合・広げる・縁・移動・半平面)", () => {
    const a = circle(0, 0, 5);
    expect(intersect(a, halfPlane(0, -1, 0))(0, 3)).toBeLessThan(0);
    expect(intersect(a, halfPlane(0, -1, 0))(0, -3)).toBeGreaterThan(0);
    expect(union([a, circle(20, 0, 5)])(20, 0)).toBeCloseTo(-5, 6);
    expect(expand(a, 2)(7, 0)).toBeCloseTo(0, 6);
    expect(stroke(a, 2)(5, 0)).toBeCloseTo(-1, 6);
    expect(translate(a, 10, 0)(10, 0)).toBeCloseTo(-5, 6);
  });

  it("place は回転と左右反転で局所の図形を置く(距離は変わらない)", () => {
    const local = capsule(0, 0, 10, 0, 1);
    const mirrored = place({ cx: 50, cy: 50, mirror: true }, local);
    expect(mirrored(45, 50)).toBeCloseTo(-1, 6);
    expect(mirrored(55, 50)).toBeGreaterThan(0);
    const rotated = place({ cx: 0, cy: 0, angle: Math.PI / 2 }, local);
    expect(rotated(0, 5)).toBeCloseTo(-1, 6);
  });
});

describe("画素バッファ", () => {
  it("createBuffer・readPixel・blendPixel(over 合成と範囲外)", () => {
    const buffer = createBuffer(4, 4, 0xff0000, 255);
    expect(readPixel(buffer, 1, 1)).toEqual([255, 0, 0, 255]);
    blendPixel(buffer, 1, 1, 0x0000ff, 0.5);
    expect(readPixel(buffer, 1, 1)).toEqual([128, 0, 128, 255]);
    blendPixel(buffer, 9, 9, 0x0000ff, 1);
    expect(readPixel(buffer, 9, 9)).toEqual([0, 0, 0, 0]);
    const clear = createBuffer(2, 2, 0x000000, 0);
    blendPixel(clear, 0, 0, 0x00ff00, 1);
    expect(readPixel(clear, 0, 0)).toEqual([0, 255, 0, 255]);
  });

  it("paintSdf は clip の外へ書かない・縁を段階的に塗る", () => {
    const buffer = createBuffer(16, 16, 0x000000, 255);
    const clip = { x0: 4, y0: 4, x1: 12, y1: 12 };
    paintSdf(buffer, { offsetX: 0, offsetY: 0, clip }, boundsAround(8, 8, 20), circle(8, 8, 30), 0xffffff);
    expect(readPixel(buffer, 3, 8)).toEqual([0, 0, 0, 255]);
    expect(readPixel(buffer, 4, 8)).toEqual([255, 255, 255, 255]);
    expect(readPixel(buffer, 12, 8)).toEqual([0, 0, 0, 255]);
    const soft = createBuffer(16, 16, 0x000000, 255);
    paintSdf(soft, { offsetX: 0, offsetY: 0, clip: { x0: 0, y0: 0, x1: 16, y1: 16 } }, boundsAround(8, 8, 10), circle(8, 8, 4), 0xffffff);
    const edge = readPixel(soft, 12, 8)[0];
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
  });
});

describe("色とハッシュ", () => {
  it("rgbOf・mixColor", () => {
    expect(rgbOf(0x2f63c8)).toEqual([0x2f, 0x63, 0xc8]);
    expect(mixColor(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(mixColor(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(mixColor(0x000000, 0xfefefe, 0.5)).toBe(0x7f7f7f);
  });

  it("hashBytes は FNV-1a(空は初期値・1 バイトで値が変わる)", () => {
    expect(hashBytes(new Uint8Array(0))).toBe(0x811c9dc5);
    expect(hashBytes(new Uint8Array([97]))).toBe(0xe40c292c);
    expect(hashBytes(new Uint8Array([97]))).not.toBe(hashBytes(new Uint8Array([98])));
  });
});
