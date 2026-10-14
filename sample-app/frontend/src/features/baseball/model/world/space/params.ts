import type { Vec3 } from "../../../types/scene";

// 3D 演出(model/world)の定数。数値はすべて初期値で、モックの値は承認済みモックを正とする。
// 座標系: 本塁が原点、+x = 右(ライト側)、+y = 上、−z = センター方向。単位は m(時間は ms)。
// ステップ G で調整してよい値と、変更してはならない値(コメントに「固定」と書いたもの)がある。

type DeepReadonly<T> = T extends readonly (infer U)[] ? readonly DeepReadonly<U>[] : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

/** 投手(右投げ)の手先のリリース位置。固定(B2 のテストが同値を持つ)。 */
export const RELEASE_POINT: Vec3 = { x: -0.3, y: 1.65, z: -18.1 };

/** CPU 打者の `PITCH_ARRIVED` を `durationMs` より前倒しする時間(ms)。固定。 */
export const CPU_SWING_LEAD_MS = 150;

/** スイング全体の長さ(ms)と、接触姿勢に達するまでの長さ(ms)。固定。 */
const SWING_DURATION_MS = 200;
const SWING_CONTACT_MS = 132;

const PARAMS = {
  /** ゾーン実寸(固定)。`zoneToWorld(p) = (p.x × halfWidth, 中心 + p.y × 半高, planeZ)`。 */
  zone: { halfWidth: 0.26, bottom: 0.42, top: 1.02, planeZ: 0.03 },
  /** ボール半径(m)。 */
  ballRadius: 0.1,
  /** ボールの見え方。`minScreenDiameterRatio` は中継カメラ中のボールの最小表示径(表示高に対する比。844px で約 8px)。 */
  ball: { minScreenDiameterRatio: 0.0095 },
  /**
   * 投球の軌道: `pos(p) = lerp(release, landing, g(p)) + break·(pⁿ − p) + (0, 4·arcHeight·p(1−p), 0)`、`g(p) = p + speedProfile·p(1−p)`。
   * `breakExponent` = n、`bendGain` = `PitchSpec.bend`(ゾーン単位、終盤の曲がり量)をワールドへ換算するときの倍率(1.0 = 誇張なし。ゲート1の決定)、
   * `speedProfile` = 時間写像の係数(出だしを速く・到達時を遅く。0 で無効)、`arcHeight` = 放物線の頂点の持ち上げ量(m)。
   */
  pitch: { breakExponent: 2.2, bendGain: 1.0, speedProfile: 0.5, arcHeight: 0.12 },
  /** 到達後のボール。着弾点(ゾーン平面)に止め、接触なしは `max(D + holdMs, 受付時刻)` で消える(人間の見逃しは D + `lateCutoffMs`)。 */
  catch: { holdMs: 100 },
  /** 投手のフォロースルーの長さ(`t = 0` から)。実際の動きは `motion/rig.ts` の `PITCHER_FOLLOW_MS` で決まり、この値は参照されない(同値は `sequence/world-consistency.test.ts` が固定)。 */
  pitcherFollowMs: 400,
  /** 投手・捕手・打者の足元の位置と向き(yaw)・大きさ。 */
  actors: {
    pitcher: { position: { x: 0, y: 0.25, z: -18.4 }, yaw: 0, scale: 1 },
    catcher: { position: { x: 0, y: -0.25, z: 1.3 }, yaw: Math.PI, scale: 1 },
    // `portraitX` は縦長(アスペクト ≤ 0.7)での打者の x。横長は `position.x`、その間は縦横比の補間で混ぜる(z は不変)。
    batter: { position: { x: -0.8, y: 0, z: 0.05 }, portraitX: -0.65, yaw: Math.PI / 2, scale: 0.92 },
    fielderScale: 1.15,
  },
  /** 野手7人の守備位置(固定順: 一塁・二塁・遊撃・三塁・左・中・右。`FIELDER_SLOTS` が順序を決める)。 */
  fielders: {
    first: { x: 16.5, z: -23 },
    second: { x: 6, z: -32.5 },
    shortstop: { x: -7, z: -32.5 },
    third: { x: -16.5, z: -23 },
    left: { x: -38, z: -72 },
    center: { x: 0, z: -86 },
    right: { x: 38, z: -72 },
  },
  /** 野手の走行。`runFactor` は滞空時間に掛ける倍率、`stopRatio` は落下点の手前で止まる割合(落下点 × この値)。 */
  fielderRun: { runFactor: 1.15, stopRatio: 0.9 },
  /** 横長の打撃カメラ(固定)。 */
  battingCamera: { position: { x: 0, y: 1.25, z: 3.4 }, target: { x: 0, y: 1.0, z: -18 }, fovDeg: 34 },
  /** 縦長(アスペクト ≤ 0.7)の打撃・守備カメラの姿勢(両レイアウト共通)。水平半幅 tan と lift は `framing` の式が空き領域から決める。 */
  battingCameraPortrait: { position: { x: -0.25, y: 1.75, z: 2.6 }, target: { x: -0.25, y: 0.55, z: -18 } },
  /**
   * 構図。水平半幅 tan(= `tan(fov/2) × aspect`)の下限は、横長・中継カメラとも 0.37(従来の値)。
   * 縦横比の補間は `aspect ≤ portraitFullAspect` で縦長 100%、`aspect ≥ landscapeFullAspect` で横長 100%(smoothstep)。
   * `legacyLift` は横長側の従来の lift(アスペクト ≤ `fullAspect` で `value`、≥ `zeroAspect` で 0、その間は線形)。
   * `fit` は縦長の構図を空き領域に合わせて決める式の定数(`batting`/`pitching` ごとに、既定の水平半幅 tan と上限、既定の空き領域(画面高比))。
   * `marginRatio` = ゾーン/格子の下端とオーバーレイの間の余白、`headGapRatio` = HUD の下端と投手の頭の間の隙間、`minBandRatio` = 空き領域の最小の幅(これ未満は無効)。
   */
  framing: {
    landscapeMinHalfWidthTan: 0.37,
    chaseMinHalfWidthTan: 0.37,
    portraitFullAspect: 0.7,
    landscapeFullAspect: 1,
    legacyLift: { fullAspect: 0.6, zeroAspect: 1.2, value: 0.2 },
    fit: {
      batting: { defaultHalfWidthTan: 0.25, maxHalfWidthTan: 0.4 },
      pitching: { defaultHalfWidthTan: 0.38, maxHalfWidthTan: 0.65 },
      marginRatio: 0.008,
      headGapRatio: 0.019,
      minBandRatio: 0.2,
      defaultSafeArea: {
        batting: { top: 0.1837, bottom: 0.7855 },
        pitching: { top: 0.1837, bottom: 0.564 },
      },
    },
  },
  /**
   * 中継カメラ。位置 = (ball.x × kx, baseY + ball.y × ky, baseZ + ball.z × kz)、注視 = (ball.x, max(0, ball.y × kLook), ball.z)。
   * `kLook` は横長の値、`portraitKLook` は縦長(縦横比の補間で混ぜる)。
   * `positionBlendMs`/`targetBlendMs` は接触後に打撃カメラから移る時間(smoothstep)、`catcherVisibleBlend` は位置の blend がこの値以上で捕手を出す。
   */
  chaseCamera: {
    kx: 0.45,
    baseY: 16,
    ky: 0.35,
    baseZ: 22,
    kz: 0.45,
    kLook: 0.6,
    portraitKLook: 0.4,
    fovDeg: 34,
    positionBlendMs: 500,
    targetBlendMs: 250,
    catcherVisibleBlend: 0.35,
  },
  /**
   * スイング(固定)。`durationMs` 全体、`contactMs` 接触姿勢まで、`contactRatio` = その比(progress 0.66)、`minSwingMs` 接触までの最短、
   * `missOffsetMs` CPU の空振りのずれ、`followEndProgress` フォロースルーの終端の progress。
   */
  swing: {
    durationMs: SWING_DURATION_MS,
    contactMs: SWING_CONTACT_MS,
    contactRatio: SWING_CONTACT_MS / SWING_DURATION_MS,
    minSwingMs: 60,
    missOffsetMs: 70,
    followEndProgress: 1.4,
  },
  /**
   * 打球。タイプ別に、滞空 `hangBaseMs + hangPerMeterMs × 距離`、頂点の高さ `peakRatio × 距離`。
   * ゴロは `hops` 回バウンド(各区間は等時間、高さは `firstHeight` から `decay` 倍ずつ減衰)し、`dropRatio`(進行度)で接触点の高さから地面へ落ちる。
   * `contactZ` は接触点の z(ゾーン平面。打者の z との差を小さく保ち、バットとボールの奥行きをそろえる)。
   * フライ・ライナーの滞空は、追えるように延ばしてある(見かけの重力を約 1.2〜1.7G にする)。
   */
  batted: {
    fly: { hangBaseMs: 1000, hangPerMeterMs: 28, peakRatio: 0.24 },
    liner: { hangBaseMs: 600, hangPerMeterMs: 16, peakRatio: 0.08 },
    ground: { hangBaseMs: 250, hangPerMeterMs: 30, peakRatio: 0 },
    groundBounce: { hops: 3, firstHeight: 0.35, decay: 0.5, dropRatio: 0.08 },
    contactZ: 0.03,
  },
  /**
   * 落下点のリング(フライ・ライナーのみ。ホームラン・ゴロは出さない)。接触 `startAfterContactMs` 後から落下 `endAfterLandMs` 後まで、
   * 地面(高さ `y`)に出す。半径 = `max(minRadius, screenRatio × 表示高相当の長さ)`(m)。
   */
  landingMark: { startAfterContactMs: 200, endAfterLandMs: 400, y: 0.07, minRadius: 2, screenRatio: 0.03 },
  /**
   * 到達の手がかり。`zonePulse` はゾーン枠の発光: D − `leadMs` から立ち上げ、D 〜 D + `holdMs` は最大、その後 `fadeMs` かけて 0 に戻る。
   * `timingMs` はスイング後のタイミング表示(早い/ジャスト/遅い)の表示時間(ms)。
   */
  cue: { zonePulse: { leadMs: 20, holdMs: 60, fadeMs: 200 }, timingMs: 900 },
  /** 入力。`edgeMarginPx` はカーソルの中心を画面の左右端から内側に留める量(CSS px)。 */
  input: { edgeMarginPx: 8 },
  /**
   * ファウル(決定論)。`seq` の偶奇で左右、黄金比数列で種類・距離・角度を決める。
   * `backstopShare` の割合でバックネット方向(z > 0)、残りはファウルライン外側(|x| > |z|。`lineRatio` は |x| / |z|)の飛球。
   */
  foul: {
    seqStepA: 0.6180339887,
    seqStepB: 0.7548776662,
    seqStepC: 0.569840291,
    backstopShare: 0.3,
    backstopDistance: { min: 12, max: 26 },
    backstopHalfWidth: 9,
    lineDistance: { min: 30, max: 75 },
    lineRatio: { min: 1.2, max: 3 },
  },
  /** テロップの表示時間(ms)と、その後の余韻(ms)。 */
  telop: { inPlayMs: 1100, foulMs: 700, swingMissMs: 700, takeMs: 500, afterglowMs: 200 },
  /** 球場の寸法(m)。フェンス半径・塁間は `LANDING_PARAMS` から `buildStageGeometry` が導く。 */
  stadium: {
    groundSize: 700,
    dirt: { radius: 29, centerZ: -18.4, y: 0.01 },
    infieldGrass: { side: 23.5, centerZ: -19.4, y: 0.02 },
    homeDirt: { radius: 4.2, y: 0.03 },
    mound: { radiusTop: 2.6, radiusBottom: 2.9, height: 0.25, y: 0.12, z: -18.4 },
    rubber: { width: 0.6, height: 0.05, depth: 0.15, y: 0.27, z: -18.4 },
    base: { size: 0.45, height: 0.08, y: 0.05 },
    /** 本塁の五角形(尖りは捕手側 +z)。`halfWidth` 左右、`frontZ` 投手側の辺、`shoulderZ` 肩、`tipZ` 尖り。 */
    homePlate: { halfWidth: 0.22, frontZ: -0.2, shoulderZ: 0.02, tipZ: 0.22, y: 0.04 },
    foulLine: { length: 98, width: 0.12, height: 0.02, y: 0.04 },
    batterBox: { innerX: 0.45, outerX: 1.6, halfDepth: 0.9, y: 0.05 },
    fence: { height: 3.2, y: 1.6, spreadRad: 1.0, capRadiusOffset: 0.1, capHeight: 0.3, capY: 3.25 },
    stands: { innerRadius: 109, outerRadius: 147, height: 34, y: 20, spreadRad: 1.15 },
    roof: { radius: 155, height: 2, y: 38, spreadRad: 1.15 },
  },
};

type WorldParams = DeepReadonly<typeof PARAMS>;

export const WORLD_PARAMS: WorldParams = PARAMS;
