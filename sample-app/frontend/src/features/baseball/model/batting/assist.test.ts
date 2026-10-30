import { describe, expect, it } from "vitest";
import type { AssistParams } from "../../types/batting";
import type { ZonePoint } from "../../types/common";
import type { Difficulty } from "../../types/game";
import { ASSIST_TABLE, assistFor, lockOnCursor, previewCenterOf, qualityScaleOf } from "./assist";

const DIFFICULTIES: readonly Difficulty[] = ["easy", "normal", "hard"];
const LANDING: ZonePoint = { x: 0.3, y: -0.2 };
const NEAR_RAW: ZonePoint = { x: -0.2, y: 0.3 };
const PROGRESSES: readonly number[] = [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1];

function distance(a: ZonePoint, b: ZonePoint): number {
  return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
}

describe("assistFor / ASSIST_TABLE", () => {
  it("難易度ごとに表の行を返す", () => {
    expect(assistFor("easy")).toBe(ASSIST_TABLE.easy);
    expect(assistFor("normal")).toBe(ASSIST_TABLE.normal);
    expect(assistFor("hard")).toBe(ASSIST_TABLE.hard);
  });
});

describe("lockOnCursor", () => {
  it("lockStrength 0 では常に恒等(raw のまま、k = 0)", () => {
    const assist: AssistParams = { ...ASSIST_TABLE.normal, lockStrength: 0 };
    PROGRESSES.forEach((progress) => {
      const result = lockOnCursor(assist, NEAR_RAW, LANDING, progress);
      expect(result.cursor).toEqual(NEAR_RAW);
      expect(result.k).toBe(0);
    });
  });

  it("progress < rampStart では素のカーソル(k = 0)", () => {
    DIFFICULTIES.forEach((difficulty) => {
      const assist = assistFor(difficulty);
      const result = lockOnCursor(assist, NEAR_RAW, LANDING, assist.rampStart - 0.01);
      expect(result.cursor).toEqual(NEAR_RAW);
      expect(result.k).toBe(0);
    });
  });

  it("progress が rampStart ちょうどでも k = 0、rampEnd 以降は lockStrength × capture で一定", () => {
    const assist = ASSIST_TABLE.normal;
    expect(lockOnCursor(assist, NEAR_RAW, LANDING, assist.rampStart).k).toBe(0);
    const atEnd = lockOnCursor(assist, NEAR_RAW, LANDING, assist.rampEnd);
    const after = lockOnCursor(assist, NEAR_RAW, LANDING, 1);
    expect(atEnd.k).toBeCloseTo(assist.lockStrength, 12);
    expect(after.k).toBeCloseTo(atEnd.k, 12);
  });

  it("k は 0〜1 に収まり、進行度に対して単調非減少(範囲外の進行度は丸める)", () => {
    DIFFICULTIES.forEach((difficulty) => {
      const assist = assistFor(difficulty);
      let previous = 0;
      [-1, ...PROGRESSES, 2].forEach((progress) => {
        const { k } = lockOnCursor(assist, NEAR_RAW, LANDING, progress);
        expect(k).toBeGreaterThanOrEqual(0);
        expect(k).toBeLessThanOrEqual(1);
        expect(k).toBeGreaterThanOrEqual(previous);
        previous = k;
      });
    });
  });

  it("k は raw と着弾点の距離に対して単調非増加で、captureRadius × 1.6 以上では 0", () => {
    const assist = ASSIST_TABLE.normal;
    let previous = 1;
    for (let step = 0; step <= 40; step += 1) {
      const raw = { x: LANDING.x + step * 0.1, y: LANDING.y };
      const { k } = lockOnCursor(assist, raw, LANDING, 1);
      expect(k).toBeLessThanOrEqual(previous);
      previous = k;
    }
    const outside = { x: LANDING.x + assist.captureRadius * 1.6, y: LANDING.y };
    expect(lockOnCursor(assist, outside, LANDING, 1)).toEqual({ cursor: outside, k: 0 });
    const farther = { x: LANDING.x, y: LANDING.y - assist.captureRadius * 2 };
    expect(lockOnCursor(assist, farther, LANDING, 1).k).toBe(0);
  });

  it("captureRadius の内側では capture = 1(k = lockStrength × ramp)", () => {
    const assist = ASSIST_TABLE.easy;
    const raw = { x: LANDING.x + assist.captureRadius, y: LANDING.y };
    expect(lockOnCursor(assist, raw, LANDING, 1).k).toBeCloseTo(assist.lockStrength, 12);
  });

  it("有効カーソルは raw と landing を結ぶ線分上にあり、距離は (1 − k) 倍になる", () => {
    DIFFICULTIES.forEach((difficulty) => {
      const assist = assistFor(difficulty);
      PROGRESSES.forEach((progress) => {
        const { cursor, k } = lockOnCursor(assist, NEAR_RAW, LANDING, progress);
        const total = distance(NEAR_RAW, LANDING);
        expect(distance(NEAR_RAW, cursor) + distance(cursor, LANDING)).toBeCloseTo(total, 9);
        expect(distance(cursor, LANDING)).toBeCloseTo(total * (1 - k), 9);
      });
    });
  });

  it("raw が着弾点と一致していれば、どの進行度でも有効カーソルは着弾点", () => {
    const result = lockOnCursor(ASSIST_TABLE.easy, LANDING, LANDING, 0.9);
    expect(result.cursor.x).toBeCloseTo(LANDING.x, 12);
    expect(result.cursor.y).toBeCloseTo(LANDING.y, 12);
  });
});

