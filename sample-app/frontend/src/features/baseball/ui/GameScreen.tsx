import { useState } from "react";
import { useGame } from "../hooks/useGame";
import { useGameStage } from "../hooks/useGameStage";
import type { Side } from "../types/common";
import type { GameConfig, PlaybackSpeed } from "../types/game";
import type { CourseCell, PitchCommand, PitchKind } from "../types/pitch";
import type { GameView, ScoreRowView } from "../types/view";
import { GameLayout } from "./GameLayout";
import { ResultScreen, type ResultTeam, type ResultTeams } from "./ResultScreen";

// 投球の初期選択はストレート+中央(2,2)。選択は投球後も保持する。
const INITIAL_SELECTION: PitchCommand = { kind: "straight", cell: { col: 2, row: 2 } };

/** 24bit RGB の数値を CSS の色(`#rrggbb`)にする(ScoreHud のチップと同じ変換)。 */
function toCssColor(rgb: number): string {
  return `#${rgb.toString(16).padStart(6, "0")}`;
}

/** 得点欄の1行(略称・正式名)とチーム色(24bit RGB)から、結果画面に出す1チーム分を作る。 */
function resultTeamOf(row: ScoreRowView | undefined, rgb: number): ResultTeam {
  return { shortName: row?.shortName ?? "", name: row?.teamName ?? "", color: toCssColor(rgb) };
}

/** 表示用 view の得点欄とチーム色(サイド別)から、結果画面に出す両チーム分を作る。 */
function resultTeamsOf(view: GameView): ResultTeams {
  const rowOf = (side: Side): ScoreRowView | undefined => view.scoreboard.rows.find((row) => row.side === side);
  return { away: resultTeamOf(rowOf("away"), view.teamColors.away), home: resultTeamOf(rowOf("home"), view.teamColors.home) };
}

type GameScreenProps = {
  readonly config: GameConfig;
  readonly seed: number;
  readonly speed: PlaybackSpeed;
  readonly onRestart: () => void;
  readonly onBackToTitle: () => void;
};

/**
 * 1試合分の画面。`useGame`(試合の状態)と `useGameStage`(3D ステージ・演出・入力・CPU の手番)を結線し、人間守備時の投球の選択状態 `{ kind, cell }` を持つ。
 * 試合が終わると `view.result` があるが、`ResultScreen` は最後の演出が終わってから重ねる(「もう一度」は親が `key` を変えて再マウントする)。
 * `stage.view` は演出が終わるまで更新されない表示用の view。操作の可否は `stage.pitchReady`・`stage.swingReady` を使う。
 */
export function GameScreen({ config, seed, speed, onRestart, onBackToTitle }: GameScreenProps) {
  const game = useGame(config, seed);
  const [selection, setSelection] = useState<PitchCommand>(INITIAL_SELECTION);
  const stage = useGameStage({ game, speed, selection });
  const { view, holding } = stage;

  const selectKind = (kind: PitchKind): void => setSelection((current) => ({ ...current, kind }));
  const selectCell = (cell: CourseCell): void => setSelection((current) => ({ ...current, cell }));

  return (
    <>
      <GameLayout
        view={view}
        pitchReady={stage.pitchReady}
        swingReady={stage.swingReady}
        selection={selection}
        onSelectKind={selectKind}
        onSelectCell={selectCell}
        onThrow={stage.onThrow}
        swingKind={stage.swingKind}
        onSelectSwingKind={stage.setSwingKind}
        onSwing={stage.swingNow}
        stageProps={stage.stageProps}
      />
      {view.result === null || holding ? null : (
        <ResultScreen result={view.result} teams={resultTeamsOf(view)} onRestart={onRestart} onBackToTitle={onBackToTitle} />
      )}
    </>
  );
}
