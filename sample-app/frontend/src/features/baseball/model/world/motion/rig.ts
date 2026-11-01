import type { CharacterRig } from "../../../types/stage";
import type { Rot3 } from "../../../types/scene";
import { jointPose, type JointPose, type Keyframes } from "./pose";

// キャラクターの関節の寸法と、打者・走りのキーフレーム表(関数の外に置いたデータ定数)。投球フォーム・構え・野手・走者のフォームは `forms.ts`。
// 初期値はモックの `posePitcher`/`poseBatter`/`runPose` の式を表に起こしたもの。ステップ G で見た目に合わせて数値だけ調整してよい
// (構造・関数・型は変えない)。`types/` だけに依存し、`space/` など他の world サブフォルダは import しない(B1 と並列実装のため)。
// 回転は three の Euler(XYZ)と同義の rad。右投げ・右打ちで、キャラクターは足元基準・+z 向き(yaw 0)。
// 肘・膝: 肘(`elbowL/R`)は負の x で前腕が前へ曲がる。膝(`kneeL/R`)は正の x で下腿が後ろへ曲がる。大腿(`legL/R`)は負の x で前へ上がる。

function rot(x: number, y = 0, z = 0): Rot3 {
  return { x, y, z };
}

/**
 * 関節の寸法(モックの値)。`render/character/skeleton.ts` へも `StageOptions.rig` として同じ値を渡す。
 * 腕は上腕 + 前腕(`upperArm + foreArm = armLength`)、脚は大腿 + 下腿(`thigh + shin = hipY`)。
 */
export const CHARACTER_RIG: CharacterRig = {
  hipX: 0.14,
  hipY: 0.5,
  torsoY: 0.55,
  shoulderX: 0.36,
  shoulderY: 0.48,
  headY: 0.98,
  armLength: 0.38,
  upperArm: 0.19,
  foreArm: 0.19,
  thigh: 0.25,
  shin: 0.25,
};

/**
 * 体型の寸法(m)。全身の高さ = 胴体の原点 + 頭の中心 + 頭頂までの距離(帽子の頂点を含む)、頭の高さ = 頭の楕円体の縦径(`render/character/head.ts` の
 * `HEAD_RADII` の y × 2)。身長の個人差は ×0.96〜1.04、頭の大きさは固定(character 分冊 §3-4-1)。全身 ÷ 頭 = 約 2.3 頭身で、全体格で 2.0〜2.6。
 */
export const CHARACTER_PROPORTION = {
  headTopAboveHead: 0.52,
  headHeight: 0.874,
  heightScale: { min: 0.96, max: 1.04 },
} as const;

/** 待機姿勢(モックの `poseIdle`)。腕は軽く下ろし、肘を少し曲げる。 */
export const IDLE_POSE: JointPose = jointPose({
  armL: rot(0.1, 0, 0.15),
  armR: rot(0.1, 0, -0.15),
  elbowL: rot(-0.25),
  elbowR: rot(-0.25),
});

// ---------- 投手(フォームの表は forms.ts) ----------

/** リリース後のフォロースルーの長さ(ゲーム ms)。`pitcherFollowPose(sinceReleaseMs)` はこの時間で 0〜1 に正規化する。 */
export const PITCHER_FOLLOW_MS = 400;

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
 * 頭は体のひねりを打ち消してボールを見続け、接触後に体に引かれる。構え(`at` = 0)は構えの種類(`forms.ts` の `batStanceKey`)で差し替わり、
 * 接触以降はすべての構えで共有する。
 */
