import { describe, expect, it } from "vitest";
import type { Count } from "../../types/game";
import { applyBall, applyFoul, applyStrike, EMPTY_COUNT } from "./count";

const ALL_COUNTS: readonly Count[] = Array.from({ length: 4 }, (_, balls) => Array.from({ length: 3 }, (_unused, strikes) => ({ balls, strikes }))).flat();

describe("applyBall", () => {
  it("adds a ball and keeps the at-bat going until the fourth", () => {
    expect(applyBall({ balls: 0, strikes: 1 })).toEqual({ count: { balls: 1, strikes: 1 }, end: "none" });
    expect(applyBall({ balls: 2, strikes: 2 })).toEqual({ count: { balls: 3, strikes: 2 }, end: "none" });
  });

  it("ends the at-bat with a walk on the fourth ball and resets the count", () => {
    expect(applyBall({ balls: 3, strikes: 0 })).toEqual({ count: EMPTY_COUNT, end: "walk" });
    expect(applyBall({ balls: 3, strikes: 2 })).toEqual({ count: EMPTY_COUNT, end: "walk" });
  });

  it("walks after exactly four consecutive balls", () => {
    const steps = [applyBall(EMPTY_COUNT)];
    for (let n = 0; n < 3; n += 1) {
      steps.push(applyBall(steps.at(-1)?.count ?? EMPTY_COUNT));
    }
    expect(steps.map((step) => step.end)).toEqual(["none", "none", "none", "walk"]);
  });
});

describe("applyStrike", () => {
  it("adds a strike and keeps the at-bat going until the third", () => {
    expect(applyStrike({ balls: 2, strikes: 0 })).toEqual({ count: { balls: 2, strikes: 1 }, end: "none" });
    expect(applyStrike({ balls: 0, strikes: 1 })).toEqual({ count: { balls: 0, strikes: 2 }, end: "none" });
  });

  it("ends the at-bat with a strikeout on the third strike and resets the count", () => {
    expect(applyStrike({ balls: 0, strikes: 2 })).toEqual({ count: EMPTY_COUNT, end: "strikeout" });
    expect(applyStrike({ balls: 3, strikes: 2 })).toEqual({ count: EMPTY_COUNT, end: "strikeout" });
  });
});

describe("applyFoul", () => {
  it("adds a strike with 0 or 1 strikes", () => {
    expect(applyFoul({ balls: 1, strikes: 0 })).toEqual({ count: { balls: 1, strikes: 1 }, end: "none" });
    expect(applyFoul({ balls: 1, strikes: 1 })).toEqual({ count: { balls: 1, strikes: 2 }, end: "none" });
  });

  it("leaves the count unchanged with two strikes", () => {
    expect(applyFoul({ balls: 3, strikes: 2 })).toEqual({ count: { balls: 3, strikes: 2 }, end: "none" });
    expect(applyFoul({ balls: 0, strikes: 2 })).toEqual({ count: { balls: 0, strikes: 2 }, end: "none" });
  });

  it("never ends the at-bat", () => {
    for (const count of ALL_COUNTS) {
      expect(applyFoul(count).end).toBe("none");
    }
  });
});

describe("count invariants", () => {
  it("enumerates all 12 counts", () => {
    expect(ALL_COUNTS).toHaveLength(12);
  });

  it("keeps balls <= 3 and strikes <= 2 after any step from any valid count", () => {
    for (const count of ALL_COUNTS) {
      for (const step of [applyBall(count), applyStrike(count), applyFoul(count)]) {
        expect(step.count.balls).toBeLessThanOrEqual(3);
        expect(step.count.strikes).toBeLessThanOrEqual(2);
        expect(step.count.balls).toBeGreaterThanOrEqual(0);
        expect(step.count.strikes).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("does not mutate the input count", () => {
    const count: Count = { balls: 1, strikes: 1 };
    applyBall(count);
    applyStrike(count);
    applyFoul(count);
    expect(count).toEqual({ balls: 1, strikes: 1 });
  });
});
