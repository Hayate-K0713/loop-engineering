# loop-basic — 自律開発エージェント運用マニュアル

このリポジトリは「調査 → 設計 → 製造 → テスト」を自律的に回す開発エージェントのための基本ファイル群を管理する。**設計の直後**と**テストの直後**の2箇所に人間による確認ゲートを設ける。それ以外のフェーズ遷移は自律的に進めてよい。加えて、設計完了後と実装完了後にはそれぞれ**別のサブエージェントによる自動レビュー**(最大2ラウンド)を挟む。レビューは人間確認ゲートではなく完全に自律的なチェックだが、解消しきれなかった指摘は直後の人間確認ゲートに必ず引き継ぐ。さらに、実装フェーズでは**メインエージェント(オーケストレーター)自身はコードを書かない**。必ず `TaskCreate` で設計をタスクに分割し、依存関係のないタスクは `implementer` サブエージェントへ並列dispatchし、`TaskList`/`TaskUpdate` で進捗を確認する役割に徹する。

## このリポジトリのルール文書(構成)

本ファイル(`CLAUDE.md`)は常にセッションへ自動的に読み込まれる**最上位のルール文書**であり、フェーズを問わず常に成立する原則(ゲート・厳守ルール・ディレクトリ構成・サブエージェントの使い分け)だけを収める。各フェーズ・トピックの詳細手順は、以下の個別ドキュメントに切り出している。**これらは自動では読み込まれないため、該当する作業に着手する前に必ず一読すること**(`docs/memory/MEMORY.md` を都度読む既存の運用と同じ考え方)。

- **`docs/process/git-workflow.md`** … Gitブランチ運用(`main`/`develop`/`feature`/`hotfix`)、PRルール。`git worktree` の作成・ブランチのマージ・pushを行う前に必ず読む。
- **`docs/process/agent-cycle.md`** … 調査→設計→実装→テストサイクルの詳細な仕組み(レビューループ、調査のファンアウト、ワークツリー分離、タスク分割・並列化、成果物命名規則、サブエージェントの使い分け)。`/investigate`・`/design`・`/implement`・`/test`・`/cycle` を実行する前に必ず読む。
- **`docs/process/shared-memory.md`** … `docs/memory/` の運用ルール(カテゴリ、読み書きのルール、Skill化フロー)。あらゆるフェーズの作業開始前に必ず読む `docs/memory/MEMORY.md` と対になる詳細ドキュメント。
- **`docs/process/sample-app-dev.md`** … 実装対象プロジェクト(`sample-app/`)の開発・検証コマンド、手動確認の使い分け、静的解析・自動チェックの考え方。`/test`・`code-reviewer`・`tester` は必ず読む。

## ワークフロー全体像

```
/investigate <topic>   調査          … トピック専用git worktreeを作成して開始(既定ベースはmain)、成果物を docs/investigations/ に保存
        ↓
/design                 設計          … 同じワークツリー内で継続、成果物を docs/designs/ に保存
        ↓
   [設計レビュー]         ← design-reviewer による自動レビュー、最大2ラウンド(人間は介在しない)
        ↓
   [人間確認ゲート]      ← ここで必ず停止し、人間の承認を待つ(未解決レビュー指摘があれば提示)
        ↓
/implement               製造(実装)   … トピック専用の git worktree 内で、TaskCreateによるタスク分割 → implementerへ並列dispatch(メインエージェントは実装しない)
        ↓
   [コードレビュー]       ← code-reviewer による自動レビュー、最大2ラウンド(人間は介在しない)
        ↓
/test                    テスト        … 同じワークツリー内で自律実行、結果を docs/tests/ に保存
        ↓
   [人間確認ゲート]      ← ここで必ず停止し、人間の承認を待つ
        ↓
   承認時のみベースブランチへマージ・origin へ push・ワークツリー削除
        ↓
     完了 / 次サイクルへ
```

`/cycle <topic>` はこの一連の流れを最初から最後まで（2つのゲートを含めて）通しで実行するオーケストレーションコマンド。個別フェーズだけを実行したい場合は `/investigate`・`/design`・`/implement`・`/test` を単体で使う。障害(インシデント)対応には `/cycle` の代わりに `/hotfix <incident>` を使う(構造は同じだが `hotfix/<incident-slug>` ブランチを使い、調査・設計の厚みを簡略化できる)。ゲート2通過後の `main`/`develop` への反映(PR作成・マージ)は `/release` が担う(`/cycle`・`/hotfix` から自動的に呼び出される)。各フェーズの詳細な仕組みは `docs/process/agent-cycle.md`、Gitブランチ運用・PRの詳細は `docs/process/git-workflow.md` を参照。

