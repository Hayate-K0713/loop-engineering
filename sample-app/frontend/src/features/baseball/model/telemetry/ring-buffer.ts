// 試遊ログのリングバッファ(最大 600 件)と JSON の往復。不変な配列を返す純粋関数。
import type { PlaytestRecord } from "../../types/telemetry";

/** 任意の保存(`createSafeStore` 経由)に使うキー。メモリが主で、保存できなくても動く。 */
export const PLAYTEST_STORAGE_KEY = "bb-playtest-v1";

/** 保持する記録の最大件数。超えたら古いほうから落とす。 */
export const RING_CAPACITY = 600;

/** 末尾に 1 件足す。`capacity` を超えた分は先頭から落とす。元の配列は変更しない。 */
export function appendRecord(records: readonly PlaytestRecord[], record: PlaytestRecord, capacity: number = RING_CAPACITY): readonly PlaytestRecord[] {
  const limit = Math.max(1, Math.floor(capacity));
  const next = [...records, record];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

/** JSON 文字列にする(画面の `<textarea>`・コピー・ダウンロード・保存の共通の形)。 */
export function serializeRecords(records: readonly PlaytestRecord[]): string {
  return JSON.stringify(records);
}

// 語彙は `types/batting.ts`・`types/telemetry.ts` と同じ(JSON から来る未検証の文字列と比べるので string[] で持つ)。
const RECORD_TYPES: readonly string[] = ["session", "stage", "bat", "ignored", "pointercancel", "pitch", "perf"];
const IGNORED_REASONS: readonly string[] = ["not-ready", "holding", "tap-too-long", "tap-moved", "cancel", "held-release"];
const SWING_SOURCES: readonly string[] = ["tap", "touch-second", "button", "key", "mouse"];

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidSwing(swing: unknown): boolean {
  if (swing === null) {
    return true;
  }
  return (
    isObject(swing) &&
    typeof swing.source === "string" &&
    SWING_SOURCES.includes(swing.source) &&
    isFiniteNumber(swing.dtMs) &&
    isFiniteNumber(swing.assistK) &&
    isFiniteNumber(swing.distanceZone)
  );
}

function hasValidBody(value: Readonly<Record<string, unknown>>): boolean {
  switch (value.type) {
    case "bat":
      return typeof value.inZone === "boolean" && typeof value.result === "string" && isValidSwing(value.swing);
    case "ignored":
      return typeof value.reason === "string" && IGNORED_REASONS.includes(value.reason);
    case "pitch":
      return typeof value.quality === "string" && typeof value.result === "string";
    case "perf":
      return isFiniteNumber(value.fpsMedian) && isFiniteNumber(value.p95Ms) && isFiniteNumber(value.longFrameRatio);
    default:
      return true;
  }
}

/** 集計が依存するフィールドを検査する(型の完全な検証ではない)。壊れた 1 件は捨てる。 */
export function isPlaytestRecord(value: unknown): value is PlaytestRecord {
  return isObject(value) && typeof value.type === "string" && RECORD_TYPES.includes(value.type) && isFiniteNumber(value.atMs) && hasValidBody(value);
}

/**
 * JSON 文字列から記録を復元する。不正な JSON・配列でない・`null`・空文字は空配列。
 * 配列の中の壊れた要素は捨て、`capacity` を超える場合は新しい側を残す。例外は投げない。
 */
export function parseRecords(json: string | null | undefined, capacity: number = RING_CAPACITY): readonly PlaytestRecord[] {
  if (typeof json !== "string" || json.length === 0) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const valid = parsed.filter(isPlaytestRecord);
  const limit = Math.max(1, Math.floor(capacity));
  return valid.length > limit ? valid.slice(valid.length - limit) : valid;
}
