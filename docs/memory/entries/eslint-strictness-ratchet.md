---
name: eslint-strictness-ratchet
type: decision
status: superseded
related_topics: []
created: 2026-07-28
updated: 2026-08-01
---

**superseded:** 2026-08-01、対象コードの指摘がゼロであることを確認した上で `error` に昇格した。以降は [[eslint-strictness-ratchet-v2]] を参照。

`sample-app/eslint.config.mjs` のサイズ・複雑さ・型の締め付けルール(`max-lines-per-function`, `complexity`, `max-depth`, `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-non-null-assertion`)は、**すべて `warn`(非ブロッキング)で導入する。** `error` に昇格させる前に、対象コードでの指摘件数をゼロまで drain すること。

**背景:** 既存コードに強いルールをいきなり `error` で入れると、`eslint-disable` 等での「回避の作法」が定着してしまう。まず `report`(warn)で可視化し、既存コードの指摘をゼロにしてから `error` に昇格させる("drain してから ratchet")という進め方を採用した。参考: https://zenn.dev/singularity/articles/stopped-reviewing-my-code 。`docs/process/sample-app-dev.md`の「静的解析・自動チェックの考え方」も参照。

**適用範囲:** `sample-app/` 配下のコードに対する `/implement`・`code-reviewer` の判断、および将来このルールセットを別プロジェクトへ移植する場合。特定のルールを `error` に昇格させる決定をしたら、この決定に上書きするのではなく、当エントリを `status: superseded` にして新しいエントリを作り直すこと(なぜ・いつ昇格したかの経緯を残すため)。

**関連:** [[pure-function-extraction]]
