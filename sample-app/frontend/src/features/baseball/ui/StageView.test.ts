import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { GameStageViewProps } from "../hooks/useGameStage";
import type { ContactQuality } from "../types/batting";
import { StageView } from "./StageView";

const ZONE_RECT = { left: 117, top: 410, width: 156, height: 175 };

const NOOP = (): void => undefined;

const BASE: GameStageViewProps = {
  containerRef: { current: null },
  status: "ready",
  telop: null,
  pointerHandlers: { onPointerDown: NOOP, onPointerMove: NOOP, onPointerUp: NOOP, onPointerCancel: NOOP },
  inputActive: true,
  skipHint: false,
  phase: "idle",
  playKind: null,
  lastFlight: null,
  zoneRect: ZONE_RECT,
  marker: null,
  timingCue: null,
  lastTiming: null,
  droppedSwings: 0,
  banner: null,
  guideMode: "exact",
  inputState: null,
  pitchQuality: null,
  hint: null,
  tapHint: null,
  zoneFeedback: null,
};

function render(props: Partial<GameStageViewProps>, contactQuality?: ContactQuality | null): string {
  return renderToStaticMarkup(createElement(StageView, { ...BASE, ...props, contactQuality: contactQuality ?? null }));
}

describe("StageView: タイミングのピル(2 行)", () => {
  const cue = { label: "just", dtMs: 0 } as const;

  it("1 行目はタイミング、2 行目は接触の質(芯・ふつう・かすり・ミス)", () => {
    expect(render({ timingCue: cue }, "core")).toMatch(/ジャスト!<\/span><span[^>]*>芯<\/span>/);
    expect(render({ timingCue: { label: "early", dtMs: -62 } }, "graze")).toMatch(/早い −62ms<\/span><span[^>]*>かすり<\/span>/);
    expect(render({ timingCue: { label: "late", dtMs: 48 } }, "normal")).toContain("ふつう");
    expect(render({ timingCue: cue }, "miss")).toContain("ミス");
  });

  it("質を渡さないときは 1 行(v2 と同じ)、ゾーン矩形が未計測のときはピルを出さない", () => {
    expect(render({ timingCue: cue })).not.toContain("bb-stage__timing-sub");
    expect(render({ timingCue: cue, zoneRect: null }, "core")).not.toContain("timing-cue");
  });

  it("ピルは枠の上端中央に置く(矩形に追従する)", () => {
    expect(render({ timingCue: cue }, "core")).toContain("left:195px;top:410px");
    expect(render({ timingCue: cue, zoneRect: { left: 10, top: 20, width: 100, height: 120 } }, "core")).toContain("left:60px;top:20px");
  });
});

describe("StageView: ヒント", () => {
  it("ヒントが無ければ出さない", () => {
    expect(render({})).not.toContain("bb-stage__hint");
  });

  it("最初の数球のヒントを、ゾーン枠の下(枠の下端 + 10px。下端から 190px までに収める)に出す", () => {
    const html = render({ hint: "カーソルを ● に あわせて" });
    expect(html).toContain("カーソルを ● に あわせて");
    expect(html).toContain("top:min(595px, calc(100% - 190px))");
    expect(html).not.toContain("tap-hint");
  });

  it("タップが通らなかったときのヒント(ポンと おす)は、最初の数球のヒントより優先する", () => {
    const html = render({ hint: "カーソルを ● に あわせて", tapHint: "タップは すばやく ポンと おす" });
    expect(html).toContain("tap-hint");
    expect(html).toContain("ポンと おす");
    expect(html).not.toContain("カーソルを");
  });
});

describe("StageView: data-* ミラーと入力面", () => {
  it("予告の見せ方・投球入力の状態・投球の質・バナーを data-* に出す。値が無いものは属性を出さない", () => {
    const empty = render({});
    expect(empty).toContain('data-guide-mode="exact"');
    expect(empty).not.toContain("data-input-state");
    expect(empty).not.toContain("data-pitch-quality");
    expect(empty).not.toContain("data-banner");
    const html = render({
      inputState: { phase: "gauge", aim: { x: 0, y: 0 }, gaugeElapsedMs: 300, quality: null },
      pitchQuality: "nice",
      banner: { kind: "just", text: "ジャスト!", color: "#ffd23f", seq: 3, durationMs: 800 },
    });
    expect(html).toContain('data-input-state="gauge"');
    expect(html).toContain('data-pitch-quality="nice"');
    expect(html).toContain('data-banner="just"');
  });

  it("入力面は inputActive のとき --active を付ける(人間打撃中も守備中も同じ構造)", () => {
    expect(render({ inputActive: true })).toContain("bb-stage__input bb-stage__input--active");
    expect(render({ inputActive: false })).not.toContain("bb-stage__input--active");
  });

  it("ステージの contextmenu を preventDefault する", () => {
    const root = StageView({ ...BASE, contactQuality: null }) as ReactElement<{
      readonly onContextMenu: (event: { readonly preventDefault: () => void }) => void;
    }>;
    const preventDefault = vi.fn();
    root.props.onContextMenu({ preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });
});
