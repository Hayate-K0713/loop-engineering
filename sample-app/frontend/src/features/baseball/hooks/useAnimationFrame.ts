import { useEffect } from "react";
import { useLatest } from "./useLatest";

/** フレームコールバックの戻り値。`"stop"` を返すとループを止める。 */
export type FrameResult = "continue" | "stop";

/** `nowMs` は `performance.now()`、`deltaMs` は前フレーム(ループ開始直後は開始時刻)からの経過 ms。 */
export type FrameCallback = (nowMs: number, deltaMs: number) => FrameResult;

/**
 * 汎用の requestAnimationFrame ループ。
 * `runKey` が `null` の間は動かさない。`null` 以外では、`runKey` が変わるたびにループを作り直す
 * (`"stop"` で止まったループを再開したいときは `runKey` を変える)。cleanup で `cancelAnimationFrame` する。
 * コールバックは `useLatest` 経由で常に最新のものが呼ばれる。時刻は `performance.now()` のみを使う。
 */
export function useAnimationFrame(callback: FrameCallback, runKey: string | number | null): void {
  const callbackRef = useLatest(callback);
  useEffect(() => {
    if (runKey === null) {
      return undefined;
    }
    let frameId = 0;
    let lastMs = performance.now();
    const tick = (): void => {
      const nowMs = performance.now();
      const result = callbackRef.current(nowMs, nowMs - lastMs);
      lastMs = nowMs;
      if (result === "continue") {
        frameId = window.requestAnimationFrame(tick);
      }
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [runKey, callbackRef]);
}
