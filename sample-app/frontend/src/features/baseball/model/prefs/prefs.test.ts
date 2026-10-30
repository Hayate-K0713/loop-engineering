import { describe, expect, it } from "vitest";
import { createSafeStore } from "./safe-store";
import { DEFAULT_PREFS, parsePrefs, parseTutorialSeen, PREFS_STORAGE_KEY, serializePrefs, TUTORIAL_SEEN_VALUE, TUTORIAL_STORAGE_KEY } from "./prefs";

describe("parsePrefs", () => {
  it("既定値は音 ON・触覚 ON・自動リプレイ OFF・ティア不明", () => {
    expect(DEFAULT_PREFS.soundOn).toBe(true);
    expect(DEFAULT_PREFS.hapticsOn).toBe(true);
    expect(DEFAULT_PREFS.autoReplay).toBe(false);
    expect(DEFAULT_PREFS.lastQualityTier).toBeNull();
  });

  it("null・空・不正な JSON・オブジェクトでない値は全て既定値", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs(undefined)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("{oops")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("42")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("[1,2]")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("null")).toEqual(DEFAULT_PREFS);
  });

  it("欠損した項目だけを既定値で補う", () => {
    const prefs = parsePrefs('{"soundOn":false,"hintCounts":{"batting":3}}');
    expect(prefs.soundOn).toBe(false);
    expect(prefs.hapticsOn).toBe(true);
    expect(prefs.autoReplay).toBe(false);
    expect(prefs.lastQualityTier).toBeNull();
    expect(prefs.hintCounts).toEqual({ batting: 3, pitching: 0, tap: 0 });
  });

  it("型の違う項目は既定値に戻し、他の正しい項目は残す", () => {
    const prefs = parsePrefs({ soundOn: "no", hapticsOn: false, autoReplay: 1, lastQualityTier: 7, hintCounts: { batting: -1, pitching: 2.5, tap: 2 } });
    expect(prefs.soundOn).toBe(true);
    expect(prefs.hapticsOn).toBe(false);
    expect(prefs.autoReplay).toBe(false);
    expect(prefs.lastQualityTier).toBeNull();
    expect(prefs.hintCounts).toEqual({ batting: 0, pitching: 0, tap: 2 });
  });

  it("ティアは 0〜3 だけを受け付ける", () => {
    expect(parsePrefs({ lastQualityTier: 0 }).lastQualityTier).toBe(0);
    expect(parsePrefs({ lastQualityTier: 3 }).lastQualityTier).toBe(3);
    expect(parsePrefs({ lastQualityTier: 4 }).lastQualityTier).toBeNull();
    expect(parsePrefs({ lastQualityTier: "2" }).lastQualityTier).toBeNull();
  });

  it("serializePrefs と parsePrefs は往復で同じ値になる", () => {
    const prefs = { soundOn: false, hapticsOn: false, autoReplay: true, lastQualityTier: 2 as const, hintCounts: { batting: 5, pitching: 1, tap: 3 } };
    expect(parsePrefs(serializePrefs(prefs))).toEqual(prefs);
    expect(parsePrefs(serializePrefs(DEFAULT_PREFS))).toEqual(DEFAULT_PREFS);
  });

  it("解釈のたびに既定値の hintCounts を書き換えない", () => {
    const first = parsePrefs(null);
    expect(first.hintCounts).toEqual({ batting: 0, pitching: 0, tap: 0 });
    expect(parsePrefs('{"hintCounts":{"tap":2}}').hintCounts.tap).toBe(2);
    expect(DEFAULT_PREFS.hintCounts.tap).toBe(0);
  });
});

describe("説明の既読", () => {
  it("'1' だけが既読", () => {
    expect(parseTutorialSeen(TUTORIAL_SEEN_VALUE)).toBe(true);
    expect(parseTutorialSeen(null)).toBe(false);
    expect(parseTutorialSeen(undefined)).toBe(false);
    expect(parseTutorialSeen("0")).toBe(false);
    expect(parseTutorialSeen("true")).toBe(false);
  });
});

describe("safe-store との組み合わせ", () => {
  it("保存領域が例外を投げても、設定の保存・読み出し・既読の記録が例外なく動く", () => {
    const store = createSafeStore(() => {
      throw new Error("SecurityError");
    });
    expect(parsePrefs(store.get(PREFS_STORAGE_KEY))).toEqual(DEFAULT_PREFS);
    store.set(PREFS_STORAGE_KEY, serializePrefs({ ...DEFAULT_PREFS, soundOn: false }));
    expect(parsePrefs(store.get(PREFS_STORAGE_KEY)).soundOn).toBe(false);
    expect(parseTutorialSeen(store.get(TUTORIAL_STORAGE_KEY))).toBe(false);
    store.set(TUTORIAL_STORAGE_KEY, TUTORIAL_SEEN_VALUE);
    expect(parseTutorialSeen(store.get(TUTORIAL_STORAGE_KEY))).toBe(true);
  });
});
