import type { PitchResult, SwingInputKind, SwingKind } from "../../types/batting";
import type { RngState, ZonePoint } from "../../types/common";
import type { Count } from "../../types/game";
import type { PitchFlight } from "../../types/pitch";
import type { BatterProfile } from "../../types/team";
import { clampCursor } from "../batting/cursor";
import { BATTING_PARAMS } from "../batting/params";
import { resolvePitch } from "../batting/resolve-pitch";
import { decideCpuBat } from "../cpu/cpu-batter";
import { getDifficulty } from "../cpu/difficulty";
import { chooseCpuPitch } from "../cpu/cpu-pitcher";
import { CPU_TEAM, PLAYER_TEAM } from "../data/teams";
import { deliverPitch } from "../pitch/delivery";
import { isStrike } from "../pitch/zone";
import { createRng } from "../rng/rng";
import { zoneRectOf } from "../world/camera/project";
import { battingCameraFor } from "../world/camera/rig";
import { pitchBallAt } from "../world/path/pitch-path";
import { worldToZone } from "../world/space/coords";
import { WORLD_PARAMS } from "../world/space/params";
import { swingAtMs } from "../world/sequence/swing-time";

// 人間を模したボットで、判定の数値(当たり範囲・結果表・強さのしきい値)を調整・検証するためのテスト専用の合成層。
// `world/`(軌道・投影)と `game/`・`cpu/`・`batting/`・`pitch/`・`data/` の両方を使うので、`model/sim/` に置き、`*.test.ts` からだけ import する。
// ボット側の乱数は独自の mulberry32(`Math.random` は使わない)、ゲーム側の乱数は実装の `createRng`。
// 演出の時刻(受付時刻・タップの長さ)は結果に影響しないので持たない。

/** 画面(ビューポート)の大きさ(CSS px)。 */
export type Viewport = { readonly width: number; readonly height: number };

/** 人間を模したボットの定義。 */
export type BotSpec = {
  readonly name: string;
  /** 表示+入力の遅延 L(ms)。入力イベントの時刻が「見た到達」より遅れる量。 */
  readonly latencyMs: number;
  /** 入力イベント時刻のばらつき σt(ms)。 */
  readonly timingSigmaMs: number;
  /** 反応時間 RT(ms)。イベントの何 ms 前までのボールの位置・速度でカーソルを決めるか。 */
  readonly reactionMs: number;
  /** カーソル位置のばらつき σpos(px)。 */
  readonly posSigmaPx: number;
  /** 指を離す・置くときの追加のずれ(px)。片手(ボット F)のみ。 */
  readonly releaseSigmaPx: number;
  /** 入力の種類。遅延補正の量を決める(タップ = touch、クリック = mouse)。 */
  readonly input: SwingInputKind;
  readonly viewport: Viewport;
  /** 到達の手がかりのずれ(ms)。正 = ボールの到達を実際より遅く感じる。 */
  readonly cueOffsetMs: number;
  readonly swingKind: SwingKind;
};

/** ボット 1 種の集計(ストライクを振った球の数に対する内訳)。 */
export type BotTally = {
  readonly swings: number;
  /** 見逃し扱い(入力イベントが締切 `D + lateCutoffMs` より遅い)。 */
  readonly ignored: number;
  readonly miss: number;
  readonly foul: number;
  readonly inPlay: number;
  readonly hit: number;
  readonly homeRun: number;
};

const PHONE_PORTRAIT: Viewport = { width: 390, height: 844 };
const PHONE_SHORT: Viewport = { width: 390, height: 664 };
const DESKTOP: Viewport = { width: 1280, height: 720 };

const BASE_BOT: BotSpec = {
  name: "",
  latencyMs: 80,
  timingSigmaMs: 50,
  reactionMs: 200,
  posSigmaPx: 8,
  releaseSigmaPx: 0,
  input: "touch",
  viewport: PHONE_PORTRAIT,
  cueOffsetMs: 0,
  swingKind: "meet",
};

/** 設計 §10 のボット。A 上手い人 / B スマホ標準 / B@664 / F 片手 / C 初心者 / D 到達を遅く感じる / E PC マウス / B-強振。 */
export const BOTS: Readonly<Record<"A" | "B" | "B664" | "F" | "C" | "D" | "E" | "BPower", BotSpec>> = {
  A: { ...BASE_BOT, name: "A 上手い人", latencyMs: BATTING_PARAMS.inputLatencyMs.touch, timingSigmaMs: 35, reactionMs: 150, posSigmaPx: 5 },
  B: { ...BASE_BOT, name: "B スマホ標準" },
  B664: { ...BASE_BOT, name: "B@664", viewport: PHONE_SHORT },
  F: { ...BASE_BOT, name: "F 片手", timingSigmaMs: 60, releaseSigmaPx: 5 },
  C: { ...BASE_BOT, name: "C スマホ初心者", latencyMs: 100, timingSigmaMs: 70, reactionMs: 250, posSigmaPx: 12 },
  D: { ...BASE_BOT, name: "D 到達を遅く感じる", cueOffsetMs: 60 },
  E: { ...BASE_BOT, name: "E PC マウス", latencyMs: 40, timingSigmaMs: 40, reactionMs: 150, posSigmaPx: 10, input: "mouse", viewport: DESKTOP },
  BPower: { ...BASE_BOT, name: "B-強振", swingKind: "power" },
};

