import type { BattedBall, BattedType, InPlayResult, Strength } from "../../types/batting";
import type { RngState, WithRng } from "../../types/common";
import { type WeightedEntry, pickWeighted } from "../rng/sampling";

/** [タイプ × 強さ] 1 行ぶんの、結果ごとの重み(0 は出ない)。 */
export type ResultWeights = {
  readonly groundout: number;
  readonly doublePlay: number;
  readonly flyout: number;
  readonly lineout: number;
  readonly single: number;
  readonly double: number;
  readonly triple: number;
  readonly homerun: number;
  readonly error: number;
};

export type ResultRow = {
  readonly type: BattedType;
  readonly strength: Strength;
  readonly weights: ResultWeights;
};

/**
 * インプレー結果の重み表(仮値。各行の合計は 100)。タイプと矛盾する結果の重みは 0 で、`doublePlay` は ground 行のみ。
 * 打球が決まったあと、この表から 1 回だけ抽選する(乱数を消費するのはここだけ)。
 */
export const RESULT_TABLE: readonly ResultRow[] = [
  {
    type: "ground",
    strength: "weak",
    weights: { groundout: 52, doublePlay: 38, flyout: 0, lineout: 0, single: 10, double: 0, triple: 0, homerun: 0, error: 0 },
  },
  {
    type: "ground",
    strength: "medium",
    weights: { groundout: 44, doublePlay: 32, flyout: 0, lineout: 0, single: 22, double: 0, triple: 0, homerun: 0, error: 2 },
  },
  {
    type: "ground",
    strength: "strong",
    weights: { groundout: 30, doublePlay: 25, flyout: 0, lineout: 0, single: 38, double: 5, triple: 0, homerun: 0, error: 2 },
  },
  { type: "liner", strength: "weak", weights: { groundout: 0, doublePlay: 0, flyout: 0, lineout: 60, single: 36, double: 4, triple: 0, homerun: 0, error: 0 } },
  {
    type: "liner",
    strength: "medium",
    weights: { groundout: 0, doublePlay: 0, flyout: 0, lineout: 30, single: 50, double: 18, triple: 2, homerun: 0, error: 0 },
  },
  {
    type: "liner",
    strength: "strong",
    weights: { groundout: 0, doublePlay: 0, flyout: 0, lineout: 15, single: 40, double: 35, triple: 5, homerun: 5, error: 0 },
  },
  { type: "fly", strength: "weak", weights: { groundout: 0, doublePlay: 0, flyout: 96, lineout: 0, single: 4, double: 0, triple: 0, homerun: 0, error: 0 } },
  { type: "fly", strength: "medium", weights: { groundout: 0, doublePlay: 0, flyout: 75, lineout: 0, single: 8, double: 12, triple: 1, homerun: 4, error: 0 } },
  {
    type: "fly",
    strength: "strong",
    weights: { groundout: 0, doublePlay: 0, flyout: 35, lineout: 0, single: 0, double: 20, triple: 3, homerun: 42, error: 0 },
  },
];

/** タイプ × 強さに対応する行を返す。見つからない場合は `Error`(プログラミングエラー)。 */
export function getResultRow(type: BattedType, strength: Strength): ResultRow {
  const row = RESULT_TABLE.find((candidate) => candidate.type === type && candidate.strength === strength);
  if (row === undefined) {
    throw new Error(`getResultRow: no row for ${type}/${strength}`);
  }
  return row;
}

/**
 * 抽選の候補(結果と重み)を作る。併殺が不可能な場合(1 塁走者なし、または 2 アウト)は、
 * `doublePlay` の重みを `groundout` に畳み込む(併殺を同じ 1 回の抽選に含めたまま、不可能なときは出さない)。
 */
export function resultEntries(ball: BattedBall, doublePlayPossible: boolean): readonly WeightedEntry<InPlayResult>[] {
  const weights = getResultRow(ball.type, ball.strength).weights;
  const doublePlay = doublePlayPossible ? weights.doublePlay : 0;
  const groundout = doublePlayPossible ? weights.groundout : weights.groundout + weights.doublePlay;
  return [
    { value: "groundout", weight: groundout },
    { value: "doublePlay", weight: doublePlay },
    { value: "flyout", weight: weights.flyout },
    { value: "lineout", weight: weights.lineout },
    { value: "single", weight: weights.single },
    { value: "double", weight: weights.double },
    { value: "triple", weight: weights.triple },
    { value: "homerun", weight: weights.homerun },
    { value: "error", weight: weights.error },
  ];
}

/** 打球の結果を結果表から 1 回だけ抽選する(乱数を 1 個消費する)。 */
export function drawInPlayResult(rng: RngState, ball: BattedBall, doublePlayPossible: boolean): WithRng<InPlayResult> {
  return pickWeighted(rng, resultEntries(ball, doublePlayPossible));
}
