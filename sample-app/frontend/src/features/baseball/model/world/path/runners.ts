import type { PlateOutcome } from "../../../types/batting";
import type { BaseFrom, BaseTo, RunnerMoves } from "../../../types/game";
import type { Vec3 } from "../../../types/scene";
import { clamp } from "../../pitch/zone";
import { buildStageGeometry } from "../space/geometry";
import { WORLD_PARAMS } from "../space/params";
import { distanceXZ, lerpVec3 } from "../space/vec3";

// 走者の進塁の計画(表示専用)。`GameState.lastAdvance` から作った `RunnerMoves`(進塁の事実)と打席の結果から、
// 塁間の経路・所要時間を決める。乱数は使わず、判定には関与しない。
// 時計: 計画の t = 0 は「打球が野手に届く(落下・捕球する)時刻」で、`fielders.ts` の `planFielding` と同じ。呼び出し側が表示の時刻へずらす。
// 速度: 1 塁あたり `msPerBase`(1.6 秒)、複数塁は全体を `maxMs`(3.0 秒)に収める。ホームランは走者を動かさない(カメラが打球を追うため)。

const RUNNERS = WORLD_PARAMS.runners;
const HOME_ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };
const BASES = buildStageGeometry().bases;

/** 塁上の走者の出発塁(一〜三塁)。 */
type RunnerBase = 1 | 2 | 3;

/** 走る先・塁の位置の指定(1〜3 = 一〜三塁、4 = 本塁)。 */
export type BaseTarget = 1 | 2 | 3 | 4;

/** 走者スロット(`SceneFrame.runners` の添字): 0 = 打者走者、1〜3 = 一〜三塁の走者。出発塁と同じ値。 */
export type RunnerSlot = 0 | RunnerBase;

/**
 * 走者のこの球での行き先。
 * - `safe`: 塁上にとどまる、または塁に着く。
 * - `scored`: 本塁に生還する。
 * - `out`: アウトになる(打者走者の凡打・併殺の一塁走者)。経路は目標の塁まで走る(アウトの時刻は `planFielding` の `retires`)。
 * - `cleared`: 3 アウト目で攻守交代となり、塁上から消える(動かない)。
 */
export type RunnerFate = "safe" | "scored" | "out" | "cleared";

/**
 * 走者 1 人の動き。`path` は出発点・通過する塁・到達点の折れ線(y = 0)。`durationMs` = 0 は動かない(`path` は 1 点)。
 * 到達点は 1〜3 塁なら塁のリード位置(次の打席の構えと同じ。塁の手前の連続性)、本塁なら本塁。
 */
export type RunnerMotion = {
  readonly slot: RunnerSlot;
  readonly from: BaseFrom;
  readonly to: BaseTo;
  readonly fate: RunnerFate;
  readonly path: readonly Vec3[];
  readonly durationMs: number;
};

/** `motions` は固定 4 要素(添字 = スロット)。動かない・描かない走者は `null`(打者走者が走らないとき、ホームランの打者走者)。 */
export type RunnersPlan = {
  readonly motions: readonly (RunnerMotion | null)[];
  /** 全走者の動きが終わる時刻(最大 `maxMs`)。誰も動かないなら 0。 */
  readonly durationMs: number;
};

/** 塁の位置(足元。y = 0)。1〜3 = 一〜三塁、4 = 本塁。 */
export function baseWorldPosition(base: BaseTarget): Vec3 {
  switch (base) {
    case 1:
      return { x: BASES.first.x, y: 0, z: BASES.first.z };
    case 2:
      return { x: BASES.second.x, y: 0, z: BASES.second.z };
    case 3:
      return { x: BASES.third.x, y: 0, z: BASES.third.z };
    case 4:
      return HOME_ORIGIN;
  }
}

/** 次の塁(三塁の次は本塁)。 */
function nextBase(base: RunnerBase): 2 | 3 | 4 {
  switch (base) {
    case 1:
      return 2;
    case 2:
      return 3;
    case 3:
      return 4;
  }
}

/** 塁上の走者の構えの位置: 塁から次の塁へ `leadOffsetM` 離れた点(リード)。三塁は本塁側。 */
function leadPosition(base: RunnerBase): Vec3 {
  const here = baseWorldPosition(base);
  const next = baseWorldPosition(nextBase(base));
  const length = distanceXZ(here, next);
  const k = RUNNERS.leadOffsetM / length;
  return lerpVec3(here, next, k);
}

/** 走者の立ち位置。0 = 打席の打者(打者走者の出発点)、1〜3 = 塁のリード位置、4 = 本塁。 */
export function runnerStandPosition(base: BaseTo): Vec3 {
  switch (base) {
    case 0: {
      const { position } = WORLD_PARAMS.actors.batter;
      return { x: position.x, y: 0, z: position.z };
    }
    case 4:
      return HOME_ORIGIN;
    case 1:
    case 2:
    case 3:
      return leadPosition(base);
  }
}

/** 通過する塁(`from` の次から `to` の手前まで)。 */
function passingBases(from: BaseFrom, to: BaseTarget): readonly Vec3[] {
  const all: readonly RunnerBase[] = [1, 2, 3];
  return all.filter((base) => base > from && base < to).map((base) => baseWorldPosition(base));
}

/** `from` から `to`(`from` より先の塁)までの経路。 */
function routeBetween(from: BaseFrom, to: BaseTarget): readonly Vec3[] {
  return [runnerStandPosition(from), ...passingBases(from, to), runnerStandPosition(to)];
}

/** 走る距離(塁の数)に応じた所要時間。1 塁 `msPerBase`、全体で `maxMs` まで(複数塁は速度を上げて収める)。 */
export function runDurationMs(bases: number): number {
  return Math.min(Math.max(bases, 0) * RUNNERS.msPerBase, RUNNERS.maxMs);
}

