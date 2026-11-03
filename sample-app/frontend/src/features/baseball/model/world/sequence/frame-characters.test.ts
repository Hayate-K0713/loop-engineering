import { describe, expect, it } from "vitest";
import type { BattedBall, InPlayResult } from "../../../types/batting";
import type { Bases, BaseTo, RunnerMoves } from "../../../types/game";
import type { PitchFlight } from "../../../types/pitch";
import type { CharacterPose, CharacterSlot, SafeArea, SceneFrame, SceneLayout, ScenePhase, Vec3 } from "../../../types/scene";
import type { PitchOutcomeView } from "../../../types/view";
import { ASSIST_TABLE } from "../../batting/assist";
import { blinkingAt } from "../../character/expression";
import { CHARACTER_SLOTS } from "../../character/look";
import { infieldBlendAt, infieldCameraFor } from "../camera/infield";
import { projectPoint, zoneRectOf } from "../camera/project";
import { cameraForwardOf, faceDirectionOf, INTRO_WIPE_MS, wipeRectFor } from "../camera/wipe";
import { batterRootFor } from "../motion/batter-layout";
import { dejectedPose, fielderReadyPose, fielderThrowPose, fistPumpPose, groundDropOf, runnerJoyPose, runnerLeadPose } from "../motion/forms";
import { pitcherWindupPose } from "../motion/pitcher";
import { FIELDER_SLOTS, throwBallAt } from "../path/fielders";
import { baseWorldPosition, runnerPositionAt, runnerStandPosition } from "../path/runners";
import { CPU_SWING_LEAD_MS, WORLD_PARAMS } from "../space/params";
import { type SceneFrameInput, sceneFrameAt } from "./frame";
import { type PlayPlan, planPlay } from "./play-plan";

// 段階 E(E8)の合成: 表情・フォーム・表示倍率・走者・捕球と送球・内野カメラ・ワイプ。既存の性質は `frame.test.ts` が守る。

const ACTORS = WORLD_PARAMS.actors;
const RUNNERS = WORLD_PARAMS.runners;
const WIPE = WORLD_PARAMS.wipe;
const PORTRAIT_ASPECT = 390 / 844;
const FLIGHT: PitchFlight = {
  seq: 7,
  kind: "straight",
  aim: { x: 0.2, y: 0.1 },
  landing: { x: 0.2, y: 0.1 },
  speedKmh: 140,
  durationMs: 480,
  quality: "normal",
};
const CPU_RESOLVED_MS = FLIGHT.durationMs - CPU_SWING_LEAD_MS;

const EMPTY: Bases = { first: false, second: false, third: false };
const FIRST_ONLY: Bases = { first: true, second: false, third: false };
const LOADED: Bases = { first: true, second: true, third: true };

const GROUND: BattedBall = { type: "ground", strength: "medium", direction: "pull" };
const FLY: BattedBall = { type: "fly", strength: "medium", direction: "center" };
const HR: BattedBall = { type: "fly", strength: "strong", direction: "pull" };

function movesOf(before: Bases, batterTo: BaseTo, advances: RunnerMoves["advances"], after: Bases = before): RunnerMoves {
  return { before, after, scored: advances.filter((entry) => entry.to === 4).length + (batterTo === 4 ? 1 : 0), batterTo, advances };
}

function planOf(outcome: Omit<PitchOutcomeView, "seq">): PlayPlan {
  return planPlay({ flight: FLIGHT, outcome: { seq: FLIGHT.seq, ...outcome }, swing: null, resolvedAtMs: CPU_RESOLVED_MS });
}

function inPlay(result: InPlayResult, ball: BattedBall, runners: RunnerMoves | null): PlayPlan {
  return planOf({ kind: "in-play", inPlay: { result, ball }, plate: result, runners });
}

const SINGLE_RUN = inPlay("single", { type: "ground", strength: "strong", direction: "center" }, movesOf(FIRST_ONLY, 1, [{ from: 1, to: 2 }]));
const TRIPLE_RUN = inPlay(
  "triple",
  FLY,
  movesOf(LOADED, 3, [
    { from: 1, to: 4 },
    { from: 2, to: 4 },
    { from: 3, to: 4 },
  ]),
);
const GROUNDOUT = inPlay("groundout", GROUND, movesOf(EMPTY, 0, []));
const DOUBLE_PLAY = inPlay("doublePlay", GROUND, movesOf(FIRST_ONLY, 0, [{ from: 1, to: 0 }]));
const FLYOUT = inPlay("flyout", FLY, movesOf(EMPTY, 0, []));
const HOMERUN = inPlay(
  "homerun",
  HR,
  movesOf(LOADED, 4, [
    { from: 1, to: 4 },
    { from: 2, to: 4 },
    { from: 3, to: 4 },
  ]),
);
const WALK = planOf({ kind: "ball", inPlay: null, plate: "walk", runners: movesOf(EMPTY, 1, [], FIRST_ONLY) });
const STRIKEOUT = planOf({ kind: "swinging-strike", inPlay: null, plate: "strikeout", runners: movesOf(EMPTY, 0, []) });
const CALLED_STRIKE = planOf({ kind: "called-strike", inPlay: null, plate: null, runners: null });

