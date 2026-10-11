# loop-basic

Claude Code 上で「調査 → 設計 → 製造(実装) → テスト」を自律的に回す開発エージェントのための、基本ファイル一式。設計後とテスト後の2箇所に人間の確認ゲートを設けている。

運用ルールの詳細は [CLAUDE.md](./CLAUDE.md) を参照。パイプライン全体の図解は [docs/pipeline-overview.html](./docs/pipeline-overview.html)(ブラウザで直接開ける)を参照。

## 使い方

トピック(実装したい機能・修正したいバグなど)を1つ決め、以下のいずれかで開始する。

### 通しで実行する

```
/cycle <topic>
```

調査から設計まで自動で進み、設計完了時点で承認確認が入る。承認後は実装・テストまで自動で進み、テスト完了時点で再度確認が入る。

### フェーズごとに実行する

```
/investigate <topic>   # 調査 → docs/investigations/ に記録
/design <topic>        # 設計 → docs/designs/ に記録 → ここで人間確認
/implement <topic>     # 実装(設計承認後のみ)
/test <topic>          # テスト → docs/tests/ に記録 → ここで人間確認
```

## ディレクトリ構成

```
CLAUDE.md                 運用マニュアル(ワークフロー・ゲートのルール)
sample-app/                実装対象のサンプルTSフルスタックアプリ(shared=型定義, backend=NestJS, frontend=Vite+React)
.github/workflows/ci.yml   push/PRごとにtypecheck・lint・test・build・E2Eを実行するCI
.claude/
  commands/                各フェーズのスラッシュコマンド定義
  agents/                  各フェーズを担当するサブエージェント定義
  settings.json            プロジェクト共有設定(worktree.baseRef: "head" など)
  worktrees/<topic-slug>/  /implement が作成する、トピック専用の git worktree(マージ後に削除)
docs/
  pipeline-overview.html   運用パイプライン全体の図解(手動更新)
  investigations/          調査ドキュメント(/investigate の成果物)
    _parts/<topic-slug>/    並列調査(ファンアウト)時の観点ごとの作業ファイル
  designs/                 設計ドキュメント(/design の成果物)
  tests/                   テストレポート(/test の成果物)
  templates/               各成果物のテンプレート
  memory/                  サブエージェント間の共有メモリ(決定・規約・落とし穴・用語集)
    MEMORY.md                索引
    entries/                 個々のメモリエントリ
    templates/               メモリエントリのテンプレート
```

## サブエージェント間の記憶共有

サブエージェント(investigator/designer/implementer/tester)は毎回独立したコンテキストで起動されるため、他フェーズの作業内容を自動では覚えていない。そこで `docs/memory/` をエージェント間の共有メモリとして使う。全フェーズが作業前に `docs/memory/MEMORY.md` を読み、topicを超えて再利用できる知識(決定事項・規約・落とし穴・用語集)を得たらそこに書き足していく。詳細な運用ルールは [CLAUDE.md](./CLAUDE.md) の「共有メモリ」セクションを参照。

## 調査フェーズの並列化(ファンアウト)

1トピックの中に独立して調べられる観点が複数ある場合(例:「ライブラリ選定」と「既存アーキテクチャとの整合性」)、`/investigate` は investigator サブエージェントを並列に複数起動して分担調査させ、最後に1つの調査ドキュメントへ統合できる。並列実行中は複数エージェントが同時に共有メモリを編集しないよう、書き込みは全員の完了後にorchestrator(呼び出し元)がまとめて行う。詳細は [CLAUDE.md](./CLAUDE.md) の「調査フェーズの並列化(ファンアウト)」セクションを参照。

## 複数セッションでの並行作業(ワークツリー分離)

`/implement` はコード変更を始める前に、このトピック専用の git worktree(`.claude/worktrees/<topic-slug>`、専用ブランチ)を作成し、実装・テストはその中で行う。別セッションが別トピックを同時に `/implement`・`/test` していても、それぞれ別のワークツリーで作業するためファイルが衝突しない。ベースブランチへのマージは `/test` のゲート2で人間が承認した後にのみ行われる。詳細は [CLAUDE.md](./CLAUDE.md) の「実装フェーズのワークツリー分離」セクションを参照(既知の制限として、`/investigate`・`/design` はワークツリー化されていない)。

## 設計・実装のレビューループ(自動、最大2ラウンド)

