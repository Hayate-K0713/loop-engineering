// 試遊ログの CSV(ダウンロード用)。1 記録 1 行の横長の表で、記録の種類に無い列は空欄にする。
// 端末情報(session の `device`)は列にせず JSON 側で取り出す。
import type { PlaytestRecord } from "../../types/telemetry";

type Cell = string | number | boolean | null;

/** 列の並び(固定)。先頭 2 列は全記録で共通。 */
export const CSV_COLUMNS: readonly string[] = [
  "type",
  "atMs",
  "seq",
  "pitchKind",
  "durationMs",
  "landingX",
  "landingY",
  "inZone",
  "preview",
  "difficulty",
  "swung",
  "source",
  "swingKind",
  "pressAtMs",
  "swingAtMs",
  "dtMs",
  "rawX",
  "rawY",
  "effectiveX",
  "effectiveY",
  "assistK",
  "distanceZone",
  "distancePx",
  "fingerTravelPx",
  "tapHoldMs",
  "tapMovePx",
  "reason",
  "aimX",
  "aimY",
  "stopAtMs",
  "errMs",
  "quality",
  "result",
  "fpsMedian",
  "p95Ms",
  "longFrameRatio",
  "drawCalls",
  "triangles",
  "sessionId",
];

type Row = ReadonlyMap<string, Cell>;

function swingCells(record: Extract<PlaytestRecord, { readonly type: "bat" }>): readonly (readonly [string, Cell])[] {
  const swing = record.swing;
  if (swing === null) {
    return [["swung", false]];
  }
  return [
    ["swung", true],
    ["source", swing.source],
    ["swingKind", swing.kind],
    ["pressAtMs", swing.pressAtMs],
    ["swingAtMs", swing.atMs],
    ["dtMs", swing.dtMs],
    ["rawX", swing.raw.x],
    ["rawY", swing.raw.y],
    ["effectiveX", swing.effective.x],
    ["effectiveY", swing.effective.y],
    ["assistK", swing.assistK],
    ["distanceZone", swing.distanceZone],
    ["distancePx", swing.distancePx],
    ["fingerTravelPx", swing.fingerTravelPx],
    ["tapHoldMs", swing.tapHoldMs],
    ["tapMovePx", swing.tapMovePx],
  ];
}

function specificCells(record: PlaytestRecord): readonly (readonly [string, Cell])[] {
  switch (record.type) {
    case "session":
      return [["sessionId", record.sessionId]];
    case "stage":
      return [
        ["drawCalls", record.drawCalls],
        ["triangles", record.triangles],
      ];
    case "bat":
      return [
        ["seq", record.seq],
        ["pitchKind", record.pitchKind],
        ["durationMs", record.durationMs],
        ["landingX", record.landing.x],
        ["landingY", record.landing.y],
        ["inZone", record.inZone],
        ["preview", record.preview],
        ["difficulty", record.difficulty],
        ...swingCells(record),
        ["result", record.result],
      ];
    case "ignored":
      return [["reason", record.reason]];
    case "pointercancel":
      return [];
    case "pitch":
      return [
        ["seq", record.seq],
        ["pitchKind", record.pitchKind],
        ["aimX", record.aim.x],
        ["aimY", record.aim.y],
        ["landingX", record.landing.x],
        ["landingY", record.landing.y],
        ["stopAtMs", record.stopAtMs],
        ["errMs", record.errMs],
        ["quality", record.quality],
        ["result", record.result],
      ];
    case "perf":
      return [
        ["fpsMedian", record.fpsMedian],
        ["p95Ms", record.p95Ms],
        ["longFrameRatio", record.longFrameRatio],
      ];
  }
}

function rowOf(record: PlaytestRecord): Row {
  return new Map<string, Cell>([["type", record.type], ["atMs", record.atMs], ...specificCells(record)]);
}

/** CSV のフィールドをエスケープする(`,` `"` 改行を含むときだけ二重引用符で囲む)。 */
function escapeField(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function cellText(cell: Cell | undefined): string {
  return cell === null || cell === undefined ? "" : escapeField(String(cell));
}

/** 記録を CSV 文字列にする。1 行目はヘッダ、行は `\n` 区切り、末尾に改行を付けない。 */
export function toCsv(records: readonly PlaytestRecord[]): string {
  const header = CSV_COLUMNS.join(",");
  const rows = records.map((record) => {
    const row = rowOf(record);
    return CSV_COLUMNS.map((column) => cellText(row.get(column))).join(",");
  });
  return [header, ...rows].join("\n");
}