/** 打球が速く野手に届くゴロの単打(ヒットのワイプの途中で打者が走り出す)。 */
const SHORT_SINGLE = inPlay("single", { type: "ground", strength: "weak", direction: "pull" }, movesOf(EMPTY, 1, [], FIRST_ONLY));

const E_PLANS: readonly PlayPlan[] = [SHORT_SINGLE, SINGLE_RUN, TRIPLE_RUN, GROUNDOUT, DOUBLE_PLAY, FLYOUT, HOMERUN, WALK, STRIKEOUT, CALLED_STRIKE];

function inputOf(overrides: Partial<SceneFrameInput> = {}): SceneFrameInput {
  return {
    phase: "play",
    tMs: 0,
    windupU: 0.5,
    flight: FLIGHT,
    plan: null,
    aspect: PORTRAIT_ASPECT,
    layout: "batting",
    safeArea: { top: 155 / 844, bottom: 663 / 844 },
    uniforms: { offense: 0x2f63c8, defense: 0xe8473c },
    cursor: { visible: false, point: { x: 0, y: 0 }, raw: { x: 0, y: 0 }, radii: { rx: 0.5, ry: 0.3 } },
    assist: ASSIST_TABLE.normal,
    grid: false,
    forms: { pitch: "over", bat: "square" },
    bases: EMPTY,
    clockMs: 0,
    introMs: null,
    viewHeightPx: 844,
    ...overrides,
  };
}

function frameAt(plan: PlayPlan | null, tMs: number, overrides: Partial<SceneFrameInput> = {}): SceneFrame {
  return sceneFrameAt(inputOf({ plan, tMs, ...overrides }));
}

function flat(position: Vec3): { readonly x: number; readonly z: number } {
  return { x: position.x, z: position.z };
}

function distanceXZ(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function poseOfSlot(frame: SceneFrame, slot: CharacterSlot): CharacterPose {
  const all: readonly CharacterPose[] = [frame.pitcher, frame.catcher, frame.batter, ...frame.runners, ...frame.fielders];
  const pose = all.at(CHARACTER_SLOTS.indexOf(slot));
  if (pose === undefined) {
    throw new Error(`pose が無い: ${slot}`);
  }
  return pose;
}

function numbersIn(value: unknown): readonly number[] {
  if (typeof value === "number") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(numbersIn);
  }
  return typeof value === "object" && value !== null ? Object.values(value).flatMap(numbersIn) : [];
}

/** `from` 〜 `to` を `step` ms 刻みで並べる(両端を含む)。 */
function timesFrom(from: number, to: number, step: number): readonly number[] {
  return Array.from({ length: Math.floor((to - from) / step) + 1 }, (_unused, i) => from + i * step);
}

function startOf(plan: PlayPlan): number {
  return plan.runners?.startMs ?? Number.NaN;
}

function endOf(plan: PlayPlan): number {
  return plan.runners?.endMs ?? Number.NaN;
}

/** 顔の向きとワイプのカメラの前方の内積(正面から撮れていれば −1 に近い)。 */
function faceDot(pose: CharacterPose, frame: SceneFrame): number {
  const face = faceDirectionOf(pose);
  const forward = cameraForwardOf(frame.wipe.camera);
  return face.x * forward.x + face.y * forward.y + face.z * forward.z;
}

// ---------- 健全性 ----------

const COMPOSITIONS: readonly { readonly aspect: number; readonly layout: SceneLayout; readonly safeArea: SafeArea | null; readonly viewHeightPx: number }[] = [
  { aspect: 16 / 9, layout: "batting", safeArea: null, viewHeightPx: 720 },
  { aspect: PORTRAIT_ASPECT, layout: "batting", safeArea: { top: 155 / 844, bottom: 663 / 844 }, viewHeightPx: 844 },
  { aspect: 390 / 664, layout: "pitching", safeArea: { top: 155 / 664, bottom: 534 / 664 }, viewHeightPx: 664 },
  { aspect: Number.NaN, layout: "batting", safeArea: null, viewHeightPx: Number.NaN },
  { aspect: 0, layout: "pitching", safeArea: null, viewHeightPx: 0 },
];
const PHASES: readonly ScenePhase[] = ["idle", "windup", "flight", "play"];

describe("sceneFrameAt(段階 E): 全入力の健全性", () => {
  it("全数値が有限で、runners は 4 人・fielders は 7 人、wipe.alpha は 0〜1 で visible ⇔ alpha > 0(構図・phase・plan・時刻・塁状況・紹介の全組み合わせ)", () => {
    const broken = COMPOSITIONS.flatMap((composition) =>
      PHASES.flatMap((phase) =>
        [null, ...E_PLANS].flatMap((plan) =>
          timesFrom(-50, 5400, 150).flatMap((tMs) => {
            const frame = frameAt(plan, tMs, { ...composition, phase, bases: LOADED, introMs: tMs + 60, clockMs: tMs * 3 });
            const sound =
              frame.runners.length === 4 &&
              frame.fielders.length === 7 &&
              numbersIn(frame).every(Number.isFinite) &&
              frame.wipe.alpha >= 0 &&
              frame.wipe.alpha <= 1 &&
              frame.wipe.visible === frame.wipe.alpha > 0;
            return sound ? [] : [`${phase}/t${tMs}/aspect${composition.aspect}`];
          }),
        ),
      ),
    );
    expect(broken.slice(0, 3)).toEqual([]);
  }, 30_000);

  it("同一入力で deep equal(決定論)", () => {
    for (const plan of E_PLANS) {
      for (const tMs of timesFrom(0, 5000, 500)) {
        expect(JSON.stringify(frameAt(plan, tMs, { bases: LOADED }))).toBe(JSON.stringify(frameAt(plan, tMs, { bases: LOADED })));
      }
    }
  });
});

