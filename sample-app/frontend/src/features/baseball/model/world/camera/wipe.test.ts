import { describe, expect, it } from "vitest";
import type { PlateOutcome } from "../../../types/batting";
import type { PitchFlight, PitchKind } from "../../../types/pitch";
import type { CameraPose, CharacterPose, SceneLayout, Vec3, WipeRect } from "../../../types/scene";
import { batterStancePose, batterSwingPose } from "../motion/batter";
import { batterRootFor } from "../motion/batter-layout";
import { dejectedPose, fistPumpPose, runnerJoyPose, runnerRunPose } from "../motion/forms";
import { pitcherFollowPose, pitcherWindupPose } from "../motion/pitcher";
import { placeBatter, placeCharacter } from "../motion/pose";
import { pitchBallAt } from "../path/pitch-path";
import { WORLD_PARAMS } from "../space/params";
import { battingCameraFor } from "./rig";
import { projectPoint, zoneRectOf } from "./project";
import { cameraForwardOf, faceDirectionOf, INTRO_WIPE_MS, planWipeStages, WIPE_TIMING, wipeAlphaAt, wipeCameraFor, wipeRectFor, wipeStageAt } from "./wipe";

const WIPE = WORLD_PARAMS.wipe;
const ACTORS = WORLD_PARAMS.actors;
const ZONE = WORLD_PARAMS.zone;

/** [幅, 高さ, HUD の下端 px]。HUD の下端は上から 155px(実画面の計測値)。 */
const VIEWPORTS: readonly (readonly [number, number])[] = [
  [390, 844],
  [390, 664],
  [375, 667],
  [360, 640],
];
const HUD_BOTTOM_PX = 155;
/** ボールの通り道に足す余白(px。最大のボールの半径相当)。 */
const BALL_MARGIN_PX = 12;

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

describe("wipeRectFor: HUD の下端 + 20px から 94×94px、右端から 6px", () => {
  it("390×844: x 290〜384・y 175〜269(HUD の下端 155px + 20px)", () => {
    const rect = wipeRectFor(390 / 844, 844, HUD_BOTTOM_PX / 844);
    expect(rect.x).toBeCloseTo(290, 9);
    expect(rect.y).toBeCloseTo(175, 9);
    expect(rect.width).toBe(WIPE.rectPortrait.sizePx);
    expect(rect.height).toBe(WIPE.rectPortrait.sizePx);
    expect(rect.x + rect.width).toBeCloseTo(390 - WIPE.rectPortrait.marginRightPx, 9);
  });

  it("矩形の上端は常に HUD の下端 + 20px(画面の高さによらない)", () => {
    for (const [width, height] of VIEWPORTS) {
      const rect = wipeRectFor(width / height, height, HUD_BOTTOM_PX / height);
      expect(rect.y - HUD_BOTTOM_PX).toBeCloseTo(WIPE.rectPortrait.belowHudPx, 9);
      expect(rect.x + rect.width).toBeLessThanOrEqual(width);
    }
  });

  it("画面の高さが無効(NaN・0・負)なら 844px とみなし、縦横比が無効なら 16/9 とみなす(全値が有限)", () => {
    for (const height of [Number.NaN, 0, -5]) {
      const rect = wipeRectFor(Number.NaN, height, 0.2);
      expect(Object.values(rect).every(Number.isFinite)).toBe(true);
      expect(rect.y).toBeCloseTo(0.2 * 844 + WIPE.rectPortrait.belowHudPx, 9);
    }
  });
});

type Rect = { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };

