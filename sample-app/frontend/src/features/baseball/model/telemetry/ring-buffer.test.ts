import { describe, expect, it } from "vitest";
import type { PlaytestRecord } from "../../types/telemetry";
import { appendRecord, parseRecords, RING_CAPACITY, serializeRecords } from "./ring-buffer";
import { makeBat, makeIgnored, makePerf, makePitch } from "./test-fixtures";

function fillTo(count: number): readonly PlaytestRecord[] {
  return Array.from({ length: count }).reduce<readonly PlaytestRecord[]>((records, _unused, index) => appendRecord(records, makeBat({ seq: index })), []);
}

function seqOf(record: PlaytestRecord | undefined): number | null {
  return record !== undefined && record.type === "bat" ? record.seq : null;
}

describe("ring-buffer", () => {
  it("上限は 600 件", () => {
    expect(RING_CAPACITY).toBe(600);
  });

  it("上限までは全件残り、元の配列は変更されない", () => {
    const base: readonly PlaytestRecord[] = [makeBat({ seq: 0 })];
    const next = appendRecord(base, makeBat({ seq: 1 }));
    expect(base).toHaveLength(1);
    expect(next).toHaveLength(2);
  });

  it("600 件を超えると先頭から落ち、最新の 600 件が残る", () => {
    const records = fillTo(RING_CAPACITY + 25);
    expect(records).toHaveLength(RING_CAPACITY);
    expect(seqOf(records.at(0))).toBe(25);
    expect(seqOf(records.at(-1))).toBe(RING_CAPACITY + 24);
  });

  it("capacity を指定すると小さいバッファでも先頭から落ちる", () => {
    const records = [0, 1, 2, 3, 4].reduce<readonly PlaytestRecord[]>((acc, seq) => appendRecord(acc, makeBat({ seq }), 3), []);
    expect(records.map(seqOf)).toEqual([2, 3, 4]);
  });

  it("JSON 往復で同じ記録に戻る(全種類)", () => {
    const records: readonly PlaytestRecord[] = [
      { type: "session", atMs: 0, sessionId: "s1", device: { innerWidth: 390, innerHeight: 844, devicePixelRatio: 3, pointerCoarse: true, visualViewportScale: 1, userAgent: "ua" } },
      { type: "stage", atMs: 10, drawCalls: 120, triangles: 50000 },
      makeBat({ swing: null, result: "called-strike" }),
      makeBat({ seq: 2 }),
      makeIgnored("tap-too-long"),
      { type: "pointercancel", atMs: 4000 },
      makePitch(),
      makePerf(),
    ];
    expect(parseRecords(serializeRecords(records))).toEqual(records);
  });

  it("不正な JSON・空・配列でない値は空配列で、例外を投げない", () => {
    expect(parseRecords("{not json")).toEqual([]);
    expect(parseRecords("")).toEqual([]);
    expect(parseRecords(null)).toEqual([]);
    expect(parseRecords(undefined)).toEqual([]);
    expect(parseRecords("null")).toEqual([]);
    expect(parseRecords('{"type":"bat"}')).toEqual([]);
    expect(parseRecords("42")).toEqual([]);
  });

  it("配列の中の壊れた要素だけが捨てられる", () => {
    const good = makeBat({ seq: 7 });
    const json = JSON.stringify([good, null, 3, { type: "unknown", atMs: 1 }, { type: "bat", atMs: 1 }, { type: "ignored", atMs: 2, reason: "nope" }, makeIgnored("cancel")]);
    const parsed = parseRecords(json);
    expect(parsed).toHaveLength(2);
    expect(parsed.at(0)).toEqual(good);
  });

  it("復元時も上限を超える分は古い側を落とす", () => {
    const json = serializeRecords(Array.from({ length: 10 }, (_unused, seq) => makeBat({ seq })));
    expect(parseRecords(json, 4).map(seqOf)).toEqual([6, 7, 8, 9]);
  });
});
