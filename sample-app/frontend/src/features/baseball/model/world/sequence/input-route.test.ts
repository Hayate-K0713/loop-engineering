import { describe, expect, it } from "vitest";
import {
  isSkipKey,
  isTapGesture,
  routeStageMove,
  routeStagePointer,
  routeStageRelease,
  TAP_ARRIVAL_HOLD_MS,
  TAP_MAX_DURATION_MS,
  TAP_MAX_MOVE_PX,
  type SkipKeyInput,
  type StageMoveAction,
  type StageMoveInput,
  type StagePointerAction,
  type StagePointerInput,
  type StageReleaseInput,
} from "./input-route";

const BOOLS: readonly boolean[] = [true, false];
const POINTER_TYPES: readonly string[] = ["mouse", "pen", "touch"];
const BUTTONS: readonly number[] = [0, 1, 2];
const ACTIONS: readonly StagePointerAction[] = ["skip", "swing", "swing-here", "drag-start", "ignore"];
const MOVE_ACTIONS: readonly StageMoveAction[] = ["drag", "drag-start", "follow", "ignore"];

// 全 144 通り: holding × enabled × swingReady × pointerType × isPrimary × button を段階的に展開する(ネストを浅く保つ)。
const BY_HOLDING = BOOLS.map((holding) => ({ holding }));
const BY_ENABLED = BY_HOLDING.flatMap((base) => BOOLS.map((enabled) => ({ ...base, enabled })));
const BY_READY = BY_ENABLED.flatMap((base) => BOOLS.map((swingReady) => ({ ...base, swingReady })));
const BY_TYPE = BY_READY.flatMap((base) => POINTER_TYPES.map((pointerType) => ({ ...base, pointerType })));
const BY_PRIMARY = BY_TYPE.flatMap((base) => BOOLS.map((isPrimary) => ({ ...base, isPrimary })));
const ALL_POINTER_INPUTS: readonly StagePointerInput[] = BY_PRIMARY.flatMap((base) => BUTTONS.map((button) => ({ ...base, button })));

/** 主ポインタ操作の定義(設計書 規約13): マウス/ペンは isPrimary かつ button 0、タッチの 1 本目は isPrimary のみ。 */
function isPrimaryAction(input: StagePointerInput): boolean {
  return input.pointerType === "touch" ? input.isPrimary : input.isPrimary && input.button === 0;
}

/** 2 本目以降の指(タッチで isPrimary でない)。 */
function isSecondaryTouch(input: StagePointerInput): boolean {
  return input.pointerType === "touch" && !input.isPrimary;
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

  it("(2) holding のとき swing / swing-here / drag-start は一度も返らない", () => {
    const targets = ALL_POINTER_INPUTS.filter((input) => input.holding);
    expect(violations(targets, (_input, action) => action !== "swing" && action !== "swing-here" && action !== "drag-start")).toEqual([]);
  });

  it("(3) holding でなく enabled のとき、マウス/ペンの主ポインタ操作は swing、タッチの 1 本目は button によらず drag-start", () => {
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

  it("(5) 主ポインタ操作でないマウス/ペン(副ポインタ・副ボタン)は holding によらず ignore", () => {
    const targets = ALL_POINTER_INPUTS.filter((input) => input.pointerType !== "touch" && !isPrimaryAction(input));
    expect(targets.some((input) => input.holding)).toBe(true);
    expect(violations(targets, (_input, action) => action === "ignore")).toEqual([]);
  });

  it("(6) 2 本目以降のタッチは skip にならず、holding でなく enabled のときだけ swing-here、それ以外は ignore(button・swingReady によらない)", () => {
    const targets = ALL_POINTER_INPUTS.filter(isSecondaryTouch);
    expect(targets).toHaveLength(24);
    expect(violations(targets, (_input, action) => action !== "skip")).toEqual([]);
    expect(violations(targets, (input, action) => action === (!input.holding && input.enabled ? "swing-here" : "ignore"))).toEqual([]);
  });

  it("(7) swing-here は 2 本目以降のタッチからだけ返る", () => {
    const hits = ALL_POINTER_INPUTS.filter((input) => routeStagePointer(input) === "swing-here");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every(isSecondaryTouch)).toBe(true);
  });

  it("(8) 戻り値は常に 5 種のいずれか", () => {
    expect(violations(ALL_POINTER_INPUTS, (_input, action) => ACTIONS.includes(action))).toEqual([]);
  });

  it("swingReady は結果に影響しない(holding との同時成立でも holding を優先する)", () => {
    const flipped = (input: StagePointerInput): StagePointerInput => ({ ...input, swingReady: !input.swingReady });
    expect(violations(ALL_POINTER_INPUTS, (input, action) => routeStagePointer(flipped(input)) === action)).toEqual([]);
  });

  it("具体例: タッチの 1 本目は、button が 2 でも holding でなければ drag-start、holding なら skip", () => {
    const touch = { holding: false, enabled: true, swingReady: true, pointerType: "touch", isPrimary: true, button: 2 };
    expect(routeStagePointer(touch)).toBe("drag-start");
    expect(routeStagePointer({ ...touch, holding: true })).toBe("skip");
  });

  it("具体例: 2 本目の指は、演出中はスキップせず ignore、打撃中は swing-here", () => {
    const second = { holding: false, enabled: true, swingReady: true, pointerType: "touch", isPrimary: false, button: 0 };
    expect(routeStagePointer(second)).toBe("swing-here");
    expect(routeStagePointer({ ...second, holding: true })).toBe("ignore");
    expect(routeStagePointer({ ...second, enabled: false })).toBe("ignore");
  });

  it("具体例: マウスの右ボタンは holding でも ignore(スキップにもスイングにも使わない)", () => {
    const rightClick = { holding: true, enabled: true, swingReady: true, pointerType: "mouse", isPrimary: true, button: 2 };
    expect(routeStagePointer(rightClick)).toBe("ignore");
  });
});

