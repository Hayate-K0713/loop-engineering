import type { PointerEventHandler, ReactNode } from "react";
import type { GameStageViewProps, PitchSelection } from "../hooks/useGameStage";
import type { ContactQuality, SwingKind } from "../types/batting";
import type { CourseCell, PitchInputPhase, PitchKind } from "../types/pitch";
import type { CharacterSlot, FaceExpression } from "../types/scene";
import type { GameView } from "../types/view";
import type { CutInDetail } from "./CutIn";
import { NamePlates } from "./NamePlates";
import { PitchingControls, type StopHandler } from "./PitchingControls";
import { ScoreHud } from "./ScoreHud";
import { StageView } from "./StageView";
import { SwingControls } from "./SwingControls";
import { Ticker } from "./Ticker";
import { ZoneFeedback } from "./ZoneFeedback";

/** 表情を渡されなかったとき(`data-expr-*` を出さない)。 */
const NO_EXPRESSIONS: Readonly<Partial<Record<CharacterSlot, FaceExpression>>> = {};

type ActionBarProps = {
  /** **表示用**(保持される)view。操作バーの種類と球種の一覧に使う。操作可否は下の `pitchReady`・`swingReady` を使う。 */
  readonly view: GameView;
  /** `PitchingControls` の `ready`(最新の view に基づく。`holding` と windup 中は偽)。 */
  readonly pitchReady: boolean;
  /** `SwingControls` の `ready`(最新の view に基づく。`holding` 中は偽)。 */
  readonly swingReady: boolean;
  /** 選択中の球種(守備の球種チップ)。省略時は `selection.kind`、それも無ければ `straight`。 */
  readonly selectedKind?: PitchKind;
  /**
   * 旧 UI の投球の選択状態(球種+コースのセル)。**暫定(B6 が結線するまでの互換用)**: `GameScreen` が段階 A の呼び出しのまま渡してきても型エラーにしないための optional。
   * 使うのは `kind` だけで、`cell` は使わない(コース選択の格子は無い)。B6 で `GameScreen` から削除し、`selectedKind` に置き換える。
   */
  readonly selection?: PitchSelection;
  readonly onSelectKind: (kind: PitchKind) => void;
  /** **暫定(互換用・未使用)**: 旧格子のセル選択。B6 で `GameScreen` の呼び出しから削除する。 */
  readonly onSelectCell?: (cell: CourseCell) => void;
  /** 守備の操作ボタンの「投げる」(待機・狙い中)。 */
  readonly onThrow: () => void;
  /** 守備の操作ボタンの「とめる!」(ゲージ中。pointerdown で呼ぶ)。省略時は `onThrow`。 */
  readonly onStop?: StopHandler;
  readonly swingKind: SwingKind;
  readonly onSelectSwingKind: (kind: SwingKind) => void;
  /** スイングボタンの pointerdown ハンドラ(`SwingControls` の `onSwing`)。 */
  readonly onSwing: PointerEventHandler<HTMLButtonElement>;
};

type GameLayoutProps = ActionBarProps & {
  /** `useGameStage().stageProps`。`StageView` にそのまま展開する。`zoneFeedback`・`zoneRect` は `ZoneFeedback` にも使う。 */
  readonly stageProps: GameStageViewProps;
  /** タイミングのピルの 2 行目(接触の質)。省略・`null` ならピルは 1 行。`StageView` へそのまま渡す。 */
  readonly contactQuality?: ContactQuality | null;
  /** 投手・打者などの今の表情(`StageView` の `data-expr-*`。E2E・手動確認用)。省略なら属性を出さない。 */
  readonly expressions?: Readonly<Partial<Record<CharacterSlot, FaceExpression>>>;
  /** ワイプの帯の補足(背番号・役割ラベル)。省略・`null` なら名前の 1 行だけ。 */
  readonly cutInDetail?: CutInDetail | null;
  /** 説明(チュートリアル)のカード(`<Tutorial>`)。表示中だけ渡す。試合画面の全面に重なる。 */
  readonly tutorial?: ReactNode;
  /** 試遊ログの画面(`<PlaytestPanel>`)。開いている間だけ渡す。試合画面の全面に重なる。 */
  readonly playtest?: ReactNode;
};

