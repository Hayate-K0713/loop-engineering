# 設計: sample-app への Knip 導入(レポートのみ・非ブロッキング)

- 日付: 2026-08-12
- ステータス: 承認済み
- 対応する調査ドキュメント: [docs/investigations/2026-08-12-introduce-knip.md](../investigations/2026-08-12-introduce-knip.md)
- 承認者: kurumaebi
- 承認日: 2026-08-13

## ツール制約に関する注記(重要)

この設計書は、調査ドキュメントで「未解決の疑問」として挙げられていた `npx knip` の実地試し打ちを、**designerサブエージェントの利用可能ツールにBashが含まれていなかったため実行できなかった**上で作成している。代わりに、`sample-app` 配下の全関連ソース(`package.json`各種、`tsconfig.*`、`nest-cli.json`、`eslint.config.mjs`、`shared`/`backend`/`frontend`の全TS/TSXファイル、`vite.config.ts`、`playwright.config.ts`、`.github/workflows/ci.yml`)を実際に読み、import/exportグラフを手動でトレースして誤検知の可能性を評価した。以下の`knip.jsonc`案はこの静的読解に基づく最有力案だが、**実装ステップ1を「実際に `npx knip` を実行して仮説を検証・調整する」ステップとして必須化**することで、調査ドキュメントが求めていた「試し打ち」を実装フェーズの最初に確実に行わせる設計にしている。implementerはこのステップの結果次第で、本設計の`knip.jsonc`案を(スコープの範囲内で)微調整してよい。

## 目的・スコープ

### やること

- `sample-app` に Knip を **レポートのみ・非ブロッキング** で導入する(CLAUDE.md「静的解析・自動チェックの考え方」の「重複コード検出・デッドコード検出は、導入するならまずレポートのみから始める」方針に従う)。
- `sample-app/knip.jsonc` を新規作成し、npm workspaces(`shared`/`backend`/`frontend`)構成に合わせたentry/project/ignore設定を行う。
- `sample-app/package.json` に `knip`・`knip:report` の npm script と `knip` devDependency(バージョン範囲 `^5.0.0`)を追加する。
- `.github/workflows/ci.yml` に、既存の `checks`/`e2e` ジョブとは独立した非ブロッキングな `knip` ジョブを追加する。
- 導入時点で実際に `npx knip` を実行し、誤検知(false positive)は `knip.jsonc` の `ignore`/`ignoreDependencies`/`entry` で調整し理由をコメントで残す。真陽性(true positive)は抑制せずレポートの指摘として残す(詳細はステップ1参照。指摘0件は完了条件ではない)。
- 決定事項を共有メモリの新規decisionエントリとして記録する。

### やらないこと(スコープ外)

- Knipの指摘をブロッキング化する(`error`扱いにする、CI必須チェックにする)判断。今回はレポートのみに留め、将来のratchet判断は別topicに委ねる。
- PRコメント投稿等のサードパーティAction連携(調査の選択肢D)。今回は選択肢Bのみ採用する。
- 既存コードの「デッドコード」自体の削除・リファクタリング。Knipが指摘を出しても、レポートを見るだけに留め、コード変更はしない(誤検知調整のための`knip.jsonc`側の変更は除く)。
- `eslint.config.mjs` 側のルール変更。Knipとは独立したツールであり、ESLintの `sonarjs`/`security` 設定等には手を入れない。
- **Knipの指摘を `/test` の合否判定や `code-reviewer` の判定材料として使うこと。** Knipはreport-only運用であり、CLAUDE.mdの「構成されているチェックは必須で実行する…失敗はそのまま不合格/MAJORの理由になる」という原則が前提とする"ブロッキング(error)まで昇格したチェック"には該当しないため、本設計で明示的にスコープ外とする(詳細は「テスト戦略」節の注記)。

## アーキテクチャ・変更概要

| ファイル | 変更内容 |
| --- | --- |
| `sample-app/knip.jsonc`(新規) | npm workspaces構成に合わせたKnip設定。下記「knip.jsonc案」参照。 |
| `sample-app/package.json` | `devDependencies` に `knip`(バージョン範囲 `^5.0.0`)を追加。`scripts` に `knip`・`knip:report` を追加。 |
| `sample-app/package-lock.json` | `npm install` により自動更新(implementerが `npm install` 実行時に反映)。 |
| `.github/workflows/ci.yml` | 独立した `knip` ジョブを新設(`continue-on-error: true`、`needs`なし、既存 `checks`/`e2e` ジョブには一切手を入れない)。 |
| `sample-app/README.md` | 「実行方法」「この構成が示している方針」への追記(**必須**。Knipがreport-only運用であり`/test`の合否・`code-reviewer`の判定材料に使わない旨も含める。詳細はステップ4)。 |
| `docs/memory/entries/knip-dead-code-detection.md`(新規) | 本トピックの決定を記録するdecisionエントリ。**designerが設計時に作成済み。implementerの対応は不要。** |
| `docs/memory/entries/eslint-strictness-ratchet-v2.md` | `related_topics` に `introduce-knip` を追記。**designerが設計時に追記済み。implementerの対応は不要。** |
| `docs/memory/MEMORY.md` | decisionセクションに新規エントリへのリンクを1行追加。**designerが設計時に追記済み。implementerの対応は不要。** |

