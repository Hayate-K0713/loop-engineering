import type { SwingInput } from "./batting";
import type { PitchCommand } from "./pitch";

/**
 * reducer が受け付ける action。
 * `PITCH_ARRIVED` は「ボールが到達した。人間打者ならスイング無し(見送り)、CPU 打者ならここで打撃判断を行う」。
 */
export type GameAction =
  | { readonly type: "CPU_PITCH" }
  | { readonly type: "THROW"; readonly command: PitchCommand }
  | { readonly type: "SWING"; readonly swing: SwingInput }
  | { readonly type: "PITCH_ARRIVED" };
