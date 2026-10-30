import { describe, expect, it } from "vitest";
import type { ZonePoint } from "../../../types/common";
import { gaugeRingAt } from "../../pitch/gauge";
import { PITCH_PARAMS } from "../../pitch/params";
import { ZONE_HALF_HEIGHT, zoneToWorld } from "../space/coords";
import { WORLD_PARAMS } from "../space/params";
import { guideFrameAt, HIDDEN_GUIDE, pitchGuideAt, previewRingAt, type PitchGuideInput, type PreviewGuideInput } from "./guide";

const GUIDE = WORLD_PARAMS.guide;
const START = GUIDE.previewRing.startRadius;
const END = WORLD_PARAMS.ballRadius * GUIDE.previewRing.endRadiusRatio;
const D = 1310;
const HIDE_AT = D + 100;
const LANDING: ZonePoint = { x: 0.37, y: -0.52 };
const FADE_CENTER: ZonePoint = { x: 0.5, y: -0.4 };
const RING_WIDTH = 0.012;

function previewInput(overrides: Partial<PreviewGuideInput> = {}): PreviewGuideInput {
  return {
    tMs: 400,
    durationMs: D,
    hideAtMs: HIDE_AT,
    landing: LANDING,
    preview: "exact",
    fadeRadius: 0.45,
    fadeCenter: FADE_CENTER,
    ringWidth: RING_WIDTH,
    ...overrides,
  };
}

describe("previewRingAt: 縮むリングの半径", () => {
  it("t = 0 で startRadius、t = D で endRadius(ボール半径 × 1.25)", () => {
    expect(previewRingAt(0, D)).toBeCloseTo(START, 9);
    expect(previewRingAt(D, D)).toBeCloseTo(END, 9);
    expect(END).toBeCloseTo(WORLD_PARAMS.ballRadius * 1.25, 9);
  });

  it("t の増加で単調に減少する(狭義)", () => {
    const radii = [0, 100, 300, 600, 900, 1200, 1309].map((t) => previewRingAt(t, D));
    radii.reduce((prev, radius) => {
      expect(radius).toBeLessThan(prev);
      return radius;
    });
  });

  it("線形(中間点が両端の平均)", () => {
    expect(previewRingAt(D / 2, D)).toBeCloseTo((START + END) / 2, 9);
  });

  it("D 以降は endRadius のまま保持し、t < 0 は startRadius", () => {
    expect(previewRingAt(D + 1, D)).toBeCloseTo(END, 9);
    expect(previewRingAt(D * 3, D)).toBeCloseTo(END, 9);
    expect(previewRingAt(-50, D)).toBeCloseTo(START, 9);
  });

  it("D が 0 以下・有限でないときは endRadius、t が有限でないときは startRadius", () => {
    expect(previewRingAt(100, 0)).toBeCloseTo(END, 9);
    expect(previewRingAt(100, Number.NaN)).toBeCloseTo(END, 9);
    expect(previewRingAt(Number.NaN, D)).toBeCloseTo(START, 9);
  });
});

