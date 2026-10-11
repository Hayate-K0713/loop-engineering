# 調査: パワプロ風野球ゲーム — 技術アーキテクチャ(sample-appへの組み込み)

- 日付: 2026-10-11
- ステータス: 完了(ただし静的解析まわりは「ルール実装の読解」のみで未実測。後述)
- 関連する設計ドキュメント: (作成後にリンクを追記)
- 担当観点: 技術アーキテクチャのみ(並列調査の一部。ゲームメカニクス・打席判定ルール・CPU AIのゲームデザインは別investigatorの担当で本書では扱わない)

## 背景・目的

`sample-app/`(npm workspaces: `shared`=型定義, `backend`=NestJS, `frontend`=Vite+React19)に、パワプロ風の1試合モード野球ゲーム(CPU対戦、打撃=ミートカーソル+タイミング、投球=球種・コース選択、スコアボード)を追加したい。既存の health/quote 画面とe2eは壊さない。本書は「どこに・どう組み込むか」を決めるための事実収集と選択肢整理であり、設計判断は行わない。

注意: 本調査を実施したinvestigatorは **Bashツールを持たず、`npm install` も `npx eslint` も実行できなかった**。静的解析(eslint)の挙動は `sample-app/node_modules/` に既にインストール済みのルール実装を直接読んで判断している(= 未実測)。実装フェーズ最初のステップで必ず実測すること(`knip-dead-code-detection` の教訓と同じ運用: 静的読解で先回りの設定を入れず、実際に実行してから必要最小限だけ設定する)。

## 現状の把握

### sample-app の構成(実読済みファイル)

- ルート `sample-app/package.json`: `"type": "module"`, workspaces=`shared`,`backend`,`frontend`。scripts: `lint`=`eslint .`, `typecheck`=`npm run typecheck --workspaces`, **`test`=`npm run test --workspace backend`(backendのみ)**, `test:e2e`=frontendのPlaywright, `build`=`--workspaces --if-present`, `knip`/`knip:report`。
- `shared`: `main`/`types`=`./src/index.ts`(ビルドなし、TSソース直参照)。`src/{quote,health}.ts` は型(interface)のみ。**frontend/backendの双方で `@sample-app/shared` は `import type` のみで使われており、ランタイムimportは現状ゼロ**(`pricing.ts`, `quote-query.dto.ts`, `health.controller.ts`, `App.tsx`)。つまり「sharedにランタイムコードを置く」経路はこのリポジトリで未検証。
- `backend`: NestJS 11、commonjs。`src/logic/pricing.ts`(純粋関数)+ `pricing.test.ts`(vitest、`describe/it/expect` を明示import、コロケーション)。`vitest ^3.0.4`(lockfile上 3.2.7)。vitestの設定ファイルは無し(既定値で `src/**/*.test.ts` が拾われる)。`scripts.test`=`vitest run`。
- `frontend`: Vite 6.4.3 + React 19.2.8 + `@vitejs/plugin-react` 4.7.0、`@types/react` 19.2.17(`useEffectEvent` の型あり)、`@playwright/test` 1.62.0。`src/main.tsx` は `<StrictMode>` で `<App/>` を描画。`src/App.tsx` はhealth表示(`data-testid="health-status"`)と見積取得ボタン(`data-testid="fetch-quote"`, `quote-result`)だけの単一コンポーネント。ルーターも状態管理ライブラリも無い。`vite.config.ts` は react plugin と `/api` → `localhost:3001` のproxyのみ。`tsconfig.json` は `include: ["src","e2e","vite.config.ts","playwright.config.ts"]`、`types: ["vite/client"]`、`lib: ES2022+DOM`。
- `tsconfig.base.json`: `strict`, **`noUncheckedIndexedAccess: true`**, **`exactOptionalPropertyTypes: true`**, `isolatedModules`, target ES2022(`Array.prototype.at` 等が使える)。
- `frontend/e2e/home.spec.ts`: `page.goto("/")` → `getByRole("heading", {name: "loop-basic sample app"})` が可視、`getByTestId("fetch-quote").click()` → `quote-result` のtextが `subtotal=100 / tax=10 / total=110`。**`/` が従来の画面のままであること、およびその見出しが同ページ内に1つだけであること(strict mode)が既存e2eの前提**。
- `frontend/playwright.config.ts`: `testDir: ./e2e`, `fullyParallel: true`, webServerとして backend(3001)と frontend(5173)の両方を起動(`reuseExistingServer: !CI`)、projectsは `Desktop Chrome` のみ。
- `.github/workflows/ci.yml`: `checks`(typecheck → lint → `npm run test` → build)、`e2e`(`needs: checks`、chromium install後 `npm run test:e2e --workspace frontend`)、`knip`(独立・`continue-on-error: true`)。`npm ci` を使うため **package.json の依存を変えたら `package-lock.json` の同期が必須**(lockfileの `packages."frontend".devDependencies` にも反映される)。
- `eslint.config.mjs`(flat config): `tseslint.configs.strict` + `sonarjs.configs.recommended` + `security.configs.recommended` + prettier。型情報を使う設定(`parserOptions.project`/`projectService`)は**無い**。`eslint-plugin-react-hooks` も**無い**(`exhaustive-deps` は強制されない)。`.prettierrc` は `printWidth: 160`(prettier違反もlint errorになる)。
- `knip.jsonc`: 各workspaceは空オーバーライドで既定のプラグイン自動検出に依存。レポートのみ・非ブロッキング(`/test`・`code-reviewer`の判定には使わない)。
- 適用されうる既存規約(`docs/memory/`): `pure-function-extraction`(ロジックは純粋関数、ハンドラ/コンポーネントは薄く)、`shared-types-and-dto-validation`(API契約はsharedの型+backendのclass-validator DTO)、`eslint-strictness-ratchet-v2`(サイズ/複雑さ/sonarjs/security/prettierは全てerror、誤検知が出たら設定ファイル側に理由付きで例外を書く)、`knip-dead-code-detection`(report-only、判定に使わない)。
- `.claude/agents/frontend-designer.md` が定める標準フロントエンド構成: `routes/`(薄い)+ `features/<name>/{api,model,hooks,types,ui}`(依存順 api→model→hooks→ui、`model/` は**Reactに依存しない純粋関数**)+ `shared/`。ルーターライブラリの存在を前提にしているが、現状frontendにはルーターが無いため「導入が必要な箇所の指摘」対象になる。

