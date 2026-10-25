---
name: vitest-include-picks-playwright-specs
type: pitfall
status: active
related_topics: [baseball-game]
created: 2026-10-11
updated: 2026-10-11
---

<!-- related_topics には、この規約/落とし穴を実際に適用したtopic-slugを追記していく(convention/pitfallで特に重要)。
     3つ以上になったらスキル化候補(詳細は`docs/process/shared-memory.md`の「再利用パターンのSkill化」)。 -->

Vitestの `include` 既定値(`**/*.{test,spec}.?(c|m)[jt]s?(x)`)は Playwright の `e2e/*.spec.ts` にもマッチする。Playwrightを持つworkspace(sample-appでは `frontend`)にVitestを追加する場合は、`include` を `src/**/*.test.ts` 等に限定する(または `e2e/**` を `exclude` に足す)。

**背景:** [docs/investigations/2026-10-11-baseball-game.md](../../investigations/2026-10-11-baseball-game.md) の技術観点調査で確認(Vitest公式: https://vitest.dev/config/include )。限定しないと `vitest run` が Playwright の spec を読み込んで失敗する。逆方向(Playwrightが `*.test.ts` を拾う)は `testDir: ./e2e` のため起きない。

**適用範囲:** sample-appの `frontend`(またはPlaywright e2eを持つworkspace)にユニットテストを追加する `/design`・`/implement`。

**関連:** [[pure-function-extraction]]
