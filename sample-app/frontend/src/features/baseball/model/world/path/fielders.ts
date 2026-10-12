import type { Vec3 } from "../../../types/scene";
import { clamp } from "../../pitch/zone";
import { WORLD_PARAMS } from "../space/params";
import { distanceXZ, lerpVec3 } from "../space/vec3";

// 野手7人の守備位置と、打球に対する最寄りの野手・走行の位置。

export type FielderId = "first" | "second" | "shortstop" | "third" | "left" | "center" | "right";

export type FielderSlot = {
  readonly id: FielderId;
  /** 守備位置(足元。y = 0)。 */
  readonly position: Vec3;
};

const POSITIONS = WORLD_PARAMS.fielders;

function slot(id: FielderId, position: { readonly x: number; readonly z: number }): FielderSlot {
  return { id, position: { x: position.x, y: 0, z: position.z } };
}

/** 野手7人(固定順: 一塁・二塁・遊撃・三塁・左・中・右)。`SceneFrame.fielders` の添字と一致する。 */
export const FIELDER_SLOTS: readonly FielderSlot[] = [
  slot("first", POSITIONS.first),
  slot("second", POSITIONS.second),
  slot("shortstop", POSITIONS.shortstop),
  slot("third", POSITIONS.third),
  slot("left", POSITIONS.left),
  slot("center", POSITIONS.center),
  slot("right", POSITIONS.right),
];

/** 落下点 `target` に水平距離(XZ)が最も近い野手の添字。同じ距離なら添字の小さい方。 */
export function pickFielder(target: Vec3): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  FIELDER_SLOTS.forEach((fielder, index) => {
    const distance = distanceXZ(fielder.position, target);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

/** 野手の走行中の位置。`progress`(0〜1 にクランプ)で `from` から `to` へ線形に進む。 */
export function fielderRunAt(from: Vec3, to: Vec3, progress: number): Vec3 {
  return lerpVec3(from, to, clamp(progress, 0, 1));
}
