import type { AssistParams, SwingInput } from "../../types/batting";
import type { ZonePoint } from "../../types/common";
import type { Count, Difficulty } from "../../types/game";
import type { PitchFlight } from "../../types/pitch";
import type { CameraPose } from "../../types/scene";
import { assistFor, lockOnCursor, previewCenterOf } from "../batting/assist";
import { INITIAL_CURSOR, clampCursor } from "../batting/cursor";
import { zoneRectOf } from "../world/camera/project";
import { battingCameraFor } from "../world/camera/rig";
import { pitchBallAt } from "../world/path/pitch-path";
import { worldToZone } from "../world/space/coords";
import { WORLD_PARAMS } from "../world/space/params";
import { isIgnoredEvent, judgeTimeOf, type Viewport } from "./bot-sim";

// 人間代理ボット v2(打撃。タップ方式)。設計 本体 §4-1。テスト専用の合成層で、`*.test.ts` と `human-game.ts` からだけ import する。
// v2 のボット(`bot-sim.ts`)の欠点「ストライクだけ振る・到達を完全に知覚する・着弾点を完全に推定する」を捨て、
// ボール球との見分け誤り・到達知覚の偏り・2D 画面からの奥行き推定誤差・指の移動時間(Fitts)・個人差・タップ方式の失敗の型を持つ。
// 乱数は mulberry32(`Math.random` は使わない)。1 人の仮想プレイヤーのパラメータは、レベルごとの分布から 1 人 1 組サンプルする。
// 本体 §4-1 の定義に対する実装上の解釈(A14 の完了報告にも記載):
//   - 予告なし(v2 設定)の着弾の見積もり: 画面の等速外挿は弾道の落ち(+y の見かけの浮き)で 1.5 ゾーン単位以上ずれて人間らしくないので、
//     「観測時刻のボールの 3D 位置・速度から直線で外挿 + 奥行きの取り違え(ゾーン中心からのずれの倍率 N(1, 0.2))」にした。
//   - `chaseBall` はボールと判断した球を振る確率の基準で、判断した球は `JUDGED_BALL_SWING_FACTOR` 倍(E7 の「ボール球を振る率」は見分け誤りの分も含む)。
//   - コンタクト率は「振ろうとした球のうち当たった割合」(到達の後の押下・長押し・移動・pointercancel は当たらなかった扱い)で、ログの定義は `swingContactRate`。
//   - 目標の見積もりを確定する時刻は、押下の時刻から「離して置き直す遅れ + Fitts の移動時間 + 余裕」を引いた時刻(その前に `reactMs` 後)。
//   - **タップのみ**(`tapOnly`): カーソルを動かさず、押す時刻だけ合わせる人。スマホで「タイミングだけで押す」のは自然な操作で、中間試遊 T1 で
//     「タイミングを合わせても打てない」と不合格になった原因(中央のままだとふつうのロックオンが弱く、ストライク球でも凡打が約 80%)を再発させないための型。
//     既定の母集団の約 50%(`TAP_ONLY_RATE`)がこの型で、全員がこの型の母集団(`CursorStyle` の `"tap-only"`)の帯もテストで守る。
//   - **投球ごとのカーソルの再センタリング**(`useBattingControls`): 指を離している投球の開始位置は中央(`INITIAL_CURSOR`)。指を置き続ける人(2 本目の指で押す人)だけ
//     前の球の位置が残る。ボットの `planPitch` は、その投球が 2 本目の指の型なら `start`(前の球の位置)から、そうでなければ中央から動かす。

/** 乱数源(0 以上 1 未満)。 */
type Rand = () => number;

/** 決定論の乱数(mulberry32)。 */
export function mulberry32(seed: number): Rand {
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
function gauss(rand: Rand): number {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += rand();
  }
  return sum - 6;
}

export type Level = "beginner" | "intermediate" | "advanced";

export const LEVELS: readonly Level[] = ["beginner", "intermediate", "advanced"];

/** 正規分布 N(mean, sd)。 */
type Dist = { readonly mean: number; readonly sd: number };

