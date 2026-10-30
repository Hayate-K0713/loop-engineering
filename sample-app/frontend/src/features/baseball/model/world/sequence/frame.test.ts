import { describe, expect, it } from "vitest";
import type { AssistParams, BattedBall, InPlayResult, SwingInput } from "../../../types/batting";
import type { PitchFlight } from "../../../types/pitch";
import type { CameraPose, SafeArea, SceneFrame, SceneLayout, ScenePhase, UniformColors, Vec3 } from "../../../types/scene";
import type { PitchOutcomeView } from "../../../types/view";
import { ASSIST_TABLE, previewCenterOf } from "../../batting/assist";
import { BATTING_PARAMS } from "../../batting/params";
import {
  ballScaleFor,
  battingCamera,
  battingCameraFor,
  blendCamera,
  chaseBlendAt,
  chaseCamera,
  outlineScaleFor,
  portraitBlendAt,
  ringWidthFor,
} from "../camera/rig";
import { batterStancePose, batterSwingPose } from "../motion/batter";
import { batLengthScaleFor, batterRootFor } from "../motion/batter-layout";
import { catcherPose, fielderIdlePose } from "../motion/fielder";
import { pitcherFollowPose, pitcherWindupPose } from "../motion/pitcher";
import { type BatterJoints, placeBatter, placeCharacter } from "../motion/pose";
import { BAT_FOLLOW_LIFT, BAT_STANCE_HEIGHT } from "../motion/rig";
import { type BattedPlan, battedBallAt } from "../path/batted-path";
import { FIELDER_SLOTS } from "../path/fielders";
import { heldBallAt, pitchBallAt } from "../path/pitch-path";
import { zoneToWorld } from "../space/coords";
import { CPU_SWING_LEAD_MS, RELEASE_POINT, WORLD_PARAMS } from "../space/params";
import { lerpVec3 } from "../space/vec3";
import { ballSpinAt } from "./ball-look";
import { type SceneFrameInput, sceneFrameAt, zonePulseAt } from "./frame";
import { type PlayPlan, planPlay, swingProgressAt } from "./play-plan";

const ACTORS = WORLD_PARAMS.actors;
const SWING = WORLD_PARAMS.swing;
const CUE = WORLD_PARAMS.cue;
const LANDING_MARK = WORLD_PARAMS.landingMark;
const HOLD_MS = WORLD_PARAMS.catch.holdMs;
/** 縦長スマホ(390×844)の縦横比。 */
const PORTRAIT_ASPECT = 390 / 844;
/** 縦長で実測した空き領域の例(390×664 相当)。 */
const PORTRAIT_SAFE_AREA: SafeArea = { top: 0.1837, bottom: 0.7 };

const UNIFORMS_A: UniformColors = { offense: 0x2f63c8, defense: 0xe8473c };
const UNIFORMS_B: UniformColors = { offense: 0xe8473c, defense: 0x2f63c8 };

const FLIGHT: PitchFlight = {
  seq: 7,
  kind: "straight",
  aim: { x: 0.2, y: 0.1 },
  landing: { x: 0.2, y: 0.1 },
  speedKmh: 140,
  durationMs: 480,
  quality: "normal",
};
const NORMAL = ASSIST_TABLE.normal;
const HARD = ASSIST_TABLE.hard;
const BALL = WORLD_PARAMS.ball;
const GUIDE = WORLD_PARAMS.guide;
const CPU_RESOLVED_MS = FLIGHT.durationMs - CPU_SWING_LEAD_MS;
/** 人間の遅いクリック(durationMs より後)。contactMs = atMs + 60。 */
const LATE_SWING: SwingInput = { kind: "meet", cursor: { x: 0.3, y: -0.2 }, atMs: FLIGHT.durationMs - 10 };

function outcomeOf(kind: PitchOutcomeView["kind"], inPlay: PitchOutcomeView["inPlay"] = null): PitchOutcomeView {
  return { seq: FLIGHT.seq, kind, inPlay, plate: null };
}

function inPlayOutcome(result: InPlayResult, ball: BattedBall): PitchOutcomeView {
  return outcomeOf("in-play", { result, ball });
}

function humanPlan(outcome: PitchOutcomeView): PlayPlan {
  return planPlay({ flight: FLIGHT, outcome, swing: LATE_SWING, resolvedAtMs: LATE_SWING.atMs });
}

function cpuPlan(outcome: PitchOutcomeView): PlayPlan {
  return planPlay({ flight: FLIGHT, outcome, swing: null, resolvedAtMs: CPU_RESOLVED_MS });
}

const SINGLE_BALL: BattedBall = { type: "fly", strength: "medium", direction: "center" };
const SINGLE = humanPlan(inPlayOutcome("single", SINGLE_BALL));
const HOMERUN = cpuPlan(inPlayOutcome("homerun", { type: "fly", strength: "strong", direction: "pull" }));
const GROUNDOUT = cpuPlan(inPlayOutcome("groundout", { type: "ground", strength: "weak", direction: "opposite" }));
const FOUL = cpuPlan(outcomeOf("foul"));
const MISS_HUMAN = humanPlan(outcomeOf("swinging-strike"));
const MISS_CPU = cpuPlan(outcomeOf("swinging-strike"));
const TAKE = cpuPlan(outcomeOf("called-strike"));
/** 人間の見逃し(振らない)。確定は D + lateCutoffMs。 */
const TAKE_HUMAN = planPlay({
  flight: FLIGHT,
  outcome: outcomeOf("called-strike"),
  swing: null,
  resolvedAtMs: FLIGHT.durationMs + BATTING_PARAMS.lateCutoffMs,
});
const LINEOUT = cpuPlan(inPlayOutcome("lineout", { type: "liner", strength: "medium", direction: "center" }));

const CHASE_PLANS: readonly PlayPlan[] = [SINGLE, HOMERUN, GROUNDOUT, FOUL, LINEOUT];
const NO_CHASE_PLANS: readonly PlayPlan[] = [MISS_HUMAN, MISS_CPU, TAKE, TAKE_HUMAN];
const ALL_PLANS: readonly PlayPlan[] = [...CHASE_PLANS, ...NO_CHASE_PLANS];
const PHASES: readonly ScenePhase[] = ["idle", "windup", "flight", "play"];

function inputOf(overrides: Partial<SceneFrameInput> = {}): SceneFrameInput {
  return {
    phase: "play",
    tMs: 0,
    windupU: 0.5,
    flight: FLIGHT,
    plan: null,
    aspect: 16 / 9,
    layout: "batting",
    safeArea: null,
    uniforms: UNIFORMS_A,
    cursor: { visible: true, point: { x: 0.25, y: -0.4 }, raw: { x: 0.25, y: -0.4 }, radii: { rx: 0.5, ry: 0.3 } },
    assist: NORMAL,
    grid: true,
    ...overrides,
  };
}

/** 時刻を 37ms 刻み(負の時刻を含む)で 4.5 秒まで走査する。 */
const TIMES: readonly number[] = Array.from({ length: 125 }, (_, i) => -50 + i * 37);

/** phase × plan(なし含む)× flight(なし含む)× 時刻の全入力。 */
const GRID_INPUTS: readonly SceneFrameInput[] = PHASES.flatMap((phase) =>
  [null, ...ALL_PLANS].flatMap((plan) => [null, FLIGHT].flatMap((flight) => TIMES.map((tMs) => inputOf({ phase, plan, flight, tMs })))),
);

type Composition = { readonly aspect: number; readonly layout: SceneLayout; readonly safeArea: SafeArea | null };

/** 構図の入力(縦長・中間・無効な縦横比、打撃・守備、空き領域あり/なし/無効)。 */
const COMPOSITIONS: readonly Composition[] = [
  { aspect: 16 / 9, layout: "batting", safeArea: null },
  { aspect: PORTRAIT_ASPECT, layout: "batting", safeArea: null },
  { aspect: PORTRAIT_ASPECT, layout: "pitching", safeArea: PORTRAIT_SAFE_AREA },
  { aspect: 0.85, layout: "batting", safeArea: PORTRAIT_SAFE_AREA },
  { aspect: 0.5, layout: "pitching", safeArea: { top: 0.5, bottom: 0.55 } },
  { aspect: Number.NaN, layout: "batting", safeArea: { top: Number.NaN, bottom: 1 } },
  { aspect: 0, layout: "pitching", safeArea: null },
];

/** 構図 × phase × plan × 時刻(粗い刻み)の入力。 */
const COMPOSED_INPUTS: readonly SceneFrameInput[] = COMPOSITIONS.flatMap((composition) =>
  PHASES.flatMap((phase) =>
    [null, ...ALL_PLANS].flatMap((plan) => TIMES.filter((_tMs, i) => i % 4 === 0).map((tMs) => inputOf({ phase, plan, tMs, ...composition }))),
  ),
);

function numbersIn(value: unknown): readonly number[] {
  if (typeof value === "number") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(numbersIn);
  }
  return typeof value === "object" && value !== null ? Object.values(value).flatMap(numbersIn) : [];
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function frameAt(plan: PlayPlan | null, tMs: number, overrides: Partial<SceneFrameInput> = {}): SceneFrame {
  return sceneFrameAt(inputOf({ plan, tMs, ...overrides }));
}

/** plan に中継カメラへ移る時刻があるときのその値(型の絞り込み用)。 */
function chaseFrom(plan: PlayPlan): number {
  return plan.chaseFromMs ?? Number.NaN;
}

