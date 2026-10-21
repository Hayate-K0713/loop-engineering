import { Box3, BufferGeometry, Group, LineSegments, Mesh, MeshBasicMaterial, MeshToonMaterial } from "three";
import type { Material } from "three";
import { describe, expect, it } from "vitest";
import { disposeObject3D } from "./dispose";
import { PALETTE, createToonGradient } from "./look";
import { RENDER_ORDER, applyMarkers, buildMarkers } from "./markers";
import { makeFrame, makeGeometry } from "./test-fixtures";

function boundsOf(geometry: BufferGeometry): Box3 {
  geometry.computeBoundingBox();
  return geometry.boundingBox ?? new Box3();
}

describe("buildMarkers", () => {
  it("ルートの Group に、ゾーン枠・格子・カーソル・狙いセル・ボール・影が入る", () => {
    const markers = buildMarkers(makeGeometry(), createToonGradient());
    expect(markers.group).toBeInstanceOf(Group);
    expect(markers.group.children).toEqual(
      expect.arrayContaining([markers.zoneFrame, markers.grid, markers.cursor, markers.aim, markers.ball, markers.ballShadow]),
    );
    expect(markers.zoneFrame).toBeInstanceOf(LineSegments);
    expect(markers.group.children).toEqual(expect.arrayContaining([markers.zonePulse, markers.landingRing]));
  });

  it("ゾーン枠の寸法が渡した StageGeometry.zone に一致し、値を変えると追従する", () => {
    for (const zone of [
      { halfWidth: 0.26, bottom: 0.42, top: 1.02, planeZ: 0.03 },
      { halfWidth: 0.4, bottom: 0.3, top: 1.5, planeZ: 0.1 },
    ]) {
      const box = boundsOf(buildMarkers(makeGeometry(zone), createToonGradient()).zoneFrame.geometry);
      expect(box.min.x).toBeCloseTo(-zone.halfWidth, 6);
      expect(box.max.x).toBeCloseTo(zone.halfWidth, 6);
      expect(box.min.y).toBeCloseTo(zone.bottom, 6);
      expect(box.max.y).toBeCloseTo(zone.top, 6);
      expect(box.min.z).toBeCloseTo(zone.planeZ, 6);
      expect(box.max.z).toBeCloseTo(zone.planeZ, 6);
    }
  });

  it("5×5 格子はゾーン枠より外側に広がり(3×3 セルがゾーン内)、ゾーン中心に対称", () => {
    const geometry = makeGeometry();
    const box = boundsOf(buildMarkers(geometry, createToonGradient()).grid.geometry);
    const { halfWidth, bottom, top } = geometry.zone;
    const center = (top + bottom) / 2;
    expect(box.max.x).toBeCloseTo(halfWidth * (5 / 3), 6);
    expect(box.min.x).toBeCloseTo(-halfWidth * (5 / 3), 6);
    expect(box.max.y - center).toBeCloseTo(center - box.min.y, 6);
    expect(box.max.y - box.min.y).toBeCloseTo(((top - bottom) / 2) * (10 / 3), 6);
  });

  it("ボールの半径が StageGeometry.ballRadius に追従する", () => {
    const geometry = { ...makeGeometry(), ballRadius: 0.25 };
    const markers = buildMarkers(geometry, createToonGradient());
    const body = markers.ball.children.find((child): child is Mesh => child instanceof Mesh);
    expect(body ? boundsOf(body.geometry).max.x : 0).toBeCloseTo(0.25, 6);
  });

  it("破棄しても例外にならない", () => {
    const markers = buildMarkers(makeGeometry(), createToonGradient());
    expect(() => disposeObject3D(markers.group)).not.toThrow();
  });

  it("発光板・落下点のリングも破棄され、材質と形状が1回ずつ dispose される", () => {
    const markers = buildMarkers(makeGeometry(), createToonGradient());
    const disposed: string[] = [];
    markers.zonePulse.geometry.addEventListener("dispose", () => disposed.push("pulse-geometry"));
    markers.zonePulseMaterial.addEventListener("dispose", () => disposed.push("pulse-material"));
    markers.landingRing.geometry.addEventListener("dispose", () => disposed.push("ring-geometry"));
    (markers.landingRing.material as Material).addEventListener("dispose", () => disposed.push("ring-material"));
    disposeObject3D(markers.group);
    expect(disposed.sort()).toEqual(["pulse-geometry", "pulse-material", "ring-geometry", "ring-material"]);
  });
});