// ---------- 表情 ----------

describe("sceneFrameAt(段階 E): 表情", () => {
  it("打者の表情: 構え = focus、ホームラン = cheer、ヒット = joy(接触の後)", () => {
    expect(frameAt(null, 0, { phase: "idle" }).batter.expression).toBe("focus");
    expect(frameAt(HOMERUN, (HOMERUN.contactMs ?? 0) + 600).batter.expression).toBe("cheer");
    expect(frameAt(SINGLE_RUN, (SINGLE_RUN.contactMs ?? 0) + 600).batter.expression).toBe("joy");
  });

  it("投手の表情: windup = focus、リリース直後 = effort、三振を取ると cheer、ホームランを打たれると shock → sad", () => {
    expect(frameAt(null, 0, { phase: "windup" }).pitcher.expression).toBe("focus");
    expect(frameAt(null, 100, { phase: "flight" }).pitcher.expression).toBe("effort");
    expect(frameAt(STRIKEOUT, (STRIKEOUT.swing?.contactAtMs ?? STRIKEOUT.durationMs) + 100).pitcher.expression).toBe("cheer");
    const hr = HOMERUN.contactMs ?? 0;
    expect(frameAt(HOMERUN, hr + 100).pitcher.expression).toBe("shock");
    expect(frameAt(HOMERUN, hr + 1500).pitcher.expression).toBe("sad");
  });

  it("得点した走者は cheer。打者走者は生還するまで、打者のときの表情(ヒットの喜び)を引き継ぐ", () => {
    const runs = TRIPLE_RUN.runners;
    const after = (runs?.endMs ?? 0) + 100;
    expect(frameAt(TRIPLE_RUN, after).runners.map((pose) => pose.expression)).toEqual(["joy", "cheer", "cheer", "cheer"]);
  });

  it("打者走者(安打)は走り出した直後も joy", () => {
    const frame = frameAt(SINGLE_RUN, startOf(SINGLE_RUN) + 200);
    expect(frame.runners.at(0)?.expression).toBe("joy");
  });

  it("idle・windup のまばたきは clockMs で進む: neutral の役割は blinkingAt の間だけ blink", () => {
    const slotIndex = CHARACTER_SLOTS.indexOf("fielder3");
    const clocks = timesFrom(0, 5600, 40);
    for (const phase of ["idle", "windup"] as const) {
      const mismatched = clocks.filter((clockMs) => {
        const expression = frameAt(null, 0, { phase, clockMs }).fielders.at(3)?.expression;
        return expression !== (blinkingAt(clockMs, slotIndex) ? "blink" : "neutral");
      });
      expect(mismatched).toEqual([]);
    }
    const blinks = clocks.filter((clockMs) => frameAt(null, 0, { phase: "idle", clockMs }).fielders.at(3)?.expression === "blink");
    expect(blinks.length).toBeGreaterThan(0);
  });
});

// ---------- フォーム ----------

describe("sceneFrameAt(段階 E): フォーム", () => {
  it("投手は forms.pitch のフォームで windup する(投球 3 種で別のポーズ)", () => {
    for (const form of ["over", "three-quarter", "side"] as const) {
      const pose = frameAt(null, 0, { phase: "windup", windupU: 0.5, forms: { pitch: form, bat: "square" } }).pitcher;
      const expected = pitcherWindupPose(0.5, form);
      expect({ torso: pose.torso, armR: pose.armR, legL: pose.legL, kneeL: pose.kneeL, elbowR: pose.elbowR }).toEqual({
        torso: expected.torso,
        armR: expected.armR,
        legL: expected.legL,
        kneeL: expected.kneeL,
        elbowR: expected.elbowR,
      });
    }
    const over = frameAt(null, 0, { phase: "windup", windupU: 0.5 }).pitcher;
    const side = frameAt(null, 0, { phase: "windup", windupU: 0.5, forms: { pitch: "side", bat: "square" } }).pitcher;
    expect(over.armR).not.toEqual(side.armR);
  });

  it("打者は forms.bat の構えで立つ(open・square・crouch で別のポーズ)", () => {
    const torsos = (["open", "square", "crouch"] as const).map((bat) =>
      JSON.stringify(frameAt(null, 100, { phase: "flight", forms: { pitch: "over", bat } }).batter.torso),
    );
    expect(new Set(torsos).size).toBe(3);
  });

  it("肘・膝を含む全関節が有限(全 plan・全時刻)", () => {
    const poses = E_PLANS.flatMap((plan) => timesFrom(0, 5000, 250).map((tMs) => frameAt(plan, tMs, { bases: LOADED })));
    const joints = poses
      .flatMap((frame) => [frame.pitcher, frame.batter, ...frame.runners, ...frame.fielders])
      .flatMap((pose) => [pose.elbowL, pose.elbowR, pose.kneeL, pose.kneeR]);
    expect(numbersIn(joints).every(Number.isFinite)).toBe(true);
  });
});

