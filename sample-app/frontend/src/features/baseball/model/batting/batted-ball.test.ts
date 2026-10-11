import { describe, expect, it } from "vitest";
import type { SwingKind } from "../../types/batting";
import {
  type ShapeInput,
  classifyDirection,
  classifyHeight,
  classifyStrength,
  directionFactorOf,
  isFoulTiming,
  shapeContact,
  strengthScore,
} from "./batted-ball";
import { BATTING_PARAMS } from "./params";

const WINDOW_MS = BATTING_PARAMS.contactWindowMs;
const EPS = 0.001;

function shapeInputWith(overrides: Partial<ShapeInput> = {}): ShapeInput {
  return { q: 1, height: 0, dtMs: 0, windowMs: WINDOW_MS, swingKind: "meet", batter: { power: 50, trajectory: 2 }, ...overrides };
}

describe("classifyHeight", () => {
  const band = BATTING_PARAMS.linerHalfBand;

  it("弾道 2: ±linerHalfBand の内側はライナー、上は fly、下は ground(境界ちょうどはライナー)", () => {
    expect(classifyHeight(0, 2)).toBe("liner");
    expect(classifyHeight(band, 2)).toBe("liner");
    expect(classifyHeight(band + EPS, 2)).toBe("fly");
    expect(classifyHeight(-band, 2)).toBe("liner");
    expect(classifyHeight(-band - EPS, 2)).toBe("ground");
  });

  it("同じ高さでも弾道 4 の方が弾道 1 より fly になりやすい", () => {
    const height = 0.25;
    expect(classifyHeight(height, 4)).toBe("fly");
    expect(classifyHeight(height, 1)).toBe("liner");
  });

  it("同じ高さでも弾道 1 の方が弾道 4 より ground になりやすい", () => {
    const height = -0.4;
    expect(classifyHeight(height, 1)).toBe("ground");
    expect(classifyHeight(height, 4)).toBe("liner");
  });

  it("弾道ごとに境界がずれる(shift = (弾道 - 2) × trajectoryShiftPerLevel)", () => {
    const shift = 2 * BATTING_PARAMS.trajectoryShiftPerLevel;
    expect(classifyHeight(band - shift + EPS, 4)).toBe("fly");
    expect(classifyHeight(band - shift - EPS, 4)).toBe("liner");
    expect(classifyHeight(-(band + shift) - EPS, 4)).toBe("ground");
    expect(classifyHeight(-(band + shift) + EPS, 4)).toBe("liner");
  });
});

describe("classifyDirection", () => {
  const centerMs = WINDOW_MS * BATTING_PARAMS.centerRatio;

  it("ほぼ合っている(|Δt| / 窓 < centerRatio)なら center", () => {
    expect(classifyDirection(0, WINDOW_MS)).toBe("center");
    expect(classifyDirection(centerMs - 1, WINDOW_MS)).toBe("center");
    expect(classifyDirection(-(centerMs - 1), WINDOW_MS)).toBe("center");
  });

  it("早い(Δt < 0)なら pull、遅い(Δt > 0)なら opposite", () => {
    expect(classifyDirection(-centerMs, WINDOW_MS)).toBe("pull");
    expect(classifyDirection(-WINDOW_MS, WINDOW_MS)).toBe("pull");
    expect(classifyDirection(centerMs, WINDOW_MS)).toBe("opposite");
    expect(classifyDirection(WINDOW_MS, WINDOW_MS)).toBe("opposite");
  });

  it("窓が狭い(強振)ときは同じ Δt でも center から外れやすい", () => {
    expect(classifyDirection(30, WINDOW_MS)).toBe("center");
    expect(classifyDirection(30, WINDOW_MS * BATTING_PARAMS.powerWindowScale)).toBe("opposite");
  });
});

describe("isFoulTiming", () => {
  it("|Δt| / 窓 が foulRatio 以上でファウル(境界の前後)", () => {
    const boundaryMs = WINDOW_MS * BATTING_PARAMS.foulRatio;
    expect(isFoulTiming(boundaryMs, WINDOW_MS)).toBe(true);
    expect(isFoulTiming(boundaryMs - 1, WINDOW_MS)).toBe(false);
    expect(isFoulTiming(-boundaryMs, WINDOW_MS)).toBe(true);
    expect(isFoulTiming(-(boundaryMs - 1), WINDOW_MS)).toBe(false);
    expect(isFoulTiming(0, WINDOW_MS)).toBe(false);
  });
});

describe("classifyStrength", () => {
  it("mediumFrom / strongFrom の直前・ちょうど・直後", () => {
    expect(classifyStrength(0)).toBe("weak");
    expect(classifyStrength(BATTING_PARAMS.mediumFrom - EPS)).toBe("weak");
    expect(classifyStrength(BATTING_PARAMS.mediumFrom)).toBe("medium");
    expect(classifyStrength(BATTING_PARAMS.mediumFrom + EPS)).toBe("medium");
    expect(classifyStrength(BATTING_PARAMS.strongFrom - EPS)).toBe("medium");
    expect(classifyStrength(BATTING_PARAMS.strongFrom)).toBe("strong");
    expect(classifyStrength(BATTING_PARAMS.strongFrom + EPS)).toBe("strong");
    expect(classifyStrength(10)).toBe("strong");
  });
});