function toRect(rect: WipeRect): Rect {
  return { left: rect.x, top: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

const KINDS: readonly PitchKind[] = ["straight", "slider", "curve", "fork", "shoot"];
/** ゾーンの四隅と中央(ゾーン単位)。aim の上限 ±1.67 の内側。 */
const LANDINGS: readonly { readonly x: number; readonly y: number }[] = [
  { x: 0, y: 0 },
  { x: -1.3, y: 1.3 },
  { x: 1.3, y: 1.3 },
  { x: -1.3, y: -1.3 },
  { x: 1.3, y: -1.3 },
];

function flightOf(kind: PitchKind, landing: { readonly x: number; readonly y: number }): PitchFlight {
  return { seq: 1, kind, aim: landing, landing, speedKmh: 140, durationMs: 500, quality: "normal" };
}

/** 投球の通り道(リリースから着弾まで 5ms 刻み)の画面の点。 */
function ballPathPoints(camera: CameraPose, size: { readonly width: number; readonly height: number }): readonly { readonly x: number; readonly y: number }[] {
  return KINDS.flatMap((kind) =>
    LANDINGS.flatMap((landing) => {
      const flight = flightOf(kind, landing);
      return Array.from({ length: 101 }, (_unused, i) => projectPoint(camera, size, pitchBallAt(flight, (flight.durationMs * i) / 100)));
    }),
  );
}

describe("ワイプの矩形は、ゾーン・ボールの通り道・HUD と重ならない(390×844 と 390×664 ほか)", () => {
  const layouts: readonly SceneLayout[] = ["batting", "pitching"];
  for (const layout of layouts) {
    it.each(VIEWPORTS)(`${layout}: %d×%d`, (width, height) => {
      const size = { width, height };
      const safeArea = { top: HUD_BOTTOM_PX / height, bottom: layout === "pitching" ? (height - 130) / height : (height - 181) / height };
      const camera = battingCameraFor(width / height, layout, safeArea);
      const rect = toRect(wipeRectFor(width / height, height, safeArea.top));
      const zone = zoneRectOf(camera, size, ZONE);
      expect(overlaps(rect, { left: zone.left, top: zone.top, right: zone.left + zone.width, bottom: zone.top + zone.height })).toBe(false);
      const hud: Rect = { left: 0, top: 0, right: width, bottom: HUD_BOTTOM_PX };
      expect(overlaps(rect, hud)).toBe(false);
      const hit = ballPathPoints(camera, size).filter(
        (p) => p.x > rect.left - BALL_MARGIN_PX && p.x < rect.right + BALL_MARGIN_PX && p.y > rect.top - BALL_MARGIN_PX && p.y < rect.bottom + BALL_MARGIN_PX,
      );
      expect(hit).toEqual([]);
    });
  }
});

const BATTER_ROOT = batterRootFor(390 / 844);
const PITCHER_ROOT = { position: ACTORS.pitcher.position, yaw: ACTORS.pitcher.yaw, scale: ACTORS.pitcher.scale };
const RUNNER_ROOT = { position: { x: 6, y: 0, z: -12 }, yaw: Math.PI * 0.75, scale: ACTORS.fielderScale };

/** 顔の向きが大きく変わるポーズの一覧(構え・スイングの全域・投球の全域・うなだれ・ガッツポーズ・走り・喜び)。 */
function poses(): readonly CharacterPose[] {
  const progress = Array.from({ length: 15 }, (_unused, i) => (i * 1.4) / 14);
  const batter = [batterStancePose(1), ...progress.map((p) => batterSwingPose(p, 0.7, 1)), ...progress.map((p) => batterSwingPose(p, 0.7, 0))].map((joints) =>
    placeBatter(joints, BATTER_ROOT),
  );
  const unit = Array.from({ length: 11 }, (_unused, i) => i / 10);
  const pitcher = [
    ...unit.map((u) => pitcherWindupPose(u)),
    ...unit.map((u) => pitcherFollowPose(u * 400)),
    ...unit.map((u) => pitcherWindupPose(u, "side")),
    fistPumpPose(),
    dejectedPose(),
  ].map((joints) => placeCharacter(joints, PITCHER_ROOT));
  const runner = [runnerRunPose(0), runnerRunPose(123), runnerJoyPose(200), dejectedPose()].map((joints) => placeCharacter(joints, RUNNER_ROOT));
  return [...batter, ...pitcher, ...runner];
}

describe("wipeCameraFor: 顔を正面から撮る", () => {
  it("顔の向きとカメラの前方の内積が全ポーズで −0.6 以下", () => {
    const worst = poses().reduce((max, pose) => Math.max(max, dot(faceDirectionOf(pose), cameraForwardOf(wipeCameraFor(pose)))), Number.NEGATIVE_INFINITY);
    expect(worst).toBeLessThanOrEqual(-0.6);
  });

  it("構え・投球の立ち姿では、ほぼ正面(内積 −0.95 以下)", () => {
    const upright = [placeBatter(batterStancePose(1), BATTER_ROOT), placeCharacter(pitcherWindupPose(0), PITCHER_ROOT)];
    for (const pose of upright) {
      expect(dot(faceDirectionOf(pose), cameraForwardOf(wipeCameraFor(pose)))).toBeLessThanOrEqual(-0.95);
    }
  });

  it("打者の構え(縦長)の顔は投手側(−z)を向き、カメラは打者の投手側に置かれて +z 方向を見る", () => {
    const pose = placeBatter(batterStancePose(1), BATTER_ROOT);
    const camera = wipeCameraFor(pose);
    expect(faceDirectionOf(pose).z).toBeLessThan(-0.5);
    expect(camera.position.z).toBeLessThan(camera.target.z);
    expect(cameraForwardOf(camera).z).toBeGreaterThan(0.5);
  });

  it("投手の顔は捕手側(+z)から撮られる: カメラは投手より捕手寄りで −z 方向を見る", () => {
    const pose = placeCharacter(pitcherWindupPose(0), PITCHER_ROOT);
    const camera = wipeCameraFor(pose);
    expect(camera.position.z).toBeGreaterThan(camera.target.z);
    expect(cameraForwardOf(camera).z).toBeLessThan(-0.5);
  });

  it("注視点は頭の高さ、距離は batterDistanceM × 表示倍率(倍率が変わっても頭の大きさは枠に対して一定)", () => {
    const small = placeCharacter(pitcherWindupPose(0), { ...PITCHER_ROOT, scale: 0.7 });
    const large = placeCharacter(pitcherWindupPose(0), { ...PITCHER_ROOT, scale: 1.4 });
    const distance = (camera: CameraPose): number =>
      Math.hypot(camera.position.x - camera.target.x, camera.position.y - camera.target.y, camera.position.z - camera.target.z);
    expect(distance(wipeCameraFor(small))).toBeCloseTo(WIPE.batterDistanceM * 0.7, 9);
    expect(distance(wipeCameraFor(large))).toBeCloseTo(WIPE.batterDistanceM * 1.4, 9);
    expect(wipeCameraFor(small).fovDeg).toBe(WIPE.fovDeg);
    expect(wipeCameraFor(small).lift).toBe(0);
  });

  it("カメラは地面より上にあり(うなだれていても)、全値が有限", () => {
    for (const pose of poses()) {
      const camera = wipeCameraFor(pose);
      expect(camera.position.y).toBeGreaterThan(0);
      expect([camera.position, camera.target].every((p) => Object.values(p).every(Number.isFinite))).toBe(true);
    }
  });

  it("頭の位置が連続すれば、カメラも連続(1/100 刻みの隣接で 0.3m 以内)", () => {
    const sequence = Array.from({ length: 101 }, (_unused, i) => wipeCameraFor(placeCharacter(pitcherWindupPose(i / 100), PITCHER_ROOT)));
    for (const [i, camera] of sequence.entries()) {
      const previous = sequence.at(i - 1) ?? camera;
      expect(
        Math.hypot(camera.position.x - previous.position.x, camera.position.y - previous.position.y, camera.position.z - previous.position.z),
      ).toBeLessThan(i === 0 ? 1e9 : 0.3);
    }
  });
});

describe("wipeAlphaAt: フェードイン 120ms・フェードアウト 200ms", () => {
  it("区間の外・非有限は 0、中ほどは 1、端で連続", () => {
    expect(wipeAlphaAt(-1, 1200)).toBe(0);
    expect(wipeAlphaAt(1200, 1200)).toBe(0);
    expect(wipeAlphaAt(Number.NaN, 1200)).toBe(0);
    expect(wipeAlphaAt(0, Number.NaN)).toBe(0);
    expect(wipeAlphaAt(600, 1200)).toBe(1);
    expect(wipeAlphaAt(WIPE_TIMING.fadeInMs, 1200)).toBe(1);
    expect(wipeAlphaAt(1200 - WIPE_TIMING.fadeOutMs, 1200)).toBe(1);
  });

  it("0〜1 で、1ms の変化が小さい", () => {
    const values = Array.from({ length: 1200 }, (_unused, i) => wipeAlphaAt(i, 1200));
    for (const [i, value] of values.entries()) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      expect(Math.abs(value - (values.at(i - 1) ?? value))).toBeLessThan(i === 0 ? 1.01 : 0.03);
    }
  });

  it("打席の紹介の長さは標準の表示時間 showMs", () => {
    expect(INTRO_WIPE_MS).toBe(WIPE.showMs);
  });
});

const PLATES: readonly (PlateOutcome | null)[] = [
  "walk",
  "strikeout",
  "groundout",
  "doublePlay",
  "flyout",
  "lineout",
  "single",
  "double",
  "triple",
  "homerun",
  "error",
  null,
];

describe("planWipeStages: 結果ごとの場面", () => {
  const base = { resultMs: 2000, contactMs: 2000, endMs: 9000 };

  it.each([
    ["single", "hit", "batter"],
    ["double", "hit", "batter"],
    ["triple", "hit", "batter"],
    ["homerun", "homerun", "batter"],
    ["groundout", "nice-pitch", "pitcher"],
    ["doublePlay", "nice-pitch", "pitcher"],
    ["flyout", "nice-pitch", "pitcher"],
    ["lineout", "nice-pitch", "pitcher"],
  ] as const)("%s → %s(対象 %s)", (plate, scene, target) => {
    const stages = planWipeStages({ ...base, plate });
    expect(stages).toHaveLength(1);
    expect(stages.at(0)?.scene).toBe(scene);
    expect(stages.at(0)?.target).toBe(target);
    expect(stages.at(0)?.startMs).toBe(base.contactMs + WIPE_TIMING.afterContactMs);
  });

  it("ヒット・ホームランの長さは showMs(1200ms)", () => {
    const stage = planWipeStages({ ...base, plate: "single" }).at(0);
    expect((stage?.endMs ?? 0) - (stage?.startMs ?? 0)).toBe(WIPE.showMs);
  });

  it("三振 = 打者の驚き → 落胆。接触が無いので結果の時刻(resultMs)から少し後に始まる", () => {
    const stage = planWipeStages({ plate: "strikeout", resultMs: 700, contactMs: null, endMs: 5000 }).at(0);
    expect(stage?.scene).toBe("strikeout");
    expect(stage?.target).toBe("batter");
    expect(stage?.startMs).toBe(700 + WIPE_TIMING.afterResultMs);
    expect((stage?.endMs ?? 0) - (stage?.startMs ?? 0)).toBe(WIPE_TIMING.strikeoutMs);
  });

  it("四球・失策・結果なし(ボール・ストライク・ファウル)は出さない", () => {
    for (const plate of ["walk", "error", null] as const) {
      expect(planWipeStages({ ...base, plate })).toEqual([]);
    }
  });

  it("区間は演出の終了 endMs を超えず、短すぎる区間(minStageMs 未満)は出さない", () => {
    for (const plate of PLATES) {
      for (const endMs of [2300, 2500, 3000, 4000, 9000]) {
        for (const stage of planWipeStages({ plate, resultMs: 2000, contactMs: 2000, endMs })) {
          expect(stage.endMs).toBeLessThanOrEqual(endMs);
          expect(stage.endMs - stage.startMs).toBeGreaterThanOrEqual(WIPE_TIMING.minStageMs);
        }
      }
    }
    expect(planWipeStages({ ...base, plate: "single", endMs: 2000 + WIPE_TIMING.afterContactMs + WIPE_TIMING.minStageMs - 1 })).toEqual([]);
  });
});

describe("wipeStageAt", () => {
  const stages = planWipeStages({ plate: "homerun", resultMs: 1000, contactMs: 1000, endMs: 9000 });

  it("開始以上・終了未満で区間を返し、外は null", () => {
    const stage = stages.at(0);
    expect(wipeStageAt(stages, (stage?.startMs ?? 0) - 1)).toBeNull();
    expect(wipeStageAt(stages, stage?.startMs ?? 0)).toBe(stage);
    expect(wipeStageAt(stages, (stage?.endMs ?? 0) - 1)).toBe(stage);
    expect(wipeStageAt(stages, stage?.endMs ?? 0)).toBeNull();
    expect(wipeStageAt([], 100)).toBeNull();
  });
});
