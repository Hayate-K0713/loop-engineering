import type { Bases } from "../types/game";
import type { ScoreboardView } from "../types/view";
import { BaseDiamond } from "./BaseDiamond";
import { CountLamps } from "./CountLamps";
import { LineScore } from "./LineScore";

type ScoreboardProps = {
  readonly scoreboard: ScoreboardView;
  readonly inningLabel: string;
  readonly isExtra: boolean;
  readonly balls: number;
  readonly strikes: number;
  readonly outs: number;
  readonly bases: Bases;
};

/** スコアボード。イニング表示・回別得点・カウント・走者を内包する(フィールド図は含まない)。 */
export function Scoreboard({ scoreboard, inningLabel, isExtra, balls, strikes, outs, bases }: ScoreboardProps) {
  return (
    <section className="bb-scoreboard" data-testid="scoreboard" aria-label="スコアボード">
      <div className="bb-scoreboard__status">
        <p className="bb-inning" data-testid="inning-label">
          {inningLabel}
        </p>
        {isExtra ? <span className="bb-extra-badge">延長</span> : null}
      </div>
      <LineScore scoreboard={scoreboard} />
      <div className="bb-scoreboard__state">
        <CountLamps balls={balls} strikes={strikes} outs={outs} />
        <BaseDiamond bases={bases} />
      </div>
    </section>
  );
}
