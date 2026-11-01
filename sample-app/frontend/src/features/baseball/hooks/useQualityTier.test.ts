import { describe, expect, it } from "vitest";
import type { QualityTier } from "../types/scene";
import {
  STARTUP_FRAME_COUNT,
  canSwitchTier,
  initialTracker,
  isValidInterval,
  parseTierOverride,
  resolveInitialTier,
  startupTierOf,
  tierToApply,
  trackSwitched,
  trackWindow,
} from "./useQualityTier";

const FAST = { p95Ms: 17, longFrameRatio: 0 };
const SLOW = { p95Ms: 30, longFrameRatio: 0 };
const HEAVY = { p95Ms: 60, longFrameRatio: 0.2 };

function repeat(value: number, count: number): readonly number[] {
  return Array.from({ length: count }, () => value);
}

describe("canSwitchTier: 飛行中は切り替えない", () => {
  it("flight と windup は偽、idle と play(演出中)は真", () => {
    expect(canSwitchTier("flight")).toBe(false);
    expect(canSwitchTier("windup")).toBe(false);
    expect(canSwitchTier("idle")).toBe(true);
    expect(canSwitchTier("play")).toBe(true);
  });
});

describe("tierToApply: ペンディング", () => {
  it("飛行中は何も呼ばない(ペンディング)", () => {
    expect(tierToApply({ desired: 2, applied: 0, canSwitch: false })).toBeNull();
  });

  it("idle に戻ったら、溜まっていたティアを 1 回だけ呼ぶ", () => {
    expect(tierToApply({ desired: 2, applied: 0, canSwitch: true })).toBe(2);
    expect(tierToApply({ desired: 2, applied: 2, canSwitch: true })).toBeNull();
  });

  it("このステージにまだ何も貼っていなければ(applied が null)貼る", () => {
    expect(tierToApply({ desired: 0, applied: null, canSwitch: true })).toBe(0);
    expect(tierToApply({ desired: 0, applied: null, canSwitch: false })).toBeNull();
  });
});

describe("parseTierOverride", () => {
  it("?tier=0〜3 を読み、それ以外は null", () => {
    expect(parseTierOverride("?tier=2")).toBe(2);
    expect(parseTierOverride("?a=1&tier=0")).toBe(0);
    expect(parseTierOverride("?tier=4")).toBeNull();
    expect(parseTierOverride("?tier=-1")).toBeNull();
    expect(parseTierOverride("?tier=1.5")).toBeNull();
    expect(parseTierOverride("?tier=abc")).toBeNull();
    expect(parseTierOverride("")).toBeNull();
  });
});

describe("resolveInitialTier", () => {
  it("固定が許されていれば ?tier= を優先して固定する", () => {
    expect(resolveInitialTier({ lastTier: 1, override: 3, overrideAllowed: true })).toEqual({ tier: 3, reason: "fixed", fixed: true });
  });

  it("本番ビルド(許されない)では ?tier= を無視し、直近のティアを復元する", () => {
    expect(resolveInitialTier({ lastTier: 2, override: 3, overrideAllowed: false })).toEqual({ tier: 2, reason: "restore", fixed: false });
  });

  it("保存が無い(null)なら T0", () => {
    expect(resolveInitialTier({ lastTier: null, override: null, overrideAllowed: true })).toEqual({ tier: 0, reason: "restore", fixed: false });
  });
});

describe("startupTierOf: 起動直後の 60 フレーム", () => {
  it("中央値がちょうど 22ms なら T0 のまま、22ms を超えたら T1", () => {
    expect(startupTierOf(0, repeat(22, STARTUP_FRAME_COUNT))).toBe(0);
    expect(startupTierOf(0, repeat(22.5, STARTUP_FRAME_COUNT))).toBe(1);
  });

  it("一部の長いフレーム(読み込みの引っかかり)では中央値が動かないので T0 のまま", () => {
    const withHitches = [...repeat(16, STARTUP_FRAME_COUNT - 5), ...repeat(300, 5)];
    expect(startupTierOf(0, withHitches)).toBe(0);
  });

  it("前回のティアが T1 より重ければ、それを下回らない", () => {
    const base: QualityTier = 2;
    expect(startupTierOf(base, repeat(40, STARTUP_FRAME_COUNT))).toBe(2);
    expect(startupTierOf(base, repeat(10, STARTUP_FRAME_COUNT))).toBe(2);
  });

  it("間隔が無ければ base のまま", () => {
    expect(startupTierOf(0, [])).toBe(0);
  });
});

describe("isValidInterval", () => {
  it("正の有限値で 1 秒以下だけ有効", () => {
    expect(isValidInterval(16)).toBe(true);
    expect(isValidInterval(1000)).toBe(true);
    expect(isValidInterval(1001)).toBe(false);
    expect(isValidInterval(0)).toBe(false);
    expect(isValidInterval(Number.NaN)).toBe(false);
  });
});

describe("trackWindow / trackSwitched", () => {
  it("遅い窓が 2 つ続くと 1 段、重い窓なら 1 つで 2 段下げる(nextTier のとおり)", () => {
    const first = trackWindow(initialTracker(0), SLOW);
    expect(first.state.tier).toBe(0);
    expect(trackWindow(first, SLOW).state.tier).toBe(1);
    expect(trackWindow(initialTracker(0), HEAVY).state.tier).toBe(2);
  });

  it("速い窓では下げず、自動では上げない", () => {
    expect(trackWindow(initialTracker(2), FAST).state.tier).toBe(2);
  });

  it("切替の直後の窓は捨てる(nextTier に渡さない)", () => {
    const switched = trackSwitched(initialTracker(1));
    const skipped = trackWindow(switched, HEAVY);
    expect(skipped.state.tier).toBe(1);
    expect(skipped.skipWindows).toBe(0);
    expect(trackWindow(skipped, HEAVY).state.tier).toBe(3);
  });
});
