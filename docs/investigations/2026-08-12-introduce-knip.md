# 調査: sample-app への Knip 導入

- 日付: 2026-08-12
- ステータス: 完了
- 関連する設計ドキュメント: [docs/designs/2026-08-12-introduce-knip.md](../designs/2026-08-12-introduce-knip.md)

## 背景・目的

`CLAUDE.md`「静的解析・自動チェックの考え方」では、重複コード検出・デッドコード検出(jscpd/knip相当)は「導入するならまずレポートのみ(非ブロッキング)から始める。いきなりゲート化しない」と定めている。本調査は、sample-app(npm workspaces: `shared`/`backend`/`frontend`)に Knip をこの方針どおり**レポート専用・非ブロッキング**で導入するための設定方針・CI組み込み方針・誤検知リスクを明らかにすることが目的。実装(設定ファイルの実作成)は行わず、`/design` に引き継ぐための選択肢整理に徹する。

## 現状の把握

### sample-appの構成

- ルート `sample-app/package.json`: `"type": "module"`, workspaces = `["shared", "backend", "frontend"]`。`lint`/`typecheck`/`test`/`build` は既にワークスペース横断のnpm scriptとして整備済み。
- `shared`(型定義のみ): `main`/`types` とも `./src/index.ts`(ビルド成果物なし、TSソースを直接参照)。`src/index.ts` が `quote.ts`・`health.ts` を re-export するバレルファイル。
- `backend`(NestJS): `src/main.ts` がエントリ、`src/app.module.ts` で `@Module({ controllers: [...], providers: [...] })` を宣言。`HealthController`・`QuoteController`・`QuoteService`・`QuoteQueryDto` はいずれもNestのDIコンテナ経由でのみ参照され、直接 `import` されて使われる箇所はモジュール宣言以外にない。`nest-cli.json` あり(`sourceRoot: "src"`)。`vitest` を devDependency に持つ(ユニットテストランナーとして。Viteバンドラ自体は使っていない)。`tsconfig.json` は `experimentalDecorators`/`emitDecoratorMetadata` 有効、`module: commonjs`。
- `frontend`(Vite + React): `src/main.tsx` がエントリ(`index.html` から `type="module"` で読み込まれる想定、Viteの標準構成)、`src/App.tsx`。`playwright.config.ts` と `e2e/home.spec.ts` でE2Eテストを持つ。
- 全workspace共通で `tsconfig.base.json` を継承(`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` など厳格設定)。
- `sample-app/eslint.config.mjs` は `typescript-eslint` strict + `sonarjs`/`security` recommended をすべて `error` に昇格済み(`docs/memory/entries/eslint-strictness-ratchet-v2.md` 参照、詳細後述)。`ignores` に `**/dist/**`, `**/node_modules/**`, `**/coverage/**`, `**/playwright-report/**`, `**/test-results/**` を設定。
- CI(`.github/workflows/ci.yml`)は `checks` ジョブ(typecheck/lint/test/build)と `e2e` ジョブ(Playwright)の2ジョブ構成。両方とも失敗するとブロッキング(必須チェック)。Knipに関する記述は現状なし。
- Node.jsバージョン: CIは `node-version: 22`。Knipは Node v20.19.0 以上を要求するため問題なし。

### 既存の共有メモリで参照した関連エントリ

- `docs/memory/entries/eslint-strictness-ratchet-v2.md`(decision, active): sample-appの静的解析ルールは「まずwarn/report-onlyで導入し、既存コードの指摘がゼロであることを確認してからerror(ブロッキング)に昇格させる」というratchet方式を採用してきた実績。今回のKnip導入(レポートのみ・非ブロッキング)は、このエントリが確立した「新しいルールは初日からブロックしない」という考え方と方向性が一致しており、矛盾しない。本調査はこのエントリを判断材料として使ったため、frontmatterの `related_topics` に `introduce-knip` を追記可能(このエントリ自体は「既に昇格済みのESLintルールの記録として閉じておく」と明記されているため、Knipという**別ツール**の新規導入をこのエントリの追記対象に含めるべきかは設計フェーズで要判断。詳細は後述の未解決事項)。
- `docs/memory/MEMORY.md` の他エントリ(`pure-function-extraction`, `shared-types-and-dto-validation`)はコード構造の規約であり、今回の誤検知リスク調査(NestJSのDI経由参照、sharedのバレルファイル)と関連する。特にDTO・DIクラスは「規約上あえてエクスポート/デコレータのみで参照される」パターンであり、Knipが未使用と誤検知しやすい箇所と一致する。

