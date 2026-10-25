import type { RngState, WithRng } from "../../types/common";

// mulberry32。状態(uint32)を明示的に受け渡す純粋関数で、組み込みの乱数関数には依存しない。
// 同じシード・同じ呼び出し順なら、どの JS エンジンでも同じ列になる(`Math.imul` と整数演算のみ)。

const STATE_INCREMENT = 0x6d2b79f5;
const UINT32_RANGE = 4294967296;

/** シードから初期状態を作る。負数・2^32 以上・小数でも `>>> 0` で uint32 に正規化する。 */
export function createRng(seed: number): RngState {
  return seed >>> 0;
}

/** [0, 1) の一様乱数と次の状態を返す。 */
export function nextFloat(state: RngState): WithRng<number> {
  const next = (state + STATE_INCREMENT) >>> 0;
  const mixed = Math.imul(next ^ (next >>> 15), next | 1);
  const mixed2 = mixed ^ (mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61));
  return [((mixed2 ^ (mixed2 >>> 14)) >>> 0) / UINT32_RANGE, next];
}

/** [0, maxExclusive) の整数乱数と次の状態を返す。 */
export function nextInt(state: RngState, maxExclusive: number): WithRng<number> {
  const [value, next] = nextFloat(state);
  return [Math.floor(value * maxExclusive), next];
}
