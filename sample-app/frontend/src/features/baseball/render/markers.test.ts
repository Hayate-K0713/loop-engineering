import { Box3, BufferGeometry, Group, LineSegments, Mesh, MeshBasicMaterial, MeshToonMaterial } from "three";
import type { Material } from "three";
import { describe, expect, it } from "vitest";
import type { SceneFrame } from "../types/scene";
import { disposeObject3D } from "./dispose";
import { PALETTE, createToonGradient } from "./look";
import { RENDER_ORDER, applyMarkers, buildMarkers } from "./markers";
import { makeFrame, makeGeometry } from "./test-fixtures";

function boundsOf(geometry: BufferGeometry): Box3 {
  geometry.computeBoundingBox();
  return geometry.boundingBox ?? new Box3();
}

describe("buildMarkers", () => {
  it("ルートの Group に、ゾーン枠・格子・カーソル・素のカーソル・予告/照準・ボール・影が入る", () => {
    const markers = buildMarkers(makeGeometry(), createToonGradient());
    expect(markers.group).toBeInstanceOf(Group);
    expect(markers.group.children).toEqual(
      expect.arrayContaining([markers.zoneFrame, markers.grid, markers.cursor, markers.cursorRaw, markers.guide.group, markers.ball, markers.ballShadow]),
    );
    expect("aim" in markers).toBe(false);
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
    expect(boundsOf(markers.ballBody.geometry).max.x).toBeCloseTo(0.25, 6);
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
  const body = markers.ballBody;
  const outline = markers.ballOutline;
  const halo = markers.ballHalo;
  const seamMeshes = meshesOf(markers.ballSeams);

  it("ボール(ハロー・輪郭・本体・縫い目)は透明パス・深度なしで、カーソルのどのメッシュよりも後に描かれる", () => {
    expect(body.material).toBeInstanceOf(MeshToonMaterial);
    expect(seamMeshes).toHaveLength(2);
    for (const mesh of [halo, outline, body, ...seamMeshes]) {
      const material = mesh.material as Material;
      expect(material.transparent).toBe(true);
      expect(material.depthTest).toBe(false);
      expect(material.depthWrite).toBe(false);
    }
    const cursorOrders = [...meshesOf(markers.cursor), ...meshesOf(markers.cursorRaw)].map((mesh) => mesh.renderOrder);
    expect(cursorOrders.length).toBeGreaterThanOrEqual(5);
    for (const order of cursorOrders) {
      expect(halo.renderOrder).toBeGreaterThan(order);
    }
    expect(outline.renderOrder).toBeGreaterThan(halo.renderOrder);
    expect(body.renderOrder).toBeGreaterThan(outline.renderOrder);
    for (const seam of seamMeshes) expect(seam.renderOrder).toBeGreaterThan(body.renderOrder);
    expect(body.renderOrder).toBe(RENDER_ORDER.ball);
    expect(outline.renderOrder).toBe(RENDER_ORDER.ballOutline);
    expect(halo.renderOrder).toBe(RENDER_ORDER.ballHalo);
  });

  it("予告・照準・リングはゾーン枠より後・カーソルより前に描かれる", () => {
    const { guide } = markers;
    const orders = [guide.dot, guide.fade, guide.reticle, guide.ring, guide.spread].flatMap((object) =>
      object instanceof Mesh ? [object.renderOrder] : meshesOf(object as Group).map((mesh) => mesh.renderOrder),
    );
    for (const order of orders) {
      expect(order).toBeGreaterThan(RENDER_ORDER.overlay);
      expect(order).toBeLessThan(RENDER_ORDER.cursor);
    }
  });

  it("カーソルの Group の renderOrder は 0(子全体の第1キーにしない)で、メッシュに個別に付く。塗りは深度を書かない", () => {
    expect(markers.cursor.renderOrder).toBe(0);
    expect(markers.ball.renderOrder).toBe(0);
    for (const mesh of meshesOf(markers.cursor)) expect(mesh.renderOrder).toBe(RENDER_ORDER.cursor);
    expect(markers.cursorFill.depthWrite).toBe(false);
    expect(markers.cursorFill.transparent).toBe(true);
  });

  it("ボールは影を落とさず(castShadow なし)、地面の円盤(不透明度 0.5・半径 ×1.8)が影になる", () => {
    expect(body.castShadow).toBe(false);
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
    const base = makeFrame();
    applyMarkers(markers, makeFrame({ zone: { visible: false, grid: true, pulse: 0 }, ball: { ...base.ball, visible: false } }));
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
    applyMarkers(markers, { ...base, cursor: { ...base.cursor, visible: false } });
    expect(markers.cursor.visible).toBe(false);
    expect(markers.cursorRaw.visible).toBe(false);
  });

  it("素のカーソルは cursor.raw に従って位置・可視が変わる", () => {
    const markers = buildMarkers(makeGeometry(), createToonGradient());
    const base = makeFrame();
    applyMarkers(markers, base);
    expect(markers.cursorRaw.visible).toBe(true);
    expect(markers.cursorRaw.position.toArray()).toEqual([base.cursor.raw.position.x, base.cursor.raw.position.y, base.cursor.raw.position.z]);
    applyMarkers(markers, { ...base, cursor: { ...base.cursor, raw: { ...base.cursor.raw, visible: false } } });
    expect(markers.cursorRaw.visible).toBe(false);
  });
});

function withGuide(overrides: Partial<SceneFrame["guide"]>): SceneFrame {
  const base = makeFrame();
  return { ...base, guide: { ...base.guide, ...overrides } };
}

describe("予告・照準・縮むリング(guide)", () => {
  it("リングの半径・線幅が guide.ring に一致し、値が変わると頂点が追従する", () => {
    const markers = buildMarkers(makeGeometry(), createToonGradient());
    for (const [radius, width] of [
      [0.3, 0.012],
      [0.125, 0.006],
    ] as const) {
      const base = makeFrame();
      applyMarkers(markers, withGuide({ ring: { ...base.guide.ring, radius, width } }));
      expect(markers.guide.ring.visible).toBe(true);
      const box = boundsOf(markers.guide.ring.geometry);
      expect(box.max.x).toBeCloseTo(radius + width / 2, 6);
      expect(box.min.x).toBeCloseTo(-(radius + width / 2), 6);
      expect(box.max.y).toBeCloseTo(radius + width / 2, 2);
      const position = markers.guide.ring.geometry.getAttribute("position");
      const innerX = position.getX(0);
      const outerX = position.getX(1);
      expect(innerX).toBeCloseTo(radius - width / 2, 6);
      expect(outerX - innerX).toBeCloseTo(width, 6);
    }
  });

  it("リングは guide.position に置かれ、ring.visible が偽・半径 0 なら隠れる", () => {
    const markers = buildMarkers(makeGeometry(), createToonGradient());
    const base = makeFrame();
    applyMarkers(markers, withGuide({ position: { x: 0.2, y: 0.8, z: 0.03 } }));
    expect(markers.guide.group.position.toArray()).toEqual([0.2, 0.8, 0.03]);
    expect(markers.guide.ring.visible).toBe(true);
    applyMarkers(markers, withGuide({ ring: { ...base.guide.ring, visible: false } }));
    expect(markers.guide.ring.visible).toBe(false);
    applyMarkers(markers, withGuide({ ring: { ...base.guide.ring, radius: 0 } }));
    expect(markers.guide.ring.visible).toBe(false);
  });

  it("リングの色は tone と glow で変わる(glow 1 で金色)", () => {
    const markers = buildMarkers(makeGeometry(), createToonGradient());
    const base = makeFrame();
    applyMarkers(markers, withGuide({ ring: { ...base.guide.ring, tone: "gauge", glow: 0 } }));
    expect(markers.guide.ringMaterial.color.getHex()).toBe(PALETTE.white);
    applyMarkers(markers, withGuide({ ring: { ...base.guide.ring, tone: "preview", glow: 0 } }));
    expect(markers.guide.ringMaterial.color.getHex()).not.toBe(PALETTE.white);
    applyMarkers(markers, withGuide({ ring: { ...base.guide.ring, tone: "preview", glow: 1 } }));
    expect(markers.guide.ringMaterial.color.getHex()).toBe(PALETTE.accent);
  });

  it("mode ごとに点・フェードの円・照準だけが出る。none では点も円も出ずリングは残る", () => {
    const markers = buildMarkers(makeGeometry(), createToonGradient());
    const visibleModes = (): string[] =>
      [
        ["dot", markers.guide.dot],
        ["fade", markers.guide.fade],
        ["reticle", markers.guide.reticle],
      ].flatMap(([name, object]) => ((object as Group).visible ? [name as string] : []));
    applyMarkers(markers, withGuide({ mode: "exact" }));
    expect(visibleModes()).toEqual(["dot"]);
    expect(markers.guide.dot.scale.x).toBeCloseTo(0.04, 9);
    applyMarkers(markers, withGuide({ mode: "fade", fadeRadius: 0.1 }));
    expect(visibleModes()).toEqual(["fade"]);
    expect(markers.guide.fade.scale.x).toBeCloseTo(0.1, 9);
    applyMarkers(markers, withGuide({ mode: "reticle", markerRadius: 0.05 }));
    expect(visibleModes()).toEqual(["reticle"]);
    applyMarkers(markers, withGuide({ mode: "none" }));
    expect(visibleModes()).toEqual([]);
    expect(markers.guide.group.visible).toBe(true);
    expect(markers.guide.ring.visible).toBe(true);
  });

  it("guide.visible が偽、または alpha が 0 なら全部隠れる。alpha が材質の不透明度に掛かる", () => {
    const markers = buildMarkers(makeGeometry(), createToonGradient());
    applyMarkers(markers, withGuide({ visible: false }));
    expect(markers.guide.group.visible).toBe(false);
    applyMarkers(markers, withGuide({ alpha: 0 }));
    expect(markers.guide.group.visible).toBe(false);
    applyMarkers(markers, withGuide({ alpha: 1 }));
    const full = markers.guide.ringMaterial.opacity;
    applyMarkers(markers, withGuide({ alpha: 0.5 }));
    expect(markers.guide.group.visible).toBe(true);
    expect(markers.guide.ringMaterial.opacity).toBeCloseTo(full / 2, 6);
    expect(markers.guide.dotMaterial.opacity).toBeCloseTo(0.5, 6);
  });

  it("守備の散布円は reticle のときだけ guide.spread に従って出る", () => {
    const markers = buildMarkers(makeGeometry(), createToonGradient());
    applyMarkers(markers, withGuide({ mode: "reticle", spread: { visible: true, radius: 0.2 } }));
    expect(markers.guide.spread.visible).toBe(true);
    expect(markers.guide.spread.scale.x).toBeCloseTo(0.2, 9);
    applyMarkers(markers, withGuide({ mode: "reticle", spread: { visible: false, radius: 0.2 } }));
    expect(markers.guide.spread.visible).toBe(false);
    applyMarkers(markers, withGuide({ mode: "exact", spread: { visible: true, radius: 0.2 } }));
    expect(markers.guide.spread.visible).toBe(false);
  });
});

describe("ボールの視認性(ハロー・縫い目・輪郭)", () => {
  it("ハローは常に生成され、暖色で、球より大きく、ball.halo が不透明度になる", () => {
    const markers = buildMarkers(makeGeometry(), createToonGradient());
    expect(markers.ball.children).toContain(markers.ballHalo);
    expect(markers.ballHaloMaterial.color.getHex()).toBe(0xffd9a0);
    expect(boundsOf(markers.ballHalo.geometry).max.x).toBeGreaterThan(boundsOf(markers.ballBody.geometry).max.x * 1.5);
    const base = makeFrame();
    applyMarkers(markers, { ...base, ball: { ...base.ball, halo: 0.35 } });
    expect(markers.ballHaloMaterial.opacity).toBeCloseTo(0.35, 6);
    applyMarkers(markers, { ...base, ball: { ...base.ball, halo: 0.5 } });
    expect(markers.ballHaloMaterial.opacity).toBeCloseTo(0.5, 6);
    expect(markers.ballHalo.visible).toBe(true);
  });

  it("縫い目は赤い帯の弧 2 本で、ball.rotation に従って回り、本体は回らない", () => {
    const markers = buildMarkers(makeGeometry(), createToonGradient());
    expect(markers.ballSeams.children).toHaveLength(2);
    const base = makeFrame();
    applyMarkers(markers, base);
    expect(markers.ballSeams.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    applyMarkers(markers, { ...base, ball: { ...base.ball, rotation: { x: 1.1, y: -0.4, z: 2.5 } } });
    expect(markers.ballSeams.rotation.toArray().slice(0, 3)).toEqual([1.1, -0.4, 2.5]);
    expect(markers.ballBody.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    for (const seam of meshesOf(markers.ballSeams)) {
      expect((seam.material as MeshBasicMaterial).color.getHex()).toBe(0xd62f2f);
    }
  });

  it("縫い目の帯は球面に沿い(半径 ≈ ballRadius)、帯の幅が球の径の 18% に当たる", () => {
    const radius = makeGeometry().ballRadius;
    const markers = buildMarkers(makeGeometry(), createToonGradient());
    for (const seam of meshesOf(markers.ballSeams)) {
      const position = seam.geometry.getAttribute("position");
      expect(position.count).toBeGreaterThan(0);
      for (const k of Array.from({ length: position.count }, (_, index) => index)) {
        const length = Math.hypot(position.getX(k), position.getY(k), position.getZ(k));
        expect(length).toBeGreaterThanOrEqual(radius);
        expect(length).toBeLessThanOrEqual(radius * 1.02);
      }
    }
    const first = meshesOf(markers.ballSeams).at(0);
    const position = first?.geometry.getAttribute("position");
    const thetas = Array.from({ length: position?.count ?? 0 }, (_, k) => Math.acos((position?.getY(k) ?? 0) / (radius * 1.008)));
    const width = (Math.max(...thetas) - Math.min(...thetas)) * radius;
    expect(width / (radius * 2)).toBeCloseTo(0.18, 2);
  });

  it("ball.outlineScale が輪郭の殻の倍率になる(不正な値は既定の 1.12)", () => {
    const markers = buildMarkers(makeGeometry(), createToonGradient());
    const base = makeFrame();
    applyMarkers(markers, { ...base, ball: { ...base.ball, outlineScale: 1.6 } });
    expect(markers.ballOutline.scale.x).toBeCloseTo(1.6, 9);
    applyMarkers(markers, { ...base, ball: { ...base.ball, outlineScale: Number.NaN } });
    expect(markers.ballOutline.scale.x).toBeCloseTo(1.12, 9);
  });
});
