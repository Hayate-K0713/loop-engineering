---
name: pure-function-extraction
type: convention
status: active
related_topics: []
created: 2026-07-28
updated: 2026-07-28
---

ビジネスロジック(計算・変換・判定)は、フレームワーク依存のハンドラ(NestJSのコントローラ/サービス、Reactのコンポーネント等)から**純粋関数として切り出し**、そのハンドラは薄いグルーコード(パース・呼び出し・HTTPステータスの割り当てのみ)に留める。純粋関数はサーバー起動やDOMなしで直接ユニットテストできる。例: `sample-app/backend/src/logic/pricing.ts`(純粋関数)と、それを呼ぶだけの `sample-app/backend/src/quote/quote.service.ts`(DI境界のための薄いサービス)・`quote.controller.ts`(薄いコントローラ)。

**背景:** 設計・実装の中で最も寿命が長い投資はテスト可能な設計そのものであり、静的解析(ESLintルール等)より効果が長続きする。I/Oと計算ロジックを混ぜるとテストのためにサーバー・DB・ブラウザが必要になり、テストが書かれなくなる。参考: https://zenn.dev/singularity/articles/stopped-reviewing-my-code 。

**適用範囲:** `/design` でアーキテクチャ・実装ステップを分解する際、`design-reviewer` が設計をレビューする際、`/implement` で `implementer` が実装する際。新規ロジックを書くときだけでなく、既存の大きな関数から純粋ロジックを抽出してテストを追加するリファクタリングにも適用する。

**関連:** [[eslint-strictness-ratchet]]
