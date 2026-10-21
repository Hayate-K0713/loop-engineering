import type { RngState, WithRng } from "../../types/common";
import { nextFloat } from "./rng";

const GAUSSIAN_TERMS = 12;

/** 重み付き抽選の候補。 */
export type WeightedEntry<T> = {
  readonly value: T;
  readonly weight: number;
};

/**
 * 標準正規分布に近い乱数(Irwin–Hall 近似)と次の状態を返す。
 * 一様乱数 12 個の和 − 6 なので平均 0・分散 1、値域は [-6, 6]。加減算のみで、エンジン間で結果が一致する。
 * 乱数を 12 個消費する。
 */
export function nextGaussian(state: RngState): WithRng<number> {
  let current = state;
  let sum = 0;
  for (let i = 0; i < GAUSSIAN_TERMS; i += 1) {
    const [value, next] = nextFloat(current);
    sum += value;
    current = next;
  }
  return [sum - GAUSSIAN_TERMS / 2, current];
}

/**
 * 重みに比例して 1 つ選ぶ(乱数を 1 個消費する)。重み 0 の要素は選ばれない。
 * 空配列、または重みの合計が 0 以下の場合はプログラミングエラーとして `Error` を投げる。
 */
export function pickWeighted<T>(state: RngState, entries: readonly WeightedEntry<T>[]): WithRng<T> {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0 || Number.isNaN(total)) {
    throw new Error("pickWeighted: weights must be non-empty and sum to a positive value");
  }
  const candidates = entries.filter((entry) => entry.weight > 0);
  const [value, next] = nextFloat(state);
  const threshold = value * total;
  let accumulated = 0;
  for (const entry of candidates) {
    accumulated += entry.weight;
    if (threshold < accumulated) {
      return [entry.value, next];
    }
  }
  // 浮動小数点の丸めで取りこぼした場合は、重みが正の最後の要素を返す。
  const last = candidates.at(-1);
  if (last === undefined) {
    throw new Error("pickWeighted: no entry with a positive weight");
  }
  return [last.value, next];
}
