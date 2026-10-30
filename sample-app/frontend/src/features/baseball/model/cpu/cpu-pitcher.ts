import type { RngState, WithRng } from "../../types/common";
import type { Count } from "../../types/game";
import type { CpuPitchChoice, PitchCommand, PitchKind } from "../../types/pitch";
import type { PitcherProfile } from "../../types/team";
import { nextFloat } from "../rng/rng";
import { pickWeighted } from "../rng/sampling";
import { cellToPoint } from "../pitch/zone";
import { CPU_PARAMS, type DifficultyParams } from "./difficulty";
import { getPitchPlan, kindEntries, type PitchPlan, ringCellEntries, zoneCellEntries } from "./pitcher-weights";

/** `chooseCpuPitch` の入力。`difficulty` は解決済みの `DifficultyParams`(`getDifficulty` で引くのは呼び出し側)。 */
export type ChooseCpuPitchInput = {
  readonly count: Count;
  readonly pitcher: PitcherProfile;
  /** 直前の投球の球種(攻守交代でリセットされ `null`)。 */
  readonly lastKind: PitchKind | null;
  readonly difficulty: DifficultyParams;
};

/** ゾーン内に投げる確率。2 ストライクで 2 ボール未満(0-2/1-2)は、難易度のボール球率から決める。 */
function zoneProbability(count: Count, plan: PitchPlan, difficulty: DifficultyParams): number {
  return count.strikes === 2 && count.balls < 2 ? 1 - difficulty.twoStrikeOutsideRate : plan.zoneRate;
}

/**
 * CPU 投手の 1 球を決める。①ゾーン内/外(乱数 1 個)→ ②球種(1 個)→ ③セル(1 個)の順に、計 3 個の乱数を消費する。
 * 持ち球が `straight` のみなら、②は常に `straight`。
 */
export function chooseCpuPitch(rng: RngState, input: ChooseCpuPitchInput): WithRng<CpuPitchChoice> {
  const { count, pitcher, lastKind, difficulty } = input;
  const plan = getPitchPlan(count);

  const [roll, afterRoll] = nextFloat(rng);
  const inZone = roll < zoneProbability(count, plan, difficulty);

  const [kind, afterKind] = pickWeighted(afterRoll, kindEntries(pitcher.repertoire, plan.fastballRate, lastKind, CPU_PARAMS.repeatKindPenalty));
  const [cell, afterCell] = pickWeighted(afterKind, inZone ? zoneCellEntries(plan.edgeBias) : ringCellEntries());
  return [{ kind, cell }, afterCell];
}

/** CPU 投手の選択を投球コマンドに変換する。狙いはセルの中心、質は `normal`(CPU 投手はゲージを使わない)。乱数は消費しない。 */
export function commandOfChoice(choice: CpuPitchChoice): PitchCommand {
  return { kind: choice.kind, aim: cellToPoint(choice.cell), quality: "normal" };
}
