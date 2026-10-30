import type { GameAction } from "../../types/actions";
import type { SwingInput } from "../../types/batting";
import type { RngState, Side } from "../../types/common";
import type { GameState, LineScore, LogEntry } from "../../types/game";
import type { PitchCommand, PitchFlight } from "../../types/pitch";
import { assistFor } from "../batting/assist";
import { resolvePitch } from "../batting/resolve-pitch";
import { decideCpuBat } from "../cpu/cpu-batter";
import { chooseCpuPitch, commandOfChoice } from "../cpu/cpu-pitcher";
import { getDifficulty } from "../cpu/difficulty";
import { deliverPitch } from "../pitch/delivery";
import { buildResolutionLines, type ResolutionSummary } from "./commentary";
import { settleInning } from "./inning";
import { applyPitchResult } from "./outcome";
import { OUTS_PER_INNING } from "./runners";
import { bySide, defenseSide, offenseSide, tallyAdd } from "./side";
import { currentBatter, currentPitcher } from "./state";

// reducer は完全に純粋(`(state, action) → state`)。乱数はすべて `state.rng` 経由で reducer 内で消費する。
// 無効な組み合わせ(フェーズや操作主体が合わない action)は同一参照の state を返して無視する。

const AWAIT_PITCH: GameState["phase"] = { kind: "await-pitch" };

/** 人間が担当している側か。`humanSide: null`(CPU 同士)ではどちらも `false`。 */
function isHuman(state: GameState, side: Side): boolean {
  return state.config.humanSide === side;
}

/**
 * 投球を実行する。`rng` は呼び出し側が消費した後の乱数状態。
 * `seq` には加算後の `pitchSeq` を渡し、飛行中の球の `flight.seq` と、解決後の `lastInPlay.seq` を一致させる。
 */
function launchPitch(state: GameState, rng: RngState, command: PitchCommand, aimSigmaScale: number): GameState {
  const defense = defenseSide(state.half);
  const seq = state.pitchSeq + 1;
  const [flight, next] = deliverPitch(rng, {
    pitcher: currentPitcher(state),
    command,
    pitchCount: bySide(state.pitchCounts, defense),
    aimSigmaScale,
    seq,
  });
  return {
    ...state,
    rng: next,
    pitchSeq: seq,
    pitchCounts: tallyAdd(state.pitchCounts, defense, 1),
    lastPitchKind: command.kind,
    phase: { kind: "in-flight", flight },
  };
}

function handleCpuPitch(state: GameState): GameState {
  if (state.phase.kind !== "await-pitch" || isHuman(state, defenseSide(state.half))) {
    return state;
  }
  const difficulty = getDifficulty(state.config.difficulty);
  const [choice, rng] = chooseCpuPitch(state.rng, {
    count: state.count,
    pitcher: currentPitcher(state),
    lastKind: state.lastPitchKind,
    difficulty,
  });
  return launchPitch(state, rng, commandOfChoice(choice), difficulty.aimSigmaScale);
}

function handleThrow(state: GameState, command: PitchCommand): GameState {
  if (state.phase.kind !== "await-pitch" || !isHuman(state, defenseSide(state.half))) {
    return state;
  }
  return launchPitch(state, state.rng, command, 1);
}

/** 現在の半イニング(`lineScore` の最後の欄)の得点。 */
function currentCellRuns(lineScore: LineScore, side: Side): number {
  return bySide(lineScore, side).at(-1) ?? 0;
}

function appendLog(log: readonly LogEntry[], seq: number, lines: readonly string[]): readonly LogEntry[] {
  return [...log, ...lines.map((text) => ({ seq, text }))];
}

/**
 * 飛行中の球を判定して試合状態を進める。`swing` が `null` なら見送り。
 * 判定(`resolvePitch`)→ 打席結果の反映(`applyPitchResult`)→ イニング進行(`settleInning`)→ ログ追記の順に行い、
 * 試合が続くなら `await-pitch`、終了なら `game-over` にする。
 */
function resolveFlight(state: GameState, flight: PitchFlight, swing: SwingInput | null): GameState {
  const offense = offenseSide(state.half);
  const [result, rng] = resolvePitch(state.rng, {
    flight,
    swing,
    batter: currentBatter(state),
    outs: state.outs,
    bases: state.bases,
    assist: assistFor(state.config.difficulty),
  });
  const applied = applyPitchResult({ ...state, rng }, result);
  const settled = settleInning(applied);
  const summary: ResolutionSummary = {
    result,
    plate: applied.lastPlate,
    runs: currentCellRuns(applied.lineScore, offense) - currentCellRuns(state.lineScore, offense),
    inningEnded: applied.outs >= OUTS_PER_INNING,
    gameOver: settled.phase.kind === "game-over" ? { winner: settled.phase.winner } : null,
  };
  return {
    ...settled,
    phase: settled.phase.kind === "game-over" ? settled.phase : AWAIT_PITCH,
    log: appendLog(state.log, flight.seq, buildResolutionLines(summary)),
  };
}

function handleSwing(state: GameState, swing: SwingInput): GameState {
  const { phase } = state;
  if (phase.kind !== "in-flight" || !isHuman(state, offenseSide(state.half))) {
    return state;
  }
  return resolveFlight(state, phase.flight, swing);
}

/** ボール到達。人間打者なら見送り、CPU 打者ならここで打撃判断(擬似入力の生成)を行って同じ判定を通す。 */
function handlePitchArrived(state: GameState): GameState {
  const { phase } = state;
  if (phase.kind !== "in-flight") {
    return state;
  }
  if (isHuman(state, offenseSide(state.half))) {
    return resolveFlight(state, phase.flight, null);
  }
  const [decision, rng] = decideCpuBat(state.rng, {
    flight: phase.flight,
    count: state.count,
    batter: currentBatter(state),
    pitcher: currentPitcher(state),
    difficulty: getDifficulty(state.config.difficulty),
  });
  return resolveFlight({ ...state, rng }, phase.flight, decision.type === "swing" ? decision.input : null);
}

/** 試合の状態遷移。action ごとにハンドラへ委譲し、無効な組み合わせは同一参照の `state` を返す。 */
export function reduce(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "CPU_PITCH":
      return handleCpuPitch(state);
    case "THROW":
      return handleThrow(state, action.command);
    case "SWING":
      return handleSwing(state, action.swing);
    case "PITCH_ARRIVED":
      return handlePitchArrived(state);
  }
}