// ---------- ボット側の乱数 ----------

/** 決定論の乱数(mulberry32)。`Math.random` は使わない。 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 標準正規分布の近似(一様乱数 12 個の和 − 6)。 */
function gauss(rand: () => number): number {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += rand();
  }
  return sum - 6;
}

// ---------- 画面とゾーン単位の換算 ----------

/** ビューポートの空き領域(画面高比)。上は HUD の下端 155px、下は打撃のティッカー(下から 181px)の上端。 */
function safeAreaOf(viewport: Viewport): { readonly top: number; readonly bottom: number } {
  return { top: 155 / viewport.height, bottom: (viewport.height - 181) / viewport.height };
}

/** ゾーン座標 1 単位(ゾーン半幅・半高)あたりの画面上の px(`camera/project.ts` の打撃カメラの投影から求める)。 */
export function pxPerZoneUnit(viewport: Viewport): { readonly x: number; readonly y: number } {
  const key = `${viewport.width}x${viewport.height}`;
  const cached = UNIT_CACHE.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const pose = battingCameraFor(viewport.width / viewport.height, "batting", safeAreaOf(viewport));
  const rect = zoneRectOf(pose, viewport, WORLD_PARAMS.zone);
  const unit = { x: rect.width / 2, y: rect.height / 2 };
  UNIT_CACHE.set(key, unit);
  return unit;
}

const UNIT_CACHE = new Map<string, { readonly x: number; readonly y: number }>();

// ---------- 入力イベントと判定時刻 ----------

/** 入力イベントの時刻 `eventMs`(リリースから)が見逃し扱いか。締切は**補正前の入力時刻**で比べる(`atMs` ではない)。 */
export function isIgnoredEvent(eventMs: number, durationMs: number): boolean {
  return eventMs > durationMs + BATTING_PARAMS.lateCutoffMs;
}

/** 入力イベントの時刻から判定時刻 `atMs` を求める(実装の `swingAtMs`。遅延補正を引く)。 */
export function judgeTimeOf(eventMs: number, input: SwingInputKind): number {
  const origin = { timeStamp: eventMs, sourceTimeStamp: eventMs, inputKind: input };
  return swingAtMs({ origin, nowMs: eventMs, startedAtMs: 0, timeScale: 1 });
}

/** 観測時刻 `observedMs` までのボールの位置・速度から、直線外挿で着弾点(ゾーン座標)を推定する。 */
function estimateLanding(flight: PitchFlight, observedMs: number): ZonePoint {
  const frameMs = 1000 / 60;
  const at = Math.max(frameMs, Math.min(observedMs, flight.durationMs));
  const now = pitchBallAt(flight, at);
  const before = pitchBallAt(flight, at - frameMs);
  const steps = (WORLD_PARAMS.zone.planeZ - now.z) / (now.z - before.z);
  return worldToZone({ x: now.x + (now.x - before.x) * steps, y: now.y + (now.y - before.y) * steps, z: WORLD_PARAMS.zone.planeZ });
}

// ---------- 1 球の試行 ----------

type SimState = {
  rng: RngState;
  readonly rand: () => number;
  tally: BotTally;
  seq: number;
};

const EMPTY_TALLY: BotTally = { swings: 0, ignored: 0, miss: 0, foul: 0, inPlay: 0, hit: 0, homeRun: 0 };
const EMPTY_BASES = { first: false, second: false, third: false } as const;
const HITS: ReadonlySet<string> = new Set(["single", "double", "triple", "homerun"]);
const NORMAL = getDifficulty("normal");
const PITCHER = CPU_TEAM.pitcher;

function batterOf(index: number): BatterProfile {
  const batter = PLAYER_TEAM.batters.at(index % PLAYER_TEAM.batters.length);
  if (batter === undefined) {
    throw new Error("batterOf: no batter");
  }
  return batter;
}

/** ランダムなカウント(投手の配球が変わる)。 */
function randomCount(rand: () => number): Count {
  return { balls: Math.floor(rand() * 4), strikes: Math.floor(rand() * 3) };
}

/** CPU 投手が次の 1 球を投げる(`state.rng` を進める)。 */
function nextFlight(state: SimState): PitchFlight {
  const [command, afterCommand] = chooseCpuPitch(state.rng, { count: randomCount(state.rand), pitcher: PITCHER, lastKind: null, difficulty: NORMAL });
  state.seq += 1;
  const [flight, afterDeliver] = deliverPitch(afterCommand, { pitcher: PITCHER, command, pitchCount: 20, aimSigmaScale: NORMAL.aimSigmaScale, seq: state.seq });
  state.rng = afterDeliver;
  return flight;
}

