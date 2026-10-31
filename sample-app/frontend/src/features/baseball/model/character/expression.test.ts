import { describe, expect, it } from "vitest";
import type { InPlayResult, PlateOutcome } from "../../types/batting";
import type { CharacterSlot, FaceExpression, ScenePhase } from "../../types/scene";
import { WORLD_PARAMS } from "../world/space/params";
import {
  blinkingAt,
  EXPRESSION_TIMING,
  expressionAt,
  type ExpressionInput,
  type ExpressionOutcome,
  type ExpressionPlan,
  type ExpressionRole,
  resultKindOf,
  roleOfSlotIndex,
} from "./expression";
import { CHARACTER_SLOTS } from "./look";

const ALL_EXPRESSIONS: readonly FaceExpression[] = WORLD_PARAMS.character.face.order;
const KINDS: readonly ExpressionOutcome["kind"][] = ["ball", "called-strike", "swinging-strike", "foul", "in-play"];
const IN_PLAY_RESULTS: readonly (InPlayResult | null)[] = [null, "groundout", "doublePlay", "flyout", "lineout", "single", "double", "triple", "homerun", "error"];
const PLATES: readonly (PlateOutcome | null)[] = [null, "walk", "strikeout", "groundout", "doublePlay", "flyout", "lineout", "single", "double", "triple", "homerun", "error"];
const PHASES: readonly ScenePhase[] = ["idle", "windup", "flight", "play"];
const TIMES = [-500, 0, 100, 349, 351, 560, 699, 701, 1000, 1600, 1699, 1701, 5000];
const BLINK_PERIOD = WORLD_PARAMS.character.face.blinkPeriodMs;
const BLINK_MS = WORLD_PARAMS.character.face.blinkMs;

const slotIndexOf = (name: CharacterSlot): number => CHARACTER_SLOTS.indexOf(name);

/** 全スロット × phase × 時刻の入力(役割はスロットから決める)。 */
function sweepInputs(outcome: ExpressionOutcome | null, plan: ExpressionPlan | null): readonly ExpressionInput[] {
  const inputs: ExpressionInput[] = [];
  for (const slotIndex of CHARACTER_SLOTS.keys()) {
    for (const phase of PHASES) {
      for (const tMs of TIMES) {
        inputs.push({ role: roleOfSlotIndex(slotIndex), phase, plan, outcome, tMs, slotIndex });
      }
    }
  }
  return inputs;
}

const outcomeOf = (kind: ExpressionOutcome["kind"], result: InPlayResult | null, plate: PlateOutcome | null, runners: ExpressionOutcome["runners"] = null): ExpressionOutcome => ({
  kind,
  inPlay: result === null ? null : { result },
  plate,
  runners,
});

const PLAN_CONTACT: ExpressionPlan = {
  durationMs: 700,
  swing: { startMs: 560, contactAtMs: 700 },
  contactMs: 700,
  fielder: { index: 2, startMs: 700, arriveMs: 1500 },
  telop: { startMs: 1700 },
};
const PLAN_TAKE: ExpressionPlan = { durationMs: 700, swing: null, contactMs: null, fielder: null, telop: { startMs: 700 } };
const PLAN_MISS: ExpressionPlan = { durationMs: 700, swing: { startMs: 560, contactAtMs: 700 }, contactMs: null, fielder: null, telop: { startMs: 700 } };

const at = (role: ExpressionRole, slotName: CharacterSlot, plan: ExpressionPlan | null, outcome: ExpressionOutcome | null, tMs: number, phase: ScenePhase = "flight"): FaceExpression =>
  expressionAt({ role, phase, plan, outcome, tMs, slotIndex: slotIndexOf(slotName) });

/** まばたき(`blink`)を `neutral` に戻した結果(まばたきと独立に本体の表を検査するため)。 */
const settled = (input: ExpressionInput): FaceExpression => {
  const result = expressionAt(input);
  return result === "blink" ? "neutral" : result;
};

