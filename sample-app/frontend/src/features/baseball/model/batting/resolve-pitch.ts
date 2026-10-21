import type { PitchResult, SwingInput } from "../../types/batting";
import type { RngState, WithRng } from "../../types/common";
import type { Bases } from "../../types/game";
import type { PitchFlight } from "../../types/pitch";
import type { BatterProfile } from "../../types/team";
import { isStrike } from "../pitch/zone";
import { shapeContact } from "./batted-ball";
import { measureContact } from "./contact";
import { drawInPlayResult } from "./result-table";

export type ResolvePitchInput = {
  readonly flight: PitchFlight;
  /** スイング。`null` は見送り。 */
  readonly swing: SwingInput | null;
  readonly batter: BatterProfile;
  /** 解決前のアウト数(併殺の可否の判定に使う)。 */
  readonly outs: number;
  readonly bases: Bases;
};

/** 見送りの判定。ゾーン内なら見逃しストライク、外ならボール。 */
function resolveTake(flight: PitchFlight): PitchResult {
  return isStrike(flight.landing) ? { kind: "called-strike" } : { kind: "ball" };
}

/** 併殺が成立しうるか(1 塁走者あり、かつ 2 アウト未満)。 */
function isDoublePlayPossible(outs: number, bases: Bases): boolean {
  return bases.first && outs < 2;
}

/**
 * 1 球の判定。**人間打者も CPU 打者もこの関数だけを通る**(唯一の 1 球判定)。
 * 見送り(`swing: null`)・空振り・ファウルでは乱数を消費せず、インプレーのときだけ結果表の抽選で乱数を 1 個消費する。
 */
export function resolvePitch(rng: RngState, input: ResolvePitchInput): WithRng<PitchResult> {
  const { flight, swing, batter, outs, bases } = input;
  if (swing === null) {
    return [resolveTake(flight), rng];
  }
  const contact = measureContact({ flight, swing, batter });
  if (contact.kind === "miss") {
    return [{ kind: "swinging-strike" }, rng];
  }
  const judgement = shapeContact({ ...contact.hit, swingKind: swing.kind, batter });
  if (judgement.kind !== "fair") {
    return [{ kind: "foul" }, rng];
  }
  const [result, next] = drawInPlayResult(rng, judgement.ball, isDoublePlayPossible(outs, bases));
  return [{ kind: "in-play", result, ball: judgement.ball }, next];
}
