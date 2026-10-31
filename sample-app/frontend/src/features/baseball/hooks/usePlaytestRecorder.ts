import { useCallback, useEffect, useRef, type RefObject } from "react";
import { buildPerfRecord } from "../model/telemetry/frame-perf";
import { buildBatRecord, buildIgnoredRecord, buildPlaytestSwing, buildPointerCancelRecord, buildStageRecord } from "../model/telemetry/records";
import { summarize } from "../model/telemetry/summary";
import type { IgnoredInputReason, PitchResult, SwingInput, SwingMeta } from "../types/batting";
import type { PitchFlight } from "../types/pitch";
import type { ScenePhase } from "../types/scene";
import type { ScreenRect, StageHandle } from "../types/stage";
import type { PlaytestSummary, PlaytestSwing } from "../types/telemetry";
import type { GameView, PitchOutcomeView } from "../types/view";
import { useFramePerf } from "./useFramePerf";
import { useLatest } from "./useLatest";
import type { PlaytestLogApi } from "./usePlaytestLog";

/** 直近の人間のスイング(試遊ログ用)。`seq` はスイング時点の `flight.seq`。1 つの `seq` につき最初の 1 回だけ記録する。 */
export type SwingLogEntry = {
  readonly seq: number;
  readonly input: SwingInput;
  readonly meta: SwingMeta;
};

/** 試遊ログ画面(`PlaytestPanel`)に渡す内容(`onClose` と開閉の状態は画面側)。 */
type PlaytestPanelData = {
  readonly summary: PlaytestSummary;
  readonly recordCount: number;
  readonly json: string;
  readonly csv: string;
  readonly saveFailed: boolean;
  readonly scaleWarning: boolean;
  readonly onClear: () => void;
};

/** 試遊ログ画面の内容を組み立てる(画面を開いている間だけ呼ぶ。要約・JSON・CSV を作り直す)。 */
export function playtestPanelOf(log: PlaytestLogApi): PlaytestPanelData {
  return {
    summary: summarize(log.records),
    recordCount: log.records.length,
    json: log.exportJson(),
    csv: log.exportCsv(),
    saveFailed: log.saveFailed,
    scaleWarning: log.scaledDownSuspected,
    onClear: log.clear,
  };
}

/** 解決した球を試遊ログの語彙(`PitchResult`)にする。インプレーなのに打球が無い(想定外)ときは `null`。 */
function pitchResultOf(outcome: PitchOutcomeView): PitchResult | null {
  switch (outcome.kind) {
    case "ball":
      return { kind: "ball" };
    case "called-strike":
      return { kind: "called-strike" };
    case "swinging-strike":
      return { kind: "swinging-strike" };
    case "foul":
      return { kind: "foul" };
    case "in-play":
      return outcome.inPlay === null ? null : { kind: "in-play", result: outcome.inPlay.result, ball: outcome.inPlay.ball };
  }
}

type RecorderOptions = {
  readonly log: PlaytestLogApi;
  /** 最新の view(`outcome` で球の解決を知る)。 */
  readonly view: GameView;
  /** 表示用に保持された view。球が解決した時点のモード・難易度・予告の見せ方はこれを読む(解決で次の半回のモードに変わっていることがあるため)。 */
  readonly heldView: GameView;
  /** director が最後に見た投球。 */
  readonly lastFlight: PitchFlight | null;
  /** ゾーン枠の画面矩形(距離の px 換算に使う)。 */
  readonly zoneRect: ScreenRect | null;
  readonly stage: StageHandle | null;
  /** 人間のスイングの記録(`useGameStage` が `onSwing` で書く)。 */
  readonly swingLogRef: RefObject<SwingLogEntry | null>;
  /** 演出のフェーズ(`idle` 以外の間だけフレーム間隔を集める)。 */
  readonly phase: ScenePhase;
};

/** 見逃し・ボール球は、reducer がスイングを受理していない(`planSwingOf` の `dropped`)。ログにもスイングとして残さない。 */
function swingLogOf(options: RecorderOptions, outcome: PitchOutcomeView, flight: PitchFlight): PlaytestSwing | null {
  const entry = options.swingLogRef.current;
  const taken = outcome.kind === "ball" || outcome.kind === "called-strike";
  if (entry === null || entry.seq !== outcome.seq || taken) {
    return null;
  }
  return buildPlaytestSwing({
    meta: entry.meta,
    kind: entry.input.kind,
    atMs: entry.input.atMs,
    dtMs: entry.input.atMs - flight.durationMs,
    landing: flight.landing,
    pxPerZoneUnit: options.zoneRect === null ? null : options.zoneRect.width / 2,
  });
}

