import type { Rot3, Vec3 } from "../../../types/scene";
import type { CharacterRig } from "../../../types/stage";
import type { BatStance, PitchForm } from "../../../types/team";
import { footPosition, inverseRotateEuler, rotateEuler } from "./fk";
import { jointPose, lerpPose, mix, sampleKeyframes, type JointPose, type Keyframes, type PoseRoot } from "./pose";
import { BATTER_PORTRAIT_STANCE, BATTER_SWING_KEYS, CHARACTER_RIG, IDLE_POSE, RUN_MOTION, type BatterKey } from "./rig";

// フォーム(姿勢の表と、それを引く純関数): 投球フォーム 3 種・打撃の構え 3 種・野手(待機・捕球・ゴロ捕球・送球)・走者(リード・走り・喜び)・感情のポーズ。
// 選手固有のフォーム(段階 M の `SignatureForm`)は `PitchFormParams`・`BatStanceParams` の値として受け取る(関数が `params` を引数に取る)。
// 既定の params は標準のフォームそのもので、params を渡さない呼び出しは従来どおり。`types/` だけに依存し、`space/` など他の world サブフォルダは import しない。
// 回転は three の Euler(XYZ)と同義の rad。向きと符号は `rig.ts` の冒頭のとおり(肘は負の x で曲がる・膝は正の x で曲がる・大腿は負の x で前へ上がる)。

function rot(x: number, y = 0, z = 0): Rot3 {
  return { x, y, z };
}

// ---------- 投球フォーム(3 種) ----------

/**
 * 投球フォームの調整値(段階 M の固有フォームが渡す)。windup の途中(足上げ・テイクバック)にだけ効き、リリースの姿勢・フォロースルーは変えない
 * (リリースの手先が `RELEASE_POINT` の 0.15m 以内という条件を守るため)。1 が標準。
 */
export type PitchFormParams = {
  /** 足上げ(大腿・膝)の倍率。 */
  readonly legLift: number;
  /** 体のひねり(胴・頭の y 回転)の倍率。 */
  readonly twist: number;
};

export const DEFAULT_PITCH_FORM_PARAMS: PitchFormParams = { legLift: 1, twist: 1 };

type PitchFormTable = {
  /** windup(u: 0〜1)。0 = 待機、1 = リリースの瞬間。 */
  readonly windup: Keyframes<JointPose>;
  /** リリース後(正規化時間 0〜1)。0 = リリースの瞬間。 */
  readonly follow: Keyframes<JointPose>;
};

/** 3 種のフォームのリリースの姿勢。右腕(`armR`/`elbowR`)の手先が `RELEASE_POINT`(`space/params.ts`)の 0.15m 以内(投手 scale 1.30・足元 (0, 0.25, −18.4))。 */
const OVER_RELEASE: JointPose = jointPose({
  torso: rot(0.25, 0.3, 0),
  head: rot(0.1, 0, 0),
  armL: rot(-0.9, 0, 0.4),
  elbowL: rot(-0.9),
  armR: rot(3.2, 0, 0.1),
  elbowR: rot(-0.15),
  legL: rot(-0.5),
  kneeL: rot(0.1),
  legR: rot(0.25),
  kneeR: rot(0.5),
});

const THREE_QUARTER_RELEASE: JointPose = jointPose({
  torso: rot(0.3, 0.45, -0.05),
  head: rot(0.1, -0.1, 0.05),
  armL: rot(-0.9, 0, 0.4),
  elbowL: rot(-0.9),
  armR: rot(3, 0, -0.3),
  elbowR: rot(-0.3),
  legL: rot(-0.55),
  kneeL: rot(0.1),
  legR: rot(0.3),
  kneeR: rot(0.6),
});

const SIDE_RELEASE: JointPose = jointPose({
  torso: rot(0.35, 0.6, -0.25),
  head: rot(0.1, -0.2, 0.2),
  armL: rot(-0.8, 0, 0.5),
  elbowL: rot(-0.8),
  armR: rot(2.6, 0, -0.6),
  elbowR: rot(-0.4),
  legL: rot(-0.6),
  kneeL: rot(0.1),
  legR: rot(0.3),
  kneeR: rot(0.7),
});

