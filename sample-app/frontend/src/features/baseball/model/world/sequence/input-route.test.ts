import { describe, expect, it } from "vitest";
import type { IgnoredInputReason } from "../../../types/batting";
import { arrivalDue, holdArrival } from "./arrival";
import {
  isSkipKey,
  isTapGesture,
  routeStageMove,
  routeStagePointer,
  routeStageRelease,
  tapReleaseReason,
  TAP_ARRIVAL_HOLD_MS,
  TAP_MAX_DURATION_MS,
  TAP_MAX_MOVE_PX,
  type SkipKeyInput,
  type StageMoveAction,
  type StageMoveInput,
  type StagePointerAction,
  type StagePointerInput,
  type StageReleaseInput,
  type TapReleaseInput,
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

describe("入力の境界(A4 の強化): タッチの 1 本目・2 本目の指", () => {
  it("(1) 2 本目以降の指は、全組み合わせで swing-here / ignore のみ(skip・drag-start・swing にならない)", () => {
    const targets = ALL_POINTER_INPUTS.filter(isSecondaryTouch);
    expect(targets.length).toBeGreaterThan(0);
    expect(violations(targets, (_input, action) => action === "swing-here" || action === "ignore")).toEqual([]);
  });

  it("(2) holding で真のタッチの 1 本目の指は、button・enabled・swingReady によらず必ず skip", () => {
    const targets = ALL_POINTER_INPUTS.filter((input) => input.holding && input.pointerType === "touch" && input.isPrimary);
    expect(targets).toHaveLength(12);
    expect(violations(targets, (_input, action) => action === "skip")).toEqual([]);
  });

  it("(2) holding で真のタッチの 2 本目以降の指は skip にならない(スキップに使うのは 1 本目だけ)", () => {
    const targets = ALL_POINTER_INPUTS.filter((input) => input.holding && isSecondaryTouch(input));
    expect(targets.length).toBeGreaterThan(0);
    expect(violations(targets, (_input, action) => action === "ignore")).toEqual([]);
  });

  it("(3) holding でなく enabled のタッチの 1 本目は、swingReady・button によらず必ず drag-start", () => {
    const targets = ALL_POINTER_INPUTS.filter((input) => !input.holding && input.enabled && input.pointerType === "touch" && input.isPrimary);
    expect(targets).toHaveLength(6);
    expect(violations(targets, (_input, action) => action === "drag-start")).toEqual([]);
  });
});

describe("入力の境界(A4 の強化): isTapGesture", () => {
  const base = { downTimeStamp: 2000, upTimeStamp: 2100, movedPx: 0 };
  const at = (ms: number): boolean => isTapGesture({ ...base, upTimeStamp: base.downTimeStamp + ms });

  it("(5) 持続: 179ms・180ms ちょうどは真、181ms は偽", () => {
    expect([at(179), at(TAP_MAX_DURATION_MS), at(181)]).toEqual([true, true, false]);
  });

  it("(5) 持続: 0ms は真、負は偽", () => {
    expect([at(0), at(-0.001), at(-1)]).toEqual([true, false, false]);
  });

  it("(5) 持続: NaN・無限大は偽(押下・離しのどちらが不正でも)", () => {
    const results = [
      isTapGesture({ ...base, upTimeStamp: Number.NaN }),
      isTapGesture({ ...base, downTimeStamp: Number.NaN }),
      isTapGesture({ ...base, upTimeStamp: Number.POSITIVE_INFINITY }),
      isTapGesture({ ...base, downTimeStamp: Number.NEGATIVE_INFINITY }),
    ];
    expect(results).toEqual([false, false, false, false]);
  });

  it("(5) 移動: 10px ちょうどは真、10.01px は偽、NaN・無限大は偽", () => {
    const moved = (movedPx: number): boolean => isTapGesture({ ...base, movedPx });
    expect([moved(TAP_MAX_MOVE_PX), moved(10.01), moved(Number.NaN), moved(Number.POSITIVE_INFINITY)]).toEqual([true, false, false, false]);
  });

  it("(5) 持続と移動の両方が境界ちょうどなら真、どちらか一方が境界を超えれば偽", () => {
    const edge = { downTimeStamp: 0, upTimeStamp: TAP_MAX_DURATION_MS, movedPx: TAP_MAX_MOVE_PX };
    expect(isTapGesture(edge)).toBe(true);
    expect(isTapGesture({ ...edge, upTimeStamp: 181 })).toBe(false);
    expect(isTapGesture({ ...edge, movedPx: 10.01 })).toBe(false);
  });
});

describe("入力の境界(A4 の強化): 離しの振り分け", () => {
  it("(4) スキップに使った指(タップ候補でない)の離しは、tapOk・enabled が真でも none", () => {
    const skipFinger: StageReleaseInput = { pointerType: "touch", tapCandidate: false, tapOk: true, holding: false, enabled: true };
    expect(routeStageRelease(skipFinger)).toBe("none");
  });

  it("(7) マウス/ペン/未知の pointerType の離しは、他の条件が全て揃っていても none", () => {
    const targets = ["mouse", "pen", ""].map((pointerType) => ({ pointerType, tapCandidate: true, tapOk: true, holding: false, enabled: true }));
    expect(targets.map(routeStageRelease)).toEqual(["none", "none", "none"]);
  });
});

// tapReleaseReason の全 3×2×2×2×2×2×4×4 = 1536 通り(押下 2000ms 固定。持続 0/180/181/NaN × 移動 0/10/10.01/NaN)。
const DOWN_AT = 2000;
const DURATION_UPS: readonly number[] = [DOWN_AT, DOWN_AT + TAP_MAX_DURATION_MS, DOWN_AT + TAP_MAX_DURATION_MS + 1, Number.NaN];
const MOVES: readonly number[] = [0, TAP_MAX_MOVE_PX, 10.01, Number.NaN];
const REASON_BY_TYPE = POINTER_TYPES.map((pointerType) => ({ pointerType }));
const REASON_BY_CANCEL = REASON_BY_TYPE.flatMap((base) => BOOLS.map((cancelled) => ({ ...base, cancelled })));
const REASON_BY_HELD = REASON_BY_CANCEL.flatMap((base) => BOOLS.map((held) => ({ ...base, held })));
const REASON_BY_CANDIDATE = REASON_BY_HELD.flatMap((base) => BOOLS.map((tapCandidate) => ({ ...base, tapCandidate })));
const REASON_BY_HOLDING = REASON_BY_CANDIDATE.flatMap((base) => BOOLS.map((holding) => ({ ...base, holding })));
const REASON_BY_ENABLED = REASON_BY_HOLDING.flatMap((base) => BOOLS.map((enabled) => ({ ...base, enabled })));
const REASON_BY_UP = REASON_BY_ENABLED.flatMap((base) => DURATION_UPS.map((upTimeStamp) => ({ ...base, downTimeStamp: DOWN_AT, upTimeStamp })));
const ALL_REASON_INPUTS: readonly TapReleaseInput[] = REASON_BY_UP.flatMap((base) => MOVES.map((movedPx) => ({ ...base, movedPx })));

const SIX_REASONS: readonly IgnoredInputReason[] = ["not-ready", "holding", "tap-too-long", "tap-moved", "cancel", "held-release"];

/** 同じ入力を `routeStageRelease` に渡したときの振り分け。 */
function releaseActionOf(input: TapReleaseInput): ReturnType<typeof routeStageRelease> {
  return routeStageRelease({
    pointerType: input.pointerType,
    tapCandidate: input.tapCandidate,
    tapOk: isTapGesture(input),
    holding: input.holding,
    enabled: input.enabled,
  });
}

function reasonViolations(
  inputs: readonly TapReleaseInput[],
  predicate: (input: TapReleaseInput, reason: IgnoredInputReason | null) => boolean,
): readonly string[] {
  return inputs.filter((input) => !predicate(input, tapReleaseReason(input))).map((input) => JSON.stringify(input));
}

const TOUCH_REASON_INPUTS = ALL_REASON_INPUTS.filter((input) => input.pointerType === "touch");

describe("tapReleaseReason: 全組み合わせ", () => {
  const base: TapReleaseInput = {
    pointerType: "touch",
    cancelled: false,
    held: false,
    tapCandidate: true,
    downTimeStamp: DOWN_AT,
    upTimeStamp: DOWN_AT + 100,
    movedPx: 3,
    holding: false,
    enabled: true,
  };

  it("1536 通りを走査している", () => {
    expect(ALL_REASON_INPUTS).toHaveLength(1536);
  });

  it("(8) 全入力で定義される(例外を投げず、undefined を返さず、null か 6 つの理由のいずれか)", () => {
    expect(reasonViolations(ALL_REASON_INPUTS, (_input, reason) => reason === null || SIX_REASONS.includes(reason))).toEqual([]);
  });

  it("(8) タッチで理由なし(null)になるのは、routeStageRelease が swing-here になる入力だけ(閾値のずれがない)", () => {
    const comparable = TOUCH_REASON_INPUTS.filter((input) => !input.cancelled && !input.held);
    expect(comparable.length).toBeGreaterThan(0);
    expect(reasonViolations(comparable, (input, reason) => (reason === null) === (releaseActionOf(input) === "swing-here"))).toEqual([]);
  });

  it("(8) タッチで routeStageRelease が none になる入力は、必ず理由を持つ(黙って無効にならない)", () => {
    const ignored = TOUCH_REASON_INPUTS.filter((input) => releaseActionOf(input) === "none");
    expect(ignored.length).toBeGreaterThan(0);
    expect(reasonViolations(ignored, (_input, reason) => reason !== null)).toEqual([]);
  });

  it("(7) マウス/ペン/未知の pointerType は全組み合わせで理由なし(押下でスイングするので離しは無視された入力ではない)", () => {
    const mouseLike = ALL_REASON_INPUTS.filter((input) => input.pointerType !== "touch");
    expect(mouseLike).toHaveLength(1024);
    expect(reasonViolations(mouseLike, (_input, reason) => reason === null)).toEqual([]);
  });

  it("6 つの理由が全て出る", () => {
    const seen = new Set(TOUCH_REASON_INPUTS.map(tapReleaseReason));
    expect(SIX_REASONS.every((reason) => seen.has(reason))).toBe(true);
    expect(seen.has(null)).toBe(true);
  });

  it("(4) スキップに使った指の離しは、キャンセルでなければ必ず held-release(他の条件によらない)", () => {
    const targets = TOUCH_REASON_INPUTS.filter((input) => input.held && !input.cancelled);
    expect(targets.length).toBeGreaterThan(0);
    expect(reasonViolations(targets, (_input, reason) => reason === "held-release")).toEqual([]);
  });

  it("pointercancel は他の条件によらず cancel", () => {
    const targets = TOUCH_REASON_INPUTS.filter((input) => input.cancelled);
    expect(reasonViolations(targets, (_input, reason) => reason === "cancel")).toEqual([]);
  });

  it("離した時点で演出中(キャンセル・スキップの指でない)なら holding", () => {
    const targets = TOUCH_REASON_INPUTS.filter((input) => input.holding && !input.cancelled && !input.held);
    expect(reasonViolations(targets, (_input, reason) => reason === "holding")).toEqual([]);
  });

  it("(6) 押下が到達の後(タップ候補でない)の離しは not-ready(持続・移動によらない)", () => {
    const targets = TOUCH_REASON_INPUTS.filter((input) => !input.tapCandidate && !input.cancelled && !input.held && !input.holding);
    expect(targets.length).toBeGreaterThan(0);
    expect(reasonViolations(targets, (_input, reason) => reason === "not-ready")).toEqual([]);
  });

  it("打撃中でない(enabled が偽)の離しも not-ready", () => {
    expect(tapReleaseReason({ ...base, enabled: false })).toBe("not-ready");
  });

  it("タップ候補で持続・移動が境界内なら理由なし(180ms・10px ちょうどを含む)", () => {
    const edge = { ...base, upTimeStamp: DOWN_AT + TAP_MAX_DURATION_MS, movedPx: TAP_MAX_MOVE_PX };
    expect([tapReleaseReason(base), tapReleaseReason(edge)]).toEqual([null, null]);
  });

  it("持続 181ms は tap-too-long、移動 10.01px は tap-moved", () => {
    const longHold = { ...base, upTimeStamp: DOWN_AT + TAP_MAX_DURATION_MS + 1 };
    const dragged = { ...base, movedPx: 10.01 };
    expect([tapReleaseReason(longHold), tapReleaseReason(dragged)]).toEqual(["tap-too-long", "tap-moved"]);
  });

  it("持続が負・NaN は tap-too-long、移動が NaN は tap-moved(不正な入力はスイングにならず理由が付く)", () => {
    const negative = tapReleaseReason({ ...base, upTimeStamp: DOWN_AT - 1 });
    const nanDuration = tapReleaseReason({ ...base, upTimeStamp: Number.NaN });
    const nanMove = tapReleaseReason({ ...base, movedPx: Number.NaN });
    expect([negative, nanDuration, nanMove]).toEqual(["tap-too-long", "tap-too-long", "tap-moved"]);
  });

  it("長押しかつ移動が両方超過なら tap-moved を優先する", () => {
    expect(tapReleaseReason({ ...base, upTimeStamp: DOWN_AT + 500, movedPx: 40 })).toBe("tap-moved");
  });
});

describe("到達の前後の押下(A4 完了条件 6。arrival.ts と組み合わせた経路)", () => {
  const SEQ = 3;
  const ARRIVE_AT = 800;
  const NOW = 5000;
  const touchDown = { holding: false, enabled: true, pointerType: "touch", isPrimary: true, button: 0 };
  const release: TapReleaseInput = {
    pointerType: "touch",
    cancelled: false,
    held: false,
    tapCandidate: true,
    downTimeStamp: DOWN_AT,
    upTimeStamp: DOWN_AT + 150,
    movedPx: 2,
    holding: false,
    enabled: true,
  };

  it("到達の前の押下: タップ候補になり、保留(≤ 200ms)の内に離せば swing-here(押下の時刻で判定する経路)で、保留中は到達通知が出ない", () => {
    expect(routeStagePointer({ ...touchDown, swingReady: true })).toBe("drag-start");
    const hold = holdArrival({ seq: SEQ, nowMs: NOW, ms: TAP_ARRIVAL_HOLD_MS });
    const upAfter = 150;
    expect(arrivalDue({ elapsedMs: ARRIVE_AT + upAfter, arriveAtMs: ARRIVE_AT, hold, seq: SEQ, nowMs: NOW + upAfter })).toBe(false);
    expect(releaseActionOf(release)).toBe("swing-here");
    expect(tapReleaseReason(release)).toBeNull();
    expect(arrivalDue({ elapsedMs: ARRIVE_AT + upAfter, arriveAtMs: ARRIVE_AT, hold: null, seq: SEQ, nowMs: NOW + upAfter })).toBe(true);
  });

  it("到達の前の押下でも、離しが 180ms を超えれば(保留 200ms 内でも)スイングにならず tap-too-long", () => {
    const slow = { ...release, upTimeStamp: DOWN_AT + TAP_MAX_DURATION_MS + 1 };
    expect(TAP_MAX_DURATION_MS + 1).toBeLessThan(TAP_ARRIVAL_HOLD_MS);
    expect(releaseActionOf(slow)).toBe("none");
    expect(tapReleaseReason(slow)).toBe("tap-too-long");
  });

  it("到達の後の押下(swingReady が偽): 振り分けは drag-start のまま、タップ候補にならず、離しは none で not-ready(空振りにならない)", () => {
    expect(routeStagePointer({ ...touchDown, swingReady: false })).toBe("drag-start");
    const late = { ...release, tapCandidate: false, upTimeStamp: DOWN_AT + 60 };
    expect(releaseActionOf(late)).toBe("none");
    expect(tapReleaseReason(late)).toBe("not-ready");
  });
});
