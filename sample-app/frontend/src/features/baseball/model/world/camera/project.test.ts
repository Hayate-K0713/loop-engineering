import { describe, expect, it } from "vitest";
import type { CameraPose } from "../../../types/scene";
import { batterRootFor } from "../motion/batter-layout";
import { WORLD_PARAMS } from "../space/params";
import { projectPoint, zoneRectOf, type ViewSize, type ZoneBox } from "./project";
import { battingCamera, battingCameraFor, fovForAspect } from "./rig";

const ZONE: ZoneBox = WORLD_PARAMS.zone;

/** 下のオーバーレイの上端 y(px): 打撃はティッカーが下から 181px、守備(v3)は操作バーが約 130px(球種チップ 52 + 余白 + ティッカー 52)。 */
function overlayTop(height: number, layout: "batting" | "pitching"): number {
  return height - (layout === "batting" ? 181 : 130);
}

function sizeOf(width: number, height: number): ViewSize {
  return { width, height };
}

/** ゾーンの中心から 5/3 倍に広げた格子。 */
function gridZone(): ZoneBox {
  const center = (ZONE.top + ZONE.bottom) / 2;
  const half = ((ZONE.top - ZONE.bottom) / 2) * (5 / 3);
  return { halfWidth: ZONE.halfWidth * (5 / 3), bottom: center - half, top: center + half, planeZ: ZONE.planeZ };
}

/** 空き領域(HUD の下端 155px・下のオーバーレイの上端)を画面高比にしたもの。 */
function safeAreaFor(height: number, layout: "batting" | "pitching"): { readonly top: number; readonly bottom: number } {
  return { top: 155 / height, bottom: overlayTop(height, layout) / height };
}

describe("projectPoint", () => {
  const pose: CameraPose = { position: { x: 0, y: 1.5, z: 5 }, target: { x: 0, y: 1.5, z: -5 }, fovDeg: 60, lift: 0 };
  const size = sizeOf(400, 800);

  it("注視点は画面の中心に、lift の分だけ上へずれる", () => {
    const center = projectPoint(pose, size, pose.target);
    expect(center.x).toBeCloseTo(200, 9);
    expect(center.y).toBeCloseTo(400, 9);
    expect(center.depth).toBeCloseTo(10, 9);
    const lifted = projectPoint({ ...pose, lift: 0.1 }, size, pose.target);
    expect(lifted.y).toBeCloseTo(400 - 80, 9);
    expect(lifted.x).toBeCloseTo(200, 9);
  });

  it("縦 FOV の端(tan(fov/2))で画面の上端・下端、横は縦横比を掛けた半幅に写る", () => {
    const halfV = Math.tan((60 / 2) * (Math.PI / 180));
    const top = projectPoint(pose, size, { x: 0, y: 1.5 + 10 * halfV, z: -5 });
    expect(top.y).toBeCloseTo(0, 6);
    const right = projectPoint(pose, size, { x: 10 * halfV * (400 / 800), y: 1.5, z: -5 });
    expect(right.x).toBeCloseTo(400, 6);
  });

  it("右(+x)は画面の右、上(+y)は画面の上", () => {
    const right = projectPoint(pose, size, { x: 1, y: 1.5, z: -5 });
    const up = projectPoint(pose, size, { x: 0, y: 2.5, z: -5 });
    expect(right.x).toBeGreaterThan(200);
    expect(up.y).toBeLessThan(400);
  });

  it("カメラの背後の点は深さが 0 以下で、座標は NaN", () => {
    const behind = projectPoint(pose, size, { x: 0, y: 1.5, z: 8 });
    expect(behind.depth).toBeLessThan(0);
    expect(Number.isNaN(behind.x)).toBe(true);
    expect(Number.isNaN(behind.y)).toBe(true);
  });

  it("真下を向くカメラでも有限の値を返す", () => {
    const down: CameraPose = { position: { x: 0, y: 10, z: 0 }, target: { x: 0, y: 0, z: 0 }, fovDeg: 60, lift: 0 };
    const point = projectPoint(down, size, { x: 1, y: 0, z: 0 });
    expect(Number.isFinite(point.x)).toBe(true);
    expect(Number.isFinite(point.y)).toBe(true);
  });
});