describe("guideFrameAt: exact", () => {
  it("点の位置が flight.landing のワールド座標に厳密一致し、リングの中心も同じ", () => {
    const guide = guideFrameAt(previewInput());
    expect(guide.mode).toBe("exact");
    expect(guide.position).toEqual(zoneToWorld(LANDING));
    expect(guide.markerRadius).toBe(GUIDE.dot.radius);
    expect(guide.fadeRadius).toBe(0);
  });

  it("リングの半径は previewRingAt に一致し、線幅は渡された値(ringWidthFor の結果)をそのまま使う", () => {
    const guide = guideFrameAt(previewInput({ tMs: 700 }));
    expect(guide.ring.radius).toBe(previewRingAt(700, D));
    expect(guide.ring.width).toBeCloseTo(RING_WIDTH, 12);
    expect(guide.ring.tone).toBe("preview");
    expect(guide.ring.visible).toBe(true);
    expect(guide.spread.visible).toBe(false);
  });

  it("リリース(t = 0)から D + hold(hideAtMs)まで可視で、その後は非表示", () => {
    expect(guideFrameAt(previewInput({ tMs: 0 })).visible).toBe(true);
    expect(guideFrameAt(previewInput({ tMs: D })).visible).toBe(true);
    expect(guideFrameAt(previewInput({ tMs: HIDE_AT })).visible).toBe(true);
    expect(guideFrameAt(previewInput({ tMs: HIDE_AT + 1 }))).toBe(HIDDEN_GUIDE);
  });

  it("リリース前(t < 0)は非表示", () => {
    expect(guideFrameAt(previewInput({ tMs: -1 }))).toBe(HIDDEN_GUIDE);
    expect(guideFrameAt(previewInput({ tMs: Number.NaN }))).toBe(HIDDEN_GUIDE);
  });

  it("120ms でフェードインし(t = 0 で 0、fadeInMs で 1)、以降は 1 のまま", () => {
    expect(guideFrameAt(previewInput({ tMs: 0 })).alpha).toBe(0);
    expect(guideFrameAt(previewInput({ tMs: GUIDE.fadeInMs / 2 })).alpha).toBeCloseTo(0.5, 9);
    expect(guideFrameAt(previewInput({ tMs: GUIDE.fadeInMs })).alpha).toBe(1);
    expect(guideFrameAt(previewInput({ tMs: D })).alpha).toBe(1);
  });

  it("リングの発光は 0 から 1 へ単調に増える", () => {
    const glows = [0, 300, 600, 900, D].map((tMs) => guideFrameAt(previewInput({ tMs })).ring.glow);
    expect(glows[0]).toBe(0);
    expect(glows.at(-1)).toBe(1);
    glows.reduce((prev, glow) => {
      expect(glow).toBeGreaterThan(prev);
      return glow;
    });
  });
});

describe("guideFrameAt: fade", () => {
  it("点は出さず、円の中心は fadeCenter、円は真の着弾点を含む", () => {
    const guide = guideFrameAt(previewInput({ preview: "fade" }));
    expect(guide.mode).toBe("fade");
    expect(guide.markerRadius).toBe(0);
    expect(guide.position).toEqual(zoneToWorld(FADE_CENTER));
    const landing = zoneToWorld(LANDING);
    expect(Math.hypot(guide.position.x - landing.x, guide.position.y - landing.y)).toBeLessThanOrEqual(guide.fadeRadius);
  });

  it("fadeRadius はゾーン単位の半径 × ゾーンの半高(m)", () => {
    const guide = guideFrameAt(previewInput({ preview: "fade", fadeCenter: LANDING }));
    expect(guide.fadeRadius).toBeCloseTo(0.45 * ZONE_HALF_HEIGHT, 9);
  });

  it("fadeRadius が小さすぎても、円は着弾点を含むよう広げる", () => {
    const guide = guideFrameAt(previewInput({ preview: "fade", fadeRadius: 0.01 }));
    const landing = zoneToWorld(LANDING);
    expect(Math.hypot(guide.position.x - landing.x, guide.position.y - landing.y)).toBeLessThanOrEqual(guide.fadeRadius + 1e-12);
  });

  it("リングは fade でも出る", () => {
    const guide = guideFrameAt(previewInput({ preview: "fade", tMs: D }));
    expect(guide.ring.visible).toBe(true);
    expect(guide.ring.radius).toBeCloseTo(END, 9);
  });
});

describe("guideFrameAt: none", () => {
  it("点も円も出さず、リングだけ出す(位置は着弾点)", () => {
    const guide = guideFrameAt(previewInput({ preview: "none" }));
    expect(guide.visible).toBe(true);
    expect(guide.mode).toBe("none");
    expect(guide.markerRadius).toBe(0);
    expect(guide.fadeRadius).toBe(0);
    expect(guide.position).toEqual(zoneToWorld(LANDING));
    expect(guide.ring.visible).toBe(true);
    expect(guide.ring.radius).toBe(previewRingAt(400, D));
  });
});

// ゲージのリングの期待値(`WORLD_PARAMS.guide.gaugeRing` と `PITCH_PARAMS.gauge.ringMs` から独立に計算する)。
const GAUGE = GUIDE.gaugeRing;
const RING_MS = PITCH_PARAMS.gauge.ringMs;
const AIM: ZonePoint = { x: -0.8, y: 0.3 };

