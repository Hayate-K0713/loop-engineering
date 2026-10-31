import { describe, expect, it } from "vitest";
import type { PitchInputCtx, PitchInputEffect, PitchInputEvent, PitchInputKind, PitchInputState, PitchQuality } from "../../../types/pitch";
import { PITCH_PARAMS } from "../../pitch/params";
import { INITIAL_PITCH_INPUT_STATE, pitchInputViewOf, reducePitchInput } from "./pitch-input";

const GAUGE = PITCH_PARAMS.gauge;
const CTX: PitchInputCtx = { enabled: true, holding: false, timeScale: 1 };
const HOLDING: PitchInputCtx = { enabled: true, holding: true, timeScale: 1 };
const DISABLED: PitchInputCtx = { enabled: false, holding: false, timeScale: 1 };
const NONE: PitchInputEffect = { type: "none" };
const LATENCY: Readonly<Record<PitchInputKind, number>> = { touch: 70, mouse: 20, key: 20 };

function down(pointerId: number, x: number, y: number, timeStamp = 0, inputKind: PitchInputKind = "touch"): PitchInputEvent {
  return { type: "pointer-down", pointerId, point: { x, y }, timeStamp, inputKind };
}
function move(pointerId: number, x: number, y: number, timeStamp = 0): PitchInputEvent {
  return { type: "pointer-move", pointerId, point: { x, y }, timeStamp };
}
function up(pointerId: number, timeStamp = 0, inputKind: PitchInputKind = "touch"): PitchInputEvent {
  return { type: "pointer-up", pointerId, timeStamp, inputKind };
}
function confirm(timeStamp: number, inputKind: PitchInputKind = "key"): PitchInputEvent {
  return { type: "confirm", timeStamp, inputKind };
}
function tick(timeStamp: number): PitchInputEvent {
  return { type: "tick", timeStamp };
}
function carry(pointerId: number): PitchInputEvent {
  return { type: "carry", pointerId };
}
function pointerCancel(pointerId: number): PitchInputEvent {
  return { type: "pointer-cancel", pointerId };
}

type Run = { readonly state: PitchInputState; readonly effects: readonly PitchInputEffect[] };

/** イベント列を順に流し、最終状態と各イベントの副作用を返す。 */
function run(events: readonly PitchInputEvent[], ctx: PitchInputCtx = CTX, from: PitchInputState = INITIAL_PITCH_INPUT_STATE): Run {
  let state = from;
  const effects: PitchInputEffect[] = [];
  for (const event of events) {
    const [next, effect] = reducePitchInput(state, event, ctx);
    state = next;
    effects.push(effect);
  }
  return { state, effects };
}

/** 副作用のうち `none` でないものだけ。 */
function meaningful(result: Run): readonly PitchInputEffect[] {
  return result.effects.filter((effect) => effect.type !== "none");
}

/** タッチで狙ってから離し、`startMs` にゲージが始まった状態。 */
function gaugeStateAt(startMs: number): PitchInputState {
  return run([down(1, 0, 0, 0), move(1, 0.5, 0.25, 10), up(1, startMs)]).state;
}

/** リングの終点(遅延補正後)から `errMs` ずれた時刻に、`inputKind`(touch かそれ以外 = mouse/key)で停止したときの副作用。 */
function stopAtError(errMs: number, inputKind: PitchInputKind = "touch"): PitchInputEffect {
  const startMs = 1000;
  const stopMs = startMs + GAUGE.ringMs + (inputKind === "touch" ? LATENCY.touch : LATENCY.mouse) + errMs;
  const [, effect] = reducePitchInput(gaugeStateAt(startMs), down(2, 0, 0, stopMs, inputKind), CTX);
  return effect;
}

function throwQuality(effect: PitchInputEffect): PitchQuality | null {
  return effect.type === "throw" ? effect.quality : null;
}

