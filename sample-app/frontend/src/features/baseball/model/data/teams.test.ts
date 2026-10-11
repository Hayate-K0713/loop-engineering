import { describe, expect, it } from "vitest";
import type { Team } from "../../types/team";
import { CPU_TEAM, getTeam, PLAYER_TEAM } from "./teams";

const ALL_TEAMS: readonly Team[] = [PLAYER_TEAM, CPU_TEAM];
const KATAKANA_NAME = /^[ァ-ヶー]+$/u;

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

describe("teams", () => {
  it("2チームあり、名前は「ルミナス」「ノーブルズ」", () => {
    expect(ALL_TEAMS.map((team) => team.name)).toEqual(["ルミナス", "ノーブルズ"]);
  });

  it("各チームの打者は9人", () => {
    for (const team of ALL_TEAMS) {
      expect(team.batters).toHaveLength(9);
    }
  });

  it("チーム・打者・投手の id に重複がない", () => {
    const ids = ALL_TEAMS.flatMap((team) => [team.id, team.pitcher.id, ...team.batters.map((batter) => batter.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("打者の能力が範囲内(meet/power 1〜100、trajectory 1〜4)", () => {
    for (const team of ALL_TEAMS) {
      for (const batter of team.batters) {
        expect(batter.meet).toBeGreaterThanOrEqual(1);
        expect(batter.meet).toBeLessThanOrEqual(100);
        expect(batter.power).toBeGreaterThanOrEqual(1);
        expect(batter.power).toBeLessThanOrEqual(100);
        expect([1, 2, 3, 4]).toContain(batter.trajectory);
      }
    }
  });

  it("投手の能力が範囲内(球速 120〜160、control/stamina 1〜100)", () => {
    for (const team of ALL_TEAMS) {
      expect(team.pitcher.speedKmh).toBeGreaterThanOrEqual(120);
      expect(team.pitcher.speedKmh).toBeLessThanOrEqual(160);
      expect(team.pitcher.control).toBeGreaterThanOrEqual(1);
      expect(team.pitcher.control).toBeLessThanOrEqual(100);
      expect(team.pitcher.stamina).toBeGreaterThanOrEqual(1);
      expect(team.pitcher.stamina).toBeLessThanOrEqual(100);
    }
  });

  it("投手の持ち球に straight を含み、重複がない", () => {
    for (const team of ALL_TEAMS) {
      expect(team.pitcher.repertoire).toContain("straight");
      expect(new Set(team.pitcher.repertoire).size).toBe(team.pitcher.repertoire.length);
    }
  });

  it("2チームの meet・power の平均差が5以内", () => {
    const meetGap = Math.abs(average(PLAYER_TEAM.batters.map((batter) => batter.meet)) - average(CPU_TEAM.batters.map((batter) => batter.meet)));
    const powerGap = Math.abs(average(PLAYER_TEAM.batters.map((batter) => batter.power)) - average(CPU_TEAM.batters.map((batter) => batter.power)));
    expect(meetGap).toBeLessThanOrEqual(5);
    expect(powerGap).toBeLessThanOrEqual(5);
  });

  it("選手名・投手名は空でないカタカナ(名のみ)で、同一チーム内で重複しない", () => {
    for (const team of ALL_TEAMS) {
      const names = [team.pitcher.name, ...team.batters.map((batter) => batter.name)];
      for (const name of names) {
        expect(name).toMatch(KATAKANA_NAME);
      }
      expect(new Set(names).size).toBe(names.length);
    }
  });
});

describe("getTeam", () => {
  it("各チームの id で同じチームを返す", () => {
    expect(getTeam(PLAYER_TEAM.id)).toBe(PLAYER_TEAM);
    expect(getTeam(CPU_TEAM.id)).toBe(CPU_TEAM);
  });

  it("未知の id は Error", () => {
    expect(() => getTeam("unknown-team")).toThrow(Error);
    expect(() => getTeam("")).toThrow(Error);
  });
});
