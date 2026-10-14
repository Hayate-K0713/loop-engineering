// ゾーン枠・ゾーン枠の発光・5×5格子・スイングカーソル・狙いセルのハイライト・ボールと地面の影・落下点のリング。
// ゾーン・ボールの寸法は StageGeometry から読む(直書きしない)。SceneFrame の該当部分を適用する関数も持つ。
//
// 描画順(小さい順に描く。いずれも透明パス): 影・ゾーン枠・発光・格子・狙い(10 以下)→ カーソル(11)→ ボールの輪郭(11.5)→ ボール本体(12)。
// - three は Group の `renderOrder` を子全体の第1キーにするので、カーソルの Group には `renderOrder` を付けず、メッシュに個別に付ける。
// - 不透明のままだとボールは透明パスのカーソルより先に描かれるので、ボール(本体と輪郭)は `transparent: true` にして透明パスへ移す。
// - カーソルの塗りは `depthWrite: false`(深度を書くと、後から描くボールが隠れる)。
import {
  BackSide,
  BufferGeometry,
  CircleGeometry,
  Color,
  Group,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from "three";
import type { DataTexture } from "three";
import type { SceneFrame } from "../types/scene";
import type { StageGeometry } from "../types/stage";
import { BALL_OUTLINE_SCALE, OUTLINE_COLOR, PALETTE } from "./look";

/** 5×5 コースのセル幅(ゾーン単位。ゾーン全幅 2 の 3 分の 1 = 3×3 がゾーン内)。 */
const CELL_UNITS = 2 / 3;
const GRID_CELLS = 5;
/** renderOrder(大きいほど後に描く = 手前)。 */
export const RENDER_ORDER = { overlay: 10, cursor: 11, ballOutline: 11.5, ball: 12 } as const;
const BALL_SHADOW = { y: 0.06, scale: 1.8, opacity: 0.5 } as const;
const CURSOR_OPACITY = { rest: 0.32, flash: 0.6, ring: 0.95 } as const;
/** ゾーン枠の発光: 枠線は白から黄へ寄せ、内側を `pulse × fillOpacity` の黄色の板で塗る。 */
const ZONE_PULSE = { frameOpacity: 0.9, fillOpacity: 0.25 } as const;
const LANDING_RING = { innerRatio: 0.82, opacity: 0.7 } as const;
const WHITE = new Color(PALETTE.white);
const ACCENT = new Color(PALETTE.accent);

export type Markers = {
  /** シーンに追加するルート。 */
  readonly group: Group;
  readonly zoneFrame: LineSegments;
  /** ゾーン枠の線の材質(発光で色と不透明度を変える)。 */
  readonly zoneFrameMaterial: LineBasicMaterial;
  /** ゾーン内側を覆う発光板。 */
  readonly zonePulse: Mesh;
  readonly zonePulseMaterial: MeshBasicMaterial;
  readonly grid: LineSegments;
  readonly cursor: Group;
  readonly cursorFill: MeshBasicMaterial;
  readonly aim: Group;
  readonly ball: Group;
  readonly ballShadow: Mesh;
  /** 打球の落下点のリング(半径 1 の輪を `scale` で広げる)。 */
  readonly landingRing: Mesh;
};

function overlayLineMaterial(opacity: number): LineBasicMaterial {
  return new LineBasicMaterial({ color: PALETTE.white, transparent: true, opacity, depthTest: false });
}

function overlayFillMaterial(color: number, opacity: number): MeshBasicMaterial {
  return new MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false });
}

/** 線分(2点ずつ)の列から LineSegments を作る。 */
function segments(points: readonly Vector3[], material: LineBasicMaterial, order: number): LineSegments {
  const lines = new LineSegments(new BufferGeometry().setFromPoints([...points]), material);
  lines.renderOrder = order;
  return lines;
}

function buildZoneFrame(zone: StageGeometry["zone"]): { frame: LineSegments; material: LineBasicMaterial } {
  const { halfWidth, bottom, top, planeZ } = zone;
  const corner = (x: number, y: number): Vector3 => new Vector3(x, y, planeZ);
  const points = [
    corner(-halfWidth, bottom),
    corner(halfWidth, bottom),
    corner(halfWidth, bottom),
    corner(halfWidth, top),
    corner(halfWidth, top),
    corner(-halfWidth, top),
    corner(-halfWidth, top),
    corner(-halfWidth, bottom),
  ];
  const material = overlayLineMaterial(ZONE_PULSE.frameOpacity);
  return { frame: segments(points, material, RENDER_ORDER.overlay), material };
}

