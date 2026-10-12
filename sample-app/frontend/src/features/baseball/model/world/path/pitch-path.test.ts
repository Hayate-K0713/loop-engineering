import { describe, expect, it } from "vitest";
import type { PitchFlight, PitchKind } from "../../../types/pitch";
import { ALL_CELLS, cellToPoint } from "../../pitch/zone";
import { zoneToWorld } from "../space/coords";
import { RELEASE_POINT, WORLD_PARAMS } from "../space/params";
import { mittBallAt, pitchBallAt } from "./pitch-path";

const KINDS: readonly PitchKind[] = ["straight", "slider", "curve", "fork", "shoot"];
const BENDING_KINDS: readonly PitchKind[] = ["slider", "curve", "fork", "shoot"];
const DURATION_MS = 1400;
const SAMPLE_COUNT = 56;
const SAMPLES: readonly number[] = Array.from({ length: SAMPLE_COUNT + 1 }, (_, i) => (i / SAMPLE_COUNT) * DURATION_MS);

/** 5球種 × 25セルの全組み合わせ。 */
const ALL_FLIGHTS: readonly PitchFlight[] = KINDS.flatMap((kind) =>
  ALL_CELLS.map((cell): PitchFlight => {
    const point = cellToPoint(cell);
    return { seq: 1, kind, aim: point, landing: point, speedKmh: 140, durationMs: DURATION_MS };
  }),
);

function flightOf(kind: PitchKind, landing = { x: 0.4, y: -0.3 }): PitchFlight {
  return { seq: 1, kind, aim: landing, landing, speedKmh: 140, durationMs: DURATION_MS };
}

describe("pitchBallAt: 端点", () => {
  it("elapsed = 0 でリリース点に厳密一致する(全球種 × 全セル)", () => {
    for (const flight of ALL_FLIGHTS) {
      expect(pitchBallAt(flight, 0)).toEqual(RELEASE_POINT);
    }
  });

  it("elapsed = durationMs で zoneToWorld(landing) に一致する(全球種 × 全セル、1e-9)", () => {
    for (const flight of ALL_FLIGHTS) {
      const expected = zoneToWorld(flight.landing);
      const actual = pitchBallAt(flight, flight.durationMs);
      expect(actual.x).toBeCloseTo(expected.x, 9);
      expect(actual.y).toBeCloseTo(expected.y, 9);
      expect(actual.z).toBeCloseTo(expected.z, 9);
    }
  });

  it("範囲外の経過時間はクランプされる", () => {
    for (const flight of ALL_FLIGHTS) {
      expect(pitchBallAt(flight, -500)).toEqual(pitchBallAt(flight, 0));
      expect(pitchBallAt(flight, DURATION_MS * 5)).toEqual(pitchBallAt(flight, DURATION_MS));
    }
  });

  it("durationMs が 0 以下でも着弾点を返す(ゼロ除算しない)", () => {
    const flight: PitchFlight = { ...flightOf("curve"), durationMs: 0 };
    expect(pitchBallAt(flight, 0)).toEqual(zoneToWorld(flight.landing));
  });
});

