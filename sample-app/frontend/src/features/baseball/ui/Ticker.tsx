import type { LogEntry } from "../types/game";

type TickerProps = {
  readonly lastEvent: string;
  readonly log: readonly LogEntry[];
};

/**
 * 下部の実況ティッカー。最新の実況を1〜2行で出し、右端の「ログ」から全ログ(新しい順)を上へ開く。
 * ルートは操作を受けない(タップはステージへ届く)。ログの開閉だけが操作できる。
 */
export function Ticker({ lastEvent, log }: TickerProps) {
  // log は追記専用で、seq は 1 回の判定で追記した複数行が共有する(一意でない)。
  // key には並べ替え前(古い順)の位置を使う。新しい行が増えても既存行の key は変わらず、再マウントされない。
  const newestFirst = log.map((entry, position) => ({ entry, position })).reverse();
  return (
    <section className="bb-ticker" data-testid="ticker" aria-label="実況">
      <p className="bb-ticker__line" data-testid="last-event" aria-live="polite">
        {lastEvent}
      </p>
      <details className="bb-ticker__more">
        <summary className="bb-ticker__summary" data-testid="log-toggle">
          ログ
        </summary>
        <ol className="bb-ticker__log" data-testid="commentary-log">
          {newestFirst.map(({ entry, position }) => (
            <li key={position} className="bb-ticker__item">
              {entry.text}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