describe("expressionAt: 全組み合わせで定義される", () => {
  const outcomes: readonly ExpressionOutcome[] = KINDS.flatMap((kind) => IN_PLAY_RESULTS.flatMap((result) => PLATES.map((plate) => outcomeOf(kind, result, plate))));
  const plans: readonly (ExpressionPlan | null)[] = [null, PLAN_CONTACT, PLAN_TAKE, PLAN_MISS];

  it("outcome.kind × inPlay.result × plate × スロット × phase × plan × 時刻のすべてで 8 表情のいずれかを返す", () => {
    const seen = new Set<FaceExpression>();
    let count = 0;
    for (const outcome of outcomes) {
      for (const plan of plans) {
        for (const input of sweepInputs(outcome, plan)) {
          seen.add(expressionAt(input));
          count += 1;
        }
      }
    }
    expect(count).toBe(outcomes.length * plans.length * CHARACTER_SLOTS.length * PHASES.length * TIMES.length);
    expect([...seen].every((expression) => ALL_EXPRESSIONS.includes(expression))).toBe(true);
  });

  it("outcome が無い(null)ときも全役割・全 phase で定義される", () => {
    const values = sweepInputs(null, null).map((input) => expressionAt(input));
    expect(values).toHaveLength(CHARACTER_SLOTS.length * PHASES.length * TIMES.length);
    expect(values.every((expression) => ALL_EXPRESSIONS.includes(expression))).toBe(true);
  });

  it("全 8 表情が表のどこかで使われる(blink は neutral の間のまばたき)", () => {
    const seen = new Set<FaceExpression>();
    for (const outcome of outcomes) {
      for (const input of sweepInputs(outcome, PLAN_CONTACT)) {
        seen.add(expressionAt(input));
      }
    }
    expect([...seen].sort()).toEqual([...ALL_EXPRESSIONS].sort());
  });
});

describe("resultKindOf", () => {
  it("打席の結果 > インプレーの結果 > 球の種類の順で分類する", () => {
    expect(resultKindOf(outcomeOf("called-strike", null, "strikeout"))).toBe("strikeout");
    expect(resultKindOf(outcomeOf("ball", null, "walk"))).toBe("walk");
    expect(resultKindOf(outcomeOf("in-play", "homerun", "homerun"))).toBe("homerun");
    expect(resultKindOf(outcomeOf("in-play", "double", null))).toBe("hit");
    expect(resultKindOf(outcomeOf("in-play", "doublePlay", "doublePlay"))).toBe("out");
    expect(resultKindOf(outcomeOf("in-play", "error", "error"))).toBe("error");
    expect(resultKindOf(outcomeOf("swinging-strike", null, null))).toBe("swing-miss");
    expect(resultKindOf(outcomeOf("called-strike", null, null))).toBe("take");
    expect(resultKindOf(outcomeOf("foul", null, null))).toBe("foul");
    expect(resultKindOf(outcomeOf("ball", null, null))).toBe("ball");
    expect(resultKindOf(outcomeOf("in-play", null, null))).toBe("none");
  });
});