## 選択肢の比較

### Q2. ゲームロジック(打席判定・カウント・イニング進行・CPU AI)の配置場所

| 選択肢 | メリット | デメリット | 備考 |
| --- | --- | --- | --- |
| (a) `shared/src/` に純粋ロジックを置く | frontend/backendの両方から同じロジックを呼べる。将来「サーバー側でリプレイ検証」等に拡張しやすい | sharedは現状「型のみ・ビルドなし・ランタイムimportゼロ」。backendはcommonjsで `main` が `.ts` を指すため、**backendからランタイムimportするとNodeがTSを読めず実行時に失敗しうる(未検証)**。= 再利用の利点は現状では絵に描いた餅。shared自体にvitestとtestスクリプトが必要。frontendからのランタイムimport(Viteの `server.fs.allow` は `workspaces` を持つルートを探索するので許可される見込みだが、これも未検証) | 単一プレイヤー・サーバー不要の本件ではメリットが薄い |
| (b) `frontend/src/features/baseball/model/` に置く(推奨) | `frontend-designer`の標準構成(`model/`=React非依存の純粋関数)と一致。`pure-function-extraction`規約と整合(`pricing.ts`+`pricing.test.ts`のコロケーションと同形)。クロスパッケージ問題が無い。変更範囲がfrontendに閉じ、既存機能へ影響しにくい | backendから再利用できない(ただし本件でbackend判定は不要)。vitestをfrontendに追加し、ルート`npm run test`を全workspace対象に直す必要がある | 結果保存APIを作る場合のみ、永続化する型(例 `GameResultSummary`)を `shared/src/` に置く(ハイブリッド) |
| (c) backendのAPIで判定する(例 `POST /api/baseball/swing`) | 既存の `backend/src/logic/` + vitest + DTO規約にそのまま乗る。判定がサーバー権威 | **毎投球でHTTP往復が発生し、ミートカーソル+タイミング(ms単位)の操作感が破壊される**。ゲームのためにbackend常時起動が必須になり、セッション状態管理(サーバー側ゲーム状態)も要る。単独プレイのCPU戦でサーバー権威(不正対策)の価値は無い。e2eもbackend依存になる | 非推奨。「試合結果の保存」だけならbackendの役割として成立する(後述Q6) |

### Q2'. ユニットテストの実行場所と構成

現状は `npm run test` = backendのみ。(b)を採る場合の選択肢:

| 選択肢 | メリット | デメリット | 備考 |
| --- | --- | --- | --- |
| T1: frontendに `vitest.config.ts` を別ファイルで新設 + frontend/package.jsonに `vitest`(`^3.0.4`)追加 + `test` script追加 | `vite.config.ts` に触れず、`vite build`/dev/既存e2eへの影響ゼロ。純粋ロジックには react plugin 不要で起動が速い。Vitest公式どおり `vitest.config.ts` は `vite.config.ts` より優先される | `vitest.config.ts` を `tsconfig.json` の `include` に足す(足さないとtypecheck対象外)。Vite設定を共有したくなったら `mergeConfig` が必要 | **`include` を明示必須**(下の落とし穴参照) |
| T2: `vite.config.ts` に `test` キーを追加(`defineConfig` を `vitest/config` からimport) | ファイルが増えない。Vite設定(alias等)を自動共有 | アプリ本体のconfigにテスト設定が混ざる。importを `vite`→`vitest/config` に変えるため既存configに手が入る | 既存機能を壊さない観点ではT1の方が安全 |
| T3: ルートに `vitest.config.ts` を置き `test.projects` で backend/frontend をまとめて `vitest run` | 1コマンドで全テスト。カバレッジ集約もしやすい | vitestをルートdevDependenciesにも足す、既存のbackend単体実行(`vitest run`)の構成を変える、Knipのルートworkspace解析に影響。今回の規模には過剰 | 将来workspaceが増えたら検討 |
| T4: sharedにvitestを足してsharedで実行((a)採用時) | (a)と整合 | (a)の欠点がそのまま付く | - |

