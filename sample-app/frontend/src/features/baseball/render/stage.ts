// ステージの生成・描画・破棄。`document`・`window`・`matchMedia`・`ResizeObserver`・`WebGLRenderer`・`getContext` を使うのは render/ ではこのファイルだけ。
// canvas と WebGL2 コンテキストを自前で作る(three r163 以降は WebGL2 専用なので、WebGL1 にはフォールバックしない)。
// コンテキストが取れなければ three を呼ばずに `null` を返し、`WebGLRenderer` の生成やその後の初期化に失敗したときは、作った資源を手放し canvas を外して `null` を返す。
// 寸法(ゾーン・ボール・球場)は StageOptions の StageGeometry から読み、直書きしない。
// カメラの構図(位置・注視点・FOV・lift)は model が決めた CameraPose をそのまま適用する(縦横比による分岐は持たない)。
// ゾーン枠の画面矩形は `options.battingCameraFor(aspect, layout, safeArea)` から求め、レイアウトまたは空き領域が変わったら再計算して `onResize` で通知する。
// キャラクターは 14 体の固定プール(`character-pool.ts`。近景 4・遠景 10)。ワイプは第 2 パス(`wipe.ts`)。
// 品質ティアは `setQualityTier` で切り替える。再コンパイルを伴うので、ボールが見えている間(飛行中)はペンディングにし、見えなくなった(idle/holding)フレームで適用する。
import { PerspectiveCamera, Plane, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from "three";
import type { DataTexture } from "three";
import type { CameraPose, CharacterLookData, CharacterSlot, QualityTier, SafeArea, SceneFrame, SceneLayout, SceneWipe, Vec3 } from "../types/scene";
import type { ScreenRect, StageGeometry, StageHandle, StageOptions, StageStats } from "../types/stage";
import {
  applyPoolFrame,
  applyPoolTier,
  createPool,
  disposePool,
  entryOf,
  meshesPerCharacter,
  refreshPlaceholders,
  setPoolLook,
  setWipeTarget,
} from "./character-pool";
import type { CharacterPool } from "./character-pool";
import { disposeObject3D } from "./dispose";
import {
  CAMERA_FAR,
  CAMERA_NEAR,
  DEFAULT_UNIFORMS,
  applyRendererLook,
  createToonGradient,
  placeCamera,
  pixelRatioForTier,
  shadowMapSizeFor,
  shadowMapSizeForTier,
  tierSettingsFor,
} from "./look";
import { applyMarkers, buildMarkers } from "./markers";
import type { Markers } from "./markers";
import { applyShadowState } from "./quality";
import { buildStadiumParts, createFog, createSkyTexture } from "./stadium";
import type { StadiumParts } from "./stadium";
import { WIPE_NOT_DRAWN, createWipe, disposeWipe, drawWipe } from "./wipe";
import type { Wipe, WipePass } from "./wipe";

type Size = { readonly width: number; readonly height: number };

/** シーンに置くオブジェクト一式(破棄のために参照を保持する)。 */
type World = {
  readonly scene: Scene;
  /** `scene.background` のテクスチャ。シーングラフの外なので `dispose` で直接破棄する。 */
  readonly sky: DataTexture;
  /** トゥーンの階調テクスチャ(全キャラクターで共有。ここで破棄する)。 */
  readonly gradient: DataTexture;
  readonly stadium: StadiumParts;
  readonly pool: CharacterPool;
  readonly markers: Markers;
  readonly wipe: Wipe;
};

/** ステージの関数が共有する実行時の状態。 */
type Runtime = {
  readonly options: StageOptions;
  readonly canvas: HTMLCanvasElement;
  readonly renderer: WebGLRenderer;
  readonly world: World;
  /** 描画と `pickPlane` に使うカメラ(最後に `apply` された姿勢)。 */
  readonly camera: PerspectiveCamera;
  /** `zoneScreenRect` 専用。常に `options.battingCameraFor(アスペクト, layout, safeArea)` の姿勢(中継カメラ中でも不変)。 */
  readonly zoneCamera: PerspectiveCamera;
  readonly raycaster: Raycaster;
  readonly zonePlane: Plane;
  /** `pointer: coarse`(タッチ端末)か(画素比・影マップの大きさに使う)。 */
  readonly coarsePointer: boolean;
  disposed: boolean;
  /** 一度でも `apply` されたか(されるまでは初期状態のシーンを描かない)。 */
  hasFrame: boolean;
  size: Size;
  pose: CameraPose;
  /** ゾーン矩形の計算に使う、最後に `apply` されたフレームのレイアウトと空き領域(最初の `apply` まで `batting`・`null` = 既定の空き領域)。 */
  layout: SceneLayout;
  safeArea: SafeArea | null;
  zoneRect: ScreenRect | null;
  /** 現在の品質ティアと、飛行中に保留した切替先(なければ `null`)。 */
  tier: QualityTier;
  pendingTier: QualityTier | null;
  /** 直近のフレームで飛行中(ボールが見えている)か。 */
  inFlight: boolean;
  /** 直近のフレームのワイプ(再描画に使う)と、その第 2 パスの結果。 */
  wipe: SceneWipe | null;
  wipePass: WipePass;
};

type ContextListeners = {
  readonly lost: (event: Event) => void;
  readonly restored: () => void;
};

function isPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function aspectOf(size: Size): number {
  return size.height > 0 ? size.width / size.height : 1;
}

function releaseContext(gl: WebGL2RenderingContext): void {
  gl.getExtension("WEBGL_lose_context")?.loseContext();
}

/** canvas を container に追加して `WebGLRenderer` を作る。生成に失敗したら canvas を外してコンテキストを手放し、`null` を返す。 */
function createRenderer(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext, container: HTMLElement): WebGLRenderer | null {
  container.append(canvas);
  try {
    return new WebGLRenderer({ canvas, context: gl });
  } catch {
    canvas.remove();
    releaseContext(gl);
    return null;
  }
}

/** `pointer: coarse`(タッチ端末)か。`matchMedia` が無い環境は偽。 */
function isCoarsePointer(): boolean {
  const matchMedia = (window as { matchMedia?: Window["matchMedia"] }).matchMedia;
  return typeof matchMedia === "function" && matchMedia.call(window, "(pointer: coarse)").matches;
}

/** ステージ内のオブジェクトを作ってシーンに並べる。ポーズ・可視は最初の `apply` で確定する(`setLook` までキャラクターは仮の見た目)。 */
function buildWorld(options: StageOptions, coarsePointer: boolean): World {
  const { geometry, crowd, rig } = options;
  const sky = createSkyTexture();
  const scene = new Scene();
  scene.background = sky;
  scene.fog = createFog();
  const stadium = buildStadiumParts(geometry, crowd, { shadowMapSize: shadowMapSizeFor(coarsePointer) });
  scene.add(stadium.group);
  const gradient = createToonGradient();
  const pool = createPool(scene, { rig, gradient }, DEFAULT_UNIFORMS, options.quality === "normal");
  const markers = buildMarkers(geometry, gradient);
  scene.add(markers.group);
  return { scene, sky, gradient, stadium, pool, markers, wipe: createWipe() };
}

/** ゾーン枠の4隅をカメラで投影した画面矩形(キャンバス左上基準の CSS px)。 */
function projectZone(camera: PerspectiveCamera, zone: StageGeometry["zone"], size: Size): ScreenRect {
  const { halfWidth, bottom, top, planeZ } = zone;
  const corners = [
    new Vector3(-halfWidth, bottom, planeZ),
    new Vector3(halfWidth, bottom, planeZ),
    new Vector3(halfWidth, top, planeZ),
    new Vector3(-halfWidth, top, planeZ),
  ];
  const projected = corners.map((corner) => corner.project(camera));
  const xs = projected.map((point) => (point.x * 0.5 + 0.5) * size.width);
  const ys = projected.map((point) => (0.5 - point.y * 0.5) * size.height);
  const left = Math.min(...xs);
  const upper = Math.min(...ys);
  return { left, top: upper, width: Math.max(...xs) - left, height: Math.max(...ys) - upper };
}

/** ゾーン矩形を、現在のサイズ・レイアウト・空き領域の打撃カメラで計算し直す。 */
function updateZoneRect(rt: Runtime): void {
  placeCamera(rt.zoneCamera, rt.options.battingCameraFor(aspectOf(rt.size), rt.layout, rt.safeArea), rt.size);
  rt.zoneRect = projectZone(rt.zoneCamera, rt.options.geometry.zone, rt.size);
}

/** サイズ変更を反映する(レンダラ・描画用カメラ・ゾーン矩形)。描画はしない。 */
function applySize(rt: Runtime, size: Size): void {
  rt.size = size;
  rt.renderer.setSize(size.width, size.height, false);
  placeCamera(rt.camera, rt.pose, size);
  updateZoneRect(rt);
}

function sameSafeArea(a: SafeArea | null, b: SafeArea): boolean {
  return a !== null && a.top === b.top && a.bottom === b.bottom;
}

function sameRect(a: ScreenRect | null, b: ScreenRect | null): boolean {
  if (a === null || b === null) return a === b;
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}

/** フレームのレイアウト・空き領域が変わったらゾーン矩形を再計算し、矩形が変わったときだけ `onResize` で通知する。 */
function syncZoneLayout(rt: Runtime, frame: SceneFrame): void {
  if (rt.layout === frame.layout && sameSafeArea(rt.safeArea, frame.safeArea)) return;
  const before = rt.zoneRect;
  rt.layout = frame.layout;
  rt.safeArea = { top: frame.safeArea.top, bottom: frame.safeArea.bottom };
  updateZoneRect(rt);
  if (!sameRect(before, rt.zoneRect)) rt.options.onResize(rt.size);
}

function createRuntime(options: StageOptions, canvas: HTMLCanvasElement, renderer: WebGLRenderer, world: World, coarsePointer: boolean): Runtime {
  const { container, geometry } = options;
  const size = { width: Math.max(1, container.clientWidth), height: Math.max(1, container.clientHeight) };
  const initialPose = options.battingCameraFor(aspectOf(size), "batting", null);
  const makeCamera = (): PerspectiveCamera => new PerspectiveCamera(initialPose.fovDeg, aspectOf(size), CAMERA_NEAR, CAMERA_FAR);
  // 第 1 パスとワイプの第 2 パスを合算して計測するため、`info` の自動リセット(render() ごと)を止めて、フレームの頭で手動リセットする。
  renderer.info.autoReset = false;
  const rt: Runtime = {
    options,
    canvas,
    renderer,
    world,
    camera: makeCamera(),
    zoneCamera: makeCamera(),
    raycaster: new Raycaster(),
    zonePlane: new Plane(new Vector3(0, 0, 1), -geometry.zone.planeZ),
    coarsePointer,
    disposed: false,
    hasFrame: false,
    size,
    pose: initialPose,
    layout: "batting",
    safeArea: null,
    zoneRect: null,
    tier: 0,
    pendingTier: null,
    inFlight: false,
    wipe: null,
    wipePass: WIPE_NOT_DRAWN,
  };
  applySize(rt, size);
  return rt;
}

/** `renderer.info` のうち `stats()` が読む部分(テストで偽物を渡せるよう構造型で受ける)。 */
export type RendererInfoLike = {
  readonly render: { readonly calls: number; readonly triangles: number };
  readonly memory: { readonly geometries: number; readonly textures: number };
};

/** 描画負荷の実測。`render` は `autoReset` を止めているので直近の 1 フレーム(第 1 パス + ワイプ)分、`memory` は生成済みの総数。 */
export function readStageStats(info: RendererInfoLike): StageStats {
  return {
    drawCalls: info.render.calls,
    triangles: info.render.triangles,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
  };
}

/**
 * `stats()` の実体。`StageStats`(契約。E0 が凍結)に、品質ティアとワイプ・球場の基準値を足したもの。
 * 契約の型に無いフィールドなので、呼び出し側はこの型へ絞り込んで読む(型の追加は契約の変更になるため上申事項)。
 * - `qualityTier`/`pendingTier` = 現在のティアと、飛行中に保留した切替先。
 * - `wipe`/`wipeDrawCalls` = 直近のフレームでワイプの第 2 パスを描いたか・その draw call(`drawCalls` に含まれる)。
 * - `stadiumDrawCalls`/`stadiumShadowCasters` = 球場だけの基準値(描画オブジェクト数 = メインパスの draw call、影を落とすオブジェクト数 = 影のパスの draw call)。
 * - `meshesPerCharacter` = 1 体あたりの描画オブジェクト数(近景・遠景)。
 */
export type StageStatsDetail = StageStats & {
  readonly qualityTier: QualityTier;
  readonly pendingTier: QualityTier | null;
  readonly wipe: boolean;
  readonly wipeDrawCalls: number;
  readonly stadiumDrawCalls: number;
  readonly stadiumShadowCasters: number;
  readonly meshesPerCharacter: { readonly near: number; readonly far: number };
};

function statsOf(rt: Runtime): StageStatsDetail {
  const { stadium, pool } = rt.world;
  return {
    ...readStageStats(rt.renderer.info),
    qualityTier: rt.tier,
    pendingTier: rt.pendingTier,
    wipe: rt.wipePass.drawn,
    wipeDrawCalls: rt.wipePass.calls,
    stadiumDrawCalls: stadium.renderables,
    stadiumShadowCasters: stadium.shadowCasters,
    meshesPerCharacter: meshesPerCharacter(pool),
  };
}

/** ワイプの第 2 パス。対象が見えていない・ティアが許さない・矩形が空のときは描かない(対象の `WIPE_LAYER` も外す)。 */
function renderWipePass(rt: Runtime): WipePass {
  const { pool, wipe, scene } = rt.world;
  const spec = rt.wipe;
  const entry = spec && spec.visible && tierSettingsFor(rt.tier).wipe ? entryOf(pool, spec.target) : undefined;
  if (!spec || !entry || !entry.parts.root.visible) {
    setWipeTarget(pool, null);
    return WIPE_NOT_DRAWN;
  }
  setWipeTarget(pool, spec.target);
  return drawWipe(rt.renderer, scene, wipe, spec, rt.size, entry.parts.root);
}

function renderFrame(rt: Runtime): void {
  if (!rt.hasFrame) return;
  rt.renderer.info.reset();
  rt.renderer.render(rt.world.scene, rt.camera);
  rt.wipePass = renderWipePass(rt);
}

/** ティアをレンダラ・影・キャラクターへ反映する(再コンパイルを伴うので飛行中は呼ばない)。描画はしない。 */
function applyTier(rt: Runtime, tier: QualityTier): void {
  rt.pendingTier = null;
  if (tier === rt.tier) return;
  rt.tier = tier;
  const { options } = rt;
  rt.renderer.setPixelRatio(pixelRatioForTier(options.quality, window.devicePixelRatio, rt.coarsePointer, tier));
  const mapSize = options.quality === "normal" ? shadowMapSizeForTier(tier, shadowMapSizeFor(rt.coarsePointer)) : 0;
  const shadowOn = applyShadowState(rt.renderer, rt.world.stadium.sun, rt.world.scene, mapSize);
  applyPoolTier(rt.world.pool, tierSettingsFor(tier), shadowOn);
}

/** 飛行中なら保留し、そうでなければ適用して再描画する。 */
function requestTier(rt: Runtime, tier: QualityTier): void {
  if (rt.disposed) return;
  if (rt.inFlight) {
    rt.pendingTier = tier === rt.tier ? null : tier;
    return;
  }
  applyTier(rt, tier);
  renderFrame(rt);
}

function applyStage(rt: Runtime, frame: SceneFrame): void {
  if (rt.disposed) return;
  rt.pose = frame.camera;
  placeCamera(rt.camera, frame.camera, rt.size);
  syncZoneLayout(rt, frame);
  // ボールが見えている間 = 飛行中(`SceneFrame` に位相は無い)。見えなくなった最初のフレームで、保留中のティアを適用する。
  rt.inFlight = frame.ball.visible;
  if (!rt.inFlight && rt.pendingTier !== null) applyTier(rt, rt.pendingTier);
  const { pool, markers } = rt.world;
  refreshPlaceholders(pool, frame.uniforms);
  applyPoolFrame(pool, frame);
  applyMarkers(markers, frame);
  rt.wipe = frame.wipe;
  rt.hasFrame = true;
  renderFrame(rt);
}

/** サイズが正の有限値のときだけ反映し、直前の `apply` の状態を再描画して `onResize` を通知する(非正・NaN は無視)。 */
function resizeStage(rt: Runtime, width: number, height: number): void {
  if (rt.disposed || !isPositive(width) || !isPositive(height)) return;
  applySize(rt, { width, height });
  renderFrame(rt);
  rt.options.onResize({ width, height });
}

/** 最後に `apply` されたカメラ(ビューオフセットを含む)で、画面座標からゾーン平面への交点を求める。 */
function pickPlane(rt: Runtime, clientX: number, clientY: number): Vec3 | null {
  if (rt.disposed) return null;
  const rect = rt.canvas.getBoundingClientRect();
  if (!isPositive(rect.width) || !isPositive(rect.height)) return null;
  const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, 1 - ((clientY - rect.top) / rect.height) * 2);
  rt.raycaster.setFromCamera(ndc, rt.camera);
  const hit = rt.raycaster.ray.intersectPlane(rt.zonePlane, new Vector3());
  return hit === null ? null : { x: hit.x, y: hit.y, z: hit.z };
}

