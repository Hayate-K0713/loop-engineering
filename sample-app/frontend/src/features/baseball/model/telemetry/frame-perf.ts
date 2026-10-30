// rAF の間隔(ms)から、窓ごとの fps の中央値・p95・落ちたフレームの割合を求める(`useFramePerf` が使う)。
import type { PlaytestRecord } from "../../types/telemetry";
import { median, percentile } from "./stats";

/** 「落ちたフレーム」とみなす間隔(ms)。品質ティアの「重い」判定(フレームの 10% が 50ms 超)と同じ値。 */
export const LONG_FRAME_MS = 50;

/** 窓の集計。 */
export type FrameWindowStats = {
  readonly fpsMedian: number;
  readonly p95Ms: number;
  readonly longFrameRatio: number;
};

/** 間隔(ms)の列を集計する。正の有限値だけを使い、1 件も無ければ `null`。 */
export function summarizeFrameIntervals(intervalsMs: readonly number[]): FrameWindowStats | null {
  const valid = intervalsMs.filter((interval) => Number.isFinite(interval) && interval > 0);
  const medianInterval = median(valid);
  const p95 = percentile(valid, 0.95);
  if (medianInterval === null || p95 === null) {
    return null;
  }
  const longFrames = valid.filter((interval) => interval > LONG_FRAME_MS).length;
  return { fpsMedian: 1000 / medianInterval, p95Ms: p95, longFrameRatio: longFrames / valid.length };
}

/** 窓の集計を `perf` の記録にする。間隔が無ければ `null`。 */
export function buildPerfRecord(atMs: number, intervalsMs: readonly number[]): Extract<PlaytestRecord, { readonly type: "perf" }> | null {
  const stats = summarizeFrameIntervals(intervalsMs);
  return stats === null ? null : { type: "perf", atMs, ...stats };
}
