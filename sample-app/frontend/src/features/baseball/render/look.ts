// 見た目の定数とヘルパー。承認済みモック(three r128)と npm の three r186 との差をここに集約する(吸収点)。
// - 色管理: r128 は色管理を持たず、16進の色をそのままシェーダに渡し、出力もそのままだった。r186 で同じ経路にするため
//   `ColorManagement.enabled = false` + `outputColorSpace = LinearSRGBColorSpace` にする。
// - ライト強度: r128 の旧来の強度は r186 の物理単位の π 倍に相当する。モックの値に π を掛ける。
// - ToonMaterial の階調テクスチャ: r128 は LuminanceFormat、r186 は RedFormat(`.r` を読む)。
// - シャドウ: r186 は PCFSoftShadowMap が削除済みなので PCFShadowMap を使う。
// 見た目が合わなければステップ G でこのファイルの値を調整する。
import { ColorManagement, DataTexture, LinearSRGBColorSpace, NearestFilter, PCFShadowMap, RedFormat } from "three";
import type { PerspectiveCamera, ShadowMapType } from "three";
import type { CameraPose, CharacterLookData, CharacterSlot, QualityTier, UniformColors } from "../types/scene";
import type { StageQuality } from "../types/stage";

// 色の生成より前(モジュール読み込み時)に無効化する。`Color#setHex` は生成時に変換するため、後から切り替えると色がずれる。
ColorManagement.enabled = false;

/** モックの r128 のライト強度を r186 の物理単位へ換算する係数。 */
export const LEGACY_LIGHT_SCALE = Math.PI;

/** 輪郭線(背面法)の拡大率。ボールだけ太い。 */
export const OUTLINE_SCALE = 1.07;
export const BALL_OUTLINE_SCALE = 1.12;
export const OUTLINE_COLOR = 0x1b1b1b;

/**
 * ボールの視認性(v3)。`halo` = 球の後ろに敷く暖色のハロー(必須。常に生成する。不透明度は `SceneFrame.ball.halo`)。
 * `seam` = 縫い目の太い赤い帯(弧 2 本。`widthRatio` は球の径に対する帯の幅)。`outlineScale` の既定は `BALL_OUTLINE_SCALE`。
 */
export const BALL_LOOK = {
  halo: { scale: 1.9, color: 0xffd9a0 },
  seam: { widthRatio: 0.18, color: 0xd62f2f, lift: 1.008 },
} as const;

/**
 * 着弾点の予告(打撃)・照準(守備)の見た目。色は黄色のカーソルと区別するシアン。リング・点の位置と寸法は `SceneFrame.guide` から受ける。
 * `dotEdge` = 点の黒縁の外径(点の半径に対する倍率)、`fadeFill` = `fade` の円の塗りの不透明度、`ringOpacity` = リングの不透明度。
 */
export const GUIDE_LOOK = {
  preview: 0x5ce1ff,
  edge: 0x101820,
  dotEdge: 1.5,
  fadeFill: 0.28,
  fadeEdge: 0.7,
  ringOpacity: 0.95,
  reticleOpacity: 0.95,
  spreadOpacity: 0.5,
} as const;

/** 素のカーソル(指の位置)の薄い印。半径は m、不透明度は塗り・縁。 */
export const CURSOR_RAW_LOOK = { radius: 0.02, fillOpacity: 0.65, edgeOpacity: 0.5 } as const;

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
    // 太陽の位置: 打者の背中側(+z)の右上。影は左(−x)と少し前(−z)へ伸びる = 打者の影がゾーン・ボールの上に落ちず、画面の左の外へ出る。
    // 仰角を約 52° に上げて影を短くし(1.8m の打者で約 1.4m)、足元の接地感だけ残す。旧値(−40, 80, 30)は影が本塁前からゾーンの下に広がった。
    position: { x: 60, y: 100, z: 20 },
    target: { x: 0, y: 0, z: -30 },
    shadow: { mapSize: 2048, left: -70, right: 70, top: 70, bottom: -110, near: 10, far: 220, normalBias: 0.02 },
  },
} as const;

