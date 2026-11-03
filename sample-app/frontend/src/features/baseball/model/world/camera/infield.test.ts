import { describe, expect, it } from "vitest";
import type { BaseTo } from "../../../types/game";
import type { Vec3 } from "../../../types/scene";
import { baseWorldPosition, planRunners, runnerPositionAt, runnerStandPosition } from "../path/runners";
import { WORLD_PARAMS } from "../space/params";
import { infieldBlendAt, infieldCameraFor, infieldFovDeg } from "./infield";
import { projectPoint } from "./project";

const INFIELD = WORLD_PARAMS.runners.infieldCamera;
const DEG_TO_RAD = Math.PI / 180;

/** [幅, 高さ]: 縦長 3 種と横長。 */
const VIEWPORTS: readonly (readonly [number, number])[] = [
  [390, 844],
  [390, 664],
  [375, 667],
  [360, 640],
  [1280, 720],
];

/** 画面の端からこれ以上内側に入っていること(px)。 */
const EDGE_MARGIN_PX = 8;

function halfWidthTanOf(aspect: number): number {
  return Math.tan((infieldCameraFor(aspect).fovDeg * DEG_TO_RAD) / 2) * aspect;
}

describe("infieldCameraFor: 姿勢と画角", () => {
  it("位置・注視点は WORLD_PARAMS.runners.infieldCamera、lift は 0", () => {
    const camera = infieldCameraFor(390 / 844);
    expect(camera.position).toEqual(INFIELD.position);
    expect(camera.target).toEqual(INFIELD.target);
    expect(camera.lift).toBe(0);
  });

  it.each([390 / 844, 390 / 664, 375 / 667, 0.7, 1, 16 / 9])("水平半幅 tan が halfWidthTan(0.60)になる(縦横比 %f)", (aspect) => {
    expect(halfWidthTanOf(aspect)).toBeCloseTo(INFIELD.halfWidthTan, 9);
  });

  it("無効な縦横比(NaN・0・負・無限大)は 16/9 とみなす", () => {
    for (const aspect of [Number.NaN, 0, -1, Number.POSITIVE_INFINITY]) {
      expect(infieldFovDeg(aspect)).toBeCloseTo(infieldFovDeg(16 / 9), 12);
    }
  });
});

describe("infieldBlendAt: 400ms の smoothstep", () => {
  it("開始前・非有限は 0、blendMs で 1、以降は 1 を保つ", () => {
    expect(infieldBlendAt(-100)).toBe(0);
    expect(infieldBlendAt(0)).toBe(0);
    expect(infieldBlendAt(INFIELD.blendMs)).toBe(1);
    expect(infieldBlendAt(INFIELD.blendMs + 5000)).toBe(1);
    expect(infieldBlendAt(Number.NaN)).toBe(0);
    expect(infieldBlendAt(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("0〜1 で単調非減少、1ms の変化は小さい(連続)", () => {
    const values = Array.from({ length: 501 }, (_unused, i) => infieldBlendAt(i));
    for (const [i, value] of values.entries()) {
      const previous = values.at(i - 1) ?? 0;
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      if (i > 0) {
        expect(value - previous).toBeGreaterThanOrEqual(0);
        expect(value - previous).toBeLessThan(0.02);
      }
    }
  });
});

/** 走者が通りうる点: 各塁・各塁のリード位置・打者の立ち位置・本塁と、全ての進塁の経路(1/8 刻み)。 */
function runnerPoints(): readonly Vec3[] {
  const stands = ([0, 1, 2, 3, 4] as const satisfies readonly BaseTo[]).map((base) => runnerStandPosition(base));
  const bases = ([1, 2, 3, 4] as const).map((base) => baseWorldPosition(base));
  const moves = [
    {
      before: { first: false, second: false, third: false },
      after: { first: false, second: false, third: false },
      scored: 0,
      batterTo: 3 as const,
      advances: [],
    },
    {
      before: { first: true, second: true, third: true },
      after: { first: true, second: true, third: true },
      scored: 1,
      batterTo: 1 as const,
      advances: [
        { from: 1 as const, to: 2 as const },
        { from: 2 as const, to: 3 as const },
        { from: 3 as const, to: 4 as const },
      ],
    },
  ];
  const paths = moves.flatMap((entry) =>
    planRunners(entry, "triple").motions.flatMap((motion) =>
      motion === null ? [] : Array.from({ length: 9 }, (_unused, i) => runnerPositionAt(motion, (motion.durationMs * i) / 8)),
    ),
  );
  return [...stands, ...bases, ...paths];
}

describe("内野カメラの画角で、一塁・三塁の走者と進塁の経路が画面内に入る(縦長・横長)", () => {
  it.each(VIEWPORTS)("%d×%d: 走者の足元と頭の高さ(2.3m)の点が、画面の端から 8px 以上内側(横長は本塁付近を除く)", (width, height) => {
    const camera = infieldCameraFor(width / height);
    const nearHome = (point: Vec3): boolean => point.z > -10;
    const targets = width > height ? runnerPoints().filter((point) => !nearHome(point)) : runnerPoints();
    const failures = targets.flatMap((point) =>
      [0, 2.3].flatMap((y) => {
        const projected = projectPoint(camera, { width, height }, { ...point, y });
        const inside =
          projected.depth > 0 &&
          projected.x >= EDGE_MARGIN_PX &&
          projected.x <= width - EDGE_MARGIN_PX &&
          projected.y >= EDGE_MARGIN_PX &&
          projected.y <= height - EDGE_MARGIN_PX;
        return inside ? [] : [{ point, y, x: projected.x, screenY: projected.y }];
      }),
    );
    expect(failures).toEqual([]);
  });

  it("縦長の既定の画角(水平半幅 tan 0.25)では、一塁・三塁の走者は画面に入らない(内野カメラの画角が必要な理由)", () => {
    const aspect = 390 / 844;
    const narrow = { ...infieldCameraFor(aspect), fovDeg: 2 * Math.atan(0.25 / aspect) * (1 / DEG_TO_RAD) };
    const first = projectPoint(narrow, { width: 390, height: 844 }, runnerStandPosition(1));
    expect(first.x > 390 || first.x < 0).toBe(true);
  });
});
