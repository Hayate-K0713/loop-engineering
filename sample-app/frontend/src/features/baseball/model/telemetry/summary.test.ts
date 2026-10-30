import { describe, expect, it } from "vitest";
import type { PlaytestRecord } from "../../types/telemetry";
import { summarize } from "./summary";
import { makeBat, makeIgnored, makePerf, makePitch, makeSwing } from "./test-fixtures";

const SAMPLE: readonly PlaytestRecord[] = [
  makeBat({ inZone: true, result: "in-play", swing: makeSwing({ dtMs: -20, distancePx: 30, source: "tap" }) }),
  makeBat({ inZone: true, result: "foul", swing: makeSwing({ dtMs: 40, distancePx: 50, source: "tap" }) }),
  makeBat({ inZone: true, result: "swinging-strike", swing: makeSwing({ dtMs: 100, distancePx: 70, source: "touch-second" }) }),
  makeBat({ inZone: true, result: "called-strike", swing: null }),
  makeBat({ inZone: false, result: "swinging-strike", swing: makeSwing({ dtMs: 20, distancePx: null, source: "button" }) }),
  makeBat({ inZone: false, result: "ball", swing: null }),
  makeIgnored("tap-too-long"),
  makeIgnored("tap-too-long"),
  makeIgnored("tap-moved"),
  makeIgnored("held-release"),
  { type: "pointercancel", atMs: 1 },
  { type: "pointercancel", atMs: 2 },
  { type: "pointercancel", atMs: 3 },
  makePitch({ quality: "nice" }),
  makePitch({ quality: "good" }),
  makePitch({ quality: "normal" }),
  makePitch({ quality: "miss" }),
  makePerf({ p95Ms: 20 }),
  makePerf({ p95Ms: 40 }),
  makePerf({ p95Ms: 30 }),
];

describe("summarize", () => {
  it("打撃の集計が手計算と一致する", () => {
    const summary = summarize(SAMPLE);
    expect(summary.battingPitches).toBe(6);
    expect(summary.swings).toBe(4);
    // スイング 4 件のうち空振りは 2 件 → 接触率 0.5
    expect(summary.contactRate).toBeCloseTo(0.5, 12);
    // ゾーン内 4 球のうち 3 球を振った
    expect(summary.swingAtStrikeRate).toBeCloseTo(0.75, 12);
    // ゾーン外 2 球のうち 1 球を振った
    expect(summary.swingAtBallRate).toBeCloseTo(0.5, 12);
    // dt = -20, 40, 100, 20: 平均 35、母分散 1875
    expect(summary.dtMeanMs).toBeCloseTo(35, 12);
    expect(summary.dtSdMs).toBeCloseTo(Math.sqrt(1875), 10);
    // px は null を除いた [30, 50, 70] の中央値
    expect(summary.distancePxMedian).toBeCloseTo(50, 12);
  });

  it("タップが通らなかった理由の件数・pointercancel・入力種別を数える", () => {
    const summary = summarize(SAMPLE);
    expect(summary.ignoredByReason).toEqual({ "not-ready": 0, holding: 0, "tap-too-long": 2, "tap-moved": 1, cancel: 0, "held-release": 1 });
    expect(summary.pointerCancels).toBe(3);
    expect(summary.sources).toEqual({ tap: 2, "touch-second": 1, button: 1, key: 0, mouse: 0 });
  });

  it("投球とフレーム時間の集計", () => {
    const summary = summarize(SAMPLE);
    expect(summary.pitchesThrown).toBe(4);
    expect(summary.niceRate).toBeCloseTo(0.25, 12);
    // 窓ごとの p95 [20, 40, 30] の中央値
    expect(summary.fpsP95Ms).toBeCloseTo(30, 12);
  });

  it("空のログは件数 0・割合と統計は null", () => {
    const summary = summarize([]);
    expect(summary.battingPitches).toBe(0);
    expect(summary.swings).toBe(0);
    expect(summary.contactRate).toBeNull();
    expect(summary.swingAtStrikeRate).toBeNull();
    expect(summary.swingAtBallRate).toBeNull();
    expect(summary.dtMeanMs).toBeNull();
    expect(summary.dtSdMs).toBeNull();
    expect(summary.distancePxMedian).toBeNull();
    expect(summary.niceRate).toBeNull();
    expect(summary.fpsP95Ms).toBeNull();
    expect(summary.pointerCancels).toBe(0);
    expect(summary.ignoredByReason["tap-too-long"]).toBe(0);
    expect(summary.sources.tap).toBe(0);
  });

  it("見逃しだけのログではコンタクト率が null で、ゾーン内を振った率は 0", () => {
    const summary = summarize([makeBat({ inZone: true, swing: null, result: "called-strike" })]);
    expect(summary.contactRate).toBeNull();
    expect(summary.swingAtStrikeRate).toBeCloseTo(0, 12);
    expect(summary.swingAtBallRate).toBeNull();
  });
});
