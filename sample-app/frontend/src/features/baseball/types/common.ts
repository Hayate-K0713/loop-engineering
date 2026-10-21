// 複数セグメントに跨る基本型。types/ は実行時コードを持たない葉で、他セグメントを import しない。

/** 先攻=away、後攻=home。 */
export type Side = "away" | "home";

/** 半イニング。表=top(先攻の攻撃)、裏=bottom(後攻の攻撃)。 */
export type Half = "top" | "bottom";

/**
 * mulberry32 の状態(uint32)。型としては `number` と同一。
 * `type RngState = number` は sonarjs/redundant-type-aliases に抵触するため、`Readonly<number>`(= `number` に解決される)で書く。
 */
export type RngState = Readonly<number>;

/** 値と次の乱数状態の組。 */
export type WithRng<T> = readonly [T, RngState];

/** ストライクゾーンを [-1, 1]² に正規化した座標。y は上が正。 */
export type ZonePoint = {
  readonly x: number;
  readonly y: number;
};

/** 5×5 グリッドの添字。 */
export type GridIndex = 0 | 1 | 2 | 3 | 4;

/** チーム別の集計値。 */
export type SideTally = {
  readonly away: number;
  readonly home: number;
};
