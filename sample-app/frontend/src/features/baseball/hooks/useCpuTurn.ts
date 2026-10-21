import { useEffect } from "react";
import { useLatest } from "./useLatest";

type UseCpuTurnOptions = {
  /** CPU が投げる番(`GameView.cpuPitchPending`)。 */
  readonly cpuPitchPending: boolean;
  /** `GameView.turnKey`。手番が進むたびに待機をやり直すためのキー。 */
  readonly turnKey: string;
  /** CPU 手番の待機時間(ms)。 */
  readonly cpuWaitMs: number;
  readonly onCpuPitch: () => void;
};

/**
 * CPU の手番を待機後に dispatch する。`cpuPitchPending` が真の間だけ `setTimeout(cpuWaitMs)` で `onCpuPitch` を1回呼ぶ。
 * cleanup で `clearTimeout` するので、StrictMode の二重 mount でも dispatch は1回だけになる。
 */
export function useCpuTurn({ cpuPitchPending, turnKey, cpuWaitMs, onCpuPitch }: UseCpuTurnOptions): void {
  const onCpuPitchRef = useLatest(onCpuPitch);
  useEffect(() => {
    if (!cpuPitchPending) {
      return undefined;
    }
    const timerId = window.setTimeout(() => onCpuPitchRef.current(), cpuWaitMs);
    return () => window.clearTimeout(timerId);
  }, [cpuPitchPending, turnKey, cpuWaitMs, onCpuPitchRef]);
}
