import type { PitchKind } from "../../../types/pitch";
import type { Rot3 } from "../../../types/scene";
import { WORLD_PARAMS } from "../space/params";

// ボールの見え方(縫い目の回転・ハロー)の純関数。縁取りの太さ(`outlineScale`)と最小表示径(`scale`)はカメラ関数(`camera/rig.ts`)が決める。

const BALL = WORLD_PARAMS.ball;

/**
 * 縫い目の回転(Euler XYZ、rad)。球種ごとの角速度(`WORLD_PARAMS.ball.spin`、rad/s)× リリースからの経過時間。
 * 経過が負・有限でないときは 0(回転なし)。球種の見分けは回転の軸と速さ(フォークが最小)で行う。
 */
export function ballSpinAt(kind: PitchKind, tMs: number): Rot3 {
  const seconds = Number.isFinite(tMs) ? Math.max(0, tMs) / 1000 : 0;
  const spin = BALL.spin[kind];
  return { x: spin.x * seconds, y: spin.y * seconds, z: spin.z * seconds };
}

/** 球の後ろに敷く暖色のハローの不透明度。ハローは必須なので常に 0 より大きい(背景によらずボールを見えるようにする)。 */
export function ballHaloAt(): number {
  return BALL.halo.opacity;
}
