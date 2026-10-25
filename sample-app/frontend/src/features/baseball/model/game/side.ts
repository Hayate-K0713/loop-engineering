import type { Half, Side, SideTally } from "../../types/common";

type Pair<T> = { readonly away: T; readonly home: T };

/** 相手側。 */
export function opponent(side: Side): Side {
  return side === "away" ? "home" : "away";
}

/** 半イニングの攻撃側。表=先攻(away)、裏=後攻(home)。 */
export function offenseSide(half: Half): Side {
  return half === "top" ? "away" : "home";
}

/** 半イニングの守備側。 */
export function defenseSide(half: Half): Side {
  return half === "top" ? "home" : "away";
}

/** 変数添字(`pair[side]`)を使わずに、側に対応する値を取り出す。 */
export function bySide<T>(pair: Pair<T>, side: Side): T {
  return side === "away" ? pair.away : pair.home;
}

/** 指定した側の値だけを `fn` で更新した新しいオブジェクトを返す(元は変更しない)。 */
export function updateSide<T>(pair: Pair<T>, side: Side, fn: (value: T) => T): { away: T; home: T } {
  return side === "away" ? { away: fn(pair.away), home: pair.home } : { away: pair.away, home: fn(pair.home) };
}

/** `SideTally` の指定した側に `n` を加算した新しい集計値を返す。 */
export function tallyAdd(tally: SideTally, side: Side, n: number): SideTally {
  return updateSide(tally, side, (value) => value + n);
}
