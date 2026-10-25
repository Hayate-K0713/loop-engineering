import { describe, expect, it } from "vitest";
import type { ZonePoint } from "../../../types/common";
import type { ScreenRect } from "../../../types/stage";
import { BATTING_PARAMS } from "../../batting/params";
import { clampCursorToView } from "./cursor-bounds";
import { WORLD_PARAMS } from "./params";

const LIMIT = BATTING_PARAMS.cursorLimit;
const MARGIN = WORLD_PARAMS.input.edgeMarginPx;

// 設計書「ビューポート別の構図」の値(CSS px)。
const PORTRAIT_844: ScreenRect = { left: 192, top: 384, width: 154, height: 175 };
const PORTRAIT_664: ScreenRect = { left: 193, top: 338, width: 123, height: 140 };
const DESKTOP: ScreenRect = { left: 549.5, top: 255, width: 181, height: 209 };

/** ゾーン座標 → 画面座標(CSS px。y は下向きが正)。 */
function toScreenX(point: ZonePoint, rect: ScreenRect): number {
  return rect.left + rect.width / 2 + (point.x * rect.width) / 2;
}

function toScreenY(point: ZonePoint, rect: ScreenRect): number {
  return rect.top + rect.height / 2 - (point.y * rect.height) / 2;
}

describe("clampCursorToView: 左右", () => {
  it("390×844 の打撃(ゾーン x 192〜346)で、右端は画面端から edgeMarginPx 内側(ゾーン座標 +1.46 付近)", () => {
    const clamped = clampCursorToView({ x: LIMIT, y: 0 }, PORTRAIT_844, 390);
    expect(toScreenX(clamped, PORTRAIT_844)).toBeCloseTo(390 - MARGIN, 9);
    expect(clamped.x).toBeGreaterThan(1.44);
    expect(clamped.x).toBeLessThan(1.49);
    expect(clamped.y).toBeCloseTo(0, 12);
  });

  it("390×844 の打撃で、左は従来どおり −cursorLimit(画面端まで十分な余白がある)", () => {
    expect(clampCursorToView({ x: -LIMIT, y: 0 }, PORTRAIT_844, 390).x).toBeCloseTo(-LIMIT, 12);
    expect(clampCursorToView({ x: -5, y: 0 }, PORTRAIT_844, 390).x).toBeCloseTo(-LIMIT, 12);
  });

  it("狙いのセルの外角(+1.33)は制限されない(画面端から 8px 内側より内)", () => {
    const point = { x: 1.33, y: 0 };
    expect(clampCursorToView(point, PORTRAIT_844, 390)).toEqual(point);
  });

  it("デスクトップ(ゾーンが画面中央)では ±cursorLimit のまま", () => {
    const right = clampCursorToView({ x: LIMIT, y: 0 }, DESKTOP, 1280);
    const left = clampCursorToView({ x: -LIMIT, y: 0 }, DESKTOP, 1280);
    expect([right.x, left.x]).toEqual([LIMIT, -LIMIT]);
    expect(clampCursorToView({ x: 9, y: -9 }, DESKTOP, 1280)).toEqual({ x: LIMIT, y: -LIMIT });
  });

  it("左に寄ったゾーンでは左端が画面端から edgeMarginPx 内側で止まる", () => {
    const rect: ScreenRect = { left: 0, top: 100, width: 100, height: 100 };
    const clamped = clampCursorToView({ x: -LIMIT, y: 0 }, rect, 400);
    expect(toScreenX(clamped, rect)).toBeCloseTo(MARGIN, 9);
  });

  it("範囲内の入力は変えない", () => {
    const inputs: readonly ZonePoint[] = [
      { x: 0, y: 0 },
      { x: -1, y: 1 },
      { x: 1.4, y: -1.2 },
      { x: -1.8, y: 1.8 },
    ];
    for (const point of inputs) {
      expect(clampCursorToView(point, PORTRAIT_844, 390)).toEqual(point);
    }
  });
});

