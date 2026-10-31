import type { CharacterSlot } from "../../types/scene";
import type { HairColor, PlayerLook, SkinTone, Team } from "../../types/team";

// 画面の 14 体のキャラクター枠(`CharacterSlot`)へ、どの選手の `PlayerLook` を割り当てるか(character 分冊 §3-4-5)。表示専用で、判定・乱数には影響しない。
// 守備側: 投手 = `Team.pitcher`、捕手 = 打線 8 番目、一塁〜右翼 = 打線の 0〜6 番目から固定の対応表。攻撃側: 打者 = `lineupIndex` の打者。
// 走者は表示だけなので「走者 n 人目 = n 人前の打者」の簡易な対応にする(打者走者 = 打者本人)。

/** 画面に出す 14 体の枠(`SceneFrame` の並びと同じ。この添字が `expressionAt` のまばたきの位相を決める)。 */
export const CHARACTER_SLOTS: readonly CharacterSlot[] = [
  "pitcher",
  "catcher",
  "batter",
  "runner0",
  "runner1",
  "runner2",
  "runner3",
  "fielder0",
  "fielder1",
  "fielder2",
  "fielder3",
  "fielder4",
  "fielder5",
  "fielder6",
];

/** 野手 7 人(一塁・二塁・遊撃・三塁・左・中・右の順)に就く、守備側の打線の添字。 */
export const FIELDER_LINEUP_INDEX: readonly number[] = [0, 1, 2, 3, 4, 5, 6];

/** 捕手に就く、守備側の打線の添字(打線 8 番目)。 */
export const CATCHER_LINEUP_INDEX = 7;

/** 走者の枠 `runner0..3` が、打者(`lineupIndex`)から何人前の打者か。`runner0` = 打者走者 = 打者本人。 */
export const RUNNER_LINEUP_BACK: readonly number[] = [0, 1, 2, 3];

/** 肌色のパレット(24bit RGB。0 = 明るい … 4 = 濃い)。 */
export const SKIN_PALETTE: readonly number[] = [0xffe3cf, 0xf5c9a6, 0xe0a47a, 0xb97a50, 0x7e4c2f];

/** 髪色のパレット(24bit RGB。0 黒・1 濃い茶・2 栗色・3 金・4 赤茶)。 */
export const HAIR_PALETTE: readonly number[] = [0x1c1612, 0x4a2c1a, 0x8a5a2b, 0xc9a24a, 0x9a3b24];

/** 肌のパレット番号を 24bit RGB にする。 */
export function skinRgb(tone: SkinTone): number {
  return SKIN_PALETTE.at(tone) ?? SKIN_PALETTE.at(0) ?? 0;
}

/** 髪色のパレット番号を 24bit RGB にする。 */
export function hairRgb(color: HairColor): number {
  return HAIR_PALETTE.at(color) ?? HAIR_PALETTE.at(0) ?? 0;
}

/** 14 体の枠ごとの見た目。 */
export type LookAssignment = Readonly<Record<CharacterSlot, PlayerLook>>;

export type LookAssignmentInput = {
  /** 攻撃側のチーム(打者・走者)。 */
  readonly offense: Team;
  /** 守備側のチーム(投手・捕手・野手)。 */
  readonly defense: Team;
  /** 攻撃側の現在の打者番号(0〜8。範囲外は 9 で割った余りに丸める)。 */
  readonly lineupIndex: number;
};

/** 打線の `index` 番目の見た目。範囲外・負の値は 9 人で循環させる(打線の長さが 0 でなければ必ず見つかる)。 */
function lineupLook(team: Team, index: number): PlayerLook {
  const count = team.batters.length;
  const wrapped = Number.isFinite(index) ? ((Math.trunc(index) % count) + count) % count : 0;
  const batter = team.batters.at(wrapped) ?? team.batters.at(0);
  return batter === undefined ? team.pitcher.look : batter.look;
}

/** 野手 `fielderIndex`(一塁 = 0 … 右翼 = 6)の見た目。 */
export function fielderLook(defense: Team, fielderIndex: number): PlayerLook {
  const lineupIndex = FIELDER_LINEUP_INDEX.at(fielderIndex) ?? fielderIndex;
  return lineupLook(defense, lineupIndex);
}

/** 走者 `runnerIndex`(打者走者 = 0、一塁走者 = 1 …)の見た目。打者から `RUNNER_LINEUP_BACK` 人前の打者。 */
export function runnerLook(offense: Team, lineupIndex: number, runnerIndex: number): PlayerLook {
  return lineupLook(offense, lineupIndex - (RUNNER_LINEUP_BACK.at(runnerIndex) ?? runnerIndex));
}

/** 14 体の枠すべてに見た目を割り当てる(純関数。同じ入力なら同じ結果)。 */
export function assignLooks(input: LookAssignmentInput): LookAssignment {
  const { offense, defense, lineupIndex } = input;
  return {
    pitcher: defense.pitcher.look,
    catcher: lineupLook(defense, CATCHER_LINEUP_INDEX),
    batter: lineupLook(offense, lineupIndex),
    runner0: runnerLook(offense, lineupIndex, 0),
    runner1: runnerLook(offense, lineupIndex, 1),
    runner2: runnerLook(offense, lineupIndex, 2),
    runner3: runnerLook(offense, lineupIndex, 3),
    fielder0: fielderLook(defense, 0),
    fielder1: fielderLook(defense, 1),
    fielder2: fielderLook(defense, 2),
    fielder3: fielderLook(defense, 3),
    fielder4: fielderLook(defense, 4),
    fielder5: fielderLook(defense, 5),
    fielder6: fielderLook(defense, 6),
  };
}
