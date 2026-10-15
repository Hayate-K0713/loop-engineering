import type { TimingCue, TimingLabel } from "../../../types/batting";
import { BATTING_PARAMS } from "../../batting/params";

// スイング直後のタイミング表示(早い・ジャスト・遅い)の判定(純関数)。

/** `PlayPlan.timing`: タイミング表示と、表示する区間(演出の時刻 ms、`startMs` 以上 `endMs` 未満)。 */
export type PlayTiming = TimingCue & {
  readonly startMs: number;
  readonly endMs: number;
};

/** `timing` を持つ演出計画(`PlayPlan` の構造的な部分型)。 */
type TimingPlan = {
  readonly timing: PlayTiming | null;
};

function labelOf(dtMs: number, windowMs: number): TimingLabel {
  if (Math.abs(dtMs) < windowMs * BATTING_PARAMS.centerRatio) {
    return "just";
  }
  return dtMs < 0 ? "early" : "late";
}

/**
 * タイミング表示を作る。`dtMs` = 判定時刻 `atMs` − 到達時刻 D(負 = 早い)、`windowMs` = スイング種別の判定窓(±ms)。
 * ジャスト = `|dtMs| < windowMs × centerRatio`(判定は丸める前の値)。表示用の `dtMs` は四捨五入した整数(−0 にはならない)。
 * 有限でない `dtMs` は 0 とみなす。
 */
export function timingCueOf(dtMs: number, windowMs: number): TimingCue {
  const safe = Number.isFinite(dtMs) ? dtMs : 0;
  return { label: labelOf(safe, windowMs), dtMs: 0 + Math.round(safe) };
}

/** 演出の時刻 `tMs` に表示するタイミング。`startMs ≤ tMs < endMs` のときだけ返し、それ以外(`timing` が無い場合を含む)は `null`。 */
export function timingAt(plan: TimingPlan, tMs: number): TimingCue | null {
  const timing = plan.timing;
  if (timing === null || tMs < timing.startMs || tMs >= timing.endMs) {
    return null;
  }
  return { label: timing.label, dtMs: timing.dtMs };
}
