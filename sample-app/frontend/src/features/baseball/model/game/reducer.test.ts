import { describe, expect, it } from "vitest";
import type { GameAction } from "../../types/actions";
import type { SwingInput } from "../../types/batting";
import type { Difficulty, GameConfig, GameState, Innings } from "../../types/game";
import type { PitchCommand, PitchFlight } from "../../types/pitch";
import { chooseCpuPitch } from "../cpu/cpu-pitcher";
import { getDifficulty } from "../cpu/difficulty";
import { deliverPitch } from "../pitch/delivery";
import { cellToPoint, isStrike } from "../pitch/zone";
import { reduce } from "./reducer";
import { DEFAULT_MAX_ACTIONS, simulateGame } from "./simulate";
import { createInitialState } from "./state";
import { makeState, parseBases } from "./test-fixtures";
import { toGameView } from "./view";

const HUMAN_AWAY: GameConfig = { innings: 3, humanSide: "away", difficulty: "normal" };
const HUMAN_HOME: GameConfig = { innings: 3, humanSide: "home", difficulty: "normal" };
const CPU_ONLY: GameConfig = { innings: 3, humanSide: null, difficulty: "normal" };

const CPU_PITCH: GameAction = { type: "CPU_PITCH" };
const PITCH_ARRIVED: GameAction = { type: "PITCH_ARRIVED" };
const CENTER_STRAIGHT: PitchCommand = { kind: "straight", aim: { x: 0, y: 0 }, quality: "normal" };

const ALL_INNINGS: readonly Innings[] = [1, 3, 5, 9];
const ALL_DIFFICULTIES: readonly Difficulty[] = ["easy", "normal", "hard"];

const BALL_FLIGHT: PitchFlight = { seq: 5, kind: "straight", aim: { x: 0, y: 0 }, landing: { x: 1.6, y: 1.6 }, speedKmh: 140, durationMs: 1357, quality: "normal" };
const STRIKE_FLIGHT: PitchFlight = { ...BALL_FLIGHT, landing: { x: 0, y: 0 } };

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

function start(config: GameConfig, seed = 1): GameState {
  return createInitialState({ config, seed });
}

function flightOf(state: GameState): PitchFlight {
  if (state.phase.kind !== "in-flight") {
    throw new Error("expected an in-flight state");
  }
  return state.phase.flight;
}

/** カーソルを着弾点に合わせ、到達時刻ちょうどに振るスイング(必ずインプレーのフェア打球になる)。 */
function perfectSwing(flight: PitchFlight): SwingInput {
  return { kind: "power", cursor: flight.landing, atMs: flight.durationMs };
}

/** 判定中の球。`overrides` で状況を差し替える。 */
function inFlight(flight: PitchFlight, overrides: Partial<GameState> = {}): GameState {
  return makeState({ phase: { kind: "in-flight", flight }, pitchSeq: flight.seq, ...overrides });
}

function logTexts(state: GameState): string[] {
  return state.log.map((entry) => entry.text);
}

describe("reduce: purity", () => {
  it("returns deeply equal results for the same input and never mutates deep-frozen inputs", () => {
    const initial = deepFreeze(start(HUMAN_AWAY));
    const pitched = reduce(initial, CPU_PITCH);
    expect(reduce(initial, CPU_PITCH)).toEqual(pitched);

    const frozenPitched = deepFreeze(pitched);
    const resolved = reduce(frozenPitched, { type: "SWING", swing: perfectSwing(flightOf(pitched)) });
    expect(reduce(frozenPitched, { type: "SWING", swing: perfectSwing(flightOf(pitched)) })).toEqual(resolved);

    const cpuAtBat = deepFreeze(start(HUMAN_HOME));
    const cpuPitched = reduce(cpuAtBat, { type: "THROW", command: CENTER_STRAIGHT });
    const cpuResolved = reduce(deepFreeze(cpuPitched), PITCH_ARRIVED);
    expect(cpuResolved.pitchSeq).toBe(1);
  });
});

