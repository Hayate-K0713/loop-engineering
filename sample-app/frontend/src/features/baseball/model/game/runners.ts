import type { PlateOutcome, Strength } from "../../types/batting";
import type { Bases } from "../../types/game";

/** 1半イニングのアウト数。 */
export const OUTS_PER_INNING = 3;

export const EMPTY_BASES: Bases = { first: false, second: false, third: false };

/**
 * 打席の結果。`strength` はインプレー打球の強さ(インプレー以外や不明のときは `null`)。
 * `groundout` は強さが中・強のとき全走者が進塁、`flyout` は強さが中・強のとき3塁走者が生還する。
 * `strength` が `null` のときは弱い当たりとして扱う。
 */
export type RunnerPlay = { readonly kind: PlateOutcome; readonly strength: Strength | null };

export type RunnerAdvance = { readonly bases: Bases; readonly runs: number; readonly outsAdded: number };

const toCount = (flag: boolean): number => (flag ? 1 : 0);

const countRunners = (bases: Bases): number => toCount(bases.first) + toCount(bases.second) + toCount(bases.third);

const isSolid = (strength: Strength | null): boolean => strength === "medium" || strength === "strong";

/** 打者が1塁に入るときの強制進塁。1塁走者がいれば2塁へ、1・2塁が埋まっていれば2塁走者が3塁へ押し出される。 */
function forcedAdvance(bases: Bases): { readonly second: boolean; readonly third: boolean; readonly run: boolean } {
  return {
    second: bases.first || bases.second,
    third: bases.third || (bases.first && bases.second),
    run: bases.first && bases.second && bases.third,
  };
}

function walk(bases: Bases): RunnerAdvance {
  const forced = forcedAdvance(bases);
  return { bases: { first: true, second: forced.second, third: forced.third }, runs: toCount(forced.run), outsAdded: 0 };
}

function single(bases: Bases): RunnerAdvance {
  return { bases: { first: true, second: bases.first, third: false }, runs: toCount(bases.second) + toCount(bases.third), outsAdded: 0 };
}

function double(bases: Bases): RunnerAdvance {
  return { bases: { first: false, second: true, third: bases.first }, runs: toCount(bases.second) + toCount(bases.third), outsAdded: 0 };
}

function triple(bases: Bases): RunnerAdvance {
  return { bases: { first: false, second: false, third: true }, runs: countRunners(bases), outsAdded: 0 };
}

function homerun(bases: Bases): RunnerAdvance {
  return { bases: EMPTY_BASES, runs: countRunners(bases) + 1, outsAdded: 0 };
}

function error(bases: Bases): RunnerAdvance {
  return { bases: { first: true, second: bases.first, third: bases.second }, runs: toCount(bases.third), outsAdded: 0 };
}

function groundout(bases: Bases, strength: Strength | null): RunnerAdvance {
  if (isSolid(strength)) {
    return { bases: { first: false, second: bases.first, third: bases.second }, runs: toCount(bases.third), outsAdded: 1 };
  }
  const forced = forcedAdvance(bases);
  return { bases: { first: false, second: forced.second, third: forced.third }, runs: toCount(forced.run), outsAdded: 1 };
}

function doublePlay(bases: Bases, outs: number): RunnerAdvance {
  if (!bases.first || outs >= 2) {
    throw new Error(`doublePlay requires a runner on first and fewer than 2 outs (first=${String(bases.first)}, outs=${outs})`);
  }
  return { bases: { first: false, second: false, third: bases.second }, runs: toCount(bases.third), outsAdded: 2 };
}

function flyout(bases: Bases, strength: Strength | null): RunnerAdvance {
  const sacrifice = bases.third && isSolid(strength);
  return { bases: { first: bases.first, second: bases.second, third: bases.third && !sacrifice }, runs: toCount(sacrifice), outsAdded: 1 };
}

/** 走者が動かず打者だけがアウトになる結果(三振・ライナーアウト)。 */
function batterOut(bases: Bases): RunnerAdvance {
  return { bases, runs: 0, outsAdded: 1 };
}

function computeAdvance(bases: Bases, outs: number, play: RunnerPlay): RunnerAdvance {
  switch (play.kind) {
    case "walk":
      return walk(bases);
    case "single":
      return single(bases);
    case "double":
      return double(bases);
    case "triple":
      return triple(bases);
    case "homerun":
      return homerun(bases);
    case "error":
      return error(bases);
    case "groundout":
      return groundout(bases, play.strength);
    case "doublePlay":
      return doublePlay(bases, outs);
    case "flyout":
      return flyout(bases, play.strength);
    case "lineout":
    case "strikeout":
      return batterOut(bases);
  }
}

/**
 * 打席の結果に応じた走者の動き(決定論・乱数なし)。
 * 3アウト目が記録される場合は得点なしで、走者はクリアされる。
 * `doublePlay` の事前条件(1塁走者あり かつ `outs < 2`)を満たさない入力は `Error` を投げる。
 */
export function advanceRunners(bases: Bases, outs: number, play: RunnerPlay): RunnerAdvance {
  const advance = computeAdvance(bases, outs, play);
  if (outs + advance.outsAdded >= OUTS_PER_INNING) {
    return { bases: EMPTY_BASES, runs: 0, outsAdded: advance.outsAdded };
  }
  return advance;
}
