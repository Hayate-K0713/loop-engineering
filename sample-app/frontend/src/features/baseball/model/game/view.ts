import type { Side } from "../../types/common";
import type { GameState } from "../../types/game";
import type { PitchKind } from "../../types/pitch";
import type { PitcherProfile } from "../../types/team";
import type {
  FieldDiagramGeometry,
  FieldGeometry,
  FieldMarkerView,
  GameView,
  PitchArrow,
  PitchOutcomeView,
  ResultView,
  ScoreboardView,
  ScoreRowView,
} from "../../types/view";
import { assistFor } from "../batting/assist";
import { computeBattedLanding } from "../batting/batted-landing";
import { cursorRadii } from "../batting/cursor";
import { BATTING_PARAMS, LANDING_PARAMS } from "../batting/params";
import { fatigueOf, staminaRatio } from "../pitch/delivery";
import { getPitchSpec } from "../pitch/kinds";
import { PITCH_PARAMS } from "../pitch/params";
import { bySide, defenseSide, offenseSide } from "./side";
import { currentBatter, currentPitcher } from "./state";

// 状態から ui 向けの表示データを作る。ui はこれだけを見る。乱数を消費せず、state も変更しない。

const SIDES: readonly Side[] = ["away", "home"];

/** 試合が始まる前(ログが空)の実況。 */
const PLAY_BALL_TEXT = "プレイボール";

const LOG_VIEW_LIMIT = 50;

/** ゾーン SVG 用の定数。 */
const FIELD_GEOMETRY: FieldGeometry = {
  viewHalfExtent: PITCH_PARAMS.viewHalfExtent,
  zoneHalf: PITCH_PARAMS.zoneHalf,
  gridHalf: PITCH_PARAMS.gridHalf,
  ballRadius: PITCH_PARAMS.ballRadius,
};

/** フィールド図 SVG 用の定数。 */
const FIELD_DIAGRAM: FieldDiagramGeometry = {
  baseDistance: LANDING_PARAMS.baseDistance,
  fenceRadius: LANDING_PARAMS.fenceRadius,
  viewHalfWidth: LANDING_PARAMS.viewHalfWidth,
  viewTop: LANDING_PARAMS.viewTop,
  viewBottom: LANDING_PARAMS.viewBottom,
};

const sumRuns = (cells: readonly number[]): number => cells.reduce((sum, runs) => sum + runs, 0);

function modeOf(humanSide: Side | null, offense: Side): GameView["mode"] {
  if (humanSide === null) {
    return "cpu-only";
  }
  return humanSide === offense ? "human-batting" : "human-pitching";
}

/** 得点欄1マスの表記。到達済みは得点、未到達は「-」、試合が終わって使われなかった裏は「x」。 */
function scoreCell(runs: number | undefined, gameOver: boolean): string {
  if (runs !== undefined) {
    return String(runs);
  }
  return gameOver ? "x" : "-";
}

function scoreRow(state: GameState, side: Side, columns: number): ScoreRowView {
  const cells = bySide(state.lineScore, side);
  const gameOver = state.phase.kind === "game-over";
  return {
    side,
    teamName: bySide(state.teams, side).name,
    shortName: bySide(state.teams, side).shortName,
    cells: Array.from({ length: columns }, (_, index) => scoreCell(cells.at(index), gameOver)),
    runs: sumRuns(cells),
    hits: bySide(state.hits, side),
    errors: bySide(state.errors, side),
  };
}

function scoreboardOf(state: GameState): ScoreboardView {
  const columns = Math.max(state.config.innings, state.inning);
  return { columns, rows: SIDES.map((side) => scoreRow(state, side, columns)) };
}

function batterViewOf(state: GameState): GameView["batter"] {
  const batter = currentBatter(state);
  const order = bySide(state.lineupIndex, offenseSide(state.half));
  return {
    name: batter.name,
    orderLabel: `${order + 1}番`,
    cursorRadii: { meet: cursorRadii(batter, "meet"), power: cursorRadii(batter, "power") },
  };
}

