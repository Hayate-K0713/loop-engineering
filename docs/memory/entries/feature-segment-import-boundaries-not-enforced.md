---
name: feature-segment-import-boundaries-not-enforced
type: open-question
status: active
related_topics: [baseball-game]
created: 2026-10-12
updated: 2026-10-12
---

<!-- related_topics には、この規約/落とし穴を実際に適用したtopic-slugを追記していく(convention/pitfallで特に重要)。
     3つ以上になったらスキル化候補(詳細は`docs/process/shared-memory.md`の「再利用パターンのSkill化」)。 -->

sample-app frontend の feature 内セグメント(types / model / render / hooks / ui)の import 方向(例: `from "three"` は `render/` のみ、`ui/` は `model/` を import しない、`render/` は `model/` を import しない)は ESLint で機械強制されておらず、code-reviewer/tester の grep による構造検査に頼っている。`no-restricted-imports` やパス単位の境界ルールで強制するかは未決定で、人間判断が必要(導入する場合は [[eslint-strictness-ratchet-v2]] と同じ「まず warn、drain 後に error」の手順に従う別 topic)。

**背景:** [docs/designs/2026-10-12-baseball-game.md](../../designs/2026-10-12-baseball-game.md) で `render/` セグメントと `model/world/` を追加し、境界が増えた([[frontend-3d-three-in-render-segment]])。第1版でも同種の構造検査を grep で行っていた([docs/designs/2026-10-11-baseball-game.md](../../designs/2026-10-11-baseball-game.md))。境界違反は lint でも型でも落ちず、レビューの見落としに依存する。

**適用範囲:** sample-app frontend で feature のセグメント構成を設計・レビューする場面。別 topic として境界ルールを導入するかの判断材料。

**関連:** [[eslint-strictness-ratchet-v2]] [[frontend-3d-three-in-render-segment]] [[react-hooks-lint-not-installed]]
