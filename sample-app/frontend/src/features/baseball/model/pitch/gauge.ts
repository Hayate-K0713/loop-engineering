import type { ZonePoint } from "../../types/common";
import type { PitchInputKind, PitchQuality } from "../../types/pitch";
import { BATTING_PARAMS } from "../batting/params";
import { WORLD_PARAMS } from "../world/space/params";
import { PITCH_PARAMS } from "./params";
import { clamp } from "./zone";

// 守備のリングゲージの純関数。時間はすべて ms。`timeScale`(再生速度。通常 1、`fast` で 8)は
// ゲージの長さ(リングが縮む時間・猶予・停止の無視区間)にだけ反映し、質の窓(|誤差| の上限)は壁時計の ms のまま(人間の反応の幅は変わらないため)。

const GAUGE = PITCH_PARAMS.gauge;
const RING = WORLD_PARAMS.guide.gaugeRing;

/** `timeScale` が不正(0 以下・非有限)なら 1 として扱う。 */
function safeScale(timeScale: number): number {
  return Number.isFinite(timeScale) && timeScale > 0 ? timeScale : 1;
}

/** `timeScale` を反映したゲージの長さ。 */
export type GaugeTimings = {
  /** リングが縮み切る(終点)までの時間。 */
  readonly ringMs: number;
  /** 終点を過ぎても縮み続け、自動投球(失投)になるまでの猶予。 */
  readonly graceMs: number;
  /** ゲージ開始からこの間の停止は無視する。 */
  readonly stopGuardMs: number;
};

export function gaugeTimingsOf(timeScale: number): GaugeTimings {
  const scale = safeScale(timeScale);
  return { ringMs: GAUGE.ringMs / scale, graceMs: GAUGE.graceMs / scale, stopGuardMs: GAUGE.stopGuardMs / scale };
}

/** 停止の誤差の符号付き ms(正 = 遅い)。`|errMs|` が質の窓に入る。 */
export function gaugeErrorMs(input: {
  /** 停止の入力の `event.timeStamp`。 */
  readonly stopMs: number;
  /** ゲージ開始の時刻(同じ時計)。 */
  readonly startMs: number;
  readonly inputKind: PitchInputKind;
  readonly timeScale: number;
}): number {
  const { stopMs, startMs, inputKind, timeScale } = input;
  return stopMs - latencyOf(inputKind) - (startMs + gaugeTimingsOf(timeScale).ringMs);
}

/** 入力の種類別の遅延補正(ms。タッチ 70・マウス/キー 20)。打撃と同じ値。 */
function latencyOf(inputKind: PitchInputKind): number {
  switch (inputKind) {
    case "touch":
      return BATTING_PARAMS.inputLatencyMs.touch;
    case "mouse":
      return BATTING_PARAMS.inputLatencyMs.mouse;
    case "key":
      return BATTING_PARAMS.inputLatencyMs.key;
  }
}

/** 誤差から質を決める。窓の境界は含む(`|e| ≤ 40` = ナイス)。窓の外・`null`(タップなしの自動投球)・非有限は失投。 */
export function pitchQualityOf(errMs: number | null): PitchQuality {
  if (errMs === null || !Number.isFinite(errMs)) {
    return "miss";
  }
  const abs = Math.abs(errMs);
  if (abs <= GAUGE.windows.nice) {
    return "nice";
  }
  if (abs <= GAUGE.windows.good) {
    return "good";
  }
  return abs <= GAUGE.windows.normal ? "normal" : "miss";
}

/** 質ごとの着弾のばらつき(σ)の倍率。ナイス < グッド < ふつう < 失投の単調非減少。 */
export function sigmaScaleOf(quality: PitchQuality): number {
  switch (quality) {
    case "nice":
      return GAUGE.sigmaScale.nice;
    case "good":
      return GAUGE.sigmaScale.good;
    case "normal":
      return GAUGE.sigmaScale.normal;
    case "miss":
      return GAUGE.sigmaScale.miss;
  }
}

/** 失投のとき、狙いを `missPull` の点へ `ratio` だけ引き寄せる(それ以外の質は狙いのまま)。 */
export function pulledAimOf(aim: ZonePoint, quality: PitchQuality): ZonePoint {
  if (quality !== "miss") {
    return aim;
  }
  const { x, y, ratio } = GAUGE.missPull;
  return { x: aim.x * (1 - ratio) + x * ratio, y: aim.y * (1 - ratio) + y * ratio };
}

/** 狙いを ±`aimLimit` に収める。非有限は 0。 */
export function clampAim(aim: ZonePoint): ZonePoint {
  const limit = GAUGE.aimLimit;
  return {
    x: Number.isFinite(aim.x) ? clamp(aim.x, -limit, limit) : 0,
    y: Number.isFinite(aim.y) ? clamp(aim.y, -limit, limit) : 0,
  };
}

/** ゲージ開始からの経過 `elapsedMs` で、停止を受け付けてよいか(`stopGuardMs` 以上)。 */
export function isStopAccepted(elapsedMs: number, timeScale = 1): boolean {
  return Number.isFinite(elapsedMs) && elapsedMs >= gaugeTimingsOf(timeScale).stopGuardMs;
}

/** ゲージのリング。`radius` = 半径(m、ゾーン平面上)、`expired` = 猶予も過ぎて自動投球になる時刻に達した。 */
export type GaugeRing = {
  readonly radius: number;
  readonly expired: boolean;
};

/**
 * 経過 `elapsedMs` のリング。半径は `startRadius` から `endRadius` へ `ringMs` かけて線形に縮み(経過 ≤ 0 は `startRadius`)、
 * 終点を過ぎても同じ速さで `afterRatio × ringMs` だけ縮み続けてから保持する(戻らない)。`expired` は `ringMs + graceMs` 以降。
 */
export function gaugeRingAt(elapsedMs: number, timeScale = 1): GaugeRing {
  const { ringMs, graceMs } = gaugeTimingsOf(timeScale);
  const t = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const shrinkMs = Math.min(t, ringMs * (1 + RING.afterRatio));
  const radius = RING.startRadius - ((RING.startRadius - RING.endRadius) * shrinkMs) / ringMs;
  return { radius, expired: t >= ringMs + graceMs };
}