どの案でも共通: ルート `package.json` の `test` を `npm run test --workspaces --if-present`(または `--workspace backend --workspace frontend` の列挙)に変更すれば、**`ci.yml` の `npm run test` は無変更でfrontendも対象になる**(CIのstep名 "Unit tests (backend pure functions)" は不正確になるので改名推奨だが任意)。同時に `sample-app/README.md` と `docs/process/sample-app-dev.md` の「backendの純粋関数ユニットテスト」という記述が古くなる。

**落とし穴(確認済みの事実)**: Vitestの `include` 既定値は `['**/*.{test,spec}.?(c|m)[jt]s?(x)']` で、frontendで素の `vitest run` を実行すると **Playwrightの `e2e/home.spec.ts` まで拾って失敗する**。`include: ["src/**/*.test.{ts,tsx}"]` で限定するか `exclude` に `e2e/**` を足す(既定値を上書きするので `configDefaults` をspreadするか明示的に書く)。逆方向(Playwrightが `src/*.test.ts` を拾う)は `testDir: ./e2e` なので起きない。なお `eslint.config.mjs` のテスト向け緩和は `**/*.test.{ts,js}` のみで **`*.test.tsx` は対象外**(`max-lines-per-function` 等が効く)。テストは純粋ロジックのみ(`environment: "node"`、jsdom不要)とし、フック/UIの検証はPlaywrightに寄せるのが負担が小さい。

### Q3. 描画・アニメーション方式

| 選択肢 | メリット | デメリット | 備考 |
| --- | --- | --- | --- |
| A: React + DOM/CSS(+SVG) | スコアボード・カウント・ボタン・ダイヤモンド(走者)を宣言的に書ける。**`data-testid`/`data-*` 属性/テキストでPlaywrightが状態を直接検証できる**(既存e2eと同じ流儀)。アクセシビリティ(button・`aria-live`)を得やすい。追加依存ゼロ。SVGの `viewBox` で解像度非依存、座標を正規化して純粋関数に渡しやすい。モバイルのレスポンシブも容易 | 連続アニメーション(ボール・カーソル)を毎フレーム `setState` するとサブツリーが再レンダリングされる → 連続値はrefで保持してrAF内で `style.transform` を直接書く等の作法が必要。大量オブジェクトの描画(多数のパーティクル等)には不向き | 本件の描画対象(ボール1個、カーソル、ゾーン、走者、数値)は軽量で十分収まる |
| B: Canvas 2D を rAF で直接描画 | 描画自由度が高く、毎フレーム全再描画でも軽い。エフェクトを足しやすい | Canvas内の状態はDOMから見えず、**e2eで状態検証しづらい**(スコアボード等のDOMミラー、`aria-live` ログ、デバッグ用 `window` フックが別途必要。ピクセル比較は不安定)。アクセシビリティが弱い。高DPI対応(`devicePixelRatio`)・リサイズ・ヒットテストを自前実装 | スコアボード/ボタン類はDOMで作るハイブリッドが現実的 |
| C: Phaser / PixiJS 等のゲームライブラリ | シーン管理・スプライト・アニメ・入力・サウンドが揃う(Phaser)、高速2D描画(Pixi) | バンドルが大きい(目安: 二次情報だがPixi全体で約450KB min、Phaser 3は約1.2MB min/gzipで数百KB。**いずれも未計測**。PixiはTree-shaking可、Phaser 3は不向き)。ゲームループ・入力・状態をライブラリが握るためReact(StrictMode)との橋渡し(EventBus等)が必要。canvas内部はe2e不可視。vitest(node環境)でライブラリをimportできずロジック分離が結局必須。型・ESLint・Knipの対象外コードが増える | 本件(ターン制に近い1打席単位の操作、少数オブジェクト)では過剰 |
| 補足: CSS animation / Web Animations API | ボール軌道を宣言的に書ける | 判定用のタイムラインをDOMアニメーションに依存させるとロジックが描画に引きずられテスト不能になる。判定は常に自前のゲーム時間(ms)で行い、CSS/WAAPIは見た目専用にする | 併用は可 |

### Q3'. rAFゲームループ・状態の持ち方(React 19.2.8 / StrictMode前提)

要点(いずれも公式仕様ベース、ループ実装は未検証):

