// 見た目の定数とヘルパー。承認済みモック(three r128)と npm の three r186 との差をここに集約する(吸収点)。
// - 色管理: r128 は色管理を持たず、16進の色をそのままシェーダに渡し、出力もそのままだった。r186 で同じ経路にするため
//   `ColorManagement.enabled = false` + `outputColorSpace = LinearSRGBColorSpace` にする。
// - ライト強度: r128 の旧来の強度は r186 の物理単位の π 倍に相当する。モックの値に π を掛ける。
// - ToonMaterial の階調テクスチャ: r128 は LuminanceFormat、r186 は RedFormat(`.r` を読む)。
// - シャドウ: r186 は PCFSoftShadowMap が削除済みなので PCFShadowMap を使う。
// 見た目が合わなければステップ G でこのファイルの値を調整する。
import { ColorManagement, DataTexture, LinearSRGBColorSpace, NearestFilter, PCFShadowMap, RedFormat } from "three";
import type { ColorSpace, ShadowMapType } from "three";
import type { UniformColors } from "../types/scene";
import type { StageQuality } from "../types/stage";

// 色の生成より前(モジュール読み込み時)に無効化する。`Color#setHex` は生成時に変換するため、後から切り替えると色がずれる。
ColorManagement.enabled = false;

/** モックの r128 のライト強度を r186 の物理単位へ換算する係数。 */
export const LEGACY_LIGHT_SCALE = Math.PI;

/** 輪郭線(背面法)の拡大率。ボールだけ太い。 */
export const OUTLINE_SCALE = 1.07;
export const BALL_OUTLINE_SCALE = 1.12;
export const OUTLINE_COLOR = 0x1b1b1b;

/** カメラのクリップ面(モック)。 */
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 800;

/** 霧(遠景の霞)。 */
export const FOG_LOOK = { color: 0xb9d9f2, near: 150, far: 320 } as const;

/** 空のグラデーション(上から下)。 */
export const SKY_STOPS: readonly number[] = [0x3a7bd5, 0x8cc5f2, 0xf3e7c9];
/** 空のグラデーションテクスチャの高さ(px)。 */
export const SKY_HEIGHT = 256;

/** ライト(モックの強度 × `LEGACY_LIGHT_SCALE`)。 */
export const LIGHT_LOOK = {
  hemisphere: { sky: 0xe8f4ff, ground: 0x5d7f45, intensity: 0.55 * LEGACY_LIGHT_SCALE },
  sun: {
    color: 0xfff4e0,
    intensity: 0.7 * LEGACY_LIGHT_SCALE,
    position: { x: -40, y: 80, z: 30 },
    target: { x: 0, y: 0, z: -30 },
    shadow: { mapSize: 2048, left: -70, right: 70, top: 70, bottom: -110, near: 10, far: 220, normalBias: 0.02 },
  },
} as const;

/** 最初の `apply` までの仮のユニフォーム色(モックの打者=青、守備=赤)。 */
export const DEFAULT_UNIFORMS: UniformColors = { offense: 0x2f63c8, defense: 0xe8473c };

/** 観客席の点の色(`CrowdCell.paletteIndex` 0〜7)。 */
export const CROWD_PALETTE: readonly number[] = [0xb8433a, 0xd9cdb4, 0x3d64a8, 0xc9a63a, 0x6a9a5e, 0x5b6573, 0x5b6573, 0x5b6573];

/** 球場・キャラクター・マーカーの色(モックから転記)。 */
export const PALETTE = {
  grassLight: 0x4cae5b,
  grassDark: 0x3e9a4c,
  dirt: 0xc89a63,
  white: 0xffffff,
  fence: 0x1e5a3c,
  fenceCap: 0xffd23f,
  roof: 0x9aa7b4,
  crowdBackground: 0x39434f,
  crowdSeparator: 0x2f3842,
  skin: 0xffd9b5,
  uniformWhite: 0xf7f7f9,
  shoe: 0x2a2a2a,
  glove: 0x8a4b22,
  bat: 0xd7a25a,
  eye: 0x151515,
  cheek: 0xff9b9b,
  accent: 0xffd23f,
  shadow: 0x000000,
} as const;

/** トゥーンの3段階の階調(暗・中・明)。 */
const TOON_STEPS: readonly number[] = [110, 190, 255];

