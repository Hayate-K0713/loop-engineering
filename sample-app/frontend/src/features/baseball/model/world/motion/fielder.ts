import { mix, type JointPose } from "./pose";
import { CATCHER_POSE, IDLE_POSE, RUN_MOTION } from "./rig";

// 野手・捕手のポーズ。野手の走りは時間(ms)だけで決まる周期運動で、`fielderRunPose(0)` は待機姿勢と同じ。

/** 野手の待機姿勢。 */
export function fielderIdlePose(): JointPose {
  return IDLE_POSE;
}

/**
 * 走っている野手。脚と腕を逆位相で振る(モックの `runPose`)。`timeMs` は走り出しからの経過で、負は 0 とみなす。
 * 前傾は走り出しから `leanRampMs` かけて入る(待機姿勢からの飛びを避ける)。
 */
export function fielderRunPose(timeMs: number): JointPose {
  const t = Math.max(0, timeMs);
  const swing = Math.sin((t / 1000) * RUN_MOTION.cycleRadPerSec);
  const lean = mix(0, RUN_MOTION.lean, Math.min(1, t / RUN_MOTION.leanRampMs));
  return {
    torso: { x: lean, y: 0, z: 0 },
    head: IDLE_POSE.head,
    armL: { x: IDLE_POSE.armL.x - RUN_MOTION.armSwing * swing, y: IDLE_POSE.armL.y, z: IDLE_POSE.armL.z },
    armR: { x: IDLE_POSE.armR.x + RUN_MOTION.armSwing * swing, y: IDLE_POSE.armR.y, z: IDLE_POSE.armR.z },
    legL: { x: RUN_MOTION.legSwing * swing, y: 0, z: 0 },
    legR: { x: -RUN_MOTION.legSwing * swing, y: 0, z: 0 },
  };
}

/** 捕手(打撃カメラでは非表示。中継カメラになってから表示される)。 */
export function catcherPose(): JointPose {
  return CATCHER_POSE;
}