### `knip.jsonc` 案

```jsonc
// sample-app/knip.jsonc
{
  "$schema": "https://unpkg.com/knip@5/schema-jsonc.json",
  "workspaces": {
    ".": {
      // ルート直下にアプリのソースはないが、eslint.config.mjs がルートの
      // devDependencies(eslint/sonarjs/security/prettier/typescript-eslint等)を
      // importして使っている。project/entryを空のままにすると、これらが
      // 「未使用の依存関係」として誤検知される可能性があるため明示的に含める。
      "entry": ["eslint.config.mjs"],
      "project": ["eslint.config.mjs"]
    },
    "shared": {
      // src/index.ts はバレルファイルであり @sample-app/shared パッケージの公開API。
      // entryに指定することで、index.ts自身のexportは
      // 「未使用エクスポート」の対象から除外される(Knipのentry file既定挙動)。
      "entry": ["src/index.ts"],
      "project": ["src/**/*.ts"]
    },
    "backend": {
      // main.ts → app.module.ts → 各Controller/Serviceの依存グラフが起点。
      // vite: false(下記)にするとVite/Vitestプラグイン既定のテストentry検出が
      // 失われるため、*.test.ts を明示的にentryへ加えておく。
      "entry": ["src/main.ts", "src/**/*.test.ts"],
      "project": ["src/**/*.ts"],
      // backendは vitest をテストランナーとしてのみ使用し、Viteバンドラは使わない
      // (vite.config.ts が存在しない)。Knip の Vite プラグインは `vitest` の
      // devDependency存在だけで自動有効化されてしまうため、存在しない設定を
      // 探しに行くことによるノイズを避けるために明示的に無効化する。
      "vite": false,
      // @nestjs/platform-express と rxjs は、この最小構成のコードからは
      // 直接importされない(NestFactory.create()がplatform-expressを内部で
      // 動的に解決し、rxjsはNestJSの内部実装が利用する)。どちらもNestJSアプリの
      // 一般的な暗黙依存であり、実際に不要というわけではないため無視する。
      "ignoreDependencies": ["@nestjs/platform-express", "rxjs"]
    },
    "frontend": {
      // index.html → src/main.tsx のエントリ解決をKnipが自動で辿れるかは未検証のため
      // 明示。playwright.config.ts・e2e/**.spec.ts もentryに含め、
      // Playwrightのテストコードを「未使用ファイル」として誤検知しないようにする。
      // entryに含めたconfigファイルはprojectのサブセットになるよう、
      // vite.config.ts / playwright.config.ts をprojectにも明示的に含める。
      "entry": ["src/main.tsx", "vite.config.ts", "playwright.config.ts", "e2e/**/*.spec.ts"],
      "project": ["src/**/*.{ts,tsx}", "e2e/**/*.ts", "vite.config.ts", "playwright.config.ts"]
    }
  },
  // ESLintの ignores (eslint.config.mjs) と揃える。ビルド・テスト成果物を
  // 解析対象に含めると誤検知・実行時間増の原因になる(node_modules自体はKnipが
  // 既定でも除外するが、ESLintのignoresとの対応関係を明示するため揃えて記載する)。
  "ignore": ["**/dist/**", "**/node_modules/**", "**/coverage/**", "**/playwright-report/**", "**/test-results/**"]
}
```

補足(手動コードリーディングで確認できた根拠、実装ステップ1で裏取りする前提):

- `shared/src/quote.ts`(`QuoteInput`/`QuoteResult`)・`shared/src/health.ts`(`HealthResponse`)は、いずれも `backend`(`quote-query.dto.ts` が `QuoteInput` を、`health.controller.ts` が `HealthResponse` を、`logic/pricing.ts` が `QuoteInput`/`QuoteResult` を再exportしつつ直接import)・`frontend`(`App.tsx` が `HealthResponse`/`QuoteResult` を直接import)の双方から実際に使われている。`@sample-app/shared` はnpm workspacesのシンボリックリンク経由で解決されるため、Knipのモノレポ対応が正しく機能する前提であれば「未使用」と誤検知されないはず。
- `backend`のDIクラス(`HealthController`・`QuoteController`・`QuoteService`)はいずれも通常のTypeScript `import` 文で他ファイル(`app.module.ts`・`quote.controller.ts`)から参照されている(NestのDIは実行時解決だが、静的な`import`自体は存在する)。よってKnipの一般的な「未使用エクスポート」判定でも使用済みと認識されるはずで、調査ドキュメントが懸念していた `ignoreExportsUsedInFile` 相当の追加設定は、少なくとも現状のコードでは不要と判断した(このオプションは「同一ファイル内でのみ使われるexport」を許容する設定であり、NestのDIパターン救済とは意味が異なるため、根拠のない先回り設定はしない)。実行して誤検知が出た場合のみ、実装ステップ1で個別に追加する。
- `class-transformer`・`class-validator`・`reflect-metadata` はいずれも `quote-query.dto.ts`・`main.ts` で直接importされているため誤検知の可能性は低い。

