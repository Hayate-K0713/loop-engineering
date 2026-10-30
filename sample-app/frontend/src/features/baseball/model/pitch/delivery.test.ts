import { describe, expect, it } from "vitest";
import type { RngState } from "../../types/common";
import type { PitchCommand, PitchFlight, PitchKind, PitchQuality } from "../../types/pitch";
import type { PitcherProfile } from "../../types/team";
import { createRng } from "../rng/rng";
import { nextGaussian } from "../rng/sampling";
import { type DeliverPitchInput, deliverPitch, fatigueOf, staminaRatio } from "./delivery";
import { getPitchSpec } from "./kinds";
import { PITCH_PARAMS } from "./params";
import { cellToPoint } from "./zone";

const CENTER_COMMAND: PitchCommand = { kind: "straight", aim: { x: 0, y: 0 }, quality: "normal" };

const QUALITIES: readonly PitchQuality[] = ["nice", "good", "normal", "miss"];

function pitcherWith(overrides: Partial<PitcherProfile> = {}): PitcherProfile {
  return {
    id: "p",
    name: "テスト投手",
    speedKmh: 145,
    control: 90,
    stamina: 100,
    repertoire: ["straight", "slider", "curve", "fork", "shoot"],
    ...overrides,
  };
}

function inputWith(overrides: Partial<DeliverPitchInput> = {}): DeliverPitchInput {
  return { pitcher: pitcherWith(), command: CENTER_COMMAND, pitchCount: 0, aimSigmaScale: 1, seq: 1, ...overrides };
}

/** 同じ入力で `count` 球投げ、状態を引き回して飛行情報の列を返す。 */
function throwMany(seed: number, count: number, input: DeliverPitchInput): PitchFlight[] {
  const flights: PitchFlight[] = [];
  let rng: RngState = createRng(seed);
  for (let i = 0; i < count; i += 1) {
    const [flight, next] = deliverPitch(rng, input);
    flights.push(flight);
    rng = next;
  }
  return flights;
}

