import { describe, expect, it } from "vitest";
import { FABRIC_SIZE, STRIPE_PITCH, rasterPinstripe } from "./fabric";
import { hashBytes } from "./primitives";

function pixel(rgba: Uint8Array, x: number, y: number): readonly number[] {
  const start = (y * FABRIC_SIZE + x) * 4;
  return Array.from(rgba.subarray(start, start + 4));
}

describe("rasterPinstripe", () => {
  const texture = rasterPinstripe(0xf2f2f2, 0x24409a);

  it("64×64×4 バイトで全画素が不透明", () => {
    expect(texture.width).toBe(64);
    expect(texture.height).toBe(64);
    expect(texture.rgba).toHaveLength(64 * 64 * 4);
    expect(texture.rgba.filter((_, i) => i % 4 === 3).every((alpha) => alpha === 255)).toBe(true);
  });

  it("縞が一定の間隔で並び、縞の上は縞の色・間は地の色に近い", () => {
    const onStripe = pixel(texture.rgba, STRIPE_PITCH / 2, 10);
    const between = pixel(texture.rgba, 0, 10);
    expect(onStripe.at(2) ?? 0).toBeGreaterThan(onStripe.at(0) ?? 255);
    expect(onStripe.at(0) ?? 255).toBeLessThan(0x80);
    expect(between.at(0) ?? 0).toBeGreaterThan(0xe0);
  });

  it("縦横に繰り返してもつなぎ目が出ない(間隔の約数・同じ列は全行で同じ縞の濃さ)", () => {
    expect(FABRIC_SIZE % STRIPE_PITCH).toBe(0);
    const columnsMatch = Array.from({ length: FABRIC_SIZE - STRIPE_PITCH }, (_, x) => x).every(
      (x) => pixel(texture.rgba, x, 4).join() === pixel(texture.rgba, x + STRIPE_PITCH, 4).join(),
    );
    expect(columnsMatch).toBe(true);
  });

  it("同じ入力で同じ出力・色が変われば出力も変わる", () => {
    expect(hashBytes(rasterPinstripe(0xf2f2f2, 0x24409a).rgba)).toBe(hashBytes(texture.rgba));
    expect(hashBytes(rasterPinstripe(0x202020, 0xffffff).rgba)).not.toBe(hashBytes(texture.rgba));
  });
});