## 実装ステップ

実装順に並んだチェックリスト。`/implement` はこの順序で着手する。**ステップ1とステップ2はいずれも `sample-app/package.json` を変更する(ステップ1は`knip`devDependency追加、ステップ2はnpm script追加)ため、`/implement`が`TaskCreate`でタスク分割する際は`addBlockedBy`等で依存関係を明示し順序化すること(同一ファイルを変更する複数タスクは並列化不可というCLAUDE.mdの方針に従う)。**

- [x] ステップ1(必須・最優先・試し打ち): ローカル環境のNodeバージョンが `v20.19.0` 以上であることを `node -v` で確認する(CIは`node-version: 22`のため問題ないが、ローカル実行環境でも確認しておく)。`sample-app/package.json` に `knip` をdevDependency(バージョン範囲 `^5.0.0`)として追加し `npm install`(sample-appルートで実行)。上記の `knip.jsonc` 案を `sample-app/knip.jsonc` として作成し、`cd sample-app && npx knip` を実行する。出力を確認し、**指摘0件は完了条件ではない**ことを前提に、指摘ごとに以下の3分岐で判断する:
  - **(a) 誤検知(false positive)と判断できる場合**: 「上記補足に書いた既知の使用箇所」と矛盾する、またはKnipが追跡し損ねているだけと判断できる場合は、`knip.jsonc` 側の `entry`/`project`/`ignore`/`ignoreDependencies` で個別に調整し、理由をコメントとして残す(コード自体は変更しない)。
  - **(b) 真陽性(true positive)、つまり実際に未使用と判断できる場合**: `knip.jsonc` 側で抑制しない。指摘としてそのまま残し、レポートに現れる状態を維持する(このステップではコードの削除・リファクタリングは行わない。スコープ外)。
  - **(c) 誤検知か真陽性か判断がつかない場合**: 抑制せず保留する(不確実な状態のまま握りつぶさない)。判断材料が今後増えた時点で別途対応する。
  - 具体的に確認する項目:
    - `backend` の `ignoreDependencies`(`@nestjs/platform-express`・`rxjs`)が実際に指摘されるか確認する。指摘されない場合は `ignoreDependencies` エントリを削除してよい(不要な抑制を残さない)。
    - `backend` で `vite: false` により Vite/Vitest プラグイン関連のノイズが出ていないか確認する。Knip 5では`vite`プラグインと`vitest`プラグインが別々に有効化される可能性があるため、`vitest`プラグインの有効/無効も含めて実際の挙動を確認し、`vite: false`が意図通り機能しているか、あるいは`vitest: false`も別途必要か確認する。`ignoreDependencies`と同様、効果がなければ`vite: false`エントリを削除してよい(不要な設定を残さない)。
    - `"."`(ルートワークスペース)の `eslint`/`eslint-config-prettier`/`eslint-plugin-prettier`/`eslint-plugin-security`/`eslint-plugin-sonarjs`/`prettier`/`typescript-eslint`/`typescript` が unused dependencies として誤検知されないか確認する(ルートには`tsconfig.json`がなく`tsconfig.base.json`のみのため、`typescript`は特に誤検知されやすい)。誤検知されれば `ignoreDependencies` に追加する。
    - ルートワークスペースで `npx knip` 実行時に型解決関連の警告が出ないか確認する。`@types/node` は `backend` のみのdevDependencyであり、ルート・`shared`・`frontend`には存在しない(ルートは`typescript`のみ)。Knip公式は`knip`+`typescript`+`@types/node`の同時導入を前提にしているため、この非対称な構成が警告の原因にならないか確認し、必要であれば対応を検討する(対応が必要な場合の具体策は実行結果を見てから判断する)。
    - `@sample-app/shared` へのワークスペース間参照が unresolved / unused と誤判定されないか確認する。
  - 上記調整はすべて `knip.jsonc` 側で行い、理由をコメントとして残す(CLAUDE.mdの「例外はインラインではなく設定ファイルに理由付きで書く」方針に従う)。ブロッキング化は行わない(exit codeを気にする必要はないが、指摘内容そのものは正確に保つ)。
  - 実行結果を、下記「ステップ1 試し打ち結果」節に記録する。これはステップ1の完了条件の一部である。
- [x] ステップ2: `sample-app/package.json` の `scripts` に以下を追加する。
  - `"knip": "knip"`(ローカルで通常のexit codeのまま実行する版。手元で今すぐ直したい時に使う)
  - `"knip:report": "knip --no-exit-code"`(CIから呼ぶ、常にexit code 0で終わる版)
