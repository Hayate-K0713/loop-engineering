import { clamp01, lerpPose, mix, sampleKeyframes, smoothstep, type BatterJoints, type Lerp } from "./pose";
import { BAT_FOLLOW_LIFT, BAT_STANCE_HEIGHT, BATTER_SWING_KEYS, SWING_CONTACT_PROGRESS, SWING_FOLLOW_END_PROGRESS, type BatterKey } from "./rig";

// 打者のポーズ。`progress` はスイングの進行: 0 = 構え、0.66 = 接触姿勢、1.0 = 振り切り、1〜1.4 = フォロースルー。
// 時間→progress の写像(接触を固定して圧縮するなど)は `sequence/` の `swingProgressAt` が担当する。

const lerpBatterKey: Lerp<BatterKey> = (a, b, k) => ({
  ...lerpPose(a, b, k),
  sweepYaw: mix(a.sweepYaw, b.sweepYaw, k),
  tilt: mix(a.tilt, b.tilt, k),
});

/**
 * バット(スイング用グループ)の高さ(m)。構えは `BAT_STANCE_HEIGHT`、接触(progress 0.66)で `height`(ボールの高さ)に下がり、
 * 接触後は肩へ向かって `BAT_FOLLOW_LIFT` だけ巻き上がる。
 */
function batHeightAt(progress: number, height: number): number {
  if (progress <= SWING_CONTACT_PROGRESS) {
    return mix(BAT_STANCE_HEIGHT, height, smoothstep(progress / SWING_CONTACT_PROGRESS));
  }
  const followSpan = SWING_FOLLOW_END_PROGRESS - SWING_CONTACT_PROGRESS;
  return height + BAT_FOLLOW_LIFT * smoothstep((progress - SWING_CONTACT_PROGRESS) / followSpan);
}

/**
 * スイングのポーズ。`progress` は 0〜1.4 に収める。`height` は接触位置の高さ(m、`zoneToWorld(...).y`)で、
 * `progress` = 0 では構えと同じ(`height` に依存しない)。関節の角度は `height` に依存しない。
 */
export function batterSwingPose(progress: number, height: number): BatterJoints {
  const p = clamp01(progress / SWING_FOLLOW_END_PROGRESS) * SWING_FOLLOW_END_PROGRESS;
  const key = sampleKeyframes(BATTER_SWING_KEYS, p, lerpBatterKey);
  return {
    torso: key.torso,
    head: key.head,
    armL: key.armL,
    armR: key.armR,
    legL: key.legL,
    legR: key.legR,
    bat: { visible: true, sweepYaw: key.sweepYaw, tilt: key.tilt, height: batHeightAt(p, height) },
  };
}

/** 構え姿勢(スイング前)。`batterSwingPose(0, h)` と同じ。 */
export function batterStancePose(): BatterJoints {
  return batterSwingPose(0, BAT_STANCE_HEIGHT);
}