/** レベルごとの分布(本体 §4-1 の表)。固定値の項目は、1 人ごとに `INDIVIDUAL_SPREAD` の相対ばらつきを掛けてサンプルする。 */
type LevelProfile = {
  readonly reactMs: Dist;
  readonly ringBiasMs: Dist;
  readonly noRingBiasMs: Dist;
  readonly latencyMs: Dist;
  readonly timingSigmaMs: number;
  readonly fingerSigmaPx: number;
  readonly perceiveSigmaZone: number;
  readonly swingAtStrike: number;
  readonly chaseBall: number;
  readonly fittsB: number;
  readonly slowTapRate: number;
  readonly driftTapRate: number;
  readonly cancelRate: number;
  readonly ignoreRing: number;
  readonly secondFingerRate: number;
  /** カーソルを動かさずに押す人(タップのみ)の割合。 */
  readonly tapOnly: number;
};

/** 既定の母集団でカーソルを動かさない(タップのみ)人の割合。 */
const TAP_ONLY_RATE = 0.5;

const BEGINNER: LevelProfile = {
  reactMs: { mean: 280, sd: 40 },
  ringBiasMs: { mean: 40, sd: 45 },
  noRingBiasMs: { mean: 130, sd: 50 },
  latencyMs: { mean: 80, sd: 20 },
  timingSigmaMs: 85,
  fingerSigmaPx: 12,
  perceiveSigmaZone: 0.18,
  swingAtStrike: 0.8,
  chaseBall: 0.3,
  fittsB: 140,
  slowTapRate: 0.06,
  driftTapRate: 0.05,
  cancelRate: 0.02,
  ignoreRing: 0.25,
  secondFingerRate: 0.2,
  tapOnly: TAP_ONLY_RATE,
};

const INTERMEDIATE: LevelProfile = {
  reactMs: { mean: 230, sd: 30 },
  ringBiasMs: { mean: 15, sd: 35 },
  noRingBiasMs: { mean: 130, sd: 50 },
  latencyMs: { mean: 80, sd: 20 },
  timingSigmaMs: 60,
  fingerSigmaPx: 8,
  perceiveSigmaZone: 0.1,
  swingAtStrike: 0.85,
  chaseBall: 0.2,
  fittsB: 140,
  slowTapRate: 0.03,
  driftTapRate: 0.025,
  cancelRate: 0.01,
  ignoreRing: 0.15,
  secondFingerRate: 0.35,
  tapOnly: TAP_ONLY_RATE,
};

const ADVANCED: LevelProfile = {
  reactMs: { mean: 190, sd: 25 },
  ringBiasMs: { mean: 0, sd: 25 },
  noRingBiasMs: { mean: 100, sd: 40 },
  latencyMs: { mean: 70, sd: 15 },
  timingSigmaMs: 40,
  fingerSigmaPx: 5,
  perceiveSigmaZone: 0.06,
  swingAtStrike: 0.9,
  chaseBall: 0.12,
  fittsB: 110,
  slowTapRate: 0.01,
  driftTapRate: 0.01,
  cancelRate: 0.005,
  ignoreRing: 0.05,
  secondFingerRate: 0.5,
  tapOnly: TAP_ONLY_RATE,
};

function profileOf(level: Level): LevelProfile {
  switch (level) {
    case "beginner":
      return BEGINNER;
    case "intermediate":
      return INTERMEDIATE;
    case "advanced":
      return ADVANCED;
  }
}

/** Fitts の法則 `MT = a + b·log2(1 + 距離px / W)` の a(ms)と W(px)。 */
const FITTS_A_MS = 120;
const FITTS_W_PX = 40;
/** 1 本指で「合わせる → 離す → タップ」の 3 動作にするときの、離して再度置くまでの追加の遅れ N(120, 30)ms。 */
const REGRIP: Dist = { mean: 120, sd: 30 };
/** 固定値の項目の 1 人ごとの相対ばらつき(個人差)。 */
const INDIVIDUAL_SPREAD = 0.15;
/** 目標の見積もりを確定してから押下までに残す余裕(ms)。 */
const COMMIT_SLACK_MS = 50;
/** 等速の外挿に使う、ボールの位置の差分を取る間隔(ms)。 */
const VELOCITY_WINDOW_MS = 80;
/** 予告なしのとき、奥行きの取り違えによる「ゾーン中心からのずれ」の倍率の誤差 N(1, この値)(1 球ごと)。 */
const DEPTH_ERROR_SD = 0.2;
/** ゾーンの境界の余白 N(0.15, 0.2) と、2 ストライクでの広がり(ゾーン単位)。 */
const BOUNDARY_MARGIN: Dist = { mean: 0.15, sd: 0.2 };
const TWO_STRIKE_MARGIN = 0.4;
/**
 * ボールと判断した球を振る確率 = `chaseBall` × この倍率。`chaseBall`(基準の追い率)は見分け誤りで「ストライクに見えた」ボール球を振る分を含む
 * 全体の追い率の基準なので、ボールと判断した球(明らかなボール)は基準の 4 割しか追わない。
 */
