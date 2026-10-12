import { describe, expect, it } from "vitest";
import type { BattedBall, InPlayResult, SwingInput } from "../../../types/batting";
import type { PitchFlight } from "../../../types/pitch";
import type { CameraPose, SceneFrame, ScenePhase, UniformColors, Vec3 } from "../../../types/scene";
import type { PitchOutcomeView } from "../../../types/view";
import { battingCamera, blendCamera, chaseBlendAt, chaseCamera } from "../camera/rig";
import { batterStancePose, batterSwingPose } from "../motion/batter";
import { catcherPose, fielderIdlePose } from "../motion/fielder";
import { pitcherFollowPose, pitcherWindupPose } from "../motion/pitcher";
import { type BatterJoints, placeBatter, placeCharacter } from "../motion/pose";
import { BAT_FOLLOW_LIFT, BAT_STANCE_HEIGHT } from "../motion/rig";
import { type BattedPlan, battedBallAt } from "../path/batted-path";
import { FIELDER_SLOTS } from "../path/fielders";
import { mittBallAt, pitchBallAt } from "../path/pitch-path";
import { cellToWorld, zoneToWorld } from "../space/coords";
import { CPU_SWING_LEAD_MS, RELEASE_POINT, WORLD_PARAMS } from "../space/params";
import { lerpVec3 } from "../space/vec3";
import { type SceneFrameInput, sceneFrameAt } from "./frame";
import { type PlayPlan, planPlay, swingProgressAt } from "./play-plan";

const ACTORS = WORLD_PARAMS.actors;
const SWING = WORLD_PARAMS.swing;

const UNIFORMS_A: UniformColors = { offense: 0x2f63c8, defense: 0xe8473c };
const UNIFORMS_B: UniformColors = { offense: 0xe8473c, defense: 0x2f63c8 };

const FLIGHT: PitchFlight = { seq: 7, kind: "straight", aim: { x: 0.2, y: 0.1 }, landing: { x: 0.2, y: 0.1 }, speedKmh: 140, durationMs: 480 };
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

const CHASE_PLANS: readonly PlayPlan[] = [SINGLE, HOMERUN, GROUNDOUT, FOUL];
const NO_CHASE_PLANS: readonly PlayPlan[] = [MISS_HUMAN, MISS_CPU, TAKE];
const ALL_PLANS: readonly PlayPlan[] = [...CHASE_PLANS, ...NO_CHASE_PLANS];
const PHASES: readonly ScenePhase[] = ["idle", "windup", "flight", "play"];

