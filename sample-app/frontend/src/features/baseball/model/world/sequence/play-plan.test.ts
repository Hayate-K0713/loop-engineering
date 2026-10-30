import { describe, expect, it } from "vitest";
import type { BattedBall, BattedType, Direction, InPlayResult, Strength, SwingInput } from "../../../types/batting";
import type { ZonePoint } from "../../../types/common";
import type { PitchFlight } from "../../../types/pitch";
import type { PitchOutcomeView } from "../../../types/view";
import { computeBattedLanding } from "../../batting/batted-landing";
import { swingWindowMs } from "../../batting/contact";
import { BATTING_PARAMS, LANDING_BANDS } from "../../batting/params";
import { resultEntries } from "../../batting/result-table";
import { FIELDER_SLOTS, pickFielder } from "../path/fielders";
import { landingToWorld, zoneToWorld } from "../space/coords";
import { CPU_SWING_LEAD_MS, WORLD_PARAMS } from "../space/params";
import { type PlayPlan, planPlay, swingProgressAt } from "./play-plan";
import { telopFor } from "./telop";
import { timingCueOf } from "./timing-cue";

const SWING = WORLD_PARAMS.swing;
const TELOP = WORLD_PARAMS.telop;
const FIELDER_RUN = WORLD_PARAMS.fielderRun;
const HOLD_MS = WORLD_PARAMS.catch.holdMs;
const TIMING_MS = WORLD_PARAMS.cue.timingMs;
const TYPES: readonly BattedType[] = ["ground", "liner", "fly"];
const STRENGTHS: readonly Strength[] = ["weak", "medium", "strong"];
const DIRECTIONS: readonly Direction[] = ["pull", "center", "opposite"];

function flightOf(seq: number, durationMs: number, landing: ZonePoint): PitchFlight {
  return { seq, kind: "straight", aim: landing, landing, speedKmh: 140, durationMs, quality: "normal" };
}

const FIRST_FLIGHT = flightOf(1, 420, { x: 0, y: 0 });

// seq の偶奇の両方、飛行時間・着弾点の違うもの。
const FLIGHTS: readonly PitchFlight[] = [
  FIRST_FLIGHT,
  flightOf(2, 480, { x: 0.9, y: -0.8 }),
  flightOf(3, 540, { x: -0.5, y: 0.6 }),
  flightOf(4, 600, { x: 0, y: 0 }),
];

/** 人間のクリックの判定時刻 `atMs` の `durationMs` からのずれ(−300 〜 +240ms、15ms 刻み)。窓外の振り遅れ(D+150〜)を含む。 */
const HUMAN_OFFSETS: readonly number[] = Array.from({ length: 37 }, (_, i) => -300 + i * 15);
const CURSOR: ZonePoint = { x: 0.2, y: -0.3 };

type Scenario = {
  readonly label: string;
  readonly flight: PitchFlight;
  readonly outcome: PitchOutcomeView;
  readonly swing: SwingInput | null;
  readonly resolvedAtMs: number;
  /** 接触・スイングの起点(人間は `max(atMs, resolvedAtMs)`、CPU・見逃しは `resolvedAtMs`)。 */
  readonly baseMs: number;
  readonly plan: PlayPlan;
};

function outcomeOf(kind: PitchOutcomeView["kind"], seq: number, inPlay: PitchOutcomeView["inPlay"] = null): PitchOutcomeView {
  return { seq, kind, inPlay, plate: null };
}

function scenarioOf(flight: PitchFlight, outcome: PitchOutcomeView, swing: SwingInput | null, resolvedAtMs: number, tag: string): Scenario {
  const plan = planPlay({ flight, outcome, swing, resolvedAtMs });
  const detail =
    outcome.inPlay === null ? "" : `/${outcome.inPlay.result}/${outcome.inPlay.ball.type}-${outcome.inPlay.ball.strength}-${outcome.inPlay.ball.direction}`;
  const baseMs = swing === null ? resolvedAtMs : Math.max(swing.atMs, resolvedAtMs);
  return { label: `${outcome.kind}${detail}/${tag}/seq${flight.seq}`, flight, outcome, swing, resolvedAtMs, baseMs, plan };
}

/** CPU 打者(入力なし。`PITCH_ARRIVED` は `durationMs − CPU_SWING_LEAD_MS` に前倒し)と、人間の全クリック時刻の組(受付時刻 = `atMs`)。 */
function swingScenarios(flight: PitchFlight, outcome: PitchOutcomeView): readonly Scenario[] {
  const cpu = scenarioOf(flight, outcome, null, flight.durationMs - CPU_SWING_LEAD_MS, "cpu");
  const humans = HUMAN_OFFSETS.map((offset): Scenario => {
    const swing: SwingInput = { kind: "meet", cursor: CURSOR, atMs: flight.durationMs + offset };
    return scenarioOf(flight, outcome, swing, swing.atMs, `human${offset}`);
  });
  return [cpu, ...humans];
}

/** 見逃し・ボール: CPU(前倒し)と、人間の振らない判定(`durationMs + lateCutoffMs`)。 */
function takeScenarios(flight: PitchFlight, kind: "ball" | "called-strike"): readonly Scenario[] {
  const outcome = outcomeOf(kind, flight.seq);
  return [
    scenarioOf(flight, outcome, null, flight.durationMs - CPU_SWING_LEAD_MS, "cpu"),
    scenarioOf(flight, outcome, null, flight.durationMs + BATTING_PARAMS.lateCutoffMs, "human-take"),
  ];
}