// ---------- 表示倍率 ----------

describe("sceneFrameAt(段階 E): CharacterPose.scale(framingScale)", () => {
  it("打撃カメラの間: 投手 1.30(縦長・横長とも)、打者は batterRootFor(aspect).scale、捕手 1.0、野手 1.15", () => {
    for (const aspect of [PORTRAIT_ASPECT, 0.85, 16 / 9]) {
      const frame = frameAt(null, 100, { phase: "flight", aspect });
      expect(frame.pitcher.scale).toBe(ACTORS.pitcher.scale);
      expect(frame.batter.scale).toBe(batterRootFor(aspect).scale);
      expect(frame.catcher.scale).toBe(1);
      expect(frame.fielders.every((pose) => pose.scale === ACTORS.fielderScale)).toBe(true);
    }
  });

  it.each([SINGLE_RUN, FLYOUT, HOMERUN, WALK, STRIKEOUT])("投手・打者の倍率は連続(16ms 刻みで 0.03 以下)で、カメラの blend が終わると 1.0(plan %#)", (plan) => {
    const times = timesFrom(0, plan.endMs + 600, 16);
    const frames = times.map((tMs) => frameAt(plan, tMs));
    for (const [i, frame] of frames.entries()) {
      const previous = frames.at(i - 1) ?? frame;
      if (i > 0) {
        expect(Math.abs(frame.pitcher.scale - previous.pitcher.scale)).toBeLessThanOrEqual(0.03);
        expect(Math.abs(frame.batter.scale - previous.batter.scale)).toBeLessThanOrEqual(0.03);
      }
    }
    if (plan.chaseFromMs !== null || plan.infieldFromMs !== null) {
      const last = frames.at(-1);
      expect(last?.pitcher.scale).toBe(1);
      expect(last?.batter.scale).toBe(1);
    }
  });

  it("追跡カメラに移り始める前は構図の倍率のまま、内野カメラへ blend する間も 1.0 へ連続して戻る(walk)", () => {
    const start = WALK.infieldFromMs ?? Number.NaN;
    expect(frameAt(WALK, start - 1).pitcher.scale).toBe(ACTORS.pitcher.scale);
    expect(frameAt(WALK, start + RUNNERS.infieldCamera.blendMs / 2).pitcher.scale).toBeLessThan(ACTORS.pitcher.scale);
    expect(frameAt(WALK, start + RUNNERS.infieldCamera.blendMs).pitcher.scale).toBe(1);
  });
});

// ---------- 走者 ----------