describe("pitchBallAt: 経路", () => {
  it("z が単調に増加する(全球種 × 全セル)", () => {
    for (const flight of ALL_FLIGHTS) {
      const zs = SAMPLES.map((elapsed) => pitchBallAt(flight, elapsed).z);
      expect(zs.every((z, i) => i === 0 || z > (zs.at(i - 1) ?? Number.POSITIVE_INFINITY))).toBe(true);
    }
  });

  it("y は 0 以上 3 以下に収まり、全成分が有限(全球種 × 全セル)", () => {
    for (const flight of ALL_FLIGHTS) {
      for (const elapsed of SAMPLES) {
        const { x, y, z } = pitchBallAt(flight, elapsed);
        expect([x, y, z].every(Number.isFinite)).toBe(true);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(3);
      }
    }
  });

  it("ストレートは直線(arcHeight 分の持ち上げを除く)で、x は release と着弾点の補間", () => {
    const flight = flightOf("straight");
    const landing = zoneToWorld(flight.landing);
    const middle = pitchBallAt(flight, DURATION_MS / 2);
    expect(middle.x).toBeCloseTo((RELEASE_POINT.x + landing.x) / 2, 12);
    expect(middle.z).toBeCloseTo((RELEASE_POINT.z + landing.z) / 2, 12);
    expect(middle.y).toBeCloseTo((RELEASE_POINT.y + landing.y) / 2 + WORLD_PARAMS.pitch.arcHeight, 12);
  });

  it.each(BENDING_KINDS)("%s は中間で直線(ストレート)からずれ、終点では一致する", (kind) => {
    const bending = flightOf(kind);
    const straight = flightOf("straight");
    const middle = pitchBallAt(bending, DURATION_MS / 2);
    const reference = pitchBallAt(straight, DURATION_MS / 2);
    expect(Math.hypot(middle.x - reference.x, middle.y - reference.y)).toBeGreaterThan(0.01);
    expect(pitchBallAt(bending, DURATION_MS)).toEqual(pitchBallAt(straight, DURATION_MS));
  });

  it("曲がる球種の直線からのずれは bend × (p − p³) で、終盤に向かって 0 へ収束する(p = 0.9 のずれは p = 0.6 より小さい)", () => {
    for (const kind of BENDING_KINDS) {
      const bending = flightOf(kind);
      const straight = flightOf("straight");
      const gap = (p: number): number => {
        const a = pitchBallAt(bending, DURATION_MS * p);
        const b = pitchBallAt(straight, DURATION_MS * p);
        return Math.hypot(a.x - b.x, a.y - b.y);
      };
      expect(gap(0.6)).toBeGreaterThan(gap(0.9));
      expect(gap(0.9)).toBeGreaterThan(gap(0.99));
    }
  });

  it("入力の flight を変更しない", () => {
    const flight = flightOf("fork");
    const before = structuredClone(flight);
    pitchBallAt(flight, 700);
    expect(flight).toEqual(before);
  });
});

describe("mittBallAt", () => {
  it("sinceArrival = 0 は pitchBallAt(flight, durationMs) に厳密一致する(全球種 × 全セル)", () => {
    for (const flight of ALL_FLIGHTS) {
      expect(mittBallAt(flight, 0)).toEqual(pitchBallAt(flight, flight.durationMs));
    }
  });

  it("mittMs 以降はミット位置 (z = mitt.z) で動かない", () => {
    const { travelMs, z, yOffset } = WORLD_PARAMS.mitt;
    for (const flight of ALL_FLIGHTS) {
      const landing = zoneToWorld(flight.landing);
      const atMitt = mittBallAt(flight, travelMs);
      expect(atMitt).toEqual({ x: landing.x, y: landing.y + yOffset, z });
      expect(mittBallAt(flight, travelMs + 1000)).toEqual(atMitt);
    }
  });

  it("途中は着弾点とミットの線形補間で、z が単調に増える", () => {
    const flight = flightOf("straight");
    const { travelMs } = WORLD_PARAMS.mitt;
    const landing = pitchBallAt(flight, DURATION_MS);
    const mitt = mittBallAt(flight, travelMs);
    const half = mittBallAt(flight, travelMs / 2);
    expect(half.z).toBeCloseTo((landing.z + mitt.z) / 2, 12);
    expect(half.y).toBeCloseTo((landing.y + mitt.y) / 2, 12);
    const zs = [0, 0.25, 0.5, 0.75, 1].map((ratio) => mittBallAt(flight, travelMs * ratio).z);
    expect(zs.every((z, i) => i === 0 || z > (zs.at(i - 1) ?? Number.POSITIVE_INFINITY))).toBe(true);
  });

  it("負の経過時間は着弾点のまま", () => {
    const flight = flightOf("slider");
    expect(mittBallAt(flight, -100)).toEqual(mittBallAt(flight, 0));
  });
});
