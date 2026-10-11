---
name: using-git-worktrees
description: 作業を孤立したgit worktreeで行うべきか判断し、このリポジトリの規約に沿って作成・利用する。「worktreeを作って」「作業を分離して」等の依頼、または複数セッションが同時にリポジトリを触る可能性がある作業の開始時に使う。外部プラグインに依存しない、このリポジトリ独自のスキル(adapted from obra/superpowers@using-git-worktrees, MIT License, Copyright (c) 2025 Jesse Vincent)。
---

# using-git-worktrees: このリポジトリでのworktree作成・利用

**このリポジトリには`/investigate`→`/design`→`/implement`→`/test`のトピックサイクル専用に確立済みのworktree運用がある(`docs/process/agent-cycle.md`の「ワークツリー分離(複数セッション対応)」節、`CLAUDE.md`のディレクトリ構成節)。このスキルは、その確立済み運用と衝突しないよう、まず「どちらの状況か」を判定してから動く。**

## Step 0: どちらの状況か判定する

1. **`/investigate`・`/design`・`/implement`・`/test`・`/cycle`・`/hotfix` のいずれかを実行中、またはこれから実行しようとしている(トピックサイクルの一部)か?**
   → **Yes**: このスキルではなく `.claude/skills/topic-worktree/SKILL.md` の `topic-worktree` スキルを使う(詳細な手順・背景は `docs/process/agent-cycle.md` の「ワークツリー分離」節も参照)。要点だけ再掲する:
   - 新規トピックなら: ベースブランチから `git worktree add -b feature/<topic-slug>(障害対応は hotfix/<incident-slug>) .claude/worktrees/<topic-slug> <base-branch>` で直接作成し、`EnterWorktree(path: .claude/worktrees/<topic-slug>)` で入る。**ネイティブの`EnterWorktree`だけで新規作成しない**(共有ディレクトリの`checkout`状態を変えるレースコンディションを避けるため、意図的に`git worktree add`を直接使う設計になっている)。
   - 既に存在するトピックワークツリーなら: 新規作成せず `EnterWorktree(path: ...)` で入るだけ。
   - このスキルの以降のステップ(Step 1以降)は適用しない。ここで終了。

2. **上記に当たらない、単発・アドホックな作業分離(例: 「このリファクタだけ別ワークツリーで試したい」「トピックサイクル外で軽く実験したい」)か?**
   → **Yes**: 以降のStep 1〜3に進む。

## Step 1: 既存の孤立ワークスペースを検出する(アドホック用途)

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
git rev-parse --show-superproject-working-tree 2>/dev/null   # 何か返ればsubmodule内 = 通常リポジトリとして扱う
```

`GIT_DIR != GIT_COMMON`(かつsubmodule内でない)なら既にworktree内にいる。新規作成しない。

## Step 2: 作成する(アドホック用途)

トピックサイクル用の `.claude/worktrees/<topic-slug>/` とは衝突しないよう、アドホック用途は別ディレクトリを使う。

1. 既存の `.worktrees/`(隠しディレクトリ優先)または `worktrees/` があればそれを使う。なければ `.worktrees/` をこのリポジトリのルートに作る。
2. 作成前に `.gitignore` 対象になっているか必ず確認する: `git check-ignore -q .worktrees || git check-ignore -q worktrees`。対象外なら `.gitignore` に追加してコミットしてから進める(worktreeの内容をリポジトリに誤ってコミットする事故を防ぐため)。
3. 作成する:
   ```bash
   git worktree add ".worktrees/<branch-name>" -b "<branch-name>"
   cd ".worktrees/<branch-name>"
   ```
   `git worktree add` が権限エラーで失敗した場合(サンドボックス拒否)は、その場で作業ディレクトリのまま続行する旨を伝える。

## Step 3: 動作確認

プロジェクトの依存関係セットアップ(`npm install`/`pip install`等、存在するファイルに応じて)を行い、既存のテストを実行してベースラインがクリーンな状態から始まっていることを確認する。失敗した場合は原因を報告し、続行するか調査するかを確認する。

## 完了報告

```
Worktree ready at <full-path>
Tests passing (<N> tests, 0 failures)
```

## よくある間違い

| 誤り | 実際 |
|------|------|
| トピックサイクル中にこのスキルのStep 1以降を使う | Step 0の判定を必ず先にする。トピックサイクルなら`agent-cycle.md`の手順に従い、このスキルのStep 1以降は使わない |
| アドホック用途で`.claude/worktrees/<topic-slug>`を使う | そのディレクトリはトピックサイクル専用。アドホック用途は`.worktrees/`を使い分ける |
| worktreeディレクトリが`.gitignore`済みだと思い込む | `git check-ignore`で必ず確認する |
