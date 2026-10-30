import type { AssistParams } from "../../types/batting";
import type { Difficulty } from "../../types/game";

// 打撃のアシスト(ロックオン・予告・質の補正)の難易度別の表。値は出発値で、人間代理ボット(A14)が調整してよい。
// 関数(`lockOnCursor`・`previewCenterOf`・`qualityScaleOf`)は A1 が本ファイルに追加する。

/**
 * 難易度ごとのアシスト。`fadeRadius`/`fadeJitter` は `preview: "fade"` のときだけ使う(`exact` は 0)。
 * かんたん = 強い引き寄せ+点の予告、ふつう(既定)= 中程度+点の予告、むずかしい = 弱い引き寄せ+薄い円の予告。
 */
export const ASSIST_TABLE: Readonly<Record<Difficulty, AssistParams>> = {
  easy: { lockStrength: 0.8, captureRadius: 1.6, rampStart: 0.3, rampEnd: 0.8, preview: "exact", fadeRadius: 0, fadeJitter: 0, qualityPenalty: 0.3 },
  normal: { lockStrength: 0.55, captureRadius: 1.2, rampStart: 0.35, rampEnd: 0.85, preview: "exact", fadeRadius: 0, fadeJitter: 0, qualityPenalty: 0.35 },
  hard: { lockStrength: 0.2, captureRadius: 0.7, rampStart: 0.4, rampEnd: 0.9, preview: "fade", fadeRadius: 0.45, fadeJitter: 0.25, qualityPenalty: 0.4 },
};

/** 難易度に対応するアシスト。 */
export function assistFor(difficulty: Difficulty): AssistParams {
  switch (difficulty) {
    case "easy":
      return ASSIST_TABLE.easy;
    case "normal":
      return ASSIST_TABLE.normal;
    case "hard":
      return ASSIST_TABLE.hard;
  }
}
