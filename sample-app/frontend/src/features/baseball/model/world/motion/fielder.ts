import { jointPose, mix, type JointPose } from "./pose";
import { CATCHER_POSE, IDLE_POSE, RUN_MOTION } from "./rig";

// 野手・捕手のポーズ。野手の走りは時間(ms)だけで決まる周期運動で、`fielderRunPose(0)` は待機姿勢と同じ。
// 構え・捕球・ゴロ捕球・送球は `forms.ts`(`fielderReadyPose` ほか)。

/** 野手の待機姿勢。 */
export function fielderIdlePose(): JointPose {
  return IDLE_POSE;
}

/**
 * 走っている野手。脚と腕を逆位相で振る(モックの `runPose`)。`timeMs` は走り出しからの経過で、負は 0 とみなす。
 * 前傾は走り出しから `leanRampMs` かけて入る(待機姿勢からの飛びを避ける)。肘は走りの曲げへ、膝は脚が前へ出る間だけ曲がる。
 */
export function fielderRunPose(timeMs: number): JointPose {
  const t = timeMs > 0 ? timeMs : 0;
  const swing = Math.sin((t / 1000) * RUN_MOTION.cycleRadPerSec);
  const ramp = Math.min(1, t / RUN_MOTION.leanRampMs);
  const elbow = { x: mix(IDLE_POSE.elbowL.x, RUN_MOTION.elbow, ramp), y: 0, z: 0 };
  return jointPose({
    torso: { x: mix(0, RUN_MOTION.lean, ramp), y: 0, z: 0 },
    head: IDLE_POSE.head,
    armL: { x: IDLE_POSE.armL.x - RUN_MOTION.armSwing * swing, y: IDLE_POSE.armL.y, z: IDLE_POSE.armL.z },
    armR: { x: IDLE_POSE.armR.x + RUN_MOTION.armSwing * swing, y: IDLE_POSE.armR.y, z: IDLE_POSE.armR.z },
    elbowL: elbow,
    elbowR: elbow,
    legL: { x: RUN_MOTION.legSwing * swing, y: 0, z: 0 },
    // 0 − x(−x にすると swing = 0 のとき −0 になり、待機姿勢と deep equal にならない)
    legR: { x: 0 - RUN_MOTION.legSwing * swing, y: 0, z: 0 },
    // 脚が前へ出る間(大腿の x が負)だけ膝を曲げる。0 以上なので swing = 0 の瞬間は待機姿勢と同じ。
    kneeL: { x: RUN_MOTION.kneeBend * Math.max(0, -swing), y: 0, z: 0 },
    kneeR: { x: RUN_MOTION.kneeBend * Math.max(0, swing), y: 0, z: 0 },
  });
}

/** 捕手(打撃カメラでは非表示。中継カメラになってから表示される)。 */
export function catcherPose(): JointPose {
  return CATCHER_POSE;
}
