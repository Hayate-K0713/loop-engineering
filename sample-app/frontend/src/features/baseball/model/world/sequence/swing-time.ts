import { BATTING_PARAMS } from "../../batting/params";
import type { SwingInputKind, SwingOrigin } from "../../../types/batting";

// スイングの判定時刻 `atMs` の求め方(純関数)。入力イベントの時刻(`event.timeStamp`)から経過ゲーム時間を求め、入力種別ごとの遅延を引く。
// ハンドラの実行時刻(`performance.now()`)は、描画で詰まったメインスレッドの待ちを含むので、イベントの時刻が信頼できるときはそちらを使う。

export type SwingAtMsInput = {
  /** 入力イベントの時刻情報。プログラムからの呼び出し(イベントなし)は `null`。 */
  readonly origin: SwingOrigin | null;
  /** 入力を処理した時刻(`performance.now()` と同じ時計、ms)。 */
  readonly nowMs: number;
  /** 投球開始(リリース)の時刻(同じ時計、ms)。一度も `flight` が出ていなければ `null`。 */
  readonly startedAtMs: number | null;
  /** ゲーム時間の倍率(`fast=1` の開発用加速)。遅延補正には掛けない。 */
  readonly timeScale: number;
};

/** 入力種別ごとの遅延補正(ゲート ms)。 */
export function inputLatencyOf(kind: SwingInputKind): number {
  switch (kind) {
    case "touch":
      return BATTING_PARAMS.inputLatencyMs.touch;
    case "mouse":
      return BATTING_PARAMS.inputLatencyMs.mouse;
    case "key":
      return BATTING_PARAMS.inputLatencyMs.key;
  }
}

/**
 * イベントの時刻 `origin.timeStamp` を判定に使ってよいか。
 * (1) ハンドラを起動したイベント(`sourceTimeStamp`)から処理時刻まで `0 〜 maxEventAgeMs`、
 * (2) 入力が起きた時刻からハンドラを起動したイベントまで `0 〜 maxTapSpanMs`(タップは押下→離し)。
 * 負・大きすぎる・`NaN`・桁違い(エポック時刻など、時計の基準が違う値)は偽。
 */
function isUsableEventTime(origin: SwingOrigin, nowMs: number): boolean {
  const age = nowMs - origin.sourceTimeStamp;
  const span = origin.sourceTimeStamp - origin.timeStamp;
  return age >= 0 && age <= BATTING_PARAMS.maxEventAgeMs && span >= 0 && span <= BATTING_PARAMS.maxTapSpanMs;
}

/**
 * スイングの判定時刻 `atMs`(投球開始からの経過ゲーム時間 ms。遅延補正後のため過去の時刻になりうる)。
 * - `startedAtMs = null` は 0(`swingReady` が偽の間は呼ばれない)。
 * - `origin = null` は `(nowMs − startedAtMs) × timeScale`(補正なし)。
 * - `origin` あり: `eventMs` = イベントの時刻が使えれば `origin.timeStamp`、使えなければ `nowMs`。
 *   `atMs = (eventMs − startedAtMs) × timeScale − 入力種別の遅延`(補正は `nowMs` を使うときも引く)。
 */
export function swingAtMs(input: SwingAtMsInput): number {
  const { origin, nowMs, startedAtMs, timeScale } = input;
  if (startedAtMs === null) {
    return 0;
  }
  if (origin === null) {
    return (nowMs - startedAtMs) * timeScale;
  }
  const eventMs = isUsableEventTime(origin, nowMs) ? origin.timeStamp : nowMs;
  return (eventMs - startedAtMs) * timeScale - inputLatencyOf(origin.inputKind);
}
