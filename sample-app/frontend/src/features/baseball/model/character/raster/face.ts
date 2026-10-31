// 顔アトラスのラスタ(E2。純粋関数)。`PlayerLook` から 96×96 のセル 8 表情(4×2 = 384×192)の RGBA を SDF のプリミティブで描く。
// 目の形 4 種・眉 3 種・口・頬・汗・歯・舌・まばたきを自前で描く(Canvas・DOM は使わない)。character 分冊 §3-4-2。
// 向き: データの先頭の行 = 絵の上端(`render/character/parts.ts` の `FACE_PATCH` と同じ)。各セルの外周 `padPx`(4px)は肌色のまま残す。
import type { FaceExpression } from "../../../types/scene";
import type { BrowShape, EyeShape, PlayerLook, RestMouth } from "../../../types/team";
import { WORLD_PARAMS } from "../../world/space/params";
import {
  arcDistance,
  boundsAround,
  capsule,
  circle,
  createBuffer,
  ellipse,
  expand,
  halfPlane,
  intersect,
  mixColor,
  paintSdf,
  place,
  polygon,
  roundBox,
  translate,
  union,
  type Bounds,
  type PaintOptions,
  type PixelBuffer,
  type Sdf,
} from "./primitives";

const FACE = WORLD_PARAMS.character.face;

/**
 * セルの並び(行優先。`WORLD_PARAMS.character.face.order` と同じ。あちらは `string[]` 型なので、`FaceExpression` の型でここに持つ。
 * 一致は `face.test.ts` が確かめる)。
 */
export const FACE_EXPRESSION_ORDER: readonly FaceExpression[] = ["neutral", "focus", "effort", "shock", "joy", "cheer", "sad", "blink"];

/** 顔アトラスの大きさ(px)。 */
export const FACE_ATLAS_WIDTH = FACE.cell * FACE.columns;
export const FACE_ATLAS_HEIGHT = FACE.cell * FACE.rows;

/** 顔アトラス(`CharacterLookData.faceAtlas` と同じ形)。 */
export type FaceAtlas = { readonly width: number; readonly height: number; readonly cell: number; readonly rgba: Uint8Array };

/** 肌色のパレット(`PlayerLook.skin` = 0〜4 → 24bit RGB)。明るい順。 */
export const SKIN_COLORS: readonly number[] = [0xffe3bd, 0xf6cd9b, 0xdca86f, 0xb97c46, 0x8c5a34];

/** セル内の配置(セルの左上が原点。px)。セルの一辺 96・内側 4〜92 の中での位置で、テストと E5 の確認用に公開する。 */
export const FACE_LAYOUT = {
  centerX: 48,
  eyeY: 46,
  /** 中心から各目の中心までの距離。 */
  eyeDx: 19,
  /** 眉の中心の高さ(目の中心から上へ)。 */
  browRise: 17,
  mouthY: 71,
  cheekY: 61,
  cheekDx: 26,
} as const;

const DEG = Math.PI / 180;
const INK = 0x2a1a22;
const BROW_INK = 0x2b1d17;
const MOUTH_INK = 0x5a2a2c;
const MOUTH_INSIDE = 0x7a1f2b;
const TONGUE = 0xec6a7c;
const SCLERA = 0xfdfdfb;
const IRIS = 0x2e3560;
const IRIS_LIGHT = 0x6d78bd;
const PUPIL = 0x14152b;
const SWEAT_FILL = 0xa6e0ff;
const SWEAT_EDGE = 0x3c82b8;

type Side = "left" | "right";
type EyeKind = "open" | "squint" | "wide" | "happy" | "closed";
type EyeStyle = { readonly kind: EyeKind; readonly tiltAdd: number; readonly cutAdd: number; readonly irisDown: number; readonly lineWidth: number };
type BrowStyle = { readonly dy: number; readonly tilt: number };
type EyeBase = { readonly rx: number; readonly ry: number; readonly tilt: number; readonly cut: number };

type Ctx = {
  readonly buffer: PixelBuffer;
  readonly originX: number;
  readonly originY: number;
  readonly clip: Bounds;
  readonly skin: number;
};

function paint(ctx: Ctx, bounds: Bounds, sdf: Sdf, color: number, options?: PaintOptions): void {
  paintSdf(ctx.buffer, { offsetX: ctx.originX, offsetY: ctx.originY, clip: ctx.clip }, bounds, sdf, color, options);
}