describe("狙い: タッチは相対ドラッグ", () => {
  it("押しただけでは狙いは動かず、move の移動量だけ狙いが動く", () => {
    const pressed = run([down(1, 0.5, 0.5)]);
    expect(pressed.state).toMatchObject({ phase: "aiming", aimPointerId: 1, aim: { x: 0, y: 0 } });
    const dragged = run([down(1, 0.5, 0.5), move(1, 0.75, 0.25), move(1, 1, 0)]);
    expect(dragged.state.aim).toEqual({ x: 0.5, y: -0.5 });
    expect(meaningful(dragged)).toEqual([]);
  });

  it("離すと狙いを確定してゲージが始まる(開始時刻は離しの timeStamp)", () => {
    const result = run([down(1, 0, 0, 0), move(1, 0.5, 0.25, 10), up(1, 777)]);
    expect(meaningful(result)).toEqual([{ type: "gauge-start" }]);
    expect(result.state).toMatchObject({ phase: "gauge", aim: { x: 0.5, y: 0.25 }, aimPointerId: null, dragOrigin: null, gaugeStartMs: 777 });
  });

  it("狙いの指でない指の move・離しは何も起こさない(2 本目の指)", () => {
    const result = run([down(1, 0, 0), down(2, 0.3, 0.3), move(2, 1, 1), up(2, 50), move(1, 0.25, 0)]);
    expect(result.state).toMatchObject({ phase: "aiming", aimPointerId: 1, aim: { x: 0.25, y: 0 } });
    expect(meaningful(result)).toEqual([]);
  });

  it("中断した後の次の押下は、前の狙いを起点にする(次のドラッグが続きから)", () => {
    const aimed = run([down(1, 0, 0), move(1, 0.5, 0), pointerCancel(1)]).state;
    expect(aimed).toMatchObject({ phase: "idle", aim: { x: 0.5, y: 0 }, aimPointerId: null, dragOrigin: null });
    const again = run([down(3, 1, 1), move(3, 1.25, 1)], CTX, aimed);
    expect(again.state.aim).toEqual({ x: 0.75, y: 0 });
  });
});

describe("狙い: マウス・キー", () => {
  it("マウスは動かすと狙いが追従し、クリック(押す→離す)で確定する", () => {
    const hover = run([move(1, 0.5, -0.5)]);
    expect(hover.state).toMatchObject({ phase: "aiming", aim: { x: 0.5, y: -0.5 }, aimPointerId: null });
    const clicked = run([move(1, 0.5, -0.5), down(1, 0.75, -0.25, 5, "mouse"), up(1, 90, "mouse")]);
    expect(clicked.state).toMatchObject({ phase: "gauge", aim: { x: 0.75, y: -0.25 }, gaugeStartMs: 90 });
    expect(meaningful(clicked)).toEqual([{ type: "gauge-start" }]);
  });

  it("マウスの押しっぱなしの move は、起点を持たず押した位置から絶対位置で追従する", () => {
    const result = run([down(1, 0.5, 0.5, 0, "mouse"), move(1, -0.75, 0.25)]);
    expect(result.state.aim).toEqual({ x: -0.75, y: 0.25 });
  });

  it("矢印キー(key-move)で狙いが動き、confirm で確定してゲージが始まる", () => {
    const result = run([{ type: "key-move", dx: 0.5, dy: 0 }, { type: "key-move", dx: 0.25, dy: -0.5 }, confirm(400)]);
    expect(result.state).toMatchObject({ phase: "gauge", aim: { x: 0.75, y: -0.5 }, gaugeStartMs: 400 });
    expect(meaningful(result)).toEqual([{ type: "gauge-start" }]);
  });

  it("idle で confirm(Space/ボタン)すると中央を狙ってゲージが始まる", () => {
    const result = run([confirm(10)]);
    expect(result.state).toMatchObject({ phase: "gauge", aim: { x: 0, y: 0 } });
  });
});

describe("aimLimit: 狙いは ±1.67 に収まる", () => {
  const LIMIT = GAUGE.aimLimit;

  it("ドラッグ・キー・マウスのどれでも超えない", () => {
    expect(run([down(1, 0, 0), move(1, 9, -9)]).state.aim).toEqual({ x: LIMIT, y: -LIMIT });
    expect(run([{ type: "key-move", dx: 5, dy: -5 }]).state.aim).toEqual({ x: LIMIT, y: -LIMIT });
    expect(run([down(1, -8, 8, 0, "mouse")]).state.aim).toEqual({ x: -LIMIT, y: LIMIT });
    expect(run([move(1, 3, 3)]).state.aim).toEqual({ x: LIMIT, y: LIMIT });
  });

  it("非有限の座標は 0 として扱う", () => {
    expect(run([down(1, 0, 0), move(1, Number.NaN, Number.POSITIVE_INFINITY)]).state.aim).toEqual({ x: 0, y: 0 });
  });
});

