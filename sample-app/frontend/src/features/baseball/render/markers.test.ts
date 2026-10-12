import { Box3, BufferGeometry, Group, LineSegments, Mesh } from "three";
import { describe, expect, it } from "vitest";
import { disposeObject3D } from "./dispose";
import { createToonGradient } from "./look";
import { applyMarkers, buildMarkers } from "./markers";
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

  it("非表示の指定が反映され、格子はゾーンが見えるときだけ表示される", () => {
    const markers = buildMarkers(makeGeometry(), createToonGradient());
    applyMarkers(markers, makeFrame({ zone: { visible: false, grid: true }, ball: { visible: false, position: { x: 0, y: 0, z: 0 } } }));
    expect(markers.zoneFrame.visible).toBe(false);
    expect(markers.grid.visible).toBe(false);
    expect(markers.ball.visible).toBe(false);
    expect(markers.ballShadow.visible).toBe(false);
    applyMarkers(markers, makeFrame({ zone: { visible: true, grid: false } }));
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
