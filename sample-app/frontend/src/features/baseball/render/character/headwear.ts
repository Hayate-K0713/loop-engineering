// ヘルメット(打者。投手側の左耳 = +x にフラップ)と帽子(投手・捕手・野手・走者。つば・ロゴ・ボタン)。character 分冊 §3-4-3。
// 頭の外径は素の頭より約 4〜5% 大きい。帽子のつばは前(+z)へ突き出して顔に影を落とす。部品はボーン `head` に付く。
import { anchor, ellipsoid, tube } from "./geometry-merge";
import type { PartContext, SkinPart } from "./geometry-merge";

const HALF = Math.PI / 2;

/** 前半分の円盤(つば)。円柱の周方向を −90°〜+90°(+z 側)にする。 */
const FRONT_HALF = [-HALF, Math.PI] as const;

function cap(ctx: PartContext): SkinPart[] {
  const { colors, detail } = ctx;
  const dome = ellipsoid([0.485, 0.42, 0.495], anchor(ctx, "head", [0, 0.1, 0]), detail.dome, { theta: [0, HALF], rotation: [-0.08, 0, 0] });
  const brim = tube({ top: 0.34, bottom: 0.34 }, 0.035, anchor(ctx, "head", [0, 0.1, 0.34]), detail.radial + 2, {
    depth: 0.85,
    rotation: [0.15, 0, 0],
    theta: FRONT_HALF,
  });
  const parts: SkinPart[] = [
    { geometry: dome, joint: "head", color: colors.cap, shade: [0.8, 1] },
    { geometry: brim, joint: "head", color: colors.cap, shade: [0.85, 0.85] },
  ];
  if (detail.near) {
    const logo = ellipsoid([0.085, 0.085, 0.018], anchor(ctx, "head", [0, 0.28, 0.455]), detail.small, { rotation: [-0.5, 0, 0] });
    const button = ellipsoid([0.04, 0.03, 0.04], anchor(ctx, "head", [0, 0.52, 0]), [6, 4]);
    parts.push({ geometry: logo, joint: "head", color: colors.accent }, { geometry: button, joint: "head", color: colors.accent });
  }
  return parts;
}

function helmet(ctx: PartContext): SkinPart[] {
  const { colors, detail } = ctx;
  const dome = ellipsoid([0.505, 0.45, 0.51], anchor(ctx, "head", [0, 0.06, 0]), detail.dome, { theta: [0, HALF + 0.28] });
  const brim = tube({ top: 0.28, bottom: 0.28 }, 0.03, anchor(ctx, "head", [0, 0.08, 0.4]), detail.radial + 2, {
    depth: 0.6,
    rotation: [0.1, 0, 0],
    theta: FRONT_HALF,
  });
  const flap = ellipsoid([0.06, 0.17, 0.19], anchor(ctx, "head", [0.465, -0.07, -0.02]), detail.small);
  return [
    { geometry: dome, joint: "head", color: colors.helmet, shade: [0.8, 1] },
    { geometry: brim, joint: "head", color: colors.helmet, shade: [0.85, 0.85] },
    { geometry: flap, joint: "head", color: colors.helmet, shade: [0.9, 0.9] },
  ];
}

/** 打者はヘルメット(左耳のフラップ付き)、それ以外は帽子。 */
export function headwearParts(ctx: PartContext): SkinPart[] {
  return ctx.batter ? helmet(ctx) : cap(ctx);
}
