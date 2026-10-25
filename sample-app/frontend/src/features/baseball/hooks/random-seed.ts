/** 乱数シード(uint32)を `crypto.getRandomValues` から生成する。`?seed=` 未指定時や2試合目以降の試合に使う。 */
export function createRandomSeed(): number {
  const seed = crypto.getRandomValues(new Uint32Array(1)).at(0);
  if (seed === undefined) {
    throw new Error("createRandomSeed: crypto.getRandomValues returned no value");
  }
  return seed;
}
