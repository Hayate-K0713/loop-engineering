import type { BattedLanding, InPlayResult } from "../../../types/batting";
import type { PitchOutcomeView } from "../../../types/view";
import { LANDING_PARAMS } from "../../batting/params";

// テロップ(プレー結果の大きな文言)。文言は結果と落下点だけで決まる純関数で、表示区間は `PlayPlan.telop` が持つ。

/** テロップの表示区間。`startMs` 以上 `endMs` 未満(ゲーム ms、リリースからの経過)。 */
export type TelopWindow = {
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
};

/** 内野安打とみなす落下点の距離の上限(塁間 × √2 ≈ 38.8m。これ未満なら内野)。 */
const INFIELD_RADIUS = LANDING_PARAMS.baseDistance * Math.SQRT2;

/** 落下点の左右(`lateral` = x / y)から方向名を決める。境界は `LANDING_PARAMS.lateral` と同じ(< −0.25 レフト、> +0.25 ライト)。 */
function directionName(lateral: number): string {
  if (lateral < LANDING_PARAMS.lateral.pull.max) {
    return "レフト";
  }
  return lateral > LANDING_PARAMS.lateral.opposite.min ? "ライト" : "センター";
}

function isInfield(landing: BattedLanding | null): boolean {
  return landing !== null && landing.distance < INFIELD_RADIUS;
}

/** インプレーの文言。方向は落下点の `lateral`(落下点が無いときは「センター」)。 */
function inPlayText(result: InPlayResult, landing: BattedLanding | null): string {
  const direction = directionName(landing?.lateral ?? 0);
  switch (result) {
    case "single":
      return isInfield(landing) ? "内野安打!" : `${direction}前ヒット!`;
    case "double":
      return `${direction}への二塁打!`;
    case "triple":
      return `${direction}への三塁打!`;
    case "homerun":
      return "ホームラン!!";
    case "groundout":
      return "ゴロアウト";
    case "doublePlay":
      return "併殺打!";
    case "flyout":
      return `${direction}フライ`;
    case "lineout":
      return `${direction}ライナー`;
    case "error":
      return "エラー!";
  }
}

/**
 * 1球の結果のテロップ文言。打席が終わった球(`plate`)は専用の文言になる(四球・見逃し三振・空振り三振)。
 * `landing` は `kind = "in-play"` のときの落下点(`computeBattedLanding`)で、それ以外では使わない。
 */
export function telopFor(outcome: PitchOutcomeView, landing: BattedLanding | null): string {
  switch (outcome.kind) {
    case "ball":
      return outcome.plate === "walk" ? "フォアボール" : "ボール";
    case "called-strike":
      return outcome.plate === "strikeout" ? "見逃し三振!" : "ストライク";
    case "swinging-strike":
      return outcome.plate === "strikeout" ? "空振り三振!" : "空振り!";
    case "foul":
      return "ファウル";
    case "in-play":
      return outcome.inPlay === null ? "インプレー" : inPlayText(outcome.inPlay.result, landing);
  }
}

/** 時刻 `tMs`(リリースからのゲーム ms)に表示するテロップ。区間外は `null`(`startMs` ちょうどは表示、`endMs` ちょうどは消える)。 */
export function telopAt(plan: { readonly telop: TelopWindow }, tMs: number): string | null {
  const { text, startMs, endMs } = plan.telop;
  return tMs >= startMs && tMs < endMs ? text : null;
}