## 厳守ルール(ゲート)

1. **設計完了後、人間の明示的な承認(Approve)を得るまで `/implement` を自動実行してはならない。** 承認・差し戻し・修正依頼のいずれかが人間から得られるまで停止する。
2. **テスト完了後、人間の明示的な確認を得るまでサイクルを完了(クローズ)してはならない。** 不合格・要修正の場合は `/design` または `/implement` に戻る。
3. ゲートでの確認には `AskUserQuestion` ツールを使い、選択肢(承認/差し戻し/修正依頼など)を明示すること。曖昧な「進めてよいですか?」で終わらせない。
4. 各フェーズの成果物は必ずファイルとして残す(口頭やチャットのみで済ませない)。次フェーズはそのファイルを読んで開始する。
5. 調査・製造・テストのフェーズ内で致命的な不確実性(要件不明、認証情報が必要、破壊的操作が必要 等)にぶつかった場合は、そのフェーズ内であっても停止して人間に確認してよい。
6. **`/implement` を実行しているメインエージェントは、自分でファイルを編集・作成して実装してはならない。** 必ず `TaskCreate` でタスクに分割し、`implementer` サブエージェントに委譲する。タスクが1つしかない場合も例外なく委譲する(詳細は `docs/process/agent-cycle.md` の「実装フェーズのタスク分割・並列化」節)。
7. **スラッシュコマンド(`/cycle` 等)を使わず、自然言語で実装・修正を依頼された場合も、対象が実装対象プロジェクト(現在は `sample-app/`)のコード変更であれば、`/cycle` を実行したときと同じ手順(調査→設計→ゲート1→実装→テスト→ゲート2)を必ず起動しなければならない。** 「軽微な変更だから」「スラッシュコマンドが明示されていないから」を理由に、このフローを省略して直接ファイルを編集してはならない。対象外なのは、CLAUDE.md自体・`.claude/`・`docs/`配下の運用ルールやドキュメントに関するメタな変更で、これらは引き続き調査→設計→実装→テストの4フェーズを経ずに直接編集してよい(このフロー自体を変更する作業に、このフローを適用すると循環してしまうため)。**ただし、編集後にmainへ反映する方法(git操作)は feature/hotfix と同じくPR経由に統一されている(直接pushはしない)。詳細はルール8および `.claude/commands/release.md` の「メタ編集(CLAUDE.md・`.claude/`・`docs/`配下)への適用」を参照。** **このルールは`.claude/settings.json`のhook(PreToolUse、`Write|Edit`と`Bash`)によっても機械的に強制されている**: `sample-app/`・`.github/workflows/`配下のファイルをトピック専用ワークツリー外で編集しようとする、またはそれらのステージ済み変更をワークツリー外で`git commit`しようとすると、hookがブロックする。ルール6・7は口頭の指示だけでなくこのhookによる二重の防御で担保されている。
8. **`main`・`develop` への直接pushは禁止。ローカルにコミットしただけの状態、あるいはトピックブランチをpushしただけの状態で作業を終えてはならない。** 人間確認ゲート(ゲート2「承認してクローズ」)通過後、およびルール7の例外ルート(CLAUDE.md自体・`.claude/`・`docs/`配下のメタ編集)でコミットした後は、いずれも `.claude/commands/release.md` の手順(feature/hotfixブランチをpush → `develop` 向けPR作成・CI確認・**マージ直前に`AskUserQuestion`で人間確認**・マージ → 人間による動作確認 → `main` 向けPR作成・CI確認・**マージ直前に`AskUserQuestion`で人間確認**・マージ)を実行して初めてその単位の作業が完了したとみなす。改めて人間から「pushして」「マージして」という指示を待つ必要はない(ゲート2の承認、およびメタ編集の完了報告そのものがrelease手順の実行を含む承認である)が、**PR作成後の実マージ操作(`gh pr merge`)そのものは、実行直前に必ず `AskUserQuestion` で確認を取ってから行う**(ルール3のゲート確認とは別に、マージという不可逆性の高い操作に固有の確認ポイントである)。コンフリクトやCIの失敗が発生した場合は自動解決を試みず、その場でエラーをそのまま人間に報告して停止する。ローカルにだけコミット・pushが積まれ `main`/`develop` が古いまま放置されると、GitHub Pages 等 `origin` の状態に依存する仕組みが古いまま取り残される(実際に発生した障害。詳細は `docs/memory/entries/unpushed-local-commits-stale-origin.md`。この障害を受けて導入した「ゲート2通過後は必ずpushまで行う」という原則自体は現在も有効であり、今回のPRベース化はその実現手段を直接pushからPR経由へ変更したものである)。

