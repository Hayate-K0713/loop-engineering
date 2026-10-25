import type { Difficulty } from "../../types/game";

// CPU の難易度表と CPU 共通定数(仮値)。数値は balance.test.ts とプレイで調整する。
// 操作性の修正(H3b)で、判定の当たり範囲が広がった(ボール半径を足す)ぶん CPU のノイズを小さくし(ふつう ≈ ボット B。sim/bot-balance.test.ts の
// 「CPU ふつう」)、当たりやすくなって打席が短くなった(三振・四球が減った)ぶんをゾーン内のスイング率を下げて(見逃し三振・四球を増やして)戻した。
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
  ["easy", { zoneSwingRate: 0.33, chaseSwingRate: 0.32, cursorSigma: 0.22, timingSigmaMs: 75, aimSigmaScale: 1.4, twoStrikeOutsideRate: 0.2 }],
  ["normal", { zoneSwingRate: 0.4, chaseSwingRate: 0.22, cursorSigma: 0.14, timingSigmaMs: 53, aimSigmaScale: 1.0, twoStrikeOutsideRate: 0.35 }],
  ["hard", { zoneSwingRate: 0.47, chaseSwingRate: 0.14, cursorSigma: 0.1, timingSigmaMs: 42, aimSigmaScale: 0.75, twoStrikeOutsideRate: 0.5 }],
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
