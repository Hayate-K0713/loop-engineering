import type { LogEntry } from "../types/game";

type CommentaryLogProps = {
  readonly lastEvent: string;
  readonly log: readonly LogEntry[];
};

/** 実況。最新イベントのバナーと、新しい順のログ。 */
export function CommentaryLog({ lastEvent, log }: CommentaryLogProps) {
  // log は追記専用で、seq は 1 回の判定で追記した複数行が共有する(一意でない)。
  // key には並べ替え前(古い順)の位置を使う。新しい行が増えても既存行の key は変わらず、再マウントされない。
  const newestFirst = log.map((entry, position) => ({ entry, position })).reverse();
  return (
    <section className="bb-commentary" aria-live="polite" aria-label="実況">
      <p className="bb-last-event" data-testid="last-event">
        {lastEvent}
      </p>
      <ol className="bb-log" data-testid="commentary-log">
        {newestFirst.map(({ entry, position }) => (
          <li key={position} className="bb-log__item">
            {entry.text}
          </li>
        ))}
      </ol>
    </section>
  );
}
