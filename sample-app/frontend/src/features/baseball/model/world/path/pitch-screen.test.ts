import { describe, expect, it } from "vitest";
import type { ZonePoint } from "../../../types/common";
import type { PitchFlight, PitchKind } from "../../../types/pitch";
import type { CameraPose, Vec3 } from "../../../types/scene";
import { getPitchSpec } from "../../pitch/kinds";
import { PITCH_PARAMS } from "../../pitch/params";
import { projectPoint, zoneRectOf } from "../camera/project";
import { battingCameraFor } from "../camera/rig";
import { zoneToWorld } from "../space/coords";
import { WORLD_PARAMS } from "../space/params";
import { pitchBallAt } from "./pitch-path";

// 投球の軌道を、スマホ縦(390×844)の打撃レイアウトで画面に投影して見え方を数値で守るテスト。
// 診断(`feel-diagnosis`)の投影スクリプトの再現で、`pitchBallAt` と `camera/project.ts` だけで計算する。
// 守るもの: 曲がりの向き(画面上でも右投手どおり)と S300(最後の 300ms に動く距離の割合。着弾点 6 つの平均で判定し、最悪点は余裕つきで守る)。
// 参考値として出力するだけのもの: M1(弦からの最大ずれ)・M2(同じ着弾のストレートとの同時刻の最大差)。
//   `bendGain` を 1.0(誇張なし)に決めたため、M1・M2 は設計 §15 の目標(スライダー・シュート ≥ 12px など)に届かないことを承知している(ゲート1の決定)。
// 画面上の座標は CSS px。球速は CPU 投手の標準(145km/h)に球種ごとの `speedOffsetKmh` を足したもの。

const VIEW = { width: 390, height: 844 } as const;
const POSE: CameraPose = battingCameraFor(VIEW.width / VIEW.height, "batting", null);
const PITCHER_SPEED_KMH = 145;
const STEP_MS = 5;
const LAST_MS = 300;
/** S300 の最悪の着弾点に許す余裕(割合の絶対差)。判定は 6 点の平均で行う(設計「見た目の比較」R5)。 */
/** フォークの画面上の横ずれの許容(px)。世界の x は同じだが、縦の違いで奥行きが変わるため画面の x がわずかに動く。 */
const FORK_SIDE_TOLERANCE_PX = 0.5;
const WORST_POINT_MARGIN = 0.03;

const KINDS: readonly PitchKind[] = ["straight", "slider", "curve", "fork", "shoot"];
const BENDING_KINDS: readonly PitchKind[] = ["slider", "curve", "fork", "shoot"];

/** 着弾点 6 つ: ゾーン中央・四隅・外角低め(右打者の外側 = +x、ゾーンの下のボール球)。 */
const LANDINGS: readonly { readonly name: string; readonly point: ZonePoint }[] = [
  { name: "中央", point: { x: 0, y: 0 } },
  { name: "左上", point: { x: -1, y: 1 } },
  { name: "右上", point: { x: 1, y: 1 } },
  { name: "左下", point: { x: -1, y: -1 } },
  { name: "右下", point: { x: 1, y: -1 } },
  { name: "外角低め", point: { x: 1.2, y: -1.4 } },
];

type Screen = { readonly x: number; readonly y: number };

function flightOf(kind: PitchKind, landing: ZonePoint): PitchFlight {
  const speedKmh = PITCHER_SPEED_KMH + getPitchSpec(kind).speedOffsetKmh;
  return { seq: 1, kind, aim: landing, landing, speedKmh, durationMs: Math.round(PITCH_PARAMS.flightMsKmh / speedKmh) };
}

function screenOf(point: Vec3): Screen {
  const { x, y } = projectPoint(POSE, VIEW, point);
  return { x, y };
}

/** 経過 `elapsedMs` のボール中心の画面座標。 */
function ballScreenAt(flight: PitchFlight, elapsedMs: number): Screen {
  return screenOf(pitchBallAt(flight, elapsedMs));
}

