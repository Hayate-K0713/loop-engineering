import { describe, expect, it } from "vitest";
import type { Count } from "../../types/game";
import type { PitchKind } from "../../types/pitch";
import { getPitchPlan, kindEntries, planKey, ringCellEntries, zoneCellEntries } from "./pitcher-weights";

/** 12 カウント(ボール 0〜3 × ストライク 0〜2)。 */
const ALL_COUNTS: readonly Count[] = Array.from({ length: 4 }, (_ball, balls) => Array.from({ length: 3 }, (_strike, strikes) => ({ balls, strikes }))).flat();

describe("getPitchPlan", () => {
  it("12 カウントすべてにプランがある", () => {
    expect(ALL_COUNTS).toHaveLength(12);
    for (const count of ALL_COUNTS) {
      expect(() => getPitchPlan(count)).not.toThrow();
    }
  });

  it("zoneRate・fastballRate は (0, 1] の範囲", () => {
    for (const count of ALL_COUNTS) {
      const plan = getPitchPlan(count);
      expect(plan.zoneRate).toBeGreaterThan(0);
      expect(plan.zoneRate).toBeLessThanOrEqual(1);
      expect(plan.fastballRate).toBeGreaterThan(0);
      expect(plan.fastballRate).toBeLessThanOrEqual(1);
    }
  });

  it("edgeBias は 0 以上", () => {
    for (const count of ALL_COUNTS) {
      expect(getPitchPlan(count).edgeBias).toBeGreaterThanOrEqual(0);
    }
  });

  it("3-0 はストレート中心(fastballRate ≥ 0.8)で、ほぼゾーンに投げる", () => {
    const plan = getPitchPlan({ balls: 3, strikes: 0 });
    expect(plan.fastballRate).toBeGreaterThanOrEqual(0.8);
    expect(plan.zoneRate).toBeGreaterThanOrEqual(0.85);
  });

  it("追い込んだカウント(0-2/1-2)は 0-0 よりゾーン内率が低く、端を突く", () => {
    const first = getPitchPlan({ balls: 0, strikes: 0 });
    for (const count of [
      { balls: 0, strikes: 2 },
      { balls: 1, strikes: 2 },
    ]) {
      const plan = getPitchPlan(count);
      expect(plan.zoneRate).toBeLessThan(first.zoneRate);
      expect(plan.edgeBias).toBeGreaterThan(first.edgeBias);
    }
  });

  it("範囲外のカウントは Error", () => {
    expect(() => getPitchPlan({ balls: 4, strikes: 0 })).toThrow(Error);
    expect(() => getPitchPlan({ balls: 0, strikes: 3 })).toThrow(Error);
  });
});

describe("planKey", () => {
  it('"ボール-ストライク" 形式', () => {
    expect(planKey({ balls: 2, strikes: 1 })).toBe("2-1");
  });
});

describe("kindEntries", () => {
  const repertoire: readonly PitchKind[] = ["straight", "slider", "curve"];

  function weightOf(entries: ReturnType<typeof kindEntries>, kind: PitchKind): number {
    return entries.find((entry) => entry.value === kind)?.weight ?? Number.NaN;
  }

  it("straight は fastballRate、他の持ち球は残りを等分する", () => {
    const entries = kindEntries(repertoire, 0.6, null, 0.6);
    expect(weightOf(entries, "straight")).toBeCloseTo(0.6, 12);
    expect(weightOf(entries, "slider")).toBeCloseTo(0.2, 12);
    expect(weightOf(entries, "curve")).toBeCloseTo(0.2, 12);
  });

  it("直前と同じ球種だけ penalty 倍になる", () => {
    const entries = kindEntries(repertoire, 0.6, "slider", 0.5);
    expect(weightOf(entries, "straight")).toBeCloseTo(0.6, 12);
    expect(weightOf(entries, "slider")).toBeCloseTo(0.1, 12);
    expect(weightOf(entries, "curve")).toBeCloseTo(0.2, 12);
  });

  it("持ち球に無い球種は含まない", () => {
    expect(kindEntries(repertoire, 0.6, null, 0.6).map((entry) => entry.value)).toEqual(repertoire);
  });

  it("持ち球が straight のみなら straight だけ(重みは正)", () => {
    const entries = kindEntries(["straight"], 0.6, "straight", 0.6);
    expect(entries.map((entry) => entry.value)).toEqual(["straight"]);
    expect(weightOf(entries, "straight")).toBeGreaterThan(0);
  });
});

describe("zoneCellEntries", () => {
  it("ゾーン内 9 セルで、edgeBias 0 なら全セル同じ重み", () => {
    const entries = zoneCellEntries(0);
    expect(entries).toHaveLength(9);
    expect(entries.every((entry) => entry.weight === 1)).toBe(true);
  });

  it("中心は重み 1、端(距離 1)と角(距離 2)は edgeBias に比例して重くなる", () => {
    const entries = zoneCellEntries(1.5);
    const weightAt = (col: number, row: number): number => entries.find((entry) => entry.value.col === col && entry.value.row === row)?.weight ?? Number.NaN;
    expect(weightAt(2, 2)).toBe(1);
    expect(weightAt(2, 1)).toBe(2.5);
    expect(weightAt(1, 1)).toBe(4);
  });

  it("すべてストライクゾーン内のセル(col・row が 1〜3)", () => {
    expect(zoneCellEntries(0.6).every(({ value }) => value.col >= 1 && value.col <= 3 && value.row >= 1 && value.row <= 3)).toBe(true);
  });
});

describe("ringCellEntries", () => {
  const entries = ringCellEntries();

  it("ゾーン外 16 セルで、中央 3×3 を含まない", () => {
    expect(entries).toHaveLength(16);
    expect(entries.some(({ value }) => value.col >= 1 && value.col <= 3 && value.row >= 1 && value.row <= 3)).toBe(false);
  });

  it("外周の角(4 セル)は重み 1、他(12 セル)は重み 2", () => {
    const corners = entries.filter(({ value }) => (value.col === 0 || value.col === 4) && (value.row === 0 || value.row === 4));
    const others = entries.filter((entry) => !corners.includes(entry));
    expect(corners).toHaveLength(4);
    expect(corners.every((entry) => entry.weight === 1)).toBe(true);
    expect(others).toHaveLength(12);
    expect(others.every((entry) => entry.weight === 2)).toBe(true);
  });
});
