import { useCallback, useRef, useState } from "react";
import {
  PREFS_STORAGE_KEY,
  TUTORIAL_SEEN_VALUE,
  TUTORIAL_STORAGE_KEY,
  parsePrefs,
  parseTutorialSeen,
  serializePrefs,
  type HintCounts,
  type Prefs,
} from "../model/prefs/prefs";
import { createSafeStore, type SafeStore } from "../model/prefs/safe-store";

/** `update` で変えられる項目(球数ヒントの回数は `bumpHint` で増やす)。 */
export type PrefsPatch = Partial<Pick<Prefs, "soundOn" | "hapticsOn" | "autoReplay" | "lastQualityTier">>;

export type PreferencesApi = {
  /** 現在の設定(欠損は既定値で補われている)。 */
  readonly prefs: Prefs;
  /** 説明(チュートリアル)を既に見たか。 */
  readonly tutorialSeen: boolean;
  /** 直近の保存領域への書き込みが失敗したか(メモリ上の設定は有効なまま)。画面の「保存できません」表示に使う。 */
  readonly saveFailed: boolean;
  /** 設定の一部を変えて保存する。 */
  readonly update: (patch: PrefsPatch) => void;
  /** 球数ヒントを 1 回出したことを記録する。 */
  readonly bumpHint: (kind: keyof HintCounts) => void;
  /** 説明を見たことを記録する。 */
  readonly markTutorialSeen: () => void;
};

function incrementHint(counts: HintCounts, kind: keyof HintCounts): HintCounts {
  switch (kind) {
    case "batting":
      return { ...counts, batting: counts.batting + 1 };
    case "pitching":
      return { ...counts, pitching: counts.pitching + 1 };
    case "tap":
      return { ...counts, tap: counts.tap + 1 };
  }
}

/**
 * 設定(音・触覚・リプレイ・品質ティア・球数ヒント)と説明の既読を、`createSafeStore` 経由で読み書きする。
 * ブラウザの保存領域は任意で、読めない・書けない環境(sandbox の iframe 等)でもメモリ上で動き、例外は出さない。
 * `localStorage` にさわるのは `createSafeStore` に渡す取得関数だけ。effect は持たない(購読する外部資源がない)。
 * `store` はテスト用の差し替え。省略時はこのフックが 1 つ作る。
 */
export function usePreferences(store?: SafeStore): PreferencesApi {
  const [safeStore] = useState<SafeStore>(() => store ?? createSafeStore(() => window.localStorage));
  const [prefs, setPrefs] = useState<Prefs>(() => parsePrefs(safeStore.get(PREFS_STORAGE_KEY)));
  const [tutorialSeen, setTutorialSeen] = useState<boolean>(() => parseTutorialSeen(safeStore.get(TUTORIAL_STORAGE_KEY)));
  const [saveFailed, setSaveFailed] = useState<boolean>(false);
  // 連続した更新(同じイベント内の `update` → `bumpHint` など)でも直前の値の上に積むため、最新値を ref にも持つ。
  const prefsRef = useRef<Prefs>(prefs);

  const commit = useCallback(
    (next: Prefs): void => {
      prefsRef.current = next;
      setPrefs(next);
      safeStore.set(PREFS_STORAGE_KEY, serializePrefs(next));
      setSaveFailed(safeStore.lastWriteOk() === false);
    },
    [safeStore],
  );

  const update = useCallback((patch: PrefsPatch): void => commit({ ...prefsRef.current, ...patch }), [commit]);

  const bumpHint = useCallback(
    (kind: keyof HintCounts): void => {
      const current = prefsRef.current;
      commit({ ...current, hintCounts: incrementHint(current.hintCounts, kind) });
    },
    [commit],
  );

  const markTutorialSeen = useCallback((): void => {
    setTutorialSeen(true);
    safeStore.set(TUTORIAL_STORAGE_KEY, TUTORIAL_SEEN_VALUE);
    setSaveFailed(safeStore.lastWriteOk() === false);
  }, [safeStore]);

  return { prefs, tutorialSeen, saveFailed, update, bumpHint, markTutorialSeen };
}
