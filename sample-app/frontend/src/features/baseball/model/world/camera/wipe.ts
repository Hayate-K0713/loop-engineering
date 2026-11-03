import type { PlateOutcome } from "../../../types/batting";
import type { CameraPose, CharacterPose, CharacterSlot, Vec3, WipeRect } from "../../../types/scene";
import { headPosition, rotateEuler } from "../motion/fk";
import { CHARACTER_RIG } from "../motion/rig";
import { WORLD_PARAMS } from "../space/params";
import { easeInOut } from "./rig";

// ワイプ(顔アップの第 2 ビューポート。character 分冊 §3-4-9)の純関数: カメラ・矩形・場面の時刻表。
// 顔の向きを正面から撮る(カメラの前方 = 顔の向きの逆)。矩形は HUD の下端(px)+ 20px から 94×94px。状態を持たず、three は import しない。
// ワイプのキャラクターは「実寸」で見せる: カメラの距離を表示倍率 `pose.scale` に比例させるので、倍率によらず頭の大きさは枠に対して一定。

const WIPE = WORLD_PARAMS.wipe;

/** ワイプの時間の定数(ms)。`WORLD_PARAMS.wipe.showMs` は標準の表示時間。 */
export const WIPE_TIMING = {
  /** 接触の後、ヒット・ホームランのワイプを出し始めるまで(スイングのフォロースルーが終わるまで)。 */
  afterContactMs: 250,
  /** フェードイン・フェードアウト。 */
  fadeInMs: 120,
  fadeOutMs: 200,
  /** 三振(打者の驚き → 落胆)・ナイスピッチ(投手の喜び)の表示時間。 */
  strikeoutMs: 1000,
  nicePitchMs: 900,
  /** 結果の後、三振のワイプを出し始めるまで。 */
  afterResultMs: 50,
  /** これより短い区間は出さない。 */
  minStageMs: 300,
} as const;

/** カメラの仰角(rad)の上限。顔が下を向いていても、カメラが地面にめり込まない。 */
const MAX_ELEVATION = 0.35;

const DEFAULT_VIEW_HEIGHT_PX = 844;
const DEFAULT_ASPECT = 16 / 9;

/** ワイプの場面。 */
export type WipeScene = "intro" | "hit" | "homerun" | "strikeout" | "nice-pitch";

/**
 * ワイプの区間(`PlayPlan.wipe`)。`target` が `batter` で、打者が打者走者になっていれば `runner0` に読み替える(同じ人物)。
 * 打席の紹介(`intro`)は演出の外(`idle`/`windup`)で出すので、区間は持たず `SceneFrameInput.introMs` から作る。
 */
export type WipeStage = {
  readonly scene: WipeScene;
  readonly target: CharacterSlot;
  readonly startMs: number;
  readonly endMs: number;
};

/** 画面の寸法の既定(`viewHeightPx` が使えないとき)。 */
function usableHeight(viewHeightPx: number): number {
  return Number.isFinite(viewHeightPx) && viewHeightPx > 0 ? viewHeightPx : DEFAULT_VIEW_HEIGHT_PX;
}

/**
 * ワイプの矩形(CSS px、キャンバス左上基準)。`sizePx` の正方形で、右端から `marginRightPx`、HUD の下端(`safeAreaTop` × 画面高)から `belowHudPx` 下。
 * 390×844 では x 290〜384・y 175〜269。ボールの通り道(x 118〜273)と HUD を避ける。
 */
export function wipeRectFor(aspect: number, viewHeightPx: number, safeAreaTop: number): WipeRect {
  const rect = WIPE.rectPortrait;
  const height = usableHeight(viewHeightPx);
  const width = height * (Number.isFinite(aspect) && aspect > 0 ? aspect : DEFAULT_ASPECT);
  return { x: width - rect.sizePx - rect.marginRightPx, y: safeAreaTop * height + rect.belowHudPx, width: rect.sizePx, height: rect.sizePx };
}

/** 顔の向き(ワールドの単位ベクトル)。頭 → 胴 → 根の yaw の順に、キャラクターの正面 +z を回す。 */
export function faceDirectionOf(pose: CharacterPose): Vec3 {
  const turned = rotateEuler(rotateEuler({ x: 0, y: 0, z: 1 }, pose.head), pose.torso);
  return rotateEuler(turned, { x: 0, y: pose.yaw, z: 0 });
}

/** カメラを置く向き(頭から見たカメラの方向)。顔の向きに合わせるが、仰角は ±`MAX_ELEVATION` に収める。 */
function cameraDirectionOf(pose: CharacterPose): Vec3 {
  const face = faceDirectionOf(pose);
  const horizontal = Math.hypot(face.x, face.z);
  const toward = horizontal > 1e-6 ? { x: face.x / horizontal, z: face.z / horizontal } : { x: Math.sin(pose.yaw), z: Math.cos(pose.yaw) };
  const elevation = Math.max(-MAX_ELEVATION, Math.min(MAX_ELEVATION, Math.asin(Math.max(-1, Math.min(1, face.y)))));
  return { x: toward.x * Math.cos(elevation), y: Math.sin(elevation), z: toward.z * Math.cos(elevation) };
}

