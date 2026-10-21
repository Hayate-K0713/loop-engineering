type LampRowProps = {
  readonly kind: "balls" | "strikes" | "outs";
  readonly label: string;
  readonly count: number;
  readonly max: number;
  readonly testId: string;
};

function LampRow({ kind, label, count, max, testId }: LampRowProps) {
  const lamps = Array.from({ length: max }, (_, index) => index < count);
  return (
    <div className={`bb-count__row bb-count__row--${kind}`}>
      <span className="bb-count__label" aria-hidden="true">
        {label}
      </span>
      {lamps.map((lit, index) => (
        <span key={index} className={lit ? "bb-lamp bb-lamp--on" : "bb-lamp"} aria-hidden="true" />
      ))}
      <span className="bb-visually-hidden" data-testid={testId}>
        {count}
      </span>
    </div>
  );
}

type CountLampsProps = {
  readonly balls: number;
  readonly strikes: number;
  readonly outs: number;
};

/** B・S・O のランプ。数値は testid 付きの視覚的に隠した要素にも出す(支援技術・テスト用)。 */
export function CountLamps({ balls, strikes, outs }: CountLampsProps) {
  return (
    <div className="bb-count" role="group" aria-label="カウント">
      <LampRow kind="balls" label="B" count={balls} max={3} testId="count-balls" />
      <LampRow kind="strikes" label="S" count={strikes} max={2} testId="count-strikes" />
      <LampRow kind="outs" label="O" count={outs} max={2} testId="count-outs" />
    </div>
  );
}
