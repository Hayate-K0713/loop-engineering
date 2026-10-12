import type { SwingInput } from "../types/batting";
import type { PitchCommand, PitchKind, CourseCell } from "../types/pitch";
import type { GameView } from "../types/view";
import { CommentaryLog } from "./CommentaryLog";
import { CourseGrid } from "./CourseGrid";
import { MatchupPanel } from "./MatchupPanel";
import { PitchingControls } from "./PitchingControls";
import { Scoreboard } from "./Scoreboard";

type GameLayoutProps = {
  readonly view: GameView;
  readonly timeScale: number;
  /** 投球の選択状態(`GameScreen` が持つ)。 */
  readonly selection: PitchCommand;
  readonly onSelectKind: (kind: PitchKind) => void;
  readonly onSelectCell: (cell: CourseCell) => void;
  readonly onThrow: () => void;
  readonly onSwing: (input: SwingInput) => void;
  readonly onPitchArrived: () => void;
};

/**
 * 暫定レイアウト(ステップ A2〜E の間のみ)。旧 3D 化前の画面(ステージ・`SwingControls`)は描かず、
 * `Scoreboard`・`MatchupPanel`・(人間守備のとき)`PitchingControls`→`CourseGrid`・`CommentaryLog` を縦に並べるだけで、
 * この間は試合が進行しない。props 型は `GameScreen` を変えないため現行のまま(使わない props は分割代入しない)。ステップ E で最終形に置き換える。
 */
export function GameLayout({ view, selection, onSelectKind, onSelectCell, onThrow }: GameLayoutProps) {
  const pitching = view.mode === "human-pitching";
  return (
    <div className="bb-game">
      <Scoreboard
        scoreboard={view.scoreboard}
        inningLabel={view.inningLabel}
        isExtra={view.isExtra}
        balls={view.balls}
        strikes={view.strikes}
        outs={view.outs}
        bases={view.bases}
      />
      <MatchupPanel batter={view.batter} pitcher={view.pitcher} pitchSpeedLabel={view.pitchSpeedLabel} />
      {pitching ? (
        <>
          <PitchingControls
            ready={view.pitchReady}
            repertoire={view.pitcher.repertoire}
            selectedKind={selection.kind}
            onSelectKind={onSelectKind}
            onThrow={onThrow}
          />
          <CourseGrid selectedCell={selection.cell} onSelectCell={onSelectCell} />
        </>
      ) : null}
      <CommentaryLog lastEvent={view.lastEvent} log={view.log} />
    </div>
  );
}
