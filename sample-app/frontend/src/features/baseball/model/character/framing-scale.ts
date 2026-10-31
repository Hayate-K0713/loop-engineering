import type { CharacterSlot } from "../../types/scene";
import { WORLD_PARAMS } from "../world/space/params";

// 構図の倍率 `framingScale`(character 分冊 §3-4-1)。縦長の打撃/守備カメラでは打者を小さく(0.70)・投手を大きく(1.30)して構図を作るが、
// カメラが動き出したら(追跡カメラ・内野カメラ)1.0 へ戻す。倍率は表示専用で、走者の経路・送球・軌道には影響しない。
// ワイプ・リプレイのキャラクターは実寸なので、呼び出し側が `cameraBlend = 1`(または `framingScaleAt` を使わず 1.0)にする。

const FRAMING = WORLD_PARAMS.actors.framingScale;

/** スロットごとの構図の倍率(縦長の打撃/守備カメラ。`cameraBlend = 0` のとき)。打者・投手以外は常に 1.0。 */
export function framingScaleOf(slot: CharacterSlot): number {
  switch (slot) {
    case "batter":
      return FRAMING.batter;
    case "pitcher":
      return FRAMING.pitcher;
    default:
      return FRAMING.others;
  }
}

/** `cameraBlend` を 0〜1 に丸める。有限でない値は 0(構図の倍率のまま)。 */
function clampBlend(cameraBlend: number): number {
  if (!Number.isFinite(cameraBlend)) {
    return 0;
  }
  return Math.min(1, Math.max(0, cameraBlend));
}

/**
 * 表示倍率 =`lerp(framingScale, 1.0, cameraBlend)`。`cameraBlend` は追跡カメラの blend と内野カメラの blend の大きいほう(0〜1)。
 * `cameraBlend` について連続・`cameraBlend = 1` で全スロット 1.0・走者/野手/捕手は常に 1.0。
 */
export function framingScaleAt(slot: CharacterSlot, cameraBlend: number): number {
  const blend = clampBlend(cameraBlend);
  return framingScaleOf(slot) * (1 - blend) + blend;
}
