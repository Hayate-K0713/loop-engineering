---
name: dom-key-input-exclusivity
type: pitfall
status: active
related_topics: [baseball-game, baseball-game-v3]
created: 2026-10-13
updated: 2026-10-27
---

<!-- related_topics には、この規約/落とし穴を実際に適用したtopic-slugを追記していく(convention/pitfallで特に重要)。
     3つ以上になったらスキル化候補(詳細は`docs/process/shared-memory.md`の「再利用パターンのSkill化」)。 -->

同じキーを複数の機能が使う場合(例: Space = スイングと演出スキップ)、React の state だけで排他してはいけない。window に登録したネイティブの keydown リスナ同士の間ではマイクロタスクが走るため、先のリスナが更新した state で React が再描画済みになり、後のリスナからその新しい state が見える。先に処理した側が `event.preventDefault()` を呼び、後の側は先頭で `if (event.defaultPrevented) return;` とする。また、autoFocus された確定ボタンを持つ画面(結果画面など)が直前のキー操作で出る場合、押しっぱなしの Enter/Space の repeat keydown(Space は keyup も)がそのボタンを押してしまう。画面のルートで repeat の keydown と、この画面で keydown を見ていない Space の keyup を `preventDefault()` する。

**背景:** baseball-game 第2版で、Space でスイングすると同じ keydown で演出が即スキップされる不具合(G で発見、Fix1 で修正)と、最後の打席の演出を Enter/Space の長押しでスキップすると結果画面の「もう一度」が押されて意図せず再試合になる不具合(コードレビュー M1、Fix3 で修正)が出た。設計書 [docs/designs/2026-10-12-baseball-game.md](../../designs/2026-10-12-baseball-game.md) の「実装時の申し送り」参照。

**適用範囲:** sample-app でキーボード操作を持つ画面の設計・実装・レビュー。再現と回帰テストは Playwright の実キー入力(`keyboard.down` の繰り返し)で行う。

**関連:** [[swiftshader-playwright-input-latency]]
