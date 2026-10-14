import { describe, expect, it } from "vitest";
import type { SwingInput, SwingKind } from "../../types/batting";
import type { PitchFlight, PitchKind } from "../../types/pitch";
import type { BatterProfile } from "../../types/team";
import { getPitchSpec } from "../pitch/kinds";
import {
  type ContactHit,
  type ContactMeasure,
  edgeFactor,
  effectiveRadii,
  ellipseDistance,
  measureContact,
  scaleRadiiForPitch,
  swingWindowMs,
} from "./contact";
import { cursorRadii } from "./cursor";
import { BATTING_PARAMS } from "./params";

const BATTER: BatterProfile = { id: "b", name: "テスト打者", meet: 50, power: 50, trajectory: 2 };
const DURATION_MS = 1300;

function flightWith(overrides: Partial<PitchFlight> = {}): PitchFlight {
  return { seq: 1, kind: "straight", aim: { x: 0, y: 0 }, landing: { x: 0, y: 0 }, speedKmh: 146, durationMs: DURATION_MS, ...overrides };
}

/** 着弾点にカーソルを置き、ぴったりのタイミングで振るスイング。`dx`・`dy` でカーソルをずらし、`dtMs` でタイミングをずらす。 */
function swingFor(flight: PitchFlight, offset: { dx?: number; dy?: number; dtMs?: number; kind?: SwingKind } = {}): SwingInput {
  return {
    kind: offset.kind ?? "meet",
    cursor: { x: flight.landing.x + (offset.dx ?? 0), y: flight.landing.y + (offset.dy ?? 0) },
    atMs: flight.durationMs + (offset.dtMs ?? 0),
  };
}

function measure(flight: PitchFlight, swing: SwingInput, batter: BatterProfile = BATTER): ContactMeasure {
  return measureContact({ flight, swing, batter });
}

/** 接触していれば測定値を返し、空振りなら `Error`(テストの前提違反)。 */
function hitOf(measured: ContactMeasure): ContactHit {
  if (measured.kind === "miss") {
    throw new Error("expected contact");
  }
  return measured.hit;
}

