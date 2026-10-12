import { describe, expect, it } from "vitest";
import { isSkipKey, routeStagePointer, type SkipKeyInput, type StagePointerAction, type StagePointerInput } from "./input-route";

const BOOLS: readonly boolean[] = [true, false];
const POINTER_TYPES: readonly string[] = ["mouse", "pen", "touch"];
const BUTTONS: readonly number[] = [0, 1, 2];
const ACTIONS: readonly StagePointerAction[] = ["skip", "swing", "drag-start", "ignore"];

// 全 144 通り: holding × enabled × swingReady × pointerType × isPrimary × button を段階的に展開する(ネストを浅く保つ)。
const BY_HOLDING = BOOLS.map((holding) => ({ holding }));
const BY_ENABLED = BY_HOLDING.flatMap((base) => BOOLS.map((enabled) => ({ ...base, enabled })));
const BY_READY = BY_ENABLED.flatMap((base) => BOOLS.map((swingReady) => ({ ...base, swingReady })));
const BY_TYPE = BY_READY.flatMap((base) => POINTER_TYPES.map((pointerType) => ({ ...base, pointerType })));
const BY_PRIMARY = BY_TYPE.flatMap((base) => BOOLS.map((isPrimary) => ({ ...base, isPrimary })));
const ALL_POINTER_INPUTS: readonly StagePointerInput[] = BY_PRIMARY.flatMap((base) => BUTTONS.map((button) => ({ ...base, button })));

/** 主ポインタ操作の定義(設計書 規約13): マウス/ペンは isPrimary かつ button 0、タッチは isPrimary のみ。 */
function isPrimaryAction(input: StagePointerInput): boolean {
  return input.pointerType === "touch" ? input.isPrimary : input.isPrimary && input.button === 0;
}

/** 条件を満たさない入力(失敗メッセージ用に JSON)。 */
function violations(inputs: readonly StagePointerInput[], predicate: (input: StagePointerInput, action: StagePointerAction) => boolean): readonly string[] {
  return inputs.filter((input) => !predicate(input, routeStagePointer(input))).map((input) => JSON.stringify(input));
}

describe("routeStagePointer: 全組み合わせ", () => {
  it("2×2×2×3×2×3 = 144 通りを走査している", () => {
    expect(ALL_POINTER_INPUTS).toHaveLength(144);
  });

  it("(1) holding で主ポインタ操作なら、swingReady・enabled によらず必ず skip", () => {
    const targets = ALL_POINTER_INPUTS.filter((input) => input.holding && isPrimaryAction(input));
    expect(targets.length).toBeGreaterThan(0);
    expect(violations(targets, (_input, action) => action === "skip")).toEqual([]);
  });

  it("(2) holding のとき swing / drag-start は一度も返らない", () => {
    const targets = ALL_POINTER_INPUTS.filter((input) => input.holding);
    expect(violations(targets, (_input, action) => action !== "swing" && action !== "drag-start")).toEqual([]);
  });

  it("(3) holding でなく enabled のとき、マウス/ペンの主ポインタ操作は swing、タッチの主ポインタは button によらず drag-start", () => {
    const pointerTargets = ALL_POINTER_INPUTS.filter((input) => !input.holding && input.enabled && isPrimaryAction(input));
    const mouseLike = pointerTargets.filter((input) => input.pointerType !== "touch");
    const touch = pointerTargets.filter((input) => input.pointerType === "touch");
    expect(mouseLike.length).toBeGreaterThan(0);
    expect(touch.filter((input) => input.button !== 0).length).toBeGreaterThan(0);
    expect(violations(mouseLike, (_input, action) => action === "swing")).toEqual([]);
    expect(violations(touch, (_input, action) => action === "drag-start")).toEqual([]);
  });

  it("(4) holding でなく enabled でもなければ ignore", () => {
    const targets = ALL_POINTER_INPUTS.filter((input) => !input.holding && !input.enabled);
    expect(violations(targets, (_input, action) => action === "ignore")).toEqual([]);
  });

  it("(5) 主ポインタ操作でないもの(マウス/ペンの副ポインタ・副ボタン、タッチの副ポインタ)は holding によらず ignore", () => {
    const targets = ALL_POINTER_INPUTS.filter((input) => !isPrimaryAction(input));
    expect(targets.some((input) => input.holding)).toBe(true);
    expect(violations(targets, (_input, action) => action === "ignore")).toEqual([]);
  });

  it("(6) 戻り値は常に4種のいずれか", () => {
    expect(violations(ALL_POINTER_INPUTS, (_input, action) => ACTIONS.includes(action))).toEqual([]);
  });

  it("swingReady は結果に影響しない(holding との同時成立でも holding を優先する)", () => {
    const flipped = (input: StagePointerInput): StagePointerInput => ({ ...input, swingReady: !input.swingReady });
    expect(violations(ALL_POINTER_INPUTS, (input, action) => routeStagePointer(flipped(input)) === action)).toEqual([]);
  });

  it("具体例: タッチの主ポインタは、button が 2 でも holding でなければ drag-start、holding なら skip", () => {
    const touch = { holding: false, enabled: true, swingReady: true, pointerType: "touch", isPrimary: true, button: 2 };
    expect(routeStagePointer(touch)).toBe("drag-start");
    expect(routeStagePointer({ ...touch, holding: true })).toBe("skip");
  });

  it("具体例: マウスの右ボタンは holding でも ignore(スキップにもスイングにも使わない)", () => {
    const rightClick = { holding: true, enabled: true, swingReady: true, pointerType: "mouse", isPrimary: true, button: 2 };
    expect(routeStagePointer(rightClick)).toBe("ignore");
  });
});

const SKIP_BASE: SkipKeyInput = { holding: true, key: " ", repeat: false, targetTag: "DIV" };

describe("isSkipKey", () => {
  it.each([" ", "Enter"])("holding 中の %j は、BODY / DIV / BUTTON / 要素でない(空文字)入力先で真", (key) => {
    const results = ["BODY", "DIV", "BUTTON", ""].map((targetTag) => isSkipKey({ ...SKIP_BASE, key, targetTag }));
    expect(results).toEqual([true, true, true, true]);
  });

  it("holding でなければ偽", () => {
    expect(isSkipKey({ ...SKIP_BASE, holding: false })).toBe(false);
  });

  it("repeat(押しっぱなしの連打)は偽", () => {
    expect(isSkipKey({ ...SKIP_BASE, repeat: true })).toBe(false);
  });

  it("Space / Enter 以外のキーは偽", () => {
    const results = ["a", "z", "Escape", "Tab", "ArrowLeft", "Spacebar", "enter"].map((key) => isSkipKey({ ...SKIP_BASE, key }));
    expect(results.every((result) => !result)).toBe(true);
  });

  it("リンク・select・input・textarea が入力先なら偽(大文字・小文字を区別しない)", () => {
    const tags = ["A", "SELECT", "INPUT", "TEXTAREA", "a", "input", "Textarea"];
    expect(tags.map((targetTag) => isSkipKey({ ...SKIP_BASE, targetTag }))).toEqual(tags.map(() => false));
  });
});
