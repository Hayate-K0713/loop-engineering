import type { PitchFlight } from "../../../types/pitch";
import type { Vec3 } from "../../../types/scene";
import { getPitchSpec } from "../../pitch/kinds";
import { clamp } from "../../pitch/zone";
import { ZONE_HALF_HEIGHT, zoneToWorld } from "../space/coords";
import { RELEASE_POINT, WORLD_PARAMS } from "../space/params";
import { lerpVec3 } from "../space/vec3";

// 投球のボール軌道(表示専用。判定には使わない)。ゾーン到達時刻 = `flight.durationMs`。

const { bendGain, arcHeight, breakExponent, speedProfile } = WORLD_PARAMS.pitch;

/** 球種の終盤の曲がり量(ゾーン単位)をワールドの m へ換算する(`bendGain` 込み)。 */
function bendWorldOf(flight: PitchFlight): Vec3 {
  const { bend } = getPitchSpec(flight.kind);
  return { x: bend.x * WORLD_PARAMS.zone.halfWidth * bendGain, y: bend.y * ZONE_HALF_HEIGHT * bendGain, z: 0 };
}

/** 進行の時間写像 `g(p) = p + speedProfile × p(1 − p)`。`g(0) = 0`・`g(1) = 1` で、`speedProfile ≤ 1` なら単調増加。 */
function progressMap(progress: number): number {
  return progress + speedProfile * progress * (1 - progress);
}

/**
 * リリース後 `elapsedMs` のボール位置。進行度 `p = clamp(elapsed / durationMs, 0, 1)`。
 * `pos(p) = lerp(release, landing, g(p)) + break × (pⁿ − p) + (0, 4 × arcHeight × p(1 − p), 0)`。
 * `break` = 球種の終盤の曲がり量 × `bendGain`(ワールドの m)。着弾点に向かう直線から `−break` の側へ出て、終盤に `+break` の向きへ曲がり込む。
 * `g` は出だしを速く・到達時を遅くする時間写像(遠近法で画面上の速さを均す見かけの調整)。
 * `p = 0` はリリース点、`p = 1` は `zoneToWorld(landing)` に厳密一致する。z は単調に増える。
 */
export function pitchBallAt(flight: PitchFlight, elapsedMs: number): Vec3 {
  const progress = flight.durationMs > 0 ? clamp(elapsedMs / flight.durationMs, 0, 1) : 1;
  const landing = zoneToWorld(flight.landing);
  if (progress >= 1) {
    return landing;
  }
  const bend = bendWorldOf(flight);
  const straight = lerpVec3(RELEASE_POINT, landing, progressMap(progress));
  const swing = Math.pow(progress, breakExponent) - progress;
  return {
    x: straight.x + bend.x * swing,
    y: straight.y + bend.y * swing + arcHeight * 4 * progress * (1 - progress),
    z: straight.z,
  };
}

/**
 * 到達後(`durationMs` 以降)のボール位置 = 着弾点(ゾーン平面)。ミットへは動かさない。
 * `pitchBallAt(flight, durationMs)` に厳密一致する。
 */
export function heldBallAt(flight: PitchFlight): Vec3 {
  return zoneToWorld(flight.landing);
}
