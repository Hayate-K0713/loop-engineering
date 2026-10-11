import type { GameView } from "../types/view";

type MatchupPanelProps = {
  readonly batter: GameView["batter"];
  readonly pitcher: GameView["pitcher"];
  readonly pitchSpeedLabel: string;
};

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** 打者・投手の情報(球数・スタミナ・球速)。 */
export function MatchupPanel({ batter, pitcher, pitchSpeedLabel }: MatchupPanelProps) {
  const stamina = clampPercent(pitcher.staminaPercent);
  return (
    <section className="bb-matchup" aria-label="対戦情報">
      <dl className="bb-matchup__list">
        <div className="bb-matchup__row">
          <dt>打者</dt>
          <dd data-testid="batter-name">{`${batter.orderLabel} ${batter.name}`}</dd>
        </div>
        <div className="bb-matchup__row">
          <dt>投手</dt>
          <dd data-testid="pitcher-name">{pitcher.name}</dd>
        </div>
        <div className="bb-matchup__row">
          <dt>球数</dt>
          <dd data-testid="pitch-count">{pitcher.pitchCount}</dd>
        </div>
        <div className="bb-matchup__row">
          <dt>スタミナ</dt>
          <dd>
            <span data-testid="pitcher-stamina">{`${stamina}%`}</span>
            <span className="bb-stamina" aria-hidden="true">
              <span className="bb-stamina__bar" style={{ width: `${stamina}%` }} />
            </span>
          </dd>
        </div>
        <div className="bb-matchup__row">
          <dt>球速</dt>
          <dd data-testid="pitch-speed">{pitchSpeedLabel}</dd>
        </div>
      </dl>
    </section>
  );
}
