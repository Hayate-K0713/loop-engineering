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
    vitest.config.ts        frontend の単体テスト設定(includeを src/**/*.test.ts に限定、environment は node)
    src/main.tsx             エントリ。AppRoutes を描画する
    src/App.tsx             backendの /api/health・/api/quote を shared の型で叩く画面(`#/baseball` へのリンクを持つ)
    src/routes/             location.hash と画面の対応づけだけを担う薄い自前ルーティング層(react-router は使わない)
      resolve-route.ts       hash から "home" | "baseball" を決める純粋関数(resolve-route.test.ts でテスト)
      use-hash-route.ts      hashchange を購読して現在のルートを返す hook
      AppRoutes.tsx          ルートに応じて App か BaseballGamePage を描画する
    src/features/baseball/  ブラウザ野球(1試合モード・CPU対戦)。外部へは index.ts 経由で BaseballGamePage だけを公開
      types/                 ゲームで使う型定義(GameState・GameAction・PitchCommand・BattedBall・GameView 等)
      model/                 React 非依存の純粋関数。ゲームロジックのすべて(下記サブディレクトリ。各モジュールに同居する *.test.ts でテスト)
        rng/                   シード付きPRNG(mulberry32)とサンプリング
        pitch/                 球種・コース・球速・投球の軌道
        batting/               スイングカーソル判定・接触・打球・結果表・1球の解決(resolve-pitch)
        cpu/                   難易度・CPU投手の配球・CPU打者の擬似入力
        game/                  GameState・reducer・カウント/走者/イニング/得点・実況ログ・起動パラメータ解釈・表示用 view
        data/                  架空の固定プリセット2チーム
      hooks/                 React との橋渡し(useReducer による状態保持、rAF による投球アニメ、ポインタ/キー入力、CPU の手番、起動パラメータ)
      ui/                    描画のみ(タイトル/試合/結果画面、スコアボード、ストライクゾーン、フィールド図、操作パネル、CSS)
    e2e/home.spec.ts        Playwright CLIでの確認例(backend/frontend 両方を実際に起動して検証)
    e2e/baseball.spec.ts    ブラウザ野球のE2E(`?seed=&innings=&fast=1` で決定論的に1試合を最後まで通す)
```

## 実行方法

```bash
npm install                 # ルートで一度だけ
npm run typecheck           # shared/backend/frontend すべての型チェック
npm run lint                # ESLint(サイズ/複雑さ/型ルールはwarn — 導入時点でdrain済み、0件)
npm run test                 # backend/frontend の純粋関数ユニットテスト(vitest。全workspaceを対象に実行)
npm run build                 # 全ワークスペースのビルド(shared以外。--if-presentでスキップ)
npm run knip:report           # デッドコード・未使用依存の検出(Knip)。レポートのみ・非ブロッキング(常にexit code 0)
npm run knip                  # 同上だが指摘があれば非0で終了する版。ローカルで今すぐ確認したい時用(CIはknip:reportを使う)
npm run dev:backend          # http://localhost:3001 でAPI起動(nest start --watch)
npm run dev:frontend          # 別ターミナルで http://localhost:5173 起動(/api は3001にproxy)。ブラウザ野球は http://localhost:5173/#/baseball
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
6. **フロントエンドのゲーム(ブラウザ野球)もロジックは純粋関数、乱数はシード付きPRNG。** `frontend/src/features/baseball/model/` のロジック(判定・CPU・進行・走者・得点)はすべて React 非依存の純粋関数で、`GameState` を受け取って次の `GameState` を返す reducer が中心になる。`hooks/` は React との橋渡し、`ui/` は描画だけに徹する。乱数は `Math.random` を使わず、`GameState` 内に持つシード付きPRNG(mulberry32)の状態を reducer 内で明示的に受け渡す(lintで `Math.random` が error のため。`docs/memory/entries/sample-app-lint-random-and-index-access.md`)。同じシード・同じ入力なら必ず同じ試合になるので、単体テスト(`model/` 配下に同居する `*.test.ts`、vitest・jsdom不使用)もE2Eも決定論的に書ける。frontend の vitest は Playwright の `e2e/*.spec.ts` を拾わないよう `include` を限定している(`docs/memory/entries/vitest-include-picks-playwright-specs.md`)。
7. **ブラウザ野球の起動方法と、テスト用の起動パラメータは開発サーバー限定。** `npm run dev:frontend` で起動して `http://localhost:5173/#/baseball` を開く(`/` は従来画面のまま、ハッシュで切り替える)。URLに `?seed=<uint32>&innings=<1|3|5|9>&fast=1`(例: `http://localhost:5173/?seed=42&innings=1&fast=1#/baseball`)を付けると、シード固定・イニング数固定・投球アニメとCPU待機の短縮ができる(不正値は無視して既定値)。この3つは**開発サーバー(`npm run dev:frontend`、`import.meta.env.DEV`)でのみ有効で、本番ビルドでは無視される**(判定は `hooks/useLaunchParams.ts` だけが行い、`model/game/launch-params.ts` の `parseLaunchParams` は渡された文字列を解釈するだけの純粋関数)。E2E(`e2e/baseball.spec.ts`)はPlaywrightの `webServer` が `npm run dev` を使うため、このパラメータで決定論的に試合を通せる。

(元ネタ: https://zenn.dev/singularity/articles/stopped-reviewing-my-code )
