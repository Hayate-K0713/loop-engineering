import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { QuoteController } from "./quote/quote.controller";
import { QuoteService } from "./quote/quote.service";

@Module({
  controllers: [HealthController, QuoteController],
  providers: [QuoteService],
})
export class AppModule {}
