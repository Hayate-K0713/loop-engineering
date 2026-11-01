import { describe, expect, it } from "vitest";
import type { Vec3 } from "../../../types/scene";
import type { PitchForm } from "../../../types/team";
import { RELEASE_POINT, WORLD_PARAMS } from "../space/params";
import { handPosition, headPosition } from "./fk";
import { DEFAULT_PITCH_FORM_PARAMS } from "./forms";
import { pitcherFollowPose, pitcherWindupPose } from "./pitcher";
import type { PoseRoot } from "./pose";
import { CHARACTER_RIG, IDLE_POSE, PITCHER_FOLLOW_MS } from "./rig";
import { adjacentPairs, isValidPose, FRAME_MS, grid, MAX_JOINT_STEP, maxJointDelta, NOMINAL_WINDUP_MS } from "./test-helpers";

// 投手は WORLD_PARAMS の配置(足元 (0, 0.25, −18.4)・scale 1.30)で、リリースの手先が RELEASE_POINT(FK の手先の中心)の 0.15m 以内に来る。
const PITCHER_ROOT: PoseRoot = WORLD_PARAMS.actors.pitcher;
const RELEASE_TOLERANCE_M = 0.15;
const FORMS: readonly PitchForm[] = ["over", "three-quarter", "side"];

const WINDUP_U_STEP = FRAME_MS / NOMINAL_WINDUP_MS;
const WINDUP_GRID = grid(0, 1, WINDUP_U_STEP);
const FOLLOW_GRID = grid(0, PITCHER_FOLLOW_MS + 200, FRAME_MS);

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

