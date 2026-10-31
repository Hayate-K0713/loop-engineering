// 背番号のラスタ(E2。純粋関数)。0〜99 の太い数字を、自前の 5×7 グリッドのビットマップフォントを拡大して RGBA に描く。
// 胴の背中側に貼る 64×48 の小さなクアッド用(`DECAL_SIZE` と同じ寸法・向き。データの先頭の行 = 絵の上端)。背景は透明。character 分冊 §3-4-4。
import { boundsAround, createBuffer, paintSdf, type Bounds, type Sdf } from "./primitives";

/** 背番号のテクスチャの寸法(px)。`render/character/parts.ts` の `DECAL_SIZE` と同値(render は model を import しないため複製)。 */
export const NUMBER_DECAL_WIDTH = 64;
export const NUMBER_DECAL_HEIGHT = 48;

/** 数字 1 文字の格子(5 列×7 行)。`1` が塗る升。 */
const GLYPH_ROWS = 7;
const GLYPH_COLUMNS = 5;

/** 縁取りの太さ(px)。1 桁の数字(高さ 42px)でも上下 3px の余白に収まる太さ。 */
const OUTLINE_PX = 2;

const FONT: readonly (readonly string[])[] = [
  ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
];

/** 背番号の配色(24bit RGB)。`fill` = 数字の色、`outline` = 縁取りの色(チーム色とのコントラストのために付ける)。 */
export type NumberColors = { readonly fill: number; readonly outline: number };

/** 背番号の RGBA(`CharacterLookData.numberDecal` と同じ形)。 */
export type NumberDecal = { readonly width: number; readonly height: number; readonly rgba: Uint8Array };

type Cell = { readonly column: number; readonly row: number };

/** 背番号 `value` を 10 の位・1 の位の数字に分ける。範囲外は 0〜99 に丸める。 */
export function digitsOf(value: number): readonly number[] {
  const clamped = Math.min(99, Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0)));
  return clamped >= 10 ? [Math.floor(clamped / 10), clamped % 10] : [clamped];
}

function glyphCells(digit: number): readonly Cell[] {
  const rows = FONT.at(digit) ?? [];
  return rows.flatMap((row, rowIndex) => [...row].flatMap((ch, columnIndex) => (ch === "1" ? [{ column: columnIndex, row: rowIndex }] : [])));
}

function boxDistance(cx: number, cy: number, half: number): Sdf {
  return (x, y) => {
    const qx = Math.abs(x - cx) - half;
    const qy = Math.abs(y - cy) - half;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
  };
}

/** 全文字の升を並べた正方形の和集合(隣り合う升は継ぎ目なく融合する)。 */
function numberShape(value: number, scale: number): { readonly sdf: Sdf; readonly bounds: Bounds } {
  const digits = digitsOf(value);
  const gap = digits.length > 1 ? 1 : 0;
  const widthCells = digits.length * GLYPH_COLUMNS + gap;
  // 升の縁が画素の境目に揃うよう整数に丸める(縁の画素中心が d = 0 になって継ぎ目が出るのを避ける)。
  const left = Math.floor((NUMBER_DECAL_WIDTH - widthCells * scale) / 2);
  const top = Math.floor((NUMBER_DECAL_HEIGHT - GLYPH_ROWS * scale) / 2);
  const boxes = digits.flatMap((digit, digitIndex) =>
    glyphCells(digit).map((cell) =>
      boxDistance(left + ((digitIndex * (GLYPH_COLUMNS + 1) + cell.column) + 0.5) * scale, top + (cell.row + 0.5) * scale, scale / 2),
    ),
  );
  const sdf: Sdf = (x, y) => {
    let best = Infinity;
    for (const box of boxes) best = Math.min(best, box(x, y));
    return best;
  };
  const bounds = { x0: left, y0: top, x1: left + widthCells * scale, y1: top + GLYPH_ROWS * scale };
  return { sdf, bounds };
}

/**
 * 背番号 `value`(0〜99)の 64×48 RGBA。透明な背景に、縁取り(`outline`)つきの太い数字(`fill`)を中央に描く。
 * 1 桁は大きく(升 6px)、2 桁は升 5px。同じ入力なら常に同じ出力。
 */
export function rasterNumber(value: number, colors: NumberColors): NumberDecal {
  const buffer = createBuffer(NUMBER_DECAL_WIDTH, NUMBER_DECAL_HEIGHT, 0x000000, 0);
  const scale = digitsOf(value).length === 1 ? 6 : 5;
  const { sdf, bounds } = numberShape(value, scale);
  const clip = { x0: 0, y0: 0, x1: NUMBER_DECAL_WIDTH, y1: NUMBER_DECAL_HEIGHT };
  const placement = { offsetX: 0, offsetY: 0, clip };
  const wide = boundsAround((bounds.x0 + bounds.x1) / 2, (bounds.y0 + bounds.y1) / 2, NUMBER_DECAL_WIDTH);
  paintSdf(buffer, placement, wide, (x, y) => sdf(x, y) - OUTLINE_PX, colors.outline);
  paintSdf(buffer, placement, bounds, sdf, colors.fill);
  return { width: NUMBER_DECAL_WIDTH, height: NUMBER_DECAL_HEIGHT, rgba: buffer.data };
}
