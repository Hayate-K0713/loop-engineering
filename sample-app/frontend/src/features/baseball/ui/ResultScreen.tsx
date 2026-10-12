import { useRef, type KeyboardEvent } from "react";
import type { Side } from "../types/common";
import type { ResultView } from "../types/view";

/** 結果画面に出す1チームの表示データ(`color` は `#rrggbb`、`name` は略称の `aria-label`・`title` に使う正式名)。 */
export type ResultTeam = {
  readonly shortName: string;
  readonly name: string;
  readonly color: string;
};

export type ResultTeams = Readonly<Record<Side, ResultTeam>>;

type ResultScreenProps = {
  readonly result: ResultView;
  readonly teams: ResultTeams;
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
  readonly side: Side;
  readonly team: ResultTeam;
  readonly runs: number;
  readonly testId: string;
};

/** 1チームの得点(チーム色チップ+略称+「先攻/後攻」の小さな添え字+大きな得点)。ScoreHud と同じ表現で、略称の `aria-label` に正式名を持たせる。 */
function TeamScore({ side, team, runs, testId }: TeamScoreProps) {
  return (
    <span className="bb-result__team" data-side={side}>
      <span className="bb-result__badge">
        <span className="bb-result__chip" style={{ backgroundColor: team.color }} aria-hidden="true" />
        <span className="bb-result__abbr" aria-label={team.name} title={team.name}>
          {team.shortName}
        </span>
      </span>
      <span className="bb-result__order">{side === "away" ? "先攻" : "後攻"}</span>
      <span className="bb-result__runs" data-testid={testId}>
        {runs}
      </span>
    </span>
  );
}

const SPACE = " ";

type HeldKeyGuard = {
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  readonly onKeyUp: (event: KeyboardEvent<HTMLElement>) => void;
};

/**
 * 結果画面が出る前から押されていた Enter/Space(最後の演出のスキップに使ったキーの長押し)が、`autoFocus` された「もう一度」を押さないようにする。
 * スキップの keydown は結果画面が出る前に window で消費されるので、その後の repeat の keydown と keyup が、フォーカスされたボタンに届いてしまう。
 * - keydown: Enter/Space の長押しの repeat(`event.repeat`)は `preventDefault()` する(Enter はこの keydown の既定動作でクリックになり、
 *   Space は repeat の keydown でボタンが押下状態になって keyup でクリックになる)。
 * - keyup: Space は keyup の既定動作でクリックになる。この画面で Space の keydown を見ていない keyup は、画面が出る前から押されていたキーなので
 *   `preventDefault()` する(ブラウザによっては、別の要素への keydown のあとでフォーカスが移ったボタンが、その keyup でクリックされる)。
 * 画面が出たあとに押し始めたキーは、最初の keydown(repeat でない)と対の keyup が通るので、通常どおりボタンを押せる。
 */
function useHeldKeyGuard(): HeldKeyGuard {
  const spaceDownSeen = useRef(false);
  return {
    onKeyDown: (event) => {
      if (event.key !== "Enter" && event.key !== SPACE) {
        return;
      }
      if (event.repeat) {
        event.preventDefault();
      } else if (event.key === SPACE) {
        spaceDownSeen.current = true;
      }
    },
    onKeyUp: (event) => {
      if (event.key !== SPACE) {
        return;
      }
      if (!spaceDownSeen.current) {
        event.preventDefault();
      }
      spaceDownSeen.current = false;
    },
  };
}

/** 試合結果。`GameLayout` に重ねる全面オーバーレイ(背後の試合画面は CSS でぼかす)。 */
export function ResultScreen({ result, teams, onRestart, onBackToTitle }: ResultScreenProps) {
  const heldKeyGuard = useHeldKeyGuard();
  return (
    <div
      className="bb-result"
      data-testid="result-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bb-result-headline"
      onKeyDown={heldKeyGuard.onKeyDown}
      onKeyUp={heldKeyGuard.onKeyUp}
    >
      <div className="bb-result__panel" data-outcome={result.humanOutcome ?? "none"}>
        <div className="bb-result__card">
          <p className="bb-result__kicker">試合終了</p>
          <h2 id="bb-result-headline" className="bb-result__headline" data-testid="result-text">
            {result.headline}
          </h2>
          <p className="bb-result__score" data-leader={leaderOf(result)}>
            <TeamScore side="away" team={teams.away} runs={result.awayRuns} testId="final-score-away" />
            <span className="bb-result__vs" aria-hidden="true">
              -
            </span>
            <TeamScore side="home" team={teams.home} runs={result.homeRuns} testId="final-score-home" />
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
