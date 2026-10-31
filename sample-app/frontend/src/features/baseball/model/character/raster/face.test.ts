import { describe, expect, it } from "vitest";
import type { FaceExpression } from "../../../types/scene";
import type { BrowShape, EyeShape, PlayerLook, RestMouth } from "../../../types/team";
import { WORLD_PARAMS } from "../../world/space/params";
import { FACE_ATLAS_HEIGHT, FACE_ATLAS_WIDTH, FACE_EXPRESSION_ORDER, FACE_LAYOUT, SKIN_COLORS, rasterAtlas, rasterPlainAtlas, type FaceAtlas } from "./face";
import { hashBytes, readPixel, rgbOf } from "./primitives";

const FACE = WORLD_PARAMS.character.face;

function look(overrides: Partial<PlayerLook> = {}): PlayerLook {
  return {
    number: 8,
    skin: 1,
    hair: { style: "short", color: 1 },
    build: "normal",
    eyes: "round",
    brow: "thin",
    restMouth: "flat",
    pitchForm: "over",
    batStance: "open",
    ...overrides,
  };
}

function cellOrigin(expression: FaceExpression): { x: number; y: number } {
  const index = FACE_EXPRESSION_ORDER.indexOf(expression);
  return { x: (index % FACE.columns) * FACE.cell, y: Math.floor(index / FACE.columns) * FACE.cell };
}

/** セル 1 枚分の画素を詰めた配列。 */
function cellBytes(atlas: FaceAtlas, expression: FaceExpression): Uint8Array {
  const { x, y } = cellOrigin(expression);
  const out = new Uint8Array(FACE.cell * FACE.cell * 4);
  for (let row = 0; row < FACE.cell; row += 1) {
    const start = ((y + row) * atlas.width + x) * 4;
    out.set(atlas.rgba.subarray(start, start + FACE.cell * 4), row * FACE.cell * 4);
  }
  return out;
}

function differingPixels(a: Uint8Array, b: Uint8Array): number {
  let count = 0;
  for (let p = 0; p < a.length; p += 4) {
    if (a.subarray(p, p + 4).some((value, k) => value !== b.at(p + k))) count += 1;
  }
  return count;
}

const buffers = (atlas: FaceAtlas) => ({ width: atlas.width, height: atlas.height, data: atlas.rgba, view: new DataView(atlas.rgba.buffer) });

/** 期待するハッシュ(固定の `look` の顔アトラスの FNV-1a)。ラスタの描き方を意図して変えたときだけ更新する。 */
const EXPECTED_ATLAS_HASH = 3493521304;

describe("rasterAtlas: 大きさと決定論", () => {
  it("セルの並びが WORLD_PARAMS.character.face.order と一致し、セル数(列×行)と合う", () => {
    expect([...FACE_EXPRESSION_ORDER]).toEqual([...FACE.order]);
    expect(FACE.columns * FACE.rows).toBe(FACE_EXPRESSION_ORDER.length);
  });

  it("384×192×4 バイトで、全画素が不透明", () => {
    const atlas = rasterAtlas(look());
    expect(atlas.width).toBe(384);
    expect(atlas.height).toBe(192);
    expect(atlas.cell).toBe(96);
    expect(atlas.rgba).toHaveLength(384 * 192 * 4);
    expect(FACE_ATLAS_WIDTH * FACE_ATLAS_HEIGHT * 4).toBe(atlas.rgba.length);
    expect(atlas.rgba.filter((_, i) => i % 4 === 3).every((alpha) => alpha === 255)).toBe(true);
  });

  it("同じ入力で同じ出力(ハッシュが固定)", () => {
    const first = rasterAtlas(look());
    const second = rasterAtlas(look());
    expect(hashBytes(first.rgba)).toBe(hashBytes(second.rgba));
    expect(hashBytes(first.rgba)).toBe(EXPECTED_ATLAS_HASH);
  });

  it("生成時間は参考値として出力するだけ(判定に使わない)", () => {
    const started = performance.now();
    const atlas = rasterAtlas(look({ eyes: "big" }));
    const elapsed = performance.now() - started;
    console.info(`[E2] 顔アトラス 1 体のラスタ生成: ${elapsed.toFixed(1)} ms(参考値)`);
    expect(atlas.rgba.length).toBeGreaterThan(0);
  });
});