const JUDGED_BALL_SWING_FACTOR = 0.4;
/** ボットのスイング種別(ミート打ちだけ)。 */
const SWING_KIND = "meet";
/** 投球ごとの再センタリングの戻し先(`INITIAL_CURSOR`。ゲーム側の定数と同じ)。 */
const CENTER_CURSOR: ZonePoint = INITIAL_CURSOR;

/** 1 人の仮想プレイヤー。 */
export type HumanPlayer = {
  readonly level: Level;
  readonly reactMs: number;
  /** 到達の知覚の偏り(リング有り)。正 = 遅く感じて遅くタップ。 */
  readonly ringBiasMs: number;
  /** 到達の知覚の偏り(リング無し = looming のみ。調査の値で固定)。 */
  readonly noRingBiasMs: number;
  readonly latencyMs: number;
  readonly timingSigmaMs: number;
  readonly fingerSigmaPx: number;
  readonly perceiveSigmaZone: number;
  readonly swingAtStrike: number;
  readonly chaseBall: number;
  readonly fittsB: number;
  readonly slowTapRate: number;
  readonly driftTapRate: number;
  readonly cancelRate: number;
  /** リングを使わず、リング無しの偏りで打つ人。 */
  readonly ignoreRing: boolean;
  readonly secondFingerRate: number;
  /** カーソルを動かさず、押す時刻だけ合わせる人(開始位置のまま押す)。 */
  readonly tapOnly: boolean;
};

/** 母集団のカーソル操作の型。`mixed` = 既定(約 50% がタップのみ)、`tap-only` = 全員タップのみ、`move` = 全員カーソルを動かす。 */
export type CursorStyle = "mixed" | "tap-only" | "move";

/** リング有りの偏りの前提。`pessimistic` = リング無しの値と表の値の中間(悲観シナリオ)。 */
export type RingBiasScenario = "model" | "pessimistic";

/** 1 人分の個人差の「素」。`z` 系は標準正規、`u` 系は 0 以上 1 未満の一様乱数。母集団は層化抽出(`stratifiedTraits`)で作り、人数が少なくても分位がぶれないようにする。 */
type Traits = {
  readonly react: number;
  readonly ringBias: number;
  readonly noRingBias: number;
  readonly latency: number;
  readonly timing: number;
  readonly finger: number;
  readonly perceive: number;
  readonly fitts: number;
  readonly swing: number;
  readonly chase: number;
  readonly second: number;
  readonly slow: number;
  readonly drift: number;
  readonly cancel: number;
  readonly ignoreRing: number;
  readonly tapOnly: number;
};

const Z_KEYS: readonly (keyof Traits)[] = ["react", "ringBias", "noRingBias", "latency", "timing", "finger", "perceive", "fitts", "swing", "chase", "second"];
/** `tapOnly` は末尾に足した(先頭の項目の乱数列を変えず、既存の母集団を保つ)。 */
const U_KEYS: readonly (keyof Traits)[] = ["slow", "drift", "cancel", "ignoreRing", "tapOnly"];

/** 標準正規分布の逆累積分布(Acklam の有理近似。相対誤差 1.2e-9 程度)。`p` は 0 より大きく 1 より小さい。 */
function inverseNormalCdf(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const poly = (coefficients: readonly number[], x: number): number => coefficients.reduce((sum, coefficient) => sum * x + coefficient, 0);
  const low = 0.02425;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return poly(c, q) / (poly(d, q) * q + 1);
  }
  if (p > 1 - low) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -poly(c, q) / (poly(d, q) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (poly(a, r) * q) / (poly(b, r) * r + 1);
}

