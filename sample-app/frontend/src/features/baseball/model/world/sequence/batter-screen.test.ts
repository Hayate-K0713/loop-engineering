import { describe, expect, it } from "vitest";
import type { InPlayResult } from "../../../types/batting";
import type { PitchFlight } from "../../../types/pitch";
import type { BatterPose, SafeArea, SceneFrame, SceneLayout, Vec3 } from "../../../types/scene";
import type { PitchOutcomeView } from "../../../types/view";
import { ASSIST_TABLE } from "../../batting/assist";
import { projectPoint, zoneRectOf, type ViewSize, type ZoneBox } from "../camera/project";
import { handPosition, rotateEuler } from "../motion/fk";
import { batterStancePose } from "../motion/batter";
import { batTipX } from "../motion/batter-layout";
import { placeBatter } from "../motion/pose";
import { CHARACTER_RIG } from "../motion/rig";
import { zoneToWorld } from "../space/coords";
import { WORLD_PARAMS } from "../space/params";
import { sceneFrameAt } from "./frame";
import { type PlayPlan, planPlay } from "./play-plan";

// 画面上の打者(構えの手・腕・バット)とゾーン枠・守備の 5×5 格子の位置関係。幾何は実コード(`sceneFrameAt` の打者・カメラ + `projectPoint`)で計算する。
// 縦長の構えを混ぜない(横長の構えのまま)と、前の手が打撃ではゾーン枠の左端に、守備では格子の左端に掛かる(修正設計の未達 R1・R2)。

const ZONE: ZoneBox = WORLD_PARAMS.zone;
/** 手・腕の太さ(m。`render/character.ts` の手の球 0.1、袖 0.075)。 */
const HAND_RADIUS = 0.1;
const SLEEVE_RADIUS = 0.075;
/** 枠から離す最低限の余白(px)。 */
const CLEARANCE_PX = 4;

/**
 * ステージの [幅, 高さ, 打撃の下のオーバーレイの上端 y, 守備の下のオーバーレイの上端 y]。HUD の下端は上から 155px。
 * 打撃は v2 の実画面(DOM)の計測値(H12。ティッカーが下から 181px)。守備は v3 の設計値で、操作バーが約 130px(球種チップ 52 + 余白 + ティッカー 52)なので
 * `高さ − 130`(v2 は 275〜368px のバーだった。contract §7 の「守備の操作バー」。A12 の実装後に実画面で確かめる)。
 */
const VIEWPORTS: readonly (readonly [number, number, number, number])[] = [
  [390, 844, 663, 714],
  [390, 745, 594, 615],
  [390, 664, 513, 534],
  [375, 667, 516, 537],
  [360, 640, 489, 510],
];

const FLIGHT: PitchFlight = { seq: 1, kind: "straight", aim: { x: 0, y: 0 }, landing: { x: 0, y: 0 }, speedKmh: 140, durationMs: 1300, quality: "normal" };

type Layout = { readonly layout: SceneLayout; readonly overlayTop: number };
type Rect = { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };

function frameFor(
  width: number,
  height: number,
  layout: SceneLayout,
  overlayTop: number,
  overrides: { readonly plan?: PlayPlan; readonly tMs?: number; readonly flight?: PitchFlight } = {},
): SceneFrame {
  const safeArea: SafeArea = { top: 155 / height, bottom: overlayTop / height };
  const frame = sceneFrameAt({
    phase: overrides.plan === undefined ? "flight" : "play",
    tMs: overrides.tMs ?? 300,
    windupU: 1,
    flight: overrides.flight ?? FLIGHT,
    plan: overrides.plan ?? null,
    aspect: width / height,
    layout,
    safeArea,
    uniforms: { offense: 0x2f63c8, defense: 0xe8473c },
    cursor: { visible: false, point: { x: 0, y: 0 }, raw: { x: 0, y: 0 }, radii: { rx: 0.5, ry: 0.3 } },
    assist: ASSIST_TABLE.normal,
    grid: layout === "pitching",
  });
  return frame;
}

/** 打撃はゾーン枠、守備は 5×5 格子(ゾーンの中心から 5/3 倍)の画面矩形。 */
function targetRect(frame: SceneFrame, size: ViewSize, layout: SceneLayout): Rect {
  const center = (ZONE.top + ZONE.bottom) / 2;
  const half = ((ZONE.top - ZONE.bottom) / 2) * (layout === "pitching" ? 5 / 3 : 1);
  const box: ZoneBox = layout === "pitching" ? { halfWidth: ZONE.halfWidth * (5 / 3), bottom: center - half, top: center + half, planeZ: ZONE.planeZ } : ZONE;
  const rect = zoneRectOf(frame.camera, size, box);
  return { left: rect.left, top: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height };
}

type Blob = { readonly name: string; readonly x: number; readonly y: number; readonly radius: number };

