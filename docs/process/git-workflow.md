# Git運用フロー

このドキュメントは loop-basic リポジトリのブランチ運用・PRルールを定義する。`CLAUDE.md` から参照される。

> **現状ステータス(2026-08-13時点): 移行完了。** `/cycle`・`/investigate`・`/hotfix`・`/test`・`/release` の自動化、直接pushを検知する`PreToolUse`フック、GitHub側のブランチ保護設定のすべてが本ルールに追随済み。詳細は本ドキュメント末尾の「既存の自律開発サイクルとの関係(移行状況)」を参照。

## ブランチモデル

| ブランチ | 役割 | 直接push |
| --- | --- | --- |
| `main` | 本番相当の安定ブランチ。常にデプロイ可能な状態を保つ。 | **禁止**。PRのみで反映。 |
| `develop` | 統合・検証用のブランチ。featureの統合先。 | **禁止**。PRのみで反映。 |
| `feature/<topic-slug>` | 個々の変更(機能追加・改善・修正)用ブランチ。`main` から切る。 | 可(自分のブランチへの作業コミットは自由) |
| `hotfix/<incident-slug>` | 障害復旧用ブランチ。`feature` と同じ構造だが、インシデント対応であることを踏まえた運用を行う。`main` から切る。 | 可(自分のブランチへの作業コミットは自由) |

## ブランチ命名規則

- `feature/<topic-slug>` (例: `feature/introduce-knip`)
- `hotfix/<incident-slug>` (例: `hotfix/quote-api-500`)
- `<topic-slug>`/`<incident-slug>` は既存の成果物命名規則(`docs/process/agent-cycle.md`の「成果物の命名規則」)で使われる slug と同じものを流用し、調査・設計・テストドキュメントとブランチ名を対応づける。

## feature のフロー

```
main ──●───────────────────────────────────●──   (PR#2: feature → main。人間による打鍵確認後にマージ)
        \                                  ↑
         \                                 │(PR#2)
          feature/<topic-slug> ────────────┤
           │                               │
           ↓(PR#1: feature → develop)       │
develop ────●──────────────────────────────┘
             ↑
             │ 人間が develop 環境(または相当する検証手段)で
             │ 動作確認("打鍵確認")を行う
```

