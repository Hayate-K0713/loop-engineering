import { describe, expect, it } from "vitest";
import type { PlateOutcome } from "../../../types/batting";
import type { Vec3 } from "../../../types/scene";
import { distanceXZ } from "../space/vec3";
import { WORLD_PARAMS } from "../space/params";
import { FIELDER_SLOTS, FIELDING, fielderRunAt, fielderStopPoint, fieldingStyleOf, pickFielder, planFielding, throwBallAt } from "./fielders";
import { baseWorldPosition } from "./runners";

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

const DEADLINE_MS = WORLD_PARAMS.runners.msPerBase - FIELDING.retireMarginMs;

/** 内野ゴロの落下点(本塁から 14〜32m、左右 ±0.85)を粗く走査した格子。 */
const INFIELD_LANDINGS: readonly Vec3[] = [-0.85, -0.5, -0.25, 0, 0.25, 0.5, 0.85].flatMap((lateral) =>
  [14, 20, 26, 32].map((distance): Vec3 => {
    const z = distance / Math.sqrt(1 + lateral * lateral);
    return { x: lateral * z, y: 0, z: -z };
  }),
);

function planOf(plate: PlateOutcome, landing: Vec3): NonNullable<ReturnType<typeof planFielding>> {
  const plan = planFielding(plate, landing);
  if (plan === null) {
    throw new Error(`no fielding plan for ${plate}`);
  }
  return plan;
}

describe("fieldingStyleOf(結果ごとの演出の表)", () => {
  it.each([
    ["walk", null, "none"],
    ["strikeout", null, "none"],
    ["homerun", null, "none"],
    ["groundout", "scoop", "first"],
    ["doublePlay", "scoop", "double-play"],
    ["flyout", "catch", "none"],
    ["lineout", "catch", "none"],
    ["single", "field", "none"],
    ["double", "field", "none"],
    ["triple", "field", "none"],
    ["error", "field", "none"],
  ] as const)("%s: ポーズ %s・送球 %s", (plate, pose, throws) => {
    expect(fieldingStyleOf(plate)).toEqual({ pose, throws });
  });
});

describe("planFielding: 野手が動かない結果", () => {
  it.each([["walk"], ["strikeout"], ["homerun"]] as const)("%s は null", (plate) => {
    expect(planFielding(plate, { x: 0, y: 0, z: -50 })).toBeNull();
  });
});

describe("planFielding: フライ・ライナー・安打・失策", () => {
  const landing: Vec3 = { x: 38, y: 0, z: -75 };

  it.each([["flyout"], ["lineout"]] as const)("%s: 最寄りの野手が捕球(catch)し、捕った瞬間(t = 0)に打者がアウト。送球なし", (plate) => {
    const plan = planOf(plate, landing);
    expect(plan.pose).toBe("catch");
    expect(plan.fielderIndex).toBe(pickFielder(landing));
    expect(plan.stop).toEqual(fielderStopPoint(landing));
    expect(plan.throws).toEqual([]);
    expect(plan.retires).toEqual([{ slot: 0, atMs: 0 }]);
    expect(plan.endMs).toBe(0);
  });

  it.each([["single"], ["double"], ["triple"], ["error"]] as const)("%s: 追いついて止まる(field)だけで、送球もアウトもない", (plate) => {
    const plan = planOf(plate, landing);
    expect(plan.pose).toBe("field");
    expect(plan.throws).toEqual([]);
    expect(plan.retires).toEqual([]);
  });

  it("野手の足元は落下点 × stopRatio(play-plan の野手の到達点と同じ)、高さ 0", () => {
    expect(fielderStopPoint({ x: 10, y: 5, z: -50 })).toEqual({ x: 9, y: 0, z: -45 });
  });
});

describe("planFielding: ゴロのアウト", () => {
  it("遊撃手が捕れば、一塁へ 1 回送球。一塁手が捕ってアウト(送球の到着)", () => {
    const plan = planOf("groundout", { x: -7, y: 0, z: -32 });
    expect(plan.pose).toBe("scoop");
    expect(plan.fielderIndex).toBe(2);
    expect(plan.throws).toHaveLength(1);
    const [toFirst] = plan.throws;
    expect(toFirst).toMatchObject({ fromIndex: 2, toIndex: 0, target: 1, startMs: FIELDING.scoopMs });
    expect(toFirst?.from.y).toBe(FIELDING.releaseY);
    expect(toFirst?.to).toMatchObject({ x: baseWorldPosition(1).x, y: FIELDING.catchY, z: baseWorldPosition(1).z });
    expect(plan.retires).toEqual([{ slot: 0, atMs: toFirst?.arriveMs }]);
    expect(plan.endMs).toBe(toFirst?.arriveMs);
  });

  it("送球は約 0.7 秒で一塁へ(遊撃手の定位置付近から)", () => {
    const plan = planOf("groundout", { x: -7, y: 0, z: -32.5 });
    const [toFirst] = plan.throws;
    expect((toFirst?.arriveMs ?? 0) - (toFirst?.startMs ?? 0)).toBeGreaterThan(600);
    expect((toFirst?.arriveMs ?? 0) - (toFirst?.startMs ?? 0)).toBeLessThan(800 + 1);
  });

  it("一塁手が捕ったら送球せず、自分で塁を踏む(scoopMs + unassistedMs)", () => {
    const plan = planOf("groundout", { x: 18, y: 0, z: -24 });
    expect(plan.fielderIndex).toBe(0);
    expect(plan.throws).toEqual([]);
    expect(plan.retires).toEqual([{ slot: 0, atMs: FIELDING.scoopMs + FIELDING.unassistedMs }]);
  });

  it("内野の全落下点で、アウトの成立は打者走者が一塁に着く時刻より retireMarginMs 以上前", () => {
    const late = INFIELD_LANDINGS.filter((landing) => planOf("groundout", landing).endMs > DEADLINE_MS);
    expect(late).toEqual([]);
  });
});

