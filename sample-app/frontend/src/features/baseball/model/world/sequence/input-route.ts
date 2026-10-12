// ステージ入力面の入力の振り分け(純関数)。演出のスキップ(N14)とスイング・ドラッグが衝突しないことを、判定表の全組み合わせのテストで保証する。
// hooks はこの戻り値で分岐するだけで、`holding` を自分で見て分岐しない。

/** pointerdown の振り分け結果。`swing` は「カーソルをその位置へ移動してスイングを試みる」(可否は呼び出し先が `swingReady` で判定)。 */
export type StagePointerAction = "skip" | "swing" | "drag-start" | "ignore";

export type StagePointerInput = {
  /** 演出中(`isHolding`)。真なら主ポインタ操作は常にスキップ。 */
  readonly holding: boolean;
  /** 人間打撃中(入力面でカーソル操作を受け付ける)。 */
  readonly enabled: boolean;
  /** スイングできる状態。振り分けには使わない(`holding` と同時に真になっても `holding` を優先する)。 */
  readonly swingReady: boolean;
  /** `PointerEvent.pointerType` をそのまま渡す(`"mouse"`・`"pen"`・`"touch"` 以外は、マウス/ペンと同じ扱い)。 */
  readonly pointerType: string;
  readonly isPrimary: boolean;
  readonly button: number;
};

/** 主ポインタ操作か。マウス/ペンは `isPrimary` かつ `button === 0`、タッチは `isPrimary` のみ(`button` は見ない)。 */
function isPrimaryAction(input: StagePointerInput): boolean {
  return input.pointerType === "touch" ? input.isPrimary : input.isPrimary && input.button === 0;
}

/**
 * 入力面の pointerdown の振り分け。優先順位:
 * 1. 主ポインタ操作でなければ `ignore`(`holding` によらない)。
 * 2. `holding` なら `skip`(`enabled`・`swingReady` によらない)。
 * 3. 人間打撃中でなければ `ignore`。
 * 4. タッチは `drag-start`、マウス/ペンは `swing`。
 */
export function routeStagePointer(input: StagePointerInput): StagePointerAction {
  if (!isPrimaryAction(input)) {
    return "ignore";
  }
  if (input.holding) {
    return "skip";
  }
  if (!input.enabled) {
    return "ignore";
  }
  return input.pointerType === "touch" ? "drag-start" : "swing";
}

export type SkipKeyInput = {
  readonly holding: boolean;
  /** `KeyboardEvent.key`。 */
  readonly key: string;
  readonly repeat: boolean;
  /** `event.target.tagName`(要素でなければ空文字)。大文字・小文字は区別しない。 */
  readonly targetTag: string;
};

const SKIP_KEYS: readonly string[] = [" ", "Enter"];

/** スキップにしない入力先(リンクの決定・選択肢・文字入力にキーを譲る)。 */
const NON_SKIP_TARGETS: readonly string[] = ["A", "SELECT", "INPUT", "TEXTAREA"];

/** Space/Enter の keydown がスキップか。`holding` 中の最初の1回(`repeat` でない)で、入力先がリンク・select・input・textarea でないとき真。 */
export function isSkipKey(input: SkipKeyInput): boolean {
  return input.holding && !input.repeat && SKIP_KEYS.includes(input.key) && !NON_SKIP_TARGETS.includes(input.targetTag.toUpperCase());
}
