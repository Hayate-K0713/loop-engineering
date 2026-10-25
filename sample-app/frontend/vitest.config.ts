import { defineConfig } from "vitest/config";

// Playwright の e2e/*.spec.ts を拾わないよう include を src 配下の *.test.ts に限定する。
// ゲームロジックは React/DOM 非依存の純粋関数のため environment は node(jsdom は使わない)。
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
