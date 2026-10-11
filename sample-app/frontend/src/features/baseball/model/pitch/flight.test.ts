import { describe, expect, it } from "vitest";
import type { PitchFlight, PitchKind } from "../../types/pitch";
import { ballPositionAt } from "./flight";
import { getPitchSpec } from "./kinds";
import { PITCH_PARAMS } from "./params";

const DURATION_MS = 1400;
const LANDING = { x: 0.5, y: -0.3 };
const ALL_KINDS: readonly PitchKind[] = ["straight", "slider", "curve", "fork", "shoot"];

function flightOf(kind: PitchKind): PitchFlight {
  return { seq: 1, kind, aim: { x: 0.5, y: -0.3 }, landing: LANDING, speedKmh: 140, durationMs: DURATION_MS };
}

describe("ballPositionAt", () => {
  it("elapsed=0 で straight は開始点・小さい scale", () => {
    const position = ballPositionAt(flightOf("straight"), 0);
    expect(position.x).toBeCloseTo(PITCH_PARAMS.startPoint.x, 12);
    expect(position.y).toBeCloseTo(PITCH_PARAMS.startPoint.y, 12);
    expect(position.scale).toBeCloseTo(PITCH_PARAMS.startScale, 12);
    expect(position.scale).toBeLessThan(1);
  });

  it("elapsed=0 で曲がる球種は開始点に bend を加えた位置から始まる", () => {
    const position = ballPositionAt(flightOf("curve"), 0);
    expect(position.x).toBeCloseTo(PITCH_PARAMS.startPoint.x + getPitchSpec("curve").bend.x, 12);
    expect(position.y).toBeCloseTo(PITCH_PARAMS.startPoint.y + getPitchSpec("curve").bend.y, 12);
    expect(position.scale).toBeCloseTo(PITCH_PARAMS.startScale, 12);
  });

  it.each(ALL_KINDS)("%s は elapsed ≥ duration で landing に厳密一致し scale は 1", (kind) => {
    const flight = flightOf(kind);
    expect(ballPositionAt(flight, DURATION_MS)).toEqual({ x: LANDING.x, y: LANDING.y, scale: 1 });
    expect(ballPositionAt(flight, DURATION_MS * 3)).toEqual({ x: LANDING.x, y: LANDING.y, scale: 1 });
  });

  it("範囲外の経過時間はクランプされる(負は elapsed=0 と同じ)", () => {
    const flight = flightOf("slider");
    expect(ballPositionAt(flight, -500)).toEqual(ballPositionAt(flight, 0));
    expect(ballPositionAt(flight, 99999)).toEqual(ballPositionAt(flight, DURATION_MS));
  });

  it("straight は直線で、中間点が開始点と着弾点の補間点になる", () => {
    const flight = flightOf("straight");
    const start = PITCH_PARAMS.startPoint;
    const middle = ballPositionAt(flight, DURATION_MS / 2);
    expect(middle.x).toBeCloseTo((start.x + LANDING.x) / 2, 12);
    expect(middle.y).toBeCloseTo((start.y + LANDING.y) / 2, 12);
    expect(middle.scale).toBeCloseTo((PITCH_PARAMS.startScale + 1) / 2, 12);
  });

  it("straight は進行度 0.25 でも直線上にある", () => {
    const start = PITCH_PARAMS.startPoint;
    const position = ballPositionAt(flightOf("straight"), DURATION_MS * 0.25);
    expect(position.x).toBeCloseTo(start.x + (LANDING.x - start.x) * 0.25, 12);
    expect(position.y).toBeCloseTo(start.y + (LANDING.y - start.y) * 0.25, 12);
  });

  it.each(ALL_KINDS.filter((kind) => kind !== "straight"))("%s は中間で直線から bend × 0.25 だけ外れ、終点では一致する", (kind) => {
    const start = PITCH_PARAMS.startPoint;
    const { bend } = getPitchSpec(kind);
    const middle = ballPositionAt(flightOf(kind), DURATION_MS / 2);
    const straightX = (start.x + LANDING.x) / 2;
    const straightY = (start.y + LANDING.y) / 2;
    expect(middle.x - straightX).toBeCloseTo(bend.x * 0.25, 12);
    expect(middle.y - straightY).toBeCloseTo(bend.y * 0.25, 12);
    expect(Math.abs(middle.x - straightX) + Math.abs(middle.y - straightY)).toBeGreaterThan(0);
    expect(ballPositionAt(flightOf(kind), DURATION_MS)).toEqual({ x: LANDING.x, y: LANDING.y, scale: 1 });
  });

  it("scale は進行に従って単調に 1 へ近づく", () => {
    const flight = flightOf("fork");
    const scales = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ballPositionAt(flight, DURATION_MS * ratio).scale);
    expect(scales).toEqual([...scales].sort((a, b) => a - b));
    expect(scales.at(-1)).toBe(1);
  });

  it("durationMs が 0 以下でも着弾点を返す(ゼロ除算しない)", () => {
    const flight: PitchFlight = { ...flightOf("straight"), durationMs: 0 };
    expect(ballPositionAt(flight, 0)).toEqual({ x: LANDING.x, y: LANDING.y, scale: 1 });
  });
});
