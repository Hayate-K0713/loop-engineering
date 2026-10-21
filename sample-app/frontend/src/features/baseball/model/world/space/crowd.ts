import type { RngState } from "../../../types/common";
import type { CrowdCell } from "../../../types/stage";
import { createRng, nextInt } from "../../rng/rng";

// 観客席の点の配置。シード付きの乱数(model/rng)で作る決定論で、色は render/look.ts のパレットが `paletteIndex` から解決する。

const CROWD_COLS = 32;
const CROWD_ROWS = 16;
const PALETTE_SIZE = 8;

const COLUMNS: readonly number[] = Array.from({ length: CROWD_COLS }, (_, col) => col);
const ROWS: readonly number[] = Array.from({ length: CROWD_ROWS }, (_, row) => row);

/** 32 × 16 セル(行優先)の配置。同じ `seed` なら常に同じ配置になる。 */
export function buildCrowdPattern(seed: number): readonly CrowdCell[] {
  let state: RngState = createRng(seed);
  const cells: CrowdCell[] = [];
  for (const row of ROWS) {
    for (const col of COLUMNS) {
      const [paletteIndex, next] = nextInt(state, PALETTE_SIZE);
      state = next;
      cells.push({ col, row, paletteIndex });
    }
  }
  return cells;
}
