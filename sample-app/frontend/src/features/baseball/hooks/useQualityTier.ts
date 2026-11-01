import { useEffect, useRef, useState, type RefObject } from "react";
import { initialTierState, nextTier, type TierFrameStats, type TierState } from "../model/character/quality-tier";
import { median } from "../model/telemetry/stats";
import type { QualityTier, ScenePhase } from "../types/scene";
import type { StageHandle } from "../types/stage";
import { useAnimationFrame } from "./useAnimationFrame";
import { FRAME_PERF_MAX_INTERVAL_MS, useFramePerf, type FramePerfWindow } from "./useFramePerf";
import { useLatest } from "./useLatest";
import { PLAYTEST_ENABLED } from "./usePlaytestLog";
import type { PreferencesApi } from "./usePreferences";

// 描画の品質ティア(0 = 標準 … 3 = 最低)の自動切替の結線(character 分冊 §3-4-10、max 分冊 §3-5-10)。
// 2 秒の窓ごとの p95(`useFramePerf`)を `nextTier`(model の純関数)に渡し、下げると決まったら `stage.setQualityTier` を呼ぶ。
// 切替はシェーダの再コンパイルを伴うので、飛行中(`flight`/`windup`)はペンディングにして、`idle` か演出中(`play`)になってから呼ぶ。
// ここは `three` を import しない。判断は純関数(下の export)に寄せ、hook は rAF と effect の結線だけを持つ。

/** 起動直後に測るフレーム数。 */
export const STARTUP_FRAME_COUNT = 60;

/** 起動直後の中央値がこれ(ms)を超えたら、最初から T1 で始める。 */
export const STARTUP_MEDIAN_LIMIT_MS = 22;

/** 起動直後の判定で「重い」とみなしたときに始めるティア。 */
export const STARTUP_SLOW_TIER: QualityTier = 1;

/** 切替の理由。`restore` = 前回のティアの復元、`fixed` = `?tier=` による固定、`startup` = 起動直後の 60 フレームの判定、`auto` = 窓ごとの自動降格。 */
export type TierSwitchReason = "restore" | "fixed" | "startup" | "auto";

/** ティアを切り替えたときの通知(試遊ログへ残す材料)。`windowP95Ms` は `auto` のときに降格を決めた窓の p95、それ以外は `null`。 */
export type TierSwitchEvent = {
  readonly fromTier: QualityTier;
  readonly toTier: QualityTier;
  readonly reason: TierSwitchReason;
  readonly windowP95Ms: number | null;
};

/** 飛行中の切替を避ける。`flight`(と直前の `windup`)は偽、`idle` と演出中(`play`)は真。 */
export function canSwitchTier(phase: ScenePhase): boolean {
  return phase === "idle" || phase === "play";
}

function asTier(value: number): QualityTier | null {
  switch (value) {
    case 0:
    case 1:
    case 2:
    case 3:
      return value;
    default:
      return null;
  }
}

/** URL の `?tier=<0〜3>` を読む。無い・範囲外・整数でないなら `null`。 */
export function parseTierOverride(search: string): QualityTier | null {
  const raw = new URLSearchParams(search).get("tier");
  if (raw === null || !/^\d$/.test(raw)) {
    return null;
  }
  return asTier(Number(raw));
}

export type InitialTier = {
  readonly tier: QualityTier;
  readonly reason: TierSwitchReason;
  /** `?tier=` で固定する(自動の切替・保存をしない)。 */
  readonly fixed: boolean;
};

/**
 * 初期ティア。`?tier=` が有効(`overrideAllowed` = 開発/試遊ビルド)ならそれで固定、そうでなければ直近のセッションのティア(`lastTier`)、
 * それも無ければ T0。
 */
export function resolveInitialTier(input: {
  readonly lastTier: QualityTier | null;
  readonly override: QualityTier | null;
  readonly overrideAllowed: boolean;
}): InitialTier {
  if (input.overrideAllowed && input.override !== null) {
    return { tier: input.override, reason: "fixed", fixed: true };
  }
  return { tier: input.lastTier ?? 0, reason: "restore", fixed: false };
}

/** 有効な rAF の間隔(ms)か。タブの非表示などで空いた長い間隔と、非有限・0 以下は計測に使わない。 */
export function isValidInterval(deltaMs: number): boolean {
  return Number.isFinite(deltaMs) && deltaMs > 0 && deltaMs <= FRAME_PERF_MAX_INTERVAL_MS;
}

/** 起動直後の判定。間隔の中央値が `STARTUP_MEDIAN_LIMIT_MS` を超えたら、`base` より軽くない場合に限り T1 以上で始める(`base` を下回らない)。 */
export function startupTierOf(base: QualityTier, intervalsMs: readonly number[]): QualityTier {
  const middle = median(intervalsMs);
  if (middle === null || middle <= STARTUP_MEDIAN_LIMIT_MS) {
    return base;
  }
  return base >= STARTUP_SLOW_TIER ? base : STARTUP_SLOW_TIER;
}

