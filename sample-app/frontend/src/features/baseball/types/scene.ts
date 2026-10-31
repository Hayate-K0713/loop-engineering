// 3D 描画の契約(model/world が作り、render が消費するプレーンデータ)。types/ は実行時コードを持たない葉で、他セグメントを import しない。
// 座標系: 本塁が原点、+x = 右(ライト側)、+y = 上、−z = センター方向。単位はすべて m。回転は rad。
import type { BuildKind, EyeShape, HairStyle } from "./team";

/** ワールド座標の点(m)。 */
export type Vec3 = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

/** three の Euler(XYZ 順)と同義の回転(rad)。 */
export type Rot3 = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type CameraPose = {
  readonly position: Vec3;
  readonly target: Vec3;
  /** 縦方向の視野角(度)。 */
  readonly fovDeg: number;
  /** シーンを上へずらす量(画面高に対する比、0 以上)。render が `setViewOffset` でそのまま適用する。 */
  readonly lift: number;
};

/** 構図のレイアウト。`batting` = 人間が打つ画面、`pitching` = 人間が投げる画面(下の操作バーが大きいので構図が違う)。 */
export type SceneLayout = "batting" | "pitching";

/**
 * 空き領域(ステージが見える縦の範囲)。画面高に対する比で、`top` = 上の HUD の下端、`bottom` = 下のオーバーレイの上端
 * (0 ≤ top < bottom ≤ 1)。hooks が DOM の実測値から作り、model が構図を決めるのに使う。
 */
export type SafeArea = {
  readonly top: number;
  readonly bottom: number;
};

/** 顔の表情(8 種)。顔アトラスの 4×2 のセルに 1 対 1 で対応する(`render/character/parts.ts` の `FACE_PATCH`)。 */
export type FaceExpression = "neutral" | "focus" | "effort" | "shock" | "joy" | "cheer" | "sad" | "blink";

/**
 * スケルトンの関節名(ボーン)。`bat` は打者のみ。ボーンの並び(`skinIndex` の番号)は
 * `render/character/parts.ts` の `JOINT_ORDER` が決める。
 */
export type CharacterJoint =
  "root" | "pelvis" | "torso" | "head" | "upperArmL" | "foreArmL" | "upperArmR" | "foreArmR" | "thighL" | "shinL" | "thighR" | "shinR" | "bat";

/** 画面に出すキャラクターの枠(固定 14 体)。走者は打者走者・一塁・二塁・三塁の順、野手は一塁・二塁・遊撃・三塁・左・中・右の順。 */
export type CharacterSlot =
  | "pitcher"
  | "catcher"
  | "batter"
  | "runner0"
  | "runner1"
  | "runner2"
  | "runner3"
  | "fielder0"
  | "fielder1"
  | "fielder2"
  | "fielder3"
  | "fielder4"
  | "fielder5"
  | "fielder6";

/** 描画の品質ティア(0 = 標準 … 3 = 最低)。切替の規則は character 分冊 §3-4-10。 */
export type QualityTier = 0 | 1 | 2 | 3;

/**
 * キャラクターのポーズ。各関節の回転はそれぞれの親ノードから見た値。
 * `scale` = 表示倍率(`framingScale` を含む。構図の倍率は表示専用)、`expression` = 顔の表情、
 * `elbow*`/`knee*` = 肘・膝の回転(`armL/R` = 肩、`legL/R` = 股関節)。
 */
export type CharacterPose = {
  readonly visible: boolean;
  /** 足元の位置。 */
  readonly position: Vec3;
  readonly yaw: number;
  readonly scale: number;
  readonly expression: FaceExpression;
  readonly torso: Rot3;
  readonly head: Rot3;
  readonly armL: Rot3;
  readonly armR: Rot3;
  readonly elbowL: Rot3;
  readonly elbowR: Rot3;
  readonly legL: Rot3;
  readonly legR: Rot3;
  readonly kneeL: Rot3;
  readonly kneeR: Rot3;
};

/** 画面の矩形(CSS px。キャンバス左上基準)。 */
export type WipeRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/**
 * ワイプ(顔アップの第 2 ビューポート)。`target` のキャラクターだけを `camera` で `rect` に描く。
 * `alpha` は 0〜1(フェード)。`visible` が偽なら第 2 パスを描かない。
 */
export type SceneWipe = {
  readonly visible: boolean;
  readonly target: CharacterSlot;
  readonly camera: CameraPose;
  readonly rect: WipeRect;
  readonly alpha: number;
};

/**
 * キャラクターの見た目のデータ(model → hooks → render の受け渡し。`StageHandle.setLook`)。
 * `faceAtlas` は 4×2 セルの RGBA(`cell` = 1 セルの一辺の px)、`numberDecal` は背番号の RGBA、
 * `uniform` の色は 24bit RGB、`pattern` = ピンストライプ等の胴の縞のテクスチャ(RGBA。無地のチームは `null`)。
 * `hair.color` も 24bit RGB(`PlayerLook.hair.color` のパレット番号を `model/character` が変換する)。`skin` は 0〜4。
 */
export type CharacterLookData = {
  readonly slot: CharacterSlot;
  readonly skin: number;
  readonly build: BuildKind;
  readonly hair: { readonly style: HairStyle; readonly color: number };
  readonly eyes: EyeShape;
  readonly faceAtlas: {
    readonly width: number;
    readonly height: number;
    readonly cell: number;
    readonly rgba: Uint8Array;
  };
  readonly numberDecal: {
    readonly width: number;
    readonly height: number;
    readonly rgba: Uint8Array;
  };
  readonly uniform: {
    readonly base: number;
    readonly pants: number;
    readonly accent: number;
    readonly socks: number;
    readonly cap: number;
    readonly helmet: number;
    readonly pattern: Uint8Array | null;
  };
};