describe("zoneRectOf", () => {
  it("4 隅の投影の外接矩形に一致する", () => {
    const size = sizeOf(390, 844);
    const pose = battingCameraFor(size.width / size.height, "batting", null);
    const rect = zoneRectOf(pose, size, ZONE);
    const xs = [-ZONE.halfWidth, ZONE.halfWidth].flatMap((x) => [ZONE.bottom, ZONE.top].map((y) => projectPoint(pose, size, { x, y, z: ZONE.planeZ }).x));
    const ys = [-ZONE.halfWidth, ZONE.halfWidth].flatMap((x) => [ZONE.bottom, ZONE.top].map((y) => projectPoint(pose, size, { x, y, z: ZONE.planeZ }).y));
    expect(rect.left).toBeCloseTo(Math.min(...xs), 9);
    expect(rect.top).toBeCloseTo(Math.min(...ys), 9);
    expect(rect.width).toBeCloseTo(Math.max(...xs) - Math.min(...xs), 9);
    expect(rect.height).toBeCloseTo(Math.max(...ys) - Math.min(...ys), 9);
  });
});

describe("検算: 診断の案 B'(three の投影と一致することの根拠)", () => {
  it("位置 (0, 1.75, 2.6)・注視 (0, 0.55, −18)・水平半幅 tan 0.25・lift 0.26 で、390×844 のゾーンが x 117〜271・y 376〜550(±2px)", () => {
    const size = sizeOf(390, 844);
    const aspect = size.width / size.height;
    const pose: CameraPose = {
      position: { x: 0, y: 1.75, z: 2.6 },
      target: { x: 0, y: 0.55, z: -18 },
      fovDeg: fovForAspect(34, aspect, 0.25),
      lift: 0.26,
    };
    const rect = zoneRectOf(pose, size, ZONE);
    expect(Math.abs(rect.left - 117)).toBeLessThanOrEqual(2);
    expect(Math.abs(rect.left + rect.width - 271)).toBeLessThanOrEqual(2);
    expect(Math.abs(rect.top - 376)).toBeLessThanOrEqual(2);
    expect(Math.abs(rect.top + rect.height - 550)).toBeLessThanOrEqual(2);
  });
});

describe("横長(1280×720)", () => {
  it("従来の打撃カメラでゾーンが 181×209px(±2)", () => {
    const size = sizeOf(1280, 720);
    const rect = zoneRectOf(battingCamera(), size, ZONE);
    expect(Math.abs(rect.width - 181)).toBeLessThanOrEqual(2);
    expect(Math.abs(rect.height - 209)).toBeLessThanOrEqual(2);
  });

  it("battingCameraFor(16:9) は打撃・守備とも同じ矩形で、水平方向に画面の中央", () => {
    const size = sizeOf(1280, 720);
    const batting = zoneRectOf(battingCameraFor(16 / 9, "batting", null), size, ZONE);
    const pitching = zoneRectOf(battingCameraFor(16 / 9, "pitching", null), size, ZONE);
    expect(pitching).toEqual(batting);
    expect(batting.left + batting.width / 2).toBeCloseTo(640, 6);
  });
});

describe("縦長・打撃のゾーン", () => {
  it.each([
    { width: 390, height: 844, minWidth: 140, minHeight: 155 },
    { width: 390, height: 745, minWidth: 140, minHeight: 155 },
    { width: 390, height: 664, minWidth: 115, minHeight: 130 },
    { width: 375, height: 667, minWidth: 115, minHeight: 130 },
    { width: 360, height: 640, minWidth: 105, minHeight: 118 },
  ])("$width×$height: 幅 ≥ $minWidth・高さ ≥ $minHeight、ティッカーの上に収まる", ({ width, height, minWidth, minHeight }) => {
    const size = sizeOf(width, height);
    const pose = battingCameraFor(width / height, "batting", safeAreaFor(height, "batting"));
    const rect = zoneRectOf(pose, size, ZONE);
    expect(rect.width).toBeGreaterThanOrEqual(minWidth);
    expect(rect.height).toBeGreaterThanOrEqual(minHeight);
    expect(rect.top + rect.height).toBeLessThanOrEqual(overlayTop(height, "batting"));
  });

  it("390 幅で左右の余白が 40px 以上(390×844・390×745・390×664)", () => {
    const margins = [844, 745, 664].map((height) => {
      const rect = zoneRectOf(battingCameraFor(390 / height, "batting", safeAreaFor(height, "batting")), sizeOf(390, height), ZONE);
      return Math.min(rect.left, 390 - (rect.left + rect.width));
    });
    expect(margins.every((margin) => margin >= 40)).toBe(true);
  });

  it("390×844 の既定の空き領域では、ゾーンが設計値(x 117.7〜272.3・y 410〜585、±3px。155×175px 前後)に近く、画面中央(x 195)に並ぶ", () => {
    const rect = zoneRectOf(battingCameraFor(390 / 844, "batting", null), sizeOf(390, 844), ZONE);
    expect(Math.abs(rect.left - 117.7)).toBeLessThanOrEqual(3);
    expect(Math.abs(rect.left + rect.width - 272.3)).toBeLessThanOrEqual(3);
    expect(Math.abs(rect.top - 410)).toBeLessThanOrEqual(3);
    expect(Math.abs(rect.top + rect.height - 585)).toBeLessThanOrEqual(3);
    expect(rect.width).toBeGreaterThanOrEqual(150);
    expect(rect.height).toBeGreaterThanOrEqual(170);
    expect(rect.left + rect.width / 2).toBeCloseTo(195, 6);
  });
});

