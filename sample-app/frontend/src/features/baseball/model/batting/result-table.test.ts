import { describe, expect, it } from "vitest";
import type { BattedBall, BattedType, InPlayResult, Strength } from "../../types/batting";
import type { RngState } from "../../types/common";
import { createRng, nextFloat } from "../rng/rng";
import { RESULT_TABLE, type ResultWeights, drawInPlayResult, getResultRow, resultEntries } from "./result-table";

const TYPES: readonly BattedType[] = ["ground", "liner", "fly"];
const STRENGTHS: readonly Strength[] = ["weak", "medium", "strong"];
const HIT_RESULTS: readonly InPlayResult[] = ["single", "double", "triple", "homerun"];

function ballOf(type: BattedType, strength: Strength): BattedBall {
  return { type, strength, direction: "center" };
}

function weightsList(weights: ResultWeights): number[] {
  return [
    weights.groundout,
    weights.doublePlay,
    weights.flyout,
    weights.lineout,
    weights.single,
    weights.double,
    weights.triple,
    weights.homerun,
    weights.error,
  ];
}

function hitWeightOf(weights: ResultWeights): number {
  return weights.single + weights.double + weights.triple + weights.homerun;
}

/** 同じ打球を `count` 回抽選し、結果ごとの回数を返す(状態を引き回す)。 */
function drawMany(seed: number, count: number, ball: BattedBall, doublePlayPossible: boolean): Map<InPlayResult, number> {
  const counts = new Map<InPlayResult, number>();
  let rng: RngState = createRng(seed);
  for (let i = 0; i < count; i += 1) {
    const [result, next] = drawInPlayResult(rng, ball, doublePlayPossible);
    counts.set(result, (counts.get(result) ?? 0) + 1);
    rng = next;
  }
  return counts;
}

describe("RESULT_TABLE の構造", () => {
  it("タイプ × 強さの 9 行がすべて存在し、重複しない", () => {
    expect(RESULT_TABLE).toHaveLength(9);
    for (const type of TYPES) {
      for (const strength of STRENGTHS) {
        const rows = RESULT_TABLE.filter((row) => row.type === type && row.strength === strength);
        expect(rows).toHaveLength(1);
        expect(getResultRow(type, strength)).toBe(rows.at(0));
      }
    }
  });

  it("各重みは非負で、行ごとの合計は正", () => {
    for (const row of RESULT_TABLE) {
      const list = weightsList(row.weights);
      expect(Math.min(...list)).toBeGreaterThanOrEqual(0);
      expect(list.reduce((sum, weight) => sum + weight, 0)).toBeGreaterThan(0);
    }
  });

  it("タイプと矛盾する結果の重みは 0(ground にフライ・ライナーアウトなし、liner / fly にゴロアウト・併殺なし、fly にライナーアウトなし、liner にフライアウトなし)", () => {
    for (const row of RESULT_TABLE.filter((candidate) => candidate.type === "ground")) {
      expect(row.weights.flyout).toBe(0);
      expect(row.weights.lineout).toBe(0);
    }
    for (const row of RESULT_TABLE.filter((candidate) => candidate.type !== "ground")) {
      expect(row.weights.groundout).toBe(0);
      expect(row.weights.doublePlay).toBe(0);
    }
    for (const row of RESULT_TABLE.filter((candidate) => candidate.type === "liner")) {
      expect(row.weights.flyout).toBe(0);
    }
    for (const row of RESULT_TABLE.filter((candidate) => candidate.type === "fly")) {
      expect(row.weights.lineout).toBe(0);
    }
  });

  it("doublePlay は ground 行にだけ重みがある", () => {
    const rowsWithDoublePlay = RESULT_TABLE.filter((row) => row.weights.doublePlay > 0);
    expect(rowsWithDoublePlay).toHaveLength(3);
    expect(rowsWithDoublePlay.every((row) => row.type === "ground")).toBe(true);
  });

  it("タイプごとに、強さが上がるほど安打系(single〜homerun)の合計重みが単調増加する", () => {
    for (const type of TYPES) {
      const [weak, medium, strong] = STRENGTHS.map((strength) => hitWeightOf(getResultRow(type, strength).weights));
      expect(medium).toBeGreaterThan(weak ?? Number.POSITIVE_INFINITY);
      expect(strong).toBeGreaterThan(medium ?? Number.POSITIVE_INFINITY);
    }
  });

  it("安打系の合計は fly strong > liner strong > ground strong で、長打は liner / fly で出る", () => {
    expect(getResultRow("fly", "strong").weights.homerun).toBeGreaterThan(getResultRow("liner", "strong").weights.homerun);
    expect(getResultRow("ground", "strong").weights.homerun).toBe(0);
    expect(getResultRow("ground", "strong").weights.triple).toBe(0);
  });
});