/** 試合画面のルートに付ける、操作バーの種類(`bb-game--batting`/`--pitching`/`--cpu`)。 */
function barVariant(mode: GameView["mode"]): "batting" | "pitching" | "cpu" {
  switch (mode) {
    case "human-batting":
      return "batting";
    case "human-pitching":
      return "pitching";
    default:
      return "cpu";
  }
}

/**
 * 下部の操作バー。人間打撃では `SwingControls`、人間守備では `PitchingControls`(球種チップ+操作ボタンの 1 行)を置く。
 * CPU どうしの対戦(`cpu-only`)では何も描かない。`inputState` は守備の投球入力の状態(`stageProps.inputState`)。
 */
function ActionBar(props: ActionBarProps & { readonly inputState: PitchInputPhase | null }) {
  const { view } = props;
  switch (view.mode) {
    case "human-batting":
      return (
        <div className="bb-bar bb-bar--swing" data-testid="action-bar">
          <SwingControls ready={props.swingReady} swingKind={props.swingKind} onSelectSwingKind={props.onSelectSwingKind} onSwing={props.onSwing} />
        </div>
      );
    case "human-pitching":
      return (
        <div className="bb-bar bb-bar--pitch" data-testid="action-bar">
          <PitchingControls
            ready={props.pitchReady}
            repertoire={view.pitcher.repertoire}
            selectedKind={props.selectedKind ?? props.selection?.kind ?? "straight"}
            onSelectKind={props.onSelectKind}
            inputState={props.inputState}
            onThrow={props.onThrow}
            onStop={props.onStop}
          />
        </div>
      );
    default:
      return null;
  }
}

/**
 * 試合画面の配線(ステージ全面+オーバーレイ)。`StageView` を全面に置き、その上の `bb-overlay` に
 * 左上の `ScoreHud`・右上の `NamePlates`・下部の `Ticker` と操作バーを重ねる。判断は持たず、渡された値を並べるだけ。
 * `ScoreHud`・`NamePlates`・`Ticker` は表示用(保持される)view で描くので、演出が終わるまでスコアや実況は更新されない。
 * 位置ずれのミニ図(`ZoneFeedback`)はステージとオーバーレイの間に重ね(操作は受けない)、説明のカード(`tutorial`)と試遊ログの画面(`playtest`)は
 * オーバーレイの上に全面で重ねる(渡されたときだけ)。
 */
export function GameLayout({ stageProps, contactQuality, expressions, cutInDetail, tutorial, playtest, ...bar }: GameLayoutProps) {
  const { view } = bar;
  return (
    <div className={`bb-game bb-game--${barVariant(view.mode)}`} data-safe-area-root>
      <StageView {...stageProps} contactQuality={contactQuality ?? null} expressions={expressions ?? NO_EXPRESSIONS} cutInDetail={cutInDetail ?? null} />
      <ZoneFeedback feedback={stageProps.zoneFeedback} zoneRect={stageProps.zoneRect} />
      <div className="bb-overlay">
        <div className="bb-overlay__top" data-inset="top">
          <ScoreHud
            scoreboard={view.scoreboard}
            teamColors={view.teamColors}
            inningLabel={view.inningLabel}
            isExtra={view.isExtra}
            balls={view.balls}
            strikes={view.strikes}
            outs={view.outs}
            bases={view.bases}
          />
          <NamePlates batter={view.batter} pitcher={view.pitcher} pitchSpeedLabel={view.pitchSpeedLabel} />
        </div>
        <div className="bb-overlay__bottom" data-inset="bottom">
          <Ticker lastEvent={view.lastEvent} log={view.log} />
          <ActionBar {...bar} inputState={stageProps.inputState?.phase ?? null} />
        </div>
      </div>
      {tutorial}
      {playtest}
    </div>
  );
}
