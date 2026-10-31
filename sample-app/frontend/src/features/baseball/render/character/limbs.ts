// 腕(上腕 + 前腕 + 手)と脚(大腿 + 下腿 + 靴)。肘・膝は関節の球で継ぎ目を隠す(剛体のスキンのため接合部は部品の重なりで隠す)。
// 脚の幅は体格の倍率 `ctx.build` で変わる。腕の太さは体格によらず一定(肩の位置だけが体格に追従する。`skeleton.ts`)。
import type { BufferGeometry } from "three";
import type { CharacterJoint } from "../../types/scene";
import { anchor, ellipsoid, tube } from "./geometry-merge";
import type { PartContext, SkinPart, Triple } from "./geometry-merge";

type Side = { readonly upper: CharacterJoint; readonly fore: CharacterJoint; readonly thigh: CharacterJoint; readonly shin: CharacterJoint };

/** 左(+x)・右(−x)。ポーズの `armL` 等は左が +x 側。 */
const SIDES: readonly Side[] = [
  { upper: "upperArmL", fore: "foreArmL", thigh: "thighL", shin: "shinL" },
  { upper: "upperArmR", fore: "foreArmR", thigh: "thighR", shin: "shinR" },
];

function ball(ctx: PartContext, radius: number, joint: CharacterJoint, local: Triple, color: number): SkinPart {
  const geometry: BufferGeometry = ellipsoid([radius, radius, radius], anchor(ctx, joint, local), ctx.detail.small);
  return { geometry, joint, color };
}

function armParts(ctx: PartContext, side: Side): SkinPart[] {
  const { rig, colors, detail } = ctx;
  const upper = tube({ top: 0.08, bottom: 0.075 }, rig.upperArm + 0.02, anchor(ctx, side.upper, [0, -rig.upperArm / 2, 0]), detail.radial);
  const foreLength = rig.foreArm - 0.03;
  const fore = tube({ top: 0.075, bottom: 0.065 }, foreLength, anchor(ctx, side.fore, [0, -foreLength / 2, 0]), detail.radial);
  const hand = ellipsoid([0.09, 0.09, 0.09], anchor(ctx, side.fore, [0, -rig.foreArm, 0]), detail.medium);
  const parts: SkinPart[] = [
    ball(ctx, 0.09, side.upper, [0, 0, 0], colors.base),
    { geometry: upper, joint: side.upper, color: colors.base, shade: [0.85, 1] },
    { geometry: fore, joint: side.fore, color: colors.base, shade: [0.85, 1] },
    { geometry: hand, joint: side.fore, color: colors.skin },
  ];
  if (detail.near) parts.push(ball(ctx, 0.075, side.fore, [0, 0, 0], colors.base));
  return parts;
}

function legParts(ctx: PartContext, side: Side): SkinPart[] {
  const { rig, colors, detail, build } = ctx;
  const shinPants = rig.shin * 0.3;
  const shinSock = rig.shin * 0.7 + 0.01;
  const thigh = tube({ top: 0.12 * build, bottom: 0.105 * build }, rig.thigh + 0.02, anchor(ctx, side.thigh, [0, -rig.thigh / 2, 0]), detail.radial);
  const pants = tube({ top: 0.09 * build, bottom: 0.085 * build }, shinPants, anchor(ctx, side.shin, [0, -shinPants / 2, 0]), detail.radial);
  const sock = tube({ top: 0.082 * build, bottom: 0.075 * build }, shinSock, anchor(ctx, side.shin, [0, -shinPants - shinSock / 2 + 0.01, 0]), detail.radial);
  const shoe = ellipsoid([0.11 * build, 0.07, 0.17], anchor(ctx, side.shin, [0, -rig.shin + 0.065, 0.06]), detail.medium);
  const parts: SkinPart[] = [
    { geometry: thigh, joint: side.thigh, color: colors.pants, shade: [0.9, 1] },
    { geometry: pants, joint: side.shin, color: colors.pants, shade: [0.9, 1] },
    { geometry: sock, joint: side.shin, color: colors.socks },
    { geometry: shoe, joint: side.shin, color: colors.shoe, shade: [0.8, 1] },
  ];
  if (detail.near) parts.push(ball(ctx, 0.095 * build, side.shin, [0, 0, 0], colors.pants));
  return parts;
}

/** 両腕と両脚。 */
export function limbParts(ctx: PartContext): SkinPart[] {
  return SIDES.flatMap((side) => [...armParts(ctx, side), ...legParts(ctx, side)]);
}
