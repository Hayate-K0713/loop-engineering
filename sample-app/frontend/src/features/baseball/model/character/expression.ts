import type { InPlayResult, PlateOutcome } from "../../types/batting";
import type { BaseFrom, BaseTo } from "../../types/game";
import type { FaceExpression, ScenePhase } from "../../types/scene";
import { WORLD_PARAMS } from "../world/space/params";
import { CHARACTER_SLOTS } from "./look";

// 表情のタイムライン(character 分冊 §3-4-7)。役割・演出の局面・結果・時刻から顔の表情(8 種)を返す純関数・決定論。表示専用で、判定・乱数には影響しない。
// 時刻 `tMs` は `PlayPlan` と同じ時計(リリースからのゲーム ms)。`plan`/`outcome` は `PlayPlan`/`PitchOutcomeView` が構造的にそのまま満たす。
// まばたきは `neutral` の間だけ、周期 2.8 秒・120ms で自動(位相はスロット番号から決まる決定論)。

const FACE = WORLD_PARAMS.character.face;

/** 表情の切替の時間(ms)。 */
export const EXPRESSION_TIMING = {
  /** 投手がリリース(`tMs = 0`)から `effort` を保つ時間。 */
  releaseEffortMs: 350,
  /** 「驚き → 落胆」の `shock` を保つ時間(その後 `sad` または元の表情)。 */
  shockMs: 500,
} as const;

/** 表情を決める役割。野手は `fielder0..6`、走者・打者走者は `runner0..3`。 */
export type ExpressionRole = "pitcher" | "catcher" | "batter" | "fielder" | "runner";

/** 結果の事実(`PitchOutcomeView` の部分集合)。 */
export type ExpressionOutcome = {
  readonly kind: "ball" | "called-strike" | "swinging-strike" | "foul" | "in-play";
  readonly inPlay: { readonly result: InPlayResult } | null;
  readonly plate: PlateOutcome | null;
  readonly runners: {
    readonly batterTo: BaseTo;
    readonly advances: readonly { readonly from: BaseFrom; readonly to: BaseTo }[];
  } | null;
};

/** 演出の時刻表(`PlayPlan` の部分集合)。 */
export type ExpressionPlan = {
  readonly durationMs: number;
  readonly swing: { readonly startMs: number; readonly contactAtMs: number } | null;
  readonly contactMs: number | null;
  readonly fielder: { readonly index: number; readonly startMs: number; readonly arriveMs: number } | null;
  readonly telop: { readonly startMs: number };
};

export type ExpressionInput = {
  readonly role: ExpressionRole;
  readonly phase: ScenePhase;
  /** 演出の時刻表。無い(`idle` など)ときは `null`。 */
  readonly plan: ExpressionPlan | null;
  /** 解決した球の事実。無いときは `null`。 */
  readonly outcome: ExpressionOutcome | null;
  /** 時刻(ms)。 */
  readonly tMs: number;
  /** `CHARACTER_SLOTS` の添字(まばたきの位相・野手/走者の番号の判別に使う)。 */
  readonly slotIndex: number;
};

/** 結果の分類。 */
export type ResultKind = "strikeout" | "walk" | "homerun" | "hit" | "out" | "error" | "swing-miss" | "take" | "foul" | "ball" | "none";

const FIRST_FIELDER_SLOT = CHARACTER_SLOTS.indexOf("fielder0");
const FIRST_RUNNER_SLOT = CHARACTER_SLOTS.indexOf("runner0");

/** 打席の結果がなく、球だけの結果のとき。 */
function pitchOnlyKind(kind: ExpressionOutcome["kind"]): ResultKind {
  switch (kind) {
    case "swinging-strike":
      return "swing-miss";
    case "called-strike":
      return "take";
    case "foul":
      return "foul";
    case "ball":
      return "ball";
    case "in-play":
      return "none";
  }
}

/** 結果の事実を表情用の分類にする(全 `kind × inPlay.result × plate` で定義される)。 */
export function resultKindOf(outcome: ExpressionOutcome): ResultKind {
  const plate = outcome.plate ?? outcome.inPlay?.result ?? null;
  switch (plate) {
    case "strikeout":
      return "strikeout";
    case "walk":
      return "walk";
    case "homerun":
      return "homerun";
    case "single":
    case "double":
    case "triple":
      return "hit";
    case "groundout":
    case "doublePlay":
    case "flyout":
    case "lineout":
      return "out";
    case "error":
      return "error";
    case null:
      return pitchOnlyKind(outcome.kind);
  }
}

/** 正の剰余。 */
function positiveMod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

/** 時刻 `tMs` に、スロット `slotIndex` がまばたきをしているか。周期 `blinkPeriodMs`・長さ `blinkMs`。位相はスロット番号で 14 等分にずらす。 */
export function blinkingAt(tMs: number, slotIndex: number): boolean {
  if (!Number.isFinite(tMs) || !Number.isFinite(slotIndex)) {
    return false;
  }
  const stepMs = FACE.blinkPeriodMs / CHARACTER_SLOTS.length;
  const phaseMs = positiveMod(tMs + positiveMod(Math.trunc(slotIndex), CHARACTER_SLOTS.length) * stepMs, FACE.blinkPeriodMs);
  return phaseMs >= FACE.blinkPeriodMs - FACE.blinkMs;
}

/** 結果が出る時刻(投手・捕手・野手の基準)。接触あり = `contactMs`、なし = ボールがゾーンに届く `durationMs`。 */
function resultStartMs(plan: ExpressionPlan): number {
  return plan.contactMs ?? plan.durationMs;
}

/** 驚き → 落胆(または元の表情)。 */
function shockThen(after: FaceExpression, sinceMs: number): FaceExpression {
  return sinceMs < EXPRESSION_TIMING.shockMs ? "shock" : after;
}