/** 曲がり矢印に数えるしきい値(球種の `bend`、ゾーン単位)。横は |x| がこれ以上、縦は y がこれ以下(落ちる)で矢印に含める。 */
const ARROW_SIDE_MIN = 0.4;
const ARROW_DOWN_MAX = -0.5;

/** 球種の `bend`(x + = ライト側・右、y − = 落ちる)から球種チップの曲がり矢印を求める。 */
function arrowOf(kind: PitchKind): PitchArrow {
  const { x, y } = getPitchSpec(kind).bend;
  const down = y <= ARROW_DOWN_MAX;
  if (x >= ARROW_SIDE_MIN) {
    return down ? "right-down" : "right";
  }
  if (x <= -ARROW_SIDE_MIN) {
    return down ? "left-down" : "left";
  }
  return down ? "down" : "none";
}

/** 球種チップの球速(整数に丸め)。投球で使う値(球速 + 球種の差 − 疲労による低下)と同じ。 */
function chipSpeedKmh(pitcher: PitcherProfile, kind: PitchKind, pitchCount: number): number {
  const fatigue = fatigueOf(staminaRatio(pitcher, pitchCount));
  return Math.round(pitcher.speedKmh + getPitchSpec(kind).speedOffsetKmh - fatigue * PITCH_PARAMS.fatigueSlowKmh);
}

function pitcherViewOf(state: GameState): GameView["pitcher"] {
  const pitcher = currentPitcher(state);
  const pitchCount = bySide(state.pitchCounts, defenseSide(state.half));
  return {
    name: pitcher.name,
    pitchCount,
    staminaPercent: Math.round(staminaRatio(pitcher, pitchCount) * 100),
    repertoire: pitcher.repertoire.map((kind) => ({
      kind,
      label: getPitchSpec(kind).label,
      speedKmh: chipSpeedKmh(pitcher, kind, pitchCount),
      arrow: arrowOf(kind),
    })),
  };
}

function fieldMarkerOf(state: GameState): FieldMarkerView | null {
  const record = state.lastInPlay;
  if (record === null) {
    return null;
  }
  return { seq: record.seq, result: record.result, ...computeBattedLanding(record.ball, record.result, record.seq) };
}

/**
 * 解決した直近の1球の事実(演出用)。`state.lastResult` が `null` の間は `null`。
 * 次の投球が `in-flight` の間は `lastResult` が前の球のものなので、`seq` は `pitchSeq − 1`(それ以外は `pitchSeq`)。
 * これにより、次の投球が始まっても `outcome.seq` は変わらない。
 */
function outcomeOf(state: GameState): PitchOutcomeView | null {
  const result = state.lastResult;
  if (result === null) {
    return null;
  }
  return {
    seq: state.phase.kind === "in-flight" ? state.pitchSeq - 1 : state.pitchSeq,
    kind: result.kind,
    inPlay: result.kind === "in-play" ? { result: result.result, ball: result.ball } : null,
    plate: state.lastPlate,
  };
}

/** チーム色。`teamColors` はサイド別(HUD のチップ用)、`uniforms` は攻撃側・守備側の役割別(描画用)。 */
function colorsOf(state: GameState): Pick<GameView, "teamColors" | "uniforms"> {
  const { away, home } = state.teams;
  return {
    teamColors: { away: away.uniformColor, home: home.uniformColor },
    uniforms: {
      offense: bySide(state.teams, offenseSide(state.half)).uniformColor,
      defense: bySide(state.teams, defenseSide(state.half)).uniformColor,
    },
  };
}

/** 人間視点の勝敗。CPU 同士の試合では `null`。 */
function humanOutcomeOf(humanSide: Side | null, winner: Side | null): ResultView["humanOutcome"] {
  if (humanSide === null) {
    return null;
  }
  if (winner === null) {
    return "draw";
  }
  return winner === humanSide ? "win" : "lose";
}