function battedOf(plan: PlayPlan): BattedPlan {
  if (plan.batted === null) {
    throw new Error("plan に batted が無い");
  }
  return plan.batted;
}

function swingOf(plan: PlayPlan): NonNullable<PlayPlan["swing"]> {
  if (plan.swing === null) {
    throw new Error("plan に swing が無い");
  }
  return plan.swing;
}

describe("sceneFrameAt: 全入力の健全性", () => {
  it("phase × plan × flight × 時刻の全組み合わせを走査している", () => {
    expect(GRID_INPUTS).toHaveLength(PHASES.length * (ALL_PLANS.length + 1) * 2 * TIMES.length);
  });

  it("全数値が有限で、fielders は 7 人(縦長・守備・無効な縦横比/空き領域の構図を含む)", () => {
    const broken = [...GRID_INPUTS, ...COMPOSED_INPUTS].filter((input) => {
      const frame = sceneFrameAt(input);
      return frame.fielders.length !== 7 || !numbersIn(frame).every(Number.isFinite);
    });
    expect(broken.slice(0, 3).map((input) => `${input.phase}/t${input.tMs}/aspect${input.aspect}`)).toEqual([]);
  });

  it("構図の入力は凍結した入力でも例外にならず、同じ結果を返す", () => {
    const sample = COMPOSED_INPUTS.filter((_input, i) => i % 53 === 0);
    expect(sample.length).toBeGreaterThan(50);
    const differing = sample.filter((input) => JSON.stringify(sceneFrameAt(deepFreeze(structuredClone(input)))) !== JSON.stringify(sceneFrameAt(input)));
    expect(differing).toHaveLength(0);
  });

  it("同一入力で deep equal(決定論)", () => {
    const differing = GRID_INPUTS.filter((input) => {
      const first = sceneFrameAt(input);
      const second = sceneFrameAt({ ...input });
      return JSON.stringify(first) !== JSON.stringify(second);
    });
    expect(differing).toHaveLength(0);
  });

  it("入力(plan・flight を含む)を変更しない: 凍結した入力でも例外にならず、同じ結果を返す", () => {
    const sample = GRID_INPUTS.filter((_input, i) => i % 97 === 0);
    expect(sample.length).toBeGreaterThan(50);
    const differing = sample.filter((input) => JSON.stringify(sceneFrameAt(deepFreeze(structuredClone(input)))) !== JSON.stringify(sceneFrameAt(input)));
    expect(differing).toHaveLength(0);
  });
});

describe("sceneFrameAt: uniforms", () => {
  it("frame.uniforms は input.uniforms と一致する(phase・plan によらない)", () => {
    const mismatched = GRID_INPUTS.filter((input) => JSON.stringify(sceneFrameAt(input).uniforms) !== JSON.stringify(input.uniforms));
    expect(mismatched).toHaveLength(0);
  });

  it("攻守交代後に別の値を渡せば別の値になる", () => {
    expect(frameAt(SINGLE, 600, { uniforms: UNIFORMS_A }).uniforms).toEqual(UNIFORMS_A);
    expect(frameAt(SINGLE, 600, { uniforms: UNIFORMS_B }).uniforms).toEqual(UNIFORMS_B);
  });
});

describe("sceneFrameAt: ボール", () => {
  it("idle・windup では非表示(flight・plan があっても)", () => {
    const visible = GRID_INPUTS.filter((input) => (input.phase === "idle" || input.phase === "windup") && sceneFrameAt(input).ball.visible);
    expect(visible).toHaveLength(0);
  });

  it("flight: リリース直後はリリース点、durationMs までは pitchBallAt、以降は plan が無い間ずっと着弾点(動かない・消えない)", () => {
    const at = (tMs: number): SceneFrame["ball"] => frameAt(null, tMs, { phase: "flight" }).ball;
    expect(at(0)).toMatchObject({ visible: true, position: RELEASE_POINT });
    expect(at(200)).toMatchObject({ visible: true, position: pitchBallAt(FLIGHT, 200) });
    expect(at(FLIGHT.durationMs).position).toEqual(zoneToWorld(FLIGHT.landing));
    for (const tMs of [FLIGHT.durationMs + 80, FLIGHT.durationMs + 1000, FLIGHT.durationMs + 100000]) {
      expect(at(tMs)).toMatchObject({ visible: true, position: heldBallAt(FLIGHT) });
    }
  });

  it("phase が play でも plan が無い間(人間が振る/見逃すのを待っている間)は着弾点に留める", () => {
    const ball = frameAt(null, FLIGHT.durationMs + 400, { phase: "play" }).ball;
    expect(ball.visible).toBe(true);
    expect(ball.position).toEqual(heldBallAt(FLIGHT));
  });

  it("flight が無ければ(play で打球が始まる前)非表示", () => {
    expect(frameAt(SINGLE, 100, { flight: null }).ball.visible).toBe(false);
    expect(frameAt(SINGLE, 100, { flight: null, phase: "flight", plan: null }).ball.visible).toBe(false);
  });

  it("play・インプレー: 接触前は投球の軌道、遅いクリックの判定待ちは着弾点で待ち、接触から打球(始点 = 待っていた位置)、落下後は終点で止まる", () => {
    const batted = battedOf(SINGLE);
    expect(SINGLE.contactMs).toBeGreaterThan(FLIGHT.durationMs);
    const plan = swingOf(SINGLE);
    expect(frameAt(SINGLE, 300).ball.position).toEqual(pitchBallAt(FLIGHT, 300));
    expect(frameAt(SINGLE, FLIGHT.durationMs + 20).ball.position).toEqual(heldBallAt(FLIGHT));
    expect(frameAt(SINGLE, plan.contactAtMs - 1).ball.position).toEqual(heldBallAt(FLIGHT));
    expect(batted.start).toEqual(heldBallAt(FLIGHT));
    expect(frameAt(SINGLE, plan.contactAtMs).ball.position).toEqual(batted.start);
    expect(frameAt(SINGLE, plan.contactAtMs + 300).ball.position).toEqual(battedBallAt(batted, 300));
    const landed = plan.contactAtMs + batted.hangMs;
    expect(frameAt(SINGLE, landed).ball.position).toEqual(batted.end);
    expect(frameAt(SINGLE, landed + 2000).ball.position).toEqual(batted.end);
  });

  it("play・インプレー: flight が無くても接触後は打球を表示する", () => {
    const plan = swingOf(SINGLE);
    const ball = frameAt(SINGLE, plan.contactAtMs + 100, { flight: null }).ball;
    expect(ball.visible).toBe(true);
    expect(ball.position).toEqual(battedBallAt(battedOf(SINGLE), 100));
    expect(ball.scale).toBeGreaterThanOrEqual(1);
  });

  it("play・接触なし(空振り・見逃し・CPU): ballHoldUntilMs まで着弾点に留まり、以降は非表示", () => {
    const wrong = [MISS_HUMAN, MISS_CPU, TAKE, TAKE_HUMAN].flatMap((plan) => {
      const held = plan.ballHoldUntilMs;
      const atHold = frameAt(plan, held).ball;
      const afterHold = frameAt(plan, held + 1).ball;
      const ok = atHold.visible && Object.is(atHold.position.z, heldBallAt(FLIGHT).z) && !afterHold.visible && !frameAt(plan, held + 3000).ball.visible;
      return ok ? [] : [`hold${held}`];
    });
    expect(wrong).toEqual([]);
    expect(frameAt(TAKE, FLIGHT.durationMs + 50).ball.position).toEqual(heldBallAt(FLIGHT));
    expect(frameAt(TAKE_HUMAN, FLIGHT.durationMs + BATTING_PARAMS.lateCutoffMs).ball.position).toEqual(heldBallAt(FLIGHT));
  });

  it("人間の見逃しは D + lateCutoffMs まで、CPU の見逃し・空振りは D + holdMs まで残る", () => {
    expect(TAKE.ballHoldUntilMs).toBe(FLIGHT.durationMs + HOLD_MS);
    expect(MISS_CPU.ballHoldUntilMs).toBe(FLIGHT.durationMs + HOLD_MS);
    expect(TAKE_HUMAN.ballHoldUntilMs).toBe(FLIGHT.durationMs + BATTING_PARAMS.lateCutoffMs);
  });

  it("到達後の画面外への動きが無い: D から接触または消失までボールの位置が一定(止まる)", () => {
    const moved = [SINGLE, FOUL, MISS_HUMAN, MISS_CPU, TAKE, TAKE_HUMAN].flatMap((plan) => {
      const until = plan.contactMs ?? plan.ballHoldUntilMs;
      const times = TIMES.filter((tMs) => tMs >= FLIGHT.durationMs && tMs < until);
      return times.filter((tMs) => JSON.stringify(frameAt(plan, tMs).ball.position) !== JSON.stringify(heldBallAt(FLIGHT)));
    });
    expect(moved).toEqual([]);
  });
});

// ---- 性質テスト #8b: ボールの消失と再出現 ----

/** 人間のスイングの `atMs`(D−400〜D+250)の D からのずれ。 */
const AT_OFFSETS: readonly number[] = Array.from({ length: 14 }, (_, i) => -400 + i * 50);
/** 受付時刻の、`atMs` からのずれ(0〜)。受付は `atMs` 以降で D+330 まで。 */
const RECEIVE_DELAYS: readonly number[] = Array.from({ length: 12 }, (_, i) => i * 70);
const SWING_OUTCOMES: readonly PitchOutcomeView[] = [outcomeOf("swinging-strike"), outcomeOf("foul"), inPlayOutcome("single", SINGLE_BALL)];