// routeStageMove の全 2×2×2×2×3 = 48 通り。
const MOVE_BY_HOLDING = BOOLS.map((holding) => ({ holding }));
const MOVE_BY_ENABLED = MOVE_BY_HOLDING.flatMap((base) => BOOLS.map((enabled) => ({ ...base, enabled })));
const MOVE_BY_DRAGGING = MOVE_BY_ENABLED.flatMap((base) => BOOLS.map((dragging) => ({ ...base, dragging })));
const MOVE_BY_HELD = MOVE_BY_DRAGGING.flatMap((base) => BOOLS.map((held) => ({ ...base, held })));
const ALL_MOVE_INPUTS: readonly StageMoveInput[] = MOVE_BY_HELD.flatMap((base) => POINTER_TYPES.map((pointerType) => ({ ...base, pointerType })));

function moveViolations(inputs: readonly StageMoveInput[], predicate: (input: StageMoveInput, action: StageMoveAction) => boolean): readonly string[] {
  return inputs.filter((input) => !predicate(input, routeStageMove(input))).map((input) => JSON.stringify(input));
}

describe("routeStageMove: 全組み合わせ", () => {
  it("48 通りを走査している", () => {
    expect(ALL_MOVE_INPUTS).toHaveLength(48);
  });

  it("enabled でなければ ignore", () => {
    const targets = ALL_MOVE_INPUTS.filter((input) => !input.enabled);
    expect(moveViolations(targets, (_input, action) => action === "ignore")).toEqual([]);
  });

  it("マウス/ペンは enabled なら dragging・held・holding によらず follow", () => {
    const targets = ALL_MOVE_INPUTS.filter((input) => input.enabled && input.pointerType !== "touch");
    expect(targets).toHaveLength(16);
    expect(moveViolations(targets, (_input, action) => action === "follow")).toEqual([]);
  });

  it("タッチ・ドラッグ中は drag(held・holding によらない)", () => {
    const targets = ALL_MOVE_INPUTS.filter((input) => input.enabled && input.pointerType === "touch" && input.dragging);
    expect(targets).toHaveLength(4);
    expect(moveViolations(targets, (_input, action) => action === "drag")).toEqual([]);
  });

  it("タッチ・ドラッグ中でなく held かつ holding でない最初の move は drag-start", () => {
    const targets = ALL_MOVE_INPUTS.filter((input) => input.enabled && input.pointerType === "touch" && !input.dragging && input.held && !input.holding);
    expect(targets).toHaveLength(1);
    expect(moveViolations(targets, (_input, action) => action === "drag-start")).toEqual([]);
  });

  it("タッチ・ドラッグ中でなく、holding 中、または held でなければ ignore", () => {
    const targets = ALL_MOVE_INPUTS.filter((input) => input.enabled && input.pointerType === "touch" && !input.dragging && (input.holding || !input.held));
    expect(targets).toHaveLength(3);
    expect(moveViolations(targets, (_input, action) => action === "ignore")).toEqual([]);
  });

  it("holding 中のタッチは、ドラッグ中でない限り drag-start / follow にならない", () => {
    const targets = ALL_MOVE_INPUTS.filter((input) => input.holding && input.pointerType === "touch" && !input.dragging);
    expect(moveViolations(targets, (_input, action) => action === "ignore")).toEqual([]);
  });

  it("戻り値は常に 4 種のいずれか", () => {
    expect(moveViolations(ALL_MOVE_INPUTS, (_input, action) => MOVE_ACTIONS.includes(action))).toEqual([]);
  });

  it("pointerType が touch 以外の未知の値はマウス/ペンと同じ(follow)", () => {
    expect(routeStageMove({ holding: false, enabled: true, pointerType: "", dragging: false, held: true })).toBe("follow");
  });
});

