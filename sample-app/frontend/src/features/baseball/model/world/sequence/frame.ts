import type { CursorRadii } from "../../../types/batting";
import type { ZonePoint } from "../../../types/common";
import type { CourseCell, PitchFlight } from "../../../types/pitch";
import type { BatterPose, CameraPose, CharacterPose, SceneFrame, ScenePhase, UniformColors, Vec3 } from "../../../types/scene";
import { cellToPoint } from "../../pitch/zone";
import { battingCamera, blendCamera, chaseBlendAt, chaseCamera } from "../camera/rig";
import { batterStancePose, batterSwingPose } from "../motion/batter";
import { catcherPose, fielderIdlePose, fielderRunPose } from "../motion/fielder";
import { pitcherFollowPose, pitcherWindupPose } from "../motion/pitcher";
import { type JointPose, placeBatter, placeCharacter } from "../motion/pose";
import { battedBallAt } from "../path/batted-path";
import { FIELDER_SLOTS, type FielderSlot, fielderRunAt } from "../path/fielders";
import { mittBallAt, pitchBallAt } from "../path/pitch-path";
import { ZONE_HALF_HEIGHT, cellToWorld, zoneToWorld } from "../space/coords";
import { RELEASE_POINT, WORLD_PARAMS } from "../space/params";
import { type PlayFielder, type PlayPlan, swingProgressAt } from "./play-plan";

// 時刻 t の画面の全状態(`SceneFrame`)の合成。唯一の外向き関数は `sceneFrameAt`。状態を持たず、入力と時刻だけで決まる。
// アクターごとの小関数(`pitcherFrame`・`batterFrame`・`ballFrame`・`cameraFrame` ほか)に分け、共通の導出値は `FrameContext` に1回だけ計算する。

export type SceneFrameInput = {
  readonly phase: ScenePhase;
  /** リリースからの経過ゲーム時間(ms)。`usePitchFlight.getElapsedMs()` と同じ時計。 */
  readonly tMs: number;
  /** windup の進行(0〜1)。`phase = "windup"` のときだけ使う。 */
  readonly windupU: number;
  /** 飛行中、または演出中に保持している投球。 */
  readonly flight: PitchFlight | null;
  readonly plan: PlayPlan | null;
  /** 描画に使うユニフォーム色。そのまま `SceneFrame.uniforms` に写す(どの色を渡すかは呼び出し側が決める)。 */
  readonly uniforms: UniformColors;
  /** スイングカーソル(人間打撃中のみ `visible`)。 */
  readonly cursor: { readonly visible: boolean; readonly point: ZonePoint; readonly radii: CursorRadii };
  /** 人間守備で選択中のセル。 */
  readonly aim: CourseCell | null;
  /** 5×5 格子の表示(人間守備)。 */
  readonly grid: boolean;
};

const ACTORS = WORLD_PARAMS.actors;
const HALF_WIDTH = WORLD_PARAMS.zone.halfWidth;
const CHASE = WORLD_PARAMS.chaseCamera;

/** グリッドの1セルの幅(ゾーン単位。隣り合うセル中心の差から求める = 2/3)。 */
const CELL_SPAN = cellToPoint({ col: 3, row: 2 }).x - cellToPoint({ col: 2, row: 2 }).x;

/** 狙いが無いときの `aim.position`(中央のセル)。 */
const CENTER_CELL: CourseCell = { col: 2, row: 2 };

/** フレームの各部分が共有する導出値。 */
type FrameContext = {
  readonly input: SceneFrameInput;
  /** `phase = "play"` のときだけ非 `null`。 */
  readonly plan: PlayPlan | null;
  /** 0 以上にそろえた経過時間(ms)。 */
  readonly tMs: number;
  /** 接触後の打球の位置。接触前・打球がないときは `null`。 */
  readonly batted: Vec3 | null;
  /** ボールの位置。非表示のとき `null`。 */
  readonly ball: Vec3 | null;
  /** 打撃カメラから中継カメラへ移る割合。中継カメラに移り始める前は `null`。 */
  readonly chase: { readonly position: number; readonly target: number } | null;
};

/** 接触後の打球の位置。接触前・打球がないときは `null`。 */
function battedBallOf(plan: PlayPlan | null, tMs: number): Vec3 | null {
  if (plan === null || plan.batted === null || plan.contactMs === null || tMs < plan.contactMs) {
    return null;
  }
  return battedBallAt(plan.batted, tMs - plan.contactMs);
}

/** 投球のボール位置。`durationMs` まで `pitchBallAt`、以降はミットへ `mittBallAt`。 */
function pitchedBallOf(flight: PitchFlight, tMs: number): Vec3 {
  return tMs <= flight.durationMs ? pitchBallAt(flight, tMs) : mittBallAt(flight, tMs - flight.durationMs);
}

/** ボールの位置。接触前は投球の軌道(plan が無い人間打者の判定待ちを含む)、接触後は打球。idle・windup は非表示。 */
function ballPositionOf(input: SceneFrameInput, batted: Vec3 | null, tMs: number): Vec3 | null {
  if (batted !== null) {
    return batted;
  }
  if (input.phase === "idle" || input.phase === "windup" || input.flight === null) {
    return null;
  }
  return pitchedBallOf(input.flight, tMs);
}

function chaseOf(plan: PlayPlan | null, tMs: number): FrameContext["chase"] {
  if (plan === null || plan.chaseFromMs === null || tMs < plan.chaseFromMs) {
    return null;
  }
  return chaseBlendAt(tMs - plan.chaseFromMs);
}

function contextOf(input: SceneFrameInput): FrameContext {
  const plan = input.phase === "play" ? input.plan : null;
  const tMs = Math.max(0, input.tMs);
  const batted = battedBallOf(plan, tMs);
  return { input, plan, tMs, batted, ball: ballPositionOf(input, batted, tMs), chase: chaseOf(plan, tMs) };
}