/** 0 〜 D を `STEP_MS` 刻みで(D を含めて)並べた時刻。 */
function timesOf(flight: PitchFlight): readonly number[] {
  const count = Math.ceil(flight.durationMs / STEP_MS);
  return [...Array.from({ length: count }, (_, i) => i * STEP_MS), flight.durationMs];
}

function distance(a: Screen, b: Screen): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 点 `p` から、`a`→`b` の直線までの距離。 */
function distanceToLine(p: Screen, a: Screen, b: Screen): number {
  const length = distance(a, b);
  return length === 0 ? distance(p, a) : Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / length;
}

/** 折れ線の長さのうち、時刻 `fromMs` 以降の分。 */
function pathLength(flight: PitchFlight, fromMs: number): number {
  const times = timesOf(flight).filter((t) => t >= fromMs - 1e-9);
  const points = times.map((t) => ballScreenAt(flight, t));
  return points.reduce((sum, point, i) => (i === 0 ? sum : sum + distance(point, points.at(i - 1) ?? point)), 0);
}

/** M1: 弦(リリース点→着弾点の画面上の直線)からの最大ずれ。 */
function metricM1(flight: PitchFlight): number {
  const start = ballScreenAt(flight, 0);
  const end = ballScreenAt(flight, flight.durationMs);
  return Math.max(...timesOf(flight).map((t) => distanceToLine(ballScreenAt(flight, t), start, end)));
}

/** M2: 同じ着弾のストレートとの、同時刻のボール中心の画面上の最大差。 */
function metricM2(flight: PitchFlight): number {
  const reference = { ...flight, kind: "straight" as const };
  return Math.max(...timesOf(flight).map((t) => distance(ballScreenAt(flight, t), ballScreenAt(reference, t))));
}

/** S300: 最後の 300ms に動く画面上の距離 ÷ 全体の距離。 */
function metricS300(flight: PitchFlight): number {
  return pathLength(flight, flight.durationMs - LAST_MS) / pathLength(flight, 0);
}