describe("rasterAtlas: 8 表情のセル", () => {
  it("8 表情のセルが互いに異なる画素を持つ(全 28 組で 100 画素以上の差)", () => {
    const atlas = rasterAtlas(look());
    const cells = FACE_EXPRESSION_ORDER.map((expression) => ({ expression, bytes: cellBytes(atlas, expression) }));
    expect(new Set(cells.map((c) => hashBytes(c.bytes))).size).toBe(8);
    const pairs = cells.flatMap((a, i) => cells.slice(i + 1).map((b) => differingPixels(a.bytes, b.bytes)));
    expect(pairs).toHaveLength(28);
    expect(Math.min(...pairs)).toBeGreaterThanOrEqual(100);
  });

  it("各セルの外周 4px は肌色(5 段階すべて)", () => {
    for (const skin of [0, 1, 2, 3, 4] as const) {
      const atlas = rasterAtlas(look({ skin }));
      const [r, g, b] = rgbOf(SKIN_COLORS.at(skin) ?? 0);
      const wrong = FACE_EXPRESSION_ORDER.flatMap((expression) => {
        const { x, y } = cellOrigin(expression);
        const ring = Array.from({ length: FACE.cell * FACE.cell }, (_, i) => ({ px: i % FACE.cell, py: Math.floor(i / FACE.cell) })).filter(
          ({ px, py }) => px < FACE.padPx || py < FACE.padPx || px >= FACE.cell - FACE.padPx || py >= FACE.cell - FACE.padPx,
        );
        return ring.filter(({ px, py }) => readPixel(buffers(atlas), x + px, y + py).join() !== [r, g, b, 255].join());
      });
      expect(wrong).toHaveLength(0);
    }
  });

  it("目の中心画素が不透明で、期待位置にある(round の neutral は瞳孔の色)", () => {
    const atlas = rasterAtlas(look({ eyes: "round" }));
    const { x, y } = cellOrigin("neutral");
    const left = readPixel(buffers(atlas), x + FACE_LAYOUT.centerX - FACE_LAYOUT.eyeDx, y + FACE_LAYOUT.eyeY);
    const right = readPixel(buffers(atlas), x + FACE_LAYOUT.centerX + FACE_LAYOUT.eyeDx, y + FACE_LAYOUT.eyeY);
    expect(left).toEqual([0x14, 0x15, 0x2b, 255]);
    expect(right).toEqual([0x14, 0x15, 0x2b, 255]);
    // 期待位置の外(目の中心から 30px 下の頬の外)は肌色のまま。
    const [r, g, b] = rgbOf(SKIN_COLORS.at(1) ?? 0);
    expect(readPixel(buffers(atlas), x + FACE_LAYOUT.centerX, y + 20)).toEqual([r, g, b, 255]);
  });

  it("どの目の形・どの表情でも、目の中心画素は肌色でない(まばたき・笑顔の閉じた目を除く)", () => {
    const shapes: readonly EyeShape[] = ["round", "sharp", "droopy", "big"];
    const open: readonly FaceExpression[] = ["neutral", "focus", "effort", "shock", "sad"];
    const skin = rgbOf(SKIN_COLORS.at(1) ?? 0);
    const onSkin = shapes.flatMap((eyes) => {
      const atlas = rasterAtlas(look({ eyes }));
      return open.filter((expression) => {
        const { x, y } = cellOrigin(expression);
        const [r, g, b, a] = readPixel(buffers(atlas), x + FACE_LAYOUT.centerX - FACE_LAYOUT.eyeDx, y + FACE_LAYOUT.eyeY);
        return a !== 255 || (r === skin[0] && g === skin[1] && b === skin[2]);
      });
    });
    expect(onSkin).toHaveLength(0);
  });
});

describe("rasterAtlas: 見た目の違い", () => {
  it("目の形 4 種が異なる(neutral のセルの画素が全組で 80 画素以上違う)", () => {
    const shapes: readonly EyeShape[] = ["round", "sharp", "droopy", "big"];
    const cells = shapes.map((eyes) => cellBytes(rasterAtlas(look({ eyes })), "neutral"));
    expect(new Set(cells.map((bytes) => hashBytes(bytes))).size).toBe(4);
    const pairs = cells.flatMap((a, i) => cells.slice(i + 1).map((b) => differingPixels(a, b)));
    expect(Math.min(...pairs)).toBeGreaterThanOrEqual(80);
  });

  it("眉 3 種・普段の口 3 種も neutral のセルを変える", () => {
    const brows: readonly BrowShape[] = ["thin", "thick", "angled"];
    const mouths: readonly RestMouth[] = ["flat", "smile", "small"];
    const browHashes = brows.map((brow) => hashBytes(cellBytes(rasterAtlas(look({ brow })), "neutral")));
    const mouthHashes = mouths.map((restMouth) => hashBytes(cellBytes(rasterAtlas(look({ restMouth })), "neutral")));
    expect(new Set(browHashes).size).toBe(3);
    expect(new Set(mouthHashes).size).toBe(3);
  });

  it("肌色の違いはアトラス全体に出る", () => {
    const hashes = ([0, 1, 2, 3, 4] as const).map((skin) => hashBytes(rasterAtlas(look({ skin })).rgba));
    expect(new Set(hashes).size).toBe(5);
  });
});

describe("rasterPlainAtlas", () => {
  it("肌色のセルだけ(384×192、全画素が同じ色で不透明)", () => {
    const atlas = rasterPlainAtlas(3);
    const [r, g, b] = rgbOf(SKIN_COLORS.at(3) ?? 0);
    expect(atlas.rgba).toHaveLength(384 * 192 * 4);
    expect(readPixel(buffers(atlas), 0, 0)).toEqual([r, g, b, 255]);
    expect(readPixel(buffers(atlas), 383, 191)).toEqual([r, g, b, 255]);
    expect(readPixel(buffers(atlas), 100, 50)).toEqual([r, g, b, 255]);
  });
});
