import { describe, expect, it } from "vitest";
import type { QualityTier } from "../../types/scene";
import { initialTierState, isHeavyWindow, isSlowWindow, nextTier, type TierFrameStats, type TierState } from "./quality-tier";

const stats = (p95Ms: number, longFrameRatio = 0): TierFrameStats => ({ p95Ms, longFrameRatio });
const FAST = stats(16.7);
const SLOW = stats(30);
const HEAVY = stats(46);

const run = (start: TierState, windows: readonly TierFrameStats[]): TierState => windows.reduce(nextTier, start);
const at = (tier: QualityTier, overWindows = 0): TierState => ({ tier, overWindows });

describe("nextTier: 閾値と連続窓", () => {
  it("p95 が 28ms ちょうどでは遅い窓にならない・28.01ms で遅い窓", () => {
    expect(isSlowWindow(stats(28))).toBe(false);
    expect(isSlowWindow(stats(28.01))).toBe(true);
  });

  it("速い窓では何も起きない", () => {
    expect(nextTier(at(0), FAST)).toEqual(at(0));
    expect(nextTier(at(2), stats(28))).toEqual(at(2));
  });

  it("遅い窓が 1 回だけではティアは変わらず、連続の数だけが増える", () => {
    expect(nextTier(at(0), SLOW)).toEqual(at(0, 1));
  });

  it("遅い窓が 2 窓連続で 1 段下がり、連続の数は 0 に戻る", () => {
    expect(run(at(0), [SLOW, SLOW])).toEqual(at(1, 0));
    expect(run(at(1), [SLOW, SLOW])).toEqual(at(2, 0));
  });

  it("途中に速い窓が挟まると連続が途切れる", () => {
    expect(run(at(0), [SLOW, FAST, SLOW])).toEqual(at(0, 1));
    expect(run(at(0), [SLOW, FAST, SLOW, SLOW])).toEqual(at(1, 0));
  });

  it("遅い窓が 4 連続なら 2 段(2 窓ごとに 1 段)", () => {
    expect(run(at(0), [SLOW, SLOW, SLOW, SLOW])).toEqual(at(2, 0));
  });
});

describe("nextTier: 重い場合の 2 段降格", () => {
  it("p95 が 45ms ちょうどでは重くない・45.01ms で重い", () => {
    expect(isHeavyWindow(stats(45))).toBe(false);
    expect(isHeavyWindow(stats(45.01))).toBe(true);
  });

  it("フレームの 10% 以上が 50ms 超なら重い(9.9% は重くない)", () => {
    expect(isHeavyWindow(stats(20, 0.1))).toBe(true);
    expect(isHeavyWindow(stats(20, 0.099))).toBe(false);
  });

  it("重い窓は連続を待たずに 1 回で 2 段下がる", () => {
    expect(nextTier(at(0), HEAVY)).toEqual(at(2, 0));
    expect(nextTier(at(1), stats(20, 0.12))).toEqual(at(3, 0));
  });

  it("重い窓で連続の数も 0 に戻る", () => {
    expect(nextTier(at(0, 1), HEAVY)).toEqual(at(2, 0));
  });

  it("T2 から重い窓でも T3 で止まる(上限)", () => {
    expect(nextTier(at(2), HEAVY)).toEqual(at(3, 0));
  });
});

describe("nextTier: 上限と自動で上げない", () => {
  it("T3 は最低で、どんな窓でも下がらず T3 のまま", () => {
    expect(run(at(3), [SLOW, SLOW, HEAVY, SLOW])).toEqual(at(3, 0));
  });

  it("どんな窓の列でもティアは単調非減少(速い窓が続いても上がらない)", () => {
    const windows: readonly TierFrameStats[] = [SLOW, SLOW, FAST, FAST, FAST, FAST, HEAVY, FAST, stats(5), stats(1)];
    const tiers = windows
      .reduce<readonly TierState[]>((history, window) => [...history, nextTier(history.at(-1) ?? at(0), window)], [at(0)])
      .map((state) => state.tier);
    expect(tiers.every((tier, index) => index === 0 || tier >= (tiers.at(index - 1) ?? 0))).toBe(true);
    expect(run(at(2), [FAST, FAST, FAST, FAST]).tier).toBe(2);
  });

  it("全組み合わせ(ティア × 連続の数 × 窓)でティアは 0〜3 の範囲で下がることしかない", () => {
    const tiers: readonly QualityTier[] = [0, 1, 2, 3];
    const windows: readonly TierFrameStats[] = [FAST, SLOW, HEAVY, stats(20, 0.5), stats(0, 0)];
    const afterOf = (tier: QualityTier, over: number): readonly QualityTier[] => windows.map((window) => nextTier(at(tier, over), window).tier);
    const results = tiers.flatMap((tier) => [...afterOf(tier, 0), ...afterOf(tier, 1)].map((after) => ({ before: tier, after })));
    expect(results).toHaveLength(tiers.length * 2 * windows.length);
    expect(results.every((result) => result.after >= result.before && result.after <= 3)).toBe(true);
  });

  it("有限でない値の窓は状態を変えない", () => {
    expect(nextTier(at(1, 1), stats(Number.NaN))).toEqual(at(1, 1));
    expect(nextTier(at(1, 1), stats(20, Number.NaN))).toEqual(at(1, 1));
  });

  it("initialTierState は既定 T0・連続 0", () => {
    expect(initialTierState()).toEqual(at(0, 0));
    expect(initialTierState(2)).toEqual(at(2, 0));
  });
});