function meshesOf(root: Group): Mesh[] {
  return root.children.filter((child): child is Mesh => child instanceof Mesh);
}

describe("描画順(ボールはカーソルより手前)", () => {
  const markers = buildMarkers(makeGeometry(), createToonGradient());
  const [body, outline] = (() => {
    const meshes = meshesOf(markers.ball);
    return [meshes.find((mesh) => mesh.material instanceof MeshToonMaterial), meshes.find((mesh) => mesh.material instanceof MeshBasicMaterial)] as const;
  })();

  it("ボール(本体と輪郭)は透明パス・深度なしで、本体がカーソルのどのメッシュよりも後に描かれる", () => {
    expect(body?.material).toBeInstanceOf(MeshToonMaterial);
    for (const mesh of [body, outline]) {
      const material = mesh?.material as Material | undefined;
      expect(material?.transparent).toBe(true);
      expect(material?.depthTest).toBe(false);
      expect(material?.depthWrite).toBe(false);
    }
    const cursorOrders = meshesOf(markers.cursor).map((mesh) => mesh.renderOrder);
    expect(cursorOrders.length).toBeGreaterThanOrEqual(3);
    for (const order of cursorOrders) {
      expect(outline?.renderOrder ?? 0).toBeGreaterThan(order);
      expect(body?.renderOrder ?? 0).toBeGreaterThan(outline?.renderOrder ?? 0);
    }
    expect(body?.renderOrder).toBe(RENDER_ORDER.ball);
    expect(outline?.renderOrder).toBe(RENDER_ORDER.ballOutline);
  });

  it("カーソルの Group の renderOrder は 0(子全体の第1キーにしない)で、メッシュに個別に付く。塗りは深度を書かない", () => {
    expect(markers.cursor.renderOrder).toBe(0);
    expect(markers.ball.renderOrder).toBe(0);
    for (const mesh of meshesOf(markers.cursor)) expect(mesh.renderOrder).toBe(RENDER_ORDER.cursor);
    expect(markers.cursorFill.depthWrite).toBe(false);
    expect(markers.cursorFill.transparent).toBe(true);
  });

  it("ボールは影を落とさず(castShadow なし)、地面の円盤(不透明度 0.5・半径 ×1.8)が影になる", () => {
    expect(body?.castShadow).toBe(false);
    const material = markers.ballShadow.material as MeshBasicMaterial;
    expect(material.opacity).toBe(0.5);
    expect(material.color.getHex()).toBe(PALETTE.shadow);
    const radius = makeGeometry().ballRadius;
    expect(boundsOf(markers.ballShadow.geometry).max.x).toBeCloseTo(radius * 1.8, 6);
    expect(meshesOf(markers.ball).every((mesh) => !mesh.castShadow)).toBe(true);
  });
});