- [x] ステップ3: `.github/workflows/ci.yml` に、既存の `checks`・`e2e` ジョブとは独立した `knip` ジョブを追加する(下記「CI組み込み案」参照)。既存2ジョブの内容には一切手を加えない。
- [x] ステップ4(必須): `sample-app/README.md` の「実行方法」に `npm run knip:report` の一行、「この構成が示している方針」に「デッドコード・未使用依存の検出(Knip)もレポートのみ・非ブロッキングから始める」旨の一行を追記する。あわせて、**Knipの指摘は `/test` の合否判定にも `code-reviewer` の判定材料にも使わないこと**(report-only運用であるため)を明記する一文を追加する(本設計の「やらないこと」節・「テスト戦略」節の決定を、実装対象のドキュメントにも反映する)。
- [x] ステップ5: ローカルで `cd sample-app && npm run typecheck && npm run lint && npm run test && npm run build` が今までどおり通ることを確認する(Knip導入が既存チェックに影響しないことの確認)。
- [x] ステップ6: `git add -A && git status` で意図した差分のみが含まれることを確認する。**このステップの範囲はここまで(差分確認のみ)。実際の `git commit` はimplementerではなく、メインエージェントがタスク完了報告を受けてから行う**(CLAUDE.mdの「実装フェーズのタスク分割・並列化」節: 並列dispatch中のimplementerは自分でコミットしない)。

### ステップ1 試し打ち結果(実装時に記入)

実装ステップ1の完了条件の一部として、`npx knip` 実行結果の概要をimplementerがここに記録する。

| 項目 | 内容 |
| --- | --- |
| 実行日時 / knipバージョン | 2026-08-13 / knip 5.88.1(`sample-app/package.json`の`^5.0.0`範囲内、`node -v` は v22.16.0 でNode要件 `v20.19.0` 以上を満たす) |
| 総指摘件数 | 設計案の`knip.jsonc`をそのまま実行した初回結果は「issues: 0件」「configuration hints: 14件」(exit code 0)。issuesは終始0件(未使用ファイル・未使用export・未使用依存・未解決import等は一度も検出されず)。configuration hintsは調整により最終的に0件まで解消。 |
| (a) 誤検知として `knip.jsonc` 側で調整した件数と内訳 | 14件すべてが「誤検知」ではなく「Knipの既定プラグイン検出と重複する冗長設定」という単一カテゴリの指摘だった。個別に`npx knip --debug`で実際の自動検出結果を確認しながら1件ずつ削除・検証し、最終的に全14件を解消(内訳: `ignore`のビルド/テスト成果物パターン5件→`project`グロブが`src/**/*.ts`等に限定されており元々スキャン対象外のため全削除、`backend.ignoreDependencies`の`@nestjs/platform-express`/`rxjs`2件→実際には未使用として指摘されないため削除、ルート`.`のeslint.config.mjs向け`entry`/`project`2件→KnipのESLintプラグインが自動検出するため削除、frontendの`entry`/`project`のうち`vite.config.ts`/`playwright.config.ts`/`src/main.tsx`/`e2e/**/*.spec.ts`関連5件→Vite/Playwrightプラグインの既定検出でカバーされるため削除)。あわせて、config hintには現れなかったが個別検証で無効と確認できた`backend.vite: false`(Vite/Vitestは別プラグインで、vitestのテストentry検出は`vite:false`の有無に関わらず機能する)と`backend.entry`の`src/**/*.test.ts`明示指定(Vitestプラグインの既定パターンで自動検出される)も同様の理由で削除した。すべて`knip.jsonc`のコメントに理由を記録済み(コードは無変更)。 |
| (b) 真陽性としてレポートに残した件数と内訳 | 0件(実コードの未使用ファイル・未使用export・未使用依存は一度も検出されなかった)。 |
| (c) 判断保留として残した件数と内訳 | 0件。 |

補足: 最終的な`knip.jsonc`は各ワークスペース(`.`/`shared`/`backend`/`frontend`)を空のオーバーライド(`{}`)で列挙するだけの構成になった。設計案は静的読解(Bashツールなし)に基づく慎重な個別指定だったが、実地試し打ちの結果、Knipの各プラグイン(ESLint/TypeScript/Node.js/Nest/Vite/Vitest/Playwright/Prettier)の既定の自動検出だけで本構成(npm workspaces + 各種標準的な設定ファイル配置)を過不足なくカバーできることが判明したため。念のため`npx knip --include files,dependencies,unresolved,exports,types,duplicates,unlisted --reporter json`でも`{"files":[],"issues":[]}`を確認し、`@sample-app/shared`へのワークスペース間参照のunresolved/unused誤判定、ルートワークスペースの`@types/node`非対称構成(backendのみ)に起因する型解決警告も発生しないことを確認した。既存の `npm run typecheck` / `npm run lint` への影響もないことを確認済み(ステップ5で再確認予定)。

### CI組み込み案

```yaml
  knip:
    name: Knip (dead code / unused deps report, non-blocking)
    runs-on: ubuntu-latest
    # レポートのみ・非ブロッキング。knip自体が --no-exit-code で常にexit 0を返す上に、
    # continue-on-error でも二重に非ブロッキング化しておく(CLAUDE.mdの
    # 「新しいルールは初日からブロックしない」方針)。checks/e2eジョブの成否とは無関係に
    # 実行してよいため needs は付けない。
    continue-on-error: true
    defaults:
      run:
        working-directory: sample-app
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: sample-app/package-lock.json

      - run: npm ci

      - name: Knip (dead code / unused deps report)
        run: npm run knip:report
```

