import { describe, expect, it } from "vitest";
import type { Vec3 } from "../../../types/scene";
import { FIELDER_SLOTS, fielderRunAt, pickFielder } from "./fielders";

/** x ±90、z −130〜−5 の 5m 刻みの格子点。 */
const GRID_POINTS: readonly Vec3[] = Array.from({ length: 37 }, (_, i) => -90 + i * 5).flatMap((x) =>
  Array.from({ length: 26 }, (_, j) => -130 + j * 5).map((z): Vec3 => ({ x, y: 0, z })),
);

/** 総当たりで最小距離の野手の添字(同距離は小さい添字)。 */
function bruteForcePick(target: Vec3): number {
  const distances = FIELDER_SLOTS.map((fielder) => Math.hypot(fielder.position.x - target.x, fielder.position.z - target.z));
  return distances.indexOf(Math.min(...distances));
}

describe("FIELDER_SLOTS", () => {
  it("7人が固定順(一塁・二塁・遊撃・三塁・左・中・右)", () => {
    expect(FIELDER_SLOTS.map((fielder) => fielder.id)).toEqual(["first", "second", "shortstop", "third", "left", "center", "right"]);
  });

  it("守備位置はモックの FIELD_POS に一致し、足元の高さは 0", () => {
    expect(FIELDER_SLOTS.map((fielder) => [fielder.position.x, fielder.position.z])).toEqual([
      [16.5, -23],
      [6, -32.5],
      [-7, -32.5],
      [-16.5, -23],
      [-38, -72],
      [0, -86],
      [38, -72],
    ]);
    expect(FIELDER_SLOTS.every((fielder) => fielder.position.y === 0)).toBe(true);
  });
});

describe("pickFielder", () => {
  it("格子の全点で、総当たりの最小距離の野手と一致する", () => {
    expect(GRID_POINTS).toHaveLength(37 * 26);
    const mismatches = GRID_POINTS.filter((point) => pickFielder(point) !== bruteForcePick(point));
    expect(mismatches.slice(0, 3)).toEqual([]);
  });

  it("各野手の守備位置では、その野手自身が選ばれる", () => {
    FIELDER_SLOTS.forEach((fielder, index) => {
      expect(pickFielder(fielder.position)).toBe(index);
    });
  });

  it("同距離は添字の小さい方(一塁と三塁から等距離の (0, −15) は一塁、二塁と遊撃から等距離の (−0.5, −32.5) は二塁)", () => {
    expect(pickFielder({ x: 0, y: 0, z: -15 })).toBe(0);
    expect(pickFielder({ x: -0.5, y: 0, z: -32.5 })).toBe(1);
  });

  it("y は無視する", () => {
    expect(pickFielder({ x: -30, y: 50, z: -70 })).toBe(pickFielder({ x: -30, y: 0, z: -70 }));
  });

  it("左中間は左翼、右中間は右翼、センター方向は中堅", () => {
    expect(pickFielder({ x: -38, y: 0, z: -75 })).toBe(4);
    expect(pickFielder({ x: 38, y: 0, z: -75 })).toBe(6);
    expect(pickFielder({ x: 2, y: 0, z: -95 })).toBe(5);
  });
});

describe("fielderRunAt", () => {
  const from: Vec3 = { x: 38, y: 0, z: -72 };
  const to: Vec3 = { x: 30, y: 0, z: -90 };

  it("端点は from / to に一致し、中点は線形補間", () => {
    expect(fielderRunAt(from, to, 0)).toEqual(from);
    expect(fielderRunAt(from, to, 1)).toEqual(to);
    expect(fielderRunAt(from, to, 0.5)).toEqual({ x: 34, y: 0, z: -81 });
  });

  it("progress は 0〜1 にクランプされる", () => {
    expect(fielderRunAt(from, to, -3)).toEqual(from);
    expect(fielderRunAt(from, to, 7)).toEqual(to);
  });
});
