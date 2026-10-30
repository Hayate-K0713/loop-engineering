import { useCallback, useEffect, useRef, useState, type PointerEventHandler, type RefObject } from "react";
import { assistFor, lockOnCursor, type LockOn } from "../model/batting/assist";
import { INITIAL_CURSOR } from "../model/batting/cursor";
import type { ViewSize } from "../model/world/camera/project";
import { usableSafeArea } from "../model/world/camera/rig";
import { clampCursorToView } from "../model/world/space/cursor-bounds";
import type { AssistParams, CursorRadii, IgnoredInputReason, SwingInput, SwingKind, SwingMeta, SwingOrigin } from "../types/batting";
import type { ZonePoint } from "../types/common";
import type { Difficulty } from "../types/game";
import type { PitchFlight } from "../types/pitch";
import type { SafeArea } from "../types/scene";
import type { ScreenRect } from "../types/stage";
import { useKeyboardInput } from "./useKeyboardInput";
import { useLatest } from "./useLatest";
import { usePointerInput, swingOriginOf, type PointerHandlers, type SwingDetail } from "./usePointerInput";

type UseBattingControlsOptions = {
  /** 人間打撃時のみ真。偽の間はポインタ・キー入力を無視する(スキップは `holding` で別に扱う)。 */
  readonly enabled: boolean;
  /** 演出中(`isHolding`)。ポインタの振り分け(スキップ優先)と、スイング後の有効カーソルの表示の固定に使う。 */
  readonly holding: boolean;
  /** 人間がスイングできる(`GameView.swingReady`)。 */
  readonly swingReady: boolean;
  /** `GameView.batter.cursorRadii`。 */
  readonly cursorRadii: { readonly meet: CursorRadii; readonly power: CursorRadii };
  /** `GameView.difficulty`。ロックオン(`assistFor`)の強さを決める。 */
  readonly difficulty: Difficulty;
  /** 飛行中の球(`GameView.flight`)。着弾点(ロックオンの引き寄せ先)と飛行時間(進行度の分母)に使う。`null`(投球前・スイング後)の間は引き寄せない。 */
  readonly flight: PitchFlight | null;
  /** `usePitchFlight` の `getElapsedMs`。表示用の有効カーソルの進行度(現在時刻)に使う。 */
  readonly getElapsedMs: () => number;
  /** `usePitchFlight` の `getElapsedAtMs`。スイングの有効カーソルの進行度(**入力イベントの時刻**。遅延補正は引かない)に使う。 */
  readonly getElapsedAtMs: (origin: SwingOrigin | null) => number;
  /** `usePitchFlight` の `getSwingAtMs`。スイングの判定時刻 `atMs`(入力イベントの時刻と遅延補正から求める)に使う。 */
  readonly getSwingAtMs: (origin: SwingOrigin | null) => number;
  /** `usePitchFlight` の `holdArrivalFor`。タップ候補の指がある間、到達通知を保留する。 */
  readonly holdArrivalFor: (ms: number) => void;
  /** `usePitchFlight` の `releaseArrival`。 */
  readonly releaseArrival: () => void;
  /** スイング。`input.cursor` は有効カーソル(ロックオン後)、`meta` は試遊ログ用の付随情報(判定には使わない)。 */
  readonly onSwing: (input: SwingInput, meta: SwingMeta) => void;
  /** 押したのにスイングにならなかった理由(タッチの離し・pointercancel。ヒントと試遊ログ用)。 */
  readonly onIgnoredInput?: (reason: IgnoredInputReason) => void;
  /** pointercancel を受けた(試遊ログ用)。 */
  readonly onPointerCancel?: () => void;
  /** 演出のスキップ(director の `skip`)。 */
  readonly onSkip: () => void;
  /** 画面座標(client)→ゾーン座標(`useStage3d`)。 */
  readonly pickZone: (clientX: number, clientY: number) => ZonePoint | null;
  /** 打撃カメラでのゾーン枠の画面矩形(`useStage3d`)。 */
  readonly getZoneRect: () => ScreenRect | null;
  /** ステージの現在のサイズ(CSS px。`useStage3d` の `getViewSize`)。カーソルを画面内に収める制限に使う。ステージが無ければ `null`。 */
  readonly getViewSize: () => ViewSize | null;
  /** 空き領域(`useSafeArea` の `getSafeArea`)。カーソルを下のオーバーレイの上に収める制限に使う。測れなければ `null`(既定の空き領域)。 */
  readonly getSafeArea: () => SafeArea | null;
};

/**
 * director が毎フレーム読むカーソルの表示用データ。
 * `point` = **有効カーソル**(ロックオン後。判定と同じ位置)、`raw` = 指で動かした素のカーソル、`k` = 引き寄せ量(0〜1)、`radii` = 現在のスイング種別の半径。
 */
export type CursorView = {
  readonly point: ZonePoint;
  readonly raw: ZonePoint;
  readonly k: number;
  readonly radii: CursorRadii;
};

