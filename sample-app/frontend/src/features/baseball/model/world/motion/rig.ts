import type { CharacterRig } from "../../../types/stage";
import type { Rot3 } from "../../../types/scene";
import type { JointPose, Keyframes } from "./pose";

// キャラクターの関節の寸法と、モーションのキーフレーム表(関数の外に置いたデータ定数)。
// 初期値はモックの `posePitcher`/`poseBatter`/`runPose` の式を表に起こしたもの。ステップ G で見た目に合わせて数値だけ調整してよい
// (構造・関数・型は変えない)。`types/` だけに依存し、`space/` など他の world サブフォルダは import しない(B1 と並列実装のため)。
// 回転は three の Euler(XYZ)と同義の rad。右投げ・右打ちで、キャラクターは足元基準・+z 向き(yaw 0)。

function rot(x: number, y = 0, z = 0): Rot3 {
  return { x, y, z };
}

/** 関節の寸法(モックの値)。`render/character.ts` へも `StageOptions.rig` として同じ値を渡す。 */
export const CHARACTER_RIG: CharacterRig = {
  hipX: 0.14,
  hipY: 0.5,
  torsoY: 0.55,
  shoulderX: 0.36,
  shoulderY: 0.48,
  headY: 0.98,
  armLength: 0.38,
};

/** 待機姿勢(モックの `poseIdle`)。 */
export const IDLE_POSE: JointPose = {
  torso: rot(0),
  head: rot(0),
  armL: rot(0.1, 0, 0.15),
  armR: rot(0.1, 0, -0.15),
  legL: rot(0),
  legR: rot(0),
};

// ---------- 投手 ----------

/** リリース後のフォロースルーの長さ(ゲーム ms)。`pitcherFollowPose(sinceReleaseMs)` はこの時間で 0〜1 に正規化する。 */
export const PITCHER_FOLLOW_MS = 400;

/**
 * リリースの瞬間のポーズ。windup の u = 1 とフォロースルーの 0 ms は同じ値(連続性)。
 * 右腕(`armR`)は肩の真上〜わずかに前へ伸び、`fk.ts` で求めた手先が `RELEASE_POINT`(−0.30, 1.65, −18.1)の 0.15m 以内に来る
 * (投手の足元 (0, 0.25, −18.4)・yaw 0・scale 1 のとき)。
 */
const PITCHER_RELEASE_POSE: JointPose = {
  torso: rot(0.25, 0.3, 0),
  head: rot(0.1, 0, 0),
  armL: rot(-0.9, 0, 0.4),
  armR: rot(3.15, 0, 0.12),
  legL: rot(-0.5, 0, 0),
  legR: rot(0.25, 0, 0),
};

/**
 * windup(u: 0〜1)。待機 → 脚を上げて両手を胸の前に → 踏み出して右腕を後ろ上へ引く → 上から前へ振り抜いてリリース。
 * 右腕は肩を中心に後ろ→上→前の向き(x の回転が増える向き)に回る。モックのように腕が体の後ろを下へ通り抜けない。
 */
export const PITCHER_WINDUP_KEYS: Keyframes<JointPose> = [
  { at: 0, ease: "linear", pose: IDLE_POSE },
  {
    at: 0.3,
    ease: "smooth",
    pose: { torso: rot(-0.1, -0.3, 0), head: rot(0), armL: rot(-0.8, 0, -0.3), armR: rot(-0.8, 0, 0.3), legL: rot(-1.4, 0, 0), legR: rot(0) },
  },
  {
    at: 0.62,
    ease: "smooth",
    pose: { torso: rot(-0.15, -0.7, 0), head: rot(0, 0.6, 0), armL: rot(-1.3, 0, 0.5), armR: rot(2, 0, -0.4), legL: rot(-0.9, 0, 0), legR: rot(0.1, 0, 0) },
  },
  { at: 1, ease: "in", pose: PITCHER_RELEASE_POSE },
];

/** リリース後(0〜1 は `PITCHER_FOLLOW_MS` の正規化)。腕が体の前を下へ振り抜け、体が前へ倒れ、後ろ足が蹴り上がって止まる。 */
export const PITCHER_FOLLOW_KEYS: Keyframes<JointPose> = [
  { at: 0, ease: "linear", pose: PITCHER_RELEASE_POSE },
  {
    at: 0.3,
    ease: "linear",
    pose: { torso: rot(0.45, 0.5, 0), head: rot(0.1, 0, 0), armL: rot(-0.6, 0, 0.3), armR: rot(4.6, 0, 0.3), legL: rot(-0.45, 0, 0), legR: rot(0.45, 0, 0) },
  },
  {
    at: 0.65,
    ease: "out",
    pose: { torso: rot(0.55, 0.6, 0), head: rot(0.15, 0, 0), armL: rot(-0.4, 0, 0.25), armR: rot(5.5, 0, 0.35), legL: rot(-0.4, 0, 0), legR: rot(0.6, 0, 0) },
  },
  {
    at: 1,
    ease: "out",
    pose: { torso: rot(0.55, 0.6, 0), head: rot(0.15, 0, 0), armL: rot(-0.3, 0, 0.2), armR: rot(5.9, 0, 0.35), legL: rot(-0.4, 0, 0), legR: rot(0.6, 0, 0) },
  },
];

