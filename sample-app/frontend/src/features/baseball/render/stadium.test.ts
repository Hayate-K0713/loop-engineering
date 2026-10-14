import { CylinderGeometry, DataTexture, DirectionalLight, Fog, Group, Material, Mesh, Texture } from "three";
import type { Object3D } from "three";
import { describe, expect, it } from "vitest";
import { disposeObject3D } from "./dispose";
import { FOG_LOOK, LIGHT_LOOK, SKY_HEIGHT, SKY_STOPS, shadowMapSizeFor } from "./look";
import { buildStadium, createFog, createSkyTexture } from "./stadium";
import { makeCrowd, makeGeometry } from "./test-fixtures";

function meshesOf(root: Object3D): Mesh[] {
  const meshes: Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof Mesh) meshes.push(object);
  });
  return meshes;
}

function texturesOf(root: Object3D): Texture[] {
  const textures = new Set<Texture>();
  for (const mesh of meshesOf(root)) {
    const materials: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
    }
  }
  return [...textures];
}

describe("buildStadium", () => {
  const stadium = buildStadium(makeGeometry(), makeCrowd());

  it("Group を返し、子の数が妥当", () => {
    expect(stadium).toBeInstanceOf(Group);
    expect(stadium.children.length).toBeGreaterThan(15);
    expect(stadium.children.length).toBeLessThan(60);
  });

  it("テクスチャはすべて DataTexture(canvas 由来のテクスチャを使わない)", () => {
    const textures = texturesOf(stadium);
    expect(textures.length).toBeGreaterThanOrEqual(2);
    for (const texture of textures) {
      expect(texture).toBeInstanceOf(DataTexture);
      expect("isCanvasTexture" in texture).toBe(false);
    }
  });

  it("太陽は影を落とし、影カメラの投影が更新されている", () => {
    const sun = stadium.children.find((child): child is DirectionalLight => child instanceof DirectionalLight);
    expect(sun?.castShadow).toBe(true);
    expect(sun?.shadow.camera.right).toBe(70);
    expect(sun?.shadow.camera.projectionMatrix.elements.at(0)).toBeCloseTo(2 / 140, 9);
  });

  it("影マップの一辺は options.shadowMapSize に従い、省略時は LIGHT_LOOK の値", () => {
    const sunOf = (root: Group): DirectionalLight | undefined => root.children.find((child): child is DirectionalLight => child instanceof DirectionalLight);
    expect(sunOf(stadium)?.shadow.mapSize.x).toBe(LIGHT_LOOK.sun.shadow.mapSize);
    expect(sunOf(stadium)?.shadow.mapSize.y).toBe(LIGHT_LOOK.sun.shadow.mapSize);
    const coarse = buildStadium(makeGeometry(), makeCrowd(), { shadowMapSize: shadowMapSizeFor(true) });
    expect(sunOf(coarse)?.shadow.mapSize.x).toBe(1024);
    expect(sunOf(coarse)?.shadow.mapSize.y).toBe(1024);
    const fine = buildStadium(makeGeometry(), makeCrowd(), { shadowMapSize: shadowMapSizeFor(false) });
    expect(sunOf(fine)?.shadow.mapSize.x).toBe(2048);
  });

  it("フェンスとスタンドの円弧は StageGeometry の半径に追従する", () => {
    const base = makeGeometry();
    const wide = buildStadium({ ...base, fence: { ...base.fence, radius: 120 } }, makeCrowd());
    const radiusOf = (root: Object3D): number[] =>
      meshesOf(root)
        .filter((mesh) => mesh.geometry instanceof CylinderGeometry && mesh.geometry.parameters.openEnded)
        .map((mesh) => (mesh.geometry as CylinderGeometry).parameters.radiusTop);
    expect(radiusOf(wide)).toContain(120);
    expect(radiusOf(stadium)).toContain(base.fence.radius);
    expect(radiusOf(stadium)).toContain(base.stands.outerRadius);
  });

  it("破棄しても例外にならない", () => {
    expect(() => disposeObject3D(buildStadium(makeGeometry(), makeCrowd()))).not.toThrow();
  });
});

describe("createSkyTexture / createFog", () => {
  it("空は DataTexture で、上端が SKY_STOPS の先頭、下端が末尾", () => {
    const sky = createSkyTexture();
    expect(sky).toBeInstanceOf(DataTexture);
    expect(sky.image.height).toBe(SKY_HEIGHT);
    const data = Array.from(sky.image.data as Uint8Array);
    const first = SKY_STOPS.at(0) ?? 0;
    const last = SKY_STOPS.at(-1) ?? 0;
    expect(data.slice(0, 3)).toEqual([(last >> 16) & 0xff, (last >> 8) & 0xff, last & 0xff]);
    expect(data.slice(-4, -1)).toEqual([(first >> 16) & 0xff, (first >> 8) & 0xff, first & 0xff]);
  });

  it("霧は FOG_LOOK の値", () => {
    const fog = createFog();
    expect(fog).toBeInstanceOf(Fog);
    expect(fog.near).toBe(FOG_LOOK.near);
    expect(fog.far).toBe(FOG_LOOK.far);
    expect(fog.color.getHex()).toBe(FOG_LOOK.color);
  });
});
