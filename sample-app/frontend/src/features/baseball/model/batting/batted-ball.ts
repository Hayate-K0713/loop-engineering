import type { BattedType, ContactJudgement, Direction, Strength, SwingKind } from "../../types/batting";
import type { BatterProfile } from "../../types/team";
import type { ContactHit } from "./contact";
import { BATTING_PARAMS } from "./params";

/** `shapeContact` の入力。接触の測定値(`ContactHit`)に、スイング種別と打者能力を加えたもの。 */
export type ShapeInput = ContactHit & {
  readonly swingKind: SwingKind;
  readonly batter: Pick<BatterProfile, "power" | "trajectory">;
};

/**
 * 高さ(カーソル中心からのボールの高さ。正が上)から打球タイプを決める。
 * 弾道が高い打者ほどライナー帯が下にずれ、フライになりやすい。
 */
export function classifyHeight(height: number, trajectory: BatterProfile["trajectory"]): BattedType {
  const shift = (trajectory - 2) * BATTING_PARAMS.trajectoryShiftPerLevel;
  if (height > BATTING_PARAMS.linerHalfBand - shift) {
    return "fly";
  }
  if (height < -(BATTING_PARAMS.linerHalfBand + shift)) {
    return "ground";
  }
  return "liner";
}

/** タイミング誤差から打球方向を決める。ほぼ合っていれば center、早ければ pull、遅ければ opposite。 */
export function classifyDirection(dtMs: number, windowMs: number): Direction {
  if (Math.abs(dtMs) / windowMs < BATTING_PARAMS.centerRatio) {
    return "center";
  }
  return dtMs < 0 ? "pull" : "opposite";
}

/** 窓の端に近いタイミングはファウルになる。 */
export function isFoulTiming(dtMs: number, windowMs: number): boolean {
  return Math.abs(dtMs) / windowMs >= BATTING_PARAMS.foulRatio;
}

/** 打球方向ごとの強さ係数(3 値なので switch で引く)。 */
export function directionFactorOf(direction: Direction): number {
  switch (direction) {
    case "pull":
      return BATTING_PARAMS.directionFactor.pull;
    case "center":
      return BATTING_PARAMS.directionFactor.center;
    case "opposite":
      return BATTING_PARAMS.directionFactor.opposite;
  }
}

/** 強さのスコア = q × (powerBase + powerPerAbility × パワー) × スイング種別係数 × 方向係数。 */
export function strengthScore(q: number, power: number, swingKind: SwingKind, direction: Direction): number {
  const abilityTerm = BATTING_PARAMS.powerBase + BATTING_PARAMS.powerPerAbility * power;
  const kindFactor = swingKind === "power" ? BATTING_PARAMS.kindFactor.power : BATTING_PARAMS.kindFactor.meet;
  return q * abilityTerm * kindFactor * directionFactorOf(direction);
}

/** スコアを強さ段階へ変換する。 */
export function classifyStrength(score: number): Strength {
  if (score < BATTING_PARAMS.mediumFrom) {
    return "weak";
  }
  return score < BATTING_PARAMS.strongFrom ? "medium" : "strong";
}

/**
 * 接触した打球の形を決める(決定論。乱数は使わない)。
 * タイミングが窓の端に近い(`foulRatio` 以上)ならファウル。それ以外はフェア打球で、
 * タイプ(ground / liner / fly)・方向・強さ段階を返す。
 */
export function shapeContact(input: ShapeInput): ContactJudgement {
  if (isFoulTiming(input.dtMs, input.windowMs)) {
    return { kind: "foul" };
  }
  const direction = classifyDirection(input.dtMs, input.windowMs);
  const type = classifyHeight(input.height, input.batter.trajectory);
  const score = strengthScore(input.q, input.batter.power, input.swingKind, direction);
  return { kind: "fair", ball: { type, strength: classifyStrength(score), direction } };
}
