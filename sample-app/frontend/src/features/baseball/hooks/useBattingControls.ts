import { useCallback, useRef, useState, type PointerEventHandler } from "react";
import { INITIAL_CURSOR } from "../model/batting/cursor";
import type { ViewSize } from "../model/world/camera/project";
import { usableSafeArea } from "../model/world/camera/rig";
import { clampCursorToView } from "../model/world/space/cursor-bounds";
import type { CursorRadii, SwingInput, SwingKind, SwingOrigin } from "../types/batting";
import type { ZonePoint } from "../types/common";
import type { SafeArea } from "../types/scene";
import type { ScreenRect } from "../types/stage";
import { useKeyboardInput } from "./useKeyboardInput";
import { useLatest } from "./useLatest";
import { usePointerInput, swingOriginOf, type PointerHandlers } from "./usePointerInput";

type UseBattingControlsOptions = {
  /** 人間打撃時のみ真。偽の間はポインタ・キー入力を無視する(スキップは `holding` で別に扱う)。 */
  readonly enabled: boolean;
  /** 演出中(`isHolding`)。ポインタの振り分け(スキップ優先)に使う。 */
  readonly holding: boolean;
  /** 人間がスイングできる(`GameView.swingReady`)。 */
  readonly swingReady: boolean;
  /** `GameView.batter.cursorRadii`。 */
  readonly cursorRadii: { readonly meet: CursorRadii; readonly power: CursorRadii };
  /** `usePitchFlight` の `getSwingAtMs`。スイングの判定時刻 `atMs`(入力イベントの時刻と遅延補正から求める)に使う。 */
  readonly getSwingAtMs: (origin: SwingOrigin | null) => number;
  /** `usePitchFlight` の `holdArrivalFor`。タップ候補の指がある間、到達通知を保留する。 */
  readonly holdArrivalFor: (ms: number) => void;
  /** `usePitchFlight` の `releaseArrival`。 */
  readonly releaseArrival: () => void;
  readonly onSwing: (input: SwingInput) => void;
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

/** director が毎フレーム読むカーソルの表示用データ(ゾーン座標と、現在のスイング種別の半径)。 */
export type CursorView = {
  readonly point: ZonePoint;
  readonly radii: CursorRadii;
};

export type BattingControls = {
  /** 現在のカーソル位置(ゾーン座標)。 */
  readonly getCursor: () => ZonePoint;
  /** 現在のカーソル位置と、`swingKind` に応じた半径。director が毎フレーム呼ぶ getter(安定した関数)。 */
  readonly getCursorView: () => CursorView;
  readonly swingKind: SwingKind;
  readonly setSwingKind: (kind: SwingKind) => void;
  /** `swingKind` に応じたカーソル半径。 */
  readonly currentRadii: CursorRadii;
  /**
   * スイングする(`swingReady` が偽なら何もしない)。`origin` = 入力イベントの時刻情報(省略時は現在時刻から求める)、
   * `cursorAtDown` = 振るカーソル位置(省略時は現在のカーソル位置)。
   */
  readonly swingNow: (origin?: SwingOrigin, cursorAtDown?: ZonePoint) => void;
  /** 「スイング」ボタンの pointerdown 用。イベントの時刻(`nativeEvent.timeStamp`)と入力種別(タッチ/マウス)から `swingNow` を呼ぶ。 */
  readonly swingFromButton: PointerEventHandler<HTMLButtonElement>;
  /** ステージの入力面(`bb-stage__input`)に展開するポインタ4ハンドラ。 */
  readonly pointerHandlers: PointerHandlers;
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

/**
 * 打撃操作(ポインタ・キーボード・ボタン)の合成。スイング種別(`swingKind`、初期 `"meet"`)の state もここに持つ。
 * カーソル位置は ref(`INITIAL_CURSOR` から開始)に保持し、描画は director が `getCursorView()` を毎フレーム読んで `SceneFrame` に載せる
 * (DOM を直接更新しない)。ポインタは入力面の div に展開する。カーソルの移動は `moveCursorTo` で画面内に制限する(`clampCursorToView`)。
 */
export function useBattingControls(options: UseBattingControlsOptions): BattingControls {
  const { enabled, holding, swingReady, cursorRadii, onSkip, pickZone, getZoneRect, holdArrivalFor, releaseArrival } = options;
  const [swingKind, setSwingKind] = useState<SwingKind>("meet");
  const latest = useLatest({ ...options, swingKind });
  const positionRef = useRef<ZonePoint>(INITIAL_CURSOR);

  const getCursor = useCallback((): ZonePoint => positionRef.current, []);
  const moveCursorTo = useCallback(
    (point: ZonePoint): void => {
      positionRef.current = clampToView(point, latest.current);
    },
    [latest],
  );

  const getCursorView = useCallback((): CursorView => {
    const current = latest.current;
    return { point: positionRef.current, radii: current.swingKind === "meet" ? current.cursorRadii.meet : current.cursorRadii.power };
  }, [latest]);

  const swingNow = useCallback(
    (origin?: SwingOrigin, cursorAtDown?: ZonePoint): void => {
      const current = latest.current;
      if (!current.swingReady) {
        return;
      }
      current.onSwing({ kind: current.swingKind, cursor: cursorAtDown ?? positionRef.current, atMs: current.getSwingAtMs(origin ?? null) });
    },
    [latest],
  );

  const swingFromButton = useCallback<PointerEventHandler<HTMLButtonElement>>((event) => swingNow(swingOriginOf(event)), [swingNow]);

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
    holdArrivalFor,
    releaseArrival,
  });
  useKeyboardInput({ enabled, swingReady, getCursor, moveCursorTo, onSwing: swingNow, onSelectSwingKind: setSwingKind });

  const currentRadii = swingKind === "meet" ? cursorRadii.meet : cursorRadii.power;
  return { getCursor, getCursorView, swingKind, setSwingKind, currentRadii, swingNow, swingFromButton, pointerHandlers };
}
