import type { Half, Side } from "../../types/common";
import type { Bases, GameState, LineScore } from "../../types/game";
import { EMPTY_COUNT } from "./count";
import { EMPTY_BASES, OUTS_PER_INNING } from "./runners";
import { bySide, offenseSide, updateSide } from "./side";

/** 延長に入れる最大イニング数。規定回から数えてこの回数まで決着しなければ引き分け。 */
export const EXTRA_INNINGS_MAX = 3;

/** 延長の各半イニングは無死一・二塁から始める(タイブレーク)。 */
const TIEBREAK_BASES: Bases = { first: true, second: true, third: false };

function totalRuns(lineScore: LineScore, side: Side): number {
  return bySide(lineScore, side).reduce((sum, runs) => sum + runs, 0);
}

/** 現在リードしている側。同点なら `null`。 */
function leader(state: GameState): Side | null {
  const away = totalRuns(state.lineScore, "away");
  const home = totalRuns(state.lineScore, "home");
  if (away === home) {
    return null;
  }
  return away > home ? "away" : "home";
}

function gameOver(state: GameState, winner: Side | null): GameState {
  return { ...state, phase: { kind: "game-over", winner } };
}

/** 新しい半イニングを始める。得点欄に0を追加し、延長ならタイブレークの走者を置く。`lastInPlay` は保持する。 */
function startHalf(state: GameState, inning: number, half: Half): GameState {
  return {
    ...state,
    inning,
    half,
    outs: 0,
    count: EMPTY_COUNT,
    bases: inning > state.config.innings ? TIEBREAK_BASES : EMPTY_BASES,
    lineScore: updateSide(state.lineScore, offenseSide(half), (cells) => [...cells, 0]),
    lastPitchKind: null,
  };
}

/** 表の終了。最終回以降で後攻がリードしていれば裏を行わずに終了、それ以外は同イニングの裏へ。 */
function settleTopEnd(state: GameState): GameState {
  if (state.inning >= state.config.innings && leader(state) === "home") {
    return gameOver(state, "home");
  }
  return startHalf(state, state.inning, "bottom");
}

/** 裏の終了。規定回前なら次イニングの表、規定回以降は得点差で決着、同点なら延長または引き分け。 */
function settleBottomEnd(state: GameState): GameState {
  if (state.inning < state.config.innings) {
    return startHalf(state, state.inning + 1, "top");
  }
  const winner = leader(state);
  if (winner !== null) {
    return gameOver(state, winner);
  }
  if (state.inning < state.config.innings + EXTRA_INNINGS_MAX) {
    return startHalf(state, state.inning + 1, "top");
  }
  return gameOver(state, null);
}

/**
 * 打席の結果を反映した後の、イニング進行・試合終了の判定。順に判定する。
 *
 * 1. サヨナラ: 裏で最終回以降に後攻が先攻を上回った瞬間に終了(アウト数に関わらない)。
 * 2. 3アウトで半イニング終了: 表の終了なら {@link settleTopEnd}、裏の終了なら {@link settleBottomEnd}。
 * 3. それ以外は状態をそのまま(同一参照で)返す。
 */
export function settleInning(state: GameState): GameState {
  if (state.half === "bottom" && state.inning >= state.config.innings && leader(state) === "home") {
    return gameOver(state, "home");
  }
  if (state.outs < OUTS_PER_INNING) {
    return state;
  }
  return state.half === "top" ? settleTopEnd(state) : settleBottomEnd(state);
}
