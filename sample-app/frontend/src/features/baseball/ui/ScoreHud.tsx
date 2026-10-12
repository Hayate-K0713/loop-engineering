import type { Side } from "../types/common";
import type { Bases } from "../types/game";
import type { GameView, ScoreRowView, ScoreboardView } from "../types/view";
import { BaseDiamond } from "./BaseDiamond";
import { CountLamps } from "./CountLamps";
import { LineScore } from "./LineScore";

type TeamColors = GameView["teamColors"];

/** 24bit RGB の数値を CSS の色(`#rrggbb`)にする。 */
function toCssColor(rgb: number): string {
  return `#${rgb.toString(16).padStart(6, "0")}`;
}

function colorOf(teamColors: TeamColors, side: Side): string {
  return toCssColor(side === "away" ? teamColors.away : teamColors.home);
}

type HudTeamProps = {
  readonly row: ScoreRowView;
  readonly color: string;
};

/** 1チームの行(チーム色チップ+略称+得点)。略称の `aria-label` に正式名を持たせる。 */
function HudTeam({ row, color }: HudTeamProps) {
  return (
    <div className="bb-hud__team" data-side={row.side}>
      <span className="bb-hud__chip" style={{ backgroundColor: color }} aria-hidden="true" />
      <span className="bb-hud__abbr" aria-label={row.teamName} title={row.teamName}>
        {row.shortName}
      </span>
      <span className="bb-hud__score" data-testid={`score-${row.side}`}>
        {row.runs}
      </span>
    </div>
  );
}

type ScoreHudProps = {
  readonly scoreboard: ScoreboardView;
  readonly teamColors: TeamColors;
  readonly inningLabel: string;
  readonly isExtra: boolean;
  readonly balls: number;
  readonly strikes: number;
  readonly outs: number;
  readonly bases: Bases;
};

/**
 * 左上の HUD(放送画面風のスコア表示)。回表裏・走者ダイヤモンド・両チームの得点・B/S/O・回別得点の開閉を持つ。
 * props のみで描き、hooks を呼ばない。ルートは操作を受けない(タップはステージへ届く)。回別の `details` だけが操作できる。
 */
export function ScoreHud({ scoreboard, teamColors, inningLabel, isExtra, balls, strikes, outs, bases }: ScoreHudProps) {
  return (
    <section className="bb-hud" data-testid="scoreboard" aria-label="スコアボード">
      <div className="bb-hud__head">
        <p className="bb-hud__inning" data-testid="inning-label">
          {inningLabel}
        </p>
        {isExtra ? <span className="bb-hud__extra">延長</span> : null}
      </div>
      <BaseDiamond bases={bases} />
      <div className="bb-hud__teams">
        {scoreboard.rows.map((row) => (
          <HudTeam key={row.side} row={row} color={colorOf(teamColors, row.side)} />
        ))}
      </div>
      <div className="bb-hud__foot">
        <CountLamps balls={balls} strikes={strikes} outs={outs} />
      </div>
      <details className="bb-hud__more">
        <summary className="bb-hud__more-summary" data-testid="line-score-toggle">
          回別
        </summary>
        <div className="bb-hud__linescore">
          <LineScore scoreboard={scoreboard} />
        </div>
      </details>
    </section>
  );
}
