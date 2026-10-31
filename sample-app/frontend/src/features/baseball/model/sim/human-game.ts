import type { PlateOutcome } from "../../types/batting";
import type { ZonePoint } from "../../types/common";
import type { GameConfig, GameState } from "../../types/game";
import { EMPTY_BASES } from "../game/runners";
import { reduce } from "../game/reducer";
import { createInitialState } from "../game/state";
import { isStrike } from "../pitch/zone";
import { type Condition, type HumanPlayer, type Level, type RingBiasScenario, mulberry32, planPitch, sampleHumanPlayer, stratifiedTraits } from "./human-bot";

// 人間代理ボット v2 の PA シミュレータ。`reduce`(CPU 投手 → ボットのスイング/見逃し)を直接駆動し、カウント・四球・三振を含めた打席結果を数える。
// 人間は先攻(`humanSide: "away"`)。攻守が替わったら(裏は人間が守備になり進まない)イニングを 1 回表へ戻すだけで、打順・乱数・カウントは続ける。

const HITS: ReadonlySet<PlateOutcome> = new Set<PlateOutcome>(["single", "double", "triple", "homerun"]);

/** 1 人のプレイヤーの集計(球・打席の件数)。 */
type PlayerTally = {
  pitches: number;
  strikePitches: number;
  ballPitches: number;
  /** 振ろうとした球(押下が届かなかったものを含む)。 */
  strikeIntents: number;
  ballIntents: number;
  /** 実際にスイングになった球(判定された)。 */
  strikeSwings: number;
  ballSwings: number;
  swings: number;
  contacts: number;
  plateAppearances: number;
  walks: number;
  strikeouts: number;
  hits: number;
  homeRuns: number;
  /** 押下(振ろうとした球)の内訳: 到達の後の押下・長押し・移動・pointercancel。 */
  late: number;
  slow: number;
  drift: number;
  cancel: number;
  presses: number;
  pressOffsetSum: number;
  pressOffsetSquareSum: number;
  distancesPx: number[];
};

function emptyTally(): PlayerTally {
  return {
    pitches: 0,
    strikePitches: 0,
    ballPitches: 0,
    strikeIntents: 0,
    ballIntents: 0,
    strikeSwings: 0,
    ballSwings: 0,
    swings: 0,
    contacts: 0,
    plateAppearances: 0,
    walks: 0,
    strikeouts: 0,
    hits: 0,
    homeRuns: 0,
    late: 0,
    slow: 0,
    drift: 0,
    cancel: 0,
    presses: 0,
    pressOffsetSum: 0,
    pressOffsetSquareSum: 0,
    distancesPx: [],
  };
}

/** 攻守が替わった・試合が終わった状態を、1 回表の無死・走者なし・0-0 へ戻す(打順・乱数・投球数は続ける)。 */
function resetInning(state: GameState): GameState {
  if (state.half === "top" && state.phase.kind !== "game-over") {
    return state;
  }
  return {
    ...state,
    inning: 1,
    half: "top",
    outs: 0,
    bases: EMPTY_BASES,
    lineScore: { away: [0], home: [] },
    lastPitchKind: null,
    phase: { kind: "await-pitch" },
  };
}

/** 1 球の結果を集計に足す(打席が終わったなら打席の集計も)。 */
function tallyPitch(tally: PlayerTally, state: GameState): void {
  const result = state.lastResult;
  if (result !== null && result.kind !== "ball" && result.kind !== "called-strike") {
    tally.swings += 1;
    tally.contacts += result.kind === "swinging-strike" ? 0 : 1;
  }
  const plate = state.lastPlate;
  if (plate === null) {
    return;
  }
  tally.plateAppearances += 1;
  tally.walks += plate === "walk" ? 1 : 0;
  tally.strikeouts += plate === "strikeout" ? 1 : 0;
  tally.hits += HITS.has(plate) ? 1 : 0;
  tally.homeRuns += plate === "homerun" ? 1 : 0;
}

type Session = {
  state: GameState;
  cursor: ZonePoint;
  readonly tally: PlayerTally;
};

/** 押下の内訳(到達の後・長押し・移動・pointercancel)を足す。 */
function tallyPress(tally: PlayerTally, reason: "late" | "slow" | "drift" | "cancel" | null, offsetMs: number, distancePx: number): void {
  tally.presses += 1;
  tally.late += reason === "late" ? 1 : 0;
  tally.slow += reason === "slow" ? 1 : 0;
  tally.drift += reason === "drift" ? 1 : 0;
  tally.cancel += reason === "cancel" ? 1 : 0;
  if (reason === null) {
    tally.pressOffsetSum += offsetMs;
    tally.pressOffsetSquareSum += offsetMs * offsetMs;
    tally.distancesPx.push(distancePx);
  }
}

