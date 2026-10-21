import { describe, expect, it } from "vitest";
import { addVec3, distanceXZ, lerp, lerpVec3 } from "./vec3";

const A = { x: -2, y: 1, z: 10 };
const B = { x: 4, y: 5, z: -6 };

describe("lerp", () => {
  it("端点と中点", () => {
    expect(lerp(2, 10, 0)).toBe(2);
    expect(lerp(2, 10, 1)).toBe(10);
    expect(lerp(2, 10, 0.5)).toBe(6);
  });

  it("t = 1 は浮動小数の誤差なく b に一致し、範囲外の t は外挿する", () => {
    expect(Object.is(lerp(0.03, 1.6, 1), 1.6)).toBe(true);
    expect(lerp(0, 10, 1.5)).toBe(15);
    expect(lerp(0, 10, -0.5)).toBe(-5);
  });
});

describe("lerpVec3", () => {
  it("t = 0 は a、t = 1 は b に厳密一致する", () => {
    expect(lerpVec3(A, B, 0)).toEqual(A);
    expect(lerpVec3(A, B, 1)).toEqual(B);
  });

  it("中点は各成分の平均", () => {
    expect(lerpVec3(A, B, 0.5)).toEqual({ x: 1, y: 3, z: 2 });
  });

  it("入力を変更しない", () => {
    const a = { ...A };
    lerpVec3(a, B, 0.3);
    expect(a).toEqual(A);
  });
});

describe("addVec3", () => {
  it("成分ごとの和", () => {
    expect(addVec3(A, B)).toEqual({ x: 2, y: 6, z: 4 });
  });
});

describe("distanceXZ", () => {
  it("y を無視した水平距離", () => {
    expect(distanceXZ({ x: 0, y: 0, z: 0 }, { x: 3, y: 100, z: 4 })).toBe(5);
    expect(distanceXZ(A, A)).toBe(0);
  });

  it("対称", () => {
    expect(distanceXZ(A, B)).toBe(distanceXZ(B, A));
  });
});