describe("ゲージ: 停止と質", () => {
  it("ゲージ中の押し(pointer-down)で停止して投球になる(狙いは確定時のまま)", () => {
    const stopMs = 1000 + GAUGE.ringMs + LATENCY.touch;
    const [next, effect] = reducePitchInput(gaugeStateAt(1000), down(2, 0, 0, stopMs), CTX);
    expect(effect).toEqual({ type: "throw", aim: { x: 0.5, y: 0.25 }, quality: "nice", errMs: 0 });
    expect(next).toMatchObject({ phase: "throwing", quality: "nice", errMs: 0 });
  });

  it("ボタン・Space(confirm)でも同じく停止して投球になる", () => {
    const stopMs = 1000 + GAUGE.ringMs + LATENCY.key;
    const [next, effect] = reducePitchInput(gaugeStateAt(1000), confirm(stopMs, "key"), CTX);
    expect(effect).toEqual({ type: "throw", aim: { x: 0.5, y: 0.25 }, quality: "nice", errMs: 0 });
    expect(next.phase).toBe("throwing");
  });

  it.each<readonly [number, PitchQuality]>([
    [0, "nice"],
    [40, "nice"],
    [-40, "nice"],
    [41, "good"],
    [-41, "good"],
    [90, "good"],
    [91, "normal"],
    [-91, "normal"],
    [160, "normal"],
    [161, "miss"],
    [-161, "miss"],
  ])("誤差 %dms は %s", (errMs, quality) => {
    expect(throwQuality(stopAtError(errMs))).toBe(quality);
    expect(throwQuality(stopAtError(errMs, "mouse"))).toBe(quality);
  });

  it("errMs は入力種別の遅延補正を引いた値(タッチ 70・マウス/キー 20)", () => {
    const touch = stopAtError(0, "touch");
    const key = stopAtError(0, "key");
    expect(touch).toMatchObject({ type: "throw", errMs: 0 });
    expect(key).toMatchObject({ type: "throw", errMs: 0 });
    const [, late] = reducePitchInput(gaugeStateAt(1000), down(2, 0, 0, 1000 + GAUGE.ringMs, "touch"), CTX);
    expect(late).toMatchObject({ type: "throw", errMs: -LATENCY.touch });
  });

  it("開始から stopGuardMs 未満の停止は無視する(ちょうど stopGuardMs は受け付ける)", () => {
    const state = gaugeStateAt(1000);
    const early = reducePitchInput(state, down(2, 0, 0, 1000 + GAUGE.stopGuardMs - 1), CTX);
    expect(early[1]).toEqual(NONE);
    expect(early[0]).toBe(state);
    const earlyConfirm = reducePitchInput(state, confirm(1000 + 10), CTX);
    expect(earlyConfirm[1]).toEqual(NONE);
    expect(earlyConfirm[0]).toBe(state);
    const onTime = reducePitchInput(state, down(2, 0, 0, 1000 + GAUGE.stopGuardMs), CTX);
    expect(onTime[1]).toMatchObject({ type: "throw", quality: "miss" });
  });

  it("確定の離しと同じ時刻・直後の押しは停止にならない(ダブルクリック)", () => {
    const state = gaugeStateAt(1000);
    expect(reducePitchInput(state, down(2, 0, 0, 1000), CTX)[1]).toEqual(NONE);
    expect(reducePitchInput(state, down(2, 0, 0, 900), CTX)[1]).toEqual(NONE);
  });

  it("ゲージ開始より前の時刻の押し(負の経過)は無視する", () => {
    expect(reducePitchInput(gaugeStateAt(1000), down(2, 0, 0, 500), CTX)[1]).toEqual(NONE);
  });
});

