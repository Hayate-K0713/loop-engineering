import { useCallback, useMemo, useReducer } from "react";
import { reduce } from "../model/game/reducer";
import { createInitialState } from "../model/game/state";
import { toGameView } from "../model/game/view";
import type { SwingInput } from "../types/batting";
import type { GameConfig } from "../types/game";
import type { PitchCommand } from "../types/pitch";
import type { GameView } from "../types/view";

export type UseGameResult = {
  readonly view: GameView;
  /** 人間守備: 選択した球種・コースで投げる。 */
  readonly throwPitch: (command: PitchCommand) => void;
  /** 人間攻撃: スイングする。 */
  readonly swing: (input: SwingInput) => void;
  /** CPU 守備: CPU に投げさせる。 */
  readonly cpuPitch: () => void;
  /** ボールが到達した(人間打者なら見送り、CPU 打者なら打撃判断を行う)。 */
  readonly pitchArrived: () => void;
};

/**
 * 試合の状態を `useReducer` で持ち、ui 向けの `view` と操作関数を返す。
 * reducer は完全に純粋で乱数状態も `GameState.rng` に持つので、StrictMode の二重呼び出しでも結果は変わらない。
 * 操作関数は dispatch を包むだけで、参照は安定している。
 */
export function useGame(config: GameConfig, seed: number): UseGameResult {
  const [state, dispatch] = useReducer(reduce, { config, seed }, createInitialState);
  const view = useMemo(() => toGameView(state), [state]);
  const throwPitch = useCallback((command: PitchCommand) => dispatch({ type: "THROW", command }), []);
  const swing = useCallback((input: SwingInput) => dispatch({ type: "SWING", swing: input }), []);
  const cpuPitch = useCallback(() => dispatch({ type: "CPU_PITCH" }), []);
  const pitchArrived = useCallback(() => dispatch({ type: "PITCH_ARRIVED" }), []);
  return { view, throwPitch, swing, cpuPitch, pitchArrived };
}
