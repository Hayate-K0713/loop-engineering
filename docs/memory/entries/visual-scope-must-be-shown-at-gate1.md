---
name: visual-scope-must-be-shown-at-gate1
type: pitfall
status: active
related_topics: [baseball-game, baseball-game-v3]
created: 2026-10-11
updated: 2026-10-27
---

<!-- related_topics には、この規約/落とし穴を実際に適用したtopic-slugを追記していく(convention/pitfallで特に重要)。
     3つ以上になったらスキル化候補(詳細は`docs/process/shared-memory.md`の「再利用パターンのSkill化」)。 -->

ユーザーが既存の製品を引き合いに出した要望(「〇〇みたいな」)や、見た目・演出が価値の中心になる機能(ゲーム、ビジュアル重視の画面)では、描画方式や演出をスコープ外にする判断を設計書の「やらないこと」に書くだけで済ませない。ゲート1で、完成時の見た目がどうなるか(画面のラフ図・モック・既存画面との比較など)を明示し、期待とのずれをその場で確認する。

**背景:** baseball-game で、テスト容易性を優先して描画を DOM+SVG の平面表示に決め、投手・打者・球場・打球演出を「やらないこと」に入れたまま承認を得た。実装・自動テスト・コードレビューはすべて通ったが、ユーザーの試遊で「どこがパワプロなんだよ」と不合格になり、描画層を設計からやり直した([docs/tests/2026-10-11-baseball-game.md](../../tests/2026-10-11-baseball-game.md))。

**適用範囲:** `/design` の壁打ち(grilling)と人間確認ゲート1。見た目・体験が要件の中心にあるトピック全般。

**関連:** なし
