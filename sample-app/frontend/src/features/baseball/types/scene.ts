// 3D 描画の契約(model/world が作り、render が消費するプレーンデータ)。types/ は実行時コードを持たない葉で、他セグメントを import しない。
// 座標系: 本塁が原点、+x = 右(ライト側)、+y = 上、−z = センター方向。単位はすべて m。回転は rad。

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

/** キャラクターのポーズ。各関節の回転はそれぞれの親ノードから見た値。 */
export type CharacterPose = {
  readonly visible: boolean;
  /** 足元の位置。 */
  readonly position: Vec3;
  readonly yaw: number;
  readonly scale: number;
  readonly torso: Rot3;
  readonly head: Rot3;
  readonly armL: Rot3;
  readonly armR: Rot3;
  readonly legL: Rot3;
  readonly legR: Rot3;
};

/** バットのポーズ。モックの `swing.rotation.y`(`sweepYaw`)・`batTilt.rotation.x`(`tilt`)・グループの高さ(`height`、m)。 */
export type BatPose = {
  readonly visible: boolean;
  readonly sweepYaw: number;
  readonly tilt: number;
  readonly height: number;
};

export type BatterPose = CharacterPose & { readonly bat: BatPose };

/** ユニフォームの色(24bit RGB)。打者 = `offense`、投手・捕手・野手 = `defense`。 */
export type UniformColors = {
  readonly offense: number;
  readonly defense: number;
};

export type ScenePhase = "idle" | "windup" | "flight" | "play";

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
  /** `scale` はボール本体と影の円盤に掛ける倍率(1 以上。中継カメラ中の最小表示径のため)。 */
  readonly ball: { readonly visible: boolean; readonly position: Vec3; readonly scale: number };
  readonly pitcher: CharacterPose;
  readonly catcher: CharacterPose;
  readonly batter: BatterPose;
  /** 固定順 7人: 一塁・二塁・遊撃・三塁・左・中・右。 */
  readonly fielders: readonly CharacterPose[];
  /** `pulse` は到達の手がかりの発光(0〜1。ゾーン枠を黄色に寄せ、内側を薄く塗る)。 */
  readonly zone: { readonly visible: boolean; readonly grid: boolean; readonly pulse: number };
  /** 打球の落下点のリング(`position` は地面の中心、`radius` は m)。 */
  readonly landingMark: { readonly visible: boolean; readonly position: Vec3; readonly radius: number };
  /**
   * スイングカーソル。`scaleX`/`scaleY` は楕円の半径(m)で、単位円のメッシュに掛ける
   * (`radii.rx × zone.halfWidth`、`radii.ry × (zone.top − zone.bottom) / 2`)。
   */
  readonly cursor: {
    readonly visible: boolean;
    readonly position: Vec3;
    readonly scaleX: number;
    readonly scaleY: number;
    readonly flash: boolean;
  };
  /**
   * 狙いセルのハイライト。`width`/`height` は選択セルの全幅・全高(m)。
   * `position` は `cellToWorld(cell)`(セル幅はゾーン単位 2/3 × `zone.halfWidth`、高さは × ゾーン半高)。
   */
  readonly aim: {
    readonly visible: boolean;
    readonly position: Vec3;
    readonly width: number;
    readonly height: number;
  };
};