const PITCH_FORMS: Readonly<Record<PitchForm, PitchFormTable>> = {
  // オーバー: 高く足を上げ、腕を真上から振り下ろす。
  over: {
    windup: [
      { at: 0, ease: "linear", pose: IDLE_POSE },
      {
        at: 0.3,
        ease: "smooth",
        pose: jointPose({
          torso: rot(-0.1, -0.3, 0),
          armL: rot(-0.8, 0, -0.3),
          elbowL: rot(-1.1),
          armR: rot(-0.8, 0, 0.3),
          elbowR: rot(-1.1),
          legL: rot(-1.4),
          kneeL: rot(1.3),
          kneeR: rot(0.1),
        }),
      },
      {
        at: 0.62,
        ease: "smooth",
        pose: jointPose({
          torso: rot(-0.15, -0.7, 0),
          head: rot(0, 0.6, 0),
          armL: rot(-1.3, 0, 0.5),
          elbowL: rot(-0.3),
          armR: rot(2, 0, -0.4),
          elbowR: rot(-0.3),
          legL: rot(-0.9),
          kneeL: rot(0.3),
          legR: rot(0.1),
          kneeR: rot(0.2),
        }),
      },
      { at: 1, ease: "in", pose: OVER_RELEASE },
    ],
    follow: [
      { at: 0, ease: "linear", pose: OVER_RELEASE },
      {
        at: 0.3,
        ease: "linear",
        pose: jointPose({
          torso: rot(0.45, 0.5, 0),
          head: rot(0.1),
          armL: rot(-0.6, 0, 0.3),
          elbowL: rot(-0.6),
          armR: rot(4.6, 0, 0.3),
          elbowR: rot(-0.5),
          legL: rot(-0.45),
          kneeL: rot(0.3),
          legR: rot(0.45),
          kneeR: rot(0.9),
        }),
      },
      {
        at: 0.65,
        ease: "out",
        pose: jointPose({
          torso: rot(0.55, 0.6, 0),
          head: rot(0.15),
          armL: rot(-0.4, 0, 0.25),
          elbowL: rot(-0.5),
          armR: rot(5.5, 0, 0.35),
          elbowR: rot(-0.8),
          legL: rot(-0.4),
          kneeL: rot(0.2),
          legR: rot(0.6),
          kneeR: rot(1.2),
        }),
      },
      {
        at: 1,
        ease: "out",
        pose: jointPose({
          torso: rot(0.55, 0.6, 0),
          head: rot(0.15),
          armL: rot(-0.3, 0, 0.2),
          elbowL: rot(-0.5),
          armR: rot(5.9, 0, 0.35),
          elbowR: rot(-0.9),
          legL: rot(-0.4),
          kneeL: rot(0.2),
          legR: rot(0.6),
          kneeR: rot(1.2),
        }),
      },
    ],
  },
  // スリークォーター: 足上げは中くらい。腕は斜め上から、体は少し横へ傾く。
  "three-quarter": {
    windup: [
      { at: 0, ease: "linear", pose: IDLE_POSE },
      {
        at: 0.3,
        ease: "smooth",
        pose: jointPose({
          torso: rot(-0.1, -0.35, 0),
          armL: rot(-0.8, 0, -0.3),
          elbowL: rot(-1.1),
          armR: rot(-0.8, 0, 0.3),
          elbowR: rot(-1.1),
          legL: rot(-1.25),
          kneeL: rot(1.15),
          kneeR: rot(0.1),
        }),
      },
      {
        at: 0.62,
        ease: "smooth",
        pose: jointPose({
          torso: rot(-0.1, -0.75, 0.05),
          head: rot(0, 0.65, 0),
          armL: rot(-1.3, 0, 0.5),
          elbowL: rot(-0.3),
          armR: rot(1.8, 0, -0.7),
          elbowR: rot(-0.4),
          legL: rot(-0.9),
          kneeL: rot(0.3),
          legR: rot(0.1),
          kneeR: rot(0.2),
        }),
      },
      { at: 1, ease: "in", pose: THREE_QUARTER_RELEASE },
    ],
    follow: [
      { at: 0, ease: "linear", pose: THREE_QUARTER_RELEASE },
      {
        at: 0.3,
        ease: "linear",
        pose: jointPose({
          torso: rot(0.5, 0.65, -0.05),
          head: rot(0.1, -0.1, 0),
          armL: rot(-0.6, 0, 0.3),
          elbowL: rot(-0.6),
          armR: rot(4.2, 0, 0.1),
          elbowR: rot(-0.6),
          legL: rot(-0.45),
          kneeL: rot(0.3),
          legR: rot(0.5),
          kneeR: rot(0.95),
        }),
      },
      {
        at: 0.65,
        ease: "out",
        pose: jointPose({
          torso: rot(0.55, 0.8, 0),
          head: rot(0.15),
          armL: rot(-0.4, 0, 0.25),
          elbowL: rot(-0.5),
          armR: rot(5.1, 0, 0.25),
          elbowR: rot(-0.8),
          legL: rot(-0.4),
          kneeL: rot(0.2),
          legR: rot(0.6),
          kneeR: rot(1.2),
        }),
      },
      {
        at: 1,
        ease: "out",
        pose: jointPose({
          torso: rot(0.55, 0.8, 0),
          head: rot(0.15),
          armL: rot(-0.3, 0, 0.2),
          elbowL: rot(-0.5),
          armR: rot(5.5, 0, 0.3),
          elbowR: rot(-0.9),
          legL: rot(-0.4),
          kneeL: rot(0.2),
          legR: rot(0.6),
          kneeR: rot(1.2),
        }),
      },
    ],
  },
  // サイド: 足上げは低く、体を横へ大きく傾けて、腕を横から振る。
  side: {
    windup: [
      { at: 0, ease: "linear", pose: IDLE_POSE },
      {
        at: 0.3,
        ease: "smooth",
        pose: jointPose({
          torso: rot(-0.05, -0.4, -0.1),
          armL: rot(-0.8, 0, -0.3),
          elbowL: rot(-1.1),
          armR: rot(-0.8, 0, 0.3),
          elbowR: rot(-1.1),
          legL: rot(-1.05),
          kneeL: rot(0.95),
          kneeR: rot(0.1),
        }),
      },
      {
        at: 0.62,
        ease: "smooth",
        pose: jointPose({
          torso: rot(0, -0.9, -0.2),
          head: rot(0, 0.7, 0),
          armL: rot(-1.3, 0, 0.6),
          elbowL: rot(-0.3),
          armR: rot(1.4, 0, -1.1),
          elbowR: rot(-0.3),
          legL: rot(-0.85),
          kneeL: rot(0.3),
          legR: rot(0.1),
          kneeR: rot(0.2),
        }),
      },
      { at: 1, ease: "in", pose: SIDE_RELEASE },
    ],
    follow: [
      { at: 0, ease: "linear", pose: SIDE_RELEASE },
      {
        at: 0.3,
        ease: "linear",
        pose: jointPose({
          torso: rot(0.5, 0.85, -0.3),
          head: rot(0.1, -0.2, 0.1),
          armL: rot(-0.6, 0, 0.4),
          elbowL: rot(-0.6),
          armR: rot(3.4, 0, -0.1),
          elbowR: rot(-0.7),
          legL: rot(-0.5),
          kneeL: rot(0.3),
          legR: rot(0.5),
          kneeR: rot(1),
        }),
      },
      {
        at: 0.65,
        ease: "out",
        pose: jointPose({
          torso: rot(0.55, 1, -0.2),
          head: rot(0.15),
          armL: rot(-0.4, 0, 0.3),
          elbowL: rot(-0.5),
          armR: rot(4.3, 0, 0.2),
          elbowR: rot(-0.9),
          legL: rot(-0.4),
          kneeL: rot(0.2),
          legR: rot(0.6),
          kneeR: rot(1.2),
        }),
      },
      {
        at: 1,
        ease: "out",
        pose: jointPose({
          torso: rot(0.55, 1, -0.2),
          head: rot(0.15),
          armL: rot(-0.3, 0, 0.25),
          elbowL: rot(-0.5),
          armR: rot(4.7, 0, 0.3),
          elbowR: rot(-1),
          legL: rot(-0.4),
          kneeL: rot(0.2),
          legR: rot(0.6),
          kneeR: rot(1.2),
        }),
      },
    ],
  },
};

