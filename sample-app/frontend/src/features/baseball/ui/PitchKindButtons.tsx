import type { PitchKind } from "../types/pitch";

type PitchKindButtonsProps = {
  readonly repertoire: readonly { readonly kind: PitchKind; readonly label: string }[];
  readonly selectedKind: PitchKind;
  readonly onSelectKind: (kind: PitchKind) => void;
};

/** 球種ボタン(制御コンポーネント)。選択中は `aria-pressed="true"`。 */
export function PitchKindButtons({ repertoire, selectedKind, onSelectKind }: PitchKindButtonsProps) {
  return (
    <div className="bb-pitch-kinds" role="group" aria-label="球種">
      {repertoire.map((item) => (
        <button
          key={item.kind}
          type="button"
          className="bb-toggle bb-pitch-kind"
          data-testid={`pitch-kind-${item.kind}`}
          aria-pressed={selectedKind === item.kind}
          onClick={() => onSelectKind(item.kind)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