既存の `checks`・`e2e` ジョブへの追記は一切行わない(混ぜない理由: 調査ドキュメント「推奨アプローチ」節、およびCLAUDE.mdの「既存ジョブは失敗=マージ不可を意味する」考え方)。

## テスト戦略

- 何をもって「完了」とするか:
  - (a) `sample-app/knip.jsonc` が存在し `npx knip` がエラーなく完走する(exit codeによらず、ツール自体がクラッシュしないこと)。
  - (b) `npm run knip`・`npm run knip:report` がそれぞれ想定どおりのexit code(前者は指摘があれば非0、後者は常に0)で動く。
  - (c) 既存の `npm run typecheck`/`lint`/`test`/`build` がKnip導入前後で結果が変わらない(影響を与えない)。
  - (d) `.github/workflows/ci.yml` がYAMLとして正しくパースでき、追加した `knip` ジョブの定義に `continue-on-error: true` が設定されており、かつ `needs` キーが存在しない(既存の `checks`/`e2e` ジョブと依存関係がない)ことをローカルで確認できること。

  **注記(Knipの指摘を合否基準に含めない理由)**: 上記(a)〜(d)のいずれの完了基準にも、Knipの**指摘件数・内容そのもの**は含めない。`npx knip`/`npm run knip` が指摘を返すこと自体を `/test` の不合格理由にも `code-reviewer` の `MAJOR` 判定材料にもしない。CLAUDE.mdの「構成されているチェックは必須で実行する…失敗はそのまま不合格/MAJORの理由になる」という原則は、`error`(ブロッキング)まで昇格したチェックを対象にしたものであり、本設計で明示的にreport-only・非ブロッキング運用と定めたKnipはこの原則の対象外とする(この決定はステップ4でREADMEにも明記し、`docs/memory/entries/knip-dead-code-detection.md` にも記録する)。

- 手動確認手順(CLAUDE.md「手動確認の使い分け」に従う。今回はAPI/UIの変更ではなくCI設定・ツール導入のため、該当する既存カテゴリに厳密には当てはまらないが、最も近い「バッチ処理・スクリプト等」の扱いとして直接コマンド実行で確認する):
  1. `cd sample-app && npx knip` を実行し、出力(指摘件数・内容)を確認する。
  2. `cd sample-app && npm run knip:report; echo "exit=$?"` を実行し、`exit=0` になることを確認する(指摘があってもCIで落ちないことのローカル再現)。
  3. `.github/workflows/ci.yml` をYAMLとして構文チェックする(例: リポジトリルートで `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` を実行、あるいはエディタ/`actionlint`等のYAML lintでも可)。あわせて、追加した `knip` ジョブの定義に `continue-on-error: true` があり `needs` キーが存在しないことを目視で確認する。
  4. **(事後確認。`/test`フェーズの完了基準には含めない)**: ゲート2承認後にベースブランチへマージされ、次のCIが実行された際に、`knip` ジョブが `checks`・`e2e` ジョブとは独立して実行され、指摘の有無に関わらずワークフロー全体が成功扱いになることを確認する。このプロジェクトの運用ではトピックブランチはpush/PR作成をせずローカルで`git merge`されるため(`ci.yml`のトリガーは`push: [main]`/`pull_request`のみ)、`/test`フェーズの時点では実CI実行を検証できない。この確認は分離し、事後確認として扱う。

**自動テストを新規作成するか:** しない(理由: 今回の変更は静的解析ツール(Knip)自体の導入とCI設定変更であり、sample-appのアプリケーションコード・ビジネスロジックには一切変更がない。検証対象は「Knipが正しく実行され、非ブロッキングであること」というCI設定・ツール実行の振る舞いそのものであり、これは既存の自動テストスイート(vitest/Playwright)が検証する対象外。テスト戦略の(a)〜(d)は、上記の手動確認手順(`npx knip`の実行結果確認、`npm run knip:report`のexit code確認、`ci.yml`のYAML構文チェックと`knip`ジョブ定義の目視確認)によって`/test`フェーズ内でローカルから直接検証する。前述のとおりトピックブランチはpush/PR作成をせずローカルで`git merge`されるため、`/test`フェーズの時点では実際のCI実行(push/PRトリガー)自体を検証対象にはできず、実CI実行での動作確認は手動確認手順4の事後確認として分離している。新たにvitest/Playwrightのテストケースを追加する対象がない)。

## リスク・トレードオフ

