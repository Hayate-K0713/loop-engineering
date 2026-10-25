import { describe, expect, it } from "vitest";
import type { SwingInputKind, SwingOrigin } from "../../../types/batting";
import { BATTING_PARAMS } from "../../batting/params";
import { inputLatencyOf, swingAtMs, type SwingAtMsInput } from "./swing-time";

// 時計の基準は event.timeStamp と同じ高精度タイマー(投球開始 1000ms)。補正量・範囲は BATTING_PARAMS から取る(リテラルで固定しない)。
const START = 1000;
const { maxEventAgeMs, maxTapSpanMs } = BATTING_PARAMS;
const KINDS: readonly SwingInputKind[] = ["touch", "mouse", "key"];

function click(timeStamp: number, inputKind: SwingInputKind = "mouse"): SwingOrigin {
  return { timeStamp, sourceTimeStamp: timeStamp, inputKind };
}

function tap(downTimeStamp: number, upTimeStamp: number): SwingOrigin {
  return { timeStamp: downTimeStamp, sourceTimeStamp: upTimeStamp, inputKind: "touch" };
}

function atMs(origin: SwingOrigin | null, nowMs: number, timeScale = 1, startedAtMs: number | null = START): number {
  const input: SwingAtMsInput = { origin, nowMs, startedAtMs, timeScale };
  return swingAtMs(input);
}

describe("inputLatencyOf: 入力種別の遅延補正", () => {
  it("3 種が BATTING_PARAMS.inputLatencyMs と一致する(タッチ > マウス・キー)", () => {
    expect(KINDS.map(inputLatencyOf)).toEqual([BATTING_PARAMS.inputLatencyMs.touch, BATTING_PARAMS.inputLatencyMs.mouse, BATTING_PARAMS.inputLatencyMs.key]);
    expect(inputLatencyOf("touch")).toBeGreaterThan(inputLatencyOf("mouse"));
  });
});

describe("swingAtMs: origin なし・開始時刻なし", () => {
  it("origin = null は補正なしで (now − 開始) × timeScale(従来と同値)", () => {
    expect(atMs(null, START + 500)).toBeCloseTo(500, 9);
    expect(atMs(null, START + 500, 8)).toBeCloseTo(4000, 9);
    expect(atMs(null, START - 30)).toBeCloseTo(-30, 9);
  });

  it("startedAtMs = null は 0(origin の有無によらない)", () => {
    expect(atMs(null, START + 500, 1, null)).toBe(0);
    expect(atMs(click(START + 490), START + 500, 1, null)).toBe(0);
  });
});

describe("swingAtMs: イベントの時刻が使える", () => {
  it("ハンドラの実行が 10ms 遅れても、イベントの時刻から求める(マウスの補正を引く)", () => {
    const origin = click(START + 400);
    expect(atMs(origin, START + 410)).toBeCloseTo(400 - BATTING_PARAMS.inputLatencyMs.mouse, 9);
  });

  it("描画で詰まって実行が最大(maxEventAgeMs ちょうど)まで遅れても、イベントの時刻を使う", () => {
    const origin = click(START + 400);
    expect(atMs(origin, START + 400 + maxEventAgeMs)).toBeCloseTo(400 - BATTING_PARAMS.inputLatencyMs.mouse, 9);
  });

  it("実行と同時(経過 0)でもイベントの時刻を使う", () => {
    expect(atMs(click(START + 400), START + 400)).toBeCloseTo(400 - BATTING_PARAMS.inputLatencyMs.mouse, 9);
  });

  it("入力種別 3 つで補正量が違う(同じイベントの時刻)", () => {
    const results = KINDS.map((kind) => atMs(click(START + 400, kind), START + 405));
    expect(results.map((value) => 400 - value)).toEqual(KINDS.map(inputLatencyOf));
  });

  it("負の atMs(投球開始の直後のスイング)も返す", () => {
    expect(atMs(click(START + 10, "touch"), START + 12)).toBeCloseTo(10 - BATTING_PARAMS.inputLatencyMs.touch, 9);
  });
});

