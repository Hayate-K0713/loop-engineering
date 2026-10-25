import { describe, expect, it } from "vitest";
import type { BattedBall, BattedLanding, InPlayResult, PlateOutcome } from "../../../types/batting";
import type { PitchOutcomeView } from "../../../types/view";
import { LANDING_PARAMS } from "../../batting/params";
import { telopAt, telopFor } from "./telop";

const RESULTS: readonly InPlayResult[] = ["groundout", "doublePlay", "flyout", "lineout", "single", "double", "triple", "homerun", "error"];
const NON_CONTACT_KINDS = ["ball", "called-strike", "swinging-strike", "foul"] as const;
const PLATES: readonly (PlateOutcome | null)[] = [null, "walk", "strikeout"];
const BALL: BattedBall = { type: "fly", strength: "medium", direction: "center" };
const INFIELD_LIMIT = LANDING_PARAMS.baseDistance * Math.SQRT2;

function landingOf(distance: number, lateral: number): BattedLanding {
  const y = distance / Math.sqrt(1 + lateral * lateral);
  return { x: lateral * y, y, distance, lateral, overFence: distance >= LANDING_PARAMS.fenceRadius };
}

const CENTER_LANDING = landingOf(60, 0);

function inPlayOutcome(result: InPlayResult): PitchOutcomeView {
  return { seq: 1, kind: "in-play", inPlay: { result, ball: BALL }, plate: result };
}

function otherOutcome(kind: (typeof NON_CONTACT_KINDS)[number], plate: PlateOutcome | null): PitchOutcomeView {
  return { seq: 1, kind, inPlay: null, plate };
}

describe("telopFor: 全組み合わせで空でない文言", () => {
  it("全 kind × plate、全 InPlayResult × 落下点(あり/なし)", () => {
    const others = NON_CONTACT_KINDS.flatMap((kind) => PLATES.map((plate) => telopFor(otherOutcome(kind, plate), null)));
    const inPlay = RESULTS.flatMap((result) => [null, CENTER_LANDING].map((landing) => telopFor(inPlayOutcome(result), landing)));
    expect(others).toHaveLength(NON_CONTACT_KINDS.length * PLATES.length);
    expect(inPlay).toHaveLength(RESULTS.length * 2);
    expect([...others, ...inPlay].every((text) => text.length > 0)).toBe(true);
  });
});

describe("telopFor: 打席が続く球", () => {
  it.each([
    ["ball", "ボール"],
    ["called-strike", "ストライク"],
    ["swinging-strike", "空振り!"],
    ["foul", "ファウル"],
  ] as const)("%s は「%s」", (kind, text) => {
    expect(telopFor(otherOutcome(kind, null), null)).toBe(text);
  });
});

describe("telopFor: 打席が終わる球", () => {
  it("四球は「フォアボール」", () => {
    expect(telopFor(otherOutcome("ball", "walk"), null)).toBe("フォアボール");
  });

  it("見逃し三振は「見逃し三振!」、空振り三振は「空振り三振!」", () => {
    expect(telopFor(otherOutcome("called-strike", "strikeout"), null)).toBe("見逃し三振!");
    expect(telopFor(otherOutcome("swinging-strike", "strikeout"), null)).toBe("空振り三振!");
  });
});

describe("telopFor: インプレー", () => {
  it("ホームランは方向によらず「ホームラン!!」", () => {
    expect(telopFor(inPlayOutcome("homerun"), landingOf(110, -0.6))).toBe("ホームラン!!");
    expect(telopFor(inPlayOutcome("homerun"), landingOf(110, 0.6))).toBe("ホームラン!!");
  });

  it.each([
    ["groundout", "ゴロアウト"],
    ["doublePlay", "併殺打!"],
    ["error", "エラー!"],
  ] as const)("%s は方向によらず「%s」", (result, text) => {
    expect(telopFor(inPlayOutcome(result), landingOf(25, -0.5))).toBe(text);
    expect(telopFor(inPlayOutcome(result), landingOf(25, 0.5))).toBe(text);
  });

  it("単打: 落下点が内野(距離 < 塁間 × √2)なら「内野安打!」", () => {
    expect(telopFor(inPlayOutcome("single"), landingOf(INFIELD_LIMIT - 0.1, 0))).toBe("内野安打!");
    expect(telopFor(inPlayOutcome("single"), landingOf(30, -0.6))).toBe("内野安打!");
  });

  it("単打: 内野より遠ければ「{方向}前ヒット!」", () => {
    expect(telopFor(inPlayOutcome("single"), landingOf(INFIELD_LIMIT, 0))).toBe("センター前ヒット!");
    expect(telopFor(inPlayOutcome("single"), landingOf(60, -0.5))).toBe("レフト前ヒット!");
    expect(telopFor(inPlayOutcome("single"), landingOf(60, 0.5))).toBe("ライト前ヒット!");
  });

  it("二塁打・三塁打・フライ・ライナーは方向名が入る", () => {
    const left = landingOf(85, -0.5);
    const right = landingOf(85, 0.5);
    expect(telopFor(inPlayOutcome("double"), left)).toBe("レフトへの二塁打!");
    expect(telopFor(inPlayOutcome("triple"), right)).toBe("ライトへの三塁打!");
    expect(telopFor(inPlayOutcome("flyout"), left)).toBe("レフトフライ");
    expect(telopFor(inPlayOutcome("lineout"), right)).toBe("ライトライナー");
    expect(telopFor(inPlayOutcome("flyout"), CENTER_LANDING)).toBe("センターフライ");
  });

  it("方向の境界: lateral < −0.25 でレフト、> +0.25 でライト、境界ちょうどはセンター", () => {
    const left = LANDING_PARAMS.lateral.pull.max;
    const right = LANDING_PARAMS.lateral.opposite.min;
    expect(telopFor(inPlayOutcome("flyout"), landingOf(70, left - 0.01))).toBe("レフトフライ");
    expect(telopFor(inPlayOutcome("flyout"), landingOf(70, left))).toBe("センターフライ");
    expect(telopFor(inPlayOutcome("flyout"), landingOf(70, right))).toBe("センターフライ");
    expect(telopFor(inPlayOutcome("flyout"), landingOf(70, right + 0.01))).toBe("ライトフライ");
  });

  it("落下点が無くても文言を返す(方向はセンター扱い、単打は内野安打にならない)", () => {
    expect(telopFor(inPlayOutcome("single"), null)).toBe("センター前ヒット!");
    expect(telopFor(inPlayOutcome("double"), null)).toBe("センターへの二塁打!");
  });

  it("inPlay が無い in-play(想定外)でも空でない文言を返す", () => {
    expect(telopFor({ seq: 1, kind: "in-play", inPlay: null, plate: null }, null)).not.toBe("");
  });
});

describe("telopAt", () => {
  const plan = { telop: { text: "テロップ", startMs: 600, endMs: 1700 } };

  it("startMs 前は null", () => {
    expect(telopAt(plan, 0)).toBeNull();
    expect(telopAt(plan, 599)).toBeNull();
  });

  it("区間内(startMs 以上 endMs 未満)は文言", () => {
    expect(telopAt(plan, 600)).toBe("テロップ");
    expect(telopAt(plan, 1100)).toBe("テロップ");
    expect(telopAt(plan, 1699)).toBe("テロップ");
  });

  it("endMs 以降は null", () => {
    expect(telopAt(plan, 1700)).toBeNull();
    expect(telopAt(plan, 5000)).toBeNull();
  });
});
