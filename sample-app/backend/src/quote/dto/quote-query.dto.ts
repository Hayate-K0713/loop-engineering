import { Type } from "class-transformer";
import { IsNumber, Min } from "class-validator";
import type { QuoteInput } from "@sample-app/shared";

// HTTP境界での入力検証。main.ts のグローバル ValidationPipe(transform: true)により、
// クエリ文字列は自動でこのクラスのインスタンスに変換・検証されてからコントローラに渡る。
// 「壊れたら赤くなる」層のひとつ — 手書きの Number() パースに代わる構造的なチェック。
export class QuoteQueryDto implements QuoteInput {
  @Type(() => Number)
  @IsNumber({}, { message: "amount must be a number" })
  @Min(0, { message: "amount must not be negative" })
  amount!: number;

  @Type(() => Number)
  @IsNumber({}, { message: "taxRate must be a number" })
  @Min(0, { message: "taxRate must not be negative" })
  taxRate!: number;
}
