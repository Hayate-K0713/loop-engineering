import type { InPlayResult, PitchResult, PlateOutcome } from "../../types/batting";
import type { Side } from "../../types/common";

/** 攻守交代(3アウト)のログ行。 */
export const INNING_CHANGE_TEXT = "3アウトチェンジ";

/** インプレー結果の実況テキスト。 */
export function describeInPlay(result: InPlayResult): string {
  switch (result) {
    case "groundout":
      return "ゴロアウト";
    case "doublePlay":
      return "併殺打";
    case "flyout":
      return "フライアウト";
    case "lineout":
      return "ライナーアウト";
    case "single":
      return "ヒット";
    case "double":
      return "二塁打";
    case "triple":
      return "三塁打";
    case "homerun":
      return "ホームラン";
    case "error":
      return "エラーで出塁";
  }
}

/** 1球の結果の実況テキスト。 */
export function describePitchResult(result: PitchResult): string {
  switch (result.kind) {
    case "ball":
      return "ボール";
    case "called-strike":
      return "見逃しストライク";
    case "swinging-strike":
      return "空振り";
    case "foul":
      return "ファウル";
    case "in-play":
      return describeInPlay(result.result);
  }
}

/** 打席の結果(終わり方)の実況テキスト。 */
export function describePlateOutcome(outcome: PlateOutcome): string {
  if (outcome === "walk") {
    return "四球";
  }
  if (outcome === "strikeout") {
    return "三振";
  }
  return describeInPlay(outcome);
}

export function describeRuns(runs: number): string {
  return `${runs}点が入りました`;
}

export function describeGameEnd(winner: Side | null): string {
  if (winner === null) {
    return "試合終了 引き分け";
  }
  return winner === "away" ? "試合終了 先攻の勝ち" : "試合終了 後攻の勝ち";
}

/** 1解決(1球の判定)で起きたことの要約。`gameOver` は試合が終了した場合のみ非 `null`。 */
export type ResolutionSummary = {
  readonly result: PitchResult;
  readonly plate: PlateOutcome | null;
  readonly runs: number;
  readonly inningEnded: boolean;
  readonly gameOver: { readonly winner: Side | null } | null;
};

function playLines(result: PitchResult, plate: PlateOutcome | null): readonly string[] {
  if (plate === null) {
    return [describePitchResult(result)];
  }
  if (result.kind === "in-play") {
    return [describePlateOutcome(plate)];
  }
  return [describePitchResult(result), describePlateOutcome(plate)];
}

/**
 * 1解決につき数行のログ行を作る(球の結果 → 打席の結果 → 得点 → 攻守交代 → 試合終了の順)。
 * インプレーは打席の結果だけを出し、四球・三振は球の結果と打席の結果の2行にする。
 * 試合が終了する場合は「3アウトチェンジ」を出さない。
 */
export function buildResolutionLines(summary: ResolutionSummary): readonly string[] {
  return [
    ...playLines(summary.result, summary.plate),
    ...(summary.runs > 0 ? [describeRuns(summary.runs)] : []),
    ...(summary.inningEnded && summary.gameOver === null ? [INNING_CHANGE_TEXT] : []),
    ...(summary.gameOver === null ? [] : [describeGameEnd(summary.gameOver.winner)]),
  ];
}