describe("CPU_PITCH", () => {
  it("throws a pitch: in-flight, pitchSeq +1, only the fielding side's pitch count +1, rng advanced, flight.seq = the new pitchSeq", () => {
    const state = start(HUMAN_AWAY);
    const next = reduce(state, CPU_PITCH);
    expect(next.phase.kind).toBe("in-flight");
    expect(next.pitchSeq).toBe(1);
    expect(flightOf(next).seq).toBe(next.pitchSeq);
    expect(next.pitchCounts).toEqual({ away: 0, home: 1 });
    expect(next.rng).not.toBe(state.rng);
    expect(next.lastPitchKind).toBe(flightOf(next).kind);
  });

  it("uses chooseCpuPitch (cell centre as the aim, quality normal), then deliverPitch with the difficulty's aimSigmaScale, the pre-increment pitch count and seq = pitchSeq + 1", () => {
    const base = start({ innings: 3, humanSide: "away", difficulty: "hard" }, 99);
    const state: GameState = { ...base, pitchSeq: 12, pitchCounts: { away: 0, home: 40 }, count: { balls: 1, strikes: 2 }, lastPitchKind: "slider" };
    const next = reduce(state, CPU_PITCH);

    const difficulty = getDifficulty("hard");
    const pitcher = state.teams.home.pitcher;
    const [choice, afterChoice] = chooseCpuPitch(state.rng, { count: state.count, pitcher, lastKind: "slider", difficulty });
    const command: PitchCommand = { kind: choice.kind, aim: cellToPoint(choice.cell), quality: "normal" };
    const [flight, rng] = deliverPitch(afterChoice, { pitcher, command, pitchCount: 40, aimSigmaScale: difficulty.aimSigmaScale, seq: 13 });
    expect(next.phase).toEqual({ kind: "in-flight", flight });
    expect(flight.aim).toEqual(cellToPoint(choice.cell));
    expect(flight.quality).toBe("normal");
    expect(next.rng).toBe(rng);
    expect(next.pitchCounts).toEqual({ away: 0, home: 41 });
    expect(next.lastPitchKind).toBe(command.kind);
  });

  it("counts the pitch for the away side when the bottom half begins", () => {
    const state = makeState({ config: HUMAN_HOME, half: "bottom", lineScore: { away: [0], home: [0] } });
    expect(reduce(state, CPU_PITCH).pitchCounts).toEqual({ away: 1, home: 0 });
  });

  it("does nothing when the human is fielding", () => {
    const state = start(HUMAN_HOME);
    expect(reduce(state, CPU_PITCH)).toBe(state);
  });
});

describe("THROW", () => {
  it("delivers the human's command with aimSigmaScale 1, the pre-increment pitch count and seq = pitchSeq + 1", () => {
    const base = start(HUMAN_HOME, 7);
    const state: GameState = { ...base, pitchSeq: 30, pitchCounts: { away: 0, home: 25 } };
    const command: PitchCommand = { kind: "curve", aim: { x: -1.2, y: -0.8 }, quality: "good" };
    const next = reduce(state, { type: "THROW", command });

    const [flight, rng] = deliverPitch(state.rng, { pitcher: state.teams.home.pitcher, command, pitchCount: 25, aimSigmaScale: 1, seq: 31 });
    expect(next.phase).toEqual({ kind: "in-flight", flight });
    expect(flight.aim).toEqual({ x: -1.2, y: -0.8 });
    expect(flight.quality).toBe("good");
    expect(next.rng).toBe(rng);
    expect(next.pitchSeq).toBe(31);
    expect(next.pitchCounts).toEqual({ away: 0, home: 26 });
    expect(next.lastPitchKind).toBe("curve");
  });

  it("counts the human's pitch for the away side in the bottom half", () => {
    const state = makeState({ half: "bottom", lineScore: { away: [0], home: [0] } });
    const next = reduce(state, { type: "THROW", command: CENTER_STRAIGHT });
    expect(next.pitchCounts).toEqual({ away: 1, home: 0 });
    expect(flightOf(next).seq).toBe(1);
  });

  it("does nothing when the human is batting", () => {
    const state = start(HUMAN_AWAY);
    expect(reduce(state, { type: "THROW", command: CENTER_STRAIGHT })).toBe(state);
  });
});