/**
 * バットのポーズ。モックの `swing.rotation.y`(`sweepYaw`)・`batTilt.rotation.x`(`tilt`)・グループの高さ(`height`、m)。
 * `lengthScale` = チルトグループの z 方向(バットの軸方向)の拡大(1 = 標準の長さ。縦長の打者の縮小に合わせて伸ばす)。
 */
export type BatPose = {
  readonly visible: boolean;
  readonly sweepYaw: number;
  readonly tilt: number;
  readonly height: number;
  readonly lengthScale: number;
};

export type BatterPose = CharacterPose & { readonly bat: BatPose };

/** ユニフォームの色(24bit RGB)。打者 = `offense`、投手・捕手・野手 = `defense`。 */
export type UniformColors = {
  readonly offense: number;
  readonly defense: number;
};

export type ScenePhase = "idle" | "windup" | "flight" | "play";

/**
 * 着弾点の予告・照準の見せ方。`exact` = 着弾点の点、`fade` = 着弾点を含む薄い円、`reticle` = 守備の狙いの照準、`none` = 出さない。
 */
export type GuideMode = "exact" | "fade" | "reticle" | "none";

/** 縮むリング(打撃 = 予告、守備 = ゲージ)。`width`/`radius` は m(ゾーン平面上)。`glow` は 0〜1。 */
export type GuideRing = {
  readonly visible: boolean;
  readonly radius: number;
  readonly width: number;
  readonly tone: "preview" | "gauge";
  readonly glow: number;
};

/**
 * 着弾点の予告(打撃)・狙いの照準(守備)。`position` はゾーン平面上の中心、`markerRadius` は点/照準の半径(m)、
 * `fadeRadius` は `fade` の円の半径(m)、`alpha` は全体の不透明度(0〜1)、`spread` は守備の散布円(ブレの目安)。
 */
export type SceneGuide = {
  readonly visible: boolean;
  readonly mode: GuideMode;
  readonly position: Vec3;
  readonly markerRadius: number;
  readonly fadeRadius: number;
  readonly alpha: number;
  readonly ring: GuideRing;
  readonly spread: { readonly visible: boolean; readonly radius: number };
};

/**
 * 時刻 t における画面の全状態。`model/world` の `sceneFrameAt` が作り、`StageHandle.apply` が three に適用する。
 * 寸法はすべてワールド m。
 */
export type SceneFrame = {
  readonly camera: CameraPose;
  /** 構図のレイアウト(`camera` を作った入力。render がゾーン矩形の再計算に使う)。 */
  readonly layout: SceneLayout;
  /** model が既定値で補った後の空き領域(`camera` を作った入力。render がゾーン矩形の再計算に使う)。 */
  readonly safeArea: SafeArea;
  readonly uniforms: UniformColors;
  /**
   * `scale` はボール本体と影の円盤に掛ける倍率(1 以上。飛行中・中継カメラ中の最小表示径のため)。
   * `rotation` = 縫い目の回転(球種ごとの回転軸・速さ)、`halo` = 球の後ろに敷く暖色のハローの不透明度(0〜1。常に > 0)、
   * `outlineScale` = 縁取りの殻の倍率(画面で 2px 以上を保つ)。
   */
  readonly ball: {
    readonly visible: boolean;
    readonly position: Vec3;
    readonly scale: number;
    readonly rotation: Rot3;
    readonly halo: number;
    readonly outlineScale: number;
  };
  readonly pitcher: CharacterPose;
  readonly catcher: CharacterPose;
  readonly batter: BatterPose;
  /** 固定順 7人: 一塁・二塁・遊撃・三塁・左・中・右。 */
  readonly fielders: readonly CharacterPose[];
  /** 固定順 4 人: 打者走者・一塁・二塁・三塁の走者(`CharacterSlot` の `runner0..3`)。動かない走者は `visible: false`。 */
  readonly runners: readonly CharacterPose[];
  /** 顔アップのワイプ(第 2 ビューポート)。 */
  readonly wipe: SceneWipe;
  /** `pulse` は到達の手がかりの発光(0〜1。ゾーン枠を黄色に寄せ、内側を薄く塗る)。 */
  readonly zone: { readonly visible: boolean; readonly grid: boolean; readonly pulse: number };
  /** 打球の落下点のリング(`position` は地面の中心、`radius` は m)。 */
  readonly landingMark: { readonly visible: boolean; readonly position: Vec3; readonly radius: number };
  /**
   * スイングカーソル(有効カーソル。ロックオン適用後)。`scaleX`/`scaleY` は楕円の半径(m)で、単位円のメッシュに掛ける
   * (`radii.rx × zone.halfWidth`、`radii.ry × (zone.top − zone.bottom) / 2`)。
   * `raw` = 指で動かした素のカーソルの位置(有効カーソルと離れているときだけ見せる薄い印)。
   */
  readonly cursor: {
    readonly visible: boolean;
    readonly position: Vec3;
    readonly scaleX: number;
    readonly scaleY: number;
    readonly flash: boolean;
    readonly raw: { readonly visible: boolean; readonly position: Vec3 };
  };
  /** 着弾点の予告・縮むリング(打撃)、狙いの照準・ゲージのリング(守備)。旧 `aim`(狙いセルのハイライト)の置き換え。 */
  readonly guide: SceneGuide;
};
