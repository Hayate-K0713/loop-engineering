---
name: shared-types-and-dto-validation
type: convention
status: active
related_topics: []
created: 2026-07-28
updated: 2026-07-28
---

frontendとbackendの間のAPI契約は `sample-app/shared`(`@sample-app/shared`)の型定義を唯一の情報源とする。backendはHTTP境界で、その型を実装するclass-validator製DTO(例: `backend/src/quote/dto/quote-query.dto.ts`)を使って実行時検証する。手書きの `Number()` パースやif文での範囲チェックに頼らない。

**背景:** frontendがAPIの形を型として知らずに素の`fetch`で叩いていると、backend側の変更にfrontendが追従できず実行時にしか壊れていることに気づけない。また手書きのパース・検証はエンドポイントが増えるたびに同じミスを繰り返す温床になる。`shared`パッケージはビルド不要でTSソースをそのまま参照する構成にしており(npm workspacesのシンボリックリンク経由)、Turborepo等のビルドオーケストレーションを導入していない現状の規模に合わせている。

**適用範囲:** `/design` で新しいAPIエンドポイントを設計する際、`design-reviewer` がAPI契約の型共有・検証方針を確認する際、`/implement` でエンドポイントを実装する際。新しい型は必ず `shared/src/` に追加してからbackend/frontend双方から参照する。純粋関数側のガード節(`docs/memory/entries/pure-function-extraction.md`参照)とDTOバリデーションは役割が異なる(前者はHTTP以外の呼び出し元への保険、後者はHTTP境界での構造的チェック)ので、DTO側だけに寄せて純粋関数側の検証を消さないこと。

**関連:** [[pure-function-extraction]] [[eslint-strictness-ratchet]]
