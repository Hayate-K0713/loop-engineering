import { describe, expect, it } from "vitest";
import type { CameraPose, SafeArea, SceneLayout, Vec3 } from "../../../types/scene";
import { battedBallAt, type BattedPlan } from "../path/batted-path";
import { pitchBallAt } from "../path/pitch-path";
import { buildStageGeometry, standsHeightAt } from "../space/geometry";
import { WORLD_PARAMS } from "../space/params";
import { projectPoint, zoneRectOf, type ViewSize, type ZoneBox } from "./project";
import {
  PITCHER_HEAD_TOP,
  PORTRAIT_FRAMING_COEFFICIENTS,
  ballScaleFor,
  battingCamera,
  battingCameraFor,
  blendCamera,
  chaseBlendAt,
  chaseCamera,
  easeInOut,
  fitPortraitFraming,
  fovForAspect,
  legacyLift,
  outlineScaleFor,
  portraitBlendAt,
  ringWidthFor,
} from "./rig";

const CHASE = WORLD_PARAMS.chaseCamera;
const FRAMING = WORLD_PARAMS.framing;
const FIT = FRAMING.fit;
const ZONE: ZoneBox = WORLD_PARAMS.zone;
const BALLS: readonly Vec3[] = [
  { x: 0, y: 0.72, z: -0.2 },
  { x: 9, y: 0, z: -62 },
  { x: -34, y: 14, z: -120 },
  { x: 20, y: 30, z: 15 },
];
const LAYOUTS: readonly SceneLayout[] = ["batting", "pitching"];

