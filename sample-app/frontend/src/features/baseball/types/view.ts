import type { BattedBall, CursorRadii, InPlayResult, PlateOutcome } from "./batting";
import type { Side } from "./common";
import type { Bases, LogEntry } from "./game";
import type { PitchFlight, PitchKind } from "./pitch";
import type { UniformColors } from "./scene";

/** スコアボードの1行(チーム)。`cells` は整形済み文字列で、未到達は「-」、スキップされた裏は「x」。 */
export type ScoreRowView = {
  readonly side: Side;
  readonly teamName: string;
  /** HUD 用の略称(`Team.shortName`)。 */
  readonly shortName: string;
  readonly cells: readonly string[];
  readonly runs: number;
  readonly hits: number;
  readonly errors: number;
};

export type ScoreboardView = {
  readonly columns: number;
  readonly rows: readonly ScoreRowView[];
};

/** ゾーンSVG用の定数。 */
export type FieldGeometry = {
  readonly viewHalfExtent: number;
  readonly zoneHalf: number;
  readonly gridHalf: number;
  readonly ballRadius: number;
};

/** フィールド図の点。座標系・値域は `BattedLanding` と同じ。 */
export type FieldMarkerView = {
  readonly seq: number;
  readonly result: InPlayResult;
  readonly x: number;
  readonly y: number;
  readonly distance: number;
  readonly lateral: number;
  readonly overFence: boolean;
};

/**
 * フィールド図SVG用の定数。座標系は `BattedLanding` と同じ。
 * ui はこれらから viewBox(y を反転)・塁の位置・ファウルライン(本塁から ±45°)・フェンス弧を描く。
 */
export type FieldDiagramGeometry = {
  readonly baseDistance: number;
  readonly fenceRadius: number;
  readonly viewHalfWidth: number;
  readonly viewTop: number;
  readonly viewBottom: number;
};

export type ResultView = {
  readonly humanOutcome: "win" | "lose" | "draw" | null;
  readonly headline: string;
  readonly awayRuns: number;
  readonly homeRuns: number;
};

/**
 * 解決した1球の事実(演出用)。`seq` はその球の通し番号(= その球の `flight.seq`)。
 * 次の投球が `in-flight` になっても、解決済みの球の `seq` は変わらない。
 */
export type PitchOutcomeView = {
  readonly seq: number;
  readonly kind: "ball" | "called-strike" | "swinging-strike" | "foul" | "in-play";
  /** `kind` が `in-play` のときのみ非 `null`。 */
  readonly inPlay: { readonly result: InPlayResult; readonly ball: BattedBall } | null;
  /** 打席が終わった球のみ非 `null`(`walk`・`strikeout`・インプレーの結果)。 */
  readonly plate: PlateOutcome | null;
};

/** ui 向けの表示データ。ui はこれだけを見る。 */
export type GameView = {
  readonly status: "playing" | "game-over";
  readonly mode: "human-batting" | "human-pitching" | "cpu-only";
  /** 例: 「3回表」。 */
  readonly inningLabel: string;
  readonly isExtra: boolean;
  readonly outs: number;
  readonly balls: number;
  readonly strikes: number;
  readonly bases: Bases;
  readonly scoreboard: ScoreboardView;
  readonly batter: {
    readonly name: string;
    readonly orderLabel: string;
    readonly cursorRadii: { readonly meet: CursorRadii; readonly power: CursorRadii };
  };
  readonly pitcher: {
    readonly name: string;
    readonly pitchCount: number;
    readonly staminaPercent: number;
    readonly repertoire: readonly { readonly kind: PitchKind; readonly label: string }[];
  };
  readonly flight: PitchFlight | null;
  /** `PITCH_ARRIVED` を送るまでの経過ゲーム時間(ms)。 */
  readonly arriveAfterMs: number;
  /** 飛行中は「142km/h ストレート」のように球速(整数に丸め)と球種名、それ以外は「-」。 */
  readonly pitchSpeedLabel: string;
  /** 人間が投げられる。 */
  readonly pitchReady: boolean;
  /** 人間がスイングできる。 */
  readonly swingReady: boolean;
  /** CPU が投げる番。 */
  readonly cpuPitchPending: boolean;
  /** `${pitchSeq}:${phase.kind}`。effect のキー。 */
  readonly turnKey: string;
  readonly lastEvent: string;
  /** 直近50件。 */
  readonly log: readonly LogEntry[];
  readonly geometry: FieldGeometry;
  /** `lastInPlay` が `null` の間は `null`。 */
  readonly fieldMarker: FieldMarkerView | null;
  readonly fieldDiagram: FieldDiagramGeometry;
  /** `game-over` のときのみ非 `null`。 */
  readonly result: ResultView | null;
  /** 解決した直近の1球の事実。`state.lastResult` が `null` の間は `null`。 */
  readonly outcome: PitchOutcomeView | null;
  /** サイド別のチーム色(24bit RGB。HUD のチップ用)。 */
  readonly teamColors: { readonly away: number; readonly home: number };
  /** 攻撃側チームの色と守備側チームの色(描画用)。 */
  readonly uniforms: UniformColors;
};
