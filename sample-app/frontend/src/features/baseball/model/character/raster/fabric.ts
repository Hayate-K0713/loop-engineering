// ユニフォームの生地のラスタ(E2。純粋関数)。ピンストライプの縞を 64×64 の RGBA に描く(`Team.pinstripe` のチームの胴。近景のみ。
// チームごとに 1 枚を共有)。縦に繰り返してもつなぎ目が出ないよう、縞の間隔は一辺 64 の約数にする。character 分冊 §3-4-4。
import { createBuffer, mixColor, blendPixel } from "./primitives";

/** 縞のテクスチャの一辺(px)。 */
export const FABRIC_SIZE = 64;

/** 縞の間隔(px)。`FABRIC_SIZE` の約数なので、タイリングでつなぎ目が出ない。 */
export const STRIPE_PITCH = 8;

/** ピンストライプの RGBA。 */
export type FabricTexture = { readonly width: number; readonly height: number; readonly rgba: Uint8Array };

/**
 * `base`(地の色)に `stripe`(縞の色)の細い縦縞を `STRIPE_PITCH` ごとに引いた 64×64 の不透明な RGBA。
 * 縞は 1.4px 幅で縁をなめらかにし、ごく弱い縦方向の濃淡(織り目の擬似表現)を足す。同じ入力なら常に同じ出力。
 */
export function rasterPinstripe(base: number, stripe: number): FabricTexture {
  const buffer = createBuffer(FABRIC_SIZE, FABRIC_SIZE, base, 255);
  for (let y = 0; y < FABRIC_SIZE; y += 1) {
    const weave = y % 2 === 0 ? 0 : 0.04;
    const rowColor = mixColor(base, 0x000000, weave);
    for (let x = 0; x < FABRIC_SIZE; x += 1) {
      blendPixel(buffer, x, y, rowColor, 1);
      const distance = Math.abs(((x + 0.5) % STRIPE_PITCH) - STRIPE_PITCH / 2);
      const coverage = Math.min(1, Math.max(0, 0.5 + 0.7 - distance));
      if (coverage > 0) blendPixel(buffer, x, y, stripe, coverage);
    }
  }
  return { width: FABRIC_SIZE, height: FABRIC_SIZE, rgba: buffer.data };
}