describe("measureContact: 接触の成否", () => {
  it("カーソル = 着弾点・Δt = 0 で接触し、質 q は 1(ゾーン中央)", () => {
    const flight = flightWith();
    const hit = hitOf(measure(flight, swingFor(flight)));
    expect(hit.q).toBeCloseTo(1, 12);
    expect(hit.dtMs).toBe(0);
    expect(hit.height).toBe(0);
  });

  it("接触の境界は (rx + ballReachX): rx·1.01 は接触(q = 0)、(rx + ballReachX)·1.01 は空振り", () => {
    const flight = flightWith();
    const { rx } = effectiveRadii(BATTER, "meet", "straight");
    const reachX = rx + BATTING_PARAMS.ballReachX;
    expect(hitOf(measure(flight, swingFor(flight, { dx: rx * 1.01 }))).q).toBe(0);
    expect(measure(flight, swingFor(flight, { dx: reachX * 0.99 })).kind).toBe("contact");
    expect(measure(flight, swingFor(flight, { dx: reachX * 1.01 })).kind).toBe("miss");
  });

  it("縦方向にも楕円で判定され、境界は (ry + ballReachY)", () => {
    const flight = flightWith();
    const { ry } = effectiveRadii(BATTER, "meet", "straight");
    const reachY = ry + BATTING_PARAMS.ballReachY;
    expect(hitOf(measure(flight, swingFor(flight, { dy: ry * 1.01 }))).q).toBe(0);
    expect(measure(flight, swingFor(flight, { dy: reachY * 1.01 })).kind).toBe("miss");
    expect(measure(flight, swingFor(flight, { dy: -reachY * 0.99 })).kind).toBe("contact");
  });

  it("当たり範囲は楕円(軸方向ではなく斜めも rx + reach, ry + reach で正規化される)", () => {
    const flight = flightWith();
    const { rx, ry } = effectiveRadii(BATTER, "meet", "straight");
    const reachX = rx + BATTING_PARAMS.ballReachX;
    const reachY = ry + BATTING_PARAMS.ballReachY;
    expect(measure(flight, swingFor(flight, { dx: reachX * 0.6 * 0.99, dy: reachY * 0.8 * 0.99 })).kind).toBe("contact");
    expect(measure(flight, swingFor(flight, { dx: reachX * 0.6 * 1.01, dy: reachY * 0.8 * 1.01 })).kind).toBe("miss");
    // 軸方向の縁(rx + reachX, ry + reachY)の角は楕円の外側
    expect(measure(flight, swingFor(flight, { dx: reachX * 0.95, dy: reachY * 0.95 })).kind).toBe("miss");
  });

  it("|Δt| = 窓 ちょうどは接触(q = 0)、窓を超えると空振り(早い・遅いの両側)", () => {
    const flight = flightWith();
    const window = BATTING_PARAMS.contactWindowMs;
    expect(hitOf(measure(flight, swingFor(flight, { dtMs: window }))).q).toBe(0);
    expect(measure(flight, swingFor(flight, { dtMs: -window })).kind).toBe("contact");
    expect(measure(flight, swingFor(flight, { dtMs: window + 1 })).kind).toBe("miss");
    expect(measure(flight, swingFor(flight, { dtMs: -window - 1 })).kind).toBe("miss");
  });

  it("Δt は スイング時刻 − 飛行時間(負 = 早い)", () => {
    const flight = flightWith();
    expect(hitOf(measure(flight, swingFor(flight, { dtMs: -40 }))).dtMs).toBe(-40);
    expect(hitOf(measure(flight, swingFor(flight, { dtMs: 25 }))).dtMs).toBe(25);
  });

  it("強振は窓が狭い(powerWindowScale 倍)", () => {
    const flight = flightWith();
    const powerWindow = swingWindowMs("power");
    expect(powerWindow).toBeCloseTo(BATTING_PARAMS.contactWindowMs * BATTING_PARAMS.powerWindowScale, 12);
    expect(measure(flight, swingFor(flight, { dtMs: 120 })).kind).toBe("contact");
    expect(measure(flight, swingFor(flight, { dtMs: 120, kind: "power" })).kind).toBe("miss");
    const edge = hitOf(measure(flight, swingFor(flight, { dtMs: powerWindow, kind: "power" })));
    expect(edge.windowMs).toBe(powerWindow);
    expect(edge.q).toBe(0);
  });

  it("強振はカーソルが小さい(同じずれでもミートなら接触し、強振なら空振りになる位置がある)", () => {
    const flight = flightWith();
    const reach = BATTING_PARAMS.ballReachX;
    const meetRx = effectiveRadii(BATTER, "meet", "straight").rx + reach;
    const powerRx = effectiveRadii(BATTER, "power", "straight").rx + reach;
    const dx = (meetRx + powerRx) / 2;
    expect(measure(flight, swingFor(flight, { dx })).kind).toBe("contact");
    expect(measure(flight, swingFor(flight, { dx, kind: "power" })).kind).toBe("miss");
  });

  it("ミート能力が高い打者ほど接触しやすい", () => {
    const flight = flightWith();
    const low: BatterProfile = { ...BATTER, meet: 20 };
    const high: BatterProfile = { ...BATTER, meet: 90 };
    const lowReach = effectiveRadii(low, "meet", "straight").rx + BATTING_PARAMS.ballReachX;
    const highReach = effectiveRadii(high, "meet", "straight").rx + BATTING_PARAMS.ballReachX;
    const dx = (lowReach + highReach) / 2;
    expect(measure(flight, swingFor(flight, { dx }), low).kind).toBe("miss");
    expect(measure(flight, swingFor(flight, { dx }), high).kind).toBe("contact");
  });

  it("球種の cursorScale が小さいほど接触しにくい(フォークはストレートより縦に厳しい)", () => {
    const straightRadii = effectiveRadii(BATTER, "meet", "straight");
    const forkRadii = effectiveRadii(BATTER, "meet", "fork");
    const dy = (straightRadii.ry + forkRadii.ry) / 2 + BATTING_PARAMS.ballReachY;
    const straight = flightWith({ kind: "straight" });
    const fork = flightWith({ kind: "fork" });
    expect(measure(straight, swingFor(straight, { dy })).kind).toBe("contact");
    expect(measure(fork, swingFor(fork, { dy })).kind).toBe("miss");
  });

  it("球種の cursorScale は当たり範囲の元の楕円にだけ掛かり、ボール半径は足すだけ(フォークの縦の境界)", () => {
    const fork = flightWith({ kind: "fork" });
    const { ry } = effectiveRadii(BATTER, "meet", "fork");
    const reachY = ry + BATTING_PARAMS.ballReachY;
    expect(measure(fork, swingFor(fork, { dy: reachY * 0.99 })).kind).toBe("contact");
    expect(measure(fork, swingFor(fork, { dy: reachY * 1.01 })).kind).toBe("miss");
  });

  it("NaN のスイング時刻は空振り扱い", () => {
    const flight = flightWith();
    expect(measure(flight, { kind: "meet", cursor: flight.landing, atMs: Number.NaN }).kind).toBe("miss");
  });
});

