// テスト専用: 部品を作る関数(`headParts` など)に渡す `PartContext` を作る。
import { makeRig } from "../test-fixtures";
import type { BodyColors, PartContext } from "./geometry-merge";
import { detailFor } from "./lod";
import type { CharacterLod } from "./lod";
import { buildSkeleton } from "./skeleton";

export const TEST_COLORS: BodyColors = {
  skin: 0xf5c9a6,
  hair: 0x2a1c14,
  base: 0xf7f7f9,
  pants: 0xf2f2f2,
  accent: 0xe8473c,
  socks: 0x20284a,
  cap: 0xe8473c,
  helmet: 0x2f63c8,
  shoe: 0x2a2a2a,
  glove: 0x8a4b22,
  wood: 0xd7a25a,
  grip: 0x3a2a22,
};

export function makeContext(lod: CharacterLod, options: { readonly batter?: boolean; readonly build?: number; readonly glove?: boolean } = {}): PartContext {
  const batter = options.batter ?? false;
  const build = options.build ?? 1;
  const rig = makeRig();
  const rigged = buildSkeleton(rig, build, batter);
  return { rig, origins: rigged.origins, build, detail: detailFor(lod), colors: TEST_COLORS, batter, glove: options.glove ?? false };
}