function cameraFrame(ctx: FrameContext): CameraPose {
  const base = battingCamera();
  if (ctx.chase === null || ctx.ball === null) {
    return base;
  }
  return blendCamera(base, chaseCamera(ctx.ball), ctx.chase.position, ctx.chase.target);
}

function ballFrame(ctx: FrameContext): SceneFrame["ball"] {
  return { visible: ctx.ball !== null, position: ctx.ball ?? RELEASE_POINT };
}

/** 投手の関節ポーズ。idle は待機、windup は壁時計の進行 `u`、リリース後はフォロースルー(`t = 0` から)。 */
function pitcherJointsOf(ctx: FrameContext): JointPose {
  switch (ctx.input.phase) {
    case "idle":
      return pitcherWindupPose(0);
    case "windup":
      return pitcherWindupPose(ctx.input.windupU);
    case "flight":
    case "play":
      return pitcherFollowPose(ctx.tMs);
  }
}

function pitcherFrame(ctx: FrameContext): CharacterPose {
  return placeCharacter(pitcherJointsOf(ctx), ACTORS.pitcher);
}

/** 捕手は打撃カメラの視界を遮るので、中継カメラへの移り具合が `catcherVisibleBlend` に達してから表示する。 */
function catcherFrame(ctx: FrameContext): CharacterPose {
  return placeCharacter(catcherPose(), ACTORS.catcher, ctx.chase !== null && ctx.chase.position >= CHASE.catcherVisibleBlend);
}

function batterFrame(ctx: FrameContext): BatterPose {
  const swing = ctx.plan?.swing ?? null;
  const joints = swing === null ? batterStancePose() : batterSwingPose(swingProgressAt(swing, ctx.tMs), swing.height);
  return placeBatter(joints, ACTORS.batter);
}

/** 打球を追う野手。走っている間は走りのポーズ、到着後は待機姿勢で、向きは目的地の方向。 */
function runningFielderFrame(run: PlayFielder, tMs: number): CharacterPose {
  const span = run.arriveMs - run.startMs;
  const progress = span > 0 ? (tMs - run.startMs) / span : 1;
  const joints = progress < 1 ? fielderRunPose(tMs - run.startMs) : fielderIdlePose();
  const root = {
    position: fielderRunAt(run.from, run.to, progress),
    yaw: Math.atan2(run.to.x - run.from.x, run.to.z - run.from.z),
    scale: ACTORS.fielderScale,
  };
  return placeCharacter(joints, root);
}

/** 走らない野手は待機姿勢。打球が飛んでいる間はボールの方を向く。 */
function idleFielderFrame(ctx: FrameContext, slot: FielderSlot): CharacterPose {
  const yaw = ctx.batted === null ? 0 : Math.atan2(ctx.batted.x - slot.position.x, ctx.batted.z - slot.position.z);
  return placeCharacter(fielderIdlePose(), { position: slot.position, yaw, scale: ACTORS.fielderScale });
}

function fielderFrame(ctx: FrameContext, slot: FielderSlot, index: number): CharacterPose {
  const run = ctx.plan?.fielder ?? null;
  return run !== null && run.index === index && ctx.tMs >= run.startMs ? runningFielderFrame(run, ctx.tMs) : idleFielderFrame(ctx, slot);
}

function fieldersFrame(ctx: FrameContext): readonly CharacterPose[] {
  return FIELDER_SLOTS.map((slot, index) => fielderFrame(ctx, slot, index));
}

/** ゾーン枠は中継カメラに移り始めたら消す(カーソル・狙いのハイライトも同じ)。 */
function zoneFrame(ctx: FrameContext): SceneFrame["zone"] {
  return { visible: ctx.chase === null, grid: ctx.input.grid };
}

/** スイング区間(振り始めから振り切りまで = progress が 0 と 1 の間)だけ光らせる。 */
function isSwinging(ctx: FrameContext): boolean {
  const swing = ctx.plan?.swing ?? null;
  if (swing === null) {
    return false;
  }
  const progress = swingProgressAt(swing, ctx.tMs);
  return progress > 0 && progress < 1;
}

function cursorFrame(ctx: FrameContext): SceneFrame["cursor"] {
  const { cursor } = ctx.input;
  return {
    visible: cursor.visible && ctx.chase === null,
    position: zoneToWorld(cursor.point),
    scaleX: cursor.radii.rx * HALF_WIDTH,
    scaleY: cursor.radii.ry * ZONE_HALF_HEIGHT,
    flash: isSwinging(ctx),
  };
}

function aimFrame(ctx: FrameContext): SceneFrame["aim"] {
  const { aim } = ctx.input;
  return {
    visible: aim !== null && ctx.chase === null,
    position: cellToWorld(aim ?? CENTER_CELL),
    width: CELL_SPAN * HALF_WIDTH,
    height: CELL_SPAN * ZONE_HALF_HEIGHT,
  };
}

/** 時刻 `input.tMs` の画面の全状態。同じ入力は同じ結果になり、入力を変更しない。 */
export function sceneFrameAt(input: SceneFrameInput): SceneFrame {
  const ctx = contextOf(input);
  return {
    camera: cameraFrame(ctx),
    uniforms: { offense: input.uniforms.offense, defense: input.uniforms.defense },
    ball: ballFrame(ctx),
    pitcher: pitcherFrame(ctx),
    catcher: catcherFrame(ctx),
    batter: batterFrame(ctx),
    fielders: fieldersFrame(ctx),
    zone: zoneFrame(ctx),
    cursor: cursorFrame(ctx),
    aim: aimFrame(ctx),
  };
}