- `main.tsx` が `<StrictMode>` のため、開発時に effect が mount → cleanup → mount と2回走る。rAFは `useEffect` 内で開始し、cleanupで必ず `cancelAnimationFrame`。"二重実行を防ぐrefガード" で隠さない。
- **StrictModeはreducerとstate updaterも2回呼ぶ**。reducer内で可変PRNGクロージャを消費すると、1アクションで乱数が2回進み再現性が壊れる。→ **乱数状態(seed/state)をゲーム状態に含め、`(state, action) → state` を完全に純粋にする**(または乱数の抽選はイベントハンドラ側で行い、結果をactionに載せる)。
- 最新のpropsやstateをループ内で読みたい場合、React 19.2で安定化した **`useEffectEvent`**(導入済みReact 19.2.8、`@types/react` 19.2.17に型あり)か、「最新値refパターン」を使う。ただしプロジェクトに `eslint-plugin-react-hooks` が無く `exhaustive-deps` が強制されないため、stale closureはレビューと実測テストで防ぐ必要がある。
- rAFコールバックの引数(タイムスタンプ)を経過時間計算に使う(固定60fps前提にしない)。ゲーム内部は「投球からの経過ms」を明示的な引数として純粋関数に渡す(`advance(state, dtMs)`)。固定タイムステップ+アキュムレータにすればフレームレート非依存で、ユニットテストは合成dtをループで回すだけで済む。

| 状態管理の選択肢 | メリット | デメリット | 備考 |
| --- | --- | --- | --- |
| S1: `useReducer`(離散イベント)+ refs(連続値) | 追加依存なし。reducerは純粋関数としてvitestで直接テスト。再レンダリングは打席結果・フェーズ遷移などの離散イベント時のみ | 連続値(ボール位置・カーソル位置)をrefへ分離する設計規律が必要 | 推奨。reducerは `complexity: 20`/`max-lines-per-function: 60` に収まるよう、フェーズ別に分割した純粋関数へ委譲する |
| S2: 外部ストア+`useSyncExternalStore` | rAF駆動の更新と購読を分離でき、選択的購読が可能。ReactなしでエンジンをNodeでも回せる | ストアの自前実装が増え、規模の割に仕組みが重い。StrictModeとの相互作用の考慮も増える | 状態遷移が複雑化したら検討 |
| S3: Zustand等の状態管理ライブラリ | 記述が簡潔 | 新規依存(lockfile更新)。純粋関数規約との整合のため結局reducer相当を別に書く | 今回は不要と思われる |

### Q4. 入力(ミートカーソル・スイング・投球選択)

- **Pointer Events** で mouse/touch/pen を統一する(`onPointerMove`/`onPointerDown`/`onPointerUp`/`onPointerCancel`)。ドラッグ操作では `setPointerCapture(e.pointerId)`、プレイエリアに CSS `touch-action: none`(+ `user-select: none`、`overscroll-behavior`)を付けてスクロール/ピンチと競合させない。`pointercancel` も処理する。
- **マウス**: ホバーでカーソル移動 + クリックでスイング、が自然。**タッチにはホバーが無い**ため、(i) ドラッグでカーソル移動し指を離す(pointerup)でスイング、(ii) 十字ボタン+スイングボタンの画面内コントロール、のいずれかが必要(UI設計事項)。
- **キーボード**: `window` の `keydown` を effect で登録/解除。矢印/WASDでカーソル、Space/Enterでスイング。スイングは `event.repeat` を無視。`e.code` を使う。
- 座標は **`getBoundingClientRect`(SVGなら `getScreenCTM().inverse()`)でストライクゾーン基準の正規化座標(0〜1)に変換**してからモデルへ渡す。ピクセル値をロジックに持ち込まないことで純粋関数化とレスポンシブ対応を両立できる。
- **スイング時刻の取り方(トレードオフ)**: (1) ハンドラ内で `performance.now()`(rAFのタイムスタンプと同じ時間軸。Playwrightの `page.clock` で制御可能 → e2e決定的)、(2) `event.timeStamp`(実入力時刻に近くrAFフレーム量子化の影響を受けないが、`page.clock` では制御できない)。判定関数は時刻を引数で受け取る純粋関数にしておけばどちらも選べる。
- 投球側(球種・コース選択)は通常の `<button>`(球種)と 3x3/5x5 の `<button>` グリッド(コース)で足りる。ポインタ専用コードが不要で、キーボード操作・a11y・Playwright(`click`)にそのまま乗る。
- スマホ表示: `index.html` に `viewport` meta 済み。必要ならSVG `viewBox`+CSS `aspect-ratio` で縮尺。`playwright.config.ts` は Desktop Chrome のみ。モバイル検証を足す場合は `devices["Pixel 7"]` 等のprojectを追加できるが、`testMatch` で対象specを絞らないと既存specも再実行される。タッチ操作のe2eは `hasTouch` が必要(`locator.tap()`/`page.touchscreen`)。

### Q5. 静的解析(eslint)の制約 — ゲームコードへの影響(未実測、ルール実装の読解に基づく)

