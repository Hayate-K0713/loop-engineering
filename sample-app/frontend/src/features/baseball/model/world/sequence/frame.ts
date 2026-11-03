import type { AssistParams, CursorRadii } from "../../../types/batting";
import type { ZonePoint } from "../../../types/common";
import type { BaseTo, Bases } from "../../../types/game";
import type { PitchFlight } from "../../../types/pitch";
import type {
  BatterPose,
  CameraPose,
  CharacterPose,
  CharacterSlot,
  FaceExpression,
  SafeArea,
  SceneFrame,
  SceneLayout,
  ScenePhase,
  SceneWipe,
  UniformColors,
  Vec3,
} from "../../../types/scene";
import type { BatStance, PitchForm } from "../../../types/team";
import { previewCenterOf } from "../../batting/assist";
import { type ExpressionRole, expressionAt, roleOfSlotIndex } from "../../character/expression";
import { framingScaleAt } from "../../character/framing-scale";
import { CHARACTER_SLOTS } from "../../character/look";
import { clamp } from "../../pitch/zone";
import { infieldBlendAt, infieldCameraFor } from "../camera/infield";
import {
  ballScaleFor,
  battingCameraFor,
  blendCamera,
  chaseBlendAt,
  chaseCamera,
  outlineScaleFor,
  portraitBlendAt,
  ringWidthFor,
  usableSafeArea,
} from "../camera/rig";
import { INTRO_WIPE_MS, wipeAlphaAt, wipeCameraFor, wipeRectFor, wipeStageAt } from "../camera/wipe";
import { batterStancePose, batterSwingPose } from "../motion/batter";
import { batLengthScaleFor, batterRootFor } from "../motion/batter-layout";
import { catcherPose, fielderRunPose } from "../motion/fielder";
import {
  dejectedPose,
  fielderCatchPose,
  fielderGroundCatchPose,
  fielderReadyPose,
  fielderThrowPose,
  fistPumpPose,
  groundDropOf,
  runnerJoyPose,
  runnerLeadPose,
  runnerRunPose,
} from "../motion/forms";
import { pitcherFollowPose, pitcherWindupPose } from "../motion/pitcher";
import { type BatterJoints, type JointPose, lerpPose, type PoseRoot, placeBatter, placeCharacter, smoothstep } from "../motion/pose";
import { type BattedPlan, battedBallAt } from "../path/batted-path";
import { FIELDER_SLOTS, type FielderSlot, fielderRunAt, type ThrowPlan, throwBallAt } from "../path/fielders";
import { heldBallAt, pitchBallAt } from "../path/pitch-path";
import { baseWorldPosition, type RunnerMotion, type RunnerSlot, runnerPositionAt, runnerStandPosition, runnerYawAt } from "../path/runners";
import { ZONE_HALF_HEIGHT, zoneToWorld } from "../space/coords";
import { RELEASE_POINT, WORLD_PARAMS } from "../space/params";
import { lerp, lerpVec3 } from "../space/vec3";
import { ballHaloAt, ballSpinAt } from "./ball-look";
import { guideFrameAt, HIDDEN_GUIDE } from "./guide";
import { type PlayFielder, type PlayFielding, type PlayPlan, swingProgressAt } from "./play-plan";

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
  /**
   * スイングカーソル(人間打撃中のみ `visible`)。`point` = 判定と表示に使う有効カーソル(ロックオン適用後。hooks が `lockOnCursor` で作る)、
   * `raw` = 指で動かした素のカーソル(有効カーソルと離れているときだけ薄い印を出す)。
   */
  readonly cursor: { readonly visible: boolean; readonly point: ZonePoint; readonly raw: ZonePoint; readonly radii: CursorRadii };
  /** 打撃のアシスト(予告の見せ方 `preview`・`fade` の半径とずれ)。難易度から `assistFor` で引いた値を渡す。 */
  readonly assist: AssistParams;
  /** 5×5 格子の表示(人間守備)。 */
  readonly grid: boolean;
  /** 投手の投球フォームと打者の構え(`PlayerLook.pitchForm`・`batStance`)。 */
  readonly forms: { readonly pitch: PitchForm; readonly bat: BatStance };
  /** 塁上の走者(動かないとき・`plan.runners` が無いときの立ち位置。`plan.runners` がある間は進塁の事実を優先する)。 */
  readonly bases: Bases;
  /** まばたき用の連続した時計(ms)。投球の時計 `tMs` が止まる `idle`・`windup` の間も進める。 */
  readonly clockMs: number;
  /** 打席の紹介(打者の顔のワイプ)を始めてからの経過(ms)。出さないときは `null`。`idle`・`windup` の間だけ有効。 */
  readonly introMs: number | null;
  /** ステージの高さ(CSS px)。ワイプの矩形(px)の位置を決める。非有限・0 以下は 844。 */
  readonly viewHeightPx: number;
};

