import type { CameraPose, SafeArea, SceneLayout, Vec3 } from "../../../types/scene";
import { clamp } from "../../pitch/zone";
import { CHARACTER_RIG } from "../motion/rig";
import { WORLD_PARAMS } from "../space/params";
import { lerp, lerpVec3 } from "../space/vec3";
import { projectPoint } from "./project";

// カメラ。いずれも状態を持たず、入力の閉形式で決まる(フレーム依存の平滑化は使わない)。three は import しない。

const BATTING = WORLD_PARAMS.battingCamera;
const PORTRAIT = WORLD_PARAMS.battingCameraPortrait;
const CHASE = WORLD_PARAMS.chaseCamera;
const FRAMING = WORLD_PARAMS.framing;
const FIT = FRAMING.fit;

const RAD_TO_DEG = 180 / Math.PI;

/** 投手の帽子の頂点が、頭の付け根(`torsoY + headY`)から何 m 上にあるか(`render/character.ts` の帽子: 中心 +0.04・半径 0.48)。 */
const PITCHER_HEAD_TOP_OFFSET = 0.52;

/**
 * 縦長の中継カメラの縦方向の `tan(fov/2)` の下限。ホームランの頂点が上部の HUD(上から約 155px)に入らないための広さで、
 * 縦長の打球追跡の FOV を `max(水平半幅 tan 0.37 から決まる FOV, 縦横比の補間 k × この FOV)` にする。
 * 縦 FOV が同じなら画面の高さによらず頂点の画面上の位置(画面高比)がそろうため、高さ 640px 以上で頂点が HUD の下に収まる。
 */
const PORTRAIT_CHASE_MIN_VERTICAL_TAN = 1.05;
const PORTRAIT_CHASE_MIN_FOV_DEG = 2 * Math.atan(PORTRAIT_CHASE_MIN_VERTICAL_TAN) * RAD_TO_DEG;

function isValidAspect(aspect: number): boolean {
  return Number.isFinite(aspect) && aspect > 0;
}

