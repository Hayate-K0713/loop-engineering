import type { BattedLanding, SwingInput } from "../../../types/batting";
import type { PitchFlight } from "../../../types/pitch";
import type { Vec3 } from "../../../types/scene";
import type { PitchOutcomeView } from "../../../types/view";
import { computeBattedLanding } from "../../batting/batted-landing";
import { swingWindowMs } from "../../batting/contact";
import { type BattedPlan, planBattedBall, planFoul } from "../path/batted-path";
import { FIELDER_SLOTS, pickFielder } from "../path/fielders";
import { zoneToWorld } from "../space/coords";
import { WORLD_PARAMS } from "../space/params";
import { telopFor, type TelopWindow } from "./telop";
import { type PlayTiming, timingCueOf } from "./timing-cue";

// 1球の演出の時刻表。解決した球(`PitchOutcomeView`)・投球(`PitchFlight`)・人間のスイング入力から、純関数・決定論で作る。
// 時計は `usePitchFlight.getElapsedMs()`(リリースからのゲーム ms)の1本。規約は設計書「時間軸・ゲートの規約」4・5(修正設計 §1 で変更あり)。
// 人間のスイングは、判定とタイミング表示に判定時刻 `atMs`(過去になりうる)、演出(バット・接触・ボールの待機)に `base = max(atMs, resolvedAtMs)` を使う。

const SWING = WORLD_PARAMS.swing;
const TELOP = WORLD_PARAMS.telop;
const FIELDER_RUN = WORLD_PARAMS.fielderRun;
const CATCH = WORLD_PARAMS.catch;
const CUE = WORLD_PARAMS.cue;

/** バットの振り。`startMs` から構え→接触姿勢、`contactAtMs` が接触姿勢、`height` が接触位置の高さ(m)。 */
export type PlaySwing = {
  readonly startMs: number;
  readonly contactAtMs: number;
  readonly height: number;
};

/** 打球を追う野手。`from` から `to` へ `startMs`〜`arriveMs` で走る。`index` は `FIELDER_SLOTS` の添字。 */
export type PlayFielder = {
  readonly index: number;
  readonly from: Vec3;
  readonly to: Vec3;
  readonly startMs: number;
  readonly arriveMs: number;
};

export type PlayPlan = {
  /** 解決した球の通し番号(= `outcome.seq`)。 */
  readonly seq: number;
  readonly kind: PitchOutcomeView["kind"];
  /** ボールがゾーンに届く時刻(= `flight.durationMs`)。 */
  readonly durationMs: number;
  readonly resolvedAtMs: number;
  /** 振らない(見逃し・ボール)ときは `null`。 */
  readonly swing: PlaySwing | null;
  /** ファウル・インプレーのバットとボールの接触時刻。それ以外は `null`。 */
  readonly contactMs: number | null;
  readonly batted: BattedPlan | null;
  /**
   * ボールが着弾点(ゾーン平面)に留まる最後の時刻。接触なし(空振り・見逃し・CPU)は `max(durationMs + holdMs, resolvedAtMs)` で、
   * この時刻より後は非表示。接触あり(ファウル・インプレー)は `contactMs`(その時刻に打球へ切り替わる)。
   */
  readonly ballHoldUntilMs: number;
  /** フェアで、ホームランでないインプレーのみ。 */
  readonly fielder: PlayFielder | null;
  /** 中継カメラへ移り始める時刻。打球がないときは `null`。 */
  readonly chaseFromMs: number | null;
  readonly telop: TelopWindow;
  /** 人間のスイングの早い/ジャスト/遅いの表示(判定時刻 `atMs` で計算)。見逃し・CPU 打者は `null`。 */
  readonly timing: PlayTiming | null;
  /** 演出の終了時刻(= テロップの終わり + 余韻)。`holding` はここで解除される。 */
  readonly endMs: number;
};

type PlanInput = {
  readonly flight: PitchFlight;
  readonly outcome: PitchOutcomeView;
  /** 人間のスイング入力。CPU 打者・見逃しでは `null`。 */
  readonly swing: SwingInput | null;
  /**
   * 球が解決した時刻 = 受付時刻(入力を処理して plan を作る時刻)。人間のスイングは `swing.atMs` 以降(遅延補正で `atMs` は過去になりうる)、
   * 人間の見逃しは `durationMs + lateCutoffMs`、CPU 打者は前倒しされた `PITCH_ARRIVED` の時刻(`durationMs − CPU_SWING_LEAD_MS` 付近)。
   */
  readonly resolvedAtMs: number;
};

