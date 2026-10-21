import { describe, expect, it } from "vitest";
import type { SwingInput } from "../../../types/batting";
import type { PitchOutcomeView } from "../../../types/view";
import { isHolding, isPlayFinished, phaseOf, planSwingOf, recordSwing, swingForOutcome, windupProgress } from "./session";

const BOOLS: readonly boolean[] = [true, false];

function outcomeOf(seq: number): PitchOutcomeView {
  return { seq, kind: "ball", inPlay: null, plate: null };
}

function swingAt(atMs: number): SwingInput {
  return { kind: "meet", cursor: { x: 0.1, y: -0.2 }, atMs };
}

describe("isHolding", () => {
  it("outcome が null なら、finishedSeq によらず偽", () => {
    expect([isHolding(null, null), isHolding(null, 0), isHolding(null, 5)]).toEqual([false, false, false]);
  });

  it("outcome.seq が finishedSeq と違えば真、同じなら偽", () => {
    expect(isHolding(outcomeOf(3), 2)).toBe(true);
    expect(isHolding(outcomeOf(3), 4)).toBe(true);
    expect(isHolding(outcomeOf(3), 3)).toBe(false);
  });

  it("finishedSeq が null(まだ何も終わっていない)なら、outcome があれば真", () => {
    expect(isHolding(outcomeOf(1), null)).toBe(true);
  });

  it("演出が終わった後は、次の投球が始まっても(outcome.seq が変わらないので)偽のまま", () => {
    const outcome = outcomeOf(4);
    expect([isHolding(outcome, 3), isHolding(outcome, 4)]).toEqual([true, false]);
    expect(isHolding(outcomeOf(5), 4)).toBe(true);
  });
});

describe("phaseOf", () => {
  const cases = BOOLS.flatMap((hasPlan) => BOOLS.flatMap((hasFlight) => BOOLS.map((windupActive) => ({ hasPlan, hasFlight, windupActive }))));

  it("8通りすべてを走査している", () => {
    expect(cases).toHaveLength(8);
  });

  it("優先順位は plan > flight > windup > idle", () => {
    const phases = cases.map((state) => `${state.hasPlan ? "P" : "-"}${state.hasFlight ? "F" : "-"}${state.windupActive ? "W" : "-"}:${phaseOf(state)}`);
    expect(phases).toEqual(["PFW:play", "PF-:play", "P-W:play", "P--:play", "-FW:flight", "-F-:flight", "--W:windup", "---:idle"]);
  });
});

describe("isPlayFinished", () => {
  const plan = { endMs: 2000 };

  it("endMs 未満は偽、endMs ちょうどと以降は真(境界)", () => {
    expect(isPlayFinished(plan, 0)).toBe(false);
    expect(isPlayFinished(plan, 1999)).toBe(false);
    expect(isPlayFinished(plan, 2000)).toBe(true);
    expect(isPlayFinished(plan, 9999)).toBe(true);
  });
});

describe("windupProgress", () => {
  it("開始で 0、cpuWaitMs 後に 1、途中は線形", () => {
    expect(windupProgress(1000, 1000, 700)).toBe(0);
    expect(windupProgress(1700, 1000, 700)).toBe(1);
    expect(windupProgress(1350, 1000, 700)).toBeCloseTo(0.5, 12);
  });

  it("0〜1 にクランプする(開始前は 0、cpuWaitMs 超過は 1)", () => {
    expect(windupProgress(900, 1000, 700)).toBe(0);
    expect(windupProgress(5000, 1000, 700)).toBe(1);
  });

  it("cpuWaitMs が 0 以下なら即 1", () => {
    expect(windupProgress(1000, 1000, 0)).toBe(1);
    expect(windupProgress(1000, 1000, -5)).toBe(1);
  });

  it("経過に対して単調非減少", () => {
    const values = Array.from({ length: 41 }, (_, i) => windupProgress(1000 + i * 25, 1000, 700));
    expect(values.every((value, i) => i === 0 || value >= (values.at(i - 1) ?? 1))).toBe(true);
  });
});

describe("recordSwing", () => {
  it("記録が無ければ新しく記録する", () => {
    const input = swingAt(400);
    expect(recordSwing(null, 5, input)).toEqual({ seq: 5, input });
  });

  it("同じ seq の2回目は、最初の記録を保つ", () => {
    const first = recordSwing(null, 5, swingAt(400));
    const second = recordSwing(first, 5, swingAt(480));
    expect(second).toBe(first);
    expect(second.input.atMs).toBe(400);
  });

  it("別の seq は新しい記録に置き換える", () => {
    const first = recordSwing(null, 5, swingAt(400));
    expect(recordSwing(first, 6, swingAt(300))).toEqual({ seq: 6, input: swingAt(300) });
  });
});

describe("swingForOutcome", () => {
  it("seq が一致するときだけ入力を返す", () => {
    const record = recordSwing(null, 5, swingAt(400));
    expect(swingForOutcome(record, 5)).toEqual(swingAt(400));
  });

  it("人間の seq = 5 の記録に対して、次の半イニングの CPU 打者の outcome.seq = 6 では null", () => {
    const record = recordSwing(null, 5, swingAt(400));
    expect(swingForOutcome(record, 6)).toBeNull();
    expect(swingForOutcome(record, 4)).toBeNull();
  });

  it("記録が null なら null", () => {
    expect(swingForOutcome(null, 5)).toBeNull();
  });
});

describe("planSwingOf", () => {
  const KINDS: readonly PitchOutcomeView["kind"][] = ["ball", "called-strike", "swinging-strike", "foul", "in-play"];

  it("スイング結果(空振り・ファウル・インプレー)では、記録を planPlay に渡し、捨てない", () => {
    const record = recordSwing(null, 5, swingAt(400));
    for (const kind of ["swinging-strike", "foul", "in-play"] as const) {
      expect(planSwingOf(record, { seq: 5, kind })).toEqual({ swing: swingAt(400), dropped: false });
    }
  });

  it("見逃し(ボール・見逃しストライク)では、記録があっても渡さず、捨てたと印を付ける", () => {
    const record = recordSwing(null, 5, swingAt(400));
    for (const kind of ["ball", "called-strike"] as const) {
      expect(planSwingOf(record, { seq: 5, kind })).toEqual({ swing: null, dropped: true });
    }
  });

  it("記録が無ければ、結果によらず捨てていない(振っていない見逃しは dropped ではない)", () => {
    expect(KINDS.map((kind) => planSwingOf(null, { seq: 5, kind }))).toEqual(KINDS.map(() => ({ swing: null, dropped: false })));
  });

  it("seq が違う記録(前の投球のスイング)は、見逃しでも捨てたことにならない", () => {
    const record = recordSwing(null, 4, swingAt(400));
    expect(planSwingOf(record, { seq: 5, kind: "called-strike" })).toEqual({ swing: null, dropped: false });
    expect(planSwingOf(record, { seq: 5, kind: "foul" })).toEqual({ swing: null, dropped: false });
  });
});
