// ワイプ(顔アップの第 2 ビューポート)の第 2 パス。character 分冊 §3-4-9。
// 同じシーンを別カメラで小さな矩形に再描画する。カメラの `layers` は `WIPE_LAYER` だけなので、描かれるのは
// 対象のキャラクター(`setWipeLayer(true)`)と、地面・内野の土・マウンド・ライト(球場が `WIPE_LAYER` を有効にしたもの)だけ。
// 影・マーカー・他のキャラクター・球場の残りは描かない。影マップは第 1 パスのものを使い回す(`shadowMap.autoUpdate = false`)。
// `alpha` が 1 未満のときは、いったん `WebGLRenderTarget` に描いてから半透明の板として矩形へ重ねる(draw call +1)。
// `window`・`document` は使わない(DOM に触れるのは `stage.ts` だけ)。
import { Mesh, MeshBasicMaterial, OrthographicCamera, PerspectiveCamera, PlaneGeometry, Scene, WebGLRenderTarget } from "three";
import type { Object3D, WebGLRenderer } from "three";
import type { SceneWipe } from "../types/scene";
import { WIPE_LAYER } from "./character/parts";
import { placeCamera } from "./look";

type Size = { readonly width: number; readonly height: number };

/** 第 2 パスの結果。`drawn` = 描いたか、`calls` = 第 2 パスで増えた draw call。 */
export type WipePass = { readonly drawn: boolean; readonly calls: number };

export const WIPE_NOT_DRAWN: WipePass = { drawn: false, calls: 0 };

/** この値以上の `alpha` は不透明として、render target を介さずに直接描く。 */
const OPAQUE_ALPHA = 0.999;

export type Wipe = {
  readonly camera: PerspectiveCamera;
  /** `alpha < 1` のときの合成用(板 1 枚)。 */
  readonly composite: Scene;
  readonly compositeCamera: OrthographicCamera;
  readonly quad: Mesh<PlaneGeometry, MeshBasicMaterial>;
  target: WebGLRenderTarget | null;
};

export function createWipe(): Wipe {
  const camera = new PerspectiveCamera();
  camera.layers.set(WIPE_LAYER);
  const quad = new Mesh(
    new PlaneGeometry(2, 2),
    new MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }),
  );
  const composite = new Scene();
  composite.add(quad);
  const compositeCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 2);
  compositeCamera.position.z = 1;
  return { camera, composite, compositeCamera, quad, target: null };
}

type PixelRect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** 矩形(キャンバス左上基準の CSS px)を整数にして、キャンバスの内側に収める。空なら `null`。 */
function clampRect(rect: SceneWipe["rect"], canvas: Size): PixelRect | null {
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) return null;
  const left = Math.max(0, Math.floor(rect.x));
  const top = Math.max(0, Math.floor(rect.y));
  const right = Math.min(canvas.width, Math.ceil(rect.x + rect.width));
  const bottom = Math.min(canvas.height, Math.ceil(rect.y + rect.height));
  if (right - left < 1 || bottom - top < 1) return null;
  // three のビューポートは左下基準。
  return { x: left, y: canvas.height - bottom, width: right - left, height: bottom - top };
}

function useViewport(renderer: WebGLRenderer, rect: PixelRect): void {
  renderer.setScissorTest(true);
  renderer.setScissor(rect.x, rect.y, rect.width, rect.height);
  renderer.setViewport(rect.x, rect.y, rect.width, rect.height);
}

function resetViewport(renderer: WebGLRenderer, canvas: Size): void {
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, canvas.width, canvas.height);
}

function ensureTarget(wipe: Wipe, width: number, height: number): WebGLRenderTarget {
  const current = wipe.target;
  if (current && current.width === width && current.height === height) return current;
  current?.dispose();
  const target = new WebGLRenderTarget(width, height);
  wipe.target = target;
  wipe.quad.material.map = target.texture;
  wipe.quad.material.needsUpdate = true;
  return target;
}

function renderFaded(renderer: WebGLRenderer, scene: Scene, wipe: Wipe, rect: PixelRect, canvas: Size, alpha: number): void {
  const pixelRatio = renderer.getPixelRatio();
  const target = ensureTarget(wipe, Math.max(1, Math.round(rect.width * pixelRatio)), Math.max(1, Math.round(rect.height * pixelRatio)));
  renderer.setRenderTarget(target);
  renderer.render(scene, wipe.camera);
  renderer.setRenderTarget(null);
  wipe.quad.material.opacity = alpha;
  const autoClear = renderer.autoClear;
  renderer.autoClear = false;
  useViewport(renderer, rect);
  renderer.render(wipe.composite, wipe.compositeCamera);
  renderer.autoClear = autoClear;
  resetViewport(renderer, canvas);
}

function renderDirect(renderer: WebGLRenderer, scene: Scene, wipe: Wipe, rect: PixelRect, canvas: Size): void {
  useViewport(renderer, rect);
  renderer.render(scene, wipe.camera);
  resetViewport(renderer, canvas);
}

/**
 * 第 2 パスを描く。対象のキャラクター(`targetRoot`)はワイプの間だけ実寸(`scale = 1`)にする(打者の表示倍率 0.70 は打撃カメラ用)。
 * 戻り値は第 2 パスの結果(描いたか・増えた draw call)。呼び出し側は、対象の `setWipeLayer(true)` を済ませ、
 * `renderer.info.autoReset = false` にしておく(さもないと第 1 パスの計測が消える)。
 */
export function drawWipe(renderer: WebGLRenderer, scene: Scene, wipe: Wipe, spec: SceneWipe, canvas: Size, targetRoot: Object3D): WipePass {
  const rect = clampRect(spec.rect, canvas);
  if (rect === null || !Number.isFinite(spec.alpha) || spec.alpha <= 0) return WIPE_NOT_DRAWN;
  placeCamera(wipe.camera, spec.camera, rect);
  const before = renderer.info.render.calls;
  const scale = targetRoot.scale.x;
  targetRoot.scale.setScalar(1);
  renderer.shadowMap.autoUpdate = false;
  if (spec.alpha >= OPAQUE_ALPHA) renderDirect(renderer, scene, wipe, rect, canvas);
  else renderFaded(renderer, scene, wipe, rect, canvas, Math.min(spec.alpha, 1));
  renderer.shadowMap.autoUpdate = true;
  targetRoot.scale.setScalar(scale);
  return { drawn: true, calls: renderer.info.render.calls - before };
}

export function disposeWipe(wipe: Wipe): void {
  wipe.target?.dispose();
  wipe.target = null;
  wipe.quad.geometry.dispose();
  wipe.quad.material.dispose();
}
