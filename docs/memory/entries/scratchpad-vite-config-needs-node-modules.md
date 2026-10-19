---
name: scratchpad-vite-config-needs-node-modules
type: pitfall
status: active
related_topics: [baseball-game]
created: 2026-10-19
updated: 2026-10-19
---

<!-- related_topics には、この規約/落とし穴を実際に適用したtopic-slugを追記していく(convention/pitfallで特に重要)。
     3つ以上になったらスキル化候補(詳細は`docs/process/shared-memory.md`の「再利用パターンのSkill化」)。 -->

撮影・確認用に、ソースを変えずに差し替える vite 設定(`vite.config.mjs`)を scratchpad に置くと、vite が設定ファイルを scratchpad 内にバンドルするため、`@vitejs/plugin-react` が内部で import する `react-refresh` を解決できず、ページが空白のまま(`baseball-title` が 60 秒待っても現れない)になる。dev サーバのログに `Cannot find package 'react-refresh' imported from …/vite.config.mjs.timestamp-….mjs` が出る。**scratchpad の撮影ディレクトリに `node_modules` → worktree の `sample-app/node_modules` のシンボリックリンクを張る**と動く(過去のハーネス `h13/` は張ってあった)。再利用するときは、既存ハーネスをコピーする際に `node_modules` のリンクも一緒に作る。サーバはバックグラウンドで起動したら PID を控えて `kill <PID>` で止める。

**背景:** baseball-game の修正設計 H0〜H13 の `/test`(テストレポート [docs/tests/2026-10-19-baseball-game-feel.md](../../tests/2026-10-19-baseball-game-feel.md))で、h12 のハーネスをコピーして使おうとして遭遇した。

**適用範囲:** worktree の dev サーバに設定の差し替え(球種・着弾点の固定など)を足して決定論的にスクリーンショットを撮る `/test`・`tester`・H12 相当の見た目確認。

**関連:** [[swiftshader-playwright-input-latency]] [[worktree-session-shell-restrictions]]
