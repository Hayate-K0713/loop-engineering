// ゾーン枠・ゾーン枠の発光・5×5格子・スイングカーソル(有効カーソルと素のカーソル)・着弾点の予告/照準・縮むリング・ボール(本体・輪郭・ハロー・縫い目)と地面の影・落下点のリング。
// ゾーン・ボールの寸法は StageGeometry から読む(直書きしない)。SceneFrame の該当部分を適用する関数も持つ。
// 3D の位置ずれ表示(feedback)は作らない(DOM。ui/ZoneFeedback)。
//
// 描画順(小さい順に描く。いずれも透明パス): 影・ゾーン枠・発光・格子(10)→ 予告・照準・リング(10.5)→ 素のカーソル(10.8)→ カーソル(11)
//   → ボールのハロー(11.4)→ ボールの輪郭(11.5)→ ボール本体(12)→ 縫い目(12.1)。
// - three は Group の `renderOrder` を子全体の第1キーにするので、Group には `renderOrder` を付けず、メッシュに個別に付ける。
// - 不透明のままだとボールは透明パスのカーソルより先に描かれるので、ボール(ハロー・輪郭・本体・縫い目)は `transparent: true` にして透明パスへ移す。
// - 深度なし(`depthTest: false`)で重ねるので、縫い目は前向きの面だけ(`FrontSide`)にして、球の裏側の帯が透けないようにする。
// - カーソルの塗りは `depthWrite: false`(深度を書くと、後から描くボールが隠れる)。
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  LineBasicMaterial,
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
import { BALL_LOOK, BALL_OUTLINE_SCALE, CURSOR_RAW_LOOK, GUIDE_LOOK, OUTLINE_COLOR, PALETTE } from "./look";

/** 5×5 コースのセル幅(ゾーン単位。ゾーン全幅 2 の 3 分の 1 = 3×3 がゾーン内)。 */
const CELL_UNITS = 2 / 3;
const GRID_CELLS = 5;
/** renderOrder(大きいほど後に描く = 手前)。 */
export const RENDER_ORDER = {
  overlay: 10,
  guide: 10.5,
  cursorRaw: 10.8,
  cursor: 11,
  ballHalo: 11.4,
  ballOutline: 11.5,
  ball: 12,
  ballSeam: 12.1,
} as const;
const BALL_SHADOW = { y: 0.06, scale: 1.8, opacity: 0.5 } as const;
const CURSOR_OPACITY = { rest: 0.32, flash: 0.6, ring: 0.95 } as const;
/** ゾーン枠の発光: 枠線は白から黄へ寄せ、内側を `pulse × fillOpacity` の黄色の板で塗る。 */
const ZONE_PULSE = { frameOpacity: 0.9, fillOpacity: 0.25 } as const;
const LANDING_RING = { innerRatio: 0.82, opacity: 0.7 } as const;
/** 縮むリングの周方向の分割数。 */
const RING_SEGMENTS = 64;
/** 縫い目の帯(球面の部分: 極角の中心と、方位角の始点)。弧 2 本は球の反対側に置く。 */
const SEAM_ARCS = [
  { theta: Math.PI * 0.32, phiStart: 0 },
  { theta: Math.PI * 0.68, phiStart: Math.PI },
] as const;
const SEAM_ARC_LENGTH = Math.PI * 0.8;
const WHITE = new Color(PALETTE.white);
const ACCENT = new Color(PALETTE.accent);
const PREVIEW = new Color(GUIDE_LOOK.preview);

