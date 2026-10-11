# テストレポート: sample-app への Knip 導入(レポートのみ・非ブロッキング)

- 日付: 2026-08-13
- ステータス: 承認済み・クローズ
- 対応する設計ドキュメント: [docs/designs/2026-08-12-introduce-knip.md](../designs/2026-08-12-introduce-knip.md)
- 対応する調査ドキュメント: [docs/investigations/2026-08-12-introduce-knip.md](../investigations/2026-08-12-introduce-knip.md)

## テスト対象

`sample-app` への Knip(デッドコード・未使用依存検出ツール)のレポートのみ・非ブロッキング導入。実装ステップ1〜6すべて完了・コミット済み、`code-reviewer` による自動レビュー2ラウンド(ラウンド2は`PASS`、残存MINOR3件+参考1件あり)。検証範囲は設計ドキュメント「テスト戦略」節の完了基準(a)〜(d)。Knipの指摘件数・内容そのものは設計で明示的に合否基準から除外されているため、本レポートでもその決定に従う。

## 実施したテスト

| 種別 | 内容 | 結果 |
| --- | --- | --- |
| 自動テスト | 設計の「自動テストを新規作成するか」判断は「しない」(理由: アプリケーションコード変更なし、ツール導入・CI設定変更のみのため既存vitest/Playwrightスイートの対象外)。既存の `npm run test`(backend純粋関数、vitest)を実行し影響がないことを確認。 | pass |
| 型チェック/Lint | `npm run typecheck`(shared/backend/frontend)、`npm run lint`(eslint .) | pass |
| 手動確認(ゴールデンパス) | 完了基準(a)(b): `npx knip`・`npm run knip`・`npm run knip:report` の実行とexit code確認 | pass |
| 手動確認(エッジケース) | 完了基準(c): 既存 `typecheck`/`lint`/`test`/`build` への影響なし確認、完了基準(d): `.github/workflows/ci.yml` のYAML構文チェックと `knip` ジョブ定義(`continue-on-error: true`・`needs`なし)の確認 | pass |

## 証跡(手動確認分)

- `node -v` → `v22.16.0`(設計要件 `v20.19.0` 以上を満たす)。
- `cd sample-app && npx knip` → 出力なし(issues 0件、config hints 0件)、`exit=0`。完了基準(a)(ツールがクラッシュせずエラーなく完走)を満たす。
- `cd sample-app && npm run knip` → `exit=0`(現状指摘0件のため、「指摘があれば非0」の挙動そのものは今回のコードベースでは発生させていないが、`knip`本体の標準的なexit code仕様であり、実装ステップ1・コードレビューラウンド1で意図的に注入したデッドコード等での実測により既に検証済み[設計ドキュメント「ステップ1 試し打ち結果」節・コードレビュー結果ラウンド1参照])。
- `cd sample-app && npm run knip:report; echo "exit=$?"` → `exit=0`。完了基準(b)の後半(常に0)を満たす。
- `cd sample-app && npm run typecheck` → 全workspace(shared/backend/frontend)で `tsc --noEmit` 成功、`exit=0`。
- `cd sample-app && npm run lint` → `eslint .` 成功、`exit=0`。
- `cd sample-app && npm run test` → backend `vitest run`、4 tests passed。
- `cd sample-app && npm run build` → `nest build` + `vite build` いずれも成功。
- 完了基準(c)より、Knip導入前後で `typecheck`/`lint`/`test`/`build` の結果(pass/fail・件数)に変化がないことを確認(いずれも成功、既存の合格基準を満たしたまま)。
- `.github/workflows/ci.yml` を `python3 -c "import yaml; yaml.safe_load(...)"` でパース → エラーなく成功。パース結果から `jobs` が `['checks', 'e2e', 'knip']` であること、`knip` ジョブに `continue-on-error: True` が設定されていること、`knip` ジョブに `needs` キーが存在しないこと(`'needs' in knip` → `False`)を確認。既存 `checks`/`e2e` ジョブの定義(`e2e` は従来どおり `needs: checks`)には変更がないことも確認。
- テスト実行後、`git status --short` で作業ツリーがクリーンであることを確認(テスト実行によるファイル変更なし)。

手動確認手順4(実CI実行での確認)は設計ドキュメントに明記のとおり事後確認扱いであり、`/test`フェーズの完了基準には含めない(トピックブランチはpush/PR作成をせずローカルで`git merge`されるため、この時点では検証不能)。マージ後の実CI実行での確認はメインエージェント/人間側のフォローアップ事項とする。

## 不合格・不具合の詳細

なし。

## 未検証の観点・既知の制限事項

- 手動確認手順4(ベースブランチマージ後の実CI実行での `knip` ジョブの独立実行・非ブロッキング挙動の確認)は、設計上`/test`フェーズの完了基準に含まれないため未実施。マージ後に別途確認が必要。
- Knipの指摘内容そのもの(現状issues 0件)は、設計の決定により合否判定に含めていない。将来コードベースが変化した際に指摘が増減しても、それ自体は本レポートの判定に影響しない。

## コードレビューからの引き継ぎ

`code-reviewer` ラウンド2(`PASS`)で残存した未解決MINOR3件、および参考事項1件を引き継ぐ(設計ドキュメント「コードレビュー結果」参照。実装・設計ドキュメントの修正は本テストフェーズの範囲外のため未対応のまま報告する)。

- **MINOR-3**: `sample-app/knip.jsonc` のコメント「Knipは既定でdist/等を除外」という説明が不正確。実際の機構はKnipが既定で `.gitignore` を尊重すること(`sample-app/.gitignore` に `dist/` が含まれる)。`npx knip --no-gitignore` ではdist配下ファイルがUnused filesとして検出されることをコードレビュー時に確認済み。結論(ignore設定不要)自体は正しく機能への影響はない。
- **MINOR-4**: 設計ドキュメント「ステップ1 試し打ち結果」表に、MINOR-3と関連する旧根拠(projectグロブが`src/**/*.ts`等に限定されているためignore不要、という趣旨の記述)が一部残っており、修正後の`knip.jsonc`コメントと不整合に見える。
- **MINOR-5**: `docs/memory/entries/knip-dead-code-detection.md` の「適用範囲」の表現(「Knip自体の`knip.jsonc`設定の詳細(workspace別entry等)」)が、最終実装(空オーバーライド `{}` のみ)と若干噛み合っていない。
- **参考(スコープ外)**: `npm audit` でdev依存にhigh 4件(brace-expansion/fast-uri/js-yaml/nanoid)があるが、いずれもmain時点から存在しKnip導入起因ではない。

いずれも機能・完了基準には影響しないMINORレベルの記述不整合であり、次の人間確認ゲートで対応要否を判断する。

## 総合判定

合格

完了基準(a)〜(d)、および手動確認手順1〜3のすべてを満たした。既存の `typecheck`/`lint`/`test`/`build` に影響がないことも確認済み。設計で明示的にスコープ外とされたKnipの指摘内容自体は合否に含めていない。上記コードレビュー引き継ぎのMINOR3件+参考1件は残存するが、機能・完了基準に影響しないドキュメント上の記述不整合であり、これらの解消要否は人間確認ゲートでの判断に委ねる。

## 人間確認ゲート記録

| 日時 | 判断 | コメント |
| --- | --- | --- |
| 2026-08-13 | 承認してクローズ | 残存MINOR3件+参考1件(いずれも機能影響なしのドキュメント記述不整合)はこのまま受入。mainへマージしてクローズする。 |
