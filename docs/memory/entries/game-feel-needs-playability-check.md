---
name: game-feel-needs-playability-check
type: pitfall
status: active
related_topics: [baseball-game, baseball-game-v3]
created: 2026-10-13
updated: 2026-10-27
---

<!-- related_topics には、この規約/落とし穴を実際に適用したtopic-slugを追記していく(convention/pitfallで特に重要)。
     3つ以上になったらスキル化候補(詳細は`docs/process/shared-memory.md`の「再利用パターンのSkill化」)。 -->

タイミングと位置で判定するゲーム(打撃・リズム・アクション)は、lint・単体・E2E がすべて合格でも「操作できない」ことがある。設計とテストで次の3点を必ず数値で確かめる。(1) **見た目の到達時刻と判定の基準時刻のずれ**(ボールが判定面を過ぎても手前へ動き続けると、プレイヤーは遅れて振る)。(2) **入力遅延の補正**(判定時刻をハンドラ実行時の `performance.now()` にせず `event.timeStamp` から求め、タッチは約 70ms、マウス・キーは約 20ms を引く。遅れたスイングは黙って捨てず、振り遅れとして結果を返す)。(3) **人間を模したボット**(反応遅延・時刻と位置のばらつき・端末別の遅延)で、判定関数を数万回回し、無効・空振り・安打の割合を見る。スマホでは、対象(ゾーン・カーソル)が指先(約 10〜20mm)より小さくないか、片手で操作できるかも確かめる。

**背景:** baseball-game 第2版は自動テストが全て合格したが、ユーザーがスマホで試遊して「操作性、球の軌道が終わってる」とゲート2で修正依頼になった。診断([docs/investigations/_parts/baseball-game/2026-10-13-feel-diagnosis.md](../../investigations/_parts/baseball-game/2026-10-13-feel-diagnosis.md))で、見た目の到達が判定より約 260ms 遅い、タッチ遅延が未補正、ゾーンとカーソルが指より小さい、判定がボール中心のみで見た目の 2.6 倍の範囲が「当たって見えて空振り」、変化球の横の向きが逆、が判明した。いずれもテストは「仕様どおり」に通っていた。

**適用範囲:** 操作の手触りが価値の中心になる機能の `/design`(受け入れ基準に到達ずれ・遅延補正・ボット試算の目標値を入れる)、`/test`(ボット試算とフレーム列の計測を手動確認に含める)、ゲート2 の前(実機に近い端末で遊べる版を人間に触ってもらう)。

**関連:** [[visual-scope-must-be-shown-at-gate1]] [[swiftshader-playwright-input-latency]]