describe("expressionAt: 表(character 分冊 §3-4-7)", () => {
  const strikeout = outcomeOf("swinging-strike", null, "strikeout");
  const homer = outcomeOf("in-play", "homerun", "homerun");
  const single = outcomeOf("in-play", "single", "single");
  const flyout = outcomeOf("in-play", "flyout", "flyout");
  const take = outcomeOf("called-strike", null, null);

  it("待機: 投手・捕手・野手・走者は普通、打者は集中。windup: 投手・捕手・打者は集中", () => {
    expect(settled({ role: "pitcher", phase: "idle", plan: null, outcome: null, tMs: 0, slotIndex: 0 })).toBe("neutral");
    expect(settled({ role: "batter", phase: "idle", plan: null, outcome: null, tMs: 0, slotIndex: 2 })).toBe("focus");
    expect(at("pitcher", "pitcher", null, null, 0, "windup")).toBe("focus");
    expect(at("catcher", "catcher", null, null, 0, "windup")).toBe("focus");
    expect(at("batter", "batter", null, null, 0, "windup")).toBe("focus");
    expect(settled({ role: "fielder", phase: "windup", plan: null, outcome: null, tMs: 0, slotIndex: 7 })).toBe("neutral");
  });

  it("投手: リリースで effort、その後 focus、結果で変わる", () => {
    expect(at("pitcher", "pitcher", PLAN_TAKE, take, 0)).toBe("effort");
    expect(at("pitcher", "pitcher", PLAN_TAKE, take, EXPRESSION_TIMING.releaseEffortMs - 1)).toBe("effort");
    expect(at("pitcher", "pitcher", PLAN_TAKE, take, EXPRESSION_TIMING.releaseEffortMs)).toBe("focus");
    expect(at("pitcher", "pitcher", PLAN_MISS, strikeout, 700)).toBe("cheer");
    expect(at("pitcher", "pitcher", PLAN_CONTACT, flyout, 700)).toBe("joy");
    expect(at("pitcher", "pitcher", PLAN_TAKE, take, 700)).toBe("joy");
    expect(at("pitcher", "pitcher", PLAN_CONTACT, single, 700)).toBe("sad");
    expect(at("pitcher", "pitcher", PLAN_TAKE, outcomeOf("ball", null, "walk"), 700)).toBe("sad");
  });

  it("投手: ホームランを打たれると shock → sad", () => {
    expect(at("pitcher", "pitcher", PLAN_CONTACT, homer, 700)).toBe("shock");
    expect(at("pitcher", "pitcher", PLAN_CONTACT, homer, 700 + EXPRESSION_TIMING.shockMs - 1)).toBe("shock");
    expect(at("pitcher", "pitcher", PLAN_CONTACT, homer, 700 + EXPRESSION_TIMING.shockMs)).toBe("sad");
  });

  it("打者: スイング中 effort、空振り三振・見逃し三振は shock → sad、ヒット joy、ホームラン cheer、ファウル neutral", () => {
    expect(at("batter", "batter", PLAN_CONTACT, single, 559)).toBe("focus");
    expect(at("batter", "batter", PLAN_CONTACT, single, 560)).toBe("effort");
    expect(at("batter", "batter", PLAN_CONTACT, single, 699)).toBe("effort");
    expect(at("batter", "batter", PLAN_MISS, strikeout, 700)).toBe("shock");
    expect(at("batter", "batter", PLAN_MISS, strikeout, 700 + EXPRESSION_TIMING.shockMs)).toBe("sad");
    expect(at("batter", "batter", PLAN_TAKE, outcomeOf("called-strike", null, "strikeout"), 700)).toBe("shock");
    expect(at("batter", "batter", PLAN_TAKE, outcomeOf("called-strike", null, "strikeout"), 1300)).toBe("sad");
    expect(at("batter", "batter", PLAN_MISS, outcomeOf("swinging-strike", null, null), 1300)).toBe("focus");
    expect(at("batter", "batter", PLAN_CONTACT, single, 700)).toBe("joy");
    expect(at("batter", "batter", PLAN_CONTACT, homer, 700)).toBe("cheer");
    expect(settled({ role: "batter", phase: "flight", plan: PLAN_CONTACT, outcome: outcomeOf("foul", null, null), tMs: 700, slotIndex: 2 })).toBe("neutral");
  });

  it("捕手: 飛行中 focus、結果で neutral、三振は joy", () => {
    expect(at("catcher", "catcher", PLAN_MISS, strikeout, 100)).toBe("focus");
    expect(at("catcher", "catcher", PLAN_MISS, strikeout, 700)).toBe("joy");
    expect(settled({ role: "catcher", phase: "flight", plan: PLAN_TAKE, outcome: take, tMs: 700, slotIndex: 1 })).toBe("neutral");
  });

  it("野手: 打球を捕る野手だけ飛ぶ間 focus、捕球したアウトで joy、安打は neutral", () => {
    expect(at("fielder", "fielder2", PLAN_CONTACT, flyout, 699)).toBe("neutral");
    expect(at("fielder", "fielder2", PLAN_CONTACT, flyout, 700)).toBe("focus");
    expect(at("fielder", "fielder2", PLAN_CONTACT, flyout, 1499)).toBe("focus");
    expect(at("fielder", "fielder2", PLAN_CONTACT, flyout, 1500)).toBe("joy");
    expect(settled({ role: "fielder", phase: "flight", plan: PLAN_CONTACT, outcome: single, tMs: 1500, slotIndex: slotIndexOf("fielder2") })).toBe("neutral");
    expect(settled({ role: "fielder", phase: "flight", plan: PLAN_CONTACT, outcome: flyout, tMs: 1000, slotIndex: slotIndexOf("fielder3") })).toBe("neutral");
  });

  it("走者・打者走者: 生還すると得点で cheer、それ以外は neutral", () => {
    const scored = outcomeOf("in-play", "single", "single", { batterTo: 1, advances: [{ from: 2, to: 4 }] });
    const homerRuns = outcomeOf("in-play", "homerun", "homerun", { batterTo: 4, advances: [] });
    expect(at("runner", "runner2", PLAN_CONTACT, scored, 1700)).toBe("cheer");
    expect(settled({ role: "runner", phase: "play", plan: PLAN_CONTACT, outcome: scored, tMs: 1699, slotIndex: slotIndexOf("runner2") })).toBe("neutral");
    expect(settled({ role: "runner", phase: "play", plan: PLAN_CONTACT, outcome: scored, tMs: 1700, slotIndex: slotIndexOf("runner1") })).toBe("neutral");
    expect(settled({ role: "runner", phase: "play", plan: PLAN_CONTACT, outcome: scored, tMs: 1700, slotIndex: slotIndexOf("runner0") })).toBe("neutral");
    expect(at("runner", "runner0", PLAN_CONTACT, homerRuns, 1800)).toBe("cheer");
  });

  it("決定論(同じ入力で同じ結果)", () => {
    const input: ExpressionInput = { role: "batter", phase: "flight", plan: PLAN_CONTACT, outcome: single, tMs: 900, slotIndex: 2 };
    expect(expressionAt(input)).toBe(expressionAt({ ...input }));
  });
});

