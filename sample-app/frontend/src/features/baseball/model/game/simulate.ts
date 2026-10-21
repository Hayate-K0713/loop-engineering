import type { PlateOutcome } from "../../types/batting";
import type { GameConfig, GameState } from "../../types/game";
import { reduce } from "./reducer";
import { createInitialState } from "./state";

// CPU 同士の試合を最後まで回すシミュレータ(バランス検証・reducer の終了性テスト用)。本番の UI からは使わない。

/** `simulateGame` の既定の上限アクション数。24 半イニング(9 回 + 延長 3 回)× 約 20 球でも約 480 球なので、10 倍以上の余裕がある。 */
export const DEFAULT_MAX_ACTIONS = 10_000;

/** シミュレーション結果。`plates` は打席が終わった順の結果、`actions` は dispatch した action 数。 */
export type SimulationResult = {
  readonly final: GameState;
  readonly plates: readonly PlateOutcome[];
  readonly actions: number;
};

/**
 * CPU 同士(`humanSide: null`)の試合を `game-over` まで回す。
 * `CPU_PITCH` と `PITCH_ARRIVED` を交互に dispatch し、`PITCH_ARRIVED` の後に `lastPlate` が非 `null` なら打席が終わったとして `plates` に加える。
 * `humanSide` が `null` でない設定、または `maxActions` を超えても終わらない場合は `Error`。
 */
export function simulateGame(config: GameConfig, seed: number, maxActions = DEFAULT_MAX_ACTIONS): SimulationResult {
  if (config.humanSide !== null) {
    throw new Error("simulateGame: humanSide must be null (CPU vs CPU)");
  }
  let state = createInitialState({ config, seed });
  const plates: PlateOutcome[] = [];
  let actions = 0;
  while (state.phase.kind !== "game-over") {
    if (actions >= maxActions) {
      throw new Error(`simulateGame: exceeded ${maxActions} actions without reaching game-over`);
    }
    const arriving = state.phase.kind === "in-flight";
    state = reduce(state, arriving ? { type: "PITCH_ARRIVED" } : { type: "CPU_PITCH" });
    actions += 1;
    if (arriving && state.lastPlate !== null) {
      plates.push(state.lastPlate);
    }
  }
  return { final: state, plates, actions };
}
