---
description: 人間確認ゲート2(「承認してクローズ」)通過後、feature/hotfixブランチをPR経由でdevelop→mainへ反映する。/test・/cycle・/hotfixから呼び出される想定。
---

このコマンドは `/test` の人間確認ゲート2で「承認してクローズ」が選ばれた直後、対象トピックのワークツリー内から呼ばれる想定である。`docs/process/git-workflow.md` の「feature のフロー」「hotfix のフロー」「PRルール」を実装する具体的な手順を定義する。**main・developへの直接pushは行わない。すべてPR経由で反映する。**

## 前提

- 対象ブランチ名(`feature/<topic-slug>` または `hotfix/<incident-slug>`)を把握していること。
- ワークツリー内に未コミットの変更が残っていないこと(`/test` の手順7でコミット済みのはず。念のため `git status` で確認する)。

## 手順

1. `git status` でワークツリー内に未コミットの変更が残っていないことを確認する。
2. 対象ブランチを origin へpushする(ワークツリー内から直接実行できる。`ExitWorktree` は不要): `git push -u origin <branch>`。
3. **PR#1(develop向け)を作成する**: `gh pr create --base develop --head <branch> --title "<変更内容が分かるタイトル>" --body "<対応する調査・設計・テストドキュメントへのリンクを含む本文>"`。
4. PR#1のCIチェック(`.github/workflows/ci.yml` の `checks`/`e2e` 等)の完了を待つ(`gh pr checks <PR番号> --watch` 等)。**チェックが失敗した場合、マージに進まず人間に報告する。** 修正は `/implement` に戻って行い、ワークツリーはそのまま維持する。
5. CIがグリーンになったら、**マージを実行する直前に、必ず `AskUserQuestion` で人間に確認する。** 選択肢の例: 「マージする」「まだ待つ」「修正が必要なので中断する」。
6. 確認が得られたら `gh pr merge <PR#1番号> --merge` でマージする(featureブランチ自体はまだ残す。この時点では `--delete-branch` を付けない。PR#2でも同じブランチを使うため)。
7. developへのマージ後、**人間が実際に動作確認("打鍵確認")を行う。** エージェントは代行・省略しない。確認方法は人間の判断に委ねる(ローカルで`develop`をcheckoutして実行する、変更内容をレビューする、等。現状 `sample-app` にdevelop環境への自動デプロイの仕組みはないため、都度その場に応じた方法で確認してもらう)。エージェントは `AskUserQuestion` で「develop確認が完了し、mainへのPR作成に進めてよいか」を確認する。選択肢の例: 「確認完了、進めてよい」「まだ確認中、少し待つ」「問題が見つかった、修正に戻る」。
8. 問題が見つかった場合は `/implement` または `/design` に戻って修正する。develop向けPRは既にマージ済みのため、修正後は新しいコミットを同じブランチに積み、develop向けの追加PRを作るか直接手順9に進むかは状況に応じて人間に確認する。
9. 確認が完了したら、**同じブランチから main へのPR(PR#2)を作成する**: `gh pr create --base main --head <branch> --title "..." --body "..."`。develop向けPRの昇格ではなく、featureブランチそのものを対象にした独立したPRであることに注意(`docs/process/git-workflow.md`参照)。
10. PR#2のCIチェックの完了を待つ(手順4と同様)。
11. **マージを実行する直前に、再度 `AskUserQuestion` で人間に確認する。**
12. 確認が得られたら `gh pr merge <PR#2番号> --merge --delete-branch` でマージする(今回は `--delete-branch` を付け、リモートのブランチも削除する)。
13. ローカルのワークツリー・ブランチを削除する: `ExitWorktree(action: "keep")` でベースディレクトリに戻り、`git fetch origin --prune` でリモート追跡ブランチの削除を反映してから、`git worktree remove .claude/worktrees/<topic-slug>` と `git branch -D <branch>` を実行する(リモートで削除済みのため `-D` でよい)。
14. マージ・削除が完了したら、サイクル完了を人間に報告する(develop・mainそれぞれのPR番号・マージコミットへのリンクを含める)。

## コンフリクト・失敗時の扱い

- PR作成時・マージ時にコンフリクトが検出された場合、自動解決を試みず人間に報告する。
- CIチェックが失敗した場合、マージに進まず、原因を切り分けて `/implement` に戻り修正する(ワークツリーは維持したまま)。
- push が失敗した場合(認証エラー・リモート側が更新されている等)は自動リトライで誤魔化さず、エラー内容をそのまま人間に報告して停止する。

## 現状の制約(既知の限界)

- `sample-app` にはdevelop環境への自動デプロイの仕組みがまだない。手順7の「人間による動作確認」は、都度human側の判断・裁量に委ねている。将来デプロイパイプラインが整備されたら、この手順をより具体的な確認手段(URLでの確認等)に更新すること。
- 統合方式は既定で `gh pr merge --merge`(通常のマージコミット)を使う。squash/rebase を使いたい場合は、事前に人間と合意した上で調整すること。

## メタ編集(CLAUDE.md・`.claude/`・`docs/`配下)への適用

CLAUDE.md厳守ルール7の例外ルート(調査→設計→実装→テストの4フェーズを経ずに直接編集してよいメタな変更)についても、mainへの反映方法は本コマンドと同じ「直接pushしない、PR経由」に統一する。ただし以下の点で簡略化する。

- develop向けPR(手順1〜8)は不要。**メタ編集はアプリケーションの実行時挙動を変えないため、developでの動作確認という中間ステップに意味がない。** 変更用のブランチ(例: `feature/<meta-topic-slug>`。既存のトピック作業ワークツリーの一部として行っている場合はそのブランチのままでよい)から直接 `main` へのPRを作成する(手順9〜13のみを踏襲。手順9の `--base develop` は使わず `--base main` のみ)。
- `.github/workflows/ci.yml` は現状 `sample-app` 配下のみを対象にしており、メタ編集単体では通常CIが発火しない。発火しない場合はその旨を確認した上でマージ確認(手順11)に進んでよい。
- **マージ実行直前の `AskUserQuestion` による人間確認は省略しない。** 小規模な変更であっても、mainへの反映が人間の目を必ず経由するという保証を崩さないことが、`docs/process/git-workflow.md` の「main・developへの直接pushは禁止」というルールを例外なく適用する意味である。
