import type { CameraPose, Vec3 } from "../../../types/scene";
import { clamp } from "../../pitch/zone";
import { WORLD_PARAMS } from "../space/params";
import { lerp, lerpVec3 } from "../space/vec3";

// カメラ。いずれも状態を持たず、時刻の閉形式で決まる(フレーム依存の平滑化は使わない)。

const BATTING = WORLD_PARAMS.battingCamera;
const CHASE = WORLD_PARAMS.chaseCamera;

/** 打撃カメラ(捕手後方。固定)。 */
export function battingCamera(): CameraPose {
  return {
    position: { ...BATTING.position },
    target: { ...BATTING.target },
    fovDeg: BATTING.fovDeg,
  };
}

/** 打球 `ball` を追う中継カメラ(本塁後方の高い位置)。 */
export function chaseCamera(ball: Vec3): CameraPose {
  return {
    position: { x: ball.x * CHASE.kx, y: CHASE.baseY + ball.y * CHASE.ky, z: CHASE.baseZ + ball.z * CHASE.kz },
    target: { x: ball.x, y: Math.max(0, ball.y * CHASE.kLook), z: ball.z },
    fovDeg: CHASE.fovDeg,
  };
}

/** smoothstep。`x` は 0〜1 にクランプする。 */
export function easeInOut(x: number): number {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * 2つのカメラの補間。`k` は位置と視野角の割合、`targetK`(省略時は `k`)は注視点の割合で、位置と注視点を別の速さで動かせる。
 * `k = 0` で `a`、`k = 1` で `b` に厳密一致する。
 */
export function blendCamera(a: CameraPose, b: CameraPose, k: number, targetK = k): CameraPose {
  return {
    position: lerpVec3(a.position, b.position, k),
    target: lerpVec3(a.target, b.target, targetK),
    fovDeg: lerp(a.fovDeg, b.fovDeg, k),
  };
}

/** 接触から `sinceContactMs` 後の、打撃カメラから中継カメラへの移り具合(位置・注視点それぞれ smoothstep、0〜1)。 */
export function chaseBlendAt(sinceContactMs: number): { readonly position: number; readonly target: number } {
  return {
    position: easeInOut(sinceContactMs / CHASE.positionBlendMs),
    target: easeInOut(sinceContactMs / CHASE.targetBlendMs),
  };
}
