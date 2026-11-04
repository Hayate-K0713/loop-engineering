import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WipeView } from "../types/view";
import { CutIn, type CutInDetail } from "./CutIn";
import cutInSource from "./CutIn.tsx?raw";
import stageViewSource from "./StageView.tsx?raw";

const WIPE: WipeView = { visible: true, rect: { x: 290, y: 175, width: 94, height: 94 }, label: "1番 カイト" };

function render(wipe: WipeView | null, detail?: CutInDetail | null): string {
  return renderToStaticMarkup(createElement(CutIn, { wipe, detail: detail ?? null }));
}

describe("CutIn: 表示", () => {
  it("wipe が無い・visible でない・矩形が空のときは何も描かない", () => {
    expect(render(null)).toBe("");
    expect(render({ ...WIPE, visible: false })).toBe("");
    expect(render({ ...WIPE, rect: { x: 0, y: 0, width: 0, height: 94 } })).toBe("");
    expect(render({ ...WIPE, rect: { x: 0, y: 0, width: 94, height: -1 } })).toBe("");
  });

  it("矩形をそのまま px の位置・大きさにする。支援技術には読ませない", () => {
    const html = render(WIPE);
    expect(html).toContain("left:290px;top:175px;width:94px;height:94px");
    expect(html).toContain('aria-hidden="true"');
  });

  it("名前の行(label)だけ。label も補足も無いときは帯を出さず縁だけ", () => {
    expect(render(WIPE)).toContain("1番 カイト");
    expect(render(WIPE)).not.toContain("cut-in-role");
    const bare = render({ ...WIPE, label: null });
    expect(bare).toContain("bb-cutin");
    expect(bare).not.toContain("bb-cutin__caption");
  });

  it("2 行目は役割ラベルが優先、無ければ背番号。両方あるときは背番号を左上のバッジに出す", () => {
    expect(render(WIPE, { number: 18, role: null })).toContain("背番号 18");
    expect(render(WIPE, { number: 18, role: null })).not.toContain("cut-in-number");
    expect(render(WIPE, { number: null, role: "ヒット!" })).toContain("ヒット!");
    const both = render(WIPE, { number: 18, role: "三振" });
    expect(both).toContain("三振");
    expect(both).toMatch(/cut-in-number[^>]*>18</);
    expect(both).not.toContain("背番号");
  });
});

/** CSS は Vitest の css 処理で `?raw` が空になるため、`vitest run` の作業ディレクトリ(`sample-app/frontend`)基準の固定パスで読む。 */
const css = readFileSync("src/features/baseball/ui/CutIn.css", "utf8");

describe("CutIn: 操作を受けない・動きの抑制", () => {
  it("縁取りと帯は pointer-events: none", () => {
    expect(css).toMatch(/\.bb-cutin \{[^}]*pointer-events: none;/);
    expect(css).toMatch(/\.bb-cutin__caption \{[^}]*pointer-events: none;/);
    expect(css).toMatch(/\.bb-cutin__number \{[^}]*pointer-events: none;/);
  });

  it("名前・役割の帯は矩形の下の外側に付き(top: 100%)、顔に重ならない。縁は帯を切らない(overflow: hidden にしない)", () => {
    expect(css).toMatch(/\.bb-cutin__caption \{[^}]*top: 100%;/);
    expect(css).not.toMatch(/\.bb-cutin__caption \{[^}]*bottom: 0;/);
    expect(css).not.toMatch(/\.bb-cutin \{[^}]*overflow: hidden;/);
  });

  it("prefers-reduced-motion では出現のアニメを止める", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.bb-cutin \{\s*animation: none;/);
  });
});

describe("ui の依存の向き", () => {
  it("CutIn・StageView は model・render・audio を import しない", () => {
    for (const source of [cutInSource, stageViewSource]) {
      expect(source).not.toMatch(/from "\.\.\/(model|render|audio)/);
    }
  });
});
