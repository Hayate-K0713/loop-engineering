// ステージの生成・描画・破棄。`document`・`window`・`matchMedia`・`ResizeObserver`・`WebGLRenderer`・`getContext` を使うのは render/ ではこのファイルだけ。
// canvas と WebGL2 コンテキストを自前で作る(three r163 以降は WebGL2 専用なので、WebGL1 にはフォールバックしない)。
// コンテキストが取れなければ three を呼ばずに `null` を返し、`WebGLRenderer` の生成やその後の初期化に失敗したときは、作った資源を手放し canvas を外して `null` を返す。
// 寸法(ゾーン・ボール・球場)は StageOptions の StageGeometry から読み、直書きしない。
// カメラの構図(位置・注視点・FOV・lift)は model が決めた CameraPose をそのまま適用する(縦横比による分岐は持たない)。
// ゾーン枠の画面矩形は `options.battingCameraFor(aspect, layout, safeArea)` から求め、レイアウトまたは空き領域が変わったら再計算して `onResize` で通知する。
import { PerspectiveCamera, Plane, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from "three";
import type { DataTexture } from "three";
import type { CameraPose, SafeArea, SceneFrame, SceneLayout, UniformColors, Vec3 } from "../types/scene";
import type { ScreenRect, StageGeometry, StageHandle, StageOptions, StageStats } from "../types/stage";
import { applyUniforms, buildCharacter, createTeamMaterials } from "./character";
import type { CharacterParts, TeamMaterials } from "./character";
import { disposeObject3D } from "./dispose";
import { CAMERA_FAR, CAMERA_NEAR, applyRendererLook, createToonGradient, pixelRatioFor, shadowMapSizeFor } from "./look";
import { applyMarkers, buildMarkers } from "./markers";
import type { Markers } from "./markers";
import { applyBatterPose, applyPose } from "./pose-apply";
import { buildStadium, createFog, createSkyTexture } from "./stadium";

/** 野手の人数(`SceneFrame.fielders` の固定順 7人)。 */
const FIELDER_COUNT = 7;

type Size = { readonly width: number; readonly height: number };

/** シーンに置くオブジェクト一式(破棄のために参照を保持する)。 */
type World = {
  readonly scene: Scene;
  /** `scene.background` のテクスチャ。シーングラフの外なので `dispose` で直接破棄する。 */
  readonly sky: DataTexture;
  readonly gradient: DataTexture;
  readonly teams: TeamMaterials;
  readonly pitcher: CharacterParts;
  readonly catcher: CharacterParts;
  readonly batter: CharacterParts;
  readonly fielders: readonly CharacterParts[];
  readonly markers: Markers;
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
  disposed: boolean;
  /** 一度でも `apply` されたか(されるまでは初期状態のシーンを描かない)。 */
  hasFrame: boolean;
  size: Size;
  pose: CameraPose;
  /** ゾーン矩形の計算に使う、最後に `apply` されたフレームのレイアウトと空き領域(最初の `apply` まで `batting`・`null` = 既定の空き領域)。 */
  layout: SceneLayout;
  safeArea: SafeArea | null;
  /** 最後に反映したユニフォーム色(変わったときだけ材質を更新する)。 */
  uniforms: UniformColors | null;
  zoneRect: ScreenRect | null;
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

/** ステージ内のオブジェクトを作ってシーンに並べる。ポーズ・可視・ユニフォーム色は最初の `apply` で確定する。 */
function buildWorld(options: StageOptions, coarsePointer: boolean): World {
  const { geometry, crowd, rig } = options;
  const sky = createSkyTexture();
  const scene = new Scene();
  scene.background = sky;
  scene.fog = createFog();
  scene.add(buildStadium(geometry, crowd, { shadowMapSize: shadowMapSizeFor(coarsePointer) }));
  const gradient = createToonGradient();
  const teams = createTeamMaterials(gradient);
  const defense = { accent: teams.defense, gradient, glove: true, bat: false };
  const pitcher = buildCharacter(rig, defense);
  const catcher = buildCharacter(rig, defense);
  const batter = buildCharacter(rig, { accent: teams.offense, gradient, glove: false, bat: true });
  const fielders = Array.from({ length: FIELDER_COUNT }, () => buildCharacter(rig, defense));
  const markers = buildMarkers(geometry, gradient);
  scene.add(pitcher.root, catcher.root, batter.root, ...fielders.map((fielder) => fielder.root), markers.group);
  return { scene, sky, gradient, teams, pitcher, catcher, batter, fielders, markers };
}

/** カメラを姿勢にそのまま合わせる(縦 FOV は `pose.fovDeg`、シーンを上へずらす量は `pose.lift`。どちらも model が決める)。 */
function placeCamera(camera: PerspectiveCamera, pose: CameraPose, size: Size): void {
  camera.aspect = aspectOf(size);
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

function createRuntime(options: StageOptions, canvas: HTMLCanvasElement, renderer: WebGLRenderer, world: World): Runtime {
  const { container, geometry } = options;
  const size = { width: Math.max(1, container.clientWidth), height: Math.max(1, container.clientHeight) };
  const initialPose = options.battingCameraFor(aspectOf(size), "batting", null);
  const makeCamera = (): PerspectiveCamera => new PerspectiveCamera(initialPose.fovDeg, aspectOf(size), CAMERA_NEAR, CAMERA_FAR);
  const rt: Runtime = {
    options,
    canvas,
    renderer,
    world,
    camera: makeCamera(),
    zoneCamera: makeCamera(),
    raycaster: new Raycaster(),
    zonePlane: new Plane(new Vector3(0, 0, 1), -geometry.zone.planeZ),
    disposed: false,
    hasFrame: false,
    size,
    pose: initialPose,
    layout: "batting",
    safeArea: null,
    uniforms: null,
    zoneRect: null,
  };
  applySize(rt, size);
  return rt;
}

/** `renderer.info` のうち `stats()` が読む部分(テストで偽物を渡せるよう構造型で受ける)。 */
export type RendererInfoLike = {
  readonly render: { readonly calls: number; readonly triangles: number };
  readonly memory: { readonly geometries: number; readonly textures: number };
};

/** 描画負荷の実測。`render` は `autoReset`(既定)により直近の 1 フレーム分、`memory` は生成済みの総数。 */
export function readStageStats(info: RendererInfoLike): StageStats {
  return {
    drawCalls: info.render.calls,
    triangles: info.render.triangles,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
  };
}

function renderFrame(rt: Runtime): void {
  if (rt.hasFrame) rt.renderer.render(rt.world.scene, rt.camera);
}

function updateUniforms(rt: Runtime, uniforms: UniformColors): void {
  const last = rt.uniforms;
  if (last !== null && last.offense === uniforms.offense && last.defense === uniforms.defense) return;
  applyUniforms(rt.world.teams, uniforms);
  rt.uniforms = { offense: uniforms.offense, defense: uniforms.defense };
}

function applyWorld(world: World, frame: SceneFrame): void {
  applyPose(world.pitcher, frame.pitcher);
  applyPose(world.catcher, frame.catcher);
  applyBatterPose(world.batter, frame.batter);
  world.fielders.forEach((fielder, index) => {
    const pose = frame.fielders.at(index);
    if (pose) {
      applyPose(fielder, pose);
    } else {
      fielder.root.visible = false;
    }
  });
  applyMarkers(world.markers, frame);
}

function applyStage(rt: Runtime, frame: SceneFrame): void {
  if (rt.disposed) return;
  rt.pose = frame.camera;
  placeCamera(rt.camera, frame.camera, rt.size);
  syncZoneLayout(rt, frame);
  updateUniforms(rt, frame.uniforms);
  applyWorld(rt.world, frame);
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

/** geometry・material・texture を破棄する。球場・キャラクター・マーカーはシーングラフから、空とグラデーションと材質は直接。 */
function disposeWorld(world: World): void {
  disposeObject3D(world.scene);
  world.sky.dispose();
  world.gradient.dispose();
  world.teams.offense.dispose();
  world.teams.defense.dispose();
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
    stats: () => (rt.disposed ? null : readStageStats(rt.renderer.info)),
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
  renderer.setPixelRatio(pixelRatioFor(options.quality, window.devicePixelRatio, coarsePointer));
  styleCanvas(canvas);
  const world = buildWorld(options, coarsePointer);
  try {
    return wireStage(createRuntime(options, canvas, renderer, world));
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
