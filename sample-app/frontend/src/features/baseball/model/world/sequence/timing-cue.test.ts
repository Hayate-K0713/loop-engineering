import { describe, expect, it } from "vitest";
import { BATTING_PARAMS } from "../../batting/params";
import { swingWindowMs } from "../../batting/contact";
import { timingAt, timingCueOf, type PlayTiming } from "./timing-cue";

const MEET_WINDOW = swingWindowMs("meet");
const POWER_WINDOW = swingWindowMs("power");
// ジャストの境界(ミート ±37.5ms、強振 ±28.125ms)。
const MEET_JUST = MEET_WINDOW * BATTING_PARAMS.centerRatio;
const POWER_JUST = POWER_WINDOW * BATTING_PARAMS.centerRatio;

describe("timingCueOf: ジャストの境界", () => {
  it("ミート: |Δt| が窓 × centerRatio 未満はジャスト、ちょうど以上は早い/遅い", () => {
    expect(timingCueOf(0, MEET_WINDOW).label).toBe("just");
    expect(timingCueOf(MEET_JUST - 0.01, MEET_WINDOW).label).toBe("just");
    expect(timingCueOf(-(MEET_JUST - 0.01), MEET_WINDOW).label).toBe("just");
    expect(timingCueOf(MEET_JUST, MEET_WINDOW).label).toBe("late");
    expect(timingCueOf(-MEET_JUST, MEET_WINDOW).label).toBe("early");
  });

  it("強振: 窓が狭いのでジャストも狭い(ミートならジャストの値が強振では早い/遅いになる)", () => {
    expect(POWER_JUST).toBeLessThan(MEET_JUST);
    const between = (POWER_JUST + MEET_JUST) / 2;
    expect(timingCueOf(between, MEET_WINDOW).label).toBe("just");
    expect(timingCueOf(between, POWER_WINDOW).label).toBe("late");
    expect(timingCueOf(-between, POWER_WINDOW).label).toBe("early");
    expect(timingCueOf(POWER_JUST - 0.01, POWER_WINDOW).label).toBe("just");
    expect(timingCueOf(POWER_JUST, POWER_WINDOW).label).toBe("late");
  });

  it("判定は丸める前の値で行う(37.4 はジャスト、表示は 37)", () => {
    const cue = timingCueOf(MEET_JUST - 0.1, MEET_WINDOW);
    expect(cue.label).toBe("just");
    expect(cue.dtMs).toBe(37);
  });
});

describe("timingCueOf: 符号と丸め", () => {
  it("負 = 早い、正 = 遅い。窓の外の大きなずれも早い/遅いと ms を返す", () => {
    expect(timingCueOf(-62, MEET_WINDOW)).toEqual({ label: "early", dtMs: -62 });
    expect(timingCueOf(48, MEET_WINDOW)).toEqual({ label: "late", dtMs: 48 });
    expect(timingCueOf(-320, MEET_WINDOW)).toEqual({ label: "early", dtMs: -320 });
    expect(timingCueOf(170, MEET_WINDOW)).toEqual({ label: "late", dtMs: 170 });
  });

  it("dtMs は整数に四捨五入する", () => {
    expect(timingCueOf(61.6, MEET_WINDOW).dtMs).toBe(62);
    expect(timingCueOf(-61.6, MEET_WINDOW).dtMs).toBe(-62);
    expect(timingCueOf(61.4, MEET_WINDOW).dtMs).toBe(61);
  });

  it("−0 にならない(−0.3 は +0)", () => {
    const cue = timingCueOf(-0.3, MEET_WINDOW);
    expect(Object.is(cue.dtMs, 0)).toBe(true);
    expect(cue.label).toBe("just");
  });

  it("有限でない値は 0 とみなす(NaN・Infinity で NaN を返さない)", () => {
    expect(timingCueOf(Number.NaN, MEET_WINDOW)).toEqual({ label: "just", dtMs: 0 });
    expect(timingCueOf(Number.POSITIVE_INFINITY, MEET_WINDOW)).toEqual({ label: "just", dtMs: 0 });
  });
});

describe("timingAt", () => {
  const timing: PlayTiming = { label: "early", dtMs: -62, startMs: 1000, endMs: 1900 };

  it("startMs 以上 endMs 未満のときだけ返す(境界: start は含み、end は含まない)", () => {
    expect(timingAt({ timing }, 1000)).toEqual({ label: "early", dtMs: -62 });
    expect(timingAt({ timing }, 1450)).toEqual({ label: "early", dtMs: -62 });
    expect(timingAt({ timing }, 1899.9)).toEqual({ label: "early", dtMs: -62 });
    expect(timingAt({ timing }, 1900)).toBeNull();
    expect(timingAt({ timing }, 999.9)).toBeNull();
  });

  it("timing が無い plan(見逃し・CPU)は常に null", () => {
    expect(timingAt({ timing: null }, 1000)).toBeNull();
  });

  it("返すのは label と dtMs だけ(区間の情報を含まない)", () => {
    const cue = timingAt({ timing }, 1200);
    expect(cue === null ? [] : Object.keys(cue).sort()).toEqual(["dtMs", "label"]);
  });
});