/** ゾーンの内側を覆う発光板(黄色。不透明度 = `pulse × ZONE_PULSE.fillOpacity`)。透明・深度なし・renderOrder 10。 */
function buildZonePulse(zone: StageGeometry["zone"]): { mesh: Mesh; material: MeshBasicMaterial } {
  const { halfWidth, bottom, top, planeZ } = zone;
  const material = overlayFillMaterial(PALETTE.accent, 0);
  material.depthWrite = false;
  const mesh = new Mesh(new PlaneGeometry(halfWidth * 2, top - bottom), material);
  mesh.position.set(0, (top + bottom) / 2, planeZ);
  mesh.renderOrder = RENDER_ORDER.overlay;
  mesh.visible = false;
  return { mesh, material };
}

/** 5×5 の格子線(セルの境界 6 本ずつ)。ゾーン枠(±1)は中央の 3×3 セルに当たる。 */
function buildGrid(zone: StageGeometry["zone"]): LineSegments {
  const { halfWidth, bottom, top, planeZ } = zone;
  const centerY = (top + bottom) / 2;
  const halfHeight = (top - bottom) / 2;
  const extent = (GRID_CELLS * CELL_UNITS) / 2;
  const edges = Array.from({ length: GRID_CELLS + 1 }, (_, i) => (i - GRID_CELLS / 2) * CELL_UNITS);
  const points = edges.flatMap((u) => [
    new Vector3(u * halfWidth, centerY - extent * halfHeight, planeZ),
    new Vector3(u * halfWidth, centerY + extent * halfHeight, planeZ),
    new Vector3(-extent * halfWidth, centerY + u * halfHeight, planeZ),
    new Vector3(extent * halfWidth, centerY + u * halfHeight, planeZ),
  ]);
  return segments(points, overlayLineMaterial(0.35), RENDER_ORDER.overlay);
}

/**
 * スイングカーソル(塗り・リング・中心点の単位円)。`scale` に半径(m)を掛けて楕円にする。
 * Group の `renderOrder` は 0 のまま(子全体の第1キーになるため)。塗り・リング・中心点のメッシュに個別に付け、塗りは深度を書かない。
 */
function buildCursor(): { cursor: Group; fill: MeshBasicMaterial } {
  const cursor = new Group();
  const fill = overlayFillMaterial(PALETTE.accent, CURSOR_OPACITY.rest);
  fill.depthWrite = false;
  const parts = [
    new Mesh(new CircleGeometry(1, 40), fill),
    new Mesh(new RingGeometry(0.9, 1, 40), overlayFillMaterial(PALETTE.accent, CURSOR_OPACITY.ring)),
    new Mesh(new CircleGeometry(0.12, 16), new MeshBasicMaterial({ color: PALETTE.white, transparent: true, depthTest: false })),
  ];
  for (const mesh of parts) {
    mesh.renderOrder = RENDER_ORDER.cursor;
    cursor.add(mesh);
  }
  return { cursor, fill };
}

/** 狙いセルのハイライト(単位正方形。`scale` に全幅・全高(m)を掛ける)。 */
function buildAim(): Group {
  const aim = new Group();
  const fill = new Mesh(new PlaneGeometry(1, 1), overlayFillMaterial(PALETTE.accent, 0.4));
  const border = new LineLoop(
    new BufferGeometry().setFromPoints([new Vector3(-0.5, -0.5, 0), new Vector3(0.5, -0.5, 0), new Vector3(0.5, 0.5, 0), new Vector3(-0.5, 0.5, 0)]),
    new LineBasicMaterial({ color: PALETTE.accent, depthTest: false }),
  );
  fill.renderOrder = RENDER_ORDER.overlay;
  border.renderOrder = RENDER_ORDER.overlay;
  aim.add(fill, border);
  return aim;
}

/**
 * ボール(本体と輪郭)。透明パス(`transparent: true`)・深度なしで、輪郭 11.5・本体 12 に描く(カーソルより手前)。
 * 影は地面の円盤 1 つだけにするので、本体は `castShadow` しない。
 */
function buildBall(radius: number, gradient: DataTexture): Group {
  const ball = new Group();
  const geometry = new SphereGeometry(radius, 16, 12);
  const body = new Mesh(geometry, new MeshToonMaterial({ color: PALETTE.white, gradientMap: gradient, transparent: true, depthTest: false, depthWrite: false }));
  body.renderOrder = RENDER_ORDER.ball;
  const shell = new Mesh(geometry, new MeshBasicMaterial({ color: OUTLINE_COLOR, side: BackSide, transparent: true, depthTest: false, depthWrite: false }));
  shell.renderOrder = RENDER_ORDER.ballOutline;
  shell.scale.setScalar(BALL_OUTLINE_SCALE);
  ball.add(body, shell);
  return ball;
}

