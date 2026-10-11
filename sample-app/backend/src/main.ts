import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // グローバルなDTOバリデーション。クエリ/ボディはDTOクラスへtransformされ、
  // class-validatorの制約(quote-query.dto.ts等)を満たさなければ自動で400になる。
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);
  console.log(`backend listening on http://localhost:${port}`);
}

void bootstrap();
