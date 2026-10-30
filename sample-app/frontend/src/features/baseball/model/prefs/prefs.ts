// 設定(音・触覚・リプレイの自動再生・球数ヒントの既読・直近の品質ティア)と説明の既読の、読み書きの純粋関数。
// 保存先は `safe-store.ts`(メモリ主・保存領域は任意)で、ここは文字列との往復と欠損の補完だけを行う。

/** 設定の保存キー(`createSafeStore` 経由で使う)。 */
export const PREFS_STORAGE_KEY = "bb-prefs-v1";
/** 説明(チュートリアル)の既読の保存キー。値は `"1"`。 */
export const TUTORIAL_STORAGE_KEY = "bb-tutorial-v1";

/** 球数ヒントを出した回数(人間の打撃・投球それぞれの最初の 5 球。タップが通らなかったヒントは最大 3 回)。 */
export type HintCounts = {
  readonly batting: number;
  readonly pitching: number;
  readonly tap: number;
};

export type Prefs = {
  /** 効果音。既定 ON。 */
  readonly soundOn: boolean;
  /** 触覚(振動)。既定 ON。 */
  readonly hapticsOn: boolean;
  /** ホームラン等のあとにリプレイを自動で再生する。既定 OFF。 */
  readonly autoReplay: boolean;
  /** 直近のセッションの品質ティア(0 = 最高 … 3 = 最低)。分からないときは `null`(T0 から始める)。 */
  readonly lastQualityTier: 0 | 1 | 2 | 3 | null;
  readonly hintCounts: HintCounts;
};

export const DEFAULT_PREFS: Prefs = {
  soundOn: true,
  hapticsOn: true,
  autoReplay: false,
  lastQualityTier: null,
  hintCounts: { batting: 0, pitching: 0, tap: 0 },
};

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function tierOr(value: unknown, fallback: Prefs["lastQualityTier"]): Prefs["lastQualityTier"] {
  return value === 0 || value === 1 || value === 2 || value === 3 ? value : fallback;
}

function countOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function hintCountsOf(value: unknown): HintCounts {
  const source = isObject(value) ? value : {};
  return {
    batting: countOr(source.batting, DEFAULT_PREFS.hintCounts.batting),
    pitching: countOr(source.pitching, DEFAULT_PREFS.hintCounts.pitching),
    tap: countOr(source.tap, DEFAULT_PREFS.hintCounts.tap),
  };
}

function decode(raw: unknown): unknown {
  if (typeof raw !== "string") {
    return raw;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * 保存された設定を読み取る。JSON 文字列でも、すでに解釈したオブジェクトでもよい。
 * 欠損・型の違う項目は既定値で補い、壊れた JSON・`null`・オブジェクトでない値は全て既定値にする。例外は投げない。
 */
export function parsePrefs(raw: unknown): Prefs {
  const value = decode(raw);
  if (!isObject(value)) {
    return DEFAULT_PREFS;
  }
  return {
    soundOn: booleanOr(value.soundOn, DEFAULT_PREFS.soundOn),
    hapticsOn: booleanOr(value.hapticsOn, DEFAULT_PREFS.hapticsOn),
    autoReplay: booleanOr(value.autoReplay, DEFAULT_PREFS.autoReplay),
    lastQualityTier: tierOr(value.lastQualityTier, DEFAULT_PREFS.lastQualityTier),
    hintCounts: hintCountsOf(value.hintCounts),
  };
}

/** 設定を保存用の JSON 文字列にする。 */
export function serializePrefs(prefs: Prefs): string {
  return JSON.stringify(prefs);
}

/** 説明の既読の保存値を読み取る。`"1"` だけが既読で、`null`・その他は未読。 */
export function parseTutorialSeen(raw: string | null | undefined): boolean {
  return raw === "1";
}

/** 説明の既読の保存値。 */
export const TUTORIAL_SEEN_VALUE = "1";
