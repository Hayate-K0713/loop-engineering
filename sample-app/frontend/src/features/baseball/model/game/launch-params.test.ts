import { describe, expect, it } from "vitest";
import type { LaunchParams } from "../../types/game";
import { getPlaybackSpeed, parseLaunchParams } from "./launch-params";

const DEFAULTS: LaunchParams = { seed: null, innings: null, fast: false };

describe("parseLaunchParams", () => {
  it("parses a full valid query string", () => {
    expect(parseLaunchParams("?seed=42&innings=1&fast=1")).toEqual({ seed: 42, innings: 1, fast: true });
  });

  it("accepts the query with or without the leading '?'", () => {
    expect(parseLaunchParams("seed=42&innings=5&fast=1")).toEqual({ seed: 42, innings: 5, fast: true });
    expect(parseLaunchParams("?seed=42&innings=5&fast=1")).toEqual(parseLaunchParams("seed=42&innings=5&fast=1"));
  });

  it("returns all defaults for an empty string (what hooks pass in production builds)", () => {
    expect(parseLaunchParams("")).toEqual(DEFAULTS);
    expect(parseLaunchParams("?")).toEqual(DEFAULTS);
  });

  it("ignores unknown keys", () => {
    expect(parseLaunchParams("?foo=bar&seed=7")).toEqual({ seed: 7, innings: null, fast: false });
  });

  describe("seed", () => {
    it("accepts the whole uint32 range, including both ends", () => {
      expect(parseLaunchParams("seed=0").seed).toBe(0);
      expect(parseLaunchParams("seed=1").seed).toBe(1);
      expect(parseLaunchParams("seed=4294967295").seed).toBe(4294967295);
    });

    it.each([["-1"], ["1.5"], ["abc"], ["4294967296"], ["99999999999"], [""], ["0x10"], ["1e3"], [" 42"], ["42 "], ["+5"]])("treats %j as invalid", (raw) => {
      expect(parseLaunchParams(`seed=${encodeURIComponent(raw)}`).seed).toBeNull();
    });
  });

  describe("innings", () => {
    it.each([[1], [3], [5], [9]])("accepts %i", (value) => {
      expect(parseLaunchParams(`innings=${value}`).innings).toBe(value);
    });

    it.each([["2"], ["0"], ["4"], ["10"], ["abc"], [""], ["-3"], ["3.0"], ["03"]])("treats %j as invalid", (raw) => {
      expect(parseLaunchParams(`innings=${raw}`).innings).toBeNull();
    });
  });

  describe("fast", () => {
    it("is true only for the exact value '1'", () => {
      expect(parseLaunchParams("fast=1").fast).toBe(true);
    });

    it.each([["0"], ["true"], ["yes"], ["2"], [""], ["01"]])("is false for %j", (raw) => {
      expect(parseLaunchParams(`fast=${raw}`).fast).toBe(false);
    });

    it("is false when the key is absent", () => {
      expect(parseLaunchParams("seed=1").fast).toBe(false);
    });
  });

  it("uses the first value of a duplicated key", () => {
    expect(parseLaunchParams("seed=1&seed=2&innings=3&innings=9&fast=1&fast=0")).toEqual({ seed: 1, innings: 3, fast: true });
    expect(parseLaunchParams("seed=abc&seed=2").seed).toBeNull();
  });

  it("validates each parameter independently", () => {
    expect(parseLaunchParams("seed=-5&innings=9&fast=yes")).toEqual({ seed: null, innings: 9, fast: false });
  });
});

describe("getPlaybackSpeed", () => {
  it("returns the real-time speed when not fast", () => {
    expect(getPlaybackSpeed(false)).toEqual({ timeScale: 1, cpuWaitMs: 550, humanWindupMs: 280 });
  });

  it("returns the accelerated speed when fast", () => {
    expect(getPlaybackSpeed(true)).toEqual({ timeScale: 8, cpuWaitMs: 20, humanWindupMs: 20 });
  });

  it("fast shortens the playback, the CPU wait and the human windup", () => {
    const normal = getPlaybackSpeed(false);
    const fast = getPlaybackSpeed(true);
    expect(fast.timeScale).toBeGreaterThan(normal.timeScale);
    expect(fast.cpuWaitMs).toBeLessThan(normal.cpuWaitMs);
    expect(fast.humanWindupMs).toBeLessThan(normal.humanWindupMs);
  });
});
