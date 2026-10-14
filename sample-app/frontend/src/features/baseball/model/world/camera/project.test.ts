import { describe, expect, it } from "vitest";
import type { CameraPose } from "../../../types/scene";
import { WORLD_PARAMS } from "../space/params";
import { projectPoint, zoneRectOf, type ViewSize, type ZoneBox } from "./project";
import { battingCamera, battingCameraFor, fovForAspect } from "./rig";

const ZONE: ZoneBox = WORLD_PARAMS.zone;
const MIN_TAN = WORLD_PARAMS.framing.landscapeMinHalfWidthTan;
const BATTER = WORLD_PARAMS.actors.batter;

/** 下のオーバーレイの上端 y(px): 打撃はティッカーが下から 181px、守備は高さ 800px 未満で 300px・以上で 368px のバー。 */
function overlayTop(height: number, layout: "batting" | "pitching"): number {
  if (layout === "batting") return height - 181;
  return height - (height < 800 ? 300 : 368);
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

  it("390×844 の既定の空き領域では、ゾーンが設計値(154×174px 前後)に近い", () => {
    const rect = zoneRectOf(battingCameraFor(390 / 844, "batting", null), sizeOf(390, 844), ZONE);
    expect(Math.abs(rect.width - 154)).toBeLessThanOrEqual(3);
    expect(Math.abs(rect.height - 174)).toBeLessThanOrEqual(4);
  });
});

describe("縦長・守備のゾーンと格子", () => {
  it.each([
    { width: 390, height: 844, minWidth: 85 },
    { width: 390, height: 745, minWidth: 85 },
    { width: 390, height: 664, minWidth: 60 },
    { width: 360, height: 640, minWidth: 52 },
  ])("$width×$height: ゾーン幅 ≥ $minWidth、格子の下端が操作バー(ティッカー)の上端より上", ({ width, height, minWidth }) => {
    const size = sizeOf(width, height);
    const pose = battingCameraFor(width / height, "pitching", safeAreaFor(height, "pitching"));
    const zone = zoneRectOf(pose, size, ZONE);
    const grid = zoneRectOf(pose, size, gridZone());
    expect(zone.width).toBeGreaterThanOrEqual(minWidth);
    expect(grid.top + grid.height).toBeLessThanOrEqual(overlayTop(height, "pitching"));
  });
});

describe("打者の頭の位置(縦長・打撃)", () => {
  it("390×844 で頭の中心 x が 60px 以上(設計値は約 73px)", () => {
    const size = sizeOf(390, 844);
    const pose = battingCameraFor(390 / 844, "batting", null);
    const headY = BATTER.position.y + 0.55 + 0.98;
    const head = projectPoint(pose, size, { x: BATTER.portraitX, y: headY, z: BATTER.position.z });
    expect(head.x).toBeGreaterThanOrEqual(60);
    expect(Math.abs(head.x - 73)).toBeLessThanOrEqual(6);
  });

  it("390×664(ツールバーあり)でも頭の中心 x が 60px 以上", () => {
    const pose = battingCameraFor(390 / 664, "batting", safeAreaFor(664, "batting"));
    const head = projectPoint(pose, sizeOf(390, 664), { x: BATTER.portraitX, y: 1.6, z: BATTER.position.z });
    expect(head.x).toBeGreaterThanOrEqual(60);
  });
});