describe("sceneFrameAt(段階 E): 走者", () => {
  it("plan が無い間は bases の走者だけがリードの位置に立つ(打者走者の枠は出ない)", () => {
    expect(frameAt(null, 0, { phase: "idle", bases: EMPTY }).runners.map((pose) => pose.visible)).toEqual([false, false, false, false]);
    const frame = frameAt(null, 0, { phase: "idle", bases: { first: false, second: true, third: true } });
    expect(frame.runners.map((pose) => pose.visible)).toEqual([false, false, true, true]);
    expect(flat(frame.runners.at(2)?.position ?? frame.ball.position)).toEqual(flat(runnerStandPosition(2)));
    expect(flat(frame.runners.at(3)?.position ?? frame.ball.position)).toEqual(flat(runnerStandPosition(3)));
  });

  it("リードの走者は足が浮かないよう根を下げて立つ(groundDropOf × scale)", () => {
    const pose = frameAt(null, 0, { phase: "idle", bases: FIRST_ONLY }).runners.at(1);
    expect(pose?.position.y).toBeCloseTo(0 - groundDropOf(runnerLeadPose()) * ACTORS.fielderScale, 12);
    expect(pose?.torso).toEqual(runnerLeadPose().torso);
  });

  it("走者の事実がある plan: 走り出すまでは出発の塁に立ち(bases は無視)、打者走者は走り出すまで出ず打者が見える", () => {
    const before = frameAt(SINGLE_RUN, startOf(SINGLE_RUN) - 1, { bases: EMPTY });
    expect(before.runners.map((pose) => pose.visible)).toEqual([false, true, false, false]);
    expect(flat(before.runners.at(1)?.position ?? before.ball.position)).toEqual(flat(runnerStandPosition(1)));
    expect(before.batter.visible).toBe(true);
  });

  it("走り出すと打者は消えて打者走者が出る。走っている間は走りのポーズ、経路上を進む", () => {
    const motion = SINGLE_RUN.runners?.plan.motions.at(0);
    expect(motion).not.toBeNull();
    const tMs = startOf(SINGLE_RUN) + 400;
    const frame = frameAt(SINGLE_RUN, tMs);
    expect(frame.batter.visible).toBe(false);
    expect(frame.runners.at(0)?.visible).toBe(true);
    if (motion !== null && motion !== undefined) {
      const expected = runnerPositionAt(motion, 400);
      expect(frame.runners.at(0)?.position.x).toBeCloseTo(expected.x, 9);
      expect(frame.runners.at(0)?.position.z).toBeCloseTo(expected.z, 9);
    }
    expect(frame.runners.at(0)?.torso.x).toBeGreaterThan(0);
  });

  it("走り終えると到達した塁のリードの位置に立つ(打者走者 = 一塁、一塁走者 = 二塁)", () => {
    const frame = frameAt(SINGLE_RUN, endOf(SINGLE_RUN) + 200);
    expect(flat(frame.runners.at(0)?.position ?? frame.ball.position)).toEqual(flat(runnerStandPosition(1)));
    expect(flat(frame.runners.at(1)?.position ?? frame.ball.position)).toEqual(flat(runnerStandPosition(2)));
    expect(frame.runners.at(0)?.torso).toEqual(runnerLeadPose().torso);
  });

  it("生還した走者は本塁で喜ぶ(三塁打・満塁: 全員が本塁へ)", () => {
    const frame = frameAt(TRIPLE_RUN, endOf(TRIPLE_RUN) + 100);
    for (const pose of frame.runners.slice(1)) {
      expect(flat(pose.position)).toEqual({ x: 0, z: 0 });
      expect(pose.visible).toBe(true);
      expect(pose.armL).toEqual({ ...runnerJoyPose(100 + 0).armL, x: pose.armL.x });
    }
    expect(frame.runners.every((pose) => pose.position.y <= 0)).toBe(true);
  });

  it("ホームラン: 走者は動かさず(塁上の走者は立ったまま)、打者走者は出さず、打者は消えない", () => {
    for (const tMs of timesFrom(0, HOMERUN.endMs, 200)) {
      const frame = frameAt(HOMERUN, tMs);
      expect(frame.batter.visible).toBe(true);
      expect(frame.runners.map((pose) => pose.visible)).toEqual([false, true, true, true]);
      expect(flat(frame.runners.at(1)?.position ?? frame.ball.position)).toEqual(flat(runnerStandPosition(1)));
    }
  });

  it("三振・フライアウトの打者は消えない。ゴロのアウトの打者走者は一塁の手前で止まる(うなだれる)", () => {
    expect(frameAt(STRIKEOUT, STRIKEOUT.endMs - 1).batter.visible).toBe(true);
    expect(frameAt(FLYOUT, FLYOUT.endMs - 1).batter.visible).toBe(true);
    const retire = GROUNDOUT.fielding?.retires.at(0)?.atMs ?? Number.NaN;
    const stopped = frameAt(GROUNDOUT, retire + 300).runners.at(0);
    const first = baseWorldPosition(1);
    expect(distanceXZ(stopped?.position ?? first, first)).toBeGreaterThan(0.5);
    expect(frameAt(GROUNDOUT, endOf(GROUNDOUT)).runners.at(0)?.torso).toEqual(dejectedPose().torso);
  });

  it("併殺: 一塁走者は二塁の手前で止まる", () => {
    const retire = DOUBLE_PLAY.fielding?.retires.find((entry) => entry.slot === 1)?.atMs ?? Number.NaN;
    const runner = frameAt(DOUBLE_PLAY, retire + 300).runners.at(1);
    const second = baseWorldPosition(2);
    expect(distanceXZ(runner?.position ?? second, second)).toBeGreaterThan(0.5);
  });

  it("走者の速さ: 一塁へ 1.6 秒(打者走者の走行時間)", () => {
    expect(SINGLE_RUN.runners?.plan.motions.at(0)?.durationMs).toBe(RUNNERS.msPerBase);
  });
});

// ---------- 捕球・送球 ----------

