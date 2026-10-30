import type { AssistParams, BattedBall, CursorRadii, InPlayResult, PlateOutcome } from "./batting";
import type { Side, ZonePoint } from "./common";
import type { Bases, Difficulty, LogEntry } from "./game";
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

/** 球種チップの曲がり矢印(球種の `bend` から導く。x + = 右(ライト側)、y − = 落ちる)。 */
export type PitchArrow = "none" | "right" | "left" | "down" | "right-down" | "left-down";

/** 演出バナーの種類。ボール/ストライク/空振り/ファウルは v2 のテロップのまま(バナーにしない)。 */
export type BannerKind = "just" | "hit" | "homerun" | "strikeout" | "walk" | "out" | "nice-pitch";

/**
 * 演出バナー(DOM+CSS)の表示内容。`bannerFor` が文言・種類・色・表示区間を決める。`seq` = その球の通し番号(アニメーションのキー)、
 * `color` = CSS の色、`durationMs` = 表示区間(`WORLD_PARAMS.banner` の種類別の値)。バナーが出る間はテロップを出さない。
 */
export type BannerView = {
  readonly kind: BannerKind;
  readonly text: string;
  readonly color: string;
  readonly seq: number;
  readonly durationMs: number;
};

/**
 * ゾーン単位の位置ずれ表示(`ui/ZoneFeedback.tsx` が `zoneRect` で px に換算する)。
 * `swing` = from が判定に使った有効カーソル・to がボールの着弾点、`pitch` = from が狙い・to が着弾。
 * `ringRadiusZone` = 着弾の輪の半径(ゾーン単位)、`alpha` = フェードアウトの不透明度(0〜1)、`label` = 「ズレ 0.2」などの添え字。
 */
export type ZoneFeedbackView = {
  readonly tone: "swing" | "pitch";
  readonly from: ZonePoint;
  readonly to: ZonePoint;
  readonly ringRadiusZone: number;
  readonly alpha: number;
  readonly label: string | null;
};

/** 説明(チュートリアル)の 1 ページ。絵は CSS だけで描く(`illustration` は CSS のクラスの選択キー)。 */
export type TutorialStep = {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly illustration: "drag" | "preview" | "tap" | "select" | "aim" | "gauge";
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
    /** 球種チップ用。`speedKmh` はその球種の球速(整数に丸め)、`arrow` は曲がり矢印。 */
    readonly repertoire: readonly { readonly kind: PitchKind; readonly label: string; readonly speedKmh: number; readonly arrow: PitchArrow }[];
  };
  /** 試合の難易度(アシストの強さを決める)。 */
  readonly difficulty: Difficulty;
  /** 難易度に連動するアシスト(ロックオン・予告・質の補正)。 */
  readonly assist: AssistParams;
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
