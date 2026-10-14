import { useCallback, useEffect, useRef, type RefObject } from "react";
import { clamp } from "../model/pitch/zone";
import type { SafeArea } from "../types/scene";

/** 空き領域の上下の端が、これ(画面高比、約 3px)未満しか動いていなければ更新しない(カメラの揺れ防止)。 */
const MIN_CHANGE_RATIO = 0.004;

export type UseSafeAreaResult = {
  /**
   * 最新の空き領域(ステージの矩形に対する画面高比。HUD の下端と下のオーバーレイの上端)。
   * 目印の要素が見つからない・上下が逆転している・ステージの高さが 0 のときは `null`(model が既定の空き領域を使う)。毎フレーム呼んでよい(ref を読むだけ)。
   */
  readonly getSafeArea: () => SafeArea | null;
};

type Insets = { readonly top: Element; readonly bottom: Element };

/**
 * ステージの親(`[data-safe-area-root]`)の中から、上の HUD の行(`[data-inset="top"]`)と下のオーバーレイ(`[data-inset="bottom"]`)を探す。
 * 測る対象は高さが固定のコンテナだけ(開閉するパネルは含めない。ログを開いたときにカメラが動かないように)。
 */
function findInsets(container: HTMLElement): Insets | null {
  const root = container.closest("[data-safe-area-root]");
  const top = root?.querySelector('[data-inset="top"]') ?? null;
  const bottom = root?.querySelector('[data-inset="bottom"]') ?? null;
  return top === null || bottom === null ? null : { top, bottom };
}

/** `getBoundingClientRect` をそのまま使い、ステージの矩形に対する画面高比にする。測れない・上下が逆転しているときは `null`。 */
function measureRatios(container: HTMLElement, insets: Insets): SafeArea | null {
  const stage = container.getBoundingClientRect();
  if (!Number.isFinite(stage.height) || stage.height <= 0) {
    return null;
  }
  const top = clamp((insets.top.getBoundingClientRect().bottom - stage.top) / stage.height, 0, 1);
  const bottom = clamp((insets.bottom.getBoundingClientRect().top - stage.top) / stage.height, 0, 1);
  return Number.isFinite(top) && Number.isFinite(bottom) && top < bottom ? { top, bottom } : null;
}

/** 測定値を反映するか。`null` への変化・`null` からの変化は常に反映し、値の変化が `MIN_CHANGE_RATIO` 未満なら前の値を保つ。 */
function nextSafeArea(previous: SafeArea | null, measured: SafeArea | null): SafeArea | null {
  if (previous === null || measured === null) {
    return measured;
  }
  const changed = Math.abs(measured.top - previous.top) >= MIN_CHANGE_RATIO || Math.abs(measured.bottom - previous.bottom) >= MIN_CHANGE_RATIO;
  return changed ? measured : previous;
}

/** 観測対象を `next` に合わせる(新しい要素を観測し、外れた要素の観測を止める)。オーバーレイが後から現れても追従するため、測定のたびに呼ぶ。 */
function syncObserved(observer: ResizeObserver | null, observed: Set<Element>, next: readonly Element[]): void {
  if (observer === null) {
    return;
  }
  for (const element of observed) {
    if (!next.includes(element)) {
      observer.unobserve(element);
      observed.delete(element);
    }
  }
  for (const element of next) {
    if (!observed.has(element)) {
      observer.observe(element);
      observed.add(element);
    }
  }
}

/**
 * ステージが見える縦の範囲(空き領域)の実測。`containerRef`(ステージの容器)の祖先の `[data-safe-area-root]` の中の
 * `[data-inset="top"]`(HUD の下端)と `[data-inset="bottom"]`(下のオーバーレイの上端)を `getBoundingClientRect` で測り、ref に保持する。
 * 再測定は `ResizeObserver`(ステージ・両オーバーレイ。レイアウト(打撃/守備)の切り替えによるバーの高さの変化もこれで拾う)、
 * `window` の resize、`remeasureKey` の変更時。`remeasureKey` はオーバーレイの要素そのものが入れ替わる切り替え(DOM に現れる/消える)を呼び出し側が知らせるための任意の値。
 * 値が `MIN_CHANGE_RATIO` 未満しか変わらないときは更新しない。cleanup で observer と listener を解除する。
 */
export function useSafeArea(containerRef: RefObject<HTMLElement | null>, remeasureKey?: string): UseSafeAreaResult {
  const safeAreaRef = useRef<SafeArea | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return undefined;
    }
    const observed = new Set<Element>();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => measure());
    const measure = (): void => {
      const insets = findInsets(container);
      syncObserved(observer, observed, insets === null ? [container] : [container, insets.top, insets.bottom]);
      safeAreaRef.current = nextSafeArea(safeAreaRef.current, insets === null ? null : measureRatios(container, insets));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
      observed.clear();
    };
  }, [containerRef, remeasureKey]);

  const getSafeArea = useCallback((): SafeArea | null => safeAreaRef.current, []);
  return { getSafeArea };
}