/**
 * 顔を正面から撮るワイプ用カメラ。注視点は頭の中心、位置は顔の向きの `batterDistanceM × pose.scale` 先(仰角は制限)。
 * 画面は正方形(縦横比 1)で、`lift` は 0。顔の向きとカメラの前方の内積は、顔が ±約 50° 以上うつむかない限り −0.6 以下になる(通常は −1 に近い)。
 */
export function wipeCameraFor(pose: CharacterPose): CameraPose {
  const head = headPosition(pose, CHARACTER_RIG, { position: pose.position, yaw: pose.yaw, scale: pose.scale });
  const dir = cameraDirectionOf(pose);
  const distance = WIPE.batterDistanceM * pose.scale;
  return {
    position: { x: head.x + dir.x * distance, y: head.y + dir.y * distance, z: head.z + dir.z * distance },
    target: head,
    fovDeg: WIPE.fovDeg,
    lift: 0,
  };
}

/** カメラの前方(位置 → 注視点の単位ベクトル)。 */
export function cameraForwardOf(camera: CameraPose): Vec3 {
  const dx = camera.target.x - camera.position.x;
  const dy = camera.target.y - camera.position.y;
  const dz = camera.target.z - camera.position.z;
  const length = Math.hypot(dx, dy, dz);
  return length > 0 ? { x: dx / length, y: dy / length, z: dz / length } : { x: 0, y: 0, z: -1 };
}

/** 区間の `sinceMs` 時点の不透明度(0〜1)。`fadeInMs` で立ち上がり、終了の `fadeOutMs` 前から消える。区間の外・非有限は 0。 */
export function wipeAlphaAt(sinceMs: number, lengthMs: number): number {
  if (!Number.isFinite(sinceMs) || !Number.isFinite(lengthMs) || sinceMs < 0 || sinceMs >= lengthMs) {
    return 0;
  }
  return Math.min(easeInOut(sinceMs / WIPE_TIMING.fadeInMs), easeInOut((lengthMs - sinceMs) / WIPE_TIMING.fadeOutMs));
}

export type WipePlanInput = {
  /** 打席の結果。球だけの結果(ボール・ストライク・ファウル)や不明は `null`。 */
  readonly plate: PlateOutcome | null;
  /** 結果の時刻(ms)。接触あり = 接触、なし = 到達 or 空振りの接触姿勢のうち遅い方。 */
  readonly resultMs: number;
  /** バットとボールの接触時刻。なければ `null`。 */
  readonly contactMs: number | null;
  /** 演出の終了時刻。区間はこれを超えない。 */
  readonly endMs: number;
};

function stage(scene: WipeScene, target: CharacterSlot, startMs: number, lengthMs: number, endMs: number): readonly WipeStage[] {
  const end = Math.min(startMs + lengthMs, endMs);
  return end - startMs >= WIPE_TIMING.minStageMs ? [{ scene, target, startMs, endMs: end }] : [];
}

/**
 * 結果ごとのワイプの区間(0 か 1 個)。ヒット・ホームラン = 打者(打者走者)の喜び、三振 = 打者の驚き → 落胆、
 * アウト(凡打)= 投手の喜び(ナイスピッチ)。ボール・ストライク・ファウル・四球・失策は出さない。
 */
export function planWipeStages(input: WipePlanInput): readonly WipeStage[] {
  const { plate, resultMs, contactMs, endMs } = input;
  const afterContact = (contactMs ?? resultMs) + WIPE_TIMING.afterContactMs;
  switch (plate) {
    case "single":
    case "double":
    case "triple":
      return stage("hit", "batter", afterContact, WIPE.showMs, endMs);
    case "homerun":
      return stage("homerun", "batter", afterContact, WIPE.showMs, endMs);
    case "strikeout":
      return stage("strikeout", "batter", resultMs + WIPE_TIMING.afterResultMs, WIPE_TIMING.strikeoutMs, endMs);
    case "groundout":
    case "doublePlay":
    case "flyout":
    case "lineout":
      return stage("nice-pitch", "pitcher", afterContact, WIPE_TIMING.nicePitchMs, endMs);
    case "walk":
    case "error":
    case null:
      return [];
  }
}

/** 時刻 `tMs` に有効な区間。なければ `null`。 */
export function wipeStageAt(stages: readonly WipeStage[], tMs: number): WipeStage | null {
  return stages.find((entry) => tMs >= entry.startMs && tMs < entry.endMs) ?? null;
}

/** 打席の紹介(打者の顔)の長さ(ms)。 */
export const INTRO_WIPE_MS = WIPE.showMs;