/** 着弾点の予告(打撃)・照準(守備)・縮むリングの部品。`group` は `SceneFrame.guide.position` に置く(リングも同じ中心)。 */
export type GuideMarkers = {
  readonly group: Group;
  /** `exact` の点(単位円×`markerRadius`。黒縁つき)。 */
  readonly dot: Group;
  readonly dotMaterial: MeshBasicMaterial;
  readonly dotEdgeMaterial: MeshBasicMaterial;
  /** `fade` の薄い円(単位円×`fadeRadius`)。 */
  readonly fade: Group;
  readonly fadeFillMaterial: MeshBasicMaterial;
  readonly fadeEdgeMaterial: MeshBasicMaterial;
  /** 守備の照準(輪と十字。単位×`markerRadius`)。 */
  readonly reticle: Group;
  readonly reticleMaterial: MeshBasicMaterial;
  /** 守備の散布円(単位輪×`spread.radius`)。 */
  readonly spread: Mesh;
  readonly spreadMaterial: MeshBasicMaterial;
  /** 縮むリング(半径・線幅は `guide.ring` に一致。毎フレーム頂点を書き換える)。 */
  readonly ring: Mesh;
  readonly ringMaterial: MeshBasicMaterial;
};

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
  /** 有効カーソル(ロックオン適用後)。 */
  readonly cursor: Group;
  readonly cursorFill: MeshBasicMaterial;
  /** 素のカーソル(指の位置の薄い印)。 */
  readonly cursorRaw: Group;
  readonly guide: GuideMarkers;
  readonly ball: Group;
  /** ボール本体(トゥーン)。 */
  readonly ballBody: Mesh;
  /** ボールの縁取りの殻(背面法。`ball.outlineScale` 倍)。 */
  readonly ballOutline: Mesh;
  /** 球の後ろに敷く暖色のハロー(常に生成する)。 */
  readonly ballHalo: Mesh;
  readonly ballHaloMaterial: MeshBasicMaterial;
  /** 縫い目の帯(`ball.rotation` に従って回る)。 */
  readonly ballSeams: Group;
  readonly ballShadow: Mesh;
  /** 打球の落下点のリング(半径 1 の輪を `scale` で広げる)。 */
  readonly landingRing: Mesh;
};

function overlayLineMaterial(opacity: number): LineBasicMaterial {
  return new LineBasicMaterial({ color: PALETTE.white, transparent: true, opacity, depthTest: false });
}

/** 透明・深度なし・深度を書かない塗りの材質。 */
function overlayFillMaterial(color: number, opacity: number): MeshBasicMaterial {
  return new MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false });
}

/** メッシュを作り、`renderOrder` を付ける。 */
function overlayMesh(geometry: BufferGeometry, material: MeshBasicMaterial, order: number): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = order;
  return mesh;
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
  const mesh = overlayMesh(new PlaneGeometry(halfWidth * 2, top - bottom), material, RENDER_ORDER.overlay);
  mesh.position.set(0, (top + bottom) / 2, planeZ);
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
  const parts = [
    overlayMesh(new CircleGeometry(1, 40), fill, RENDER_ORDER.cursor),
    overlayMesh(new RingGeometry(0.9, 1, 40), overlayFillMaterial(PALETTE.accent, CURSOR_OPACITY.ring), RENDER_ORDER.cursor),
    overlayMesh(new CircleGeometry(0.12, 16), overlayFillMaterial(PALETTE.white, 1), RENDER_ORDER.cursor),
  ];
  cursor.add(...parts);
  return { cursor, fill };
}

/** 素のカーソル(指の位置)の薄い印: 黒い縁つきの白い小円。半径は m(単位円ではなく実寸)。 */
function buildCursorRaw(): Group {
  const { radius, fillOpacity, edgeOpacity } = CURSOR_RAW_LOOK;
  const raw = new Group();
  raw.add(
    overlayMesh(new RingGeometry(radius, radius * 1.45, 24), overlayFillMaterial(GUIDE_LOOK.edge, edgeOpacity), RENDER_ORDER.cursorRaw),
    overlayMesh(new CircleGeometry(radius, 20), overlayFillMaterial(PALETTE.white, fillOpacity), RENDER_ORDER.cursorRaw),
  );
  raw.visible = false;
  return raw;
}

/** 縮むリングの頂点(内側・外側の対を周方向に並べた列)。`radius` は線の中心、`width` は線幅(m)。 */
function ringPositions(radius: number, width: number): Float32Array {
  const inner = Math.max(0, radius - width / 2);
  const outer = radius + width / 2;
  return Float32Array.from(
    Array.from({ length: RING_SEGMENTS + 1 }, (_, k) => {
      const angle = (k / RING_SEGMENTS) * Math.PI * 2;
      const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
      return [inner * cos, inner * sin, 0, outer * cos, outer * sin, 0];
    }).flat(),
  );
}

/** 縮むリングの形状(三角形の帯)。頂点は `setRingGeometry` で毎フレーム書き換える。 */
function buildRingGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(ringPositions(1, 0.01), 3));
  const indices = Array.from({ length: RING_SEGMENTS }, (_, k) => {
    const [a, b, c, d] = [2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 3];
    return [a, b, c, b, d, c];
  }).flat();
  geometry.setIndex(indices);
  return geometry;
}

