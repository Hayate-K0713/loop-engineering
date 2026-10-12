---
name: three-r186-pitfalls
type: pitfall
status: active
related_topics: [baseball-game]
created: 2026-10-12
updated: 2026-10-12
---

<!-- related_topics には、この規約/落とし穴を実際に適用したtopic-slugを追記していく(convention/pitfallで特に重要)。
     3つ以上になったらスキル化候補(詳細は`docs/process/shared-memory.md`の「再利用パターンのSkill化」)。 -->

three r186(npm `three@0.186.x`)では、(1) `PCFSoftShadowMap` は削除扱いで警告のうえ `PCFShadowMap` に置換されるため `PCFShadowMap` を使う、(2) r163 以降 `WebGLRenderer` は WebGL1 コンテキストで例外になるため `getContext("webgl2")` で取得し生成を try/catch する、(3) headless Chromium(Playwright 1.62)は追加引数なしで WebGL2 が使えるが SwiftShader で重い(1280×720・影ありで約50ms/フレーム、pixelRatio に比例)ので E2E では pixelRatio 1・低品質にする。React.lazy で動的 import した three は vite dev の起動時スキャンで最適化され `optimizeDeps.include` は不要。

**背景:** [docs/designs/2026-10-12-baseball-game.md](../../designs/2026-10-12-baseball-game.md) のステップ0(試し打ち)で implementer が実測した(2026-10-12)。

**適用範囲:** sample-app で three を使う描画を設計・実装・テストする場面。

**関連:** [[frontend-3d-three-in-render-segment]] [[playwright-browser-revision-mismatch]]