function inputOf(overrides: Partial<SceneFrameInput> = {}): SceneFrameInput {
  return {
    phase: "play",
    tMs: 0,
    windupU: 0.5,
    flight: FLIGHT,
    plan: null,
    uniforms: UNIFORMS_A,
    cursor: { visible: true, point: { x: 0.25, y: -0.4 }, radii: { rx: 0.5, ry: 0.3 } },
    aim: { col: 1, row: 3 },
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

  it("全数値が有限で、fielders は 7 人", () => {
    const broken = GRID_INPUTS.filter((input) => {
      const frame = sceneFrameAt(input);
      return frame.fielders.length !== 7 || !numbersIn(frame).every(Number.isFinite);
    });
    expect(broken.slice(0, 3).map((input) => `${input.phase}/t${input.tMs}`)).toEqual([]);
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

  it("flight: リリース直後はリリース点、durationMs までは pitchBallAt、以降は mittBallAt", () => {
    const at = (tMs: number): SceneFrame["ball"] => frameAt(null, tMs, { phase: "flight" }).ball;
    expect(at(0)).toEqual({ visible: true, position: RELEASE_POINT });
    expect(at(200)).toEqual({ visible: true, position: pitchBallAt(FLIGHT, 200) });
    expect(at(FLIGHT.durationMs).position).toEqual(zoneToWorld(FLIGHT.landing));
    expect(at(FLIGHT.durationMs + 80)).toEqual({ visible: true, position: mittBallAt(FLIGHT, 80) });
    expect(at(FLIGHT.durationMs + 1000).position).toEqual(mittBallAt(FLIGHT, 1000));
  });

  it("flight が無ければ(play で打球が始まる前)非表示", () => {
    expect(frameAt(SINGLE, 100, { flight: null }).ball.visible).toBe(false);
    expect(frameAt(SINGLE, 100, { flight: null, phase: "flight", plan: null }).ball.visible).toBe(false);
  });

  it("play・インプレー: 接触前は投球の軌道(遅いクリックの判定待ちはミットへ)、接触から打球、落下後は終点で止まる", () => {
    const batted = battedOf(SINGLE);
    expect(SINGLE.contactMs).toBeGreaterThan(FLIGHT.durationMs);
    const plan = swingOf(SINGLE);
    expect(frameAt(SINGLE, 300).ball.position).toEqual(pitchBallAt(FLIGHT, 300));
    expect(frameAt(SINGLE, FLIGHT.durationMs + 20).ball.position).toEqual(mittBallAt(FLIGHT, 20));
    expect(frameAt(SINGLE, plan.contactAtMs).ball.position).toEqual(batted.start);
    expect(frameAt(SINGLE, plan.contactAtMs + 300).ball.position).toEqual(battedBallAt(batted, 300));
    const landed = plan.contactAtMs + batted.hangMs;
    expect(frameAt(SINGLE, landed).ball.position).toEqual(batted.end);
    expect(frameAt(SINGLE, landed + 2000).ball.position).toEqual(batted.end);
  });

  it("play・インプレー: flight が無くても接触後は打球を表示する", () => {
    const plan = swingOf(SINGLE);
    expect(frameAt(SINGLE, plan.contactAtMs + 100, { flight: null }).ball).toEqual({
      visible: true,
      position: battedBallAt(battedOf(SINGLE), 100),
    });
  });

  it("play・空振り・見逃し: 終了までミットへ進んで止まる", () => {
    expect(frameAt(MISS_HUMAN, FLIGHT.durationMs + 400).ball.position).toEqual(mittBallAt(FLIGHT, 400));
    expect(frameAt(TAKE, FLIGHT.durationMs + 1000).ball.position).toEqual(mittBallAt(FLIGHT, 1000));
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
    "play・打球 #%d: chaseFromMs 以降は blendCamera(打撃, 中継, 位置の割合, 注視点の割合)",
    (_i, plan) => {
      const batted = battedOf(plan);
      const times = [0, 50, 125, 250, 400, 500, 800, 1500].map((since) => chaseFrom(plan) + since);
      const mismatched = times.filter((tMs) => {
        const ball = battedBallAt(batted, tMs - (plan.contactMs ?? 0));
        const blend = chaseBlendAt(tMs - chaseFrom(plan));
        const expected: CameraPose = blendCamera(battingCamera(), chaseCamera(ball), blend.position, blend.target);
        return JSON.stringify(frameAt(plan, tMs).camera) !== JSON.stringify(expected);
      });
      expect(mismatched).toEqual([]);
    },
  );

  it("play・打球: chaseFromMs より前は打撃カメラ、ちょうどの時刻は打撃カメラと一致(切り替わりで飛ばない)", () => {
    const moved = CHASE_PLANS.filter(
      (plan) =>
        JSON.stringify(frameAt(plan, chaseFrom(plan) - 1).camera) !== JSON.stringify(battingCamera()) ||
        JSON.stringify(frameAt(plan, chaseFrom(plan)).camera) !== JSON.stringify(battingCamera()),
    );
    expect(moved).toHaveLength(0);
  });

  it("play・打球: 16ms 間のカメラ位置の移動は 1.5m 以下(接触から落下後 1 秒まで)", () => {
    const jumps = CHASE_PLANS.flatMap((plan) => {
      const end = chaseFrom(plan) + battedOf(plan).hangMs + 1000;
      const steps = Array.from({ length: Math.floor((end - chaseFrom(plan)) / 16) }, (_, i) => chaseFrom(plan) + i * 16);
      return steps.filter((tMs) => distance(frameAt(plan, tMs).camera.position, frameAt(plan, tMs + 16).camera.position) > 1.5);
    });
    expect(jumps).toHaveLength(0);
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
    expect(frameAt(null, 100, { phase: "flight", grid: true }).zone).toEqual({ visible: true, grid: true });
    expect(frameAt(null, 100, { phase: "windup", grid: false }).zone).toEqual({ visible: true, grid: false });
    expect(frameAt(SINGLE, chaseFrom(SINGLE) - 1).zone.visible).toBe(true);
    expect(frameAt(SINGLE, chaseFrom(SINGLE)).zone.visible).toBe(false);
    expect(frameAt(MISS_HUMAN, 2000).zone.visible).toBe(true);
  });

  it("cursor.visible は入力が真かつ中継カメラに移る前のみ", () => {
    const hidden = { visible: false, point: { x: 0, y: 0 }, radii: { rx: 0.5, ry: 0.3 } };
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

  it("aim: visible は aim の入力があるときのみ。position は cellToWorld、幅・高さは (2/3) × 0.26・(2/3) × 0.30", () => {
    const aim = frameAt(null, 0, { phase: "windup", aim: { col: 1, row: 3 } }).aim;
    expect(aim.visible).toBe(true);
    expect(aim.position).toEqual(cellToWorld({ col: 1, row: 3 }));
    expect(aim.width).toBeCloseTo((2 / 3) * 0.26, 12);
    expect(aim.height).toBeCloseTo((2 / 3) * 0.3, 12);
    const none = frameAt(null, 0, { phase: "windup", aim: null }).aim;
    expect(none.visible).toBe(false);
    expect(Number.isFinite(none.width) && Number.isFinite(none.position.x)).toBe(true);
  });

  it("aim は入力が無ければ、どの phase・時刻でも非表示。中継カメラに移ったあとはゾーンと一緒に消える", () => {
    const shown = GRID_INPUTS.filter((input) => sceneFrameAt({ ...input, aim: null }).aim.visible);
    expect(shown).toHaveLength(0);
    expect(frameAt(SINGLE, chaseFrom(SINGLE) - 1).aim.visible).toBe(true);
    expect(frameAt(SINGLE, chaseFrom(SINGLE) + 100).aim.visible).toBe(false);
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
 * 打者が motion の `joints` どおりに配置されている: バットの高さ以外は `placeBatter(joints, ACTORS.batter)` と一致し、
 * バットのワールドでの高さ(root の位置と拡大率を考慮)は motion が意図した高さ(`joints.bat.height`)と一致する。
 */
function expectBatterAt(actual: SceneFrame["batter"], joints: BatterJoints): void {
  const withoutHeight = (pose: SceneFrame["batter"]): SceneFrame["batter"] => ({ ...pose, bat: { ...pose.bat, height: 0 } });
  expect(withoutHeight(actual)).toEqual(withoutHeight(placeBatter(joints, ACTORS.batter)));
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

  it("打者の拡大率と足元の y を打ち消す: frame のバット高さは (ワールドの高さ − y) / 拡大率(打者ローカルの値)", () => {
    const swing = swingOf(SINGLE);
    const expectLocal = (worldHeight: number): number => (worldHeight - ACTORS.batter.position.y) / ACTORS.batter.scale;
    expect(frameAt(SINGLE, swing.contactAtMs).batter.bat.height).toBeCloseTo(expectLocal(swing.height), 9);
    expect(frameAt(null, 0, { phase: "windup" }).batter.bat.height).toBeCloseTo(expectLocal(BAT_STANCE_HEIGHT), 9);
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
