import type { PitchKind } from "../types/pitch";
import type { PitchArrow } from "../types/view";

/** 球種チップ 1 つ分の表示データ(`GameView.pitcher.repertoire` の要素)。 */
export type PitchChip = {
  readonly kind: PitchKind;
  readonly label: string;
  /** 球速(km/h。整数)。 */
  readonly speedKmh: number;
  /** 曲がり矢印(`none` = まっすぐ)。 */
  readonly arrow: PitchArrow;
};

type PitchKindButtonsProps = {
  readonly repertoire: readonly PitchChip[];
  readonly selectedKind: PitchKind;
  readonly onSelectKind: (kind: PitchKind) => void;
};

/** 曲がり矢印の記号(`none` は「まっすぐ」を示す上向き)。 */
export function arrowGlyph(arrow: PitchArrow): string {
  switch (arrow) {
    case "right":
      return "→";
    case "left":
      return "←";
    case "down":
      return "↓";
    case "right-down":
      return "↘";
    case "left-down":
      return "↙";
    default:
      return "↑";
  }
}

/** 曲がり矢印の読み上げ用の言葉(チップの `aria-label` に使う)。 */
export function arrowWords(arrow: PitchArrow): string {
  switch (arrow) {
    case "right":
      return "右に曲がる";
    case "left":
      return "左に曲がる";
    case "down":
      return "落ちる";
    case "right-down":
      return "右下に曲がる";
    case "left-down":
      return "左下に曲がる";
    default:
      return "まっすぐ";
  }
}

/** チップの読み上げ文言(例: 「スライダー 132キロ 右下に曲がる」)。 */
export function chipAriaLabel(chip: PitchChip): string {
  return `${chip.label} ${chip.speedKmh}キロ ${arrowWords(chip.arrow)}`;
}

/**
 * 球種チップ(制御コンポーネント。球種名・球速・曲がり矢印を 2 行で出す。76×52px 以下で、44px 以上)。
 * 選択中は `aria-pressed="true"`。投球の途中でも常に選べる。
 */
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
          aria-label={chipAriaLabel(item)}
          onClick={() => onSelectKind(item.kind)}
        >
          <span className="bb-pitch-kind__label">{item.label}</span>
          <span className="bb-pitch-kind__meta" aria-hidden="true">
            {item.speedKmh}km/h<span className="bb-pitch-kind__arrow">{arrowGlyph(item.arrow)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
