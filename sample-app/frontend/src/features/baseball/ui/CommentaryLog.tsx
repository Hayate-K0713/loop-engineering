import type { LogEntry } from "../types/game";

type CommentaryLogProps = {
  readonly lastEvent: string;
  readonly log: readonly LogEntry[];
};

/** 実況。最新イベントのバナーと、新しい順のログ。 */
export function CommentaryLog({ lastEvent, log }: CommentaryLogProps) {
  const newestFirst = [...log].reverse();
  return (
    <section className="bb-commentary" aria-live="polite" aria-label="実況">
      <p className="bb-last-event" data-testid="last-event">
        {lastEvent}
      </p>
      <ol className="bb-log" data-testid="commentary-log">
        {newestFirst.map((entry, index) => (
          <li key={`${entry.seq}-${index}`} className="bb-log__item">
            {entry.text}
          </li>
        ))}
      </ol>
    </section>
  );
}
