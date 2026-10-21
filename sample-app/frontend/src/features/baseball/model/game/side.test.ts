import { describe, expect, it } from "vitest";
import { bySide, defenseSide, offenseSide, opponent, tallyAdd, updateSide } from "./side";
import { FIXTURE_AWAY_TEAM, FIXTURE_HOME_TEAM } from "./test-fixtures";

describe("opponent", () => {
  it("returns the other side", () => {
    expect(opponent("away")).toBe("home");
    expect(opponent("home")).toBe("away");
  });
});

describe("offenseSide / defenseSide", () => {
  it("top: away bats and home fields", () => {
    expect(offenseSide("top")).toBe("away");
    expect(defenseSide("top")).toBe("home");
  });

  it("bottom: home bats and away fields", () => {
    expect(offenseSide("bottom")).toBe("home");
    expect(defenseSide("bottom")).toBe("away");
  });

  it("offense and defense are always opposite sides", () => {
    for (const half of ["top", "bottom"] as const) {
      expect(defenseSide(half)).toBe(opponent(offenseSide(half)));
    }
  });
});

describe("bySide", () => {
  it("returns the value for the given side", () => {
    const pair = { away: 3, home: 7 };
    expect(bySide(pair, "away")).toBe(3);
    expect(bySide(pair, "home")).toBe(7);
  });

  it("works with teams", () => {
    const teams = { away: FIXTURE_AWAY_TEAM, home: FIXTURE_HOME_TEAM };
    expect(bySide(teams, "away")).toBe(FIXTURE_AWAY_TEAM);
    expect(bySide(teams, "home")).toBe(FIXTURE_HOME_TEAM);
  });

  it("works with line scores (arrays)", () => {
    const lineScore = { away: [0, 2], home: [1] };
    expect(bySide(lineScore, "away")).toEqual([0, 2]);
    expect(bySide(lineScore, "home")).toEqual([1]);
  });
});

describe("updateSide", () => {
  it("changes only the given side and leaves the original untouched", () => {
    const original = { away: 1, home: 2 };
    const awayUpdated = updateSide(original, "away", (value) => value + 10);
    const homeUpdated = updateSide(original, "home", (value) => value + 10);
    expect(awayUpdated).toEqual({ away: 11, home: 2 });
    expect(homeUpdated).toEqual({ away: 1, home: 12 });
    expect(original).toEqual({ away: 1, home: 2 });
    expect(awayUpdated).not.toBe(original);
  });

  it("keeps the other side's value by reference", () => {
    const lineScore = { away: [0], home: [1] };
    const updated = updateSide(lineScore, "away", (cells) => [...cells, 4]);
    expect(updated.away).toEqual([0, 4]);
    expect(updated.home).toBe(lineScore.home);
    expect(lineScore.away).toEqual([0]);
  });

  it("works with teams", () => {
    const teams = { away: FIXTURE_AWAY_TEAM, home: FIXTURE_HOME_TEAM };
    const updated = updateSide(teams, "home", (team) => ({ ...team, name: "renamed" }));
    expect(updated.home.name).toBe("renamed");
    expect(updated.away).toBe(FIXTURE_AWAY_TEAM);
    expect(teams.home.name).toBe(FIXTURE_HOME_TEAM.name);
  });
});

describe("tallyAdd", () => {
  it("adds to the given side only", () => {
    const tally = { away: 2, home: 5 };
    expect(tallyAdd(tally, "away", 3)).toEqual({ away: 5, home: 5 });
    expect(tallyAdd(tally, "home", 1)).toEqual({ away: 2, home: 6 });
    expect(tally).toEqual({ away: 2, home: 5 });
  });
});
