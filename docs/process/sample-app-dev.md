# 開発・検証コマンド

このドキュメントは `CLAUDE.md` から参照される、実装対象プロジェクトの開発・検証に関する詳細である。

実装対象プロジェクトは `sample-app/`(TypeScript, npm workspaces: `shared`=型定義, `backend`=NestJS, `frontend`=Vite+React)。静的解析・テスト運用方針(次節以降)を実地で確認するための最小構成で、詳細は `sample-app/README.md` を参照。`/test` は以下のコマンドを実行する。

- 型チェック: `cd sample-app && npm run typecheck`(shared/backend/frontend すべて)
- Lint: `cd sample-app && npm run lint`(サイズ/複雑さ/型/`sonarjs`/`security`/フォーマット(`prettier`)のルールは全て`error`まで昇格済み。詳細は「静的解析・自動チェックの考え方」)
- 自動テスト(backendの純粋関数): `cd sample-app && npm run test`
- ビルド: `cd sample-app && npm run build`
- E2E(frontend+backendを自動起動、要 `npx playwright install chromium`): `cd sample-app && npm run test:e2e --workspace frontend`
- 手動確認: API は `curl`、画面は Playwright CLI(「手動確認の使い分け」参照)

同じチェックは `.github/workflows/ci.yml` がpush/PRごとにも実行する(CIは人間の直pushに対する最後の砦。「静的解析・自動チェックの考え方」の「壊れたら赤くなる」層の一部)。

`backend`のAPI境界は `shared` パッケージの型(`QuoteInput`等)を実装するclass-validator製DTO(例: `quote-query.dto.ts`)で検証する。手書きの`Number()`パースに頼らない。新しいエンドポイントを追加する際もこのパターンに従うこと。

新しいトピックで別のアプリケーション/言語を対象にする場合は、このドキュメントを該当プロジェクトのコマンドで上書きすること。

## 手動確認の使い分け(自動テストが無い/不十分な場合)

- **API・バックエンド**: `curl` で実際にエンドポイントを叩いて確認する。
- **フロントエンド(画面・UI)**: Playwright CLI(`npx playwright test` 等)で確認する。
- どちらにも当てはまらない対象(バッチ処理・スクリプト等)は、妥当な方法(直接実行など)で確認する。

`/test` および `tester` はこの使い分けに従うこと。

## 自動テストの追加

手動確認(curl/Playwright)だけに頼り続けるとテストカバレッジが増えない。そのため `/design` は「テスト戦略」で**自動テストを新規作成するかどうかを毎回明示的に決める**(する/しない+理由)。「する」場合は実装ステップのチェックリストにテスト作成タスクを含め、`/implement` はそれもタスクの1つとして `implementer` に委譲する。`design-reviewer` はこの判断が安易な「しない」になっていないかを確認する。

## 静的解析・自動チェックの考え方(壊れたら赤くなる仕組み)

このプロジェクトのレビュー体制は、人間が差分を目視で読むことを前提にしていない(`design-reviewer`・`code-reviewer`による自動レビューが担う)。目視レビューの代わりに、**「壊れたら赤くなる」自動チェックの層を積み上げる**ことで品質を担保する方針を取る。実装対象プロジェクトにLint・型チェック・複雑度チェック等を導入する際は、以下の原則に従う。

- **構成されているチェックは必須で実行する。** `/test`・`code-reviewer` は、Lint・型チェック・複雑度チェックが構成されている場合、実行を省略してはならない。失敗はそのまま不合格/`MAJOR`の理由になる(「あれば実行する」程度の扱いにしない)。
- **新しいルールは初日からブロックしない。** 新しいLint/静的解析ルールを追加する場合、まず`report`(警告のみ・非ブロッキング)で導入し、既存コードの指摘をゼロにしてから`error`(ブロッキング)に昇格させる。初日からブロックすると、コメントで無視する等の「回避の作法」が定着してしまう。この移行計画自体を設計ドキュメントの decision として記録する。
- **例外はインラインではなく設定ファイルに理由付きで書く。** `eslint-disable` 相当をコード中に理由なく埋め込むことを禁止する。抑制が必要な場合は設定ファイル側に「なぜ必要か」「いつ解消するか」を明記する。理由のない抑制は `code-reviewer` が `MAJOR` として指摘する。
- **重複コード検出・デッドコード検出(jscpd/knip相当)は、導入するならまずレポートのみ(非ブロッキング)から始める。** いきなりゲート化しない。

(この方針は https://zenn.dev/singularity/articles/stopped-reviewing-my-code の「壊れたら赤くなる仕組みを積み上げ、人間はレビューではなく実際の挙動を見る」という考え方を参考にしている。)