function styleCanvas(canvas: HTMLCanvasElement): void {
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
}

/** コンテキストの喪失(`"lost"`)と復帰(`"ready"`)を通知するリスナ。three 自身のリスナ(復帰時の再初期化)より後に登録する。 */
function createContextListeners(rt: Runtime): ContextListeners {
  return {
    lost: (event) => {
      event.preventDefault();
      if (!rt.disposed) rt.options.onStatusChange("lost");
    },
    restored: () => {
      if (rt.disposed) return;
      renderFrame(rt);
      rt.options.onStatusChange("ready");
    },
  };
}

/** geometry・material・texture を破棄する。キャラクター(顔・背番号・縞・スケルトンを含む)とワイプは個別に、球場・マーカー・空・階調は直接。 */
function disposeWorld(world: World): void {
  disposePool(world.pool);
  disposeWipe(world.wipe);
  disposeObject3D(world.scene);
  world.sky.dispose();
  world.gradient.dispose();
}

/** レンダラの破棄 → コンテキストの手放し → canvas の取り外し。`disposeStage` と、初期化の失敗時の後始末で共有する。 */
function releaseRenderer(renderer: WebGLRenderer, canvas: HTMLCanvasElement): void {
  renderer.dispose();
  renderer.forceContextLoss();
  canvas.remove();
}