function distanceBetween(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function reversed(values: readonly number[]): readonly number[] {
  return [...values].reverse();
}

function isNonDecreasing(values: readonly number[]): boolean {
  return values.every((value, i) => i === 0 || value >= (values.at(i - 1) ?? 0));
}

/** 下のオーバーレイの上端 y(px)。打撃はティッカーが下から 181px、守備(v3)は操作バーが約 130px(球種チップ 52 + 余白 + ティッカー 52。contract §7)。 */
function overlayTop(height: number, layout: SceneLayout): number {
  return height - (layout === "batting" ? 181 : 130);
}

/** HUD の下端を上から 155px、下のオーバーレイの上端を `overlayTop` とした空き領域(画面高比)。 */
function safeAreaFor(height: number, layout: SceneLayout): SafeArea {
  return { top: 155 / height, bottom: overlayTop(height, layout) / height };
}

function gridZone(): ZoneBox {
  const center = (ZONE.top + ZONE.bottom) / 2;
  const half = ((ZONE.top - ZONE.bottom) / 2) * (5 / 3);
  return { halfWidth: ZONE.halfWidth * (5 / 3), bottom: center - half, top: center + half, planeZ: ZONE.planeZ };
}

/** レイアウトで見せる矩形(打撃 = ゾーン枠、守備 = 5×5 格子)の下端 y(px)。 */
function bottomEdgeOf(pose: CameraPose, size: ViewSize, layout: SceneLayout): number {
  const rect = zoneRectOf(pose, size, layout === "pitching" ? gridZone() : ZONE);
  return rect.top + rect.height;
}

describe("battingCamera(横長)", () => {
  it("モックの値 (0, 1.25, 3.4) / (0, 1.0, −18) / 34° に lift 0 を加えた形で一致する", () => {
    expect(battingCamera()).toEqual({
      position: { x: 0, y: 1.25, z: 3.4 },
      target: { x: 0, y: 1.0, z: -18 },
      fovDeg: 34,
      lift: 0,
    });
  });

  it("呼び出しごとに同じ値", () => {
    expect(battingCamera()).toEqual(battingCamera());
  });
});

describe("legacyLift", () => {
  it("アスペクト ≤ 0.6 で 0.2、≥ 1.2 で 0、その間は線形、無効値は 0", () => {
    const { fullAspect, zeroAspect, value } = FRAMING.legacyLift;
    expect(legacyLift(fullAspect)).toBe(value);
    expect(legacyLift(fullAspect / 2)).toBe(value);
    expect(legacyLift(zeroAspect)).toBe(0);
    expect(legacyLift(16 / 9)).toBe(0);
    expect(legacyLift((fullAspect + zeroAspect) / 2)).toBeCloseTo(value / 2, 12);
    expect(legacyLift(Number.NaN)).toBe(0);
    expect(legacyLift(0)).toBe(0);
  });
});

describe("fovForAspect", () => {
  it("max(base, 2·atan(minTan / aspect)) に一致し、無効な縦横比は base", () => {
    for (const aspect of [0.3, 0.5, 0.8, 1, 1.5, 16 / 9]) {
      const expected = Math.max(34, 2 * Math.atan(0.37 / aspect) * (180 / Math.PI));
      expect(fovForAspect(34, aspect, 0.37)).toBeCloseTo(expected, 9);
    }
    expect(fovForAspect(34, 3, 0.37)).toBe(34);
    expect(fovForAspect(34, 0, 0.37)).toBe(34);
    expect(fovForAspect(34, Number.NaN, 0.37)).toBe(34);
  });
});

describe("portraitBlendAt", () => {
  it("≤ 0.7 で 1、≥ 1.0 で 0、無効値は 0、その間は単調に減る", () => {
    expect(portraitBlendAt(FRAMING.portraitFullAspect)).toBe(1);
    expect(portraitBlendAt(0.3)).toBe(1);
    expect(portraitBlendAt(FRAMING.landscapeFullAspect)).toBe(0);
    expect(portraitBlendAt(16 / 9)).toBe(0);
    expect(portraitBlendAt(Number.NaN)).toBe(0);
    expect(portraitBlendAt(0)).toBe(0);
    expect(portraitBlendAt(-1)).toBe(0);
    const values = Array.from({ length: 41 }, (_, i) => portraitBlendAt(0.6 + i * 0.01));
    expect(isNonDecreasing(reversed(values))).toBe(true);
    expect(values.every((value) => value >= 0 && value <= 1)).toBe(true);
  });
});

describe("battingCameraFor: 横長(アスペクト ≥ 1.0)", () => {
  it.each([1, 1.1, 1.2, 4 / 3, 16 / 9, 2.4])(
    "アスペクト %f: レイアウト・空き領域によらず同じ姿勢で、位置・注視点は battingCamera()、FOV は従来の式、lift は legacyLift",
    (aspect) => {
      const reference = battingCameraFor(aspect, "batting", null);
      for (const layout of LAYOUTS) {
        for (const safeArea of [null, { top: 0.3, bottom: 0.6 }, { top: 0.5, bottom: 0.4 }]) {
          expect(battingCameraFor(aspect, layout, safeArea)).toEqual(reference);
        }
      }
      expect(reference.position).toEqual(battingCamera().position);
      expect(reference.target).toEqual(battingCamera().target);
      expect(reference.fovDeg).toBeCloseTo(fovForAspect(34, aspect, FRAMING.landscapeMinHalfWidthTan), 12);
      expect(reference.lift).toBe(legacyLift(aspect));
    },
  );

  it("16:9 は battingCamera() に一致する", () => {
    expect(battingCameraFor(16 / 9, "batting", null)).toEqual(battingCamera());
  });

  it("無効な縦横比(NaN・0・負)は横長の姿勢", () => {
    for (const aspect of [Number.NaN, 0, -2, Number.POSITIVE_INFINITY]) {
      expect(battingCameraFor(aspect, "batting", null).position).toEqual(battingCamera().position);
    }
  });
});

describe("battingCameraFor: 縦長(アスペクト ≤ 0.7)", () => {
  it.each(LAYOUTS)("%s: fitPortraitFraming の出力と一致し、姿勢はレイアウトによらず縦長の姿勢", (layout) => {
    for (const aspect of [0.7, 0.6, 390 / 844, 0.3]) {
      const fit = fitPortraitFraming(aspect, layout, null);
      const pose = battingCameraFor(aspect, layout, null);
      expect(pose.position).toEqual(WORLD_PARAMS.battingCameraPortrait.position);
      expect(pose.target).toEqual(WORLD_PARAMS.battingCameraPortrait.target);
      expect(Math.tan((pose.fovDeg * Math.PI) / 360) * aspect).toBeCloseTo(fit.halfWidthTan, 9);
      expect(pose.lift).toBeCloseTo(fit.lift, 12);
    }
  });
});

describe("battingCameraFor: アスペクトの走査", () => {
  const aspects = Array.from({ length: 121 }, (_, i) => 0.3 + i * 0.01);

  it("水平半幅 tan が lerp(0.37, fit の値, k) 以上、FOV ≥ 34°、lift ≥ 0", () => {
    const ok = aspects.every((aspect) => {
      const k = portraitBlendAt(aspect);
      return LAYOUTS.every((layout) => {
        const pose = battingCameraFor(aspect, layout, null);
        const fit = fitPortraitFraming(aspect, layout, null);
        const floor = FRAMING.landscapeMinHalfWidthTan * (1 - k) + fit.halfWidthTan * k;
        return Math.tan((pose.fovDeg * Math.PI) / 360) * aspect >= floor - 1e-9 && pose.fovDeg >= 34 && pose.lift >= 0;
      });
    });
    expect(ok).toBe(true);
  });

  it("連続(隣接 0.01 のアスペクトで位置 0.12m・FOV 3°・lift 0.02 以内)", () => {
    const ok = LAYOUTS.every((layout) =>
      aspects.every((aspect, i) => {
        const previous = battingCameraFor(aspects.at(i - 1) ?? aspect, layout, null);
        const current = battingCameraFor(aspect, layout, null);
        return (
          i === 0 ||
          (distanceBetween(previous.position, current.position) < 0.12 &&
            Math.abs(previous.fovDeg - current.fovDeg) < 3 &&
            Math.abs(previous.lift - current.lift) < 0.02)
        );
      }),
    );
    expect(ok).toBe(true);
  });
});

describe("構図の式(fitPortraitFraming)", () => {
  it("係数: ゾーンの上端/下端・格子の下端は設計値(±0.003)、投手の頭頂は頭の中心より上", () => {
    expect(Math.abs(PORTRAIT_FRAMING_COEFFICIENTS.zoneTop - 0.2221)).toBeLessThanOrEqual(0.003);
    expect(Math.abs(PORTRAIT_FRAMING_COEFFICIENTS.zoneBottom - 0.4458)).toBeLessThanOrEqual(0.003);
    expect(Math.abs(PORTRAIT_FRAMING_COEFFICIENTS.gridBottom - 0.5204)).toBeLessThanOrEqual(0.003);
    expect(PORTRAIT_FRAMING_COEFFICIENTS.headTop).toBeLessThan(-0.0513);
  });

  it("390×844 の既定の空き領域: 打撃も守備(v3)も水平半幅 tan = 既定 0.25(守備の hReq ≈ 0.22 < 0.25)で、lift も同じ", () => {
    const batting = fitPortraitFraming(390 / 844, "batting", null);
    expect(batting.halfWidthTan).toBe(FIT.batting.defaultHalfWidthTan);
    const pitching = fitPortraitFraming(390 / 844, "pitching", null);
    expect(pitching.halfWidthTan).toBe(FIT.pitching.defaultHalfWidthTan);
    expect(FIT.pitching.defaultHalfWidthTan).toBe(0.25);
    expect(pitching.lift).toBeCloseTo(batting.lift, 12);
  });

  it("投手の頭頂が HUD の直下 headGapRatio に来る(390×844 の既定の空き領域・打撃)", () => {
    const size = { width: 390, height: 844 };
    const pose = battingCameraFor(390 / 844, "batting", null);
    const headTop = projectPoint(pose, size, PITCHER_HEAD_TOP);
    expect(headTop.y / 844).toBeCloseTo(FIT.defaultSafeArea.batting.top + FIT.headGapRatio, 4);
  });

  it.each([
    { width: 390, height: 745 },
    { width: 390, height: 664 },
    { width: 375, height: 667 },
    { width: 360, height: 640 },
  ])(
    "$width×$height: ゾーン(打撃)・格子(守備)の下端が bottom − marginRatio 以内、投手の頭頂が HUD の下 8px 以上、tan が既定以上・上限以下",
    ({ width, height }) => {
      for (const layout of LAYOUTS) {
        const safeArea = safeAreaFor(height, layout);
        const size = { width, height };
        const aspect = width / height;
        const pose = battingCameraFor(aspect, layout, safeArea);
        const limits = layout === "pitching" ? FIT.pitching : FIT.batting;
        const halfTan = Math.tan((pose.fovDeg * Math.PI) / 360) * aspect;
        expect(bottomEdgeOf(pose, size, layout)).toBeLessThanOrEqual((safeArea.bottom - FIT.marginRatio) * height + 0.5);
        expect(projectPoint(pose, size, PITCHER_HEAD_TOP).y).toBeGreaterThanOrEqual(155 + 8);
        expect(halfTan).toBeGreaterThanOrEqual(limits.defaultHalfWidthTan - 1e-9);
        expect(halfTan).toBeLessThanOrEqual(limits.maxHalfWidthTan + 1e-9);
      }
    },
  );

  it("高さ 580〜900px(幅 390、20px 刻み): ゾーン/格子が下のオーバーレイに掛からず、高さ 660 以上では投手の頭頂が HUD の下 8px 以上(390×640 の守備は水平半幅 tan の上限で頭が HUD に掛かる。360×640 は上のテストで確認)", () => {
    const heights = Array.from({ length: 17 }, (_, i) => 580 + i * 20);
    for (const height of heights) {
      for (const layout of LAYOUTS) {
        const safeArea = safeAreaFor(height, layout);
        const size = { width: 390, height };
        const pose = battingCameraFor(390 / height, layout, safeArea);
        expect(bottomEdgeOf(pose, size, layout)).toBeLessThanOrEqual((safeArea.bottom - FIT.marginRatio) * height + 0.5);
        if (height >= 660) {
          expect(projectPoint(pose, size, PITCHER_HEAD_TOP).y).toBeGreaterThanOrEqual(155 + 8);
        }
      }
    }
  });

  it("打撃は高さ 560px でもゾーンがティッカーに掛からない", () => {
    const safeArea = safeAreaFor(560, "batting");
    const pose = battingCameraFor(390 / 560, "batting", safeArea);
    expect(bottomEdgeOf(pose, { width: 390, height: 560 }, "batting")).toBeLessThanOrEqual((safeArea.bottom - FIT.marginRatio) * 560 + 0.5);
  });

  it("hReq が上限を超える低い画面では、頭より ゾーン/格子が隠れないことを優先する(守備 330×500、バー 225px)", () => {
    const safeArea: SafeArea = { top: 155 / 500, bottom: 275 / 500 };
    const pose = battingCameraFor(330 / 500, "pitching", safeArea);
    const halfTan = Math.tan((pose.fovDeg * Math.PI) / 360) * (330 / 500);
    expect(halfTan).toBeCloseTo(FIT.pitching.maxHalfWidthTan, 9);
    expect(bottomEdgeOf(pose, { width: 330, height: 500 }, "pitching")).toBeLessThanOrEqual((safeArea.bottom - FIT.marginRatio) * 500 + 0.5);
  });

  it("safeArea が null、または無効(幅 < minBandRatio・逆転・非有限)なら既定値と同じ結果", () => {
    for (const layout of LAYOUTS) {
      const reference = fitPortraitFraming(390 / 844, layout, null);
      const invalid: readonly SafeArea[] = [
        { top: 0.3, bottom: 0.3 + FIT.minBandRatio - 0.01 },
        { top: 0.6, bottom: 0.4 },
        { top: Number.NaN, bottom: 0.7 },
        { top: 0.2, bottom: Number.POSITIVE_INFINITY },
      ];
      for (const safeArea of invalid) {
        expect(fitPortraitFraming(390 / 844, layout, safeArea)).toEqual(reference);
      }
      const defaults = FIT.defaultSafeArea[layout === "pitching" ? "pitching" : "batting"];
      expect(fitPortraitFraming(390 / 844, layout, defaults)).toEqual(reference);
    }
  });

  it("無効な縦横比は既定の水平半幅 tan・lift 0", () => {
    expect(fitPortraitFraming(Number.NaN, "batting", null)).toEqual({ halfWidthTan: FIT.batting.defaultHalfWidthTan, lift: 0 });
    expect(fitPortraitFraming(0, "pitching", null)).toEqual({ halfWidthTan: FIT.pitching.defaultHalfWidthTan, lift: 0 });
  });

  it("空き領域が広いほど(下端が低いほど)水平半幅 tan は小さいか同じ", () => {
    const tans = [0.6, 0.65, 0.7, 0.75, 0.8].map((bottom) => fitPortraitFraming(390 / 844, "pitching", { top: 0.1837, bottom }).halfWidthTan);
    expect(isNonDecreasing(reversed(tans))).toBe(true);
  });
});

describe("v3 の構図の数値(390×844。contract §7 の「段階 A 完了時」の列)", () => {
  const size = { width: 390, height: 844 };

  it.each(LAYOUTS)(
    "%s: カメラの位置・注視点が x = 0(ゾーンと投手が画面中央の x 195 に並ぶ)で、ゾーン矩形が x 117.7〜272.3・y 410〜585(±3px)・155×175 前後",
    (layout) => {
      const pose = battingCameraFor(size.width / size.height, layout, safeAreaFor(size.height, layout));
      expect(pose.position.x).toBe(0);
      expect(pose.target.x).toBe(0);
      const rect = zoneRectOf(pose, size, ZONE);
      expect(Math.abs(rect.left - 117.7)).toBeLessThanOrEqual(3);
      expect(Math.abs(rect.left + rect.width - 272.3)).toBeLessThanOrEqual(3);
      expect(Math.abs(rect.top - 410)).toBeLessThanOrEqual(3);
      expect(Math.abs(rect.top + rect.height - 585)).toBeLessThanOrEqual(3);
      expect(rect.width).toBeGreaterThanOrEqual(150);
      expect(rect.height).toBeGreaterThanOrEqual(170);
      expect(rect.left + rect.width / 2).toBeCloseTo(195, 6);
    },
  );

  it("守備の 5×5 格子の下端が、空き領域の下端(0.846)から 8px 以上上(設計値 y 642)", () => {
    const safeArea = safeAreaFor(size.height, "pitching");
    expect(safeArea.bottom).toBeCloseTo(FIT.defaultSafeArea.pitching.bottom, 3);
    const pose = battingCameraFor(size.width / size.height, "pitching", safeArea);
    expect(bottomEdgeOf(pose, size, "pitching")).toBeLessThanOrEqual(FIT.defaultSafeArea.pitching.bottom * size.height - 8);
    expect(Math.abs(bottomEdgeOf(pose, size, "pitching") - 642)).toBeLessThanOrEqual(3);
  });

  it("投手の頭頂(scale 1.0 の段階 A)は HUD の直下 y ≈ 171 に来る", () => {
    const pose = battingCameraFor(size.width / size.height, "batting", null);
    expect(Math.abs(projectPoint(pose, size, PITCHER_HEAD_TOP).y - 171)).toBeLessThanOrEqual(2);
  });

  it("390×664(ツールバーあり): 打撃のゾーンが 115×130 以上、守備のゾーン幅は打撃以上", () => {
    const aspect = 390 / 664;
    const batting = zoneRectOf(battingCameraFor(aspect, "batting", safeAreaFor(664, "batting")), { width: 390, height: 664 }, ZONE);
    const pitching = zoneRectOf(battingCameraFor(aspect, "pitching", safeAreaFor(664, "pitching")), { width: 390, height: 664 }, ZONE);
    expect(batting.width).toBeGreaterThanOrEqual(115);
    expect(batting.height).toBeGreaterThanOrEqual(130);
    expect(pitching.width).toBeGreaterThanOrEqual(batting.width);
  });

  it("高さ 560〜900px(幅 390、20px 刻み)で、どちらも下のオーバーレイに掛からず、守備のゾーン幅は打撃の 85% 以上(半イニングの切替の見た目の差が 15% 以内。play 分冊 §3-1)。高さ 600〜720 では打撃以上", () => {
    const heights = Array.from({ length: 18 }, (_, i) => 560 + i * 20);
    for (const height of heights) {
      const widths = LAYOUTS.map((layout) => {
        const safeArea = safeAreaFor(height, layout);
        const pose = battingCameraFor(390 / height, layout, safeArea);
        expect(bottomEdgeOf(pose, { width: 390, height }, layout)).toBeLessThanOrEqual((safeArea.bottom - FIT.marginRatio) * height + 0.5);
        return zoneRectOf(pose, { width: 390, height }, ZONE).width;
      });
      const batting = widths.at(0) ?? 0;
      const pitching = widths.at(1) ?? 0;
      expect(pitching, `高さ ${height}`).toBeGreaterThanOrEqual(batting * 0.85);
      if (height >= 600 && height <= 720) {
        expect(pitching, `高さ ${height}`).toBeGreaterThanOrEqual(batting - 1e-9);
      }
    }
  });
});

describe("chaseCamera", () => {
  it.each(BALLS)("横長(16:9): WORLD_PARAMS の係数から計算した位置・注視点・FOV に一致し、lift は引数のまま (%o)", (ball) => {
    const pose = chaseCamera(ball, 16 / 9, 0.1);
    expect(pose.position.x).toBeCloseTo(ball.x * CHASE.kx, 12);
    expect(pose.position.y).toBeCloseTo(CHASE.baseY + ball.y * CHASE.ky, 12);
    expect(pose.position.z).toBeCloseTo(CHASE.baseZ + ball.z * CHASE.kz, 12);
    expect(pose.target.x).toBe(ball.x);
    expect(pose.target.y).toBeCloseTo(Math.max(0, ball.y * CHASE.kLook), 12);
    expect(pose.target.z).toBe(ball.z);
    expect(pose.fovDeg).toBeCloseTo(fovForAspect(CHASE.fovDeg, 16 / 9, FRAMING.chaseMinHalfWidthTan), 12);
    expect(pose.lift).toBeCloseTo(0.1, 12);
  });

  it("縦長(≤ 0.7)の注視点の高さ係数は portraitKLook、その間は縦横比の補間", () => {
    const ball = { x: 3, y: 20, z: -50 };
    expect(chaseCamera(ball, 0.46).target.y).toBeCloseTo(ball.y * CHASE.portraitKLook, 12);
    const aspect = 0.85;
    const k = portraitBlendAt(aspect);
    expect(chaseCamera(ball, aspect).target.y).toBeCloseTo(ball.y * (CHASE.kLook * (1 - k) + CHASE.portraitKLook * k), 12);
  });

  it("FOV は縦長でも水平半幅 tan 0.37 以上(打撃の値 0.25 にならない)で、横長は従来の fovFor と一致", () => {
    for (const aspect of [0.4, 0.46, 0.56, 0.7]) {
      const pose = chaseCamera({ x: 0, y: 10, z: -50 }, aspect);
      expect(Math.tan((pose.fovDeg * Math.PI) / 360) * aspect).toBeGreaterThanOrEqual(FRAMING.chaseMinHalfWidthTan - 1e-9);
    }
    for (const aspect of [1, 4 / 3, 16 / 9]) {
      expect(chaseCamera({ x: 0, y: 10, z: -50 }, aspect).fovDeg).toBeCloseTo(fovForAspect(CHASE.fovDeg, aspect, FRAMING.chaseMinHalfWidthTan), 12);
    }
  });

  it("lift の既定は 0", () => {
    expect(chaseCamera({ x: 0, y: 1, z: -5 }, 0.46).lift).toBe(0);
  });

  it("注視点の高さは負にならない", () => {
    expect(chaseCamera({ x: 0, y: -3, z: -10 }, 16 / 9).target.y).toBe(0);
  });

  it("入力を変更しない", () => {
    const ball = { x: 1, y: 2, z: -3 };
    chaseCamera(ball, 0.46);
    expect(ball).toEqual({ x: 1, y: 2, z: -3 });
  });
});

describe("ballScaleFor(camera, ball, minRatio)", () => {
  const camera = chaseCamera({ x: 0, y: 5, z: -60 }, 390 / 844);
  const MIN_RATIO = WORLD_PARAMS.ball.minScreenDiameterRatio;

  it("遠いボールは表示高の minRatio を満たす倍率(ratio × 2 × dist × tan(fov/2) の式)、近いボールは 1", () => {
    const far = { x: 0, y: 5, z: -300 };
    const scale = ballScaleFor(camera, far, MIN_RATIO);
    expect(scale).toBeGreaterThan(1);
    const dist = distanceBetween(camera.position, far);
    const visibleHeight = 2 * dist * Math.tan((camera.fovDeg * Math.PI) / 360);
    expect(scale).toBeCloseTo((MIN_RATIO * visibleHeight) / (2 * WORLD_PARAMS.ballRadius), 9);
    expect((scale * 2 * WORLD_PARAMS.ballRadius) / visibleHeight).toBeCloseTo(MIN_RATIO, 9);
    expect(ballScaleFor(camera, { x: camera.position.x, y: camera.position.y, z: camera.position.z - 1 }, MIN_RATIO)).toBe(1);
  });

  it("距離について単調非減少、minRatio について単調非減少で、minRatio 0 は 1", () => {
    const scales = [20, 50, 100, 200].map((distance) => ballScaleFor(camera, { x: 0, y: camera.position.y, z: camera.position.z - distance }, MIN_RATIO));
    expect(isNonDecreasing(scales)).toBe(true);
    const far = { x: 0, y: 5, z: -300 };
    const byRatio = [0, 0.005, 0.0095, 0.0175].map((ratio) => ballScaleFor(camera, far, ratio));
    expect(isNonDecreasing(byRatio)).toBe(true);
    expect(byRatio.at(0)).toBe(1);
  });

  describe("飛行中(打撃カメラ・390×844。minScreenDiameterRatioFlight = 0.0175 ≈ 14.8px)", () => {
    const size = { width: 390, height: 844 };
    const pose = battingCameraFor(size.width / size.height, "batting", null);
    const FLIGHT_RATIO = WORLD_PARAMS.ball.minScreenDiameterRatioFlight;
    const straight = (elapsedMs: number): Vec3 =>
      pitchBallAt({ seq: 1, kind: "straight", aim: { x: 0, y: 0 }, landing: { x: 0, y: 0 }, speedKmh: 145, durationMs: 1300, quality: "normal" }, elapsedMs);

    it("リリース直後は約 2.0 倍(設計 1.96)で、表示径は minRatio × 画面高 = 14.8px", () => {
      const scale = ballScaleFor(pose, straight(0), FLIGHT_RATIO);
      expect(Math.abs(scale - 1.96)).toBeLessThanOrEqual(0.1);
      const dist = distanceBetween(pose.position, straight(0));
      const visibleHeight = 2 * dist * Math.tan((pose.fovDeg * Math.PI) / 360);
      expect(((scale * 2 * WORLD_PARAMS.ballRadius) / visibleHeight) * size.height).toBeCloseTo(FLIGHT_RATIO * size.height, 9);
      expect(FLIGHT_RATIO * size.height).toBeCloseTo(14.8, 1);
    });

    it("経過について単調非増加で連続(1 ステップ 20ms で 0.05 以内)、D−730ms 付近(ここでは 570ms)までに 1 倍へ戻り、以降は 1", () => {
      const scales = Array.from({ length: 66 }, (_, i) => ballScaleFor(pose, straight(i * 20), FLIGHT_RATIO));
      expect(isNonDecreasing([...scales].reverse())).toBe(true);
      const steps = scales.slice(1).map((scale, i) => Math.abs(scale - (scales.at(i) ?? scale)));
      expect(Math.max(...steps)).toBeLessThan(0.05);
      expect(ballScaleFor(pose, straight(1300 - 730 + 100), FLIGHT_RATIO)).toBe(1);
      expect(ballScaleFor(pose, straight(1300), FLIGHT_RATIO)).toBe(1);
      expect(ballScaleFor(pose, straight(1300 - 730 - 100), FLIGHT_RATIO)).toBeGreaterThan(1);
    });
  });
});

describe("outlineScaleFor(縁取りの殻の倍率。画面で shellMinRatio 以上の太さ)", () => {
  const size = { width: 390, height: 844 };
  const pose = battingCameraFor(size.width / size.height, "batting", null);
  const SHELL = WORLD_PARAMS.ball.shellMinRatio;

  function shellThicknessM(ball: Vec3, ballScale: number): number {
    return WORLD_PARAMS.ballRadius * ballScale * (outlineScaleFor(pose, ball, ballScale) - 1);
  }

  it("殻の太さ(m)が ratio × 2 × dist × tan(fov/2) 以上で、v2 の 1.12 を下回らない。式が効く距離では一致する", () => {
    for (const ball of [
      { x: 0, y: 1.65, z: -18 },
      { x: 0, y: 1, z: -10 },
      { x: 0, y: 0.72, z: 0.03 },
      { x: 0, y: 1, z: -2 },
    ]) {
      const dist = distanceBetween(pose.position, ball);
      const required = SHELL * 2 * dist * Math.tan((pose.fovDeg * Math.PI) / 360);
      const scale = ballScaleFor(pose, ball, WORLD_PARAMS.ball.minScreenDiameterRatioFlight);
      const outline = outlineScaleFor(pose, ball, scale);
      expect(outline).toBeGreaterThanOrEqual(1.12);
      expect(shellThicknessM(ball, scale)).toBeGreaterThanOrEqual(required - 1e-12);
      if (outline > 1.12 + 1e-9) {
        expect(shellThicknessM(ball, scale)).toBeCloseTo(required, 12);
      }
    }
  });

  it("リリース付近(奥・倍率 約 2)では、床の 1.12 でなく式が効き、殻は画面で 2px(0.0024 × 844)", () => {
    const release = { x: 0, y: 1.65, z: -18 };
    const scale = ballScaleFor(pose, release, WORLD_PARAMS.ball.minScreenDiameterRatioFlight);
    expect(outlineScaleFor(pose, release, scale)).toBeGreaterThan(1.12);
    const dist = distanceBetween(pose.position, release);
    const pxPerM = size.height / (2 * dist * Math.tan((pose.fovDeg * Math.PI) / 360));
    expect(shellThicknessM(release, scale) * pxPerM).toBeCloseTo(SHELL * size.height, 9);
    expect(SHELL * size.height).toBeCloseTo(2, 1);
  });

  it("近い(ゾーン付近の)ボールでは殻が十分太いので 1.12 のまま。倍率 1 未満の入力は 1 として扱う", () => {
    const near = { x: 0, y: 0.72, z: 0.03 };
    expect(outlineScaleFor(pose, near, 6)).toBeCloseTo(1.12, 12);
    const far = { x: 0, y: 1.65, z: -18 };
    expect(outlineScaleFor(pose, far, 0.2)).toBeCloseTo(outlineScaleFor(pose, far, 1), 12);
  });

  it("距離が遠いほど(同じ倍率で)大きい", () => {
    const scales = [-5, -10, -15, -18].map((z) => outlineScaleFor(pose, { x: 0, y: 1.2, z }, 1));
    expect(isNonDecreasing(scales)).toBe(true);
  });
});

describe("ringWidthFor(リング・線の太さ m = ratio × 2 × dist × tan(fov/2))", () => {
  const size = { width: 390, height: 844 };
  const pose = battingCameraFor(size.width / size.height, "batting", null);
  const RATIO = WORLD_PARAMS.guide.ringWidthRatio;

  it("式と一致する", () => {
    for (const point of [
      { x: 0, y: 0.72, z: 0.03 },
      { x: 0.2, y: 1, z: -5 },
      { x: 0, y: 1.65, z: -18 },
    ]) {
      const dist = distanceBetween(pose.position, point);
      expect(ringWidthFor(pose, point, RATIO)).toBeCloseTo(RATIO * 2 * dist * Math.tan((pose.fovDeg * Math.PI) / 360), 12);
    }
  });

  it("ゾーン平面の中心では約 3px(0.0036 × 844)に換算され、比に比例し、距離が遠いほど太い(m)", () => {
    const center = { x: 0, y: 0.72, z: 0.03 };
    const dist = distanceBetween(pose.position, center);
    const pxPerM = size.height / (2 * dist * Math.tan((pose.fovDeg * Math.PI) / 360));
    expect(ringWidthFor(pose, center, RATIO) * pxPerM).toBeCloseTo(RATIO * size.height, 9);
    expect(RATIO * size.height).toBeCloseTo(3, 1);
    expect(ringWidthFor(pose, center, RATIO * 2)).toBeCloseTo(2 * ringWidthFor(pose, center, RATIO), 12);
    expect(ringWidthFor(pose, center, 0)).toBe(0);
    expect(ringWidthFor(pose, { ...center, z: -10 }, RATIO)).toBeGreaterThan(ringWidthFor(pose, center, RATIO));
  });
});

describe("easeInOut", () => {
  it("端点と中点、範囲外はクランプ", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBe(0.5);
    expect(easeInOut(-1)).toBe(0);
    expect(easeInOut(2)).toBe(1);
  });

  it("単調非減少", () => {
    const values = Array.from({ length: 101 }, (_, i) => easeInOut(i / 100));
    expect(isNonDecreasing(values)).toBe(true);
  });
});

