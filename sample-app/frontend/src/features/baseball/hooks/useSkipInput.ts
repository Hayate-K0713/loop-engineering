import { useEffect } from "react";
import { isSkipKey } from "../model/world/sequence/input-route";
import { useLatest } from "./useLatest";

type UseSkipInputOptions = {
  /** 演出中(`isHolding`)。偽のときはキーを一切扱わない(`isSkipKey` が偽を返す)。 */
  readonly holding: boolean;
  /** 演出のスキップ(director の `skip`)。 */
  readonly onSkip: () => void;
};

/** キー入力の対象要素のタグ名。要素でない(`window` や `document` など)ときは空文字。 */
function tagNameOf(target: EventTarget | null): string {
  return target instanceof Element ? target.tagName : "";
}

/**
 * 演出のスキップ(Space/Enter)。`window` の keydown を購読し、`isSkipKey` が真のとき `preventDefault()` して `onSkip()` を呼ぶ。
 * `holding` と `onSkip` は `useLatest` 経由で最新を読むので、リスナは mount 中ずっと1つ(cleanup で解除)。
 * `useKeyboardInput`(スイング)は `swingReady` のときだけ Space/Enter を扱い、そのとき `preventDefault()` する。
 * 同じ keydown に対する window のリスナ同士の間ではマイクロタスクが走り、スイングで state が更新されると React が `holding = true` で
 * 再描画済みになる。そのため `holding` だけで判定すると、スイングに使ったキーでそのまま演出がスキップされてしまう。
 * `event.defaultPrevented` が真(= 他のリスナがそのキーを消費済み)なら何もしないことで、スイングとスキップを排他にする。
 */
export function useSkipInput({ holding, onSkip }: UseSkipInputOptions): void {
  const latest = useLatest({ holding, onSkip });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) {
        return;
      }
      const { holding: isHolding, onSkip: skip } = latest.current;
      if (isSkipKey({ holding: isHolding, key: event.key, repeat: event.repeat, targetTag: tagNameOf(event.target) })) {
        event.preventDefault();
        skip();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [latest]);
}
