import type { ContactQuality, Strength } from "../../../types/batting";
import type { PitchOutcomeView } from "../../../types/view";

// タイミングのピルの 2 行目(接触の質「芯」「ふつう」「かすり」「ミス」)を、解決した球の結果から決める純関数。
// 接触の質 q そのものは打球の強さ(`strength`)に畳み込まれて結果に出るので、強さを質の代わりに使う(新しいしきい値を作らない)。

/** 質の判定に使う結果の部分(`PitchOutcomeView` の構造的な部分型)。 */
type QualityOutcome = Pick<PitchOutcomeView, "kind" | "inPlay">;

/**
 * 人間がスイングした球の接触の質。空振りは「ミス」、ファウルは「かすり」、フェアの打球は強さで
 * 強 = 「芯」・中 = 「ふつう」・弱 = 「かすり」。振っていない結果(ボール・見逃し)と、フェアなのに打球が無い(想定外)は `null`。
 */
export function contactQualityOf(outcome: QualityOutcome): ContactQuality | null {
  switch (outcome.kind) {
    case "swinging-strike":
      return "miss";
    case "foul":
      return "graze";
    case "in-play":
      return outcome.inPlay === null ? null : qualityOfStrength(outcome.inPlay.ball.strength);
    default:
      return null;
  }
}

function qualityOfStrength(strength: Strength): ContactQuality {
  switch (strength) {
    case "strong":
      return "core";
    case "medium":
      return "normal";
    default:
      return "graze";
  }
}
