---
name: frontend-3d-three-in-render-segment
type: decision
status: active
related_topics: [baseball-game]
created: 2026-10-12
updated: 2026-10-14
---

<!-- related_topics には、この規約/落とし穴を実際に適用したtopic-slugを追記していく(convention/pitfallで特に重要)。
     3つ以上になったらスキル化候補(詳細は`docs/process/shared-memory.md`の「再利用パターンのSkill化」)。 -->

sample-app frontend の 3D 描画は Three.js(npm、命令的 API。react-three-fiber は使わない)を feature の `render/` セグメントに閉じ込める(import は `types/` と `three` のみ。DOM と GL に触れるのは `render/stage.ts` だけ)。位置・軌道・ポーズ・カメラ・時刻表・テロップ文言などの「時刻 t に何を描くか」は three 非依存の純粋関数 `model/world/` に置き、vitest(node)で単体テストする。`model/` と `render/` は互いに import せず、つなぐのは `hooks/` だけ(契約は `types/` のプレーンデータ `SceneFrame` と `StageHandle`)。**カメラの構図(縦横比ごとの位置・注視点・FOV・シーンを上へずらす量 `lift`)も `model/world/camera` が `CameraPose` として決め、`render/` は受け取った姿勢をそのまま three のカメラに適用するだけにする**(縦横比による分岐を render に持たせない。2026-10-13 の修正設計で、第2版の `render/look.ts` にあった `fovFor`・`framingLift` をモデル側へ移す決定をした)。これにより、画面上のゾーン寸法のような「端末ごとの見え方」の要件を、three なしの単体テストで守れる。**画面の実際の空き領域(HUD の下端とオーバーレイの上端)に構図を合わせる場合も、DOM を測るのは `hooks/` だけにし、測った値は画面高比のプレーンデータ(`SafeArea`)として `SceneFrameInput` → `battingCameraFor(aspect, layout, safeArea)` に渡す**(`100dvh` のためブラウザのツールバーで高さが変わり、固定高さ(844px)の構図ではゾーンがオーバーレイに隠れた。2026-10-14 の修正設計レビューで判明)。構図の式は閉形式なので、高さを走査する単体テストで「隠れない」を守れる。

**背景:** [docs/tests/2026-10-11-baseball-game.md](../../tests/2026-10-11-baseball-game.md) で DOM+SVG の描画が不合格になり、Three.js の 3D モックをユーザーが承認した(2026-10-12)。改訂設計 [docs/designs/2026-10-12-baseball-game.md](../../designs/2026-10-12-baseball-game.md) で、テスト容易性([[pure-function-extraction]])と 3D 描画を両立させる境界としてこの分割を決めた。`model/world/` は表示専用の数学で結果が `GameState` に戻らないため、`model/` の再現性規約(`sin/cos/log/exp/hypot` を使わない)の適用外とする。`Math.random`・`Date`・`performance`・`window`・`document` の禁止は `world/` にも適用する。カメラ構図の移管は、スマホ試遊で縦長画面のゾーンが小さすぎると判明した([[game-feel-needs-playability-check]])ことへの修正設計(同設計書の「修正設計(ゲート2 修正依頼)」)による。

**適用範囲:** sample-app frontend で 3D(WebGL)や Canvas 描画を伴う機能を `/design`・`/implement`・`code-reviewer` で扱う場面。three オブジェクトの生成・破棄・材質は `render/` に、座標計算・補間・時刻表・カメラ構図は `world/` に置く。構造は `from "three"` が `render/` のみ、`render/` が `../model`・`../hooks`・`../ui` を import しない、を grep で検査する(機械強制は [[feature-segment-import-boundaries-not-enforced]] で未決定)。

**関連:** [[pure-function-extraction]] [[visual-scope-must-be-shown-at-gate1]] [[sample-app-lint-random-and-index-access]] [[game-feel-needs-playability-check]]
