---
name: swiftshader-playwright-input-latency
type: pitfall
status: active
related_topics: [baseball-game]
created: 2026-10-13
updated: 2026-10-13
---

<!-- related_topics には、この規約/落とし穴を実際に適用したtopic-slugを追記していく(convention/pitfallで特に重要)。
     3つ以上になったらスキル化候補(詳細は`docs/process/shared-memory.md`の「再利用パターンのSkill化」)。 -->

headless Chromium(SwiftShader)で WebGL 画面を動かすと、メインスレッドが詰まり、Playwright の実入力(`page.mouse`・`page.keyboard`・`locator.click()`)がページに届くまで 0.2〜1 秒以上遅れる(並列実行で悪化。`locator.click()` は 1〜3 秒、`isEnabled()` は要素が無いと最大 30 秒待つ)。短い時間窓を狙う E2E・計測は次のように書く: マウスは事前に `mouse.move` で位置を決め、狙う瞬間は `down`/`up` だけ送る。状態の検出は `page.waitForFunction(..., { polling: "raf" })` と MutationObserver(消える属性は後から読まずに記録する)。反応時間はページ内の `performance.now()` や `event.timeStamp` で測る。「何も起きない」の確認は固定 sleep ではなく rAF の 2 フレーム待ち。ループ内の状態確認は `page.evaluate`・`count()`。見た目の連写は `page.clock.install` と `requestAnimationFrame` の手動 flush による仮想時間ハーネスで決定論的に撮る。キーの押しっぱなし(repeat)は同じキーへの `keyboard.down` の繰り返しで再現できる(`dispatchEvent` では既定動作も、リスナ間のマイクロタスクも再現しない)。

**背景:** baseball-game 第2版の E2E・手動確認(テストレポート [docs/tests/2026-10-12-baseball-game.md](../../tests/2026-10-12-baseball-game.md))。「Space でスイング」の E2E が、Space の到達が 1.06〜1.86 秒遅れて見逃し扱いになり、26 回中 1 回失敗した。GitHub Actions の runner も SwiftShader なので CI でも起こりうる。

**適用範囲:** sample-app で WebGL/Canvas を使う画面の E2E・手動確認・スクリーンショット撮影(`/implement` の E2E 担当、`tester`)。

**関連:** [[playwright-browser-revision-mismatch]] [[three-r186-pitfalls]] [[game-feel-needs-playability-check]]