/** 人間打撃の 1 球が解決するたびに、打撃の記録を 1 件足す(同じ球で二重に足さない)。 */
function useBatRecording(options: RecorderOptions): void {
  const latest = useLatest(options);
  const loggedSeqRef = useRef<number | null>(null);
  const outcomeSeq = options.view.outcome === null ? null : options.view.outcome.seq;
  useEffect(() => {
    const current = latest.current;
    const { log, view, heldView, lastFlight } = current;
    const outcome = view.outcome;
    if (!log.enabled || outcome === null || loggedSeqRef.current === outcome.seq) {
      return;
    }
    loggedSeqRef.current = outcome.seq;
    const result = pitchResultOf(outcome);
    if (heldView.mode !== "human-batting" || result === null || lastFlight === null || lastFlight.seq !== outcome.seq) {
      return;
    }
    log.record(
      buildBatRecord({
        atMs: log.elapsedMs(),
        seq: outcome.seq,
        pitchKind: lastFlight.kind,
        durationMs: lastFlight.durationMs,
        landing: lastFlight.landing,
        preview: heldView.assist.preview,
        difficulty: heldView.difficulty,
        swing: swingLogOf(current, outcome, lastFlight),
        result,
      }),
    );
  }, [outcomeSeq, latest]);
}

/** 起動後の最初の投球で、ステージの描画負荷(`stats()`)を 1 回だけ記録する(描画が始まっていて 0 でないときだけ。0 なら次の投球でやり直す)。 */
function useStageStatsRecording(options: RecorderOptions): void {
  const latest = useLatest(options);
  const recordedRef = useRef(false);
  const flightSeq = options.lastFlight === null ? null : options.lastFlight.seq;
  useEffect(() => {
    const { log, stage } = latest.current;
    if (!log.enabled || flightSeq === null || recordedRef.current) {
      return;
    }
    const stats = stage === null ? null : stage.stats();
    if (stats === null || stats.drawCalls <= 0) {
      return;
    }
    recordedRef.current = true;
    log.record(buildStageRecord(log.elapsedMs(), stats.drawCalls, stats.triangles));
  }, [flightSeq, latest]);
}

type InputRecorder = {
  /** 押したのにスイングにならなかった入力を記録する。 */
  readonly recordIgnored: (reason: IgnoredInputReason) => void;
  /** pointercancel を記録する。 */
  readonly recordPointerCancel: () => void;
};

/**
 * 入力の記録(`log.enabled` が偽なら何もしない): 押したのにスイングにならなかった入力と pointercancel。
 * 打撃操作(`useBattingControls`)より前に作る必要があるので、director などに依存する `usePlaytestRecorder` とは別に切り出している。
 */
export function useInputRecorder(log: PlaytestLogApi): InputRecorder {
  const latestLog = useLatest(log);
  const recordIgnored = useCallback(
    (reason: IgnoredInputReason): void => latestLog.current.record(buildIgnoredRecord(latestLog.current.elapsedMs(), reason)),
    [latestLog],
  );
  const recordPointerCancel = useCallback((): void => latestLog.current.record(buildPointerCancelRecord(latestLog.current.elapsedMs())), [latestLog]);
  return { recordIgnored, recordPointerCancel };
}

/**
 * 試遊ログの記録(`log.enabled` が偽なら何もしない): 人間打撃の 1 球ごとの記録、起動後 1 回のステージ負荷、投球の飛行中のフレーム間隔(窓ごとの p95)。
 * 外部送信はしない。
 */
export function usePlaytestRecorder(options: RecorderOptions): void {
  const { log, phase } = options;
  const latestLog = useLatest(log);
  useBatRecording(options);
  useStageStatsRecording(options);
  useFramePerf({
    active: log.enabled && phase !== "idle",
    onWindow: ({ nowMs, intervalsMs }) => {
      const record = buildPerfRecord(latestLog.current.elapsedMs(nowMs), intervalsMs);
      if (record !== null) {
        latestLog.current.record(record);
      }
    },
  });
}