/**
 * 今 `setQualityTier` を呼ぶべきティア。呼ばないなら `null`。
 * 切替できない場面(飛行中)と、すでに貼ってある(`applied` が `desired`)ときは `null`。`applied` が `null` は「このステージにはまだ何も貼っていない」で、貼る。
 */
export function tierToApply(input: { readonly desired: QualityTier; readonly applied: QualityTier | null; readonly canSwitch: boolean }): QualityTier | null {
  if (!input.canSwitch || input.applied === input.desired) {
    return null;
  }
  return input.desired;
}

/** 窓の追跡の状態。`state` = `nextTier` の状態、`skipWindows` = 切替の直後に捨てる窓の数(再コンパイルの停止が窓に混ざるため)。 */
export type TierTracker = {
  readonly state: TierState;
  readonly skipWindows: number;
};

/** 切替の直後に捨てる窓の数。 */
export const SKIP_WINDOWS_AFTER_SWITCH = 1;

export function initialTracker(tier: QualityTier): TierTracker {
  return { state: initialTierState(tier), skipWindows: 0 };
}

/** 窓を 1 つ受ける。捨てる窓が残っていれば数を減らすだけで、`nextTier` に渡さない。 */
export function trackWindow(tracker: TierTracker, stats: TierFrameStats): TierTracker {
  if (tracker.skipWindows > 0) {
    return { state: tracker.state, skipWindows: tracker.skipWindows - 1 };
  }
  return { state: nextTier(tracker.state, stats), skipWindows: 0 };
}

/** ティアを実際に切り替えた後の追跡。次の窓を捨てる。 */
export function trackSwitched(tracker: TierTracker): TierTracker {
  return { state: tracker.state, skipWindows: SKIP_WINDOWS_AFTER_SWITCH };
}

export type UseQualityTierOptions = {
  /** ティアを切り替える先。作る前・破棄後・WebGL 不可のときは `null`(計測も切替もしない)。 */
  readonly stage: StageHandle | null;
  /** 演出の段階。飛行中の切替を避け、`idle` 以外の間にフレーム間隔を測る。 */
  readonly phase: ScenePhase;
  /** 直近のセッションのティア(`prefs.lastQualityTier`)の読み書き。保存は `createSafeStore` 経由。 */
  readonly prefs: Pick<PreferencesApi, "prefs" | "update">;
  /** ティアを切り替えたとき(復元・固定・起動判定・自動降格)に呼ぶ。試遊ログへ残す口。 */
  readonly onSwitch?: (event: TierSwitchEvent) => void;
  /** `?tier=` を読む文字列。省略は `window.location.search`。 */
  readonly search?: string;
  /** `?tier=` による固定を許すか(開発/試遊ビルドだけ)。省略は `PLAYTEST_ENABLED`。 */
  readonly allowOverride?: boolean;
};

export type UseQualityTierResult = {
  /** ステージに貼った(貼り終えた)現在のティア。`data-quality-tier` 用。 */
  readonly tier: QualityTier;
  /** `?tier=` で固定されているか。 */
  readonly fixed: boolean;
};

type Applied = { readonly stage: StageHandle; readonly tier: QualityTier };

/** 起動直後の 60 フレームを測り、終わったら 1 回だけ `onDone` を呼んでループを止める。`enabled` が偽の間は動かさない。 */
function useStartupProbe(enabled: boolean, onDone: (intervalsMs: readonly number[]) => void): void {
  const intervalsRef = useRef<number[]>([]);
  useAnimationFrame(
    (_nowMs, deltaMs) => {
      if (isValidInterval(deltaMs)) {
        intervalsRef.current.push(deltaMs);
      }
      if (intervalsRef.current.length < STARTUP_FRAME_COUNT) {
        return "continue";
      }
      const measured = intervalsRef.current;
      intervalsRef.current = [];
      onDone(measured);
      return "stop";
    },
    enabled ? "quality-tier-startup" : null,
  );
}

type ApplyRefs = {
  readonly appliedRef: RefObject<Applied | null>;
  readonly shownRef: RefObject<QualityTier>;
  readonly trackerRef: RefObject<TierTracker>;
  readonly reasonRef: RefObject<TierSwitchReason>;
  readonly windowP95Ref: RefObject<number | null>;
};

type ApplyArgs = {
  readonly stage: StageHandle | null;
  readonly desired: QualityTier;
  readonly canSwitch: boolean;
  readonly initial: InitialTier;
  readonly latest: RefObject<UseQualityTierOptions>;
  readonly refs: ApplyRefs;
  readonly setTier: (tier: QualityTier) => void;
};