describe("previewCenterOf", () => {
  const fade = ASSIST_TABLE.hard;

  it("exact は着弾点そのもの", () => {
    expect(previewCenterOf(ASSIST_TABLE.normal, LANDING, 7)).toEqual(LANDING);
    expect(previewCenterOf(ASSIST_TABLE.easy, LANDING, 7)).toEqual(LANDING);
  });

  it("none は着弾点そのもの(印を出さないので使われないが、値は定義される)", () => {
    const none: AssistParams = { ...fade, preview: "none" };
    expect(previewCenterOf(none, LANDING, 3)).toEqual(LANDING);
  });

  it("fade は同じ seq なら何度呼んでも同じ(決定論)", () => {
    expect(previewCenterOf(fade, LANDING, 42)).toEqual(previewCenterOf(fade, LANDING, 42));
  });

  it("fade のずれは fadeJitter 以内で、半径 fadeRadius の円が着弾点を含む", () => {
    for (let seq = 0; seq < 500; seq += 1) {
      const center = previewCenterOf(fade, LANDING, seq);
      const offset = distance(center, LANDING);
      expect(offset).toBeLessThanOrEqual(fade.fadeJitter);
      expect(offset).toBeLessThanOrEqual(fade.fadeRadius);
    }
  });

  it("fade は seq が違えばずれの向きや大きさが散らばる(常に同じ位置ではない)", () => {
    const offsets = new Set<string>();
    for (let seq = 1; seq <= 50; seq += 1) {
      const center = previewCenterOf(fade, LANDING, seq);
      offsets.add(`${(center.x - LANDING.x).toFixed(4)},${(center.y - LANDING.y).toFixed(4)}`);
    }
    expect(offsets.size).toBeGreaterThan(40);
  });

  it("fade でも fadeRadius が fadeJitter より小さければ、ずれは fadeRadius 以内(円が着弾を含む)", () => {
    const tight: AssistParams = { ...fade, fadeRadius: 0.1, fadeJitter: 0.5 };
    for (let seq = 0; seq < 200; seq += 1) {
      expect(distance(previewCenterOf(tight, LANDING, seq), LANDING)).toBeLessThanOrEqual(tight.fadeRadius);
    }
  });
});

describe("qualityScaleOf", () => {
  it("assistK の省略と 0 は倍率 1(v2 と同じ)", () => {
    DIFFICULTIES.forEach((difficulty) => {
      expect(qualityScaleOf(assistFor(difficulty), undefined)).toBe(1);
      expect(qualityScaleOf(assistFor(difficulty), 0)).toBe(1);
    });
  });

  it("1 − qualityPenalty × k で、k に対して単調非増加、k = 1 で 1 − qualityPenalty", () => {
    const assist = ASSIST_TABLE.normal;
    expect(qualityScaleOf(assist, 0.5)).toBeCloseTo(1 - assist.qualityPenalty * 0.5, 12);
    expect(qualityScaleOf(assist, 1)).toBeCloseTo(1 - assist.qualityPenalty, 12);
    expect(qualityScaleOf(assist, 0.2)).toBeGreaterThan(qualityScaleOf(assist, 0.8));
  });

  it("k は 0〜1 に丸める(倍率が 1 を超えず、1 − qualityPenalty を下回らない)", () => {
    const assist = ASSIST_TABLE.hard;
    expect(qualityScaleOf(assist, -1)).toBe(1);
    expect(qualityScaleOf(assist, 5)).toBeCloseTo(1 - assist.qualityPenalty, 12);
  });
});
