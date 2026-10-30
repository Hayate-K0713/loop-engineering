// ステージ(render/)の契約。types/ は実行時コードを持たない葉で、他セグメントを import しない(DOM 型は使ってよい)。
// `createStage(options: StageOptions): StageHandle | null` は render/stage.ts が実装する。WebGL2 が取れない・
// `WebGLRenderer` の生成に失敗したときは `null` を返す(関数そのものは実行時コードなので types/ には置かない)。
import type { CameraPose, SafeArea, SceneFrame, SceneLayout, Vec3 } from "./scene";

/** 地面(XZ 平面)上の点。ワールド座標の m。 */
export type GroundPoint = {
  readonly x: number;
  readonly z: number;
};

/**
 * 球場の寸法(ワールド m)。`model/world` の `buildStageGeometry()` が `WORLD_PARAMS` と `LANDING_PARAMS` から作り、
 * `render/` はこれだけから読む(寸法を直書きしない)。値の凡例はモックの初期値(括弧内。フェンス・スタンド・屋根の半径はモックから +5)。
 * 円弧(`fence`・`stands`・`roof`・`fence.cap`)は three の `CylinderGeometry`(開口・両面)で作り、
 * 中心方向(−z)を中心に左右 `spreadRad` ずつ張る(`thetaStart = π − spreadRad`、`thetaLength = 2 × spreadRad`)。
 */
export type StageGeometry = {
  /** ストライクゾーンの実寸。`zoneToWorld` と同じ値(0.26 / 0.42 / 1.02 / 0.03)。 */
  readonly zone: {
    readonly halfWidth: number;
    readonly bottom: number;
    readonly top: number;
    /** ゾーン平面の z。 */
    readonly planeZ: number;
  };
  /** ボールの半径(0.1)。 */
  readonly ballRadius: number;
  /** 地面(縞の芝)の正方形の一辺(700)。 */
  readonly groundSize: number;
  /** 内野の土と芝。y は各面の高さ(重なりの順序を決める)。 */
  readonly infield: {
    /** 内野の土の円の半径(29)と中心 z(−18.4)・高さ(0.01)。 */
    readonly dirtRadius: number;
    readonly dirtCenterZ: number;
    readonly dirtY: number;
    /** ダイヤモンド内側の芝(45° 回した正方形)の一辺(23.5)・中心 z(−19.4)・高さ(0.02)。 */
    readonly grassSide: number;
    readonly grassCenterZ: number;
    readonly grassY: number;
    /** 本塁周りの土の円の半径(4.2)・高さ(0.03)。中心は本塁(原点)。 */
    readonly homeDirtRadius: number;
    readonly homeDirtY: number;
  };
  /** マウンド(円錐台)。`y` は中心の高さ(0.12)、`z` は中心(−18.4)。 */
  readonly mound: {
    readonly radiusTop: number;
    readonly radiusBottom: number;
    readonly height: number;
    readonly y: number;
    readonly z: number;
  };
  /** ピッチャープレート(ラバー)の箱(0.6 × 0.05 × 0.15)。`y` は中心の高さ(0.27)、`z` は中心(−18.4)。 */
  readonly rubber: {
    readonly width: number;
    readonly height: number;
    readonly depth: number;
    readonly y: number;
    readonly z: number;
  };
  /**
   * 一〜三塁。`size` は一辺(0.45)、`height` は厚み(0.08)で、45° 回した正方形の箱として置く。
   * 位置は箱の中心(`y` は 0.05)。塁間 27.4(= `LANDING_PARAMS.baseDistance`)から導き、一塁は +x 側。
   */
  readonly bases: {
    readonly size: number;
    readonly height: number;
    readonly first: Vec3;
    readonly second: Vec3;
    readonly third: Vec3;
  };
  /**
   * 本塁(五角形)。`points` は XZ 平面の頂点で、時計回りか反時計回りかは問わない。**尖りは捕手側(+z)を向く**
   * (モックは投手側向きだった。変更点)。`y` は高さ(0.04)。
   * 注意: ShapeGeometry を x 軸まわり −π/2 回して寝かせると、シェイプの y は世界の −z になる。
   */
  readonly homePlate: {
    readonly points: readonly GroundPoint[];
    readonly y: number;
  };
  /**
   * ファウルライン。細長い箱(`length` 98 × `width` 0.12 × `height` 0.02)を本塁から ±45° に置く。
   * 中心は (±`centerOffset`, `y`, −`centerOffset`)(34.6)、`y` は 0.04。右(+x)側の箱は yaw −π/4、左(−x)側は +π/4。
   */
  readonly foulLines: {
    readonly length: number;
    readonly width: number;
    readonly height: number;
    readonly y: number;
    readonly centerOffset: number;
  };
  /**
   * 打席ボックス(白い線の長方形の輪郭、左右対称)。x は本塁側の辺 `innerX`(0.45)と外側の辺 `outerX`(1.6)の絶対値、
   * z は ±`halfDepth`(0.9)、`y` は 0.05。
   */
  readonly batterBoxes: {
    readonly innerX: number;
    readonly outerX: number;
    readonly halfDepth: number;
    readonly y: number;
  };
  /**
   * 外野フェンス。`radius` は 105(= `LANDING_PARAMS.fenceRadius`。モックの 100 から変更)、`height` は 3.2、`y` は中心の高さ(1.6)、
   * `spreadRad` は片側の張り角(1.0)。`cap` は上端の帯(半径 `radius + 0.1`、高さ 0.3、中心の高さ 3.25)。
   */
  readonly fence: {
    readonly radius: number;
    readonly height: number;
    readonly y: number;
    readonly spreadRad: number;
    readonly cap: {
      readonly radius: number;
      readonly height: number;
      readonly y: number;
    };
  };
  /**
   * スタンド(円錐台の斜面)。`innerRadius` は下端の半径(109)、`outerRadius` は上端の半径(147)、`height` は 34、
   * `y` は中心の高さ(20)、`spreadRad` は片側の張り角(1.15)。ホームランの着地高さはこの斜面から求める。
   */
  readonly stands: {
    readonly innerRadius: number;
    readonly outerRadius: number;
    readonly height: number;
    readonly y: number;
    readonly spreadRad: number;
  };
  /** スタンドの屋根。半径 155、厚み 2、中心の高さ 38、`spreadRad` は 1.15。 */
  readonly roof: {
    readonly radius: number;
    readonly height: number;
    readonly y: number;
    readonly spreadRad: number;
  };
};