/** 種別ごとに決まる時刻表の部分。テロップは開始時刻と長さだけ持ち、`planPlay` が文言と終了時刻を組み立てる。 */
type Segment = Pick<PlayPlan, "swing" | "contactMs" | "batted" | "ballHoldUntilMs" | "fielder" | "chaseFromMs"> & {
  readonly telopStartMs: number;
  readonly telopLengthMs: number;
};

/** 時刻 `tMs` のスイングの進行(0〜1.4)。`startMs` 以前は 0、`contactAtMs` で接触姿勢(`contactRatio` = 0.66)、以降は通常の速さで 1.0 → 1.4。 */
export function swingProgressAt(swing: Pick<PlaySwing, "startMs" | "contactAtMs">, tMs: number): number {
  if (tMs <= swing.startMs) {
    return 0;
  }
  if (tMs < swing.contactAtMs) {
    return (SWING.contactRatio * (tMs - swing.startMs)) / (swing.contactAtMs - swing.startMs);
  }
  return Math.min(SWING.contactRatio + (tMs - swing.contactAtMs) / SWING.durationMs, SWING.followEndProgress);
}

/** ボールの高さ(ゾーン平面上の着弾点)。 */
function landingHeightOf(flight: PitchFlight): number {
  return zoneToWorld(flight.landing).y;
}

/** 演出の基準時刻 `base`。人間のスイングは `max(atMs, resolvedAtMs)`(バットは受付時刻より前の時刻から振り始めない)、CPU・見逃しは `resolvedAtMs`。 */
function baseMsOf(input: PlanInput): number {
  return input.swing === null ? input.resolvedAtMs : Math.max(input.swing.atMs, input.resolvedAtMs);
}

/** 接触なし(空振り・見逃し・CPU)の plan で、ボールが着弾点に留まる最後の時刻 = `max(durationMs + holdMs, resolvedAtMs)`。 */
function ballHoldUntilOf(input: PlanInput): number {
  return Math.max(input.flight.durationMs + CATCH.holdMs, input.resolvedAtMs);
}

/** 見逃し・ボール。振らず、ボールが通過(または判定)してからテロップを出す。 */
function takeSegment(input: PlanInput): Segment {
  return {
    swing: null,
    contactMs: null,
    batted: null,
    ballHoldUntilMs: ballHoldUntilOf(input),
    fielder: null,
    chaseFromMs: null,
    telopStartMs: Math.max(input.flight.durationMs, input.resolvedAtMs),
    telopLengthMs: TELOP.takeMs,
  };
}

/**
 * 空振りのスイング。人間は `base`(= `max(atMs, resolvedAtMs)`)から圧縮なしで振る(D+150〜D+250 の振り遅れも同じ)。
 * CPU は入力が無いので、`contactAtMs = durationMs ± missOffsetMs`(`seq` が偶数なら早い方、奇数なら遅い方)にずらし、
 * `resolvedAtMs` より前から振り始めない(接触姿勢まで `minSwingMs` 以上を保つ)。
 */
function missSwingOf(input: PlanInput): PlaySwing {
  const { flight, swing, resolvedAtMs, outcome } = input;
  if (swing !== null) {
    const baseMs = baseMsOf(input);
    return { startMs: baseMs, contactAtMs: baseMs + SWING.contactMs, height: zoneToWorld(swing.cursor).y };
  }
  const offsetMs = outcome.seq % 2 === 0 ? 0 - SWING.missOffsetMs : SWING.missOffsetMs;
  const contactAtMs = Math.max(flight.durationMs + offsetMs, resolvedAtMs + SWING.minSwingMs);
  return { startMs: Math.max(contactAtMs - SWING.contactMs, resolvedAtMs), contactAtMs, height: landingHeightOf(flight) };
}

function missSegment(input: PlanInput): Segment {
  const swing = missSwingOf(input);
  return {
    swing,
    contactMs: null,
    batted: null,
    ballHoldUntilMs: ballHoldUntilOf(input),
    fielder: null,
    chaseFromMs: null,
    telopStartMs: Math.max(input.flight.durationMs, swing.contactAtMs),
    telopLengthMs: TELOP.swingMissMs,
  };
}

/** 接触点(ゾーン平面上の着弾点の高さ・横位置で、z は本塁の少し前)。 */
function contactPointOf(flight: PitchFlight): Vec3 {
  const landing = zoneToWorld(flight.landing);
  return { x: landing.x, y: landing.y, z: WORLD_PARAMS.batted.contactZ };
}

