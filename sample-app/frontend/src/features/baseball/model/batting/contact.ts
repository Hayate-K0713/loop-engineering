import type { AssistParams, CursorRadii, SwingInput, SwingKind } from "../../types/batting";
import type { ZonePoint } from "../../types/common";
import type { PitchFlight, PitchKind } from "../../types/pitch";
import type { BatterProfile } from "../../types/team";
import { getPitchSpec } from "../pitch/kinds";
import { qualityScaleOf } from "./assist";
import { cursorRadii } from "./cursor";
import { BATTING_PARAMS } from "./params";

/** 接触が成立したときの測定値。打球形成(batted-ball.ts)の入力になる。 */
export type ContactHit = {
  /** 接触の質(0〜1。楕円の中心に近く、タイミングが合うほど大きい)。 */
  readonly q: number;
  /** ボールのカーソル中心からの高さ((by - cy) / ry。正が上)。 */
  readonly height: number;
  /** タイミング誤差(ms。負 = 早い、正 = 遅い)。 */
  readonly dtMs: number;
  /** この打球に適用された判定窓(ms)。 */
  readonly windowMs: number;
};

export type ContactMeasure = { readonly kind: "miss" } | { readonly kind: "contact"; readonly hit: ContactHit };

export type MeasureContactInput = {
  readonly flight: PitchFlight;
  readonly swing: SwingInput;
  readonly batter: BatterProfile;
  /**
   * 難易度のアシスト。あれば `swing.assistK` に応じて質 q を `qualityScaleOf` 倍する(引き寄せが強いほど弱い当たり)。
   * 省略(または `swing.assistK` の省略)は補正なしで v2 と同じ結果。
   */
  readonly assist?: AssistParams;
};

/**
 * カーソル半径に球種の打ちにくさ補正(`cursorScale`)を掛ける。純関数。
 * 判定(`effectiveRadii`)と、飛行中に表示するカーソルの半径(director)の両方が使い、表示と判定の補正を一致させる。
 */
export function scaleRadiiForPitch(radii: CursorRadii, pitchKind: PitchKind): CursorRadii {
  const spec = getPitchSpec(pitchKind);
  return { rx: radii.rx * spec.cursorScale.x, ry: radii.ry * spec.cursorScale.y };
}

/** 判定時のカーソル半径。打者の半径(強振補正済み)に、球種の打ちにくさ補正を掛ける。ボール半径(`reach`)は含まない。 */
export function effectiveRadii(batter: BatterProfile, swingKind: SwingKind, pitchKind: PitchKind): CursorRadii {
  return scaleRadiiForPitch(cursorRadii(batter, swingKind), pitchKind);
}

/** スイング種別ごとの判定窓(±ms)。強振は狭い。 */
export function swingWindowMs(swingKind: SwingKind): number {
  return swingKind === "power" ? BATTING_PARAMS.contactWindowMs * BATTING_PARAMS.powerWindowScale : BATTING_PARAMS.contactWindowMs;
}

/** ゾーン端・ボールゾーンほど質が落ちる係数(0〜1)。 */
export function edgeFactor(point: ZonePoint): number {
  const extent = Math.max(Math.abs(point.x), Math.abs(point.y));
  const overshoot = Math.max(0, extent - BATTING_PARAMS.edgePenaltyStart);
  return Math.max(0, 1 - BATTING_PARAMS.edgePenaltyPerUnit * overshoot);
}

/** ボールとカーソル中心の、楕円で正規化した距離 d(1 以下なら楕円の内側)。平方根と四則演算のみで求める(再現性のため組み込みの hypot は使わない)。 */
export function ellipseDistance(ball: ZonePoint, cursor: ZonePoint, radii: CursorRadii): number {
  const dx = (ball.x - cursor.x) / radii.rx;
  const dy = (ball.y - cursor.y) / radii.ry;
  return Math.sqrt(dx * dx + dy * dy);
}

/** 当たり範囲の楕円の半径。カーソル楕円にボール半径(`ballReachX/Y`)を足したもの。 */
function reachRadii(radii: CursorRadii): CursorRadii {
  return { rx: radii.rx + BATTING_PARAMS.ballReachX, ry: radii.ry + BATTING_PARAMS.ballReachY };
}

/**
 * 接触判定。ボール中心が「カーソル楕円にボール半径を足した楕円」の内側(縁が触れて見える範囲)で、
 * かつタイミング誤差が窓以内なら接触、それ以外は空振り。
 * 質 q と高さ(打球タイプの入力)は、ボール半径を足す前の元の楕円の中心距離 d で求める
 * (元の楕円の外側かつ当たり範囲の内側 = かすった当たりは q = 0)。
 * タイミング誤差 Δt は判定時刻 `swing.atMs` から求める(演出の受付時刻ではない)。乱数は使わない。
 */
export function measureContact(input: MeasureContactInput): ContactMeasure {
  const { flight, swing, batter, assist } = input;
  const radii = effectiveRadii(batter, swing.kind, flight.kind);
  const windowMs = swingWindowMs(swing.kind);
  const dtMs = swing.atMs - flight.durationMs;
  const reach = ellipseDistance(flight.landing, swing.cursor, reachRadii(radii));
  const timingRatio = Math.abs(dtMs) / windowMs;

  if (reach <= 1 && timingRatio <= 1) {
    const d = ellipseDistance(flight.landing, swing.cursor, radii);
    const rawQ = Math.max(0, 1 - d) * (1 - timingRatio) * edgeFactor(flight.landing);
    const q = assist === undefined ? rawQ : rawQ * qualityScaleOf(assist, swing.assistK);
    return { kind: "contact", hit: { q, height: (flight.landing.y - swing.cursor.y) / radii.ry, dtMs, windowMs } };
  }
  return { kind: "miss" };
}
