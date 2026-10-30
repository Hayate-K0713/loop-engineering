// telemetry のテスト用の記録の作り手(既定値つき)。テストからだけ import する。
import type { PlaytestRecord, PlaytestSwing } from "../../types/telemetry";

type BatRecord = Extract<PlaytestRecord, { readonly type: "bat" }>;
type PitchRecord = Extract<PlaytestRecord, { readonly type: "pitch" }>;
type PerfRecord = Extract<PlaytestRecord, { readonly type: "perf" }>;

export function makeSwing(overrides: Partial<PlaytestSwing> = {}): PlaytestSwing {
  return {
    source: "tap",
    kind: "meet",
    pressAtMs: 1000,
    atMs: 1200,
    dtMs: 0,
    raw: { x: 0, y: 0 },
    effective: { x: 0, y: 0 },
    assistK: 0.3,
    distanceZone: 0.2,
    distancePx: 30,
    fingerTravelPx: 80,
    tapHoldMs: 90,
    tapMovePx: 3,
    ...overrides,
  };
}

export function makeBat(overrides: Partial<BatRecord> = {}): BatRecord {
  return {
    type: "bat",
    atMs: 5000,
    seq: 1,
    pitchKind: "straight",
    durationMs: 1310,
    landing: { x: 0, y: 0 },
    inZone: true,
    preview: "exact",
    difficulty: "normal",
    swing: makeSwing(),
    result: "foul",
    ...overrides,
  };
}

export function makePitch(overrides: Partial<PitchRecord> = {}): PitchRecord {
  return {
    type: "pitch",
    atMs: 9000,
    seq: 1,
    pitchKind: "straight",
    aim: { x: 0, y: 0 },
    landing: { x: 0.1, y: 0 },
    stopAtMs: 880,
    errMs: 20,
    quality: "good",
    result: "called-strike",
    ...overrides,
  };
}

export function makePerf(overrides: Partial<PerfRecord> = {}): PerfRecord {
  return { type: "perf", atMs: 7000, fpsMedian: 58, p95Ms: 22, longFrameRatio: 0.01, ...overrides };
}

export function makeIgnored(reason: Extract<PlaytestRecord, { readonly type: "ignored" }>["reason"], atMs = 3000): PlaytestRecord {
  return { type: "ignored", atMs, reason };
}