describe("clampCursorToView: 下(空き領域の下端の内側。レビュー m2)", () => {
  it("下端が省略または null のときは縦方向を ±cursorLimit にだけ制限する", () => {
    expect(clampCursorToView({ x: 0, y: -LIMIT }, PORTRAIT_664, 390)).toEqual({ x: 0, y: -LIMIT });
    expect(clampCursorToView({ x: 0, y: -LIMIT }, PORTRAIT_664, 390, null)).toEqual({ x: 0, y: -LIMIT });
    expect(clampCursorToView({ x: 0, y: -9 }, PORTRAIT_664, 390, null).y).toBeCloseTo(-LIMIT, 12);
  });

  it("390×664 の打撃(下のオーバーレイの上端 y=483)で、ゾーン座標 −1.8 のカーソルがオーバーレイの上に戻る", () => {
    const freeBottom = 664 - 181;
    const free = clampCursorToView({ x: 0, y: -LIMIT }, PORTRAIT_664, 390, freeBottom);
    expect(toScreenY({ x: 0, y: -LIMIT }, PORTRAIT_664)).toBeGreaterThan(freeBottom);
    expect(toScreenY(free, PORTRAIT_664)).toBeLessThanOrEqual(freeBottom);
  });

  it("ゾーン枠の下端(y = −1)には必ず届く(下端の内側 edgeMarginPx より枠の下端が低くても)", () => {
    const freeBottom = PORTRAIT_664.top + PORTRAIT_664.height + 3;
    const clamped = clampCursorToView({ x: 0, y: -LIMIT }, PORTRAIT_664, 390, freeBottom);
    expect(clamped.y).toBeCloseTo(-1, 12);
  });

  it("下端が十分低い(390×844 の打撃、y=663)なら下は −cursorLimit のまま", () => {
    const clamped = clampCursorToView({ x: 0, y: -LIMIT }, PORTRAIT_844, 390, 844 - 181);
    expect(clamped.y).toBeCloseTo(-LIMIT, 12);
  });

  it("下端が −1 と −cursorLimit の間の高さにあるときは、下端から edgeMarginPx 内側で止まる", () => {
    const rect: ScreenRect = { left: 100, top: 100, width: 100, height: 100 };
    const freeBottom = 230;
    const clamped = clampCursorToView({ x: 0, y: -LIMIT }, rect, 400, freeBottom);
    expect(toScreenY(clamped, rect)).toBeCloseTo(freeBottom - MARGIN, 9);
    expect(clamped.y).toBeGreaterThan(-LIMIT);
    expect(clamped.y).toBeLessThan(-1);
  });

  it("上方向は下端によらず +cursorLimit まで", () => {
    expect(clampCursorToView({ x: 0, y: 9 }, PORTRAIT_664, 390, 483).y).toBeCloseTo(LIMIT, 12);
  });

  it("下端が有限でない値(NaN)なら縦の制限なし", () => {
    expect(clampCursorToView({ x: 0, y: -LIMIT }, PORTRAIT_664, 390, Number.NaN)).toEqual({ x: 0, y: -LIMIT });
  });
});

describe("clampCursorToView: 異常な入力", () => {
  it("ゾーン矩形が潰れている・画面幅が正でないときは ±cursorLimit だけを適用する", () => {
    const flat: ScreenRect = { left: 0, top: 0, width: 0, height: 100 };
    expect(clampCursorToView({ x: 9, y: -9 }, flat, 390)).toEqual({ x: LIMIT, y: -LIMIT });
    expect(clampCursorToView({ x: 0.5, y: 0.5 }, PORTRAIT_844, 0)).toEqual({ x: 0.5, y: 0.5 });
    expect(clampCursorToView({ x: 9, y: 9 }, PORTRAIT_844, Number.NaN)).toEqual({ x: LIMIT, y: LIMIT });
  });

  it("画面が狭すぎて範囲が空のときも有限の値(中点)を返す", () => {
    const rect: ScreenRect = { left: 0, top: 0, width: 100, height: 100 };
    const clamped = clampCursorToView({ x: 1, y: 0 }, rect, 10);
    expect(Number.isFinite(clamped.x)).toBe(true);
    expect(toScreenX(clamped, rect)).toBeCloseTo(5, 9);
  });

  it("入力を変更しない", () => {
    const point: ZonePoint = { x: 9, y: -9 };
    clampCursorToView(point, PORTRAIT_844, 390, 400);
    expect(point).toEqual({ x: 9, y: -9 });
  });
});
