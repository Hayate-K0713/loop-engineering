import { describe, expect, it } from "vitest";
import type { ZonePoint } from "../../../types/common";
import { WORLD_PARAMS } from "../space/params";
import { feedbackAlphaAt, zoneFeedbackOfPitch, zoneFeedbackOfSwing } from "./contact-feedback";

const FEEDBACK = WORLD_PARAMS.zoneFeedback;
const CURSOR: ZonePoint = { x: 0.21, y: -0.33 };
const LANDING: ZonePoint = { x: 0.55, y: -0.12 };
const AIM: ZonePoint = { x: 0.2, y: 0.1 };
const ZONE_WIDTH_PX = 154.6;

function swingAt(sinceMs: number, zoneWidthPx = ZONE_WIDTH_PX) {
  return zoneFeedbackOfSwing({ effectiveCursor: CURSOR, landing: LANDING, sinceMs, zoneWidthPx });
}

function pitchAt(sinceMs: number, zoneWidthPx = ZONE_WIDTH_PX) {
  return zoneFeedbackOfPitch({ aim: AIM, landing: LANDING, sinceMs, zoneWidthPx });
}

describe("feedbackAlphaAt", () => {
  it("0 で 1、表示時間(swing 900ms・pitch 700ms)で 0", () => {
    expect(feedbackAlphaAt("swing", 0)).toBe(1);
    expect(feedbackAlphaAt("swing", FEEDBACK.swingMs)).toBe(0);
    expect(feedbackAlphaAt("pitch", 0)).toBe(1);
    expect(feedbackAlphaAt("pitch", FEEDBACK.pitchMs)).toBe(0);
  });

  it("単調に減少する(狭義)", () => {
    for (const tone of ["swing", "pitch"] as const) {
      const alphas = [0, 100, 250, 400, 600, 690].map((since) => feedbackAlphaAt(tone, since));
      alphas.reduce((prev, alpha) => {
        expect(alpha).toBeLessThan(prev);
        return alpha;
      });
    }
  });

  it("負は 1、表示時間より後は 0、有限でない値は 0(範囲は常に [0, 1])", () => {
    expect(feedbackAlphaAt("swing", -10)).toBe(1);
    expect(feedbackAlphaAt("swing", 5000)).toBe(0);
    expect(feedbackAlphaAt("swing", Number.NaN)).toBe(0);
    expect(feedbackAlphaAt("pitch", Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("zoneFeedbackOfSwing", () => {
  it("from は判定に使った有効カーソル、to は着弾点に厳密一致する", () => {
    const view = swingAt(100);
    expect(view?.tone).toBe("swing");
    expect(view?.from).toBe(CURSOR);
    expect(view?.to).toBe(LANDING);
  });

  it("alpha は単調に減少し、swingMs で消える(null)", () => {
    const alphas = [0, 150, 300, 600, 899].map((since) => swingAt(since)?.alpha ?? Number.NaN);
    alphas.reduce((prev, alpha) => {
      expect(alpha).toBeLessThan(prev);
      return alpha;
    });
    expect(swingAt(FEEDBACK.swingMs - 1)?.alpha).toBeGreaterThan(0);
    expect(swingAt(FEEDBACK.swingMs)).toBeNull();
    expect(feedbackAlphaAt("swing", FEEDBACK.swingMs)).toBe(0);
  });

  it("スイング前(負)・有限でない時刻は null、t = 0 は alpha 1", () => {
    expect(swingAt(-1)).toBeNull();
    expect(swingAt(Number.NaN)).toBeNull();
    expect(swingAt(0)?.alpha).toBe(1);
  });

  it("着弾の輪の半径は 径 ringPx ÷ ゾーン矩形の幅(ゾーン単位)で、画面が小さいほど大きい", () => {
    expect(swingAt(0)?.ringRadiusZone).toBeCloseTo(FEEDBACK.ringPx / ZONE_WIDTH_PX, 9);
    const wide = swingAt(0, 200)?.ringRadiusZone ?? 0;
    const narrow = swingAt(0, 100)?.ringRadiusZone ?? 0;
    expect(narrow).toBeGreaterThan(wide);
  });

  it("矩形の幅が不正(0 以下・NaN)でも有限の半径を返す", () => {
    expect(Number.isFinite(swingAt(0, 0)?.ringRadiusZone ?? Number.NaN)).toBe(true);
    expect(Number.isFinite(swingAt(0, Number.NaN)?.ringRadiusZone ?? Number.NaN)).toBe(true);
  });

  it("ラベルは無い", () => {
    expect(swingAt(0)?.label).toBeNull();
  });
});

describe("zoneFeedbackOfPitch", () => {
  it("from は狙い、to は着弾点に厳密一致する", () => {
    const view = pitchAt(100);
    expect(view?.tone).toBe("pitch");
    expect(view?.from).toBe(AIM);
    expect(view?.to).toBe(LANDING);
  });

  it("pitchMs で消え(null)、それまで alpha は単調に減少する", () => {
    const alphas = [0, 100, 300, 500, 699].map((since) => pitchAt(since)?.alpha ?? Number.NaN);
    alphas.reduce((prev, alpha) => {
      expect(alpha).toBeLessThan(prev);
      return alpha;
    });
    expect(pitchAt(FEEDBACK.pitchMs)).toBeNull();
    expect(pitchAt(FEEDBACK.pitchMs - 1)).not.toBeNull();
    expect(feedbackAlphaAt("pitch", FEEDBACK.pitchMs)).toBe(0);
  });

  it("着弾の前(負)は null", () => {
    expect(pitchAt(-1)).toBeNull();
  });

  it("ラベルは狙いと着弾の距離(ゾーン単位、小数 1 桁)", () => {
    const distance = Math.hypot(LANDING.x - AIM.x, LANDING.y - AIM.y);
    expect(pitchAt(0)?.label).toBe(`ズレ ${distance.toFixed(1)}`);
    const exact = zoneFeedbackOfPitch({ aim: AIM, landing: AIM, sinceMs: 0, zoneWidthPx: ZONE_WIDTH_PX });
    expect(exact?.label).toBe("ズレ 0.0");
  });
});