/** インプレーは落下点の計画、ファウルは `seq` からの決定論の計画(`inPlay` が無い `in-play` は想定外だがファウル相当で進行を止めない)。 */
function battedPlanOf(outcome: PitchOutcomeView, start: Vec3): BattedPlan {
  return outcome.kind === "in-play" && outcome.inPlay !== null
    ? planBattedBall(outcome.inPlay.ball, outcome.inPlay.result, outcome.seq, start)
    : planFoul(outcome.seq, start);
}

/** 最寄りの野手が、落下点の手前(落下点 × `stopRatio`)まで滞空 × `runFactor` かけて走る。ホームランは走らない。 */
function fielderOf(batted: BattedPlan, contactMs: number): PlayFielder | null {
  if (batted.overFence) {
    return null;
  }
  const index = pickFielder(batted.end);
  const from = FIELDER_SLOTS.at(index)?.position;
  if (from === undefined) {
    return null;
  }
  const to: Vec3 = { x: batted.end.x * FIELDER_RUN.stopRatio, y: 0, z: batted.end.z * FIELDER_RUN.stopRatio };
  return { index, from, to, startMs: contactMs, arriveMs: contactMs + batted.hangMs * FIELDER_RUN.runFactor };
}

/**
 * ファウル・インプレー。`contactMs = max(durationMs, base + minSwingMs)`(`base` は人間なら `max(swing.atMs, resolvedAtMs)`、CPU なら `resolvedAtMs`)。
 * バットは `max(contactMs − 132, base)` から振り始め、接触姿勢まで 60〜132ms(早く振り始められないときは圧縮)。
 * ボールは接触の瞬間まで着弾点で待つ(`ballHoldUntilMs = contactMs`)。テロップは打球の落下時(`contactMs + hangMs`)から。
 */
function contactSegment(input: PlanInput): Segment {
  const { flight, outcome } = input;
  const baseMs = baseMsOf(input);
  const contactMs = Math.max(flight.durationMs, baseMs + SWING.minSwingMs);
  const batted = battedPlanOf(outcome, contactPointOf(flight));
  return {
    swing: { startMs: Math.max(contactMs - SWING.contactMs, baseMs), contactAtMs: contactMs, height: landingHeightOf(flight) },
    contactMs,
    batted,
    ballHoldUntilMs: contactMs,
    fielder: outcome.kind === "in-play" ? fielderOf(batted, contactMs) : null,
    chaseFromMs: contactMs,
    telopStartMs: contactMs + batted.hangMs,
    telopLengthMs: outcome.kind === "in-play" ? TELOP.inPlayMs : TELOP.foulMs,
  };
}

function segmentOf(input: PlanInput): Segment {
  switch (input.outcome.kind) {
    case "ball":
    case "called-strike":
      return takeSegment(input);
    case "swinging-strike":
      return missSegment(input);
    case "foul":
    case "in-play":
      return contactSegment(input);
  }
}

/** インプレーの落下点(テロップの方向・内野安打の判定用)。インプレー以外は `null`。 */
function landingOf(outcome: PitchOutcomeView): BattedLanding | null {
  return outcome.inPlay === null ? null : computeBattedLanding(outcome.inPlay.ball, outcome.inPlay.result, outcome.seq);
}

/**
 * 人間のスイングのタイミング表示。`dtMs` = 判定時刻 `atMs` − 到達時刻 D(負 = 早い)、窓はスイング種別の判定窓。
 * 受付時刻以降(`startMs = base`)に `timingMs` 間だけ出す。スイング入力が無い(見逃し・CPU)ときは `null`。
 */
function timingOf(input: PlanInput): PlayTiming | null {
  const { flight, swing } = input;
  if (swing === null) {
    return null;
  }
  const startMs = baseMsOf(input);
  return { ...timingCueOf(swing.atMs - flight.durationMs, swingWindowMs(swing.kind)), startMs, endMs: startMs + CUE.timingMs };
}

/**
 * 1球の演出の時刻表を作る(純関数・決定論)。どの種別でも `telop.startMs ≥ durationMs`(ボールが通過してからテロップを出す)。
 * `endMs = telop.endMs + afterglowMs`。
 */
export function planPlay(input: PlanInput): PlayPlan {
  const { flight, outcome, resolvedAtMs } = input;
  const { telopStartMs, telopLengthMs, ...motion } = segmentOf(input);
  const telopEndMs = telopStartMs + telopLengthMs;
  return {
    seq: outcome.seq,
    kind: outcome.kind,
    durationMs: flight.durationMs,
    resolvedAtMs,
    ...motion,
    telop: { text: telopFor(outcome, landingOf(outcome)), startMs: telopStartMs, endMs: telopEndMs },
    timing: timingOf(input),
    endMs: telopEndMs + TELOP.afterglowMs,
  };
}
