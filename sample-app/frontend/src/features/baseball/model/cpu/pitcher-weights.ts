import type { Count } from "../../types/game";
import type { CourseCell, PitchKind } from "../../types/pitch";
import type { WeightedEntry } from "../rng/sampling";
import { RING_CELLS, ZONE_CELLS } from "../pitch/zone";

// CPU 投手の配球プランと、抽選用の重み表の組み立て(仮値)。数値は balance.test.ts とプレイで調整する。

/** カウントごとの配球の方針。 */
export type PitchPlan = {
  /** ゾーン内に投げる率。 */
  readonly zoneRate: number;
  /** ストレートを選ぶ率(残りを他の持ち球で等分)。 */
  readonly fastballRate: number;
  /** ゾーン内でコースの端を狙う度合い(大きいほど端寄り)。 */
  readonly edgeBias: number;
};

/** 5×5 グリッドの中心の添字。 */
const CENTER_INDEX = 2;
/** 5×5 グリッドの端の添字。 */
const LAST_INDEX = 4;
/** ゾーン外で外周の角のセルの重み。 */
const RING_CORNER_WEIGHT = 1;
/** ゾーン外で角以外のセルの重み。 */
const RING_EDGE_WEIGHT = 2;

/** キーは `"<balls>-<strikes>"`。12 カウントすべてを持つ。 */
const PITCH_PLAN_TABLE: ReadonlyMap<string, PitchPlan> = new Map<string, PitchPlan>([
  ["0-0", { zoneRate: 0.7, fastballRate: 0.6, edgeBias: 0.6 }],
  ["1-0", { zoneRate: 0.7, fastballRate: 0.6, edgeBias: 0.4 }],
  ["2-0", { zoneRate: 0.78, fastballRate: 0.7, edgeBias: 0.2 }],
  ["3-0", { zoneRate: 0.9, fastballRate: 0.88, edgeBias: 0.0 }],
  ["0-1", { zoneRate: 0.62, fastballRate: 0.55, edgeBias: 0.8 }],
  ["1-1", { zoneRate: 0.65, fastballRate: 0.55, edgeBias: 0.6 }],
  ["2-1", { zoneRate: 0.72, fastballRate: 0.56, edgeBias: 0.4 }],
  ["3-1", { zoneRate: 0.85, fastballRate: 0.75, edgeBias: 0.1 }],
  ["0-2", { zoneRate: 0.4, fastballRate: 0.5, edgeBias: 1.5 }],
  ["1-2", { zoneRate: 0.4, fastballRate: 0.5, edgeBias: 1.5 }],
  ["2-2", { zoneRate: 0.6, fastballRate: 0.5, edgeBias: 1.2 }],
  ["3-2", { zoneRate: 0.78, fastballRate: 0.62, edgeBias: 0.6 }],
]);

/** カウントの配球プランのキー。 */
export function planKey(count: Count): string {
  return `${count.balls}-${count.strikes}`;
}

/** カウントの配球プランを返す。範囲外のカウントは `Error`(プログラミングエラー)。 */
export function getPitchPlan(count: Count): PitchPlan {
  const plan = PITCH_PLAN_TABLE.get(planKey(count));
  if (plan === undefined) {
    throw new Error(`getPitchPlan: unknown count "${planKey(count)}"`);
  }
  return plan;
}

/** 持ち球ごとの重み。`straight` は `fastballRate`、他は残りを等分し、直前と同じ球種には `repeatPenalty` を掛ける。 */
export function kindEntries(
  repertoire: readonly PitchKind[],
  fastballRate: number,
  lastKind: PitchKind | null,
  repeatPenalty: number,
): WeightedEntry<PitchKind>[] {
  const breakingCount = repertoire.filter((kind) => kind !== "straight").length;
  const breakingWeight = breakingCount > 0 ? (1 - fastballRate) / breakingCount : 0;
  return repertoire.map((kind) => {
    const base = kind === "straight" ? fastballRate : breakingWeight;
    return { value: kind, weight: kind === lastKind ? base * repeatPenalty : base };
  });
}

/** ゾーン内 9 セルの重み。中心から離れる(端に近い)ほど `edgeBias` に比例して重くなる。 */
export function zoneCellEntries(edgeBias: number): WeightedEntry<CourseCell>[] {
  return ZONE_CELLS.map((cell) => ({
    value: cell,
    weight: 1 + edgeBias * (Math.abs(cell.col - CENTER_INDEX) + Math.abs(cell.row - CENTER_INDEX)),
  }));
}

function isRingCorner(cell: CourseCell): boolean {
  return (cell.col === 0 || cell.col === LAST_INDEX) && (cell.row === 0 || cell.row === LAST_INDEX);
}

/** ゾーン外 16 セルの重み。外周の角は 1、他は 2(角は狙いにくい)。 */
export function ringCellEntries(): WeightedEntry<CourseCell>[] {
  return RING_CELLS.map((cell) => ({ value: cell, weight: isRingCorner(cell) ? RING_CORNER_WEIGHT : RING_EDGE_WEIGHT }));
}