export type BattingControls = {
  /** 現在の**素の**カーソル位置(ゾーン座標。ロックオン前)。 */
  readonly getCursor: () => ZonePoint;
  /** 現在の有効カーソル・素のカーソル・引き寄せ量と、`swingKind` に応じた半径。director が毎フレーム呼ぶ getter(安定した関数)。 */
  readonly getCursorView: () => CursorView;
  readonly swingKind: SwingKind;
  readonly setSwingKind: (kind: SwingKind) => void;
  /** `swingKind` に応じたカーソル半径。 */
  readonly currentRadii: CursorRadii;
  /**
   * スイングする(`swingReady` が偽なら何もしない)。`origin` = 入力イベントの時刻情報(省略時は現在時刻から求める)、
   * `cursorAtDown` = 振る**素の**カーソル位置(省略時は現在のカーソル位置。ロックオンはこの位置と `origin` の時刻の進行度に適用する)、
   * `detail` = 入力の種類とタップの計測値(省略時はスイングボタン扱い)。
   */
  readonly swingNow: (origin?: SwingOrigin, cursorAtDown?: ZonePoint, detail?: SwingDetail) => void;
  /** 「スイング」ボタンの pointerdown 用。イベントの時刻(`nativeEvent.timeStamp`)と入力種別(タッチ/マウス)から `swingNow` を呼ぶ。 */
  readonly swingFromButton: PointerEventHandler<HTMLButtonElement>;
  /** ステージの入力面(`bb-stage__input`)に展開するポインタ4ハンドラ。 */
  readonly pointerHandlers: PointerHandlers;
};

const BUTTON_DETAIL: SwingDetail = { source: "button", tapHoldMs: null, tapMovePx: null, fingerTravelPx: null };
const KEY_DETAIL: SwingDetail = { source: "key", tapHoldMs: null, tapMovePx: null, fingerTravelPx: null };

/**
 * 素のカーソル `raw` の、経過ゲーム時間 `elapsedMs` での有効カーソル(ロックオン。純関数)。進行度は `elapsedMs / flight.durationMs`(`lockOnCursor` が 0〜1 に丸める)。
 * 投球が無い(`flight` が `null`)・飛行時間が正でないときは引き寄せない(素のカーソルのまま・k = 0)。
 * **タップのスイングでは、`elapsedMs` に離した時刻ではなく押下の時刻を渡す**(押下時に表示されていた有効カーソルと、判定に使うカーソルを一致させる)。
 */
export function effectiveCursorAt(assist: AssistParams, flight: PitchFlight | null, raw: ZonePoint, elapsedMs: number): LockOn {
  if (flight === null || !Number.isFinite(flight.durationMs) || flight.durationMs <= 0) {
    return { cursor: raw, k: 0 };
  }
  return lockOnCursor(assist, raw, flight.landing, elapsedMs / flight.durationMs);
}

/** スイングの付随情報(試遊ログ用)を組み立てる。`origin` が無い(プログラムからの呼び出し)ときの押下時刻は現在時刻。 */
function swingMetaOf(origin: SwingOrigin | undefined, raw: ZonePoint, lock: LockOn, detail: SwingDetail): SwingMeta {
  return { ...detail, pressTimeStamp: origin?.timeStamp ?? performance.now(), raw, effective: lock.cursor, assistK: lock.k };
}

/** スイング直後の表示用の固定(有効カーソルが素のカーソルへ戻って見えないように、演出中は振ったときの値を見せる)。 */
type SwungCursor = {
  readonly raw: ZonePoint;
  readonly cursor: ZonePoint;
  readonly k: number;
};

/** 空き領域の下端(ステージ上端からの CSS px)。測れない・無効(非有限・帯が狭すぎる)ときは、カメラの構図と同じ既定の空き領域(打撃)を使う(`usableSafeArea`)。 */
function freeBottomPxOf(safeArea: SafeArea | null, stageHeightPx: number): number {
  return usableSafeArea("batting", safeArea).bottom * stageHeightPx;
}

/** カーソルを画面内(左右の端から `edgeMarginPx`、下は空き領域の下端)に収める。ゾーン矩形かステージのサイズが無ければ変えない。 */
function clampToView(point: ZonePoint, options: UseBattingControlsOptions): ZonePoint {
  const zoneRect = options.getZoneRect();
  const size = options.getViewSize();
  if (zoneRect === null || size === null) {
    return point;
  }
  return clampCursorToView(point, zoneRect, size.width, freeBottomPxOf(options.getSafeArea(), size.height));
}

type LatestOptions = RefObject<UseBattingControlsOptions & { readonly swingKind: SwingKind }>;

type LockOnControls = Pick<BattingControls, "getCursorView" | "swingNow" | "swingFromButton"> & {
  readonly swingFromKey: (origin: SwingOrigin) => void;
};

