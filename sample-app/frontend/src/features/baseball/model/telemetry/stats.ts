// 試遊ログの集計に使う小さな統計関数。純粋関数で、空の入力は `null` を返す(0 や NaN にしない)。

/** 平均。空は `null`。 */
export function mean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** 母標準偏差(n で割る)。空は `null`、1 件は 0。 */
export function populationSd(values: readonly number[]): number | null {
  const average = mean(values);
  if (average === null) {
    return null;
  }
  const variance = values.reduce((sum, value) => sum + (value - average) * (value - average), 0) / values.length;
  return Math.sqrt(variance);
}

function sortedAscending(values: readonly number[]): readonly number[] {
  return [...values].sort((a, b) => a - b);
}

/** 中央値(偶数件は中央 2 件の平均)。空は `null`。 */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = sortedAscending(values);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted.at(middle) ?? 0;
  if (sorted.length % 2 === 1) {
    return upper;
  }
  const lower = sorted.at(middle - 1) ?? 0;
  return (lower + upper) / 2;
}

/**
 * パーセンタイル(最近順位法: 小さい順に並べて `ceil(p × n)` 番目)。`p` は 0〜1 に丸める。空は `null`。
 * 例: 100 件の p95 は 95 番目の値。
 */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = sortedAscending(values);
  const clamped = Math.min(1, Math.max(0, p));
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil(clamped * sorted.length)));
  return sorted.at(rank - 1) ?? null;
}

/** 分母が 0 のときは `null` を返す割り算。 */
export function ratioOrNull(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}
