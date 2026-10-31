// キャラクター 1 体の three オブジェクトの束(`CharacterParts`)と、その共通定数。E0 が凍結する `render/` 内の契約で、型と定数だけを持つ。
// 実装は E5(`createCharacterParts(look, lod)` = 造形)と E6(`applyLook`・`applyExpression`・`applyPose` = 顔・表情・ポーズの適用)が
// 並列に分担する。E6 はこのファイルの型だけを受け取って実装し、偽の `CharacterParts` で単体テストできる。
// `types/` に置かないのは three の型を含むため。three は `import type` のみ(実行時の import をしない)。`render/` 以外から import しない。
//
// 方式: 体(頭・髪・ヘルメット/帽子・胴・腕・脚・靴・グローブ・バット)を 1 つの `SkinnedMesh` に統合し、各頂点を 1 本のボーンに
// 剛体として割り当てる(重み 1.0)。輪郭は同じ `Skeleton` を共有する 2 つ目の `SkinnedMesh`(近景のみ)。顔と背番号は通常の `Mesh`。
// 描画予算と確認事項は character 分冊 §3-4-10。
import type { Bone, Group, Mesh, MeshBasicMaterial, MeshToonMaterial, Skeleton, SkinnedMesh } from "three";
import type { CharacterJoint, FaceExpression } from "../../types/scene";

/**
 * 1 体分の three オブジェクト。`createCharacterParts` が作り、`dispose()` までは同じインスタンスを使い回す。
 *
 * - `root` = 配置の起点(足元)。位置・`yaw`・`scale` は `root` に適用する。`body`・`outline`・`face`・`numberDecal` は `root` の子孫。
 * - `skeleton` = `JOINT_ORDER` の順に並ぶボーン(`skinIndex` = `JOINT_ORDER` の添字)。体と輪郭が共有する。
 * - `bones` = 関節名 → ボーン。`bat` は打者のみ、他のスロットでは `null`。ポーズはこのボーンの回転に直接書く(親から見た値)。
 * - `body` = 体の `SkinnedMesh`(頂点カラー + `bodyMaterial`)。影を落とすのはこのメッシュだけ。
 * - `outline` = 輪郭の `SkinnedMesh`(BackSide の黒)。遠景では `null`。
 * - `face` = 頭のボーンの子の顔パッチ(`faceMaterial` の `map` が顔アトラス)。表情は `faceMaterial.map` の `offset`/`repeat` を
 *   `FACE_PATCH` の値にするだけで切り替える(再アップロードなし)。
 * - `numberDecal` / `decalMaterial` = 胴のボーンの子の背番号クアッド。遠景では両方 `null`。
 * - `bodyMaterial` = 体のトゥーン材質(ユニフォーム色は頂点カラーで塗り分け。ピンストライプ等の `map` の差し替えもここ)。
 * - `setWipeLayer(on)` = このキャラクターの全メッシュ(体・輪郭・顔・背番号)に `WIPE_LAYER` を有効/無効にする(ワイプの第 2 パス用)。
 * - `dispose()` = ジオメトリ・材質・テクスチャ(顔・背番号・胴の縞)・`skeleton.dispose()` を破棄する。冪等。
 *
 * ポーズ(`CharacterPose`)とボーンの対応(E6 が `applyPose` で適用する。回転はすべて親から見た Euler XYZ):
 * `torso` → `torso`、`head` → `head`、`armL`/`armR` → `upperArmL`/`upperArmR`、`elbowL`/`elbowR` → `foreArmL`/`foreArmR`、
 * `legL`/`legR` → `thighL`/`thighR`、`kneeL`/`kneeR` → `shinL`/`shinR`。`pelvis` はポーズの入力を持たない(恒等)。
 * `root` には `position`・`yaw`・`scale` を適用する。`bat`(打者のみ)は `BatPose` の `sweepYaw`・`tilt`・`height`・`lengthScale` で決める。
 */
export type CharacterParts = {
  readonly root: Group;
  readonly skeleton: Skeleton;
  readonly bones: Readonly<Record<CharacterJoint, Bone | null>>;
  readonly body: SkinnedMesh;
  readonly outline: SkinnedMesh | null;
  readonly face: Mesh;
  readonly faceMaterial: MeshBasicMaterial;
  readonly numberDecal: Mesh | null;
  readonly decalMaterial: MeshBasicMaterial | null;
  readonly bodyMaterial: MeshToonMaterial;
  setWipeLayer(on: boolean): void;
  dispose(): void;
};

