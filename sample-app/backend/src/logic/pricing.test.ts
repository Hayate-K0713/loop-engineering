import { describe, expect, it } from "vitest";
import { calculateQuote } from "./pricing";

describe("calculateQuote", () => {
  it("computes subtotal, tax, and total", () => {
    expect(calculateQuote({ amount: 100, taxRate: 0.1 })).toEqual({
      subtotal: 100,
      tax: 10,
      total: 110,
    });
  });

  it("rounds to two decimal places", () => {
    expect(calculateQuote({ amount: 19.99, taxRate: 0.08 })).toEqual({
      subtotal: 19.99,
      tax: 1.6,
      total: 21.59,
    });
  });

  it("rejects a negative amount", () => {
    expect(() => calculateQuote({ amount: -1, taxRate: 0.1 })).toThrow(RangeError);
  });

  it("rejects a negative tax rate", () => {
    expect(() => calculateQuote({ amount: 100, taxRate: -0.1 })).toThrow(RangeError);
  });
});