describe("縦長・守備のゾーンと格子(v3: 打撃と同じ構図。操作バー約 130px)", () => {
  it.each([
    { width: 390, height: 844, minWidth: 150 },
    { width: 390, height: 745, minWidth: 140 },
    { width: 390, height: 664, minWidth: 115 },
    { width: 360, height: 640, minWidth: 105 },
  ])("$width×$height: ゾーン幅 ≥ $minWidth、格子の下端が操作バー(ティッカー)の上端より上", ({ width, height, minWidth }) => {
    const size = sizeOf(width, height);
    const pose = battingCameraFor(width / height, "pitching", safeAreaFor(height, "pitching"));
    const zone = zoneRectOf(pose, size, ZONE);
    const grid = zoneRectOf(pose, size, gridZone());
    expect(zone.width).toBeGreaterThanOrEqual(minWidth);
    expect(grid.top + grid.height).toBeLessThanOrEqual(overlayTop(height, "pitching"));
  });

  it("390×844: 格子の下端が空き領域の下端(0.846)から 8px 以上上、守備のゾーンは打撃と同じ矩形(155×175px)", () => {
    const size = sizeOf(390, 844);
    const pose = battingCameraFor(390 / 844, "pitching", safeAreaFor(844, "pitching"));
    const grid = zoneRectOf(pose, size, gridZone());
    expect(grid.top + grid.height).toBeLessThanOrEqual(0.846 * 844 - 8);
    const batting = zoneRectOf(battingCameraFor(390 / 844, "batting", safeAreaFor(844, "batting")), size, ZONE);
    const pitching = zoneRectOf(pose, size, ZONE);
    expect(pitching.width).toBeCloseTo(batting.width, 1);
    expect(pitching.height).toBeCloseTo(batting.height, 1);
  });

  it("390×664: 守備のゾーン幅は打撃以上(半イニングの切替でゾーンが小さく見えない)", () => {
    const size = sizeOf(390, 664);
    const batting = zoneRectOf(battingCameraFor(390 / 664, "batting", safeAreaFor(664, "batting")), size, ZONE);
    const pitching = zoneRectOf(battingCameraFor(390 / 664, "pitching", safeAreaFor(664, "pitching")), size, ZONE);
    expect(pitching.width).toBeGreaterThanOrEqual(batting.width);
  });
});

// 打者(縦長・打撃)。中心 y は打者の root の拡大率 × 1.53(頭の付け根 torsoY 0.55 + headY 0.98。足元 y = 0)。
// 半径は contract §7 の手計算と同じ: 素の頭 0.50 × scale(帽子の頂点・輪郭を含む)、ヘルメット込み = 素の頭の +4.5%(外径 +約 4〜5%)、胴 0.31 × 1.05 × scale。
const HEAD_CENTER_LOCAL_Y = 1.53;
const HEAD_RADIUS_LOCAL = 0.5;
const HELMET_FACTOR = 1.045;
const TORSO_RADIUS_LOCAL = 0.31 * 1.05;
const TORSO_CENTER_LOCAL_Y = 0.8;