function eyeBase(shape: EyeShape): EyeBase {
  switch (shape) {
    case "round":
      return { rx: 8.2, ry: 11, tilt: 0, cut: 0 };
    case "sharp":
      return { rx: 9.4, ry: 9, tilt: 15, cut: 0.2 };
    case "droopy":
      return { rx: 8.8, ry: 10.1, tilt: -15, cut: 0.1 };
    case "big":
      return { rx: 10.5, ry: 13.8, tilt: 0, cut: 0 };
  }
}

function eyeStyle(expression: FaceExpression): EyeStyle {
  switch (expression) {
    case "neutral":
      return { kind: "open", tiltAdd: 0, cutAdd: 0, irisDown: 0, lineWidth: 2.4 };
    case "focus":
      return { kind: "open", tiltAdd: 5, cutAdd: 0.24, irisDown: 0.6, lineWidth: 2.4 };
    case "effort":
      return { kind: "squint", tiltAdd: 8, cutAdd: 0.15, irisDown: 0, lineWidth: 2.4 };
    case "shock":
      return { kind: "wide", tiltAdd: 0, cutAdd: 0, irisDown: 0, lineWidth: 2.2 };
    case "joy":
      return { kind: "happy", tiltAdd: 0, cutAdd: 0, irisDown: 0, lineWidth: 3.6 };
    case "cheer":
      return { kind: "happy", tiltAdd: 0, cutAdd: 0, irisDown: 0, lineWidth: 4.4 };
    case "sad":
      return { kind: "open", tiltAdd: -10, cutAdd: 0.18, irisDown: 1.8, lineWidth: 2.4 };
    case "blink":
      return { kind: "closed", tiltAdd: 0, cutAdd: 0, irisDown: 0, lineWidth: 3 };
  }
}

function browStyle(expression: FaceExpression): BrowStyle {
  switch (expression) {
    case "neutral":
    case "blink":
      return { dy: 0, tilt: 0 };
    case "focus":
      return { dy: 3, tilt: 14 };
    case "effort":
      return { dy: 4, tilt: 24 };
    case "shock":
      return { dy: -6, tilt: -4 };
    case "joy":
      return { dy: -3, tilt: -3 };
    case "cheer":
      return { dy: -4, tilt: -4 };
    case "sad":
      return { dy: 1, tilt: -20 };
  }
}

function eyeCenterX(side: Side): number {
  return side === "left" ? FACE_LAYOUT.centerX - FACE_LAYOUT.eyeDx : FACE_LAYOUT.centerX + FACE_LAYOUT.eyeDx;
}

/** 局所座標(原点 = 目の中心。+x = 外側)の目の形。上のまぶたを `cut`(0〜1。高さに対する割合)だけ平らに切る。 */
function sclera(rx: number, ry: number, cut: number): Sdf {
  const top = -ry + cut * 2 * ry;
  return intersect(ellipse(0, 0, rx, ry), halfPlane(0, -1, -top));
}

function drawOpenEye(ctx: Ctx, frame: { cx: number; cy: number; angle: number; mirror: boolean }, base: EyeBase, style: EyeStyle): void {
  const bounds = boundsAround(frame.cx, frame.cy, 18);
  const cut = Math.min(0.6, base.cut + style.cutAdd);
  const white = sclera(base.rx, base.ry, cut);
  const at = (local: Sdf): Sdf => place(frame, local);
  // 輪郭(上のまぶたは太く)。
  paint(ctx, bounds, at(union([expand(white, 1.2), expand(translate(white, 0, -1), 1.7)])), INK);
  paint(ctx, bounds, at(white), SCLERA);
  const irisY = style.irisDown;
  const iris = intersect(ellipse(0, irisY, base.rx * 0.8, base.ry * 0.92), white);
  paint(ctx, bounds, at(iris), IRIS);
  paint(ctx, bounds, at(intersect(ellipse(0, irisY + base.ry * 0.4, base.rx * 0.62, base.ry * 0.5), iris)), IRIS_LIGHT, { softness: 3, opacity: 0.85 });
  paint(ctx, bounds, at(ellipse(0, irisY, base.rx * 0.4, base.ry * 0.46)), PUPIL);
  paint(ctx, bounds, at(circle(-base.rx * 0.3, irisY - base.ry * 0.36, 2.3)), 0xffffff);
  paint(ctx, bounds, at(circle(base.rx * 0.25, irisY + base.ry * 0.38, 1.1)), 0xffffff, { opacity: 0.85 });
  // 外側の上のまつ毛。
  paint(ctx, bounds, at(capsule(base.rx * 0.8, -base.ry * 0.5, base.rx * 1.3, -base.ry * 0.85, 0.8)), INK);
}

