import type { QualityTier } from "../../types/scene";
import { WORLD_PARAMS } from "../world/space/params";

// 描画の品質ティア(0 = 標準 … 3 = 最低)の自動切替の純関数(character 分冊 §3-4-10)。
// 2 秒の窓ごとの rAF の集計(p95・落ちたフレームの割合)を受け取り、p95 > 28ms が 2 窓連続でティアを 1 つ下げる。
// 重い窓(p95 > 45ms、またはフレームの 10% 以上が 50ms 超)は連続を待たずに 2 つ下げる。自動では上げない(揺れ防止)。
// 実際の切替(`setQualityTier`)のタイミング(飛行中はペンディング)は hooks 側の責務。

const TIER = WORLD_PARAMS.qualityTier;

/** 最も軽い(最低画質の)ティア。ここより下げない。 */
export const LOWEST_TIER: QualityTier = 3;

/** 切替の状態。`overWindows` = 直近から連続して p95 が閾値を超えた窓の数(下げたら 0 に戻る)。 */
export type TierState = {
  readonly tier: QualityTier;
  readonly overWindows: number;
};

/** 1 つの窓の集計(`FrameWindowStats` の部分集合。`useFramePerf` の値をそのまま渡せる)。 */
export type TierFrameStats = {
  readonly p95Ms: number;
  /** 50ms を超えたフレームの割合(0〜1)。 */
  readonly longFrameRatio: number;
};

/** 初期状態(連続の数え直し)。 */
export function initialTierState(tier: QualityTier = 0): TierState {
  return { tier, overWindows: 0 };
}

/** ティアを `steps` 段下げる(下限 `LOWEST_TIER`)。 */
function lowered(tier: QualityTier, steps: number): QualityTier {
  const next = Math.min(LOWEST_TIER, tier + steps);
  switch (next) {
    case 0:
    case 1:
    case 2:
      return next;
    default:
      return LOWEST_TIER;
  }
}

/** 重い窓か(p95 > 45ms、またはフレームの 10% 以上が 50ms 超)。 */
export function isHeavyWindow(stats: TierFrameStats): boolean {
  return stats.p95Ms > TIER.heavyP95Ms || stats.longFrameRatio >= TIER.heavyLongFrameRatio;
}

/** 窓が閾値を超えたか(p95 > 28ms)。 */
export function isSlowWindow(stats: TierFrameStats): boolean {
  return stats.p95Ms > TIER.p95ThresholdMs;
}

/**
 * 窓の集計を受けて次の状態を返す(純関数)。
 * - 数値が有限でない窓は情報なしとして状態を変えない。
 * - 重い窓: 連続を待たずに 2 段下げ、連続の数を 0 に戻す。
 * - 遅い窓(p95 > 28ms): 連続の数を 1 増やし、`consecutiveWindows`(2)に達したら 1 段下げて 0 に戻す。
 * - それ以外の窓: 連続の数を 0 に戻す。
 * - 下限(T3)では下げない。上げることはない。
 */
export function nextTier(state: TierState, stats: TierFrameStats): TierState {
  if (!Number.isFinite(stats.p95Ms) || !Number.isFinite(stats.longFrameRatio)) {
    return state;
  }
  if (state.tier >= LOWEST_TIER) {
    return { tier: LOWEST_TIER, overWindows: 0 };
  }
  if (isHeavyWindow(stats)) {
    return { tier: lowered(state.tier, 2), overWindows: 0 };
  }
  if (!isSlowWindow(stats)) {
    return { tier: state.tier, overWindows: 0 };
  }
  const overWindows = state.overWindows + 1;
  return overWindows >= TIER.consecutiveWindows ? { tier: lowered(state.tier, 1), overWindows: 0 } : { tier: state.tier, overWindows };
}