type BallSample = { readonly tMs: number; readonly ball: SceneFrame["ball"] };
type VisibilityScenario = { readonly label: string; readonly plan: PlayPlan; readonly timeline: readonly BallSample[] };

/**
 * 実際の進行: plan ができる前(`t < resolvedAtMs`)は plan なし(phase = flight)、できてから(`t ≥ resolvedAtMs`)は plan あり(phase = play)。
 * 時刻は 20ms 刻みで、ボールの消える/切り替わる時刻を十分に過ぎるまで。
 */
function ballTimeline(plan: PlayPlan): readonly BallSample[] {
  const last = Math.max(FLIGHT.durationMs, plan.resolvedAtMs, plan.contactMs ?? 0, plan.ballHoldUntilMs) + 300;
  return Array.from({ length: Math.floor(last / 20) + 1 }, (_, i) => {
    const tMs = i * 20;
    const ready = tMs >= plan.resolvedAtMs;
    return { tMs, ball: frameAt(ready ? plan : null, tMs, { phase: ready ? "play" : "flight" }).ball };
  });
}

function scenarioOf(label: string, plan: PlayPlan): VisibilityScenario {
  return { label, plan, timeline: ballTimeline(plan) };
}

/** 判定時刻 `atMs`(D + atOffset)の人間のスイングを、受付時刻(`atMs` + delay。D+330 を上限、`atMs` を下限)で受け付けた plan。 */
function humanScenario(outcome: PitchOutcomeView, atOffset: number, receiveDelay: number): VisibilityScenario {
  const atMs = FLIGHT.durationMs + atOffset;
  const resolvedAtMs = Math.max(atMs, Math.min(atMs + receiveDelay, FLIGHT.durationMs + 330));
  const swing: SwingInput = { kind: "meet", cursor: { x: 0.3, y: -0.2 }, atMs };
  return scenarioOf(`${outcome.kind}/at${atOffset}/recv${receiveDelay}`, planPlay({ flight: FLIGHT, outcome, swing, resolvedAtMs }));
}

const OTHER_SCENARIOS: readonly VisibilityScenario[] = [
  scenarioOf("human-take", TAKE_HUMAN),
  scenarioOf("cpu-take", TAKE),
  scenarioOf("cpu-miss", MISS_CPU),
  scenarioOf("cpu-foul", FOUL),
  scenarioOf("cpu-single", cpuPlan(inPlayOutcome("single", SINGLE_BALL))),
];

const VISIBILITY_SCENARIOS: readonly VisibilityScenario[] = [
  ...SWING_OUTCOMES.flatMap((outcome) => AT_OFFSETS.flatMap((atOffset) => RECEIVE_DELAYS.map((delay) => humanScenario(outcome, atOffset, delay)))),
  ...OTHER_SCENARIOS,
];

describe("sceneFrameAt: ボールの消失と再出現(性質 #8b)", () => {
  it("シナリオ(atMs D−400〜D+250 × 受付 atMs〜D+330 × 空振り/ファウル/インプレー + 見逃し・CPU)を走査している", () => {
    expect(VISIBILITY_SCENARIOS).toHaveLength(SWING_OUTCOMES.length * AT_OFFSETS.length * RECEIVE_DELAYS.length + OTHER_SCENARIOS.length);
  });

  it("同じ投球でボールが一度消えたら、再び現れない", () => {
    const reappeared = VISIBILITY_SCENARIOS.filter(({ timeline }) => {
      const flags = timeline.map((entry) => entry.ball.visible);
      const firstHidden = flags.indexOf(false);
      return firstHidden >= 0 && flags.slice(firstHidden).some(Boolean);
    });
    expect(reappeared.slice(0, 3).map((scenario) => scenario.label)).toEqual([]);
  });

  it("消えるのは到達後で、plan ができた時刻以降の接触なしのときだけ(plan が無い間・接触ありは常に表示)", () => {
    const wrong = VISIBILITY_SCENARIOS.filter(({ plan, timeline }) =>
      timeline.some(({ tMs, ball }) => !ball.visible && (tMs <= FLIGHT.durationMs || tMs <= plan.resolvedAtMs || plan.contactMs !== null)),
    );
    expect(wrong.slice(0, 3).map((scenario) => scenario.label)).toEqual([]);
  });

  it("接触あり: D 以降、接触の瞬間まで着弾点に留まり、接触の瞬間に打球の始点(= 待っていた位置)へ連続して切り替わる(跳ばない)", () => {
    const contacts = VISIBILITY_SCENARIOS.filter(({ plan }) => plan.contactMs !== null);
    expect(contacts.length).toBeGreaterThan(100);
    const held = JSON.stringify(heldBallAt(FLIGHT));
    const wrong = contacts.filter(({ plan, timeline }) => {
      const contactMs = plan.contactMs ?? Number.NaN;
      const waiting = timeline.filter(({ tMs }) => tMs > FLIGHT.durationMs && tMs < contactMs);
      const stays = waiting.every(({ ball }) => ball.visible && JSON.stringify(ball.position) === held);
      return !stays || JSON.stringify(frameAt(plan, contactMs).ball.position) !== held;
    });
    expect(wrong.slice(0, 3).map((scenario) => scenario.label)).toEqual([]);
  });

  it("接触なし: 受付時刻が遅くても、受付時刻までは着弾点に残り、ballHoldUntilMs の後で消える", () => {
    const misses = VISIBILITY_SCENARIOS.filter(({ plan }) => plan.contactMs === null);
    expect(misses.length).toBeGreaterThan(100);
    const wrong = misses.filter(({ plan, timeline }) => {
      const visibleUpToReceipt = timeline.filter(({ tMs }) => tMs <= plan.resolvedAtMs).every(({ ball }) => ball.visible);
      const hiddenAfterHold = timeline.filter(({ tMs }) => tMs > plan.ballHoldUntilMs).every(({ ball }) => !ball.visible);
      return !visibleUpToReceipt || !hiddenAfterHold || plan.ballHoldUntilMs < plan.resolvedAtMs;
    });
    expect(wrong.slice(0, 3).map((scenario) => scenario.label)).toEqual([]);
  });
});

/** 表示高に対するボール(倍率込み)の直径の比。 */
function diameterRatio(frame: SceneFrame): number {
  const dist = distance(frame.ball.position, frame.camera.position);
  return (frame.ball.scale * 2 * WORLD_PARAMS.ballRadius) / (2 * dist * Math.tan((frame.camera.fovDeg * Math.PI) / 360));
}

describe("sceneFrameAt: ball.scale(飛行中・中継カメラ中の最小表示径)", () => {
  it("中継カメラに移る前(投球中・接触前・打球なし)は、最終のカメラの ballScaleFor(飛行用の最小径)と一致する", () => {
    const wrong = GRID_INPUTS.filter((input) => {
      const frame = sceneFrameAt(input);
      return (
        frame.ball.visible &&
        frame.zone.visible &&
        Math.abs(frame.ball.scale - ballScaleFor(frame.camera, frame.ball.position, BALL.minScreenDiameterRatioFlight)) > 1e-12
      );
    });
    expect(wrong).toHaveLength(0);
  });

  it("飛行中(リリースから D 以降も)の表示径は、どの構図でも minScreenDiameterRatioFlight 以上。倍率は 1 以上で、リリース直後の倍率は 1 を超え、時間とともに減る(連続・単調非増加)", () => {
    const wrong = COMPOSITIONS.filter((composition) => {
      const times = Array.from({ length: 100 }, (_, i) => (i * (FLIGHT.durationMs + 200)) / 99);
      const frames = times.map((tMs) => frameAt(null, tMs, { phase: "flight", ...composition }));
      const scales = frames.map((frame) => frame.ball.scale);
      const monotone = scales.every((scale, i) => i === 0 || scale <= (scales.at(i - 1) ?? 0) + 1e-9);
      const large = frames.every((frame) => frame.ball.scale >= 1 && diameterRatio(frame) >= BALL.minScreenDiameterRatioFlight - 1e-12);
      return !(monotone && large && (scales.at(0) ?? 0) > 1);
    });
    expect(wrong.map((composition) => composition.aspect)).toEqual([]);
  });

  it("390×844 の縦長: リリース直後の倍率は約 2.0、D−730ms 付近までに 1 に戻る(play 分冊 §1-4)", () => {
    const long: PitchFlight = { ...FLIGHT, durationMs: 1300 };
    const at = (tMs: number): number => frameAt(null, tMs, { phase: "flight", flight: long, aspect: PORTRAIT_ASPECT }).ball.scale;
    expect(at(0)).toBeGreaterThan(1.8);
    expect(at(0)).toBeLessThan(2.2);
    expect(at(long.durationMs - 600)).toBe(1);
    expect(at(long.durationMs)).toBe(1);
  });

  it("中継カメラ中は、最終のカメラ(blend 中を含む)の ballScaleFor と一致し、表示高に対する直径の比が minScreenDiameterRatio 以上", () => {
    const { minScreenDiameterRatio } = WORLD_PARAMS.ball;
    const sinces = [0, 125, 400, 1000, 1500];
    const cases = CHASE_PLANS.flatMap((plan) => COMPOSITIONS.flatMap((composition) => sinces.map((since) => ({ plan, composition, since }))));
    const wrong = cases.filter(({ plan, composition, since }) => {
      const frame = frameAt(plan, chaseFrom(plan) + since, composition);
      const matches = Math.abs(frame.ball.scale - ballScaleFor(frame.camera, frame.ball.position, minScreenDiameterRatio)) < 1e-12;
      return !(frame.ball.visible && matches && frame.ball.scale >= 1 && diameterRatio(frame) >= minScreenDiameterRatio - 1e-12);
    });
    expect(wrong.map(({ since, composition }) => `${since}/aspect${composition.aspect}`)).toEqual([]);
  });

  it("中継カメラの終盤(遠い打球)では倍率が 1 を超え、近い間は 1 のまま", () => {
    expect(frameAt(HOMERUN, chaseFrom(HOMERUN) + 1500).ball.scale).toBeGreaterThan(1);
    expect(frameAt(SINGLE, chaseFrom(SINGLE) - 1).ball.scale).toBe(1);
  });
});

