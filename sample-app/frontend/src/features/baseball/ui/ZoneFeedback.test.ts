import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ScreenRect } from "../types/stage";
import type { ZoneFeedbackView } from "../types/view";
import { ZoneFeedback } from "./ZoneFeedback";

// vitest は CSS の import を空にするので、ファイルを直接読む(frontend ディレクトリから実行する前提の固定パス)。
const feedbackCss = readFileSync("src/features/baseball/ui/ZoneFeedback.css", "utf8");
const stageCss = readFileSync("src/features/baseball/ui/baseball-stage.css", "utf8");

const RECT: ScreenRect = { left: 100, top: 400, width: 160, height: 180 };

const SWING: ZoneFeedbackView = {
  tone: "swing",
  from: { x: 0, y: 0 },
  to: { x: 0.5, y: 0.5 },
  ringRadiusZone: 0.2,
  alpha: 0.6,
  label: null,
};

function markup(feedback: ZoneFeedbackView | null, zoneRect: ScreenRect | null): string {
  return renderToStaticMarkup(createElement(ZoneFeedback, { feedback, zoneRect }));
}

/** CSS から、セレクタが完全一致する規則の本体を取り出す(無ければ空文字)。 */
function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) {
    return "";
  }
  return css.slice(start, css.indexOf("}", start));
}

describe("ZoneFeedback", () => {
  it("内容か矩形が無いときは何も描かない", () => {
    expect(markup(null, RECT)).toBe("");
    expect(markup(SWING, null)).toBe("");
  });

  it("ゾーン矩形に固定した SVG に、ゾーン単位の点を px へ換算して描く(十字 = from、輪 = to、輪の半径 = ringRadiusZone × 幅/2)", () => {
    const html = markup(SWING, RECT);
    expect(html).toContain("left:100px;top:400px;width:160px;height:180px;opacity:0.6");
    // from = (0, 0) → ゾーン中心 (80, 90)。十字の腕は ±8px(径 16px)。
    expect(html).toContain('x1="72" y1="90" x2="88" y2="90"');
    expect(html).toContain('x1="80" y1="82" x2="80" y2="98"');
    // to = (0.5, 0.5) → x = 0.75 × 160 = 120、y = 0.25 × 180 = 45。半径 0.2 × 80 = 16px(径 32px)。
    expect(html).toContain('cx="120" cy="45" r="16"');
    expect(html).toContain('x1="80" y1="90" x2="120" y2="45"');
  });

  it("zoneRect が変わると、描く位置も追従する", () => {
    const moved: ScreenRect = { left: 50, top: 300, width: 80, height: 90 };
    const html = markup(SWING, moved);
    expect(html).toContain("left:50px;top:300px;width:80px;height:90px");
    expect(html).toContain('x1="32" y1="45" x2="48" y2="45"');
    expect(html).toContain('cx="60" cy="22.5" r="8"');
  });

  it("守備のラベル(ズレ)は輪の下に出す。スイングはラベル無し", () => {
    expect(markup({ ...SWING, tone: "pitch", label: "ズレ 0.2" }, RECT)).toContain("ズレ 0.2");
    expect(markup(SWING, RECT)).not.toContain("bb-zone-feedback__label");
  });

  it("支援技術に読ませず、CSS は操作を受けない(pointer-events: none)・塗りつぶさない(線だけ)", () => {
    expect(markup(SWING, RECT)).toContain('aria-hidden="true"');
    expect(ruleBody(feedbackCss, ".bb-zone-feedback")).toContain("pointer-events: none");
    expect(ruleBody(feedbackCss, ".bb-zone-feedback__svg")).toContain("pointer-events: none");
    expect(ruleBody(feedbackCss, ".bb-zone-feedback__ring")).toContain("fill: none");
    expect(ruleBody(feedbackCss, ".bb-zone-feedback__frame")).toContain("fill: none");
  });

  it("ピル・ヒントの CSS も操作を受けない(pointer-events: none)", () => {
    expect(ruleBody(stageCss, ".bb-stage__timing")).toContain("pointer-events: none");
    expect(ruleBody(stageCss, ".bb-stage__hint")).toContain("pointer-events: none");
  });
});
