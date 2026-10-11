import { useEffect, useRef } from "react";
import { moveCursor, type CursorDirection } from "../model/batting/cursor";
import type { SwingKind } from "../types/batting";
import type { ZonePoint } from "../types/common";
import { useAnimationFrame, type FrameResult } from "./useAnimationFrame";
import { useLatest } from "./useLatest";

type UseKeyboardInputOptions = {
  /** 人間打撃時のみ真。偽の間はキー入力を無視する(リスナも付けない)。 */
  readonly enabled: boolean;
  /** 人間がスイングできる(`GameView.swingReady`)。Space/Enter はこれが真のときだけ有効。 */
  readonly swingReady: boolean;
  readonly getCursor: () => ZonePoint;
  readonly moveCursorTo: (point: ZonePoint) => void;
  /** 現在のカーソル位置でスイングする。 */
  readonly onSwing: () => void;
  readonly onSelectSwingKind: (kind: SwingKind) => void;
};

/** 正規化済み(小文字)の `KeyboardEvent.key` → カーソル移動方向(y は上が正)。 */
const DIRECTION_KEYS: ReadonlyMap<string, CursorDirection> = new Map([
  ["arrowup", { x: 0, y: 1 }],
  ["w", { x: 0, y: 1 }],
  ["arrowdown", { x: 0, y: -1 }],
  ["s", { x: 0, y: -1 }],
  ["arrowleft", { x: -1, y: 0 }],
  ["a", { x: -1, y: 0 }],
  ["arrowright", { x: 1, y: 0 }],
  ["d", { x: 1, y: 0 }],
]);

const SWING_KEYS: ReadonlySet<string> = new Set([" ", "enter"]);

const SWING_KIND_KEYS: ReadonlyMap<string, SwingKind> = new Map([
  ["z", "meet"],
  ["x", "power"],
]);

function normalizeKey(key: string): string {
  return key.toLowerCase();
}

/** 押下中のキーから移動方向を合成する(逆向き同士は打ち消し、同方向の重複は1に丸める)。 */
function directionOf(pressed: ReadonlySet<string>): CursorDirection {
  let x = 0;
  let y = 0;
  for (const key of pressed) {
    const direction = DIRECTION_KEYS.get(key);
    x += direction?.x ?? 0;
    y += direction?.y ?? 0;
  }
  return { x: Math.sign(x), y: Math.sign(y) };
}

/**
 * Space/Enter。`swingReady` のときだけスイングし、そのときだけ `preventDefault` する
 * (フォーカス中のボタンの click と二重発火させない。`swingReady` でなければ何もしないので「投げる」「もう一度」等はキーボードで押せる)。
 * `event.repeat` ではスイングしない。
 */
function handleSwingKey(event: KeyboardEvent, options: UseKeyboardInputOptions): void {
  if (!options.swingReady) {
    return;
  }
  event.preventDefault();
  if (!event.repeat) {
    options.onSwing();
  }
}

function handleKeyDown(event: KeyboardEvent, options: UseKeyboardInputOptions, pressed: Set<string>): void {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }
  const key = normalizeKey(event.key);
  if (DIRECTION_KEYS.has(key)) {
    pressed.add(key);
    if (key.startsWith("arrow")) {
      // 矢印キーでページがスクロールしないようにする(カーソル操作中のみ)。
      event.preventDefault();
    }
    return;
  }
  if (SWING_KEYS.has(key)) {
    handleSwingKey(event, options);
    return;
  }
  const swingKind = SWING_KIND_KEYS.get(key);
  if (swingKind !== undefined) {
    options.onSelectSwingKind(swingKind);
  }
}

/**
 * キーボード操作。矢印/WASD で押下中は毎フレームカーソルを動かし、Space/Enter でスイング、Z/X でミート/強振を切り替える。
 * `enabled` の間だけ window にリスナを付け、cleanup で解除する。ウィンドウがフォーカスを失ったら押下状態を捨てる(keyup の取りこぼし対策)。
 */
export function useKeyboardInput(options: UseKeyboardInputOptions): void {
  const { enabled } = options;
  const latest = useLatest(options);
  const pressedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const pressed = pressedRef.current;
    const onKeyDown = (event: KeyboardEvent): void => handleKeyDown(event, latest.current, pressed);
    const onKeyUp = (event: KeyboardEvent): void => {
      pressed.delete(normalizeKey(event.key));
    };
    const onBlur = (): void => pressed.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      pressed.clear();
    };
  }, [enabled, latest]);

  useAnimationFrame(
    (_nowMs, deltaMs): FrameResult => {
      const direction = directionOf(pressedRef.current);
      if (direction.x !== 0 || direction.y !== 0) {
        const { getCursor, moveCursorTo } = latest.current;
        moveCursorTo(moveCursor(getCursor(), direction, deltaMs));
      }
      return "continue";
    },
    enabled ? "keyboard" : null,
  );
}
