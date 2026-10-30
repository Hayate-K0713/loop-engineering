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
  const spin = spinOf(kind);
  // `0 +` で −0 を +0 にそろえる(角速度が負で t = 0 のとき)。
  return { x: 0 + spin.x * seconds, y: 0 + spin.y * seconds, z: 0 + spin.z * seconds };
}

function spinOf(kind: PitchKind): Rot3 {
  switch (kind) {
    case "straight":
      return BALL.spin.straight;
    case "slider":
      return BALL.spin.slider;
    case "curve":
      return BALL.spin.curve;
    case "fork":
      return BALL.spin.fork;
    case "shoot":
      return BALL.spin.shoot;
  }
}

/** 球の後ろに敷く暖色のハローの不透明度。ハローは必須なので常に 0 より大きい(背景によらずボールを見えるようにする)。 */
export function ballHaloAt(): number {
  return BALL.halo.opacity;
}
