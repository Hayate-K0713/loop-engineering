---
name: worktree-session-shell-restrictions
type: pitfall
status: active
related_topics: [baseball-game]
created: 2026-10-13
updated: 2026-10-13
---

<!-- related_topics には、この規約/落とし穴を実際に適用したtopic-slugを追記していく(convention/pitfallで特に重要)。
     3つ以上になったらスキル化候補(詳細は`docs/process/shared-memory.md`の「再利用パターンのSkill化」)。 -->

トピック用 worktree に隔離されたセッションでは、シェル変数・ループ・ヒアドキュメント・`git -C <実行時に決まるパス>` を含む複合コマンドが「実行前に検証できない」として拒否される。スクリプトはファイルとして書き(Write ツール)、パスはリテラルで書く。また、`pkill -f <語>` はその語を含む自分のシェルも殺す(終了コード 144)ので、プロセスは PID 指定で止める。この環境の `ss` は何も出力しないため、ポートの空き確認には使えない(`ps aux | grep vite` などで確認する)。サブエージェントは報告用のファイル(レポート本文)を書けないことがあるので、本文は完了報告に含めてもらい、orchestrator が保存する。

**背景:** baseball-game 第2版の実装・テスト中に、複数のサブエージェントと orchestrator が同じ制約に繰り返し当たった(B1・B3・C2・F・G・tester・診断担当の報告)。

**適用範囲:** worktree 内で dev サーバ・Playwright・ビルドなどを動かすすべてのフェーズ。サブエージェントへの依頼文に「パスはリテラル、スクリプトは Write で作る、PID で止める」を書いておくと手戻りが減る。

**関連:** [[playwright-browser-revision-mismatch]]