/** 動かない走者(構えの位置に立つ)。 */
function standing(slot: RunnerSlot, from: BaseFrom, to: BaseTo, fate: RunnerFate): RunnerMotion {
  return { slot, from, to, fate, path: [runnerStandPosition(from)], durationMs: 0 };
}

/** `from` から `target`(1〜4)へ走る走者。 */
function running(slot: RunnerSlot, from: BaseFrom, to: BaseTo, target: BaseTarget, fate: RunnerFate): RunnerMotion {
  return { slot, from, to, fate, path: routeBetween(from, target), durationMs: runDurationMs(target - from) };
}

/** 凡打・三振で打者がアウトになるとき、一塁へ走るか(ゴロ・併殺のみ。三振・フライ・ライナーは打席で終わる)。 */
function batterRunsWhenOut(plate: PlateOutcome): boolean {
  return plate === "groundout" || plate === "doublePlay";
}

function batterMotion(moves: RunnerMoves, plate: PlateOutcome): RunnerMotion | null {
  const { batterTo } = moves;
  if (batterTo === 0) {
    return batterRunsWhenOut(plate) ? running(0, 0, 0, 1, "out") : null;
  }
  return running(0, 0, batterTo, batterTo, batterTo === 4 ? "scored" : "safe");
}

/** 塁上の走者 1 人(出発塁 `base`)。併殺では 1 塁走者が二塁でアウト、3 アウト目で消える走者は動かない。 */
function baseRunnerMotion(base: RunnerBase, to: BaseTo, plate: PlateOutcome): RunnerMotion {
  if (to === 0) {
    return plate === "doublePlay" && base === 1 ? running(base, base, 0, 2, "out") : standing(base, base, 0, "cleared");
  }
  if (to === base) {
    return standing(base, base, to, "safe");
  }
  return running(base, base, to, to, to === 4 ? "scored" : "safe");
}

/** ホームラン: 塁上の走者は動かさず(構えのまま)、打者走者も描かない。 */
function homerunPlan(moves: RunnerMoves): RunnersPlan {
  const bases: readonly RunnerBase[] = [1, 2, 3];
  const held = bases.map((base) => {
    const advance = moves.advances.find((entry) => entry.from === base);
    return advance === undefined ? null : standing(base, base, advance.to, "scored");
  });
  return { motions: [null, ...held], durationMs: 0 };
}

function slotMotion(moves: RunnerMoves, plate: PlateOutcome, base: RunnerBase): RunnerMotion | null {
  const advance = moves.advances.find((entry) => entry.from === base);
  return advance === undefined ? null : baseRunnerMotion(base, advance.to, plate);
}

/**
 * 走者の動きの計画。`moves` は `PitchOutcomeView.runners`、`plate` は打席の結果(`PitchOutcomeView.plate`)。
 * 全走者が同じ時刻(t = 0)に走り出し、各自の所要時間(1 塁 1.6 秒・複数塁は全体で最大 3.0 秒)で到達する。
 */
export function planRunners(moves: RunnerMoves, plate: PlateOutcome): RunnersPlan {
  if (plate === "homerun") {
    return homerunPlan(moves);
  }
  const motions = [batterMotion(moves, plate), slotMotion(moves, plate, 1), slotMotion(moves, plate, 2), slotMotion(moves, plate, 3)];
  return { motions, durationMs: Math.max(0, ...motions.map((motion) => motion?.durationMs ?? 0)) };
}

/** 折れ線の全長(XZ)。 */
function pathLength(path: readonly Vec3[]): number {
  return path.slice(1).reduce((sum, point, index) => sum + distanceXZ(path.at(index) ?? point, point), 0);
}

type Locus = { readonly a: Vec3; readonly b: Vec3; readonly t: number };

/** `progress`(0〜1 にクランプ。距離に比例)が折れ線のどの区間のどこか。 */
function locate(path: readonly Vec3[], progress: number): Locus {
  const first = path.at(0) ?? HOME_ORIGIN;
  if (progress >= 1) {
    const last = path.at(-1) ?? first;
    return { a: last, b: last, t: 1 };
  }
  const total = pathLength(path);
  let remaining = clamp(progress, 0, 1) * total;
  let previous = first;
  for (const point of path.slice(1)) {
    const length = distanceXZ(previous, point);
    if (remaining <= length) {
      return { a: previous, b: point, t: length === 0 ? 1 : remaining / length };
    }
    remaining -= length;
    previous = point;
  }
  return { a: previous, b: previous, t: 1 };
}

/** 動きの進行度(0〜1)。`durationMs` = 0 の走者は常に 1。 */
export function runnerProgress(motion: RunnerMotion, tMs: number): number {
  return motion.durationMs <= 0 ? 1 : clamp(tMs / motion.durationMs, 0, 1);
}

/** 時刻 `tMs`(計画の t = 0 から)の走者の足元の位置。経路の距離に比例して等速で進み、終了後は到達点に留まる。 */
export function runnerPositionAt(motion: RunnerMotion, tMs: number): Vec3 {
  const { a, b, t } = locate(motion.path, runnerProgress(motion, tMs));
  return lerpVec3(a, b, t);
}

/** 時刻 `tMs` の走者の向き(yaw。0 = +z、π/2 = +x)。動かない走者は `fallbackYaw`。 */
export function runnerYawAt(motion: RunnerMotion, tMs: number, fallbackYaw: number): number {
  const { a, b } = locate(motion.path, runnerProgress(motion, tMs));
  return a.x === b.x && a.z === b.z ? fallbackYaw : Math.atan2(b.x - a.x, b.z - a.z);
}
