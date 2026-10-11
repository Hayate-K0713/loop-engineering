import { useState } from "react";
import { useCpuTurn } from "../hooks/useCpuTurn";
import { useGame } from "../hooks/useGame";
import type { GameConfig, PlaybackSpeed } from "../types/game";
import type { CourseCell, PitchCommand, PitchKind } from "../types/pitch";
import { GameLayout } from "./GameLayout";
import { ResultScreen } from "./ResultScreen";

// 投球の初期選択はストレート+中央(2,2)。選択は投球後も保持する。
const INITIAL_SELECTION: PitchCommand = { kind: "straight", cell: { col: 2, row: 2 } };

type GameScreenProps = {
  readonly config: GameConfig;
  readonly seed: number;
  readonly speed: PlaybackSpeed;
  readonly onRestart: () => void;
  readonly onBackToTitle: () => void;
};

/**
 * 1試合分の画面。`useGame`・`useCpuTurn` を結線し、人間守備時の投球の選択状態 `{ kind, cell }` を持つ。
 * 試合が終わると `view.result` があるので `ResultScreen` を重ねる(「もう一度」は親が `key` を変えて再マウントする)。
 */
export function GameScreen({ config, seed, speed, onRestart, onBackToTitle }: GameScreenProps) {
  const { view, throwPitch, swing, cpuPitch, pitchArrived } = useGame(config, seed);
  const [selection, setSelection] = useState<PitchCommand>(INITIAL_SELECTION);
  useCpuTurn({ cpuPitchPending: view.cpuPitchPending, turnKey: view.turnKey, cpuWaitMs: speed.cpuWaitMs, onCpuPitch: cpuPitch });

  const selectKind = (kind: PitchKind): void => setSelection((current) => ({ ...current, kind }));
  const selectCell = (cell: CourseCell): void => setSelection((current) => ({ ...current, cell }));

  return (
    <>
      <GameLayout
        view={view}
        timeScale={speed.timeScale}
        selection={selection}
        onSelectKind={selectKind}
        onSelectCell={selectCell}
        onThrow={() => throwPitch(selection)}
        onSwing={swing}
        onPitchArrived={pitchArrived}
      />
      {view.result === null ? null : <ResultScreen result={view.result} onRestart={onRestart} onBackToTitle={onBackToTitle} />}
    </>
  );
}