const ACTORS = WORLD_PARAMS.actors;
const HALF_WIDTH = WORLD_PARAMS.zone.halfWidth;
const CHASE = WORLD_PARAMS.chaseCamera;
const SWING = WORLD_PARAMS.swing;
const ZONE_PULSE = WORLD_PARAMS.cue.zonePulse;
const LANDING_MARK = WORLD_PARAMS.landingMark;
const BALL = WORLD_PARAMS.ball;
const GUIDE = WORLD_PARAMS.guide;
const CATCH = WORLD_PARAMS.catch;

/** 素のカーソルの印を出す、有効カーソルとの最小の距離(ゾーン単位。390×844 で約 4px)。これより近いと印は有効カーソルに隠れるので出さない。 */
const RAW_MARK_MIN_DISTANCE = 0.05;

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
  /** 内野カメラへの移り具合(0〜1)。走者が動くプレーの `infieldFromMs` から。動かないプレーは 0。 */
  readonly infield: number;
  /** カメラが動いている度合い(追跡カメラの位置 blend と内野カメラの blend の大きい方)。表示倍率 `framingScaleAt` に渡す。 */
  readonly cameraBlend: number;
  /** 打撃・守備のカメラのまま(追跡・内野カメラへ移り始めていない)。ゾーン枠・カーソルを出す条件。 */
  readonly battingView: boolean;
  /** 打者が打者走者になって打席から消えた(走者が動くプレーで走り出した)。 */
  readonly batterGone: boolean;
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

/** 送球のボールの高さ込みの位置(送球の始点・終点は野手の手・捕球の高さ)。 */
function carriedBallOf(fielding: PlayFielding, batted: Vec3, tMs: number): Vec3 {
  const first = fielding.throws.at(0);
  if (first === undefined || tMs < fielding.baseMs) {
    return batted;
  }
  if (tMs < first.startMs) {
    return lerpVec3(batted, first.from, smoothstep((tMs - fielding.baseMs) / (first.startMs - fielding.baseMs)));
  }
  const active = fielding.throws.filter((entry) => entry.startMs <= tMs).at(-1) ?? first;
  return throwBallAt(active, tMs);
}

/**
 * 接触後のボール。打球の終点に止まるが、ゴロを送球するプレーは野手が捕って(`baseMs`〜最初の送球の始点)手元へ寄せ、
 * 送球(`throwBallAt`)の間はそのボール、最後の送球の後は受け手のグローブに留まる。
 */
function afterContactBallOf(plan: PlayPlan | null, batted: Vec3, tMs: number): Vec3 {
  const fielding = plan?.fielding ?? null;
  return fielding === null ? batted : carriedBallOf(fielding, batted, tMs);
}

