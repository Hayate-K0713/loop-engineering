import { describe, expect, it } from "vitest";
import type { CameraPose, SceneLayout, Vec3 } from "../../../types/scene";
import type { BatStance } from "../../../types/team";
import { projectPoint, zoneRectOf, type ViewSize, type ZoneBox } from "../camera/project";
import { battingCameraFor } from "../camera/rig";
import { WORLD_PARAMS } from "../space/params";
import { batterStancePose, batterSwingPose } from "./batter";
import { batterRootFor } from "./batter-layout";
import { elbowPosition, footPosition, handPosition, headPosition, shoulderPosition } from "./fk";
import {
  batStanceKey,
  dejectedPose,
  DEFAULT_BAT_STANCE_PARAMS,
  fielderCatchPose,
  fielderGroundCatchPose,
  fielderReadyPose,
  fielderThrowPose,
  fistPumpPose,
  groundDropOf,
  runnerJoyPose,
  runnerLeadPose,
  runnerRunPose,
} from "./forms";
import { catcherPose, fielderIdlePose, fielderRunPose } from "./fielder";
import { jointPose, type JointPose, type PoseRoot } from "./pose";
import { BATTER_PORTRAIT_STANCE, BATTER_SWING_KEYS, CHARACTER_PROPORTION, CHARACTER_RIG, IDLE_POSE } from "./rig";
import { adjacentPairs, FRAME_MS, grid, isValidPose, MAX_JOINT_STEP, maxJointDelta } from "./test-helpers";

const ZONE: ZoneBox = WORLD_PARAMS.zone;
const STANCES: readonly BatStance[] = ["open", "square", "crouch"];

// ---------- 打撃の構え 3 種 ----------

/** 手・肘の太さ(m。`render/character/limbs.ts` の手の球 0.09〜0.1、袖 0.075〜0.08)。 */
const HAND_RADIUS = 0.1;
const ELBOW_RADIUS = 0.08;
/** 枠から離す最低限の余白(px)。 */
const CLEARANCE_PX = 4;

/** ステージの [幅, 高さ, 打撃の下のオーバーレイの上端 y, 守備の下のオーバーレイの上端 y]。HUD の下端は上から 155px(`batter-screen.test.ts` と同じ)。 */
const VIEWPORTS: readonly (readonly [number, number, number, number])[] = [
  [390, 844, 663, 714],
  [390, 745, 594, 615],
  [390, 664, 513, 534],
  [375, 667, 516, 537],
  [360, 640, 489, 510],
];

