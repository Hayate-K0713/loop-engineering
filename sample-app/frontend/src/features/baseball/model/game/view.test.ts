import { describe, expect, it } from "vitest";
import type { BattedBall, InPlayResult, PitchResult, PlateOutcome } from "../../types/batting";
import type { Side } from "../../types/common";
import type { GameConfig, GameState, InPlayRecord } from "../../types/game";
import type { PitchFlight, PitchKind } from "../../types/pitch";
import type { BatterProfile } from "../../types/team";
import { computeBattedLanding } from "../batting/batted-landing";
import { cursorRadii } from "../batting/cursor";
import { BATTING_PARAMS, LANDING_PARAMS } from "../batting/params";
import { CPU_TEAM, PLAYER_TEAM } from "../data/teams";
import { PITCH_PARAMS } from "../pitch/params";
import { reduce } from "./reducer";
import { createInitialState } from "./state";
import { FIXTURE_AWAY_TEAM, FIXTURE_HOME_TEAM, makeState } from "./test-fixtures";
import { toGameView } from "./view";

const AWAY: GameConfig = { innings: 3, humanSide: "away", difficulty: "normal" };
const HOME: GameConfig = { innings: 3, humanSide: "home", difficulty: "normal" };
const CPU_ONLY: GameConfig = { innings: 3, humanSide: null, difficulty: "normal" };

function flight(kind: PitchKind, speedKmh: number, durationMs: number): PitchFlight {
  return { seq: 1, kind, aim: { x: 0, y: 0 }, landing: { x: 0.2, y: -0.1 }, speedKmh, durationMs };
}

const RECORD: InPlayRecord = { seq: 17, result: "double", ball: { type: "liner", strength: "strong", direction: "pull" } };

function flightOf(state: GameState): PitchFlight {
  if (state.phase.kind !== "in-flight") {
    throw new Error("expected an in-flight state");
  }
  return state.phase.flight;
}