describe("planFielding: 併殺", () => {
  it("二塁へ送球 → 持ち替えて一塁へ送球の 2 回。一塁走者のアウトが先、打者走者のアウトが後", () => {
    const plan = planOf("doublePlay", { x: -7, y: 0, z: -32 });
    expect(plan.throws).toHaveLength(2);
    const [toSecond, toFirst] = plan.throws;
    expect(toSecond).toMatchObject({ fromIndex: 2, toIndex: 1, target: 2, startMs: FIELDING.scoopMs });
    expect(toFirst).toMatchObject({ fromIndex: 1, toIndex: 0, target: 1 });
    expect(toFirst?.startMs).toBeGreaterThan(toSecond?.arriveMs ?? 0);
    expect(toFirst?.from.x).toBeCloseTo(baseWorldPosition(2).x, 9);
    expect(toFirst?.from.z).toBeCloseTo(baseWorldPosition(2).z, 9);
    expect(plan.retires).toEqual([
      { slot: 1, atMs: toSecond?.arriveMs },
      { slot: 0, atMs: toFirst?.arriveMs },
    ]);
  });

  it("二塁手が捕ったときは遊撃手が二塁に入って受ける", () => {
    const plan = planOf("doublePlay", { x: 6, y: 0, z: -32 });
    expect(plan.fielderIndex).toBe(1);
    expect(plan.throws.map((entry) => [entry.fromIndex, entry.toIndex])).toEqual([
      [1, 2],
      [2, 0],
    ]);
  });

  it("内野の全落下点で 2 回送球し、最後のアウトが打者走者の到着の retireMarginMs 以上前。送球は時刻順で重ならない", () => {
    const problems = INFIELD_LANDINGS.flatMap((landing) => {
      const plan = planOf("doublePlay", landing);
      const [first, second] = plan.throws;
      const ordered = first !== undefined && second !== undefined && first.startMs < first.arriveMs && first.arriveMs <= second.startMs;
      return plan.throws.length === 2 && ordered && plan.endMs <= DEADLINE_MS ? [] : [landing];
    });
    expect(problems).toEqual([]);
  });
});

describe("throwBallAt", () => {
  const plan = planOf("groundout", { x: -7, y: 0, z: -32 }).throws.at(0);
  const toFirst =
    plan ??
    (() => {
      throw new Error("no throw");
    })();

  it("始点・終点に厳密に一致し、前後はクランプされる", () => {
    expect(throwBallAt(toFirst, toFirst.startMs)).toEqual(toFirst.from);
    expect(throwBallAt(toFirst, toFirst.arriveMs)).toEqual(toFirst.to);
    expect(throwBallAt(toFirst, -100)).toEqual(toFirst.from);
    expect(throwBallAt(toFirst, toFirst.arriveMs + 5000)).toEqual(toFirst.to);
  });

  it("中点では始点・終点を結ぶ線より peak だけ高く、地面より上を飛ぶ", () => {
    const mid = throwBallAt(toFirst, (toFirst.startMs + toFirst.arriveMs) / 2);
    const lineY = (toFirst.from.y + toFirst.to.y) / 2;
    expect(mid.y - lineY).toBeCloseTo(toFirst.peak, 9);
    expect(toFirst.peak).toBeGreaterThan(0);
    expect(mid.y).toBeGreaterThan(0);
  });

  it("水平方向は等速: 始点から終点まで 1/4 の時刻で 1/4 の道のり", () => {
    const quarter = throwBallAt(toFirst, toFirst.startMs + (toFirst.arriveMs - toFirst.startMs) / 4);
    const total = distanceXZ(toFirst.from, toFirst.to);
    expect(distanceXZ(toFirst.from, quarter) / total).toBeCloseTo(0.25, 9);
  });
});
