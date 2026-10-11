import { useEffect, useState } from "react";
import type { HealthResponse, QuoteResult } from "@sample-app/shared";

type HealthStatus = "loading" | "ok" | "error";
type QuoteState = { status: "idle" } | { status: "loading" } | { status: "done"; result: QuoteResult } | { status: "error"; message: string };

export function App() {
  const [health, setHealth] = useState<HealthStatus>("loading");
  const [quote, setQuote] = useState<QuoteState>({ status: "idle" });

  useEffect(() => {
    fetch("/api/health")
      .then((res) => {
        if (!res.ok) throw new Error(`unexpected status ${res.status}`);
        return res.json() as Promise<HealthResponse>;
      })
      .then((data) => setHealth(data.status === "ok" ? "ok" : "error"))
      .catch(() => setHealth("error"));
  }, []);

  async function fetchQuote() {
    setQuote({ status: "loading" });
    try {
      const res = await fetch("/api/quote?amount=100&taxRate=0.1");
      if (!res.ok) throw new Error(`unexpected status ${res.status}`);
      const result = (await res.json()) as QuoteResult;
      setQuote({ status: "done", result });
    } catch (err) {
      setQuote({ status: "error", message: err instanceof Error ? err.message : "failed to fetch quote" });
    }
  }

  return (
    <main>
      <h1>loop-basic sample app</h1>
      <p>
        backend status: <span data-testid="health-status">{health}</span>
      </p>

      <button onClick={() => void fetchQuote()} data-testid="fetch-quote">
        見積を取得(amount=100, taxRate=0.1)
      </button>
      {quote.status === "done" && (
        <p data-testid="quote-result">
          subtotal={quote.result.subtotal} / tax={quote.result.tax} / total={quote.result.total}
        </p>
      )}
      {quote.status === "error" && <p data-testid="quote-error">{quote.message}</p>}
    </main>
  );
}
