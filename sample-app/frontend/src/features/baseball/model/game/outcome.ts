import type { PitchResult, PlateOutcome } from "../../types/batting";
import type { Side } from "../../types/common";
import type { BaseTo, Bases, GameState, InPlayRecord, LineScore, RunnerMoves } from "../../types/game";
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

/** 打者走者の到達塁(0 = アウト。三振・凡打。打席にとどまる)。 */
function batterDestination(plate: PlateOutcome): BaseTo {
  switch (plate) {
    case "walk":
    case "single":
    case "error":
      return 1;
    case "double":
      return 2;
    case "triple":
      return 3;
    case "homerun":
      return 4;
    case "strikeout":
    case "groundout":
    case "doublePlay":
    case "flyout":
    case "lineout":
      return 0;
  }
}

/** 塁上の走者の出発塁(一〜三塁)。 */
type RunnerBase = 1 | 2 | 3;

function isOccupied(bases: Bases, base: RunnerBase): boolean {
  switch (base) {
    case 1:
      return bases.first;
    case 2:
      return bases.second;
    case 3:
      return bases.third;
  }
}

/** 塁上の走者の出発塁(3 → 2 → 1 の順。先頭の走者が先)。 */
function occupiedBases(bases: Bases): readonly RunnerBase[] {
  const all: readonly RunnerBase[] = [3, 2, 1];
  return all.filter((base) => isOccupied(bases, base));
}

/**
 * 1球の進塁の事実(表示専用)。走者の並びは変わらず先頭の走者から順に到達先(本塁 → 三塁 → 二塁 → 一塁)が割り当たることから、
 * 規則(`advanceRunners`)を重複させずに、適用前後の塁(`before`/`after`)・得点数(`scored`)・打者走者の到達塁から導く。
 * 到達先が余った(後ろの)走者の `to` は 0(この球の終わりに塁上にいない: 併殺でのアウト、または 3 アウト目でのクリア)。
 * `after`/`scored` は 3 アウト目のとき `advanceRunners` が返すクリア後の値(走者なし・得点なし)を渡す。
 */
export function runnerMovesOf(before: Bases, after: Bases, scored: number, plate: PlateOutcome): RunnerMoves {
  const batterTo = batterDestination(plate);
  const homeCount = Math.max(0, scored - (batterTo === 4 ? 1 : 0));
  const home = Array.from({ length: homeCount }, (): BaseTo => 4);
  const stayed = occupiedBases(after).filter((base) => base !== batterTo);
  const destinations: readonly BaseTo[] = [...home, ...stayed];
  const advances = occupiedBases(before).map((from, index) => ({ from, to: destinations.at(index) ?? 0 }));
  return { before, after, scored, batterTo, advances };
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
    lastAdvance: { seq: state.pitchSeq, ...runnerMovesOf(state.bases, advance.bases, advance.runs, plate) },
    lineupIndex: updateSide(state.lineupIndex, offense, (index) => (index + 1) % LINEUP_SIZE),
  };
}

/**
 * 1球の結果を試合状態に反映する(攻守交代は行わない。`outs` が3になりうる)。
 *
 * - `lastResult` は毎球その球の結果。
 * - `lastPlate` は打席が終わった球ではその結果、打席が続く球では `null`。
 * - インプレーのときだけ `lastInPlay = { seq: state.pitchSeq, result, ball }` を設定し、それ以外では直前の値を保持する。
 * - `lastAdvance` は打席が終わった球ではその球の進塁の事実(`seq` = `state.pitchSeq`)、打席が続く球では `null`(表示専用で、乱数・判定には影響しない)。
 */
export function applyPitchResult(state: GameState, result: PitchResult): GameState {
  const step = stepCount(state, result);
  const plate = plateOutcomeOf(result, step.end);
  const next: GameState = { ...state, lastResult: result, lastPlate: plate, lastInPlay: inPlayRecordOf(state, result), lastAdvance: null };
  if (plate === null) {
    return { ...next, count: step.count };
  }
  return finishPlateAppearance(next, result, plate);
}