/**
 * ボーンの並び。`skeleton.bones` の順・`skinIndex` の番号と一致する(0 = `root` … 11 = `shinR`、12 = `bat`)。
 * 打者以外のスロットは `bat` を除いた先頭 12 本(`WORLD_PARAMS.character.bones.count` = 12、打者 13)。
 */
export const JOINT_ORDER: readonly CharacterJoint[] = [
  "root",
  "pelvis",
  "torso",
  "head",
  "upperArmL",
  "foreArmL",
  "upperArmR",
  "foreArmR",
  "thighL",
  "shinL",
  "thighR",
  "shinR",
  "bat",
];

/** 顔アトラスの 1 セルの UV 範囲。`faceMaterial.map.offset` ← `offset`、`.repeat` ← `repeat`。 */
export type FacePatchCell = {
  readonly offset: { readonly x: number; readonly y: number };
  readonly repeat: { readonly x: number; readonly y: number };
};

/**
 * 表情 → 顔アトラスのセルの UV 範囲(セル外周 `padPx` = 4px の余白を除いた内側。mipmap で隣のセルが滲まないため)。
 * アトラスは 384×192 px(セル 96px・4 列×2 行)で、値は `WORLD_PARAMS.character.face` の `cell`・`columns`・`rows`・`padPx` から
 * 導いた定数(render は model を import しないため複製する)。セル (column, row) の `offset` = ((96·column + 4) / 384, (96·row + 4) / 192)、
 * `repeat` = (88 / 384, 88 / 192)。
 *
 * セルの並び(行優先。左上から): `neutral`・`focus`・`effort`・`shock` / `joy`・`cheer`・`sad`・`blink`
 * (= `WORLD_PARAMS.character.face.order`)。セル (column, row) は column = 添字 % 4、row = 添字 ÷ 4 の商。
 *
 * 向きの取り決め: アトラスの RGBA は **データの先頭の行 = 絵の上端**(通常の画像の並び)で書き、`DataTexture` の `flipY` は
 * 既定の `false` のまま使う。そのためデータの行 r は v = r / 高さ に対応する(row 0 のセルは v 0〜0.5 の側)。顔パッチ(E5)の UV は、
 * **パッチの上端が v = 0、下端が v = 1** になるように作る(通常の「上が v = 1」と逆)。背番号のクアッド(`DECAL_SIZE`)も同じ向き。
 */
export const FACE_PATCH: Readonly<Record<FaceExpression, FacePatchCell>> = {
  neutral: { offset: { x: 4 / 384, y: 4 / 192 }, repeat: { x: 88 / 384, y: 88 / 192 } },
  focus: { offset: { x: 100 / 384, y: 4 / 192 }, repeat: { x: 88 / 384, y: 88 / 192 } },
  effort: { offset: { x: 196 / 384, y: 4 / 192 }, repeat: { x: 88 / 384, y: 88 / 192 } },
  shock: { offset: { x: 292 / 384, y: 4 / 192 }, repeat: { x: 88 / 384, y: 88 / 192 } },
  joy: { offset: { x: 4 / 384, y: 100 / 192 }, repeat: { x: 88 / 384, y: 88 / 192 } },
  cheer: { offset: { x: 100 / 384, y: 100 / 192 }, repeat: { x: 88 / 384, y: 88 / 192 } },
  sad: { offset: { x: 196 / 384, y: 100 / 192 }, repeat: { x: 88 / 384, y: 88 / 192 } },
  blink: { offset: { x: 292 / 384, y: 100 / 192 }, repeat: { x: 88 / 384, y: 88 / 192 } },
};

/** 背番号の貼り板のテクスチャの寸法(px。`CharacterLookData.numberDecal` の `width`・`height` と同値)。向きは `FACE_PATCH` と同じ。 */
export const DECAL_SIZE = { width: 64, height: 48 } as const;

/** ワイプの第 2 パス用のレイヤー番号。対象のキャラクターと背景(地面・空)だけにこのレイヤーを有効にし、ワイプ用カメラは `layers.set(WIPE_LAYER)`。 */
export const WIPE_LAYER = 1;
