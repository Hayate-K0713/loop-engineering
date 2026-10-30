// 試遊ログの要約(診断表の元)。`PlaytestSummary` の各値の定義は `types/telemetry.ts` と tests 分冊の診断表に従う。
import type { IgnoredInputReason, SwingSource } from "../../types/batting";
import type { PlaytestRecord, PlaytestSummary, PlaytestSwing } from "../../types/telemetry";
import { mean, median, populationSd, ratioOrNull } from "./stats";

type BatRecord = Extract<PlaytestRecord, { readonly type: "bat" }>;

function batRecords(records: readonly PlaytestRecord[]): readonly BatRecord[] {
  return records.filter((record): record is BatRecord => record.type === "bat");
}

function swingsOf(bats: readonly BatRecord[]): readonly PlaytestSwing[] {
  return bats.flatMap((bat) => (bat.swing === null ? [] : [bat.swing]));
}

function countReason(records: readonly PlaytestRecord[], reason: IgnoredInputReason): number {
  return records.filter((record) => record.type === "ignored" && record.reason === reason).length;
}

/** 押したのにスイングにならなかった理由別の件数(`ignored` の記録。pointercancel の記録は含めない)。 */
export function countIgnoredByReason(records: readonly PlaytestRecord[]): Readonly<Record<IgnoredInputReason, number>> {
  return {
    "not-ready": countReason(records, "not-ready"),
    holding: countReason(records, "holding"),
    "tap-too-long": countReason(records, "tap-too-long"),
    "tap-moved": countReason(records, "tap-moved"),
    cancel: countReason(records, "cancel"),
    "held-release": countReason(records, "held-release"),
  };
}

/** スイングの入力種別別の件数。 */
export function countSwingSources(swings: readonly PlaytestSwing[]): Readonly<Record<SwingSource, number>> {
  const count = (source: SwingSource): number => swings.filter((swing) => swing.source === source).length;
  return {
    tap: count("tap"),
    "touch-second": count("touch-second"),
    button: count("button"),
    key: count("key"),
    mouse: count("mouse"),
  };
}

function swingRate(bats: readonly BatRecord[], inZone: boolean): number | null {
  const targets = bats.filter((bat) => bat.inZone === inZone);
  return ratioOrNull(targets.filter((bat) => bat.swing !== null).length, targets.length);
}

function numbersOf(swings: readonly PlaytestSwing[], pick: (swing: PlaytestSwing) => number | null): readonly number[] {
  return swings.flatMap((swing) => {
    const value = pick(swing);
    return value === null ? [] : [value];
  });
}

function pitchSummary(records: readonly PlaytestRecord[]): Pick<PlaytestSummary, "pitchesThrown" | "niceRate"> {
  const pitches = records.filter((record) => record.type === "pitch");
  return {
    pitchesThrown: pitches.length,
    niceRate: ratioOrNull(pitches.filter((pitch) => pitch.quality === "nice").length, pitches.length),
  };
}

function perfP95(records: readonly PlaytestRecord[]): number | null {
  return median(records.flatMap((record) => (record.type === "perf" ? [record.p95Ms] : [])));
}

/**
 * 記録を要約する。
 * - `contactRate` = スイングのうち結果が空振り(`swinging-strike`)でない割合(ファウル・インプレーは接触)。
 * - `swingAtStrikeRate`/`swingAtBallRate` = 着弾がゾーン内/外の打撃の球のうちスイングした割合。
 * - `dtMeanMs`/`dtSdMs` = スイングの `dtMs` の平均と母標準偏差。`distancePxMedian` = `distancePx` の中央値(`null` は除く)。
 * - `fpsP95Ms` = `perf` 記録(窓ごとの p95)の中央値。
 * 該当する記録が無い値は `null`。
 */
export function summarize(records: readonly PlaytestRecord[]): PlaytestSummary {
  const bats = batRecords(records);
  const swings = swingsOf(bats);
  const swingBats = bats.filter((bat) => bat.swing !== null);
  const dts = swings.map((swing) => swing.dtMs);
  return {
    battingPitches: bats.length,
    swings: swings.length,
    contactRate: ratioOrNull(swingBats.filter((bat) => bat.result !== "swinging-strike").length, swingBats.length),
    swingAtStrikeRate: swingRate(bats, true),
    swingAtBallRate: swingRate(bats, false),
    dtMeanMs: mean(dts),
    dtSdMs: populationSd(dts),
    distancePxMedian: median(numbersOf(swings, (swing) => swing.distancePx)),
    ignoredByReason: countIgnoredByReason(records),
    pointerCancels: records.filter((record) => record.type === "pointercancel").length,
    sources: countSwingSources(swings),
    ...pitchSummary(records),
    fpsP95Ms: perfP95(records),
  };
}
