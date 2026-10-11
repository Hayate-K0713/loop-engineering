---
name: topic-worktree
description: トピック/機能ごとに専用のgit worktreeと専用ブランチ(`feature/<slug>`または`hotfix/<slug>`)を作成し、調査→設計→実装→テストなど複数フェーズを通じて同じworktreeを使い続ける。`/investigate`・`/design`・`/implement`・`/test`・`/hotfix`がフェーズ開始時に「このトピック用worktreeに入る/新規作成する」際に使う。単発・アドホックな作業分離(トピックサイクルの外)には代わりに`using-git-worktrees`を使う。
---

# topic-worktree: トピック専用worktreeの作成・入室

このリポジトリは複数セッション(異なるターミナル/チャットから起動された複数のClaude Codeインスタンス)が同時に同じリポジトリを修正することを想定している。共有の作業ディレクトリを複数セッションが同時に書き換えると、チェックアウト中ブランチの奪い合い・コミットの混線・共有ファイル(`docs/memory/MEMORY.md`等)の競合が起きるため、1つのトピック/機能に対して**1つの専用worktree・専用ブランチ**を作り、それを調査から実装・テストまで使い続ける。

呼び出し元(`/investigate`等のコマンド、または`/cycle`・`/hotfix`)は、このSkillに以下のパラメータを渡す。

- `topic-slug`: 対象トピックのslug(既存の成果物命名規則と対応させる)
- `branch-prefix`: `feature`(通常)または`hotfix`(障害対応)
- `base-branch`: 既定は`main`。ユーザーが明示的に別ブランチを指定していればそちら。**`hotfix`の場合は常に`main`を優先し**、別ベースにしたい特別な事情があればその場で人間に確認する。

## 手順

1. **現在のセッションが既に対象トピックのworktreeに入っているか確認する。**
   - 入っている場合、手順2〜4は不要。そのまま呼び出し元の作業に戻る。
   - **別のトピックのworktreeに入ったままの場合**、先に `ExitWorktree(action: "keep")` でそこから抜ける(作業中の変更はそのworktreeに残したまま保持する。削除しない)。
2. `.claude/worktrees/<topic-slug>` が既に存在するか確認する(`git worktree list`等)。存在する場合(他セッションが既にこのトピックを開始済み、または自分自身の過去の作業の再開)は新規作成せず、手順4だけを行う。
3. 存在しない場合、**ベースブランチ側の共有ディレクトリの状態(チェックアウト中のブランチ)を一切変更せずに**新規作成する:
   ```
   git worktree add -b <branch-prefix>/<topic-slug> .claude/worktrees/<topic-slug> <base-branch>
   ```
   - なぜ`git worktree add -b`で直接作成するのか: 以前は「共有ディレクトリで目的のブランチへ`git checkout`してから`EnterWorktree(name: ...)`(`baseRef: "head"`、現在の実行ディレクトリのHEADから分岐)」という方式だったが、複数セッションが同時に別々のベースブランチを指定すると`checkout`同士が競合し、意図しないブランチから分岐しうるレースコンディションがあった。`git worktree add -b <branch> <path> <base-branch>`は共有ディレクトリの状態を変更せず分岐元を明示的に指定できるため、このレースが原理的に発生しない。
   - `<branch-prefix>/<topic-slug>`と同名のブランチが既に存在する(worktreeには紐付いていない)等の理由でコマンドが失敗した場合、無理に別名へリネームしたり強制上書きしたりせず、状況を人間に報告して停止する。
4. `EnterWorktree(path: .claude/worktrees/<topic-slug>)` を呼び出し、このセッションをそのworktreeへ切り替える。
5. サブエージェント(`investigator`・`designer`・`implementer`・`tester`等)に委譲する場合、委譲は**メインセッションがこのworktreeに入った後**に行い、サブエージェントがそのworktree配下で作業するようにする。

以降のフェーズ(`/design`・`/implement`・`/test`)がこのSkillを再度呼び出す場合、手順1〜2で「既に存在する」と判定されるため、`git worktree add`による再作成は起きない(`EnterWorktree(path:...)`で入り直すだけ)。

## worktreeの削除

このSkillはworktreeの**作成・入室**のみを担う。削除(サイクル完了後・PRマージ後)は呼び出し元(`.claude/commands/release.md`)の責務であり、このSkillでは行わない。

## よくある間違い

| 誤り | 実際 |
|------|------|
| ベースブランチ側で`git checkout <branch>`してから`EnterWorktree(name:...)`を使う | レースコンディションがあるため使わない。必ず`git worktree add -b`で直接分岐する |
| worktreeが既に存在するのに`git worktree add`し直す | 既存なら`EnterWorktree(path:...)`で入るだけ。再作成しない |
| 別トピックのworktreeに入ったまま新しいトピックの作業を始める | 先に`ExitWorktree(action:"keep")`で抜ける(削除はしない) |
| hotfixなのにユーザー未指定のベースブランチを`main`以外にする | hotfixは常に`main`をベースにする。変えたい場合は人間に確認する |