describe("resultEntries", () => {
  it("併殺が可能なら表の重みのまま", () => {
    const entries = resultEntries(ballOf("ground", "medium"), true);
    const weightOf = (result: InPlayResult): number | undefined => entries.find((entry) => entry.value === result)?.weight;
    const { weights } = getResultRow("ground", "medium");
    expect(weightOf("groundout")).toBe(weights.groundout);
    expect(weightOf("doublePlay")).toBe(weights.doublePlay);
    expect(weightOf("single")).toBe(weights.single);
  });

  it("併殺が不可能なら doublePlay の重みが groundout に畳み込まれる(合計は不変)", () => {
    const possible = resultEntries(ballOf("ground", "strong"), true);
    const impossible = resultEntries(ballOf("ground", "strong"), false);
    const weightOf = (entries: typeof possible, result: InPlayResult): number | undefined => entries.find((entry) => entry.value === result)?.weight;
    const { weights } = getResultRow("ground", "strong");
    expect(weightOf(impossible, "doublePlay")).toBe(0);
    expect(weightOf(impossible, "groundout")).toBe(weights.groundout + weights.doublePlay);
    const total = (entries: typeof possible): number => entries.reduce((sum, entry) => sum + entry.weight, 0);
    expect(total(impossible)).toBe(total(possible));
  });

  it("ground 以外の行は doublePlayPossible に依存しない", () => {
    expect(resultEntries(ballOf("fly", "medium"), false)).toEqual(resultEntries(ballOf("fly", "medium"), true));
    expect(resultEntries(ballOf("liner", "strong"), false)).toEqual(resultEntries(ballOf("liner", "strong"), true));
  });

  it("9 つの結果すべてを候補に持つ(重み 0 を含む)", () => {
    const results = resultEntries(ballOf("fly", "weak"), true).map((entry) => entry.value);
    expect(new Set(results).size).toBe(9);
  });
});

describe("drawInPlayResult", () => {
  it("併殺が不可能なら 5,000 回抽選しても doublePlay は一度も出ず、groundout の頻度は groundout + doublePlay の重み比になる", () => {
    const counts = drawMany(11, 5000, ballOf("ground", "weak"), false);
    expect(counts.get("doublePlay") ?? 0).toBe(0);
    const { weights } = getResultRow("ground", "weak");
    const total = weightsList(weights).reduce((sum, weight) => sum + weight, 0);
    expect(Math.abs((counts.get("groundout") ?? 0) / 5000 - (weights.groundout + weights.doublePlay) / total)).toBeLessThan(0.02);
  });

  it("併殺が可能なら doublePlay が出る", () => {
    expect(drawMany(12, 2000, ballOf("ground", "medium"), true).get("doublePlay") ?? 0).toBeGreaterThan(0);
  });

  it("10,000 回の頻度が重み比と ±2pt で一致する(全 9 行・併殺可能)", () => {
    for (const type of TYPES) {
      for (const strength of STRENGTHS) {
        const { weights } = getResultRow(type, strength);
        const total = weightsList(weights).reduce((sum, weight) => sum + weight, 0);
        const counts = drawMany(100, 10_000, ballOf(type, strength), true);
        for (const entry of resultEntries(ballOf(type, strength), true)) {
          const frequency = (counts.get(entry.value) ?? 0) / 10_000;
          expect(Math.abs(frequency - entry.weight / total)).toBeLessThan(0.02);
        }
      }
    }
  });

  it("重み 0 の結果は一度も出ない(タイプと矛盾する結果)", () => {
    const flyCounts = drawMany(5, 5000, ballOf("fly", "strong"), true);
    expect(flyCounts.get("groundout") ?? 0).toBe(0);
    expect(flyCounts.get("lineout") ?? 0).toBe(0);
    const linerCounts = drawMany(6, 5000, ballOf("liner", "weak"), true);
    expect(linerCounts.get("flyout") ?? 0).toBe(0);
    expect(linerCounts.get("homerun") ?? 0).toBe(0);
  });

  it("乱数を 1 個だけ消費する", () => {
    const rng = createRng(77);
    const [, next] = drawInPlayResult(rng, ballOf("liner", "medium"), true);
    expect(next).toBe(nextFloat(rng)[1]);
  });

  it("同一 rng・同一打球で同一結果", () => {
    const rng = createRng(2024);
    expect(drawInPlayResult(rng, ballOf("fly", "strong"), true)).toEqual(drawInPlayResult(rng, ballOf("fly", "strong"), true));
  });

  it("強い fly ほど安打系の割合が高い(頻度)", () => {
    const hitRate = (strength: Strength): number => {
      const counts = drawMany(31, 5000, ballOf("fly", strength), true);
      return HIT_RESULTS.reduce((sum, result) => sum + (counts.get(result) ?? 0), 0) / 5000;
    };
    expect(hitRate("strong")).toBeGreaterThan(hitRate("medium"));
    expect(hitRate("medium")).toBeGreaterThan(hitRate("weak"));
  });
});

describe("getResultRow", () => {
  it("返す行のタイプ・強さが引数と一致する", () => {
    const row = getResultRow("liner", "medium");
    expect(row.type).toBe("liner");
    expect(row.strength).toBe("medium");
  });
});
