import type { PitchKind } from "./pitch";

/** 打者。meet / power は 1〜100、trajectory は弾道(1 低い〜4 高い)。 */
export type BatterProfile = {
  readonly id: string;
  readonly name: string;
  readonly meet: number;
  readonly power: number;
  readonly trajectory: 1 | 2 | 3 | 4;
};

/** 投手。`repertoire` は `straight` を必ず含む。 */
export type PitcherProfile = {
  readonly id: string;
  readonly name: string;
  readonly speedKmh: number;
  readonly control: number;
  readonly stamina: number;
  readonly repertoire: readonly PitchKind[];
};

/** チーム。batters は 9 人。 */
export type Team = {
  readonly id: string;
  readonly name: string;
  readonly batters: readonly BatterProfile[];
  readonly pitcher: PitcherProfile;
};
