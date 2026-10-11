---
name: knip-dead-code-detection
type: decision
status: active
related_topics: [introduce-knip]
created: 2026-08-12
updated: 2026-08-13
---

<!-- related_topics には、この規約/落とし穴を実際に適用したtopic-slugを追記していく(convention/pitfallで特に重要)。
     3つ以上になったらスキル化候補(詳細は`docs/process/shared-memory.md`の「再利用パターンのSkill化」)。 -->

sample-appにデッドコード・未使用依存検出ツール(Knip)を導入する場合、`docs/process/sample-app-dev.md`の静的解析方針どおり**レポートのみ・非ブロッキング**から始める。CI組み込みは `knip --no-exit-code` に加え GitHub Actionsの `continue-on-error: true` も併用し(二重の非ブロッキング化)、既存の `checks`(typecheck/lint/test/build)・`e2e` ジョブとは**独立したジョブ**として分離する(`needs` を付けず、他ジョブの成否と無関係に実行する)。指摘をブロッキング化(error昇格)するかどうかの判断は今回のスコープ外とし、レポートの指摘状況を見てから別途判断する。**Knipの指摘(件数・内容)は、report-only運用である間は `/test` の合否判定にも `code-reviewer` の `MAJOR` 判定材料にも使わない。** `docs/process/sample-app-dev.md`の「構成されているチェックは必須で実行する…失敗はそのまま不合格/MAJORの理由になる」という原則は `error`(ブロッキング)まで昇格したチェックを対象にしたものであり、明示的にreport-only・非ブロッキングと定めたKnipはその対象外とする。

**背景:** [docs/investigations/2026-08-12-introduce-knip.md](../../investigations/2026-08-12-introduce-knip.md) と [docs/designs/2026-08-12-introduce-knip.md](../../designs/2026-08-12-introduce-knip.md) で確定した。`docs/memory/entries/eslint-strictness-ratchet-v2.md` が確立した「新しいルールはwarn/report-onlyで導入し、drainしてからerrorに昇格させる」というratchet思想の延長線上にあるが、対象が「ESLintルールの追加」ではなく「別ツール(Knip)の新規導入」である点が異なるため、既存エントリを拡張せず独立エントリとして新設した(既存エントリは「昇格済みルールの記録として閉じておく」と明記されていたため)。設計段階(Bashツールを持たないdesignerによる静的読解)では、`knip.jsonc` をnpm workspaces(`shared`/`backend`/`frontend`)ごとに `entry`/`project` を定義し、NestJSのDIパターン・sharedパッケージのバレルエクスポート・vitestのみでVite未使用のbackend、といった sample-app固有の誤検知リスクを `ignore`/`ignoreDependencies`/`vite: false` 等で個別に抑制する案としていた。しかし実装フェーズ(ステップ1)で実際に `npx knip` を試し打ちした結果、これらの抑制設定は**すべて不要**(Knipの既定プラグイン検出だけで過不足なくカバーされる)と判明し、最終的な `knip.jsonc` は各ワークスペースを空オーバーライド(`{}`)にする形に落ち着いた。コードレビューでも、デッドファイル・未使用export・未使用依存・未登録workspaceを意図的に注入した実測により、この簡素化が「検出漏れ」ではなく実際にクリーンだからであることが確認されている。**教訓:** sample-appのような標準的な構成(npm workspaces + ESLint/Vite/Vitest/Playwright/NestJS)でKnipを導入する場合、まず既定のプラグイン自動検出を信頼し、静的読解だけに基づく先回りの`entry`/`project`/`ignore`/`ignoreDependencies`設定は入れず、実際に`npx knip`を実行してから必要な設定のみ追加する方が良い(詳細・実測結果は設計ドキュメントの「ステップ1 試し打ち結果」節を参照)。設計レビュー(ラウンド1)で、非ブロッキング性がCI設定だけでなく `/test`・`code-reviewer` の判定基準としても担保される必要があると指摘されたため、この点を本エントリにも明記した。

**適用範囲:** sample-appに新規の静的解析・デッドコード検出ツールを追加/変更する場面。特に「レポートのみで導入するか」「CI組み込みをブロッキングジョブと混ぜるか分離するか」「非ブロッキングツールの指摘を`/test`・`code-reviewer`の判定材料に使わないこと」を判断する際にこのエントリを参照する。Knip自体の`knip.jsonc`設定の詳細(workspace別entry等)はこのエントリではなく設計ドキュメントを参照すること(このエントリは決定の要旨のみを保持する)。

**関連:** [[eslint-strictness-ratchet-v2]]
</content>