/** ワールドの点と半径(m)を、画面の円(中心と半径 px)にする。 */
function blobOf(frame: SceneFrame, size: ViewSize, name: string, point: Vec3, radiusM: number): Blob {
  const center = projectPoint(frame.camera, size, point);
  const edge = projectPoint(frame.camera, size, { x: point.x + radiusM, y: point.y, z: point.z });
  return { name, x: center.x, y: center.y, radius: Math.abs(edge.x - center.x) };
}

/** 打者の両手・両腕の中点・バットの軸(根元から先端まで 5 点)の画面の円。 */
function batterBlobs(frame: SceneFrame, size: ViewSize): readonly Blob[] {
  const batter = frame.batter;
  const root = { position: batter.position, yaw: batter.yaw, scale: batter.scale };
  const bare = { torso: batter.torso, head: batter.head, armL: batter.armL, armR: batter.armR, legL: batter.legL, legR: batter.legR };
  const arms = (["armL", "armR"] as const).flatMap((side) => {
    const hand = handPosition(bare, CHARACTER_RIG, root, side);
    const shoulder = handPosition(bare, { ...CHARACTER_RIG, armLength: 0 }, root, side);
    const middle = { x: (hand.x + shoulder.x) / 2, y: (hand.y + shoulder.y) / 2, z: (hand.z + shoulder.z) / 2 };
    return [blobOf(frame, size, `${side} 手`, hand, HAND_RADIUS * batter.scale), blobOf(frame, size, `${side} 腕`, middle, SLEEVE_RADIUS * batter.scale)];
  });
  const bats = [0.025, 0.25, 0.5, 0.75, 0.975].map((s) =>
    blobOf(frame, size, `バット ${s}`, batPoint(batter, s), (0.028 + ((0.05 - 0.028) * s) / 0.95) * batter.scale),
  );
  return [...arms, ...bats];
}

/** バットの軸上の点(標準の長さで根元から s m。`lengthScale` 倍に伸びる)のワールド座標。バットは打者の root の子で、スイングのグループ(位置 (0, height, 0.05)・y 回転 sweepYaw)の中の傾き(x 回転 tilt)の先に +z 方向へ伸びる。 */
function batPoint(batter: BatterPose, s: number): Vec3 {
  const tilted = rotateEuler({ x: 0, y: 0, z: s * batter.bat.lengthScale }, { x: batter.bat.tilt, y: 0, z: 0 });
  const swung = rotateEuler(tilted, { x: 0, y: batter.bat.sweepYaw, z: 0 });
  const local = rotateEuler({ x: swung.x, y: swung.y + batter.bat.height, z: swung.z + 0.05 }, { x: 0, y: batter.yaw, z: 0 });
  return { x: local.x * batter.scale + batter.position.x, y: local.y * batter.scale + batter.position.y, z: local.z * batter.scale + batter.position.z };
}

/** 円と矩形の隙間(px)。重なっていれば負(円の中心が矩形内なら −半径 以下)。 */
function gapBetween(blob: Blob, rect: Rect): number {
  const dx = Math.max(rect.left - blob.x, 0, blob.x - rect.right);
  const dy = Math.max(rect.top - blob.y, 0, blob.y - rect.bottom);
  return Math.hypot(dx, dy) - blob.radius;
}

function worstGap(blobs: readonly Blob[], rect: Rect): { readonly name: string; readonly gap: number } {
  return blobs.map((blob) => ({ name: blob.name, gap: gapBetween(blob, rect) })).reduce((worst, item) => (item.gap < worst.gap ? item : worst));
}

const LAYOUTS: readonly (readonly [string, (viewport: readonly [number, number, number, number]) => Layout])[] = [
  ["打撃(ゾーン枠)", ([, , bat]) => ({ layout: "batting", overlayTop: bat })],
  ["守備(5×5 格子)", ([, , , pitch]) => ({ layout: "pitching", overlayTop: pitch })],
];

describe("縦長の構えの手・腕・バットは、ゾーン枠(打撃)・5×5 格子(守備)に掛からない(受け入れ基準 #27、未達 R1・R2)", () => {
  for (const [label, layoutOf] of LAYOUTS) {
    it.each(VIEWPORTS)(`${label}: %d×%d(構え)の手・腕・バットが枠から ${CLEARANCE_PX}px 以上離れる`, (...viewport) => {
      const [width, height] = viewport;
      const { layout, overlayTop } = layoutOf(viewport);
      const size = { width, height };
      const frame = frameFor(width, height, layout, overlayTop);
      const { name, gap } = worstGap(batterBlobs(frame, size), targetRect(frame, size, layout));
      expect({ name, ok: gap >= CLEARANCE_PX }).toEqual({ name, ok: true });
    });
  }

  it("振らない(見逃し・投球中)の間も構えのまま掛からない(plan なし・見逃しの plan のどちらも)", () => {
    const outcome: PitchOutcomeView = { seq: FLIGHT.seq, kind: "called-strike", inPlay: null, plate: null };
    const take = planPlay({ flight: FLIGHT, outcome, swing: null, resolvedAtMs: FLIGHT.durationMs });
    for (const viewport of VIEWPORTS) {
      const [width, height] = viewport;
      for (const [, layoutOf] of LAYOUTS) {
        const { layout, overlayTop } = layoutOf(viewport);
        const size = { width, height };
        for (const frame of [
          frameFor(width, height, layout, overlayTop, { tMs: 0 }),
          frameFor(width, height, layout, overlayTop, { plan: take, tMs: FLIGHT.durationMs + 100 }),
        ]) {
          expect(worstGap(batterBlobs(frame, size), targetRect(frame, size, layout)).gap).toBeGreaterThanOrEqual(CLEARANCE_PX);
        }
      }
    }
  });

  it("確認の前提: 横長の構え(縦長の構えを混ぜない)のままだと、390×844 の打撃で手がゾーン枠に掛かり、守備でも格子に掛かる", () => {
    for (const [width, height, bat, pitch] of VIEWPORTS.slice(0, 1)) {
      for (const [layout, overlayTop] of [
        ["batting", bat],
        ["pitching", pitch],
      ] as const) {
        const size = { width, height };
        const frame = frameFor(width, height, layout, overlayTop);
        const landscape: SceneFrame = { ...frame, batter: placeBatter({ ...batterStancePose(), bat: frame.batter.bat }, frame.batter) };
        expect(worstGap(batterBlobs(landscape, size), targetRect(frame, size, layout)).gap).toBeLessThan(-10);
      }
    }
  });
});

