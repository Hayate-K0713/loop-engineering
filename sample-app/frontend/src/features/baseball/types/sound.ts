// 音・触覚の契約(model/sound が「いつ・どの音を」を決め、audio/ が Web Audio で合成して鳴らす)。
// types/ は実行時コードを持たない葉で、他セグメントを import しない。外部の音素材は使わない(すべて合成)。

/**
 * 効果音の種類(段階 A・B・C の分)。段階 M(M12)で `slide`・`crowd-swell`・`replay-start` が加わる(M0 が型に追加する)。
 */
export type SfxCue =
  | "pitch-release"
  | "mitt"
  | "swing-miss"
  | "hit-just"
  | "hit-normal"
  | "hit-weak"
  | "foul"
  | "grounder"
  | "homerun"
  | "cheer-small"
  | "cheer-big"
  | "strike"
  | "ball"
  | "out"
  | "strikeout"
  | "walk"
  | "ui-tap"
  | "ui-select"
  | "gauge-tick"
  | "nice-pitch"
  | "throw"
  | "catch";

/** 効果音の予定 1 件。`atMs` は基準時刻(投球のリリースなど、呼び出し側が決める)からの経過ゲーム時間、`gain` は 0〜1 の倍率(省略は 1)。 */
export type SfxEvent = {
  readonly cue: SfxCue;
  readonly atMs: number;
  readonly gain?: number;
};

/** 音源の波形。`noise` はホワイトノイズ(バッファは `audio/` が 1 回だけ作る)。 */
export type SfxWave = "sine" | "square" | "sawtooth" | "triangle" | "noise";

/**
 * 音の 1 層。周波数は `freqStart` から `freqEnd` へ指数的に動く(`noise` では無視してよい)。`startMs` はレシピの先頭からの遅れ。
 * 制約(テストで検証): 層の `startMs + durationMs` ≤ 2500ms、`gain` ≤ 1、周波数 20〜12000Hz。
 */
export type SfxLayer = {
  readonly wave: SfxWave;
  readonly freqStart: number;
  readonly freqEnd: number;
  readonly startMs: number;
  readonly durationMs: number;
  readonly attackMs: number;
  readonly gain: number;
  /** 任意のフィルタ(ノイズの整形用)。 */
  readonly filter?: { readonly type: "lowpass" | "highpass" | "bandpass"; readonly freq: number; readonly q: number };
};

/** 効果音のレシピ(層の重ね合わせ)。 */
export type SfxRecipe = {
  readonly layers: readonly SfxLayer[];
};

/** 全 `SfxCue` のレシピ表。 */
export type SfxRecipeTable = Readonly<Record<SfxCue, SfxRecipe>>;

/** 触覚(`navigator.vibrate`。Android のみ)の種類。パターン(ms)は `model/sound/haptics.ts` が決める。 */
export type HapticCue = "swing" | "just" | "hit" | "homerun" | "strikeout" | "nice-pitch";