| ルール | 現状 | ゲームコードへの影響(根拠) | 回避・対処の選択肢 |
| --- | --- | --- | --- |
| `security/detect-object-injection` | error | **構文のみで判定**(`node_modules/eslint-plugin-security/rules/detect-object-injection.js` 66〜76行): `MemberExpression` が computed かつ `property.type === 'Identifier'` なら無条件でreport(代入先・引数・その他すべて)。`grid[r]`, `LABELS[kind]`, `arr[i]` は error。一方 `arr[0]`、`arr[i + 1]`、`LABELS[pitch.kind]`(propertyがMemberExpression)、`arr[f()]` は構文上reportされない | 推奨: `for...of`/`.map`/`.flatMap`、`Array.prototype.at(i)`、`Map#get`、`switch` による分岐関数、`Object.entries` を使い**そもそも変数添字を避ける**。5x5グリッドはフラット配列+`.at()`か、`Array.from({length}, (_, r) => ...)` で生成。構文の抜け穴(`arr[i + 0]` 等)でルールを騙す書き方は意図に反するので避ける。どうしても必要ならプロジェクト方針どおり `eslint.config.mjs` 側に**パス限定の例外を理由付きで**書く(`mulmoterminal` 前例)。インラインdisableは禁止。`noUncheckedIndexedAccess` により添字アクセスは元々 `T \| undefined` なので `.at()` と型上の差は無い |
| `sonarjs/pseudo-random` | error(recommendedは全rule error) | **`Math.random()` の呼び出しを文脈に関係なく全てreport**(`eslint-plugin-sonarjs/cjs/S2245/rule.js`: `CallExpression` の完全修飾名が `Math.random` ならreport。セキュリティ文脈の判定はしない)。ゲームの乱数に `Math.random()` を直接書けない | 後述「乱数の扱い」の比較。**シード付きPRNG(関数として注入)を推奨**。`Math.random` を呼び出さず参照だけ渡す書き方はルール上はreportされない見込みだが、エイリアス経由は検出されうるため避ける |
| `max-lines-per-function` 60(コメント/空行除外、IIFE含む) | error | **JSXの行も数える**ため、1つのコンポーネントにスコアボード+フィールド+操作系を詰めると超過する。巨大reducerの `switch` も対象 | コンポーネントを `Scoreboard`/`Field`/`StrikeZone`/`PitchControls`/`ResultScreen` に分割。reducerは `case` ごとに純粋関数へ委譲 |
| `complexity` 20 | error | 打席結果判定の分岐や、アクション種別の `switch`(caseごとに+1)で超えやすい | フェーズ別reducer分割、判定をテーブル駆動/小関数の合成にする(ただしテーブル参照で変数添字を使うとobject-injectionに当たる点に注意) |
| `sonarjs/cognitive-complexity` 15(既定) | error | **`complexity: 20` より厳しい別の指標**。ネストした `if`/ループで超えやすい。依頼文に無かったが重要 | 早期return・小関数化 |
| `max-depth` 4 / `max-params` 6 / `max-nested-callbacks` 4 / `sonarjs/no-nested-functions`(深さ4) / `sonarjs/no-nested-conditional` | error | JSXの二重 `.map` +ハンドラのアロー関数はネスト深度が限界に近づく。**ネストした三項演算子は禁止**(ボール/ストライク/ファウルの分類を三項で連ねない) | if/else・早期return・分類関数 |
| `sonarjs/todo-tag` / `fixme-tag` | error | **`// TODO` `// FIXME` コメントがそのままlintエラー**(recommendedで有効) | 残課題はコメントでなくdocsへ |
| `sonarjs/no-small-switch`(case<3)、`no-parameter-reassignment`、`no-dead-store`、`no-nested-assignment`、`prefer-while` 等 | error | 状態機械を素直に書けば概ね問題ないが、`switch` が2ケースしか無い場合や引数の再代入(reducer内で `state = ...`)はerror | 不変更新・ifで書く |
| `sonarjs/void-use` | error | `void somePromise()` のような **call式へのvoidは許可**(`S3735/rule.js`)。既存 `App.tsx` の `void fetchQuote()` が通っているのと一致 | 問題なし |
| 型情報が必要なsonarjsルール(例 `prefer-read-only-props`) | 実質無効 | `S6759` は `parserServices` が無いと `return {}`(何もしない)。本リポジトリのESLintは型情報なし設定のため**効かない**(Readonly propsは慣習として付けるのが無難だがlintは検出しない) | - |
| `@typescript-eslint/no-non-null-assertion` / `no-explicit-any` | error | `!` 禁止、`any` 禁止。`noUncheckedIndexedAccess` と併せて `undefined` を明示的に扱う必要がある | `??` や型ガード |
| prettier (`printWidth: 160`) | error | 整形差分もlintエラー | `eslint --fix` で整形可能(eslint-plugin-prettier経由) |
| `sonarjs/no-duplicate-string`、`expression-complexity`、`no-commented-code`、magic number系 | 無効 | 指摘されない(`sonarjs` READMEの✅一覧に無い。`S109` はtypescript-eslint側でこの設定では未有効) | - |
| `eslint-plugin-react-hooks` | **未導入** | `exhaustive-deps` が効かない。rAFループのstale closureはlintで守られない | 導入は別topic。`useEffectEvent`/refパターンを設計で規定 |

#### 乱数の扱いの比較

