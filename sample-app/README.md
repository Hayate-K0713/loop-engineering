# sample-app

`loop-basic` の静的解析・テスト運用方針を実際に動かして確認するための、最小構成のTypeScriptフルスタックサンプル。npm workspaces で `shared`(型定義)・`backend`(NestJS)・`frontend`(Vite + React)を持つ。

このアプリ自体に製品としての意味はない。`/implement`・`code-reviewer`・`/test` が実際に何を実行するのかを具体的に確認するための土台。

## 構成

```
sample-app/
  eslint.config.mjs      共有ESLint設定(サイズ/複雑さ/型の締め付けルール、すべて warn)
  tsconfig.base.json      共有tsconfig
  shared/                  @sample-app/shared。frontend/backend が共有する型定義(ビルド不要、TSソースを直接参照)
    src/quote.ts             QuoteInput / QuoteResult
    src/health.ts             HealthResponse
  backend/                 NestJS(platform-express)
    src/main.ts             bootstrap + グローバル ValidationPipe(DTOバリデーション)
    src/app.module.ts        HealthController・QuoteController・QuoteServiceを束ねるだけ
    src/health/health.controller.ts
    src/quote/quote.controller.ts  DTOへのバインドだけを行う薄いコントローラ
    src/quote/dto/quote-query.dto.ts  class-validatorによる入力検証(QuoteInputを実装)
    src/quote/quote.service.ts      logic/pricing.ts に委ねるだけの薄いサービス(DI境界)
    src/logic/pricing.ts    純粋関数として切り出したビジネスロジック(Nestに依存しない)
    src/logic/pricing.test.ts  上記の純粋関数だけをvitestでテスト(サーバー起動不要)
  frontend/
    src/App.tsx             backendの /api/health・/api/quote を shared の型で叩く画面
    e2e/home.spec.ts        Playwright CLIでの確認例(backend/frontend 両方を実際に起動して検証)
```

## 実行方法

```bash
npm install                 # ルートで一度だけ
npm run typecheck           # shared/backend/frontend すべての型チェック
npm run lint                # ESLint(サイズ/複雑さ/型ルールはwarn — 導入時点でdrain済み、0件)
npm run test                 # backendの純粋関数ユニットテスト(vitest)
npm run build                 # 全ワークスペースのビルド(shared以外。--if-presentでスキップ)
npm run knip:report           # デッドコード・未使用依存の検出(Knip)。レポートのみ・非ブロッキング(常にexit code 0)
npm run knip                  # 同上だが指摘があれば非0で終了する版。ローカルで今すぐ確認したい時用(CIはknip:reportを使う)
npm run dev:backend          # http://localhost:3001 でAPI起動(nest start --watch)
npm run dev:frontend          # 別ターミナルで http://localhost:5173 起動(/api は3001にproxy)
npm run test:e2e --workspace frontend   # Playwright(要 npx playwright install chromium)。backend/frontendを自動起動する
```

手動確認する場合、APIは `curl`、画面は Playwright CLI を使う(`CLAUDE.md`の「手動確認の使い分け」参照)。

```bash
curl "http://localhost:3001/api/quote?amount=19.99&taxRate=0.08"
# => {"subtotal":19.99,"tax":1.6,"total":21.59}

curl "http://localhost:3001/api/quote?amount=-1&taxRate=0.1"
# => {"message":["amount must not be negative"],"error":"Bad Request","statusCode":400}
```

## この構成が示している方針

1. **静的解析は「壊れたら赤くなる」層として積み上げる、ただし初日からブロックしない。** `eslint.config.mjs` のサイズ/複雑さ/型ルールは `warn` で入っている。`error` へ昇格させる判断は `docs/memory/entries/eslint-strictness-ratchet.md` の決定に従う。なお `@typescript-eslint/no-extraneous-class` は `off` にしている — NestJSの `@Module` はデコレータだけを持つ空クラスが正しい書き方であり、ドレイン対象の負債ではなくフレームワークとの構造的な不一致のため(理由はeslint.config.mjs本体に明記)。
2. **ビジネスロジックは純粋関数に切り出す。** `logic/pricing.ts` はNestにもDBにも依存しないので、`pricing.test.ts` は `@nestjs/testing` もサーバー起動も使わず直接呼び出してテストできる。`quote.controller.ts`・`quote.service.ts` は薄いグルーコードのまま保つ。詳細は `docs/memory/entries/pure-function-extraction.md`。
3. **API契約はfrontend/backendで共有し、境界はDTOで検証する。** `@sample-app/shared` の `QuoteInput`/`QuoteResult` が唯一の型定義で、`QuoteQueryDto`(class-validator)がそれを実装しつつHTTP境界での実行時検証を担う。`pricing.ts` 自身の範囲チェックはHTTP以外の呼び出し元に対する保険として残している(defense in depth)。詳細は `docs/memory/entries/shared-types-and-dto-validation.md`。
4. **CIが人間の直pushもエージェントの見落としも拾う。** `.github/workflows/ci.yml` がpush/PRごとに typecheck・lint・unit test・build・E2Eを実行する。ローカルで`/test`が回すのと同じチェックを、誰が変更しても必ず通す。
5. **デッドコード・未使用依存の検出(Knip)もレポートのみ・非ブロッキングから始める。** `knip.jsonc` の設定で `sample-app`(npm workspaces構成)を解析し、`npm run knip:report` は指摘があっても常にexit code 0で終わる。CIの `knip` ジョブも `continue-on-error: true` で独立実行し、既存の `checks`/`e2e` ジョブをブロックしない。**Knipの指摘(件数・内容)は `/test` の合否判定にも `code-reviewer` の判定材料にも使わない。** report-only運用である限り、CLAUDE.mdの「構成されているチェックは必須で実行する…失敗はそのまま不合格/MAJORの理由になる」という原則(`error`まで昇格したチェックが対象)の対象外として扱う。詳細は `docs/memory/entries/knip-dead-code-detection.md` を参照。

(元ネタ: https://zenn.dev/singularity/articles/stopped-reviewing-my-code )