type BatterRightEdges = { readonly headCenterX: number; readonly headRight: number; readonly helmetRight: number; readonly torsoRight: number };

/** 縦長の打者(`batterRootFor`)の、頭の中心 x と、素の頭・ヘルメット込みの頭・胴の画面上の右端(px)。 */
function batterRightEdges(width: number, height: number, layout: "batting" | "pitching", useSafeArea: boolean): BatterRightEdges {
  const size = sizeOf(width, height);
  const pose = battingCameraFor(width / height, layout, useSafeArea ? safeAreaFor(height, layout) : null);
  const root = batterRootFor(width / height);
  const at = (localY: number, radius: number): { readonly center: number; readonly right: number } => {
    const y = root.position.y + root.scale * localY;
    const center = projectPoint(pose, size, { x: root.position.x, y, z: root.position.z }).x;
    const right = projectPoint(pose, size, { x: root.position.x + root.scale * radius, y, z: root.position.z }).x;
    return { center, right };
  };
  const head = at(HEAD_CENTER_LOCAL_Y, HEAD_RADIUS_LOCAL);
  const helmet = at(HEAD_CENTER_LOCAL_Y, HEAD_RADIUS_LOCAL * HELMET_FACTOR);
  const torso = at(TORSO_CENTER_LOCAL_Y, TORSO_RADIUS_LOCAL);
  return { headCenterX: head.center, headRight: head.right, helmetRight: helmet.right, torsoRight: torso.right };
}

describe("打者の頭・胴の位置(縦長・打撃。v3: scale 0.70・x −0.65)", () => {
  it("390×844: 頭の中心 x ≈ −1px(設計値)、素の頭の右端 ≤ 110px(設計値 約 104)、ヘルメット込みの右端 ≤ 115px(設計値 109)、胴の右端 ≤ 75px(設計値 約 68)", () => {
    const edges = batterRightEdges(390, 844, "batting", false);
    expect(Math.abs(edges.headCenterX - -1.1)).toBeLessThanOrEqual(3);
    expect(edges.headRight).toBeLessThanOrEqual(110);
    expect(Math.abs(edges.headRight - 104)).toBeLessThanOrEqual(3);
    expect(edges.helmetRight).toBeLessThanOrEqual(115);
    expect(Math.abs(edges.helmetRight - 109)).toBeLessThanOrEqual(3);
    expect(edges.torsoRight).toBeLessThanOrEqual(75);
    expect(Math.abs(edges.torsoRight - 68)).toBeLessThanOrEqual(3);
  });

  it("390×844: 守備のレイアウトでも打撃と同じ構図なので、同じ位置", () => {
    const batting = batterRightEdges(390, 844, "batting", true);
    const pitching = batterRightEdges(390, 844, "pitching", true);
    expect(pitching.helmetRight).toBeCloseTo(batting.helmetRight, 6);
    expect(pitching.torsoRight).toBeCloseTo(batting.torsoRight, 6);
  });

  it("390×844: ヘルメット込みの頭の右端とゾーン枠の左端(117.7px)の間が 5px 以上(設計値 約 9px)", () => {
    const rect = zoneRectOf(battingCameraFor(390 / 844, "batting", null), sizeOf(390, 844), ZONE);
    expect(rect.left - batterRightEdges(390, 844, "batting", false).helmetRight).toBeGreaterThanOrEqual(5);
  });

  it.each([
    { width: 390, height: 745 },
    { width: 390, height: 664 },
    { width: 375, height: 667 },
    { width: 360, height: 640 },
  ])("$width×$height: 打撃・守備とも、頭(ヘルメット込み)・胴の右端がゾーン枠の左端より左(重ならない)", ({ width, height }) => {
    for (const layout of ["batting", "pitching"] as const) {
      const rect = zoneRectOf(battingCameraFor(width / height, layout, safeAreaFor(height, layout)), sizeOf(width, height), ZONE);
      const edges = batterRightEdges(width, height, layout, true);
      expect(edges.helmetRight, layout).toBeLessThan(rect.left);
      expect(edges.torsoRight, layout).toBeLessThan(rect.left);
    }
  });

  it("390×664(ツールバーあり)でも頭の中心 x が 0 以上(画面の左端で頭が切れすぎない)", () => {
    expect(batterRightEdges(390, 664, "batting", true).headCenterX).toBeGreaterThanOrEqual(0);
  });
});