/** 観客席の点の配置(32 × 16 セル)。色は `render/look.ts` のパレットが `paletteIndex` から解決する。 */
export type CrowdCell = {
  readonly col: number;
  readonly row: number;
  readonly paletteIndex: number;
};

/**
 * キャラクターの関節の寸法(m、足元基準)。`world/motion/rig.ts`(データ)と `render/character.ts`(形状)が二重に持たないよう
 * `StageOptions` で render に渡す。初期値はモックの値(0.14 / 0.5 / 0.55 / 0.36 / 0.48 / 0.98 / 0.38)。
 */
export type CharacterRig = {
  /** 脚の付け根の左右位置(±)。 */
  readonly hipX: number;
  /** 脚の付け根の高さ。 */
  readonly hipY: number;
  /** 胴体の原点の高さ(足元基準)。 */
  readonly torsoY: number;
  /** 腕の付け根の左右位置(±、胴体基準)。 */
  readonly shoulderX: number;
  /** 腕の付け根の高さ(胴体基準)。 */
  readonly shoulderY: number;
  /** 頭の中心の高さ(胴体基準)。 */
  readonly headY: number;
  /** 肩から手先までの長さ。 */
  readonly armLength: number;
};

/** キャンバス左上基準の CSS px。 */
export type ScreenRect = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

export type StageStatus = "loading" | "ready" | "unsupported" | "lost";

export type StageQuality = "normal" | "low";

export type StageOptions = {
  /** canvas を追加する容器。 */
  readonly container: HTMLElement;
  readonly geometry: StageGeometry;
  readonly crowd: readonly CrowdCell[];
  readonly rig: CharacterRig;
  /**
   * 打撃カメラの姿勢を、縦横比・レイアウト・空き領域から作る関数(`model/world` の `battingCameraFor`)。
   * 初期カメラと `zoneScreenRect` の計算に使う。`safeArea` が `null` なら既定の空き領域。
   */
  readonly battingCameraFor: (aspect: number, layout: SceneLayout, safeArea: SafeArea | null) => CameraPose;
  readonly quality: StageQuality;
  readonly onStatusChange: (status: StageStatus) => void;
  /** サイズ、またはゾーン矩形(レイアウト・空き領域の変更による再計算を含む)が変わったときの通知。 */
  readonly onResize: (size: { readonly width: number; readonly height: number }) => void;
};

/** 描画負荷の実測(試遊ログ用)。`drawCalls`/`triangles` は直近の 1 フレームの `renderer.info.render`、`geometries`/`textures` は `renderer.info.memory`。 */
export type StageStats = {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
};

export type StageHandle = {
  /** 1フレーム分の状態を three に適用して描画する。 */
  apply(frame: SceneFrame): void;
  /** 描画負荷の実測。破棄後は `null`。 */
  stats(): StageStats | null;
  resize(width: number, height: number): void;
  /** 画面座標(client)から、最後に `apply` したカメラでゾーン平面に当てた点。当たらない・破棄後は `null`。 */
  pickPlane(clientX: number, clientY: number): Vec3 | null;
  /** 打撃カメラでのゾーン枠の画面矩形(中継カメラ中でも変わらない)。破棄後は `null`。 */
  zoneScreenRect(): ScreenRect | null;
  /** 冪等。破棄後は `apply`/`resize` が何もせず、通知コールバックも呼ばない。 */
  dispose(): void;
};