/** リングの頂点を半径・線幅(m)に合わせて書き換える。 */
function setRingGeometry(geometry: BufferGeometry, radius: number, width: number): void {
  const position = geometry.getAttribute("position");
  if (!(position instanceof BufferAttribute)) return;
  position.array.set(ringPositions(radius, width));
  position.needsUpdate = true;
}

/** 予告の点(シアンの円+黒縁)。単位円で作り、`scale` に半径(m)を掛ける。 */
function buildDot(): { dot: Group; fill: MeshBasicMaterial; edge: MeshBasicMaterial } {
  const fill = overlayFillMaterial(GUIDE_LOOK.preview, 1);
  const edge = overlayFillMaterial(GUIDE_LOOK.edge, 1);
  const dot = new Group();
  dot.add(
    overlayMesh(new CircleGeometry(GUIDE_LOOK.dotEdge, 24), edge, RENDER_ORDER.guide),
    overlayMesh(new CircleGeometry(1, 24), fill, RENDER_ORDER.guide + 0.01),
  );
  dot.visible = false;
  return { dot, fill, edge };
}

/** フェードカーソル(着弾点を含む薄いシアンの円と縁)。単位円で作り、`scale` に半径(m)を掛ける。 */
function buildFade(): { fade: Group; fill: MeshBasicMaterial; edge: MeshBasicMaterial } {
  const fill = overlayFillMaterial(GUIDE_LOOK.preview, GUIDE_LOOK.fadeFill);
  const edge = overlayFillMaterial(GUIDE_LOOK.preview, GUIDE_LOOK.fadeEdge);
  const fade = new Group();
  fade.add(overlayMesh(new CircleGeometry(1, 40), fill, RENDER_ORDER.guide), overlayMesh(new RingGeometry(0.93, 1, 40), edge, RENDER_ORDER.guide));
  fade.visible = false;
  return { fade, fill, edge };
}

/** 守備の照準(細い白の輪と、4 方向の短い十字)。単位で作り、`scale` に `markerRadius` を掛ける。 */
function buildReticle(): { reticle: Group; material: MeshBasicMaterial } {
  const material = overlayFillMaterial(PALETTE.white, GUIDE_LOOK.reticleOpacity);
  const reticle = new Group();
  const bars = [
    { x: 1.3, y: 0, w: 0.6, h: 0.1 },
    { x: -1.3, y: 0, w: 0.6, h: 0.1 },
    { x: 0, y: 1.3, w: 0.1, h: 0.6 },
    { x: 0, y: -1.3, w: 0.1, h: 0.6 },
  ].map(({ x, y, w, h }) => {
    const bar = overlayMesh(new PlaneGeometry(w, h), material, RENDER_ORDER.guide);
    bar.position.set(x, y, 0);
    return bar;
  });
  reticle.add(overlayMesh(new RingGeometry(0.88, 1, 40), material, RENDER_ORDER.guide), ...bars);
  reticle.visible = false;
  return { reticle, material };
}

function buildGuide(): GuideMarkers {
  const group = new Group();
  const { dot, fill: dotMaterial, edge: dotEdgeMaterial } = buildDot();
  const { fade, fill: fadeFillMaterial, edge: fadeEdgeMaterial } = buildFade();
  const { reticle, material: reticleMaterial } = buildReticle();
  const spreadMaterial = overlayFillMaterial(PALETTE.white, GUIDE_LOOK.spreadOpacity);
  const spread = overlayMesh(new RingGeometry(0.97, 1, 48), spreadMaterial, RENDER_ORDER.guide);
  spread.visible = false;
  const ringMaterial = overlayFillMaterial(PALETTE.white, GUIDE_LOOK.ringOpacity);
  ringMaterial.side = DoubleSide;
  const ring = overlayMesh(buildRingGeometry(), ringMaterial, RENDER_ORDER.guide + 0.02);
  // 頂点を毎フレーム書き換えるので、初期の境界の球で切り捨てない。
  ring.frustumCulled = false;
  ring.visible = false;
  group.add(spread, fade, dot, reticle, ring);
  group.visible = false;
  return {
    group,
    dot,
    dotMaterial,
    dotEdgeMaterial,
    fade,
    fadeFillMaterial,
    fadeEdgeMaterial,
    reticle,
    reticleMaterial,
    spread,
    spreadMaterial,
    ring,
    ringMaterial,
  };
}

