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

type SelectFieldProps<T extends string | number> = {
  readonly name: string;
  readonly label: string;
  readonly testId: string;
  readonly options: readonly Option<T>[];
  readonly defaultValue: T;
};

function SelectField<T extends string | number>({ name, label, testId, options, defaultValue }: SelectFieldProps<T>) {
  return (
    <label className="bb-form-field">
      <span className="bb-form-field__label">{label}</span>
      <select className="bb-select" name={name} defaultValue={String(defaultValue)} data-testid={testId}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

type TitleScreenProps = {
  readonly defaultInnings: Innings;
  readonly onStart: (config: GameConfig) => void;
};

/** 試合設定のタイトル画面。非制御フォーム(state を持たず、送信時に FormData を読む)。 */
export function TitleScreen({ defaultInnings, onStart }: TitleScreenProps) {
  return (
    <section className="bb-title" data-testid="baseball-title">
      <h2 className="bb-title__heading">試合設定</h2>
      <form
        className="bb-title__form"
        onSubmit={(event) => {
          event.preventDefault();
          onStart(readConfig(new FormData(event.currentTarget), defaultInnings));
        }}
      >
        <SelectField name="innings" label="イニング数" testId="setting-innings" options={INNINGS_OPTIONS} defaultValue={defaultInnings} />
        <SelectField name="side" label="攻守" testId="setting-side" options={SIDE_OPTIONS} defaultValue="away" />
        <SelectField name="difficulty" label="難易度" testId="setting-difficulty" options={DIFFICULTY_OPTIONS} defaultValue="normal" />
        <button type="submit" className="bb-button bb-button--primary" data-testid="start-game">
          試合開始
        </button>
      </form>
    </section>
  );
}
