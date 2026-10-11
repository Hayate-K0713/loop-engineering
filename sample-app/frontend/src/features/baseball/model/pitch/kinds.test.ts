import { describe, expect, it } from "vitest";
import type { PitchKind } from "../../types/pitch";
import { getPitchSpec } from "./kinds";

const ALL_KINDS: readonly PitchKind[] = ["straight", "slider", "curve", "fork", "shoot"];

describe("getPitchSpec", () => {
  it.each(ALL_KINDS)("%s に spec があり、kind が自身と一致する", (kind) => {
    expect(getPitchSpec(kind).kind).toBe(kind);
  });

  it("straight は速度オフセット 0・cursorScale (1,1)・曲がりなし", () => {
    const spec = getPitchSpec("straight");
    expect(spec.speedOffsetKmh).toBe(0);
    expect(spec.cursorScale).toEqual({ x: 1, y: 1 });
    expect(spec.bend).toEqual({ x: 0, y: 0 });
  });

  it("全球種で cursorScale が (0, 1] に収まる", () => {
    const scales = ALL_KINDS.flatMap((kind) => [getPitchSpec(kind).cursorScale.x, getPitchSpec(kind).cursorScale.y]);
    expect(scales.every((scale) => scale > 0 && scale <= 1)).toBe(true);
  });

  it("label は全球種で非空", () => {
    expect(ALL_KINDS.every((kind) => getPitchSpec(kind).label.length > 0)).toBe(true);
  });

  it("straight 以外は straight より遅い(速度オフセットが負)", () => {
    const others = ALL_KINDS.filter((kind) => kind !== "straight");
    expect(others.every((kind) => getPitchSpec(kind).speedOffsetKmh < 0)).toBe(true);
  });

  it.each([
    ["slider", -12, 0.95, 0.9],
    ["curve", -30, 0.95, 0.85],
    ["fork", -15, 0.95, 0.8],
    ["shoot", -8, 0.9, 0.95],
  ] as const)("%s の速度オフセットとカーソル補正が設計の初期値どおり", (kind, offset, scaleX, scaleY) => {
    const spec = getPitchSpec(kind);
    expect(spec.speedOffsetKmh).toBe(offset);
    expect(spec.cursorScale).toEqual({ x: scaleX, y: scaleY });
  });

  it("縦に変化する球(カーブ・フォーク)は縦のカーソル補正がより小さい", () => {
    expect(getPitchSpec("curve").cursorScale.y).toBeLessThan(getPitchSpec("curve").cursorScale.x);
    expect(getPitchSpec("fork").cursorScale.y).toBeLessThan(getPitchSpec("fork").cursorScale.x);
  });

  it("未知の球種は Error", () => {
    expect(() => getPitchSpec("knuckle" as unknown as PitchKind)).toThrow(Error);
  });
});
