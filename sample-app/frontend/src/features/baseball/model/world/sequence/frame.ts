import type { CursorRadii } from "../../../types/batting";
import type { ZonePoint } from "../../../types/common";
import type { CourseCell, PitchFlight } from "../../../types/pitch";
import type { BatterPose, CameraPose, CharacterPose, SafeArea, SceneFrame, SceneLayout, ScenePhase, UniformColors, Vec3 } from "../../../types/scene";
import { cellToPoint, clamp } from "../../pitch/zone";
import { ballScaleFor, battingCameraFor, blendCamera, chaseBlendAt, chaseCamera, portraitBlendAt } from "../camera/rig";
import { batterStancePose, batterSwingPose } from "../motion/batter";
import { catcherPose, fielderIdlePose, fielderRunPose } from "../motion/fielder";
import { pitcherFollowPose, pitcherWindupPose } from "../motion/pitcher";
import { type JointPose, type PoseRoot, placeBatter, placeCharacter } from "../motion/pose";
import { type BattedPlan, battedBallAt } from "../path/batted-path";
import { FIELDER_SLOTS, type FielderSlot, fielderRunAt } from "../path/fielders";
import { heldBallAt, pitchBallAt } from "../path/pitch-path";
import { ZONE_HALF_HEIGHT, cellToWorld, zoneToWorld } from "../space/coords";
import { RELEASE_POINT, WORLD_PARAMS } from "../space/params";
import { lerp } from "../space/vec3";
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
  /** 画面の縦横比(幅 / 高さ)。非有限・0 以下は 16/9 とみなす。構図(カメラ・打者の x)を決める。 */
  readonly aspect: number;
  /** 構図のレイアウト(`aimCell !== null` の人間守備は `"pitching"`、それ以外 `"batting"`)。 */
  readonly layout: SceneLayout;
  /** 空き領域(HUD の下端と下のオーバーレイの上端。画面高比)。`null` や無効(幅が小さすぎる等)は既定値で補う。 */
  readonly safeArea: SafeArea | null;
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
const FIT = WORLD_PARAMS.framing.fit;
const ZONE_PULSE = WORLD_PARAMS.cue.zonePulse;
const LANDING_MARK = WORLD_PARAMS.landingMark;

/** グリッドの1セルの幅(ゾーン単位。隣り合うセル中心の差から求める = 2/3)。 */
const CELL_SPAN = cellToPoint({ col: 3, row: 2 }).x - cellToPoint({ col: 2, row: 2 }).x;

/** 狙いが無いときの `aim.position`(中央のセル)。 */
const CENTER_CELL: CourseCell = { col: 2, row: 2 };

/** 縦横比が使えない(非有限・0 以下)ときに使う値(横長)。 */
const DEFAULT_ASPECT = 16 / 9;