describe("blendCamera", () => {
  const a = battingCameraFor(390 / 844, "batting", null);
  const b: CameraPose = chaseCamera({ x: 9, y: 0, z: -62 }, 390 / 844);

  it("k = 0 で a、k = 1 で b に厳密一致する(lift・FOV を含む)", () => {
    expect(blendCamera(a, b, 0)).toEqual(a);
    expect(blendCamera(a, b, 1)).toEqual(b);
  });

  it("lift を線形に補間する", () => {
    const withLift: CameraPose = { ...b, lift: 0 };
    const mid = blendCamera({ ...a, lift: 0.2 }, withLift, 0.25);
    expect(mid.lift).toBeCloseTo(0.15, 12);
  });

  it("k について、a からの距離が単調非減少", () => {
    const distances = Array.from({ length: 21 }, (_, i) => distanceBetween(blendCamera(a, b, i / 20).position, a.position));
    expect(isNonDecreasing(distances)).toBe(true);
  });

  it("注視点の割合 targetK を別に指定でき、省略時は k と同じ", () => {
    expect(blendCamera(a, b, 0.4)).toEqual(blendCamera(a, b, 0.4, 0.4));
    const split = blendCamera(a, b, 0, 1);
    expect(split.position).toEqual(a.position);
    expect(split.target).toEqual(b.target);
  });

  it("入力を変更しない", () => {
    const before = structuredClone(a);
    blendCamera(a, b, 0.5);
    expect(a).toEqual(before);
  });

  it("blend の起点(k = 0)は接触前の battingCameraFor と厳密に一致し、接触の前後で 16ms あたりの移動が小さい", () => {
    for (const [aspect, layout] of [
      [390 / 844, "batting"],
      [390 / 664, "batting"],
      [390 / 844, "pitching"],
      [16 / 9, "batting"],
    ] as const) {
      const start = battingCameraFor(aspect, layout, null);
      const ball = { x: 0, y: 1, z: 0.03 };
      const blend = chaseBlendAt(0);
      expect(blendCamera(start, chaseCamera(ball, aspect, 0), blend.position, blend.target)).toEqual(start);
      const next = chaseBlendAt(16);
      const moved = blendCamera(start, chaseCamera({ x: 0, y: 1.1, z: -1 }, aspect, 0), next.position, next.target);
      expect(distanceBetween(moved.position, start.position)).toBeLessThanOrEqual(1.5);
    }
  });
});

