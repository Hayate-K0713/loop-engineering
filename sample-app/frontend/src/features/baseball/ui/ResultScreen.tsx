import type { ResultView } from "../types/view";

type ResultScreenProps = {
  readonly result: ResultView;
  readonly onRestart: () => void;
  readonly onBackToTitle: () => void;
};

/** 得点の多い側(強調表示用)。同点なら `none`。 */
function leaderOf(result: ResultView): "away" | "home" | "none" {
  if (result.awayRuns === result.homeRuns) {
    return "none";
  }
  return result.awayRuns > result.homeRuns ? "away" : "home";
}

type TeamScoreProps = {
  readonly label: string;
  readonly runs: number;
  readonly testId: string;
};

function TeamScore({ label, runs, testId }: TeamScoreProps) {
  return (
    <span className="bb-result__team">
      <span className="bb-result__label">{label}</span>
      <span className="bb-result__runs" data-testid={testId}>
        {runs}
      </span>
    </span>
  );
}

/** 試合結果。`GameLayout` に重ねる全面オーバーレイ(背後の試合画面は CSS でぼかす)。 */
export function ResultScreen({ result, onRestart, onBackToTitle }: ResultScreenProps) {
  return (
    <div className="bb-result" data-testid="result-screen" role="dialog" aria-modal="true" aria-labelledby="bb-result-headline">
      <div className="bb-result__panel" data-outcome={result.humanOutcome ?? "none"}>
        <div className="bb-result__card">
          <p className="bb-result__kicker">試合終了</p>
          <h2 id="bb-result-headline" className="bb-result__headline" data-testid="result-text">
            {result.headline}
          </h2>
          <p className="bb-result__score" data-leader={leaderOf(result)}>
            <TeamScore label="先攻" runs={result.awayRuns} testId="final-score-away" />
            <span className="bb-result__vs" aria-hidden="true">
              -
            </span>
            <TeamScore label="後攻" runs={result.homeRuns} testId="final-score-home" />
          </p>
          <div className="bb-result__actions">
            <button type="button" className="bb-button bb-button--primary bb-result__restart" data-testid="restart-game" autoFocus onClick={onRestart}>
              もう一度
            </button>
            <button type="button" className="bb-button bb-result__back" data-testid="back-to-title" onClick={onBackToTitle}>
              タイトルへ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