function pitcherResult(kind: ResultKind, sinceMs: number): FaceExpression {
  switch (kind) {
    case "strikeout":
      return "cheer";
    case "out":
    case "swing-miss":
    case "take":
      return "joy";
    case "hit":
    case "walk":
      return "sad";
    case "homerun":
      return shockThen("sad", sinceMs);
    case "ball":
    case "none":
      return "focus";
    case "foul":
    case "error":
      return "neutral";
  }
}

function batterResult(kind: ResultKind, sinceMs: number): FaceExpression {
  switch (kind) {
    case "strikeout":
      return shockThen("sad", sinceMs);
    case "swing-miss":
      return shockThen("focus", sinceMs);
    case "homerun":
      return "cheer";
    case "hit":
      return "joy";
    case "walk":
    case "foul":
    case "out":
    case "error":
      return "neutral";
    case "take":
    case "ball":
    case "none":
      return "focus";
  }
}

function pitcherExpression(plan: ExpressionPlan | null, outcome: ExpressionOutcome | null, tMs: number): FaceExpression {
  if (plan === null || outcome === null || tMs < resultStartMs(plan)) {
    return tMs < EXPRESSION_TIMING.releaseEffortMs ? "effort" : "focus";
  }
  return pitcherResult(resultKindOf(outcome), tMs - resultStartMs(plan));
}

function batterExpression(plan: ExpressionPlan | null, outcome: ExpressionOutcome | null, tMs: number): FaceExpression {
  if (plan === null || outcome === null) {
    return "focus";
  }
  const startMs = plan.swing === null ? plan.durationMs : plan.swing.contactAtMs;
  if (tMs < startMs) {
    return plan.swing !== null && tMs >= plan.swing.startMs ? "effort" : "focus";
  }
  return batterResult(resultKindOf(outcome), tMs - startMs);
}

function catcherExpression(plan: ExpressionPlan | null, outcome: ExpressionOutcome | null, tMs: number): FaceExpression {
  if (plan === null || outcome === null || tMs < resultStartMs(plan)) {
    return "focus";
  }
  return resultKindOf(outcome) === "strikeout" ? "joy" : "neutral";
}

function fielderExpression(plan: ExpressionPlan | null, outcome: ExpressionOutcome | null, tMs: number, slotIndex: number): FaceExpression {
  const fielder = plan?.fielder ?? null;
  if (outcome === null || fielder === null || fielder.index !== slotIndex - FIRST_FIELDER_SLOT || tMs < fielder.startMs) {
    return "neutral";
  }
  if (tMs < fielder.arriveMs) {
    return "focus";
  }
  return resultKindOf(outcome) === "out" ? "joy" : "neutral";
}

/** 走者 `runnerIndex`(打者走者 = 0、一塁走者 = 1 …)が生還したか。 */
function runnerScored(runners: ExpressionOutcome["runners"], runnerIndex: number): boolean {
  if (runners === null) {
    return false;
  }
  return runnerIndex === 0 ? runners.batterTo === 4 : runners.advances.some((advance) => advance.from === runnerIndex && advance.to === 4);
}

function runnerExpression(plan: ExpressionPlan | null, outcome: ExpressionOutcome | null, tMs: number, slotIndex: number): FaceExpression {
  if (plan === null || outcome === null || tMs < plan.telop.startMs) {
    return "neutral";
  }
  return runnerScored(outcome.runners, slotIndex - FIRST_RUNNER_SLOT) ? "cheer" : "neutral";
}

/** 投球の飛行中・打球の演出中(`flight`/`play`)の表情。 */
function playExpression(input: ExpressionInput): FaceExpression {
  const { role, plan, outcome, tMs, slotIndex } = input;
  switch (role) {
    case "pitcher":
      return pitcherExpression(plan, outcome, tMs);
    case "batter":
      return batterExpression(plan, outcome, tMs);
    case "catcher":
      return catcherExpression(plan, outcome, tMs);
    case "fielder":
      return fielderExpression(plan, outcome, tMs, slotIndex);
    case "runner":
      return runnerExpression(plan, outcome, tMs, slotIndex);
  }
}

/** 投球の準備(`windup`)の表情。投手・打者・捕手は集中、野手・走者は普通。 */
function windupExpression(role: ExpressionRole): FaceExpression {
  return role === "fielder" || role === "runner" ? "neutral" : "focus";
}

/** 待機(`idle`)の表情。打者は構えて集中、ほかは普通。 */
function idleExpression(role: ExpressionRole): FaceExpression {
  return role === "batter" ? "focus" : "neutral";
}

function baseExpression(input: ExpressionInput): FaceExpression {
  switch (input.phase) {
    case "idle":
      return idleExpression(input.role);
    case "windup":
      return windupExpression(input.role);
    case "flight":
    case "play":
      return playExpression(input);
  }
}

/** スロット `slotIndex` の、時刻 `tMs` の表情(全 `outcome.kind × inPlay.result × plate × 役割` で定義される)。`neutral` の間は自動でまばたきする。 */
export function expressionAt(input: ExpressionInput): FaceExpression {
  const base = baseExpression(input);
  return base === "neutral" && blinkingAt(input.tMs, input.slotIndex) ? "blink" : base;
}

/** `CHARACTER_SLOTS` の添字から表情の役割を決める。範囲外は野手。 */
export function roleOfSlotIndex(slotIndex: number): ExpressionRole {
  const slot = CHARACTER_SLOTS.at(slotIndex);
  if (slot === undefined) {
    return "fielder";
  }
  if (slot === "pitcher" || slot === "catcher" || slot === "batter") {
    return slot;
  }
  return slot.startsWith("runner") ? "runner" : "fielder";
}
