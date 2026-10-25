import { describe, expect, it } from "vitest";
import { buildCrowdPattern } from "./crowd";

describe("buildCrowdPattern", () => {
  const pattern = buildCrowdPattern(7);

  it("同一 seed で同一配置(deep equal)", () => {
    expect(buildCrowdPattern(7)).toEqual(pattern);
  });

  it("別 seed で異なる配置", () => {
    expect(buildCrowdPattern(8)).not.toEqual(pattern);
  });

  it("セル数が 32 × 16 で、col 0〜31 × row 0〜15 が一度ずつ現れる", () => {
    expect(pattern).toHaveLength(32 * 16);
    const keys = new Set(pattern.map((cell) => `${cell.col},${cell.row}`));
    expect(keys.size).toBe(32 * 16);
    expect(pattern.every((cell) => cell.col >= 0 && cell.col < 32 && cell.row >= 0 && cell.row < 16)).toBe(true);
  });

  it("paletteIndex は 0〜7 の整数で、複数の値が使われる", () => {
    expect(pattern.every((cell) => Number.isInteger(cell.paletteIndex) && cell.paletteIndex >= 0 && cell.paletteIndex <= 7)).toBe(true);
    expect(new Set(pattern.map((cell) => cell.paletteIndex)).size).toBeGreaterThanOrEqual(6);
  });
});