/** ゾーン平面での画面の半幅に相当する `tan` の下限。縦長の画面で縦 FOV を広げる基準。 */
export const MIN_HALF_WIDTH_TAN = 0.37;
/** 縦長の画面でシーンを上へずらす最大量(画面高に対する比)。 */
export const PORTRAIT_LIFT = 0.16;
/** この縦横比以下で `PORTRAIT_LIFT` を最大にする。 */
export const LIFT_FULL_ASPECT = 0.6;
/** この縦横比以上でずらし量を 0 にする。 */
export const LIFT_ZERO_ASPECT = 1.2;

const RAD_TO_DEG = 180 / Math.PI;
const MAX_PIXEL_RATIO = 2;

/** 縦横比が小さいとき、ゾーン平面での半幅が約 1.25m 以上になるよう縦 FOV(度)を広げる。 */
export function fovFor(baseFovDeg: number, aspect: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return baseFovDeg;
  return Math.max(baseFovDeg, 2 * Math.atan(MIN_HALF_WIDTH_TAN / aspect) * RAD_TO_DEG);
}

/** 縦長の画面でシーンを上へずらす量(画面高に対する比)。`aspect ≥ LIFT_ZERO_ASPECT` で 0、`≤ LIFT_FULL_ASPECT` で `PORTRAIT_LIFT`、その間は線形。 */
export function framingLift(aspect: number): number {
  if (!Number.isFinite(aspect) || aspect >= LIFT_ZERO_ASPECT) return 0;
  if (aspect <= LIFT_FULL_ASPECT) return PORTRAIT_LIFT;
  return (PORTRAIT_LIFT * (LIFT_ZERO_ASPECT - aspect)) / (LIFT_ZERO_ASPECT - LIFT_FULL_ASPECT);
}

/** デバイスピクセル比から描画のピクセル比を決める。`low` は 1 固定(SwiftShader は比例して重くなる)。 */
export function pixelRatioFor(quality: StageQuality, devicePixelRatio: number): number {
  if (quality === "low") return 1;
  return Math.min(MAX_PIXEL_RATIO, Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1);
}

/** `WebGLRenderer` のうち見た目に関わる設定の最小の型(node で `WebGLRenderer` を作れないため構造的に受ける)。 */
export type RendererLookTarget = {
  outputColorSpace: ColorSpace;
  shadowMap: { enabled: boolean; type: ShadowMapType };
};

/** r128 の描画経路(色管理なし・線形出力)と PCF の影をレンダラへ適用する。影は `normal` のときだけ有効。 */
export function applyRendererLook(renderer: RendererLookTarget, quality: StageQuality): void {
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.shadowMap.enabled = quality === "normal";
  renderer.shadowMap.type = PCFShadowMap;
}

function channels(hex: number): readonly [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

function mixHex(a: number, b: number, k: number): number {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  const mix = (from: number, to: number): number => Math.round(from + (to - from) * k);
  return (mix(ar, br) << 16) | (mix(ag, bg) << 8) | mix(ab, bb);
}

/** 色の列を `t`(0〜1)で補間した色。 */
function gradientColorAt(stops: readonly number[], t: number): number {
  const first = stops.at(0) ?? 0;
  if (stops.length < 2) return first;
  const scaled = Math.min(Math.max(t, 0), 1) * (stops.length - 1);
  const segment = Math.min(Math.floor(scaled), stops.length - 2);
  const from = stops.at(segment) ?? first;
  return mixHex(from, stops.at(segment + 1) ?? from, scaled - segment);
}

/**
 * 幅 `width` × 高さ `height` の RGBA ピクセル列(`Uint8Array`)。`colorAt(x, y)` は 24bit RGB を返す。
 * `y` は **配列の行順**(DataTexture の行 0 が下端 v=0)。
 */
export function rgbaPixels(width: number, height: number, colorAt: (x: number, y: number) => number): Uint8Array {
  const colors = Array.from({ length: width * height }, (_, index) => colorAt(index % width, Math.floor(index / width)));
  return Uint8Array.from(
    colors.flatMap((hex) => {
      const [r, g, b] = channels(hex);
      return [r, g, b, 0xff];
    }),
  );
}

/** 幅 1 × 高さ `height` の縦グラデーションの RGBA ピクセル列。行 0 が先頭の色、最終行が末尾の色(DataTexture の下端が先頭)。 */
export function gradientPixels(stops: readonly number[], height: number): Uint8Array {
  return rgbaPixels(1, height, (_x, y) => gradientColorAt(stops, height > 1 ? y / (height - 1) : 0));
}

/** トゥーン材質の階調テクスチャ(3段、`RedFormat`、`NearestFilter`)。 */
export function createToonGradient(): DataTexture {
  const texture = new DataTexture(Uint8Array.from(TOON_STEPS), TOON_STEPS.length, 1, RedFormat);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}
