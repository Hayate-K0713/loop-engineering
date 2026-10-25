import { describe, expect, it } from "vitest";
import type { PitchResult, SwingInput } from "../../types/batting";
import type { RngState } from "../../types/common";
import type { Bases } from "../../types/game";
import type { PitchFlight } from "../../types/pitch";
import type { BatterProfile } from "../../types/team";
import { createRng, nextFloat } from "../rng/rng";
import { effectiveRadii } from "./contact";
import { type ResolvePitchInput, resolvePitch } from "./resolve-pitch";

const BATTER: BatterProfile = { id: "b", name: "テスト打者", meet: 60, power: 80, trajectory: 2 };
const EMPTY_BASES: Bases = { first: false, second: false, third: false };
const FIRST_BASE: Bases = { first: true, second: false, third: false };
const DURATION_MS = 1300;
const HIT_KINDS = ["single", "double", "triple", "homerun"];

function flightAt(x: number, y: number): PitchFlight {
  return { seq: 1, kind: "straight", aim: { x, y }, landing: { x, y }, speedKmh: 146, durationMs: DURATION_MS };
}

/** 着弾点にカーソルを置き、ぴったりのタイミングで強振するスイング。 */
function perfectSwing(flight: PitchFlight, overrides: Partial<SwingInput> = {}): SwingInput {
  return { kind: "power", cursor: flight.landing, atMs: flight.durationMs, ...overrides };
}

function inputWith(overrides: Partial<ResolvePitchInput> = {}): ResolvePitchInput {
  const flight = overrides.flight ?? flightAt(0, 0);
  return { flight, swing: perfectSwing(flight), batter: BATTER, outs: 0, bases: EMPTY_BASES, ...overrides };
}

function isHit(result: PitchResult): boolean {
  return result.kind === "in-play" && HIT_KINDS.includes(result.result);
}

describe("resolvePitch: 見送り", () => {
  it("ゾーン内は called-strike、乱数を消費しない", () => {
    const rng = createRng(1);
    const [result, next] = resolvePitch(rng, inputWith({ flight: flightAt(0.5, -0.5), swing: null }));
    expect(result).toEqual({ kind: "called-strike" });
    expect(next).toBe(rng);
  });

  it("ゾーン外は ball、乱数を消費しない", () => {
    const rng = createRng(2);
    const [result, next] = resolvePitch(rng, inputWith({ flight: flightAt(1.3, 0), swing: null }));
    expect(result).toEqual({ kind: "ball" });
    expect(next).toBe(rng);
  });

  it("ゾーンの境界(±1 ちょうど)はストライク、わずかに外はボール", () => {
    const rng = createRng(3);
    expect(resolvePitch(rng, inputWith({ flight: flightAt(1, 1), swing: null }))[0]).toEqual({ kind: "called-strike" });
    expect(resolvePitch(rng, inputWith({ flight: flightAt(1.0001, 0), swing: null }))[0]).toEqual({ kind: "ball" });
    expect(resolvePitch(rng, inputWith({ flight: flightAt(0, -1.0001), swing: null }))[0]).toEqual({ kind: "ball" });
  });
});

describe("resolvePitch: 空振り・ファウル", () => {
  it("カーソルが遠い(楕円の外)と swinging-strike、乱数を消費しない", () => {
    const flight = flightAt(0, 0);
    const rng = createRng(4);
    const [result, next] = resolvePitch(rng, inputWith({ flight, swing: perfectSwing(flight, { cursor: { x: 1.5, y: 1.5 } }) }));
    expect(result).toEqual({ kind: "swinging-strike" });
    expect(next).toBe(rng);
  });

  it("タイミングが窓の外でも swinging-strike", () => {
    const flight = flightAt(0, 0);
    const [result] = resolvePitch(createRng(5), inputWith({ flight, swing: perfectSwing(flight, { atMs: DURATION_MS + 400 }) }));
    expect(result).toEqual({ kind: "swinging-strike" });
  });

  it("窓の端(早い・遅い)はファウル、乱数を消費しない", () => {
    const flight = flightAt(0, 0);
    const rng = createRng(6);
    const late = resolvePitch(rng, inputWith({ flight, swing: perfectSwing(flight, { kind: "meet", atMs: DURATION_MS + 140 }) }));
    const early = resolvePitch(rng, inputWith({ flight, swing: perfectSwing(flight, { kind: "meet", atMs: DURATION_MS - 140 }) }));
    expect(late[0]).toEqual({ kind: "foul" });
    expect(early[0]).toEqual({ kind: "foul" });
    expect(late[1]).toBe(rng);
    expect(early[1]).toBe(rng);
  });
});