設計完了後(ゲート1の前)は `design-reviewer`、実装完了後(`/test` の前)は `code-reviewer` が、それぞれ作成者とは別の視点でレビューする。`MAJOR` 判定なら作成者が修正して再レビュー、最大2ラウンドまで。これは人間を介さない自動チェックで、新たな人間確認ゲートではない — 2ラウンドを終えてもなお未解決の指摘は、直後の人間確認ゲートに必ず引き継がれる。レビューアーは著者(designer/implementer)とあえて**異なるモデル(opus)**を使い、同じモデルが共有しがちな盲点を補う。詳細は [CLAUDE.md](./CLAUDE.md) の「設計・実装のレビューループ」セクションを参照。

## 実装フェーズのタスク分割・並列化

`/implement` を実行するメインエージェントは**自分でコードを実装しない**。設計の実装ステップを `TaskCreate` でタスクに分割し、依存関係のないタスクは `implementer` サブエージェントへ並列dispatchし、`TaskList`/`TaskUpdate` で進捗を確認・記録する役割に徹する。同じファイルを触るタスクは並列化せず順序づける。並列dispatch中の `implementer` はコミットも共有メモリへの書き込みも行わず、完了報告を受けたメインエージェントがタスクごとにコミットする。タスクは複数トピックで1つのリストを共有するため、`subject` に `[<topic-slug>]` プレフィックスを付けて自トピック分だけを扱う。詳細は [CLAUDE.md](./CLAUDE.md) の「実装フェーズのタスク分割・並列化」セクションを参照。

## テストの手動確認の使い分け

自動テストが無い/不十分な場合、`/test`・`tester` は対象に応じて手動確認する: **APIは`curl`**、**フロントエンド(画面・UI)はPlaywright CLI**。それ以外はバッチ実行など妥当な方法で確認する。手動確認だけに頼り続けないよう、`/design` は「自動テストを新規作成するか」を毎回明示的に決め、「する」場合は実装タスクに含める。詳細は [CLAUDE.md](./CLAUDE.md) の「開発・検証コマンド」セクションを参照。

## 人間確認ゲート

- **設計後**: 設計ドキュメントの内容を承認するかどうかを確認される。承認するまで実装は始まらない。
- **テスト後**: テスト結果を確認し、このサイクルをクローズしてよいかを確認される。承認するまでクローズされない。

いずれも `AskUserQuestion` で選択肢(承認/修正依頼/差し戻し)が提示されるので、その場で判断すればよい。

## 静的解析・自動チェックの考え方

このプロジェクトのレビューは人間が差分を読むことを前提にしていない。代わりに「壊れたら赤くなる」自動チェック(Lint・型チェック・複雑度チェック等)の層を積み上げる方針を取る。構成されているチェックは`/test`・`code-reviewer`が必ず実行し、失敗はそのまま不合格/`MAJOR`理由になる。新しいルールは初日からブロックせず`report`(警告のみ)から始め、既存の指摘をゼロにしてから`error`に昇格させる。例外はインラインではなく設定ファイルに理由付きで書く。詳細は [CLAUDE.md](./CLAUDE.md) の「静的解析・自動チェックの考え方」セクションを参照。

## パイプライン図解の保守について

`docs/pipeline-overview.html` は `CLAUDE.md` と各コマンドファイルの内容を人手で図解したものであり、**自動生成・自動同期はされない**。ワークフロー(ゲート・レビューループ・ワークツリー分離・タスク分割等)を変更したら、このファイルの該当ステージも合わせて更新すること。忘れると内容が古くなる。

## サンプルアプリケーション(sample-app/)

実装対象は `sample-app/`(npm workspaces, TypeScript: `shared`=型定義, `backend`=NestJS, `frontend`=Vite+React)。「静的解析・自動チェックの考え方」「テストしやすい設計」を実地で確認するための最小構成で、詳しくは [sample-app/README.md](./sample-app/README.md) を参照。別のプロジェクトを対象にする場合は、`CLAUDE.md` の「開発・検証コマンド」セクションを該当プロジェクトのコマンドで上書きすること。

frontend/backendのAPI契約は `@sample-app/shared` の型定義を唯一の情報源にし、backend側はそれを実装するclass-validator製DTOでHTTP境界を検証する(手書きパースに頼らない)。詳細は [CLAUDE.md](./CLAUDE.md) と `docs/memory/entries/shared-types-and-dto-validation.md` を参照。

## CI(GitHub Actions)

`.github/workflows/ci.yml` がpush/PRごとに `sample-app/` の typecheck・lint・unit test・build・Playwright E2Eを実行する。ローカルで `/test` が回すのと同じチェックを、AIエージェント経由でない変更(人間の直push等)にも適用するための最後の砦。