/** 最初の `apply` までの仮のユニフォーム色(モックの打者=青、守備=赤)。 */
export const DEFAULT_UNIFORMS: UniformColors = { offense: 0x2f63c8, defense: 0xe8473c };

/** 観客席の点の色(`CrowdCell.paletteIndex` 0〜7)。 */
export const CROWD_PALETTE: readonly number[] = [0xd24a3e, 0xc9473d, 0xb8433a, 0xf0e3c4, 0xe3b43c, 0xd9594a, 0xb8433a, 0x8a3a3a];

/** 球場・キャラクター・マーカーの色(モックから転記)。 */
export const PALETTE = {
  grassLight: 0x4cae5b,
  grassDark: 0x3e9a4c,
  dirt: 0xc89a63,
  white: 0xffffff,
  fence: 0x1e5a3c,
  fenceCap: 0xffd23f,
  roof: 0x9aa7b4,
  crowdBackground: 0x4a2f37,
  crowdSeparator: 0x3a252c,
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

/** 描画のピクセル比の上限。タッチ端末(`pointer: coarse`)はメインスレッドの詰まりが入力の遅れに直結するので低くする。 */
export const MAX_PIXEL_RATIO = { fine: 2, coarse: 1.5 } as const;
/** 太陽光の影マップの一辺(px)。タッチ端末は 1024。 */
const SHADOW_MAP_SIZE = { fine: LIGHT_LOOK.sun.shadow.mapSize, coarse: 1024 } as const;

/** デバイスピクセル比から描画のピクセル比を決める。`low` は 1 固定(SwiftShader は比例して重くなる)。`coarsePointer` なら上限 1.5。 */
export function pixelRatioFor(quality: StageQuality, devicePixelRatio: number, coarsePointer: boolean): number {
  if (quality === "low") return 1;
  const max = coarsePointer ? MAX_PIXEL_RATIO.coarse : MAX_PIXEL_RATIO.fine;
  return Math.min(max, Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1);
}

/** 太陽光の影マップの一辺(px)。`coarsePointer` なら 1024、それ以外は `LIGHT_LOOK.sun.shadow.mapSize`。 */
export function shadowMapSizeFor(coarsePointer: boolean): number {
  return coarsePointer ? SHADOW_MAP_SIZE.coarse : SHADOW_MAP_SIZE.fine;
}

/**
 * 品質ティアごとの描画設定(character 分冊 §3-4-10 の表)。
 * - `pixelRatioCap` = 画素比の上限(`pixelRatioFor` の結果との小さい方を使う)。
 * - `shadowMapSize` = 影マップの一辺の上限(px。`Infinity` = 上限なし = `shadowMapSizeFor` の値のまま、0 = 影なし)。
 * - `nearCasters` = 影を落とす近景の数(`NEAR_SHADOW_ORDER` の先頭から)。
 * - `farJoints` = 遠景のボーンの回転を書くか(偽なら根の位置・向き・拡大率だけ)。
 * - `farMovingOnly` = 遠景は動いているキャラクターだけ表示するか。
 * - `wipe` = ワイプの第 2 パスを描くか。
 */
export type TierSettings = {
  readonly pixelRatioCap: number;
  readonly shadowMapSize: number;
  readonly nearCasters: number;
  readonly farJoints: boolean;
  readonly farMovingOnly: boolean;
  readonly wipe: boolean;
};

const TIER_0: TierSettings = { pixelRatioCap: 1.5, shadowMapSize: Number.POSITIVE_INFINITY, nearCasters: 4, farJoints: true, farMovingOnly: false, wipe: true };
const TIER_SETTINGS: readonly TierSettings[] = [
  TIER_0,
  { pixelRatioCap: 1.25, shadowMapSize: 512, nearCasters: 3, farJoints: true, farMovingOnly: false, wipe: true },
  { pixelRatioCap: 1, shadowMapSize: 0, nearCasters: 0, farJoints: false, farMovingOnly: false, wipe: true },
  { pixelRatioCap: 0.85, shadowMapSize: 0, nearCasters: 0, farJoints: false, farMovingOnly: true, wipe: false },
];

export function tierSettingsFor(tier: QualityTier): TierSettings {
  return TIER_SETTINGS.at(tier) ?? TIER_0;
}

/** ティア T3 で、遠景のキャラクターが止まってから消えるまでのフレーム数(動いている間と直後は残す)。 */
export const MOVING_HOLD_FRAMES = 60;

/** 描画のピクセル比(`pixelRatioFor` とティアの上限の小さい方)。 */
export function pixelRatioForTier(quality: StageQuality, devicePixelRatio: number, coarsePointer: boolean, tier: QualityTier): number {
  return Math.min(pixelRatioFor(quality, devicePixelRatio, coarsePointer), tierSettingsFor(tier).pixelRatioCap);
}

/** ティアでの影マップの一辺(px)。0 = 影なし。`base` は `shadowMapSizeFor` の値。 */
export function shadowMapSizeForTier(tier: QualityTier, base: number): number {
  return Math.min(base, tierSettingsFor(tier).shadowMapSize);
}

/** 近景のうち、ティアが下がるにつれて影を落とさなくなる順の逆(先頭ほど最後まで影を落とす)。 */
export const NEAR_SHADOW_ORDER: readonly CharacterSlot[] = ["pitcher", "batter", "catcher", "runner0"];

/** 打者側(攻撃側)のユニフォームを着るスロット。 */
export function isOffenseSlot(slot: CharacterSlot): boolean {
  return slot === "batter" || slot.startsWith("runner");
}

/**
 * `setLook` を受け取るまでの仮の見た目(白いユニフォームにチーム色のアクセント。顔と背番号のテクスチャは持たない)。
 * 造形(`createCharacterParts`)は色・髪型・体格だけを読むので、テクスチャの素データは空でよい(`applyLook` には渡さない)。
 */
export function placeholderLook(slot: CharacterSlot, uniforms: UniformColors): CharacterLookData {
  const team = isOffenseSlot(slot) ? uniforms.offense : uniforms.defense;
  return {
    slot,
    skin: 1,
    build: "normal",
    hair: { style: "short", color: 0x2a1c14 },
    eyes: "round",
    faceAtlas: { width: 0, height: 0, cell: 0, rgba: new Uint8Array(0) },
    numberDecal: { width: 0, height: 0, rgba: new Uint8Array(0) },
    uniform: { base: PALETTE.uniformWhite, pants: 0xf2f2f2, accent: team, socks: team, cap: team, helmet: team, pattern: null },
  };
}

/** 造形をやり直す必要があるかを調べるための鍵(色・髪型・体格・肌。顔のテクスチャだけが変わるときは同じ鍵)。 */
export function shapeKeyOf(look: CharacterLookData): string {
  const { uniform } = look;
  return [
    look.skin,
    look.build,
    look.hair.style,
    look.hair.color,
    uniform.base,
    uniform.pants,
    uniform.accent,
    uniform.socks,
    uniform.cap,
    uniform.helmet,
  ].join("|");
}

/** カメラを姿勢にそのまま合わせる(縦 FOV は `pose.fovDeg`、シーンを上へずらす量は `pose.lift`。どちらも model が決める)。 */
export function placeCamera(camera: PerspectiveCamera, pose: CameraPose, size: { readonly width: number; readonly height: number }): void {
  camera.aspect = size.height > 0 ? size.width / size.height : 1;
  camera.fov = pose.fovDeg;
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
  if (pose.lift > 0) {
    camera.setViewOffset(size.width, size.height, 0, pose.lift * size.height, size.width, size.height);
  } else {
    camera.clearViewOffset();
  }
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

/** `WebGLRenderer` のうち見た目に関わる設定の最小の型(node で `WebGLRenderer` を作れないため構造的に受ける)。 */
export type RendererLookTarget = {
  // `@types/three` の `WebGLRenderer#outputColorSpace` は `string`。`ColorSpace` にすると `WebGLRenderer` を渡せないので `string` で受ける。
  outputColorSpace: string;
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