describe("SWING", () => {
  it("resolves a perfect swing as an in-play ball: back to await-pitch, lastInPlay.seq = flight.seq, one rng draw, log appended", () => {
    const pitched = reduce(start(HUMAN_AWAY, 3), CPU_PITCH);
    const flight = flightOf(pitched);
    const next = reduce(pitched, { type: "SWING", swing: perfectSwing(flight) });
    expect(next.lastResult?.kind).toBe("in-play");
    expect(next.lastInPlay?.seq).toBe(flight.seq);
    expect(next.pitchSeq).toBe(pitched.pitchSeq);
    expect(next.phase).toEqual({ kind: "await-pitch" });
    expect(next.rng).not.toBe(pitched.rng);
    expect(next.lastPlate).not.toBeNull();
    expect(next.log.length).toBeGreaterThan(0);
    expect(next.log.every((entry) => entry.seq === flight.seq)).toBe(true);
  });

  it("counts a swing at nothing as a swinging strike without consuming a random number", () => {
    const state = inFlight(STRIKE_FLIGHT);
    const swing: SwingInput = { kind: "meet", cursor: { x: -1.7, y: -1.7 }, atMs: STRIKE_FLIGHT.durationMs };
    const next = reduce(state, { type: "SWING", swing });
    expect(next.lastResult).toEqual({ kind: "swinging-strike" });
    expect(next.count).toEqual({ balls: 0, strikes: 1 });
    expect(next.lastPlate).toBeNull();
    expect(next.rng).toBe(state.rng);
    expect(logTexts(next)).toEqual(["空振り"]);
  });

  it("does nothing outside a flight or when the human is not batting", () => {
    const waiting = start(HUMAN_AWAY);
    expect(reduce(waiting, { type: "SWING", swing: perfectSwing(STRIKE_FLIGHT) })).toBe(waiting);
    const cpuBatting = inFlight(STRIKE_FLIGHT, { config: HUMAN_HOME });
    expect(reduce(cpuBatting, { type: "SWING", swing: perfectSwing(STRIKE_FLIGHT) })).toBe(cpuBatting);
  });
});

describe("PITCH_ARRIVED", () => {
  it("is a take for a human batter: a called strike in the zone, a ball outside, and no random number is consumed", () => {
    const strike = inFlight(STRIKE_FLIGHT);
    const ball = inFlight(BALL_FLIGHT);
    expect(isStrike(STRIKE_FLIGHT.landing)).toBe(true);
    expect(isStrike(BALL_FLIGHT.landing)).toBe(false);
    expect(reduce(strike, PITCH_ARRIVED).lastResult).toEqual({ kind: "called-strike" });
    expect(reduce(ball, PITCH_ARRIVED).lastResult).toEqual({ kind: "ball" });
    expect(reduce(strike, PITCH_ARRIVED).rng).toBe(strike.rng);
    expect(reduce(ball, PITCH_ARRIVED).rng).toBe(ball.rng);
  });

  it("lets a CPU batter decide (consuming random numbers) and resolves through the same judgement", () => {
    const pitched = reduce(start(HUMAN_HOME, 5), { type: "THROW", command: CENTER_STRAIGHT });
    const next = reduce(pitched, PITCH_ARRIVED);
    expect(next.rng).not.toBe(pitched.rng);
    expect(next.lastResult).not.toBeNull();
    expect(next.phase.kind === "await-pitch" || next.phase.kind === "game-over").toBe(true);
  });

  it("does nothing unless a pitch is in flight", () => {
    const state = start(HUMAN_AWAY);
    expect(reduce(state, PITCH_ARRIVED)).toBe(state);
  });
});

describe("invalid action and phase combinations return the same state reference", () => {
  const flying = inFlight(STRIKE_FLIGHT);
  const over = makeState({ phase: { kind: "game-over", winner: "home" } });
  const actions: readonly GameAction[] = [
    CPU_PITCH,
    { type: "THROW", command: CENTER_STRAIGHT },
    { type: "SWING", swing: perfectSwing(STRIKE_FLIGHT) },
    PITCH_ARRIVED,
  ];

  it("ignores pitching actions while a pitch is in flight", () => {
    expect(reduce(flying, CPU_PITCH)).toBe(flying);
    expect(reduce(flying, { type: "THROW", command: CENTER_STRAIGHT })).toBe(flying);
  });

  it("ignores SWING and PITCH_ARRIVED while waiting for a pitch", () => {
    const waiting = makeState();
    expect(reduce(waiting, { type: "SWING", swing: perfectSwing(STRIKE_FLIGHT) })).toBe(waiting);
    expect(reduce(waiting, PITCH_ARRIVED)).toBe(waiting);
  });

  it("ignores every action once the game is over", () => {
    expect(actions.map((action) => reduce(over, action) === over)).toEqual([true, true, true, true]);
  });
});

