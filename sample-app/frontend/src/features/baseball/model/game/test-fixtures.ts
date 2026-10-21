// テスト専用のフィクスチャ。本番コードからは import しない。
// state.ts(createInitialState)や data/teams.ts に依存せず、game のルール部分のテストが使う最小の Team と GameState を直書きする。
import type { Bases, GameState } from "../../types/game";
import type { BatterProfile, Team } from "../../types/team";

const LINEUP_SIZE = 9;

function makeBatter(teamId: string, index: number): BatterProfile {
  return { id: `${teamId}-b${index + 1}`, name: `${teamId}-打者${index + 1}`, meet: 50, power: 50, trajectory: 2 };
}

/** 能力が全員同じ最小のチーム(打者9人、持ち球はストレートのみ)。`look` はユニフォームの色と略称(描画・表示専用)。 */
export function makeTeam(id: string, name: string, look: Pick<Team, "uniformColor" | "shortName">): Team {
  return {
    id,
    name,
    uniformColor: look.uniformColor,
    shortName: look.shortName,
    batters: Array.from({ length: LINEUP_SIZE }, (_, index) => makeBatter(id, index)),
    pitcher: { id: `${id}-p`, name: `${name}-投手`, speedKmh: 140, control: 50, stamina: 100, repertoire: ["straight"] },
  };
}

export const FIXTURE_AWAY_TEAM: Team = makeTeam("fx-away", "テスト先攻", { uniformColor: 0x3a5fa8, shortName: "先攻" });
export const FIXTURE_HOME_TEAM: Team = makeTeam("fx-home", "テスト後攻", { uniformColor: 0xb8613a, shortName: "後攻" });

/**
 * 1回表・無死・0-0・走者なし・得点なしの `GameState`(3回制、人間は先攻)。`overrides` で一部を差し替える。
 * 入力の不変性を検証しやすいよう、毎回新しいオブジェクトを返す。
 */
export function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    config: { innings: 3, humanSide: "away", difficulty: "normal" },
    teams: { away: FIXTURE_AWAY_TEAM, home: FIXTURE_HOME_TEAM },
    rng: 12345,
    inning: 1,
    half: "top",
    outs: 0,
    count: { balls: 0, strikes: 0 },
    bases: { first: false, second: false, third: false },
    lineScore: { away: [0], home: [] },
    hits: { away: 0, home: 0 },
    errors: { away: 0, home: 0 },
    lineupIndex: { away: 0, home: 0 },
    pitchCounts: { away: 0, home: 0 },
    pitchSeq: 0,
    lastPitchKind: null,
    lastResult: null,
    lastPlate: null,
    lastInPlay: null,
    phase: { kind: "await-pitch" },
    log: [],
    ...overrides,
  };
}

/** 塁状況の簡易表記から `Bases` を作る。例: `"1-3"` は1塁・3塁、`"---"` は走者なし、`"123"` は満塁。 */
export function parseBases(notation: string): Bases {
  return { first: notation.charAt(0) === "1", second: notation.charAt(1) === "2", third: notation.charAt(2) === "3" };
}

/** `parseBases` の逆変換。 */
export function formatBases(bases: Bases): string {
  return `${bases.first ? "1" : "-"}${bases.second ? "2" : "-"}${bases.third ? "3" : "-"}`;
}
