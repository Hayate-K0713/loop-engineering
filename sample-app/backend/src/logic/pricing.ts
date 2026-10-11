// 見積計算のロジック本体。Nestのコントローラ/サービス(src/quote/)から意図的に
// 切り離した純粋関数にしている — I/O・フレームワーク依存を持たないので、
// サーバーを起動せずユニットテスト(pricing.test.ts)だけで検証できる。
// loop-basic の docs/memory/entries/pure-function-extraction.md 参照。
//
// 型は @sample-app/shared のQuoteInput/QuoteResultを使う(frontendと共有)。
// ガード節(範囲チェック)はHTTP層のDTOバリデーション(quote-query.dto.ts)とは別に、
// この関数がHTTP以外の文脈から呼ばれても安全なように独立して持たせている(defense in depth)。

import type { QuoteInput, QuoteResult } from "@sample-app/shared";

export type { QuoteInput, QuoteResult };

export function calculateQuote(input: QuoteInput): QuoteResult {
  if (input.amount < 0) {
    throw new RangeError("amount must not be negative");
  }
  if (input.taxRate < 0) {
    throw new RangeError("taxRate must not be negative");
  }

  const subtotal = roundToCents(input.amount);
  const tax = roundToCents(input.amount * input.taxRate);
  const total = roundToCents(subtotal + tax);

  return { subtotal, tax, total };
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}
