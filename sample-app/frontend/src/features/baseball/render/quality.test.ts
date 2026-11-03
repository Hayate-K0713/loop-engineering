import { DirectionalLight, Mesh, MeshBasicMaterial, PlaneGeometry, Scene, WebGLRenderTarget } from "three";
import { describe, expect, it } from "vitest";
import { applyShadowState } from "./quality";

function setup(): { renderer: { shadowMap: { enabled: boolean } }; sun: DirectionalLight; scene: Scene; material: MeshBasicMaterial } {
  const sun = new DirectionalLight();
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const material = new MeshBasicMaterial();
  const scene = new Scene();
  scene.add(new Mesh(new PlaneGeometry(), material), sun);
  return { renderer: { shadowMap: { enabled: true } }, sun, scene, material };
}

describe("applyShadowState", () => {
  it("変化がなければ何もしない(材質の再コンパイルを要求しない)", () => {
    const { renderer, sun, scene, material } = setup();
    const version = material.version;
    expect(applyShadowState(renderer, sun, scene, 2048)).toBe(true);
    expect(material.version).toBe(version);
  });

  it("大きさだけが変わるときは影マップを作り直し、材質は触らない", () => {
    const { renderer, sun, scene, material } = setup();
    sun.shadow.map = new WebGLRenderTarget(2048, 2048);
    const version = material.version;
    applyShadowState(renderer, sun, scene, 512);
    expect(sun.shadow.map).toBeNull();
    expect(sun.shadow.mapSize.x).toBe(512);
    expect(renderer.shadowMap.enabled).toBe(true);
    expect(material.version).toBe(version);
  });

  it("0 で影を切り(影マップを破棄・全材質を作り直させる)、正の値で戻す", () => {
    const { renderer, sun, scene, material } = setup();
    sun.shadow.map = new WebGLRenderTarget(2048, 2048);
    const version = material.version;
    expect(applyShadowState(renderer, sun, scene, 0)).toBe(false);
    expect(renderer.shadowMap.enabled).toBe(false);
    expect(sun.castShadow).toBe(false);
    expect(sun.shadow.map).toBeNull();
    expect(material.version).toBeGreaterThan(version);
    expect(applyShadowState(renderer, sun, scene, 1024)).toBe(true);
    expect(renderer.shadowMap.enabled).toBe(true);
    expect(sun.castShadow).toBe(true);
    expect(sun.shadow.mapSize.x).toBe(1024);
  });
});