function drawSquintEye(ctx: Ctx, frame: { cx: number; cy: number; angle: number; mirror: boolean }, base: EyeBase, style: EyeStyle): void {
  const bounds = boundsAround(frame.cx, frame.cy, 18);
  const white = sclera(base.rx, base.ry * 0.5, Math.min(0.5, base.cut + style.cutAdd));
  const at = (local: Sdf): Sdf => place(frame, local);
  paint(ctx, bounds, at(union([expand(white, 1.4), expand(translate(white, 0, -1.2), 1.8)])), INK);
  paint(ctx, bounds, at(white), SCLERA);
  paint(ctx, bounds, at(intersect(ellipse(0, 0.5, base.rx * 0.72, base.ry * 0.55), white)), PUPIL);
  paint(ctx, bounds, at(circle(-base.rx * 0.25, -0.5, 1.3)), 0xffffff);
}

function drawWideEye(ctx: Ctx, frame: { cx: number; cy: number; angle: number; mirror: boolean }, base: EyeBase): void {
  const bounds = boundsAround(frame.cx, frame.cy, 20);
  const white = ellipse(0, 0, base.rx * 1.12, base.ry * 1.1);
  const at = (local: Sdf): Sdf => place(frame, local);
  paint(ctx, bounds, at(expand(white, 1.4)), INK);
  paint(ctx, bounds, at(white), SCLERA);
  paint(ctx, bounds, at(circle(0, 0.5, base.rx * 0.36)), PUPIL);
  paint(ctx, bounds, at(circle(-base.rx * 0.12, -base.ry * 0.12, 1.9)), 0xffffff);
}

function drawHappyEye(ctx: Ctx, frame: { cx: number; cy: number; angle: number; mirror: boolean }, base: EyeBase, style: EyeStyle): void {
  const bounds = boundsAround(frame.cx, frame.cy, 18);
  const radius = base.rx * 1.25;
  const arc = arcDistance(0, radius * 0.45, radius, -Math.PI / 2, 58 * DEG);
  paint(ctx, bounds, place(frame, expand(arc, style.lineWidth / 2)), INK);
}

function drawClosedEye(ctx: Ctx, frame: { cx: number; cy: number; angle: number; mirror: boolean }, base: EyeBase, style: EyeStyle): void {
  const bounds = boundsAround(frame.cx, frame.cy, 18);
  const radius = base.rx * 1.3;
  const arc = arcDistance(0, -radius * 0.7, radius, Math.PI / 2, 46 * DEG);
  const lash = capsule(base.rx * 0.95, radius * 0.18, base.rx * 1.35, radius * 0.18 + 2.4, 0.8);
  paint(ctx, bounds, place(frame, union([expand(arc, style.lineWidth / 2), lash])), INK);
}

function drawEye(ctx: Ctx, side: Side, shape: EyeShape, expression: FaceExpression): void {
  const base = eyeBase(shape);
  const style = eyeStyle(expression);
  const tilt = base.tilt + style.tiltAdd;
  const frame = { cx: eyeCenterX(side), cy: FACE_LAYOUT.eyeY, angle: -tilt * DEG, mirror: side === "left" };
  switch (style.kind) {
    case "open":
      drawOpenEye(ctx, frame, base, style);
      return;
    case "squint":
      drawSquintEye(ctx, frame, base, style);
      return;
    case "wide":
      drawWideEye(ctx, frame, base);
      return;
    case "happy":
      drawHappyEye(ctx, frame, base, style);
      return;
    case "closed":
      drawClosedEye(ctx, frame, base, style);
      return;
  }
}

function browThickness(shape: BrowShape): number {
  switch (shape) {
    case "thick":
      return 5;
    case "angled":
      return 3.6;
    case "thin":
      return 2.8;
  }
}