## Knipとは何か

Knip(https://knip.dev/)は、JavaScript/TypeScriptプロジェクトの以下を静的解析で検出するツール:

- **未使用ファイル**(unused files): どこからも参照されないソースファイル
- **未使用エクスポート**(unused exports): exportされているが他ファイルから使われていない関数・変数・型・クラス
- **未使用の型エクスポート**(unused exported types)
- **未使用依存関係**(unused dependencies): `package.json` に書かれているが実際には使われていないパッケージ
- **未解決の依存関係**(unresolved imports): importされているが `package.json` に存在しない依存
- **重複エクスポート**(duplicate exports)等

`npm init @knip/config` での初期化、または手動で `knip` (+ `typescript`, `@types/node`) を devDependency として追加し、`knip.json`(または `knip.jsonc`)を書くことで導入する。実行は `npx knip` または npm script経由。**Node.js v20.19.0以上**が必要(CIのNode 22で問題なし)。

150以上のプラグインを持ち、フレームワーク固有の設定ファイル・エントリポイントを自動検出する。今回関連するのは以下2つ:

- **Nestプラグイン**: `package.json` の dependencies/devDependencies に `^@nestjs/` へのマッチがあれば自動有効化。`nest-cli.json` 等の設定ファイルを自動でプロジェクトファイルとして扱う。ただしカスタムの `entry`/`config` を指定すると、プラグインのデフォルト値は**マージされず上書き**される点に注意。
- **Viteプラグイン**: `package.json` の dependencies/devDependencies に `vite`/`vitest`/`vite-plus` があれば自動有効化。`vite.config.{js,mjs,ts,cjs,mts,cts}` を自動でプロジェクトファイルとして扱う。**backendも `vitest` を devDependency に持つため、Viteプラグインはbackendワークスペースでも有効化される**(vite.config.tsが存在しないため実害は基本ないはずだが、意図しない挙動が出た場合はworkspace単位で `vite: false` 等の無効化を検討する余地がある)。

## npm workspaces構成での設定方針

Knipはpackage-based monorepo(npm/pnpm/yarn workspaces)をネイティブにサポートする。`knip.json` に `workspaces` オブジェクトを定義し、**ルートワークスペースは `"."` というキーで明示**する(workspacesを使う場合、トップレベルの `entry`/`project` は無視されるため、ルート用の設定も `workspaces["."]` に書く必要がある)。ワークスペースごとに独立した `entry`(解析の起点となるファイル)・`project`(解析対象に含める全ファイル)のglobパターンを指定できる。

### sample-appへの設定案(たたき台)

```jsonc
// sample-app/knip.json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "workspaces": {
    ".": {
      // ルート直下に解析対象のソースはないため空でよい
      "entry": [],
      "project": []
    },
    "shared": {
      "entry": ["src/index.ts"],
      "project": ["src/**/*.ts"]
    },
    "backend": {
      "entry": ["src/main.ts"],
      "project": ["src/**/*.ts"],
      // NestJSのDIクラス(Controller/Service/Module/DTO)はデコレータ経由でのみ
      // 参照され、直接importされない設計上の慣用パターン。誤検知が出た場合はここに追記する。
      "ignoreExportsUsedInFile": true
    },
    "frontend": {
      "entry": ["src/main.tsx", "vite.config.ts", "playwright.config.ts"],
      "project": ["src/**/*.{ts,tsx}", "e2e/**/*.ts"]
    }
  }
}
```

- `shared` は `main`/`types` が `src/index.ts` を指すバレルファイル構成。`src/index.ts` を `entry` にすることで、そこからre-exportされる `quote.ts`/`health.ts` の型がbackend/frontendから使われている限り「未使用」と誤検知されないはず(Knipはモノレポ内のワークスペース間import解決を標準でサポートする)。ただしバレル経由の型のみの再export(`export interface`)はKnipが「使用されている」と正しく追跡できるか未検証のため、導入時に実行して確認する必要がある(後述の未解決事項)。
- `backend` はNestJSプラグインが自動的に `nest-cli.json` を認識する。`entry` に `src/main.ts` を明示することで、`AppModule` → 各Controller/Serviceの依存グラフを辿らせる。
- `frontend` はViteプラグインが `vite.config.ts` を自動認識するが、`index.html` → `src/main.tsx` のエントリ解決をKnipがどこまで自動でできるかは未検証のため、`entry` に明示しておくのが安全。`playwright.config.ts`・`e2e/**` もentry/projectに含め、Playwrightのテストコードを「未使用ファイル」として誤検知しないようにする。

## 「レポートのみ・非ブロッキング」導入方針の選択肢比較

| 選択肢 | メリット | デメリット | 備考 |
| --- | --- | --- | --- |
| A. npm scriptのみ追加(CIには一切組み込まない) | 最もシンプル。既存のCIワークフローに一切手を入れない。誤検知でCIが不安定になるリスクがゼロ。 | 実行が完全に手動任せになり、デッドコードが放置されやすい。「壊れたら赤くなる」仕組みの思想(CLAUDE.md)からは外れ、単に「ローカルで気が向いたら使うツール」で終わる可能性が高い。 | `package.json` に `"knip": "knip"` を追加するのみ。 |
| B. CIにジョブ/ステップとして追加し `--no-exit-code` で常に成功扱い | 全PR/pushで自動的に結果が可視化される。ログを見れば誰でも指摘一覧を確認できる。将来ブロッキング化する際の土台になる。 | ログを能動的に見に行かないと気づかれない(通知がない)。CI実行時間が伸びる。 | Knip CLIには `--no-exit-code` フラグがあり、指摘があっても常にexit code 0で終了する。npm scriptとしても `"knip:report": "knip --no-exit-code"` の形でCIから呼べる。 |
| C. CIに追加し `continue-on-error: true` で失敗を許容(exit codeは通常どおり1になり得る) | ステップ単体は「失敗」として視覚的にGitHub Actions UI上で目立つ(⚠️マーク)が、ジョブ全体は成功として扱われるためブロッキングにならない。 | Bと同様、通常のexit codeに依存するため、将来「やっぱりブロッキングに戻す」場合の切替が `continue-on-error` の削除だけで済み分かりやすい半面、現状でも「失敗っぽく見える」UIになるためレポート専用という意図が伝わりにくいことがある。 | GitHub Actions固有の機能。knip単体の `--no-exit-code` と組み合わせても矛盾はしないが、両方使うなら `continue-on-error` は不要になる。 |
| D. サードパーティAction(`knip-reporter`等)でPRコメントとして結果を投稿(非ブロッキング設定あり) | 指摘がPRコメントとして能動的に通知され、Bの「気づかれない」弱点を補える。 | 外部Actionへの依存が増える。トークン権限(PRへのコメント権限)の設定が必要になり、今回のスコープ(レポートのみ導入)にしては大掛かり。 | `Codex-/knip-reporter` 等の存在は確認したが、CLAUDE.mdの方針(「まずレポートのみから始める」)からするると初手としては過剰な可能性がある。 |

### 推奨アプローチ

**B(CIにステップとして追加し `--no-exit-code` で常に成功)を軸に、npm scriptとしても単独実行可能にする(Aの要素も内包)** ことを推奨する。

- `sample-app/package.json` に `"knip": "knip"`(通常のexit codeを返す、ローカルで「今すぐ直したい」時に使う版)と、CI用に `--no-exit-code` を付けた呼び出しを用意する(script名を分けるか、CIのworkflow側で直接 `npx knip --no-exit-code` を呼ぶ)。
- 既存の `checks` ジョブ(typecheck/lint/test/build)には**混ぜない**。理由: 既存ジョブはCLAUDE.mdの定義上「壊れたら赤くなる」層の中核であり、失敗=マージ不可という意味を持つ。Knipのレポートステップをそこに混在させると、`continue-on-error`を付けたとしても「本来ブロッキングなジョブの中に非ブロッキングなステップが混ざる」という分かりにくさが生まれる。
- 代わりに、独立した `knip` ジョブ(または既存ジョブに独立ステップとして追加しつつ `continue-on-error: true` も併用)を新設し、`needs` は付けず(他ジョブの成否と無関係に実行してよい)、実行結果はログに出力するだけに留める。Cの `continue-on-error: true` は「明示的に非ブロッキングであることをUI上でも示す」ためBと併用してもよい(念のための二重の安全策、コストは低い)。
- 将来ブロッキング化する判断(=CLAUDE.mdの「report → error」ratchetパターンをKnipにも適用するか)は、今回のスコープ外。既存コードの誤検知・指摘件数をレポートで確認してから、別途designer/人間が判断する。

いずれの案でも、**設定ファイル(`knip.json`)自体は用意し、`ignore`/`ignoreDependencies` で明白な誤検知を潰しておく**ことが前提。レポートが誤検知だらけだと「レポートを見る」という行為自体が形骸化するため、最低限の調整は導入時点で行う価値がある(ただしCLAUDE.mdの「初日からブロックしない」原則には反しないよう、ブロッキング化はしない)。

## 制約・リスク(sample-appの実コードを踏まえた誤検知リスク)

1. **NestJSのDIクラス(Controller/Service/Module)**: `HealthController`・`QuoteController`・`QuoteService` は `AppModule` の `@Module({ controllers: [...], providers: [...] })` 配列にのみ登場し、通常のimport-and-use関係ではなくNestのDIコンテナが実行時に解決する。Knip Nestプラグインはこのパターンを前提に作られているはずだが、実際に誤検知(「使われていないクラス」として報告される)が出ないかは実行して確認が必要。もし誤検知が出た場合は `ignore` でファイル単位を除外するのではなく、Nestプラグインの `entry` 調整(例: `app.module.ts` をentryに追加してモジュール宣言からの参照を辿らせる)を優先する。
2. **DTOクラス(`QuoteQueryDto`)**: `class-validator`/`class-transformer` のデコレータ(`@IsNumber`, `@Type`)が付与されたプロパティは、`ValidationPipe` が実行時にリフレクション経由で参照する。Knipの静的解析はこのような実行時のみの参照を追えないため、DTOクラス自体やそのプロパティが「未使用」と誤検知される可能性は低い(クラスは `QuoteController` の `@Query()` パラメータ型として通常のTypeScript importで使われているため)が、プロパティ単位の誤検知(`amount`/`taxRate` が「未使用プロパティ」扱いされる等)は要確認。
3. **sharedパッケージのバレルエクスポート**: `shared/src/index.ts` が `export * from "./quote"` / `export * from "./health"` で型を再exportしている。Knipはバレルファイル経由の再exportを正しく辿れることが多いが、型のみのexport(`interface`)かつ `import type` での参照(`quote-query.dto.ts` の `import type { QuoteInput }` 等)がある点は、Knipのバージョンによって挙動差が出ることがあるため実導入時に要確認。
4. **Viteプラグインがbackendでも有効化される**: backendは `vitest` を devDependency に持つため、Knipの判定ロジック上Viteプラグインが有効になる可能性がある。`vite.config.ts` が存在しないため実害は基本ないと考えられるが、意図しない挙動(存在しない設定ファイルを探しにいくログ等)が出た場合はworkspace単位でのプラグイン無効化設定(`"backend": { "vite": false }` 等)を検討する。
5. **`@sample-app/shared` を `*` で参照する依存**: backend/frontendの `package.json` は `"@sample-app/shared": "*"` と書いている。npm workspaces内部の相互参照であり、Knipの「未解決/未使用依存」判定にワークスペース内パッケージがどう扱われるかは実行して確認する必要がある(一般的にはKnipはモノレポ内ワークスペース間の依存を認識するはずだが、確証は取れていない)。
6. **ESLintの`ignores`と揃えるべきディレクトリ**: `**/dist/**`, `**/node_modules/**`, `**/coverage/**`, `**/playwright-report/**`, `**/test-results/**` はESLintと同様にKnipの `project` パターンからも除外すべき(ビルド成果物・テスト成果物を解析対象に含めると誤検知・実行時間増の原因になる)。knip.jsonの `project` glob設計時に踏襲する。

## 未解決の疑問・要確認事項

- `docs/memory/entries/eslint-strictness-ratchet-v2.md` は末尾で「今後さらに新しい静的解析ルールを`warn`で導入する場合は、このエントリではなく新しいエントリを作ること」と明記している。Knipは「ルール追加」ではなく「別ツールの新規導入」だが、思想(report-onlyから始めるratchet運用)は共通する。設計フェーズで、Knip導入の決定を**新規の共有メモリエントリ(例: `knip-dead-code-detection`)として独立させる**か、既存の `eslint-strictness-ratchet-v2` を拡張するかは人間/designerの判断に委ねる(本investigatorはメモリへの新規書き込みは行っていない)。
- `shared` パッケージのバレルエクスポート・型のみのexport・NestJSのデコレータ経由参照・npm workspaces間の `@sample-app/shared` 参照について、実際に `npx knip` を実行してみないと誤検知の有無は確定できない。本調査はコードリーディングとKnip公式ドキュメントの記述に基づく推測であり、**実装(design/implement)フェーズの早い段階で一度実際に実行し、レポート内容を見て `knip.json` の `ignore`/`ignoreDependencies`/entry調整を行う「試し打ち」のステップを設計に含めるべき**。
- CI組み込みを「独立ジョブ」にするか「既存`checks`ジョブ内の`continue-on-error`ステップ」にするかは、CI実行時間・並列ジョブ数のコストとのトレードオフであり、本調査では選択肢の整理に留めた(推奨は独立ジョブ寄りだが、design時に確定させる)。
- `knip --no-exit-code` と GitHub Actionsの `continue-on-error: true` を両方使うか、どちらか一方にするかは冗長性とシンプルさのトレードオフであり、設計判断に委ねる。

## メモリ候補(呼び出し元がまとめて反映する想定)

このinvestigatorは並列調査の一部としてではなく単独呼び出しとして起動されているが、今回の指示で「`docs/memory/` への新規エントリ追加はここでは行わないこと」と明示されているため、書き込みは行わず候補としてここに残す:

- **type: decision(候補)** — 「sample-appにKnip(デッドコード検出)を導入する場合は、CLAUDE.mdの静的解析方針どおりレポートのみ・非ブロッキングから始める。CI組み込みは `--no-exit-code` および/または `continue-on-error: true` を用い、既存の `checks`(typecheck/lint/test/build)ジョブとは分離する」という方針が、design/implementフェーズを経て確定したら、新規エントリとして記録する価値がある(複数の将来topicで「新しい静的解析ツールを導入する際の型」として再利用され得るため)。
- **`eslint-strictness-ratchet-v2` の `related_topics`**: 本調査で判断材料として参照したため、設計フェーズ確定後に `related_topics: []` → `related_topics: [introduce-knip]` への追記を検討してよい(まだ1件のみのためスキル化候補の閾値である3件には達しない)。

## 参考資料

- [Knip 公式サイト](https://knip.dev/)
- [Monorepos & Workspaces | Knip](https://knip.dev/features/monorepos-and-workspaces)
- [Configuration | Knip](https://knip.dev/reference/configuration)
- [CLI Reference | Knip](https://knip.dev/reference/cli)
- [Nest plugin | Knip](https://knip.dev/reference/plugins/nest)
- [Vite plugin | Knip](https://knip.dev/reference/plugins/vite)
- [Plugins (182) | Knip](https://knip.dev/reference/plugins)
- [Resolve reported issues | Knip](https://knip.dev/guides/handling-issues)
- [Reporters & Preprocessors | Knip](https://knip.dev/features/reporters)
- [Codex-/knip-reporter (GitHub Action for PR comments)](https://github.com/Codex-/knip-reporter)

---
次のアクション: `/design` で設計フェーズに進む
</content>