describe("pitcherWindupPose(フォーム 3 種)", () => {
  it.each(FORMS)("%s: u = 0 は待機姿勢(全フォームが同じ待機から始まる)", (form) => {
    expect(pitcherWindupPose(0, form)).toEqual(IDLE_POSE);
  });

  it("フォームを省略するとオーバー", () => {
    expect(pitcherWindupPose(0.4)).toEqual(pitcherWindupPose(0.4, "over"));
    expect(pitcherFollowPose(120)).toEqual(pitcherFollowPose(120, "over"));
  });

  it.each(FORMS)("%s: u = 1(リリース直前)は pitcherFollowPose(0)(リリースの瞬間)と全関節が一致する", (form) => {
    expect(pitcherWindupPose(1, form)).toEqual(pitcherFollowPose(0, form));
  });

  it.each(FORMS)("%s: 範囲外の u は端に収まり、NaN は待機姿勢", (form) => {
    expect(pitcherWindupPose(-0.5, form)).toEqual(pitcherWindupPose(0, form));
    expect(pitcherWindupPose(3, form)).toEqual(pitcherWindupPose(1, form));
    expect(pitcherWindupPose(Number.NaN, form)).toEqual(pitcherWindupPose(0, form));
  });

  it.each(FORMS)("%s: 全関節の角度が有限で ±2π 以内(u 全域)", (form) => {
    for (const u of WINDUP_GRID) {
      expect(isValidPose(pitcherWindupPose(u, form))).toBe(true);
    }
  });

  it.each(FORMS)("%s: 連続性: 標準の windup 長(700ms)で 16ms 刻みに走査して、隣接サンプルの各関節(肘・膝を含む)の差が 0.5rad 以下", (form) => {
    for (const [a, b] of adjacentPairs(WINDUP_GRID.map((u) => pitcherWindupPose(u, form)))) {
      expect(maxJointDelta(a, b)).toBeLessThanOrEqual(MAX_JOINT_STEP);
    }
  });

  it("windup は決定論的で入力を変更しない(同じ u で deep equal)", () => {
    for (const form of FORMS) {
      expect(pitcherWindupPose(0.37, form)).toEqual(pitcherWindupPose(0.37, form));
    }
  });

  it.each(FORMS)("%s: 投げる右腕は後ろ→上→前の向き(x の回転が増える向き)に回る: 腕を引いた後(u = 0.62)からリリースまで単調増加", (form) => {
    const angles = grid(0.62, 1, WINDUP_U_STEP).map((u) => pitcherWindupPose(u, form).armR.x);
    expect(angles.every((angle, index) => index === 0 || angle >= (angles.at(index - 1) ?? 0))).toBe(true);
  });

  it.each(FORMS)("%s: 足上げ(u = 0.3)で左脚の大腿が前へ上がり、膝が曲がる", (form) => {
    const lifted = pitcherWindupPose(0.3, form);
    expect(lifted.legL.x).toBeLessThan(-1);
    expect(lifted.kneeL.x).toBeGreaterThan(0.8);
  });

  it("3 種のフォームは互いに異なる(リリースの姿勢の関節角の最大差が 0.2rad 以上)", () => {
    const releases = FORMS.map((form) => pitcherWindupPose(1, form));
    for (const [a, b] of adjacentPairs([...releases, releases.at(0) ?? IDLE_POSE])) {
      expect(maxJointDelta(a, b)).toBeGreaterThanOrEqual(0.2);
    }
  });

  it("params: 既定は標準と同一。足上げ・ひねりの倍率は windup の途中だけに効き、待機とリリースの姿勢は変えない", () => {
    expect(pitcherWindupPose(0.3, "over", DEFAULT_PITCH_FORM_PARAMS)).toEqual(pitcherWindupPose(0.3, "over"));
    const high = { legLift: 1.2, twist: 1.3 };
    expect(pitcherWindupPose(0, "over", high)).toEqual(pitcherWindupPose(0, "over"));
    expect(pitcherWindupPose(1, "over", high)).toEqual(pitcherWindupPose(1, "over"));
    expect(pitcherWindupPose(0.3, "over", high).legL.x).toBeCloseTo(pitcherWindupPose(0.3, "over").legL.x * 1.2, 12);
    expect(pitcherWindupPose(0.62, "over", high).torso.y).toBeCloseTo(pitcherWindupPose(0.62, "over").torso.y * 1.3, 12);
  });

  it("params: 倍率を変えても連続で、リリースの手先は動かない", () => {
    const params = { legLift: 0.8, twist: 1.2 };
    for (const form of FORMS) {
      for (const [a, b] of adjacentPairs(WINDUP_GRID.map((u) => pitcherWindupPose(u, form, params)))) {
        expect(maxJointDelta(a, b)).toBeLessThanOrEqual(MAX_JOINT_STEP);
      }
      expect(handPosition(pitcherWindupPose(1, form, params), CHARACTER_RIG, PITCHER_ROOT)).toEqual(
        handPosition(pitcherWindupPose(1, form), CHARACTER_RIG, PITCHER_ROOT),
      );
    }
  });
});

describe("pitcherFollowPose(フォーム 3 種)", () => {
  it.each(FORMS)("%s: 全関節の角度が有限で ±2π 以内", (form) => {
    for (const ms of FOLLOW_GRID) {
      expect(isValidPose(pitcherFollowPose(ms, form))).toBe(true);
    }
  });

  it.each(FORMS)("%s: 連続性: 16ms 刻みに走査して、隣接サンプルの各関節の差が 0.5rad 以下", (form) => {
    for (const [a, b] of adjacentPairs(FOLLOW_GRID.map((ms) => pitcherFollowPose(ms, form)))) {
      expect(maxJointDelta(a, b)).toBeLessThanOrEqual(MAX_JOINT_STEP);
    }
  });

  it.each(FORMS)("%s: 負の経過時間は 0 と同じ、pitcherFollowMs 以降は振り切った姿勢で止まる", (form) => {
    expect(pitcherFollowPose(-100, form)).toEqual(pitcherFollowPose(0, form));
    expect(pitcherFollowPose(PITCHER_FOLLOW_MS, form)).toEqual(pitcherFollowPose(PITCHER_FOLLOW_MS + 5000, form));
    expect(pitcherFollowPose(Number.NaN, form)).toEqual(pitcherFollowPose(0, form));
  });

  it.each(FORMS)("%s: 振り切った姿勢はリリースの姿勢と異なる(体が前へ倒れ、腕が下へ抜ける)", (form) => {
    const release = pitcherFollowPose(0, form);
    const finish = pitcherFollowPose(PITCHER_FOLLOW_MS, form);
    expect(finish.torso.x).toBeGreaterThan(release.torso.x);
    expect(finish.armR.x).toBeGreaterThan(release.armR.x);
  });
});