describe("sceneFrameAt: カメラ", () => {
  it("idle・windup・flight は打撃カメラ(plan があっても)", () => {
    const moved = GRID_INPUTS.filter((input) => input.phase !== "play" && JSON.stringify(sceneFrameAt(input).camera) !== JSON.stringify(battingCamera()));
    expect(moved).toHaveLength(0);
  });

  it("play・打球なし(空振り・見逃し)は打撃カメラのまま", () => {
    const moved = NO_CHASE_PLANS.flatMap((plan) => TIMES.filter((tMs) => JSON.stringify(frameAt(plan, tMs).camera) !== JSON.stringify(battingCamera())));
    expect(moved).toHaveLength(0);
  });

  it.each(CHASE_PLANS.map((plan, i) => [i, plan] as const))(
    "play・打球 #%d: chaseFromMs 以降は blendCamera(打撃カメラ, 中継カメラ(lift 0), 位置の割合, 注視点の割合)(構図ごと)",
    (_i, plan) => {
      const batted = battedOf(plan);
      const times = [0, 50, 125, 250, 400, 500, 800, 1500].map((since) => chaseFrom(plan) + since);
      const cases = COMPOSITIONS.flatMap((composition) => times.map((tMs) => ({ composition, tMs })));
      const mismatched = cases.filter(({ composition, tMs }) => {
        const ball = battedBallAt(batted, tMs - (plan.contactMs ?? 0));
        const blend = chaseBlendAt(tMs - chaseFrom(plan));
        const aspect = Number.isFinite(composition.aspect) && composition.aspect > 0 ? composition.aspect : 16 / 9;
        const base = battingCameraFor(aspect, composition.layout, composition.safeArea);
        const expected: CameraPose = blendCamera(base, chaseCamera(ball, aspect, 0), blend.position, blend.target);
        return JSON.stringify(frameAt(plan, tMs, composition).camera) !== JSON.stringify(expected);
      });
      expect(mismatched.map(({ composition, tMs }) => `aspect${composition.aspect}/t${tMs}`)).toEqual([]);
    },
  );

  it("play・打球: chaseFromMs より前は打撃カメラ、ちょうどの時刻は打撃カメラと一致(切り替わりで飛ばない。縦長・守備を含む)", () => {
    const moved = CHASE_PLANS.flatMap((plan) =>
      COMPOSITIONS.filter((composition) => {
        const base = JSON.stringify(sceneFrameAt(inputOf({ phase: "flight", plan: null, tMs: 100, ...composition })).camera);
        return (
          JSON.stringify(frameAt(plan, chaseFrom(plan) - 1, composition).camera) !== base ||
          JSON.stringify(frameAt(plan, chaseFrom(plan), composition).camera) !== base
        );
      }),
    );
    expect(moved).toHaveLength(0);
  });

  it("play・打球: 16ms 間のカメラ位置の移動は 1.5m 以下(接触から落下後 1 秒まで。縦長・守備を含む)", () => {
    const jumps = CHASE_PLANS.flatMap((plan) =>
      COMPOSITIONS.flatMap((composition) => {
        const end = chaseFrom(plan) + battedOf(plan).hangMs + 1000;
        const steps = Array.from({ length: Math.floor((end - chaseFrom(plan)) / 16) }, (_, i) => chaseFrom(plan) + i * 16);
        return steps.filter((tMs) => distance(frameAt(plan, tMs, composition).camera.position, frameAt(plan, tMs + 16, composition).camera.position) > 1.5);
      }),
    );
    expect(jumps).toHaveLength(0);
  });

  it("縦横比 16/9・レイアウト・空き領域によらず(横長)、接触前は従来の打撃カメラ battingCamera() と一致する", () => {
    for (const layout of ["batting", "pitching"] as const) {
      expect(frameAt(null, 100, { phase: "flight", aspect: 16 / 9, layout, safeArea: PORTRAIT_SAFE_AREA }).camera).toEqual(battingCamera());
    }
  });

  it("接触前の camera は battingCameraFor(aspect, layout, safeArea) に一致する(縦長・守備・空き領域あり)", () => {
    const mismatched = COMPOSITIONS.filter((composition) => {
      const aspect = Number.isFinite(composition.aspect) && composition.aspect > 0 ? composition.aspect : 16 / 9;
      const expected = battingCameraFor(aspect, composition.layout, composition.safeArea);
      return JSON.stringify(frameAt(null, 100, { phase: "flight", ...composition }).camera) !== JSON.stringify(expected);
    });
    expect(mismatched).toHaveLength(0);
    const portrait = frameAt(null, 100, { phase: "flight", aspect: PORTRAIT_ASPECT, layout: "batting" }).camera;
    expect(portrait.lift).toBeGreaterThan(0);
    // v3: 縦長のカメラは x = 0 の正面(打者を左へ寄せるのはカメラではなく打者の位置)。
    expect(portrait.position.x).toBeCloseTo(WORLD_PARAMS.battingCameraPortrait.position.x, 12);
    expect(portrait.position.x).toBeCloseTo(0, 12);
  });

  it("無効な縦横比(NaN・0)は 16/9 とみなす", () => {
    const reference = frameAt(null, 100, { phase: "flight", aspect: 16 / 9 });
    expect(frameAt(null, 100, { phase: "flight", aspect: Number.NaN })).toEqual(reference);
    expect(frameAt(null, 100, { phase: "flight", aspect: 0 })).toEqual(reference);
    expect(frameAt(null, 100, { phase: "flight", aspect: -2 })).toEqual(reference);
  });

  it("縦長で接触後、blend の起点は接触前の camera(跳ばない)。blend 終了後の lift は 0(中継カメラは打撃の lift を引き継がない)", () => {
    const composition = { aspect: PORTRAIT_ASPECT, layout: "batting" as const, safeArea: PORTRAIT_SAFE_AREA };
    const before = frameAt(null, 100, { phase: "flight", ...composition }).camera;
    expect(before.lift).toBeGreaterThan(0);
    for (const plan of CHASE_PLANS) {
      expect(frameAt(plan, chaseFrom(plan), composition).camera).toEqual(before);
      expect(frameAt(plan, chaseFrom(plan) + 1500, composition).camera.lift).toBe(0);
      const lifts = [0, 100, 200, 300, 400, 500].map((since) => frameAt(plan, chaseFrom(plan) + since, composition).camera.lift);
      expect(lifts.every((lift, i) => i === 0 || lift <= (lifts.at(i - 1) ?? Number.POSITIVE_INFINITY) + 1e-12)).toBe(true);
    }
  });

  it("frame.layout は入力の layout、frame.safeArea は既定値で補った空き領域(無効・null は既定値)", () => {
    const fit = WORLD_PARAMS.framing.fit;
    expect(frameAt(null, 0, { phase: "flight", layout: "pitching", safeArea: PORTRAIT_SAFE_AREA }).layout).toBe("pitching");
    expect(frameAt(null, 0, { phase: "flight", layout: "batting" }).layout).toBe("batting");
    expect(frameAt(null, 0, { phase: "flight", safeArea: PORTRAIT_SAFE_AREA }).safeArea).toEqual(PORTRAIT_SAFE_AREA);
    expect(frameAt(null, 0, { phase: "flight", layout: "batting", safeArea: null }).safeArea).toEqual(fit.defaultSafeArea.batting);
    expect(frameAt(null, 0, { phase: "flight", layout: "pitching", safeArea: null }).safeArea).toEqual(fit.defaultSafeArea.pitching);
    const narrow = { top: 0.5, bottom: 0.5 + fit.minBandRatio / 2 };
    expect(frameAt(null, 0, { phase: "flight", layout: "pitching", safeArea: narrow }).safeArea).toEqual(fit.defaultSafeArea.pitching);
    const notFinite = { top: Number.NaN, bottom: 0.8 };
    expect(frameAt(null, 0, { phase: "flight", layout: "batting", safeArea: notFinite }).safeArea).toEqual(fit.defaultSafeArea.batting);
  });
});