describe("chaseBlendAt", () => {
  it("接触時は 0、位置の blend 時間後は位置 1、注視点の blend 時間後は注視点 1", () => {
    expect(chaseBlendAt(0)).toEqual({ position: 0, target: 0 });
    expect(chaseBlendAt(CHASE.positionBlendMs).position).toBe(1);
    expect(chaseBlendAt(CHASE.targetBlendMs).target).toBe(1);
    expect(chaseBlendAt(CHASE.positionBlendMs * 4)).toEqual({ position: 1, target: 1 });
  });

  it("注視点は位置より先に移り(blend 時間が短い)、接触前は 0", () => {
    const sample = Math.min(CHASE.targetBlendMs, CHASE.positionBlendMs) / 2;
    expect(chaseBlendAt(sample).target).toBeGreaterThanOrEqual(chaseBlendAt(sample).position);
    expect(chaseBlendAt(-100)).toEqual({ position: 0, target: 0 });
  });

  it("時刻について単調非減少", () => {
    const positions = Array.from({ length: 60 }, (_, i) => chaseBlendAt(i * 16).position);
    expect(isNonDecreasing(positions)).toBe(true);
  });
});

// ---------- ホームランの頂点が HUD の下に収まる(R4) ----------

const STANDS = buildStageGeometry().stands;
const HUD_BOTTOM_PX = 155;
const HOMERUN_MARGIN_PX = 8;

