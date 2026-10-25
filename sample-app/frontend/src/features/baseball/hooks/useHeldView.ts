import { useLayoutEffect, useRef } from "react";
import type { GameView } from "../types/view";

/**
 * 表示用の view を、演出が終わるまで直前のまま保持する(スコア・カウント・実況・対戦情報・ユニフォーム色を演出の後に更新するため。N8)。
 * `holding` が偽の間は最新の `view` をそのまま返し(同時に ref へ保存)、真の間は、`holding` が立つ直前に保存した view を返す。
 * 操作可否や演出の入力(`flight`・`outcome` など)には、保持された view ではなく最新の `view` を使うこと。
 *
 * 保存は commit 後の layout effect で行う。`holding` が真になる render では保存済みの view(直前の commit のもの)を読むので、
 * 解決した球の結果(`outcome` 以降の更新)は表示に混ざらない。
 */
export function useHeldView(view: GameView, holding: boolean): GameView {
  const heldRef = useRef<GameView>(view);

  // ref への代入だけで解放する資源は無いので cleanup は不要(`useLatest` と同じ。StrictMode の再実行でも同じ値を入れ直すだけで無害)。
  useLayoutEffect(() => {
    if (!holding) {
      heldRef.current = view;
    }
  }, [view, holding]);

  return holding ? heldRef.current : view;
}
