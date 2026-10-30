import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TutorialStep } from "../types/view";
import tutorialCss from "./Tutorial.css?raw";
import { Tutorial } from "./Tutorial";

const STEPS: readonly TutorialStep[] = [
  { id: "a", title: "カーソルを うごかす", body: "ゆびを のせて スライド", illustration: "drag" },
  { id: "b", title: "リングが かさなったら タップ!", body: "ポンと おそう", illustration: "tap" },
];

function render(steps: readonly TutorialStep[]): string {
  return renderToStaticMarkup(createElement(Tutorial, { steps, onFinish: () => undefined }));
}

describe("Tutorial", () => {
  it("最初のページ(題・本文・ページ数・絵の種類)と「つぎへ」を出す", () => {
    const html = render(STEPS);
    expect(html).toContain("カーソルを うごかす");
    expect(html).toContain("ゆびを のせて スライド");
    expect(html).toContain("1 / 2");
    expect(html).toContain('data-art="drag"');
    expect(html).toContain("つぎへ");
    expect(html).not.toContain("はじめる");
  });

  it("最後のページしか無いときは「はじめる」", () => {
    const html = render(STEPS.slice(1));
    expect(html).toContain("はじめる");
    expect(html).not.toContain("つぎへ");
  });

  it("ページが無いときは何も出さない", () => {
    expect(render([])).toBe("");
  });

  it("ダイアログとして読ませ、autoFocus は付けない(押しっぱなしの Enter/Space の repeat で押されないように)", () => {
    const html = render(STEPS);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).not.toContain("autofocus");
  });

  it("ボタンの最小の高さは 44px 以上", () => {
    const match = /\.bb-tutorial \.bb-tutorial__next \{[^}]*min-height: (\d+)px/.exec(tutorialCss);
    expect(Number(match?.[1])).toBeGreaterThanOrEqual(44);
  });
});
