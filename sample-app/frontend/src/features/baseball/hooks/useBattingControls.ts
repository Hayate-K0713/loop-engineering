import { useCallback, useRef, useState } from "react";
import { INITIAL_CURSOR } from "../model/batting/cursor";
import type { CursorRadii, SwingInput, SwingKind } from "../types/batting";
import type { ZonePoint } from "../types/common";
import type { ScreenRect } from "../types/stage";
import { useKeyboardInput } from "./useKeyboardInput";
import { useLatest } from "./useLatest";
import { usePointerInput, type PointerHandlers } from "./usePointerInput";

type UseBattingControlsOptions = {
  /** 人間打撃時のみ真。偽の間はポインタ・キー入力を無視する(スキップは `holding` で別に扱う)。 */
  readonly enabled: boolean;
  /** 演出中(`isHolding`)。ポインタの振り分け(スキップ優先)に使う。 */
  readonly holding: boolean;
  /** 人間がスイングできる(`GameView.swingReady`)。 */
  readonly swingReady: boolean;
  /** `GameView.batter.cursorRadii`。 */
  readonly cursorRadii: { readonly meet: CursorRadii; readonly power: CursorRadii };
  /** `usePitchFlight` の `getElapsedMs`。スイング時刻(投球開始からの経過ゲーム時間)の算出に使う。 */
  readonly getElapsedMs: () => number;
  readonly onSwing: (input: SwingInput) => void;
  /** 演出のスキップ(director の `skip`)。 */
  readonly onSkip: () => void;
  /** 画面座標(client)→ゾーン座標(`useStage3d`)。 */
  readonly pickZone: (clientX: number, clientY: number) => ZonePoint | null;
  /** 打撃カメラでのゾーン枠の画面矩形(`useStage3d`)。 */
  readonly getZoneRect: () => ScreenRect | null;
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
  /** 現在のカーソル位置・スイング種別でスイングする(「スイング」ボタンの pointerdown 用。`swingReady` が偽なら何もしない)。 */
  readonly swingNow: () => void;
  /** ステージの入力面(`bb-stage__input`)に展開するポインタ4ハンドラ。 */
  readonly pointerHandlers: PointerHandlers;
};

/**
 * 打撃操作(ポインタ・キーボード・ボタン)の合成。スイング種別(`swingKind`、初期 `"meet"`)の state もここに持つ。
 * カーソル位置は ref(`INITIAL_CURSOR` から開始)に保持し、描画は director が `getCursorView()` を毎フレーム読んで `SceneFrame` に載せる
 * (DOM を直接更新しない)。ポインタは入力面の div に展開する。
 */
export function useBattingControls(options: UseBattingControlsOptions): BattingControls {
  const { enabled, holding, swingReady, cursorRadii, onSkip, pickZone, getZoneRect } = options;
  const [swingKind, setSwingKind] = useState<SwingKind>("meet");
  const latest = useLatest({ ...options, swingKind });
  const positionRef = useRef<ZonePoint>(INITIAL_CURSOR);

  const getCursor = useCallback((): ZonePoint => positionRef.current, []);
  const moveCursorTo = useCallback((point: ZonePoint): void => {
    positionRef.current = point;
  }, []);

  const getCursorView = useCallback((): CursorView => {
    const current = latest.current;
    return { point: positionRef.current, radii: current.swingKind === "meet" ? current.cursorRadii.meet : current.cursorRadii.power };
  }, [latest]);

  const swingNow = useCallback((): void => {
    const current = latest.current;
    if (!current.swingReady) {
      return;
    }
    current.onSwing({ kind: current.swingKind, cursor: positionRef.current, atMs: current.getElapsedMs() });
  }, [latest]);

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
  });
  useKeyboardInput({ enabled, swingReady, getCursor, moveCursorTo, onSwing: swingNow, onSelectSwingKind: setSwingKind });

  const currentRadii = swingKind === "meet" ? cursorRadii.meet : cursorRadii.power;
  return { getCursor, getCursorView, swingKind, setSwingKind, currentRadii, swingNow, pointerHandlers };
}
