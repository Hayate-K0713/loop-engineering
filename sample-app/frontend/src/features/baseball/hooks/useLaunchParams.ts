import { useState } from "react";
import { getPlaybackSpeed, parseLaunchParams } from "../model/game/launch-params";
import type { LaunchParams, PlaybackSpeed } from "../types/game";

export type LaunchSettings = LaunchParams & {
  /** `fast` に応じた再生速度(`timeScale`・`cpuWaitMs`)。 */
  readonly speed: PlaybackSpeed;
};

/**
 * 起動パラメータ(`?seed=&innings=&fast=1`)を読む。**開発ビルド(`import.meta.env.DEV`)でのみ有効**で、
 * 本番ビルドでは `location.search` を読まず既定値(`seed: null`、`innings: null`、`fast: false`)を返す。
 * `import.meta.env.DEV` の参照はこのファイルだけに置く。
 */
function readLaunchSettings(): LaunchSettings {
  const search = import.meta.env.DEV ? window.location.search : "";
  const params = parseLaunchParams(search);
  return { ...params, speed: getPlaybackSpeed(params.fast) };
}

/** 起動パラメータを1回だけ読む(`useState` の遅延初期化)。 */
export function useLaunchParams(): LaunchSettings {
  const [settings] = useState(readLaunchSettings);
  return settings;
}
