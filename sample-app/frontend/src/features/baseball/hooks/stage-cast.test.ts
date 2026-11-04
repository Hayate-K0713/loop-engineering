import { describe, expect, it } from "vitest";
import { INTRO_WIPE_MS, type WipeStage } from "../model/world/camera/wipe";
import { makeFrame } from "../render/test-fixtures";
import type { SceneFrame } from "../types/scene";
import type { CastView } from "../types/view";
import { CPU_TEAM, PLAYER_TEAM } from "../model/data/teams";
import {
  castLooksOf,
  expressionsOf,
  INITIAL_INTRO_CLOCK,
  introKeyOf,
  sameDetail,
  sameExpressions,
  sameWipeView,
  stepIntro,
  wipeAllowedAt,
  wipeDisplayOf,
  wipeSceneOf,
} from "./stage-cast";

const CAST: CastView = { offense: PLAYER_TEAM, defense: CPU_TEAM, lineupIndex: 2 };
const NAMES = { batter: { name: "レオン", orderLabel: "3番" }, pitcher: { name: "ダン" } };
const RECT = { x: 290, y: 175, width: 94, height: 94 };
const STAGES: readonly WipeStage[] = [{ scene: "hit", target: "batter", startMs: 1000, endMs: 2200 }];

function wipeOf(overrides: Partial<SceneFrame["wipe"]>): SceneFrame["wipe"] {
  return { visible: true, target: "batter", camera: makeFrame().wipe.camera, rect: RECT, alpha: 1, ...overrides };
}

describe("castLooksOf", () => {
  it("守備側の投手と、攻撃側の lineupIndex 番目の打者の見た目を返す", () => {
    const looks = castLooksOf(CAST);
    expect(looks.pitcher).toBe(CPU_TEAM.pitcher.look);
    expect(looks.batter).toBe(PLAYER_TEAM.batters.at(2)?.look);
  });
});

describe("introKeyOf", () => {
  it("攻撃側のチームと打者番号が変わると別の打席のキーになる", () => {
    expect(introKeyOf(CAST)).not.toBe(introKeyOf({ ...CAST, lineupIndex: 3 }));
    expect(introKeyOf(CAST)).not.toBe(introKeyOf({ ...CAST, offense: CPU_TEAM, defense: PLAYER_TEAM }));
    expect(introKeyOf(CAST)).toBe(introKeyOf({ ...CAST }));
  });
});

describe("stepIntro", () => {
  it("idle・windup で始め、INTRO_WIPE_MS の間だけ経過を返す", () => {
    const first = stepIntro(INITIAL_INTRO_CLOCK, { key: "a", phase: "windup", paused: false, nowMs: 1000 });
    expect(first.introMs).toBe(0);
    const mid = stepIntro(first.clock, { key: "a", phase: "windup", paused: false, nowMs: 1600 });
    expect(mid.introMs).toBe(600);
    const end = stepIntro(mid.clock, { key: "a", phase: "windup", paused: false, nowMs: 1000 + INTRO_WIPE_MS });
    expect(end.introMs).toBeNull();
    expect(end.clock.done).toBe(true);
  });

  it("止めている間(paused)は始めず、止まりが解けた時刻から数える", () => {
    const waiting = stepIntro(INITIAL_INTRO_CLOCK, { key: "a", phase: "idle", paused: true, nowMs: 500 });
    expect(waiting.introMs).toBeNull();
    const started = stepIntro(waiting.clock, { key: "a", phase: "idle", paused: false, nowMs: 900 });
    expect(started.introMs).toBe(0);
    const later = stepIntro(started.clock, { key: "a", phase: "windup", paused: false, nowMs: 1100 });
    expect(later.introMs).toBe(200);
  });

  it("同じ打席の 2 球目以降(終わった後)は出さず、打席が変わったらまた出す", () => {
    const first = stepIntro(INITIAL_INTRO_CLOCK, { key: "a", phase: "idle", paused: false, nowMs: 0 });
    const over = stepIntro(first.clock, { key: "a", phase: "idle", paused: false, nowMs: INTRO_WIPE_MS + 10 });
    expect(over.introMs).toBeNull();
    const again = stepIntro(over.clock, { key: "a", phase: "idle", paused: false, nowMs: INTRO_WIPE_MS + 5000 });
    expect(again.introMs).toBeNull();
    const next = stepIntro(again.clock, { key: "b", phase: "idle", paused: false, nowMs: INTRO_WIPE_MS + 6000 });
    expect(next.introMs).toBe(0);
  });

  it("投球が飛び始めたら、その打席の紹介は終わり(戻っても出さない)", () => {
    const first = stepIntro(INITIAL_INTRO_CLOCK, { key: "a", phase: "windup", paused: false, nowMs: 0 });
    const flying = stepIntro(first.clock, { key: "a", phase: "flight", paused: false, nowMs: 300 });
    expect(flying.introMs).toBeNull();
    const back = stepIntro(flying.clock, { key: "a", phase: "idle", paused: false, nowMs: 400 });
    expect(back.introMs).toBeNull();
  });

  it("まだ始めていない打席で投球が飛び始めても、時計は壊れない", () => {
    const flying = stepIntro(INITIAL_INTRO_CLOCK, { key: "a", phase: "flight", paused: false, nowMs: 300 });
    expect(flying.introMs).toBeNull();
    expect(flying.clock.key).toBe("a");
  });
});

