---
name: unpushed-local-commits-stale-origin
type: pitfall
status: active
related_topics: []
created: 2026-08-12
updated: 2026-08-12
---

ローカルの `main` にコミットするだけでは足りない。`origin` への push を忘れると、GitHub Pages・CI など `origin` の状態に依存する仕組みがすべて古いまま取り残される。

**背景:** `docs/pipeline-overview.html` をアーティファクトと同期させる作業中、ローカルファイルとアーティファクトの内容は完全に一致していたにもかかわらず、比較に使った GitHub Pages 版だけが古い内容(`git worktree add -b` 方式へ移行する前の記述)を表示していた。原因調査の結果、`main` が `origin/main` より8コミット先行しており、その8コミット(`docs/pipeline-overview.html` の複数回の同期コミットを含む)が一度も `git push` されていなかったことが判明した。GitHub Pages 自体は正しく push 済みの内容をビルド・配信していただけで、キャッシュや不具合ではなかった。この経緯を受けて、CLAUDE.md 厳守ルール8として「ゲート2承認後」および「CLAUDE.md/.claude/docs のメタ編集完了後」に `git push origin <base-branch>` を必須化した。

**適用範囲:** `/test` のゲート2「承認してクローズ」でベースブランチへマージした直後、および CLAUDE.md 厳守ルール7の例外ルート(CLAUDE.md自体・`.claude/`・`docs/`配下のメタ編集)でコミットした直後。どちらも、コミットして終わりにせず `git push origin <base-branch>` まで実行してから作業完了と報告すること。作業の合間に `git status -sb` で `ahead N` が残っていないか確認する習慣も有効。

**関連:** なし