function batterOf(state: GameState, side: Side, index: number): BatterProfile {
  const batter = (side === "away" ? state.teams.away : state.teams.home).batters.at(index);
  if (batter === undefined) {
    throw new Error(`no batter at ${index}`);
  }
  return batter;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

describe("toGameView: labels and status", () => {
  it("labels the inning with the half and flags extra innings", () => {
    expect(toGameView(makeState()).inningLabel).toBe("1回表");
    expect(toGameView(makeState({ inning: 3, half: "bottom" })).inningLabel).toBe("3回裏");
    expect(toGameView(makeState({ inning: 3 })).isExtra).toBe(false);
    expect(toGameView(makeState({ inning: 4 })).isExtra).toBe(true);
  });

  it("is playing until the game is over", () => {
    expect(toGameView(makeState()).status).toBe("playing");
    expect(toGameView(makeState({ phase: { kind: "game-over", winner: null } })).status).toBe("game-over");
  });

  it("passes the count, outs and bases through", () => {
    const view = toGameView(makeState({ outs: 2, count: { balls: 3, strikes: 1 }, bases: { first: true, second: false, third: true } }));
    expect([view.outs, view.balls, view.strikes]).toEqual([2, 3, 1]);
    expect(view.bases).toEqual({ first: true, second: false, third: true });
  });

  it("builds the turn key from the pitch sequence and the phase", () => {
    expect(toGameView(makeState({ pitchSeq: 7 })).turnKey).toBe("7:await-pitch");
    expect(toGameView(makeState({ pitchSeq: 8, phase: { kind: "in-flight", flight: flight("straight", 140, 1357) } })).turnKey).toBe("8:in-flight");
    expect(toGameView(makeState({ pitchSeq: 9, phase: { kind: "game-over", winner: "away" } })).turnKey).toBe("9:game-over");
  });
});

describe("toGameView: mode and readiness", () => {
  type Situation = {
    readonly config: GameConfig;
    readonly half: "top" | "bottom";
    readonly mode: "human-batting" | "human-pitching" | "cpu-only";
  };

  it.each<Situation>([
    { config: AWAY, half: "top", mode: "human-batting" },
    { config: AWAY, half: "bottom", mode: "human-pitching" },
    { config: HOME, half: "top", mode: "human-pitching" },
    { config: HOME, half: "bottom", mode: "human-batting" },
    { config: CPU_ONLY, half: "top", mode: "cpu-only" },
    { config: CPU_ONLY, half: "bottom", mode: "cpu-only" },
  ])("mode is $mode for humanSide $config.humanSide in the $half half", ({ config, half, mode }) => {
    expect(toGameView(makeState({ config, half })).mode).toBe(mode);
  });

  it("while awaiting a pitch: the human pitches when fielding (pitchReady), otherwise the CPU does (cpuPitchPending); nobody can swing", () => {
    const humanFields = toGameView(makeState({ config: HOME }));
    expect([humanFields.pitchReady, humanFields.swingReady, humanFields.cpuPitchPending]).toEqual([true, false, false]);
    const cpuFields = toGameView(makeState({ config: AWAY }));
    expect([cpuFields.pitchReady, cpuFields.swingReady, cpuFields.cpuPitchPending]).toEqual([false, false, true]);
    const cpuOnly = toGameView(makeState({ config: CPU_ONLY }));
    expect([cpuOnly.pitchReady, cpuOnly.swingReady, cpuOnly.cpuPitchPending]).toEqual([false, false, true]);
  });

  it("in flight: only a human batter can swing; nobody can pitch", () => {
    const phase = { kind: "in-flight", flight: flight("straight", 140, 1357) } as const;
    const humanBats = toGameView(makeState({ config: AWAY, phase }));
    expect([humanBats.pitchReady, humanBats.swingReady, humanBats.cpuPitchPending]).toEqual([false, true, false]);
    const cpuBats = toGameView(makeState({ config: HOME, phase }));
    expect([cpuBats.pitchReady, cpuBats.swingReady, cpuBats.cpuPitchPending]).toEqual([false, false, false]);
    const cpuOnly = toGameView(makeState({ config: CPU_ONLY, phase }));
    expect([cpuOnly.pitchReady, cpuOnly.swingReady, cpuOnly.cpuPitchPending]).toEqual([false, false, false]);
  });

  it("when the game is over nothing is ready", () => {
    const view = toGameView(makeState({ config: AWAY, phase: { kind: "game-over", winner: "away" } }));
    expect([view.pitchReady, view.swingReady, view.cpuPitchPending]).toEqual([false, false, false]);
  });
});

describe("toGameView: flight, arrival time and speed label", () => {
  const curve = flight("curve", 111.6, 1700);

  it("has no flight, a zero arrival time and a dash label while awaiting a pitch", () => {
    const view = toGameView(makeState());
    expect(view.flight).toBeNull();
    expect(view.arriveAfterMs).toBe(0);
    expect(view.pitchSpeedLabel).toBe("-");
  });

  it("gives the flight and the rounded speed with the pitch name while in flight", () => {
    const view = toGameView(makeState({ phase: { kind: "in-flight", flight: curve } }));
    expect(view.flight).toBe(curve);
    expect(view.pitchSpeedLabel).toBe("112km/h カーブ");
    expect(toGameView(makeState({ phase: { kind: "in-flight", flight: flight("straight", 143.4, 1330) } })).pitchSpeedLabel).toBe("143km/h ストレート");
  });

  it("adds the contact window to the arrival time for a human batter only", () => {
    const phase = { kind: "in-flight", flight: curve } as const;
    expect(toGameView(makeState({ config: AWAY, phase })).arriveAfterMs).toBe(curve.durationMs + BATTING_PARAMS.contactWindowMs);
    expect(toGameView(makeState({ config: HOME, phase })).arriveAfterMs).toBe(curve.durationMs);
    expect(toGameView(makeState({ config: CPU_ONLY, phase })).arriveAfterMs).toBe(curve.durationMs);
  });
});

describe("toGameView: scoreboard", () => {
  it("starts with the away first cell played and everything else a dash, with the team names", () => {
    const board = toGameView(createInitialState({ config: AWAY, seed: 1 })).scoreboard;
    expect(board.columns).toBe(3);
    expect(board.rows.map((row) => [row.side, row.cells])).toEqual([
      ["away", ["0", "-", "-"]],
      ["home", ["-", "-", "-"]],
    ]);
    expect(board.rows.map((row) => row.teamName)).toEqual(["ルミナス", "ノーブルズ"]);
  });

  it("shows played runs, totals, hits and errors per team", () => {
    const state = makeState({
      lineScore: { away: [1, 0, 3], home: [0, 2] },
      hits: { away: 5, home: 3 },
      errors: { away: 1, home: 0 },
      inning: 3,
      half: "bottom",
    });
    const rows = toGameView(state).scoreboard.rows;
    expect(rows.map((row) => [row.cells, row.runs, row.hits, row.errors])).toEqual([
      [["1", "0", "3"], 4, 5, 1],
      [["0", "2", "-"], 2, 3, 0],
    ]);
  });

  it("shows an unplayed bottom half as x once the game is over", () => {
    const state = makeState({ inning: 3, lineScore: { away: [0, 0, 0], home: [1, 0] }, phase: { kind: "game-over", winner: "home" } });
    expect(toGameView(state).scoreboard.rows.map((row) => row.cells)).toEqual([
      ["0", "0", "0"],
      ["1", "0", "x"],
    ]);
  });

  it("grows to the current inning in extra innings", () => {
    const state = makeState({ inning: 5, lineScore: { away: [0, 0, 0, 0, 0], home: [0, 0, 0, 0] } });
    const board = toGameView(state).scoreboard;
    expect(board.columns).toBe(5);
    expect(board.rows.map((row) => row.cells.length)).toEqual([5, 5]);
  });
});

describe("toGameView: result", () => {
  function over(config: GameConfig, winner: Side | null): GameState {
    return makeState({ config, inning: 3, phase: { kind: "game-over", winner }, lineScore: { away: [2, 0, 1], home: [0, 4, 0] } });
  }

  it("is null while playing", () => {
    expect(toGameView(makeState()).result).toBeNull();
  });

  it.each<[GameConfig, Side | null, "win" | "lose" | "draw"]>([
    [AWAY, "away", "win"],
    [AWAY, "home", "lose"],
    [AWAY, null, "draw"],
    [HOME, "home", "win"],
    [HOME, "away", "lose"],
    [HOME, null, "draw"],
  ])("judges the outcome from the human's side (humanSide %#)", (config, winner, outcome) => {
    const result = toGameView(over(config, winner)).result;
    expect(result?.humanOutcome).toBe(outcome);
    expect(result?.awayRuns).toBe(3);
    expect(result?.homeRuns).toBe(4);
    expect(result?.headline.length).toBeGreaterThan(0);
  });

  it("uses different headlines for win, lose and draw", () => {
    const headlines = [over(AWAY, "away"), over(AWAY, "home"), over(AWAY, null)].map((state) => toGameView(state).result?.headline);
    expect(new Set(headlines).size).toBe(3);
  });

  it("has no human outcome for a CPU-only game and names the winning team", () => {
    const won = toGameView(over(CPU_ONLY, "away")).result;
    expect(won?.humanOutcome).toBeNull();
    expect(won?.headline).toBe("テスト先攻の勝ち");
    expect(toGameView(over(CPU_ONLY, null)).result?.headline).toBe("引き分け");
  });
});

describe("toGameView: matchup", () => {
  it("shows the current batter and the fielding pitcher", () => {
    const state = makeState({ lineupIndex: { away: 3, home: 0 }, pitchCounts: { away: 0, home: 20 } });
    const view = toGameView(state);
    expect(view.batter.name).toBe(batterOf(state, "away", 3).name);
    expect(view.batter.orderLabel).toBe("4番");
    expect(view.pitcher.name).toBe(state.teams.home.pitcher.name);
    expect(view.pitcher.pitchCount).toBe(20);
    expect(view.pitcher.repertoire).toEqual([{ kind: "straight", label: "ストレート" }]);
  });

  it("switches to the home batter and the away pitcher in the bottom half", () => {
    const state = makeState({ half: "bottom", lineupIndex: { away: 0, home: 8 }, pitchCounts: { away: 7, home: 0 } });
    const view = toGameView(state);
    expect(view.batter.name).toBe(batterOf(state, "home", 8).name);
    expect(view.batter.orderLabel).toBe("9番");
    expect(view.pitcher.name).toBe(state.teams.away.pitcher.name);
    expect(view.pitcher.pitchCount).toBe(7);
  });

  it("gives both swing kinds' cursor radii, the power swing being smaller", () => {
    const state = makeState();
    const batter = batterOf(state, "away", 0);
    const view = toGameView(state);
    expect(view.batter.cursorRadii.meet).toEqual(cursorRadii(batter, "meet"));
    expect(view.batter.cursorRadii.power).toEqual(cursorRadii(batter, "power"));
    expect(view.batter.cursorRadii.power.rx).toBeLessThan(view.batter.cursorRadii.meet.rx);
  });

  it("reports the stamina as a percentage that falls with the pitch count", () => {
    const stamina = makeState().teams.home.pitcher.stamina;
    const full = toGameView(makeState({ pitchCounts: { away: 0, home: 0 } })).pitcher.staminaPercent;
    const half = toGameView(makeState({ pitchCounts: { away: 0, home: Math.round(stamina * PITCH_PARAMS.pitchesPerStamina * 0.5) } })).pitcher.staminaPercent;
    const spent = toGameView(makeState({ pitchCounts: { away: 0, home: 100000 } })).pitcher.staminaPercent;
    expect([full, half, spent]).toEqual([100, 50, 0]);
  });
});

describe("toGameView: log and last event", () => {
  it("says play ball before anything has happened", () => {
    const view = toGameView(makeState());
    expect(view.lastEvent).toBe("プレイボール");
    expect(view.log).toEqual([]);
  });

  it("shows the newest log text as the last event and keeps only the latest 50 entries", () => {
    const log = Array.from({ length: 60 }, (_, index) => ({ seq: index, text: `event-${index}` }));
    const view = toGameView(makeState({ log }));
    expect(view.lastEvent).toBe("event-59");
    expect(view.log).toHaveLength(50);
    expect(view.log.at(0)?.text).toBe("event-10");
    expect(view.log.at(-1)?.text).toBe("event-59");
  });
});

describe("toGameView: field diagram", () => {
  it("has no marker until the first in-play ball", () => {
    expect(toGameView(makeState()).fieldMarker).toBeNull();
  });

  it("builds the marker from computeBattedLanding for the last in-play ball, with seq and result", () => {
    const marker = toGameView(makeState({ lastInPlay: RECORD })).fieldMarker;
    expect(marker).toEqual({ seq: 17, result: "double", ...computeBattedLanding(RECORD.ball, RECORD.result, RECORD.seq) });
  });

  it("keeps the marker through pitches that are not in play, and updates it on the next in-play ball", () => {
    const pitched = reduce(createInitialState({ config: AWAY, seed: 3 }), { type: "CPU_PITCH" });
    const pitch = flightOf(pitched);
    const hit = reduce(pitched, { type: "SWING", swing: { kind: "power", cursor: pitch.landing, atMs: pitch.durationMs } });
    const marker = toGameView(hit).fieldMarker;
    expect(marker?.seq).toBe(pitch.seq);

    const next = reduce(hit, { type: "CPU_PITCH" });
    const taken = reduce(next, { type: "PITCH_ARRIVED" });
    expect(taken.lastResult?.kind === "ball" || taken.lastResult?.kind === "called-strike").toBe(true);
    expect(toGameView(taken).fieldMarker).toEqual(marker);
  });

  it("describes the field diagram and the zone geometry with the parameter values", () => {
    const view = toGameView(makeState());
    expect(view.fieldDiagram).toEqual({
      baseDistance: LANDING_PARAMS.baseDistance,
      fenceRadius: LANDING_PARAMS.fenceRadius,
      viewHalfWidth: LANDING_PARAMS.viewHalfWidth,
      viewTop: LANDING_PARAMS.viewTop,
      viewBottom: LANDING_PARAMS.viewBottom,
    });
    expect(view.geometry).toEqual({
      viewHalfExtent: PITCH_PARAMS.viewHalfExtent,
      zoneHalf: PITCH_PARAMS.zoneHalf,
      gridHalf: PITCH_PARAMS.gridHalf,
      ballRadius: PITCH_PARAMS.ballRadius,
    });
  });

  it("marks home runs as over the fence and the others as inside it", () => {
    const results: readonly InPlayResult[] = ["groundout", "doublePlay", "flyout", "lineout", "single", "double", "triple", "homerun", "error"];
    const overFence = results.map((result) => {
      const record: InPlayRecord = { seq: 4, result, ball: { type: "fly", strength: "strong", direction: "center" } };
      return toGameView(makeState({ lastInPlay: record })).fieldMarker?.overFence;
    });
    expect(overFence).toEqual([false, false, false, false, false, false, false, true, false]);
  });
});

describe("toGameView: purity", () => {
  it("does not change a deep-frozen state and returns equal views for equal input", () => {
    const state = deepFreeze(makeState({ lastInPlay: RECORD, log: [{ seq: 1, text: "ボール" }] }));
    expect(toGameView(state)).toEqual(toGameView(state));
  });
});

describe("toGameView: pitch outcome", () => {
  const BALL: BattedBall = { type: "liner", strength: "medium", direction: "center" };

  function resolvedState(result: PitchResult, plate: PlateOutcome | null, pitchSeq = 5): GameState {
    return makeState({ pitchSeq, lastResult: result, lastPlate: plate });
  }

  it("is null before the first pitch has been resolved", () => {
    expect(toGameView(makeState()).outcome).toBeNull();
    expect(toGameView(createInitialState({ config: AWAY, seed: 1 })).outcome).toBeNull();
  });

  it.each(["ball", "called-strike", "swinging-strike", "foul"] as const)(
    "describes a resolved %s with the current pitch sequence and no in-play detail",
    (kind) => {
      expect(toGameView(resolvedState({ kind }, null)).outcome).toEqual({ seq: 5, kind, inPlay: null, plate: null });
    },
  );

  it("carries the in-play result and batted ball, and the plate outcome", () => {
    const state = resolvedState({ kind: "in-play", result: "double", ball: BALL }, "double");
    expect(toGameView(state).outcome).toEqual({ seq: 5, kind: "in-play", inPlay: { result: "double", ball: BALL }, plate: "double" });
  });

  it("reports how the plate appearance ended: a walk, a strikeout, or null while it goes on", () => {
    expect(toGameView(resolvedState({ kind: "ball" }, "walk")).outcome?.plate).toBe("walk");
    expect(toGameView(resolvedState({ kind: "called-strike" }, "strikeout")).outcome?.plate).toBe("strikeout");
    expect(toGameView(resolvedState({ kind: "swinging-strike" }, "strikeout")).outcome?.plate).toBe("strikeout");
    expect(toGameView(resolvedState({ kind: "foul" }, null)).outcome?.plate).toBeNull();
  });

  it("keeps the previous pitch's outcome, and its seq (pitchSeq - 1), while the next pitch is in flight", () => {
    const next: PitchFlight = { ...flight("curve", 125, 1500), seq: 6 };
    const state = makeState({ pitchSeq: 6, lastResult: { kind: "foul" }, lastPlate: null, phase: { kind: "in-flight", flight: next } });
    expect(toGameView(state).outcome).toEqual({ seq: 5, kind: "foul", inPlay: null, plate: null });
  });

  it("uses the current pitch sequence once the game is over", () => {
    const state = makeState({
      pitchSeq: 9,
      lastResult: { kind: "in-play", result: "homerun", ball: BALL },
      lastPlate: "homerun",
      phase: { kind: "game-over", winner: "home" },
    });
    expect(toGameView(state).outcome).toEqual({ seq: 9, kind: "in-play", inPlay: { result: "homerun", ball: BALL }, plate: "homerun" });
  });

  it("does not change the outcome seq when the next pitch starts (through the reducer)", () => {
    const pitched = reduce(createInitialState({ config: AWAY, seed: 3 }), { type: "CPU_PITCH" });
    const resolved = reduce(pitched, { type: "PITCH_ARRIVED" });
    const resolvedOutcome = toGameView(resolved).outcome;
    expect(resolvedOutcome?.seq).toBe(flightOf(pitched).seq);
    expect(resolvedOutcome?.inPlay).toBeNull();

    const inFlight = reduce(resolved, { type: "CPU_PITCH" });
    expect(flightOf(inFlight).seq).toBe((resolvedOutcome?.seq ?? 0) + 1);
    expect(toGameView(inFlight).outcome).toEqual(resolvedOutcome);
  });

  it("matches the in-play record through the reducer (seq, result and batted ball)", () => {
    const pitched = reduce(createInitialState({ config: AWAY, seed: 3 }), { type: "CPU_PITCH" });
    const pitch = flightOf(pitched);
    const hit = reduce(pitched, { type: "SWING", swing: { kind: "power", cursor: pitch.landing, atMs: pitch.durationMs } });
    const outcome = toGameView(hit).outcome;
    expect(outcome?.seq).toBe(pitch.seq);
    if (hit.lastResult?.kind === "in-play") {
      expect(outcome).toEqual({ seq: pitch.seq, kind: "in-play", inPlay: { result: hit.lastResult.result, ball: hit.lastResult.ball }, plate: hit.lastPlate });
    } else {
      expect(outcome?.inPlay).toBeNull();
    }
  });
});

describe("toGameView: team colors and short names", () => {
  it("passes each side's team color through teamColors, whichever half it is", () => {
    const expected = { away: FIXTURE_AWAY_TEAM.uniformColor, home: FIXTURE_HOME_TEAM.uniformColor };
    expect(toGameView(makeState()).teamColors).toEqual(expected);
    expect(toGameView(makeState({ half: "bottom" })).teamColors).toEqual(expected);
  });

  it("uses the real teams' colors: Luminous blue, Nobles red (human away: Luminous is away)", () => {
    expect(toGameView(createInitialState({ config: AWAY, seed: 1 })).teamColors).toEqual({ away: PLAYER_TEAM.uniformColor, home: CPU_TEAM.uniformColor });
    expect(toGameView(createInitialState({ config: HOME, seed: 1 })).teamColors).toEqual({ away: CPU_TEAM.uniformColor, home: PLAYER_TEAM.uniformColor });
  });

  it("gives the offense the batting team's color and the defense the fielding team's color", () => {
    expect(toGameView(makeState({ half: "top" })).uniforms).toEqual({ offense: FIXTURE_AWAY_TEAM.uniformColor, defense: FIXTURE_HOME_TEAM.uniformColor });
    expect(toGameView(makeState({ half: "bottom" })).uniforms).toEqual({ offense: FIXTURE_HOME_TEAM.uniformColor, defense: FIXTURE_AWAY_TEAM.uniformColor });
  });

  it("does not change the uniforms while a pitch is in flight", () => {
    const phase = { kind: "in-flight", flight: flight("straight", 140, 1357) } as const;
    expect(toGameView(makeState({ half: "bottom", phase })).uniforms).toEqual(toGameView(makeState({ half: "bottom" })).uniforms);
  });

  it("swaps the uniforms across the change of sides, and not before the third out is resolved", () => {
    let state = createInitialState({ config: CPU_ONLY, seed: 7 });
    let before = toGameView(state);
    for (let step = 0; step < 400 && state.half === "top"; step += 1) {
      before = toGameView(state);
      state = reduce(state, state.phase.kind === "in-flight" ? { type: "PITCH_ARRIVED" } : { type: "CPU_PITCH" });
    }
    const after = toGameView(state);
    expect(state.half).toBe("bottom");
    expect(before.uniforms).toEqual({ offense: PLAYER_TEAM.uniformColor, defense: CPU_TEAM.uniformColor });
    expect(after.uniforms).toEqual({ offense: CPU_TEAM.uniformColor, defense: PLAYER_TEAM.uniformColor });
    expect(after.teamColors).toEqual(before.teamColors);
  });

  it("adds each team's short name to the scoreboard rows and keeps the team names", () => {
    const rows = toGameView(makeState()).scoreboard.rows;
    expect(rows.map((row) => row.shortName)).toEqual([FIXTURE_AWAY_TEAM.shortName, FIXTURE_HOME_TEAM.shortName]);
    expect(rows.map((row) => row.teamName)).toEqual([FIXTURE_AWAY_TEAM.name, FIXTURE_HOME_TEAM.name]);
    const real = toGameView(createInitialState({ config: AWAY, seed: 1 })).scoreboard.rows;
    expect(real.map((row) => [row.teamName, row.shortName])).toEqual([
      ["ルミナス", "ルミ"],
      ["ノーブルズ", "ノブ"],
    ]);
  });

  it("does not change a deep-frozen state when building the outcome and the colors", () => {
    const state = deepFreeze(makeState({ pitchSeq: 3, lastResult: { kind: "in-play", result: "single", ball: RECORD.ball }, lastPlate: "single" }));
    expect(toGameView(state)).toEqual(toGameView(state));
  });
});
