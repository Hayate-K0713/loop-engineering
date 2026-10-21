import type { Side } from "../types/common";
import type { Difficulty, GameConfig, Innings } from "../types/game";

type Option<T> = { readonly value: T; readonly label: string };

// 選択肢は ui 側の定数として持つ(ui は model を import しない)。
const INNINGS_OPTIONS: readonly Option<Innings>[] = [
  { value: 1, label: "1回" },
  { value: 3, label: "3回" },
  { value: 5, label: "5回" },
  { value: 9, label: "9回" },
];

const SIDE_OPTIONS: readonly Option<Side>[] = [
  { value: "away", label: "先攻(表)" },
  { value: "home", label: "後攻(裏)" },
];

const DIFFICULTY_OPTIONS: readonly Option<Difficulty>[] = [
  { value: "easy", label: "かんたん" },
  { value: "normal", label: "ふつう" },
  { value: "hard", label: "むずかしい" },
];

function readString(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function pickOption<T extends string | number>(options: readonly Option<T>[], raw: string, fallback: T): T {
  return options.find((option) => String(option.value) === raw)?.value ?? fallback;
}

function readConfig(form: FormData, defaultInnings: Innings): GameConfig {
  return {
    innings: pickOption(INNINGS_OPTIONS, readString(form, "innings"), defaultInnings),
    humanSide: pickOption(SIDE_OPTIONS, readString(form, "side"), "away"),
    difficulty: pickOption(DIFFICULTY_OPTIONS, readString(form, "difficulty"), "normal"),
  };
}

type ChoiceFieldProps<T extends string | number> = {
  readonly name: string;
  readonly legend: string;
  readonly testId: string;
  readonly options: readonly Option<T>[];
  readonly defaultValue: T;
};

/** ボタンに見せたラジオ群。`input[type=radio]` は視覚的に隠し、`label` の中の面(`bb-choice__text`)が選択状態を表す。 */
function ChoiceField<T extends string | number>({ name, legend, testId, options, defaultValue }: ChoiceFieldProps<T>) {
  return (
    <fieldset className="bb-choice" data-testid={testId}>
      <legend className="bb-choice__legend">{legend}</legend>
      <div className="bb-choice__options">
        {options.map((option) => (
          <label key={option.value} className="bb-choice__option" data-testid={`${testId}-${option.value}`}>
            <input className="bb-choice__input" type="radio" name={name} value={option.value} defaultChecked={option.value === defaultValue} />
            <span className="bb-choice__text">{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

type TitleScreenProps = {
  readonly defaultInnings: Innings;
  readonly onStart: (config: GameConfig) => void;
};

/** 試合設定のタイトル画面。非制御フォーム(state を持たず、送信時に FormData を読む)。背景の球場は CSS だけで描く。 */
export function TitleScreen({ defaultInnings, onStart }: TitleScreenProps) {
  return (
    <section className="bb-title-screen" data-testid="baseball-title" aria-label="試合設定">
      <div className="bb-title__body">
        <p className="bb-logo" aria-hidden="true">
          <span className="bb-logo__sub">ブラウザ</span>
          <span className="bb-logo__main">野球</span>
        </p>
        <div className="bb-title__panel">
          <form
            className="bb-title__form"
            onSubmit={(event) => {
              event.preventDefault();
              onStart(readConfig(new FormData(event.currentTarget), defaultInnings));
            }}
          >
            <ChoiceField name="innings" legend="イニング数" testId="setting-innings" options={INNINGS_OPTIONS} defaultValue={defaultInnings} />
            <ChoiceField name="side" legend="攻守" testId="setting-side" options={SIDE_OPTIONS} defaultValue="away" />
            <ChoiceField name="difficulty" legend="難易度" testId="setting-difficulty" options={DIFFICULTY_OPTIONS} defaultValue="normal" />
            <button type="submit" className="bb-start" data-testid="start-game">
              試合開始
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
