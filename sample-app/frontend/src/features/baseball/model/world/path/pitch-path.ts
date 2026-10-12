import type { PitchFlight } from "../../../types/pitch";
import type { Vec3 } from "../../../types/scene";
import { getPitchSpec } from "../../pitch/kinds";
import { clamp } from "../../pitch/zone";
import { ZONE_HALF_HEIGHT, zoneToWorld } from "../space/coords";
import { RELEASE_POINT, WORLD_PARAMS } from "../space/params";
import { addVec3, lerpVec3 } from "../space/vec3";

// 投球のボール軌道(表示専用。判定には使わない)。ゾーン到達時刻 = `flight.durationMs`。

const { bendGain, arcHeight } = WORLD_PARAMS.pitch;
const MITT = WORLD_PARAMS.mitt;

/** 球種の曲がり量(ゾーン単位)をワールドの m へ換算する。 */
function bendWorldOf(flight: PitchFlight): Vec3 {
  const { bend } = getPitchSpec(flight.kind);
  return { x: bend.x * WORLD_PARAMS.zone.halfWidth * bendGain, y: bend.y * ZONE_HALF_HEIGHT * bendGain, z: 0 };
}

/**
 * リリース後 `elapsedMs` のボール位置。進行度 `p = clamp(elapsed / durationMs, 0, 1)`。
 * 曲がり量だけずらした点 `aim'` へ直進し、終盤に `p³` で曲がり(`− bend × p³`)、放物線の持ち上げ(`arcHeight × 4p(1−p)`)を足す。
 * `p = 0` はリリース点、`p = 1` は `zoneToWorld(landing)` に厳密一致する。z は単調に増える。
 */
export function pitchBallAt(flight: PitchFlight, elapsedMs: number): Vec3 {
  const progress = flight.durationMs > 0 ? clamp(elapsedMs / flight.durationMs, 0, 1) : 1;
  const landing = zoneToWorld(flight.landing);
  if (progress >= 1) {
    return landing;
  }
  const bend = bendWorldOf(flight);
  const straight = lerpVec3(RELEASE_POINT, addVec3(landing, bend), progress);
  const late = progress * progress * progress;
  return {
    x: straight.x - bend.x * late,
    y: straight.y - bend.y * late + arcHeight * 4 * progress * (1 - progress),
    z: straight.z,
  };
}

/**
 * ゾーン到達(`durationMs`)後 `sinceArrivalMs` のボール位置(見逃し・空振り・人間の判定待ち)。
 * 着弾点からミット(z = `mitt.z`、y = 着弾点の y + `yOffset`)へ `travelMs` で線形に進み、以降はミットで止まる。
 * `sinceArrivalMs = 0` は `pitchBallAt(flight, durationMs)` に厳密一致する。
 */
export function mittBallAt(flight: PitchFlight, sinceArrivalMs: number): Vec3 {
  const landing = zoneToWorld(flight.landing);
  const mitt: Vec3 = { x: landing.x, y: landing.y + MITT.yOffset, z: MITT.z };
  if (sinceArrivalMs <= 0) {
    return landing;
  }
  return sinceArrivalMs >= MITT.travelMs ? mitt : lerpVec3(landing, mitt, sinceArrivalMs / MITT.travelMs);
}