## ディレクトリ構成

- `docs/investigations/` … 調査結果(1トピック1ファイル、`YYYY-MM-DD-<topic-slug>.md`)
- `docs/designs/` … 設計ドキュメント(調査と同じslugで対応付ける)
- `docs/tests/` … テスト結果レポート
- `docs/templates/` … 各成果物のテンプレート。新規作成時は必ずこれをコピーして使う
- `docs/memory/` … サブエージェント・フェーズ横断の**共有メモリ**(詳細は `docs/process/shared-memory.md`)
- `docs/process/` … このリポジトリの運用ルールの詳細ドキュメント(Git運用フロー、自律開発サイクルの仕組み、共有メモリの運用、sample-appの開発・検証コマンド)。上記「このリポジトリのルール文書(構成)」参照
- `docs/investigations/_parts/<topic-slug>/` … 調査フェーズを並列化(ファンアウト)した際の、観点ごとの作業ファイル置き場(詳細は `docs/process/agent-cycle.md` の「調査フェーズの並列化(ファンアウト)」)
- `.claude/worktrees/<topic-slug>/` … 調査フェーズ以降(調査・設計・実装・テスト)で分離された git worktree(詳細は `docs/process/agent-cycle.md` の「ワークツリー分離(複数セッション対応)」)。`.gitignore` 対象で、通常はマージ後に削除される
- `.claude/commands/` … `/investigate` `/design` `/implement` `/test` `/cycle` `/hotfix` `/release` の定義
- `.claude/agents/` … 各フェーズを担当するサブエージェント定義(investigator / designer / implementer / tester / design-reviewer / code-reviewer)
- `.claude/settings.json` … プロジェクト共有設定。`worktree.baseRef: "head"`(topic用ワークツリーは`git worktree add`で明示的に分岐元を指定するため直接は使わないが、他の用途でのEnterWorktree呼び出しに備えて設定済み)、`hooks.PreToolUse`(`sample-app/`・`.github/workflows/`配下の変更・コミットをトピック専用ワークツリー外で行おうとするとブロックするガードレール。詳細は「厳守ルール」ルール7)

## サブエージェントの使い分け

- **investigator**: 読み取り専用に近い調査(Web検索・コード探索)。実装はしない。
- **designer**: 調査結果を踏まえて設計書を書く。コードは書かない。DBスキーマ変更を伴う設計は `db-designer` に委譲する。
- **db-designer**: `designer` から、テーブル新設・スキーマ変更・データモデリングを伴う設計のときだけ呼び出される補助エージェント。外部Skill(`database-schema-designer`)を使ってDBスキーマ部分の案を作り、テキストで返す(自分ではファイルを書かない)。
- **frontend-designer**: `designer` から、フロントエンドのディレクトリ構成・コンポーネント配置の判断を伴う設計のときだけ呼び出される補助エージェント。feature分割・FSD由来のセグメント分割(api/model/hooks/types/ui)・bulletproof-react由来の共有層を組み合わせた標準アーキテクチャに沿って構成案を作り、テキストで返す(自分ではファイルを書かない)。
- **design-reviewer**: designerとは別の視点で設計書をレビューする。自分では書き直さない。
- **implementer**: `TaskList`で割り当てられた単一タスクの範囲だけを実装する。設計にない範囲を勝手に広げない。並列dispatch中は自分でコミットも共有メモリへの書き込みも行わない。
- **code-reviewer**: implementerとは別の視点で実装をレビューする。自分では修正しない。
- **tester**: 実装を検証し、レポートを書く。テストを通すためにテスト自体を歪めない(テストコードの改変は原則implementerの担当に戻す)。

各フェーズはメインの会話コンテキストを汚さないよう、可能な限り対応するサブエージェント(Agent tool)に委譲する。**特に実装フェーズは、メインエージェントが自分で実装することを禁止し、`TaskCreate`/`TaskUpdate`/`TaskList`によるタスク分割・並列dispatch・進捗確認を必須とする。** 詳細・各サブエージェントの詳しい役割分担は `docs/process/agent-cycle.md` の「サブエージェントの使い分け」を参照。
