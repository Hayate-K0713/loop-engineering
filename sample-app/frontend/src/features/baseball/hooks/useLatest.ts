import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * 最新の値を保持する ref。rAF・タイマー・イベントリスナのコールバックから最新の props・state を読むために使う
 * (`eslint-plugin-react-hooks` が未導入で依存配列の誤りを検出できないため、依存配列に頼らず ref 経由で参照する)。
 * 更新は commit 後(layout effect)に行うので、同じ commit の passive effect や以降のイベントからは常に最新値が読める。
 */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
