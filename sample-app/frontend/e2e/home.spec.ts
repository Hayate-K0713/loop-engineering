import { test, expect } from "@playwright/test";

test("shows the page heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "loop-basic sample app" })).toBeVisible();
});

test("fetches a quote from the real backend and renders the shared-typed result", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("fetch-quote").click();
  await expect(page.getByTestId("quote-result")).toHaveText("subtotal=100 / tax=10 / total=110");
});
