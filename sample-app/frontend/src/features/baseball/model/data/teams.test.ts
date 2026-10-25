import { describe, expect, it } from "vitest";
import type { Team } from "../../types/team";
import { CPU_TEAM, getTeam, PLAYER_TEAM } from "./teams";

const ALL_TEAMS: readonly Team[] = [PLAYER_TEAM, CPU_TEAM];
const KATAKANA_NAME = /^[ァ-ヶー]+$/u;
const MAX_RGB = 0xffffff;
const MAX_SHORT_NAME_LENGTH = 3;
/** 半角(ASCII・半角カナ)でない文字か。 */
const isFullWidthChar = (char: string): boolean => /[^\u0020-\u007e\uff61-\uff9f]/u.test(char);

const channelsOf = (color: number): { readonly r: number; readonly g: number; readonly b: number } => ({
  r: Math.floor(color / 0x10000) % 0x100,
  g: Math.floor(color / 0x100) % 0x100,
  b: color % 0x100,
});

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

describe("teams: uniform color and short name", () => {
  it("uniformColor は 0〜0xffffff の整数", () => {
    for (const team of ALL_TEAMS) {
      expect(Number.isInteger(team.uniformColor)).toBe(true);
      expect(team.uniformColor).toBeGreaterThanOrEqual(0);
      expect(team.uniformColor).toBeLessThanOrEqual(MAX_RGB);
    }
  });

  it("2チームの色は RGB 各成分の差の合計が 200 以上(見分けがつく)", () => {
    const a = channelsOf(PLAYER_TEAM.uniformColor);
    const b = channelsOf(CPU_TEAM.uniformColor);
    expect(Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b)).toBeGreaterThanOrEqual(200);
  });

  it("ルミナスは青系(B 成分が最大)、ノーブルズは赤系(R 成分が最大)", () => {
    const luminous = channelsOf(PLAYER_TEAM.uniformColor);
    const nobles = channelsOf(CPU_TEAM.uniformColor);
    expect(luminous.b).toBeGreaterThan(Math.max(luminous.r, luminous.g));
    expect(nobles.r).toBeGreaterThan(Math.max(nobles.g, nobles.b));
  });

  it("shortName は全角1〜3文字で、2チームで異なる", () => {
    for (const team of ALL_TEAMS) {
      const chars = [...team.shortName];
      expect(chars.length).toBeGreaterThanOrEqual(1);
      expect(chars.length).toBeLessThanOrEqual(MAX_SHORT_NAME_LENGTH);
      expect(chars.every(isFullWidthChar)).toBe(true);
    }
    expect(new Set(ALL_TEAMS.map((team) => team.shortName)).size).toBe(ALL_TEAMS.length);
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
