import type { PitchKind } from "../types/pitch";
import { PitchKindButtons } from "./PitchKindButtons";

type PitchingControlsProps = {
  readonly ready: boolean;
  readonly repertoire: readonly { readonly kind: PitchKind; readonly label: string }[];
  readonly selectedKind: PitchKind;
  readonly onSelectKind: (kind: PitchKind) => void;
  readonly onThrow: () => void;
};

/**
 * 投球操作(球種ボタンと「投げる」ボタン。制御コンポーネント)。
 * コースのグリッド(`CourseGrid`)は含まない(ゾーンに重ねるため `GameLayout` が別に渡す)。
 */
export function PitchingControls({ ready, repertoire, selectedKind, onSelectKind, onThrow }: PitchingControlsProps) {
  return (
    <section className="bb-pitching" data-testid="pitch-controls" data-ready={String(ready)} aria-label="投球操作">
      <PitchKindButtons repertoire={repertoire} selectedKind={selectedKind} onSelectKind={onSelectKind} />
      <button type="button" className="bb-button bb-button--primary bb-pitching__throw" data-testid="throw-pitch" disabled={!ready} onClick={onThrow}>
        投げる
      </button>
    </section>
  );
}
