import { useRef } from "react";
import { summarizeFrameIntervals, type FrameWindowStats } from "../model/telemetry/frame-perf";
import { useAnimationFrame } from "./useAnimationFrame";
import { useLatest } from "./useLatest";

/** 窓の既定の長さ(ms)。品質ティアの自動切替(2 秒の窓ごとの p95)と同じ。 */
export const FRAME_PERF_WINDOW_MS = 2000;

/** これを超える rAF の間隔(ms)はタブの非表示・サスペンド等で、描画の重さではないので集計から外す。 */
export const FRAME_PERF_MAX_INTERVAL_MS = 1000;

/** 1 つの窓の集計結果。 */
export type FramePerfWindow = {
  /** 窓が閉じた時刻(`performance.now()`)。 */
  readonly nowMs: number;
  /** 窓に入った rAF の間隔(ms)。`buildPerfRecord(atMs, intervalsMs)` にそのまま渡せる。 */
  readonly intervalsMs: readonly number[];
  /** 中央値の fps・p95 のフレーム時間・落ちたフレームの割合。 */
  readonly stats: FrameWindowStats;
};

export type FramePerfOptions = {
  /** 真の間にだけ rAF の間隔を集める(例: 投球の飛行中)。偽の間は rAF ループ自体を動かさない。 */
  readonly active: boolean;
  /** 窓ごとに 1 回呼ばれる。最新のものが使われる。 */
  readonly onWindow: (window: FramePerfWindow) => void;
  /** 窓の長さ(ms)。省略は `FRAME_PERF_WINDOW_MS`。集めた間隔の合計がこれに達したら窓を閉じる。 */
  readonly windowMs?: number;
};

type Collector = {
  intervals: number[];
  totalMs: number;
};

/** 1 フレーム分の間隔を窓へ足し、窓が閉じたら `onWindow` を呼ぶ。範囲外の間隔は捨てる。 */
function collectInterval(collector: Collector, nowMs: number, deltaMs: number, options: FramePerfOptions): void {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0 || deltaMs > FRAME_PERF_MAX_INTERVAL_MS) {
    return;
  }
  collector.intervals.push(deltaMs);
  collector.totalMs += deltaMs;
  if (collector.totalMs < (options.windowMs ?? FRAME_PERF_WINDOW_MS)) {
    return;
  }
  const intervalsMs = collector.intervals;
  collector.intervals = [];
  collector.totalMs = 0;
  const stats = summarizeFrameIntervals(intervalsMs);
  if (stats !== null) {
    options.onWindow({ nowMs, intervalsMs, stats });
  }
}

/**
 * `active` の間の rAF の間隔を集め、間隔の合計が窓の長さに達するたびに集計(中央値 fps・p95・落ちたフレームの割合)を
 * `onWindow` へ渡す。`active` が偽の間の時間は窓に数えず、途中の窓は次に `active` になったときへ持ち越す
 * (飛行 1 球は約 1〜2 秒なので、数球分で 1 窓になる)。集計そのものは `model/telemetry/frame-perf.ts` の純関数。
 * ループの開始・停止と `cancelAnimationFrame` は `useAnimationFrame` の cleanup が担う。
 */
export function useFramePerf(options: FramePerfOptions): void {
  const optionsRef = useLatest(options);
  const collectorRef = useRef<Collector>({ intervals: [], totalMs: 0 });

  useAnimationFrame(
    (nowMs, deltaMs) => {
      collectInterval(collectorRef.current, nowMs, deltaMs, optionsRef.current);
      return "continue";
    },
    options.active ? "frame-perf" : null,
  );
}