/** windup の途中のキーフレーム(`at` が 0 と 1 の間)にだけ、足上げ・ひねりの調整を掛ける。端(待機・リリース)は変えない。 */
function withPitchParams(frames: Keyframes<JointPose>, params: PitchFormParams): Keyframes<JointPose> {
  if (params.legLift === 1 && params.twist === 1) return frames;
  const [first, ...rest] = frames;
  return [
    first,
    ...rest.map((frame) => {
      if (frame.at >= 1) return frame;
      const { pose } = frame;
      const adjusted: JointPose = {
        ...pose,
        torso: rot(pose.torso.x, pose.torso.y * params.twist, pose.torso.z),
        head: rot(pose.head.x, pose.head.y * params.twist, pose.head.z),
        legL: rot(pose.legL.x * params.legLift, pose.legL.y, pose.legL.z),
        kneeL: rot(pose.kneeL.x * params.legLift, pose.kneeL.y, pose.kneeL.z),
      };
      return { ...frame, pose: adjusted };
    }),
  ];
}

function pitchFormTable(form: PitchForm): PitchFormTable {
  switch (form) {
    case "over":
      return PITCH_FORMS.over;
    case "three-quarter":
      return PITCH_FORMS["three-quarter"];
    case "side":
      return PITCH_FORMS.side;
  }
}