| 選択肢 | メリット | デメリット | 備考 |
| --- | --- | --- | --- |
| R1: シード付きPRNGを純粋関数として実装し、状態を含めて渡す(`next(state) → [value, nextState]`)。シードの生成は境界(ゲーム開始時のイベントハンドラ)で `crypto.getRandomValues`(または `Date.now()`)から1回だけ | ロジックが完全に決定的で `vitest` が安定。StrictModeのreducer二重呼び出しでも壊れない。同じシードで試合をリプレイ可能(バグ再現、e2eで `?seed=` 指定)。`Math.random` 不使用なので `sonarjs/pseudo-random` を回避。mulberry32/sfc32は数行〜十数行(`Math.imul`使用)で `eslint` 例外不要 | PRNGを自前実装・テストする手間(ごく小さい)。「暗号学的乱数ではない」が、ゲームには不要 | 推奨 |
| R2: ロジック内で `Math.random()` を直接使い、`eslint.config.mjs` で該当パスだけ `sonarjs/pseudo-random` をoffにする(理由をコメント) | 実装が最も単純 | テストが非決定的(スタブ要)。再現不能。プロジェクト方針上「例外を増やす」選択でありレビュー指摘になりうる | 非推奨 |
| R3: 乱数関数 `rng: () => number` を引数注入し、アプリ起動側のみ `Math.random` を**参照として渡す** | テストではスタブ関数を注入でき決定的にできる | 本番は再現不能。reducerが可変クロージャを消費するとStrictModeで2重消費(上記落とし穴)。ルール回避が参照渡しという構文上の都合に依存 | R1の簡易版 |

### Q7. 画面遷移(タイトル → 試合 → 結果)と既存画面との共存

前提: 既存e2eは `/` で従来画面(見出し "loop-basic sample app")を期待する。ゲーム内フェーズ(タイトル/試合中/結果)は状態であってURLに残す意味は薄い(リロードで試合再開は不要)。

| 選択肢 | メリット | デメリット | 備考 |
| --- | --- | --- | --- |
| A: ルーターなし。`App` 内(または新設の上位コンポーネント)で `view` 状態により切替。ゲーム内フェーズは `useReducer` の判別共用体 | 追加依存ゼロ。既存e2e無影響(既定viewを従来画面にする)。実装最小 | ゲーム画面へ直接飛べない(e2eは「ボタンを押して遷移」を毎回行う)、ブラウザの戻る操作が効かない | 小規模で十分 |
| B: 自前のハッシュ切替(`location.hash` + `useSyncExternalStore`、数十行)。`main.tsx` で `#/baseball` ならゲーム、それ以外は従来の `<App/>` を描画 | 追加依存ゼロ。**`App.tsx` はほぼ無改変**(従来画面に `<a href="#/baseball">` を1つ足すだけ)。`page.goto("/#/baseball")` でe2eがゲームへ直行できる。戻る操作・リロードに耐える | 自前ルーティングの保守(ただし画面2つなので軽い)。`frontend-designer` 標準の `routes/` 層を名目上だけ満たす形になる | 推奨(Aの上位互換) |
| C: `react-router`(v7)導入(`/` 従来、`/baseball` ゲーム) | `frontend-designer` の標準構成(`routes/`)に正式に乗る。画面が今後増えるなら拡張性が高い | 新規依存(lockfile更新、バンドル増。サイズは二次情報が割れており14KB〜60KB gz超と未確定=未計測)。本番ホスティングでSPAフォールバック設定が要る(Vite dev serverは既定でフォールバックする)。画面2つには過剰 | 画面が増える見込みがあるなら再検討 |

どの案でも: ゲームの画面に従来と同じ `<h1>loop-basic sample app</h1>` を重複して出さない(`getByRole("heading", {name})` は strict mode で複数一致するとエラー)。

### Q6. Knip・依存・CI・backend への影響

- **Knip(report-only)**: 新規ファイルは `main.tsx` からのimportグラフで到達する限り未使用扱いにならない。**frontendに `vitest` をdevDependenciesとして追加すると Knip の Vitest プラグインが有効化され、`*.test.ts` がentry扱いになる**(追加しない場合、テストファイルが未使用ファイル、そこからしか使われないexportが未使用exportとして報告されうる)。barrel(`index.ts`)の過剰exportは未使用export報告の元。いずれも非ブロッキングで `/test`・`code-reviewer` の判定材料にしない(`knip-dead-code-detection` の決定どおり)。
- **新規依存**: 案(b)+T1/T2なら新規パッケージは実質なし(`vitest ^3.0.4` は既にlockfile上 3.2.7 でbackendが使用中。frontend/package.jsonに宣言を足し、lockfileの `frontend` エントリが更新される)。描画はA(DOM/SVG)ならゼロ依存。ルーター(案C)・ゲームライブラリ(Q3のC)・状態管理(S3)を選んだ場合のみ追加。vitest 3.x と vite 6.x の組み合わせはbackend/frontendで同一のvite(6.4.3)に解決される。**依存を足したら必ず `package-lock.json` を同期**(CIは `npm ci`)。
- **CI**: `ci.yml` の変更は原則不要。`checks` は typecheck(frontendの新規ファイルとテストを含む)→ lint(最大リスク: 上記の厳しいルール)→ `npm run test`(ルートscriptをfrontend対象に変更した場合のみfrontendが走る)→ build(`vite build`)。`e2e` は `e2e/*.spec.ts` を追加すれば自動で実行される。1試合のe2eは時間がかかりうる(Playwrightの既定タイムアウト30秒/test)ので、(1) `page.clock` を使う(`page.clock.install()` 後 `runFor`/`fastForward`。公式ドキュメント上 `requestAnimationFrame`/`cancelAnimationFrame`/`performance` が制御対象に挙がっている。ゲームループとの実動作は未検証)、(2) `?seed=`・`?innings=1`・アニメ短縮などテスト用クエリで試合を短く決定的にする、のいずれかを設計で用意するのが現実的。
- **backend**: **MVPでは不要**。ゲームロジックはfrontendで完結し、Vite proxy(`/api`)もdev serverのみで本番配信手段は未定義。任意の拡張として「試合結果保存API」(`POST /api/baseball/results`, `GET .../results`)を作る場合は `shared-types-and-dto-validation` どおり、型を `shared/src/` に追加 → backendにclass-validator DTO(ネストは `@ValidateNested`+`@Type`)+薄いcontroller+純粋関数 → 保存先はDB無し(インメモリ、再起動で消える)か、backend不要の `localStorage`(frontend側で境界を型ガード検証)。いずれも**ゲームがbackend無しでも遊べること**(保存失敗を握りつぶさず非致命として扱う)を要件にするのが安全。