describe("resolvePitch: インプレー", () => {
  it("完璧なスイング(カーソル = 着弾点・Δt = 0・強振・パワー 80)は連続シード 1000 個で全てインプレーになり、安打系が 1 件以上出る", () => {
    const input = inputWith();
    const results: PitchResult[] = [];
    for (let seed = 1; seed <= 1000; seed += 1) {
      results.push(resolvePitch(createRng(seed), input)[0]);
    }
    expect(results.every((result) => result.kind === "in-play")).toBe(true);
    expect(results.filter(isHit).length).toBeGreaterThan(0);
  });

  it("完璧な強振の打球は liner / strong / center", () => {
    const [result] = resolvePitch(createRng(7), inputWith());
    expect(result.kind === "in-play" ? result.ball : null).toEqual({ type: "liner", strength: "strong", direction: "center" });
  });

  it("乱数を 1 個だけ消費する(結果表の抽選)", () => {
    const rng = createRng(8);
    const [, next] = resolvePitch(rng, inputWith());
    expect(next).toBe(nextFloat(rng)[1]);
  });

  it("カーソルを着弾点より上にずらすと ground 打球になる", () => {
    const flight = flightAt(0, 0);
    const { ry } = effectiveRadii(BATTER, "meet", "straight");
    const [result] = resolvePitch(createRng(9), inputWith({ flight, swing: perfectSwing(flight, { kind: "meet", cursor: { x: 0, y: 0.8 * ry } }) }));
    expect(result.kind === "in-play" ? result.ball.type : null).toBe("ground");
  });

  it("カーソルを着弾点より下にずらすと fly 打球になる", () => {
    const flight = flightAt(0, 0);
    const { ry } = effectiveRadii(BATTER, "meet", "straight");
    const [result] = resolvePitch(createRng(10), inputWith({ flight, swing: perfectSwing(flight, { kind: "meet", cursor: { x: 0, y: -0.8 * ry } }) }));
    expect(result.kind === "in-play" ? result.ball.type : null).toBe("fly");
  });

  it("早振りは pull、遅れた振りは opposite の打球になる", () => {
    const flight = flightAt(0, 0);
    const early = resolvePitch(createRng(11), inputWith({ flight, swing: perfectSwing(flight, { kind: "meet", atMs: DURATION_MS - 60 }) }))[0];
    const late = resolvePitch(createRng(11), inputWith({ flight, swing: perfectSwing(flight, { kind: "meet", atMs: DURATION_MS + 60 }) }))[0];
    expect(early.kind === "in-play" ? early.ball.direction : null).toBe("pull");
    expect(late.kind === "in-play" ? late.ball.direction : null).toBe("opposite");
  });

  it("同一入力・同一 rng で同一出力", () => {
    const input = inputWith();
    expect(resolvePitch(createRng(12), input)).toEqual(resolvePitch(createRng(12), input));
  });
});

describe("resolvePitch: 併殺の可否", () => {
  /** ground 打球(強振)を作るスイングで、`count` 個のシードを回して併殺の件数を数える。 */
  function countDoublePlays(count: number, outs: number, bases: Bases): number {
    const flight = flightAt(0, 0);
    const { ry } = effectiveRadii(BATTER, "meet", "straight");
    const swing = perfectSwing(flight, { kind: "meet", cursor: { x: 0, y: 0.8 * ry } });
    let rng: RngState = createRng(500);
    let doublePlays = 0;
    for (let i = 0; i < count; i += 1) {
      const [result, next] = resolvePitch(rng, inputWith({ flight, swing, outs, bases }));
      doublePlays += result.kind === "in-play" && result.result === "doublePlay" ? 1 : 0;
      rng = next;
    }
    return doublePlays;
  }

  it("1 塁走者あり・0 アウト・1 アウトでは併殺が出る", () => {
    expect(countDoublePlays(2000, 0, FIRST_BASE)).toBeGreaterThan(0);
    expect(countDoublePlays(2000, 1, FIRST_BASE)).toBeGreaterThan(0);
  });

  it("1 塁が空いていると併殺は出ない", () => {
    expect(countDoublePlays(2000, 0, EMPTY_BASES)).toBe(0);
    expect(countDoublePlays(2000, 1, { first: false, second: true, third: true })).toBe(0);
  });

  it("2 アウトでは併殺は出ない", () => {
    expect(countDoublePlays(2000, 2, FIRST_BASE)).toBe(0);
  });
});
