import { describe, expect, it } from "vitest";
import type { PlateOutcome } from "../../../types/batting";
import type { BaseFrom, BaseTo, Bases, RunnerMoves } from "../../../types/game";
import type { Vec3 } from "../../../types/scene";
import { distanceXZ } from "../space/vec3";
import { WORLD_PARAMS } from "../space/params";
import {
  baseWorldPosition,
  planRunners,
  runDurationMs,
  runnerPositionAt,
  runnerProgress,
  runnerStandPosition,
  runnerYawAt,
  type RunnerMotion,
} from "./runners";

const SIDE = 27.4 * Math.SQRT1_2;
const EMPTY: Bases = { first: false, second: false, third: false };
const MS_PER_BASE = WORLD_PARAMS.runners.msPerBase;
const MAX_MS = WORLD_PARAMS.runners.maxMs;

const NEXT_BASE = [2, 3, 4] as const;

type Advance = { readonly from: BaseFrom; readonly to: BaseTo };

function movesOf(batterTo: BaseTo, advances: readonly Advance[], scored = 0): RunnerMoves {
  return { before: EMPTY, after: EMPTY, scored, batterTo, advances };
}

function motionAt(plan: ReturnType<typeof planRunners>, slot: number): RunnerMotion {
  const motion = plan.motions.at(slot);
  if (motion === null || motion === undefined) {
    throw new Error(`no motion at slot ${slot}`);
  }
  return motion;
}

function lengthOf(path: readonly Vec3[]): number {
  return path.slice(1).reduce((sum, point, index) => sum + distanceXZ(path.at(index) ?? point, point), 0);
}

