import type { PreviewMode } from "../../../types/batting";
import type { ZonePoint } from "../../../types/common";
import type { SceneGuide } from "../../../types/scene";
import { clamp } from "../../pitch/zone";
import { gaugeRingAt, gaugeTimingsOf } from "../../pitch/gauge";
import { ZONE_HALF_HEIGHT, zoneToWorld } from "../space/coords";
import { WORLD_PARAMS } from "../space/params";

// 着弾点の予告・縮むリング(打撃)と、狙いの照準・ゲージのリング(守備)の `SceneGuide` を作る純関数。
// リングの線幅は `ringWidthFor`(camera/rig.ts)の結果(m)を呼び出し側が渡す。ここでは画面のサイズを知らない。

const GUIDE = WORLD_PARAMS.guide;
const RING_END_RADIUS = WORLD_PARAMS.ballRadius * GUIDE.previewRing.endRadiusRatio;
const GAUGE_RING = GUIDE.gaugeRing;

/** 守備の照準の半径(m)。ゲージのリングの終点(`gaugeRing.endRadius`)より小さく、リングが重なる先になる。390 幅で外周約 44px。 */
const RETICLE_RADIUS = 0.07;

/**
 * ゾーン単位の半径をワールドの半径(m)へ換算する倍率。ゾーンは縦横で寸法が違う(半幅 0.26m・半高 0.30m)ので、
 * 円は大きい方(半高)で換算する(`fade` の円が着弾を含むことと、散布円が小さく出ないことのため)。
 */
const ZONE_RADIUS_TO_M = ZONE_HALF_HEIGHT;

/** 非表示の `SceneGuide`(位置はゾーン中心)。 */
export const HIDDEN_GUIDE: SceneGuide = {
  visible: false,
  mode: "none",
  position: zoneToWorld({ x: 0, y: 0 }),
  markerRadius: 0,
  fadeRadius: 0,
  alpha: 0,
  ring: { visible: false, radius: RING_END_RADIUS, width: 0, tone: "preview", glow: 0 },
  spread: { visible: false, radius: 0 },
};

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** 飛行の進行度(0〜1)。`durationMs` が正でない・有限でないときは 1(到達済み)。 */
function progressOf(tMs: number, durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return 1;
  }
  return clamp(finiteOr(tMs, 0) / durationMs, 0, 1);
}

/**
 * 予告のリングの半径(m)。`t = 0` で `startRadius`、`t = D` で `endRadius = ballRadius × endRadiusRatio` になる線形の縮小で、
 * `t < 0` は `startRadius`、`D` 以降は `endRadius` のまま保持する。
 */
export function previewRingAt(tMs: number, durationMs: number): number {
  const k = progressOf(tMs, durationMs);
  return GUIDE.previewRing.startRadius * (1 - k) + RING_END_RADIUS * k;
}

/** 出現のフェードイン(0〜1)。`t = 0` で 0、`fadeInMs` で 1。 */
function fadeInAt(tMs: number): number {
  return clamp(finiteOr(tMs, 0) / GUIDE.fadeInMs, 0, 1);
}

export type PreviewGuideInput = {
  /** リリースからの経過ゲーム時間(ms)。 */
  readonly tMs: number;
  /** 到達までの時間 D(ms)。 */
  readonly durationMs: number;
  /** 予告を消す時刻(リリースからの ms)。D + `hold`、接触なしは消失時刻。これを過ぎると非表示。 */
  readonly hideAtMs: number;
  /** 真の着弾点(`flight.landing`)。 */
  readonly landing: ZonePoint;
  /** 点の見せ方(`AssistParams.preview`)。 */
  readonly preview: PreviewMode;
  /** `fade` の円の半径(ゾーン単位。`AssistParams.fadeRadius`)。 */
  readonly fadeRadius: number;
  /** `fade` の円の中心(ゾーン座標。`previewCenterOf` の結果。決定論)。`exact`・`none` では使わない。 */
  readonly fadeCenter: ZonePoint;
  /** リングの線幅(m。`ringWidthFor` の結果)。 */
  readonly ringWidth: number;
};

