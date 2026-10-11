import type { SwingInput } from "../types/batting";
import type { PitchCommand, PitchKind, CourseCell } from "../types/pitch";
import type { GameView } from "../types/view";
import { BattingView } from "./BattingView";
import { CommentaryLog } from "./CommentaryLog";
import { CourseGrid } from "./CourseGrid";
import { FieldDiagram } from "./FieldDiagram";
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

function TopRow({ view }: { readonly view: GameView }) {
  return (
    <div className="bb-top-row">
      <Scoreboard
        scoreboard={view.scoreboard}
        inningLabel={view.inningLabel}
        isExtra={view.isExtra}
        balls={view.balls}
        strikes={view.strikes}
        outs={view.outs}
        bases={view.bases}
      />
      <FieldDiagram marker={view.fieldMarker} geometry={view.fieldDiagram} />
    </div>
  );
}

/** 試合画面のレイアウトと配線のみ。人間守備時は `BattingView` の overlay に `CourseGrid` を渡し、`PitchingControls` を描く。 */
export function GameLayout({ view, timeScale, selection, onSelectKind, onSelectCell, onThrow, onSwing, onPitchArrived }: GameLayoutProps) {
  const pitching = view.mode === "human-pitching";
  return (
    <div className="bb-game">
      <TopRow view={view} />
      <div className="bb-main-row">
        <BattingView
          flight={view.flight}
          arriveAfterMs={view.arriveAfterMs}
          geometry={view.geometry}
          swingReady={view.swingReady}
          showCursor={view.mode === "human-batting"}
          cursorRadii={view.batter.cursorRadii}
          timeScale={timeScale}
          onSwing={onSwing}
          onPitchArrived={onPitchArrived}
          overlay={pitching ? <CourseGrid selectedCell={selection.cell} onSelectCell={onSelectCell} /> : null}
        />
        <div className="bb-side-panel">
          <MatchupPanel batter={view.batter} pitcher={view.pitcher} pitchSpeedLabel={view.pitchSpeedLabel} />
          {pitching ? (
            <PitchingControls
              ready={view.pitchReady}
              repertoire={view.pitcher.repertoire}
              selectedKind={selection.kind}
              onSelectKind={onSelectKind}
              onThrow={onThrow}
            />
          ) : null}
          <CommentaryLog lastEvent={view.lastEvent} log={view.log} />
        </div>
      </div>
    </div>
  );
}
