// テスト専用: `CharacterParts`(E0 の契約)を満たす偽物。造形(E5 の `createCharacterParts`)に依存せず、
// 顔・表情・ポーズの適用(E6)を単体テストするために使う。ジオメトリは空で、ボーンと材質だけを実物の three オブジェクトで持つ。
import { Bone, BufferGeometry, Group, Mesh, MeshBasicMaterial, MeshToonMaterial, Skeleton, SkinnedMesh } from "three";
import { WIPE_LAYER } from "./character/parts";
import type { CharacterParts } from "./character/parts";

export type FakePartsOptions = {
  /** 打者(バットのボーンあり)。 */
  readonly batter?: boolean;
  /** 遠景(輪郭・背番号なし)。 */
  readonly far?: boolean;
};

/** 根のボーンの下に他の 11 本(打者はバットを加えて 12 本)をぶら下げる。並びは `JOINT_ORDER`(根 … 下腿、バット)。 */
function makeBones(withBat: boolean): { readonly bones: CharacterParts["bones"]; readonly ordered: readonly Bone[] } {
  const rootBone = new Bone();
  const make = (): Bone => {
    const bone = new Bone();
    rootBone.add(bone);
    return bone;
  };
  const pelvis = make();
  const torso = make();
  const head = make();
  const upperArmL = make();
  const foreArmL = make();
  const upperArmR = make();
  const foreArmR = make();
  const thighL = make();
  const shinL = make();
  const thighR = make();
  const shinR = make();
  const bat = withBat ? make() : null;
  const bones = { root: rootBone, pelvis, torso, head, upperArmL, foreArmL, upperArmR, foreArmR, thighL, shinL, thighR, shinR, bat };
  const ordered = [rootBone, pelvis, torso, head, upperArmL, foreArmL, upperArmR, foreArmR, thighL, shinL, thighR, shinR, ...(bat ? [bat] : [])];
  return { bones, ordered };
}

export function makeFakeParts(options: FakePartsOptions = {}): CharacterParts {
  const near = options.far !== true;
  const { bones, ordered } = makeBones(options.batter === true);
  const root = new Group();
  if (bones.root) root.add(bones.root);
  const skeleton = new Skeleton([...ordered]);
  const bodyMaterial = new MeshToonMaterial();
  const faceMaterial = new MeshBasicMaterial();
  const decalMaterial = near ? new MeshBasicMaterial() : null;
  const body = new SkinnedMesh(new BufferGeometry(), bodyMaterial);
  const outline = near ? new SkinnedMesh(body.geometry, new MeshBasicMaterial()) : null;
  const face = new Mesh(new BufferGeometry(), faceMaterial);
  const numberDecal = decalMaterial ? new Mesh(new BufferGeometry(), decalMaterial) : null;
  const meshes: Mesh[] = [body, face, ...(outline ? [outline] : []), ...(numberDecal ? [numberDecal] : [])];
  root.add(...meshes);
  return {
    root,
    skeleton,
    bones,
    body,
    outline,
    face,
    faceMaterial,
    numberDecal,
    decalMaterial,
    bodyMaterial,
    setWipeLayer(on: boolean): void {
      for (const mesh of meshes) {
        if (on) mesh.layers.enable(WIPE_LAYER);
        else mesh.layers.disable(WIPE_LAYER);
      }
    },
    dispose(): void {
      for (const mesh of meshes) mesh.geometry.dispose();
      bodyMaterial.map?.dispose();
      faceMaterial.map?.dispose();
      decalMaterial?.map?.dispose();
      skeleton.dispose();
    },
  };
}
