import { describe, expect, it } from "vitest";
import type { GameConfig } from "../../types/game";
import { CPU_TEAM, PLAYER_TEAM } from "../data/teams";
import { createRng } from "../rng/rng";
import { createInitialState, currentBatter, currentPitcher } from "./state";
import { makeState } from "./test-fixtures";

const CONFIG: GameConfig = { innings: 3, humanSide: "away", difficulty: "normal" };

describe("createInitialState", () => {
  it("starts at the top of the 1st: no outs, 0-0, empty bases, only the away line-score cell", () => {
    const state = createInitialState({ config: CONFIG, seed: 42 });
    expect(state.inning).toBe(1);
    expect(state.half).toBe("top");
    expect(state.outs).toBe(0);
    expect(state.count).toEqual({ balls: 0, strikes: 0 });
    expect(state.bases).toEqual({ first: false, second: false, third: false });
    expect(state.lineScore).toEqual({ away: [0], home: [] });
  });

  it("zeroes every tally and the pitch sequence, and has no last result / in-play / log", () => {
    const state = createInitialState({ config: CONFIG, seed: 42 });
    expect(state.hits).toEqual({ away: 0, home: 0 });
    expect(state.errors).toEqual({ away: 0, home: 0 });
    expect(state.lineupIndex).toEqual({ away: 0, home: 0 });
    expect(state.pitchCounts).toEqual({ away: 0, home: 0 });
    expect(state.pitchSeq).toBe(0);
    expect(state.lastPitchKind).toBeNull();
    expect(state.lastResult).toBeNull();
    expect(state.lastPlate).toBeNull();
    expect(state.lastInPlay).toBeNull();
    expect(state.log).toEqual([]);
  });

  it("waits for a pitch", () => {
    expect(createInitialState({ config: CONFIG, seed: 42 }).phase).toEqual({ kind: "await-pitch" });
  });

  it("keeps the config as given", () => {
    const config: GameConfig = { innings: 9, humanSide: "home", difficulty: "hard" };
    expect(createInitialState({ config, seed: 1 }).config).toBe(config);
  });

  it("seeds rng with createRng(seed), normalising out-of-range seeds the same way", () => {
    expect(createInitialState({ config: CONFIG, seed: 42 }).rng).toBe(createRng(42));
    expect(createInitialState({ config: CONFIG, seed: -1 }).rng).toBe(createRng(-1));
    expect(createInitialState({ config: CONFIG, seed: 4294967296 + 5 }).rng).toBe(createRng(5));
  });

  it("different seeds give different rng states", () => {
    const first = createInitialState({ config: CONFIG, seed: 1 }).rng;
    const second = createInitialState({ config: CONFIG, seed: 2 }).rng;
    expect(first).not.toBe(second);
  });

  it.each([["away"], [null]] as const)("humanSide %s puts the player team on the away side and the CPU team on the home side", (humanSide) => {
    const state = createInitialState({ config: { ...CONFIG, humanSide }, seed: 1 });
    expect(state.teams.away).toBe(PLAYER_TEAM);
    expect(state.teams.home).toBe(CPU_TEAM);
  });

  it("humanSide home puts the player team on the home side and the CPU team on the away side", () => {
    const state = createInitialState({ config: { ...CONFIG, humanSide: "home" }, seed: 1 });
    expect(state.teams.home).toBe(PLAYER_TEAM);
    expect(state.teams.away).toBe(CPU_TEAM);
  });
});

describe("currentBatter", () => {
  it("is the away lineup entry in the top half and the home one in the bottom half", () => {
    const state = makeState({ lineupIndex: { away: 3, home: 5 } });
    expect(currentBatter(state)).toBe(state.teams.away.batters.at(3));
    expect(currentBatter({ ...state, half: "bottom" })).toBe(state.teams.home.batters.at(5));
  });

  it("throws when the lineup index is out of range", () => {
    expect(() => currentBatter(makeState({ lineupIndex: { away: 9, home: 0 } }))).toThrow(Error);
  });
});

describe("currentPitcher", () => {
  it("is the fielding team's pitcher", () => {
    const state = makeState();
    expect(currentPitcher(state)).toBe(state.teams.home.pitcher);
    expect(currentPitcher({ ...state, half: "bottom" })).toBe(state.teams.away.pitcher);
  });
});
