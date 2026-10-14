import { describe, expect, it } from "vitest";
import type { PitchFlight, PitchKind } from "../../../types/pitch";
import { ALL_CELLS, cellToPoint } from "../../pitch/zone";
import { getPitchSpec } from "../../pitch/kinds";
import { ZONE_HALF_HEIGHT, zoneToWorld } from "../space/coords";
import { RELEASE_POINT, WORLD_PARAMS } from "../space/params";
import { heldBallAt, pitchBallAt } from "./pitch-path";

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

const { breakExponent, bendGain, speedProfile, arcHeight } = WORLD_PARAMS.pitch;

/** 進行の時間写像 g(p)。テストでは式から直接計算する。 */
function g(progress: number): number {
  return progress + speedProfile * progress * (1 - progress);
}

/** 球種の終盤の曲がり量(ワールドの m。bendGain 込み)。 */
function breakOf(kind: PitchKind): { readonly x: number; readonly y: number } {
  const { bend } = getPitchSpec(kind);
  return { x: bend.x * WORLD_PARAMS.zone.halfWidth * bendGain, y: bend.y * ZONE_HALF_HEIGHT * bendGain };
}

/** 同じ着弾・同じ時刻のストレートからのずれ(球種の曲がりだけ。放物線の持ち上げは打ち消し合う)。 */
function deviationOf(kind: PitchKind, progress: number, landing = { x: 0.4, y: -0.3 }): { readonly x: number; readonly y: number } {
  const bending = pitchBallAt(flightOf(kind, landing), DURATION_MS * progress);
  const straight = pitchBallAt(flightOf("straight", landing), DURATION_MS * progress);
  return { x: bending.x - straight.x, y: bending.y - straight.y };
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

  it("ストレートは直線(arcHeight 分の持ち上げを除く)で、中点は g(0.5) の位置にある", () => {
    const flight = flightOf("straight");
    const landing = zoneToWorld(flight.landing);
    const middle = pitchBallAt(flight, DURATION_MS / 2);
    const ratio = g(0.5);
    expect(middle.x).toBeCloseTo(RELEASE_POINT.x + (landing.x - RELEASE_POINT.x) * ratio, 12);
    expect(middle.z).toBeCloseTo(RELEASE_POINT.z + (landing.z - RELEASE_POINT.z) * ratio, 12);
    expect(middle.y).toBeCloseTo(RELEASE_POINT.y + (landing.y - RELEASE_POINT.y) * ratio + arcHeight, 12);
  });

  it("時間写像 g は g(0) = 0・g(1) = 1 で単調増加(z の進みから求める)", () => {
    const flight = flightOf("straight");
    const landing = zoneToWorld(flight.landing);
    const progresses = SAMPLES.map((elapsed) => (pitchBallAt(flight, elapsed).z - RELEASE_POINT.z) / (landing.z - RELEASE_POINT.z));
    expect(progresses.at(0)).toBe(0);
    expect(progresses.at(-1)).toBeCloseTo(1, 12);
    expect(progresses.every((value, i) => i === 0 || value > (progresses.at(i - 1) ?? Number.POSITIVE_INFINITY))).toBe(true);
    SAMPLES.forEach((elapsed, i) => {
      expect(progresses.at(i)).toBeCloseTo(g(elapsed / DURATION_MS), 12);
    });
  });

  it("出だしは等速より速く、到達時は遅い(speedProfile > 0 のとき)", () => {
    const flight = flightOf("straight");
    const landing = zoneToWorld(flight.landing);
    const span = landing.z - RELEASE_POINT.z;
    const early = (pitchBallAt(flight, DURATION_MS * 0.1).z - RELEASE_POINT.z) / span;
    const late = (landing.z - pitchBallAt(flight, DURATION_MS * 0.9).z) / span;
    expect(early).toBeGreaterThan(0.1);
    expect(late).toBeLessThan(0.1);
  });

  it.each(BENDING_KINDS)("%s は中間で直線(ストレート)からずれ、終点では一致する", (kind) => {
    const bending = flightOf(kind);
    const straight = flightOf("straight");
    const middle = pitchBallAt(bending, DURATION_MS / 2);
    const reference = pitchBallAt(straight, DURATION_MS / 2);
    expect(Math.hypot(middle.x - reference.x, middle.y - reference.y)).toBeGreaterThan(0.01);
    expect(pitchBallAt(bending, DURATION_MS)).toEqual(pitchBallAt(straight, DURATION_MS));
  });

  it("曲がる球種の直線からのずれは break × (p^n − p)(bendGain 込み)に 1e-9 で一致する(全球種 × 着弾 3 点)", () => {
    for (const kind of KINDS) {
      for (const landing of [
        { x: 0.4, y: -0.3 },
        { x: -1.2, y: 0.9 },
        { x: 0, y: 0 },
      ]) {
        for (const progress of [0.1, 0.3, 0.5, 0.7, 0.9, 0.99]) {
          const deviation = deviationOf(kind, progress, landing);
          const swing = progress ** breakExponent - progress;
          expect(deviation.x).toBeCloseTo(breakOf(kind).x * swing, 9);
          expect(deviation.y).toBeCloseTo(breakOf(kind).y * swing, 9);
        }
      }
    }
  });

  it("曲がる球種の直線からのずれは終盤に向かって 0 へ収束する(p = 0.9 のずれは p = 0.6 より小さい)", () => {
    for (const kind of BENDING_KINDS) {
      const gap = (p: number): number => Math.hypot(deviationOf(kind, p).x, deviationOf(kind, p).y);
      expect(gap(0.6)).toBeGreaterThan(gap(0.9));
      expect(gap(0.9)).toBeGreaterThan(gap(0.99));
    }
  });

  describe("曲がりの向き(右投手の実際の向き。終盤 p = 0.9 → 1 のずれの変化)", () => {
    /** p = 0.9 から着弾までに、弦からのずれがどちらへ動くか。 */
    const lateShift = (kind: PitchKind): { readonly x: number; readonly y: number } => {
      const before = deviationOf(kind, 0.9);
      const after = deviationOf(kind, 1);
      return { x: after.x - before.x, y: after.y - before.y };
    };

    it.each(["slider", "curve"] as const)("%s は終盤にグラブ側(+x)へ曲がる", (kind) => {
      expect(lateShift(kind).x).toBeGreaterThan(0);
    });

    it("シュートは終盤に腕側(−x)へ曲がる", () => {
      expect(lateShift("shoot").x).toBeLessThan(0);
    });

    it.each(["curve", "fork"] as const)("%s は終盤に落ちる(−y)", (kind) => {
      expect(lateShift(kind).y).toBeLessThan(0);
    });

    it("フォークは横に曲がらず、ストレートは曲がらない", () => {
      expect(lateShift("fork").x).toBe(0);
      expect(lateShift("straight")).toEqual({ x: 0, y: 0 });
    });

    it.each(BENDING_KINDS)("%s の初速は着弾点への直線から −break の側へずれる(内側に放って曲がり込む)", (kind) => {
      const early = deviationOf(kind, 0.05);
      const bend = breakOf(kind);
      expect(early.x * bend.x).toBeLessThanOrEqual(0);
      expect(early.y * bend.y).toBeLessThanOrEqual(0);
      expect(Math.abs(early.x * bend.x) + Math.abs(early.y * bend.y)).toBeGreaterThan(0);
    });
  });

  it("入力の flight を変更しない", () => {
    const flight = flightOf("fork");
    const before = structuredClone(flight);
    pitchBallAt(flight, 700);
    expect(flight).toEqual(before);
  });
});

describe("heldBallAt", () => {
  it("pitchBallAt(flight, durationMs) に厳密一致し、着弾点(ゾーン平面)にある(全球種 × 全セル)", () => {
    for (const flight of ALL_FLIGHTS) {
      expect(heldBallAt(flight)).toEqual(pitchBallAt(flight, flight.durationMs));
      expect(heldBallAt(flight)).toEqual(zoneToWorld(flight.landing));
      expect(heldBallAt(flight).z).toBe(WORLD_PARAMS.zone.planeZ);
    }
  });
});