function addToTally(tally: BotTally, change: Partial<Record<keyof BotTally, number>>): BotTally {
  return {
    swings: tally.swings + (change.swings ?? 0),
    ignored: tally.ignored + (change.ignored ?? 0),
    miss: tally.miss + (change.miss ?? 0),
    foul: tally.foul + (change.foul ?? 0),
    inPlay: tally.inPlay + (change.inPlay ?? 0),
    hit: tally.hit + (change.hit ?? 0),
    homeRun: tally.homeRun + (change.homeRun ?? 0),
  };
}

/** 1 球の結果を集計に足す。 */
function tallyResult(tally: BotTally, result: PitchResult): BotTally {
  if (result.kind === "swinging-strike") {
    return addToTally(tally, { swings: 1, miss: 1 });
  }
  if (result.kind === "foul") {
    return addToTally(tally, { swings: 1, foul: 1 });
  }
  if (result.kind === "in-play") {
    return addToTally(tally, { swings: 1, inPlay: 1, hit: HITS.has(result.result) ? 1 : 0, homeRun: result.result === "homerun" ? 1 : 0 });
  }
  return addToTally(tally, { swings: 1 });
}

/** ボットのカーソル位置: 反応時間前の観測からの直線外挿 + 位置のばらつき(+ 離すときのずれ)。px をゾーン単位へ換算して足す。 */
function botCursor(spec: BotSpec, flight: PitchFlight, eventMs: number, state: SimState): ZonePoint {
  const unit = pxPerZoneUnit(spec.viewport);
  const observedMs = eventMs - spec.latencyMs - spec.reactionMs;
  const estimated = estimateLanding(flight, observedMs);
  const sigmaPx = Math.hypot(spec.posSigmaPx, spec.releaseSigmaPx);
  return clampCursor({ x: estimated.x + (gauss(state.rand) * sigmaPx) / unit.x, y: estimated.y + (gauss(state.rand) * sigmaPx) / unit.y });
}

/** ストライクの 1 球をボットが振って判定する(集計を更新)。 */
function swingAtStrike(spec: BotSpec, flight: PitchFlight, state: SimState): void {
  const eventMs = flight.durationMs + spec.cueOffsetMs + spec.latencyMs + gauss(state.rand) * spec.timingSigmaMs;
  if (isIgnoredEvent(eventMs, flight.durationMs)) {
    state.tally = addToTally(state.tally, { swings: 1, ignored: 1 });
    return;
  }
  const cursor = botCursor(spec, flight, eventMs, state);
  const swing = { kind: spec.swingKind, cursor, atMs: judgeTimeOf(eventMs, spec.input) };
  const batter = batterOf(state.tally.swings);
  const [result, next] = resolvePitch(state.rng, { flight, swing, batter, outs: 0, bases: EMPTY_BASES });
  state.rng = next;
  state.tally = tallyResult(state.tally, result);
}

/** ボット `spec` が、CPU 投手のストライクを `trials` 球振った結果。固定シードで決定論。 */
export function runBot(spec: BotSpec, trials: number, seed: number): BotTally {
  const state: SimState = { rng: createRng(seed * 7 + 1), rand: mulberry32(seed), tally: EMPTY_TALLY, seq: 0 };
  for (let guard = 0; state.tally.swings < trials && guard < trials * 20; guard += 1) {
    const flight = nextFlight(state);
    if (isStrike(flight.landing)) {
      swingAtStrike(spec, flight, state);
    }
  }
  return state.tally;
}

/** CPU 打者(ふつう)が、CPU 投手のストライクを振った球あたりの結果(同じ集計。振らなかった球は数えない)。 */
export function runCpuNormal(trials: number, seed: number): BotTally {
  const state: SimState = { rng: createRng(seed * 7 + 1), rand: mulberry32(seed), tally: EMPTY_TALLY, seq: 0 };
  for (let guard = 0; state.tally.swings < trials && guard < trials * 40; guard += 1) {
    const count = randomCount(state.rand);
    const flight = nextFlight(state);
    if (isStrike(flight.landing)) {
      const batter = batterOf(state.tally.swings);
      const [decision, afterDecision] = decideCpuBat(state.rng, { flight, count, batter, pitcher: PITCHER, difficulty: NORMAL });
      state.rng = afterDecision;
      if (decision.type === "swing") {
        const [result, next] = resolvePitch(state.rng, { flight, swing: decision.input, batter, outs: 0, bases: EMPTY_BASES });
        state.rng = next;
        state.tally = tallyResult(state.tally, result);
      }
    }
  }
  return state.tally;
}

/** 集計を割合(0〜1)にする。 */
export function rateOf(tally: BotTally, key: Exclude<keyof BotTally, "swings">): number {
  if (tally.swings === 0) {
    return 0;
  }
  switch (key) {
    case "ignored":
      return tally.ignored / tally.swings;
    case "miss":
      return tally.miss / tally.swings;
    case "foul":
      return tally.foul / tally.swings;
    case "inPlay":
      return tally.inPlay / tally.swings;
    case "hit":
      return tally.hit / tally.swings;
    case "homeRun":
      return tally.homeRun / tally.swings;
  }
}
