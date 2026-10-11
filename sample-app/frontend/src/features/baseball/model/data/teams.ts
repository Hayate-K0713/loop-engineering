import type { Team } from "../../types/team";

// 固定プリセットの架空2チーム。チーム名・選手名はすべて架空(実在の球団・選手とは無関係)で、選手は名のみ。
// 能力値は仮値。2チームの打者能力(meet・power の平均)と投手能力が同程度になるよう揃えてあり、
// 先攻/後攻・チームによる有利不利を作らない(バランス調整は数値のみで行う)。

/** ユーザー側チーム「ルミナス」。 */
export const PLAYER_TEAM: Team = {
  id: "luminous",
  name: "ルミナス",
  batters: [
    { id: "luminous-b1", name: "カイト", meet: 66, power: 40, trajectory: 1 },
    { id: "luminous-b2", name: "ミナト", meet: 64, power: 46, trajectory: 2 },
    { id: "luminous-b3", name: "レオン", meet: 62, power: 64, trajectory: 3 },
    { id: "luminous-b4", name: "ガイ", meet: 56, power: 74, trajectory: 4 },
    { id: "luminous-b5", name: "トウマ", meet: 58, power: 62, trajectory: 3 },
    { id: "luminous-b6", name: "ヒビキ", meet: 52, power: 52, trajectory: 2 },
    { id: "luminous-b7", name: "シオン", meet: 50, power: 44, trajectory: 2 },
    { id: "luminous-b8", name: "ナギ", meet: 47, power: 38, trajectory: 1 },
    { id: "luminous-b9", name: "ゲン", meet: 45, power: 36, trajectory: 1 },
  ],
  pitcher: {
    id: "luminous-p1",
    name: "イブキ",
    speedKmh: 143,
    control: 63,
    stamina: 66,
    repertoire: ["straight", "slider", "curve", "fork"],
  },
};

/** CPU側チーム「ノーブルズ」。 */
export const CPU_TEAM: Team = {
  id: "nobles",
  name: "ノーブルズ",
  batters: [
    { id: "nobles-b1", name: "ソラト", meet: 68, power: 42, trajectory: 1 },
    { id: "nobles-b2", name: "ユーマ", meet: 60, power: 52, trajectory: 2 },
    { id: "nobles-b3", name: "ハヤテ", meet: 66, power: 58, trajectory: 2 },
    { id: "nobles-b4", name: "イサム", meet: 54, power: 72, trajectory: 4 },
    { id: "nobles-b5", name: "ダイゴ", meet: 56, power: 68, trajectory: 3 },
    { id: "nobles-b6", name: "ルイ", meet: 55, power: 48, trajectory: 2 },
    { id: "nobles-b7", name: "リク", meet: 50, power: 44, trajectory: 2 },
    { id: "nobles-b8", name: "カナタ", meet: 48, power: 40, trajectory: 1 },
    { id: "nobles-b9", name: "ロク", meet: 46, power: 36, trajectory: 1 },
  ],
  pitcher: {
    id: "nobles-p1",
    name: "ダン",
    speedKmh: 145,
    control: 64,
    stamina: 68,
    repertoire: ["straight", "slider", "shoot"],
  },
};

const TEAMS: ReadonlyMap<string, Team> = new Map<string, Team>([
  [PLAYER_TEAM.id, PLAYER_TEAM],
  [CPU_TEAM.id, CPU_TEAM],
]);

/** id からプリセットチームを引く。未知の id はプログラミングエラーとして `Error` を投げる。 */
export function getTeam(id: string): Team {
  const team = TEAMS.get(id);
  if (team === undefined) {
    throw new Error(`Unknown team id: ${id}`);
  }
  return team;
}