- **誤検知によるレポートの形骸化**: `knip.jsonc` の設定不備で誤検知が多発すると、「レポートを見る」行為自体が無視されるようになるリスクがある。実装ステップ1で試し打ちし、明白な誤検知は個別に潰すことで軽減する。ただし全ての誤検知を導入初日に潰しきる保証はなく、継続的な調整が必要になる可能性がある。
- **可視性の低さ(選択肢Bの本質的なトレードオフ)**: PRコメント等の能動的な通知(選択肢D)を採用しないため、CIログを能動的に見に行かない限り指摘に気づかれない。今回はスコープ外としたが、Knipのレポートが継続的に無視される状況が続く場合、将来PRコメント連携や `report → error` ratchetへの昇格を再検討する価値がある。
- **CI実行時間の増加**: 新規ジョブ1つ分、CI全体の総実行時間はわずかに増える(`checks`/`e2e`とは独立ジョブのため、並列実行され全体のクリティカルパスへの影響は小さい想定)。
- **Knipのバージョン追従**: `knip.jsonc` の `$schema` は `knip@5` の範囲を指すのみでパッチバージョンを固定しない。`package.json` の devDependency も `^5.0.0` という範囲指定に留める。将来のKnipのマイナー/メジャーアップデートで検出ロジックが変わり、指摘内容が増減する可能性があるが、非ブロッキング運用のため実害は小さい。
- **`ignoreDependencies`/`vite: false` 等の抑制が将来の実コード変更で陳腐化するリスク**: 例えば将来backendが本当にViteを使い始めた場合、`vite: false` が誤って有効なチェックを抑制し続ける可能性がある。抑制項目にはコメントで理由を明記しているため、将来のtopicで気づいた際に見直せるようにしてある。

## ロールバック方針

非ブロッキングな追加のみのため、ロールバックは低リスク・低コスト。問題が起きた場合(例: CI実行時間の許容できない増加、`--no-exit-code`/`continue-on-error` の二重設定にもかかわらず何らかの理由でCIがブロックされる不具合等)は以下の手順で切り戻す:

1. `.github/workflows/ci.yml` から `knip` ジョブを削除する。
2. `sample-app/knip.jsonc` を削除する。
3. `sample-app/package.json` から `knip`・`knip:report` scriptと `knip` devDependencyを削除し、`npm install` でlockファイルを更新する。
4. `sample-app/README.md` に追記していた場合は該当行を削除する。
5. 共有メモリの `knip-dead-code-detection` エントリは削除せず、`status: superseded` にして経緯を残す(CLAUDE.mdの記憶運用ルールに従う)。

既存の `checks`・`e2e` ジョブやアプリケーションコードには一切手を加えていないため、ロールバックによる副作用はない。

## スキル化候補の検討

調査ドキュメントが挙げていた「Knip等の新規静的解析ツールはレポートのみ・非ブロッキングから始め、CI組み込みは既存ブロッキングジョブと分離する」という型について検討した。この型は `docs/memory/entries/eslint-strictness-ratchet-v2.md`(および superseded の `eslint-strictness-ratchet`)が確立した「新しいルールはwarn/report-onlyで導入し、drainしてからerrorに昇格させる」というratchet思想の延長線上にあるが、対象が「ESLintルール」ではなく「別ツール(Knip)の新規導入」である点が異なるため、今回は独立した新規decisionエントリ `knip-dead-code-detection` として作成する(調査ドキュメントの未解決事項への回答)。

このエントリの `related_topics` は現時点で `[introduce-knip]` の1件のみであり、スキル化候補の閾値(3topic以上)には遠く及ばない。**スキル化候補には該当しない。** 今後、別のtopicで新規静的解析ツール(例: jscpd等)を導入する際にこのエントリが再度参照・適用されたら `related_topics` に追記し、3件に達した時点で改めてスキル化を検討する。

## 設計レビュー結果

`design-reviewer` による自動レビュー(最大2ラウンド、`/design` 実行時)の記録。

| ラウンド | 判定 | 主な指摘 |
| --- | --- | --- |
| 1 | MAJOR | M1: 実装ステップ1が「指摘0件」を目標にし、真陽性まで`ignore`で抑制させる誘導になっている(真陽性は抑制せず残す分岐＋試し打ち結果の記録を追加すべき)。M2: Knipのバージョン未指定で`$schema`(v5前提)と実インストール版が不整合になり得る。M3: 非ブロッキング性がCIでしか担保されておらず、`npm run knip`(exit≠0)がCLAUDE.mdの「構成されたチェックの失敗=不合格」により`/test`・`code-reviewer`で事実上ブロッキング化し得る(README追記の必須化＋合否に使わない旨の明記が必要)。M4: 完了基準(d)/手動確認3がトピックブランチのpush・PR作成を前提としており`/test`フェーズで検証不能(ローカル検証可能な基準へ置換し、実CI確認はマージ後に分離)。MINOR: メモリ関連3件が変更表にあるが実装ステップにない(designer実施済みの明記)、knip.jsonのコメントはknip.jsonc+schema-jsonc.jsonが安全、ステップ6のコミットはimplementerではなくメインエージェントの担当、ステップ4「省略可」の曖昧さ、`vite:false`とテストentry既定の根拠矛盾、ルート依存チェックに`typescript`漏れ(ルートは`tsconfig.base.json`のみ)、entryがprojectのサブセットでない、ignoreのnode_modules不一致、調査ドキュメントの相互リンク未更新。 |
| 2(ラウンド1がMAJORの場合のみ) | PASS | M1〜M4はいずれも本文に反映済みであることを実読で確認(ステップ1の(a)誤検知/(b)真陽性/(c)保留の3分岐＋「指摘0件は完了条件ではない」＋試し打ち結果記録節、`^5.0.0`とNode v20.19+要件、report-only運用を`/test`・`code-reviewer`の判定に使わない旨の明記＋README追記の必須化、完了基準(d)/手動確認3のローカル検証化と実CI確認の事後分離)。`knip.jsonc`への改名は設計・メモリエントリで全箇所一貫、`knip-dead-code-detection`エントリ・`eslint-strictness-ratchet-v2`のrelated_topics・MEMORY.md索引・調査ドキュメントの相互リンクもすべて反映済み。残MINOR(実装中に吸収可能): (1)「自動テストを作らない」理由文が「既存CI実行が動作確認を兼ねる」と書かれておりM4対応(トピックブランチではCI未実行)と噛み合わない、(2)`vite: false`に「不要なら削除」指示がなく、Knip5では`vitest`が別プラグインの可能性があるためステップ1の確認項目に加えるべき、(3)`@types/node`がbackendのみでルートに無い点がステップ1の確認項目に無い、(4)ステップ1・2が同一ファイル(package.json)変更のため並列化不可である旨の注記が無い。 |

