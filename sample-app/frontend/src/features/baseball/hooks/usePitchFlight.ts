import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { TAP_ARRIVAL_HOLD_MS } from "../model/world/sequence/input-route";
import { swingAtMs } from "../model/world/sequence/swing-time";
import type { SwingOrigin } from "../types/batting";
import type { PitchFlight } from "../types/pitch";
import { useAnimationFrame, type FrameResult } from "./useAnimationFrame";
import { useLatest } from "./useLatest";

type UsePitchFlightOptions = {
  /** 飛行中の球。`null` の間は到達通知をしない(経過時間の時計は次の `flight` が出るまで進み続ける)。 */
  readonly flight: PitchFlight | null;
  /** `GameView.arriveAfterMs`。投球開始からこの経過ゲーム時間に達したら `onArrive` を1回呼ぶ。 */
  readonly arriveAfterMs: number;
  /**
   * `onArrive` の前倒し量(ゲーム ms)。`arriveAfterMs − leadMs` に通知する。CPU 打者は `CPU_SWING_LEAD_MS`、人間打者は 0。
   * 判定そのものは `flight.durationMs` 基準で、通知の時刻にだけ影響する。
   */
  readonly leadMs: number;
  /** 壁時計 → ゲーム時間の倍率(`fast=1` で大きくなる)。判定窓などモデルの数値は変えない。 */
  readonly timeScale: number;
  readonly onArrive: () => void;
};

export type UsePitchFlightResult = {
  /**
   * リリース(`flight` の出現)からの経過ゲーム時間(ms)。演出とスイング時刻に共通の時計。
   * `flight` が `null` になっても次の `flight` が出るまで進み続け、一度も `flight` が出ていなければ 0。
   */
  readonly getElapsedMs: () => number;
  /**
   * スイングの判定時刻 `atMs`(リリースからの経過ゲーム時間 ms。遅延補正後なので過去の時刻になりうる)。
   * 入力イベントの `origin` があればその時刻から求め、`null`(プログラムからの呼び出し)は現在時刻から求める(`swingAtMs`)。
   */
  readonly getSwingAtMs: (origin: SwingOrigin | null) => number;
  /**
   * 到達通知(`onArrive`)を `ms`(壁時計 ms。`TAP_ARRIVAL_HOLD_MS` を上限)だけ保留する。タップ候補の指が下りている間に呼ぶ。
   * 保留は時間で自動的に切れる(指を離すイベントが届かなくても試合が止まらない)。`ms` が正でない・`NaN` は何もしない。
   */
  readonly holdArrivalFor: (ms: number) => void;
  /** 保留を解く。次のフレームで到達時刻を過ぎていれば通知される(`flight` が `null` になっていれば通知されない)。 */
  readonly releaseArrival: () => void;
};

/** 保留が有効か。期限を過ぎていたら状態も解く。 */
function isArrivalHeld(holdUntilRef: RefObject<number | null>): boolean {
  const holdUntil = holdUntilRef.current;
  if (holdUntil === null) {
    return false;
  }
  if (performance.now() < holdUntil) {
    return true;
  }
  holdUntilRef.current = null;
  return false;
}

/**
 * 飛行中の球の経過時間の時計と、到達時刻(`arriveAfterMs − leadMs`)の通知。描画はしない(ボールの位置は director が `SceneFrame` で渡す)。
 * 開始時刻は `useLayoutEffect` で記録するので、`flight` が出た直後の最初の描画前に新しい時計になる(古い値が1フレーム見えない)。
 * 到達通知は `flight`(`seq`)が変わるたびにループを作り直し、cleanup で `cancelAnimationFrame` する(StrictMode の二重 mount でも通知は1回)。
 * `flight` が `null` になる(人間がスイングした)とループは作られず、通知されない。
 * タップ候補の指がある間は `holdArrivalFor`/`releaseArrival` で通知を保留できる(1 本指のタップは離すまでスイングが確定しないため)。
 * 保留は `flight` が変わるとき・unmount で解く。
 */
export function usePitchFlight(options: UsePitchFlightOptions): UsePitchFlightResult {
  const latest = useLatest(options);
  const startedAtRef = useRef<number | null>(null);
  const holdUntilRef = useRef<number | null>(null);
  const seq = options.flight === null ? null : options.flight.seq;

  // 開始時刻は `flight` が `null` になっても保持する(人間のスイング後も演出が同じ時計で続く)ため、cleanup では何も戻さない。
  // 解放する資源は無く、ref への代入だけなので StrictMode の再実行でも害はない。
  useLayoutEffect(() => {
    if (seq !== null) {
      startedAtRef.current = performance.now();
    }
  }, [seq]);

  // 前の投球の保留を持ち越さない。unmount でも解く。
  useEffect(
    () => () => {
      holdUntilRef.current = null;
    },
    [seq],
  );

  const getElapsedMs = useCallback((): number => {
    const startedAt = startedAtRef.current;
    return startedAt === null ? 0 : (performance.now() - startedAt) * latest.current.timeScale;
  }, [latest]);

  const getSwingAtMs = useCallback(
    (origin: SwingOrigin | null): number =>
      swingAtMs({ origin, nowMs: performance.now(), startedAtMs: startedAtRef.current, timeScale: latest.current.timeScale }),
    [latest],
  );

  const holdArrivalFor = useCallback((ms: number): void => {
    if (ms > 0) {
      holdUntilRef.current = performance.now() + Math.min(ms, TAP_ARRIVAL_HOLD_MS);
    }
  }, []);

  const releaseArrival = useCallback((): void => {
    holdUntilRef.current = null;
  }, []);

  useAnimationFrame((): FrameResult => {
    const { flight, arriveAfterMs, leadMs, onArrive } = latest.current;
    if (flight === null) {
      return "stop";
    }
    if (getElapsedMs() < arriveAfterMs - leadMs || isArrivalHeld(holdUntilRef)) {
      return "continue";
    }
    onArrive();
    return "stop";
  }, seq);

  return { getElapsedMs, getSwingAtMs, holdArrivalFor, releaseArrival };
}
