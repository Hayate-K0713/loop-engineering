import type { PitchResult, PlateOutcome } from "../../types/batting";
import type { Side } from "../../types/common";
import type { GameState, InPlayRecord, LineScore } from "../../types/game";
import { applyBall, applyFoul, applyStrike, EMPTY_COUNT, type CountEnd, type CountStep } from "./count";
import { advanceRunners } from "./runners";
import { defenseSide, offenseSide, tallyAdd, updateSide } from "./side";

/** 打順の人数(打者番号は 0〜8 を循環する)。 */
export const LINEUP_SIZE = 9;

/** 安打として `hits` に数える打席結果。 */
const HIT_OUTCOMES: ReadonlySet<PlateOutcome> = new Set<PlateOutcome>(["single", "double", "triple", "homerun"]);

function stepCount(state: GameState, result: PitchResult): CountStep {
  switch (result.kind) {
    case "ball":
      return applyBall(state.count);
    case "called-strike":
    case "swinging-strike":
      return applyStrike(state.count);
    case "foul":
      return applyFoul(state.count);
    case "in-play":
      return { count: state.count, end: "none" };
  }
}

/** 打席がこの球で終わったならその結果、続くなら `null`。 */
function plateOutcomeOf(result: PitchResult, end: CountEnd): PlateOutcome | null {
  if (result.kind === "in-play") {
    return result.result;
  }
  return end === "none" ? null : end;
}

function inPlayRecordOf(state: GameState, result: PitchResult): InPlayRecord | null {
  return result.kind === "in-play" ? { seq: state.pitchSeq, result: result.result, ball: result.ball } : state.lastInPlay;
}

/** 現在の半イニング(`lineScore` の最後の要素)に得点を加える。 */
function addRuns(lineScore: LineScore, side: Side, runs: number): LineScore {
  return updateSide(lineScore, side, (cells) => cells.map((value, index) => (index === cells.length - 1 ? value + runs : value)));
}

/** 打席が終わった球の状態更新。走者・アウト・得点・安打/失策・打順・カウントを進める。 */
function finishPlateAppearance(state: GameState, result: PitchResult, plate: PlateOutcome): GameState {
  const offense = offenseSide(state.half);
  const defense = defenseSide(state.half);
  const advance = advanceRunners(state.bases, state.outs, { kind: plate, strength: result.kind === "in-play" ? result.ball.strength : null });
  return {
    ...state,
    count: EMPTY_COUNT,
    outs: state.outs + advance.outsAdded,
    bases: advance.bases,
    lineScore: addRuns(state.lineScore, offense, advance.runs),
    hits: HIT_OUTCOMES.has(plate) ? tallyAdd(state.hits, offense, 1) : state.hits,
    errors: plate === "error" ? tallyAdd(state.errors, defense, 1) : state.errors,
    lineupIndex: updateSide(state.lineupIndex, offense, (index) => (index + 1) % LINEUP_SIZE),
  };
}

/**
 * 1球の結果を試合状態に反映する(攻守交代は行わない。`outs` が3になりうる)。
 *
 * - `lastResult` は毎球その球の結果。
 * - `lastPlate` は打席が終わった球ではその結果、打席が続く球では `null`。
 * - インプレーのときだけ `lastInPlay = { seq: state.pitchSeq, result, ball }` を設定し、それ以外では直前の値を保持する。
 */
export function applyPitchResult(state: GameState, result: PitchResult): GameState {
  const step = stepCount(state, result);
  const plate = plateOutcomeOf(result, step.end);
  const next: GameState = { ...state, lastResult: result, lastPlate: plate, lastInPlay: inPlayRecordOf(state, result) };
  if (plate === null) {
    return { ...next, count: step.count };
  }
  return finishPlateAppearance(next, result, plate);
}