describe("wipeSceneOf", () => {
  it("idle・windup で introMs があれば intro", () => {
    expect(wipeSceneOf({ phase: "windup", plan: null, tMs: 0, introMs: 100 })).toBe("intro");
    expect(wipeSceneOf({ phase: "idle", plan: null, tMs: 0, introMs: 0 })).toBe("intro");
    expect(wipeSceneOf({ phase: "idle", plan: null, tMs: 0, introMs: null })).toBeNull();
  });

  it("play の間は plan.wipe の区間の場面、区間の外は null", () => {
    expect(wipeSceneOf({ phase: "play", plan: { wipe: STAGES }, tMs: 1500, introMs: null })).toBe("hit");
    expect(wipeSceneOf({ phase: "play", plan: { wipe: STAGES }, tMs: 900, introMs: null })).toBeNull();
    expect(wipeSceneOf({ phase: "play", plan: { wipe: STAGES }, tMs: 2200, introMs: null })).toBeNull();
    expect(wipeSceneOf({ phase: "flight", plan: { wipe: STAGES }, tMs: 1500, introMs: null })).toBeNull();
  });
});

describe("wipeDisplayOf", () => {
  const looks = castLooksOf(CAST);

  it("打者は「3番 レオン」と背番号・場面の役割ラベルを出す", () => {
    const display = wipeDisplayOf({ scene: "intro", frameWipe: wipeOf({ target: "batter" }), view: NAMES, looks });
    expect(display.wipe).toEqual({ visible: true, rect: RECT, label: "3番 レオン" });
    expect(display.detail).toEqual({ number: looks.batter.number, role: "打席" });
  });

  it("打者走者(runner0)も同じ人物として打者の名前・背番号を出す", () => {
    const display = wipeDisplayOf({ scene: "hit", frameWipe: wipeOf({ target: "runner0" }), view: NAMES, looks });
    expect(display.wipe?.label).toBe("3番 レオン");
    expect(display.detail).toEqual({ number: looks.batter.number, role: "ヒット!" });
  });

  it("投手は名前だけ(順番なし)で、背番号は投手のもの", () => {
    const display = wipeDisplayOf({ scene: "nice-pitch", frameWipe: wipeOf({ target: "pitcher" }), view: NAMES, looks });
    expect(display.wipe?.label).toBe("ダン");
    expect(display.detail).toEqual({ number: looks.pitcher.number, role: "ナイスピッチ!" });
  });

  it("場面ごとの役割ラベル", () => {
    const role = (scene: "intro" | "hit" | "homerun" | "strikeout" | "nice-pitch"): string | null | undefined =>
      wipeDisplayOf({ scene, frameWipe: wipeOf({}), view: NAMES, looks }).detail?.role;
    expect([role("intro"), role("hit"), role("homerun"), role("strikeout"), role("nice-pitch")]).toEqual([
      "打席",
      "ヒット!",
      "ホームラン!",
      "三振",
      "ナイスピッチ!",
    ]);
  });

  it("場面が無い・ワイプが見えていないときは何も出さない", () => {
    expect(wipeDisplayOf({ scene: null, frameWipe: wipeOf({}), view: NAMES, looks })).toEqual({ wipe: null, detail: null });
    expect(wipeDisplayOf({ scene: "hit", frameWipe: wipeOf({ visible: false, alpha: 0 }), view: NAMES, looks })).toEqual({ wipe: null, detail: null });
  });

  it("対象が打者・投手以外(想定外)でも、名前なしで縁だけ出す", () => {
    const display = wipeDisplayOf({ scene: "hit", frameWipe: wipeOf({ target: "fielder2" }), view: NAMES, looks });
    expect(display.wipe).toEqual({ visible: true, rect: RECT, label: null });
    expect(display.detail).toEqual({ number: null, role: "ヒット!" });
  });
});

describe("wipeAllowedAt", () => {
  it("T0〜T2 は出し、T3 は出さない(描画側と同じ表)", () => {
    expect([0, 1, 2, 3].map((tier) => wipeAllowedAt(tier as 0 | 1 | 2 | 3))).toEqual([true, true, true, false]);
  });
});

describe("expressionsOf", () => {
  it("投手と打者の今の表情を返す", () => {
    const base = makeFrame();
    const frame: SceneFrame = { ...base, pitcher: { ...base.pitcher, expression: "effort" }, batter: { ...base.batter, expression: "shock" } };
    expect(expressionsOf(frame)).toEqual({ pitcher: "effort", batter: "shock" });
  });
});

describe("同値判定", () => {
  it("ワイプの表示は位置・ラベルが同じなら同じ", () => {
    const a = { visible: true, rect: RECT, label: "x" };
    expect(sameWipeView(a, { ...a, rect: { ...RECT } })).toBe(true);
    expect(sameWipeView(a, { ...a, label: "y" })).toBe(false);
    expect(sameWipeView(a, { ...a, rect: { ...RECT, y: 176 } })).toBe(false);
    expect(sameWipeView(null, null)).toBe(true);
    expect(sameWipeView(a, null)).toBe(false);
  });

  it("帯の補足・表情", () => {
    expect(sameDetail({ number: 7, role: "打席" }, { number: 7, role: "打席" })).toBe(true);
    expect(sameDetail({ number: 7, role: "打席" }, { number: 8, role: "打席" })).toBe(false);
    expect(sameDetail(null, null)).toBe(true);
    expect(sameExpressions({ pitcher: "focus", batter: "focus" }, { pitcher: "focus", batter: "focus" })).toBe(true);
    expect(sameExpressions({ pitcher: "focus", batter: "focus" }, { pitcher: "focus", batter: "blink" })).toBe(false);
  });
});
