import { describe, expect, it } from "vitest";
import type { Difficulty } from "../../types/game";
import { CPU_PARAMS, type DifficultyParams, getDifficulty } from "./difficulty";

/** 易しい順。 */
const ALL_DIFFICULTIES: readonly Difficulty[] = ["easy", "normal", "hard"];

/** 難易度を易しい順に並べて、各パラメータの値の列を返す。 */
function valuesOf(pick: (params: DifficultyParams) => number): readonly number[] {
  return ALL_DIFFICULTIES.map((difficulty) => pick(getDifficulty(difficulty)));
}

/** 隣り合う値が `direction` 方向に厳密に変化しているか。 */
function isStrictlyMonotone(values: readonly number[], direction: "down" | "up"): boolean {
  return values.slice(1).every((value, i) => {
    const previous = values.at(i);
    if (previous === undefined) {
      return false;
    }
    return direction === "down" ? value < previous : value > previous;
  });
}

describe("getDifficulty", () => {
  it("3 難易度すべてに、6 つのパラメータを持つ", () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      const keys = Object.keys(getDifficulty(difficulty)).sort();
      expect(keys).toEqual(["aimSigmaScale", "chaseSwingRate", "cursorSigma", "timingSigmaMs", "twoStrikeOutsideRate", "zoneSwingRate"]);
    }
  });

  it("同じ難易度は同じ内容を返す", () => {
    expect(getDifficulty("normal")).toEqual(getDifficulty("normal"));
  });

  it("未知の難易度は Error", () => {
    const unknown: string = "impossible";
    expect(() => getDifficulty(unknown as Difficulty)).toThrow(Error);
  });
});

describe("難易度の単調性(easy → normal → hard)", () => {
  it.each([
    ["cursorSigma", (p: DifficultyParams) => p.cursorSigma],
    ["timingSigmaMs", (p: DifficultyParams) => p.timingSigmaMs],
    ["aimSigmaScale", (p: DifficultyParams) => p.aimSigmaScale],
    ["chaseSwingRate", (p: DifficultyParams) => p.chaseSwingRate],
  ])("%s は難しくなるほど減る", (_name, pick) => {
    expect(isStrictlyMonotone(valuesOf(pick), "down")).toBe(true);
  });

  it.each([
    ["zoneSwingRate", (p: DifficultyParams) => p.zoneSwingRate],
    ["twoStrikeOutsideRate", (p: DifficultyParams) => p.twoStrikeOutsideRate],
  ])("%s は難しくなるほど増える", (_name, pick) => {
    expect(isStrictlyMonotone(valuesOf(pick), "up")).toBe(true);
  });

  it("CPU のノイズ・狙いの外し(cursorSigma・timingSigmaMs・aimSigmaScale)は全難易度で 0 にならない", () => {
    for (const pick of [(p: DifficultyParams) => p.cursorSigma, (p: DifficultyParams) => p.timingSigmaMs, (p: DifficultyParams) => p.aimSigmaScale]) {
      expect(valuesOf(pick).every((value) => value > 0)).toBe(true);
    }
  });

  it("確率のパラメータは (0, 1) の範囲に収まる", () => {
    for (const pick of [(p: DifficultyParams) => p.zoneSwingRate, (p: DifficultyParams) => p.chaseSwingRate, (p: DifficultyParams) => p.twoStrikeOutsideRate]) {
      expect(valuesOf(pick).every((value) => value > 0 && value < 1)).toBe(true);
    }
  });

  it("ゾーン内の方がゾーン外よりよく振る", () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      const params = getDifficulty(difficulty);
      expect(params.zoneSwingRate).toBeGreaterThan(params.chaseSwingRate);
    }
  });
});

describe("CPU_PARAMS", () => {
  it("確率・倍率が妥当な範囲にある", () => {
    expect(CPU_PARAMS.maxSwingRate).toBeGreaterThan(0);
    expect(CPU_PARAMS.maxSwingRate).toBeLessThanOrEqual(1);
    expect(CPU_PARAMS.threeBallsSwingFactor).toBeGreaterThan(0);
    expect(CPU_PARAMS.threeBallsSwingFactor).toBeLessThan(1);
    expect(CPU_PARAMS.repeatKindPenalty).toBeGreaterThan(0);
    expect(CPU_PARAMS.repeatKindPenalty).toBeLessThan(1);
    expect(CPU_PARAMS.outsideSigmaScale).toBeGreaterThan(1);
    expect(CPU_PARAMS.twoStrikeSwingBoost).toBeGreaterThan(0);
  });

  it("強振確率は最大能力(100)でも 1 を超えない", () => {
    expect(CPU_PARAMS.powerSwingBase + CPU_PARAMS.powerSwingPerAbility * 100).toBeLessThanOrEqual(1);
  });
});