/** 投球フォームの windup の表(`u` で引く)。 */
export function pitchWindupKeys(form: PitchForm, params: PitchFormParams = DEFAULT_PITCH_FORM_PARAMS): Keyframes<JointPose> {
  return withPitchParams(pitchFormTable(form).windup, params);
}

/** 投球フォームのフォロースルーの表(正規化時間で引く)。 */
export function pitchFollowKeys(form: PitchForm): Keyframes<JointPose> {
  return pitchFormTable(form).follow;
}

// ---------- 打撃の構え(3 種) ----------

/**
 * 構えの調整値(段階 M の固有フォームが渡す)。構えのキーフレーム(`at` = 0)にだけ効き、接触以降のスイングは変えない。0 が標準。
 */
export type BatStanceParams = {
  /** 足の開きの追加(rad。両脚を左右へ開く)。 */
  readonly spread: number;
  /** 構えのバットの傾きの追加(rad。`BatPose.tilt`)。 */
  readonly batTilt: number;
  /** 手の高さの追加(rad。両腕を前へ上げる)。 */
  readonly handLift: number;
  /** 目線の追加(rad。頭の x 回転。負で上を見る)。 */
  readonly gaze: number;
};

export const DEFAULT_BAT_STANCE_PARAMS: BatStanceParams = { spread: 0, batTilt: 0, handLift: 0, gaze: 0 };

type StanceShape = {
  /** 体を投手側へ開く量(rad。頭が打ち消す)。 */
  readonly yaw: number;
  /** 前傾(rad。頭が打ち消す)。 */
  readonly lean: number;
  /** 膝の曲げ(rad。左右対称)。 */
  readonly bend: number;
  /** 足の開き(rad)。 */
  readonly spread: number;
  /** 前の手(`armL`)・後ろの手(`armR`)の肩の x 回転の差(rad。正で後ろへ引く)と、後ろの手の肘の差(rad)。 */
  readonly armL: number;
  readonly armR: number;
  readonly elbowR: number;
};

/**
 * 構えごとの標準(スクエア)の姿勢からの差。開く(`open`)と右肩が前へ出て手が格子に近づくので、後ろの手を引く。
 * 縦長の構図で手・肘・腕がゾーン枠・5×5 格子に 4px 以上の余白を取る値(`forms.test.ts` が全 5 画面で検査)。
 */
const STANCE_SHAPE: Readonly<Record<BatStance, StanceShape>> = {
  square: { yaw: 0, lean: 0, bend: 0, spread: 0, armL: 0, armR: 0, elbowR: 0 },
  open: { yaw: 0.45, lean: 0, bend: 0.12, spread: 0.1, armL: -0.1, armR: 0.35, elbowR: 0.3 },
  crouch: { yaw: -0.1, lean: 0.3, bend: 0.5, spread: 0.12, armL: 0.2, armR: 0, elbowR: 0 },
};

function stanceShapeOf(stance: BatStance): StanceShape {
  switch (stance) {
    case "square":
      return STANCE_SHAPE.square;
    case "open":
      return STANCE_SHAPE.open;
    case "crouch":
      return STANCE_SHAPE.crouch;
  }
}