/**
 * 破棄。順序は固定: ①`disposed` → ②context リスナ解除(後続の `forceContextLoss` が `"lost"` を通知しないため)→ ③`disconnect()`
 * → ④geometry/material/texture → ⑤`renderer.dispose()` → `forceContextLoss()` → ⑥canvas を外す。冪等。以後コールバックは呼ばない。
 */
function disposeStage(rt: Runtime, listeners: ContextListeners, observer: ResizeObserver): void {
  if (rt.disposed) return;
  rt.disposed = true;
  rt.canvas.removeEventListener("webglcontextlost", listeners.lost);
  rt.canvas.removeEventListener("webglcontextrestored", listeners.restored);
  observer.disconnect();
  disposeWorld(rt.world);
  releaseRenderer(rt.renderer, rt.canvas);
}

/**
 * 容器のリサイズ監視と context lost/restored のリスナを結び、ステージのハンドルを返す。
 * 例外を投げうる処理(`ResizeObserver` の生成・監視開始)を先に済ませ、リスナは最後に登録する
 * (途中で失敗しても、後始末の `forceContextLoss` が `"lost"` を通知しないようにするため)。
 */
function wireStage(rt: Runtime): StageHandle {
  const observer = new ResizeObserver((entries) => {
    const entry = entries.at(-1);
    if (entry) resizeStage(rt, entry.contentRect.width, entry.contentRect.height);
  });
  observer.observe(rt.options.container);
  const listeners = createContextListeners(rt);
  rt.canvas.addEventListener("webglcontextlost", listeners.lost);
  rt.canvas.addEventListener("webglcontextrestored", listeners.restored);
  return {
    apply: (frame) => applyStage(rt, frame),
    stats: () => (rt.disposed ? null : statsOf(rt)),
    setLook: (slot: CharacterSlot, data: CharacterLookData) => {
      if (!rt.disposed) setPoolLook(rt.world.pool, slot, data);
    },
    setQualityTier: (tier: QualityTier) => requestTier(rt, tier),
    resize: (width, height) => resizeStage(rt, width, height),
    pickPlane: (clientX, clientY) => pickPlane(rt, clientX, clientY),
    zoneScreenRect: () => (rt.disposed ? null : rt.zoneRect),
    dispose: () => disposeStage(rt, listeners, observer),
  };
}

