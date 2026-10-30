import { describe, expect, it } from "vitest";
import type { PitchQuality } from "../../types/pitch";
import { BATTING_PARAMS } from "../batting/params";
import { WORLD_PARAMS } from "../world/space/params";
import { clampAim, gaugeErrorMs, gaugeRingAt, gaugeTimingsOf, isStopAccepted, pitchQualityOf, pulledAimOf, sigmaScaleOf } from "./gauge";
import { PITCH_PARAMS } from "./params";

const GAUGE = PITCH_PARAMS.gauge;
const RING = WORLD_PARAMS.guide.gaugeRing;
const QUALITIES: readonly PitchQuality[] = ["nice", "good", "normal", "miss"];

describe("pitchQualityOf", () => {
  it("|e| ≤ 40 がナイス、≤ 90 がグッド、≤ 160 がふつう、それより外が失投(境界を含む)", () => {
    expect(pitchQualityOf(0)).toBe("nice");
    expect(pitchQualityOf(GAUGE.windows.nice)).toBe("nice");
    expect(pitchQualityOf(GAUGE.windows.nice + 0.01)).toBe("good");
    expect(pitchQualityOf(GAUGE.windows.good)).toBe("good");
    expect(pitchQualityOf(GAUGE.windows.good + 0.01)).toBe("normal");
    expect(pitchQualityOf(GAUGE.windows.normal)).toBe("normal");
    expect(pitchQualityOf(GAUGE.windows.normal + 0.01)).toBe("miss");
  });

  it("早い(負の)誤差も同じ窓で、符号に対称", () => {
    expect(pitchQualityOf(-GAUGE.windows.nice)).toBe("nice");
    expect(pitchQualityOf(-GAUGE.windows.nice - 0.01)).toBe("good");
    expect(pitchQualityOf(-GAUGE.windows.normal)).toBe("normal");
    expect(pitchQualityOf(-GAUGE.windows.normal - 0.01)).toBe("miss");
  });

  it("タップなし(null)・非有限は失投", () => {
    expect(pitchQualityOf(null)).toBe("miss");
    expect(pitchQualityOf(Number.NaN)).toBe("miss");
    expect(pitchQualityOf(Number.POSITIVE_INFINITY)).toBe("miss");
  });

  it("|e| が増えると質は悪くなる一方(単調)", () => {
    const rank = (error: number): number => QUALITIES.indexOf(pitchQualityOf(error));
    const errors = Array.from({ length: 400 }, (_, index) => index);
    expect(errors.every((error, index) => index === 0 || rank(error) >= rank(errors.at(index - 1) ?? 0))).toBe(true);
  });
});

describe("sigmaScaleOf", () => {
  it("質ごとの倍率は PITCH_PARAMS.gauge.sigmaScale に一致する", () => {
    expect(sigmaScaleOf("nice")).toBe(GAUGE.sigmaScale.nice);
    expect(sigmaScaleOf("good")).toBe(GAUGE.sigmaScale.good);
    expect(sigmaScaleOf("normal")).toBe(GAUGE.sigmaScale.normal);
    expect(sigmaScaleOf("miss")).toBe(GAUGE.sigmaScale.miss);
  });

  it("ナイス → グッド → ふつう → 失投で単調非減少(ふつうは 1)", () => {
    const scales = QUALITIES.map(sigmaScaleOf);
    expect(scales.every((scale, index) => index === 0 || scale >= (scales.at(index - 1) ?? Number.POSITIVE_INFINITY))).toBe(true);
    expect(sigmaScaleOf("normal")).toBe(1);
  });
});

describe("isStopAccepted", () => {
  it("ゲージ開始から stopGuardMs 未満の停止は受け付けず、ちょうど以上は受け付ける", () => {
    expect(isStopAccepted(0)).toBe(false);
    expect(isStopAccepted(GAUGE.stopGuardMs - 1)).toBe(false);
    expect(isStopAccepted(GAUGE.stopGuardMs)).toBe(true);
    expect(isStopAccepted(GAUGE.ringMs)).toBe(true);
  });

  it("timeScale でガードが縮む。負・NaN は受け付けない", () => {
    expect(isStopAccepted(GAUGE.stopGuardMs / 8, 8)).toBe(true);
    expect(isStopAccepted(GAUGE.stopGuardMs / 8 - 1, 8)).toBe(false);
    expect(isStopAccepted(-5)).toBe(false);
    expect(isStopAccepted(Number.NaN)).toBe(false);
  });
});

describe("gaugeTimingsOf", () => {
  it("timeScale 1 で PITCH_PARAMS.gauge と同じ、8 で 1/8。不正な timeScale は 1 とみなす", () => {
    expect(gaugeTimingsOf(1)).toEqual({ ringMs: GAUGE.ringMs, graceMs: GAUGE.graceMs, stopGuardMs: GAUGE.stopGuardMs });
    expect(gaugeTimingsOf(8).ringMs).toBeCloseTo(GAUGE.ringMs / 8, 12);
    expect(gaugeTimingsOf(0)).toEqual(gaugeTimingsOf(1));
    expect(gaugeTimingsOf(Number.NaN)).toEqual(gaugeTimingsOf(1));
  });
});