/** ボールの位置。接触前は投球の軌道(plan が無い人間打者の判定待ちを含む)、接触後は打球(送球があれば送球)。idle・windup は非表示。 */
function ballPositionOf(input: SceneFrameInput, plan: PlayPlan | null, batted: Vec3 | null, tMs: number): Vec3 | null {
  if (batted !== null) {
    return afterContactBallOf(plan, batted, tMs);
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

/** 内野カメラへの移り具合(0〜1)。走者が動くプレーの `infieldFromMs` から。 */
function infieldOf(plan: PlayPlan | null, tMs: number): number {
  return plan === null || plan.infieldFromMs === null ? 0 : infieldBlendAt(tMs - plan.infieldFromMs);
}

/** 打者が打者走者になって消えたか(打者走者が走るプレーで、走り出してから)。 */
function batterGoneOf(plan: PlayPlan | null, tMs: number): boolean {
  const runners = plan?.runners ?? null;
  const motion = runners?.plan.motions.at(0) ?? null;
  return runners !== null && motion !== null && motion.durationMs > 0 && tMs >= runners.startMs;
}

function contextOf(input: SceneFrameInput): FrameContext {
  const plan = input.phase === "play" ? input.plan : null;
  const tMs = Math.max(0, input.tMs);
  const batted = battedBallOf(plan, tMs);
  const chase = chaseOf(plan, tMs);
  const infield = infieldOf(plan, tMs);
  return {
    input,
    plan,
    aspect: Number.isFinite(input.aspect) && input.aspect > 0 ? input.aspect : DEFAULT_ASPECT,
    safeArea: usableSafeArea(input.layout, input.safeArea),
    tMs,
    batted,
    ball: ballPositionOf(input, plan, batted, tMs),
    chase,
    infield,
    cameraBlend: Math.max(chase?.position ?? 0, infield),
    battingView: chase === null && infield === 0,
    batterGone: batterGoneOf(plan, tMs),
  };
}

/**
 * カメラ。接触前は縦横比・レイアウト・空き領域に合わせた打撃カメラ、接触後はそこから中継カメラへ blend する。
 * 中継カメラの lift は 0(打撃の lift を引き継がない)なので、blend の間に lift が 0 へ戻る。
 * 走者が動くプレーは、落下後にさらに内野カメラ(`infieldCameraFor`。lift 0)へ blend する(追跡カメラは打球を追い続けるので、blend の起点は連続する)。
 */
function cameraFrame(ctx: FrameContext): CameraPose {
  const base = battingCameraFor(ctx.aspect, ctx.input.layout, ctx.safeArea);
  const chased =
    ctx.chase === null || ctx.batted === null ? base : blendCamera(base, chaseCamera(ctx.batted, ctx.aspect, 0), ctx.chase.position, ctx.chase.target);
  return ctx.infield === 0 ? chased : blendCamera(chased, infieldCameraFor(ctx.aspect), ctx.infield);
}

/**
 * 縫い目の回転に使う経過時間(ms)。接触前は到達 `D` で止める(着弾点で待つ間は回らない)、接触後は `D` から連続して進める。
 * 投球が無い(`flight = null`)ときは `tMs` のまま。
 */
function spinMsOf(ctx: FrameContext): number {
  const { flight } = ctx.input;
  if (flight === null) {
    return ctx.tMs;
  }
  const contactMs = ctx.plan?.contactMs ?? null;
  return ctx.batted === null || contactMs === null ? Math.min(ctx.tMs, flight.durationMs) : flight.durationMs + (ctx.tMs - contactMs);
}

/**
 * ボール。`scale` は最小表示径を保つ倍率(1 以上): 中継カメラ中(`ctx.chase !== null`)は `minScreenDiameterRatio`、
 * それ以外(打撃カメラの飛行中)は `minScreenDiameterRatioFlight`。`outlineScale` は縁取りの殻が画面で 2px 以上になる倍率。
 * 非表示のときも `rotation`・`halo`・`outlineScale` は有限の値を返す。
 */
function ballFrame(ctx: FrameContext, camera: CameraPose): SceneFrame["ball"] {
  const kind = ctx.input.flight?.kind ?? "straight";
  if (ctx.ball === null) {
    return {
      visible: false,
      position: RELEASE_POINT,
      scale: 1,
      rotation: ballSpinAt(kind, 0),
      halo: ballHaloAt(),
      outlineScale: outlineScaleFor(camera, RELEASE_POINT, 1),
    };
  }
  const scale = ballScaleFor(camera, ctx.ball, ctx.battingView ? BALL.minScreenDiameterRatioFlight : BALL.minScreenDiameterRatio);
  return {
    visible: true,
    position: ctx.ball,
    scale,
    rotation: ballSpinAt(kind, spinMsOf(ctx)),
    halo: ballHaloAt(),
    outlineScale: outlineScaleFor(camera, ctx.ball, scale),
  };
}

// ---------- キャラクター(表情・フォーム・表示倍率・走者・守備) ----------

/** 感情のポーズ(うなだれる・ガッツポーズ)へ移る時間(ms)と、結果の時刻からの遅れ(ms)。 */
const EMOTION_RAMP_MS = 300;
const EMOTION_DELAY_MS = 150;
/** 送球: リリースの前に構え始める時間・構えへ切り替える時間・リリース後の振り切りの時間(ms)。 */
const THROW_WIND_MS = 150;
const THROW_BLEND_MS = 100;
const THROW_FOLLOW_MS = 300;
/** 送球を受ける野手が塁へ寄り始める、送球の始点からの先行(ms)。 */
const RECEIVE_LEAD_MS = 200;
/** 捕球のグローブを置く位置: 野手の足元から落下点の方へ最大この距離(m)、高さ(m)。 */
const GLOVE_REACH_M = 0.5;
const GLOVE_HEIGHT_CATCH = 1.2;
const GLOVE_HEIGHT_GROUND = 0.12;

const FIRST_RUNNER_INDEX = CHARACTER_SLOTS.indexOf("runner0");
const FIRST_FIELDER_INDEX = CHARACTER_SLOTS.indexOf("fielder0");
const RUNNER_SLOTS: readonly RunnerSlot[] = [0, 1, 2, 3];

/** 足が浮くポーズ(しゃがむ・かがむ)で、低い方の足が地面に着くよう根を `groundDropOf × scale` だけ下げて配置する。 */
function placeGrounded(joints: JointPose, root: PoseRoot, visible: boolean, expression: FaceExpression): CharacterPose {
  const drop = groundDropOf(joints) * root.scale;
  return placeCharacter(joints, { ...root, position: { ...root.position, y: root.position.y - drop } }, visible, expression);
}

/** 2 つの角度の間を、短い方の回りで補間する。 */
function lerpAngle(a: number, b: number, k: number): number {
  return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
}

/** `joints` から感情のポーズ `emotion` へ、`sinceMs` から `EMOTION_RAMP_MS` かけて移る(`sinceMs ≤ 0` は `joints` のまま)。 */
function withEmotion(joints: JointPose, emotion: JointPose, sinceMs: number): JointPose {
  const k = smoothstep(sinceMs / EMOTION_RAMP_MS);
  return k > 0 ? lerpPose(joints, emotion, k) : joints;
}

/** 表情(`expressionAt`)。投球の時計が止まる `idle`・`windup` では、まばたきだけ `clockMs` で進める。 */
function expressionFor(ctx: FrameContext, role: ExpressionRole, slotIndex: number): FaceExpression {
  const { phase, clockMs } = ctx.input;
  const waiting = phase === "idle" || phase === "windup";
  return expressionAt({ role, phase, plan: ctx.plan, outcome: ctx.plan?.outcome ?? null, tMs: waiting ? clockMs : ctx.tMs, slotIndex });
}

function expressionOf(ctx: FrameContext, slot: CharacterSlot): FaceExpression {
  const slotIndex = CHARACTER_SLOTS.indexOf(slot);
  return expressionFor(ctx, roleOfSlotIndex(slotIndex), slotIndex);
}

/** 投手の関節ポーズ。idle は待機、windup は壁時計の進行 `u`、リリース後はフォロースルー(`t = 0` から)。フォームは `forms.pitch`。 */
function pitcherJointsOf(ctx: FrameContext): JointPose {
  const form = ctx.input.forms.pitch;
  switch (ctx.input.phase) {
    case "idle":
      return pitcherWindupPose(0, form);
    case "windup":
      return pitcherWindupPose(ctx.input.windupU, form);
    case "flight":
    case "play":
      return pitcherFollowPose(ctx.tMs, form);
  }
}

/** 三振を取ったら、結果の少し後からガッツポーズへ移る。 */
function pitcherEmotionOf(ctx: FrameContext, joints: JointPose): JointPose {
  const plan = ctx.plan;
  if (plan === null || plan.outcome.plate !== "strikeout") {
    return joints;
  }
  return withEmotion(joints, fistPumpPose(), ctx.tMs - ((plan.contactMs ?? plan.durationMs) + EMOTION_DELAY_MS));
}

/** 投手。表示倍率は縦長の構図の 1.30 から、追跡・内野カメラへの blend に合わせて 1.0 へ戻る。 */
function pitcherFrame(ctx: FrameContext): CharacterPose {
  const scale = framingScaleAt("pitcher", ctx.cameraBlend);
  const root: PoseRoot = { position: ACTORS.pitcher.position, yaw: ACTORS.pitcher.yaw, scale };
  return placeCharacter(pitcherEmotionOf(ctx, pitcherJointsOf(ctx)), root, true, expressionOf(ctx, "pitcher"));
}

/** 捕手は打撃カメラの視界を遮るので、カメラの移り具合(追跡・内野)が `catcherVisibleBlend` に達してから表示する。 */
function catcherFrame(ctx: FrameContext): CharacterPose {
  const scale = ACTORS.catcher.scale * framingScaleAt("catcher", ctx.cameraBlend);
  const root: PoseRoot = { position: ACTORS.catcher.position, yaw: ACTORS.catcher.yaw, scale };
  return placeCharacter(catcherPose(), root, ctx.cameraBlend >= CHASE.catcherVisibleBlend, expressionOf(ctx, "catcher"));
}

/**
 * バット高さを、ワールドでの高さ(m)から打者ローカルの値に直す。motion は構え・接触(`swing.height`)・巻き上げをワールドの高さで返すが、
 * バットは打者の root の子なので、描画では root の拡大率がかかり、足元の y が足される(ワールドの高さ = y + 拡大率 × ローカル値)。
 * 打ち消さないと、拡大率の小さい打者ではバットがボールより低くなる。`rootScale` は表示中の拡大率(縦横比の補間と、カメラの blend を含む)。
 */
function batHeightInRoot(worldHeight: number, rootScale: number): number {
  return (worldHeight - ACTORS.batter.position.y) / rootScale;
}

/** 打者の関節ポーズ(構え or スイング)。構えの種類は `forms.bat`。 */
function batterJointsOf(ctx: FrameContext): BatterJoints {
  const swing = ctx.plan?.swing ?? null;
  const portrait = portraitBlendAt(ctx.aspect);
  const stance = ctx.input.forms.bat;
  return swing === null ? batterStancePose(portrait, stance) : batterSwingPose(swingProgressAt(swing, ctx.tMs), swing.height, portrait, stance);
}

/** 三振したら、結果(スイング後・見逃しの判定)の少し後からうなだれる。バットは動かさない。 */
function batterEmotionOf(ctx: FrameContext, joints: BatterJoints): BatterJoints {
  const plan = ctx.plan;
  if (plan === null || plan.outcome.plate !== "strikeout") {
    return joints;
  }
  const resultMs = plan.swing === null ? plan.durationMs : plan.swing.contactAtMs + (SWING.followEndProgress - SWING.contactRatio) * SWING.durationMs;
  return { ...withEmotion(joints, dejectedPose(), ctx.tMs - (resultMs + EMOTION_DELAY_MS)), bat: joints.bat };
}

/**
 * 打者。足元・向きは `batterRootFor(aspect)`、表示倍率は縦横比の補間後の値から追跡・内野カメラの blend で 1.0 へ戻る。
 * バット軸の長さは `batLengthScaleFor(aspect)`(縦長の縮小に合わせて伸ばす)。打者走者として走り出したら消える(走者の枠に代わる)。
 */
function batterFrame(ctx: FrameContext): BatterPose {
  const root = batterRootFor(ctx.aspect);
  const scale = lerp(root.scale, 1, ctx.cameraBlend);
  const joints = batterEmotionOf(ctx, batterJointsOf(ctx));
  const bat = { ...joints.bat, height: batHeightInRoot(joints.bat.height, scale), lengthScale: batLengthScaleFor(ctx.aspect) };
  return placeBatter({ ...joints, bat }, { ...root, scale }, !ctx.batterGone, expressionOf(ctx, "batter"));
}

// ---------- 野手 ----------

type ActorState = { readonly joints: JointPose; readonly position: Vec3; readonly yaw: number };

/** 野手の足元から落下点 `end` の方へ最大 `GLOVE_REACH_M` 先の、高さ `height` の点(グローブの置き場)。 */
function gloveTargetOf(stop: Vec3, end: Vec3, height: number): Vec3 {
  const dx = end.x - stop.x;
  const dz = end.z - stop.z;
  const dist = Math.hypot(dx, dz);
  const k = dist > 0 ? Math.min(dist, GLOVE_REACH_M) / dist : 0;
  return { x: stop.x + dx * k, y: height, z: stop.z + dz * k };
}

/** 打球を処理する野手の、到着後の姿勢。フライ・ライナー = 捕球、ゴロ = ゴロ捕球、安打・失策(と送球しない結果)= 待機(構え)。 */
function fieldingPoseOf(fielding: PlayFielding | null, batted: BattedPlan | null, root: PoseRoot): JointPose {
  if (fielding === null || batted === null) {
    return fielderReadyPose();
  }
  switch (fielding.pose) {
    case "catch":
      return fielderCatchPose(root, gloveTargetOf(fielding.stop, batted.end, GLOVE_HEIGHT_CATCH));
    case "scoop":
      return fielderGroundCatchPose(root, gloveTargetOf(fielding.stop, batted.end, GLOVE_HEIGHT_GROUND));
    case "field":
      return fielderReadyPose();
  }
}

/** 送球する野手の姿勢と向き。リリースの `THROW_WIND_MS` 前から構えに切り替え、リリース後は振り切る(`fielderThrowPose` の u: 0 構え → 1 リリース → 1.5)。 */
function throwOverlay(ctx: FrameContext, index: number, state: ActorState): ActorState {
  const throwing: ThrowPlan | undefined = ctx.plan?.fielding?.throws.find((entry) => entry.fromIndex === index);
  if (throwing === undefined) {
    return state;
  }
  const windSince = ctx.tMs - (throwing.startMs - THROW_WIND_MS);
  const weight = smoothstep(windSince / THROW_BLEND_MS);
  if (weight <= 0) {
    return state;
  }
  const u = ctx.tMs < throwing.startMs ? windSince / THROW_WIND_MS : Math.min(1.5, 1 + (ctx.tMs - throwing.startMs) / THROW_FOLLOW_MS);
  const aim = Math.atan2(throwing.to.x - state.position.x, throwing.to.z - state.position.z);
  return { joints: lerpPose(state.joints, fielderThrowPose(u), weight), position: state.position, yaw: lerpAngle(state.yaw, aim, weight) };
}

/** 打球を追う野手の状態。走っている間は走りのポーズ、到着後は結果に応じた捕球・ゴロ捕球・待機で、向きは目的地の方向。 */
function activeFielderState(ctx: FrameContext, run: PlayFielder): ActorState {
  const yaw = Math.atan2(run.to.x - run.from.x, run.to.z - run.from.z);
  if (ctx.tMs < run.arriveMs) {
    const progress = (ctx.tMs - run.startMs) / (run.arriveMs - run.startMs);
    return { joints: fielderRunPose(ctx.tMs - run.startMs), position: fielderRunAt(run.from, run.to, progress), yaw };
  }
  const root: PoseRoot = { position: run.to, yaw, scale: ACTORS.fielderScale };
  const joints = fieldingPoseOf(ctx.plan?.fielding ?? null, ctx.plan?.batted ?? null, root);
  return throwOverlay(ctx, run.index, { joints, position: run.to, yaw });
}

/** 送球を受ける野手は、送球の少し前から塁へ寄って構える。 */
function receiverPosition(ctx: FrameContext, slot: FielderSlot, index: number): Vec3 {
  const receive = ctx.plan?.fielding?.throws.find((entry) => entry.toIndex === index);
  if (receive === undefined) {
    return slot.position;
  }
  const k = smoothstep((ctx.tMs - (receive.startMs - RECEIVE_LEAD_MS)) / (receive.arriveMs - receive.startMs + RECEIVE_LEAD_MS));
  return lerpVec3(slot.position, baseWorldPosition(receive.target), k);
}

/** 走らない野手は構え(膝に手)。打球が飛んでいる間はボールの方を向く。送球を受ける・投げる野手はそれに合わせる。 */
function supportFielderState(ctx: FrameContext, slot: FielderSlot, index: number): ActorState {
  const yaw = ctx.batted === null ? 0 : Math.atan2(ctx.batted.x - slot.position.x, ctx.batted.z - slot.position.z);
  return throwOverlay(ctx, index, { joints: fielderReadyPose(), position: receiverPosition(ctx, slot, index), yaw });
}

function fielderFrame(ctx: FrameContext, slot: FielderSlot, index: number): CharacterPose {
  const run = ctx.plan?.fielder ?? null;
  const active = run !== null && run.index === index && ctx.tMs >= run.startMs;
  const state = active ? activeFielderState(ctx, run) : supportFielderState(ctx, slot, index);
  const characterSlot = CHARACTER_SLOTS.at(FIRST_FIELDER_INDEX + index) ?? "fielder0";
  const scale = ACTORS.fielderScale * framingScaleAt(characterSlot, ctx.cameraBlend);
  return placeGrounded(state.joints, { position: state.position, yaw: state.yaw, scale }, true, expressionOf(ctx, characterSlot));
}

function fieldersFrame(ctx: FrameContext): readonly CharacterPose[] {
  return FIELDER_SLOTS.map((slot, index) => fielderFrame(ctx, slot, index));
}

// ---------- 走者 ----------

type RunnerState = ActorState & { readonly visible: boolean };

/** 走者の立ち姿(リード)。向きは次の塁の方。打者走者(`from = 0`)は打席の向き、本塁は正面(+z)。 */
function runnerStandYaw(base: BaseTo): number {
  switch (base) {
    case 0:
      return ACTORS.batter.yaw;
    case 1:
      return yawBetween(runnerStandPosition(1), baseWorldPosition(2));
    case 2:
      return yawBetween(runnerStandPosition(2), baseWorldPosition(3));
    case 3:
      return yawBetween(runnerStandPosition(3), baseWorldPosition(4));
    case 4:
      return 0;
  }
}

/** `from` から `to` の方を向く yaw(0 = +z、π/2 = +x)。 */
function yawBetween(from: Vec3, to: Vec3): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

function standingRunner(base: BaseTo, visible: boolean): RunnerState {
  return { visible, joints: runnerLeadPose(), position: runnerStandPosition(base), yaw: runnerStandYaw(base) };
}

/** 動かない走者の表示(`plan.runners` が無い間)。塁上にいる走者だけ、リードの位置に立つ。打者走者の枠は出さない。 */
function basesRunner(ctx: FrameContext, slot: RunnerSlot): RunnerState {
  const { bases } = ctx.input;
  const occupied = [false, bases.first, bases.second, bases.third].at(slot) ?? false;
  return standingRunner(slot, occupied && slot !== 0);
}

/** アウトの走者が止まるまでの走行時間(走り出しから ms)。アウトでない・守備の計画に成立の時刻がなければ `null`。 */
function stoppedAtOf(ctx: FrameContext, motion: RunnerMotion, startMs: number): number | null {
  const retire = motion.fate === "out" ? ctx.plan?.fielding?.retires.find((entry) => entry.slot === motion.slot) : undefined;
  return retire === undefined ? null : Math.min(Math.max(retire.atMs - startMs, 0), motion.durationMs);
}

/** 走り終えた(または走らない)走者。生還 = 本塁で喜ぶ、アウト = うなだれる、それ以外 = 到達した塁でリード。 */
function finishedRunner(motion: RunnerMotion, sinceMs: number, stoppedAtMs: number | null): RunnerState {
  const position = runnerPositionAt(motion, stoppedAtMs ?? sinceMs);
  if (motion.durationMs > 0 && motion.fate === "scored") {
    return { visible: true, joints: runnerJoyPose(sinceMs - motion.durationMs), position, yaw: 0 };
  }
  if (motion.fate === "out" && stoppedAtMs !== null) {
    return { visible: true, joints: dejectedPose(), position, yaw: runnerYawAt(motion, stoppedAtMs, 0) };
  }
  return { visible: true, joints: runnerLeadPose(), position, yaw: runnerStandYaw(motion.durationMs > 0 ? motion.to : motion.from) };
}

/**
 * 計画された走者。`startMs` より前は出発の塁に立ち(打者走者は打者として描かれるので出さない)、走っている間は経路上を走り、
 * 終わったら `finishedRunner`。アウトの走者は守備の計画の成立の時刻で止まる。
 */
function plannedRunner(ctx: FrameContext, motion: RunnerMotion, startMs: number): RunnerState {
  const sinceMs = ctx.tMs - startMs;
  if (sinceMs < 0) {
    return standingRunner(motion.from, motion.slot !== 0);
  }
  const stoppedAtMs = stoppedAtOf(ctx, motion, startMs);
  const runMs = stoppedAtMs === null ? sinceMs : Math.min(sinceMs, stoppedAtMs);
  if (runMs < (stoppedAtMs ?? motion.durationMs)) {
    const yaw = runnerYawAt(motion, runMs, runnerStandYaw(motion.from));
    return { visible: true, joints: runnerRunPose(runMs), position: runnerPositionAt(motion, runMs), yaw };
  }
  return finishedRunner(motion, sinceMs, stoppedAtMs);
}

function runnerStateOf(ctx: FrameContext, slot: RunnerSlot): RunnerState {
  const runners = ctx.plan?.runners ?? null;
  if (runners === null) {
    return basesRunner(ctx, slot);
  }
  const motion = runners.plan.motions.at(slot) ?? null;
  return motion === null ? standingRunner(slot, false) : plannedRunner(ctx, motion, runners.startMs);
}

/** 走者の表情。打者走者は、生還するまでは打者のときの表情(ヒットの喜びなど)を引き継ぐ。 */
function runnerExpressionOf(ctx: FrameContext, slot: RunnerSlot): FaceExpression {
  const slotIndex = FIRST_RUNNER_INDEX + slot;
  const runnerLike = expressionFor(ctx, "runner", slotIndex);
  return slot === 0 && runnerLike !== "cheer" ? expressionFor(ctx, "batter", slotIndex) : runnerLike;
}

/** 走者の表示倍率。打者走者は打者の倍率から 1.0 へ(カメラの blend に合わせる)、塁上の走者は野手と同じ。 */
function runnerScaleOf(ctx: FrameContext, slot: RunnerSlot): number {
  return slot === 0 ? lerp(batterRootFor(ctx.aspect).scale, 1, ctx.cameraBlend) : ACTORS.fielderScale;
}

function runnerFrame(ctx: FrameContext, slot: RunnerSlot): CharacterPose {
  const state = runnerStateOf(ctx, slot);
  const root: PoseRoot = { position: state.position, yaw: state.yaw, scale: runnerScaleOf(ctx, slot) };
  return placeGrounded(state.joints, root, state.visible, runnerExpressionOf(ctx, slot));
}

function runnersFrame(ctx: FrameContext): readonly CharacterPose[] {
  return RUNNER_SLOTS.map((slot) => runnerFrame(ctx, slot));
}

// ---------- ワイプ ----------

/** いま出しているワイプ(場面の経過と長さ)。打席の紹介は `idle`・`windup` の間だけ、それ以外は `plan.wipe` の区間。 */
function activeWipeOf(ctx: FrameContext): { readonly target: CharacterSlot; readonly sinceMs: number; readonly lengthMs: number } | null {
  const { phase, introMs } = ctx.input;
  if ((phase === "idle" || phase === "windup") && introMs !== null) {
    return { target: "batter", sinceMs: introMs, lengthMs: INTRO_WIPE_MS };
  }
  const stage = ctx.plan === null ? null : wipeStageAt(ctx.plan.wipe, ctx.tMs);
  return stage === null ? null : { target: stage.target, sinceMs: ctx.tMs - stage.startMs, lengthMs: stage.endMs - stage.startMs };
}

/**
 * ワイプ。対象は打者(打者走者になっていれば同じ人物の `runner0`)・投手のいずれかで、顔を正面から撮る。
 * 矩形は HUD の下端 + 20px から 94×94px(画面の px)。出していないときも、カメラと矩形は有限の値を返す(`visible = false`・`alpha = 0`)。
 */
function wipeFrame(ctx: FrameContext, poses: readonly CharacterPose[], fallback: CharacterPose): SceneWipe {
  const active = activeWipeOf(ctx);
  const requested = active?.target ?? "batter";
  const target: CharacterSlot = requested === "batter" && ctx.batterGone ? "runner0" : requested;
  const pose = poses.at(CHARACTER_SLOTS.indexOf(target)) ?? fallback;
  const alpha = active === null ? 0 : wipeAlphaAt(active.sinceMs, active.lengthMs);
  const rect = wipeRectFor(ctx.aspect, ctx.input.viewHeightPx, ctx.safeArea.top);
  return { visible: alpha > 0, target, camera: wipeCameraFor(pose), rect, alpha };
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
  const visible = ctx.battingView;
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

/** スイングカーソル(有効カーソル)と、素のカーソルの印。素の印は有効カーソルと `RAW_MARK_MIN_DISTANCE` 以上離れているときだけ出す。 */
function cursorFrame(ctx: FrameContext): SceneFrame["cursor"] {
  const { cursor } = ctx.input;
  const shown = cursor.visible && ctx.battingView;
  const apart = Math.hypot(cursor.raw.x - cursor.point.x, cursor.raw.y - cursor.point.y) >= RAW_MARK_MIN_DISTANCE;
  return {
    visible: shown,
    position: zoneToWorld(cursor.point),
    scaleX: cursor.radii.rx * HALF_WIDTH,
    scaleY: cursor.radii.ry * ZONE_HALF_HEIGHT,
    flash: isSwinging(ctx),
    raw: { visible: shown && apart, position: zoneToWorld(cursor.raw) },
  };
}

/**
 * 着弾点の予告を消す時刻(ms)。接触なしの plan はボールが消える時刻(`ballHoldUntilMs` = `max(D + holdMs, 受付時刻)`)、
 * plan が無い間(人間の判定待ち)と接触ありは `D + holdMs`。
 */
function guideHideAtMs(ctx: FrameContext, flight: PitchFlight): number {
  const plan = ctx.plan;
  return plan !== null && plan.contactMs === null ? plan.ballHoldUntilMs : flight.durationMs + CATCH.holdMs;
}

/**
 * 打撃の予告(着弾点の印と縮むリング)。人間打撃(`layout = "batting"`)の飛行中・演出中に、リリースから `guideHideAtMs` まで出す
 * (消す時刻は D + holdMs か、接触なしならボールが消える時刻。接触後の追跡カメラへの移り始めはこの直後なので、カメラでは消さない)。
 * 守備の `guide`(照準・ゲージ)は段階 B で合成するので、ここでは出さない。リングの線幅は最終のカメラから `ringWidthFor` で m に直す。
 */
function guideFrame(ctx: FrameContext, camera: CameraPose): SceneFrame["guide"] {
  const { flight, phase, layout, assist } = ctx.input;
  if (layout !== "batting" || flight === null || (phase !== "flight" && phase !== "play")) {
    return HIDDEN_GUIDE;
  }
  return guideFrameAt({
    tMs: ctx.tMs,
    durationMs: flight.durationMs,
    hideAtMs: guideHideAtMs(ctx, flight),
    landing: flight.landing,
    preview: assist.preview,
    fadeRadius: assist.fadeRadius,
    fadeCenter: previewCenterOf(assist, flight.landing, flight.seq),
    ringWidth: ringWidthFor(camera, zoneToWorld(flight.landing), GUIDE.ringWidthRatio),
  });
}

/** 時刻 `input.tMs` の画面の全状態。同じ入力は同じ結果になり、入力を変更しない。 */
export function sceneFrameAt(input: SceneFrameInput): SceneFrame {
  const ctx = contextOf(input);
  const camera = cameraFrame(ctx);
  const pitcher = pitcherFrame(ctx);
  const catcher = catcherFrame(ctx);
  const batter = batterFrame(ctx);
  const runners = runnersFrame(ctx);
  const fielders = fieldersFrame(ctx);
  return {
    camera,
    layout: input.layout,
    safeArea: ctx.safeArea,
    uniforms: { offense: input.uniforms.offense, defense: input.uniforms.defense },
    ball: ballFrame(ctx, camera),
    pitcher,
    catcher,
    batter,
    fielders,
    runners,
    wipe: wipeFrame(ctx, [pitcher, catcher, batter, ...runners, ...fielders], pitcher),
    zone: zoneFrame(ctx),
    landingMark: landingMarkFrame(ctx, camera),
    cursor: cursorFrame(ctx),
    guide: guideFrame(ctx, camera),
  };
}