function isNeutralStance(stance: BatStance, params: BatStanceParams): boolean {
  return stance === "square" && params.spread === 0 && params.batTilt === 0 && params.handLift === 0 && params.gaze === 0;
}

/** 標準の構え `base`(スクエア)に、構えの種類と調整値を掛けた構え。 */
function shapeStance(base: BatterKey, stance: BatStance, params: BatStanceParams): BatterKey {
  const shape = stanceShapeOf(stance);
  const spread = shape.spread + params.spread;
  return {
    ...base,
    torso: rot(base.torso.x + shape.lean, base.torso.y + shape.yaw, base.torso.z),
    head: rot(base.head.x - shape.lean * 0.8 + params.gaze, base.head.y - shape.yaw, base.head.z),
    armL: rot(base.armL.x + shape.armL - params.handLift, base.armL.y, base.armL.z),
    armR: rot(base.armR.x + shape.armR - params.handLift, base.armR.y, base.armR.z),
    elbowR: rot(base.elbowR.x + shape.elbowR, base.elbowR.y, base.elbowR.z),
    legL: rot(base.legL.x - shape.bend, base.legL.y, base.legL.z + spread),
    legR: rot(base.legR.x - shape.bend, base.legR.y, base.legR.z - spread),
    kneeL: rot(base.kneeL.x + shape.bend * 2, base.kneeL.y, base.kneeL.z),
    kneeR: rot(base.kneeR.x + shape.bend * 2, base.kneeR.y, base.kneeR.z),
    tilt: base.tilt + params.batTilt,
  };
}

/**
 * 構えのキーフレーム(`at` = 0)の姿勢。`portrait` は縦長(手を下げて体に引く構え)か横長か。
 * `square` と既定の調整値は標準の構え(`BATTER_SWING_KEYS` の先頭 / `BATTER_PORTRAIT_STANCE`)そのもの。
 * `open` は体を投手側へ開いて足を広げ、`crouch` は前傾して膝を曲げる。縦長の構図でゾーン枠・5×5 格子に手が掛からない(`forms.test.ts` が検査)。
 */
export function batStanceKey(stance: BatStance, portrait: boolean, params: BatStanceParams = DEFAULT_BAT_STANCE_PARAMS): BatterKey {
  const base = portrait ? BATTER_PORTRAIT_STANCE : BATTER_SWING_KEYS[0].pose;
  return isNeutralStance(stance, params) ? base : shapeStance(base, stance, params);
}

// ---------- 足元の高さ ----------

/**
 * 立ち姿勢(脚がまっすぐ)に対して足が地面から浮く高さ(root の座標系の m。0 以上)。膝を曲げる姿勢は骨盤の高さが固定なので足が浮く。
 * 根を `drop × scale` だけ下げて描くと、低い方の足が地面に着く。しゃがむ・かがむ姿勢(捕手・ゴロ捕球・構え)で呼び出し側が使う。
 */
export function groundDropOf(pose: JointPose, rig: CharacterRig = CHARACTER_RIG): number {
  const origin: PoseRoot = { position: { x: 0, y: 0, z: 0 }, yaw: 0, scale: 1 };
  const left = footPosition(pose, rig, origin, "L").y;
  const right = footPosition(pose, rig, origin, "R").y;
  return Math.max(0, Math.min(left, right));
}

// ---------- 腕の IK(捕球のグローブを目標点へ届かせる) ----------