/** 縫い目の帯: 球面の部分(極角 ±`widthRatio` rad = 球の径の `widthRatio` 倍の幅)を弧 2 本、反対側に置く。 */
function buildSeams(radius: number): Group {
  const { widthRatio, color, lift } = BALL_LOOK.seam;
  const material = overlayFillMaterial(color, 1);
  const seams = new Group();
  for (const { theta, phiStart } of SEAM_ARCS) {
    const geometry = new SphereGeometry(radius * lift, 14, 3, phiStart, SEAM_ARC_LENGTH, theta - widthRatio, widthRatio * 2);
    seams.add(overlayMesh(geometry, material, RENDER_ORDER.ballSeam));
  }
  return seams;
}

type BallParts = {
  readonly ball: Group;
  readonly body: Mesh;
  readonly outline: Mesh;
  readonly halo: Mesh;
  readonly haloMaterial: MeshBasicMaterial;
  readonly seams: Group;
};

/**
 * ボール(ハロー・輪郭・本体・縫い目)。すべて透明パス・深度なしで、ハロー 11.4・輪郭 11.5・本体 12・縫い目 12.1 に描く(カーソルより手前)。
 * 影は地面の円盤 1 つだけにするので、本体は `castShadow` しない。ハローは常に生成する(不透明度は `ball.halo`)。
 */