describe("gaugeErrorMs", () => {
  const base = { startMs: 1000, timeScale: 1 };

  it("終点(開始 + ringMs)に遅延補正ぶん遅れて押すと誤差 0(タッチ 70ms・マウス/キー 20ms)", () => {
    expect(gaugeErrorMs({ ...base, stopMs: 1000 + GAUGE.ringMs + BATTING_PARAMS.inputLatencyMs.touch, inputKind: "touch" })).toBeCloseTo(0, 9);
    expect(gaugeErrorMs({ ...base, stopMs: 1000 + GAUGE.ringMs + BATTING_PARAMS.inputLatencyMs.mouse, inputKind: "mouse" })).toBeCloseTo(0, 9);
    expect(gaugeErrorMs({ ...base, stopMs: 1000 + GAUGE.ringMs + BATTING_PARAMS.inputLatencyMs.key, inputKind: "key" })).toBeCloseTo(0, 9);
  });

  it("遅い押しは正、早い押しは負。タッチは同じ時刻でもマウスより誤差が小さい(遅延補正が大きい)", () => {
    const stopMs = 1000 + GAUGE.ringMs + 100;
    expect(gaugeErrorMs({ ...base, stopMs, inputKind: "mouse" })).toBeCloseTo(80, 9);
    expect(gaugeErrorMs({ ...base, stopMs, inputKind: "touch" })).toBeCloseTo(30, 9);
    expect(gaugeErrorMs({ ...base, stopMs: 1000 + GAUGE.ringMs - 200, inputKind: "mouse" })).toBeCloseTo(-220, 9);
  });

  it("timeScale が大きいと終点が早まる", () => {
    const fast = gaugeErrorMs({ startMs: 0, stopMs: 500, inputKind: "mouse", timeScale: 8 });
    const normal = gaugeErrorMs({ startMs: 0, stopMs: 500, inputKind: "mouse", timeScale: 1 });
    expect(fast).toBeGreaterThan(normal);
  });
});

describe("pulledAimOf / clampAim", () => {
  it("失投だけ、狙いを (x, y) へ ratio だけ引き寄せる", () => {
    const aim = { x: 1.5, y: -1.5 };
    expect(pulledAimOf(aim, "nice")).toBe(aim);
    expect(pulledAimOf(aim, "good")).toBe(aim);
    expect(pulledAimOf(aim, "normal")).toBe(aim);
    const pulled = pulledAimOf(aim, "miss");
    const { ratio, x, y } = GAUGE.missPull;
    expect(pulled.x).toBeCloseTo(1.5 * (1 - ratio) + x * ratio, 12);
    expect(pulled.y).toBeCloseTo(-1.5 * (1 - ratio) + y * ratio, 12);
    expect(Math.abs(pulled.x)).toBeLessThan(Math.abs(aim.x));
  });

  it("真ん中やや高め(0, 0.15)を狙った失投は動かない", () => {
    const pulled = pulledAimOf({ x: GAUGE.missPull.x, y: GAUGE.missPull.y }, "miss");
    expect(pulled.x).toBeCloseTo(GAUGE.missPull.x, 12);
    expect(pulled.y).toBeCloseTo(GAUGE.missPull.y, 12);
  });

  it("aim は ±aimLimit に収まり、範囲内の値は変わらず、非有限は 0", () => {
    expect(clampAim({ x: 10, y: -10 })).toEqual({ x: GAUGE.aimLimit, y: -GAUGE.aimLimit });
    expect(clampAim({ x: 0.3, y: -1.2 })).toEqual({ x: 0.3, y: -1.2 });
    expect(clampAim({ x: GAUGE.aimLimit, y: -GAUGE.aimLimit })).toEqual({ x: GAUGE.aimLimit, y: -GAUGE.aimLimit });
    expect(clampAim({ x: Number.NaN, y: Number.POSITIVE_INFINITY })).toEqual({ x: 0, y: 0 });
  });
});

describe("gaugeRingAt", () => {
  it("t = 0 で startRadius、t = ringMs で endRadius、t < 0 は startRadius", () => {
    expect(gaugeRingAt(0).radius).toBeCloseTo(RING.startRadius, 9);
    expect(gaugeRingAt(GAUGE.ringMs).radius).toBeCloseTo(RING.endRadius, 9);
    expect(gaugeRingAt(-100).radius).toBeCloseTo(RING.startRadius, 9);
    expect(gaugeRingAt(GAUGE.ringMs / 2).radius).toBeCloseTo((RING.startRadius + RING.endRadius) / 2, 9);
  });

  it("経過とともに単調に縮み、戻らない(終点以降も縮み続け、afterRatio × ringMs で保持)", () => {
    const times = Array.from({ length: 200 }, (_, index) => index * 10);
    const radii = times.map((t) => gaugeRingAt(t).radius);
    expect(radii.every((radius, index) => index === 0 || radius <= (radii.at(index - 1) ?? Number.NEGATIVE_INFINITY))).toBe(true);
    expect(gaugeRingAt(GAUGE.ringMs + 100).radius).toBeLessThan(RING.endRadius);
    const holdAt = GAUGE.ringMs * (1 + RING.afterRatio);
    expect(gaugeRingAt(holdAt + 500).radius).toBeCloseTo(gaugeRingAt(holdAt).radius, 12);
    expect(gaugeRingAt(holdAt + 500).radius).toBeGreaterThan(0);
  });

  it("expired は ringMs + graceMs ちょうどから真", () => {
    expect(gaugeRingAt(GAUGE.ringMs + GAUGE.graceMs - 1).expired).toBe(false);
    expect(gaugeRingAt(GAUGE.ringMs + GAUGE.graceMs).expired).toBe(true);
    expect(gaugeRingAt(0).expired).toBe(false);
    expect(gaugeRingAt(Number.NaN).expired).toBe(false);
  });

  it("timeScale でリングの縮む速さと expired の時刻が縮む", () => {
    expect(gaugeRingAt(GAUGE.ringMs / 8, 8).radius).toBeCloseTo(RING.endRadius, 9);
    expect(gaugeRingAt((GAUGE.ringMs + GAUGE.graceMs) / 8, 8).expired).toBe(true);
    expect(gaugeRingAt((GAUGE.ringMs + GAUGE.graceMs) / 8 - 1, 8).expired).toBe(false);
  });
});