function drawBrow(ctx: Ctx, side: Side, shape: BrowShape, expression: FaceExpression): void {
  const style = browStyle(expression);
  const tilt = style.tilt + (shape === "angled" ? 15 : 0);
  const cx = eyeCenterX(side);
  const cy = FACE_LAYOUT.eyeY - FACE_LAYOUT.browRise + style.dy;
  const half = shape === "thick" ? 9 : 8.5;
  const frame = { cx, cy, angle: -tilt * DEG, mirror: side === "left" };
  const bar = capsule(-half, 0, half, 0, browThickness(shape) / 2);
  paint(ctx, boundsAround(cx, cy, 16), place(frame, bar), BROW_INK);
}

function drawCheeks(ctx: Ctx, expression: FaceExpression): void {
  const strength = cheekStrength(expression);
  if (strength <= 0) return;
  const color = mixColor(ctx.skin, 0xe8505a, 0.6);
  for (const dx of [-FACE_LAYOUT.cheekDx, FACE_LAYOUT.cheekDx]) {
    const cx = FACE_LAYOUT.centerX + dx;
    paint(ctx, boundsAround(cx, FACE_LAYOUT.cheekY, 14), ellipse(cx, FACE_LAYOUT.cheekY, 7.5, 4.6), color, { softness: 4, opacity: strength });
  }
}

function cheekStrength(expression: FaceExpression): number {
  switch (expression) {
    case "cheer":
      return 0.85;
    case "joy":
      return 0.7;
    case "shock":
      return 0.3;
    case "effort":
      return 0.35;
    case "neutral":
    case "focus":
    case "sad":
    case "blink":
      return 0.55;
  }
}

function drawSweat(ctx: Ctx, expression: FaceExpression): void {
  if (expression !== "shock" && expression !== "sad") return;
  const x = 83;
  const y = 36;
  const drop = union([
    circle(x, y + 4, 3.6),
    polygon([
      [x, y - 6],
      [x - 3.3, y + 2.6],
      [x + 3.3, y + 2.6],
    ]),
  ]);
  const bounds = boundsAround(x, y, 12);
  paint(ctx, bounds, expand(drop, 1), SWEAT_EDGE);
  paint(ctx, bounds, drop, SWEAT_FILL);
  paint(ctx, bounds, circle(x - 1.2, y + 3.6, 1.1), 0xffffff, { opacity: 0.9 });
}

function drawRestMouth(ctx: Ctx, rest: RestMouth, thick: number): void {
  const x = FACE_LAYOUT.centerX;
  const y = FACE_LAYOUT.mouthY;
  const bounds = boundsAround(x, y, 18);
  switch (rest) {
    case "flat":
      paint(ctx, bounds, capsule(x - 6.5, y, x + 6.5, y, thick / 2), MOUTH_INK);
      return;
    case "smile":
      paint(ctx, bounds, expand(arcDistance(x, y - 9.5, 11.5, Math.PI / 2, 38 * DEG), thick / 2), MOUTH_INK);
      return;
    case "small":
      paint(ctx, bounds, ellipse(x, y + 0.5, 3.8, 2.7), MOUTH_INSIDE);
      return;
  }
}

/** 開いた口(輪郭・中・舌・歯)。`shape` は口の内側の形、`tongue` は舌の楕円、`teethBand` は上の歯の帯の厚み(0 なら歯なし)。 */
function drawOpenMouth(ctx: Ctx, shape: Sdf, tongue: Sdf, teethBand: number, topY: number): void {
  const x = FACE_LAYOUT.centerX;
  const bounds = boundsAround(x, FACE_LAYOUT.mouthY, 22);
  paint(ctx, bounds, expand(shape, 1.4), MOUTH_INK);
  paint(ctx, bounds, shape, MOUTH_INSIDE);
  paint(ctx, bounds, intersect(shape, tongue), TONGUE);
  if (teethBand > 0) {
    paint(ctx, bounds, intersect(shape, halfPlane(0, 1, topY + teethBand)), 0xffffff);
  }
}

