import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { INITIAL_CURSOR } from "../model/batting/cursor";
import type { CursorRadii, SwingInput, SwingKind } from "../types/batting";
import type { ZonePoint } from "../types/common";
import { useKeyboardInput } from "./useKeyboardInput";
import { useLatest } from "./useLatest";
import { usePointerInput, type PointerHandlers } from "./usePointerInput";

type UseBattingControlsOptions = {
  /** 人間打撃時(`showCursor`)のみ真。偽の間はポインタ・キー入力を無視する。 */
  readonly enabled: boolean;
  /** 人間がスイングできる(`GameView.swingReady`)。 */
  readonly swingReady: boolean;
  /** `GameView.batter.cursorRadii`。 */
  readonly cursorRadii: { readonly meet: CursorRadii; readonly power: CursorRadii };
  /** `usePitchFlight` の `getElapsedMs`。スイング時刻(投球開始からの経過ゲーム時間)の算出に使う。 */
  readonly getElapsedMs: () => number;
  readonly onSwing: (input: SwingInput) => void;
};

export type BattingControls = {
  readonly svgRef: RefObject<SVGSVGElement | null>;
  readonly cursorRef: RefObject<SVGEllipseElement | null>;
  readonly swingKind: SwingKind;
  readonly setSwingKind: (kind: SwingKind) => void;
  /** `swingKind` に応じたカーソル半径。`StrikeZoneSvg` の `cursorRadii` に渡す。 */
  readonly currentRadii: CursorRadii;
  /** 現在のカーソル位置・スイング種別でスイングする(「スイング」ボタンの pointerdown 用。`swingReady` が偽なら何もしない)。 */
  readonly swingNow: () => void;
  readonly pointerHandlers: PointerHandlers;
};

function applyCursor(ellipse: SVGEllipseElement | null, point: ZonePoint): void {
  if (ellipse === null) {
    return;
  }
  ellipse.setAttribute("cx", String(point.x));
  ellipse.setAttribute("cy", String(point.y));
}

/**
 * 打撃操作(ポインタ・キーボード・ボタン)の合成。スイング種別(`swingKind`、初期 `"meet"`)の state もここに持つ。
 * カーソル位置は ref(`INITIAL_CURSOR` から開始)に保持し、SVG の楕円の `cx`/`cy`(ゾーン座標そのまま)を直接更新する。
 * 楕円は `enabled` の偽→真で再マウントされ `cx/cy` が (0, 0) に戻るため、`enabled` が変わるたびに ref の位置を再適用して、
 * 見た目とスイング時に送るカーソル位置を一致させる。
 */
export function useBattingControls(options: UseBattingControlsOptions): BattingControls {
  const { enabled, swingReady, cursorRadii } = options;
  const [swingKind, setSwingKind] = useState<SwingKind>("meet");
  const latest = useLatest({ ...options, swingKind });
  const svgRef = useRef<SVGSVGElement>(null);
  const cursorRef = useRef<SVGEllipseElement>(null);
  const positionRef = useRef<ZonePoint>(INITIAL_CURSOR);

  const getCursor = useCallback((): ZonePoint => positionRef.current, []);
  const moveCursorTo = useCallback((point: ZonePoint): void => {
    positionRef.current = point;
    applyCursor(cursorRef.current, point);
  }, []);

  useLayoutEffect(() => {
    applyCursor(cursorRef.current, positionRef.current);
  }, [enabled]);

  const swingNow = useCallback((): void => {
    const current = latest.current;
    if (!current.swingReady) {
      return;
    }
    current.onSwing({ kind: current.swingKind, cursor: positionRef.current, atMs: current.getElapsedMs() });
  }, [latest]);

  const pointerHandlers = usePointerInput({ enabled, svgRef, moveCursorTo, onSwing: swingNow });
  useKeyboardInput({ enabled, swingReady, getCursor, moveCursorTo, onSwing: swingNow, onSelectSwingKind: setSwingKind });

  const currentRadii = swingKind === "meet" ? cursorRadii.meet : cursorRadii.power;
  return { svgRef, cursorRef, swingKind, setSwingKind, currentRadii, swingNow, pointerHandlers };
}