describe("swingAtMs: イベントの時刻が使えない(now を使い、補正は引く)", () => {
  const nowMs = START + 700;
  const expectedFromNow = (kind: SwingInputKind): number => 700 - inputLatencyOf(kind);

  it("イベントが古すぎる(maxEventAgeMs + 1)", () => {
    const origin = click(nowMs - maxEventAgeMs - 1, "key");
    expect(atMs(origin, nowMs)).toBeCloseTo(expectedFromNow("key"), 9);
  });

  it("イベントが未来(経過が負)", () => {
    const origin = click(nowMs + 5, "mouse");
    expect(atMs(origin, nowMs)).toBeCloseTo(expectedFromNow("mouse"), 9);
  });

  it("NaN の timeStamp / sourceTimeStamp", () => {
    expect(atMs({ timeStamp: Number.NaN, sourceTimeStamp: nowMs - 5, inputKind: "touch" }, nowMs)).toBeCloseTo(expectedFromNow("touch"), 9);
    expect(atMs({ timeStamp: nowMs - 5, sourceTimeStamp: Number.NaN, inputKind: "touch" }, nowMs)).toBeCloseTo(expectedFromNow("touch"), 9);
  });

  it("桁違いの時刻(エポック時刻・Infinity)", () => {
    expect(atMs(click(1.7e12, "mouse"), nowMs)).toBeCloseTo(expectedFromNow("mouse"), 9);
    expect(atMs(click(Number.POSITIVE_INFINITY, "mouse"), nowMs)).toBeCloseTo(expectedFromNow("mouse"), 9);
    expect(atMs(click(Number.NEGATIVE_INFINITY, "mouse"), nowMs)).toBeCloseTo(expectedFromNow("mouse"), 9);
  });

  it("timeScale 8 でも、now を使う場合の補正は換算しない", () => {
    expect(atMs(click(1.7e12, "key"), nowMs, 8)).toBeCloseTo(700 * 8 - inputLatencyOf("key"), 9);
  });
});

describe("swingAtMs: タップ(押下 → 離し)", () => {
  it("押下 → 離しが maxTapSpanMs ちょうどなら、押下の時刻を使う", () => {
    const down = START + 300;
    const origin = tap(down, down + maxTapSpanMs);
    expect(atMs(origin, down + maxTapSpanMs + 8)).toBeCloseTo(300 - BATTING_PARAMS.inputLatencyMs.touch, 9);
  });

  it("タップの最大(180ms)でも押下の時刻を使う。ハンドラが離しから maxEventAgeMs 遅れても同じ", () => {
    const down = START + 300;
    const origin = tap(down, down + 180);
    expect(atMs(origin, down + 180 + maxEventAgeMs)).toBeCloseTo(300 - BATTING_PARAMS.inputLatencyMs.touch, 9);
  });

  it("押下 → 離しが maxTapSpanMs + 1 なら now を使う(補正は引く)", () => {
    const down = START + 300;
    const nowMs = down + maxTapSpanMs + 1 + 5;
    expect(atMs(tap(down, down + maxTapSpanMs + 1), nowMs)).toBeCloseTo(nowMs - START - BATTING_PARAMS.inputLatencyMs.touch, 9);
  });

  it("離しが押下より前(押下 → 離しが負)なら now を使う", () => {
    const nowMs = START + 700;
    expect(atMs(tap(START + 400, START + 390), nowMs)).toBeCloseTo(700 - BATTING_PARAMS.inputLatencyMs.touch, 9);
  });

  it("経過の判定は離し側(sourceTimeStamp)で行う: 押下からは 250ms を超えていても、離しから 250ms 以内なら押下の時刻を使う", () => {
    const down = START + 300;
    const up = down + 180;
    const nowMs = up + 100;
    expect(nowMs - down).toBeGreaterThan(maxEventAgeMs);
    expect(atMs(tap(down, up), nowMs)).toBeCloseTo(300 - BATTING_PARAMS.inputLatencyMs.touch, 9);
  });

  it("離しから maxEventAgeMs + 1 を過ぎたら now を使う", () => {
    const down = START + 300;
    const up = down + 100;
    const nowMs = up + maxEventAgeMs + 1;
    expect(atMs(tap(down, up), nowMs)).toBeCloseTo(nowMs - START - BATTING_PARAMS.inputLatencyMs.touch, 9);
  });
});

describe("swingAtMs: timeScale", () => {
  it("timeScale 8 では経過ゲーム時間を換算し、補正(ゲート ms)は換算しない", () => {
    const origin = click(START + 400, "touch");
    expect(atMs(origin, START + 405, 8)).toBeCloseTo(400 * 8 - BATTING_PARAMS.inputLatencyMs.touch, 9);
  });

  it("timeScale 1 と 8 の差は経過分だけ(補正量は同じ)", () => {
    const origin = click(START + 400, "key");
    expect(atMs(origin, START + 405, 8) - atMs(origin, START + 405, 1)).toBeCloseTo(400 * 7, 9);
  });
});