function drawGrit(ctx: Ctx): void {
  const x = FACE_LAYOUT.centerX;
  const y = FACE_LAYOUT.mouthY;
  const bounds = boundsAround(x, y, 18);
  const teeth = roundBox(x, y, 10.5, 5.6, 2.4);
  paint(ctx, bounds, expand(teeth, 1.5), MOUTH_INK);
  paint(ctx, bounds, teeth, 0xffffff);
  const lines = [-7, -3.5, 0, 3.5, 7].map((dx) => capsule(x + dx, y - 5, x + dx, y + 5, 0.45));
  paint(ctx, bounds, union([...lines, capsule(x - 10, y, x + 10, y, 0.45)]), MOUTH_INK, { opacity: 0.8 });
}

function drawMouth(ctx: Ctx, expression: FaceExpression, rest: RestMouth): void {
  const x = FACE_LAYOUT.centerX;
  const y = FACE_LAYOUT.mouthY;
  switch (expression) {
    case "neutral":
    case "blink":
      drawRestMouth(ctx, rest, 2.8);
      return;
    case "focus":
      drawRestMouth(ctx, "flat", 3.2);
      return;
    case "effort":
      drawGrit(ctx);
      return;
    case "shock":
      drawOpenMouth(ctx, ellipse(x, y + 2, 4.4, 6), ellipse(x, y + 6.5, 3, 2.4), 0, y);
      return;
    case "joy":
      drawOpenMouth(ctx, intersect(ellipse(x, y - 3, 11.5, 11.5), halfPlane(0, -1, -(y - 3))), ellipse(x, y + 7.5, 6.5, 4.2), 3, y - 3);
      return;
    case "cheer":
      drawOpenMouth(ctx, intersect(ellipse(x, y - 4, 14.5, 15), halfPlane(0, -1, -(y - 4))), ellipse(x, y + 8, 8, 5), 4, y - 4);
      return;
    case "sad":
      paint(ctx, boundsAround(x, y, 18), expand(arcDistance(x, y + 11, 11.5, -Math.PI / 2, 36 * DEG), 1.2), MOUTH_INK);
      return;
  }
}

function drawFace(ctx: Ctx, look: PlayerLook, expression: FaceExpression): void {
  drawCheeks(ctx, expression);
  drawEye(ctx, "left", look.eyes, expression);
  drawEye(ctx, "right", look.eyes, expression);
  drawBrow(ctx, "left", look.brow, expression);
  drawBrow(ctx, "right", look.brow, expression);
  drawMouth(ctx, expression, look.restMouth);
  drawSweat(ctx, expression);
}

function skinOf(skin: number): number {
  return SKIN_COLORS.at(skin) ?? SKIN_COLORS.at(0) ?? 0xffe3bd;
}

function cellContext(buffer: PixelBuffer, index: number, skin: number): Ctx {
  const column = index % FACE.columns;
  const row = Math.floor(index / FACE.columns);
  const originX = column * FACE.cell;
  const originY = row * FACE.cell;
  const clip = { x0: originX + FACE.padPx, y0: originY + FACE.padPx, x1: originX + FACE.cell - FACE.padPx, y1: originY + FACE.cell - FACE.padPx };
  return { buffer, originX, originY, clip, skin };
}

/**
 * `look` の顔アトラス(8 表情の 4×2 セル。384×192 RGBA)を作る。セルの並びは `WORLD_PARAMS.character.face.order`。
 * 全画素が不透明で、各セルの外周 `padPx` は肌色。同じ `look` なら常に同じ出力(乱数を使わない)。
 */
export function rasterAtlas(look: PlayerLook): FaceAtlas {
  const skin = skinOf(look.skin);
  const buffer = createBuffer(FACE_ATLAS_WIDTH, FACE_ATLAS_HEIGHT, skin, 255);
  FACE_EXPRESSION_ORDER.forEach((expression, index) => {
    drawFace(cellContext(buffer, index, skin), look, expression);
  });
  return { width: FACE_ATLAS_WIDTH, height: FACE_ATLAS_HEIGHT, cell: FACE.cell, rgba: buffer.data };
}

/** 肌色のセルだけの顔アトラス(無地の仮の顔。生成が間に合わないときに貼る。character 分冊 §3-4-2)。 */
export function rasterPlainAtlas(skin: number): FaceAtlas {
  const buffer = createBuffer(FACE_ATLAS_WIDTH, FACE_ATLAS_HEIGHT, skinOf(skin), 255);
  return { width: FACE_ATLAS_WIDTH, height: FACE_ATLAS_HEIGHT, cell: FACE.cell, rgba: buffer.data };
}
