import type { BallPosition, PitchFlight } from "../../types/pitch";
import { getPitchSpec } from "./kinds";
import { PITCH_PARAMS } from "./params";
import { clamp } from "./zone";

/**
 * 飛行中のボールの表示位置(表示専用。判定には使わない)。
 * 進行度 p = clamp(elapsed / duration, 0, 1)。開始点から着弾点へ直線補間し、球種の `bend` を (1 - p)² で減衰させながら加算する。
 * p = 1 で必ず `flight.landing` に一致し、`scale` は `startScale` から 1 へ変化する。
 */
export function ballPositionAt(flight: PitchFlight, elapsedMs: number): BallPosition {
  const progress = flight.durationMs > 0 ? clamp(elapsedMs / flight.durationMs, 0, 1) : 1;
  const remaining = 1 - progress;
  const { startPoint, startScale } = PITCH_PARAMS;
  const { bend } = getPitchSpec(flight.kind);
  // 着弾点を基準に「残りの距離」を足す形にして、progress = 1 で厳密に landing に一致させる。
  return {
    x: flight.landing.x + (startPoint.x - flight.landing.x) * remaining + bend.x * remaining * remaining,
    y: flight.landing.y + (startPoint.y - flight.landing.y) * remaining + bend.y * remaining * remaining,
    scale: 1 + (startScale - 1) * remaining,
  };
}