export const BATTER_SWING_KEYS: Keyframes<BatterKey> = [
  {
    at: 0,
    ease: "linear",
    pose: {
      ...jointPose({
        torso: rot(0, -0.4, 0),
        head: rot(0, 1.37, 0),
        armL: rot(-1.1, 0, 0.5),
        armR: rot(-1.1, 0, -0.5),
        elbowL: rot(-0.6),
        elbowR: rot(-0.8),
        legR: rot(-0.15, 0, 0),
        kneeR: rot(0.3),
      }),
      sweepYaw: -1.9,
      tilt: -1.05,
    },
  },
  {
    at: SWING_CONTACT_PROGRESS,
    ease: "in",
    pose: {
      ...jointPose({
        head: rot(0.1, 1.05, 0),
        armL: rot(-1.3, 0, 0.5),
        armR: rot(-1.3, 0, -0.5),
        elbowL: rot(-0.25),
        elbowR: rot(-0.35),
        legR: rot(-0.3, 0, 0),
        kneeR: rot(0.55),
      }),
      sweepYaw: -0.1,
      tilt: -0.05,
    },
  },
  {
    at: 1,
    ease: "linear",
    pose: {
      ...jointPose({
        torso: rot(0, 0.6, 0),
        head: rot(0.1, 0.65, 0),
        armL: rot(-1.4, 0, 0.5),
        armR: rot(-1.4, 0, -0.5),
        elbowL: rot(-0.4),
        elbowR: rot(-0.5),
        legR: rot(-0.4, 0, 0),
        kneeR: rot(0.65),
      }),
      sweepYaw: 1.5,
      tilt: -0.1,
    },
  },
  {
    at: SWING_FOLLOW_END_PROGRESS,
    ease: "out",
    pose: {
      ...jointPose({
        torso: rot(0, 0.9, 0),
        head: rot(0.05, 0.5, 0),
        armL: rot(-1.8, 0, 0.35),
        armR: rot(-1.8, 0, -0.35),
        elbowL: rot(-1),
        elbowR: rot(-1.1),
        legR: rot(-0.45, 0, 0),
        kneeR: rot(0.7),
      }),
      sweepYaw: 2.2,
      tilt: -0.9,
    },
  },
];

const [landscapeStance, ...afterStance] = BATTER_SWING_KEYS;

/**
 * 縦長(縦横比の補間 k = 1)の構え。横長の構えは前の手(`armL`)がゾーン枠の左端より内側(画面で右)まで出て、縦長ではゾーン枠・
 * 守備の 5×5 格子に掛かる。縦長だけ、体の向きを開き(`torso.y` を −0.4 → 0.1)、両腕を下げて体の脇に引く(`arm.x` を −1.1 → −0.2、`arm.z` を ±0.5 → ±0.2)。
 * 肘は曲げて、前腕を体の前に出す。頭は体の向きとの合計(0.97)を横長と同じにして、ボールを見続ける。バットは横長と同じ。
 * スイングが進むと、接触(`SWING_CONTACT_PROGRESS`)以降の姿勢は横長と同じ値へ連続してつながる。
 */
export const BATTER_PORTRAIT_STANCE: BatterKey = {
  ...landscapeStance.pose,
  torso: rot(0, 0.1, 0),
  head: rot(0, 0.87, 0),
  armL: rot(-0.2, 0, 0.2),
  armR: rot(-0.15, 0, -0.2),
  elbowL: rot(-0.9),
  elbowR: rot(-1),
};

/** 縦長用のキーフレーム表。構え(`at` = 0)だけ `BATTER_PORTRAIT_STANCE` で、それ以降は `BATTER_SWING_KEYS` と同じ。`k` で横長の表と混ぜる。 */
export const BATTER_PORTRAIT_SWING_KEYS: Keyframes<BatterKey> = [{ ...landscapeStance, pose: BATTER_PORTRAIT_STANCE }, ...afterStance];

// ---------- 野手・捕手 ----------

/**
 * 走りの動き(モックの `runPose`: 脚は ±0.8、腕は ∓0.7 を角速度 14 rad/s の sin で振る)。前傾は走り出しから `leanRampMs` かけて入れる。
 * `kneeBend` = 脚が前へ振り出される間の膝の曲げ(最大 rad)、`elbow` = 走りの肘の曲げ(待機の肘から `leanRampMs` かけて移る)。
 */
export const RUN_MOTION = {
  cycleRadPerSec: 14,
  legSwing: 0.8,
  armSwing: 0.7,
  lean: 0.14,
  leanRampMs: 120,
  kneeBend: 1.1,
  elbow: -1.2,
} as const;

/** 捕手(中継カメラのときだけ表示される)。軽く前かがみで、左手のミットを前へ出し、膝を曲げて構える(足が地面から浮く分は `groundDropOf`)。 */
export const CATCHER_POSE: JointPose = jointPose({
  torso: rot(0.35, 0, 0),
  head: rot(-0.3, 0, 0),
  armL: rot(-1, 0, 0.3),
  armR: rot(-0.5, 0, -0.3),
  elbowL: rot(-0.5),
  elbowR: rot(-0.9),
  legL: rot(-0.6, 0, 0.3),
  legR: rot(-0.6, 0, -0.3),
  kneeL: rot(1),
  kneeR: rot(1),
});
