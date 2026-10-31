import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PitchInputPhase } from "../types/pitch";
import type { PitchArrow } from "../types/view";
import { PitchingControls, throwButtonLabel } from "./PitchingControls";
import { arrowGlyph, arrowWords, chipAriaLabel, PitchKindButtons, type PitchChip } from "./PitchKindButtons";

const REPERTOIRE: readonly PitchChip[] = [
  { kind: "straight", label: "ストレート", speedKmh: 148, arrow: "none" },
  { kind: "slider", label: "スライダー", speedKmh: 132, arrow: "right-down" },
  { kind: "curve", label: "カーブ", speedKmh: 115, arrow: "down" },
  { kind: "fork", label: "フォーク", speedKmh: 136, arrow: "down" },
];

function controls(inputState: PitchInputPhase | null, ready = true): string {
  return renderToStaticMarkup(
    createElement(PitchingControls, {
      ready,
      repertoire: REPERTOIRE,
      selectedKind: "slider",
      onSelectKind: () => undefined,
      inputState,
      onThrow: () => undefined,
      onStop: undefined,
    }),
  );
}

describe("曲がり矢印", () => {
  const ARROWS: readonly PitchArrow[] = ["none", "right", "left", "down", "right-down", "left-down"];

  it("6 種類すべてに別の記号と読み上げの言葉がある", () => {
    expect(new Set(ARROWS.map(arrowGlyph)).size).toBe(ARROWS.length);
    expect(new Set(ARROWS.map(arrowWords)).size).toBe(ARROWS.length);
  });

  it("まっすぐは上向き、右下に曲がるは ↘", () => {
    expect(arrowGlyph("none")).toBe("↑");
    expect(arrowGlyph("right-down")).toBe("↘");
  });
});

describe("PitchKindButtons", () => {
  const html = renderToStaticMarkup(createElement(PitchKindButtons, { repertoire: REPERTOIRE, selectedKind: "slider", onSelectKind: () => undefined }));

  it("チップに球種名・球速・矢印を出し、選択中の 1 つだけ aria-pressed=true", () => {
    expect(html).toContain("ストレート");
    expect(html).toContain("148km/h");
    expect(html).toContain("↘");
    expect(html.match(/aria-pressed="true"/g)?.length).toBe(1);
    expect(html).toContain('data-testid="pitch-kind-slider"');
  });

  it("読み上げ用の名前は球種・球速・曲がり方", () => {
    const slider: PitchChip = { kind: "slider", label: "スライダー", speedKmh: 132, arrow: "right-down" };
    expect(chipAriaLabel(slider)).toBe("スライダー 132キロ 右下に曲がる");
  });
});

describe("PitchingControls", () => {
  it("操作ボタンの文言は、ゲージ中だけ「とめる!」", () => {
    expect(throwButtonLabel("idle")).toBe("投げる");
    expect(throwButtonLabel("aiming")).toBe("投げる");
    expect(throwButtonLabel("gauge")).toBe("とめる!");
    expect(throwButtonLabel(null)).toBe("投げる");
  });

  it("inputState を data-input-state に反映する(人間守備でなければ属性なし)", () => {
    expect(controls("gauge")).toContain('data-input-state="gauge"');
    expect(controls("aiming")).toContain('data-input-state="aiming"');
    expect(controls(null)).not.toContain("data-input-state");
  });

  it("ゲージ中は「とめる!」で橙のクラス、それ以外は「投げる」", () => {
    expect(controls("gauge")).toContain("bb-pitching__button--stop");
    expect(controls("gauge")).toContain("とめる!");
    expect(controls("idle")).not.toContain("bb-pitching__button--stop");
    expect(controls("idle")).toContain("投げる");
  });

  it("ready が偽、または投球中(throwing)は操作ボタンが disabled。待機・狙い中・ゲージ中は押せる", () => {
    const disabledOf = (html: string): boolean => /data-testid="throw-pitch"[^>]*disabled/.test(html) || /disabled=""[^>]*data-testid="throw-pitch"/.test(html);
    expect(disabledOf(controls("idle", false))).toBe(true);
    expect(disabledOf(controls("throwing"))).toBe(true);
    expect(disabledOf(controls("idle"))).toBe(false);
    expect(disabledOf(controls("aiming"))).toBe(false);
    expect(disabledOf(controls("gauge"))).toBe(false);
  });

  it("コース選択の格子は描かない", () => {
    expect(controls("idle")).not.toContain("course-cell");
  });
});