/** 1 球を投げさせ、ボットが振る/見送る。 */
function playPitch(session: Session, player: HumanPlayer, condition: Condition, rand: () => number): void {
  const launched = reduce(session.state, { type: "CPU_PITCH" });
  if (launched.phase.kind !== "in-flight") {
    throw new Error("playPitch: the CPU pitch did not start (humanSide must be away and the half must be top)");
  }
  const flight = launched.phase.flight;
  const strike = isStrike(flight.landing);
  const plan = planPitch({ player, condition, flight, count: launched.count, start: session.cursor }, rand);
  const tally = session.tally;
  tally.pitches += 1;
  tally.strikePitches += strike ? 1 : 0;
  tally.ballPitches += strike ? 0 : 1;
  if (plan.intent) {
    tally.strikeIntents += strike ? 1 : 0;
    tally.ballIntents += strike ? 0 : 1;
    tally.strikeSwings += strike && plan.swing !== null ? 1 : 0;
    tally.ballSwings += !strike && plan.swing !== null ? 1 : 0;
    tallyPress(tally, plan.noSwing, plan.pressOffsetMs ?? 0, plan.rawDistancePx ?? 0);
  }
  session.cursor = plan.cursorAfter;
  const resolved = reduce(launched, plan.swing === null ? { type: "PITCH_ARRIVED" } : { type: "SWING", swing: plan.swing });
  tallyPitch(tally, resolved);
  session.state = resetInning(resolved);
}

const CONFIG_BASE = { innings: 9, humanSide: "away" } as const;

/** 1 人のプレイヤーが CPU 投手を相手に `pitches` 球を打つ。`seed` はゲーム側の乱数、ボット側は `seed` から別系列。 */
export function playHuman(player: HumanPlayer, condition: Condition, pitches: number, seed: number): PlayerTally {
  const config: GameConfig = { ...CONFIG_BASE, difficulty: condition.difficulty };
  const session: Session = { state: createInitialState({ config, seed }), cursor: { x: 0, y: 0 }, tally: emptyTally() };
  const rand = mulberry32(seed * 31 + 7);
  for (let pitch = 0; pitch < pitches; pitch += 1) {
    playPitch(session, player, condition, rand);
  }
  return session.tally;
}

// ---------- 1 人あたりの指標と、母集団の分位 ----------

/** 1 人の指標(割合は 0〜1)。分母が 0 の指標は 0。 */
export type PlayerMetrics = {
  /** 打率 = 安打 ÷ (打席 − 四球)。 */
  readonly average: number;
  readonly strikeoutRate: number;
  readonly walkRate: number;
  /** 本塁打率 = 本塁打 ÷ 打席。 */
  readonly homeRunRate: number;
  /**
   * コンタクト率 = 振ろうとした球のうち当たった(ファウル・インプレー)割合。到達の後の押下(見逃し扱い)・長押し・移動・pointercancel で
   * スイングにならなかった押下は当たらなかった扱い。受け入れ帯(E1〜E3・E10)はこちらで判定する(ログの `contactRate` より厳しい側)。
   */
  readonly contactRate: number;
  /** ログの `contactRate` と同じ定義(実際にスイングになった球のうち空振りでない割合)。 */
  readonly swingContactRate: number;
  /** ストライクを振る率(実際にスイングになった球 ÷ ストライクの球。ログの `swingAtStrikeRate` と同じ定義)。 */
  readonly strikeSwingRate: number;
  /** ストライクを振ろうとした率(押下が届かなかったものを含む ÷ ストライクの球)。 */
  readonly strikeIntentRate: number;
  /** ボール球を振る率(振ろうとした球 ÷ ボール球。押下が届かなくても含める)。 */
  readonly ballSwingRate: number;
  /** 押したのにスイングにならなかった率(長押し + 移動 + pointercancel ÷ 到達前の押下)。 */
  readonly noSwingRate: number;
  /** そのうちタップの失敗(長押し + 移動)だけ。テレメトリの `tap-too-long` + `tap-moved` に対応。 */
  readonly tapFailRate: number;
  /** 到達の後の押下(見逃し扱い)の割合(押下に対して)。 */
  readonly lateRate: number;
  /** 押下の時刻 − D の平均・SD(ms。スイングになった押下だけ)。 */
  readonly pressMeanMs: number;
  readonly pressSdMs: number;
  /** 素のカーソルと着弾点の距離の中央値(px)。 */
  readonly distanceMedianPx: number;
  readonly pitches: number;
  readonly plateAppearances: number;
};

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/** 昇順の配列の分位(0〜1。線形補間)。空は 0。 */
export function quantileOf(values: readonly number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const last = sorted.length - 1;
  if (last < 0) {
    return 0;
  }
  const position = Math.min(1, Math.max(0, q)) * last;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  const lowValue = sorted.at(low) ?? 0;
  const highValue = sorted.at(high) ?? lowValue;
  return lowValue * (1 - (position - low)) + highValue * (position - low);
}