/** 1 人分の個人差をランダムに引く(単独のテスト用)。 */
export function randomTraits(rand: Rand): Traits {
  return Object.fromEntries([...Z_KEYS.map((key) => [key, gauss(rand)]), ...U_KEYS.map((key) => [key, rand()])]) as Traits;
}

/** `count` 人分の個人差を層化抽出(項目ごとに、分位を等間隔に割って 1 つずつ引き、人の順を並べ替える。ラテン超方格)で作る。 */
export function stratifiedTraits(count: number, rand: Rand): readonly Traits[] {
  const column = (): readonly number[] => {
    const shuffled = Array.from({ length: count }, (_, slot) => ({ slot, order: rand() })).sort((a, b) => a.order - b.order);
    return shuffled.map((entry) => (entry.slot + rand()) / count);
  };
  const columns = new Map<keyof Traits, readonly number[]>([...Z_KEYS, ...U_KEYS].map((key) => [key, column()]));
  return Array.from(
    { length: count },
    (_, index) =>
      Object.fromEntries(
        [...Z_KEYS, ...U_KEYS].map((key) => {
          const value = columns.get(key)?.at(index) ?? 0.5;
          return [key, Z_KEYS.includes(key) ? inverseNormalCdf(Math.min(Math.max(value, 1e-9), 1 - 1e-9)) : value];
        }),
      ) as Traits,
  );
}

/** 正規分布 N(mean, sd) の値。 */
function drawN(z: number, dist: Dist): number {
  return dist.mean + z * dist.sd;
}

/** 固定値 `value` に相対ばらつき(個人差)を掛ける。下限は `value × 0.4`。 */
function individual(z: number, value: number): number {
  return Math.max(value * 0.4, value * (1 + INDIVIDUAL_SPREAD * z));
}

/** 確率の個人差(0.5〜1.5 倍。`u` は 0〜1 の一様)。 */
function individualRate(u: number, rate: number): number {
  return rate * (0.5 + u);
}

