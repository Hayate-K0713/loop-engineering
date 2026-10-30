import type { AssistParams } from "../../types/batting";
import type { ZonePoint } from "../../types/common";
import type { Difficulty } from "../../types/game";

// 打撃のアシスト(ロックオン・予告・質の補正)の難易度別の表と、それを使う純関数。値は出発値で、人間代理ボット(A14)が調整してよい。

/**
 * 難易度ごとのアシスト。`fadeRadius`/`fadeJitter` は `preview: "fade"` のときだけ使う(`exact` は 0)。
 * かんたん = 強い引き寄せ+点の予告、ふつう(既定)= 中程度+点の予告、むずかしい = 弱い引き寄せ+薄い円の予告。
 */
export const ASSIST_TABLE: Readonly<Record<Difficulty, AssistParams>> = {
  easy: { lockStrength: 0.8, captureRadius: 1.6, rampStart: 0.3, rampEnd: 0.8, preview: "exact", fadeRadius: 0, fadeJitter: 0, qualityPenalty: 0.3 },
  normal: { lockStrength: 0.55, captureRadius: 1.2, rampStart: 0.35, rampEnd: 0.85, preview: "exact", fadeRadius: 0, fadeJitter: 0, qualityPenalty: 0.35 },
  hard: { lockStrength: 0.2, captureRadius: 0.7, rampStart: 0.4, rampEnd: 0.9, preview: "fade", fadeRadius: 0.45, fadeJitter: 0.25, qualityPenalty: 0.4 },
};

/** 有効カーソルと引き寄せ量 k。 */
export type LockOn = {
  /** ロックオン後の有効カーソル(判定と表示の両方に使う)。 */
  readonly cursor: ZonePoint;
  /** 引き寄せ量(0〜1)。`SwingInput.assistK` になる。 */
  readonly k: number;
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** 端 `edge0`〜`edge1` の滑らかな 0→1(3t²−2t³)。`edge1 ≤ edge0` のときは `edge0` を境にした階段。 */
function smoothstepBetween(edge0: number, edge1: number, value: number): number {
  if (edge1 <= edge0) {
    return value >= edge0 ? 1 : 0;
  }
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** `captureRadius` の外側で引き寄せが 0 になるまでの幅の倍率(`captureRadius` 〜 `captureRadius × 1.6`)。 */
const CAPTURE_FALLOFF = 1.6;

/**
 * ロックオン。指で動かした素のカーソル `raw` を、飛行の進行度 `progress`(0〜1。範囲外は丸める)に応じて着弾点 `landing` へ引き寄せる。純関数。
 *
 * ```
 * capture = 1 − smoothstep(captureRadius, captureRadius × 1.6, dist)   // 遠すぎるボールは引き寄せない
 * ramp    = smoothstep(rampStart, rampEnd, progress)                   // 早い時刻は素のカーソル、終盤で効く
 * k       = lockStrength × capture × ramp
 * cursor  = raw + (landing − raw) × k
 * ```
 *
 * `dist` は `raw` と `landing` のゾーン単位のユークリッド距離。`lockStrength` 0 や `progress < rampStart` では `raw` をそのまま返す(k = 0)。
 */
export function lockOnCursor(assist: AssistParams, raw: ZonePoint, landing: ZonePoint, progress: number): LockOn {
  const dx = landing.x - raw.x;
  const dy = landing.y - raw.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const capture = 1 - smoothstepBetween(assist.captureRadius, assist.captureRadius * CAPTURE_FALLOFF, dist);
  const ramp = smoothstepBetween(assist.rampStart, assist.rampEnd, clamp01(progress));
  const k = clamp01(assist.lockStrength) * capture * ramp;
  if (k === 0) {
    return { cursor: raw, k: 0 };
  }
  return { cursor: { x: raw.x * (1 - k) + landing.x * k, y: raw.y * (1 - k) + landing.y * k }, k };
}

/** 32 ビット整数のハッシュ(murmur3 の最終混合)。`seq` から決定論の疑似乱数を作るのに使い、`Math.random` は使わない。 */
function hash32(value: number): number {
  let h = value >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** 24 ビットの精度で `[0, 1)` にする(1 には届かない)。 */
const UNIT_RANGE = 0x1000000;

/** `seq` の別のビット列から取る 2 つの独立な値のためのソルト。 */
const ANGLE_SALT = 0x9e3779b9;
const RADIUS_SALT = 0x7f4a7c15;

/**
 * 予告の印の中心。`exact`・`none` は着弾点そのもの。`fade` は着弾点から `seq` で決まる決定論のずれ(`fadeJitter` 以内)だけ動かした位置を返す
 * (同じ `seq` なら毎フレーム同じ。ずれは `min(fadeJitter, fadeRadius)` を超えないので、半径 `fadeRadius` の円は必ず真の着弾点を含む)。純関数。
 */
export function previewCenterOf(assist: AssistParams, landing: ZonePoint, seq: number): ZonePoint {
  if (assist.preview !== "fade") {
    return landing;
  }
  const maxOffset = Math.min(assist.fadeJitter, assist.fadeRadius);
  const angle = (2 * Math.PI * (hash32(seq ^ ANGLE_SALT) % UNIT_RANGE)) / UNIT_RANGE;
  const radius = (maxOffset * (hash32(seq ^ RADIUS_SALT) % UNIT_RANGE)) / UNIT_RANGE;
  return { x: landing.x + radius * Math.cos(angle), y: landing.y + radius * Math.sin(angle) };
}

/**
 * 接触の質 q に掛ける倍率 `1 − qualityPenalty × k`(補助なしの上手い人のほうが強い打球を打てる)。
 * `assistK` の省略(`undefined`)は 0 で、倍率 1(v2 と同じ)。`k` は 0〜1 に丸める。純関数。
 */
export function qualityScaleOf(assist: AssistParams, assistK: number | undefined): number {
  return 1 - assist.qualityPenalty * clamp01(assistK ?? 0);
}

/** 難易度に対応するアシスト。 */
export function assistFor(difficulty: Difficulty): AssistParams {
  switch (difficulty) {
    case "easy":
      return ASSIST_TABLE.easy;
    case "normal":
      return ASSIST_TABLE.normal;
    case "hard":
      return ASSIST_TABLE.hard;
  }
}
