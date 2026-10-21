import { describe, expect, it } from "vitest";
import type { BatterProfile } from "../../types/team";
import { PITCH_PARAMS } from "../pitch/params";
import { INITIAL_CURSOR, clampCursor, clientToZonePoint, cursorRadii, moveCursor } from "./cursor";
import { BATTING_PARAMS } from "./params";

function batterWith(meet: number): BatterProfile {
  return { id: "b", name: "テスト打者", meet, power: 50, trajectory: 2 };
}

describe("INITIAL_CURSOR", () => {
  it("ゾーン中心", () => {
    expect(INITIAL_CURSOR).toEqual({ x: 0, y: 0 });
  });
});

describe("clampCursor", () => {
  const limit = BATTING_PARAMS.cursorLimit;

  it("範囲内はそのまま", () => {
    expect(clampCursor({ x: 0.5, y: -0.7 })).toEqual({ x: 0.5, y: -0.7 });
  });

  it("±cursorLimit に収める(x・y 独立)", () => {
    expect(clampCursor({ x: 10, y: -10 })).toEqual({ x: limit, y: -limit });
    expect(clampCursor({ x: -10, y: 0.2 })).toEqual({ x: -limit, y: 0.2 });
  });

  it("境界ちょうどは変わらない", () => {
    expect(clampCursor({ x: limit, y: -limit })).toEqual({ x: limit, y: -limit });
  });
});

describe("moveCursor", () => {
  it("押下方向 × keyboardSpeed × 経過時間だけ動く(y は上が正)", () => {
    const moved = moveCursor(INITIAL_CURSOR, { x: 1, y: 1 }, 100);
    const expected = (BATTING_PARAMS.keyboardSpeed * 100) / 1000;
    expect(moved.x).toBeCloseTo(expected, 12);
    expect(moved.y).toBeCloseTo(expected, 12);
  });

  it("負の方向へも動く", () => {
    const moved = moveCursor({ x: 0.5, y: 0.5 }, { x: -1, y: -1 }, 100);
    expect(moved.x).toBeLessThan(0.5);
    expect(moved.y).toBeLessThan(0.5);
  });

  it("方向が 0 なら動かない", () => {
    expect(moveCursor({ x: 0.3, y: -0.4 }, { x: 0, y: 0 }, 500)).toEqual({ x: 0.3, y: -0.4 });
  });

  it("経過時間が長くても cursorLimit を超えない", () => {
    const limit = BATTING_PARAMS.cursorLimit;
    expect(moveCursor(INITIAL_CURSOR, { x: 1, y: -1 }, 60_000)).toEqual({ x: limit, y: -limit });
  });

  it("経過時間 0 なら動かない", () => {
    expect(moveCursor({ x: 0.1, y: 0.2 }, { x: 1, y: 1 }, 0)).toEqual({ x: 0.1, y: 0.2 });
  });
});

describe("clientToZonePoint", () => {
  const rect = { left: 100, top: 50, width: 400, height: 200 };
  const half = PITCH_PARAMS.viewHalfExtent;

  it("矩形の中心は (0, 0)", () => {
    expect(clientToZonePoint({ x: 300, y: 150 }, rect)).toEqual({ x: 0, y: 0 });
  });

  it("左上隅は (-viewHalfExtent, +viewHalfExtent)(y 反転)", () => {
    expect(clientToZonePoint({ x: 100, y: 50 }, rect)).toEqual({ x: -half, y: half });
  });

  it("右下隅は (+viewHalfExtent, -viewHalfExtent)", () => {
    expect(clientToZonePoint({ x: 500, y: 250 }, rect)).toEqual({ x: half, y: -half });
  });

  it("矩形内は線形に対応する(右端と中心の中間は半幅の半分)", () => {
    const point = clientToZonePoint({ x: 400, y: 100 }, rect);
    expect(point.x).toBeCloseTo(half / 2, 12);
    expect(point.y).toBeCloseTo(half / 2, 12);
  });

  it("矩形の外は ±viewHalfExtent にクランプされる", () => {
    expect(clientToZonePoint({ x: -1000, y: 5000 }, rect)).toEqual({ x: -half, y: -half });
    expect(clientToZonePoint({ x: 9000, y: -300 }, rect)).toEqual({ x: half, y: half });
  });

  it("幅または高さが 0 以下の矩形は中心扱い", () => {
    expect(clientToZonePoint({ x: 10, y: 10 }, { left: 0, top: 0, width: 0, height: 100 })).toEqual(INITIAL_CURSOR);
    expect(clientToZonePoint({ x: 10, y: 10 }, { left: 0, top: 0, width: 100, height: 0 })).toEqual(INITIAL_CURSOR);
  });
});

describe("cursorRadii", () => {
  it("ミート能力が高いほど大きい", () => {
    const low = cursorRadii(batterWith(30), "meet");
    const high = cursorRadii(batterWith(80), "meet");
    expect(high.rx).toBeGreaterThan(low.rx);
    expect(high.ry).toBeGreaterThan(low.ry);
  });

  it("横長(rx > ry)で、ry = rx × aspect", () => {
    const radii = cursorRadii(batterWith(50), "meet");
    expect(radii.rx).toBeGreaterThan(radii.ry);
    expect(radii.ry).toBeCloseTo(radii.rx * BATTING_PARAMS.aspect, 12);
  });

  it("基準値: rx = meetBaseRx + meetRxPerAbility × meet", () => {
    expect(cursorRadii(batterWith(50), "meet").rx).toBeCloseTo(BATTING_PARAMS.meetBaseRx + BATTING_PARAMS.meetRxPerAbility * 50, 12);
  });

  it("強振は powerScale 倍(rx・ry とも)", () => {
    const meet = cursorRadii(batterWith(60), "meet");
    const power = cursorRadii(batterWith(60), "power");
    expect(power.rx).toBeCloseTo(meet.rx * BATTING_PARAMS.powerScale, 12);
    expect(power.ry).toBeCloseTo(meet.ry * BATTING_PARAMS.powerScale, 12);
  });
});
