import type { Difficulty } from "../../types/game";

// CPU の難易度表と CPU 共通定数(仮値)。数値は balance.test.ts とプレイで調整する。
// `cpu/` は batting/・game/ に依存しない。難易度キー(`Difficulty`)から `DifficultyParams` を引くのは呼び出し側(game/reducer.ts)の責務。

/** 難易度ごとの CPU のパラメータ(解決済み)。`chooseCpuPitch`・`decideCpuBat` はこれを受け取る。 */
export type DifficultyParams = {
  /** ゾーン内の球を振る率。 */
  readonly zoneSwingRate: number;
  /** ゾーン外の球を振る率(高いほど釣られやすい)。 */
  readonly chaseSwingRate: number;
  /** CPU 打者のカーソル位置のノイズ(ゾーン単位の標準偏差。0 にならない)。 */
  readonly cursorSigma: number;
  /** CPU 打者のスイング時刻のノイズ(ms の標準偏差。0 にならない)。 */
  readonly timingSigmaMs: number;
  /** CPU 投手の狙いの外し方の倍率(`deliverPitch` の `aimSigmaScale` にそのまま渡す)。 */
  readonly aimSigmaScale: number;
  /** 0-2/1-2 でボール球を選ぶ率。 */
  readonly twoStrikeOutsideRate: number;
};

const DIFFICULTY_TABLE: ReadonlyMap<Difficulty, DifficultyParams> = new Map<Difficulty, DifficultyParams>([
  ["easy", { zoneSwingRate: 0.55, chaseSwingRate: 0.4, cursorSigma: 0.4, timingSigmaMs: 80, aimSigmaScale: 1.4, twoStrikeOutsideRate: 0.2 }],
  ["normal", { zoneSwingRate: 0.65, chaseSwingRate: 0.3, cursorSigma: 0.34, timingSigmaMs: 65, aimSigmaScale: 1.0, twoStrikeOutsideRate: 0.35 }],
  ["hard", { zoneSwingRate: 0.7, chaseSwingRate: 0.2, cursorSigma: 0.27, timingSigmaMs: 52, aimSigmaScale: 0.75, twoStrikeOutsideRate: 0.5 }],
]);

/** 難易度のパラメータを返す。未定義の難易度は `Error`(プログラミングエラー)。 */
export function getDifficulty(difficulty: Difficulty): DifficultyParams {
  const params = DIFFICULTY_TABLE.get(difficulty);
  if (params === undefined) {
    throw new Error(`getDifficulty: unknown difficulty "${difficulty}"`);
  }
  return params;
}

/** 難易度によらない CPU 共通の定数。 */
type CpuParams = {
  /** 2 ストライクのときのスイング率の加算(粘る・当てに行く)。 */
  readonly twoStrikeSwingBoost: number;
  /** スイング率の上限(2 ストライク補正を足した後)。 */
  readonly maxSwingRate: number;
  /** 3 ボール(2 ストライク未満)のときのスイング率の倍率(待つ)。 */
  readonly threeBallsSwingFactor: number;
  /** ゾーン外をスイングするときのカーソルノイズの倍率。 */
  readonly outsideSigmaScale: number;
  /** 強振(power)を選ぶ基本確率。 */
  readonly powerSwingBase: number;
  /** パワー能力 1 あたりの強振確率の加算。 */
  readonly powerSwingPerAbility: number;
  /** 直前と同じ球種を選ぶときの重みの倍率(連投の抑制)。 */
  readonly repeatKindPenalty: number;
  /** 球速差による早振りの比率(ストレート基準で待つため、遅い球は早く振る)。 */
  readonly speedDiffBiasRatio: number;
};

export const CPU_PARAMS: CpuParams = {
  twoStrikeSwingBoost: 0.2,
  maxSwingRate: 0.95,
  threeBallsSwingFactor: 0.4,
  outsideSigmaScale: 1.5,
  powerSwingBase: 0.1,
  powerSwingPerAbility: 0.004,
  repeatKindPenalty: 0.6,
  speedDiffBiasRatio: 0.15,
};
