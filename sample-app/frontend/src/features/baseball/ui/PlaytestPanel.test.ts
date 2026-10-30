import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PlaytestSummary } from "../types/telemetry";
import { PlaytestPanel } from "./PlaytestPanel";

// vitest は CSS の import を空にするので、ファイルを直接読む(frontend ディレクトリから実行する前提の固定パス)。
const panelCss = readFileSync("src/features/baseball/ui/PlaytestPanel.css", "utf8");

const SUMMARY: PlaytestSummary = {
  battingPitches: 60,
  swings: 40,
  contactRate: 0.5,
  swingAtStrikeRate: 0.75,
  swingAtBallRate: null,
  dtMeanMs: 12.34,
  dtSdMs: 30,
  distancePxMedian: 25,
  ignoredByReason: { "not-ready": 1, holding: 0, "tap-too-long": 4, "tap-moved": 2, cancel: 0, "held-release": 3 },
  pointerCancels: 2,
  sources: { tap: 30, "touch-second": 4, button: 5, key: 0, mouse: 1 },
  pitchesThrown: 0,
  niceRate: null,
  fpsP95Ms: 22.5,
};

const JSON_TEXT = '[{"type":"session","atMs":0}]';

function render(overrides: { readonly saveFailed?: boolean; readonly scaleWarning?: boolean } = {}): string {
  return renderToStaticMarkup(
    createElement(PlaytestPanel, {
      summary: SUMMARY,
      recordCount: 61,
      json: JSON_TEXT,
      csv: "type,atMs",
      saveFailed: overrides.saveFailed ?? false,
      scaleWarning: overrides.scaleWarning ?? false,
      onClear: () => undefined,
      onClose: () => undefined,
    }),
  );
}

describe("PlaytestPanel", () => {
  it("要約表に、件数・割合・ms・理由別の件数・入力種別を出す(記録が無い値は「-」)", () => {
    const html = render();
    expect(html).toContain("試遊ログ(61 件)");
    expect(html).toContain("<td>50.0%</td>");
    expect(html).toContain("<td>75.0%</td>");
    expect(html).toContain("<td>12.3 ms</td>");
    expect(html).toContain("長押し(180ms 超)");
    expect(html).toContain("スキップに使った指の離し");
    expect(html).toContain("2 本目の指");
    expect(html).toContain("<td>-</td>");
  });

  it("全選択できる読み取り専用の textarea に JSON を出す", () => {
    const html = render();
    expect(html).toMatch(/<textarea[^>]*readOnly=""[^>]*data-testid="playtest-json"|<textarea[^>]*data-testid="playtest-json"[^>]*readOnly=""/);
    expect(html).toContain("&quot;type&quot;:&quot;session&quot;");
  });

  it("コピー・ダウンロード・共有・消去のボタンを、いつでも(無効にせず)出す", () => {
    const html = render();
    for (const id of ["playtest-copy", "playtest-download-json", "playtest-download-csv", "playtest-share", "playtest-clear", "playtest-close"]) {
      expect(html).toContain(`data-testid="${id}"`);
    }
    expect(html).not.toContain("disabled");
  });

  it("保存失敗と縮小表示の疑いは、該当するときだけ警告を出す", () => {
    const ok = render();
    expect(ok).not.toContain("playtest-save-failed");
    expect(ok).not.toContain("playtest-scale-warning");
    expect(render({ saveFailed: true })).toContain("保存できません(このまま画面から取り出してください)");
    expect(render({ scaleWarning: true })).toContain("縮小表示");
  });

  it("ボタンの最小の高さは 44px 以上", () => {
    const match = /\.bb-playtest \.bb-playtest__button \{[^}]*min-height: (\d+)px/.exec(panelCss);
    expect(Number(match?.[1])).toBeGreaterThanOrEqual(44);
  });
});
