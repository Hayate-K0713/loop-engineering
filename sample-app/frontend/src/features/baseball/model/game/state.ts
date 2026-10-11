import type { Side } from "../../types/common";
import type { GameConfig, GameState } from "../../types/game";
import type { BatterProfile, PitcherProfile, Team } from "../../types/team";
import { CPU_TEAM, PLAYER_TEAM } from "../data/teams";
import { createRng } from "../rng/rng";
import { EMPTY_COUNT } from "./count";
import { EMPTY_BASES } from "./runners";
import { bySide, defenseSide, offenseSide } from "./side";

/** `createInitialState` の入力。`seed` は乱数のシード(uint32)。 */
export type InitialStateInput = {
  readonly config: GameConfig;
  readonly seed: number;
};

/** チーム割り当て。ユーザーが後攻(`humanSide === "home"`)ならユーザーチームが後攻、それ以外(先攻・CPU 同士)は先攻。 */
function assignTeams(humanSide: Side | null): { readonly away: Team; readonly home: Team } {
  return humanSide === "home" ? { away: CPU_TEAM, home: PLAYER_TEAM } : { away: PLAYER_TEAM, home: CPU_TEAM };
}

/** 試合の初期状態(1回表・無死・0-0・走者なし・得点欄は先攻の1回のみ)。 */
export function createInitialState(input: InitialStateInput): GameState {
  const { config, seed } = input;
  return {
    config,
    teams: assignTeams(config.humanSide),
    rng: createRng(seed),
    inning: 1,
    half: "top",
    outs: 0,
    count: EMPTY_COUNT,
    bases: EMPTY_BASES,
    lineScore: { away: [0], home: [] },
    hits: { away: 0, home: 0 },
    errors: { away: 0, home: 0 },
    lineupIndex: { away: 0, home: 0 },
    pitchCounts: { away: 0, home: 0 },
    pitchSeq: 0,
    lastPitchKind: null,
    lastResult: null,
    lastPlate: null,
    lastInPlay: null,
    phase: { kind: "await-pitch" },
    log: [],
  };
}

/** 現在の打者(攻撃側チームの `lineupIndex` 番目)。打順が範囲外なら `Error`(不変条件違反)。 */
export function currentBatter(state: GameState): BatterProfile {
  const offense = offenseSide(state.half);
  const batter = bySide(state.teams, offense).batters.at(bySide(state.lineupIndex, offense));
  if (batter === undefined) {
    throw new Error(`currentBatter: lineup index out of range (${bySide(state.lineupIndex, offense)})`);
  }
  return batter;
}

/** 現在の投手(守備側チームの先発投手。交代なし)。 */
export function currentPitcher(state: GameState): PitcherProfile {
  return bySide(state.teams, defenseSide(state.half)).pitcher;
}