describe("ゲージ: 自動投球", () => {
  const AUTO_MS = GAUGE.ringMs + GAUGE.graceMs;

  it("ringMs + graceMs に達した tick で失投(errMs null)として自動投球になる", () => {
    const state = gaugeStateAt(1000);
    expect(reducePitchInput(state, tick(1000 + AUTO_MS - 1), CTX)).toEqual([state, NONE]);
    const [next, effect] = reducePitchInput(state, tick(1000 + AUTO_MS), CTX);
    expect(effect).toEqual({ type: "throw", aim: { x: 0.5, y: 0.25 }, quality: "miss", errMs: null });
    expect(next).toMatchObject({ phase: "throwing", quality: "miss", errMs: null });
  });

  it("tick が先に来なかった場合、猶予を過ぎた押しも失投になる(誤差が窓の外)", () => {
    const [, effect] = reducePitchInput(gaugeStateAt(1000), down(2, 0, 0, 1000 + AUTO_MS + 5), CTX);
    expect(throwQuality(effect)).toBe("miss");
  });

  it("ゲージ以外の phase の tick は何も起こさない", () => {
    expect(run([tick(99999)]).effects).toEqual([NONE]);
    expect(run([down(1, 0, 0), tick(99999)]).state.phase).toBe("aiming");
  });
});

describe("ゲージ中の入力は狙いを変えない", () => {
  it("move・key-move・離し・2 本目の押し(ガード内)で狙いも phase も変わらない", () => {
    const state = gaugeStateAt(1000);
    const events: readonly PitchInputEvent[] = [move(1, 1.5, 1.5, 1100), move(9, -1, -1, 1100), { type: "key-move", dx: 1, dy: 1 }, up(1, 1100), up(9, 1100)];
    const result = run(events, CTX, state);
    expect(result.state).toBe(state);
    expect(meaningful(result)).toEqual([]);
  });

  it("停止後の throwing では停止以外を含めて何も起こさない", () => {
    const thrown = reducePitchInput(gaugeStateAt(1000), down(2, 0, 0, 1000 + GAUGE.ringMs + LATENCY.touch), CTX)[0];
    const events: readonly PitchInputEvent[] = [
      down(3, 0, 0, 3000),
      move(3, 1, 1, 3000),
      up(3, 3000),
      confirm(3000),
      tick(9999),
      { type: "key-move", dx: 1, dy: 1 },
    ];
    const result = run(events, CTX, thrown);
    expect(result.state).toBe(thrown);
    expect(meaningful(result)).toEqual([]);
  });
});

describe("timeScale", () => {
  const FAST: PitchInputCtx = { enabled: true, holding: false, timeScale: 8 };

  it("リング・猶予・停止ガードが timeScale 分の 1 になる(質の窓は壁時計の ms のまま)", () => {
    const state = gaugeStateAt(1000);
    const ring = GAUGE.ringMs / 8;
    const guard = GAUGE.stopGuardMs / 8;
    expect(reducePitchInput(state, down(2, 0, 0, 1000 + guard - 1), FAST)[1]).toEqual(NONE);
    const [, effect] = reducePitchInput(state, down(2, 0, 0, 1000 + ring + LATENCY.touch + 40), FAST);
    expect(effect).toMatchObject({ type: "throw", quality: "nice", errMs: 40 });
    const [, late] = reducePitchInput(state, down(2, 0, 0, 1000 + ring + LATENCY.touch + 41), FAST);
    expect(throwQuality(late)).toBe("good");
  });

  it("自動投球も ringMs + graceMs の timeScale 分の 1 で起きる", () => {
    const auto = (GAUGE.ringMs + GAUGE.graceMs) / 8;
    const state = gaugeStateAt(1000);
    expect(reducePitchInput(state, tick(1000 + auto - 1), FAST)[1]).toEqual(NONE);
    expect(reducePitchInput(state, tick(1000 + auto), FAST)[1]).toMatchObject({ type: "throw", quality: "miss", errMs: null });
  });

  it("不正な timeScale は 1 として扱う", () => {
    const zero: PitchInputCtx = { enabled: true, holding: false, timeScale: 0 };
    const stopMs = 1000 + GAUGE.ringMs + LATENCY.touch;
    expect(reducePitchInput(gaugeStateAt(1000), down(2, 0, 0, stopMs), zero)[1]).toMatchObject({ quality: "nice" });
  });
});

