import { describe, expect, it } from "vitest";
import type { SwingSource } from "../../types/batting";
import type { PlaytestRecord } from "../../types/telemetry";
import { createRng } from "../rng/rng";
import { nextGaussian } from "../rng/sampling";
import { DEFAULT_FIT_OPTIONS, fitBotParams } from "./fit-bot-params";
import { makeBat, makeIgnored, makeSwing } from "./test-fixtures";

// 既知の分布: biasMs 40・timingSigmaMs 45・latencyMs N(80, 20)・fingerSigmaPx 10(80 px/ゾーン単位)・ロックオン k = 0.4
const TRUE_BIAS = 40;
const TRUE_TIMING_SIGMA = 45;
const TRUE_FINGER_SIGMA_PX = 10;
const PX_PER_ZONE = 80;
const LOCK_K = 0.4;
const SWINGS = 4000;
const TAP_SLOW = 100;
const TAP_MOVED = 80;
const CANCELS = 60;

// 入力種別は添字の剰余で決める(tap 13/20・touch-second 4/20・button 3/20 → 2 本目の指/ボタン = 35%)
function sourceAt(index: number): SwingSource {
  const slot = index % 20;
  if (slot < 13) {
    return "tap";
  }
  return slot < 17 ? "touch-second" : "button";
}

function normals(count: number, seed: number): readonly number[] {
  const values: number[] = [];
  let state = createRng(seed);
  for (let i = 0; i < count; i += 1) {
    const [value, next] = nextGaussian(state);
    values.push(value);
    state = next;
  }
  return values;
}

function syntheticLog(): readonly PlaytestRecord[] {
  const noise = normals(SWINGS * 4, 20261030);
  const swingBats = Array.from({ length: SWINGS }, (_unused, index) => {
    const [latencyZ = 0, timingZ = 0, dxZ = 0, dyZ = 0] = noise.slice(index * 4, index * 4 + 4);
    const sigmaZone = TRUE_FINGER_SIGMA_PX / PX_PER_ZONE;
    const landing = { x: 0.1, y: -0.2 };
    const raw = { x: landing.x + dxZ * sigmaZone, y: landing.y + dyZ * sigmaZone };
    const effective = { x: raw.x + (landing.x - raw.x) * LOCK_K, y: raw.y + (landing.y - raw.y) * LOCK_K };
    const distanceZone = Math.hypot(effective.x - landing.x, effective.y - landing.y);
    const dtMs =
      TRUE_BIAS +
      (DEFAULT_FIT_OPTIONS.latencyMs + latencyZ * DEFAULT_FIT_OPTIONS.latencySdMs - DEFAULT_FIT_OPTIONS.compensationMs) +
      timingZ * TRUE_TIMING_SIGMA;
    return makeBat({
      seq: index,
      landing,
      swing: makeSwing({ source: sourceAt(index), dtMs, raw, effective, distanceZone, distancePx: distanceZone * PX_PER_ZONE, assistK: LOCK_K }),
    });
  });
  const failures: PlaytestRecord[] = [
    ...Array.from({ length: TAP_SLOW }, () => makeIgnored("tap-too-long")),
    ...Array.from({ length: TAP_MOVED }, () => makeIgnored("tap-moved")),
    ...Array.from({ length: CANCELS }, (): PlaytestRecord => ({ type: "pointercancel", atMs: 1 })),
  ];
  return [...swingBats, ...failures];
}

function within(actual: number | null, expected: number, tolerance: number): boolean {
  return actual !== null && Math.abs(actual - expected) <= expected * tolerance;
}

describe("fitBotParams", () => {
  const fitted = fitBotParams(syntheticLog());

  it("既知の分布の biasMs・timingSigmaMs・fingerSigmaPx を ±5% で復元する", () => {
    expect(within(fitted.biasMs, TRUE_BIAS, 0.05)).toBe(true);
    expect(within(fitted.timingSigmaMs, TRUE_TIMING_SIGMA, 0.05)).toBe(true);
    expect(within(fitted.fingerSigmaPx, TRUE_FINGER_SIGMA_PX, 0.05)).toBe(true);
  });

  it("失敗の型と 2 本目の指の割合が手計算と一致する", () => {
    const tapSwings = 2600;
    const tapAttempts = tapSwings + TAP_SLOW + TAP_MOVED;
    expect(fitted.touchSwings).toBe(SWINGS);
    expect(fitted.slowTapRate).toBeCloseTo(TAP_SLOW / tapAttempts, 12);
    expect(fitted.driftTapRate).toBeCloseTo(TAP_MOVED / tapAttempts, 12);
    expect(fitted.cancelRate).toBeCloseTo(CANCELS / (SWINGS + TAP_SLOW + TAP_MOVED + CANCELS), 12);
    expect(fitted.secondFingerRate).toBeCloseTo(0.35, 12);
  });

  it("ロックオンで有効カーソルが近づいていても、指のぶれは素のカーソルで推定する", () => {
    // 有効カーソルの距離の中央値は素の (1 − k) 倍なので、有効側で推定すると約 40% 小さくなる
    expect(fitted.fingerSigmaPx).toBeGreaterThan(TRUE_FINGER_SIGMA_PX * 0.9);
  });

  it("ログが空なら全ての推定値が null", () => {
    const empty = fitBotParams([]);
    expect(empty.touchSwings).toBe(0);
    expect(empty.biasMs).toBeNull();
    expect(empty.timingSigmaMs).toBeNull();
    expect(empty.fingerSigmaPx).toBeNull();
    expect(empty.slowTapRate).toBeNull();
    expect(empty.driftTapRate).toBeNull();
    expect(empty.cancelRate).toBeNull();
    expect(empty.secondFingerRate).toBeNull();
  });

  it("キー・マウスのスイングは時刻と指の推定に使わない", () => {
    const only = fitBotParams([makeBat({ swing: makeSwing({ source: "key", dtMs: 500 }) }), makeBat({ swing: makeSwing({ source: "mouse", dtMs: 500 }) })]);
    expect(only.touchSwings).toBe(0);
    expect(only.biasMs).toBeNull();
    expect(only.fingerSigmaPx).toBeNull();
  });

  it("px へ換算できない記録は指のぶれの推定から除く", () => {
    const noPx = fitBotParams([makeBat({ swing: makeSwing({ distancePx: null }) })]);
    expect(noPx.fingerSigmaPx).toBeNull();
    expect(noPx.touchSwings).toBe(1);
  });
});
