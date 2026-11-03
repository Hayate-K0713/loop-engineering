// 品質ティアのうち、影に関わる切替(影マップの有効/無効・大きさ)。character 分冊 §3-4-10。
// 影の ON/OFF・影マップの再生成はシェーダの再コンパイルを伴い、100ms 以上画面が止まる。呼び出し側(`stage.ts`)は
// 飛行中を避け、`idle`/`holding` の間にだけ呼ぶ。`window`・`document` は使わない。
import type { DirectionalLight, Material, Mesh, Object3D } from "three";

/** `WebGLRenderer` のうち影の切替が触る最小の型(node では `WebGLRenderer` を作れないため構造的に受ける)。 */
export type ShadowRenderer = {
  shadowMap: { enabled: boolean };
};

function releaseShadowMap(sun: DirectionalLight): void {
  const map = sun.shadow.map;
  if (map === null) return;
  map.depthTexture?.dispose();
  map.dispose();
  sun.shadow.map = null;
}

function isMesh(object: Object3D): object is Mesh {
  return "isMesh" in object;
}

/** 影の有無でシェーダが変わるので、シーン内の全材質を作り直させる。 */
function markMaterialsDirty(scene: Object3D): void {
  scene.traverse((object) => {
    if (!isMesh(object)) return;
    const materials: Material[] = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.needsUpdate = true;
  });
}

/**
 * 影マップの有効/無効と一辺(px)を揃える。`mapSize` が 0 以下なら影なし。変化がなければ何もしない(再コンパイルしない)。
 * 有効 → 無効、無効 → 有効のときは全材質を作り直させ、大きさだけが変わるときは影マップだけを作り直す。
 */
export function applyShadowState(renderer: ShadowRenderer, sun: DirectionalLight, scene: Object3D, mapSize: number): boolean {
  const enabled = mapSize > 0;
  const toggled = renderer.shadowMap.enabled !== enabled || sun.castShadow !== enabled;
  const resized = enabled && sun.shadow.mapSize.x !== mapSize;
  if (!toggled && !resized) return enabled;
  if (!enabled || resized) releaseShadowMap(sun);
  if (enabled) sun.shadow.mapSize.set(mapSize, mapSize);
  renderer.shadowMap.enabled = enabled;
  sun.castShadow = enabled;
  if (toggled) markMaterialsDirty(scene);
  return enabled;
}
