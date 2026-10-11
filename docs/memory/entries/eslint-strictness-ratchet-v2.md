---
name: eslint-strictness-ratchet-v2
type: decision
status: active
related_topics: [introduce-knip]
created: 2026-08-01
updated: 2026-08-12
---

`sample-app/eslint.config.mjs` のサイズ・複雑さ・型の締め付けルールに加え、`eslint-plugin-sonarjs`(recommended, 217ルール)・`eslint-plugin-security`(recommended, 14ルール)を導入し、全て `error`(ブロッキング)にしている: `max-lines-per-function`(max 60）, `complexity`(閾値20), `max-depth`(閾値4), `max-params`(閾値6), `max-nested-callbacks`(閾値4), `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-non-null-assertion`, `sonarjs/*`(recommendedは元々全ruleがerror), `security/*`(recommendedはデフォルトwarnのため個別にerrorへ上書き)。加えて `@typescript-eslint/no-unused-vars` に `ignoreRestSiblings: true` を付与、`**/*.spec.{ts,js}` / `**/*.test.{ts,js}` では `max-lines-per-function` / `max-nested-callbacks` をoff、`eslint-plugin-prettier/recommended`(+ `.prettierrc`: `{ printWidth: 160 }`)でフォーマットもlintに統合済み。昇格前に `npx eslint .` で該当ルールを一時的に `error` にして指摘ゼロを確認済み(sonarjs/security/prettierとも既存コードは無修正で通過)。

**背景:** [[eslint-strictness-ratchet]] で定めた「まずwarnで導入し、指摘がゼロになってからerrorに昇格させる」方針に従い、ドレイン確認の上で昇格した(サイズ・複雑さ系→型系→sonarjs/security→no-unused-vars/テスト例外/prettierの順で段階的に追加)。いずれも既存コードに指摘・フォーマット差分が一件もなかったため、修正を挟まずそのままerror化できた。参照元は https://github.com/receptron/mulmoterminal の `eslint.config.js` だが、完全な移植ではなく一部意図的に差分がある: mulmoterminalは `max-params` を`warn`のまま(1箇所の意図的な例外があるため)・`security/detect-non-literal-fs-filename` 等3ルールを誤検知が多い理由でoffにしているが、sample-appはユーザーの明示的な指示で全て`error`のまま(該当する例外コードが現状ないため)。また `eslint-plugin-security` 等の依存追加時に `brace-expansion` の高深刻度脆弱性(DoS, GHSA-mh99-v99m-4gvg)が検出されたため `npm audit fix` で解消済み。

**適用範囲:** `sample-app/` 配下のコードに対する `/implement`・`code-reviewer` の判断。新しいコードでこれらのルールに違反したり、prettierのフォーマットと異なる書き方をすると `npm run lint` および CI が失敗する。今後 `max-params` の例外や `security/*` の誤検知が実際に発生したら、mulmoterminalの前例(warn化・特定ルールoff、理由をコメントで明記)に倣うこと。今後さらに新しい静的解析ルールを`warn`で導入する場合は、このエントリではなく新しいエントリを作ること(このエントリは既に昇格済みルールの記録として閉じておく)。Knip等、ESLintルールの追加ではなく**別ツール**を新規導入する場合も同様に新規エントリとする([[knip-dead-code-detection]] 参照)。

**関連:** [[eslint-strictness-ratchet]], [[pure-function-extraction]], [[knip-dead-code-detection]]