function pitchInput(overrides: Partial<PitchGuideInput> = {}): PitchGuideInput {
  return { visible: true, aim: AIM, gaugeElapsedMs: null, spreadRadiusZone: null, ringWidth: RING_WIDTH, ...overrides };
}

describe("pitchGuideAt: 守備の照準", () => {
  it("visible が偽なら非表示", () => {
    expect(pitchGuideAt(pitchInput({ visible: false }))).toBe(HIDDEN_GUIDE);
  });

  it("照準(reticle)は狙いのワールド座標に出て、狙いの変更に追従する", () => {
    const guide = pitchGuideAt(pitchInput());
    expect(guide.mode).toBe("reticle");
    expect(guide.position).toEqual(zoneToWorld(AIM));
    expect(guide.alpha).toBe(1);
    const moved = pitchGuideAt(pitchInput({ aim: { x: 0.2, y: -0.6 } }));
    expect(moved.position).toEqual(zoneToWorld({ x: 0.2, y: -0.6 }));
  });

  it("ゲージ前(gaugeElapsedMs が null)はリングを出さない", () => {
    const guide = pitchGuideAt(pitchInput());
    expect(guide.ring.visible).toBe(false);
    expect(guide.ring.tone).toBe("gauge");
  });

  it("ゲージ中のリングは startRadius から endRadius へ縮み、線幅は渡された値を使う", () => {
    const start = pitchGuideAt(pitchInput({ gaugeElapsedMs: 0 }));
    const end = pitchGuideAt(pitchInput({ gaugeElapsedMs: RING_MS }));
    expect(start.ring.visible).toBe(true);
    expect(start.ring.radius).toBeCloseTo(GAUGE.startRadius, 9);
    expect(end.ring.radius).toBeCloseTo(GAUGE.endRadius, 9);
    expect(end.ring.width).toBeCloseTo(RING_WIDTH, 12);
    expect(end.ring.glow).toBe(1);
  });

  it("ゲージのリングは単調に縮み、終点を過ぎても afterRatio 分は縮み続け、その後は保持する", () => {
    const last = RING_MS * (1 + GAUGE.afterRatio);
    const radii = [0, 300, 600, 900, 1000, last].map((gaugeElapsedMs) => pitchGuideAt(pitchInput({ gaugeElapsedMs })).ring.radius);
    radii.reduce((prev, radius) => {
      expect(radius).toBeLessThan(prev);
      return radius;
    });
    expect(radii.at(-1)).toBeLessThan(GAUGE.endRadius);
    expect(pitchGuideAt(pitchInput({ gaugeElapsedMs: last + 500 })).ring.radius).toBeCloseTo(radii.at(-1) ?? 0, 9);
  });

  it("ゲージ中のリングの半径は gaugeRingAt に一致する(全区間・timeScale を含む)", () => {
    for (const gaugeElapsedMs of [0, 123, 450, 900, 1100, 1260, 2000]) {
      expect(pitchGuideAt(pitchInput({ gaugeElapsedMs })).ring.radius).toBe(gaugeRingAt(gaugeElapsedMs).radius);
      expect(pitchGuideAt(pitchInput({ gaugeElapsedMs, timeScale: 8 })).ring.radius).toBe(gaugeRingAt(gaugeElapsedMs, 8).radius);
    }
  });

  it("ゲージ中は散布円を出さず、ゲージ前で spreadRadiusZone があれば出す(ゾーン単位 → m)", () => {
    expect(pitchGuideAt(pitchInput({ spreadRadiusZone: 0.38 })).spread).toEqual({ visible: true, radius: 0.38 * ZONE_HALF_HEIGHT });
    expect(pitchGuideAt(pitchInput({ spreadRadiusZone: null })).spread.visible).toBe(false);
    expect(pitchGuideAt(pitchInput({ spreadRadiusZone: 0.38, gaugeElapsedMs: 100 })).spread.visible).toBe(false);
  });

  it("有限でない経過時間でも半径は有限", () => {
    expect(Number.isFinite(pitchGuideAt(pitchInput({ gaugeElapsedMs: Number.NaN })).ring.radius)).toBe(true);
  });
});