/** ボールの地面の影(円盤 1 つ。不透明度 0.5・半径 ×1.8)。深さ・落下の見え方の手がかり。 */
function buildBallShadow(radius: number): Mesh {
  const shadow = new Mesh(
    new CircleGeometry(radius * BALL_SHADOW.scale, 24),
    new MeshBasicMaterial({ color: PALETTE.shadow, transparent: true, opacity: BALL_SHADOW.opacity, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  return shadow;
}

/** 落下点のリング(地面に寝かせた半径 1 の輪。表示時に `scale` で半径(m)にする)。 */
function buildLandingRing(): Mesh {
  const material = new MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: LANDING_RING.opacity, depthWrite: false });
  const ring = new Mesh(new RingGeometry(LANDING_RING.innerRatio, 1, 48), material);
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = RENDER_ORDER.overlay;
  ring.visible = false;
  return ring;
}

/** マーカー一式を作る。`gradient` はボールのトゥーン材質の階調(`createToonGradient`)。 */
export function buildMarkers(geometry: StageGeometry, gradient: DataTexture): Markers {
  const { frame: zoneFrame, material: zoneFrameMaterial } = buildZoneFrame(geometry.zone);
  const { mesh: zonePulse, material: zonePulseMaterial } = buildZonePulse(geometry.zone);
  const grid = buildGrid(geometry.zone);
  const { cursor, fill } = buildCursor();
  const aim = buildAim();
  const ball = buildBall(geometry.ballRadius, gradient);
  const ballShadow = buildBallShadow(geometry.ballRadius);
  const landingRing = buildLandingRing();
  const group = new Group();
  group.add(zoneFrame, zonePulse, grid, cursor, aim, ball, ballShadow, landingRing);
  return { group, zoneFrame, zoneFrameMaterial, zonePulse, zonePulseMaterial, grid, cursor, cursorFill: fill, aim, ball, ballShadow, landingRing };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** ゾーン枠・格子の可視と、到達の手がかりの発光(枠線を白→黄へ寄せ、内側を薄く塗る)。 */
function applyZone(markers: Markers, zone: SceneFrame["zone"]): void {
  const pulse = clamp01(zone.pulse);
  markers.zoneFrame.visible = zone.visible;
  markers.grid.visible = zone.visible && zone.grid;
  markers.zoneFrameMaterial.color.copy(WHITE).lerp(ACCENT, pulse);
  markers.zoneFrameMaterial.opacity = ZONE_PULSE.frameOpacity + (1 - ZONE_PULSE.frameOpacity) * pulse;
  markers.zonePulse.visible = zone.visible && pulse > 0;
  markers.zonePulseMaterial.opacity = pulse * ZONE_PULSE.fillOpacity;
}

function applyCursor(markers: Markers, cursor: SceneFrame["cursor"]): void {
  markers.cursor.visible = cursor.visible;
  markers.cursor.position.set(cursor.position.x, cursor.position.y, cursor.position.z);
  markers.cursor.scale.set(cursor.scaleX, cursor.scaleY, 1);
  markers.cursorFill.opacity = cursor.flash ? CURSOR_OPACITY.flash : CURSOR_OPACITY.rest;
}

function applyAim(markers: Markers, aim: SceneFrame["aim"]): void {
  markers.aim.visible = aim.visible;
  markers.aim.position.set(aim.position.x, aim.position.y, aim.position.z);
  markers.aim.scale.set(aim.width, aim.height, 1);
}

/** ボールと影の円盤の位置・可視・倍率(`ball.scale` ≥ 1。中継カメラ中の最小表示径のため)。 */
function applyBall(markers: Markers, ball: SceneFrame["ball"]): void {
  const scale = Number.isFinite(ball.scale) && ball.scale > 0 ? ball.scale : 1;
  markers.ball.visible = ball.visible;
  markers.ball.position.set(ball.position.x, ball.position.y, ball.position.z);
  markers.ball.scale.setScalar(scale);
  markers.ballShadow.visible = ball.visible;
  markers.ballShadow.position.set(ball.position.x, BALL_SHADOW.y, ball.position.z);
  markers.ballShadow.scale.setScalar(scale);
}

function applyLandingMark(markers: Markers, mark: SceneFrame["landingMark"]): void {
  markers.landingRing.visible = mark.visible && Number.isFinite(mark.radius) && mark.radius > 0;
  markers.landingRing.position.set(mark.position.x, mark.position.y, mark.position.z);
  markers.landingRing.scale.setScalar(mark.radius);
}

/** SceneFrame のゾーン・カーソル・狙いセル・ボール・落下点のリングをマーカーに適用する。 */
export function applyMarkers(markers: Markers, frame: SceneFrame): void {
  applyZone(markers, frame.zone);
  applyCursor(markers, frame.cursor);
  applyAim(markers, frame.aim);
  applyBall(markers, frame.ball);
  applyLandingMark(markers, frame.landingMark);
}
