// 到達通知(`PITCH_ARRIVED`)を出す時刻の判定(純関数)。1 本指のタップは離すまでスイングが確定しないので、タップ候補の指がある間は通知を保留する。
// 保留は「どの投球(`seq`)のものか」と期限を持ち、現在の投球と一致するものだけが有効。投球が変われば古い保留は自然に無視される
// (effect の cleanup に頼って解除しない)。hooks(`usePitchFlight`)は ref に保留を持ち、毎フレームこの関数で通知してよいかを聞くだけ。

import { TAP_ARRIVAL_HOLD_MS } from "./input-route";

/** 到達通知の保留。`seq` = 保留した時点の投球(`PitchFlight.seq`)、`untilMs` = 期限(壁時計 ms。`performance.now()` と同じ基準)。 */
export type ArrivalHold = {
  readonly seq: number;
  readonly untilMs: number;
};

type HoldArrivalInput = {
  /** 保留する投球の `seq`。 */
  readonly seq: number;
  /** 現在の壁時計 ms。 */
  readonly nowMs: number;
  /** 保留したい長さ(壁時計 ms)。`TAP_ARRIVAL_HOLD_MS` を上限にする。 */
  readonly ms: number;
};

/** 保留を作る。`ms` が正でない・`NaN` のときは `null`(何も保留しない)。期限は `nowMs + min(ms, TAP_ARRIVAL_HOLD_MS)`。 */
export function holdArrival(input: HoldArrivalInput): ArrivalHold | null {
  if (Number.isNaN(input.ms) || input.ms <= 0) {
    return null;
  }
  return { seq: input.seq, untilMs: input.nowMs + Math.min(input.ms, TAP_ARRIVAL_HOLD_MS) };
}

type ArrivalDueInput = {
  /** 投球開始からの経過ゲーム時間(ms)。 */
  readonly elapsedMs: number;
  /** 通知する経過ゲーム時間(`arriveAfterMs − leadMs`)。 */
  readonly arriveAtMs: number;
  /** 保留。保留していなければ `null`(`releaseArrival` で解いた後も `null`)。 */
  readonly hold: ArrivalHold | null;
  /** 現在の投球の `seq`。 */
  readonly seq: number;
  /** 現在の壁時計 ms。 */
  readonly nowMs: number;
};

/** 保留が現在の投球のもので、期限内か。 */
function isHeld(input: ArrivalDueInput): boolean {
  return input.hold !== null && input.hold.seq === input.seq && input.nowMs < input.hold.untilMs;
}

/** 到達通知を出してよいか。到達時刻に達していて、かつ(現在の投球に対する有効な)保留が無いとき真。 */
export function arrivalDue(input: ArrivalDueInput): boolean {
  return input.elapsedMs >= input.arriveAtMs && !isHeld(input);
}