describe("sceneFrameAt(段階 E): 野手の捕球と送球", () => {
  const throwing = GROUNDOUT.fielding?.throws.at(0);
  const fielderIndex = GROUNDOUT.fielding?.fielderIndex ?? -1;

  it("前提: ゴロのアウトは一塁手以外が捕って一塁へ送球する", () => {
    expect(throwing).toBeDefined();
    expect(fielderIndex).toBeGreaterThan(0);
    expect(throwing?.toIndex).toBe(0);
  });

  it("フライ・ライナーのアウト: 野手は到着後に捕球ポーズ(グローブを上げる)、安打は構えのまま", () => {
    const index = FLYOUT.fielding?.fielderIndex ?? -1;
    const ready = fielderReadyPose();
    const caught = frameAt(FLYOUT, (FLYOUT.fielder?.arriveMs ?? 0) + 200).fielders.at(index);
    expect(caught?.armL).not.toEqual(ready.armL);
    const singleIndex = SINGLE_RUN.fielding?.fielderIndex ?? -1;
    expect(frameAt(SINGLE_RUN, (SINGLE_RUN.fielder?.arriveMs ?? 0) + 100).fielders.at(singleIndex)?.armL).toEqual(ready.armL);
  });

  it("ゴロ: 到着後はかがんで捕る(前傾 0.8rad 以上)", () => {
    const scoop = frameAt(GROUNDOUT, (GROUNDOUT.fielder?.arriveMs ?? 0) + 20).fielders.at(fielderIndex);
    expect(scoop?.torso.x).toBeGreaterThanOrEqual(0.8);
  });

  it("送球の野手: リリースの瞬間は fielderThrowPose(1)、向きは送球先", () => {
    const start = throwing?.startMs ?? Number.NaN;
    const pose = frameAt(GROUNDOUT, start).fielders.at(fielderIndex);
    expect(pose?.torso).toEqual(fielderThrowPose(1).torso);
    expect(pose?.armR).toEqual(fielderThrowPose(1).armR);
    const from = pose?.position ?? baseWorldPosition(1);
    const to = throwing?.to ?? baseWorldPosition(1);
    expect(pose?.yaw).toBeCloseTo(Math.atan2(to.x - from.x, to.z - from.z), 9);
  });

  it("受ける野手(一塁手)は送球が着くまでに一塁へ寄り、着くときは一塁にいる", () => {
    const arrive = throwing?.arriveMs ?? Number.NaN;
    const slot = FIELDER_SLOTS.at(0)?.position ?? baseWorldPosition(1);
    expect(flat(frameAt(GROUNDOUT, (throwing?.startMs ?? 0) - 400).fielders.at(0)?.position ?? slot)).toEqual(flat(slot));
    const atArrival = frameAt(GROUNDOUT, arrive).fielders.at(0)?.position ?? slot;
    expect(distanceXZ(atArrival, baseWorldPosition(1))).toBeLessThan(0.01);
  });

  it("送球のボール: 始点は野手の手元、途中は throwBallAt、着いたら受け手のグローブに留まる。打球の終点から連続して切り替わる", () => {
    if (throwing === undefined) {
      throw new Error("送球がない");
    }
    const mid = (throwing.startMs + throwing.arriveMs) / 2;
    expect(frameAt(GROUNDOUT, throwing.startMs).ball.position).toEqual(throwing.from);
    expect(frameAt(GROUNDOUT, mid).ball.position).toEqual(throwBallAt(throwing, mid));
    expect(frameAt(GROUNDOUT, throwing.arriveMs + 400).ball.position).toEqual(throwing.to);
    const steps = timesFrom(GROUNDOUT.contactMs ?? 0, GROUNDOUT.endMs, 16).map((tMs) => frameAt(GROUNDOUT, tMs).ball.position);
    const jumps = steps
      .slice(1)
      .map((position, i) => Math.hypot(position.x - (steps.at(i)?.x ?? 0), position.y - (steps.at(i)?.y ?? 0), position.z - (steps.at(i)?.z ?? 0)));
    expect(Math.max(...jumps)).toBeLessThan(1.5);
  });

  it("アウトのとき送球のボールが走者より先に一塁に着く(打者走者は一塁の手前)", () => {
    if (throwing === undefined) {
      throw new Error("送球がない");
    }
    const frame = frameAt(GROUNDOUT, throwing.arriveMs);
    const first = baseWorldPosition(1);
    expect(distanceXZ(frame.ball.position, first)).toBeLessThan(0.01);
    expect(distanceXZ(frame.runners.at(0)?.position ?? first, first)).toBeGreaterThan(0.5);
  });

  it("安打のとき走者が先に着く: 野手は送球しない(ボールは打球の終点のまま)", () => {
    const end = frameAt(SINGLE_RUN, (SINGLE_RUN.fielder?.arriveMs ?? 0) - 1).ball.position;
    expect(frameAt(SINGLE_RUN, endOf(SINGLE_RUN)).ball.position).toEqual(end);
  });

  it("併殺: 2 回送球(二塁 → 一塁)。ボールは 1 回目の着地のあと 2 回目の始点へ", () => {
    const [toSecond, toFirst] = DOUBLE_PLAY.fielding?.throws ?? [];
    if (toSecond === undefined || toFirst === undefined) {
      throw new Error("送球が 2 回ない");
    }
    expect(distanceXZ(frameAt(DOUBLE_PLAY, toSecond.arriveMs).ball.position, baseWorldPosition(2))).toBeLessThan(0.01);
    expect(frameAt(DOUBLE_PLAY, toFirst.startMs).ball.position).toEqual(toFirst.from);
    expect(distanceXZ(frameAt(DOUBLE_PLAY, toFirst.arriveMs).ball.position, baseWorldPosition(1))).toBeLessThan(0.01);
  });
});

// ---------- 内野カメラ ----------

