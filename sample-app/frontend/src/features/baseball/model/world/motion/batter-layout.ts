import { portraitBlendAt } from "../camera/rig";
import { WORLD_PARAMS } from "../space/params";
import { lerp } from "../space/vec3";
import { batterSwingPose } from "./batter";
import { SWING_CONTACT_PROGRESS } from "./rig";
import type { PoseRoot } from "./pose";

// 打者のレイアウト(足元の位置・大きさ・バット軸の長さ)。縦長(縦横比 ≤ 0.7)と横長(≥ 1.0)の値を、カメラと同じ縦横比の補間 `k = portraitBlendAt(aspect)` で混ぜる。
// 横長(k = 0)は v2 と厳密に同値(x −0.8・scale 0.92・バット 1.0)。縦長は v3 の構図(x −0.65・scale 0.70・バット 1.35 倍。play 分冊 §3-1)。
// 状態を持たず、three は import しない。

const BATTER = WORLD_PARAMS.actors.batter;

/** バットの円柱の根元側の端から先端までの軸方向の長さ(m)。`render/character.ts` の円柱(中心 z 0.5・長さ 0.95)の先端 0.975。 */
const BAT_TIP_Z = 0.975;
/** スイングのグループの原点(握りの位置)のオフセット(m。打者ローカルの +z)。バットの長さ倍率では伸ばさない。 */
const BAT_GRIP_OFFSET_Z = 0.05;

/**
 * 縦横比 `aspect` の打者の足元(位置・向き・拡大率)。x は横長 `position.x` から縦長 `portraitX`、拡大率は `scale` から `portraitScale` へ
 * `k = portraitBlendAt(aspect)` で線形に混ぜる(y・z・向きは不変)。返す `scale` は補間後の値で、`frame.ts` の `batHeightInRoot` はこの値で割る。
 * 無効な縦横比(NaN・0 以下)は横長。
 */
export function batterRootFor(aspect: number): PoseRoot {
  const k = portraitBlendAt(aspect);
  return {
    position: { x: lerp(BATTER.position.x, BATTER.portraitX, k), y: BATTER.position.y, z: BATTER.position.z },
    yaw: BATTER.yaw,
    scale: lerp(BATTER.scale, BATTER.portraitScale, k),
  };
}

/** バット軸(チルトのグループの z 方向)の長さ倍率(`BatPose.lengthScale`)。横長 `batLength`(1.0)から縦長 `portraitBatLength`(1.35)へ `k` で混ぜる。 */
export function batLengthScaleFor(aspect: number): number {
  return lerp(BATTER.batLength, BATTER.portraitBatLength, portraitBlendAt(aspect));
}

/**
 * 接触の瞬間(`SWING_CONTACT_PROGRESS`)のバット先端のワールド x(m)。打者は yaw π/2 でバットが +x 方向に伸びる。
 * `先端 x = x_b + scale × (0.05 + 0.975 × L × cos(tilt) × cos(sweepYaw))`(`x_b` = `batterRootFor(aspect).position.x`、`L` = `batLengthScaleFor(aspect)`)。
 * `tilt`・`sweepYaw` は省略時、その縦横比の接触姿勢(`batterSwingPose`)の値(接触以降は縦長も横長と同じ姿勢なので −0.05・−0.1)。
 */
export function batTipX(aspect: number, tilt?: number, sweepYaw?: number): number {
  const root = batterRootFor(aspect);
  const contact = batterSwingPose(SWING_CONTACT_PROGRESS, 1, portraitBlendAt(aspect)).bat;
  const along = BAT_TIP_Z * batLengthScaleFor(aspect) * Math.cos(tilt ?? contact.tilt) * Math.cos(sweepYaw ?? contact.sweepYaw);
  return root.position.x + root.scale * (BAT_GRIP_OFFSET_Z + along);
}