/**
 * `WebGLRenderer` の生成後の初期化(見た目の設定・シーンの構築・ランタイムの組み立て・結線)。例外を投げうる。
 * シーンの構築後に失敗したときは、そのシーンを破棄してから例外を投げ直す(`renderer`・canvas の後始末は呼び出し側)。
 * シーン構築の途中で失敗した分は、最初の `apply` まで描画しないので GPU 資源を持たず、ガベージコレクションに任せる。
 */
function assembleStage(options: StageOptions, canvas: HTMLCanvasElement, renderer: WebGLRenderer): StageHandle {
  const coarsePointer = isCoarsePointer();
  applyRendererLook(renderer, options.quality);
  renderer.setPixelRatio(pixelRatioForTier(options.quality, window.devicePixelRatio, coarsePointer, 0));
  styleCanvas(canvas);
  const world = buildWorld(options, coarsePointer);
  try {
    return wireStage(createRuntime(options, canvas, renderer, world, coarsePointer));
  } catch (error) {
    disposeWorld(world);
    throw error;
  }
}

/**
 * ステージを作って `container` に canvas を追加する。WebGL2 が取れない・`WebGLRenderer` の生成や、その後の初期化に失敗したときは
 * 作った資源(シーン・レンダラ・コンテキスト・canvas)を手放して `null` を返す(呼び出し側がフォールバック表示にする)。例外は投げない。
 * 初期状態の通知はしない(生成の成功は戻り値で分かる)。`onStatusChange` は context lost で `"lost"`、復帰で `"ready"`、`onResize` は容器のサイズ変化のたびに呼ぶ。
 */
export function createStage(options: StageOptions): StageHandle | null {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", { antialias: options.quality === "normal" });
  if (gl === null) return null;
  const renderer = createRenderer(canvas, gl, options.container);
  if (renderer === null) return null;
  try {
    return assembleStage(options, canvas, renderer);
  } catch {
    releaseRenderer(renderer, canvas);
    return null;
  }
}