function smoothstep(x: number): number {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

/** 横長の打撃カメラ(捕手後方。固定)。`lift` は 0。 */
export function battingCamera(): CameraPose {
  return {
    position: { ...BATTING.position },
    target: { ...BATTING.target },
    fovDeg: BATTING.fovDeg,
    lift: 0,
  };
}

/** 縦横比 `aspect` の横長側のシーンのずらし量(アスペクト ≤ `fullAspect` で `value`、≥ `zeroAspect` で 0、その間は線形)。非有限・0 以下は 0。 */
export function legacyLift(aspect: number): number {
  const { fullAspect, zeroAspect, value } = FRAMING.legacyLift;
  if (!isValidAspect(aspect) || aspect >= zeroAspect) return 0;
  if (aspect <= fullAspect) return value;
  return (value * (zeroAspect - aspect)) / (zeroAspect - fullAspect);
}

/** 水平半幅 tan(= `tan(fov/2) × aspect`)が `minHalfWidthTan` 以上になるよう縦 FOV(度)を広げる。非有限・0 以下の縦横比は `baseFovDeg`。 */
export function fovForAspect(baseFovDeg: number, aspect: number, minHalfWidthTan: number): number {
  if (!isValidAspect(aspect)) return baseFovDeg;
  return Math.max(baseFovDeg, 2 * Math.atan(minHalfWidthTan / aspect) * RAD_TO_DEG);
}

/** 縦長への寄せ具合 `k`(0 = 横長、1 = 縦長)。`aspect ≤ portraitFullAspect` で 1、`≥ landscapeFullAspect` で 0、その間は smoothstep。非有限・0 以下は 0。 */
export function portraitBlendAt(aspect: number): number {
  if (!isValidAspect(aspect)) return 0;
  const { portraitFullAspect, landscapeFullAspect } = FRAMING;
  return smoothstep((landscapeFullAspect - aspect) / (landscapeFullAspect - portraitFullAspect));
}

// ---------- 縦長の構図(空き領域に合わせる) ----------

const UNIT_POSE: CameraPose = {
  position: PORTRAIT.position,
  target: PORTRAIT.target,
  fovDeg: 2 * Math.atan(0.5) * RAD_TO_DEG,
  lift: 0,
};

/**
 * 縦長の姿勢で、点の画面 y(画面高比、lift なし)が `0.5 + c · σ`(`σ = aspect / (2h)`、`h` = 水平半幅 tan)になる係数 `c`。
 * `tan(fov/2) = 0.5` かつ縦横比 1 のカメラ(σ = 1)で投影して求める(`c` は姿勢と点だけで決まる)。
 */
function coefficientOf(point: Vec3): number {
  return projectPoint(UNIT_POSE, { width: 1, height: 1 }, point).y - 0.5;
}

const ZONE = WORLD_PARAMS.zone;
const ZONE_CENTER_Y = (ZONE.top + ZONE.bottom) / 2;
const ZONE_HALF_HEIGHT = (ZONE.top - ZONE.bottom) / 2;
/** 5×5 格子の下端はゾーンの中心から(5/3)倍。 */
const GRID_SCALE = 5 / 3;
const PITCHER = WORLD_PARAMS.actors.pitcher;

/** 構図の基準にする投手の頭頂(待機姿勢で最も高い。帽子の頂点)。 */
export const PITCHER_HEAD_TOP: Vec3 = {
  x: PITCHER.position.x,
  y: PITCHER.position.y + PITCHER.scale * (CHARACTER_RIG.torsoY + CHARACTER_RIG.headY + PITCHER_HEAD_TOP_OFFSET),
  z: PITCHER.position.z,
};

/**
 * 構図の式の係数。`headTop` = 投手の頭頂(頭の画面上の半径を含む。ゾーンの上端より前の基準は頭の中心ではなく頭頂)、
 * `zoneTop`/`zoneBottom` = ゾーン枠の上端/下端、`gridBottom` = 5×5 格子の下端。
 */
export const PORTRAIT_FRAMING_COEFFICIENTS = {
  headTop: coefficientOf(PITCHER_HEAD_TOP),
  zoneTop: coefficientOf({ x: 0, y: ZONE.top, z: ZONE.planeZ }),
  zoneBottom: coefficientOf({ x: 0, y: ZONE.bottom, z: ZONE.planeZ }),
  gridBottom: coefficientOf({ x: 0, y: ZONE_CENTER_Y - GRID_SCALE * ZONE_HALF_HEIGHT, z: ZONE.planeZ }),
};

/** レイアウトごとの値(`layout` は 2 値なので添字ではなく分岐で引く)。 */
function byLayout<T>(layout: SceneLayout, pair: { readonly batting: T; readonly pitching: T }): T {
  return layout === "pitching" ? pair.pitching : pair.batting;
}

/**
 * 使える空き領域(有限で、幅が `minBandRatio` 以上)ならそのまま、そうでなければレイアウトの既定値。
 * 空き領域の既定値への切り替えはここ1か所(構図・フレーム・カーソルの制限が同じ判定を使う)。
 */
export function usableSafeArea(layout: SceneLayout, safeArea: SafeArea | null): SafeArea {
  const fallback = byLayout(layout, FIT.defaultSafeArea);
  if (safeArea === null || !Number.isFinite(safeArea.top) || !Number.isFinite(safeArea.bottom)) return fallback;
  return safeArea.bottom - safeArea.top >= FIT.minBandRatio ? safeArea : fallback;
}

/**
 * 縦長(縦横比 100% 縦長)の構図: 空き領域 `safeArea`(`null` や無効なら既定値)に合わせた水平半幅 tan と lift。
 *
 * 1. `avail = bottom − marginRatio − top − headGapRatio`、`hReq = aspect · (cBot − cHeadTop) / (2 · avail)`(`cBot` = 打撃ならゾーン下端、守備なら格子の下端)。
 * 2. `h = clamp(hReq, 既定, 上限)`、`σ = aspect / (2h)`。
 * 3. `hReq ≤ 上限`: 投手の頭頂が HUD の直下 `headGapRatio` に来る lift(ゾーン/格子の下端は `bottom − marginRatio` 以内)。
 *    `hReq > 上限`: ゾーン/格子の下端が `bottom − marginRatio` に来る lift(隠れないことを優先。投手の頭は HUD に掛かりうる)。
 */
export function fitPortraitFraming(aspect: number, layout: SceneLayout, safeArea: SafeArea | null): { readonly halfWidthTan: number; readonly lift: number } {
  const limits = byLayout(layout, { batting: FIT.batting, pitching: FIT.pitching });
  if (!isValidAspect(aspect)) return { halfWidthTan: limits.defaultHalfWidthTan, lift: 0 };
  const { top, bottom } = usableSafeArea(layout, safeArea);
  const { marginRatio, headGapRatio } = FIT;
  const cBottom = layout === "pitching" ? PORTRAIT_FRAMING_COEFFICIENTS.gridBottom : PORTRAIT_FRAMING_COEFFICIENTS.zoneBottom;
  const cHead = PORTRAIT_FRAMING_COEFFICIENTS.headTop;
  const avail = bottom - marginRatio - top - headGapRatio;
  const required = avail > 0 ? (aspect * (cBottom - cHead)) / (2 * avail) : Number.POSITIVE_INFINITY;
  const halfWidthTan = clamp(required, limits.defaultHalfWidthTan, limits.maxHalfWidthTan);
  const sigma = aspect / (2 * halfWidthTan);
  const lift = required <= limits.maxHalfWidthTan ? 0.5 + cHead * sigma - (top + headGapRatio) : 0.5 + cBottom * sigma - (bottom - marginRatio);
  return { halfWidthTan, lift: Math.max(0, lift) };
}

/**
 * 打撃・守備の(接触前の)カメラ。位置と注視点は横長の姿勢と縦長の姿勢を `k = portraitBlendAt(aspect)` で線形補間し、
 * 水平半幅 tan = `lerp(0.37, fit の値, k)`、`fovDeg = max(34, 2·atan(水平半幅 tan / aspect))`、`lift = lerp(legacyLift(aspect), fit の lift, k)`。
 * `k = 0`(アスペクト ≥ 1.0)では打撃・守備とも同じ姿勢(位置・注視点は `battingCamera()`、FOV は従来の `fovForAspect(34, aspect, 0.37)`、lift は `legacyLift(aspect)`)。
 */
export function battingCameraFor(aspect: number, layout: SceneLayout, safeArea: SafeArea | null): CameraPose {
  const k = portraitBlendAt(aspect);
  const base = battingCamera();
  if (k === 0) {
    return { ...base, fovDeg: fovForAspect(base.fovDeg, aspect, FRAMING.landscapeMinHalfWidthTan), lift: legacyLift(aspect) };
  }
  const fit = fitPortraitFraming(aspect, layout, safeArea);
  const halfWidthTan = lerp(FRAMING.landscapeMinHalfWidthTan, fit.halfWidthTan, k);
  return {
    position: lerpVec3(base.position, PORTRAIT.position, k),
    target: lerpVec3(base.target, PORTRAIT.target, k),
    fovDeg: Math.max(base.fovDeg, 2 * Math.atan(halfWidthTan / aspect) * RAD_TO_DEG),
    lift: lerp(legacyLift(aspect), fit.lift, k),
  };
}

// ---------- 中継カメラ ----------

/**
 * 中継カメラの縦 FOV(度)。水平半幅 tan 0.37(`chaseMinHalfWidthTan`)から決まる FOV と、縦長での縦方向の下限(`k` 倍)の大きい方。
 * 打撃の水平半幅 tan(縦長で 0.25 など)は持ち込まない(野手が画面外になる)。
 */
function chaseFovDeg(aspect: number, k: number): number {
  return Math.max(fovForAspect(CHASE.fovDeg, aspect, FRAMING.chaseMinHalfWidthTan), k * PORTRAIT_CHASE_MIN_FOV_DEG);
}

/**
 * 打球 `ball` を追う中継カメラ(本塁後方の高い位置)。注視点の高さ係数 `kLook` は横長 0.6・縦長 0.4(縦横比の補間)。
 * `lift` は引数のまま返す。**打撃カメラの lift は引き継がない**(0 を渡す。blend 中に打撃の lift から 0 へ補間される。画面の上端に打球が出ないため)。
 */
export function chaseCamera(ball: Vec3, aspect: number, lift = 0): CameraPose {
  const k = portraitBlendAt(aspect);
  const kLook = lerp(CHASE.kLook, CHASE.portraitKLook, k);
  return {
    position: { x: ball.x * CHASE.kx, y: CHASE.baseY + ball.y * CHASE.ky, z: CHASE.baseZ + ball.z * CHASE.kz },
    target: { x: ball.x, y: Math.max(0, ball.y * kLook), z: ball.z },
    fovDeg: chaseFovDeg(aspect, k),
    lift,
  };
}

/**
 * 中継カメラ中のボールの最小表示径のための倍率: `max(1, minRatio · dist · 2·tan(fov/2) / (2 · ballRadius))`
 * (`dist` = カメラからボールまでの距離。表示高に対する比 `minRatio` を下回らない最小の倍率)。
 */
export function ballScaleFor(camera: CameraPose, ball: Vec3): number {
  const dist = Math.hypot(ball.x - camera.position.x, ball.y - camera.position.y, ball.z - camera.position.z);
  const visibleHeight = 2 * dist * Math.tan(camera.fovDeg / RAD_TO_DEG / 2);
  return Math.max(1, (WORLD_PARAMS.ball.minScreenDiameterRatio * visibleHeight) / (2 * WORLD_PARAMS.ballRadius));
}

/** smoothstep。`x` は 0〜1 にクランプする。 */
export function easeInOut(x: number): number {
  return smoothstep(x);
}

/**
 * 2つのカメラの補間。`k` は位置・視野角・lift の割合、`targetK`(省略時は `k`)は注視点の割合で、位置と注視点を別の速さで動かせる。
 * `k = 0` で `a`、`k = 1` で `b` に厳密一致する。
 */
export function blendCamera(a: CameraPose, b: CameraPose, k: number, targetK = k): CameraPose {
  return {
    position: lerpVec3(a.position, b.position, k),
    target: lerpVec3(a.target, b.target, targetK),
    fovDeg: lerp(a.fovDeg, b.fovDeg, k),
    lift: lerp(a.lift, b.lift, k),
  };
}

/** 接触から `sinceContactMs` 後の、打撃カメラから中継カメラへの移り具合(位置・注視点それぞれ smoothstep、0〜1)。 */
export function chaseBlendAt(sinceContactMs: number): { readonly position: number; readonly target: number } {
  return {
    position: easeInOut(sinceContactMs / CHASE.positionBlendMs),
    target: easeInOut(sinceContactMs / CHASE.targetBlendMs),
  };
}