/** ホームラン級の打球の計画(距離 106〜125m・左右 ±0.85 の組み合わせ)。 */
function homerunPlans(): readonly BattedPlan[] {
  const contactZ = WORLD_PARAMS.batted.contactZ;
  return [106, 115, 125].flatMap((distance) =>
    [-0.85, -0.4, 0, 0.4, 0.85].map((lateral) => {
      const depth = distance / Math.sqrt(1 + lateral * lateral);
      return {
        start: { x: 0, y: 1, z: contactZ },
        end: { x: lateral * depth, y: standsHeightAt(STANDS, distance), z: 0 - depth },
        peak: WORLD_PARAMS.batted.fly.peakRatio * distance,
        hangMs: WORLD_PARAMS.batted.fly.hangBaseMs + WORLD_PARAMS.batted.fly.hangPerMeterMs * distance,
        hops: 0,
        shape: "fly" as const,
        overFence: true,
      };
    }),
  );
}

/** 接触から `sinceMs` 後の、打撃カメラ → 中継カメラの blend 後の姿勢(中継カメラの lift は 0)。 */
function cameraAt(plan: BattedPlan, sinceMs: number, aspect: number, safeArea: SafeArea): CameraPose {
  const start = battingCameraFor(aspect, "batting", safeArea);
  const blend = chaseBlendAt(sinceMs);
  return blendCamera(start, chaseCamera(battedBallAt(plan, sinceMs), aspect, 0), blend.position, blend.target);
}

