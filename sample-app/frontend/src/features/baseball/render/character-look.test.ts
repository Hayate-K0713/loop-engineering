import { readFileSync } from "node:fs";
import { ClampToEdgeWrapping, DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping } from "three";
import type { Texture } from "three";
import { describe, expect, it } from "vitest";
import type { FaceExpression } from "../types/scene";
import { FACE_PATCH } from "./character/parts";
import type { FacePatchCell } from "./character/parts";
import { applyExpression, applyLook, PATTERN_SIZE, releaseLook } from "./character-look";
import { makeFakeParts } from "./fake-parts";
import { makeLookData } from "./test-fixtures";

const EXPRESSIONS: readonly FaceExpression[] = ["neutral", "focus", "effort", "shock", "joy", "cheer", "sad", "blink"];

const CELLS = new Map(Object.entries(FACE_PATCH));

function cellOf(expression: FaceExpression): FacePatchCell {
  const cell = CELLS.get(expression);
  if (!cell) throw new Error(`未定義の表情: ${expression}`);
  return cell;
}

/** `dispose` イベントの回数を数える。 */
function countDisposals(texture: Texture): { readonly count: () => number } {
  let disposed = 0;
  texture.addEventListener("dispose", () => {
    disposed += 1;
  });
  return { count: () => disposed };
}

function sizeOf(texture: Texture | null | undefined): number[] {
  if (!(texture instanceof DataTexture)) throw new Error("DataTexture ではない");
  return [texture.image.width, texture.image.height];
}

function faceMapOf(parts: ReturnType<typeof makeFakeParts>): DataTexture {
  const map = parts.faceMaterial.map;
  if (!(map instanceof DataTexture)) throw new Error("顔のテクスチャが貼られていない");
  return map;
}

function patternData(): Uint8Array {
  return new Uint8Array(PATTERN_SIZE * PATTERN_SIZE * 4).fill(200);
}

describe("applyLook: 顔のテクスチャ", () => {
  it("顔アトラスが DataTexture として faceMaterial.map に貼られ、画素と寸法が素データのまま", () => {
    const parts = makeFakeParts();
    const data = makeLookData();
    applyLook(parts, data);
    const map = faceMapOf(parts);
    expect(map.image.width).toBe(data.faceAtlas.width);
    expect(map.image.height).toBe(data.faceAtlas.height);
    expect(map.image.data).toBe(data.faceAtlas.rgba);
    expect(map.flipY).toBe(false);
  });

  it("顔のテクスチャは Linear + mipmap(LinearFilter・LinearMipmapLinearFilter・generateMipmaps)で、端は引き伸ばし", () => {
    const parts = makeFakeParts();
    applyLook(parts, makeLookData());
    const map = faceMapOf(parts);
    expect(map.magFilter).toBe(LinearFilter);
    expect(map.minFilter).toBe(LinearMipmapLinearFilter);
    expect(map.generateMipmaps).toBe(true);
    expect(map.wrapS).toBe(ClampToEdgeWrapping);
    expect(map.wrapT).toBe(ClampToEdgeWrapping);
  });

  it("貼った直後は中立の表情(neutral)のセルが選ばれている", () => {
    const parts = makeFakeParts();
    applyLook(parts, makeLookData());
    const map = faceMapOf(parts);
    expect(map.offset.toArray()).toEqual([FACE_PATCH.neutral.offset.x, FACE_PATCH.neutral.offset.y]);
    expect(map.repeat.toArray()).toEqual([FACE_PATCH.neutral.repeat.x, FACE_PATCH.neutral.repeat.y]);
  });

  it("同じ素データで再呼び出ししても作り直さず、破棄もしない", () => {
    const parts = makeFakeParts();
    const data = makeLookData();
    applyLook(parts, data);
    const first = faceMapOf(parts);
    const disposals = countDisposals(first);
    applyLook(parts, data);
    expect(faceMapOf(parts)).toBe(first);
    expect(disposals.count()).toBe(0);
  });

  it("別の素データで再呼び出しすると古い顔のテクスチャが破棄され、新しいものに替わる(表情は引き継ぐ)", () => {
    const parts = makeFakeParts();
    applyLook(parts, makeLookData());
    applyExpression(parts, "joy");
    const old = faceMapOf(parts);
    const disposals = countDisposals(old);
    applyLook(parts, makeLookData({ faceAtlas: { width: 384, height: 192, cell: 96, rgba: new Uint8Array(384 * 192 * 4).fill(10) } }));
    const next = faceMapOf(parts);
    expect(next).not.toBe(old);
    expect(disposals.count()).toBe(1);
    expect(next.offset.toArray()).toEqual([FACE_PATCH.joy.offset.x, FACE_PATCH.joy.offset.y]);
  });

  it("画素の長さが寸法と合わない顔は貼らず、既存の顔を破棄してマップを外す", () => {
    const parts = makeFakeParts();
    applyLook(parts, makeLookData());
    const old = faceMapOf(parts);
    const disposals = countDisposals(old);
    applyLook(parts, makeLookData({ faceAtlas: { width: 384, height: 192, cell: 96, rgba: new Uint8Array(10) } }));
    expect(parts.faceMaterial.map).toBeNull();
    expect(disposals.count()).toBe(1);
  });

  it("二つのキャラクターが同じ素データを使っても、顔のテクスチャは別々(表情を独立に切り替えられる)", () => {
    const first = makeFakeParts();
    const second = makeFakeParts();
    const data = makeLookData();
    applyLook(first, data);
    applyLook(second, data);
    applyExpression(first, "shock");
    applyExpression(second, "sad");
    expect(faceMapOf(first)).not.toBe(faceMapOf(second));
    expect(faceMapOf(first).offset.toArray()).toEqual([FACE_PATCH.shock.offset.x, FACE_PATCH.shock.offset.y]);
    expect(faceMapOf(second).offset.toArray()).toEqual([FACE_PATCH.sad.offset.x, FACE_PATCH.sad.offset.y]);
  });
});

