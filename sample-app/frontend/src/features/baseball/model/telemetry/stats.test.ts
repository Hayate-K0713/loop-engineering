import { describe, expect, it } from "vitest";
import { mean, median, percentile, populationSd, ratioOrNull } from "./stats";

describe("stats", () => {
  it("空の入力は null を返す", () => {
    expect(mean([])).toBeNull();
    expect(populationSd([])).toBeNull();
    expect(median([])).toBeNull();
    expect(percentile([], 0.95)).toBeNull();
  });

  it("平均・母標準偏差が手計算と一致する", () => {
    // 2, 4, 4, 4, 5, 5, 7, 9: 平均 5、母分散 4、母標準偏差 2
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(mean(values)).toBeCloseTo(5, 12);
    expect(populationSd(values)).toBeCloseTo(2, 12);
    expect(populationSd([3])).toBeCloseTo(0, 12);
  });

  it("中央値は奇数件で中央、偶数件で中央 2 件の平均(入力を並べ替えない)", () => {
    const input = [9, 1, 5];
    expect(median(input)).toBeCloseTo(5, 12);
    expect(input).toEqual([9, 1, 5]);
    expect(median([4, 1, 3, 2])).toBeCloseTo(2.5, 12);
  });

  it("パーセンタイルは最近順位法で、範囲外の p は端に丸める", () => {
    const hundred = Array.from({ length: 100 }, (_, index) => index + 1);
    expect(percentile(hundred, 0.95)).toBeCloseTo(95, 12);
    expect(percentile(hundred, 0)).toBeCloseTo(1, 12);
    expect(percentile(hundred, 2)).toBeCloseTo(100, 12);
    expect(percentile([7], 0.95)).toBeCloseTo(7, 12);
  });

  it("ratioOrNull は分母 0 で null", () => {
    expect(ratioOrNull(1, 0)).toBeNull();
    expect(ratioOrNull(1, 4)).toBeCloseTo(0.25, 12);
  });
});
