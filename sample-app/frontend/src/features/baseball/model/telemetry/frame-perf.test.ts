import { describe, expect, it } from "vitest";
import { buildPerfRecord, LONG_FRAME_MS, summarizeFrameIntervals } from "./frame-perf";

describe("frame-perf", () => {
  it("間隔が無い・不正な値だけなら null", () => {
    expect(summarizeFrameIntervals([])).toBeNull();
    expect(summarizeFrameIntervals([0, -3, Number.NaN, Number.POSITIVE_INFINITY])).toBeNull();
    expect(buildPerfRecord(100, [])).toBeNull();
  });

  it("一定の 16.67ms 間隔なら 60fps・p95 も 16.67ms・落ちたフレーム 0", () => {
    const stats = summarizeFrameIntervals(Array.from({ length: 120 }, () => 1000 / 60));
    expect(stats?.fpsMedian).toBeCloseTo(60, 9);
    expect(stats?.p95Ms).toBeCloseTo(1000 / 60, 9);
    expect(stats?.longFrameRatio).toBeCloseTo(0, 12);
  });

  it("p95 と落ちたフレームの割合が手計算と一致する", () => {
    // 90 個が 20ms、残り 10 個が 60ms(> 50ms): 100 件の p95 は 95 番目 = 60ms、落ちた割合 0.10、中央値 20ms = 50fps
    const intervals = [...Array.from({ length: 90 }, () => 20), ...Array.from({ length: 10 }, () => 60)];
    const stats = summarizeFrameIntervals(intervals);
    expect(stats?.fpsMedian).toBeCloseTo(50, 9);
    expect(stats?.p95Ms).toBeCloseTo(60, 9);
    expect(stats?.longFrameRatio).toBeCloseTo(0.1, 12);
  });

  it("ちょうど 50ms は落ちたフレームに数えない", () => {
    const stats = summarizeFrameIntervals([LONG_FRAME_MS, LONG_FRAME_MS]);
    expect(stats?.longFrameRatio).toBeCloseTo(0, 12);
  });

  it("buildPerfRecord は perf の記録にする", () => {
    const record = buildPerfRecord(2500, [20, 20, 20]);
    expect(record?.type).toBe("perf");
    expect(record?.atMs).toBeCloseTo(2500, 12);
    expect(record?.fpsMedian).toBeCloseTo(50, 9);
  });
});
