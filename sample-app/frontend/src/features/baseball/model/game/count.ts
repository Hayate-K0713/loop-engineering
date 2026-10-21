import type { Count } from "../../types/game";

/** 打席の終わり方。`none` は打席が続く。 */
export type CountEnd = "none" | "walk" | "strikeout";

/** カウントを1つ進めた結果。`end` が `none` 以外のとき、打席は終了し `count` は次の打者の 0-0 になる。 */
export type CountStep = { readonly count: Count; readonly end: CountEnd };

export const EMPTY_COUNT: Count = { balls: 0, strikes: 0 };

const BALLS_FOR_WALK = 4;
const STRIKES_FOR_STRIKEOUT = 3;
const MAX_STRIKES_BY_FOUL = 2;

const WALK: CountStep = { count: EMPTY_COUNT, end: "walk" };
const STRIKEOUT: CountStep = { count: EMPTY_COUNT, end: "strikeout" };

/** ボール。4つ目で四球。 */
export function applyBall(count: Count): CountStep {
  const balls = count.balls + 1;
  return balls >= BALLS_FOR_WALK ? WALK : { count: { balls, strikes: count.strikes }, end: "none" };
}

/** ストライク(見逃し・空振り)。3つ目で三振。 */
export function applyStrike(count: Count): CountStep {
  const strikes = count.strikes + 1;
  return strikes >= STRIKES_FOR_STRIKEOUT ? STRIKEOUT : { count: { balls: count.balls, strikes }, end: "none" };
}

/** ファウル。2ストライク未満なら+1、2ストライク後は不変。 */
export function applyFoul(count: Count): CountStep {
  const strikes = count.strikes < MAX_STRIKES_BY_FOUL ? count.strikes + 1 : count.strikes;
  return { count: { balls: count.balls, strikes }, end: "none" };
}