/** フレームの各部分が共有する導出値。 */
type FrameContext = {
  readonly input: SceneFrameInput;
  /** `phase = "play"` のときだけ非 `null`。 */
  readonly plan: PlayPlan | null;
  /** 使える縦横比(非有限・0 以下は 16/9)。 */
  readonly aspect: number;
  /** 既定値で補った後の空き領域。 */
  readonly safeArea: SafeArea;
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

/**
 * 到達後(`tMs > durationMs`)の投球のボール。着弾点(ゾーン平面)に止め、ミットへは動かさない。
 * (a) plan が無い間(人間が振る/見逃すのを待っている間)は留める。(b) 接触ありの plan は接触の瞬間まで留める(それ以降は打球が優先される)。
 * (c) 接触なしの plan は `ballHoldUntilMs` まで留め、以降は非表示。消えるのは接触なしの plan ができた時刻以降に限り、再び現れない。
 */
function heldPitchBallOf(flight: PitchFlight, plan: PlayPlan | null, tMs: number): Vec3 | null {
  if (plan === null || plan.contactMs !== null || tMs <= plan.ballHoldUntilMs) {
    return heldBallAt(flight);
  }
  return null;
}

/** 投球のボール位置。`durationMs` まで `pitchBallAt`、以降は着弾点に留まる(`heldPitchBallOf`)。 */
function pitchedBallOf(flight: PitchFlight, plan: PlayPlan | null, tMs: number): Vec3 | null {
  return tMs <= flight.durationMs ? pitchBallAt(flight, tMs) : heldPitchBallOf(flight, plan, tMs);
}

/** ボールの位置。接触前は投球の軌道(plan が無い人間打者の判定待ちを含む)、接触後は打球。idle・windup は非表示。 */
function ballPositionOf(input: SceneFrameInput, plan: PlayPlan | null, batted: Vec3 | null, tMs: number): Vec3 | null {
  if (batted !== null) {
    return batted;
  }
  if (input.phase === "idle" || input.phase === "windup" || input.flight === null) {
    return null;
  }
  return pitchedBallOf(input.flight, plan, tMs);
}

function chaseOf(plan: PlayPlan | null, tMs: number): FrameContext["chase"] {
  if (plan === null || plan.chaseFromMs === null || tMs < plan.chaseFromMs) {
    return null;
  }
  return chaseBlendAt(tMs - plan.chaseFromMs);
}

/** 使える空き領域(有限で、幅が `minBandRatio` 以上)ならそのまま、そうでなければレイアウトの既定値。 */
function resolveSafeArea(layout: SceneLayout, safeArea: SafeArea | null): SafeArea {
  const fallback = layout === "pitching" ? FIT.defaultSafeArea.pitching : FIT.defaultSafeArea.batting;
  const usable = safeArea !== null && Number.isFinite(safeArea.top) && Number.isFinite(safeArea.bottom) && safeArea.bottom - safeArea.top >= FIT.minBandRatio;
  return usable ? { top: safeArea.top, bottom: safeArea.bottom } : { top: fallback.top, bottom: fallback.bottom };
}

function contextOf(input: SceneFrameInput): FrameContext {
  const plan = input.phase === "play" ? input.plan : null;
  const tMs = Math.max(0, input.tMs);
  const batted = battedBallOf(plan, tMs);
  return {
    input,
    plan,
    aspect: Number.isFinite(input.aspect) && input.aspect > 0 ? input.aspect : DEFAULT_ASPECT,
    safeArea: resolveSafeArea(input.layout, input.safeArea),
    tMs,
    batted,
    ball: ballPositionOf(input, plan, batted, tMs),
    chase: chaseOf(plan, tMs),
  };
}

/**
 * カメラ。接触前は縦横比・レイアウト・空き領域に合わせた打撃カメラ、接触後はそこから中継カメラへ blend する。
 * 中継カメラの lift は 0(打撃の lift を引き継がない)なので、blend の間に lift が 0 へ戻る。
 */
function cameraFrame(ctx: FrameContext): CameraPose {
  const base = battingCameraFor(ctx.aspect, ctx.input.layout, ctx.safeArea);
  if (ctx.chase === null || ctx.ball === null) {
    return base;
  }
  return blendCamera(base, chaseCamera(ctx.ball, ctx.aspect, 0), ctx.chase.position, ctx.chase.target);
}

/** ボール。中継カメラ中(`ctx.chase !== null`)だけ、最小表示径を保つ倍率 `scale` を掛ける(それ以外は 1)。 */
function ballFrame(ctx: FrameContext, camera: CameraPose): SceneFrame["ball"] {
  if (ctx.ball === null) {
    return { visible: false, position: RELEASE_POINT, scale: 1 };
  }
  return { visible: true, position: ctx.ball, scale: ctx.chase === null ? 1 : ballScaleFor(camera, ctx.ball) };
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

/**
 * バット高さを、ワールドでの高さ(m)から打者ローカルの値に直す。motion は構え・接触(`swing.height`)・巻き上げをワールドの高さで返すが、
 * バットは打者の root の子なので、描画では root の拡大率がかかり、足元の y が足される(ワールドの高さ = y + 拡大率 × ローカル値)。
 * 打ち消さないと、拡大率 0.92 の打者ではバットがボールより低くなる。
 */
function batHeightInRoot(worldHeight: number): number {
  return (worldHeight - ACTORS.batter.position.y) / ACTORS.batter.scale;
}

/** 打者の足元。x は横長 `position.x` から縦長 `portraitX` へ縦横比の補間 `k` で混ぜる(y・z は不変)。 */
function batterRoot(aspect: number): PoseRoot {
  const { position, portraitX, yaw, scale } = ACTORS.batter;
  return { position: { x: lerp(position.x, portraitX, portraitBlendAt(aspect)), y: position.y, z: position.z }, yaw, scale };
}

function batterFrame(ctx: FrameContext): BatterPose {
  const swing = ctx.plan?.swing ?? null;
  const portrait = portraitBlendAt(ctx.aspect);
  const joints = swing === null ? batterStancePose(portrait) : batterSwingPose(swingProgressAt(swing, ctx.tMs), swing.height, portrait);
  return placeBatter({ ...joints, bat: { ...joints.bat, height: batHeightInRoot(joints.bat.height) } }, batterRoot(ctx.aspect));
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

/**
 * 到達の手がかり(ゾーン枠の発光、0〜1)。ボールが `durationMs` でゾーン平面に着く瞬間に合わせる:
 * D − `leadMs` で 0 から立ち上がり、D 〜 D + `holdMs` は 1、そこから `fadeMs` かけて 0 に戻る。
 * `durationMs` が有限でない・`tMs` が有限でないときは 0。
 */
export function zonePulseAt(durationMs: number, tMs: number): number {
  const since = tMs - durationMs;
  if (!Number.isFinite(since) || since < -ZONE_PULSE.leadMs) {
    return 0;
  }
  if (since < 0) {
    return (since + ZONE_PULSE.leadMs) / ZONE_PULSE.leadMs;
  }
  return since <= ZONE_PULSE.holdMs ? 1 : clamp(1 - (since - ZONE_PULSE.holdMs) / ZONE_PULSE.fadeMs, 0, 1);
}

/** ゾーン枠は中継カメラに移り始めたら消す(カーソル・狙いのハイライトも同じ)。発光は投球があり飛行・演出中で、枠が見えている間だけ。 */
function zoneFrame(ctx: FrameContext): SceneFrame["zone"] {
  const { flight, phase } = ctx.input;
  const visible = ctx.chase === null;
  const pulsing = visible && flight !== null && (phase === "flight" || phase === "play");
  return { visible, grid: ctx.input.grid, pulse: pulsing ? zonePulseAt(flight.durationMs, ctx.tMs) : 0 };
}

/** 落下点のリングを出す打球か(フライ・ライナーでホームランでない。ファウルの飛球を含む)。 */
function marksLanding(batted: BattedPlan): boolean {
  return !batted.overFence && (batted.shape === "fly" || batted.shape === "liner");
}

/** リングの半径(m)。画面で表示高の `screenRatio` 相当の長さと `minRadius` の大きい方。 */
function landingMarkRadius(camera: CameraPose, center: Vec3): number {
  const dist = Math.hypot(center.x - camera.position.x, center.y - camera.position.y, center.z - camera.position.z);
  const visibleHeight = 2 * dist * Math.tan((camera.fovDeg * Math.PI) / 360);
  return Math.max(LANDING_MARK.minRadius, LANDING_MARK.screenRatio * visibleHeight);
}

/** 落下点のリング。接触 `startAfterContactMs` 後から落下 `endAfterLandMs` 後まで、`batted.end` の地面に出す。 */
function landingMarkFrame(ctx: FrameContext, camera: CameraPose): SceneFrame["landingMark"] {
  const batted = ctx.plan?.batted ?? null;
  const contactMs = ctx.plan?.contactMs ?? null;
  if (batted === null || contactMs === null || !marksLanding(batted)) {
    return { visible: false, position: { x: 0, y: LANDING_MARK.y, z: 0 }, radius: 0 };
  }
  const position: Vec3 = { x: batted.end.x, y: LANDING_MARK.y, z: batted.end.z };
  const shown = ctx.tMs >= contactMs + LANDING_MARK.startAfterContactMs && ctx.tMs <= contactMs + batted.hangMs + LANDING_MARK.endAfterLandMs;
  return { visible: shown, position, radius: shown ? landingMarkRadius(camera, position) : 0 };
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
  const camera = cameraFrame(ctx);
  return {
    camera,
    layout: input.layout,
    safeArea: ctx.safeArea,
    uniforms: { offense: input.uniforms.offense, defense: input.uniforms.defense },
    ball: ballFrame(ctx, camera),
    pitcher: pitcherFrame(ctx),
    catcher: catcherFrame(ctx),
    batter: batterFrame(ctx),
    fielders: fieldersFrame(ctx),
    zone: zoneFrame(ctx),
    landingMark: landingMarkFrame(ctx, camera),
    cursor: cursorFrame(ctx),
    aim: aimFrame(ctx),
  };
}
