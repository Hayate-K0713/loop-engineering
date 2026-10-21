import { clamp01, lerpPose, sampleKeyframes, type JointPose } from "./pose";
import { PITCHER_FOLLOW_KEYS, PITCHER_FOLLOW_MS, PITCHER_WINDUP_KEYS } from "./rig";

// 投手のポーズ。windup は壁時計を 0〜1 に正規化した u、フォロースルーはリリースからのゲーム時間 ms で引く。
// `pitcherWindupPose(1)` と `pitcherFollowPose(0)` は同じポーズ(リリースの瞬間)で、境目に飛びがない。

/** windup のポーズ。`u` = 0 が待機姿勢、`u` = 1 がリリースの瞬間。範囲外は端に収める。 */
export function pitcherWindupPose(u: number): JointPose {
  return sampleKeyframes(PITCHER_WINDUP_KEYS, clamp01(u), lerpPose);
}

/** リリース後のフォロースルー。`sinceReleaseMs` = 0 がリリースの瞬間、`PITCHER_FOLLOW_MS` 以降は振り切った姿勢で止まる。 */
export function pitcherFollowPose(sinceReleaseMs: number): JointPose {
  return sampleKeyframes(PITCHER_FOLLOW_KEYS, clamp01(sinceReleaseMs / PITCHER_FOLLOW_MS), lerpPose);
}