type Rect = { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
type Blob = { readonly name: string; readonly x: number; readonly y: number; readonly radius: number };

function gridZone(): ZoneBox {
  const center = (ZONE.top + ZONE.bottom) / 2;
  const half = ((ZONE.top - ZONE.bottom) / 2) * (5 / 3);
  return { halfWidth: ZONE.halfWidth * (5 / 3), bottom: center - half, top: center + half, planeZ: ZONE.planeZ };
}

function targetRect(camera: CameraPose, size: ViewSize, layout: SceneLayout): Rect {
  const rect = zoneRectOf(camera, size, layout === "pitching" ? gridZone() : ZONE);
  return { left: rect.left, top: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height };
}

function blobOf(camera: CameraPose, size: ViewSize, name: string, point: Vec3, radiusM: number): Blob {
  const center = projectPoint(camera, size, point);
  const edge = projectPoint(camera, size, { x: point.x + radiusM, y: point.y, z: point.z });
  return { name, x: center.x, y: center.y, radius: Math.abs(edge.x - center.x) };
}

/** 円と矩形の隙間(px)。重なっていれば負。 */
function gapBetween(blob: Blob, rect: Rect): number {
  const dx = Math.max(rect.left - blob.x, 0, blob.x - rect.right);
  const dy = Math.max(rect.top - blob.y, 0, blob.y - rect.bottom);
  return Math.hypot(dx, dy) - blob.radius;
}

/** 構え(縦長)の両手・両肘と、それぞれの腕の中点(肩と手の間・肘と肩の間も)の画面の円と、ゾーン枠/格子の最悪の隙間。 */
function worstStanceGap(
  stance: BatStance,
  viewport: readonly [number, number, number, number],
  layout: SceneLayout,
): { readonly name: string; readonly gap: number } {
  const [width, height, battingTop, pitchingTop] = viewport;
  const size = { width, height };
  const aspect = width / height;
  const overlayTop = layout === "pitching" ? pitchingTop : battingTop;
  const camera = battingCameraFor(aspect, layout, { top: 155 / height, bottom: overlayTop / height });
  const root = batterRootFor(aspect);
  const pose = batterStancePose(1, stance);
  const rect = targetRect(camera, size, layout);
  const blobs = (["armL", "armR"] as const).flatMap((hand) => {
    const side = hand === "armL" ? "L" : "R";
    const handAt = handPosition(pose, CHARACTER_RIG, root, hand);
    const elbowAt = elbowPosition(pose, CHARACTER_RIG, root, side);
    const shoulderAt = shoulderPosition(pose, CHARACTER_RIG, root, side);
    const middle = (a: Vec3, b: Vec3): Vec3 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
    return [
      blobOf(camera, size, `${hand} 手`, handAt, HAND_RADIUS * root.scale),
      blobOf(camera, size, `${hand} 肘`, elbowAt, ELBOW_RADIUS * root.scale),
      blobOf(camera, size, `${hand} 前腕`, middle(elbowAt, handAt), ELBOW_RADIUS * root.scale),
      blobOf(camera, size, `${hand} 上腕`, middle(shoulderAt, elbowAt), ELBOW_RADIUS * root.scale),
    ];
  });
  return blobs.map((blob) => ({ name: blob.name, gap: gapBetween(blob, rect) })).reduce((worst, item) => (item.gap < worst.gap ? item : worst));
}

describe("打撃の構え 3 種(open・square・crouch)", () => {
  it("square は標準の構え(BATTER_SWING_KEYS の先頭 / BATTER_PORTRAIT_STANCE)そのもの", () => {
    expect(batStanceKey("square", false)).toBe(BATTER_SWING_KEYS[0].pose);
    expect(batStanceKey("square", true)).toBe(BATTER_PORTRAIT_STANCE);
    expect(batStanceKey("square", true, DEFAULT_BAT_STANCE_PARAMS)).toBe(BATTER_PORTRAIT_STANCE);
  });

  it.each([true, false])("構え 3 種は互いに異なる(縦長: %s。関節角の最大差が 0.1rad 以上)", (portrait) => {
    const keys = STANCES.map((stance) => batStanceKey(stance, portrait));
    for (const [a, b] of adjacentPairs([...keys, keys.at(0) ?? batStanceKey("square", portrait)])) {
      expect(maxJointDelta(a, b)).toBeGreaterThanOrEqual(0.1);
    }
  });

  it("open は体を投手側へ開き、crouch は前傾して膝を曲げる(頭は体の向きを打ち消してボールを見続ける)", () => {
    const square = batStanceKey("square", true);
    const open = batStanceKey("open", true);
    const crouch = batStanceKey("crouch", true);
    expect(open.torso.y).toBeGreaterThan(square.torso.y);
    expect(open.torso.y + open.head.y).toBeCloseTo(square.torso.y + square.head.y, 12);
    expect(crouch.torso.x).toBeGreaterThan(square.torso.x);
    expect(crouch.kneeL.x).toBeGreaterThan(square.kneeL.x + 0.5);
    expect(crouch.kneeR.x).toBeGreaterThan(square.kneeR.x + 0.5);
    // 構えのバットは共有(構えで変わらない)
    expect(open.sweepYaw).toBe(square.sweepYaw);
    expect(crouch.tilt).toBe(square.tilt);
  });

  it.each(STANCES)("%s: 縦長の構えの手・肘・腕がゾーン枠(打撃)・5×5 格子(守備)から 4px 以上離れる(全 5 画面)", (stance) => {
    for (const viewport of VIEWPORTS) {
      for (const layout of ["batting", "pitching"] as const) {
        const { name, gap } = worstStanceGap(stance, viewport, layout);
        expect({ stance, viewport, layout, name, ok: gap >= CLEARANCE_PX }).toEqual({ stance, viewport, layout, name, ok: true });
      }
    }
  });

  it.each(STANCES)("%s: 構えの足は地面から大きく浮かない(根を下げる分 groundDropOf は 0.12m 以下)", (stance) => {
    expect(groundDropOf(batterStancePose(1, stance))).toBeLessThanOrEqual(0.12);
  });

  it.each(STANCES)("%s: 構えから接触(0.66)まで、肘・膝を含めて連続(16ms 刻み = 標準 200ms スイングの progress 0.08 刻み)", (stance) => {
    const samples = grid(0, 1.4, FRAME_MS / 200).map((progress) => batterSwingPose(progress, 0.72, 1, stance));
    for (const [a, b] of adjacentPairs(samples)) {
      expect(maxJointDelta(a, b)).toBeLessThanOrEqual(MAX_JOINT_STEP);
    }
    expect(samples.every((pose) => isValidPose(pose))).toBe(true);
  });

  it("params(段階 M の固有フォーム): 足の開き・手の高さ・目線・バットの傾きが構えにだけ効く", () => {
    const base = batStanceKey("square", true);
    const tuned = batStanceKey("square", true, { spread: 0.2, batTilt: 0.3, handLift: 0.2, gaze: -0.1 });
    expect(tuned.legL.z - base.legL.z).toBeCloseTo(0.2, 12);
    expect(base.legR.z - tuned.legR.z).toBeCloseTo(0.2, 12);
    expect(tuned.tilt - base.tilt).toBeCloseTo(0.3, 12);
    expect(base.armL.x - tuned.armL.x).toBeCloseTo(0.2, 12);
    expect(tuned.head.x - base.head.x).toBeCloseTo(-0.1, 12);
    // 接触以降のスイングは同じ
    const tunedContact = batterSwingPose(0.66, 0.72, 1, "square", { spread: 0.2, batTilt: 0.3, handLift: 0.2, gaze: -0.1 });
    expect(tunedContact).toEqual(batterSwingPose(0.66, 0.72, 1));
  });
});

// ---------- 全身の高さ ÷ 頭の高さ ----------

describe("頭身(全身の高さ ÷ 頭の高さ)", () => {
  it("全体格(身長 ×0.96〜1.04。頭の大きさは固定)で 2.0〜2.6", () => {
    const bodyHeight = CHARACTER_RIG.torsoY + CHARACTER_RIG.headY + CHARACTER_PROPORTION.headTopAboveHead;
    const { min, max } = CHARACTER_PROPORTION.heightScale;
    for (const scale of [min, 1, max]) {
      const ratio = (bodyHeight * scale) / CHARACTER_PROPORTION.headHeight;
      expect(ratio).toBeGreaterThanOrEqual(2);
      expect(ratio).toBeLessThanOrEqual(2.6);
    }
    expect(bodyHeight / CHARACTER_PROPORTION.headHeight).toBeCloseTo(WORLD_PARAMS.character.proportion.headToBody, 0);
  });

  it("FK の頭の中心の高さ + 頭頂まで = 全身の高さ(立ち姿勢)", () => {
    const root: PoseRoot = { position: { x: 0, y: 0, z: 0 }, yaw: 0, scale: 1 };
    const head = headPosition(jointPose({}), CHARACTER_RIG, root);
    expect(head.y + CHARACTER_PROPORTION.headTopAboveHead).toBeCloseTo(CHARACTER_RIG.torsoY + CHARACTER_RIG.headY + CHARACTER_PROPORTION.headTopAboveHead, 12);
  });
});

// ---------- 足元の高さ ----------

describe("groundDropOf", () => {
  it("立ち姿勢は 0、膝を曲げると正、両脚の低い方に合わせる。常に 0 以上", () => {
    expect(groundDropOf(jointPose({}))).toBeCloseTo(0, 12);
    expect(groundDropOf(IDLE_POSE)).toBeCloseTo(0, 12);
    expect(groundDropOf(fielderReadyPose())).toBeGreaterThan(0);
    const oneLeg = jointPose({ legL: { x: -1, y: 0, z: 0 }, kneeL: { x: 1.5, y: 0, z: 0 } });
    const root: PoseRoot = { position: { x: 0, y: 0, z: 0 }, yaw: 0, scale: 1 };
    // 片脚だけ曲げても、もう一方の脚が地面に着いているので 0
    expect(footPosition(oneLeg, CHARACTER_RIG, root, "R").y).toBeCloseTo(0, 12);
    expect(groundDropOf(oneLeg)).toBeCloseTo(0, 12);
  });

  it("根を groundDropOf だけ下げると、低い方の足先が地面(y = 0)に着く", () => {
    for (const pose of [fielderReadyPose(), runnerLeadPose(), catcherPose(), batterStancePose(1, "crouch")]) {
      const drop = groundDropOf(pose);
      const root: PoseRoot = { position: { x: 0, y: -drop, z: 0 }, yaw: 0, scale: 1 };
      const lowest = Math.min(footPosition(pose, CHARACTER_RIG, root, "L").y, footPosition(pose, CHARACTER_RIG, root, "R").y);
      expect(lowest).toBeCloseTo(0, 12);
    }
  });
});

// ---------- 野手の待機・捕球・ゴロ捕球 ----------

/** 野手の足元の例(位置・向き・拡大率。`WORLD_PARAMS.actors.fielderScale`)。 */
const FIELDER_ROOTS: readonly PoseRoot[] = [
  { position: { x: 0, y: 0, z: -86 }, yaw: 0, scale: WORLD_PARAMS.actors.fielderScale },
  { position: { x: -38, y: 0, z: -72 }, yaw: 0.8, scale: WORLD_PARAMS.actors.fielderScale },
  { position: { x: 16.5, y: 0, z: -23 }, yaw: -2.2, scale: WORLD_PARAMS.actors.fielderScale },
];

/** 野手から見た目標(局所。x = 左、y = 上、z = 前)をワールドへ。 */
function worldTarget(root: PoseRoot, local: Vec3): Vec3 {
  const c = Math.cos(root.yaw);
  const s = Math.sin(root.yaw);
  const x = (local.x * c + local.z * s) * root.scale;
  const z = (-local.x * s + local.z * c) * root.scale;
  return { x: root.position.x + x, y: root.position.y + local.y * root.scale, z: root.position.z + z };
}

function distanceBetween(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** 根を `drop`(足が浮く分)だけ下げたときのグローブ(左手)の位置。 */
function gloveAt(pose: JointPose, root: PoseRoot): Vec3 {
  const lowered: PoseRoot = { ...root, position: { ...root.position, y: root.position.y - groundDropOf(pose) * root.scale } };
  return handPosition(pose, CHARACTER_RIG, lowered, "armL");
}

/** グローブが届く目標(フライ・ライナー)。局所の (x, y, z) m = 左・上・前(root の拡大率の前の値)。肩は (0.36, 1.03, −0.05) 付近、腕の長さ 0.38m。 */
const CATCH_TARGETS: readonly Vec3[] = [
  { x: 0.4, y: 1.15, z: 0.25 },
  { x: 0.45, y: 1.15, z: 0.0 },
  { x: 0.4, y: 0.95, z: 0.2 },
  { x: 0.3, y: 1.3, z: 0.0 },
  { x: 0.3, y: 1.1, z: 0.25 },
  { x: 0.45, y: 1.0, z: 0.0 },
];

describe("野手の捕球ポーズ(グローブが落下点に届く)", () => {
  it.each(FIELDER_ROOTS)("フライ・ライナー(root %#): 届く範囲の目標にグローブ(左手の手先)が 2cm 以内で一致する", (root) => {
    for (const local of CATCH_TARGETS) {
      const target = worldTarget(root, local);
      const pose = fielderCatchPose(root, target);
      expect(isValidPose(pose)).toBe(true);
      expect(distanceBetween(gloveAt(pose, root), target), JSON.stringify(local)).toBeLessThanOrEqual(0.02 * root.scale);
    }
  });

  it("肘は前へ曲がる側(x ≤ 0)で、まっすぐ以上に伸びない。右手(グローブでない手)は胴の前に添える", () => {
    const root = FIELDER_ROOTS.at(0) ?? { position: { x: 0, y: 0, z: 0 }, yaw: 0, scale: 1 };
    for (const local of CATCH_TARGETS) {
      const pose = fielderCatchPose(root, worldTarget(root, local));
      expect(pose.elbowL.x).toBeLessThanOrEqual(0);
      expect(pose.elbowL.x).toBeGreaterThanOrEqual(-Math.PI);
      expect(pose.armR.x).toBeLessThan(0);
    }
  });

  it("届かない遠い目標でも有限(腕をまっすぐ伸ばして方向を合わせる)で、グローブは目標の方向に最も近づく", () => {
    const root = FIELDER_ROOTS.at(0) ?? { position: { x: 0, y: 0, z: 0 }, yaw: 0, scale: 1 };
    const far = worldTarget(root, { x: 0.4, y: 2.6, z: 1.5 });
    const pose = fielderCatchPose(root, far);
    expect(isValidPose(pose)).toBe(true);
    expect(pose.elbowL.x).toBeCloseTo(0, 3);
    const reach = distanceBetween(gloveAt(pose, root), far);
    expect(reach).toBeLessThan(distanceBetween(gloveAt(fielderIdlePose(), root), far));
  });

  it("目標が肩のすぐ近く・体の中でも有限で、角度が ±2π 以内", () => {
    const root = FIELDER_ROOTS.at(0) ?? { position: { x: 0, y: 0, z: 0 }, yaw: 0, scale: 1 };
    for (const local of [
      { x: 0.36, y: 1.03, z: 0 },
      { x: 0, y: 0.6, z: 0 },
      { x: -0.5, y: 1.2, z: -0.2 },
    ]) {
      expect(isValidPose(fielderCatchPose(root, worldTarget(root, local)))).toBe(true);
      expect(isValidPose(fielderGroundCatchPose(root, worldTarget(root, local)))).toBe(true);
    }
  });

  it("目標がなめらかに動くと捕球ポーズも連続(局所 x 0.2 → 0.6 を 40 分割。隣接差 0.5rad 以下)", () => {
    const root = FIELDER_ROOTS.at(0) ?? { position: { x: 0, y: 0, z: 0 }, yaw: 0, scale: 1 };
    const poses = grid(0, 1, 1 / 40).map((k) => fielderCatchPose(root, worldTarget(root, { x: 0.3 + 0.3 * k, y: 1.0 + 0.3 * k, z: 0.25 - 0.2 * k })));
    for (const [a, b] of adjacentPairs(poses)) {
      expect(maxJointDelta(a, b)).toBeLessThanOrEqual(MAX_JOINT_STEP);
    }
  });

  it.each(FIELDER_ROOTS)("ゴロの捕球(root %#): かがんで(前傾 ≥ 0.8rad)、足元の前の地面近くの目標にグローブが 2cm 以内で届く", (root) => {
    for (const local of [
      { x: 0.3, y: 0.1, z: 0.5 },
      { x: 0.2, y: 0.15, z: 0.55 },
      { x: 0.35, y: 0.05, z: 0.45 },
    ]) {
      const target = worldTarget(root, local);
      const pose = fielderGroundCatchPose(root, target);
      expect(pose.torso.x).toBeGreaterThanOrEqual(0.8);
      expect(groundDropOf(pose)).toBeGreaterThan(0);
      expect(distanceBetween(gloveAt(pose, root), target), JSON.stringify(local)).toBeLessThanOrEqual(0.02 * root.scale);
    }
  });

  it("待機(構え)は前傾して膝を曲げ、両手が膝の前に下りる(手先は肩より低く、腰より前)", () => {
    const ready = fielderReadyPose();
    expect(isValidPose(ready)).toBe(true);
    expect(ready.torso.x).toBeGreaterThan(0.3);
    expect(ready.kneeL.x).toBeGreaterThan(0.5);
    const root: PoseRoot = { position: { x: 0, y: 0, z: 0 }, yaw: 0, scale: 1 };
    const hand = handPosition(ready, CHARACTER_RIG, root, "armL");
    const shoulder = shoulderPosition(ready, CHARACTER_RIG, root, "L");
    expect(hand.y).toBeLessThan(shoulder.y);
    expect(hand.z).toBeGreaterThan(0);
  });
});

// ---------- 送球 ----------

const THROW_GRID = grid(0, 1.5, FRAME_MS / 400);

describe("野手の送球(オーバースロー)", () => {
  it("構え(u = 0)からリリース(u = 1)・フォロー(1.5)まで有限で、範囲外は端に収まり、NaN は構え", () => {
    for (const u of THROW_GRID) {
      expect(isValidPose(fielderThrowPose(u))).toBe(true);
    }
    expect(fielderThrowPose(-1)).toEqual(fielderThrowPose(0));
    expect(fielderThrowPose(5)).toEqual(fielderThrowPose(1.5));
    expect(fielderThrowPose(Number.NaN)).toEqual(fielderThrowPose(0));
  });

  it("連続性: 400ms の送球を 16ms 刻みに走査して、隣接サンプルの各関節(肘・膝を含む)の差が 0.5rad 以下", () => {
    for (const [a, b] of adjacentPairs(THROW_GRID.map(fielderThrowPose))) {
      expect(maxJointDelta(a, b)).toBeLessThanOrEqual(MAX_JOINT_STEP);
    }
  });

  it("右腕は後ろ(テイクバック)→ 上(リリース)→ 前下(フォロー)へ回る: x が単調増加、リリースで手先は肩より高い", () => {
    const angles = grid(0.45, 1.5, 0.02).map((u) => fielderThrowPose(u).armR.x);
    expect(angles.every((angle, index) => index === 0 || angle >= (angles.at(index - 1) ?? 0))).toBe(true);
    const root: PoseRoot = { position: { x: 0, y: 0, z: 0 }, yaw: 0, scale: 1 };
    const release = fielderThrowPose(1);
    expect(handPosition(release, CHARACTER_RIG, root).y).toBeGreaterThan(shoulderPosition(release, CHARACTER_RIG, root, "R").y);
  });
});

// ---------- 走者・感情のポーズ ----------

const TIME_GRID = grid(0, 3000, FRAME_MS);

describe("走者のポーズ", () => {
  it("リード: 前傾して膝を曲げる。有効なポーズで、足の浮きは小さい", () => {
    const lead = runnerLeadPose();
    expect(isValidPose(lead)).toBe(true);
    expect(lead.torso.x).toBeGreaterThan(0.2);
    expect(lead.kneeL.x).toBeGreaterThan(0.5);
    expect(groundDropOf(lead)).toBeLessThanOrEqual(0.2);
  });

  it("走り: 走り出し(0ms)は待機姿勢と一致し、全関節が有限・連続。野手の走りより前傾が深い", () => {
    expect(runnerRunPose(0)).toEqual(IDLE_POSE);
    expect(runnerRunPose(-100)).toEqual(IDLE_POSE);
    expect(runnerRunPose(Number.NaN)).toEqual(IDLE_POSE);
    for (const ms of [...TIME_GRID, 1e6]) {
      expect(isValidPose(runnerRunPose(ms))).toBe(true);
    }
    for (const [a, b] of adjacentPairs(TIME_GRID.map(runnerRunPose))) {
      expect(maxJointDelta(a, b)).toBeLessThanOrEqual(MAX_JOINT_STEP);
    }
    expect(runnerRunPose(2000).torso.x).toBeGreaterThan(fielderRunPose(2000).torso.x);
  });

  it("走りの腕は肘を曲げて振る(肘 x が −1 以下)。脚は逆位相で、脚が前へ出る間だけ膝が曲がる", () => {
    const pose = runnerRunPose(2000);
    expect(pose.elbowL.x).toBeLessThan(-1);
    for (const ms of TIME_GRID) {
      const p = runnerRunPose(ms);
      expect(p.legL.x).toBeCloseTo(-p.legR.x, 12);
      expect(p.kneeL.x).toBeGreaterThanOrEqual(0);
      expect(p.kneeR.x).toBeGreaterThanOrEqual(0);
      // 大腿が前へ出ている(x が負)側の膝だけが曲がる
      if (p.legL.x > 0) expect(p.kneeL.x).toBe(0);
      if (p.legR.x > 0) expect(p.kneeR.x).toBe(0);
    }
  });

  it("喜び: 両腕が肩より 0.2m 以上高く上がり、左右に開き(V 字)、時間で連続して弾む。有限", () => {
    const root: PoseRoot = { position: { x: 0, y: 0, z: 0 }, yaw: 0, scale: 1 };
    for (const ms of TIME_GRID) {
      const joy = runnerJoyPose(ms);
      expect(isValidPose(joy)).toBe(true);
      const left = handPosition(joy, CHARACTER_RIG, root, "armL");
      const right = handPosition(joy, CHARACTER_RIG, root, "armR");
      expect(left.y).toBeGreaterThan(shoulderPosition(joy, CHARACTER_RIG, root, "L").y + 0.2);
      expect(right.y).toBeGreaterThan(shoulderPosition(joy, CHARACTER_RIG, root, "R").y + 0.2);
      expect(left.x).toBeGreaterThan(CHARACTER_RIG.shoulderX);
      expect(right.x).toBeLessThan(-CHARACTER_RIG.shoulderX);
    }
    for (const [a, b] of adjacentPairs(TIME_GRID.map(runnerJoyPose))) {
      expect(maxJointDelta(a, b)).toBeLessThanOrEqual(MAX_JOINT_STEP);
    }
    expect(runnerJoyPose(-5)).toEqual(runnerJoyPose(0));
  });
});

describe("感情のポーズ", () => {
  const root: PoseRoot = { position: { x: 0, y: 0, z: 0 }, yaw: 0, scale: 1 };

  it("うなだれる(三振・打たれた): 胴と頭が前へ倒れ、手先は肩より 0.25m 以上低く垂れる", () => {
    const dejected = dejectedPose();
    expect(isValidPose(dejected)).toBe(true);
    expect(dejected.torso.x).toBeGreaterThan(0.3);
    expect(dejected.head.x).toBeGreaterThan(0.3);
    expect(handPosition(dejected, CHARACTER_RIG, root, "armR").y).toBeLessThan(shoulderPosition(dejected, CHARACTER_RIG, root, "R").y - 0.25);
  });

  it("ガッツポーズ(抑えた投手): 右の拳が肩より高く、肘が曲がっている。頭は上を向く", () => {
    const pump = fistPumpPose();
    expect(isValidPose(pump)).toBe(true);
    expect(handPosition(pump, CHARACTER_RIG, root, "armR").y).toBeGreaterThan(shoulderPosition(pump, CHARACTER_RIG, root, "R").y);
    expect(pump.elbowR.x).toBeLessThan(-1);
    expect(pump.head.x).toBeLessThan(0);
  });
});

describe("捕手のポーズ", () => {
  it("膝を曲げてしゃがみ、足の浮きは小さい(根を groundDropOf だけ下げれば地面に着く)", () => {
    const catcher = catcherPose();
    expect(catcher.kneeL.x).toBeGreaterThan(0.5);
    expect(groundDropOf(catcher)).toBeGreaterThan(0);
    expect(groundDropOf(catcher)).toBeLessThanOrEqual(0.12);
  });
});

describe("全フォームの有限・連続(30 関節角)", () => {
  it("打撃の構え 3 種 × 縦長・横長の構えの姿勢が有限", () => {
    for (const stance of STANCES) {
      for (const portrait of [0, 0.5, 1]) {
        expect(isValidPose(batterStancePose(portrait, stance))).toBe(true);
      }
    }
  });
});
