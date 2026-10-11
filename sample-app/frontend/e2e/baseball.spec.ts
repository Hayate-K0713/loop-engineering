import { test, expect } from "@playwright/test";

// 注意: 起動パラメータ(?seed=&innings=&fast=1)は開発ビルド(import.meta.env.DEV)でのみ有効で、本番ビルドでは無視される。
// playwright.config.ts の webServer は `npm run dev`(vite dev)なので問題ないが、webServer を `vite preview` 等の
// 本番ビルドに変えるとパラメータが無視されてこのファイルの2本目のテストが壊れる。

// 1試合(1イニング)の守備ターン数の上限。通常は十数回で終わるので、無限ループ防止の保険にすぎない。
const MAX_PITCH_TURNS = 300;

test("navigates from the home page to the baseball game screen", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("open-baseball").click();

  await expect(page).toHaveURL(/#\/baseball$/);
  await expect(page.getByTestId("baseball-title")).toBeVisible();
  // ゲーム画面は従来画面の見出しを重複して出さない。
  await expect(page.getByRole("heading", { name: "loop-basic sample app" })).toHaveCount(0);
});

test("plays a one-inning game through to the result screen", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("/?seed=42&innings=1&fast=1#/baseball");
  await expect(page.getByTestId("setting-innings")).toHaveValue("1");
  await page.getByTestId("start-game").click();

  await expect(page.getByTestId("scoreboard")).toBeVisible();
  await expect(page.getByTestId("field-diagram")).toBeVisible();

  // 人間は先攻(既定)。攻撃中は何も操作しない(全球見送り)。守備中は「投げる」が押せるようになるたびに投球する。
  // 初期選択は中央(2,2)+ストレートなので、選択操作は不要。
  const result = page.getByTestId("result-screen");
  const ready = page.locator('[data-testid="pitch-controls"][data-ready="true"]');
  const centerCell = page.getByTestId("course-cell-2-2");

  let selectionChecked = false;
  for (let turn = 0; turn < MAX_PITCH_TURNS; turn += 1) {
    // 結果画面か投球可能のどちらかが見えるまで待つ(人間の攻撃中・CPU の投球中はどちらも見えないので待つだけになる)。
    await expect(result.or(ready)).toBeVisible({ timeout: 30_000 });
    if (await result.isVisible()) {
      break;
    }

    if (!selectionChecked) {
      // 最初の守備ターン: 初期選択は中央で、投球後も選択が保持される。
      await expect(centerCell).toHaveAttribute("aria-pressed", "true");
      await page.getByTestId("throw-pitch").click();
      await expect(centerCell).toHaveAttribute("aria-pressed", "true");
      selectionChecked = true;
    } else {
      await page.getByTestId("throw-pitch").click();
    }
  }

  await expect(result).toBeVisible();
  expect(selectionChecked).toBe(true);
  await expect(page.getByTestId("final-score-away")).toHaveText(/^\d+$/);
  await expect(page.getByTestId("final-score-home")).toHaveText(/^\d+$/);
  await expect(page.getByTestId("score-away")).toHaveText(/^\d+$/);
  await expect(page.getByTestId("score-home")).toHaveText(/^\d+$/);
});
