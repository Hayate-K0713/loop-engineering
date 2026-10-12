import type { GameStageViewProps } from "../hooks/useGameStage";
import type { SwingKind } from "../types/batting";
import type { CourseCell, PitchCommand, PitchKind } from "../types/pitch";
import type { GameView } from "../types/view";
import { CourseGrid } from "./CourseGrid";
import { NamePlates } from "./NamePlates";
import { PitchingControls } from "./PitchingControls";
import { ScoreHud } from "./ScoreHud";
import { StageView } from "./StageView";
import { SwingControls } from "./SwingControls";
import { Ticker } from "./Ticker";

type ActionBarProps = {
  /** **表示用**(保持される)view。操作バーの種類と球種の一覧に使う。操作可否は下の `pitchReady`・`swingReady` を使う。 */
  readonly view: GameView;
  /** `PitchingControls` の `ready`(最新の view に基づく。`holding` と windup 中は偽)。 */
  readonly pitchReady: boolean;
  /** `SwingControls` の `ready`(最新の view に基づく。`holding` 中は偽)。 */
  readonly swingReady: boolean;
  /** 投球の選択状態(`GameScreen` が持つ)。 */
  readonly selection: PitchCommand;
  readonly onSelectKind: (kind: PitchKind) => void;
  readonly onSelectCell: (cell: CourseCell) => void;
  readonly onThrow: () => void;
  readonly swingKind: SwingKind;
  readonly onSelectSwingKind: (kind: SwingKind) => void;
  readonly onSwing: () => void;
};

type GameLayoutProps = ActionBarProps & {
  /** `useGameStage().stageProps`。`StageView` にそのまま展開する。 */
  readonly stageProps: GameStageViewProps;
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
 * 下部の操作バー。人間打撃では `SwingControls`、人間守備では `PitchingControls` → `CourseGrid` の順に、wrapper を挟まずバーの直下へ置く
 * (守備バーの配置は CSS のサブグリッドが担う)。CPU どうしの対戦(`cpu-only`)では何も描かない。
 */
function ActionBar(props: ActionBarProps) {
  const { view, selection } = props;
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
            selectedKind={selection.kind}
            onSelectKind={props.onSelectKind}
            onThrow={props.onThrow}
          />
          <CourseGrid selectedCell={selection.cell} onSelectCell={props.onSelectCell} />
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
 */
export function GameLayout({ stageProps, ...bar }: GameLayoutProps) {
  const { view } = bar;
  return (
    <div className={`bb-game bb-game--${barVariant(view.mode)}`}>
      <StageView {...stageProps} />
      <div className="bb-overlay">
        <div className="bb-overlay__top">
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
        <div className="bb-overlay__bottom">
          <Ticker lastEvent={view.lastEvent} log={view.log} />
          <ActionBar {...bar} />
        </div>
      </div>
    </div>
  );
}