describe("sceneFrameAt: 捕手の表示", () => {
  it("idle・windup・flight では非表示", () => {
    const visible = GRID_INPUTS.filter((input) => input.phase !== "play" && sceneFrameAt(input).catcher.visible);
    expect(visible).toHaveLength(0);
  });

  it("play・打球なし(空振り・見逃し)は打撃カメラのままなので非表示", () => {
    const visible = NO_CHASE_PLANS.flatMap((plan) => TIMES.filter((tMs) => frameAt(plan, tMs).catcher.visible));
    expect(visible).toHaveLength(0);
  });

  it("play・打球: 中継カメラへの移り具合(位置)が捕手表示のしきい値に達してから表示", () => {
    const threshold = WORLD_PARAMS.chaseCamera.catcherVisibleBlend;
    const wrong = CHASE_PLANS.flatMap((plan) =>
      TIMES.filter((tMs) => {
        const expected = tMs >= chaseFrom(plan) && chaseBlendAt(tMs - chaseFrom(plan)).position >= threshold;
        return frameAt(plan, tMs).catcher.visible !== expected;
      }),
    );
    expect(wrong).toHaveLength(0);
    expect(frameAt(SINGLE, chaseFrom(SINGLE)).catcher.visible).toBe(false);
    expect(frameAt(SINGLE, chaseFrom(SINGLE) + 2000).catcher.visible).toBe(true);
  });

  it("表示されるときの捕手は、捕手の位置・向き・ポーズ", () => {
    expect(frameAt(SINGLE, chaseFrom(SINGLE) + 2000).catcher).toEqual(placeCharacter(catcherPose(), ACTORS.catcher, true));
  });
});

describe("sceneFrameAt: ゾーン・カーソル・狙い", () => {
  it("zone.grid は入力に従う。zone.visible は中継カメラに移り始めるまで", () => {
    expect(frameAt(null, 100, { phase: "flight", grid: true }).zone).toEqual({ visible: true, grid: true, pulse: 0 });
    expect(frameAt(null, 100, { phase: "windup", grid: false }).zone).toEqual({ visible: true, grid: false, pulse: 0 });
    expect(frameAt(SINGLE, chaseFrom(SINGLE) - 1).zone.visible).toBe(true);
    expect(frameAt(SINGLE, chaseFrom(SINGLE)).zone.visible).toBe(false);
    expect(frameAt(MISS_HUMAN, 2000).zone.visible).toBe(true);
  });

  it("zone.pulse: D−20ms 前は 0、D−20ms から立ち上がり、D〜D+60ms は 1、D+260ms 以降は 0(zonePulseAt と一致)", () => {
    const { durationMs } = FLIGHT;
    const { leadMs, holdMs, fadeMs } = CUE.zonePulse;
    expect(zonePulseAt(durationMs, durationMs - leadMs - 1)).toBe(0);
    expect(zonePulseAt(durationMs, durationMs - leadMs)).toBe(0);
    expect(zonePulseAt(durationMs, durationMs - leadMs / 2)).toBeCloseTo(0.5, 9);
    expect(zonePulseAt(durationMs, durationMs)).toBe(1);
    expect(zonePulseAt(durationMs, durationMs + holdMs)).toBe(1);
    expect(zonePulseAt(durationMs, durationMs + holdMs + fadeMs / 2)).toBeCloseTo(0.5, 9);
    expect(zonePulseAt(durationMs, durationMs + holdMs + fadeMs)).toBe(0);
    expect(zonePulseAt(durationMs, durationMs + holdMs + fadeMs + 1000)).toBe(0);
    expect(durationMs + holdMs + fadeMs).toBe(durationMs + 260);
    const at = (tMs: number): number => frameAt(null, tMs, { phase: "flight" }).zone.pulse;
    expect([durationMs - 21, durationMs, durationMs + 60, durationMs + 260, durationMs + 500].map(at)).toEqual([0, 1, 1, 0, 0]);
  });

  it("zone.pulse は 0〜1 で、D の前後で連続に近く(1 ms の変化が小さい)、非有限の入力は 0", () => {
    const { durationMs } = FLIGHT;
    const values = Array.from({ length: 400 }, (_, i) => zonePulseAt(durationMs, durationMs - 50 + i));
    expect(values.every((value) => value >= 0 && value <= 1)).toBe(true);
    const steps = values.slice(1).map((value, i) => Math.abs(value - (values.at(i) ?? 0)));
    expect(Math.max(...steps)).toBeLessThanOrEqual(1 / CUE.zonePulse.leadMs + 1e-9);
    expect(zonePulseAt(durationMs, Number.NaN)).toBe(0);
    expect(zonePulseAt(Number.NaN, 100)).toBe(0);
  });

  it("zone.pulse は flight / play で投球があるときだけ。idle・windup・投球なし・ゾーン枠が消えた(中継カメラ)後は 0", () => {
    const tMs = FLIGHT.durationMs;
    expect(frameAt(null, tMs, { phase: "flight" }).zone.pulse).toBe(1);
    expect(frameAt(null, tMs, { phase: "play" }).zone.pulse).toBe(1);
    expect(frameAt(null, tMs, { phase: "idle" }).zone.pulse).toBe(0);
    expect(frameAt(null, tMs, { phase: "windup" }).zone.pulse).toBe(0);
    expect(frameAt(null, tMs, { phase: "flight", flight: null }).zone.pulse).toBe(0);
    const hidden = GRID_INPUTS.filter((input) => !sceneFrameAt(input).zone.visible && sceneFrameAt(input).zone.pulse !== 0);
    expect(hidden).toHaveLength(0);
  });

  it("zone.pulse は人間・CPU の plan があっても D を基準にする(plan の種別によらない)", () => {
    const wrong = ALL_PLANS.filter((plan) => frameAt(plan, FLIGHT.durationMs).zone.pulse !== (frameAt(plan, FLIGHT.durationMs).zone.visible ? 1 : 0));
    expect(wrong).toHaveLength(0);
  });

  it("cursor.visible は入力が真かつ中継カメラに移る前のみ", () => {
    const hidden = { visible: false, point: { x: 0, y: 0 }, raw: { x: 0, y: 0 }, radii: { rx: 0.5, ry: 0.3 } };
    expect(frameAt(SINGLE, chaseFrom(SINGLE) - 1).cursor.visible).toBe(true);
    expect(frameAt(SINGLE, chaseFrom(SINGLE)).cursor.visible).toBe(false);
    expect(frameAt(MISS_HUMAN, 2000).cursor.visible).toBe(true);
    expect(frameAt(null, 100, { phase: "flight" }).cursor.visible).toBe(true);
    const offInputs = GRID_INPUTS.filter((_input, i) => i % 7 === 0).map((input) => ({ ...input, cursor: hidden }));
    expect(offInputs.filter((input) => sceneFrameAt(input).cursor.visible)).toHaveLength(0);
  });

  it("cursor の位置はゾーン上の点、scaleX = rx × 0.26、scaleY = ry × 0.30(半径 m)", () => {
    const cursor = frameAt(null, 100, { phase: "flight" }).cursor;
    expect(cursor.position).toEqual(zoneToWorld({ x: 0.25, y: -0.4 }));
    expect(cursor.scaleX).toBeCloseTo(0.5 * 0.26, 12);
    expect(cursor.scaleY).toBeCloseTo(0.3 * 0.3, 12);
  });

  it("cursor.flash はスイング区間(振り始めから振り切りまで)のみ", () => {
    const swing = swingOf(SINGLE);
    const finish = swing.contactAtMs + (SWING.durationMs - SWING.contactMs);
    expect(frameAt(SINGLE, swing.startMs - 1).cursor.flash).toBe(false);
    expect(frameAt(SINGLE, swing.startMs).cursor.flash).toBe(false);
    expect(frameAt(SINGLE, swing.startMs + 1).cursor.flash).toBe(true);
    expect(frameAt(SINGLE, (swing.startMs + swing.contactAtMs) / 2).cursor.flash).toBe(true);
    expect(frameAt(SINGLE, finish - 1).cursor.flash).toBe(true);
    expect(frameAt(SINGLE, finish + 1).cursor.flash).toBe(false);
    expect(frameAt(null, 100, { phase: "flight" }).cursor.flash).toBe(false);
    expect(frameAt(TAKE, 700).cursor.flash).toBe(false);
  });

  it("旧 aim(狙いセルのハイライト)は SceneFrame に無い", () => {
    expect("aim" in frameAt(null, 100, { phase: "flight" })).toBe(false);
  });
});

describe("sceneFrameAt: cursor.raw(素のカーソルの印)", () => {
  const RAW_FAR = { x: -0.6, y: 0.5 };

  it("有効カーソルと離れているときだけ出す(同じ位置・ごく近い位置では出さない)。位置は素のカーソルのゾーン上の点", () => {
    const apart = frameAt(null, 100, { phase: "flight", cursor: { ...inputOf().cursor, raw: RAW_FAR } }).cursor;
    expect(apart.raw.visible).toBe(true);
    expect(apart.raw.position).toEqual(zoneToWorld(RAW_FAR));
    expect(apart.position).toEqual(zoneToWorld({ x: 0.25, y: -0.4 }));
    expect(frameAt(null, 100, { phase: "flight" }).cursor.raw.visible).toBe(false);
    const near = { x: 0.26, y: -0.4 };
    expect(frameAt(null, 100, { phase: "flight", cursor: { ...inputOf().cursor, raw: near } }).cursor.raw.visible).toBe(false);
  });

  it("カーソル自体が非表示、または中継カメラに移ったあとは出さない", () => {
    const base = inputOf().cursor;
    expect(frameAt(null, 100, { phase: "flight", cursor: { ...base, raw: RAW_FAR, visible: false } }).cursor.raw.visible).toBe(false);
    expect(frameAt(SINGLE, chaseFrom(SINGLE) - 1, { cursor: { ...base, raw: RAW_FAR } }).cursor.raw.visible).toBe(true);
    expect(frameAt(SINGLE, chaseFrom(SINGLE), { cursor: { ...base, raw: RAW_FAR } }).cursor.raw.visible).toBe(false);
  });
});

/** 打撃(人間)の予告。`preview` を差し替えたアシスト。 */
const assistWith = (preview: "exact" | "fade" | "none"): AssistParams => ({ ...HARD, preview, fadeRadius: 0.45, fadeJitter: 0.25 });