/** `fade` の円の半径(m)。真の着弾点を必ず含むよう、中心から着弾点までの距離を下回らない。 */
function fadeRadiusInWorld(input: PreviewGuideInput): number {
  const center = zoneToWorld(input.fadeCenter);
  const landing = zoneToWorld(input.landing);
  const reach = Math.hypot(center.x - landing.x, center.y - landing.y);
  return Math.max(Math.max(0, input.fadeRadius) * ZONE_RADIUS_TO_M, reach);
}

/** 点・円の見せ方ごとの `position`/`markerRadius`/`fadeRadius`。リングの中心は `position`(`fade` は円の中心と同じ)。 */
function previewMarkerOf(input: PreviewGuideInput): Pick<SceneGuide, "mode" | "position" | "markerRadius" | "fadeRadius"> {
  switch (input.preview) {
    case "exact":
      return { mode: "exact", position: zoneToWorld(input.landing), markerRadius: GUIDE.dot.radius, fadeRadius: 0 };
    case "fade":
      return { mode: "fade", position: zoneToWorld(input.fadeCenter), markerRadius: 0, fadeRadius: fadeRadiusInWorld(input) };
    case "none":
      return { mode: "none", position: zoneToWorld(input.landing), markerRadius: 0, fadeRadius: 0 };
  }
}

/**
 * 打撃の予告(着弾点の印と縮むリング)。リリース(`t = 0`)から `hideAtMs` まで表示し、120ms でフェードインする。
 * `none` は点も円も出さずリングだけ出す。`fade` は円の中心(= リングの中心)を `fadeCenter` に置き、円は真の着弾点を含む。
 * `glow` はリングの発光で、到達に近づくほど強い(進行度の 2 乗)。
 */
export function guideFrameAt(input: PreviewGuideInput): SceneGuide {
  const { tMs } = input;
  if (!Number.isFinite(tMs) || tMs < 0 || tMs > input.hideAtMs) {
    return HIDDEN_GUIDE;
  }
  const progress = progressOf(tMs, input.durationMs);
  return {
    visible: true,
    ...previewMarkerOf(input),
    alpha: fadeInAt(tMs),
    ring: { visible: true, radius: previewRingAt(tMs, input.durationMs), width: input.ringWidth, tone: "preview", glow: progress * progress },
    spread: { visible: false, radius: 0 },
  };
}

export type PitchGuideInput = {
  /** 照準を出す区間か(人間守備の狙い・ゲージ・投球の飛行中。それ以外は非表示)。 */
  readonly visible: boolean;
  /** 狙い(ゾーン座標。飛行中も保持する)。 */
  readonly aim: ZonePoint;
  /** ゲージ開始からの経過(ms)。ゲージ中のみ非 `null`(`PitchInputView.gaugeElapsedMs`)。 */
  readonly gaugeElapsedMs: number | null;
  /** 散布円(ブレの目安)の半径(ゾーン単位)。出さないときは `null`。ゲージ中は出さない。 */
  readonly spreadRadiusZone: number | null;
  /** リングの線幅(m。`ringWidthFor` の結果)。 */
  readonly ringWidth: number;
  /** 再生速度(ゲージの長さに反映。省略は 1)。 */
  readonly timeScale?: number;
};

/** 守備の狙いの照準(`reticle`)。ゲージ中は照準の周りに縮むリング(`tone: "gauge"`。半径は `gaugeRingAt`)を出す。 */
export function pitchGuideAt(input: PitchGuideInput): SceneGuide {
  if (!input.visible) {
    return HIDDEN_GUIDE;
  }
  const { gaugeElapsedMs, spreadRadiusZone } = input;
  const gauging = gaugeElapsedMs !== null;
  const timeScale = input.timeScale ?? 1;
  const radius = gauging ? gaugeRingAt(gaugeElapsedMs, timeScale).radius : GAUGE_RING.startRadius;
  const progress = gauging ? clamp(finiteOr(gaugeElapsedMs, 0) / gaugeTimingsOf(timeScale).ringMs, 0, 1) : 0;
  return {
    visible: true,
    mode: "reticle",
    position: zoneToWorld(input.aim),
    markerRadius: RETICLE_RADIUS,
    fadeRadius: 0,
    alpha: 1,
    ring: { visible: gauging, radius, width: input.ringWidth, tone: "gauge", glow: progress * progress },
    spread: spreadRadiusZone !== null && !gauging ? { visible: true, radius: spreadRadiusZone * ZONE_RADIUS_TO_M } : { visible: false, radius: 0 },
  };
}
