import { describe, expect, it } from "vitest";
import { arrivalDue, holdArrival, type ArrivalHold } from "./arrival";
import { TAP_ARRIVAL_HOLD_MS } from "./input-route";

// 到達時刻 800ms(ゲート ms)、投球の seq は 7、壁時計は 5000ms から。保留の長さ・上限は TAP_ARRIVAL_HOLD_MS から取る(リテラルで固定しない)。
const ARRIVE_AT = 800;
const SEQ = 7;
const NOW = 5000;

function due(overrides: { elapsedMs?: number; hold?: ArrivalHold | null; seq?: number; nowMs?: number }): boolean {
  return arrivalDue({ elapsedMs: ARRIVE_AT, arriveAtMs: ARRIVE_AT, hold: null, seq: SEQ, nowMs: NOW, ...overrides });
}

describe("holdArrival: 保留の作成", () => {
  it("期限は now + ms で、投球の seq を持つ", () => {
    expect(holdArrival({ seq: SEQ, nowMs: NOW, ms: TAP_ARRIVAL_HOLD_MS })).toEqual({ seq: SEQ, untilMs: NOW + TAP_ARRIVAL_HOLD_MS });
    expect(holdArrival({ seq: SEQ, nowMs: NOW, ms: 50 })).toEqual({ seq: SEQ, untilMs: NOW + 50 });
  });

  it("上限は TAP_ARRIVAL_HOLD_MS(それを超える長さを渡しても伸びない)", () => {
    const hold = holdArrival({ seq: SEQ, nowMs: NOW, ms: TAP_ARRIVAL_HOLD_MS * 10 });
    expect(hold?.untilMs).toBe(NOW + TAP_ARRIVAL_HOLD_MS);
    const infinite = holdArrival({ seq: SEQ, nowMs: NOW, ms: Number.POSITIVE_INFINITY });
    expect(infinite?.untilMs).toBe(NOW + TAP_ARRIVAL_HOLD_MS);
  });

  it("上限は 200ms(設計の値)", () => {
    expect(TAP_ARRIVAL_HOLD_MS).toBe(200);
  });

  it("ms が 0・負・NaN なら保留しない(null)", () => {
    expect([0, -1, Number.NaN].map((ms) => holdArrival({ seq: SEQ, nowMs: NOW, ms }))).toEqual([null, null, null]);
  });
});

describe("arrivalDue: 到達通知を出してよいか", () => {
  it("保留が無ければ、到達時刻に達した瞬間から通知する(到達前は通知しない)", () => {
    expect(due({ elapsedMs: ARRIVE_AT - 1 })).toBe(false);
    expect(due({ elapsedMs: ARRIVE_AT })).toBe(true);
    expect(due({ elapsedMs: ARRIVE_AT + 500 })).toBe(true);
  });

  it("保留中(現在の投球・期限内)は、到達時刻を過ぎていても通知しない", () => {
    const hold = holdArrival({ seq: SEQ, nowMs: NOW, ms: TAP_ARRIVAL_HOLD_MS });
    expect(due({ hold, elapsedMs: ARRIVE_AT + 100, nowMs: NOW + 1 })).toBe(false);
    expect(due({ hold, elapsedMs: ARRIVE_AT + 100, nowMs: NOW + TAP_ARRIVAL_HOLD_MS - 1 })).toBe(false);
  });

  it("期限が切れたら通知する(期限ちょうどから。指を離すイベントが届かなくても試合が止まらない)", () => {
    const hold = holdArrival({ seq: SEQ, nowMs: NOW, ms: TAP_ARRIVAL_HOLD_MS });
    expect(due({ hold, elapsedMs: ARRIVE_AT + 100, nowMs: NOW + TAP_ARRIVAL_HOLD_MS })).toBe(true);
    expect(due({ hold, elapsedMs: ARRIVE_AT + 100, nowMs: NOW + TAP_ARRIVAL_HOLD_MS + 300 })).toBe(true);
  });

  it("解除(hold = null)すれば、期限内でも次の判定で通知する", () => {
    const hold = holdArrival({ seq: SEQ, nowMs: NOW, ms: TAP_ARRIVAL_HOLD_MS });
    expect(due({ hold, elapsedMs: ARRIVE_AT + 100, nowMs: NOW + 10 })).toBe(false);
    expect(due({ hold: null, elapsedMs: ARRIVE_AT + 100, nowMs: NOW + 10 })).toBe(true);
  });

  it("seq が違う保留(前の投球のもの)は無視する", () => {
    const stale = holdArrival({ seq: SEQ - 1, nowMs: NOW, ms: TAP_ARRIVAL_HOLD_MS });
    expect(due({ hold: stale, elapsedMs: ARRIVE_AT + 100, nowMs: NOW + 10 })).toBe(true);
    const future = holdArrival({ seq: SEQ + 1, nowMs: NOW, ms: TAP_ARRIVAL_HOLD_MS });
    expect(due({ hold: future, elapsedMs: ARRIVE_AT + 100, nowMs: NOW + 10 })).toBe(true);
  });

  it("保留中でも、到達時刻より前は通知しない(保留は通知を遅らせるだけで早めない)", () => {
    const hold = holdArrival({ seq: SEQ, nowMs: NOW, ms: TAP_ARRIVAL_HOLD_MS });
    expect(due({ hold, elapsedMs: ARRIVE_AT - 1, nowMs: NOW + TAP_ARRIVAL_HOLD_MS + 1 })).toBe(false);
  });

  it("保留の最大の遅れは TAP_ARRIVAL_HOLD_MS(保留を繰り返しても、1 回の保留では上限を超えて待たない)", () => {
    const hold = holdArrival({ seq: SEQ, nowMs: NOW, ms: 10_000 });
    expect(due({ hold, elapsedMs: ARRIVE_AT + 1, nowMs: NOW + TAP_ARRIVAL_HOLD_MS })).toBe(true);
  });
});
