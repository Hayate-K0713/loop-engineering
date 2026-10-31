import { describe, expect, it } from "vitest";
import type { PlayerLook } from "../../types/team";
import { CPU_TEAM, PLAYER_TEAM } from "../data/teams";
import { assignLooks, CHARACTER_SLOTS, fielderLook, HAIR_PALETTE, hairRgb, type LookAssignment, runnerLook, SKIN_PALETTE, skinRgb } from "./look";

const fieldersOf = (a: LookAssignment): readonly PlayerLook[] => [a.fielder0, a.fielder1, a.fielder2, a.fielder3, a.fielder4, a.fielder5, a.fielder6];

describe("CHARACTER_SLOTS", () => {
  it("14 体で重複がなく、投手・捕手・打者・走者 4・野手 7 を含む", () => {
    expect(CHARACTER_SLOTS).toHaveLength(14);
    expect(new Set(CHARACTER_SLOTS).size).toBe(14);
    expect(CHARACTER_SLOTS.slice(0, 3)).toEqual(["pitcher", "catcher", "batter"]);
  });
});

describe("assignLooks", () => {
  const input = { offense: PLAYER_TEAM, defense: CPU_TEAM, lineupIndex: 3 };
  const assigned = assignLooks(input);

  it("14 体すべての枠に look が割り当たる(欠けも undefined もない)", () => {
    expect(Object.keys(assigned).sort()).toEqual([...CHARACTER_SLOTS].sort());
    expect(Object.values(assigned).every((look) => look !== undefined && Number.isInteger(look.number))).toBe(true);
  });

  it("投手は守備側の投手、野手 7 人は守備側の打線の 0〜6 番目、捕手は 8 番目", () => {
    expect(assigned.pitcher).toBe(CPU_TEAM.pitcher.look);
    expect(assigned.catcher).toBe(CPU_TEAM.batters.at(7)?.look);
    expect(fieldersOf(assigned)).toEqual(CPU_TEAM.batters.slice(0, 7).map((batter) => batter.look));
  });

  it("打者と打者走者は攻撃側の lineupIndex の打者、走者は 1〜3 人前の打者", () => {
    expect(assigned.batter).toBe(PLAYER_TEAM.batters.at(3)?.look);
    expect(assigned.runner0).toBe(assigned.batter);
    expect(assigned.runner1).toBe(PLAYER_TEAM.batters.at(2)?.look);
    expect(assigned.runner2).toBe(PLAYER_TEAM.batters.at(1)?.look);
    expect(assigned.runner3).toBe(PLAYER_TEAM.batters.at(0)?.look);
  });

  it("打線の先頭では走者が末尾へ循環する", () => {
    const first = assignLooks({ ...input, lineupIndex: 0 });
    expect(first.runner1).toBe(PLAYER_TEAM.batters.at(8)?.look);
    expect(first.runner3).toBe(PLAYER_TEAM.batters.at(6)?.look);
  });

  it("どの打者番号(0〜8)でも、同時に出る 14 体の背番号は同じチーム内で重ならない", () => {
    const lineups = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const duplicates = lineups.map((lineupIndex) => {
      const result = assignLooks({ offense: CPU_TEAM, defense: PLAYER_TEAM, lineupIndex });
      const offenseNumbers = [result.batter, result.runner1, result.runner2, result.runner3].map((look) => look.number);
      const defenseNumbers = [result.pitcher, result.catcher, ...fieldersOf(result)].map((look) => look.number);
      return offenseNumbers.length - new Set(offenseNumbers).size + (defenseNumbers.length - new Set(defenseNumbers).size);
    });
    expect(duplicates).toEqual(lineups.map(() => 0));
  });

  it("範囲外・負・非有限の lineupIndex でも割り当たる(9 人で循環)", () => {
    expect(assignLooks({ ...input, lineupIndex: 12 }).batter).toBe(PLAYER_TEAM.batters.at(3)?.look);
    expect(assignLooks({ ...input, lineupIndex: -1 }).batter).toBe(PLAYER_TEAM.batters.at(8)?.look);
    expect(assignLooks({ ...input, lineupIndex: Number.NaN }).batter).toBe(PLAYER_TEAM.batters.at(0)?.look);
  });

  it("決定論(同じ入力で同じ結果)", () => {
    expect(assignLooks(input)).toEqual(assigned);
  });

  it("fielderLook・runnerLook は assignLooks と一致する", () => {
    expect(fielderLook(CPU_TEAM, 4)).toBe(assigned.fielder4);
    expect(runnerLook(PLAYER_TEAM, 3, 2)).toBe(assigned.runner2);
  });
});

describe("パレット", () => {
  it("肌 5 段階・髪 5 色が 24bit RGB で互いに異なる", () => {
    expect(SKIN_PALETTE).toHaveLength(5);
    expect(HAIR_PALETTE).toHaveLength(5);
    expect(new Set(SKIN_PALETTE).size).toBe(5);
    expect(new Set(HAIR_PALETTE).size).toBe(5);
    expect([...SKIN_PALETTE, ...HAIR_PALETTE].every((rgb) => Number.isInteger(rgb) && rgb >= 0 && rgb <= 0xffffff)).toBe(true);
  });

  it("skinRgb・hairRgb がパレットを引く", () => {
    expect([0, 1, 2, 3, 4].map((tone) => skinRgb(tone as 0 | 1 | 2 | 3 | 4))).toEqual([...SKIN_PALETTE]);
    expect([0, 1, 2, 3, 4].map((color) => hairRgb(color as 0 | 1 | 2 | 3 | 4))).toEqual([...HAIR_PALETTE]);
  });
});