describe("strengthScore / directionFactorOf", () => {
  it("score = q × (powerBase + powerPerAbility × パワー) × スイング種別係数 × 方向係数", () => {
    const abilityTerm = BATTING_PARAMS.powerBase + BATTING_PARAMS.powerPerAbility * 70;
    expect(strengthScore(0.5, 70, "meet", "center")).toBeCloseTo(
      0.5 * abilityTerm * BATTING_PARAMS.kindFactor.meet * BATTING_PARAMS.directionFactor.center,
      12,
    );
    expect(strengthScore(0.5, 70, "power", "pull")).toBeCloseTo(0.5 * abilityTerm * BATTING_PARAMS.kindFactor.power * BATTING_PARAMS.directionFactor.pull, 12);
  });

  it("方向係数は pull > center > opposite", () => {
    expect(directionFactorOf("pull")).toBeGreaterThan(directionFactorOf("center"));
    expect(directionFactorOf("center")).toBeGreaterThan(directionFactorOf("opposite"));
  });

  it("強振はミートより強い(同じ q・パワー・方向で)", () => {
    expect(strengthScore(0.4, 60, "power", "center")).toBeGreaterThan(strengthScore(0.4, 60, "meet", "center"));
  });

  it("pull は opposite より強い", () => {
    expect(strengthScore(0.4, 60, "meet", "pull")).toBeGreaterThan(strengthScore(0.4, 60, "meet", "opposite"));
  });

  it("q・パワー能力が高いほど強い", () => {
    expect(strengthScore(0.6, 60, "meet", "center")).toBeGreaterThan(strengthScore(0.3, 60, "meet", "center"));
    expect(strengthScore(0.4, 90, "meet", "center")).toBeGreaterThan(strengthScore(0.4, 30, "meet", "center"));
  });
});

describe("shapeContact", () => {
  it("タイミングが窓の端に近い(foulRatio 以上)とファウル、その直前はフェア", () => {
    const boundaryMs = WINDOW_MS * BATTING_PARAMS.foulRatio;
    expect(shapeContact(shapeInputWith({ dtMs: boundaryMs })).kind).toBe("foul");
    expect(shapeContact(shapeInputWith({ dtMs: -boundaryMs })).kind).toBe("foul");
    expect(shapeContact(shapeInputWith({ dtMs: boundaryMs - 1 })).kind).toBe("fair");
  });

  it("完璧な強振(q = 1・パワー 80・高さ 0・Δt = 0)は liner / strong / center", () => {
    const judgement = shapeContact(shapeInputWith({ swingKind: "power", batter: { power: 80, trajectory: 2 } }));
    expect(judgement).toEqual({ kind: "fair", ball: { type: "liner", strength: "strong", direction: "center" } });
  });

  it("q が小さければ weak", () => {
    const judgement = shapeContact(shapeInputWith({ q: 0.05 }));
    expect(judgement).toEqual({ kind: "fair", ball: { type: "liner", strength: "weak", direction: "center" } });
  });

  it("高さが打球タイプに反映される(上 = fly、下 = ground)", () => {
    const high = shapeContact(shapeInputWith({ height: 0.8 }));
    const low = shapeContact(shapeInputWith({ height: -0.8 }));
    expect(high.kind === "fair" ? high.ball.type : null).toBe("fly");
    expect(low.kind === "fair" ? low.ball.type : null).toBe("ground");
  });

  it("早いタイミングは pull、遅いタイミングは opposite", () => {
    const early = shapeContact(shapeInputWith({ dtMs: -60 }));
    const late = shapeContact(shapeInputWith({ dtMs: 60 }));
    expect(early.kind === "fair" ? early.ball.direction : null).toBe("pull");
    expect(late.kind === "fair" ? late.ball.direction : null).toBe("opposite");
  });

  it("弾道が高い打者ほど同じ高さで fly になりやすい", () => {
    const high = shapeContact(shapeInputWith({ height: 0.25, batter: { power: 50, trajectory: 4 } }));
    const low = shapeContact(shapeInputWith({ height: 0.25, batter: { power: 50, trajectory: 1 } }));
    expect(high.kind === "fair" ? high.ball.type : null).toBe("fly");
    expect(low.kind === "fair" ? low.ball.type : null).toBe("liner");
  });

  it("強振の方がミートより強さ段階が高くなる位置がある(同じ q)", () => {
    const strengthOf = (swingKind: SwingKind): string | null => {
      const judgement = shapeContact(shapeInputWith({ q: 0.3, swingKind }));
      return judgement.kind === "fair" ? judgement.ball.strength : null;
    };
    expect(strengthOf("meet")).toBe("medium");
    expect(strengthOf("power")).toBe("strong");
  });

  it("決定論(同一入力で同一出力)", () => {
    const input = shapeInputWith({ q: 0.4, height: 0.2, dtMs: -45 });
    expect(shapeContact(input)).toEqual(shapeContact(input));
  });
});