describe("holding / enabled", () => {
  const EVENTS: readonly PitchInputEvent[] = [
    down(1, 0.5, 0.5, 100),
    move(1, 1, 1, 100),
    move(7, 1, 1, 100),
    up(1, 100),
    confirm(100),
    tick(100000),
    { type: "key-move", dx: 1, dy: 1 },
  ];
  const STATES: readonly PitchInputState[] = [INITIAL_PITCH_INPUT_STATE, run([down(1, 0, 0)]).state, gaugeStateAt(1000)];

  it.each<readonly [string, PitchInputCtx]>([
    ["holding", HOLDING],
    ["enabled でない", DISABLED],
  ])("%s のとき、どの phase のどのイベントでも状態も副作用も変わらない", (_name, ctx) => {
    for (const from of STATES) {
      const result = run(EVENTS, ctx, from);
      expect(result.state).toBe(from);
      expect(meaningful(result)).toEqual([]);
    }
  });

  it("holding が解けると同じイベントが通る", () => {
    expect(run([confirm(100)], HOLDING).state.phase).toBe("idle");
    expect(run([confirm(100)], CTX).state.phase).toBe("gauge");
  });
});

describe("持ち越しの指(スキップに使った指)", () => {
  it("carry で登録され、離してもゲージは始まらず(none)、登録が消える", () => {
    const registered = run([carry(5)], HOLDING);
    expect(registered.state.carriedPointerId).toBe(5);
    const released = run([up(5, 200)], CTX, registered.state);
    expect(released.state).toMatchObject({ phase: "idle", carriedPointerId: null, gaugeStartMs: null });
    expect(released.effects).toEqual([NONE]);
  });

  it("演出中(holding)に離しても同じ(ゲージは始まらず、登録だけ消える)", () => {
    const result = run([carry(5), up(5, 200)], HOLDING);
    expect(result.state).toMatchObject({ phase: "idle", carriedPointerId: null });
    expect(meaningful(result)).toEqual([]);
  });

  it("演出が終わった後の最初の move で狙い開始(aiming)になる(この move では狙いは動かない)", () => {
    const first = run([carry(5), move(5, 0.5, 0.5, 300)]);
    expect(first.state).toMatchObject({ phase: "aiming", aimPointerId: 5, carriedPointerId: null, aim: { x: 0, y: 0 } });
    expect(meaningful(first)).toEqual([]);
    const dragged = run([carry(5), move(5, 0.5, 0.5, 300), move(5, 0.75, 0.25, 310)]);
    expect(dragged.state.aim).toEqual({ x: 0.25, y: -0.25 });
  });

  it("昇格した指は通常の規則に従い、離すと狙いを確定してゲージが始まる", () => {
    const result = run([carry(5), move(5, 0, 0, 300), move(5, 0.25, 0, 310), up(5, 500)]);
    expect(meaningful(result)).toEqual([{ type: "gauge-start" }]);
    expect(result.state).toMatchObject({ phase: "gauge", aim: { x: 0.25, y: 0 }, gaugeStartMs: 500 });
  });

  it("演出中(holding)の move では狙い開始にならない", () => {
    const result = run([move(5, 1, 1, 300)], HOLDING, run([carry(5)], HOLDING).state);
    expect(result.state).toMatchObject({ phase: "idle", carriedPointerId: 5, aimPointerId: null });
  });

  it("複数の持ち越しの指があるときは、最初に登録された(最初に下りた)pointerId が昇格する", () => {
    const registered = run([carry(5), carry(7)], HOLDING).state;
    expect(registered.carriedPointerId).toBe(5);
    const ignored = run([move(7, 1, 1, 300)], CTX, registered);
    expect(ignored.state).toMatchObject({ phase: "idle", aimPointerId: null, carriedPointerId: 5 });
    const promoted = run([move(5, 1, 1, 310)], CTX, registered);
    expect(promoted.state).toMatchObject({ phase: "aiming", aimPointerId: 5 });
  });

  it("持ち越しの指が下りたまま別の指で狙っても、持ち越しの指の move・離しは無視する", () => {
    const result = run([carry(5), down(2, 0, 0, 100), move(5, 1, 1, 110), move(2, 0.5, 0, 120), up(5, 130)]);
    expect(result.state).toMatchObject({ phase: "aiming", aimPointerId: 2, aim: { x: 0.5, y: 0 }, carriedPointerId: null });
    expect(meaningful(result)).toEqual([]);
  });

  it("ゲージ中の持ち越しの指の離しは停止にならない(停止はゲージ開始後の pointer-down だけ)", () => {
    const gauge = run([carry(5), down(2, 0, 0, 0), up(2, 1000)]).state;
    expect(gauge).toMatchObject({ phase: "gauge", carriedPointerId: 5 });
    const released = run([up(5, 1000 + GAUGE.ringMs + LATENCY.touch)], CTX, gauge);
    expect(released.state.phase).toBe("gauge");
    expect(meaningful(released)).toEqual([]);
  });

  it("pointer-cancel でも登録が消える。狙いの指ではない指を carry しても登録しない", () => {
    const cancelled = run([carry(5), pointerCancel(5)]);
    expect(cancelled.state.carriedPointerId).toBeNull();
    const aiming = run([down(2, 0, 0), carry(2)]);
    expect(aiming.state.carriedPointerId).toBeNull();
  });

  it("reset しても、まだ下りている持ち越しの指は残る", () => {
    const state = run([carry(5), down(2, 0, 0, 0), up(2, 1000), { type: "reset" }]).state;
    expect(state).toEqual({ ...INITIAL_PITCH_INPUT_STATE, carriedPointerId: 5 });
  });
});

