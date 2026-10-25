import { describe, expect, it } from "vitest";
import type { RngState, WithRng } from "../../types/common";
import { createRng, nextFloat, nextInt } from "./rng";

const UINT32_RANGE = 4294967296;

/** 公開されている mulberry32 の参照実装(状態を折り返さない素朴な形)。 */
function referenceMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

/** 状態を引き回しながら `count` 回抽選して値の列を返す。 */
function draw<T>(seed: number, count: number, step: (state: RngState) => WithRng<T>): T[] {
  const values: T[] = [];
  let state = createRng(seed);
  for (let i = 0; i < count; i += 1) {
    const [value, next] = step(state);
    values.push(value);
    state = next;
  }
  return values;
}

describe("createRng", () => {
  it.each([0, 1, 42, 4294967295])("範囲内のシード %j はそのまま uint32 になる", (seed) => {
    expect(createRng(seed)).toBe(seed);
  });

  it.each([-1, -12345, 2 ** 32, 2 ** 32 + 7, 2 ** 33 + 3, 3.9])("シード %j は `>>> 0` と同じ値に正規化される", (seed) => {
    expect(createRng(seed)).toBe(seed >>> 0);
  });

  it("正規化前後で同じ乱数列になる", () => {
    expect(draw(-1, 20, nextFloat)).toEqual(draw(4294967295, 20, nextFloat));
    expect(draw(2 ** 32 + 5, 20, nextFloat)).toEqual(draw(5, 20, nextFloat));
  });
});

describe("nextFloat", () => {
  it("同一シードで先頭 1000 個が同一列になる", () => {
    expect(draw(123, 1000, nextFloat)).toEqual(draw(123, 1000, nextFloat));
  });

  it("シードが違えば列も違う", () => {
    expect(draw(1, 10, nextFloat)).not.toEqual(draw(2, 10, nextFloat));
  });

  it("値は [0, 1) に収まる", () => {
    const values = draw(7, 10000, nextFloat);
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it.each([0, 1, 42, 2024, 4294967295])("参照実装(mulberry32)と先頭 1000 個が一致する(シード %j)", (seed) => {
    const reference = referenceMulberry32(seed);
    const expected = Array.from({ length: 1000 }, () => reference());
    expect(draw(seed, 1000, nextFloat)).toEqual(expected);
  });

  it("シード 42 の先頭 4 個が固定値と一致する(エンジン間で再現するための固定)", () => {
    const numerators = draw(42, 4, nextFloat).map((value) => value * UINT32_RANGE);
    expect(numerators).toEqual([2581720956, 1925393290, 3661312704, 2876485805]);
  });

  it("次の状態は `(state + 0x6D2B79F5) >>> 0` で、uint32 に収まる", () => {
    const state = createRng(0xfffffff0);
    const [, next] = nextFloat(state);
    expect(next).toBe((state + 0x6d2b79f5) >>> 0);
    expect(Number.isInteger(next) && next >= 0 && next < UINT32_RANGE).toBe(true);
  });

  it("入力の状態を変更せず、同じ状態からは同じ結果が返る", () => {
    const state = createRng(99);
    expect(nextFloat(state)).toEqual(nextFloat(state));
  });

  it("平均が約 0.5 になる(10,000 回、±0.02)", () => {
    const values = draw(2025, 10000, nextFloat);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.02);
  });
});

describe("nextInt", () => {
  it("nextInt(state, 7) は 0〜6 の全値が出て、各値の頻度が 1/7 ± 2pt に収まる(10,000 回)", () => {
    const total = 10000;
    const counts = new Map<number, number>();
    for (const value of draw(31, total, (state) => nextInt(state, 7))) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    expect(counts.size).toBe(7);
    expect([...counts.keys()].every((key) => Number.isInteger(key) && key >= 0 && key <= 6)).toBe(true);
    for (const face of Array.from({ length: 7 }, (_, index) => index)) {
      const frequency = (counts.get(face) ?? 0) / total;
      expect(Math.abs(frequency - 1 / 7)).toBeLessThanOrEqual(0.02);
    }
  });

  it("7 以上や負の値は出ない", () => {
    const values = draw(5, 10000, (state) => nextInt(state, 7));
    expect(Math.max(...values)).toBeLessThanOrEqual(6);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
  });

  it("nextInt(state, 1) は常に 0", () => {
    expect(draw(11, 1000, (state) => nextInt(state, 1)).every((value) => value === 0)).toBe(true);
  });

  it("乱数を 1 個だけ消費し、nextFloat と同じ状態遷移になる", () => {
    const state = createRng(8);
    expect(nextInt(state, 10)[1]).toBe(nextFloat(state)[1]);
  });

  it("同一状態で同一結果が返る", () => {
    const state = createRng(8);
    expect(nextInt(state, 10)).toEqual(nextInt(state, 10));
  });
});
