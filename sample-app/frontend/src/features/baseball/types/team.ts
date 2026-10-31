import type { PitchKind } from "./pitch";

/** 髪型(6 種)。 */
export type HairStyle = "short" | "side" | "long" | "round" | "buzz" | "ponytail";

/** 髪色のパレット番号(5 色)。24bit RGB への変換は `model/character` が行う。 */
export type HairColor = 0 | 1 | 2 | 3 | 4;

/** 肌色のパレット番号(5 段階)。 */
export type SkinTone = 0 | 1 | 2 | 3 | 4;

/** 体格。胴・脚の幅が slim ×0.9・normal ×1.0・stocky ×1.15(頭の大きさは固定)。 */
export type BuildKind = "slim" | "normal" | "stocky";

/** 目の形(4 種)。round 丸・sharp つり目・droopy たれ目・big 大きな目。 */
export type EyeShape = "round" | "sharp" | "droopy" | "big";

/** 眉の形(3 種)。thin 細い・thick 太い・angled 傾き ±15°。 */
export type BrowShape = "thin" | "thick" | "angled";

/** 無表情(`neutral`)のときの口の形。 */
export type RestMouth = "flat" | "smile" | "small";

/** 投球フォーム(3 種)。over オーバー・three-quarter スリークォーター・side サイド。 */
export type PitchForm = "over" | "three-quarter" | "side";

/** 打撃の構え(3 種)。 */
export type BatStance = "open" | "square" | "crouch";

/**
 * 選手の見た目(表示専用。判定・乱数・バランスには影響しない)。
 * 20 人全員で (髪型, 髪色, 肌, 体格, 目の形) の組が異なり、背番号 `number` はチーム内で一意。
 */
export type PlayerLook = {
  /** 背番号(0〜99)。 */
  readonly number: number;
  readonly skin: SkinTone;
  readonly hair: { readonly style: HairStyle; readonly color: HairColor };
  readonly build: BuildKind;
  readonly eyes: EyeShape;
  readonly brow: BrowShape;
  readonly restMouth: RestMouth;
  /** 投手のみ意味を持つ(打者の `look` では既定の値を入れる)。 */
  readonly pitchForm: PitchForm;
  /** 打者のみ意味を持つ(投手の `look` では既定の値を入れる)。 */
  readonly batStance: BatStance;
};

/** 打者。meet / power は 1〜100、trajectory は弾道(1 低い〜4 高い)。`look` は表示専用。 */
export type BatterProfile = {
  readonly id: string;
  readonly name: string;
  readonly meet: number;
  readonly power: number;
  readonly trajectory: 1 | 2 | 3 | 4;
  readonly look: PlayerLook;
};

/** 投手。`repertoire` は `straight` を必ず含む。`look` は表示専用。 */
export type PitcherProfile = {
  readonly id: string;
  readonly name: string;
  readonly speedKmh: number;
  readonly control: number;
  readonly stamina: number;
  readonly repertoire: readonly PitchKind[];
  readonly look: PlayerLook;
};

/**
 * チーム。batters は 9 人。
 * `uniformColor`・`shortName`・`pinstripe` は描画・表示専用で、判定・乱数・バランスには影響しない。
 */
export type Team = {
  readonly id: string;
  readonly name: string;
  /** ユニフォームの色(24bit RGB。例: 青 `0x2f63c8`)。 */
  readonly uniformColor: number;
  /** HUD 用の略称(全角1〜3文字)。 */
  readonly shortName: string;
  /** ピンストライプのユニフォームか(胴に縞のテクスチャを貼る。近景のみ)。 */
  readonly pinstripe: boolean;
  readonly batters: readonly BatterProfile[];
  readonly pitcher: PitcherProfile;
};
