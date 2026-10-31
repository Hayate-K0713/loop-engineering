import { describe, expect, it } from "vitest";
import { hashBytes } from "./primitives";
import { NUMBER_DECAL_HEIGHT, NUMBER_DECAL_WIDTH, digitsOf, rasterNumber } from "./number";

const COLORS = { fill: 0xffffff, outline: 0x10204a } as const;
const ALL_NUMBERS = Array.from({ length: 100 }, (_, i) => i);

function alphaAt(rgba: Uint8Array, x: number, y: number): number {
  return rgba.at((y * NUMBER_DECAL_WIDTH + x) * 4 + 3) ?? -1;
}

function colorAt(rgba: Uint8Array, x: number, y: number): readonly number[] {
  const start = (y * NUMBER_DECAL_WIDTH + x) * 4;
  return Array.from(rgba.subarray(start, start + 4));
}

function opaqueCount(rgba: Uint8Array): number {
  return rgba.filter((_, i) => i % 4 === 3).filter((alpha) => alpha === 255).length;
}

describe("digitsOf", () => {
  it("桁に分け、範囲外・非数は 0〜99 に丸める", () => {
    expect(digitsOf(7)).toEqual([7]);
    expect(digitsOf(10)).toEqual([1, 0]);
    expect(digitsOf(99)).toEqual([9, 9]);
    expect(digitsOf(-5)).toEqual([0]);
    expect(digitsOf(250)).toEqual([9, 9]);
    expect(digitsOf(Number.NaN)).toEqual([0]);
    expect(digitsOf(12.9)).toEqual([1, 2]);
  });
});

describe("rasterNumber", () => {
  it("背番号 0〜99 がすべて描ける(寸法 64×48×4・不透明な画素がある・100 通りすべて異なる)", () => {
    const decals = ALL_NUMBERS.map((n) => rasterNumber(n, COLORS));
    expect(decals.every((d) => d.width === NUMBER_DECAL_WIDTH && d.height === NUMBER_DECAL_HEIGHT && d.rgba.length === 64 * 48 * 4)).toBe(true);
    expect(decals.every((d) => opaqueCount(d.rgba) >= 150)).toBe(true);
    expect(new Set(decals.map((d) => hashBytes(d.rgba))).size).toBe(100);
  });

  it("背景は透明、外周 1px は常に透明(数字・縁取りが切れない)", () => {
    const edgeOpaque = ALL_NUMBERS.flatMap((n) => {
      const { rgba } = rasterNumber(n, COLORS);
      const last = NUMBER_DECAL_WIDTH - 1;
      const ring = [
        ...Array.from({ length: NUMBER_DECAL_WIDTH }, (_, x) => alphaAt(rgba, x, 0)),
        ...Array.from({ length: NUMBER_DECAL_WIDTH }, (_, x) => alphaAt(rgba, x, NUMBER_DECAL_HEIGHT - 1)),
        ...Array.from({ length: NUMBER_DECAL_HEIGHT }, (_, y) => alphaAt(rgba, 0, y)),
        ...Array.from({ length: NUMBER_DECAL_HEIGHT }, (_, y) => alphaAt(rgba, last, y)),
      ];
      return ring.filter((alpha) => alpha !== 0);
    });
    expect(edgeOpaque).toHaveLength(0);
  });

  it("数字の色と縁取りの色が使われる(「1」の縦棒の中は fill、その外側の縁は outline)", () => {
    const { rgba } = rasterNumber(1, COLORS);
    // 1 桁(升 6px)は中央に置かれ、「1」の縦棒は 3 列目(x = 17 + 12 〜 17 + 18)。
    expect(colorAt(rgba, 32, 20)).toEqual([0xff, 0xff, 0xff, 255]);
    expect(colorAt(rgba, 28, 20)).toEqual([0x10, 0x20, 0x4a, 255]);
    expect(colorAt(rgba, 2, 24)).toEqual([0, 0, 0, 0]);
  });

  it("同じ入力で同じ出力・色が変われば出力も変わる", () => {
    expect(hashBytes(rasterNumber(23, COLORS).rgba)).toBe(hashBytes(rasterNumber(23, COLORS).rgba));
    expect(hashBytes(rasterNumber(23, COLORS).rgba)).not.toBe(hashBytes(rasterNumber(23, { fill: 0xff0000, outline: 0x000000 }).rgba));
  });
});