describe("リリース時の手先(順運動学。投手 scale 1.30)", () => {
  it("RELEASE_POINT は設計の概算 (−0.39, 2.0, −18.0) の近く(0.2m 以内)で、v2 の (−0.3, 1.65, −18.1) ではない", () => {
    expect(distance(RELEASE_POINT, { x: -0.39, y: 2.0, z: -18.0 })).toBeLessThanOrEqual(0.2);
    expect(RELEASE_POINT.y).toBeGreaterThan(1.9);
  });

  it.each(FORMS)("%s: pitcherWindupPose(1) の右手先が RELEASE_POINT の 0.15m 以内(フォーム別のリリース点は採らない)", (form) => {
    const releaseHand = handPosition(pitcherWindupPose(1, form), CHARACTER_RIG, PITCHER_ROOT);
    expect(distance(releaseHand, RELEASE_POINT)).toBeLessThanOrEqual(RELEASE_TOLERANCE_M);
  });

  it.each(FORMS)("%s: pitcherFollowPose(0) の右手先も同じ位置(境界の一致)", (form) => {
    expect(handPosition(pitcherFollowPose(0, form), CHARACTER_RIG, PITCHER_ROOT)).toEqual(
      handPosition(pitcherWindupPose(1, form), CHARACTER_RIG, PITCHER_ROOT),
    );
  });

  it.each(FORMS)("%s: リリース時は腕が上から前へ振り抜かれている: 手先は肩より高く、腕を引いた時点より前(+z)にある", (form) => {
    const releaseHand = handPosition(pitcherWindupPose(1, form), CHARACTER_RIG, PITCHER_ROOT);
    const shoulderY = PITCHER_ROOT.position.y + PITCHER_ROOT.scale * (CHARACTER_RIG.torsoY + CHARACTER_RIG.shoulderY);
    const cocked = handPosition(pitcherWindupPose(0.62, form), CHARACTER_RIG, PITCHER_ROOT);
    expect(releaseHand.y).toBeGreaterThan(shoulderY);
    expect(releaseHand.z).toBeGreaterThan(cocked.z);
  });

  it.each(FORMS)("%s: 手先の軌道はリリース前に後ろ(−z)から前(+z)へ進む: u = 0.62 → 1 で z が単調増加", (form) => {
    const zs = grid(0.62, 1, WINDUP_U_STEP).map((u) => handPosition(pitcherWindupPose(u, form), CHARACTER_RIG, PITCHER_ROOT).z);
    expect(zs.every((z, index) => index === 0 || z >= (zs.at(index - 1) ?? 0) - 1e-9)).toBe(true);
  });

  it.each(FORMS)("%s: フォロースルーで手先は低い位置へ抜ける(リリース後に下がる)", (form) => {
    const release = handPosition(pitcherFollowPose(0, form), CHARACTER_RIG, PITCHER_ROOT);
    const finish = handPosition(pitcherFollowPose(PITCHER_FOLLOW_MS, form), CHARACTER_RIG, PITCHER_ROOT);
    expect(finish.y).toBeLessThan(release.y);
  });

  it.each(FORMS)("%s: リリースの瞬間、投げる右手(−x 側)の手先は頭より右(−x)で、頭の近く(1.0m 以内)にある", (form) => {
    const head = headPosition(pitcherWindupPose(1, form), CHARACTER_RIG, PITCHER_ROOT);
    const hand = handPosition(pitcherWindupPose(1, form), CHARACTER_RIG, PITCHER_ROOT);
    expect(hand.x).toBeLessThan(head.x);
    expect(distance(hand, head)).toBeLessThanOrEqual(1);
  });
});