function buildBall(radius: number, gradient: DataTexture): BallParts {
  const ball = new Group();
  const geometry = new SphereGeometry(radius, 16, 12);
  const body = new Mesh(
    geometry,
    new MeshToonMaterial({ color: PALETTE.white, gradientMap: gradient, transparent: true, depthTest: false, depthWrite: false }),
  );
  body.renderOrder = RENDER_ORDER.ball;
  const outline = new Mesh(geometry, new MeshBasicMaterial({ color: OUTLINE_COLOR, side: BackSide, transparent: true, depthTest: false, depthWrite: false }));
  outline.renderOrder = RENDER_ORDER.ballOutline;
  outline.scale.setScalar(BALL_OUTLINE_SCALE);
  const haloMaterial = overlayFillMaterial(BALL_LOOK.halo.color, 0);
  const halo = overlayMesh(new SphereGeometry(radius * BALL_LOOK.halo.scale, 16, 12), haloMaterial, RENDER_ORDER.ballHalo);
  const seams = buildSeams(radius);
  ball.add(halo, outline, body, seams);
  return { ball, body, outline, halo, haloMaterial, seams };
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
  const cursorRaw = buildCursorRaw();
  const guide = buildGuide();
  const parts = buildBall(geometry.ballRadius, gradient);
  const ballShadow = buildBallShadow(geometry.ballRadius);
  const landingRing = buildLandingRing();
  const group = new Group();
  group.add(zoneFrame, zonePulse, grid, guide.group, cursorRaw, cursor, parts.ball, ballShadow, landingRing);
  return {
    group,
    zoneFrame,
    zoneFrameMaterial,
    zonePulse,
    zonePulseMaterial,
    grid,
    cursor,
    cursorFill: fill,
    cursorRaw,
    guide,
    ball: parts.ball,
    ballBody: parts.body,
    ballOutline: parts.outline,
    ballHalo: parts.halo,
    ballHaloMaterial: parts.haloMaterial,
    ballSeams: parts.seams,
    ballShadow,
    landingRing,
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** 有限で正の値だけを返す(それ以外は 0)。 */
function positive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
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
  const { raw } = cursor;
  markers.cursorRaw.visible = cursor.visible && raw.visible;
  markers.cursorRaw.position.set(raw.position.x, raw.position.y, raw.position.z);
}

/** リングの色: 予告(`preview`)は白とシアンの中間から、守備のゲージ(`gauge`)は白から、`glow` で金色へ寄せる。 */
function applyRingColor(material: MeshBasicMaterial, ring: SceneFrame["guide"]["ring"]): void {
  material.color.copy(WHITE);
  if (ring.tone === "preview") material.color.lerp(PREVIEW, 0.5);
  material.color.lerp(ACCENT, clamp01(ring.glow));
}

/** 縮むリング: 半径・線幅(m)に頂点を合わせ、色を `tone`・`glow` から決める。 */
function applyGuideRing(guide: GuideMarkers, ring: SceneFrame["guide"]["ring"], alpha: number): void {
  const radius = positive(ring.radius);
  guide.ring.visible = ring.visible && radius > 0;
  if (!guide.ring.visible) return;
  setRingGeometry(guide.ring.geometry, radius, positive(ring.width));
  applyRingColor(guide.ringMaterial, ring);
  guide.ringMaterial.opacity = GUIDE_LOOK.ringOpacity * alpha;
}

/** 点・フェードの円・照準・散布円の出し分け(`mode`)と大きさ・不透明度。 */
function applyGuideMarker(guide: GuideMarkers, frame: SceneFrame["guide"], alpha: number): void {
  const markerRadius = positive(frame.markerRadius);
  const fadeRadius = positive(frame.fadeRadius);
  guide.dot.visible = frame.mode === "exact" && markerRadius > 0;
  guide.dot.scale.setScalar(markerRadius);
  guide.dotMaterial.opacity = alpha;
  guide.dotEdgeMaterial.opacity = alpha;
  guide.fade.visible = frame.mode === "fade" && fadeRadius > 0;
  guide.fade.scale.setScalar(fadeRadius);
  guide.fadeFillMaterial.opacity = GUIDE_LOOK.fadeFill * alpha;
  guide.fadeEdgeMaterial.opacity = GUIDE_LOOK.fadeEdge * alpha;
  guide.reticle.visible = frame.mode === "reticle" && markerRadius > 0;
  guide.reticle.scale.setScalar(markerRadius);
  guide.reticleMaterial.opacity = GUIDE_LOOK.reticleOpacity * alpha;
  const spreadRadius = positive(frame.spread.radius);
  guide.spread.visible = frame.mode === "reticle" && frame.spread.visible && spreadRadius > 0;
  guide.spread.scale.setScalar(spreadRadius);
  guide.spreadMaterial.opacity = GUIDE_LOOK.spreadOpacity * alpha;
}

/** 着弾点の予告・照準・縮むリング。`guide.visible` が偽なら全部隠す。`mode: "none"` は点も円も出さない(リングは `ring.visible` に従う)。 */
function applyGuide(markers: Markers, frame: SceneFrame["guide"]): void {
  const { guide } = markers;
  const alpha = clamp01(frame.alpha);
  guide.group.visible = frame.visible && alpha > 0;
  guide.group.position.set(frame.position.x, frame.position.y, frame.position.z);
  applyGuideMarker(guide, frame, alpha);
  applyGuideRing(guide, frame.ring, alpha);
}

/** ボールと影の円盤の位置・可視・倍率(`ball.scale` ≥ 1。飛行中・中継カメラ中の最小表示径のため)、縫い目の回転・ハロー・輪郭の倍率。 */
function applyBall(markers: Markers, ball: SceneFrame["ball"]): void {
  const scale = Number.isFinite(ball.scale) && ball.scale > 0 ? ball.scale : 1;
  markers.ball.visible = ball.visible;
  markers.ball.position.set(ball.position.x, ball.position.y, ball.position.z);
  markers.ball.scale.setScalar(scale);
  markers.ballSeams.rotation.set(ball.rotation.x, ball.rotation.y, ball.rotation.z);
  markers.ballHaloMaterial.opacity = clamp01(ball.halo);
  markers.ballOutline.scale.setScalar(Number.isFinite(ball.outlineScale) && ball.outlineScale >= 1 ? ball.outlineScale : BALL_OUTLINE_SCALE);
  markers.ballShadow.visible = ball.visible;
  markers.ballShadow.position.set(ball.position.x, BALL_SHADOW.y, ball.position.z);
  markers.ballShadow.scale.setScalar(scale);
}

function applyLandingMark(markers: Markers, mark: SceneFrame["landingMark"]): void {
  markers.landingRing.visible = mark.visible && Number.isFinite(mark.radius) && mark.radius > 0;
  markers.landingRing.position.set(mark.position.x, mark.position.y, mark.position.z);
  markers.landingRing.scale.setScalar(mark.radius);
}

/** SceneFrame のゾーン・カーソル(有効・素)・予告/照準/リング・ボール・落下点のリングをマーカーに適用する。 */
export function applyMarkers(markers: Markers, frame: SceneFrame): void {
  applyZone(markers, frame.zone);
  applyCursor(markers, frame.cursor);
  applyGuide(markers, frame.guide);
  applyBall(markers, frame.ball);
  applyLandingMark(markers, frame.landingMark);
}
