// 道具: 左手のグローブ(投手・捕手・野手)とバット(打者)。character 分冊 §3-4-4・§3-4-6。
// バットはボーン `bat` に統合する。ボーンの局所座標で軸が +z(握りの端が原点側、太い端が +z)なので、`BatPose` は
// ボーンの回転(YXZ: スイング y の中にチルト x)・`position.y`(高さ)・`scale.z`(長さ。`lengthScale`)で表せる(`skeleton.ts`)。
// これは「swing > tilt > バット(軸が tilt の z)」の入れ子と同じ行列になる(T · Ry · Rx · Sz)。
import { anchor, ellipsoid, tube } from "./geometry-merge";
import type { PartContext, SkinPart, Triple } from "./geometry-merge";

/** バットの寸法(m)。全長は握りの端から先端まで。 */
const BAT = { grip: 0.3, barrel: 0.65, knob: 0.04, start: 0.025 } as const;

/** 左手(`foreArmL` の先)のグローブ。 */
function glove(ctx: PartContext): SkinPart[] {
  const { rig, colors, detail } = ctx;
  const geometry = ellipsoid([0.15, 0.165, 0.09], anchor(ctx, "foreArmL", [0, -(rig.foreArm + 0.02), 0.03]), detail.medium);
  return [{ geometry, joint: "foreArmL", color: colors.glove, shade: [0.85, 1] }];
}

/** バット(ボーン `bat`)。握り(暗い色)と太い先(木の色)と、握りの端のふくらみ。 */
function bat(ctx: PartContext): SkinPart[] {
  const { colors, detail } = ctx;
  const along = (distance: number): Triple => anchor(ctx, "bat", [0, 0, distance]);
  const axis: Triple = [Math.PI / 2, 0, 0];
  const radial = detail.near ? 10 : 6;
  const gripLength = BAT.grip;
  const barrelLength = BAT.barrel;
  const handle = tube({ top: 0.03, bottom: 0.028 }, gripLength, along(BAT.start + gripLength / 2), radial, { rotation: axis });
  const barrel = tube({ top: 0.05, bottom: 0.032 }, barrelLength, along(BAT.start + gripLength + barrelLength / 2), radial, { rotation: axis });
  const knob = ellipsoid([BAT.knob, BAT.knob, BAT.knob], along(BAT.start), [6, 4]);
  return [
    { geometry: handle, joint: "bat", color: colors.grip },
    { geometry: barrel, joint: "bat", color: colors.wood },
    { geometry: knob, joint: "bat", color: colors.grip },
  ];
}

/** 道具の部品。グローブは `ctx.glove`、バットは `ctx.batter` のときだけ。 */
export function gearParts(ctx: PartContext): SkinPart[] {
  return [...(ctx.glove ? glove(ctx) : []), ...(ctx.batter ? bat(ctx) : [])];
}