export function metricsOf(tally: PlayerTally): PlayerMetrics {
  const effective = tally.presses - tally.late;
  const pressed = effective - tally.slow - tally.drift - tally.cancel;
  const mean = ratio(tally.pressOffsetSum, pressed);
  return {
    average: ratio(tally.hits, tally.plateAppearances - tally.walks),
    strikeoutRate: ratio(tally.strikeouts, tally.plateAppearances),
    walkRate: ratio(tally.walks, tally.plateAppearances),
    homeRunRate: ratio(tally.homeRuns, tally.plateAppearances),
    contactRate: ratio(tally.contacts, tally.presses),
    swingContactRate: ratio(tally.contacts, tally.swings),
    strikeSwingRate: ratio(tally.strikeSwings, tally.strikePitches),
    strikeIntentRate: ratio(tally.strikeIntents, tally.strikePitches),
    ballSwingRate: ratio(tally.ballIntents, tally.ballPitches),
    noSwingRate: ratio(tally.slow + tally.drift + tally.cancel, effective),
    tapFailRate: ratio(tally.slow + tally.drift, effective),
    lateRate: ratio(tally.late, tally.presses),
    pressMeanMs: mean,
    pressSdMs: Math.sqrt(Math.max(0, ratio(tally.pressOffsetSquareSum, pressed) - mean * mean)),
    distanceMedianPx: quantileOf(tally.distancesPx, 0.5),
    pitches: tally.pitches,
    plateAppearances: tally.plateAppearances,
  };
}

/** 母集団の指標の分位(P10/P50/P90)。 */
export type Spread = { readonly p10: number; readonly p50: number; readonly p90: number };

export type PopulationMetrics = Readonly<Record<keyof PlayerMetrics, Spread>>;

const METRIC_KEYS: readonly (keyof PlayerMetrics)[] = [
  "average",
  "strikeoutRate",
  "walkRate",
  "homeRunRate",
  "contactRate",
  "swingContactRate",
  "strikeSwingRate",
  "strikeIntentRate",
  "ballSwingRate",
  "noSwingRate",
  "tapFailRate",
  "lateRate",
  "pressMeanMs",
  "pressSdMs",
  "distanceMedianPx",
  "pitches",
  "plateAppearances",
];

/** 指標を名前で引く(変数添字を避ける)。 */
function metricOf(metrics: PlayerMetrics, key: keyof PlayerMetrics): number {
  return new Map<string, number>(Object.entries(metrics)).get(key) ?? 0;
}

function spreadOf(values: readonly number[]): Spread {
  return { p10: quantileOf(values, 0.1), p50: quantileOf(values, 0.5), p90: quantileOf(values, 0.9) };
}

/** 母集団の指標を、項目ごとの P10/P50/P90 にまとめる。 */
export function summarizePopulation(players: readonly PlayerMetrics[]): PopulationMetrics {
  return Object.fromEntries(METRIC_KEYS.map((key) => [key, spreadOf(players.map((metrics) => metricOf(metrics, key)))])) as PopulationMetrics;
}

type PopulationOptions = {
  readonly level: Level;
  readonly condition: Condition;
  /** 人数。 */
  readonly players: number;
  /** 1 人あたりの球数。 */
  readonly pitches: number;
  readonly seed: number;
  readonly ringBias?: RingBiasScenario;
};

/** レベルの分布から `players` 人をサンプルし、それぞれに `pitches` 球を打たせた指標。 */
export function runPopulation(options: PopulationOptions): readonly PlayerMetrics[] {
  const { level, condition, players, pitches, seed } = options;
  const traits = stratifiedTraits(players, mulberry32(seed));
  return traits.map((trait, index) => {
    const player = sampleHumanPlayer(level, trait, options.ringBias ?? "model");
    return metricsOf(playHuman(player, condition, pitches, seed * 1009 + index + 1));
  });
}
