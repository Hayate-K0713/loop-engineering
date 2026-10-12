import type { ScoreRowView, ScoreboardView } from "../types/view";

function LineScoreRow({ row }: { readonly row: ScoreRowView }) {
  return (
    <tr data-side={row.side}>
      <th scope="row" className="bb-line-score__team">
        {row.teamName}
      </th>
      {row.cells.map((cell, index) => (
        <td key={index}>{cell}</td>
      ))}
      <td className="bb-line-score__total" data-testid={`line-score-runs-${row.side}`}>
        {row.runs}
      </td>
      <td>{row.hits}</td>
      <td>{row.errors}</td>
    </tr>
  );
}

type LineScoreProps = {
  readonly scoreboard: ScoreboardView;
};

/** 回別得点の表。 */
export function LineScore({ scoreboard }: LineScoreProps) {
  const innings = Array.from({ length: scoreboard.columns }, (_, index) => index + 1);
  return (
    <div className="bb-line-score-wrap">
      <table className="bb-line-score" data-testid="line-score">
        <thead>
          <tr>
            <th scope="col" className="bb-line-score__team">
              チーム
            </th>
            {innings.map((inning) => (
              <th key={inning} scope="col">
                {inning}
              </th>
            ))}
            <th scope="col" className="bb-line-score__total">
              R
            </th>
            <th scope="col">H</th>
            <th scope="col">E</th>
          </tr>
        </thead>
        <tbody>
          {scoreboard.rows.map((row) => (
            <LineScoreRow key={row.side} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