describe("applyExpression", () => {
  it("表情の切替で texture.offset(と repeat)が FACE_PATCH の値になり、needsUpdate は立たない(version も変わらない)", () => {
    const parts = makeFakeParts();
    applyLook(parts, makeLookData());
    const map = faceMapOf(parts);
    const version = map.version;
    const sourceVersion = map.source.version;
    for (const expression of EXPRESSIONS) {
      applyExpression(parts, expression);
      const cell = cellOf(expression);
      expect(map.offset.toArray()).toEqual([cell.offset.x, cell.offset.y]);
      expect(map.repeat.toArray()).toEqual([cell.repeat.x, cell.repeat.y]);
      expect(map.version).toBe(version);
      expect(map.source.version).toBe(sourceVersion);
    }
  });

  it("切り替えてもテクスチャは同じインスタンスのまま(再アップロード・再生成なし)", () => {
    const parts = makeFakeParts();
    applyLook(parts, makeLookData());
    const map = faceMapOf(parts);
    const disposals = countDisposals(map);
    applyExpression(parts, "cheer");
    applyExpression(parts, "blink");
    expect(faceMapOf(parts)).toBe(map);
    expect(disposals.count()).toBe(0);
  });

  it("8 表情のセルが互いに異なる offset を持つ", () => {
    const keys = EXPRESSIONS.map((expression) => `${cellOf(expression).offset.x},${cellOf(expression).offset.y}`);
    expect(new Set(keys).size).toBe(EXPRESSIONS.length);
  });

  it("顔のテクスチャがまだ無いときは例外にならず、後から貼ったときに反映される", () => {
    const parts = makeFakeParts();
    expect(() => applyExpression(parts, "effort")).not.toThrow();
    applyLook(parts, makeLookData());
    expect(faceMapOf(parts).offset.toArray()).toEqual([FACE_PATCH.effort.offset.x, FACE_PATCH.effort.offset.y]);
  });

  it("別の表情へ切り替えたあと元の表情へ戻すと、offset も元に戻る(同じ表情の省略が誤って働かない)", () => {
    const parts = makeFakeParts();
    applyLook(parts, makeLookData());
    const map = faceMapOf(parts);
    applyExpression(parts, "joy");
    applyExpression(parts, "joy");
    applyExpression(parts, "sad");
    expect(map.offset.toArray()).toEqual([FACE_PATCH.sad.offset.x, FACE_PATCH.sad.offset.y]);
    applyExpression(parts, "joy");
    expect(map.offset.toArray()).toEqual([FACE_PATCH.joy.offset.x, FACE_PATCH.joy.offset.y]);
  });
});

describe("applyLook: 背番号", () => {
  it("近景では decalMaterial.map に Linear + mipmap の DataTexture が貼られる", () => {
    const parts = makeFakeParts();
    const data = makeLookData();
    applyLook(parts, data);
    const map = parts.decalMaterial?.map;
    expect(map).toBeInstanceOf(DataTexture);
    expect(sizeOf(map)).toEqual([data.numberDecal.width, data.numberDecal.height]);
    expect(map?.magFilter).toBe(LinearFilter);
    expect(map?.minFilter).toBe(LinearMipmapLinearFilter);
    expect(map?.generateMipmaps).toBe(true);
  });

  it("遠景(背番号なし)でも例外にならず、顔は貼られる", () => {
    const parts = makeFakeParts({ far: true });
    expect(() => applyLook(parts, makeLookData())).not.toThrow();
    expect(parts.decalMaterial).toBeNull();
    expect(parts.faceMaterial.map).toBeInstanceOf(DataTexture);
  });

  it("同じ素データの背番号は共有され、最後の参照が外れたときに破棄される", () => {
    const first = makeFakeParts();
    const second = makeFakeParts();
    const data = makeLookData();
    applyLook(first, data);
    applyLook(second, data);
    const shared = first.decalMaterial?.map;
    expect(shared).toBeDefined();
    expect(second.decalMaterial?.map).toBe(shared);
    const disposals = countDisposals(shared as Texture);
    releaseLook(first);
    expect(disposals.count()).toBe(0);
    expect(second.decalMaterial?.map).toBe(shared);
    releaseLook(second);
    expect(disposals.count()).toBe(1);
  });

  it("別の背番号で再呼び出しすると、古い背番号は(他に使うものがなければ)破棄される", () => {
    const parts = makeFakeParts();
    applyLook(parts, makeLookData());
    const old = parts.decalMaterial?.map as Texture;
    const disposals = countDisposals(old);
    applyLook(parts, makeLookData({ numberDecal: { width: 64, height: 48, rgba: new Uint8Array(64 * 48 * 4).fill(7) } }));
    expect(parts.decalMaterial?.map).not.toBe(old);
    expect(disposals.count()).toBe(1);
  });

  it("同じ素データで再呼び出ししても背番号は破棄されない", () => {
    const parts = makeFakeParts();
    const data = makeLookData();
    applyLook(parts, data);
    const map = parts.decalMaterial?.map as Texture;
    const disposals = countDisposals(map);
    applyLook(parts, data);
    expect(parts.decalMaterial?.map).toBe(map);
    expect(disposals.count()).toBe(0);
  });
});

