import { describe, expect, it } from "vitest";
import type { PitchResult, SwingMeta } from "../../types/batting";
import {
  buildBatRecord,
  buildIgnoredRecord,
  buildPitchRecord,
  buildPlaytestSwing,
  buildPointerCancelRecord,
  buildSessionRecord,
  buildStageRecord,
  isSuspectedScaledDown,
  resultKindOf,
} from "./records";

const META: SwingMeta = {
  source: "touch-second",
  pressTimeStamp: 1234,
  raw: { x: 0.9, y: 0.1 },
  effective: { x: 0.3, y: 0.4 },
  assistK: 0.5,
  tapHoldMs: null,
  tapMovePx: null,
  fingerTravelPx: 120,
};

const DEVICE = { innerWidth: 390, innerHeight: 844, devicePixelRatio: 3, pointerCoarse: true, visualViewportScale: 1, userAgent: "ua" };

describe("records", () => {
  it("buildPlaytestSwing は有効カーソルと着弾点の距離をゾーン単位と px で持つ", () => {
    // (0.3, 0.4) と (0, 0) の距離は 0.5(3-4-5)
    const swing = buildPlaytestSwing({ meta: META, kind: "power", atMs: 1100, dtMs: -12, landing: { x: 0, y: 0 }, pxPerZoneUnit: 80 });
    expect(swing.distanceZone).toBeCloseTo(0.5, 12);
    expect(swing.distancePx).toBeCloseTo(40, 10);
    expect(swing.source).toBe("touch-second");
    expect(swing.kind).toBe("power");
    expect(swing.pressAtMs).toBeCloseTo(1234, 12);
    expect(swing.raw).toEqual(META.raw);
    expect(swing.effective).toEqual(META.effective);
    expect(swing.fingerTravelPx).toBeCloseTo(120, 12);
    expect(swing.tapHoldMs).toBeNull();
  });

  it("px へ換算できないときは distancePx が null", () => {
    const swing = buildPlaytestSwing({ meta: META, kind: "meet", atMs: 0, dtMs: 0, landing: { x: 0, y: 0 }, pxPerZoneUnit: null });
    expect(swing.distancePx).toBeNull();
  });

  it("resultKindOf は PitchResult の kind をそのまま返す", () => {
    const inPlay: PitchResult = { kind: "in-play", result: "single", ball: { type: "ground", strength: "weak", direction: "center" } };
    expect(resultKindOf(inPlay)).toBe("in-play");
    expect(resultKindOf({ kind: "ball" })).toBe("ball");
  });

  it("buildBatRecord は inZone を着弾点から決め、見逃しは swing が null", () => {
    const base = {
      atMs: 10,
      seq: 3,
      pitchKind: "curve",
      durationMs: 1652,
      preview: "exact",
      difficulty: "normal",
      swing: null,
      result: { kind: "called-strike" },
    } as const;
    const inside = buildBatRecord({ ...base, landing: { x: 1, y: -1 } });
    const outside = buildBatRecord({ ...base, landing: { x: 1.2, y: 0 } });
    expect(inside.inZone).toBe(true);
    expect(outside.inZone).toBe(false);
    expect(inside.swing).toBeNull();
    expect(inside.result).toBe("called-strike");
    expect(inside.type).toBe("bat");
  });

  it("buildPitchRecord は止めなかった投球を null で持つ", () => {
    const record = buildPitchRecord({
      atMs: 1,
      seq: 2,
      pitchKind: "fork",
      aim: { x: 0, y: 0 },
      landing: { x: 0.5, y: 0.5 },
      stopAtMs: null,
      errMs: null,
      quality: "miss",
      result: { kind: "ball" },
    });
    expect(record.stopAtMs).toBeNull();
    expect(record.errMs).toBeNull();
    expect(record.quality).toBe("miss");
    expect(record.result).toBe("ball");
  });

  it("その他の記録は渡した値をそのまま持つ", () => {
    expect(buildIgnoredRecord(5, "tap-moved")).toEqual({ type: "ignored", atMs: 5, reason: "tap-moved" });
    expect(buildPointerCancelRecord(6)).toEqual({ type: "pointercancel", atMs: 6 });
    expect(buildStageRecord(7, 120, 50000)).toEqual({ type: "stage", atMs: 7, drawCalls: 120, triangles: 50000 });
    expect(buildSessionRecord(0, "abc", DEVICE)).toEqual({ type: "session", atMs: 0, sessionId: "abc", device: DEVICE });
  });

  it("縮小表示の疑いは innerWidth ≥ 900 かつ粗いポインタ", () => {
    expect(isSuspectedScaledDown({ ...DEVICE, innerWidth: 900 })).toBe(true);
    expect(isSuspectedScaledDown({ ...DEVICE, innerWidth: 899 })).toBe(false);
    expect(isSuspectedScaledDown({ ...DEVICE, innerWidth: 1200, pointerCoarse: false })).toBe(false);
  });
});
