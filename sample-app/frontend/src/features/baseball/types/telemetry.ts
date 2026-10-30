// 実機の試遊ログ(開発/試遊ビルド限定)の契約。メモリのリングバッファ(最大 600 件)に積み、画面から取り出す。
// 外部送信なし・個人情報なし。types/ は実行時コードを持たない葉で、他セグメントを import しない。
// 座標はゾーン単位、時刻は特記なければ ms。`atMs` はセッション開始(`performance.now()` 基準)からの経過時間。
import type { Difficulty } from "./game";
import type { IgnoredInputReason, PreviewMode, SwingKind, SwingSource } from "./batting";
import type { ZonePoint } from "./common";
import type { PitchKind, PitchQuality } from "./pitch";

/** 端末情報。縮小表示の疑い(`innerWidth ≥ 900` かつ `pointerCoarse`)の検出にも使う。 */
export type PlaytestDevice = {
  readonly innerWidth: number;
  readonly innerHeight: number;
  readonly devicePixelRatio: number;
  readonly pointerCoarse: boolean;
  readonly visualViewportScale: number;
  readonly userAgent: string;
};

/** 打撃 1 球の結果(`PitchResult["kind"]` と同じ語彙)。 */
export type PlaytestResultKind = "ball" | "called-strike" | "swinging-strike" | "foul" | "in-play";

/** スイングした球の詳細。距離は楕円ではなく素のゾーン距離(`distanceZone`)と画面 px(`distancePx`)の両方。 */
export type PlaytestSwing = {
  readonly source: SwingSource;
  readonly kind: SwingKind;
  readonly pressAtMs: number;
  readonly atMs: number;
  readonly dtMs: number;
  readonly raw: ZonePoint;
  readonly effective: ZonePoint;
  readonly assistK: number;
  readonly distanceZone: number;
  readonly distancePx: number | null;
  readonly fingerTravelPx: number | null;
  readonly tapHoldMs: number | null;
  readonly tapMovePx: number | null;
};

/** 試遊ログの 1 件。`type` で判別する。 */
export type PlaytestRecord =
  | { readonly type: "session"; readonly atMs: number; readonly sessionId: string; readonly device: PlaytestDevice }
  | { readonly type: "stage"; readonly atMs: number; readonly drawCalls: number; readonly triangles: number }
  | {
      readonly type: "bat";
      readonly atMs: number;
      readonly seq: number;
      readonly pitchKind: PitchKind;
      readonly durationMs: number;
      readonly landing: ZonePoint;
      readonly inZone: boolean;
      readonly preview: PreviewMode;
      readonly difficulty: Difficulty;
      /** スイングしなかった球は `null`(見逃し)。 */
      readonly swing: PlaytestSwing | null;
      readonly result: PlaytestResultKind;
    }
  | { readonly type: "ignored"; readonly atMs: number; readonly reason: IgnoredInputReason }
  | { readonly type: "pointercancel"; readonly atMs: number }
  | {
      readonly type: "pitch";
      readonly atMs: number;
      readonly seq: number;
      readonly pitchKind: PitchKind;
      readonly aim: ZonePoint;
      readonly landing: ZonePoint;
      /** ゲージを止めなかった(自動投球)ときは `null`。 */
      readonly stopAtMs: number | null;
      readonly errMs: number | null;
      readonly quality: PitchQuality;
      readonly result: PlaytestResultKind;
    }
  | { readonly type: "perf"; readonly atMs: number; readonly fpsMedian: number; readonly p95Ms: number; readonly longFrameRatio: number };

/**
 * `summarize(records)` の出力(診断表の元)。平均・中央値・SD などは、該当する記録が無いとき `null`。
 * `contactRate` = スイングのうち接触(空振りでない)の割合、`swingAtStrikeRate` = ストライクゾーン内の球を振った割合、
 * `ignoredByReason` = 押したのにスイングにならなかった理由別の件数、`sources` = スイングの入力種別別の件数。
 */
export type PlaytestSummary = {
  readonly battingPitches: number;
  readonly swings: number;
  readonly contactRate: number | null;
  readonly swingAtStrikeRate: number | null;
  readonly swingAtBallRate: number | null;
  readonly dtMeanMs: number | null;
  readonly dtSdMs: number | null;
  readonly distancePxMedian: number | null;
  readonly ignoredByReason: Readonly<Record<IgnoredInputReason, number>>;
  readonly pointerCancels: number;
  readonly sources: Readonly<Record<SwingSource, number>>;
  readonly pitchesThrown: number;
  readonly niceRate: number | null;
  readonly fpsP95Ms: number | null;
};