describe("measureContact: 質 q と高さ", () => {
  it("q は d に対して単調非増加", () => {
    const flight = flightWith();
    const { rx } = effectiveRadii(BATTER, "meet", "straight");
    const qs = [0, 0.2, 0.4, 0.6, 0.8, 0.99].map((ratio) => hitOf(measure(flight, swingFor(flight, { dx: rx * ratio }))).q);
    qs.slice(1).forEach((q, i) => {
      expect(q).toBeLessThanOrEqual(qs.at(i) ?? Number.NEGATIVE_INFINITY);
    });
    expect(qs.at(0)).toBeGreaterThan(qs.at(-1) ?? Number.POSITIVE_INFINITY);
  });

  it("q は |Δt| に対して単調非増加(早い・遅いで対称)", () => {
    const flight = flightWith();
    const steps = [0, 30, 60, 90, 120, 150];
    const late = steps.map((dtMs) => hitOf(measure(flight, swingFor(flight, { dtMs }))).q);
    const early = steps.map((dtMs) => hitOf(measure(flight, swingFor(flight, { dtMs: -dtMs }))).q);
    late.slice(1).forEach((q, i) => {
      expect(q).toBeLessThanOrEqual(late.at(i) ?? Number.NEGATIVE_INFINITY);
    });
    expect(early).toEqual(late);
  });

  it("q = (1 - d) × (1 - |Δt| / 窓) × edgeFactor", () => {
    const flight = flightWith({ landing: { x: 0.2, y: -0.1 } });
    const radii = effectiveRadii(BATTER, "meet", "straight");
    const swing = swingFor(flight, { dx: radii.rx * 0.5, dtMs: 75 });
    const expected = (1 - ellipseDistance(flight.landing, swing.cursor, radii)) * (1 - 75 / BATTING_PARAMS.contactWindowMs) * edgeFactor(flight.landing);
    expect(hitOf(measure(flight, swing)).q).toBeCloseTo(expected, 12);
  });

  it("q は元の楕円の中心距離で決まる: 当たり範囲を足した分(rx〜rx+ballReachX)は q = 0 の弱い当たり、ボール半径で q は増えない", () => {
    const flight = flightWith();
    const { rx } = effectiveRadii(BATTER, "meet", "straight");
    const centered = hitOf(measure(flight, swingFor(flight)));
    const inside = hitOf(measure(flight, swingFor(flight, { dx: rx * 0.5 })));
    const graze = hitOf(measure(flight, swingFor(flight, { dx: rx + BATTING_PARAMS.ballReachX * 0.5 })));
    expect(graze.q).toBe(0);
    expect(inside.q).toBeCloseTo(0.5, 12);
    expect(centered.q).toBeGreaterThan(inside.q);
  });

  it("height は元の ry で割る(ボール半径を足した ry ではない)。かすった当たりでは |height| が 1 を超えうる", () => {
    const flight = flightWith();
    const { ry } = effectiveRadii(BATTER, "meet", "straight");
    const dy = ry + BATTING_PARAMS.ballReachY * 0.5;
    const hit = hitOf(measure(flight, swingFor(flight, { dy })));
    expect(hit.height).toBeCloseTo(-dy / ry, 12);
    expect(Math.abs(hit.height)).toBeGreaterThan(1);
  });

  it("端・ボールゾーンほど q が下がる(同じ完璧なスイングでも)", () => {
    const center = flightWith({ landing: { x: 0, y: 0 } });
    const corner = flightWith({ landing: { x: 1, y: 1 } });
    const ball = flightWith({ landing: { x: 1.6, y: 0 } });
    const qCenter = hitOf(measure(center, swingFor(center))).q;
    const qCorner = hitOf(measure(corner, swingFor(corner))).q;
    const qBall = hitOf(measure(ball, swingFor(ball))).q;
    expect(qCenter).toBeGreaterThan(qCorner);
    expect(qCorner).toBeGreaterThan(qBall);
  });

  it("height = (着弾 y − カーソル y) / ry(ボールがカーソルより上なら正)", () => {
    const flight = flightWith({ landing: { x: 0, y: 0.3 } });
    const { ry } = effectiveRadii(BATTER, "meet", "straight");
    const swing: SwingInput = { kind: "meet", cursor: { x: 0, y: 0.3 - ry * 0.5 }, atMs: DURATION_MS };
    expect(hitOf(measure(flight, swing)).height).toBeCloseTo(0.5, 12);
    const below: SwingInput = { kind: "meet", cursor: { x: 0, y: 0.3 + ry * 0.5 }, atMs: DURATION_MS };
    expect(hitOf(measure(flight, below)).height).toBeCloseTo(-0.5, 12);
  });

  it("同一入力で同一出力", () => {
    const flight = flightWith({ landing: { x: 0.3, y: 0.2 } });
    const swing = swingFor(flight, { dx: 0.1, dtMs: -30 });
    expect(measure(flight, swing)).toEqual(measure(flight, swing));
  });
});