// ---------- 打者 ----------

/** スイングの progress の目印。0.66 が接触姿勢、1.0 がスイングの終わり、1.4 がフォロースルーの終わり(`sequence/` の `swingProgressAt` と同じ値)。 */
export const SWING_CONTACT_PROGRESS = 0.66;
export const SWING_FOLLOW_END_PROGRESS = 1.4;

/** 構えのバット(スイング用グループ)の高さ(m)。モックの 1.0。 */
export const BAT_STANCE_HEIGHT = 1.0;
/** 接触後、バットが肩へ巻き上がる分の高さ(m)。 */
export const BAT_FOLLOW_LIFT = 0.35;

/** 打者のキーフレーム。関節 + バットの向き(`sweepYaw`: 水平の振り、`tilt`: 先端の上がり。高さは別に計算する)。 */
export type BatterKey = JointPose & {
  readonly sweepYaw: number;
  readonly tilt: number;
};

/**
 * スイングの progress(0〜1.4)で引く。0 = 構え、0.66 = 接触(バットがボールの通る面を横切り、ほぼ水平)、1.0 = 振り切り、1.4 = フォロースルー。
 * 頭は体のひねりを打ち消してボールを見続け、接触後に体に引かれる。
 */
export const BATTER_SWING_KEYS: Keyframes<BatterKey> = [
  {
    at: 0,
    ease: "linear",
    pose: {
      torso: rot(0, -0.4, 0),
      head: rot(0, 1.37, 0),
      armL: rot(-1.1, 0, 0.5),
      armR: rot(-1.1, 0, -0.5),
      legL: rot(0),
      legR: rot(-0.15, 0, 0),
      sweepYaw: -1.9,
      tilt: -1.05,
    },
  },
  {
    at: SWING_CONTACT_PROGRESS,
    ease: "in",
    pose: {
      torso: rot(0, 0, 0),
      head: rot(0.1, 1.05, 0),
      armL: rot(-1.3, 0, 0.5),
      armR: rot(-1.3, 0, -0.5),
      legL: rot(0),
      legR: rot(-0.3, 0, 0),
      sweepYaw: -0.1,
      tilt: -0.05,
    },
  },
  {
    at: 1,
    ease: "linear",
    pose: {
      torso: rot(0, 0.6, 0),
      head: rot(0.1, 0.65, 0),
      armL: rot(-1.4, 0, 0.5),
      armR: rot(-1.4, 0, -0.5),
      legL: rot(0),
      legR: rot(-0.4, 0, 0),
      sweepYaw: 1.5,
      tilt: -0.1,
    },
  },
  {
    at: SWING_FOLLOW_END_PROGRESS,
    ease: "out",
    pose: {
      torso: rot(0, 0.9, 0),
      head: rot(0.05, 0.5, 0),
      armL: rot(-1.8, 0, 0.35),
      armR: rot(-1.8, 0, -0.35),
      legL: rot(0),
      legR: rot(-0.45, 0, 0),
      sweepYaw: 2.2,
      tilt: -0.9,
    },
  },
];

// ---------- 野手・捕手 ----------

/** 走りの動き(モックの `runPose`: 脚は ±0.8、腕は ∓0.7 を角速度 14 rad/s の sin で振る)。前傾は走り出しから `leanRampMs` かけて入れる。 */
export const RUN_MOTION = {
  cycleRadPerSec: 14,
  legSwing: 0.8,
  armSwing: 0.7,
  lean: 0.14,
  leanRampMs: 120,
} as const;

/** 捕手(中継カメラのときだけ表示される)。軽く前かがみで、左手のミットを前へ出す。 */
export const CATCHER_POSE: JointPose = {
  torso: rot(0.35, 0, 0),
  head: rot(-0.3, 0, 0),
  armL: rot(-1, 0, 0.3),
  armR: rot(-0.5, 0, -0.3),
  legL: rot(-0.6, 0, 0.3),
  legR: rot(-0.6, 0, -0.3),
};
