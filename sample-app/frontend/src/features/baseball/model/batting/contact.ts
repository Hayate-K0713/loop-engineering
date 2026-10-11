import type { CursorRadii, SwingInput, SwingKind } from "../../types/batting";
import type { ZonePoint } from "../../types/common";
import type { PitchFlight, PitchKind } from "../../types/pitch";
import type { BatterProfile } from "../../types/team";
import { getPitchSpec } from "../pitch/kinds";
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
};

/** 判定時のカーソル半径。打者の半径(強振補正済み)に、球種の打ちにくさ補正を掛ける。 */
export function effectiveRadii(batter: BatterProfile, swingKind: SwingKind, pitchKind: PitchKind): CursorRadii {
  const base = cursorRadii(batter, swingKind);
  const spec = getPitchSpec(pitchKind);
  return { rx: base.rx * spec.cursorScale.x, ry: base.ry * spec.cursorScale.y };
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

/**
 * 接触判定。ボールがカーソル楕円の内側(d ≤ 1)かつタイミング誤差が窓以内なら接触、それ以外は空振り。
 * 乱数は使わない。
 */
export function measureContact(input: MeasureContactInput): ContactMeasure {
  const { flight, swing, batter } = input;
  const radii = effectiveRadii(batter, swing.kind, flight.kind);
  const windowMs = swingWindowMs(swing.kind);
  const dtMs = swing.atMs - flight.durationMs;
  const d = ellipseDistance(flight.landing, swing.cursor, radii);
  const timingRatio = Math.abs(dtMs) / windowMs;

  if (d <= 1 && timingRatio <= 1) {
    const q = (1 - d) * (1 - timingRatio) * edgeFactor(flight.landing);
    return { kind: "contact", hit: { q, height: (flight.landing.y - swing.cursor.y) / radii.ry, dtMs, windowMs } };
  }
  return { kind: "miss" };
}