describe("sceneFrameAt: guide(打撃の予告・縮むリング)", () => {
  const D = FLIGHT.durationMs;
  const guideAt = (plan: PlayPlan | null, tMs: number, overrides: Partial<SceneFrameInput> = {}): SceneFrame["guide"] =>
    frameAt(plan, tMs, { phase: plan === null ? "flight" : "play", ...overrides }).guide;

  it("exact: リリースから D + holdMs まで可視で、点は flight.landing に厳密一致(plan が無い間・CPU・人間の空振りと見逃し)", () => {
    const plans: readonly (PlayPlan | null)[] = [null, MISS_CPU, TAKE, SINGLE, FOUL];
    const wrong = plans.flatMap((plan) =>
      TIMES.filter((tMs) => tMs >= 0 && tMs <= D + HOLD_MS).filter((tMs) => {
        const guide = guideAt(plan, tMs);
        return !(guide.visible && guide.mode === "exact" && JSON.stringify(guide.position) === JSON.stringify(zoneToWorld(FLIGHT.landing)));
      }),
    );
    expect(wrong).toEqual([]);
  });

  it("フェードイン 120ms 後は、不透明度 0.9 以上を D + holdMs まで保つ(受け入れ C3)", () => {
    const times = Array.from({ length: 200 }, (_, i) => GUIDE.fadeInMs + (i * (D + HOLD_MS - GUIDE.fadeInMs)) / 199);
    expect(times.filter((tMs) => guideAt(null, tMs).alpha < 0.9)).toEqual([]);
    expect(guideAt(null, 0).alpha).toBe(0);
  });

  it("リング半径は previewRingAt に一致(t = 0 で 0.30m、t = D で 0.125m)し、線幅は ringWidthFor(最終のカメラ)に一致する", () => {
    const at = (tMs: number): SceneFrame["guide"]["ring"] => guideAt(null, tMs).ring;
    expect(at(0).radius).toBeCloseTo(GUIDE.previewRing.startRadius, 9);
    expect(at(D).radius).toBeCloseTo(WORLD_PARAMS.ballRadius * GUIDE.previewRing.endRadiusRatio, 9);
    expect(at(D + 50).radius).toBeCloseTo(at(D).radius, 12);
    const battingCompositions = COMPOSITIONS.filter((composition) => composition.layout === "batting");
    expect(battingCompositions.length).toBeGreaterThanOrEqual(3);
    const wrong = battingCompositions.filter((composition) => {
      const frame = frameAt(null, 200, { phase: "flight", ...composition });
      const expected = ringWidthFor(frame.camera, zoneToWorld(FLIGHT.landing), GUIDE.ringWidthRatio);
      return !(frame.guide.ring.visible && frame.guide.ring.tone === "preview" && Math.abs(frame.guide.ring.width - expected) < 1e-12 && expected > 0);
    });
    expect(wrong.map((composition) => composition.aspect)).toEqual([]);
    const radii = [0, 100, 200, 300, 400, D].map((tMs) => at(tMs).radius);
    expect(radii.every((radius, i) => i === 0 || radius < (radii.at(i - 1) ?? 0))).toBe(true);
  });

  it("fade: 円の中心は previewCenterOf(決定論)で、円は真の着弾点を含む。none: 点も円も出さずリングだけ出す", () => {
    const fade = guideAt(null, 300, { assist: assistWith("fade") });
    const center = previewCenterOf(assistWith("fade"), FLIGHT.landing, FLIGHT.seq);
    expect(fade.mode).toBe("fade");
    expect(fade.position).toEqual(zoneToWorld(center));
    const landing = zoneToWorld(FLIGHT.landing);
    expect(Math.hypot(fade.position.x - landing.x, fade.position.y - landing.y)).toBeLessThanOrEqual(fade.fadeRadius + 1e-12);
    expect(guideAt(null, 300, { assist: assistWith("fade") })).toEqual(fade);
    const none = guideAt(null, 300, { assist: assistWith("none") });
    expect(none).toMatchObject({ visible: true, mode: "none", markerRadius: 0, fadeRadius: 0 });
    expect(none.ring.visible).toBe(true);
  });

  it("接触なしの plan では、ボールが消える時刻(ballHoldUntilMs)まで残り、その後は消える(受付が遅い人間の空振り・見逃しを含む)", () => {
    for (const plan of [MISS_HUMAN, MISS_CPU, TAKE, TAKE_HUMAN]) {
      expect(guideAt(plan, plan.ballHoldUntilMs).visible).toBe(true);
      expect(guideAt(plan, plan.ballHoldUntilMs + 1).visible).toBe(false);
    }
    expect(TAKE_HUMAN.ballHoldUntilMs).toBeGreaterThan(D + HOLD_MS);
  });

  it("plan が無い間(人間の判定待ち)と接触ありは、どちらも D + holdMs で消える(接触が早くても D + holdMs までは残る)", () => {
    expect(guideAt(null, D + HOLD_MS).visible).toBe(true);
    expect(guideAt(null, D + HOLD_MS + 1).visible).toBe(false);
    for (const plan of CHASE_PLANS) {
      expect(guideAt(plan, D + HOLD_MS).visible).toBe(true);
      expect(guideAt(plan, D + HOLD_MS + 1).visible).toBe(false);
      expect(guideAt(plan, plan.ballHoldUntilMs + 500).visible).toBe(false);
    }
  });

  it("idle・windup・投球なし・守備のレイアウト(pitching)では出ない。全入力でリングの半径・線幅は有限", () => {
    const shown = GRID_INPUTS.filter((input) => {
      const guide = sceneFrameAt(input).guide;
      return guide.visible && (input.phase === "idle" || input.phase === "windup" || input.flight === null);
    });
    expect(shown).toHaveLength(0);
    expect(guideAt(null, 300, { layout: "pitching" }).visible).toBe(false);
    expect(frameAt(null, 300, { phase: "flight", flight: null }).guide.visible).toBe(false);
    expect([...GRID_INPUTS, ...COMPOSED_INPUTS].filter((input) => !numbersIn(sceneFrameAt(input).guide).every(Number.isFinite))).toHaveLength(0);
  });
});