describe("edgeFactor", () => {
  it("edgePenaltyStart 以内は 1", () => {
    expect(edgeFactor({ x: 0, y: 0 })).toBe(1);
    expect(edgeFactor({ x: BATTING_PARAMS.edgePenaltyStart, y: -BATTING_PARAMS.edgePenaltyStart })).toBe(1);
  });

  it("max(|x|, |y|) が大きいほど単調に下がり、超過 1 あたり edgePenaltyPerUnit 下がる", () => {
    const over = BATTING_PARAMS.edgePenaltyStart + 1;
    expect(edgeFactor({ x: over, y: 0 })).toBeCloseTo(1 - BATTING_PARAMS.edgePenaltyPerUnit, 12);
    expect(edgeFactor({ x: 0.2, y: -over })).toBeCloseTo(1 - BATTING_PARAMS.edgePenaltyPerUnit, 12);
    expect(edgeFactor({ x: 1.2, y: 0 })).toBeGreaterThan(edgeFactor({ x: 1.8, y: 0 }));
  });

  it("着弾の限界(±2)でも 0 を下回らない", () => {
    expect(edgeFactor({ x: 2, y: 2 })).toBeGreaterThan(0);
  });
});

describe("ellipseDistance / effectiveRadii", () => {
  const radii = { rx: 0.5, ry: 0.3 };

  it("楕円上の点は距離 1(軸方向と、斜め 0.6/0.8 の点)", () => {
    expect(ellipseDistance({ x: 0.5, y: 0 }, { x: 0, y: 0 }, radii)).toBeCloseTo(1, 12);
    expect(ellipseDistance({ x: 0, y: -0.3 }, { x: 0, y: 0 }, radii)).toBeCloseTo(1, 12);
    expect(ellipseDistance({ x: 0.5 * 0.6, y: 0.3 * 0.8 }, { x: 0, y: 0 }, radii)).toBeCloseTo(1, 12);
  });

  it("カーソル中心が基準", () => {
    expect(ellipseDistance({ x: 1.5, y: 1 }, { x: 1.5, y: 1 }, radii)).toBe(0);
  });

  it("scaleRadiiForPitch は球種の cursorScale を掛けるだけ(effectiveRadii と一致、ボール半径は足さない)", () => {
    const base = cursorRadii(BATTER, "power");
    const kinds: readonly PitchKind[] = ["straight", "slider", "curve", "fork", "shoot"];
    kinds.forEach((kind) => {
      const scaled = scaleRadiiForPitch(base, kind);
      const spec = getPitchSpec(kind);
      expect(scaled.rx).toBeCloseTo(base.rx * spec.cursorScale.x, 12);
      expect(scaled.ry).toBeCloseTo(base.ry * spec.cursorScale.y, 12);
      expect(scaled).toEqual(effectiveRadii(BATTER, "power", kind));
    });
    expect(scaleRadiiForPitch(base, "straight")).toEqual(base);
  });

  it("球種の cursorScale が半径に掛かる(straight は不変、フォークは縦が縮む)", () => {
    const base = cursorRadii(BATTER, "meet");
    const kinds: readonly PitchKind[] = ["straight", "fork"];
    const [straight, fork] = kinds.map((kind) => effectiveRadii(BATTER, "meet", kind));
    expect(straight).toEqual(base);
    expect(fork?.rx).toBeCloseTo(base.rx * 0.95, 12);
    expect(fork?.ry).toBeCloseTo(base.ry * 0.8, 12);
  });
});