function resultOf(state: GameState): ResultView | null {
  const { phase } = state;
  if (phase.kind !== "game-over") {
    return null;
  }
  const outcome = humanOutcomeOf(state.config.humanSide, phase.winner);
  return {
    humanOutcome: outcome,
    headline: headlineOf(state, phase.winner, outcome),
    awayRuns: sumRuns(state.lineScore.away),
    homeRuns: sumRuns(state.lineScore.home),
  };
}

/** 見出し。人間が参加する試合は人間視点、CPU 同士は勝ったチーム名。 */
function headlineOf(state: GameState, winner: Side | null, outcome: ResultView["humanOutcome"]): string {
  switch (outcome) {
    case "win":
      return "あなたの勝ち!";
    case "lose":
      return "あなたの負け…";
    case "draw":
      return "引き分け";
    case null:
      return winner === null ? "引き分け" : `${bySide(state.teams, winner).name}の勝ち`;
  }
}

/** 飛行中の球の表示ラベル(「142km/h ストレート」)。それ以外は「-」。 */
function pitchSpeedLabelOf(state: GameState): string {
  const { phase } = state;
  return phase.kind === "in-flight" ? `${Math.round(phase.flight.speedKmh)}km/h ${getPitchSpec(phase.flight.kind).label}` : "-";
}

/**
 * ボールが到達して判定するまでの経過ゲーム時間。人間打者には見逃し確定までの猶予(`lateCutoffMs`)を加える。
 * 猶予は判定窓(`contactWindowMs`)より長く、窓を過ぎたスイングも振り遅れの空振りとして演出が返るようにするため。
 * 締切は入力イベントの時刻(遅延補正前)で判定する(タップは押下時刻、それ以外は処理時刻)。
 */
function arriveAfterMsOf(state: GameState): number {
  const { phase } = state;
  if (phase.kind !== "in-flight") {
    return 0;
  }
  return phase.flight.durationMs + (state.config.humanSide === offenseSide(state.half) ? BATTING_PARAMS.lateCutoffMs : 0);
}

/** 表示用の状態。`state` も乱数も変更しない(フィールド図の落下点は決定論で逆算する)。 */
export function toGameView(state: GameState): GameView {
  const { phase, config } = state;
  const offense = offenseSide(state.half);
  const awaiting = phase.kind === "await-pitch";
  const humanDefends = config.humanSide === defenseSide(state.half);
  return {
    status: phase.kind === "game-over" ? "game-over" : "playing",
    mode: modeOf(config.humanSide, offense),
    inningLabel: `${state.inning}回${state.half === "top" ? "表" : "裏"}`,
    isExtra: state.inning > config.innings,
    outs: state.outs,
    balls: state.count.balls,
    strikes: state.count.strikes,
    bases: state.bases,
    scoreboard: scoreboardOf(state),
    batter: batterViewOf(state),
    pitcher: pitcherViewOf(state),
    difficulty: config.difficulty,
    assist: assistFor(config.difficulty),
    flight: phase.kind === "in-flight" ? phase.flight : null,
    arriveAfterMs: arriveAfterMsOf(state),
    pitchSpeedLabel: pitchSpeedLabelOf(state),
    pitchReady: awaiting && humanDefends,
    swingReady: phase.kind === "in-flight" && config.humanSide === offense,
    cpuPitchPending: awaiting && !humanDefends,
    turnKey: `${state.pitchSeq}:${phase.kind}`,
    lastEvent: state.log.at(-1)?.text ?? PLAY_BALL_TEXT,
    log: state.log.slice(-LOG_VIEW_LIMIT),
    geometry: FIELD_GEOMETRY,
    fieldMarker: fieldMarkerOf(state),
    fieldDiagram: FIELD_DIAGRAM,
    result: resultOf(state),
    outcome: outcomeOf(state),
    ...colorsOf(state),
  };
}
