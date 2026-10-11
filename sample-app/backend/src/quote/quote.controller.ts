import { Controller, Get, Query } from "@nestjs/common";
import { QuoteService } from "./quote.service";
import { QuoteQueryDto } from "./dto/quote-query.dto";
import type { QuoteResult } from "../logic/pricing";

// パースとバリデーションはグローバル ValidationPipe + QuoteQueryDto に任せているため、
// このコントローラはサービス呼び出しだけを行う薄い層のまま。
@Controller("api/quote")
export class QuoteController {
  constructor(private readonly quoteService: QuoteService) {}

  @Get()
  getQuote(@Query() query: QuoteQueryDto): QuoteResult {
    return this.quoteService.calculate(query);
  }
}
