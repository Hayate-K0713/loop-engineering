---
name: playwright-browser-revision-mismatch
type: pitfall
status: active
related_topics: [baseball-game]
created: 2026-10-11
updated: 2026-10-11
---

<!-- related_topics には、この規約/落とし穴を実際に適用したtopic-slugを追記していく(convention/pitfallで特に重要)。
     3つ以上になったらスキル化候補(詳細は`docs/process/shared-memory.md`の「再利用パターンのSkill化」)。 -->

Claude Code のクラウド実行環境では、プリインストールの Playwright ブラウザ(`/opt/pw-browsers`、chromium-1194 系)と sample-app の `@playwright/test`(1.62.0、chromium-headless-shell revision 1234 を要求)が一致せず、素のまま `npm run test:e2e --workspace frontend` を実行すると「Executable doesn't exist」で失敗する。`npx playwright install` はせず、scratchpad に `chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell` → `/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell` の symlink を作って `PLAYWRIGHT_BROWSERS_PATH` をそのディレクトリへ向けると動く。

**背景:** [docs/designs/2026-10-11-baseball-game.md](../../designs/2026-10-11-baseball-game.md) のステップ12で implementer が遭遇し、上記の回避で `home.spec.ts` を通した(2026-10-11)。CI(GitHub Actions)は `npx playwright install --with-deps chromium` を実行するため影響しない。

**適用範囲:** クラウドセッションで `/test`・`tester`・e2e を書く `implementer` が Playwright を実行する場面。ローカル/CI では不要。

**関連:** なし
