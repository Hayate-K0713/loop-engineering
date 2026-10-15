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
    src/features/baseball/  ブラウザ野球(1試合モード・CPU対戦。画面は Three.js の 3D ステージ)。外部へは index.ts 経由で BaseballGamePage だけを公開
      types/                 ゲームと 3D 画面で使う型定義(GameState・GameAction・PitchCommand・GameView・SceneFrame・StageHandle 等)。他セグメントを import しない
      model/                 React・three 非依存の純粋関数。ゲームロジックと 3D 画面の「何をどこに出すか」のすべて(各モジュールに同居する *.test.ts でテスト)
        rng/                   シード付きPRNG(mulberry32)とサンプリング
        pitch/                 球種・コース・球速・投球の軌道
        batting/               スイングカーソル判定・接触・打球・結果表・1球の解決(resolve-pitch)
        cpu/                   難易度・CPU投手の配球・CPU打者の擬似入力
        game/                  GameState・reducer・カウント/走者/イニング/得点・実況ログ・起動パラメータ解釈・表示用 view
        data/                  架空の固定プリセット2チーム(チーム色・略称を含む)
        sim/                   人間代理ボットによる打撃バランスの試算(テスト専用。`bot-balance.test.ts` だけが import する)
        world/                 3D 空間の計算(three 非依存の純粋関数。三角関数は可、乱数・時刻・DOM は不可)
          space/                 ワールド座標・ゾーン座標の変換、球場の寸法(StageGeometry)、数値パラメータ(WORLD_PARAMS)
          path/                  投球・打球の軌道、野手の動き
          motion/                キャラクターのポーズ(キーフレーム補間・順運動学)
          camera/                打撃カメラと、打球を追う中継カメラ
          sequence/              1球の演出の進行(時刻表・フレーム合成・テロップ・入力の振り分け・演出の状態判断)
      render/                three を使う唯一の層(`three` の import はここだけ)。球場・キャラクター・マーカーのビルダー、見た目(look)、破棄、ステージ生成(stage.ts)
      hooks/                 React との橋渡し(useReducer による状態保持、演出の時計と進行(useStageDirector・useGameStage)、WebGL ステージの生成、ポインタ/キー入力、CPU の手番、起動パラメータ)。model と render をつなぐのは hooks だけ
      ui/                    描画のみ(タイトル/試合/結果画面、ステージ全面(StageView)、その上に重ねる HUD・ネームプレート・ティッカー・操作バー、CSS)
    e2e/home.spec.ts        Playwright CLIでの確認例(backend/frontend 両方を実際に起動して検証)
    e2e/baseball.spec.ts    ブラウザ野球のE2E(`?seed=&innings=&fast=1` で決定論的に1試合を最後まで通す、WebGL 非対応でも進行する、演出スキップ、Space・タップ・2本目の指でのスイング、スマホ縦(高さ 844/745/664)・デスクトップ・タブレットでオーバーレイがゾーン(守備は格子)を隠さない幾何検証)
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
npm run test:e2e --workspace frontend   # Playwright(要 npx playwright install chromium)。backend/frontendを自動起動する。ブラウザ野球は WebGL2(headless Chromium では SwiftShader のソフトウェア描画)で描くため、1試合を通すテストは数十秒かかる
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
8. **ブラウザ野球の画面は Three.js の 3D ステージ全面+その上に重ねたオーバーレイ(WebGL2 が必要)。** 3D の描画は `three`(npm)を使い、`three` を import するのは `frontend/src/features/baseball/render/` だけ。3D 空間の計算(座標変換・投球/打球の軌道・キャラクターのポーズ・カメラ・1球の演出の時刻表)は `model/world/` に three 非依存の純粋関数として置き、単体テストできる。`model/world/` と `render/` をつなぐのは `hooks/` だけ(`docs/memory/entries/frontend-3d-three-in-render-segment.md`)。`three` を含む試合画面は `React.lazy` で遅延ロードされるので、ホーム(`/`)とタイトル画面のバンドルには入らない。WebGL2 を取得できない環境(WebGL1 のみ・無効化・生成失敗)では `render/` が `null` を返し、ステージ中央に「3D表示を使えません」と出すだけで、**操作と試合の進行は続けられる**(時計とゲートは renderer に依存しない)。描画が中断されたとき(context lost)は「描画が中断されました。ページを再読み込みしてください。」を出す。
9. **画面構成はオーバーレイ型。** ステージ(`StageView`)が画面全面(`position: absolute; inset: 0`)で、その上の `bb-overlay` 層に、左上の HUD(`ScoreHud`: 回表裏・走者ダイヤモンド・得点・B/S/O・回別の `<details>`)、右上のネームプレート(`NamePlates`: 投手・打者)、下部のティッカー(`Ticker`: 実況1〜2行と全ログの `<details>`)と操作バー(`bb-bar`: 打撃時はスイングボタンとミート/強振の切替、守備時は球種チップ・5×5のコース格子・「投げる」)を重ねる。オーバーレイ層は `pointer-events: none` で、操作する部品(操作バー・「回別」・「ログ」・ホームへ戻るピル)だけ `auto`。デスクトップとスマホ縦(幅 640px 以下)で同じ構造にし、ゾーン枠(守備は 5×5 格子)を覆わないよう、上の HUD の下端と下のオーバーレイの上端に挟まれた実際の空き領域を測り(`useSafeArea`)、打撃/守備のレイアウトごとにカメラの画角とシーンの位置をその領域へ合わせる(`model/world/camera/rig.ts` の `battingCameraFor`。`e2e/baseball.spec.ts` の幾何検証が、高さ 844・745・664 のスマホ縦とデスクトップ・タブレットで機械的に確認する)。
10. **演出のスキップ。** 1球ごとの演出(打球の追跡・テロップ)の最中は、ステージ上のクリック/タップ、または Space / Enter キーでスキップできる(最初の1回のみ。キーの長押し・リンクや入力欄でのキーは対象外)。スキップは表示だけを進め(ゲームの状態・結果は変えない)、演出中は HUD・実況も更新を待つ。人間打撃の待機中は、ステージ上のクリックがスイングになる(演出中のクリックはスキップで、スイングにはならない)。
11. **打撃の操作。** マウス/ペンは動かすとカーソルが追従し、クリックでその位置にスイング。タッチは **1 本指のドラッグでカーソルを狙い**(相対移動。指の位置ではなく移動量で動く)、**指を離さず軽くタップ(10px 以内・180ms 以内)すると、押した時点のカーソル位置でスイング**する。ドラッグしている最中に **2 本目の指でステージをタップ**しても、その場でスイングになる。画面下の**スイングボタン**でも振れる(ミート/強振の切り替えつき)。キーボードは矢印/WASD でカーソル、Space/Enter でスイング、Z/X でミート/強振。スイングの直後には、ゾーン枠の上に「早い/ジャスト/遅い」と ± ミリ秒が出て、自分のずれが分かる。判定時刻は入力イベントの時刻から入力種別ごとの遅延(タッチ 70ms・マウス/キー 20ms)を引いたもので、ボールの到達から 250ms までのスイングは空振りなどの結果が返る(それより遅いと見逃し)。

(元ネタ: https://zenn.dev/singularity/articles/stopped-reviewing-my-code )