function clamp01Range(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** レベルの分布と個人差の素 `traits` から 1 人を作る。 */
export function sampleHumanPlayer(level: Level, traits: Traits, scenario: RingBiasScenario = "model", style: CursorStyle = "mixed"): HumanPlayer {
  const profile = profileOf(level);
  const ringMean = scenario === "pessimistic" ? (profile.ringBiasMs.mean + profile.noRingBiasMs.mean) / 2 : profile.ringBiasMs.mean;
  return {
    level,
    reactMs: Math.max(120, drawN(traits.react, profile.reactMs)),
    ringBiasMs: drawN(traits.ringBias, { mean: ringMean, sd: profile.ringBiasMs.sd }),
    noRingBiasMs: drawN(traits.noRingBias, profile.noRingBiasMs),
    latencyMs: Math.max(20, drawN(traits.latency, profile.latencyMs)),
    timingSigmaMs: individual(traits.timing, profile.timingSigmaMs),
    fingerSigmaPx: individual(traits.finger, profile.fingerSigmaPx),
    perceiveSigmaZone: individual(traits.perceive, profile.perceiveSigmaZone),
    swingAtStrike: clamp01Range(profile.swingAtStrike + 0.04 * traits.swing, 0.5, 0.98),
    chaseBall: clamp01Range(profile.chaseBall + 0.04 * traits.chase, 0.02, 0.6),
    fittsB: individual(traits.fitts, profile.fittsB),
    slowTapRate: individualRate(traits.slow, profile.slowTapRate),
    driftTapRate: individualRate(traits.drift, profile.driftTapRate),
    cancelRate: individualRate(traits.cancel, profile.cancelRate),
    ignoreRing: traits.ignoreRing < profile.ignoreRing,
    secondFingerRate: clamp01Range(profile.secondFingerRate + 0.1 * traits.second, 0, 1),
    tapOnly: style === "mixed" ? traits.tapOnly < profile.tapOnly : style === "tap-only",
  };
}

/**
 * 条件。`assist: "table"` は `ASSIST_TABLE[difficulty]`(ロックオン・予告・リングあり)、
 * `"off"` は v2 設定(`ASSIST_OFF`: ロックオン 0・予告 `none`・リングなし・偏りはリング無しの値)。
 */
export type Condition = {
  readonly name: string;
  readonly difficulty: Difficulty;
  readonly assist: "table" | "off";
  /**
   * ボットが適用するロックオン強度の倍率(省略 = 1)。**検出力の確認用**: 「ロックオンが弱い設定」(T1 で不合格になった A14 の値に近い)を作り、
   * タップのみの帯が弱いロックオンを検出できることを確かめる。結果表の質の低下(リデューサ側)は変わらない。
   */
  readonly lockScale?: number;
};

/** v2 設定(補助なし): ロックオン 0・予告 `none`・リングなし・偏りはリング無しの値。難易度は CPU 投手の強さにだけ効く(ふつう)。 */
export const V2_CONDITION: Condition = { name: "v2 設定(補助なし)", difficulty: "normal", assist: "off" };

/** ロックオンの強さだけを `scale` 倍にした条件(検出力の確認用。予告・リングは `difficulty` の表のまま)。 */
export function weakLockCondition(difficulty: Difficulty, scale: number): Condition {
  return { name: `v3 ${difficulty}(ロックオン強度 ×${scale})`, difficulty, assist: "table", lockScale: scale };
}

/** v3 の難易度別の条件(`ASSIST_TABLE` のロックオン・予告・リングあり)。 */
export function v3Condition(difficulty: Difficulty): Condition {
  return { name: `v3 ${difficulty}`, difficulty, assist: "table" };
}

// ---------- 画面(px)とゾーン単位の換算 ----------

/** 打撃カメラの投影と、ゾーン平面の画面上の中心・1 単位あたりの px。 */
type ScreenEnv = {
  readonly pose: CameraPose;
  readonly viewport: Viewport;
  readonly centerX: number;
  readonly centerY: number;
  readonly unitX: number;
  readonly unitY: number;
};

/** ボットの標準の画面(スマホ縦持ち 390×844)。 */
const PHONE_VIEWPORT: Viewport = { width: 390, height: 844 };

const ENV_CACHE = new Map<string, ScreenEnv>();

function screenEnvOf(viewport: Viewport): ScreenEnv {
  const key = `${viewport.width}x${viewport.height}`;
  const cached = ENV_CACHE.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const safeArea = { top: 155 / viewport.height, bottom: (viewport.height - 181) / viewport.height };
  const pose = battingCameraFor(viewport.width / viewport.height, "batting", safeArea);
  const rect = zoneRectOf(pose, viewport, WORLD_PARAMS.zone);
  const env: ScreenEnv = {
    pose,
    viewport,
    centerX: rect.left + rect.width / 2,
    centerY: rect.top + rect.height / 2,
    unitX: rect.width / 2,
    unitY: rect.height / 2,
  };
  ENV_CACHE.set(key, env);
  return env;
}

/** ゾーン座標の 2 点の画面上の距離(px)。 */
function distancePx(env: ScreenEnv, a: ZonePoint, b: ZonePoint): number {
  return Math.hypot((a.x - b.x) * env.unitX, (a.y - b.y) * env.unitY);
}

/**
 * 予告なし(v2 設定)の着弾の見積もり。観測時刻 `observedMs` と、その少し前のボールの位置から、等速の直線で外挿してゾーン平面との交点を着弾とする
 * (終盤の曲がり・弾道の落ちは見積もれない)。2D 画面の座標だけでは奥行きが決まらないので、視線(ゾーン中心)からのずれの大きさを
 * `offsetGain` 倍に取り違える(奥行きの推定誤差。`1` なら誤差なし)。
 */
function extrapolateLanding(flight: PitchFlight, observedMs: number, offsetGain: number): ZonePoint {
  const latest = Math.min(Math.max(observedMs, VELOCITY_WINDOW_MS), flight.durationMs * 0.9);
  const now = pitchBallAt(flight, latest);
  const before = pitchBallAt(flight, latest - VELOCITY_WINDOW_MS);
  const steps = (WORLD_PARAMS.zone.planeZ - now.z) / (now.z - before.z);
  const landing = worldToZone({ x: now.x + (now.x - before.x) * steps, y: now.y + (now.y - before.y) * steps, z: WORLD_PARAMS.zone.planeZ });
  return { x: landing.x * offsetGain, y: landing.y * offsetGain };
}

// ---------- 知覚と判断 ----------

/** ボットが使うロックオンの表(`lockScale` で強度だけ変える)。 */
function lockAssistOf(condition: Condition): AssistParams {
  const assist = assistFor(condition.difficulty);
  return condition.lockScale === undefined ? assist : { ...assist, lockStrength: assist.lockStrength * condition.lockScale };
}

function previewModeOf(condition: Condition): "exact" | "fade" | "none" {
  return condition.assist === "off" ? "none" : assistFor(condition.difficulty).preview;
}

/** 着弾点の知覚。予告があれば印の位置 + 知覚誤差、なければ 2D の外挿 + 知覚誤差。 */
function perceiveLanding(player: HumanPlayer, condition: Condition, env: ScreenEnv, flight: PitchFlight, commitMs: number, rand: Rand): ZonePoint {
  const mode = previewModeOf(condition);
  const base =
    mode === "none"
      ? extrapolateLanding(flight, commitMs, 1 + DEPTH_ERROR_SD * gauss(rand))
      : previewCenterOf(assistFor(condition.difficulty), flight.landing, flight.seq);
  return { x: base.x + gauss(rand) * player.perceiveSigmaZone, y: base.y + gauss(rand) * player.perceiveSigmaZone };
}

/** 知覚した位置から、ゾーン内と判断して振るか。2 ストライクは境界を広げる。 */
function decideToSwing(player: HumanPlayer, perceived: ZonePoint, count: Count, rand: Rand): boolean {
  const margin = BOUNDARY_MARGIN.mean + gauss(rand) * BOUNDARY_MARGIN.sd + (count.strikes === 2 ? TWO_STRIKE_MARGIN : 0);
  const judgedStrike = Math.max(Math.abs(perceived.x), Math.abs(perceived.y)) <= 1 + margin;
  return rand() < (judgedStrike ? player.swingAtStrike : player.chaseBall * JUDGED_BALL_SWING_FACTOR);
}

// ---------- 1 球の計画 ----------

/** 押したのにスイングにならなかった理由。`late` = 到達の後の押下(見逃し扱い)、`slow` = 300ms 超の長押し、`drift` = 10px 超の移動。 */
type NoSwingReason = "late" | "slow" | "drift" | "cancel";

/** 1 球のボットの行動。 */
type PitchPlan = {
  /** 振ろうとしたか(見送りなら偽)。 */
  readonly intent: boolean;
  /** 実際にスイングとして届いた入力。届かなかった(見送り・失敗)ときは `null`。 */
  readonly swing: SwingInput | null;
  readonly noSwing: NoSwingReason | null;
  /** 次の球の開始位置(素のカーソルが最後にあった位置)。 */
  readonly cursorAfter: ZonePoint;
  /** 押下の時刻 − 到達時刻 D(ms)。見送りは `null`。 */
  readonly pressOffsetMs: number | null;
  /** 素のカーソルと着弾点の距離(px)。見送りは `null`。 */
  readonly rawDistancePx: number | null;
};

type PlanInput = {
  readonly player: HumanPlayer;
  readonly condition: Condition;
  readonly flight: PitchFlight;
  readonly count: Count;
  /** 前の球で素のカーソルが最後にあった位置。指を置き続ける人(2 本目の指で押す人)だけ、この位置から始まる。ほかは投球ごとに中央へ戻る。 */
  readonly start: ZonePoint;
  readonly viewport?: Viewport;
};

/** Fitts の移動時間(ms)。 */
function fittsMs(player: HumanPlayer, pixels: number): number {
  return FITTS_A_MS + player.fittsB * Math.log2(1 + pixels / FITTS_W_PX);
}

/** 押下の時刻(リリースから ms)。`D + 偏り + 遅延 + N(0, timingSigmaMs)`。偏りはリングの有無・`ignoreRing` で変わる。 */
function pressTimeOf(player: HumanPlayer, condition: Condition, durationMs: number, rand: Rand): number {
  const useRing = condition.assist === "table" && !player.ignoreRing;
  const bias = useRing ? player.ringBiasMs : player.noRingBiasMs;
  return durationMs + bias + player.latencyMs + gauss(rand) * player.timingSigmaMs;
}

/** 開始位置から目標へ `availableMs` のあいだ動かした位置 + 指のぶれ。間に合わなければ途中の位置。 */
function reachCursor(player: HumanPlayer, env: ScreenEnv, start: ZonePoint, target: ZonePoint, availableMs: number, rand: Rand): ZonePoint {
  const needed = fittsMs(player, distancePx(env, start, target));
  const fraction = Math.min(1, Math.max(0, availableMs / needed));
  return clampCursor({
    x: start.x * (1 - fraction) + target.x * fraction + (gauss(rand) * player.fingerSigmaPx) / env.unitX,
    y: start.y * (1 - fraction) + target.y * fraction + (gauss(rand) * player.fingerSigmaPx) / env.unitY,
  });
}

function takePlan(start: ZonePoint): PitchPlan {
  return { intent: false, swing: null, noSwing: null, cursorAfter: start, pressOffsetMs: null, rawDistancePx: null };
}

/** 押下が届かない理由(タップ方式の失敗の型)。届くなら `null`。乱数は常に 3 個消費する。 */
function failureOf(player: HumanPlayer, secondFinger: boolean, pressMs: number, durationMs: number, rand: Rand): NoSwingReason | null {
  const slow = rand() < player.slowTapRate;
  const drift = rand() < player.driftTapRate;
  const cancel = rand() < player.cancelRate;
  if (isIgnoredEvent(pressMs, durationMs)) {
    return "late";
  }
  if (cancel) {
    return "cancel";
  }
  if (secondFinger) {
    return null;
  }
  if (slow) {
    return "slow";
  }
  return drift ? "drift" : null;
}

/**
 * 1 球のボットの行動を決める。押下の時刻を決め → 目標の見積もりを確定する時刻(押下の前に、合わせる動作と余裕を残す)で着弾を知覚し →
 * 振るか見送るかを判断 → 振るなら開始位置から Fitts の時間で動かし(間に合わなければ途中。タップのみの人は動かさない)、押下時刻の進行度でロックオンを適用して判定入力を作る。
 * 開始位置は、その投球が 2 本目の指の型なら `start`(指を置き続けているので前の球の位置)、そうでなければ中央(指を離しているので再センタリング済み)。
 */
export function planPitch(input: PlanInput, rand: Rand): PitchPlan {
  const { player, condition, flight, count, start } = input;
  const env = screenEnvOf(input.viewport ?? PHONE_VIEWPORT);
  const durationMs = flight.durationMs;
  const pressMs = pressTimeOf(player, condition, durationMs, rand);
  const secondFinger = rand() < player.secondFingerRate;
  const regripMs = secondFinger ? 0 : Math.max(0, REGRIP.mean + gauss(rand) * REGRIP.sd);
  const origin = secondFinger ? start : CENTER_CURSOR;
  const planMs = fittsMs(player, distancePx(env, origin, flight.landing));
  const commitMs = Math.max(player.reactMs, pressMs - regripMs - planMs - COMMIT_SLACK_MS);
  const perceived = perceiveLanding(player, condition, env, flight, commitMs, rand);
  if (!decideToSwing(player, perceived, count, rand)) {
    return takePlan(origin);
  }
  const raw = player.tapOnly ? origin : reachCursor(player, env, origin, perceived, pressMs - regripMs - commitMs, rand);
  const base = { intent: true, cursorAfter: raw, pressOffsetMs: pressMs - durationMs, rawDistancePx: distancePx(env, raw, flight.landing) };
  const failure = failureOf(player, secondFinger, pressMs, durationMs, rand);
  if (failure !== null) {
    return { ...base, swing: null, noSwing: failure };
  }
  const locked = condition.assist === "off" ? { cursor: raw, k: 0 } : lockOnCursor(lockAssistOf(condition), raw, flight.landing, pressMs / durationMs);
  const swing: SwingInput = { kind: SWING_KIND, cursor: locked.cursor, atMs: judgeTimeOf(pressMs, "touch"), assistK: locked.k };
  return { ...base, swing, noSwing: null };
}

/** 予告なしの着弾の見積もり(知覚誤差なし。奥行きの取り違えは `offsetGain` で指定)。診断・テスト用。 */
export function estimateLandingFromFlight(flight: PitchFlight, observedMs: number, offsetGain: number): ZonePoint {
  return extrapolateLanding(flight, observedMs, offsetGain);
}