const ALL_BALLS: readonly BattedBall[] = TYPES.flatMap((type) =>
  STRENGTHS.flatMap((strength) => DIRECTIONS.map((direction): BattedBall => ({ type, strength, direction }))),
);

/** その打球で重みが正の(= 到達する)結果。 */
function reachableResults(ball: BattedBall): readonly InPlayResult[] {
  return resultEntries(ball, true)
    .filter((entry) => entry.weight > 0)
    .map((entry) => entry.value);
}

const TAKES: readonly Scenario[] = FLIGHTS.flatMap((flight) => [...takeScenarios(flight, "ball"), ...takeScenarios(flight, "called-strike")]);
const MISSES: readonly Scenario[] = FLIGHTS.flatMap((flight) => swingScenarios(flight, outcomeOf("swinging-strike", flight.seq)));
const FOULS: readonly Scenario[] = FLIGHTS.flatMap((flight) => swingScenarios(flight, outcomeOf("foul", flight.seq)));
const IN_PLAYS: readonly Scenario[] = ALL_BALLS.flatMap((ball) =>
  reachableResults(ball).flatMap((result) => FLIGHTS.flatMap((flight) => swingScenarios(flight, outcomeOf("in-play", flight.seq, { result, ball })))),
);
const CONTACTS: readonly Scenario[] = [...FOULS, ...IN_PLAYS];
const EVERYTHING: readonly Scenario[] = [...TAKES, ...MISSES, ...CONTACTS];

const isCpu = (scenario: Scenario): boolean => scenario.swing === null;
const isHuman = (scenario: Scenario): boolean => scenario.swing !== null;

