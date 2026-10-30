// 試遊ログから人間代理ボット(`model/sim/human-bot.ts`。A14)のパラメータを推定する。純粋関数。
// 推定の前提(本体 §4-1 の定義に合わせる):
//   押下の時刻 press = D + biasMs + latencyMs + N(0, timingSigmaMs)、判定時刻 = press − 遅延補正(タッチ 70ms)なので、
//   dtMs = 判定時刻 − D = biasMs + (latencyMs − 遅延補正) + 雑音。 latencyMs は N(latencyMs, latencySdMs)。
//   指のぶれは 2 軸とも N(0, σ)(px)として、素のカーソルと着弾点の距離がレイリー分布 → 中央値 = σ × √(2 ln 2)。
//   ロックオンは有効カーソルを着弾点へ寄せるので、距離は**素のカーソル**(`raw`)と着弾点で測る(px への換算は同じ記録の `distancePx / distanceZone`)。
import type { SwingSource } from "../../types/batting";
import type { PlaytestRecord, PlaytestSwing } from "../../types/telemetry";
import { BATTING_PARAMS } from "../batting/params";
import { countIgnoredByReason } from "./summary";
import { mean, median, populationSd, ratioOrNull } from "./stats";

type BatRecord = Extract<PlaytestRecord, { readonly type: "bat" }>;
type SwingBat = BatRecord & { readonly swing: PlaytestSwing };

/** 推定に使う端末の仮定。既定は本体 §4-1 の表(`latencyMs` N(80, 20))と `BATTING_PARAMS` の遅延補正。 */
export type FitOptions = {
  readonly latencyMs: number;
  readonly latencySdMs: number;
  readonly compensationMs: number;
};

export const DEFAULT_FIT_OPTIONS: FitOptions = {
  latencyMs: 80,
  latencySdMs: 20,
  compensationMs: BATTING_PARAMS.inputLatencyMs.touch,
};

/**
 * 推定結果。サンプルが足りない(分母 0・件数不足)値は `null`(= ボットの既定を使う)。
 * `fingerSigmaPx` は指で合わせた(`tap`/`touch-second`)スイングだけ、時刻の 2 つ(`biasMs`/`timingSigmaMs`)はタッチ入力(`tap`/`touch-second`/`button`)だけで推定する。
 * 失敗の型の割合は「その方式で振ろうとした回数」を分母にする: `slowTapRate`/`driftTapRate` = タップのスイング + `tap-too-long` + `tap-moved`、
 * `cancelRate` = タッチ入力のスイング + `tap-too-long` + `tap-moved` + pointercancel。
 * `ignoreRing` はログから推定できないので含めない。
 */
export type FittedBotParams = {
  readonly touchSwings: number;
  readonly biasMs: number | null;
  readonly timingSigmaMs: number | null;
  readonly fingerSigmaPx: number | null;
  readonly slowTapRate: number | null;
  readonly driftTapRate: number | null;
  readonly cancelRate: number | null;
  readonly secondFingerRate: number | null;
};

const RAYLEIGH_MEDIAN_FACTOR = Math.sqrt(2 * Math.LN2);
const MIN_DISTANCE_ZONE = 1e-9;
const TOUCH_SOURCES: readonly SwingSource[] = ["tap", "touch-second", "button"];
const FINGER_SOURCES: readonly SwingSource[] = ["tap", "touch-second"];

function swingBatsOf(records: readonly PlaytestRecord[], sources: readonly SwingSource[]): readonly SwingBat[] {
  return records.flatMap((record) => {
    if (record.type !== "bat" || record.swing === null || !sources.includes(record.swing.source)) {
      return [];
    }
    return [{ ...record, swing: record.swing }];
  });
}

/** 素のカーソルと着弾点の距離(px)。換算できない記録は含めない。 */
function rawDistancesPx(bats: readonly SwingBat[]): readonly number[] {
  return bats.flatMap((bat) => {
    const swing = bat.swing;
    if (swing.distancePx === null || swing.distanceZone < MIN_DISTANCE_ZONE) {
      return [];
    }
    const pxPerZone = swing.distancePx / swing.distanceZone;
    return [Math.hypot(swing.raw.x - bat.landing.x, swing.raw.y - bat.landing.y) * pxPerZone];
  });
}

function timingSigma(dts: readonly number[], options: FitOptions): number | null {
  const sd = populationSd(dts);
  if (sd === null) {
    return null;
  }
  // 端末の遅延のばらつき(latencySdMs)は押下時刻の雑音に含まれるので、二乗の差で取り除く。
  return Math.sqrt(Math.max(0, sd * sd - options.latencySdMs * options.latencySdMs));
}

function failureRates(records: readonly PlaytestRecord[]): Pick<FittedBotParams, "slowTapRate" | "driftTapRate" | "cancelRate"> {
  const reasons = countIgnoredByReason(records);
  const tapSwings = swingBatsOf(records, ["tap"]).length;
  const touchSwings = swingBatsOf(records, TOUCH_SOURCES).length;
  const cancels = records.filter((record) => record.type === "pointercancel").length;
  const tapAttempts = tapSwings + reasons["tap-too-long"] + reasons["tap-moved"];
  return {
    slowTapRate: ratioOrNull(reasons["tap-too-long"], tapAttempts),
    driftTapRate: ratioOrNull(reasons["tap-moved"], tapAttempts),
    cancelRate: ratioOrNull(cancels, touchSwings + reasons["tap-too-long"] + reasons["tap-moved"] + cancels),
  };
}

/**
 * 試遊ログから人間代理ボットのパラメータを推定する。
 * 返す値はボットの定義(本体 §4-1)に対応: `biasMs`・`timingSigmaMs`・`fingerSigmaPx`・失敗の型・`secondFingerRate`。
 */
export function fitBotParams(records: readonly PlaytestRecord[], options: FitOptions = DEFAULT_FIT_OPTIONS): FittedBotParams {
  const touchBats = swingBatsOf(records, TOUCH_SOURCES);
  const dts = touchBats.map((bat) => bat.swing.dtMs);
  const dtMean = mean(dts);
  const fingerMedianPx = median(rawDistancesPx(swingBatsOf(records, FINGER_SOURCES)));
  const secondFingerSwings = touchBats.filter((bat) => bat.swing.source !== "tap").length;
  return {
    touchSwings: touchBats.length,
    biasMs: dtMean === null ? null : dtMean - (options.latencyMs - options.compensationMs),
    timingSigmaMs: timingSigma(dts, options),
    fingerSigmaPx: fingerMedianPx === null ? null : fingerMedianPx / RAYLEIGH_MEDIAN_FACTOR,
    ...failureRates(records),
    secondFingerRate: ratioOrNull(secondFingerSwings, touchBats.length),
  };
}
