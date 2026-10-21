---
name: react-hooks-lint-not-installed
type: open-question
status: active
related_topics: [baseball-game]
created: 2026-10-11
updated: 2026-10-11
---

sample-appのESLint(`eslint.config.mjs`)には `eslint-plugin-react-hooks` が入っておらず、`react-hooks/exhaustive-deps`(依存配列の誤り)や `rules-of-hooks` が強制されない。effectを多用するfrontend実装(rAFループ、タイマー、イベントリスナ)では、stale closure・cleanup漏れ・StrictModeでの二重実行がlintで検出されない。導入するか(導入するなら既存コードのdrainとerror昇格の手順)は未決定で、人間判断が必要。

**背景:** [docs/investigations/2026-10-11-baseball-game.md](../../investigations/2026-10-11-baseball-game.md) の技術観点調査で判明。[docs/designs/2026-10-11-baseball-game.md](../../designs/2026-10-11-baseball-game.md) では導入をスコープ外とし、`useLatest`(最新値ref)パターン・cleanup徹底・dev server(StrictMode)で走るe2e・hooksの重点レビューで代替している。導入する場合は [[eslint-strictness-ratchet-v2]] と同じ「まずwarn、drain後にerror」の手順に従う別topicになる。

**適用範囲:** sample-appのfrontendでhooks/effectを設計・実装・レビューする場面。別topicとして `eslint-plugin-react-hooks` を導入するかの判断材料。

**関連:** [[eslint-strictness-ratchet-v2]]
