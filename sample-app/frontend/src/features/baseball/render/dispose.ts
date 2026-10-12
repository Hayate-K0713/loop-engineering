// three のオブジェクトの破棄。geometry・material・texture(材質が持つもの)と、ライトの影を、重複なく1回ずつ破棄する。
import { BufferGeometry, LightShadow, Material, Texture } from "three";
import type { Object3D } from "three";

type Disposable = BufferGeometry | Material | Texture | LightShadow;

function materialsOf(material: Material | Material[]): Material[] {
  return Array.isArray(material) ? material : [material];
}

function texturesOf(material: Material): Texture[] {
  return Object.values(material).filter((value): value is Texture => value instanceof Texture);
}

function collect(object: Object3D, found: Set<Disposable>): void {
  if ("geometry" in object && object.geometry instanceof BufferGeometry) found.add(object.geometry);
  if ("material" in object && (object.material instanceof Material || Array.isArray(object.material))) {
    for (const material of materialsOf(object.material as Material | Material[])) {
      found.add(material);
      for (const texture of texturesOf(material)) found.add(texture);
    }
  }
  if ("shadow" in object && object.shadow instanceof LightShadow) found.add(object.shadow);
}

/** `root` 配下(自分を含む)の geometry・material・texture・ライトの影を破棄する。同じ資源を共有していても1回だけ。親からは外さない。 */
export function disposeObject3D(root: Object3D): void {
  const found = new Set<Disposable>();
  root.traverse((object) => collect(object, found));
  for (const resource of found) resource.dispose();
}
