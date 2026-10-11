import type { ResultView } from "../types/view";

type ResultScreenProps = {
  readonly result: ResultView;
  readonly onRestart: () => void;
  readonly onBackToTitle: () => void;
};

/** 試合結果。`GameLayout` に重ねて表示する(overlay)。 */
export function ResultScreen({ result, onRestart, onBackToTitle }: ResultScreenProps) {
  return (
    <div className="bb-result" data-testid="result-screen" role="dialog" aria-modal="true" aria-labelledby="bb-result-headline">
      <div className="bb-result__panel" data-outcome={result.humanOutcome ?? "none"}>
        <h2 id="bb-result-headline" className="bb-result__headline" data-testid="result-text">
          {result.headline}
        </h2>
        <p className="bb-final-score">
          <span>先攻</span>
          <span className="bb-final-score__value" data-testid="final-score-away">
            {result.awayRuns}
          </span>
          <span aria-hidden="true">-</span>
          <span className="bb-final-score__value" data-testid="final-score-home">
            {result.homeRuns}
          </span>
          <span>後攻</span>
        </p>
        <div className="bb-result__actions">
          <button type="button" className="bb-button bb-button--primary" data-testid="restart-game" autoFocus onClick={onRestart}>
            もう一度
          </button>
          <button type="button" className="bb-button" data-testid="back-to-title" onClick={onBackToTitle}>
            タイトルへ
          </button>
        </div>
      </div>
    </div>
  );
}
