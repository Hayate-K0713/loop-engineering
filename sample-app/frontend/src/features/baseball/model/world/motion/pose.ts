import type { BatPose, BatterPose, CharacterPose, Rot3, Vec3 } from "../../../types/scene";

// モーションの基盤(キーフレームの型と補間)。`types/` だけに依存し、`space/` など他の world サブフォルダは import しない。
// 関節の回転は three の Euler(XYZ)と同義の rad。補間は明示フィールドごとに行い、添字アクセスを使わない。

/** 関節の回転だけのポーズ(足元の位置・向き・大きさは持たない)。配置は `placeCharacter` が足す。 */
export type JointPose = {
  readonly torso: Rot3;
  readonly head: Rot3;
  readonly armL: Rot3;
  readonly armR: Rot3;
  readonly legL: Rot3;
  readonly legR: Rot3;
};

/** 打者の関節ポーズ(関節 + バット)。 */
export type BatterJoints = JointPose & { readonly bat: BatPose };

/** キャラクターの足元の位置・向き(rad、y 軸まわり)・大きさ。配置は `WORLD_PARAMS` の値を呼び出し側が渡す。 */
export type PoseRoot = {
  readonly position: Vec3;
  readonly yaw: number;
  readonly scale: number;
};

/** 区間の補間カーブ。`linear` = 等速、`smooth` = 両端でゆっくり、`in` = 加速して終わる、`out` = 速く始まり減速して終わる。 */
export type KeyframeEase = "linear" | "smooth" | "in" | "out";

/**
 * キーフレーム。`at` は区間の位置(投手の windup は u、フォロースルーは 0〜1 の正規化時間、打者はスイングの progress)。
 * `ease` は「直前のキーフレームからこのキーフレームまで」の区間に掛けるカーブ。
 */
export type Keyframe<T> = {
  readonly at: number;
  readonly pose: T;
  readonly ease: KeyframeEase;
};

/** 先頭が必ず存在するキーフレーム表(`at` の昇順)。 */
export type Keyframes<T> = readonly [Keyframe<T>, ...Keyframe<T>[]];

/** `k` = 0 で `a`、`k` = 1 で `b` に厳密に一致する補間。 */
export type Lerp<T> = (a: T, b: T, k: number) => T;

/** `k` を 0〜1 に収める(NaN は 0)。 */
export function clamp01(k: number): number {
  return k > 0 ? Math.min(k, 1) : 0;
}

/** 端点で誤差が出ない線形補間(`k` = 0 で `a`、`k` = 1 で `b` に厳密に一致)。 */
export function mix(a: number, b: number, k: number): number {
  return a * (1 - k) + b * k;
}

/** 3k² − 2k³(0〜1 で単調、両端の傾きが 0)。 */
export function smoothstep(k: number): number {
  const x = clamp01(k);
  return x * x * (3 - 2 * x);
}

/** 区間内の進行度 `k`(0〜1)にカーブを掛ける。0 → 0、1 → 1 を保つ。 */
export function applyEase(ease: KeyframeEase, k: number): number {
  const x = clamp01(k);
  switch (ease) {
    case "smooth":
      return smoothstep(x);
    case "in":
      return x * x;
    case "out":
      return 1 - (1 - x) * (1 - x);
    default:
      return x;
  }
}

export function lerpRot(a: Rot3, b: Rot3, k: number): Rot3 {
  return { x: mix(a.x, b.x, k), y: mix(a.y, b.y, k), z: mix(a.z, b.z, k) };
}

/** 6関節をそれぞれ補間する。`k` = 0 で `a`、`k` = 1 で `b` と全フィールドが一致する。 */
export function lerpPose(a: JointPose, b: JointPose, k: number): JointPose {
  return {
    torso: lerpRot(a.torso, b.torso, k),
    head: lerpRot(a.head, b.head, k),
    armL: lerpRot(a.armL, b.armL, k),
    armR: lerpRot(a.armR, b.armR, k),
    legL: lerpRot(a.legL, b.legL, k),
    legR: lerpRot(a.legR, b.legR, k),
  };
}

/**
 * キーフレーム表を `at` で引く。表の範囲の外は端のポーズ。区間ごとに `ease` を掛けてから `lerp` で補間する。
 * `at` が同じキーフレームが並んでも(長さ 0 の区間)0 除算にならない(`at` がそれより後ろなら、後ろのキーフレームから補間する)。
 */
export function sampleKeyframes<T>(frames: Keyframes<T>, at: number, lerp: Lerp<T>): T {
  const [first, ...rest] = frames;
  if (!(at > first.at)) {
    return first.pose;
  }
  let prev = first;
  for (const next of rest) {
    if (at <= next.at) {
      const span = next.at - prev.at;
      return lerp(prev.pose, next.pose, applyEase(next.ease, span > 0 ? (at - prev.at) / span : 1));
    }
    prev = next;
  }
  return prev.pose;
}

/** 関節ポーズに足元の配置を足して、`SceneFrame` の `CharacterPose` にする。 */
export function placeCharacter(joints: JointPose, root: PoseRoot, visible = true): CharacterPose {
  return {
    visible,
    position: root.position,
    yaw: root.yaw,
    scale: root.scale,
    torso: joints.torso,
    head: joints.head,
    armL: joints.armL,
    armR: joints.armR,
    legL: joints.legL,
    legR: joints.legR,
  };
}

/** 打者の関節ポーズに足元の配置を足して、`SceneFrame` の `BatterPose` にする。 */
export function placeBatter(joints: BatterJoints, root: PoseRoot, visible = true): BatterPose {
  return { ...placeCharacter(joints, root, visible), bat: joints.bat };
}