describe("ホームラン追跡(縦長): 頂点が HUD の下端より下に収まる", () => {
  it.each([
    { width: 390, height: 844 },
    { width: 390, height: 745 },
    { width: 390, height: 664 },
    { width: 375, height: 667 },
    { width: 360, height: 640 },
  ])("$width×$height: 位置の blend が終わった後のボールの画面 y が、HUD の下端 + 余白より下", ({ width, height }) => {
    const size = { width, height };
    const aspect = width / height;
    const safeArea = safeAreaFor(height, "batting");
    const minYs = homerunPlans().map((plan) => {
      const samples = Array.from({ length: 121 }, (_, i) => (i / 120) * plan.hangMs).filter((ms) => ms >= WORLD_PARAMS.chaseCamera.positionBlendMs);
      return Math.min(...samples.map((ms) => projectPoint(cameraAt(plan, ms, aspect, safeArea), size, battedBallAt(plan, ms)).y));
    });
    expect(Math.min(...minYs)).toBeGreaterThanOrEqual(HUD_BOTTOM_PX + HOMERUN_MARGIN_PX);
  });

  it("接触から落下までの全時刻でボールは縦方向に画面内、注視点の blend が終わった後は左右にも収まる(390×844)", () => {
    const size = { width: 390, height: 844 };
    const safeArea = safeAreaFor(844, "batting");
    const inside = homerunPlans().every((plan) =>
      Array.from({ length: 121 }, (_, i) => (i / 120) * plan.hangMs).every((ms) => {
        const point = projectPoint(cameraAt(plan, ms, size.width / size.height, safeArea), size, battedBallAt(plan, ms));
        const sideOk = ms < WORLD_PARAMS.chaseCamera.targetBlendMs || (point.x >= 0 && point.x <= size.width);
        return point.y >= 0 && point.y <= size.height && sideOk;
      }),
    );
    expect(inside).toBe(true);
  });

  it("中継カメラの lift は 0(打撃の lift を引き継がない)で、blend が進むほど lift が 0 に近づく", () => {
    const plan = homerunPlans().at(0);
    if (plan === undefined) throw new Error("no plan");
    const aspect = 390 / 844;
    const safeArea = safeAreaFor(844, "batting");
    const lifts = [0, 100, 200, 300, 400, 500].map((ms) => cameraAt(plan, ms, aspect, safeArea).lift);
    expect(lifts.at(0)).toBeGreaterThan(0.1);
    expect(lifts.at(-1)).toBe(0);
    expect(isNonDecreasing(reversed(lifts))).toBe(true);
  });
});