1. `feature/<topic-slug>` を `main` から切る(`git worktree add -b feature/<topic-slug> ... main` のように、既存のトピック専用ワークツリー作成の仕組みをブランチ名のみ変更して流用する)。
2. 実装・調査・設計・テストは既存の自律開発サイクル(`docs/process/agent-cycle.md`)をそのまま踏襲する。このドキュメントはブランチ運用のみを定義し、調査→設計→実装→テストの中身は変更しない。
3. サイクルが完了し、既存の人間確認ゲート2(テスト承認)を通過したら、**`feature/<topic-slug>` → `develop` へのPR(PR#1)を作成する**。
4. PR#1のCIチェック(`.github/workflows/ci.yml`の`checks`/`e2e`等、既存の必須チェック)がグリーンであることを確認する。
5. **PR#1を実際にマージする直前に、必ず `AskUserQuestion` で人間に確認する。** 確認が得られたらエージェントがマージを実行してよい。
6. develop環境(または相当する検証手段)で、人間が実際に動作確認("打鍵確認")を行う。この確認は人間が行うものであり、エージェントが代行・省略してはならない。
7. 人間の動作確認が取れたら、**同じ `feature/<topic-slug>` ブランチから `main` へのPR(PR#2)を作成する。**(`develop` → `main` への昇格PRではなく、featureブランチそのものを対象にした独立したPRであることに注意。develop向けPRとmain向けPRは同じdiffを持つ2本の独立したPR。)
8. PR#2のCIチェックがグリーンであることを確認する。
9. **PR#2を実際にマージする直前にも、必ず `AskUserQuestion` で人間に確認する。** 確認が得られたらエージェントがマージを実行してよい。
10. `main` へのマージが完了したら、リリース完了。`feature/<topic-slug>` ブランチ・トピック専用ワークツリーを削除する。

## hotfix のフロー

障害(インシデント)発生時に、`main` から `hotfix/<incident-slug>` を切る。構造は feature と同じ(`hotfix` → `develop`(PR)→ 人間確認 → `hotfix` → `main`(PR))だが、以下の点でインシデント対応であることを考慮する。

- 調査・設計フェーズは被害状況に応じて簡略化してよい(ドキュメントの厚みを最小限にする、選択肢比較を省略する等)。ただし**必須の人間確認ゲート自体は省略しない**。
- develop環境での動作確認("打鍵確認")は迅速に行う。関係者間で優先度を最大化してよい。
- **障害対応の緊急性を理由に、PRを経由しない直接pushやブランチ保護のバイパスは行わない。** 緊急時であっても `main`/`develop` への反映は必ずPR経由とする。これは意図的な制約であり、インシデント対応の速度と引き換えに事故(誤ったコミットの混入、レビュー省略による見落とし)のリスクを増やさないためである。

## PRルール

1. **`main`・`develop` への直接pushは禁止。** すべての変更はPR経由で反映する。
2. PRのタイトル・本文には変更内容が分かるように記述する(何を・なぜ変更したか。対応する調査・設計・テストドキュメントへのリンクを含めることが望ましい)。
3. PRのCIチェック(既存の `.github/workflows/ci.yml` の `checks`/`e2e` 等)がすべてグリーンであることをマージの前提とする。CIが構成されている場合、それを省略してマージしない。
4. **PRの実際のマージ(`gh pr merge` 等の実行)は、実行直前に必ず `AskUserQuestion` で人間に確認してからエージェントが行う。** マージ後の取り消しはリバートコミットが必要になり心理的・作業的コストが高いため、他の自律的なフェーズ遷移とは異なり、都度の確認を必須とする(既存の人間確認ゲート1・2とは別の、マージ操作固有の確認ポイントであることに注意)。
5. `feature/<topic-slug>` → `develop` のPR(PR#1)と `feature/<topic-slug>` → `main` のPR(PR#2)は独立している。PR#1のマージは、PR#2をマージしてよいことの技術的な前提条件ではない(develop向けPRがマージされていなくてもmain向けPRを作成すること自体は可能)。ただし運用上は、必ずPR#1マージ → develop環境での人間の動作確認 → PR#2作成、の順序を守る(develop環境での検証を経ずにmainへ反映しない)。

## 既存の自律開発サイクルとの関係(移行状況)

本ドキュメントは当初、Git運用フローの"あるべき姿"の定義から始まり、その後 `.claude/commands/` 側の実装への追随を段階的に行った。移行状況は以下のとおり(2026-08-13時点)。

- [x] `develop` ブランチを `main` から作成しリモートへpush済み。
- [x] `/investigate`(および `/cycle`)のブランチ名を `feature/<topic-slug>` に変更済み(`.claude/commands/investigate.md`)。
- [x] 障害対応用の `/hotfix <incident>` コマンドを新設済み(`.claude/commands/hotfix.md`)。`hotfix/<incident-slug>` ブランチを使い、調査・設計の厚みは簡略化を許容するが、ゲート・レビュー・PR経由の反映は省略しない。
- [x] `/test` のゲート2(「承認してクローズ」)通過後の処理を、PRベースのフロー(`develop` 向けPR → CIグリーン確認 → 人間確認 → マージ → develop環境で人間が動作確認 → `main` 向けPR → CIグリーン確認 → 人間確認 → マージ)に置き換え済み。具体的な手順は新設した `.claude/commands/release.md` に切り出し、`/test`・`/cycle`・`/hotfix` はそこから参照する。`CLAUDE.md` 厳守ルール7・8もこの変更に合わせて更新済み(メタ編集の反映もPR経由に統一)。
- [x] エージェント側の `PreToolUse` フック(`.claude/settings.json`)。`git push origin main`・`git push origin develop`(明示的な指定、`HEAD:main`等のrefspec、`--force`/`-f`系、ブランチ未指定のまま `main`/`develop` にチェックアウト中の状態での bare `git push` のいずれも検知してブロックする。自分のブランチへのpush(`release.md`の手順)は妨げない)を追加済み。テスト済み(想定される主要なpushパターンで期待どおりブロック/許可されることを確認)。
- [x] ブランチ保護(直接push禁止)を機械的に強制するGitHub側の設定。`main`・`develop` それぞれに `gh api` でbranch protectionを設定済み: `required_status_checks`(`typecheck / lint / test / build`・`Playwright e2e`。非ブロッキング運用の `Knip` ジョブは意図的に対象外)、`enforce_admins: true`(管理者権限を持つトークンでも直接pushをバイパスできない)、`required_pull_request_reviews.required_approving_review_count: 0`(ソロメンテナのため承認数は0だが「PR必須」自体は有効)、`allow_force_pushes: false`、`allow_deletions: false`。GitHubの ref update API に対する直接更新の試みが実際に `422 Changes must be made through a pull request` で拒否されることを確認済み(2026-08-13)。

**本ドキュメントが定義する目標状態への移行はこれで完了した。** `main`・`develop` への反映は、エージェント側の運用ルール・`PreToolUse`フックに加え、GitHub側のブランチ保護によっても機械的に強制されている(三重の防御)。