## 推奨アプローチ

(推奨案の提示であり最終決定は設計フェーズ/人間に委ねる)

1. **配置**: 純粋ロジックは `frontend/src/features/baseball/model/` に置き、`*.test.ts` をコロケーション(`pricing.ts`/`pricing.test.ts` と同形)。ReactのグルーはFSD由来の `hooks/`、表示は `ui/`。backendは触らない。結果保存を入れる場合のみ、永続化する型を `shared/src/` に追加。
2. **ロジック設計**: 「関数コア+命令的シェル」。ゲーム状態は不変オブジェクト、`reduce(state, action)` と `advance(state, dtMs)`、判定関数(スイング時刻・座標は引数)、CPU AIはすべて純粋関数。**乱数は状態に含めたシード付きPRNG(R1)**。`Math.random` は使わない。
3. **テスト**: frontendに `vitest`(`^3.0.4`)を足し、**別ファイル `vitest.config.ts`(T1)で `include: ["src/**/*.test.{ts,tsx}"]`、`environment: "node"`**。ルート `test` をbackend+frontend対象に変更。e2eは `e2e/baseball.spec.ts` を追加し、`?seed=`/短縮モード/`page.clock` で決定的・短時間に。
4. **描画**: **A(React DOM+SVG)**。スコアボード・カウント・操作ボタン・ダイヤモンド・ストライクゾーンはDOM/SVG(`data-testid` と `aria-live` のログでe2e検証)。連続値(ボール、カーソル)はref+rAF内の `style.transform` で更新。Canvas/ゲームライブラリは見送り(ロジックが純粋関数で分離されていれば、後から描画層だけ差し替え可能)。
5. **状態**: `useReducer`(離散)+ refs(連続)。rAFはStrictMode対応のcleanup付きeffect、最新値は `useEffectEvent`(React 19.2.8で利用可)。
6. **入力**: Pointer Events+`touch-action: none`+キーボード(Space/矢印)。座標は正規化してモデルへ。時刻は引数。タッチ操作の仕様(離して打つ/ボタン)は設計で決める。
7. **画面遷移**: ゲーム内フェーズは `useReducer` の判別共用体。トップレベルの従来画面とゲームの切替は **B(ハッシュ切替、`App.tsx` 無改変に近い)**。`/` は従来画面のまま既存e2eを維持。
8. **lint対策**: 変数添字を使わない(`for...of`/`.map`/`.at()`/`Map`/`switch`)、`Math.random` 不使用、コンポーネントとreducerを小さく分割、`TODO` コメント禁止。**実装の最初のステップで小さな試験ファイルを `npx eslint` にかけて本書の読解結果(特に `detect-object-injection` と `pseudo-random`)を実測**し、真に必要な場合のみ `eslint.config.mjs` に理由付きのパス限定例外を足す。

## 制約・リスク

- **静的解析が最大のリスク**: error化済みの `security/detect-object-injection`(構文のみ判定)、`sonarjs/pseudo-random`(`Math.random()`全面禁止)、`cognitive-complexity 15`、`todo-tag` が、ゲームで典型的な書き方(グリッド添字、乱数、巨大switch、TODOコメント)に直撃する。違反するとCIの `checks` が落ちて `e2e`(`needs: checks`)も走らない。本書は未実測のため、実装初手での実測が必須。
- 既存e2e(`home.spec.ts`)を壊さない制約: `/` の従来画面、見出し1つ、`data-testid` を維持。`App.tsx` への変更は最小(リンク1つ程度)に留める。
- **StrictModeのreducer/updater二重呼び出し**とrAFの二重起動(開発時のみ)。純粋性違反と cleanup 漏れが開発時だけ表面化する。
- **sharedのランタイムimport経路が未検証**(sharedへロジックを置く案(a)を採る場合のみ該当)。backend(commonjs, `main` が `.ts`)からは失敗しうる。
- タイミング精度: rAFは約16.7ms刻みで、`event.timeStamp` とフレーム時刻のどちらをスイング時刻に使うかで判定結果が変わりうる。`page.clock` の制御下で決定的にするなら `performance.now()` 系。ゲームメカニクス側の許容幅設計と合わせて決める必要がある(メカニクス担当との接点)。
- `eslint-plugin-react-hooks` 未導入のため、hooksの依存配列ミスをlintが検出しない。
- バンドルサイズ数値(Phaser/Pixi/ルーター)は二次情報で未計測。採用検討時は bundlephobia かビルド実測で確認すること。
- 変更が必要になる周辺ドキュメント: `sample-app/README.md`(「実行方法」の `npm run test` 説明・構成図)、`docs/process/sample-app-dev.md`(自動テスト行)、`ci.yml` のstep名(任意)。

