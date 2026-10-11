import type { Innings, LaunchParams, PlaybackSpeed } from "../../types/game";

const SEED_PATTERN = /^\d{1,10}$/;
const SEED_MAX = 4_294_967_295;
const INNINGS_OPTIONS: readonly Innings[] = [1, 3, 5, 9];

const NORMAL_SPEED: PlaybackSpeed = { timeScale: 1, cpuWaitMs: 700 };
const FAST_SPEED: PlaybackSpeed = { timeScale: 8, cpuWaitMs: 20 };

function parseSeed(raw: string | null): number | null {
  if (raw === null || !SEED_PATTERN.test(raw)) {
    return null;
  }
  const value = Number(raw);
  return value <= SEED_MAX ? value : null;
}

function parseInnings(raw: string | null): Innings | null {
  return INNINGS_OPTIONS.find((innings) => String(innings) === raw) ?? null;
}

/**
 * 起動パラメータ(`?seed=<uint32>&innings=<1|3|5|9>&fast=1`)を検証して解釈する純粋関数。
 * 不正値は無視して既定値(`null` / `false`)にする。先頭の `?` の有無どちらも可、重複キーは最初の値。
 * 開発ビルド限定の判定(開発ビルドかどうかの環境フラグ)は呼び出し側(hooks)で行い、本番では空文字列を渡す。
 */
export function parseLaunchParams(search: string): LaunchParams {
  const params = new URLSearchParams(search);
  return {
    seed: parseSeed(params.get("seed")),
    innings: parseInnings(params.get("innings")),
    fast: params.get("fast") === "1",
  };
}

/** 再生速度。`fast` は壁時計の再生だけを速め、モデルの数値(球速・窓)は変えない。 */
export function getPlaybackSpeed(fast: boolean): PlaybackSpeed {
  return fast ? FAST_SPEED : NORMAL_SPEED;
}