/** 接触の瞬間のフレーム(`landing` に着弾する投球を、そのカーソルでジャストにとらえたインプレー)。 */
function contactFrameAt(width: number, height: number, overlayTop: number, landing: { readonly x: number; readonly y: number }): SceneFrame {
  const flight: PitchFlight = { ...FLIGHT, aim: landing, landing };
  const outcome: PitchOutcomeView = {
    seq: flight.seq,
    kind: "in-play",
    inPlay: { result: "single" satisfies InPlayResult, ball: { type: "fly", strength: "medium", direction: "center" } },
    plate: null,
  };
  const plan = planPlay({ flight, outcome, swing: { kind: "meet", cursor: landing, atMs: flight.durationMs }, resolvedAtMs: flight.durationMs });
  const swing = plan.swing;
  if (swing === null) {
    throw new Error("plan に swing が無い");
  }
  return frameFor(width, height, "batting", overlayTop, { plan, tMs: swing.contactAtMs, flight });
}

/** 接触の瞬間のバットとボールの中心の画面上のずれ(縦、px)。ボールの x でのバット軸の画面の y とボールの y の差。 */
function contactOffsetPx(width: number, height: number, overlayTop: number, landing: { readonly x: number; readonly y: number }): number {
  const size = { width, height };
  const frame = contactFrameAt(width, height, overlayTop, landing);
  const ball = projectPoint(frame.camera, size, zoneToWorld(landing));
  const axis = [0.025, 0.25, 0.5, 0.75, 0.975].map((s) => projectPoint(frame.camera, size, batPoint(frame.batter, s)));
  const segment = axis.find((point, index) => {
    const next = axis.at(index + 1);
    return next !== undefined && Math.min(point.x, next.x) <= ball.x && ball.x <= Math.max(point.x, next.x);
  });
  const index = segment === undefined ? axis.length - 1 : axis.indexOf(segment);
  const from = axis.at(index) ?? ball;
  const to = axis.at(index + 1) ?? from;
  const k = to.x === from.x ? 0 : (ball.x - from.x) / (to.x - from.x);
  return Math.abs(from.y + (to.y - from.y) * Math.min(Math.max(k, 0), 1) - ball.y);
}

describe("接触の瞬間のバットとボールの縦のずれ(縦長 390×844・打撃、ゾーン中央と四隅。ずれ ≤ 20px)", () => {
  const POINTS = [
    ["中央", { x: 0, y: 0 }],
    ["左上", { x: -0.9, y: 0.9 }],
    ["右上", { x: 0.9, y: 0.9 }],
    ["左下", { x: -0.9, y: -0.9 }],
    ["右下", { x: 0.9, y: -0.9 }],
  ] as const;

  it.each(POINTS)("%s", (_name, landing) => {
    expect(contactOffsetPx(390, 844, 663, landing)).toBeLessThanOrEqual(20);
  });
});

describe("接触の瞬間のバット先端(縦長 390×844。v3: バット軸 1.35 倍)", () => {
  it("先端のワールド x が batTipX に一致し、+0.28m 以上(ゾーン右端 0.26m の外)、画面では x 270px 以上でゾーン枠の右端の外側まで届く", () => {
    const aspect = 390 / 844;
    const size = { width: 390, height: 844 };
    const frame = contactFrameAt(390, 844, 663, { x: 0, y: 0 });
    const tip = batPoint(frame.batter, 0.975);
    expect(tip.x).toBeCloseTo(batTipX(aspect), 9);
    expect(tip.x).toBeGreaterThanOrEqual(0.28);
    const zone = targetRect(frame, size, "batting");
    expect(projectPoint(frame.camera, size, tip).x).toBeGreaterThanOrEqual(zone.right - 3);
  });
});
