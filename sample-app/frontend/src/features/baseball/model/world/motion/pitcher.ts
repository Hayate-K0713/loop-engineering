import type { PitchForm } from "../../../types/team";
import { DEFAULT_PITCH_FORM_PARAMS, pitchFollowKeys, pitchWindupKeys, type PitchFormParams } from "./forms";
import { clamp01, lerpPose, sampleKeyframes, type JointPose } from "./pose";
import { PITCHER_FOLLOW_MS } from "./rig";

// 投手のポーズ。windup は壁時計を 0〜1 に正規化した u、フォロースルーはリリースからのゲーム時間 ms で引く。
// `pitcherWindupPose(1)` と `pitcherFollowPose(0)` は同じポーズ(リリースの瞬間)で、境目に飛びがない。
// フォーム(`form`。既定はオーバー)と、選手固有の調整値(`params`。段階 M)を受け取る。フォームの表は `forms.ts`。
// リリースの手先は、どのフォームでも `RELEASE_POINT` の 0.15m 以内(`fk.ts` で検査)。

/** windup のポーズ。`u` = 0 が待機姿勢、`u` = 1 がリリースの瞬間。範囲外は端に収める。 */
export function pitcherWindupPose(u: number, form: PitchForm = "over", params: PitchFormParams = DEFAULT_PITCH_FORM_PARAMS): JointPose {
  return sampleKeyframes(pitchWindupKeys(form, params), clamp01(u), lerpPose);
}

/** リリース後のフォロースルー。`sinceReleaseMs` = 0 がリリースの瞬間、`PITCHER_FOLLOW_MS` 以降は振り切った姿勢で止まる。 */
export function pitcherFollowPose(sinceReleaseMs: number, form: PitchForm = "over"): JointPose {
  return sampleKeyframes(pitchFollowKeys(form), clamp01(sinceReleaseMs / PITCHER_FOLLOW_MS), lerpPose);
}