## 未解決の疑問・要確認事項

1. 実測(実装初手): `npx eslint` で (i) `grid[r]` のようなコードがerrorになること、`.at()`/`Map` 版が通ること、(ii) `Math.random()` がerror、`Math.random` を参照として渡すだけなら通るか、(iii) `crypto.getRandomValues` 由来のシード生成が通ること、(iv) `max-lines-per-function` が実際にJSX行を数えること、を確認する。
2. フロントエンドでのランタイム `import ... from "@sample-app/shared"` が Vite dev/build/vitest で動くか(型のみ共有なら不要)。
3. 試合結果の保存(backend API / localStorage / しない)を要件に含めるか → 人間判断。
4. タッチ端末(スマホ)を正式サポート対象にするか。対象ならタッチ操作仕様とPlaywrightのモバイルprojectが必要。
5. ルーター(react-router)を導入して標準構成の `routes/` 層に乗せるか、ハッシュ切替(B)で済ませるか。
6. e2eで1試合を通す粒度(1イニング固定の短縮モードを用意するか、`page.clock` で時間を進めるか)と、そのテスト用フック(`?seed=`、`?innings=`)の仕様。
7. ルート `npm run test` を全workspace対象にした際の `README.md`/`sample-app-dev.md`/ci.yml step名の更新範囲。
8. スイング時刻の取得源(`performance.now()` か `event.timeStamp` か)— メカニクス担当の許容幅と整合させる。

## 参考資料

- リポジトリ内(実読): `sample-app/{package.json,README.md,eslint.config.mjs,knip.jsonc,tsconfig.base.json,.prettierrc}`、`sample-app/{shared,backend,frontend}/package.json`、`sample-app/frontend/{vite.config.ts,playwright.config.ts,tsconfig.json,index.html,src/App.tsx,src/main.tsx,e2e/home.spec.ts}`、`sample-app/backend/src/logic/{pricing.ts,pricing.test.ts}`、`.github/workflows/ci.yml`、`docs/process/sample-app-dev.md`、`.claude/agents/frontend-designer.md`、`docs/memory/entries/{pure-function-extraction,shared-types-and-dto-validation,eslint-strictness-ratchet-v2,knip-dead-code-detection}.md`
- ルール実装(実読、`sample-app/node_modules/`): `eslint-plugin-security/rules/detect-object-injection.js`、`eslint-plugin-sonarjs/cjs/S2245/rule.js`(pseudo-random)、`cjs/helpers/module.js`(getFullyQualifiedName)、`cjs/S3735/rule.js`(void-use)、`cjs/S3776/rule.js`(cognitive-complexity 既定15)、`cjs/S2004/rule.js`(no-nested-functions 既定4)、`cjs/S6759/rule.js`(型情報なしだと無効)、`eslint-plugin-sonarjs/README.md`(recommended一覧)
- Vitest 設定(`include` 既定値、`vitest.config.ts` が `vite.config.ts` より優先): https://vitest.dev/config/include 、https://vitest.dev/config/file
- Vitest と Playwright の同居(specを拾う問題): https://content.noroff.dev/workflow/vitest-playwright-together.html
- React 19.2 / `useEffectEvent`(二次情報): https://blog.logrocket.com/react-19-2-is-here/ 、https://www.infoq.com/news/2025/10/meta-ships-react-19-2 (公式: https://react.dev/blog/2025/10/01/react-19-2、このセッションからは取得不可だった)
- Playwright Clock(`requestAnimationFrame`/`performance` を制御対象に含む): https://playwright.dev/dotnet/docs/clock 、https://playwright.dev/java/docs/clock (Node版: https://playwright.dev/docs/clock)
- Pointer Events / `setPointerCapture` / `touch-action`: https://developer.chrome.com/blog/pointer-events/ 、https://javascript.info/pointer-events 、MDN `Element.setPointerCapture`
- 決定的PRNG(mulberry32 / sfc32): https://github.com/bryc/code/blob/master/jshash/PRNGs.md
- ゲームライブラリのサイズ比較(二次情報・未計測): https://pixijs.com/blog/pixi-v8-launches 、https://abratabia.com/pixijs/pixijs-vs-phaser.php
- rAFループ/StrictMode の一般論(二次情報): https://reactuse.com/blog/react-render-loop-hooks/

---
次のアクション: `/design` で設計フェーズに進む(その前に、本書「未解決の疑問」1の eslint 実測を実装初手に組み込むこと)
