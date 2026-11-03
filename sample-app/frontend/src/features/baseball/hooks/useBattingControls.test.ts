import { describe, expect, it } from "vitest";
import { shouldRecenterCursor } from "./useBattingControls";

// 投球ごとの素のカーソルの再センタリング(タップだけでも打てるようにする救済)。前の球の着弾点にカーソルが残ると、ふつうでも空振り 32%・安打 13% で、中央より悪い。
// 戻してよいかの判断は純関数 `shouldRecenterCursor`。指を置いてドラッグ中のときは戻さない(押しっぱなしの指の追従を壊さない)。

describe("shouldRecenterCursor", () => {
  it("指を離している(タッチ)なら戻す", () => {
    expect(shouldRecenterCursor({ touchesDown: 0, lastPointerType: "touch" })).toBe(true);
  });

  it("まだ何も操作していない・キーボードだけなら戻す", () => {
    expect(shouldRecenterCursor({ touchesDown: 0, lastPointerType: null })).toBe(true);
  });

  it("タッチの指を置いている間(ドラッグ中・押しっぱなし)は戻さない", () => {
    expect(shouldRecenterCursor({ touchesDown: 1, lastPointerType: "touch" })).toBe(false);
    expect(shouldRecenterCursor({ touchesDown: 2, lastPointerType: "touch" })).toBe(false);
  });

  it("マウス/ペンは絶対位置追従なので戻さない(戻すと見えるカーソルとポインタの位置が食い違う)", () => {
    expect(shouldRecenterCursor({ touchesDown: 0, lastPointerType: "mouse" })).toBe(false);
    expect(shouldRecenterCursor({ touchesDown: 0, lastPointerType: "pen" })).toBe(false);
  });
});