未解決のMAJORが残った場合: なし

### ラウンド1指摘への対応メモ(designer記入)

- **M1**: 実装ステップ1の判断基準を「誤検知(a)/真陽性(b)/判断不能(c)」の3分岐に書き直し、「指摘0件は完了条件ではない」ことを明記した。真陽性は`knip.jsonc`側で抑制せずレポートに残す、判断不能も保留してそのまま残すよう指示を追加した。あわせて「ステップ1 試し打ち結果」節を新設し、指摘件数・内訳・対処の記録をステップ1の完了条件に含めた。
- **M2**: `package.json`へのdevDependency追加時のバージョン範囲を `^5.0.0` に明記した(「やること」「変更概要」表「ステップ1」「リスク」の各所)。Node実行要件(v20.19+)の確認をステップ1の冒頭に追加した。
- **M3**: 「やらないこと」節と「テスト戦略」節に、Knipの指摘を`/test`の合否・`code-reviewer`の判定材料に使わないことを明記した決定を追加した。README追記(ステップ4)を任意から必須に格上げし、この決定をREADMEにも明記する一文を追加した。`docs/memory/entries/knip-dead-code-detection.md`にも同趣旨を追記した(別途反映)。
- **M4**: テスト戦略の完了基準(d)を、実CI実行の確認からローカルで検証可能な内容(YAML構文の妥当性、`knip`ジョブの`continue-on-error: true`と`needs`なしの設定確認)に置き換えた。手動確認手順3も同様に修正し、実際のCI実行確認は「事後確認」として手順4に分離し、`/test`フェーズの完了基準から明確に除外した。
- **MINOR**: 変更概要の表にあるメモリ関連3件に「designerが設計時に実施済み・implementerは対応不要」の注記を追加。`knip.json`を`knip.jsonc`(+`schema-jsonc.json`)に変更し、ドキュメント内の参照箇所も全て更新。ステップ6を「差分確認まで(コミットはメインエージェントが行う)」に修正。ステップ4の「時間が無ければ省略可」を削除し必須化。`vite: false`のコメントの因果を「vite:falseにするとテストentry既定検出が失われるため明示的に加える」という正しい向きに修正。ルートワークスペースの依存チェック確認項目に`typescript`を追加。frontendの`project`に`vite.config.ts`/`playwright.config.ts`を含め、`entry`がその部分集合になるよう修正。`ignore`に`**/node_modules/**`を追加しコメントを実態に合わせた。調査ドキュメントの相互リンクを本設計ドキュメントへのリンクに更新した(別ファイルで対応)。

### 人間確認ゲート1での修正依頼への対応メモ(designer記入)

ラウンド2で残存したMINOR4件について、人間確認ゲート1での「修正依頼」判断を受けて以下のとおり対応した。

