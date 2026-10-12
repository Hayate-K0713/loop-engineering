// ゾーン枠・5×5格子・スイングカーソル・狙いセルのハイライト・ボールと地面の影。
// ゾーン・ボールの寸法は StageGeometry から読む(直書きしない)。SceneFrame の該当部分を適用する関数も持つ。
import {
  BackSide,
  BufferGeometry,
  CircleGeometry,
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
const OVERLAY_ORDER = 10;
const CURSOR_ORDER = 11;
const BALL_SHADOW_Y = 0.06;
const BALL_SHADOW_SCALE = 1.2;
const CURSOR_OPACITY = { rest: 0.32, flash: 0.6, ring: 0.95 } as const;

export type Markers = {
  /** シーンに追加するルート。 */
  readonly group: Group;
  readonly zoneFrame: LineSegments;
  readonly grid: LineSegments;
  readonly cursor: Group;
  readonly cursorFill: MeshBasicMaterial;
  readonly aim: Group;
  readonly ball: Group;
  readonly ballShadow: Mesh;
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

function buildZoneFrame(zone: StageGeometry["zone"]): LineSegments {
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
  return segments(points, overlayLineMaterial(0.9), OVERLAY_ORDER);
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
  return segments(points, overlayLineMaterial(0.35), OVERLAY_ORDER);
}

/** スイングカーソル(塗り・リング・中心点の単位円)。`scale` に半径(m)を掛けて楕円にする。 */
function buildCursor(): { cursor: Group; fill: MeshBasicMaterial } {
  const cursor = new Group();
  const fill = overlayFillMaterial(PALETTE.accent, CURSOR_OPACITY.rest);
  const parts = [
    new Mesh(new CircleGeometry(1, 40), fill),
    new Mesh(new RingGeometry(0.9, 1, 40), overlayFillMaterial(PALETTE.accent, CURSOR_OPACITY.ring)),
    new Mesh(new CircleGeometry(0.12, 16), new MeshBasicMaterial({ color: PALETTE.white, depthTest: false })),
  ];
  for (const mesh of parts) {
    mesh.renderOrder = CURSOR_ORDER;
    cursor.add(mesh);
  }
  cursor.renderOrder = CURSOR_ORDER;
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
  fill.renderOrder = OVERLAY_ORDER;
  border.renderOrder = OVERLAY_ORDER;
  aim.add(fill, border);
  return aim;
}

function buildBall(radius: number, gradient: DataTexture): Group {
  const ball = new Group();
  const geometry = new SphereGeometry(radius, 16, 12);
  const body = new Mesh(geometry, new MeshToonMaterial({ color: PALETTE.white, gradientMap: gradient }));
  body.castShadow = true;
  const shell = new Mesh(geometry, new MeshBasicMaterial({ color: OUTLINE_COLOR, side: BackSide }));
  shell.scale.setScalar(BALL_OUTLINE_SCALE);
  ball.add(body, shell);
  return ball;
}

function buildBallShadow(radius: number): Mesh {
  const shadow = new Mesh(
    new CircleGeometry(radius * BALL_SHADOW_SCALE, 16),
    new MeshBasicMaterial({ color: PALETTE.shadow, transparent: true, opacity: 0.25 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  return shadow;
}

/** マーカー一式を作る。`gradient` はボールのトゥーン材質の階調(`createToonGradient`)。 */
export function buildMarkers(geometry: StageGeometry, gradient: DataTexture): Markers {
  const zoneFrame = buildZoneFrame(geometry.zone);
  const grid = buildGrid(geometry.zone);
  const { cursor, fill } = buildCursor();
  const aim = buildAim();
  const ball = buildBall(geometry.ballRadius, gradient);
  const ballShadow = buildBallShadow(geometry.ballRadius);
  const group = new Group();
  group.add(zoneFrame, grid, cursor, aim, ball, ballShadow);
  return { group, zoneFrame, grid, cursor, cursorFill: fill, aim, ball, ballShadow };
}

function applyZone(markers: Markers, zone: SceneFrame["zone"]): void {
  markers.zoneFrame.visible = zone.visible;
  markers.grid.visible = zone.visible && zone.grid;
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

function applyBall(markers: Markers, ball: SceneFrame["ball"]): void {
  markers.ball.visible = ball.visible;
  markers.ball.position.set(ball.position.x, ball.position.y, ball.position.z);
  markers.ballShadow.visible = ball.visible;
  markers.ballShadow.position.set(ball.position.x, BALL_SHADOW_Y, ball.position.z);
}

/** SceneFrame のゾーン・カーソル・狙いセル・ボールをマーカーに適用する。 */
export function applyMarkers(markers: Markers, frame: SceneFrame): void {
  applyZone(markers, frame.zone);
  applyCursor(markers, frame.cursor);
  applyAim(markers, frame.aim);
  applyBall(markers, frame.ball);
}
