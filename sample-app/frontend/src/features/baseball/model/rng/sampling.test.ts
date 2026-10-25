import { describe, expect, it } from "vitest";
import type { RngState, WithRng } from "../../types/common";
import { createRng, nextFloat } from "./rng";
import { nextGaussian, pickWeighted, type WeightedEntry } from "./sampling";

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

describe("nextGaussian", () => {
  const samples = draw(2026, 20000, nextGaussian);

  it("平均の絶対値が 0.03 未満", () => {
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    expect(Math.abs(mean)).toBeLessThan(0.03);
  });

  it("標準偏差が 0.95〜1.05(20,000 回)", () => {
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const variance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length;
    expect(Math.sqrt(variance)).toBeGreaterThanOrEqual(0.95);
    expect(Math.sqrt(variance)).toBeLessThanOrEqual(1.05);
  });

  it("値は |値| ≤ 6 に収まる", () => {
    expect(samples.every((value) => Math.abs(value) <= 6)).toBe(true);
  });

  it("一様乱数を 12 個消費する", () => {
    const state = createRng(3);
    const expected = Array.from({ length: 12 }).reduce<{ state: RngState; sum: number }>(
      (acc) => {
        const [value, next] = nextFloat(acc.state);
        return { state: next, sum: acc.sum + value };
      },
      { state, sum: 0 },
    );
    const [value, next] = nextGaussian(state);
    expect(next).toBe(expected.state);
    expect(value).toBeCloseTo(expected.sum - 6, 12);
  });

  it("同一状態で同一結果が返る", () => {
    const state = createRng(77);
    expect(nextGaussian(state)).toEqual(nextGaussian(state));
  });
});

describe("pickWeighted", () => {
  const entries: readonly WeightedEntry<string>[] = [
    { value: "a", weight: 1 },
    { value: "b", weight: 3 },
    { value: "zero", weight: 0 },
    { value: "c", weight: 6 },
  ];

  it("重み 0 の要素は選ばれない", () => {
    const picked = draw(1, 10000, (state) => pickWeighted(state, entries));
    expect(picked.includes("zero")).toBe(false);
  });

  it("先頭の重みが 0 でも、その要素は選ばれない", () => {
    const leadingZero: readonly WeightedEntry<string>[] = [
      { value: "zero", weight: 0 },
      { value: "x", weight: 1 },
    ];
    const picked = draw(2, 5000, (state) => pickWeighted(state, leadingZero));
    expect(picked.every((value) => value === "x")).toBe(true);
  });

  it("頻度が重み比(0.1 / 0.3 / 0.6)に ±2pt で一致する(10,000 回)", () => {
    const total = 10000;
    const picked = draw(42, total, (state) => pickWeighted(state, entries));
    const frequencyOf = (target: string): number => picked.filter((value) => value === target).length / total;
    expect(Math.abs(frequencyOf("a") - 0.1)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(frequencyOf("b") - 0.3)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(frequencyOf("c") - 0.6)).toBeLessThanOrEqual(0.02);
  });

  it("重みの絶対量ではなく比で決まる(全て 10 倍しても同じ結果)", () => {
    const scaled = entries.map((entry) => ({ value: entry.value, weight: entry.weight * 10 }));
    const state = createRng(5);
    expect(draw(5, 200, (s) => pickWeighted(s, scaled))).toEqual(draw(5, 200, (s) => pickWeighted(s, entries)));
    expect(pickWeighted(state, scaled)[1]).toBe(pickWeighted(state, entries)[1]);
  });

  it("乱数を 1 個だけ消費する", () => {
    const state = createRng(9);
    expect(pickWeighted(state, entries)[1]).toBe(nextFloat(state)[1]);
  });

  it("同一状態で同一結果が返る", () => {
    const state = createRng(9);
    expect(pickWeighted(state, entries)).toEqual(pickWeighted(state, entries));
  });

  it("要素が 1 つだけならそれを返す", () => {
    const single: readonly WeightedEntry<number>[] = [{ value: 7, weight: 0.5 }];
    expect(draw(4, 100, (state) => pickWeighted(state, single)).every((value) => value === 7)).toBe(true);
  });

  it("空配列は Error", () => {
    expect(() => pickWeighted(createRng(1), [])).toThrow(Error);
  });

  it("重みの合計が 0 は Error", () => {
    const zeros: readonly WeightedEntry<string>[] = [
      { value: "a", weight: 0 },
      { value: "b", weight: 0 },
    ];
    expect(() => pickWeighted(createRng(1), zeros)).toThrow(Error);
  });

  it("重みの合計が負は Error", () => {
    expect(() => pickWeighted(createRng(1), [{ value: "a", weight: -1 }])).toThrow(Error);
  });
});
