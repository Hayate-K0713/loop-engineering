import { describe, expect, it } from "vitest";
import type { BattedBall, Strength } from "../../../types/batting";
import type { PitchOutcomeView } from "../../../types/view";
import { contactQualityOf } from "./contact-quality";

function inPlay(strength: Strength): Pick<PitchOutcomeView, "kind" | "inPlay"> {
  const ball: BattedBall = { type: "liner", strength, direction: "center" };
  return { kind: "in-play", inPlay: { result: "single", ball } };
}

describe("contactQualityOf", () => {
  it("空振りは「ミス」、ファウルは「かすり」", () => {
    expect(contactQualityOf({ kind: "swinging-strike", inPlay: null })).toBe("miss");
    expect(contactQualityOf({ kind: "foul", inPlay: null })).toBe("graze");
  });

  it("フェアの打球は強さで 芯/ふつう/かすり", () => {
    expect(contactQualityOf(inPlay("strong"))).toBe("core");
    expect(contactQualityOf(inPlay("medium"))).toBe("normal");
    expect(contactQualityOf(inPlay("weak"))).toBe("graze");
  });

  it("振っていない結果(ボール・見逃し)と、打球の無いフェアは null", () => {
    expect(contactQualityOf({ kind: "ball", inPlay: null })).toBeNull();
    expect(contactQualityOf({ kind: "called-strike", inPlay: null })).toBeNull();
    expect(contactQualityOf({ kind: "in-play", inPlay: null })).toBeNull();
  });
});