function standardDeviation(values: readonly number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

/** 中央狙いなので、着弾点の x・y がそのままばらつき(誤差)になる。 */
function spreadOf(flights: readonly PitchFlight[]): number {
  return standardDeviation(flights.flatMap((flight) => [flight.landing.x, flight.landing.y]));
}

describe("staminaRatio", () => {
  it("投球数 0 で 1、上限(stamina × pitchesPerStamina)の半分で 0.5、上限以上で 0", () => {
    const pitcher = pitcherWith({ stamina: 100 });
    const limit = 100 * PITCH_PARAMS.pitchesPerStamina;
    expect(staminaRatio(pitcher, 0)).toBe(1);
    expect(staminaRatio(pitcher, limit / 2)).toBeCloseTo(0.5, 12);
    expect(staminaRatio(pitcher, limit)).toBe(0);
    expect(staminaRatio(pitcher, limit * 2)).toBe(0);
  });

  it("スタミナが高いほど残量比が大きい", () => {
    expect(staminaRatio(pitcherWith({ stamina: 80 }), 60)).toBeGreaterThan(staminaRatio(pitcherWith({ stamina: 60 }), 60));
  });
});

describe("fatigueOf", () => {
  it("残量比が fatigueStartRatio 以上なら 0", () => {
    expect(fatigueOf(1)).toBe(0);
    expect(fatigueOf(PITCH_PARAMS.fatigueStartRatio + 0.1)).toBe(0);
  });

  it("残量比 0 で 1、その中間は線形", () => {
    expect(fatigueOf(0)).toBe(1);
    expect(fatigueOf(PITCH_PARAMS.fatigueStartRatio / 2)).toBeCloseTo(0.5, 12);
  });

  it("残量比が下がるほど単調に増える", () => {
    expect(fatigueOf(0.1)).toBeGreaterThan(fatigueOf(0.3));
    expect(fatigueOf(0.3)).toBeGreaterThan(fatigueOf(0.5));
  });
});

describe("deliverPitch", () => {
  it("同一入力・同一 rng で同一出力", () => {
    const rng = createRng(11);
    expect(deliverPitch(rng, inputWith())).toEqual(deliverPitch(rng, inputWith()));
  });

  it("seq・kind・aim を引き継ぐ", () => {
    const command: PitchCommand = { kind: "curve", aim: cellToPoint({ col: 1, row: 3 }), quality: "good" };
    const [flight] = deliverPitch(createRng(1), inputWith({ command, seq: 42 }));
    expect(flight.seq).toBe(42);
    expect(flight.kind).toBe("curve");
    expect(flight.aim).toEqual(command.aim);
    expect(flight.quality).toBe("good");
  });

  it("連続座標の狙いを使い、±aimLimit に収める", () => {
    const limit = PITCH_PARAMS.gauge.aimLimit;
    const [inside] = deliverPitch(createRng(1), inputWith({ command: { ...CENTER_COMMAND, aim: { x: 0.37, y: -1.21 } } }));
    expect(inside.aim).toEqual({ x: 0.37, y: -1.21 });
    const [outside] = deliverPitch(createRng(1), inputWith({ command: { ...CENTER_COMMAND, aim: { x: 9, y: -9 } } }));
    expect(outside.aim).toEqual({ x: limit, y: -limit });
  });

  it("乱数の消費は質・狙いによらず同じ(ガウス 2 回)で、同じ rng なら次の rng が一致する", () => {
    const rng = createRng(21);
    const [, expected] = deliverPitch(rng, inputWith());
    for (const quality of QUALITIES) {
      const [, next] = deliverPitch(rng, inputWith({ command: { kind: "slider", aim: { x: 1.3, y: -0.4 }, quality } }));
      expect(next).toBe(expected);
    }
  });

  it("質が良いほど着弾のばらつきが小さく、倍率は sigmaScale に近い(中央狙い・4,000 球)", () => {
    const spreads = QUALITIES.map((quality) => spreadOf(throwMany(2, 4000, inputWith({ command: { ...CENTER_COMMAND, quality } }))));
    const [nice, good, normal] = spreads;
    expect(spreads.every((spread, index) => index === 0 || spread > (spreads.at(index - 1) ?? 0))).toBe(true);
    expect(Math.abs(nice / normal - PITCH_PARAMS.gauge.sigmaScale.nice)).toBeLessThan(0.05);
    expect(Math.abs(good / normal - PITCH_PARAMS.gauge.sigmaScale.good)).toBeLessThan(0.05);
  });

  it("失投(miss)は着弾の中心が狙いから (0, 0.15) 側へ 60% 寄り、他の質は狙いのまま", () => {
    const command: PitchCommand = { kind: "straight", aim: { x: 1.5, y: -1.5 }, quality: "miss" };
    const miss = throwMany(3, 4000, inputWith({ pitcher: pitcherWith({ control: 100 }), command }));
    const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(mean(miss.map((flight) => flight.landing.x))).toBeCloseTo(1.5 * 0.4, 1);
    expect(mean(miss.map((flight) => flight.landing.y))).toBeCloseTo(-1.5 * 0.4 + 0.15 * 0.6, 1);
    const normal = throwMany(3, 4000, inputWith({ pitcher: pitcherWith({ control: 100 }), command: { ...command, quality: "normal" } }));
    expect(mean(normal.map((flight) => flight.landing.x))).toBeCloseTo(1.5, 1);
    expect(mean(normal.map((flight) => flight.landing.y))).toBeCloseTo(-1.5, 1);
    expect(miss.every((flight) => flight.aim.x === 1.5 && flight.aim.y === -1.5)).toBe(true);
  });

  it("乱数は x → y の順にガウス 2 回ぶん消費し、着弾は狙い + gauss × σ になる(コントロール 100・疲労なし)", () => {
    const rng = createRng(5);
    const input = inputWith({ pitcher: pitcherWith({ control: 100 }) });
    const [flight, next] = deliverPitch(rng, input);
    const [gaussX, afterX] = nextGaussian(rng);
    const [gaussY, afterY] = nextGaussian(afterX);
    expect(next).toBe(afterY);
    expect(flight.landing.x).toBeCloseTo(gaussX * PITCH_PARAMS.baseSigma, 12);
    expect(flight.landing.y).toBeCloseTo(gaussY * PITCH_PARAMS.baseSigma, 12);
  });

  it("コントロール高(90)は低(20)より着弾の標準偏差が小さい(2,000 球)", () => {
    const high = throwMany(1, 2000, inputWith({ pitcher: pitcherWith({ control: 90 }) }));
    const low = throwMany(1, 2000, inputWith({ pitcher: pitcherWith({ control: 20 }) }));
    expect(spreadOf(high)).toBeLessThan(spreadOf(low));
  });

  it("標準偏差が σ の式(baseSigma × (1 + (100 - control)/100 × controlSigmaFactor))に近い", () => {
    const flights = throwMany(3, 4000, inputWith({ pitcher: pitcherWith({ control: 80 }) }));
    const expected = PITCH_PARAMS.baseSigma * (1 + 0.2 * PITCH_PARAMS.controlSigmaFactor);
    expect(Math.abs(spreadOf(flights) - expected) / expected).toBeLessThan(0.1);
  });

  it("aimSigmaScale が大きいほどばらつきが大きい", () => {
    const tight = throwMany(2, 2000, inputWith({ aimSigmaScale: 0.5 }));
    const loose = throwMany(2, 2000, inputWith({ aimSigmaScale: 2 }));
    expect(spreadOf(tight)).toBeLessThan(spreadOf(loose));
  });

  it("疲労時(球数が上限近い)は標準偏差が大きく、球速が低下する", () => {
    const pitcher = pitcherWith({ stamina: 100 });
    const limit = 100 * PITCH_PARAMS.pitchesPerStamina;
    const fresh = throwMany(4, 2000, inputWith({ pitcher, pitchCount: 0 }));
    const tired = throwMany(4, 2000, inputWith({ pitcher, pitchCount: limit }));
    expect(spreadOf(tired)).toBeGreaterThan(spreadOf(fresh));
    expect(tired.every((flight) => flight.speedKmh === pitcher.speedKmh - PITCH_PARAMS.fatigueSlowKmh)).toBe(true);
    expect(fresh.every((flight) => flight.speedKmh === pitcher.speedKmh)).toBe(true);
  });

  it("疲労ゼロ(残量比が fatigueStartRatio 以上)のときは球数が違っても結果が変わらない", () => {
    const rng = createRng(6);
    const pitcher = pitcherWith({ stamina: 100 });
    expect(deliverPitch(rng, inputWith({ pitcher, pitchCount: 0 }))).toEqual(deliverPitch(rng, inputWith({ pitcher, pitchCount: 50 })));
  });

  it("疲労が進むほど球速が単調に落ちる", () => {
    const pitcher = pitcherWith({ stamina: 100 });
    const speedAt = (pitchCount: number): number => deliverPitch(createRng(1), inputWith({ pitcher, pitchCount }))[0].speedKmh;
    expect(speedAt(150)).toBeGreaterThan(speedAt(190));
    expect(speedAt(190)).toBeGreaterThan(speedAt(220));
  });

  it.each(["straight", "slider", "curve", "fork", "shoot"] as const satisfies readonly PitchKind[])(
    "%s の球速は 球速 + 球種オフセット、durationMs は round(flightMsKmh / 球速)",
    (kind) => {
      const pitcher = pitcherWith({ speedKmh: 145 });
      const [flight] = deliverPitch(createRng(1), inputWith({ pitcher, command: { kind, aim: { x: 0, y: 0 }, quality: "normal" } }));
      expect(flight.speedKmh).toBe(145 + getPitchSpec(kind).speedOffsetKmh);
      expect(flight.durationMs).toBe(Math.round(PITCH_PARAMS.flightMsKmh / flight.speedKmh));
    },
  );

  it("遅い球ほど飛行時間が長い", () => {
    const durationOf = (kind: PitchKind): number => deliverPitch(createRng(1), inputWith({ command: { kind, aim: { x: 0, y: 0 }, quality: "normal" } }))[0].durationMs;
    expect(durationOf("curve")).toBeGreaterThan(durationOf("fork"));
    expect(durationOf("fork")).toBeGreaterThan(durationOf("slider"));
    expect(durationOf("slider")).toBeGreaterThan(durationOf("shoot"));
    expect(durationOf("shoot")).toBeGreaterThan(durationOf("straight"));
  });

  it("140km/h のストレートの飛行時間はおよそ 1357ms", () => {
    const [flight] = deliverPitch(createRng(1), inputWith({ pitcher: pitcherWith({ speedKmh: 140 }) }));
    expect(flight.durationMs).toBe(1357);
  });

  it("着弾点が ±landingLimit に収まり、極端なばらつきでは境界に張り付く", () => {
    const wild = throwMany(8, 2000, inputWith({ pitcher: pitcherWith({ control: 0 }), aimSigmaScale: 10 }));
    const limit = PITCH_PARAMS.landingLimit;
    expect(wild.every((flight) => Math.abs(flight.landing.x) <= limit && Math.abs(flight.landing.y) <= limit)).toBe(true);
    expect(wild.some((flight) => Math.abs(flight.landing.x) === limit)).toBe(true);
  });
});
