import { beforeAll, describe, expect, it } from "vitest";
import type { PlateOutcome } from "../../types/batting";
import type { GameConfig } from "../../types/game";
import { DEFAULT_MAX_ACTIONS, simulateGame } from "./simulate";

// 得点環境のモンテカルロ検証。CPU 同士(humanSide: null)・難易度ふつう・9回制・シード 1〜100 の固定シードで、
// 乱数に依存した検証でもフレークしない。しきい値は仮の値(大外れを防ぐ目安で、面白さを保証するものではない)。
// 調整は params・結果表・難易度・チームデータの数値のみで行う。

const CONFIG: GameConfig = { innings: 9, humanSide: null, difficulty: "normal" };
const SEEDS = Array.from({ length: 100 }, (_, index) => index + 1);

const HITS: ReadonlySet<PlateOutcome> = new Set<PlateOutcome>(["single", "double", "triple", "homerun"]);

type BalanceStats = {
  readonly games: number;
  readonly unfinished: number;
  readonly maxActions: number;
  /** 1チーム1イニング(半イニング)あたりの平均得点。 */
  readonly runsPerHalfInning: number;
  readonly plateAppearances: number;
  readonly strikeouts: number;
  readonly walks: number;
  readonly hits: number;
  readonly homeRuns: number;
  readonly doublePlays: number;
  readonly draws: number;
  /** 先攻(= humanSide が null のときのユーザーチーム「ルミナス」)の勝ち数。 */
  readonly awayWins: number;
  readonly homeWins: number;
};

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function collectStats(): BalanceStats {
  const results = SEEDS.map((seed) => simulateGame(CONFIG, seed));
  const plates = results.flatMap((result) => result.plates);
  const cells = results.flatMap((result) => [...result.final.lineScore.away, ...result.final.lineScore.home]);
  const margins = results.map((result) => sum(result.final.lineScore.away) - sum(result.final.lineScore.home));
  const count = (outcome: PlateOutcome): number => plates.filter((plate) => plate === outcome).length;
  return {
    games: results.length,
    unfinished: results.filter((result) => result.final.phase.kind !== "game-over").length,
    maxActions: Math.max(...results.map((result) => result.actions)),
    runsPerHalfInning: sum(cells) / cells.length,
    plateAppearances: plates.length,
    strikeouts: count("strikeout"),
    walks: count("walk"),
    hits: plates.filter((plate) => HITS.has(plate)).length,
    homeRuns: count("homerun"),
    doublePlays: count("doublePlay"),
    draws: margins.filter((margin) => margin === 0).length,
    awayWins: margins.filter((margin) => margin > 0).length,
    homeWins: margins.filter((margin) => margin < 0).length,
  };
}

describe("balance: CPU vs CPU, normal difficulty, 9 innings, seeds 1-100", () => {
  let stats: BalanceStats;

  beforeAll(() => {
    stats = collectStats();
  }, 30_000);

  it("every game finishes within the action limit", () => {
    expect(stats.games).toBe(SEEDS.length);
    expect(stats.unfinished).toBe(0);
    expect(stats.maxActions).toBeLessThanOrEqual(DEFAULT_MAX_ACTIONS);
  });

  it("averages 0.2 to 1.5 runs per team per half inning", () => {
    expect(stats.runsPerHalfInning).toBeGreaterThanOrEqual(0.2);
    expect(stats.runsPerHalfInning).toBeLessThanOrEqual(1.5);
  });

  it("strikes out 8% to 35% of plate appearances", () => {
    const rate = stats.strikeouts / stats.plateAppearances;
    expect(rate).toBeGreaterThanOrEqual(0.08);
    expect(rate).toBeLessThanOrEqual(0.35);
  });

  it("walks 3% to 15% of plate appearances", () => {
    const rate = stats.walks / stats.plateAppearances;
    expect(rate).toBeGreaterThanOrEqual(0.03);
    expect(rate).toBeLessThanOrEqual(0.15);
  });

  it("bats between .180 and .340 (hits / (plate appearances - walks))", () => {
    const average = stats.hits / (stats.plateAppearances - stats.walks);
    expect(average).toBeGreaterThanOrEqual(0.18);
    expect(average).toBeLessThanOrEqual(0.34);
  });

  it("hits a home run in at most 6% of plate appearances", () => {
    expect(stats.homeRuns / stats.plateAppearances).toBeLessThanOrEqual(0.06);
  });

  it("turns at least one double play over the 100 games", () => {
    expect(stats.doublePlays).toBeGreaterThanOrEqual(1);
  });

  it("ends in a draw in at most 10% of games", () => {
    expect(stats.draws / stats.games).toBeLessThanOrEqual(0.1);
  });

  it("gives neither team an edge: the player team wins 30% to 70% of the decided games", () => {
    const winRate = stats.awayWins / (stats.awayWins + stats.homeWins);
    expect(winRate).toBeGreaterThanOrEqual(0.3);
    expect(winRate).toBeLessThanOrEqual(0.7);
  });
});