/** 条件を満たさないシナリオの先頭3件(失敗メッセージ用)。 */
function failures<T extends { readonly label: string }>(scenarios: readonly T[], predicate: (scenario: T) => boolean): readonly string[] {
  return scenarios
    .filter((scenario) => !predicate(scenario))
    .slice(0, 3)
    .map((scenario) => scenario.label);
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

/** 接触を伴う plan の、非 null の接触時刻・スイング・打球(型の絞り込み用)。 */
function contactOf(plan: PlayPlan): { readonly contactMs: number; readonly startMs: number; readonly hangMs: number } {
  return { contactMs: plan.contactMs ?? Number.NaN, startMs: plan.swing?.startMs ?? Number.NaN, hangMs: plan.batted?.hangMs ?? Number.NaN };
}

describe("シナリオの網羅", () => {
  it("見逃し・ボール、空振り、ファウル、インプレー(RESULT_TABLE で重みが正の結果 × 打球 × 飛行 × スイング)を列挙している", () => {
    expect(TAKES).toHaveLength(FLIGHTS.length * 2 * 2);
    expect(MISSES).toHaveLength(FLIGHTS.length * (HUMAN_OFFSETS.length + 1));
    expect(FOULS).toHaveLength(MISSES.length);
    expect(IN_PLAYS.length).toBeGreaterThan(10000);
    expect(IN_PLAYS.some((scenario) => scenario.outcome.inPlay?.result === "homerun")).toBe(true);
    expect(IN_PLAYS.some((scenario) => scenario.outcome.inPlay?.ball.type === "ground" && scenario.outcome.inPlay.result === "homerun")).toBe(false);
  });
});

describe("planPlay: 時刻表の単調性(全種別)", () => {
  it("入力を写す: seq・kind・durationMs・resolvedAtMs", () => {
    const echoed = (s: Scenario): boolean =>
      s.plan.seq === s.outcome.seq && s.plan.kind === s.outcome.kind && s.plan.durationMs === s.flight.durationMs && s.plan.resolvedAtMs === s.resolvedAtMs;
    expect(failures(EVERYTHING, echoed)).toEqual([]);
  });

  it("telop.startMs ≥ durationMs(早い空振り・CPU の空振りでもボールが通過してから出す)", () => {
    expect(failures(EVERYTHING, (s) => s.plan.telop.startMs >= s.flight.durationMs)).toEqual([]);
  });

  it("telop.startMs < telop.endMs、endMs = telop.endMs + 余韻", () => {
    expect(failures(EVERYTHING, (s) => s.plan.telop.startMs < s.plan.telop.endMs)).toEqual([]);
    expect(failures(EVERYTHING, (s) => near(s.plan.endMs, s.plan.telop.endMs + TELOP.afterglowMs))).toEqual([]);
  });

  it("endMs は有限で、最長の滞空(ホームラン級)+ テロップ + 余韻から計算した上限以下", () => {
    // 受付時刻は最大 D + 330、接触は受付 + minSwingMs。滞空は距離の最大(落下点の距離帯の上限)の飛球、テロップはインプレー。
    const farthest = Math.max(...LANDING_BANDS.map((band) => band.max));
    const longestHangMs = WORLD_PARAMS.batted.fly.hangBaseMs + WORLD_PARAMS.batted.fly.hangPerMeterMs * farthest;
    const limitAfterD = 330 + SWING.minSwingMs + longestHangMs + TELOP.inPlayMs + TELOP.afterglowMs;
    expect(failures(EVERYTHING, (s) => Number.isFinite(s.plan.endMs) && s.plan.endMs <= s.flight.durationMs + limitAfterD)).toEqual([]);
    // 最長級の滞空(ホームラン)の演出が実際に D + 滞空 を超えて続くこと(上限の式が的外れでないこと)
    expect(EVERYTHING.some((s) => s.plan.endMs >= s.flight.durationMs + longestHangMs)).toBe(true);
  });

  it("テロップの文言は telopFor(outcome, 落下点) に一致する", () => {
    const sameText = (s: Scenario): boolean => {
      const inPlay = s.outcome.inPlay;
      const landing = inPlay === null ? null : computeBattedLanding(inPlay.ball, inPlay.result, s.outcome.seq);
      return s.plan.telop.text === telopFor(s.outcome, landing);
    };
    expect(failures(EVERYTHING, sameText)).toEqual([]);
  });

  it("同一入力は deep equal(決定論)", () => {
    const same = (s: Scenario): boolean => {
      const again = planPlay({ flight: s.flight, outcome: s.outcome, swing: s.swing, resolvedAtMs: s.resolvedAtMs });
      return JSON.stringify(again) === JSON.stringify(s.plan);
    };
    expect(failures(EVERYTHING, same)).toEqual([]);
  });
});

describe("planPlay: 見逃し・ボール", () => {
  it("振らない: swing・contactMs・batted・fielder・chaseFromMs がすべて null", () => {
    const noMotion = (s: Scenario): boolean =>
      s.plan.swing === null && s.plan.contactMs === null && s.plan.batted === null && s.plan.fielder === null && s.plan.chaseFromMs === null;
    expect(failures(TAKES, noMotion)).toEqual([]);
  });

  it("テロップは max(durationMs, resolvedAtMs) から takeMs 間", () => {
    const timed = (s: Scenario): boolean =>
      near(s.plan.telop.startMs, Math.max(s.flight.durationMs, s.resolvedAtMs)) && near(s.plan.telop.endMs - s.plan.telop.startMs, TELOP.takeMs);
    expect(failures(TAKES, timed)).toEqual([]);
  });

  it("CPU の見逃し(前倒し)は durationMs から、人間の見逃しは見逃し確定(D + lateCutoffMs)の後から出る", () => {
    const outcome = outcomeOf("called-strike", FIRST_FLIGHT.seq);
    const cpu = planPlay({ flight: FIRST_FLIGHT, outcome, swing: null, resolvedAtMs: FIRST_FLIGHT.durationMs - CPU_SWING_LEAD_MS });
    const human = planPlay({ flight: FIRST_FLIGHT, outcome, swing: null, resolvedAtMs: FIRST_FLIGHT.durationMs + BATTING_PARAMS.lateCutoffMs });
    expect(cpu.telop.startMs).toBe(FIRST_FLIGHT.durationMs);
    expect(human.telop.startMs).toBe(FIRST_FLIGHT.durationMs + BATTING_PARAMS.lateCutoffMs);
  });

  it("ボールの待機: 人間の見逃しは D + lateCutoffMs まで、CPU の見逃しは D + holdMs まで着弾点に残る(max(D + holdMs, resolvedAtMs))", () => {
    const hold = (s: Scenario): boolean => near(s.plan.ballHoldUntilMs, Math.max(s.flight.durationMs + HOLD_MS, s.resolvedAtMs));
    expect(failures(TAKES, hold)).toEqual([]);
    const cpuTakes = TAKES.filter((s) => s.resolvedAtMs < s.flight.durationMs);
    expect(cpuTakes.length).toBeGreaterThan(0);
    expect(failures(cpuTakes, (s) => near(s.plan.ballHoldUntilMs, s.flight.durationMs + HOLD_MS))).toEqual([]);
    const humanTakes = TAKES.filter((s) => s.resolvedAtMs > s.flight.durationMs);
    expect(humanTakes.length).toBeGreaterThan(0);
    expect(failures(humanTakes, (s) => near(s.plan.ballHoldUntilMs, s.flight.durationMs + BATTING_PARAMS.lateCutoffMs))).toEqual([]);
  });

  it("見逃し・CPU・入力なしでは timing が null", () => {
    expect(failures(TAKES, (s) => s.plan.timing === null)).toEqual([]);
    expect(failures(EVERYTHING.filter(isCpu), (s) => s.plan.timing === null)).toEqual([]);
  });
});

describe("planPlay: 空振り", () => {
  const humans = MISSES.filter(isHuman);
  const cpus = MISSES.filter(isCpu);

  it("打球・接触・野手・カメラ移動が無い", () => {
    const noBall = (s: Scenario): boolean => s.plan.contactMs === null && s.plan.batted === null && s.plan.fielder === null && s.plan.chaseFromMs === null;
    expect(failures(MISSES, noBall)).toEqual([]);
  });

  it("人間: startMs = base(= max(atMs, resolvedAtMs))、contactAtMs = base + 132(圧縮なし)、高さはカーソルの高さ。窓外の振り遅れ(D+150〜)も同じ", () => {
    expect(humans.some((s) => (s.swing?.atMs ?? 0) > s.flight.durationMs + BATTING_PARAMS.contactWindowMs)).toBe(true);
    const exact = (s: Scenario): boolean =>
      s.plan.swing !== null &&
      near(s.plan.swing.startMs, s.baseMs) &&
      near(s.plan.swing.contactAtMs, s.baseMs + SWING.contactMs) &&
      near(s.plan.swing.height, zoneToWorld(CURSOR).y);
    expect(failures(humans, exact)).toEqual([]);
  });

  it("CPU: contactAtMs = durationMs ± missOffsetMs(seq の偶奇で早/遅)、startMs = max(contactAtMs − 132, resolvedAtMs)", () => {
    const exact = (s: Scenario): boolean => {
      const offset = s.outcome.seq % 2 === 0 ? 0 - SWING.missOffsetMs : SWING.missOffsetMs;
      const swing = s.plan.swing;
      return (
        swing !== null &&
        near(swing.contactAtMs, s.flight.durationMs + offset) &&
        near(swing.startMs, Math.max(swing.contactAtMs - SWING.contactMs, s.resolvedAtMs)) &&
        near(swing.height, zoneToWorld(s.flight.landing).y)
      );
    };
    expect(cpus.some((s) => s.outcome.seq % 2 === 0)).toBe(true);
    expect(cpus.some((s) => s.outcome.seq % 2 === 1)).toBe(true);
    expect(failures(cpus, exact)).toEqual([]);
  });

  it("CPU: startMs ≥ resolvedAtMs、接触姿勢まで 60〜132ms(早い空振りでスイングが約 52ms 飛ばない)", () => {
    const bounded = (s: Scenario): boolean => {
      const swing = s.plan.swing;
      const span = swing === null ? Number.NaN : swing.contactAtMs - swing.startMs;
      return swing !== null && swing.startMs >= s.resolvedAtMs && span >= SWING.minSwingMs && span <= SWING.contactMs;
    };
    expect(failures(cpus, bounded)).toEqual([]);
  });

  it("CPU の早い空振りは resolvedAtMs から振り始め、接触姿勢まで 80ms に圧縮される", () => {
    const early = cpus.find((s) => s.outcome.seq % 2 === 0);
    expect(early?.plan.swing?.startMs).toBe(early?.resolvedAtMs);
    expect((early?.plan.swing?.contactAtMs ?? 0) - (early?.plan.swing?.startMs ?? 0)).toBeCloseTo(80, 9);
  });

  it("resolvedAtMs が想定より遅れても(描画の遅延)、接触姿勢まで minSwingMs 以上を保ち、startMs は contactAtMs より前", () => {
    const flight = flightOf(2, 480, { x: 0, y: 0 });
    const lagged = planPlay({ flight, outcome: outcomeOf("swinging-strike", 2), swing: null, resolvedAtMs: flight.durationMs - 20 });
    const swing = lagged.swing;
    expect(swing).not.toBeNull();
    expect((swing?.contactAtMs ?? 0) - (swing?.startMs ?? 0)).toBeGreaterThanOrEqual(SWING.minSwingMs);
    expect((swing?.contactAtMs ?? 0) - (swing?.startMs ?? 0)).toBeLessThanOrEqual(SWING.contactMs);
    expect(lagged.telop.startMs).toBeGreaterThanOrEqual(flight.durationMs);
  });

  it("テロップは max(durationMs, swing.contactAtMs) から swingMissMs 間", () => {
    const timed = (s: Scenario): boolean =>
      near(s.plan.telop.startMs, Math.max(s.flight.durationMs, s.plan.swing?.contactAtMs ?? Number.NaN)) &&
      near(s.plan.telop.endMs - s.plan.telop.startMs, TELOP.swingMissMs);
    expect(failures(MISSES, timed)).toEqual([]);
  });

  it("ボールの待機: ballHoldUntilMs = max(durationMs + holdMs, resolvedAtMs)(接触なし)。受付が遅れても受付時刻までは残る", () => {
    const hold = (s: Scenario): boolean => near(s.plan.ballHoldUntilMs, Math.max(s.flight.durationMs + HOLD_MS, s.resolvedAtMs));
    expect(failures(MISSES, hold)).toEqual([]);
    expect(failures(MISSES, (s) => s.plan.ballHoldUntilMs >= s.resolvedAtMs && s.plan.ballHoldUntilMs >= s.flight.durationMs)).toEqual([]);
  });
});

describe("planPlay: ファウル・インプレー(接触あり)", () => {
  it("ボールは接触の瞬間まで着弾点で待つ: ballHoldUntilMs = contactMs", () => {
    expect(failures(CONTACTS, (s) => s.plan.ballHoldUntilMs === s.plan.contactMs)).toEqual([]);
  });

  it("contactMs = max(durationMs, base + minSwingMs) で、durationMs 以上。CPU は durationMs", () => {
    const exact = (s: Scenario): boolean =>
      s.plan.contactMs !== null &&
      s.plan.contactMs >= s.flight.durationMs &&
      near(s.plan.contactMs, Math.max(s.flight.durationMs, s.baseMs + SWING.minSwingMs));
    expect(failures(CONTACTS, exact)).toEqual([]);
    expect(failures(CONTACTS.filter(isCpu), (s) => s.plan.contactMs === s.flight.durationMs)).toEqual([]);
  });

  it("人間の早いクリックは durationMs、遅い/ジャストのクリックは atMs + minSwingMs", () => {
    const early = CONTACTS.filter((s) => s.swing !== null && s.swing.atMs + SWING.minSwingMs <= s.flight.durationMs);
    const late = CONTACTS.filter((s) => s.swing !== null && s.swing.atMs + SWING.minSwingMs > s.flight.durationMs);
    expect(early.length).toBeGreaterThan(0);
    expect(late.length).toBeGreaterThan(0);
    expect(failures(early, (s) => s.plan.contactMs === s.flight.durationMs)).toEqual([]);
    expect(failures(late, (s) => near(s.plan.contactMs ?? Number.NaN, (s.swing?.atMs ?? Number.NaN) + SWING.minSwingMs))).toEqual([]);
  });

  it("スイング: startMs ≥ base、接触姿勢まで 60〜132ms、contactAtMs = contactMs、高さは着弾点の高さ", () => {
    const valid = (s: Scenario): boolean => {
      const swing = s.plan.swing;
      const span = swing === null ? Number.NaN : swing.contactAtMs - swing.startMs;
      return (
        swing !== null &&
        swing.startMs >= s.baseMs &&
        span >= SWING.minSwingMs - 1e-9 &&
        span <= SWING.contactMs + 1e-9 &&
        swing.contactAtMs === s.plan.contactMs &&
        near(swing.height, zoneToWorld(s.flight.landing).y)
      );
    };
    expect(failures(CONTACTS, valid)).toEqual([]);
  });

  it("スイングの開始は max(contactMs − 132, base)(区間が 132ms 未満なら圧縮)", () => {
    const exact = (s: Scenario): boolean => near(s.plan.swing?.startMs ?? Number.NaN, Math.max(contactOf(s.plan).contactMs - SWING.contactMs, s.baseMs));
    expect(failures(CONTACTS, exact)).toEqual([]);
  });

  it("batted があり、contactMs ≤ contactMs + hangMs、chaseFromMs = contactMs", () => {
    const valid = (s: Scenario): boolean => {
      const { contactMs, hangMs } = contactOf(s.plan);
      return s.plan.batted !== null && hangMs > 0 && contactMs <= contactMs + hangMs && s.plan.chaseFromMs === contactMs;
    };
    expect(failures(CONTACTS, valid)).toEqual([]);
  });

  it("テロップは落下時(contactMs + hangMs)から、インプレー 1100ms・ファウル 700ms", () => {
    const timed = (s: Scenario): boolean => {
      const { contactMs, hangMs } = contactOf(s.plan);
      const length = s.outcome.kind === "in-play" ? TELOP.inPlayMs : TELOP.foulMs;
      return near(s.plan.telop.startMs, contactMs + hangMs) && near(s.plan.telop.endMs - s.plan.telop.startMs, length);
    };
    expect(failures(CONTACTS, timed)).toEqual([]);
  });
});

describe("planPlay: 野手", () => {
  const fieldable = IN_PLAYS.filter((s) => s.outcome.inPlay?.result !== "homerun");

  it("ホームラン(フェンス越え)は fielder = null", () => {
    const homeruns = IN_PLAYS.filter((s) => s.outcome.inPlay?.result === "homerun");
    expect(homeruns.length).toBeGreaterThan(0);
    expect(failures(homeruns, (s) => s.plan.fielder === null && s.plan.batted?.overFence === true)).toEqual([]);
  });

  it("フェアのゴロ/フライ/ライナー(ホームラン以外)は fielder あり", () => {
    expect(fieldable.length).toBeGreaterThan(0);
    expect(failures(fieldable, (s) => s.plan.fielder !== null)).toEqual([]);
  });

  it("ファウルは fielder = null", () => {
    expect(failures(FOULS, (s) => s.plan.fielder === null)).toEqual([]);
  });

  it("fielder.startMs = contactMs ≤ fielder.arriveMs ≤ endMs、滞空 × runFactor で到着", () => {
    const valid = (s: Scenario): boolean => {
      const fielder = s.plan.fielder;
      const { contactMs, hangMs } = contactOf(s.plan);
      return (
        fielder !== null &&
        fielder.startMs === contactMs &&
        fielder.startMs <= fielder.arriveMs &&
        fielder.arriveMs <= s.plan.endMs &&
        near(fielder.arriveMs, contactMs + hangMs * FIELDER_RUN.runFactor)
      );
    };
    expect(failures(fieldable, valid)).toEqual([]);
  });

  it("最寄りの野手が、守備位置から落下点 × stopRatio へ走る", () => {
    const valid = (s: Scenario): boolean => {
      const fielder = s.plan.fielder;
      const end = s.plan.batted?.end;
      if (fielder === null || end === undefined) {
        return false;
      }
      const slot = FIELDER_SLOTS.at(fielder.index);
      return (
        fielder.index === pickFielder(end) &&
        slot !== undefined &&
        JSON.stringify(fielder.from) === JSON.stringify(slot.position) &&
        near(fielder.to.x, end.x * FIELDER_RUN.stopRatio) &&
        near(fielder.to.z, end.z * FIELDER_RUN.stopRatio) &&
        fielder.to.y === 0
      );
    };
    expect(failures(fieldable, valid)).toEqual([]);
  });
});

describe("planPlay: 打球", () => {
  it("インプレーの batted.end の x・z は computeBattedLanding の landingToWorld(= フィールド図の落下点)に一致する", () => {
    const matches = (s: Scenario): boolean => {
      const inPlay = s.outcome.inPlay;
      const end = s.plan.batted?.end;
      if (inPlay === null || end === undefined) {
        return false;
      }
      const expected = landingToWorld(computeBattedLanding(inPlay.ball, inPlay.result, s.outcome.seq));
      return near(end.x, expected.x) && near(end.z, expected.z);
    };
    expect(failures(IN_PLAYS, matches)).toEqual([]);
  });

  it("打球の始点は着弾点の x・y と本塁の少し前の z", () => {
    const valid = (s: Scenario): boolean => {
      const start = s.plan.batted?.start;
      const landing = zoneToWorld(s.flight.landing);
      return start !== undefined && near(start.x, landing.x) && near(start.y, landing.y) && start.z === WORLD_PARAMS.batted.contactZ;
    };
    expect(failures(CONTACTS, valid)).toEqual([]);
  });

  it("打球の始点の z は接触点 = ゾーン平面(待っていたボールの着弾点と同じ位置なので、接触で跳ばない)", () => {
    const sameAsHeld = (s: Scenario): boolean => {
      const start = s.plan.batted?.start;
      const landing = zoneToWorld(s.flight.landing);
      return start !== undefined && start.z === WORLD_PARAMS.zone.planeZ && JSON.stringify(start) === JSON.stringify(landing);
    };
    expect(failures(CONTACTS, sameAsHeld)).toEqual([]);
  });
});

// ---- 性質テスト #8c: 人間のスイングの演出の時刻(判定時刻 atMs と受付時刻 resolvedAtMs の分離) ----

/** 判定時刻 `atMs` の D からのずれ(−400 〜 +250ms、25ms 刻み)。 */
const AT_OFFSETS: readonly number[] = Array.from({ length: 27 }, (_, i) => -400 + i * 25);
/** 受付時刻 = `atMs` + この遅れ(0 以上)。ただし上限は D + 330。 */
const RECEIVE_DELAYS: readonly number[] = [0, 3, 30, 80, 130, 200, 330, 730];
const RECEIPT_CAP_OFFSET = 330;
const IN_PLAY_SINGLE = outcomeOf("in-play", FIRST_FLIGHT.seq, { result: "single", ball: { type: "fly", strength: "medium", direction: "center" } });
const RECEIPT_KINDS: readonly PitchOutcomeView[] = [outcomeOf("swinging-strike", FIRST_FLIGHT.seq), outcomeOf("foul", FIRST_FLIGHT.seq), IN_PLAY_SINGLE];
const SWING_KINDS: readonly SwingInput["kind"][] = ["meet", "power"];

/** タイミング表示の期待ラベル(`|dt| < 窓 × centerRatio` ならジャスト、負なら早い、それ以外は遅い)。 */
function expectedLabelOf(dtMs: number, windowMs: number): "early" | "just" | "late" {
  if (Math.abs(dtMs) < windowMs * BATTING_PARAMS.centerRatio) {
    return "just";
  }
  return dtMs < 0 ? "early" : "late";
}

type ReceiptScenario = {
  readonly label: string;
  readonly swing: SwingInput;
  readonly resolvedAtMs: number;
  readonly plan: PlayPlan;
};

function receiptScenario(flight: PitchFlight, outcome: PitchOutcomeView, atOffset: number, delay: number, kind: SwingInput["kind"]): ReceiptScenario {
  const swing: SwingInput = { kind, cursor: CURSOR, atMs: flight.durationMs + atOffset };
  const resolvedAtMs = Math.max(swing.atMs, Math.min(swing.atMs + delay, flight.durationMs + RECEIPT_CAP_OFFSET));
  return { label: `${outcome.kind}/${kind}/at${atOffset}/recv${delay}`, swing, resolvedAtMs, plan: planPlay({ flight, outcome, swing, resolvedAtMs }) };
}

/** 受付時刻の組み合わせ(判定時刻のずれ × 受付の遅れ)。 */
const TIME_PAIRS: readonly { readonly atOffset: number; readonly delay: number }[] = AT_OFFSETS.flatMap((atOffset) =>
  RECEIVE_DELAYS.map((delay) => ({ atOffset, delay })),
);

const RECEIPT_SCENARIOS: readonly ReceiptScenario[] = FLIGHTS.flatMap((flight) =>
  RECEIPT_KINDS.flatMap((outcome) =>
    SWING_KINDS.flatMap((kind) => TIME_PAIRS.map(({ atOffset, delay }) => receiptScenario(flight, outcome, atOffset, delay, kind))),
  ),
);

describe("planPlay: 受付時刻の性質(#8c。atMs × 受付時刻の全組み合わせ)", () => {
  const swingOf = (s: ReceiptScenario): NonNullable<PlayPlan["swing"]> => s.plan.swing ?? { startMs: Number.NaN, contactAtMs: Number.NaN, height: Number.NaN };
  const contacts = RECEIPT_SCENARIOS.filter((s) => s.plan.contactMs !== null);
  const misses = RECEIPT_SCENARIOS.filter((s) => s.plan.contactMs === null);

  it("atMs(D−400〜D+250)× 受付(atMs〜D+330)× 空振り/ファウル/インプレー × 飛行 × 打撃種別を走査している", () => {
    expect(RECEIPT_SCENARIOS).toHaveLength(FLIGHTS.length * RECEIPT_KINDS.length * SWING_KINDS.length * AT_OFFSETS.length * RECEIVE_DELAYS.length);
    expect(contacts.length).toBeGreaterThan(1000);
    expect(misses.length).toBeGreaterThan(500);
    expect(RECEIPT_SCENARIOS.some((s) => s.resolvedAtMs - s.swing.atMs > 100)).toBe(true);
    expect(RECEIPT_SCENARIOS.some((s) => s.resolvedAtMs === s.swing.atMs)).toBe(true);
  });

  it("(1) swing.startMs ≥ resolvedAtMs(バットは受付より前の時刻から振り始めない)", () => {
    expect(failures(RECEIPT_SCENARIOS, (s) => swingOf(s).startMs >= s.resolvedAtMs)).toEqual([]);
  });

  it("(2) 接触あり: contactMs − startMs ≥ minSwingMs(60ms)かつ contactMs ≥ D(接触姿勢を飛ばさない)", () => {
    const valid = (s: ReceiptScenario): boolean => {
      const contactMs = s.plan.contactMs ?? Number.NaN;
      return contactMs - swingOf(s).startMs >= SWING.minSwingMs - 1e-9 && contactMs >= s.plan.durationMs;
    };
    expect(failures(contacts, valid)).toEqual([]);
  });

  it("(2b) 接触あり: D ちょうどのタップでも、受付 + minSwingMs までボールは待つ(contactMs = max(D, base + 60))", () => {
    const exact = (s: ReceiptScenario): boolean =>
      near(s.plan.contactMs ?? Number.NaN, Math.max(s.plan.durationMs, Math.max(s.swing.atMs, s.resolvedAtMs) + SWING.minSwingMs));
    expect(failures(contacts, exact)).toEqual([]);
  });

  it("(3) 空振り: contactAtMs − startMs = 132ms(圧縮なし)で、startMs = base", () => {
    const valid = (s: ReceiptScenario): boolean => {
      const swing = swingOf(s);
      return near(swing.contactAtMs - swing.startMs, SWING.contactMs) && near(swing.startMs, Math.max(s.swing.atMs, s.resolvedAtMs));
    };
    const missesOnly = RECEIPT_SCENARIOS.filter((s) => s.plan.kind === "swinging-strike");
    expect(missesOnly.length).toBeGreaterThan(500);
    expect(failures(missesOnly, valid)).toEqual([]);
  });

  it("(4) 接触なし: ballHoldUntilMs ≥ resolvedAtMs かつ ≥ D + holdMs(ボールは受付までは消えない)", () => {
    const valid = (s: ReceiptScenario): boolean =>
      s.plan.ballHoldUntilMs >= s.resolvedAtMs &&
      s.plan.ballHoldUntilMs >= s.plan.durationMs + HOLD_MS - 1e-9 &&
      near(s.plan.ballHoldUntilMs, Math.max(s.plan.durationMs + HOLD_MS, s.resolvedAtMs));
    expect(failures(misses, valid)).toEqual([]);
  });

  it("具体例: マウス(atMs D−20・受付 D+3)は startMs D+3・contactMs D+63", () => {
    const d = FIRST_FLIGHT.durationMs;
    const swing: SwingInput = { kind: "meet", cursor: CURSOR, atMs: d - 20 };
    const plan = planPlay({ flight: FIRST_FLIGHT, outcome: IN_PLAY_SINGLE, swing, resolvedAtMs: d + 3 });
    expect(plan.contactMs).toBe(d + 63);
    expect(plan.swing?.startMs).toBe(d + 3);
  });

  it("具体例: タッチのタップ(atMs D+30・受付 D+200)は startMs D+200・contactMs D+260(接触姿勢まで 60ms)", () => {
    const d = FIRST_FLIGHT.durationMs;
    const swing: SwingInput = { kind: "meet", cursor: CURSOR, atMs: d + 30 };
    const plan = planPlay({ flight: FIRST_FLIGHT, outcome: outcomeOf("foul", FIRST_FLIGHT.seq), swing, resolvedAtMs: d + 200 });
    expect(plan.swing?.startMs).toBe(d + 200);
    expect(plan.contactMs).toBe(d + 260);
    expect(plan.swing?.contactAtMs).toBe(d + 260);
    expect(plan.ballHoldUntilMs).toBe(d + 260);
  });

  it("具体例: 遅いタップ(atMs D+170・受付 D+330)の空振りは startMs D+330・contactAtMs D+462、ボールは D+330 まで残る", () => {
    const d = FIRST_FLIGHT.durationMs;
    const swing: SwingInput = { kind: "meet", cursor: CURSOR, atMs: d + 170 };
    const plan = planPlay({ flight: FIRST_FLIGHT, outcome: outcomeOf("swinging-strike", FIRST_FLIGHT.seq), swing, resolvedAtMs: d + 330 });
    expect(plan.swing?.startMs).toBe(d + 330);
    expect(plan.swing?.contactAtMs).toBe(d + 462);
    expect(plan.ballHoldUntilMs).toBe(d + 330);
  });

  it("具体例: 早いキー(atMs D−320・受付 D−297)の空振りは startMs D−297・contactAtMs D−165", () => {
    const d = FIRST_FLIGHT.durationMs;
    const swing: SwingInput = { kind: "meet", cursor: CURSOR, atMs: d - 320 };
    const plan = planPlay({ flight: FIRST_FLIGHT, outcome: outcomeOf("swinging-strike", FIRST_FLIGHT.seq), swing, resolvedAtMs: d - 297 });
    expect(plan.swing?.startMs).toBe(d - 297);
    expect(plan.swing?.contactAtMs).toBe(d - 165);
    expect(plan.ballHoldUntilMs).toBe(d + HOLD_MS);
  });
});

describe("planPlay: タイミング表示(timing)", () => {
  it("人間のスイングでは timing があり、dtMs は判定時刻 atMs − D(受付時刻ではない)を四捨五入した値", () => {
    const valid = (s: ReceiptScenario): boolean => {
      const timing = s.plan.timing;
      return (
        timing !== null &&
        timing.dtMs === Math.round(s.swing.atMs - s.plan.durationMs) &&
        timing.dtMs === timingCueOf(s.swing.atMs - s.plan.durationMs, swingWindowMs(s.swing.kind)).dtMs
      );
    };
    expect(failures(RECEIPT_SCENARIOS, valid)).toEqual([]);
  });

  it("label は swingWindowMs(打撃種別)× centerRatio で早い/ジャスト/遅い、startMs = base(受付以降)、endMs = startMs + timingMs", () => {
    const valid = (s: ReceiptScenario): boolean => {
      const timing = s.plan.timing;
      const dt = s.swing.atMs - s.plan.durationMs;
      const expectedLabel = expectedLabelOf(dt, swingWindowMs(s.swing.kind));
      const base = Math.max(s.swing.atMs, s.resolvedAtMs);
      return (
        timing !== null &&
        timing.label === expectedLabel &&
        near(timing.startMs, base) &&
        near(timing.endMs - timing.startMs, TIMING_MS) &&
        timing.startMs >= s.resolvedAtMs
      );
    };
    expect(failures(RECEIPT_SCENARIOS, valid)).toEqual([]);
  });

  it("早い(負)・遅い(正)・ジャストの 3 種が現れる。窓外の大きなずれ(D−400・D+250)でも出る", () => {
    const labels = new Set(RECEIPT_SCENARIOS.map((s) => s.plan.timing?.label));
    expect(labels).toEqual(new Set(["early", "just", "late"]));
    const far = RECEIPT_SCENARIOS.filter((s) => s.swing.atMs - s.plan.durationMs === -400 || s.swing.atMs - s.plan.durationMs === 250);
    expect(far.length).toBeGreaterThan(0);
    expect(failures(far, (s) => s.plan.timing !== null)).toEqual([]);
  });

  it("具体例: タップ(atMs D+30・受付 D+200)は「ジャスト +30ms」を受付時刻 D+200 から 900ms 出す", () => {
    const d = FIRST_FLIGHT.durationMs;
    const swing: SwingInput = { kind: "meet", cursor: CURSOR, atMs: d + 30 };
    const plan = planPlay({ flight: FIRST_FLIGHT, outcome: outcomeOf("foul", FIRST_FLIGHT.seq), swing, resolvedAtMs: d + 200 });
    expect(plan.timing).toEqual({ label: "just", dtMs: 30, startMs: d + 200, endMs: d + 200 + TIMING_MS });
  });

  it("具体例: 早いキー(atMs D−320)は「早い −320ms」、遅いタップ(atMs D+170)は「遅い +170ms」", () => {
    const d = FIRST_FLIGHT.durationMs;
    const early = planPlay({
      flight: FIRST_FLIGHT,
      outcome: outcomeOf("swinging-strike", FIRST_FLIGHT.seq),
      swing: { kind: "meet", cursor: CURSOR, atMs: d - 320 },
      resolvedAtMs: d - 297,
    });
    const late = planPlay({
      flight: FIRST_FLIGHT,
      outcome: outcomeOf("swinging-strike", FIRST_FLIGHT.seq),
      swing: { kind: "meet", cursor: CURSOR, atMs: d + 170 },
      resolvedAtMs: d + 330,
    });
    expect(early.timing).toMatchObject({ label: "early", dtMs: -320, startMs: d - 297 });
    expect(late.timing).toMatchObject({ label: "late", dtMs: 170, startMs: d + 330 });
  });
});

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

describe("planPlay: 入力を変更しない", () => {
  it("凍結した入力でも例外にならず、同じ結果を返す", () => {
    const ball: BattedBall = { type: "fly", strength: "strong", direction: "pull" };
    const input = {
      flight: flightOf(2, 480, { x: 0.9, y: -0.8 }),
      outcome: outcomeOf("in-play", 2, { result: "double", ball }),
      swing: { kind: "power", cursor: { x: 0.1, y: 0.2 }, atMs: 500 } satisfies SwingInput,
      resolvedAtMs: 500,
    };
    const frozen = planPlay(deepFreeze(structuredClone(input)));
    expect(frozen).toEqual(planPlay(input));
  });
});

describe("swingProgressAt", () => {
  const SPANS = [60, 80, 100, 132] as const;
  const START = 1000;

  it.each(SPANS)("接触姿勢まで %dms: startMs 以前で 0、contactAtMs で 0.66", (span) => {
    const swing = { startMs: START, contactAtMs: START + span };
    expect(swingProgressAt(swing, START - 100)).toBe(0);
    expect(swingProgressAt(swing, START)).toBe(0);
    expect(swingProgressAt(swing, START + span)).toBeCloseTo(0.66, 9);
    expect(swingProgressAt(swing, START + span)).toBe(SWING.contactRatio);
  });

  it.each(SPANS)("接触姿勢まで %dms: contactAtMs + 68ms で 1.0、+148ms 以降は 1.4 で止まる", (span) => {
    const swing = { startMs: START, contactAtMs: START + span };
    expect(swingProgressAt(swing, START + span + 68)).toBeCloseTo(1, 9);
    expect(swingProgressAt(swing, START + span + 148)).toBeCloseTo(SWING.followEndProgress, 9);
    expect(swingProgressAt(swing, START + span + 1000)).toBe(SWING.followEndProgress);
  });

  it.each(SPANS)("接触姿勢まで %dms: 単調非減少で、16ms 刻みの変化が小さい(1フレームで飛ばない)", (span) => {
    const swing = { startMs: START, contactAtMs: START + span };
    const values = Array.from({ length: 80 }, (_, i) => swingProgressAt(swing, START - 32 + i * 16));
    const steps = values.slice(1).map((value, i) => value - (values.at(i) ?? 0));
    expect(steps.every((step) => step >= 0)).toBe(true);
    // 60ms に圧縮した場合の 16ms あたり = 0.66 × 16 / 60 ≈ 0.176 が最大
    expect(Math.max(...steps)).toBeLessThanOrEqual((SWING.contactRatio * 16) / SWING.minSwingMs + 1e-9);
  });

  it("全シナリオの swing で、contactAtMs の progress が接触姿勢の 0.66", () => {
    const atContact = (s: Scenario): boolean => s.plan.swing !== null && swingProgressAt(s.plan.swing, s.plan.swing.contactAtMs) === SWING.contactRatio;
    expect(failures([...MISSES, ...CONTACTS], atContact)).toEqual([]);
  });
});