describe("resolution: runs, innings and the end of the game", () => {
  it("a bases-loaded walk forces in a run and logs the ball, the walk and the run", () => {
    const state = inFlight(BALL_FLIGHT, { count: { balls: 3, strikes: 0 }, bases: parseBases("123") });
    const next = reduce(state, PITCH_ARRIVED);
    expect(next.lineScore.away).toEqual([1]);
    expect(next.count).toEqual({ balls: 0, strikes: 0 });
    expect(next.lineupIndex.away).toBe(1);
    expect(next.lastPlate).toBe("walk");
    expect(next.phase).toEqual({ kind: "await-pitch" });
    expect(logTexts(next)).toEqual(["ボール", "四球", "1点が入りました"]);
  });

  it("the third out ends the half inning and moves to the bottom of the same inning", () => {
    const state = inFlight(STRIKE_FLIGHT, { outs: 2, count: { balls: 0, strikes: 2 }, bases: parseBases("1--") });
    const next = reduce(state, PITCH_ARRIVED);
    expect(next.inning).toBe(1);
    expect(next.half).toBe("bottom");
    expect(next.outs).toBe(0);
    expect(next.bases).toEqual(parseBases("---"));
    expect(next.lineScore).toEqual({ away: [0], home: [0] });
    expect(next.phase).toEqual({ kind: "await-pitch" });
    expect(logTexts(next)).toEqual(["見逃しストライク", "三振", "3アウトチェンジ"]);
  });

  it("when the home team leads after the top of the last inning, the game ends without a bottom half", () => {
    const state = inFlight(STRIKE_FLIGHT, { inning: 3, outs: 2, count: { balls: 0, strikes: 2 }, lineScore: { away: [0, 0, 0], home: [1, 0] } });
    const next = reduce(state, PITCH_ARRIVED);
    expect(next.phase).toEqual({ kind: "game-over", winner: "home" });
    expect(next.lineScore.home).toEqual([1, 0]);
    expect(logTexts(next)).toEqual(["見逃しストライク", "三振", "試合終了 後攻の勝ち"]);
  });

  it("a walk-off ends the game the moment the home team takes the lead", () => {
    const state = inFlight(BALL_FLIGHT, {
      config: HUMAN_HOME,
      inning: 3,
      half: "bottom",
      count: { balls: 3, strikes: 0 },
      bases: parseBases("123"),
      lineScore: { away: [0, 0, 0], home: [0, 0, 0] },
    });
    const next = reduce(state, PITCH_ARRIVED);
    expect(next.phase).toEqual({ kind: "game-over", winner: "home" });
    expect(next.lineScore.home).toEqual([0, 0, 1]);
    expect(logTexts(next)).toEqual(["ボール", "四球", "1点が入りました", "試合終了 後攻の勝ち"]);
  });

  it("a tie after the last inning goes to extra innings with the tiebreak runners on first and second", () => {
    const state = inFlight(STRIKE_FLIGHT, {
      config: { innings: 1, humanSide: "home", difficulty: "normal" },
      half: "bottom",
      outs: 2,
      count: { balls: 0, strikes: 2 },
      lineScore: { away: [0], home: [0] },
    });
    const next = reduce(state, PITCH_ARRIVED);
    expect(next.inning).toBe(2);
    expect(next.half).toBe("top");
    expect(next.bases).toEqual(parseBases("12-"));
    expect(next.lineScore).toEqual({ away: [0, 0], home: [0] });
    expect(next.phase).toEqual({ kind: "await-pitch" });
  });

  it("a tie after the last extra inning is a draw", () => {
    const state = inFlight(STRIKE_FLIGHT, {
      config: { innings: 1, humanSide: "home", difficulty: "normal" },
      inning: 4,
      half: "bottom",
      outs: 2,
      count: { balls: 0, strikes: 2 },
      lineScore: { away: [0, 0, 0, 0], home: [0, 0, 0, 0] },
    });
    const next = reduce(state, PITCH_ARRIVED);
    expect(next.phase).toEqual({ kind: "game-over", winner: null });
    expect(logTexts(next).at(-1)).toBe("試合終了 引き分け");
  });
});