- **MINOR-1**(「自動テストを新規作成するか」の理由文とM4対応の矛盾): 「既存のCI実行自体(`checks`/`e2e`/新設`knip`ジョブが実際にpush/PRごとに動く)が動作確認を兼ねており」という記述を削除し、「テスト戦略」節の手動確認手順(`npx knip`実行結果確認、`npm run knip:report`のexit code確認、`ci.yml`のYAML構文チェックと`knip`ジョブ定義の目視確認)によって`/test`フェーズ内でローカルから直接検証する、という記述に置き換えた。あわせて、トピックブランチはpush/PR作成をせずローカルで`git merge`されるため実CI実行自体は`/test`時点で検証できず、実CI確認は手動確認手順4の事後確認として分離している旨を明記し、M4対応との整合を取った。
- **MINOR-2**(`vite: false`の削除可否・`vitest`プラグイン未確認): ステップ1の確認項目に、Knip 5では`vite`プラグインと`vitest`プラグインが別々に有効化される可能性があるため`vitest`プラグインの有効/無効も含めて実際の挙動を確認すること、`vite: false`が意図通り機能しているか・`vitest: false`も別途必要かを確認すること、`ignoreDependencies`と同様に効果がなければ`vite: false`エントリを削除してよいことを追記した。
- **MINOR-3**(`@types/node`確認項目の欠落): ステップ1の確認項目一覧に、ルートワークスペースで`npx knip`実行時に型解決関連の警告が出ないか確認する項目を追加した。`@types/node`が`backend`のみのdevDependencyでありルート・`shared`・`frontend`には存在しない(ルートは`typescript`のみ)非対称な構成を明記し、Knip公式が`knip`+`typescript`+`@types/node`の同時導入を前提にしていることを確認理由として添えた。
- **MINOR-4**(ステップ1・2の同一ファイル変更・並列化不可の未注記): 「実装ステップ」節の導入文(実装順チェックリストの直後)に、ステップ1とステップ2がいずれも`sample-app/package.json`を変更するため、`/implement`が`TaskCreate`でタスク分割する際は`addBlockedBy`等で依存関係を明示し順序化すること(並列化不可)を明記した。

## コードレビュー結果

`code-reviewer` による自動レビュー(最大2ラウンド、`/implement` 実行時)の記録。

| ラウンド | 判定 | 主な指摘 |
| --- | --- | --- |
| 1 | MAJOR | MAJOR-1: 実測で判明した事実(knip.jsoncは各ワークスペース空オーバーライドで十分、entry/project/ignore/ignoreDependencies/vite:falseはすべて不要)が、`docs/memory/entries/knip-dead-code-detection.md` の背景記述(「workspacesごとにentry/projectを定義し、ignore/ignoreDependencies/vite:false等で個別に抑制する方針を取った」)と矛盾したまま`status: active`で残っている。CLAUDE.mdのメモリ運用ルール2に従いorchestratorがエントリ本文と`updated`を更新すべき。MINOR-1: `knip.jsonc`のコメント(「ignoreはproject globがsrc/**/*.tsに限定されるため冗長」)は、projectを設定していない最終形には当てはまらない根拠(実際はKnip既定の除外挙動)。MINOR-2: READMEに`npm run knip`(exit≠0版)の用途説明がなく`knip:report`のみ記載。検証結果: 設計からの逸脱(簡素化)は、sample-appの複製にデッドファイル・未使用export・未使用依存・未登録workspaceを注入した実測で全ワークスペース(root/shared/backend/frontend/e2e)の検出が正しく機能することを確認済みで妥当。CIジョブ(continue-on-error: true・needs無し・既存2ジョブ無改変)、npm script、README追記、typecheck/lint/build、コミット粒度はいずれも設計どおり。 |
| 2(ラウンド1がMAJORの場合のみ) | PASS | MAJOR-1/MINOR-1/MINOR-2の修正がいずれもファイル本文に反映済みであることを実読で確認(メモリエントリの背景を「設計案→ステップ1試し打ちで抑制設定は全て不要と判明→空オーバーライドに帰着→教訓」に書き換え+`updated: 2026-08-13`、knip.jsoncのdist除外根拠コメント差し替え、READMEに`knip`/`knip:report`の使い分け追記)。エントリ本文と実装(全ワークスペース`{}`)の矛盾は解消。再検証: typecheck/lint/build/knipすべて成功(knip指摘0件)、CI YAMLは`knip`ジョブのみ`continue-on-error: true`・`needs`なし、package-lockは追加行のみ、作業ツリーはクリーン。残MINOR(修正ループ上限のため未対応、テストレポートへ引き継ぎ): MINOR-3 `knip.jsonc`の新コメント「Knipは既定でdist/等を除外」は不正確で、実機構は既定で`.gitignore`を尊重すること(`npx knip --no-gitignore`ではdist配下8件がUnused filesとして検出される)。結論(ignore設定不要)自体は正しく機能影響なし。MINOR-4 本ドキュメント「ステップ1 試し打ち結果」表に旧根拠(projectグロブがsrc/**限定)が残存し、修正後のknip.jsoncコメントと不整合に見える。MINOR-5 メモリエントリ「適用範囲」の「workspace別entry等」という表現が最終形と噛み合っていない。参考: `npm audit`でdev依存にhigh 4件(brace-expansion/fast-uri/js-yaml/nanoid)があるが、いずれもmain時点から存在しKnip導入起因ではない。 |

未解決のMAJORが残った場合: なし

## 人間確認ゲート記録

| 日時 | 判断 | コメント |
| --- | --- | --- |
| 2026-08-12 | 修正依頼 | design-reviewerラウンド2で残ったMINOR4件(自動テスト非作成の理由文の矛盾、vite:false削除可否/vitestプラグイン未確認、@types/node非対称構成の確認漏れ、ステップ1・2の並列化不可の未注記)への対応を要求。 |
| 2026-08-13 | 承認 | MINOR4件すべて対応済みを確認。`/implement`へ進む。 |
</content>