/** 弦からのずれの向き: 着弾の 100ms 前から着弾までに、同時刻のストレートとの画面上の差がどちらへ動くか。 */
function lateScreenShift(flight: PitchFlight): Screen {
  const reference = { ...flight, kind: "straight" as const };
  const differenceAt = (t: number): Screen => {
    const a = ballScreenAt(flight, t);
    const b = ballScreenAt(reference, t);
    return { x: a.x - b.x, y: a.y - b.y };
  };
  const before = differenceAt(flight.durationMs * 0.9);
  const after = differenceAt(flight.durationMs);
  return { x: after.x - before.x, y: after.y - before.y };
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function fixed(value: number, digits = 1): string {
  return value.toFixed(digits);
}

describe("投球の画面上の軌道(390×844・打撃レイアウト・bendGain 込み)", () => {
  it("前提: bendGain は 1.0(誇張なし。ゲート1の決定)で、打撃カメラのゾーン枠が設計値付近(幅 ≥ 140・高さ ≥ 155)", () => {
    expect(WORLD_PARAMS.pitch.bendGain).toBe(1);
    const rect = zoneRectOf(POSE, VIEW, WORLD_PARAMS.zone);
    expect(rect.width).toBeGreaterThanOrEqual(140);
    expect(rect.height).toBeGreaterThanOrEqual(155);
  });

  it("M1・M2・S300 の実測を表で出力する(M1・M2 は参考値で、合否に使わない)", () => {
    const lines = [
      "| 球種 | M1 平均 | M1 最悪 | M2 平均 | M2 最悪 | S300 平均 | S300 最悪 | 軌跡の長さ |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ];
    for (const kind of KINDS) {
      const flights = LANDINGS.map((landing) => flightOf(kind, landing.point));
      const m1 = flights.map(metricM1);
      const m2 = flights.map(metricM2);
      const s300 = flights.map(metricS300);
      const length = flights.map((flight) => pathLength(flight, 0));
      lines.push(
        `| ${kind} | ${fixed(mean(m1))} | ${fixed(Math.min(...m1))}〜${fixed(Math.max(...m1))} | ${fixed(mean(m2))} | ${fixed(Math.min(...m2))}〜${fixed(Math.max(...m2))} | ${fixed(mean(s300) * 100, 0)}% | ${fixed(Math.min(...s300) * 100, 0)}〜${fixed(Math.max(...s300) * 100, 0)}% | ${fixed(mean(length), 0)}px |`,
      );
    }
    console.info(`pitch-screen (px、着弾 6 点: ${LANDINGS.map((landing) => landing.name).join("・")})\n${lines.join("\n")}`);
    expect(lines).toHaveLength(2 + KINDS.length);
  });

  it("M1・M2 は有限で、ストレートの弦からのずれは放物線の持ち上げ分だけ(曲がる球種は弦からずれる)", () => {
    for (const landing of LANDINGS) {
      const straight = flightOf("straight", landing.point);
      expect(Number.isFinite(metricM1(straight))).toBe(true);
      expect(metricM2(straight)).toBe(0);
      for (const kind of BENDING_KINDS) {
        const flight = flightOf(kind, landing.point);
        expect(Number.isFinite(metricM2(flight))).toBe(true);
        expect(metricM2(flight)).toBeGreaterThan(0);
      }
    }
  });

  describe("曲がりの向きが画面上でも右投手どおり(全着弾点)", () => {
    it.each(["slider", "curve"] as const)("%s は終盤に画面右(グラブ側)へ曲がる", (kind) => {
      for (const landing of LANDINGS) {
        expect(lateScreenShift(flightOf(kind, landing.point)).x).toBeGreaterThan(0);
      }
    });

    it("シュートは終盤に画面左(腕側)へ曲がる", () => {
      for (const landing of LANDINGS) {
        expect(lateScreenShift(flightOf("shoot", landing.point)).x).toBeLessThan(0);
      }
    });

    it.each(["curve", "fork"] as const)("%s は終盤に画面の下へ落ちる", (kind) => {
      for (const landing of LANDINGS) {
        expect(lateScreenShift(flightOf(kind, landing.point)).y).toBeGreaterThan(0);
      }
    });

    it("フォークは横に曲がらず、ストレートは同時刻のストレートと一致する", () => {
      for (const landing of LANDINGS) {
        expect(Math.abs(lateScreenShift(flightOf("fork", landing.point)).x)).toBeLessThan(FORK_SIDE_TOLERANCE_PX);
        expect(lateScreenShift(flightOf("straight", landing.point))).toEqual({ x: 0, y: 0 });
      }
    });
  });

  describe("S300: 最後の 300ms に動く画面上の距離の割合(設計 §15 #20。着弾点 6 つの平均で判定、最悪点は +3 ポイントまで)", () => {
    const limits: readonly { readonly kind: PitchKind; readonly limit: number }[] = [
      { kind: "straight", limit: 0.62 },
      { kind: "slider", limit: 0.62 },
      { kind: "shoot", limit: 0.62 },
      { kind: "curve", limit: 0.62 },
      { kind: "fork", limit: 0.68 },
    ];

    it.each(limits)("$kind は平均 $limit 以下(最悪点は +0.03 以下)", ({ kind, limit }) => {
      const values = LANDINGS.map((landing) => metricS300(flightOf(kind, landing.point)));
      expect(mean(values)).toBeLessThanOrEqual(limit);
      expect(Math.max(...values)).toBeLessThanOrEqual(limit + WORST_POINT_MARGIN);
    });
  });

  it("画面上の軌跡の長さ ≥ 250px(設計 §15 #5。診断と同じ着弾 = ゾーン中央。全球種)", () => {
    for (const kind of KINDS) {
      expect(pathLength(flightOf(kind, { x: 0, y: 0 }), 0), kind).toBeGreaterThanOrEqual(250);
    }
  });

  it("着弾点のボール中心が zoneToWorld の投影に一致する(投影と軌道の端点の整合)", () => {
    for (const landing of LANDINGS) {
      const flight = flightOf("curve", landing.point);
      const expected = screenOf(zoneToWorld(landing.point));
      const actual = ballScreenAt(flight, flight.durationMs);
      expect(actual.x).toBeCloseTo(expected.x, 9);
      expect(actual.y).toBeCloseTo(expected.y, 9);
    }
  });
});
