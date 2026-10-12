import { describe, expect, it } from "vitest";
import { handPosition } from "../motion/fk";
import { pitcherWindupPose } from "../motion/pitcher";
import { CHARACTER_RIG, PITCHER_FOLLOW_MS, SWING_CONTACT_PROGRESS, SWING_FOLLOW_END_PROGRESS } from "../motion/rig";
import { RELEASE_POINT, WORLD_PARAMS } from "../space/params";

// `motion/`(B2)は `space/`(B1)を import できない並列実装の都合で、同じ意味の数値を `rig.ts` と `params.ts` の両方に持つ。
// 時間軸は sequence が `WORLD_PARAMS` を正として組み、動きは motion の定数で動くので、片方だけ調整するとずれる。ここで一致を固定する
// (ステップ G の見た目調整で片方だけ変えたときに、どちらを直すべきか分かるようにする)。

/** 手先とリリース点の距離の許容(m)。`rig.ts` の `PITCHER_RELEASE_POSE` のコメントと同じ。 */
const RELEASE_TOLERANCE_M = 0.15;

describe("motion と space の同値の定数", () => {
  it("投手が windup の終端(u = 1)で右手先を出す位置が RELEASE_POINT の 0.15m 以内(WORLD_PARAMS の投手の配置で)", () => {
    const hand = handPosition(pitcherWindupPose(1), CHARACTER_RIG, WORLD_PARAMS.actors.pitcher);
    const distance = Math.hypot(hand.x - RELEASE_POINT.x, hand.y - RELEASE_POINT.y, hand.z - RELEASE_POINT.z);
    expect(distance).toBeLessThanOrEqual(RELEASE_TOLERANCE_M);
  });

  it("投手のフォロースルーの長さ: PITCHER_FOLLOW_MS と WORLD_PARAMS.pitcherFollowMs が一致する", () => {
    expect(PITCHER_FOLLOW_MS).toBe(WORLD_PARAMS.pitcherFollowMs);
  });

  it("スイングの接触姿勢の progress: SWING_CONTACT_PROGRESS と WORLD_PARAMS.swing.contactRatio が一致する", () => {
    expect(SWING_CONTACT_PROGRESS).toBeCloseTo(WORLD_PARAMS.swing.contactRatio, 12);
  });

  it("スイングのフォロースルー終端の progress: SWING_FOLLOW_END_PROGRESS と WORLD_PARAMS.swing.followEndProgress が一致する", () => {
    expect(SWING_FOLLOW_END_PROGRESS).toBeCloseTo(WORLD_PARAMS.swing.followEndProgress, 12);
  });
});
