import type { MouseEvent, PointerEventHandler } from "react";
import type { SwingKind } from "../types/batting";

const SWING_KINDS: readonly { readonly kind: SwingKind; readonly label: string }[] = [
  { kind: "meet", label: "ミート(Z)" },
  { kind: "power", label: "強振(X)" },
];

type SwingControlsProps = {
  readonly ready: boolean;
  readonly swingKind: SwingKind;
  readonly onSelectSwingKind: (kind: SwingKind) => void;
  /** pointerdown のハンドラ。イベントの `timeStamp`・`pointerType` から判定時刻と遅延補正の種別を求めるため、イベントごと受け取る。 */
  readonly onSwing: PointerEventHandler<HTMLButtonElement>;
};

/** 長押しのメニューを出さない(スイングボタンを押し続けたときに、メニューが出て pointercancel になるのを防ぐ)。 */
function suppressContextMenu(event: MouseEvent<HTMLElement>): void {
  event.preventDefault();
}

/**
 * スイング操作(スイングボタンとミート/強振の切替)。
 * スイングは pointerdown で受ける(click は pointerup 時点になりタイミングが遅れるため)。キーボード操作は hooks 側(Space/Enter)が担う。
 * スイングボタンは 80px(CSS。`.bb-swing .bb-swing__button`)。切替ボタンも含め、押せる大きさは 44px 以上。
 */
export function SwingControls({ ready, swingKind, onSelectSwingKind, onSwing }: SwingControlsProps) {
  return (
    <div className="bb-swing" role="group" aria-label="スイング操作">
      <div className="bb-swing__kinds">
        {SWING_KINDS.map((item) => (
          <button
            key={item.kind}
            type="button"
            className="bb-toggle bb-swing__kind"
            data-testid={`swing-kind-${item.kind}`}
            aria-pressed={swingKind === item.kind}
            onClick={() => onSelectSwingKind(item.kind)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="bb-button bb-button--primary bb-swing__button"
        data-testid="swing-button"
        disabled={!ready}
        onPointerDown={onSwing}
        onContextMenu={suppressContextMenu}
      >
        スイング
      </button>
    </div>
  );
}