/** `v` を `[-1, 1]` に収める(`Math.asin`・`Math.acos` の定義域)。 */
function clampUnit(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

/**
 * 解析的な 2 ボーン IK。胴体の座標系で、肩 → 目標点のベクトル `delta` に手先が届くように、肩(`arm`)と肘(`elbow`)の回転を返す。
 * 肘は前へ曲げる(`elbow.x ≤ 0`)。`delta` の長さが腕の長さを超えると、腕をまっすぐ伸ばして方向だけ合わせる(届かない)。
 * 肩の回転は `Rx(a) · Rz(c)`(y 回転なし): 横方向の成分を z 回転で、前後・上下の成分を x 回転で合わせる。
 */
function reachArm(delta: Vec3, rig: CharacterRig): { readonly arm: Rot3; readonly elbow: Rot3 } {
  const upper = rig.upperArm;
  const fore = rig.foreArm;
  const length = Math.hypot(delta.x, delta.y, delta.z);
  const dist = Math.min(Math.max(length, Math.abs(upper - fore) + 1e-6), upper + fore);
  const scale = length > 0 ? dist / length : 0;
  const d: Vec3 = { x: delta.x * scale, y: delta.y * scale, z: delta.z * scale };
  const cosElbow = clampUnit((dist * dist - upper * upper - fore * fore) / (2 * upper * fore));
  const elbow = -Math.acos(cosElbow);
  const along = upper + fore * cosElbow;
  const roll = Math.asin(clampUnit(d.x / along));
  const bent = Math.atan2(-fore * Math.sin(elbow), -along * Math.cos(roll));
  const pitch = Math.atan2(d.z, d.y) - bent;
  return { arm: rot(pitch, 0, roll), elbow: rot(elbow) };
}

/** 目標点(ワールド)を root(足元の位置・yaw・scale。足が地面に着く位置)の座標系へ。`lift` = 根を下げる分(`groundDropOf`)だけ目標が相対的に上がる。 */
function targetInRoot(root: PoseRoot, target: Vec3, lift: number): Vec3 {
  const rel = { x: target.x - root.position.x, y: target.y - root.position.y, z: target.z - root.position.z };
  const unturned = rotateEuler(rel, rot(0, -root.yaw, 0));
  return { x: unturned.x / root.scale, y: unturned.y / root.scale + lift, z: unturned.z / root.scale };
}

/** 左手のグローブを `target`(ワールド)に届かせる肩・肘の回転。`torso` は胴体の回転(根を `lift` だけ下げて描く前提)。 */
function gloveArm(root: PoseRoot, torso: Rot3, target: Vec3, lift: number, rig: CharacterRig): { readonly arm: Rot3; readonly elbow: Rot3 } {
  const local = targetInRoot(root, target, lift);
  const inTorso = inverseRotateEuler({ x: local.x, y: local.y - rig.torsoY, z: local.z }, torso);
  return reachArm({ x: inTorso.x - rig.shoulderX, y: inTorso.y - rig.shoulderY, z: inTorso.z }, rig);
}

/**
 * 胴体の向き(y 回転): 左肩(グローブ側。胴体の横 +shoulderX)が目標へ向くように体をひねる。左肩から目標までの横方向の成分が 0 になる
 * ひねりで、腕を前へ伸ばすだけで届く(横へ大きく振らない)。目標が肩の幅より近いときは `acos` の引数を 1 に収める。±`TWIST_LIMIT` に収める。
 */
function twistToward(local: Vec3, rig: CharacterRig): number {
  const horizontal = Math.hypot(local.x, local.z);
  const ratio = horizontal > 0 ? Math.min(1, rig.shoulderX / horizontal) : 1;
  return Math.max(-TWIST_LIMIT, Math.min(TWIST_LIMIT, Math.acos(ratio) - Math.atan2(local.z, local.x)));
}

/** 胴体のひねりの上限(rad)。 */
const TWIST_LIMIT = 1.1;

/** 頭の向き: 目標点を見る(頭の絶対の方位・仰角が目標に近づく。胴のひねり・前傾分を引く)。 */
function lookAt(local: Vec3, torso: Rot3, rig: CharacterRig): Rot3 {
  const elevation = Math.atan2(local.y - (rig.torsoY + rig.headY), Math.max(0.05, Math.hypot(local.x, local.z)));
  const bearing = Math.atan2(local.x, local.z);
  return rot(Math.max(-0.7, Math.min(0.7, -elevation - torso.x)), Math.max(-1, Math.min(1, bearing - torso.y)), 0);
}

/** 野手の待機(構え): 軽く前傾し、膝を曲げ、両手を膝の前へ下ろす。足が浮く分は `groundDropOf`。 */
export function fielderReadyPose(): JointPose {
  return jointPose({
    torso: rot(0.45),
    head: rot(-0.4),
    armL: rot(-0.7, 0, 0.1),
    armR: rot(-0.7, 0, -0.1),
    elbowL: rot(-0.3),
    elbowR: rot(-0.3),
    legL: rot(-0.5, 0, 0.12),
    legR: rot(-0.5, 0, -0.12),
    kneeL: rot(1),
    kneeR: rot(1),
  });
}

/**
 * フライ・ライナーの捕球。左手のグローブを `target`(ワールドの落下点)へ上げる(届く範囲なら手先が目標に一致する)。
 * `root` は足が地面に着く位置・向き・拡大率。右手は胴の前へ添え、頭は目標を見る。足が浮く分は `groundDropOf`(この関数の IK はその分を見込んである)。
 */
export function fielderCatchPose(root: PoseRoot, target: Vec3, rig: CharacterRig = CHARACTER_RIG): JointPose {
  const legs = { legL: rot(-0.3, 0, 0.1), legR: rot(-0.3, 0, -0.1), kneeL: rot(0.6), kneeR: rot(0.6) };
  const lift = groundDropOf(jointPose(legs), rig);
  const local = targetInRoot(root, target, lift);
  const torso = rot(-0.1, twistToward(local, rig), 0);
  const glove = gloveArm(root, torso, target, lift, rig);
  return jointPose({
    ...legs,
    torso,
    head: lookAt(local, torso, rig),
    armL: glove.arm,
    elbowL: glove.elbow,
    armR: rot(-0.6, 0, -0.45),
    elbowR: rot(-0.9),
  });
}

/** ゴロの捕球。深くかがみ(前傾・膝を曲げる)、左手のグローブを `target`(ワールド。地面近く)へ下ろす。足が浮く分は `groundDropOf`。 */
export function fielderGroundCatchPose(root: PoseRoot, target: Vec3, rig: CharacterRig = CHARACTER_RIG): JointPose {
  const legs = { legL: rot(-1.2, 0, 0.12), legR: rot(-1.2, 0, -0.12), kneeL: rot(2.2), kneeR: rot(2.2) };
  const lift = groundDropOf(jointPose(legs), rig);
  const local = targetInRoot(root, target, lift);
  const torso = rot(1.2, twistToward(local, rig), 0);
  const glove = gloveArm(root, torso, target, lift, rig);
  return jointPose({
    ...legs,
    torso,
    head: lookAt(local, torso, rig),
    armL: glove.arm,
    elbowL: glove.elbow,
    armR: rot(-0.9, 0, -0.3),
    elbowR: rot(-0.6),
  });
}

/** 送球(オーバースロー)の動き。`u` = 0 が構え(ボールを持った右手を胸の前に)、1 がリリース、1〜1.5 がフォロースルー。範囲外は端に収める。 */
const FIELDER_THROW_KEYS: Keyframes<JointPose> = [
  {
    at: 0,
    ease: "linear",
    pose: jointPose({
      torso: rot(0.1, -0.2),
      armL: rot(-0.9, 0, 0.3),
      elbowL: rot(-0.7),
      armR: rot(-0.8, 0, -0.2),
      elbowR: rot(-1.3),
      legL: rot(-0.2),
      kneeL: rot(0.4),
      kneeR: rot(0.3),
    }),
  },
  {
    at: 0.45,
    ease: "smooth",
    pose: jointPose({
      torso: rot(-0.1, -0.8),
      head: rot(0, 0.6, 0),
      armL: rot(-1.3, 0, 0.5),
      elbowL: rot(-0.3),
      armR: rot(2, 0, -0.5),
      elbowR: rot(-0.3),
      legL: rot(-0.7),
      kneeL: rot(0.5),
      kneeR: rot(0.3),
    }),
  },
  {
    at: 1,
    ease: "in",
    pose: jointPose({
      torso: rot(0.25, 0.4),
      head: rot(0.1),
      armL: rot(-0.9, 0, 0.4),
      elbowL: rot(-0.9),
      armR: rot(3.1, 0, 0.1),
      elbowR: rot(-0.2),
      legL: rot(-0.5),
      kneeL: rot(0.1),
      legR: rot(0.25),
      kneeR: rot(0.5),
    }),
  },
  {
    at: 1.5,
    ease: "out",
    pose: jointPose({
      torso: rot(0.5, 0.6),
      head: rot(0.15),
      armL: rot(-0.4, 0, 0.25),
      elbowL: rot(-0.5),
      armR: rot(5.2, 0, 0.3),
      elbowR: rot(-0.8),
      legL: rot(-0.4),
      kneeL: rot(0.2),
      legR: rot(0.6),
      kneeR: rot(1.1),
    }),
  },
];

export function fielderThrowPose(u: number): JointPose {
  return sampleKeyframes(FIELDER_THROW_KEYS, Number.isNaN(u) ? 0 : Math.max(0, Math.min(1.5, u)), lerpPose);
}

// ---------- 走者 ----------

/** 走者のリード(塁から半歩出て、膝を曲げて前傾し、いつでも走り出せる構え)。足が浮く分は `groundDropOf`。 */
export function runnerLeadPose(): JointPose {
  return jointPose({
    torso: rot(0.3, 0.5),
    head: rot(-0.2, -0.5),
    armL: rot(-0.3, 0, 0.2),
    armR: rot(-0.3, 0, -0.2),
    elbowL: rot(-0.8),
    elbowR: rot(-0.8),
    legL: rot(-0.45, 0, 0.18),
    legR: rot(-0.25, 0, -0.18),
    kneeL: rot(0.9),
    kneeR: rot(0.5),
  });
}

/** 走者の走り(`timeMs` は走り出しからの経過)。野手より前傾が深く、腕を大きく曲げて振る。`runnerRunPose(0)` は待機姿勢と同じ。 */
export function runnerRunPose(timeMs: number): JointPose {
  const t = timeMs > 0 ? timeMs : 0;
  const ramp = Math.min(1, t / RUN_MOTION.leanRampMs);
  const swing = Math.sin((t / 1000) * RUN_MOTION.cycleRadPerSec);
  const elbow = rot(mix(IDLE_POSE.elbowL.x, RUN_MOTION.elbow, ramp));
  return jointPose({
    torso: rot(mix(0, 0.3, ramp)),
    head: rot(mix(0, -0.15, ramp)),
    armL: rot(IDLE_POSE.armL.x - 0.9 * swing, IDLE_POSE.armL.y, IDLE_POSE.armL.z),
    armR: rot(IDLE_POSE.armR.x + 0.9 * swing, IDLE_POSE.armR.y, IDLE_POSE.armR.z),
    elbowL: elbow,
    elbowR: elbow,
    legL: rot(0.9 * swing),
    legR: rot(0 - 0.9 * swing),
    kneeL: rot(RUN_MOTION.kneeBend * Math.max(0, -swing)),
    kneeR: rot(RUN_MOTION.kneeBend * Math.max(0, swing)),
  });
}

/** 得点の喜び(両腕を高く上げ、小さく振って弾む)。`timeMs` は喜びの開始からの経過。 */
export function runnerJoyPose(timeMs: number): JointPose {
  const t = timeMs > 0 ? timeMs : 0;
  const pump = 0.18 * Math.sin((t / 1000) * 9);
  return jointPose({
    head: rot(-0.2),
    armL: rot(3 + pump, 0, 0.55),
    armR: rot(3 - pump, 0, -0.55),
    elbowL: rot(-0.35),
    elbowR: rot(-0.35),
    legL: rot(-0.1, 0, 0.1),
    legR: rot(-0.1, 0, -0.1),
    kneeL: rot(0.2 + 0.2 * Math.max(0, pump)),
    kneeR: rot(0.2 + 0.2 * Math.max(0, -pump)),
  });
}

// ---------- 感情のポーズ ----------

/** うなだれる(三振の打者・打たれた投手): 胴と頭を前へ倒し、腕を力なく下げる。 */
export function dejectedPose(): JointPose {
  return jointPose({
    torso: rot(0.45),
    head: rot(0.5),
    armL: rot(0.15, 0, 0.12),
    armR: rot(0.15, 0, -0.12),
    elbowL: rot(-0.2),
    elbowR: rot(-0.2),
    legL: rot(0, 0, 0.06),
    legR: rot(0, 0, -0.06),
  });
}

/** ガッツポーズ(抑えた投手): 右の拳を肘を曲げて引き上げ、胸を張る。 */
export function fistPumpPose(): JointPose {
  return jointPose({
    torso: rot(-0.1, 0.2),
    head: rot(-0.2),
    armL: rot(0.1, 0, 0.15),
    elbowL: rot(-0.3),
    armR: rot(2.9, 0, -0.25),
    elbowR: rot(-1.5),
    legL: rot(0, 0, 0.08),
    legR: rot(0, 0, -0.08),
  });
}