/**
 * 決まったティア(`desired`)を、切り替えてよい場面になったら `stage.setQualityTier` で貼る(飛行中はペンディング)。
 * ステージが作り直されたら貼り直す。ティアが実際に変わったときだけ、次の窓を捨て、保存(固定中を除く)と `onSwitch` を行う。
 * 外部資源を購読しない一回きりの呼び出しなので、cleanup するものはない(StrictMode の再実行は `appliedRef` で冪等)。
 */
function useApplyTier({ stage, desired, canSwitch, initial, latest, refs, setTier }: ApplyArgs): void {
  const { appliedRef, shownRef, trackerRef, reasonRef, windowP95Ref } = refs;
  useEffect(() => {
    if (stage === null) {
      return undefined;
    }
    const appliedHere = appliedRef.current !== null && appliedRef.current.stage === stage ? appliedRef.current.tier : null;
    const target = tierToApply({ desired, applied: appliedHere, canSwitch });
    if (target === null) {
      return undefined;
    }
    stage.setQualityTier(target);
    appliedRef.current = { stage, tier: target };
    const fromTier = shownRef.current;
    if (target === fromTier) {
      return undefined;
    }
    shownRef.current = target;
    trackerRef.current = trackSwitched(trackerRef.current);
    setTier(target);
    if (!initial.fixed && latest.current.prefs.prefs.lastQualityTier !== target) {
      latest.current.prefs.update({ lastQualityTier: target });
    }
    const reason = reasonRef.current;
    latest.current.onSwitch?.({ fromTier, toTier: target, reason, windowP95Ms: reason === "auto" ? windowP95Ref.current : null });
    return undefined;
  }, [stage, desired, canSwitch, initial.fixed, latest, appliedRef, shownRef, trackerRef, reasonRef, windowP95Ref, setTier]);
}

/**
 * 品質ティアの自動切替。初期ティアは `?tier=`(開発/試遊のみ)→ 直近のセッションのティア → T0 の順で決め、起動直後 60 フレームの
 * 中央値が 22ms を超えたら T1 以上で始める。以降は窓(`FRAME_PERF_WINDOW_MS` = 2 秒)ごとの p95 で `nextTier` を進める(自動では上げない)。
 * 下げると決まったティアは飛行中ならペンディングにして、`idle`/`play` になったら `stage.setQualityTier` を呼ぶ。
 * 切替を貼ったときだけ、直近のティアを `prefs` へ保存(固定中は保存しない)し、`onSwitch` を呼ぶ。切替の直後の窓は捨てる。
 */
export function useQualityTier(options: UseQualityTierOptions): UseQualityTierResult {
  const { stage, phase } = options;
  const latest = useLatest(options);
  const [initial] = useState<InitialTier>(() =>
    resolveInitialTier({
      lastTier: options.prefs.prefs.lastQualityTier,
      override: parseTierOverride(options.search ?? window.location.search),
      overrideAllowed: options.allowOverride ?? PLAYTEST_ENABLED,
    }),
  );
  const [desired, setDesired] = useState<QualityTier>(initial.tier);
  // ステージを作った直後の既定は T0。初期ティアを貼った時点で（T0 と違えば）切替として通知する。
  const [tier, setTier] = useState<QualityTier>(0);
  const [startupDone, setStartupDone] = useState<boolean>(initial.fixed);
  const trackerRef = useRef<TierTracker>(initialTracker(initial.tier));
  const reasonRef = useRef<TierSwitchReason>(initial.reason);
  const windowP95Ref = useRef<number | null>(null);
  const appliedRef = useRef<Applied | null>(null);
  const shownRef = useRef<QualityTier>(0);
  const canSwitch = canSwitchTier(phase);

  useStartupProbe(!startupDone && stage !== null, (intervalsMs) => {
    const verdict = startupTierOf(initial.tier, intervalsMs);
    if (verdict !== trackerRef.current.state.tier) {
      trackerRef.current = initialTracker(verdict);
      reasonRef.current = "startup";
      setDesired(verdict);
    }
    setStartupDone(true);
  });

  useFramePerf({
    active: startupDone && !initial.fixed && stage !== null && phase !== "idle",
    onWindow: (perfWindow: FramePerfWindow) => {
      const next = trackWindow(trackerRef.current, perfWindow.stats);
      const lowered = next.state.tier !== trackerRef.current.state.tier;
      trackerRef.current = next;
      if (lowered) {
        reasonRef.current = "auto";
        windowP95Ref.current = perfWindow.stats.p95Ms;
        setDesired(next.state.tier);
      }
    },
  });

  useApplyTier({ stage, desired, canSwitch, initial, latest, refs: { appliedRef, shownRef, trackerRef, reasonRef, windowP95Ref }, setTier });

  return { tier, fixed: initial.fixed };
}
