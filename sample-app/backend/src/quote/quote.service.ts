import { Injectable } from "@nestjs/common";
import { calculateQuote, QuoteInput, QuoteResult } from "../logic/pricing";

// このサービスはNestのDI境界を用意するためだけの薄い層で、計算自体は行わない。
// 実体は logic/pricing.ts の純粋関数(pure-function-extraction convention参照)。
@Injectable()
export class QuoteService {
  calculate(input: QuoteInput): QuoteResult {
    return calculateQuote(input);
  }
}