describe("pointer-cancel / reset", () => {
  it("狙いの指の cancel は確定せずに idle へ戻り、狙いの位置は残る", () => {
    const result = run([down(1, 0, 0), move(1, 0.5, 0.25), pointerCancel(1)]);
    expect(result.state).toMatchObject({ phase: "idle", aimPointerId: null, aim: { x: 0.5, y: 0.25 } });
    expect(meaningful(result)).toEqual([]);
  });

  it("ゲージ中の cancel は何も起こさない。reset で初期状態へ戻る", () => {
    const gauge = gaugeStateAt(1000);
    expect(run([pointerCancel(1)], CTX, gauge).state).toBe(gauge);
    expect(run([{ type: "reset" }], CTX, gauge).state).toEqual(INITIAL_PITCH_INPUT_STATE);
  });

  it("holding・enabled が偽でも reset と cancel は処理する(後始末)", () => {
    const gauge = gaugeStateAt(1000);
    expect(run([{ type: "reset" }], HOLDING, gauge).state).toEqual(INITIAL_PITCH_INPUT_STATE);
    expect(run([{ type: "reset" }], DISABLED, gauge).state).toEqual(INITIAL_PITCH_INPUT_STATE);
    const aiming = run([down(1, 0, 0)]).state;
    expect(run([pointerCancel(1)], DISABLED, aiming).state.phase).toBe("idle");
  });
});

describe("純粋性・公開ビュー", () => {
  it("入力の state を書き換えない", () => {
    const state = gaugeStateAt(1000);
    const frozen = JSON.stringify(state);
    run([down(2, 0, 0, 1000 + GAUGE.ringMs), tick(5000), move(1, 1, 1), { type: "reset" }], CTX, state);
    expect(JSON.stringify(state)).toBe(frozen);
  });

  it("pitchInputViewOf: gaugeElapsedMs はゲージ中だけ非 null(負にはならない)", () => {
    expect(pitchInputViewOf(INITIAL_PITCH_INPUT_STATE, 500)).toEqual({ phase: "idle", aim: { x: 0, y: 0 }, gaugeElapsedMs: null, quality: null });
    const gauge = gaugeStateAt(1000);
    expect(pitchInputViewOf(gauge, 1300)).toMatchObject({ phase: "gauge", gaugeElapsedMs: 300, quality: null });
    expect(pitchInputViewOf(gauge, 900).gaugeElapsedMs).toBe(0);
    const thrown = reducePitchInput(gauge, down(2, 0, 0, 1000 + GAUGE.ringMs + LATENCY.touch), CTX)[0];
    expect(pitchInputViewOf(thrown, 2000)).toMatchObject({ phase: "throwing", gaugeElapsedMs: null, quality: "nice" });
  });
});