/** 人間は全球見送り(守備では固定のコースへ投げる)。CPU 側の手番は reducer に任せる。 */
function passiveAction(state: GameState): GameAction {
  if (state.phase.kind === "in-flight") {
    return PITCH_ARRIVED;
  }
  const humanFields = state.config.humanSide === (state.half === "top" ? "home" : "away");
  return humanFields ? { type: "THROW", command: CENTER_STRAIGHT } : CPU_PITCH;
}

function playPassively(config: GameConfig, seed: number, observe: (state: GameState) => void = () => undefined): { final: GameState; actions: number } {
  let state = start(config, seed);
  let actions = 0;
  while (state.phase.kind !== "game-over" && actions < DEFAULT_MAX_ACTIONS) {
    state = reduce(state, passiveAction(state));
    observe(state);
    actions += 1;
  }
  return { final: state, actions };
}

describe("whole games", () => {
  it("CPU vs CPU games always reach game-over within the simulateGame limit (innings 1/3/5/9 x difficulties x 30 seeds), with a consistent plate count", () => {
    const problems: string[] = [];
    for (const innings of ALL_INNINGS) {
      for (const difficulty of ALL_DIFFICULTIES) {
        for (let seed = 1; seed <= 30; seed += 1) {
          const { final, plates, actions } = simulateGame({ innings, humanSide: null, difficulty }, seed);
          const parityOk = (final.lineupIndex.away + final.lineupIndex.home) % 9 === plates.length % 9;
          if (final.phase.kind !== "game-over" || actions > DEFAULT_MAX_ACTIONS || !parityOk) {
            problems.push(`${innings}/${difficulty}/${seed}`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  }, 30_000);

  it("games where the human takes every pitch (and throws a fixed pitch when fielding) always finish", () => {
    const configs: GameConfig[] = (["away", "home"] as const).flatMap((humanSide) =>
      ([1, 3] as const).flatMap((innings) => ALL_DIFFICULTIES.map((difficulty) => ({ innings, humanSide, difficulty }))),
    );
    const seeds = [1, 2, 3, 4, 5];
    const unfinished = configs.flatMap((config) =>
      seeds
        .filter((seed) => playPassively(config, seed).final.phase.kind !== "game-over")
        .map((seed) => `${config.humanSide}/${config.innings}/${config.difficulty}/${seed}`),
    );
    expect(unfinished).toEqual([]);
  }, 30_000);

  it("the same seed and the same actions give the same final state", () => {
    const first = playPassively(HUMAN_AWAY, 11);
    const second = playPassively(HUMAN_AWAY, 11);
    expect(first.final).toEqual(second.final);
    expect(first.actions).toBe(second.actions);
    expect(playPassively(HUMAN_AWAY, 12).final).not.toEqual(first.final);
  });

  it("calling toGameView after every action does not change the final state (rng included)", () => {
    const quiet = playPassively(HUMAN_HOME, 21);
    const observed = playPassively(HUMAN_HOME, 21, (state) => {
      toGameView(state);
    });
    expect(observed.final).toEqual(quiet.final);
    expect(observed.final.rng).toBe(quiet.final.rng);
  });

  it("the CPU-only fielding path also leaves the final state unchanged by toGameView", () => {
    const quiet = playPassively({ ...CPU_ONLY, innings: 1 }, 4);
    const observed = playPassively({ ...CPU_ONLY, innings: 1 }, 4, (state) => {
      toGameView(state);
    });
    expect(observed.final).toEqual(quiet.final);
  });
});

describe("simulateGame", () => {
  it("is deterministic and reports the dispatched action count", () => {
    const first = simulateGame(CPU_ONLY, 8);
    const second = simulateGame(CPU_ONLY, 8);
    expect(second).toEqual(first);
    expect(first.actions).toBeGreaterThan(0);
    expect(first.final.phase.kind).toBe("game-over");
  });

  it("records only the plate appearances that ended", () => {
    const { plates, final } = simulateGame(CPU_ONLY, 9);
    expect(plates.length).toBeGreaterThan(0);
    const hits = plates.filter((plate) => plate === "single" || plate === "double" || plate === "triple" || plate === "homerun").length;
    expect(hits).toBe(final.hits.away + final.hits.home);
  });

  it("throws when the game does not finish within maxActions", () => {
    expect(() => simulateGame(CPU_ONLY, 8, 3)).toThrow(Error);
  });

  it("throws when a human side is configured (CPU vs CPU only)", () => {
    expect(() => simulateGame(HUMAN_AWAY, 8)).toThrow(Error);
  });
});
