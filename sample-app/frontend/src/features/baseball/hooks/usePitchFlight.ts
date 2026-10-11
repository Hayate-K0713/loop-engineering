import { useCallback, useEffect, useRef, type RefObject } from "react";
import { ballPositionAt } from "../model/pitch/flight";
import type { BallPosition, PitchFlight } from "../types/pitch";
import { useAnimationFrame, type FrameResult } from "./useAnimationFrame";
import { useLatest } from "./useLatest";

type UsePitchFlightOptions = {
  /** 飛行中の球。`null` の間は何もしない。 */
  readonly flight: PitchFlight | null;
  /** `GameView.arriveAfterMs`。投球開始からこの経過ゲーム時間に達したら `onArrive` を1回呼ぶ。 */
  readonly arriveAfterMs: number;
  /** 壁時計 → ゲーム時間の倍率(`fast=1` で大きくなる)。判定窓などモデルの数値は変えない。 */
  readonly timeScale: number;
  /** ボールの基準半径(`GameView.geometry.ballRadius`)。表示上の `r` は `ballRadius × scale`。 */
  readonly ballRadius: number;
  readonly onArrive: () => void;
  /** `StrikeZoneSvg` のボール要素。`cx`/`cy`/`r` を直接更新する(ゾーン座標そのまま、y 上向き)。 */
  readonly ballRef: RefObject<SVGCircleElement | null>;
};

export type UsePitchFlightResult = {
  /** 投球開始(ボールの表示開始)からの経過ゲーム時間(ms)。飛行中でなければ 0。スイング時刻の算出に使う。 */
  readonly getElapsedMs: () => number;
};

function paintBall(ball: SVGCircleElement | null, position: BallPosition, baseRadius: number): void {
  if (ball === null) {
    return;
  }
  ball.setAttribute("cx", String(position.x));
  ball.setAttribute("cy", String(position.y));
  ball.setAttribute("r", String(baseRadius * position.scale));
}

/**
 * 飛行中のボールを rAF で動かし、到達時刻に `onArrive` を1回呼ぶ。連続値は state に入れず ref 経由で SVG 属性を更新する。
 * 開始時刻は flight が現れた直後の effect 内で `performance.now()` を記録する。
 * flight(`seq`)が変わるたびにループを作り直し、cleanup で `cancelAnimationFrame` する(StrictMode の二重 mount でも到達通知は1回)。
 */
export function usePitchFlight(options: UsePitchFlightOptions): UsePitchFlightResult {
  const latest = useLatest(options);
  const startedAtRef = useRef<number | null>(null);
  const seq = options.flight === null ? null : options.flight.seq;

  useEffect(() => {
    startedAtRef.current = seq === null ? null : performance.now();
    return () => {
      startedAtRef.current = null;
    };
  }, [seq]);

  const getElapsedMs = useCallback((): number => {
    const startedAt = startedAtRef.current;
    return startedAt === null ? 0 : (performance.now() - startedAt) * latest.current.timeScale;
  }, [latest]);

  useAnimationFrame((): FrameResult => {
    const { flight, arriveAfterMs, ballRadius, ballRef, onArrive } = latest.current;
    if (flight === null) {
      return "stop";
    }
    const elapsedMs = getElapsedMs();
    paintBall(ballRef.current, ballPositionAt(flight, elapsedMs), ballRadius);
    if (elapsedMs < arriveAfterMs) {
      return "continue";
    }
    onArrive();
    return "stop";
  }, seq);

  return { getElapsedMs };
}
