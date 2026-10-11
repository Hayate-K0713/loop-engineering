import type { SwingKind } from "../types/batting";

const SWING_KINDS: readonly { readonly kind: SwingKind; readonly label: string }[] = [
  { kind: "meet", label: "ミート(Z)" },
  { kind: "power", label: "強振(X)" },
];

type SwingControlsProps = {
  readonly ready: boolean;
  readonly swingKind: SwingKind;
  readonly onSelectSwingKind: (kind: SwingKind) => void;
  readonly onSwing: () => void;
};

/**
 * スイング操作(スイングボタンとミート/強振の切替)。
 * スイングは pointerdown で受ける(click は pointerup 時点になりタイミングが遅れるため)。キーボード操作は hooks 側(Space/Enter)が担う。
 */
export function SwingControls({ ready, swingKind, onSelectSwingKind, onSwing }: SwingControlsProps) {
  return (
    <div className="bb-swing" role="group" aria-label="スイング操作">
      <div className="bb-swing__kinds">
        {SWING_KINDS.map((item) => (
          <button
            key={item.kind}
            type="button"
            className="bb-toggle"
            data-testid={`swing-kind-${item.kind}`}
            aria-pressed={swingKind === item.kind}
            onClick={() => onSelectSwingKind(item.kind)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <button type="button" className="bb-button bb-button--primary bb-swing__button" data-testid="swing-button" disabled={!ready} onPointerDown={onSwing}>
        スイング
      </button>
    </div>
  );
}
