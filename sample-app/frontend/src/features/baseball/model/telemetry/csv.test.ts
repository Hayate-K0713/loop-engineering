import { describe, expect, it } from "vitest";
import type { PlaytestRecord } from "../../types/telemetry";
import { CSV_COLUMNS, toCsv } from "./csv";
import { makeBat, makeIgnored, makePerf, makePitch, makeSwing } from "./test-fixtures";

function lines(csv: string): readonly string[] {
  return csv.split("\n");
}

function fieldsOf(line: string | undefined): readonly string[] {
  return (line ?? "").split(",");
}

function valueAt(csv: string, lineIndex: number, column: string): string | undefined {
  return fieldsOf(lines(csv).at(lineIndex)).at(CSV_COLUMNS.indexOf(column));
}

describe("toCsv", () => {
  it("記録が無くてもヘッダ行だけを返す", () => {
    expect(toCsv([])).toBe(CSV_COLUMNS.join(","));
  });

  it("全ての行が列数と同じ数のフィールドを持つ", () => {
    const records: readonly PlaytestRecord[] = [
      makeBat(),
      makeBat({ swing: null }),
      makePitch(),
      makePerf(),
      makeIgnored("tap-moved"),
      { type: "pointercancel", atMs: 1 },
      { type: "stage", atMs: 2, drawCalls: 100, triangles: 9000 },
    ];
    for (const line of lines(toCsv(records))) {
      expect(fieldsOf(line)).toHaveLength(CSV_COLUMNS.length);
    }
  });

  it("打撃の行はスイングの値を持ち、見逃しは swung が false で他が空欄", () => {
    const csv = toCsv([makeBat({ seq: 4, swing: makeSwing({ dtMs: -25, distancePx: null }) }), makeBat({ seq: 5, swing: null })]);
    expect(valueAt(csv, 1, "type")).toBe("bat");
    expect(valueAt(csv, 1, "seq")).toBe("4");
    expect(valueAt(csv, 1, "swung")).toBe("true");
    expect(valueAt(csv, 1, "dtMs")).toBe("-25");
    expect(valueAt(csv, 1, "distancePx")).toBe("");
    expect(valueAt(csv, 2, "swung")).toBe("false");
    expect(valueAt(csv, 2, "dtMs")).toBe("");
  });

  it("タップが通らなかった理由と投球の値が出る", () => {
    const csv = toCsv([makeIgnored("tap-too-long"), makePitch({ quality: "nice", stopAtMs: null })]);
    expect(valueAt(csv, 1, "reason")).toBe("tap-too-long");
    expect(valueAt(csv, 2, "quality")).toBe("nice");
    expect(valueAt(csv, 2, "stopAtMs")).toBe("");
  });

  it("カンマや引用符を含む値は二重引用符で囲む", () => {
    const csv = toCsv([{ type: "session", atMs: 0, sessionId: 'a,"b"', device: { innerWidth: 1, innerHeight: 1, devicePixelRatio: 1, pointerCoarse: false, visualViewportScale: 1, userAgent: "" } }]);
    expect(csv).toContain('"a,""b"""');
  });
});
