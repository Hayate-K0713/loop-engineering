import { describe, expect, it } from "vitest";
import { LANDING_PARAMS } from "../../batting/params";
import { zoneToWorld } from "./coords";
import { buildStageGeometry, standsHeightAt } from "./geometry";
import { WORLD_PARAMS } from "./params";

const GEOMETRY = buildStageGeometry();

function distanceFromHome(point: { readonly x: number; readonly z: number }): number {
  return Math.hypot(point.x, point.z);
}

describe("buildStageGeometry: ゾーンとボール", () => {
  it("zone が zoneToWorld と一致する", () => {
    expect(GEOMETRY.zone.halfWidth).toBeCloseTo(zoneToWorld({ x: 1, y: 0 }).x, 9);
    expect(GEOMETRY.zone.top).toBeCloseTo(zoneToWorld({ x: 0, y: 1 }).y, 9);
    expect(GEOMETRY.zone.bottom).toBeCloseTo(zoneToWorld({ x: 0, y: -1 }).y, 9);
    expect(GEOMETRY.zone.planeZ).toBeCloseTo(zoneToWorld({ x: 0, y: 0 }).z, 9);
  });

  it("ballRadius は正で WORLD_PARAMS と同じ", () => {
    expect(GEOMETRY.ballRadius).toBeGreaterThan(0);
    expect(GEOMETRY.ballRadius).toBe(WORLD_PARAMS.ballRadius);
  });

  it("同じ入力で deep equal(決定論)", () => {
    expect(buildStageGeometry()).toEqual(GEOMETRY);
  });
});

describe("buildStageGeometry: ダイヤモンド", () => {
  it("本塁から各塁までの距離が塁間(LANDING_PARAMS.baseDistance)に一致する(二塁は塁間 × √2)", () => {
    const { first, second, third } = GEOMETRY.bases;
    expect(distanceFromHome(first)).toBeCloseTo(LANDING_PARAMS.baseDistance, 1);
    expect(distanceFromHome(third)).toBeCloseTo(LANDING_PARAMS.baseDistance, 1);
    expect(distanceFromHome(second)).toBeCloseTo(LANDING_PARAMS.baseDistance * Math.SQRT2, 1);
  });

  it("一塁は +x(ライト側)、三塁は −x、二塁は x = 0 でセンター方向(−z)", () => {
    const { first, second, third } = GEOMETRY.bases;
    expect(first.x).toBeGreaterThan(0);
    expect(third.x).toBeCloseTo(-first.x, 9);
    expect(second.x).toBe(0);
    expect([first.z, second.z, third.z].every((z) => z < 0)).toBe(true);
  });

  it("本塁の尖りは捕手側(+z)に向く", () => {
    const { points } = GEOMETRY.homePlate;
    const tip = points.reduce((best, point) => (point.z > best.z ? point : best));
    expect(points).toHaveLength(5);
    expect(tip.x).toBe(0);
    expect(points.filter((point) => point.z === tip.z)).toHaveLength(1);
  });

  it("ファウルラインの中心は本塁から ±45° 上で、箱の端が本塁に届く", () => {
    const { centerOffset, length } = GEOMETRY.foulLines;
    expect(Math.hypot(centerOffset, centerOffset)).toBeCloseTo(length / 2, 9);
  });

  it("マウンドとラバーは投手の足元(z = −18.4 付近)にある", () => {
    expect(GEOMETRY.mound.z).toBeCloseTo(WORLD_PARAMS.actors.pitcher.position.z, 9);
    expect(GEOMETRY.rubber.z).toBeCloseTo(WORLD_PARAMS.actors.pitcher.position.z, 9);
  });
});

describe("buildStageGeometry: フェンス・スタンド・屋根", () => {
  it("フェンス半径は LANDING_PARAMS.fenceRadius、上端の帯はそのわずか外側", () => {
    expect(GEOMETRY.fence.radius).toBe(LANDING_PARAMS.fenceRadius);
    expect(GEOMETRY.fence.cap.radius).toBeGreaterThan(GEOMETRY.fence.radius);
  });

  it("スタンドの内側半径はフェンス半径より大きく、外側はさらに大きい", () => {
    expect(GEOMETRY.stands.innerRadius).toBeGreaterThan(GEOMETRY.fence.radius);
    expect(GEOMETRY.stands.outerRadius).toBeGreaterThan(GEOMETRY.stands.innerRadius);
  });

  it("屋根の半径はスタンドの外側半径以上", () => {
    expect(GEOMETRY.roof.radius).toBeGreaterThanOrEqual(GEOMETRY.stands.outerRadius);
  });
});

describe("standsHeightAt", () => {
  const { stands } = GEOMETRY;
  const bottom = stands.y - stands.height / 2;
  const top = stands.y + stands.height / 2;

  it("下端の半径で斜面の下端、上端の半径で斜面の上端の高さ", () => {
    expect(standsHeightAt(stands, stands.innerRadius)).toBeCloseTo(bottom, 9);
    expect(standsHeightAt(stands, stands.outerRadius)).toBeCloseTo(top, 9);
  });

  it("外側は上端で頭打ち、半径に対して単調非減少", () => {
    expect(standsHeightAt(stands, stands.outerRadius + 50)).toBeCloseTo(top, 9);
    const radii = Array.from({ length: 80 }, (_, i) => 90 + i * 1.5);
    const heights = radii.map((radius) => standsHeightAt(stands, radius));
    expect(heights.every((height, i) => i === 0 || height >= (heights.at(i - 1) ?? 0))).toBe(true);
  });

  it("内側は斜面の延長で、地面より下には潜らない", () => {
    expect(standsHeightAt(stands, 0)).toBe(0);
    expect(standsHeightAt(stands, GEOMETRY.fence.radius + 1)).toBeGreaterThan(0);
  });
});