describe("sceneFrameAt(段階 E): 内野カメラ", () => {
  const BLEND = RUNNERS.infieldCamera.blendMs;

  it.each([PORTRAIT_ASPECT, 16 / 9])(
    "走者が動くプレー: blend の起点は追跡カメラ(連続)、400ms で内野カメラに一致し、進塁の終わりまで保持(縦横比 %f)",
    (aspect) => {
      for (const plan of [SINGLE_RUN, TRIPLE_RUN, GROUNDOUT, DOUBLE_PLAY, WALK]) {
        const from = plan.infieldFromMs ?? Number.NaN;
        const withoutInfield: PlayPlan = { ...plan, infieldFromMs: null };
        expect(frameAt(plan, from, { aspect }).camera).toEqual(frameAt(withoutInfield, from, { aspect }).camera);
        expect(frameAt(plan, from + BLEND, { aspect }).camera).toEqual(infieldCameraFor(aspect));
        expect(frameAt(plan, plan.endMs - 1, { aspect }).camera).toEqual(infieldCameraFor(aspect));
      }
    },
  );

  it("走者が動かないプレー(三振・フライアウト・ホームラン・見逃し)は内野カメラに寄らない", () => {
    for (const plan of [STRIKEOUT, FLYOUT, HOMERUN, CALLED_STRIKE]) {
      expect(plan.infieldFromMs).toBeNull();
      const same = timesFrom(0, plan.endMs, 100).every(
        (tMs) => JSON.stringify(frameAt(plan, tMs).camera) === JSON.stringify(frameAt({ ...plan, infieldFromMs: null }, tMs).camera),
      );
      expect(same).toBe(true);
      expect(frameAt(plan, plan.endMs - 1).camera).not.toEqual(infieldCameraFor(PORTRAIT_ASPECT));
    }
  });

  it("カメラは連続: 16ms の位置の移動 3m 以下・視野角の変化 5° 以下・lift の変化 0.05 以下(接触から演出の終わりまで)", () => {
    for (const plan of [SINGLE_RUN, TRIPLE_RUN, GROUNDOUT, DOUBLE_PLAY, WALK]) {
      const cameras = timesFrom(plan.contactMs ?? 0, plan.endMs, 16).map((tMs) => frameAt(plan, tMs).camera);
      const worst = cameras.slice(1).reduce(
        (acc, camera, i) => {
          const previous = cameras.at(i) ?? camera;
          const move = Math.hypot(camera.position.x - previous.position.x, camera.position.y - previous.position.y, camera.position.z - previous.position.z);
          return {
            move: Math.max(acc.move, move),
            fov: Math.max(acc.fov, Math.abs(camera.fovDeg - previous.fovDeg)),
            lift: Math.max(acc.lift, Math.abs(camera.lift - previous.lift)),
          };
        },
        { move: 0, fov: 0, lift: 0 },
      );
      expect(worst.move).toBeLessThan(3);
      expect(worst.fov).toBeLessThan(5);
      expect(worst.lift).toBeLessThan(0.05);
    }
  });

  it("内野カメラの画角で、一塁・三塁の走者(足元と頭の高さ)が画面内(390×844 と 390×664)", () => {
    for (const [width, height] of [
      [390, 844],
      [390, 664],
    ] as const) {
      const frame = frameAt(TRIPLE_RUN, endOf(TRIPLE_RUN) - 1, { aspect: width / height });
      const points = [runnerStandPosition(1), runnerStandPosition(3), baseWorldPosition(1), baseWorldPosition(3)];
      for (const point of points) {
        for (const y of [0, 2.3]) {
          const projected = projectPoint(frame.camera, { width, height }, { ...point, y });
          expect(projected.x).toBeGreaterThan(0);
          expect(projected.x).toBeLessThan(width);
          expect(projected.y).toBeGreaterThan(0);
          expect(projected.y).toBeLessThan(height);
        }
      }
    }
  });

  it("内野カメラへ移り始めたらゾーン枠・カーソルは出さない(追跡カメラのない四球でも)。捕手は blend が進むと表示", () => {
    const from = WALK.infieldFromMs ?? Number.NaN;
    const cursor = { visible: true, point: { x: 0, y: 0 }, raw: { x: 0, y: 0 }, radii: { rx: 0.5, ry: 0.3 } };
    expect(frameAt(WALK, from - 1, { cursor }).zone.visible).toBe(true);
    expect(frameAt(WALK, from + 1, { cursor }).zone.visible).toBe(false);
    expect(frameAt(WALK, from + 1, { cursor }).cursor.visible).toBe(false);
    expect(frameAt(WALK, from + 1).catcher.visible).toBe(false);
    expect(frameAt(WALK, from + BLEND).catcher.visible).toBe(true);
    expect(infieldBlendAt(BLEND)).toBe(1);
  });
});

// ---------- ワイプ ----------

