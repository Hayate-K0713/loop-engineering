import type { BattedBall, InPlayResult } from "../../../types/batting";
import type { Vec3 } from "../../../types/scene";
import { computeBattedLanding } from "../../batting/batted-landing";
import { clamp } from "../../pitch/zone";
import { landingToWorld } from "../space/coords";
import { buildStageGeometry, standsHeightAt } from "../space/geometry";
import { WORLD_PARAMS } from "../space/params";
import { distanceXZ, lerp } from "../space/vec3";

// 打球の軌道(表示専用)。落下点は `computeBattedLanding`(= `GameView.fieldMarker` と同値)に一致させ、乱数は使わない。

const BATTED = WORLD_PARAMS.batted;
const FOUL = WORLD_PARAMS.foul;
const STANDS = buildStageGeometry().stands;

export type BattedShape = "fly" | "liner" | "ground";

/** 打球1本の計画。`peak` は始点と終点を結ぶ直線からの頂点の持ち上げ量(m)、`hops` はゴロのバウンド回数。 */
export type BattedPlan = {
  readonly start: Vec3;
  readonly end: Vec3;
  readonly peak: number;
  readonly hangMs: number;
  readonly hops: number;
  readonly shape: BattedShape;
  readonly overFence: boolean;
};

type ShapeParams = { readonly hangBaseMs: number; readonly hangPerMeterMs: number; readonly peakRatio: number };

function shapeParamsOf(shape: BattedShape): ShapeParams {
  switch (shape) {
    case "fly":
      return BATTED.fly;
    case "liner":
      return BATTED.liner;
    case "ground":
      return BATTED.ground;
  }
}

/** 小数部分(0 以上 1 未満)。 */
function fraction(value: number): number {
  return value - Math.floor(value);
}

/** タイプ別の滞空時間・頂点・バウンド回数を、落下点までの距離から求める。 */
function profileOf(shape: BattedShape, distance: number): Pick<BattedPlan, "peak" | "hangMs" | "hops"> {
  const params = shapeParamsOf(shape);
  return {
    peak: params.peakRatio * distance,
    hangMs: params.hangBaseMs + params.hangPerMeterMs * distance,
    hops: shape === "ground" ? BATTED.groundBounce.hops : 0,
  };
}

/**
 * インプレーの打球の計画。`end` の x・z は `computeBattedLanding(ball, result, seq)` の `landingToWorld`。
 * y はフェンス越え(ホームラン)ならスタンド斜面の高さ、それ以外は 0。形(`shape`)は打球タイプに従う。
 */
export function planBattedBall(ball: BattedBall, result: InPlayResult, seq: number, start: Vec3): BattedPlan {
  const landing = computeBattedLanding(ball, result, seq);
  const ground = landingToWorld(landing);
  const y = landing.overFence ? standsHeightAt(STANDS, landing.distance) : 0;
  return { start, end: { x: ground.x, y, z: ground.z }, ...profileOf(ball.type, landing.distance), shape: ball.type, overFence: landing.overFence };
}

/** ファウルの落下点(地面)。`backstop` ならバックネット方向(z > 0)、そうでなければファウルライン外側(|x| > |z|、z < 0)。 */
function foulLandingOf(seq: number): Vec3 {
  const branch = fraction(seq * FOUL.seqStepA);
  const distanceT = fraction(seq * FOUL.seqStepB + 0.5);
  const angleT = fraction(seq * FOUL.seqStepC + 0.25);
  const side = seq % 2 === 0 ? -1 : 1;
  if (branch < FOUL.backstopShare) {
    return { x: side * angleT * FOUL.backstopHalfWidth, y: 0, z: lerp(FOUL.backstopDistance.min, FOUL.backstopDistance.max, distanceT) };
  }
  const distance = lerp(FOUL.lineDistance.min, FOUL.lineDistance.max, distanceT);
  const ratio = lerp(FOUL.lineRatio.min, FOUL.lineRatio.max, angleT);
  const norm = Math.sqrt(1 + ratio * ratio);
  return { x: (side * distance * ratio) / norm, y: 0, z: -distance / norm };
}

/** ファウルの飛球の計画(`seq` から決定論)。フェア領域には落ちず、フライの形で飛ぶ。 */
export function planFoul(seq: number, start: Vec3): BattedPlan {
  const end = foulLandingOf(seq);
  return { start, end, ...profileOf("fly", distanceXZ(start, end)), shape: "fly", overFence: false };
}

/**
 * ゴロの高さ。接触点の高さから `dropRatio` で地面へ落ち、`hops` 回(等時間の区間)バウンドして減衰する。
 * 区間 k の高さは `firstHeight × decay^k` の放物線 `4h·u(1−u)`。
 */
function groundHeightAt(plan: BattedPlan, progress: number): number {
  const { firstHeight, decay, dropRatio } = BATTED.groundBounce;
  const hops = Math.max(1, plan.hops);
  const hop = Math.min(hops - 1, Math.floor(progress * hops));
  const inHop = progress * hops - hop;
  const drop = Math.max(0, plan.start.y * (1 - progress / dropRatio));
  return drop + 4 * firstHeight * decay ** hop * inHop * (1 - inHop);
}

/**
 * 接触後 `sinceContactMs` の打球位置。`p = clamp(s / hangMs, 0, 1)`。xz は線形、yはフライ/ライナーが
 * `lerp(start.y, end.y, p) + 4·peak·p(1−p)`、ゴロはバウンド(`y ≥ 0`)。`p = 0` は `start`、`p = 1` は `plan.end` に厳密一致する。
 */
export function battedBallAt(plan: BattedPlan, sinceContactMs: number): Vec3 {
  const progress = plan.hangMs > 0 ? clamp(sinceContactMs / plan.hangMs, 0, 1) : 1;
  if (progress >= 1) {
    return plan.end;
  }
  const x = lerp(plan.start.x, plan.end.x, progress);
  const z = lerp(plan.start.z, plan.end.z, progress);
  const y = plan.shape === "ground" ? groundHeightAt(plan, progress) : lerp(plan.start.y, plan.end.y, progress) + 4 * plan.peak * progress * (1 - progress);
  return { x, y, z };
}
