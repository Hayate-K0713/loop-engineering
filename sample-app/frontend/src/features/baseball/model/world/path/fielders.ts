import type { PlateOutcome } from "../../../types/batting";
import type { Vec3 } from "../../../types/scene";
import { clamp } from "../../pitch/zone";
import { WORLD_PARAMS } from "../space/params";
import { distanceXZ, lerpVec3 } from "../space/vec3";
import { baseWorldPosition } from "./runners";

// 野手7人の守備位置と、打球に対する最寄りの野手・走行の位置。
// 加えて、結果ごとの守備の演出(捕球・ゴロ捕球・送球。表示専用で、判定には関与しない)の表と計画(`planFielding`)。
// 計画の時計: t = 0 は「打球が野手に届く(落下・捕球する)時刻」で、`runners.ts` の `planRunners` と同じ。

export type FielderId = "first" | "second" | "shortstop" | "third" | "left" | "center" | "right";

export type FielderSlot = {
  readonly id: FielderId;
  /** 守備位置(足元。y = 0)。 */
  readonly position: Vec3;
};

const POSITIONS = WORLD_PARAMS.fielders;

function slot(id: FielderId, position: { readonly x: number; readonly z: number }): FielderSlot {
  return { id, position: { x: position.x, y: 0, z: position.z } };
}

/** 野手7人(固定順: 一塁・二塁・遊撃・三塁・左・中・右)。`SceneFrame.fielders` の添字と一致する。 */
export const FIELDER_SLOTS: readonly FielderSlot[] = [
  slot("first", POSITIONS.first),
  slot("second", POSITIONS.second),
  slot("shortstop", POSITIONS.shortstop),
  slot("third", POSITIONS.third),
  slot("left", POSITIONS.left),
  slot("center", POSITIONS.center),
  slot("right", POSITIONS.right),
];