describe("sceneFrameAt(段階 E): ワイプ", () => {
  it("打席の紹介: idle・windup の間だけ、introMs の間(showMs)に打者の顔を出す。投球が始まる(flight・play)と出さない", () => {
    for (const phase of ["idle", "windup"] as const) {
      const wipe = frameAt(null, 0, { phase, introMs: WIPE.showMs / 2 }).wipe;
      expect(wipe.visible).toBe(true);
      expect(wipe.target).toBe("batter");
      expect(wipe.alpha).toBe(1);
      expect(frameAt(null, 0, { phase, introMs: null }).wipe.visible).toBe(false);
      expect(frameAt(null, 0, { phase, introMs: INTRO_WIPE_MS }).wipe.visible).toBe(false);
      expect(frameAt(null, 0, { phase, introMs: -1 }).wipe.visible).toBe(false);
    }
    expect(frameAt(null, 100, { phase: "flight", introMs: 300 }).wipe.visible).toBe(false);
    expect(frameAt(SINGLE_RUN, 100, { phase: "play", introMs: 300 }).wipe.visible).toBe(false);
  });

  it.each([
    [390, 844],
    [390, 664],
  ] as const)("矩形は HUD の下端 + 20px から 94×94px で、ゾーン枠と重ならない(%d×%d)", (width, height) => {
    const safeArea = { top: 155 / height, bottom: (height - 181) / height };
    const frame = frameAt(null, 0, { phase: "idle", introMs: 400, aspect: width / height, safeArea, viewHeightPx: height });
    expect(frame.wipe.rect).toEqual(wipeRectFor(width / height, height, safeArea.top));
    expect(frame.wipe.rect.y).toBeCloseTo(155 + WIPE.rectPortrait.belowHudPx, 9);
    const zone = zoneRectOf(frame.camera, { width, height }, WORLD_PARAMS.zone);
    const rect = frame.wipe.rect;
    const separate =
      rect.x >= zone.left + zone.width || rect.x + rect.width <= zone.left || rect.y >= zone.top + zone.height || rect.y + rect.height <= zone.top;
    expect(separate).toBe(true);
  });

  it("結果の場面: ヒット(打者の喜び)・ホームラン(打者)・三振(打者)・凡打のアウト(投手)が plan.wipe の区間で出て、区間の外では出ない", () => {
    const cases: readonly (readonly [PlayPlan, CharacterSlot])[] = [
      [SINGLE_RUN, "batter"],
      [HOMERUN, "batter"],
      [STRIKEOUT, "batter"],
      [GROUNDOUT, "pitcher"],
      [FLYOUT, "pitcher"],
    ];
    for (const [plan, target] of cases) {
      const stage = plan.wipe.at(0);
      expect(stage).toBeDefined();
      const middle = ((stage?.startMs ?? 0) + (stage?.endMs ?? 0)) / 2;
      const wipe = frameAt(plan, middle).wipe;
      expect(wipe.visible).toBe(true);
      expect(wipe.alpha).toBeGreaterThan(0.99);
      expect(target === "batter" ? ["batter", "runner0"] : [target]).toContain(wipe.target);
      expect(frameAt(plan, (stage?.startMs ?? 0) - 1).wipe.visible).toBe(false);
      expect(frameAt(plan, (stage?.endMs ?? 0) + 1).wipe.visible).toBe(false);
    }
  });

  it("打者が打者走者として走り出した後は、同じ人物の runner0 を撮る(区間が走り出しをまたぐ plan)", () => {
    const run = startOf(SHORT_SINGLE);
    const plan: PlayPlan = { ...SHORT_SINGLE, wipe: [{ scene: "hit", target: "batter", startMs: run - 300, endMs: run + 900 }] };
    expect(frameAt(plan, run - 100).wipe.target).toBe("batter");
    expect(frameAt(plan, run + 50).wipe.target).toBe("runner0");
    expect(frameAt(plan, run + 50).wipe.visible).toBe(true);
  });

  it("顔の向きとワイプのカメラの前方の内積が ≤ −0.6(visible な全フレーム: 全 plan・全時刻・縦長/横長)", () => {
    const worst = [PORTRAIT_ASPECT, 16 / 9].flatMap((aspect) =>
      E_PLANS.flatMap((plan) =>
        timesFrom(0, plan.endMs, 20).flatMap((tMs) => {
          const frame = frameAt(plan, tMs, { aspect });
          if (!frame.wipe.visible) {
            return [];
          }
          return [faceDot(poseOfSlot(frame, frame.wipe.target), frame)];
        }),
      ),
    );
    expect(worst.length).toBeGreaterThan(50);
    expect(Math.max(...worst)).toBeLessThanOrEqual(-0.6);
  });

  it("紹介のワイプの顔の向きも ≤ −0.6(構え・投球の windup の全域)", () => {
    const dots = timesFrom(0, 10, 1).map((i) => {
      const frame = frameAt(null, 0, { phase: "windup", windupU: i / 10, introMs: 600 });
      return faceDot(poseOfSlot(frame, frame.wipe.target), frame);
    });
    expect(Math.max(...dots)).toBeLessThanOrEqual(-0.6);
  });
});

// ---------- 感情のポーズ ----------

describe("sceneFrameAt(段階 E): 感情のポーズ", () => {
  it("三振の打者は結果の後にうなだれ、三振を取った投手はガッツポーズ(ランプで連続)", () => {
    const late = STRIKEOUT.endMs + 2000;
    const frame = frameAt(STRIKEOUT, late);
    expect(frame.batter.torso).toEqual(dejectedPose().torso);
    expect(frame.pitcher.armR).toEqual(fistPumpPose().armR);
    const earlier = frameAt(STRIKEOUT, STRIKEOUT.durationMs - 100);
    expect(earlier.batter.torso).not.toEqual(dejectedPose().torso);
  });

  it("三振でない球ではうなだれない・ガッツポーズもしない", () => {
    const frame = frameAt(CALLED_STRIKE, CALLED_STRIKE.endMs + 2000);
    expect(frame.batter.torso).not.toEqual(dejectedPose().torso);
    expect(frame.pitcher.armR).not.toEqual(fistPumpPose().armR);
  });
});

// ---------- 表示用の補助 ----------

describe("sceneFrameAt(段階 E): 捕手", () => {
  it("構図の倍率に依らず、捕手の位置・向きは ACTORS.catcher", () => {
    const catcher = frameAt(SINGLE_RUN, endOf(SINGLE_RUN)).catcher;
    expect(catcher.position).toEqual(ACTORS.catcher.position);
    expect(catcher.yaw).toBe(ACTORS.catcher.yaw);
  });
});
