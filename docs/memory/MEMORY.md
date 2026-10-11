# 共有メモリ Index

すべてのサブエージェント(investigator / designer / implementer / tester)およびオーケストレーションコマンド(`/investigate` `/design` `/implement` `/test` `/cycle`)は、**タスク開始前に必ずこのファイルを読む**。関連しそうなエントリがあれば `entries/<name>.md` を読んで詳細を確認してから作業に入ること。

このファイルは索引のみで、内容そのものは書かない。1エントリ1行、`entries/` 配下の各ファイルへのリンクとして追記する。手動で作った空行区切りのカテゴリ見出しは維持すること。

読み書きのルールは `docs/process/shared-memory.md` を参照。

## decision(プロジェクト全体の技術的決定)

<!-- 例: - [http-client](entries/http-client.md) — HTTP通信は全topicでfetchに統一、axiosは使わない -->
- [eslint-strictness-ratchet](entries/eslint-strictness-ratchet.md) — (superseded, [[eslint-strictness-ratchet-v2]]参照) sample-appのサイズ/複雑さ/型ルールはwarnで導入し、drainしてからerrorに昇格させる
- [eslint-strictness-ratchet-v2](entries/eslint-strictness-ratchet-v2.md) — sample-appのサイズ/複雑さ/型/sonarjs/security/prettierルールはdrain確認済みで全てerrorに昇格済み(既存コード修正不要)
- [knip-dead-code-detection](entries/knip-dead-code-detection.md) — sample-appへのKnip導入はレポートのみ・非ブロッキングから始め、CI組み込みは既存の`checks`/`e2e`ジョブと分離した独立ジョブにする

## convention(命名・実装・テストの規約)

<!-- 例: - [file-naming](entries/file-naming.md) — ファイル名はkebab-case、コンポーネントはPascalCase -->
- [pure-function-extraction](entries/pure-function-extraction.md) — ビジネスロジックは純粋関数に切り出し、ハンドラは薄く保つ
- [shared-types-and-dto-validation](entries/shared-types-and-dto-validation.md) — API契約はsharedパッケージの型を唯一の情報源にし、境界はclass-validator DTOで検証する

## pitfall(既知の落とし穴・失敗から得た教訓)

<!-- 例: - [ci-no-network](entries/ci-no-network.md) — CI環境は外部ネットワークにアクセスできない、モック必須 -->
- [unpushed-local-commits-stale-origin](entries/unpushed-local-commits-stale-origin.md) — ローカルcommitだけではoriginは更新されない、GitHub Pages等が古いまま取り残される。ゲート2・メタ編集後は必ずpushまで行う(CLAUDE.md厳守ルール8)

## glossary(プロジェクト固有の用語集)

<!-- 例: - [slug](entries/slug.md) — 本プロジェクトでの「slug」は YYYY-MM-DD-<topic> 形式を指す -->

## open-question(横断的な未解決事項)

<!-- 例: - [auth-strategy](entries/auth-strategy.md) — 認証方式が未決定。複数topicに影響するため要人間判断 -->