/** 落下点 `target` に水平距離(XZ)が最も近い野手の添字。同じ距離なら添字の小さい方。 */
export function pickFielder(target: Vec3): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  FIELDER_SLOTS.forEach((fielder, index) => {
    const distance = distanceXZ(fielder.position, target);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

/** 野手の走行中の位置。`progress`(0〜1 にクランプ)で `from` から `to` へ線形に進む。 */
export function fielderRunAt(from: Vec3, to: Vec3, progress: number): Vec3 {
  return lerpVec3(from, to, clamp(progress, 0, 1));
}

/** 野手の演出。`catch` = グローブを落下点へ上げる(フライ・ライナー)、`scoop` = かがんで捕る(ゴロ)、`field` = 追いついて止まる(安打・失策)。 */
export type FieldingPose = "catch" | "scoop" | "field";

/** 送球の演出。`first` = 一塁へ 1 回、`double-play` = 二塁→一塁の 2 回、`none` = 送球しない。 */
export type ThrowStyle = "none" | "first" | "double-play";

/** 結果ごとの守備の演出。`pose: null` は野手が動かない結果(四球・三振・ホームラン)。 */
export type FieldingStyle = { readonly pose: FieldingPose | null; readonly throws: ThrowStyle };

/**
 * 結果ごとの演出の表。フライ/ライナーのアウト = 捕球、ゴロのアウト = ゴロ捕球 → 一塁へ送球、併殺 = ゴロ捕球 → 二塁 → 一塁の 2 回送球、
 * 安打・失策 = 追いつくだけで送球しない、四球・三振・ホームラン = 野手は動かさない。
 */
export function fieldingStyleOf(plate: PlateOutcome): FieldingStyle {
  switch (plate) {
    case "walk":
    case "strikeout":
    case "homerun":
      return { pose: null, throws: "none" };
    case "groundout":
      return { pose: "scoop", throws: "first" };
    case "doublePlay":
      return { pose: "scoop", throws: "double-play" };
    case "flyout":
    case "lineout":
      return { pose: "catch", throws: "none" };
    case "single":
    case "double":
    case "triple":
    case "error":
      return { pose: "field", throws: "none" };
  }
}

/**
 * 守備の時間・高さの定数(表示専用)。`scoopMs` = 捕ってから投げ始めるまで、`pivotMs` = 二塁での持ち替え、`unassistedMs` = 一塁手が捕って自分で塁を踏むまで、
 * `throwSpeedMps` = 送球の速さ、`minThrowMs`/`maxThrowMs` = 1 回の送球の長さの範囲、`releaseY`/`catchY` = ボールの高さ(m)、
 * `arcRatio` = 送球の山(距離に対する比)、`arcMaxM` = 山の上限、`retireMarginMs` = アウトの成立から、打者走者が一塁に着く時刻(`runners.msPerBase`)までの最低の余裕(これを割るときは併殺の送球を詰める)。
 */
export const FIELDING = {
  scoopMs: 200,
  pivotMs: 100,
  unassistedMs: 400,
  throwSpeedMps: 45,
  minThrowMs: 250,
  maxThrowMs: 800,
  releaseY: 1.5,
  catchY: 1.3,
  arcRatio: 0.04,
  arcMaxM: 1.5,
  retireMarginMs: 150,
} as const;

/** 1 回の送球。`from`/`to` はボールの始点・終点(高さ込み)、`fromIndex`/`toIndex` は投げる・受ける野手(`FIELDER_SLOTS` の添字)、`target` は送球先の塁。 */
export type ThrowPlan = {
  readonly fromIndex: number;
  readonly toIndex: number;
  readonly target: 1 | 2;
  readonly from: Vec3;
  readonly to: Vec3;
  readonly startMs: number;
  readonly arriveMs: number;
  /** 始点と終点を結ぶ直線からの山の高さ(m)。 */
  readonly peak: number;
};

/** アウトの成立。`slot` = 走者スロット(0 = 打者走者、1 = 一塁走者)、`atMs` = 成立の時刻(捕球または送球の到着)。 */
export type RetireEvent = { readonly slot: 0 | 1; readonly atMs: number };

/**
 * 守備の計画。`fielderIndex` が打球を処理し、`stop` はその足元(落下点 × `stopRatio`。`play-plan` の野手の到達点と同じ)、
 * `pose` は t = 0 でとるポーズ。`throws` は時刻順、`retires` はアウトの成立。`endMs` = 最後の出来事の時刻。
 */
export type FieldingPlan = {
  readonly pose: FieldingPose;
  readonly fielderIndex: number;
  readonly stop: Vec3;
  readonly throws: readonly ThrowPlan[];
  readonly retires: readonly RetireEvent[];
  readonly endMs: number;
};

/** 野手が打球を処理する足元(落下点 × `stopRatio`)。 */
export function fielderStopPoint(landing: Vec3): Vec3 {
  const { stopRatio } = WORLD_PARAMS.fielderRun;
  return { x: landing.x * stopRatio, y: 0, z: landing.z * stopRatio };
}

const FIRST_BASEMAN = 0;
const SECOND_BASEMAN = 1;
const SHORTSTOP = 2;

/** 送球の長さ(ms)。距離 ÷ 速さを `minThrowMs`〜`maxThrowMs` に収める。 */
function throwDurationMs(from: Vec3, to: Vec3): number {
  return clamp((distanceXZ(from, to) / FIELDING.throwSpeedMps) * 1000, FIELDING.minThrowMs, FIELDING.maxThrowMs);
}

function throwBetween(fromIndex: number, toIndex: number, target: 1 | 2, from: Vec3, startMs: number, durationMs: number): ThrowPlan {
  const base = baseWorldPosition(target);
  const distance = distanceXZ(from, base);
  return {
    fromIndex,
    toIndex,
    target,
    from: { x: from.x, y: FIELDING.releaseY, z: from.z },
    to: { x: base.x, y: FIELDING.catchY, z: base.z },
    startMs,
    arriveMs: startMs + durationMs,
    peak: Math.min(FIELDING.arcRatio * distance, FIELDING.arcMaxM),
  };
}

/** ゴロのアウト: 一塁手が捕れば自分で塁を踏む(送球なし)。それ以外は一塁へ 1 回送球し、一塁手が捕る。 */
function groundOutPlan(fielderIndex: number, stop: Vec3): Pick<FieldingPlan, "throws" | "retires"> {
  if (fielderIndex === FIRST_BASEMAN) {
    return { throws: [], retires: [{ slot: 0, atMs: FIELDING.scoopMs + FIELDING.unassistedMs }] };
  }
  const duration = throwDurationMs(stop, baseWorldPosition(1));
  const toFirst = throwBetween(fielderIndex, FIRST_BASEMAN, 1, stop, FIELDING.scoopMs, duration);
  return { throws: [toFirst], retires: [{ slot: 0, atMs: toFirst.arriveMs }] };
}

/** 併殺: 二塁へ送球(二塁手が捕ったときは遊撃手が二塁へ入る)→ 持ち替えて一塁へ送球。打者走者のアウトが一塁走者のアウトより後。 */
function doublePlayPlan(fielderIndex: number, stop: Vec3): Pick<FieldingPlan, "throws" | "retires"> {
  const second = baseWorldPosition(2);
  const pivotIndex = fielderIndex === SECOND_BASEMAN ? SHORTSTOP : SECOND_BASEMAN;
  const firstMs = throwDurationMs(stop, second);
  const secondMs = throwDurationMs(second, baseWorldPosition(1));
  const available = WORLD_PARAMS.runners.msPerBase - FIELDING.retireMarginMs - FIELDING.scoopMs;
  const scale = Math.min(1, available / (firstMs + FIELDING.pivotMs + secondMs));
  const toSecond = throwBetween(fielderIndex, pivotIndex, 2, stop, FIELDING.scoopMs, firstMs * scale);
  const toFirst = throwBetween(pivotIndex, FIRST_BASEMAN, 1, second, toSecond.arriveMs + FIELDING.pivotMs * scale, secondMs * scale);
  return {
    throws: [toSecond, toFirst],
    retires: [
      { slot: 1, atMs: toSecond.arriveMs },
      { slot: 0, atMs: toFirst.arriveMs },
    ],
  };
}

function outsOf(style: FieldingStyle, fielderIndex: number, stop: Vec3): Pick<FieldingPlan, "throws" | "retires"> {
  switch (style.throws) {
    case "first":
      return groundOutPlan(fielderIndex, stop);
    case "double-play":
      return doublePlayPlan(fielderIndex, stop);
    case "none":
      return { throws: [], retires: style.pose === "catch" ? [{ slot: 0, atMs: 0 }] : [] };
  }
}

/**
 * 結果 `plate` の守備の計画。`landing` は打球の落下点(`BattedPlan.end`)。野手が動かない結果(四球・三振・ホームラン)は `null`。
 * 野手は `pickFielder(landing)` で決まる。フライ/ライナーは捕球した瞬間にアウト(t = 0)、ゴロは送球(または一塁手の踏塁)の到着でアウト、
 * 安打・失策は追いつくだけ(送球なし)。ボールが走者より先に着くよう、アウトの成立は走者の到着の `retireMarginMs` 以上前に収める。
 */
export function planFielding(plate: PlateOutcome, landing: Vec3): FieldingPlan | null {
  const style = fieldingStyleOf(plate);
  if (style.pose === null) {
    return null;
  }
  const fielderIndex = pickFielder(landing);
  const stop = fielderStopPoint(landing);
  const outs = outsOf(style, fielderIndex, stop);
  const endMs = Math.max(0, ...outs.throws.map((entry) => entry.arriveMs), ...outs.retires.map((entry) => entry.atMs));
  return { pose: style.pose, fielderIndex, stop, ...outs, endMs };
}

/** 送球のボールの位置。`startMs` 前は始点、`arriveMs` 後は終点に留まる(表示の出し入れは呼び出し側)。始点と終点を結ぶ線から放物線の山 `peak` だけ持ち上がる。 */
export function throwBallAt(plan: ThrowPlan, tMs: number): Vec3 {
  const progress = clamp((tMs - plan.startMs) / (plan.arriveMs - plan.startMs), 0, 1);
  const point = lerpVec3(plan.from, plan.to, progress);
  return { x: point.x, y: point.y + 4 * plan.peak * progress * (1 - progress), z: point.z };
}
