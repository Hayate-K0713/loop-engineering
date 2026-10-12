// テスト専用のヘルパー。本番コードからは import しない(motion/ の各 *.test.ts が共有する)。
import type { Rot3 } from "../../../types/scene";
import type { JointPose } from "./pose";

export const TWO_PI = Math.PI * 2;

/** 投手の windup の標準の長さ(`WORLD_PARAMS` の cpuWaitMs と同値。motion は space を import できないのでテストで持つ)。 */
export const NOMINAL_WINDUP_MS = 700;

/** 隣接サンプルの間隔(ms)。 */
export const FRAME_MS = 16;

/** 許容する隣接サンプル間の関節角の差(rad)。 */
export const MAX_JOINT_STEP = 0.5;

function rotAngles(r: Rot3): readonly number[] {
  return [r.x, r.y, r.z];
}

/** 6関節 × 3軸 = 18個の角度。 */
export function jointAngles(pose: JointPose): readonly number[] {
  return [pose.torso, pose.head, pose.armL, pose.armR, pose.legL, pose.legR].flatMap(rotAngles);
}

/** すべての角度が有限で ±2π 以内。 */
export function isValidAngles(angles: readonly number[]): boolean {
  return angles.every((angle) => Number.isFinite(angle) && Math.abs(angle) <= TWO_PI);
}

/** 全関節の角度が有限で ±2π 以内。 */
export function isValidPose(pose: JointPose): boolean {
  return isValidAngles(jointAngles(pose));
}

/** 2つのポーズの、関節角ごとの差の最大値(rad)。 */
export function maxJointDelta(a: JointPose, b: JointPose): number {
  const anglesB = jointAngles(b);
  return Math.max(...jointAngles(a).map((angle, index) => Math.abs(angle - (anglesB.at(index) ?? Number.NaN))));
}

/** `from` から `to` まで `step` 刻み(`to` を含む)の値の並び。 */
export function grid(from: number, to: number, step: number): readonly number[] {
  const count = Math.floor((to - from) / step + 1e-9);
  const values = Array.from({ length: count + 1 }, (_, index) => from + index * step);
  return values.at(-1) === to ? values : [...values, to];
}

/** 隣接する2要素の組。 */
export function adjacentPairs<T>(items: readonly T[]): readonly (readonly [T, T])[] {
  return items.slice(1).flatMap((item, index) => {
    const previous = items.at(index);
    return previous === undefined ? [] : [[previous, item] as const];
  });
}