describe("applyLook: 胴の縞", () => {
  it("縞の素データがあれば bodyMaterial.map に繰り返し + Linear + mipmap で貼られる", () => {
    const parts = makeFakeParts();
    const pattern = patternData();
    applyLook(parts, makeLookData({ uniform: { ...makeLookData().uniform, pattern } }));
    const map = parts.bodyMaterial.map;
    expect(map).toBeInstanceOf(DataTexture);
    expect(sizeOf(map)).toEqual([PATTERN_SIZE, PATTERN_SIZE]);
    expect(map?.wrapS).toBe(RepeatWrapping);
    expect(map?.wrapT).toBe(RepeatWrapping);
    expect(map?.magFilter).toBe(LinearFilter);
    expect(map?.minFilter).toBe(LinearMipmapLinearFilter);
    expect(map?.generateMipmaps).toBe(true);
  });

  it("無地のチーム(pattern null)では貼らず、前に貼った縞は外して破棄する", () => {
    const parts = makeFakeParts();
    applyLook(parts, makeLookData({ uniform: { ...makeLookData().uniform, pattern: patternData() } }));
    const stripe = parts.bodyMaterial.map as Texture;
    const disposals = countDisposals(stripe);
    applyLook(parts, makeLookData());
    expect(parts.bodyMaterial.map).toBeNull();
    expect(disposals.count()).toBe(1);
  });

  it("同じチームの縞(同じ素データ)は複数のキャラクターで 1 枚を共有する", () => {
    const first = makeFakeParts();
    const second = makeFakeParts();
    const data = makeLookData({ uniform: { ...makeLookData().uniform, pattern: patternData() } });
    applyLook(first, data);
    applyLook(second, data);
    expect(first.bodyMaterial.map).toBe(second.bodyMaterial.map);
  });

  it("遠景には縞を貼らない", () => {
    const parts = makeFakeParts({ far: true });
    applyLook(parts, makeLookData({ uniform: { ...makeLookData().uniform, pattern: patternData() } }));
    expect(parts.bodyMaterial.map).toBeNull();
  });

  it("寸法に合わない縞の素データは貼らない", () => {
    const parts = makeFakeParts();
    applyLook(parts, makeLookData({ uniform: { ...makeLookData().uniform, pattern: new Uint8Array(12) } }));
    expect(parts.bodyMaterial.map).toBeNull();
  });
});

describe("releaseLook", () => {
  it("顔・背番号・縞のテクスチャを破棄してマップを外す。もう一度呼んでも例外にならない", () => {
    const parts = makeFakeParts();
    applyLook(parts, makeLookData({ uniform: { ...makeLookData().uniform, pattern: patternData() } }));
    const textures = [parts.faceMaterial.map, parts.decalMaterial?.map, parts.bodyMaterial.map] as Texture[];
    const all = textures.map((texture) => countDisposals(texture));
    releaseLook(parts);
    expect(all.map((disposals) => disposals.count())).toEqual([1, 1, 1]);
    expect(parts.faceMaterial.map).toBeNull();
    expect(parts.decalMaterial?.map).toBeNull();
    expect(parts.bodyMaterial.map).toBeNull();
    expect(() => releaseLook(parts)).not.toThrow();
  });
});

describe("render セグメントの規約", () => {
  it("character-look.ts・textures.ts は document・window・model を使わない", () => {
    const sources = [readFileSync("src/features/baseball/render/character-look.ts", "utf8"), readFileSync("src/features/baseball/render/textures.ts", "utf8")];
    for (const source of sources) {
      expect(/\b(document|window)\b/.test(source)).toBe(false);
      expect(/from "\.\.\/(model|hooks|ui)/.test(source)).toBe(false);
    }
  });
});
