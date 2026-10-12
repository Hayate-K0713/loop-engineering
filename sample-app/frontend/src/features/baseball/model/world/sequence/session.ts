import type { SwingInput } from "../../../types/batting";
import type { ScenePhase } from "../../../types/scene";
import type { PitchOutcomeView } from "../../../types/view";
import { clamp } from "../../pitch/zone";

// 演出進行の判断(純関数)。hooks(`useGameStage`・`useStageDirector`)の判断部分をここへ切り出し、単体テストできるようにする。

/**
 * 演出中か。解決した球があり、その演出がまだ終わっていない(`outcome.seq` が `finishedSeq` と違う)間は真。
 * 次の投球が始まっても `outcome.seq` は変わらないので、`holding` が誤って立つことはない。`finishedSeq` が `null` は「まだ何も終わっていない」。
 */
export function isHolding(outcome: PitchOutcomeView | null, finishedSeq: number | null): boolean {
  return outcome !== null && outcome.seq !== finishedSeq;
}

/** 画面のフェーズ。優先順位は plan(打球・結果の演出)> flight(飛行中)> windup > idle。 */
export function phaseOf(state: { readonly hasPlan: boolean; readonly hasFlight: boolean; readonly windupActive: boolean }): ScenePhase {
  if (state.hasPlan) {
    return "play";
  }
  if (state.hasFlight) {
    return "flight";
  }
  return state.windupActive ? "windup" : "idle";
}

/** 演出が終わったか(`tMs ≥ plan.endMs`)。 */
export function isPlayFinished(plan: { readonly endMs: number }, tMs: number): boolean {
  return tMs >= plan.endMs;
}

/** windup の進行度(0〜1)。壁時計 `nowMs` を、開始 `startedAtMs` から `cpuWaitMs` かけて正規化する。`cpuWaitMs` が 0 以下なら即 1。 */
export function windupProgress(nowMs: number, startedAtMs: number, cpuWaitMs: number): number {
  return cpuWaitMs > 0 ? clamp((nowMs - startedAtMs) / cpuWaitMs, 0, 1) : 1;
}

/** 人間のスイング入力の記録。`seq` はスイング時点の `view.flight.seq`。 */
export type SwingRecord = {
  readonly seq: number;
  readonly input: SwingInput;
};

/** スイングを記録する。同じ `seq` の記録がすでにあれば、それを保つ(1つの `seq` につき最初の1回だけ。reducer が2回目の `SWING` を無視するのと一致)。 */
export function recordSwing(current: SwingRecord | null, seq: number, input: SwingInput): SwingRecord {
  return current !== null && current.seq === seq ? current : { seq, input };
}

/** `planPlay` に渡すスイング入力。記録の `seq` が解決した球(`outcomeSeq`)と一致するときだけ返す(古い人間のスイングを CPU 打者の球に渡さない)。 */
export function swingForOutcome(record: SwingRecord | null, outcomeSeq: number): SwingInput | null {
  return record !== null && record.seq === outcomeSeq ? record.input : null;
}