/**
 * ロックオンの適用: 表示用の有効カーソル(`getCursorView`。現在時刻の進行度)と、スイング(`swingNow`。入力イベントの時刻の進行度)。
 * 振った後の演出中は、振ったときの値を見せ続ける(有効カーソルが素のカーソルへ戻って見えないように。次の投球で捨てる)。
 */
function useLockOn(latest: LatestOptions, positionRef: RefObject<ZonePoint>, flightSeq: number | null): LockOnControls {
  const swungRef = useRef<SwungCursor | null>(null);

  useEffect(() => {
    if (flightSeq !== null) {
      swungRef.current = null;
    }
  }, [flightSeq]);

  const getCursorView = useCallback((): CursorView => {
    const current = latest.current;
    const radii = current.swingKind === "meet" ? current.cursorRadii.meet : current.cursorRadii.power;
    const swung = swungRef.current;
    if (current.holding && swung !== null) {
      return { point: swung.cursor, raw: swung.raw, k: swung.k, radii };
    }
    const raw = positionRef.current;
    const lock = effectiveCursorAt(assistFor(current.difficulty), current.flight, raw, current.getElapsedMs());
    return { point: lock.cursor, raw, k: lock.k, radii };
  }, [latest, positionRef]);

  const swingNow = useCallback(
    (origin?: SwingOrigin, cursorAtDown?: ZonePoint, detail: SwingDetail = BUTTON_DETAIL): void => {
      const current = latest.current;
      if (!current.swingReady) {
        return;
      }
      const eventOrigin = origin ?? null;
      const raw = cursorAtDown ?? positionRef.current;
      const lock = effectiveCursorAt(assistFor(current.difficulty), current.flight, raw, current.getElapsedAtMs(eventOrigin));
      swungRef.current = { raw, cursor: lock.cursor, k: lock.k };
      current.onSwing(
        { kind: current.swingKind, cursor: lock.cursor, atMs: current.getSwingAtMs(eventOrigin), assistK: lock.k },
        swingMetaOf(origin, raw, lock, detail),
      );
    },
    [latest, positionRef],
  );

  const swingFromButton = useCallback<PointerEventHandler<HTMLButtonElement>>((event) => swingNow(swingOriginOf(event), undefined, BUTTON_DETAIL), [swingNow]);
  const swingFromKey = useCallback((origin: SwingOrigin): void => swingNow(origin, undefined, KEY_DETAIL), [swingNow]);
  return { getCursorView, swingNow, swingFromButton, swingFromKey };
}

/**
 * 打撃操作(ポインタ・キーボード・ボタン)の合成。スイング種別(`swingKind`、初期 `"meet"`)の state もここに持つ。
 * 素のカーソル位置は ref(`INITIAL_CURSOR` から開始)に保持し、描画は director が `getCursorView()` を毎フレーム読んで `SceneFrame` に載せる
 * (DOM を直接更新しない)。ポインタは入力面の div に展開する。カーソルの移動は `moveCursorTo` で画面内に制限する(`clampCursorToView`)。
 * スイングの `SwingInput.cursor`/`assistK` は、素のカーソルに**入力イベントの時刻の進行度**でロックオン(`effectiveCursorAt`)を適用して作る
 * (表示する有効カーソルと判定に使うカーソルを一致させる。タップは押下の時刻)。
 */
export function useBattingControls(options: UseBattingControlsOptions): BattingControls {
  const { enabled, holding, swingReady, cursorRadii, onSkip, pickZone, getZoneRect, holdArrivalFor, releaseArrival } = options;
  const [swingKind, setSwingKind] = useState<SwingKind>("meet");
  const latest = useLatest({ ...options, swingKind });
  const positionRef = useRef<ZonePoint>(INITIAL_CURSOR);
  const { getCursorView, swingNow, swingFromButton, swingFromKey } = useLockOn(latest, positionRef, options.flight === null ? null : options.flight.seq);

  const getCursor = useCallback((): ZonePoint => positionRef.current, []);
  const moveCursorTo = useCallback(
    (point: ZonePoint): void => {
      positionRef.current = clampToView(point, latest.current);
    },
    [latest],
  );

  const reportIgnored = useCallback((reason: IgnoredInputReason): void => latest.current.onIgnoredInput?.(reason), [latest]);
  const reportPointerCancel = useCallback((): void => latest.current.onPointerCancel?.(), [latest]);

  const pointerHandlers = usePointerInput({
    enabled,
    holding,
    swingReady,
    onSkip,
    pickZone,
    getZoneRect,
    getCursor,
    moveCursorTo,
    onSwing: swingNow,
    onIgnored: reportIgnored,
    onPointerCancel: reportPointerCancel,
    holdArrivalFor,
    releaseArrival,
  });
  useKeyboardInput({ enabled, swingReady, getCursor, moveCursorTo, onSwing: swingFromKey, onSelectSwingKind: setSwingKind });

  const currentRadii = swingKind === "meet" ? cursorRadii.meet : cursorRadii.power;
  return { getCursor, getCursorView, swingKind, setSwingKind, currentRadii, swingNow, swingFromButton, pointerHandlers };
}