describe("blinkingAt: まばたき", () => {
  const sample = (slotIndex: number, fromMs: number, toMs: number): readonly boolean[] => Array.from({ length: toMs - fromMs }, (_, index) => blinkingAt(fromMs + index, slotIndex));

  it("周期 2.8 秒・120ms(定数)", () => {
    expect(BLINK_PERIOD).toBe(2800);
    expect(BLINK_MS).toBe(120);
  });

  it("1 周期(1ms 刻み)のうち、ちょうど 120ms だけまばたきし、連続した 1 区間", () => {
    for (const slotIndex of [0, 1, 5, 13]) {
      const values = sample(slotIndex, 0, BLINK_PERIOD);
      expect(values.filter(Boolean)).toHaveLength(BLINK_MS);
      const edges = values.filter((value, index) => value !== values.at(index - 1)).length;
      expect(edges).toBe(2);
    }
  });

  it("周期 2800ms で繰り返す(時刻に対して周期的)", () => {
    const first = sample(3, 0, BLINK_PERIOD);
    expect(sample(3, BLINK_PERIOD, BLINK_PERIOD * 2)).toEqual(first);
    expect(sample(3, -BLINK_PERIOD, 0)).toEqual(first);
  });

  it("位相はスロット番号で決まる決定論(14 スロットで開始時刻がすべて異なる)", () => {
    const starts = CHARACTER_SLOTS.map((_, slotIndex) => sample(slotIndex, 0, BLINK_PERIOD).indexOf(true));
    expect(new Set(starts).size).toBe(14);
    expect(sample(4, 0, BLINK_PERIOD)).toEqual(sample(4, 0, BLINK_PERIOD));
  });

  it("neutral の間だけ blink になる(focus・effort などは blink にならない)", () => {
    const blinkTimes = sample(0, 0, BLINK_PERIOD).flatMap((value, index) => (value ? [index] : []));
    const tMs = blinkTimes.at(0) ?? 0;
    expect(expressionAt({ role: "pitcher", phase: "idle", plan: null, outcome: null, tMs, slotIndex: 0 })).toBe("blink");
    expect(expressionAt({ role: "batter", phase: "idle", plan: null, outcome: null, tMs, slotIndex: 0 })).toBe("focus");
    expect(expressionAt({ role: "pitcher", phase: "windup", plan: null, outcome: null, tMs, slotIndex: 0 })).toBe("focus");
  });

  it("有限でない時刻・添字ではまばたきしない", () => {
    expect(blinkingAt(Number.NaN, 0)).toBe(false);
    expect(blinkingAt(100, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("roleOfSlotIndex", () => {
  it("14 スロットの役割", () => {
    expect(CHARACTER_SLOTS.map((_, index) => roleOfSlotIndex(index))).toEqual([
      "pitcher",
      "catcher",
      "batter",
      "runner",
      "runner",
      "runner",
      "runner",
      "fielder",
      "fielder",
      "fielder",
      "fielder",
      "fielder",
      "fielder",
      "fielder",
    ]);
  });
});
