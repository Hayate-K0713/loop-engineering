import { BoxGeometry, BufferGeometry, DataTexture, DirectionalLight, Group, Material, Mesh, MeshBasicMaterial, RedFormat, Texture } from "three";
import type { Object3D } from "three";
import { describe, expect, it } from "vitest";
import { buildCharacter, createTeamMaterials } from "./character";
import { disposeObject3D } from "./dispose";
import { createToonGradient } from "./look";
import { buildMarkers } from "./markers";
import { buildStadium } from "./stadium";
import { makeCrowd, makeGeometry, makeRig } from "./test-fixtures";

type Counter = { counts: Map<object, number>; track: (resource: BufferGeometry | Material | Texture) => void };

function counter(): Counter {
  const counts = new Map<object, number>();
  return {
    counts,
    track: (resource) => {
      if (counts.has(resource)) return;
      counts.set(resource, 0);
      resource.addEventListener("dispose", () => counts.set(resource, (counts.get(resource) ?? 0) + 1));
    },
  };
}

function trackAll(root: Object3D, tracker: Counter): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    tracker.track(object.geometry);
    const materials: Material[] = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      tracker.track(material);
      for (const value of Object.values(material)) if (value instanceof Texture) tracker.track(value);
    }
  });
}

describe("disposeObject3D", () => {
  it("geometry・material・texture が1回ずつ dispose される(共有していても重複しない)", () => {
    const shared = new MeshBasicMaterial({ map: new DataTexture(Uint8Array.from([1, 2, 3, 4]), 1, 1) });
    const geometry = new BoxGeometry(1, 1, 1);
    const root = new Group();
    root.add(new Mesh(geometry, shared), new Mesh(geometry, shared), new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial()));
    const tracker = counter();
    trackAll(root, tracker);
    tracker.track(shared.map as Texture);
    disposeObject3D(root);
    expect(tracker.counts.size).toBe(5);
    for (const count of tracker.counts.values()) expect(count).toBe(1);
  });

  it("キャラクター(共有のアクセント材質・階調テクスチャを含む)でも全資源が1回ずつ", () => {
    const gradient = createToonGradient();
    const teams = createTeamMaterials(gradient);
    const parts = buildCharacter(makeRig(), { accent: teams.defense, gradient, glove: true, bat: true });
    const tracker = counter();
    trackAll(parts.root, tracker);
    disposeObject3D(parts.root);
    expect(tracker.counts.has(gradient)).toBe(true);
    expect(gradient.format).toBe(RedFormat);
    expect(tracker.counts.size).toBeGreaterThan(20);
    for (const count of tracker.counts.values()) expect(count).toBe(1);
  });

  it("球場とマーカーの全資源が1回ずつ dispose される", () => {
    const root = new Group();
    root.add(buildStadium(makeGeometry(), makeCrowd()), buildMarkers(makeGeometry(), createToonGradient()).group);
    const tracker = counter();
    trackAll(root, tracker);
    disposeObject3D(root);
    expect(tracker.counts.size).toBeGreaterThan(20);
    for (const count of tracker.counts.values()) expect(count).toBe(1);
  });

  it("ライトの影を破棄でき、2回呼んでも例外にならない", () => {
    const light = new DirectionalLight();
    light.castShadow = true;
    const root = new Group();
    root.add(light);
    expect(() => {
      disposeObject3D(root);
      disposeObject3D(root);
    }).not.toThrow();
  });
});