describe("applyMarkers", () => {
  it("ゾーン・格子・カーソル・狙いセル・ボール・影の可視と位置・スケールが SceneFrame に従う", () => {
    const markers = buildMarkers(makeGeometry(), createToonGradient());
    const frame = makeFrame();
    applyMarkers(markers, frame);
    expect(markers.zoneFrame.visible).toBe(true);
    expect(markers.grid.visible).toBe(true);
    expect(markers.cursor.position.toArray()).toEqual([frame.cursor.position.x, frame.cursor.position.y, frame.cursor.position.z]);
    expect(markers.cursor.scale.x).toBe(frame.cursor.scaleX);
    expect(markers.cursor.scale.y).toBe(frame.cursor.scaleY);
    expect(markers.aim.scale.x).toBe(frame.aim.width);
    expect(markers.aim.scale.y).toBe(frame.aim.height);
    expect(markers.ball.position.toArray()).toEqual([frame.ball.position.x, frame.ball.position.y, frame.ball.position.z]);
    expect(markers.ballShadow.position.x).toBe(frame.ball.position.x);
    expect(markers.ballShadow.position.z).toBe(frame.ball.position.z);
    expect(markers.ballShadow.position.y).toBeGreaterThan(0);
  });

  it("ball.scale がボール本体と影の円盤に掛かる", () => {
    const markers = buildMarkers(makeGeometry(), createToonGradient());
    const base = makeFrame();
    applyMarkers(markers, base);
    expect(markers.ball.scale.toArray()).toEqual([1, 1, 1]);
    expect(markers.ballShadow.scale.toArray()).toEqual([1, 1, 1]);
    applyMarkers(markers, { ...base, ball: { ...base.ball, scale: 3.5 } });
    expect(markers.ball.scale.toArray()).toEqual([3.5, 3.5, 3.5]);
    expect(markers.ballShadow.scale.toArray()).toEqual([3.5, 3.5, 3.5]);
  });

  it("zone.pulse が 0 のとき発光板は出ず、枠は白。pulse に応じて枠が黄色に寄り、内側が薄く塗られる", () => {
    const markers = buildMarkers(makeGeometry(), createToonGradient());
    const base = makeFrame();
    applyMarkers(markers, base);
    expect(markers.zonePulse.visible).toBe(false);
    expect(markers.zonePulseMaterial.opacity).toBe(0);
    expect(markers.zoneFrameMaterial.color.getHex()).toBe(PALETTE.white);
    const frameOpacityAt0 = markers.zoneFrameMaterial.opacity;
    applyMarkers(markers, { ...base, zone: { ...base.zone, pulse: 0.5 } });
    expect(markers.zonePulse.visible).toBe(true);
    const half = markers.zonePulseMaterial.opacity;
    expect(half).toBeGreaterThan(0);
    expect(markers.zoneFrameMaterial.color.getHex()).not.toBe(PALETTE.white);
    applyMarkers(markers, { ...base, zone: { ...base.zone, pulse: 1 } });
    expect(markers.zonePulseMaterial.opacity).toBeGreaterThan(half);
    expect(markers.zonePulseMaterial.opacity).toBeLessThanOrEqual(0.25);
    expect(markers.zoneFrameMaterial.color.getHex()).toBe(PALETTE.accent);
    expect(markers.zoneFrameMaterial.opacity).toBeGreaterThanOrEqual(frameOpacityAt0);
    applyMarkers(markers, { ...base, zone: { ...base.zone, pulse: 0 } });
    expect(markers.zonePulse.visible).toBe(false);
    expect(markers.zoneFrameMaterial.color.getHex()).toBe(PALETTE.white);
  });

  it("ゾーンが非表示なら pulse があっても発光板は出ない", () => {
    const markers = buildMarkers(makeGeometry(), createToonGradient());
    applyMarkers(markers, makeFrame({ zone: { visible: false, grid: true, pulse: 1 } }));
    expect(markers.zonePulse.visible).toBe(false);
  });

  it("落下点のリングは landingMark に従って位置・半径・可視が変わる", () => {
    const markers = buildMarkers(makeGeometry(), createToonGradient());
    expect(markers.landingRing.visible).toBe(false);
    applyMarkers(markers, makeFrame({ landingMark: { visible: true, position: { x: 3, y: 0.07, z: -60 }, radius: 4.5 } }));
    expect(markers.landingRing.visible).toBe(true);
    expect(markers.landingRing.position.toArray()).toEqual([3, 0.07, -60]);
    expect(markers.landingRing.scale.x).toBe(4.5);
    applyMarkers(markers, makeFrame());
    expect(markers.landingRing.visible).toBe(false);
  });

  it("非表示の指定が反映され、格子はゾーンが見えるときだけ表示される", () => {
    const markers = buildMarkers(makeGeometry(), createToonGradient());
    applyMarkers(markers, makeFrame({ zone: { visible: false, grid: true, pulse: 0 }, ball: { visible: false, position: { x: 0, y: 0, z: 0 }, scale: 1 } }));
    expect(markers.zoneFrame.visible).toBe(false);
    expect(markers.grid.visible).toBe(false);
    expect(markers.ball.visible).toBe(false);
    expect(markers.ballShadow.visible).toBe(false);
    applyMarkers(markers, makeFrame({ zone: { visible: true, grid: false, pulse: 0 } }));
    expect(markers.zoneFrame.visible).toBe(true);
    expect(markers.grid.visible).toBe(false);
  });

  it("flash のときカーソルの塗りが濃くなる", () => {
    const markers = buildMarkers(makeGeometry(), createToonGradient());
    const base = makeFrame();
    applyMarkers(markers, base);
    const rest = markers.cursorFill.opacity;
    applyMarkers(markers, { ...base, cursor: { ...base.cursor, flash: true } });
    expect(markers.cursorFill.opacity).toBeGreaterThan(rest);
    applyMarkers(markers, { ...base, cursor: { ...base.cursor, visible: false }, aim: { ...base.aim, visible: false } });
    expect(markers.cursor.visible).toBe(false);
    expect(markers.aim.visible).toBe(false);
  });
});