describe("baseWorldPosition / runnerStandPosition", () => {
  it("塁は塁間 27.4m の菱形(一塁 +x、二塁 センター方向、本塁 原点)で、足元の高さは 0", () => {
    const [first, second, third, home] = ([1, 2, 3, 4] as const).map((base) => baseWorldPosition(base));
    expect(first?.x).toBeCloseTo(SIDE, 6);
    expect(first?.z).toBeCloseTo(-SIDE, 6);
    expect(second?.x).toBeCloseTo(0, 6);
    expect(second?.z).toBeCloseTo(-2 * SIDE, 6);
    expect(third?.x).toBeCloseTo(-SIDE, 6);
    expect(third?.z).toBeCloseTo(-SIDE, 6);
    expect(home).toEqual({ x: 0, y: 0, z: 0 });
    expect([first, second, third].map((point) => point?.y)).toEqual([0, 0, 0]);
  });

  it("塁上の走者の構えは、塁から次の塁へ leadOffsetM 離れた点(三塁は本塁側)", () => {
    const { leadOffsetM } = WORLD_PARAMS.runners;
    for (const base of [1, 2, 3] as const) {
      const lead = runnerStandPosition(base);
      expect(distanceXZ(lead, baseWorldPosition(base))).toBeCloseTo(leadOffsetM, 6);
      const next = baseWorldPosition(NEXT_BASE[base - 1] ?? 4);
      expect(distanceXZ(lead, next)).toBeCloseTo(distanceXZ(baseWorldPosition(base), next) - leadOffsetM, 6);
    }
  });

  it("打者走者の出発点は打席の打者の位置、本塁は原点", () => {
    const { position } = WORLD_PARAMS.actors.batter;
    expect(runnerStandPosition(0)).toEqual({ x: position.x, y: 0, z: position.z });
    expect(runnerStandPosition(4)).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe("runDurationMs", () => {
  it("1 塁 1.6 秒。複数塁は速度を上げて最大 3.0 秒に収める", () => {
    expect(runDurationMs(0)).toBe(0);
    expect(runDurationMs(1)).toBe(MS_PER_BASE);
    expect(runDurationMs(2)).toBe(MAX_MS);
    expect(runDurationMs(3)).toBe(MAX_MS);
    expect(runDurationMs(4)).toBe(MAX_MS);
  });
});

describe("planRunners: 打者走者", () => {
  it("単打: 打席から一塁のリード位置へ 1.6 秒。塁上の走者はいない", () => {
    const plan = planRunners(movesOf(1, []), "single");
    expect(plan.motions.map((motion) => motion?.slot ?? null)).toEqual([0, null, null, null]);
    const batter = motionAt(plan, 0);
    expect(batter.fate).toBe("safe");
    expect(batter.durationMs).toBe(MS_PER_BASE);
    expect(batter.path.at(0)).toEqual(runnerStandPosition(0));
    expect(batter.path.at(-1)).toEqual(runnerStandPosition(1));
    expect(plan.durationMs).toBe(MS_PER_BASE);
  });

  it.each([
    [2, "double", [baseWorldPosition(1)]],
    [3, "triple", [baseWorldPosition(1), baseWorldPosition(2)]],
  ] as const)("%i 塁打: 通過する塁を踏み、全体で最大 3.0 秒", (batterTo, plate, passed) => {
    const batter = motionAt(planRunners(movesOf(batterTo, []), plate), 0);
    expect(batter.path.slice(1, -1)).toEqual(passed);
    expect(batter.path.at(-1)).toEqual(runnerStandPosition(batterTo));
    expect(batter.durationMs).toBe(MAX_MS);
  });

  it("ゴロのアウト・併殺: 打者は一塁へ走ってアウト(fate out)", () => {
    for (const plate of ["groundout", "doublePlay"] as const) {
      const batter = motionAt(planRunners(movesOf(0, []), plate), 0);
      expect(batter.fate).toBe("out");
      expect(batter.durationMs).toBe(MS_PER_BASE);
      expect(batter.path.at(-1)).toEqual(runnerStandPosition(1));
    }
  });

  it.each([["strikeout"], ["flyout"], ["lineout"]] as const)("%s: 打者は走らない(null)", (plate) => {
    const plan = planRunners(movesOf(0, []), plate);
    expect(plan.motions.at(0)).toBeNull();
    expect(plan.durationMs).toBe(0);
  });
});

describe("planRunners: 塁上の走者", () => {
  it("一塁走者が単打で二塁へ: 1.6 秒、二塁のリード位置に着く", () => {
    const plan = planRunners(movesOf(1, [{ from: 1, to: 2 }]), "single");
    const runner = motionAt(plan, 1);
    expect(runner.fate).toBe("safe");
    expect(runner.durationMs).toBe(MS_PER_BASE);
    expect(runner.path).toEqual([runnerStandPosition(1), runnerStandPosition(2)]);
  });

  it("二塁走者が単打で生還: 三塁を踏んで本塁へ、3.0 秒", () => {
    const plan = planRunners(movesOf(1, [{ from: 2, to: 4 }], 1), "single");
    const runner = motionAt(plan, 2);
    expect(runner.fate).toBe("scored");
    expect(runner.durationMs).toBe(MAX_MS);
    expect(runner.path).toEqual([runnerStandPosition(2), baseWorldPosition(3), baseWorldPosition(4)]);
    expect(plan.durationMs).toBe(MAX_MS);
  });

  it("動かない走者: 構えの位置に立ち(経路 1 点)、所要時間 0。safe で同じ塁", () => {
    const plan = planRunners(movesOf(0, [{ from: 2, to: 2 }]), "lineout");
    const runner = motionAt(plan, 2);
    expect(runner).toMatchObject({ fate: "safe", durationMs: 0, from: 2, to: 2 });
    expect(runner.path).toEqual([runnerStandPosition(2)]);
  });

  it("併殺: 一塁走者は二塁へ走ってアウト(out)、二塁走者は三塁へ進む", () => {
    const plan = planRunners(
      movesOf(0, [
        { from: 2, to: 3 },
        { from: 1, to: 0 },
      ]),
      "doublePlay",
    );
    const forced = motionAt(plan, 1);
    expect(forced.fate).toBe("out");
    expect(forced.path.at(-1)).toEqual(runnerStandPosition(2));
    expect(forced.durationMs).toBe(MS_PER_BASE);
    expect(motionAt(plan, 2)).toMatchObject({ fate: "safe", durationMs: MS_PER_BASE });
  });

  it("3 アウト目で消える走者(to = 0)は動かず cleared。併殺以外のアウトでは一塁走者も動かない", () => {
    const plan = planRunners(
      movesOf(0, [
        { from: 3, to: 0 },
        { from: 1, to: 0 },
      ]),
      "groundout",
    );
    expect(motionAt(plan, 3)).toMatchObject({ fate: "cleared", durationMs: 0 });
    expect(motionAt(plan, 1)).toMatchObject({ fate: "cleared", durationMs: 0 });
    expect(plan.durationMs).toBe(MS_PER_BASE);
  });

  it("犠牲フライ: 三塁走者が本塁へ(1.6 秒)、他の走者は動かない", () => {
    const plan = planRunners(
      movesOf(
        0,
        [
          { from: 3, to: 4 },
          { from: 1, to: 1 },
        ],
        1,
      ),
      "flyout",
    );
    expect(motionAt(plan, 3)).toMatchObject({ fate: "scored", durationMs: MS_PER_BASE });
    expect(motionAt(plan, 1).durationMs).toBe(0);
  });
});

describe("planRunners: ホームラン", () => {
  it("走者(打者走者を含む)を動かさない: 所要時間 0、経路は構えの 1 点、打者走者は null", () => {
    const plan = planRunners(
      movesOf(
        4,
        [
          { from: 3, to: 4 },
          { from: 1, to: 4 },
        ],
        3,
      ),
      "homerun",
    );
    expect(plan.durationMs).toBe(0);
    expect(plan.motions.at(0)).toBeNull();
    expect(plan.motions.at(2)).toBeNull();
    for (const slot of [1, 3]) {
      const motion = motionAt(plan, slot);
      expect(motion.fate).toBe("scored");
      expect(motion.durationMs).toBe(0);
      expect(motion.path).toEqual([runnerStandPosition(slot as 1 | 3)]);
      expect(runnerPositionAt(motion, 0)).toEqual(runnerPositionAt(motion, 5000));
    }
  });
});

describe("runnerPositionAt / runnerYawAt / runnerProgress", () => {
  const batter = motionAt(planRunners(movesOf(2, []), "double"), 0);

  it("t = 0 で出発点、t = 所要時間で到達点に厳密に一致し、前後はクランプされる", () => {
    expect(runnerPositionAt(batter, 0)).toEqual(batter.path.at(0));
    expect(runnerPositionAt(batter, batter.durationMs)).toEqual(batter.path.at(-1));
    expect(runnerPositionAt(batter, -500)).toEqual(batter.path.at(0));
    expect(runnerPositionAt(batter, batter.durationMs + 9999)).toEqual(batter.path.at(-1));
  });

  it("経路の距離に比例して等速で進む(直線の区間では 1/4・1/2・3/4 の時刻で道のりも 1/4・1/2・3/4)", () => {
    const leg = motionAt(planRunners(movesOf(0, [{ from: 1, to: 2 }]), "single"), 1);
    const start = leg.path.at(0) ?? runnerStandPosition(1);
    const total = lengthOf(leg.path);
    const walked = [0.25, 0.5, 0.75].map((ratio) => distanceXZ(start, runnerPositionAt(leg, leg.durationMs * ratio)));
    expect(walked.map((value) => value / total)).toEqual([0.25, 0.5, 0.75].map((ratio) => expect.closeTo(ratio, 6)));
  });

  it("折れ線の途中でも、時刻が進むほど経路上の道のりが単調に増える", () => {
    const samples = Array.from({ length: 21 }, (_, step) => runnerPositionAt(batter, (batter.durationMs * step) / 20));
    const steps = samples.slice(1).map((point, index) => distanceXZ(samples.at(index) ?? point, point));
    expect(steps.every((step) => step > 0)).toBe(true);
    expect(steps.reduce((sum, step) => sum + step, 0)).toBeLessThanOrEqual(lengthOf(batter.path) + 1e-9);
  });

  it("進行度は 0〜1 にクランプされ、所要時間 0 の走者は常に 1", () => {
    expect(runnerProgress(batter, -1)).toBe(0);
    expect(runnerProgress(batter, batter.durationMs * 2)).toBe(1);
    const standing = motionAt(planRunners(movesOf(0, [{ from: 1, to: 1 }]), "strikeout"), 1);
    expect(runnerProgress(standing, 0)).toBe(1);
  });

  it("向きは進行方向: 打席から一塁へは +x 側・センター側(yaw = atan2(dx, dz))、動かない走者は fallback", () => {
    const yaw = runnerYawAt(batter, 100, 123);
    const first = baseWorldPosition(1);
    const start = runnerStandPosition(0);
    expect(yaw).toBeCloseTo(Math.atan2(first.x - start.x, first.z - start.z), 6);
    const standing = motionAt(planRunners(movesOf(0, [{ from: 1, to: 1 }]), "strikeout"), 1);
    expect(runnerYawAt(standing, 0, 1.25)).toBe(1.25);
  });
});

describe("planRunners: 純粋性", () => {
  const plates: readonly PlateOutcome[] = ["walk", "single", "double", "triple", "groundout", "doublePlay", "flyout", "error"];

  it("同じ入力は同じ計画で、入力を変更しない", () => {
    const moves = movesOf(1, [{ from: 2, to: 4 }], 1);
    const snapshot = structuredClone(moves);
    expect(planRunners(moves, "single")).toEqual(planRunners(moves, "single"));
    expect(moves).toEqual(snapshot);
    expect(plates.map((plate) => planRunners(moves, plate).motions.length)).toEqual(plates.map(() => 4));
  });
});