describe("sceneFrameAt: ball の見え方(回転・ハロー・縁取り)", () => {
  const SLIDER: PitchFlight = { ...FLIGHT, kind: "slider" };
  const FORK: PitchFlight = { ...FLIGHT, kind: "fork" };
  const ballOf = (tMs: number, flight: PitchFlight): SceneFrame["ball"] => frameAt(null, tMs, { phase: "flight", flight }).ball;

  it("rotation は球種ごとの回転 ballSpinAt(kind, t)。到達後(着弾点で待つ間)は止まり、球種で異なる", () => {
    expect(ballOf(200, FLIGHT).rotation).toEqual(ballSpinAt("straight", 200));
    expect(ballOf(200, SLIDER).rotation).toEqual(ballSpinAt("slider", 200));
    expect(ballOf(FLIGHT.durationMs + 50, FLIGHT).rotation).toEqual(ballSpinAt("straight", FLIGHT.durationMs));
    expect(ballOf(300, SLIDER).rotation).not.toEqual(ballOf(300, FORK).rotation);
    expect(ballOf(0, FLIGHT).rotation).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("rotation は接触の瞬間に連続する(接触前は D で止まり、接触後は D から進む)", () => {
    const contactMs = SINGLE.contactMs ?? Number.NaN;
    const before = frameAt(SINGLE, contactMs - 1).ball.rotation;
    const at = frameAt(SINGLE, contactMs).ball.rotation;
    expect(at).toEqual(ballSpinAt("straight", FLIGHT.durationMs));
    expect(before).toEqual(at);
    expect(frameAt(SINGLE, contactMs + 100).ball.rotation).toEqual(ballSpinAt("straight", FLIGHT.durationMs + 100));
  });

  it("halo は常に > 0(WORLD_PARAMS.ball.halo.opacity)。outlineScale は outlineScaleFor(最終のカメラ, 位置, scale)で 1.12 以上", () => {
    const wrong = [...GRID_INPUTS, ...COMPOSED_INPUTS].filter((input) => {
      const frame = sceneFrameAt(input);
      const position = frame.ball.visible ? frame.ball.position : RELEASE_POINT;
      const expected = outlineScaleFor(frame.camera, position, frame.ball.scale);
      return !(frame.ball.halo === BALL.halo.opacity && frame.ball.halo > 0 && frame.ball.outlineScale === expected && expected >= 1.12);
    });
    expect(wrong).toHaveLength(0);
  });
});

describe("sceneFrameAt: 投手", () => {
  it("idle は待機姿勢、windup は windupU のポーズ、flight・play はリリースからのフォロースルー", () => {
    const place = (joints: ReturnType<typeof pitcherWindupPose>): SceneFrame["pitcher"] => placeCharacter(joints, ACTORS.pitcher);
    expect(frameAt(null, 0, { phase: "idle" }).pitcher).toEqual(place(pitcherWindupPose(0)));
    expect(frameAt(null, 0, { phase: "windup", windupU: 0.4 }).pitcher).toEqual(place(pitcherWindupPose(0.4)));
    expect(frameAt(null, 120, { phase: "flight" }).pitcher).toEqual(place(pitcherFollowPose(120)));
    expect(frameAt(SINGLE, 300).pitcher).toEqual(place(pitcherFollowPose(300)));
  });

  it("連続性: windup の u = 1 とリリース直後(flight, t = 0)の投手が一致する", () => {
    expect(frameAt(null, 0, { phase: "windup", windupU: 1 }).pitcher).toEqual(frameAt(null, 0, { phase: "flight" }).pitcher);
  });
});

/** ワールドでのバットの高さ(m)。バットは打者の root の子なので、足元の y に「拡大率 × ローカルの高さ」を足した値になる。 */
function worldBatHeight(pose: SceneFrame["batter"]): number {
  return pose.position.y + pose.scale * pose.bat.height;
}

/**
 * 打者が motion の `joints` どおりに配置されている: バットの高さ・長さ以外は `placeBatter(joints, batterRootFor(aspect))` と一致し、
 * バット軸の長さは `batLengthScaleFor(aspect)`、バットのワールドでの高さ(root の位置と拡大率を考慮)は motion が意図した高さ(`joints.bat.height`)と一致する。
 */
function expectBatterAt(actual: SceneFrame["batter"], joints: BatterJoints, aspect = 16 / 9): void {
  const withoutHeight = (pose: SceneFrame["batter"]): SceneFrame["batter"] => ({ ...pose, bat: { ...pose.bat, height: 0, lengthScale: 1 } });
  expect(withoutHeight(actual)).toEqual(withoutHeight(placeBatter(joints, batterRootFor(aspect))));
  expect(actual.bat.lengthScale).toBe(batLengthScaleFor(aspect));
  expect(worldBatHeight(actual)).toBeCloseTo(joints.bat.height, 9);
}

describe("sceneFrameAt: 打者", () => {
  it("plan が無い、または振らない(見逃し)ときは構え", () => {
    expectBatterAt(frameAt(null, 100, { phase: "flight" }).batter, batterStancePose());
    expectBatterAt(frameAt(TAKE, 700).batter, batterStancePose());
    expectBatterAt(frameAt(null, 0, { phase: "windup" }).batter, batterStancePose());
  });

  it("スイング: swingProgressAt の進行でポーズが決まり、接触で 0.66、振り切りで 1.4", () => {
    const swing = swingOf(SINGLE);
    const poseAt = (tMs: number): BatterJoints => batterSwingPose(swingProgressAt(swing, tMs), swing.height);
    expectBatterAt(frameAt(SINGLE, swing.contactAtMs).batter, poseAt(swing.contactAtMs));
    expectBatterAt(frameAt(SINGLE, swing.contactAtMs).batter, batterSwingPose(SWING.contactRatio, swing.height));
    expectBatterAt(frameAt(SINGLE, swing.contactAtMs + 3000).batter, batterSwingPose(SWING.followEndProgress, swing.height));
    expectBatterAt(frameAt(SINGLE, swing.startMs - 10).batter, batterStancePose());
  });

  it("接触の瞬間のバットの高さは(ワールドで)swing.height", () => {
    const swing = swingOf(SINGLE);
    expect(worldBatHeight(frameAt(SINGLE, swing.contactAtMs).batter)).toBeCloseTo(swing.height, 9);
    expect(near(swing.height, zoneToWorld(FLIGHT.landing).y)).toBe(true);
  });

  it("打者の拡大率と足元の y を打ち消す: frame のバット高さは (ワールドの高さ − y) / 補間後の拡大率(打者ローカルの値。縦長は 0.70)", () => {
    const swing = swingOf(SINGLE);
    for (const aspect of [16 / 9, 1, 0.85, PORTRAIT_ASPECT]) {
      const expectLocal = (worldHeight: number): number => (worldHeight - ACTORS.batter.position.y) / batterRootFor(aspect).scale;
      expect(frameAt(SINGLE, swing.contactAtMs, { aspect }).batter.bat.height).toBeCloseTo(expectLocal(swing.height), 9);
      expect(frameAt(null, 0, { phase: "windup", aspect }).batter.bat.height).toBeCloseTo(expectLocal(BAT_STANCE_HEIGHT), 9);
    }
  });

  it("縦横比の補間域(縦長〜横長の全域)で、接触の瞬間のバットの高さはボール(着弾点)の高さと一致する(受け入れ A5)", () => {
    const swing = swingOf(SINGLE);
    const aspects = Array.from({ length: 40 }, (_, i) => 0.3 + (i * (2 - 0.3)) / 39);
    const wrong = aspects.filter(
      (aspect) => Math.abs(worldBatHeight(frameAt(SINGLE, swing.contactAtMs, { aspect }).batter) - zoneToWorld(FLIGHT.landing).y) > 1e-9,
    );
    expect(wrong).toEqual([]);
  });

  it("構え(ワールドで BAT_STANCE_HEIGHT)・接触(swing.height)・振り切り(swing.height + BAT_FOLLOW_LIFT)の高さが、打者の拡大率によらず意図どおり", () => {
    for (const plan of ALL_PLANS.filter((candidate) => candidate.swing !== null)) {
      const swing = swingOf(plan);
      expect(worldBatHeight(frameAt(plan, swing.startMs - 10).batter)).toBeCloseTo(BAT_STANCE_HEIGHT, 9);
      expect(worldBatHeight(frameAt(plan, swing.contactAtMs).batter)).toBeCloseTo(swing.height, 9);
      expect(worldBatHeight(frameAt(plan, swing.contactAtMs + 3000).batter)).toBeCloseTo(swing.height + BAT_FOLLOW_LIFT, 9);
    }
  });

  it("全 plan・全時刻で、バットのワールドでの高さは motion が意図した高さ(batterSwingPose の bat.height)と一致する", () => {
    for (const plan of ALL_PLANS) {
      const swing = plan.swing;
      for (const tMs of TIMES) {
        const joints = swing === null ? batterStancePose() : batterSwingPose(swingProgressAt(swing, tMs), swing.height);
        expect(worldBatHeight(frameAt(plan, tMs).batter)).toBeCloseTo(joints.bat.height, 9);
      }
    }
  });

  it("打者は常に表示", () => {
    const hidden = GRID_INPUTS.filter((input) => !sceneFrameAt(input).batter.visible);
    expect(hidden).toHaveLength(0);
  });

  it("打者の足元・拡大率・向きは batterRootFor(aspect)、バット軸の長さは batLengthScaleFor(aspect)。y・z・向きは不変", () => {
    const { position, yaw } = ACTORS.batter;
    const aspects = [16 / 9, 1.2, 1, 0.9, 0.8, 0.75, 0.7, PORTRAIT_ASPECT, 0.3];
    const wrong = aspects.filter((aspect) => {
      const batter = frameAt(null, 100, { phase: "flight", aspect }).batter;
      const root = batterRootFor(aspect);
      return (
        JSON.stringify(batter.position) !== JSON.stringify(root.position) ||
        batter.scale !== root.scale ||
        batter.position.y !== position.y ||
        batter.position.z !== position.z ||
        batter.yaw !== yaw ||
        batter.bat.lengthScale !== batLengthScaleFor(aspect)
      );
    });
    expect(wrong).toEqual([]);
  });

  it("横長(k = 0)は v2 と同値(x −0.8・拡大率 0.92・バット 1.0)、縦長(k = 1)は v3(x −0.65・拡大率 0.70・バット 1.35)。x は縦横比の補間で単調に動く", () => {
    const { position, portraitX, scale, portraitScale, batLength, portraitBatLength } = ACTORS.batter;
    const landscape = frameAt(null, 100, { phase: "flight", aspect: 16 / 9 }).batter;
    const portrait = frameAt(null, 100, { phase: "flight", aspect: PORTRAIT_ASPECT }).batter;
    expect([landscape.position.x, landscape.scale, landscape.bat.lengthScale]).toEqual([position.x, scale, batLength]);
    expect([portrait.position.x, portrait.scale, portrait.bat.lengthScale]).toEqual([portraitX, portraitScale, portraitBatLength]);
    const aspects = [16 / 9, 1.2, 1, 0.9, 0.8, 0.75, 0.7, PORTRAIT_ASPECT, 0.3];
    const batters = aspects.map((aspect) => frameAt(null, 100, { phase: "flight", aspect }).batter);
    const monotone = (values: readonly number[], sign: 1 | -1): boolean =>
      values.every((value, i) => i === 0 || sign * (value - (values.at(i - 1) ?? 0)) >= -1e-12);
    expect(
      monotone(
        batters.map((batter) => batter.position.x),
        1,
      ),
    ).toBe(true);
    expect(
      monotone(
        batters.map((batter) => batter.scale),
        -1,
      ),
    ).toBe(true);
    expect(
      monotone(
        batters.map((batter) => batter.bat.lengthScale),
        1,
      ),
    ).toBe(true);
  });

  it("スイング中も打者の足元・拡大率・バット軸の長さは縦長の値(バットの高さの補正は補間後の拡大率で行う)", () => {
    const swing = swingOf(SINGLE);
    const portrait = frameAt(SINGLE, swing.contactAtMs, { aspect: PORTRAIT_ASPECT }).batter;
    expect(portrait.position.x).toBe(ACTORS.batter.portraitX);
    expect(portrait.scale).toBe(ACTORS.batter.portraitScale);
    expect(portrait.bat.lengthScale).toBe(ACTORS.batter.portraitBatLength);
    expect(worldBatHeight(portrait)).toBeCloseTo(swing.height, 9);
  });

  describe("縦長の構え(縦横比の補間 k で混ざる)", () => {
    const ASPECTS = [16 / 9, 1.2, 1, 0.9, 0.8, 0.75, 0.7, PORTRAIT_ASPECT, 0.3];

    /** 関節とバットの角度(位置・高さを除く)。 */
    function anglesOf(pose: BatterJoints): readonly number[] {
      return numbersIn([pose.torso, pose.head, pose.armL, pose.armR, pose.legL, pose.legR, pose.bat.sweepYaw, pose.bat.tilt]);
    }

    it("構え(plan なし・見逃し)の関節は batterStancePose(k)(k = portraitBlendAt(aspect))。横長は従来の構えと完全に一致する", () => {
      for (const aspect of ASPECTS) {
        const k = portraitBlendAt(aspect);
        expect(anglesOf(frameAt(null, 100, { phase: "flight", aspect }).batter)).toEqual(anglesOf(batterStancePose(k)));
        expect(anglesOf(frameAt(TAKE, 700, { aspect }).batter)).toEqual(anglesOf(batterStancePose(k)));
      }
      expect(anglesOf(frameAt(null, 100, { phase: "flight", aspect: 16 / 9 }).batter)).toEqual(anglesOf(batterStancePose()));
      expect(anglesOf(frameAt(null, 100, { phase: "flight", aspect: PORTRAIT_ASPECT }).batter)).toEqual(anglesOf(batterStancePose(1)));
      expect(anglesOf(frameAt(null, 100, { phase: "flight", aspect: PORTRAIT_ASPECT }).batter)).not.toEqual(anglesOf(batterStancePose()));
    });

    it("スイング中の関節は batterSwingPose(progress, height, k)。接触の瞬間(と接触以降)は縦長でも横長と同じ姿勢", () => {
      const swing = swingOf(SINGLE);
      for (const aspect of ASPECTS) {
        const k = portraitBlendAt(aspect);
        for (const tMs of [swing.startMs, swing.startMs + 40, swing.contactAtMs - 20, swing.contactAtMs, swing.contactAtMs + 3000]) {
          const joints = batterSwingPose(swingProgressAt(swing, tMs), swing.height, k);
          expect(anglesOf(frameAt(SINGLE, tMs, { aspect }).batter)).toEqual(anglesOf(joints));
        }
        const contact = anglesOf(frameAt(SINGLE, swing.contactAtMs, { aspect }).batter);
        const landscape = anglesOf(batterSwingPose(SWING.contactRatio, swing.height));
        contact.forEach((angle, index) => expect(angle).toBeCloseTo(landscape.at(index) ?? Number.NaN, 12));
      }
    });
  });
});

describe("sceneFrameAt: 落下点のリング(landingMark)", () => {
  const { startAfterContactMs, endAfterLandMs, y, minRadius } = LANDING_MARK;
  const AERIAL_PLANS: readonly PlayPlan[] = [SINGLE, FOUL, LINEOUT];
  const NOT_MARKED_PLANS: readonly PlayPlan[] = [HOMERUN, GROUNDOUT, ...NO_CHASE_PLANS];

  function markOf(plan: PlayPlan, tMs: number, overrides: Partial<SceneFrameInput> = {}): SceneFrame["landingMark"] {
    return frameAt(plan, tMs, overrides).landingMark;
  }

  it("フライ・ライナー(ファウルの飛球を含む)で、接触 +200ms から落下 +400ms まで出る", () => {
    const wrong = AERIAL_PLANS.filter((plan) => {
      const contactMs = plan.contactMs ?? Number.NaN;
      const landMs = contactMs + battedOf(plan).hangMs;
      return (
        markOf(plan, contactMs + startAfterContactMs - 1).visible ||
        !markOf(plan, contactMs + startAfterContactMs).visible ||
        !markOf(plan, landMs).visible ||
        !markOf(plan, landMs + endAfterLandMs).visible ||
        markOf(plan, landMs + endAfterLandMs + 1).visible
      );
    });
    expect(wrong).toHaveLength(0);
    expect(LINEOUT.batted?.shape).toBe("liner");
    expect(FOUL.batted?.shape).toBe("fly");
  });

  it("ホームラン・ゴロ・打球なし(空振り・見逃し)では出ない", () => {
    const shown = NOT_MARKED_PLANS.flatMap((plan) => TIMES.filter((tMs) => markOf(plan, tMs).visible));
    expect(shown).toHaveLength(0);
    expect(HOMERUN.batted?.overFence).toBe(true);
    expect(GROUNDOUT.batted?.shape).toBe("ground");
  });

  it("idle・windup・flight(plan が使われない phase)では出ない", () => {
    const shown = GRID_INPUTS.filter((input) => input.phase !== "play" && sceneFrameAt(input).landingMark.visible);
    expect(shown).toHaveLength(0);
  });

  it("位置は打球の終点の地面(x・z は batted.end、y は landingMark.y)", () => {
    const wrong = AERIAL_PLANS.filter((plan) => {
      const end = battedOf(plan).end;
      const mark = markOf(plan, (plan.contactMs ?? 0) + 600);
      return !(mark.visible && mark.position.x === end.x && mark.position.z === end.z && mark.position.y === y);
    });
    expect(wrong).toHaveLength(0);
  });

  it("半径は minRadius 以上で、画面の表示高の screenRatio 相当(最終のカメラから計算)と minRadius の大きい方", () => {
    const wrong = COMPOSITIONS.flatMap((composition) =>
      AERIAL_PLANS.filter((plan) => {
        const frame = frameAt(plan, (plan.contactMs ?? 0) + 600, composition);
        const mark = frame.landingMark;
        const dist = distance(mark.position, frame.camera.position);
        const expected = Math.max(minRadius, LANDING_MARK.screenRatio * 2 * dist * Math.tan((frame.camera.fovDeg * Math.PI) / 360));
        return !(mark.visible && mark.radius >= minRadius && Math.abs(mark.radius - expected) < 1e-9);
      }),
    );
    expect(wrong).toHaveLength(0);
  });

  it("出ていないときの radius は 0(位置は有限)", () => {
    const mark = markOf(HOMERUN, 0);
    expect(mark.visible).toBe(false);
    expect(mark.radius).toBe(0);
    expect(Number.isFinite(mark.position.x) && Number.isFinite(mark.position.y) && Number.isFinite(mark.position.z)).toBe(true);
  });
});

describe("sceneFrameAt: 野手", () => {
  const run = SINGLE.fielder;
  const slotPosition = (index: number): Vec3 => FIELDER_SLOTS.at(index)?.position ?? RELEASE_POINT;

  it("固定順 7 人、idle・windup・flight では全員が守備位置で待機姿勢(向きは正面 = 0)", () => {
    const frame = frameAt(null, 100, { phase: "flight" });
    expect(frame.fielders).toHaveLength(7);
    const expected = FIELDER_SLOTS.map((slot) => placeCharacter(fielderIdlePose(), { position: slot.position, yaw: 0, scale: ACTORS.fielderScale }));
    expect(frame.fielders).toEqual(expected);
  });

  it("インプレー: 最寄りの 1 人だけが走り、他は守備位置でボールの方を向く", () => {
    expect(run).not.toBeNull();
    const index = run?.index ?? -1;
    const tMs = (run?.startMs ?? 0) + 200;
    const frame = frameAt(SINGLE, tMs);
    const ball = battedBallAt(battedOf(SINGLE), tMs - (SINGLE.contactMs ?? 0));
    const others = frame.fielders.filter((_fielder, i) => i !== index);
    expect(others.map((fielder) => fielder.position)).toEqual(FIELDER_SLOTS.filter((_slot, i) => i !== index).map((slot) => slot.position));
    expect(others.every((fielder) => near(fielder.yaw, Math.atan2(ball.x - fielder.position.x, ball.z - fielder.position.z)))).toBe(true);
    expect(frame.fielders.at(index)?.position).not.toEqual(slotPosition(index));
  });

  it("走る野手: 接触で守備位置、滞空 × runFactor で目的地に着き、以降はそこで待機姿勢", () => {
    const index = run?.index ?? -1;
    const startMs = run?.startMs ?? 0;
    const arriveMs = run?.arriveMs ?? 0;
    expect(frameAt(SINGLE, startMs).fielders.at(index)?.position).toEqual(run?.from);
    expect(frameAt(SINGLE, (startMs + arriveMs) / 2).fielders.at(index)?.position).toEqual(lerpVec3(run?.from ?? RELEASE_POINT, run?.to ?? RELEASE_POINT, 0.5));
    const arrived = frameAt(SINGLE, arriveMs + 500).fielders.at(index);
    expect(arrived?.position).toEqual(run?.to);
    expect(arrived?.torso).toEqual(fielderIdlePose().torso);
    expect(arrived?.legL).toEqual(fielderIdlePose().legL);
  });

  it("走る野手の向きは目的地の方向", () => {
    const index = run?.index ?? -1;
    const from = run?.from ?? RELEASE_POINT;
    const to = run?.to ?? RELEASE_POINT;
    const yaw = frameAt(SINGLE, (run?.startMs ?? 0) + 100).fielders.at(index)?.yaw ?? Number.NaN;
    expect(yaw).toBeCloseTo(Math.atan2(to.x - from.x, to.z - from.z), 12);
  });

  it("ホームラン・ファウルでは誰も走らない(全員が守備位置のまま)", () => {
    const moved = [HOMERUN, FOUL].flatMap((plan) =>
      TIMES.filter((tMs) => frameAt(plan, tMs).fielders.some((fielder, i) => JSON.stringify(fielder.position) !== JSON.stringify(slotPosition(i)))),
    );
    expect(moved).toHaveLength(0);
  });
});