// routeStageRelease の全 3×2×2×2×2 = 48 通り。
const RELEASE_BY_TYPE = POINTER_TYPES.map((pointerType) => ({ pointerType }));
const RELEASE_BY_CANDIDATE = RELEASE_BY_TYPE.flatMap((base) => BOOLS.map((tapCandidate) => ({ ...base, tapCandidate })));
const RELEASE_BY_OK = RELEASE_BY_CANDIDATE.flatMap((base) => BOOLS.map((tapOk) => ({ ...base, tapOk })));
const RELEASE_BY_HOLDING = RELEASE_BY_OK.flatMap((base) => BOOLS.map((holding) => ({ ...base, holding })));
const ALL_RELEASE_INPUTS: readonly StageReleaseInput[] = RELEASE_BY_HOLDING.flatMap((base) => BOOLS.map((enabled) => ({ ...base, enabled })));

describe("routeStageRelease: 全組み合わせ", () => {
  it("48 通りを走査している", () => {
    expect(ALL_RELEASE_INPUTS).toHaveLength(48);
  });

  it("swing-here になるのは、タッチ・タップ候補・tapOk・enabled・holding でない、の全てが揃う 1 通りだけ", () => {
    const hits = ALL_RELEASE_INPUTS.filter((input) => routeStageRelease(input) === "swing-here");
    expect(hits).toEqual([{ pointerType: "touch", tapCandidate: true, tapOk: true, holding: false, enabled: true }]);
  });

  it("それ以外(ドラッグした・長押し・スキップに使った指・マウス/ペン・演出中・打撃中でない)は none", () => {
    const others = ALL_RELEASE_INPUTS.filter(
      (input) => !(input.pointerType === "touch" && input.tapCandidate && input.tapOk && !input.holding && input.enabled),
    );
    expect(others).toHaveLength(47);
    expect(others.every((input) => routeStageRelease(input) === "none")).toBe(true);
  });
});

describe("isTapGesture", () => {
  const base = { downTimeStamp: 1000, upTimeStamp: 1100, movedPx: 4 };

  it("持続 ≤ 180ms かつ移動 ≤ 10px ならタップ(180ms ちょうど・10px ちょうどを含む)", () => {
    expect(isTapGesture(base)).toBe(true);
    expect(isTapGesture({ ...base, upTimeStamp: base.downTimeStamp + TAP_MAX_DURATION_MS })).toBe(true);
    expect(isTapGesture({ ...base, movedPx: TAP_MAX_MOVE_PX })).toBe(true);
    expect(isTapGesture({ ...base, upTimeStamp: base.downTimeStamp, movedPx: 0 })).toBe(true);
  });

  it("定数は設計どおり(180ms・10px・到達通知の保留 200ms)", () => {
    expect([TAP_MAX_DURATION_MS, TAP_MAX_MOVE_PX, TAP_ARRIVAL_HOLD_MS]).toEqual([180, 10, 200]);
  });

  it("持続が 180ms を超える(長押し)と偽", () => {
    expect(isTapGesture({ ...base, upTimeStamp: base.downTimeStamp + TAP_MAX_DURATION_MS + 1 })).toBe(false);
    expect(isTapGesture({ ...base, upTimeStamp: base.downTimeStamp + TAP_MAX_DURATION_MS + 0.001 })).toBe(false);
  });

  it("移動が 10px を超える(ドラッグ)と偽", () => {
    expect(isTapGesture({ ...base, movedPx: TAP_MAX_MOVE_PX + 0.001 })).toBe(false);
    expect(isTapGesture({ ...base, movedPx: 40 })).toBe(false);
  });

  it("持続が負・NaN、移動が NaN は偽(不正な入力でスイングを起こさない)", () => {
    expect(isTapGesture({ ...base, upTimeStamp: base.downTimeStamp - 1 })).toBe(false);
    expect(isTapGesture({ ...base, upTimeStamp: Number.NaN })).toBe(false);
    expect(isTapGesture({ ...base, movedPx: Number.NaN })).toBe(false);
  });

  it("時間は 2 つのイベントの timeStamp の差で測る(絶対値が大きくても同じ)", () => {
    const epoch = 1.7e12;
    expect(isTapGesture({ downTimeStamp: epoch, upTimeStamp: epoch + 150, movedPx: 2 })).toBe(true);
    expect(isTapGesture({ downTimeStamp: epoch, upTimeStamp: epoch + 181, movedPx: 2 })).toBe(false);
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
