import { beforeAll, describe, expect, it } from "vitest";
import { BATTING_PARAMS } from "../batting/params";
import { BOTS, type BotSpec, type BotTally, isIgnoredEvent, judgeTimeOf, rateOf, runBot, runCpuNormal } from "./bot-sim";

// 人間を模したボット(反応時間・入力の遅れ・時刻と位置のばらつき・端末の画面サイズ)で、判定と結果表の数値が
// 「スマホで普通に打てる」範囲に収まっているかを固定シードで確認する。実際の人間の手触りを保証するものではない(ゲート2の試遊で確認する)。
// 帯は設計書 §10 の表。固定シード・各ボット 20000 球(ストライクを振った球。設計の 4000 球より増やして、帯の端での標本ばらつき ±0.3 ポイントに抑える)。
// 結果の表は標準出力に出す。

const TRIALS = 20000;
const SEED = 20261013;

/**
 * 設計表の「無効 0%」の許容。ばらつきがガウス分布のボットは、確率はごく小さいが 0 ではない(B: 入力が締切より 3σ 以上遅れる ≈ 0.1%)ため、
 * 「0%(≤ 0.5%)」と読む(設計表の B の欄の表記に合わせる)。A・E は遅れの平均が小さく、実測で 0。
 */
const NEGLIGIBLE = 0.005;

type Band = { readonly min: number; readonly max: number };

function inBand(value: number, band: Band): boolean {
  return value >= band.min && value <= band.max;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function rowOf(name: string, tally: BotTally): string {
  const cells = (["ignored", "miss", "foul", "inPlay", "hit", "homeRun"] as const).map((key) => pct(rateOf(tally, key)));
  return `| ${name} | ${cells.join(" | ")} |`;
}

describe("人間代理ボットの試算(§10 の帯)", () => {
  const tallies = new Map<string, BotTally>();
  const cpu = { tally: null as BotTally | null };

  function tallyOf(spec: BotSpec): BotTally {
    const tally = tallies.get(spec.name);
    if (tally === undefined) {
      throw new Error(`no tally for ${spec.name}`);
    }
    return tally;
  }

  beforeAll(() => {
    for (const spec of Object.values(BOTS)) {
      tallies.set(spec.name, runBot(spec, TRIALS, SEED));
    }
    cpu.tally = runCpuNormal(TRIALS, SEED + 1);
    const lines = [
      "| ボット | 無効 | 空振り | ファウル | インプレー | 安打 | 本塁打 |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      ...Object.values(BOTS).map((spec) => rowOf(spec.name, tallyOf(spec))),
      rowOf("CPU ふつう", cpu.tally),
    ];
    console.info(lines.join("\n"));
  }, 60_000);

  function cpuTally(): BotTally {
    if (cpu.tally === null) {
      throw new Error("cpu tally not ready");
    }
    return cpu.tally;
  }

  it("A 上手い人: 無効 0%、空振り ≤ 3%、ファウル ≤ 20%、安打 38〜55%", () => {
    const tally = tallyOf(BOTS.A);
    expect(rateOf(tally, "ignored")).toBe(0);
    expect(rateOf(tally, "miss")).toBeLessThanOrEqual(0.03);
    expect(rateOf(tally, "foul")).toBeLessThanOrEqual(0.2);
    expect(inBand(rateOf(tally, "hit"), { min: 0.38, max: 0.55 })).toBe(true);
  });

  it("B スマホ標準(390×844): 無効 ≤ 0.5%、空振り ≤ 8%、ファウル 6〜20%、安打 30〜35%", () => {
    const tally = tallyOf(BOTS.B);
    expect(rateOf(tally, "ignored")).toBeLessThanOrEqual(NEGLIGIBLE);
    expect(rateOf(tally, "miss")).toBeLessThanOrEqual(0.08);
    expect(inBand(rateOf(tally, "foul"), { min: 0.06, max: 0.2 })).toBe(true);
    expect(inBand(rateOf(tally, "hit"), { min: 0.3, max: 0.35 })).toBe(true);
  });

  it("B@664(390×664): 無効 0%、空振り ≤ 10%、ファウル 6〜22%、安打 26〜35%", () => {
    const tally = tallyOf(BOTS.B664);
    expect(rateOf(tally, "ignored")).toBeLessThanOrEqual(NEGLIGIBLE);
    expect(rateOf(tally, "miss")).toBeLessThanOrEqual(0.1);
    expect(inBand(rateOf(tally, "foul"), { min: 0.06, max: 0.22 })).toBe(true);
    expect(inBand(rateOf(tally, "hit"), { min: 0.26, max: 0.35 })).toBe(true);
  });

  it("F 片手: 無効 0%、空振り ≤ 15%、ファウル ≤ 25%、安打 22〜33% かつ B との差 ≤ 8 ポイント", () => {
    const tally = tallyOf(BOTS.F);
    expect(rateOf(tally, "ignored")).toBeLessThanOrEqual(NEGLIGIBLE);
    expect(rateOf(tally, "miss")).toBeLessThanOrEqual(0.15);
    expect(rateOf(tally, "foul")).toBeLessThanOrEqual(0.25);
    expect(inBand(rateOf(tally, "hit"), { min: 0.22, max: 0.33 })).toBe(true);
    expect(Math.abs(rateOf(tally, "hit") - rateOf(tallyOf(BOTS.B), "hit"))).toBeLessThanOrEqual(0.08);
  });

  it("C スマホ初心者: 無効 ≤ 2%、空振り ≤ 15%、ファウル ≤ 25%、安打 20〜30%", () => {
    const tally = tallyOf(BOTS.C);
    expect(rateOf(tally, "ignored")).toBeLessThanOrEqual(0.02);
    expect(rateOf(tally, "miss")).toBeLessThanOrEqual(0.15);
    expect(rateOf(tally, "foul")).toBeLessThanOrEqual(0.25);
    expect(inBand(rateOf(tally, "hit"), { min: 0.2, max: 0.3 })).toBe(true);
  });

  it("D B + 到達を遅く感じる(+60ms): 無効 ≤ 2%、空振り ≤ 15%、ファウル ≤ 30%、安打 18〜32%", () => {
    const tally = tallyOf(BOTS.D);
    expect(rateOf(tally, "ignored")).toBeLessThanOrEqual(0.02);
    expect(rateOf(tally, "miss")).toBeLessThanOrEqual(0.15);
    expect(rateOf(tally, "foul")).toBeLessThanOrEqual(0.3);
    expect(inBand(rateOf(tally, "hit"), { min: 0.18, max: 0.32 })).toBe(true);
  });

  it("E PC マウス: 無効 0%、空振り ≤ 5%、ファウル ≤ 15%、安打 33〜48%", () => {
    const tally = tallyOf(BOTS.E);
    expect(rateOf(tally, "ignored")).toBe(0);
    expect(rateOf(tally, "miss")).toBeLessThanOrEqual(0.05);
    expect(rateOf(tally, "foul")).toBeLessThanOrEqual(0.15);
    expect(inBand(rateOf(tally, "hit"), { min: 0.33, max: 0.48 })).toBe(true);
  });

  it("B-強振: 無効 0%、空振り ≤ 20%、ファウル ≤ 25%、安打 25〜45%、本塁打 ≤ 8%、安打率はミートの B + 8 ポイント以下", () => {
    const tally = tallyOf(BOTS.BPower);
    expect(rateOf(tally, "ignored")).toBeLessThanOrEqual(NEGLIGIBLE);
    expect(rateOf(tally, "miss")).toBeLessThanOrEqual(0.2);
    expect(rateOf(tally, "foul")).toBeLessThanOrEqual(0.25);
    expect(inBand(rateOf(tally, "hit"), { min: 0.25, max: 0.45 })).toBe(true);
    expect(rateOf(tally, "homeRun")).toBeLessThanOrEqual(0.08);
    expect(rateOf(tally, "hit")).toBeLessThanOrEqual(rateOf(tallyOf(BOTS.B), "hit") + 0.08);
  });

  it("強振はミートより当たりにくい(空振りとファウルの合計が B より多い)", () => {
    const power = tallyOf(BOTS.BPower);
    const meet = tallyOf(BOTS.B);
    expect(rateOf(power, "miss") + rateOf(power, "foul")).toBeGreaterThan(rateOf(meet, "miss") + rateOf(meet, "foul"));
  });

  it("CPU ふつう(ストライクを振った球あたり): 安打 24〜30%", () => {
    expect(inBand(rateOf(cpuTally(), "hit"), { min: 0.24, max: 0.3 })).toBe(true);
  });

  it("技量の勾配: 安打率が A > B > C で、それぞれ 3 ポイント以上離れる", () => {
    const hitA = rateOf(tallyOf(BOTS.A), "hit");
    const hitB = rateOf(tallyOf(BOTS.B), "hit");
    const hitC = rateOf(tallyOf(BOTS.C), "hit");
    expect(hitA - hitB).toBeGreaterThanOrEqual(0.03);
    expect(hitB - hitC).toBeGreaterThanOrEqual(0.03);
  });
});

describe("無効(見逃し扱い)の判定は入力イベントの時刻で行う", () => {
  const durationMs = 400;
  const cutoff = BATTING_PARAMS.lateCutoffMs;

  it("イベントが D + lateCutoffMs ちょうどまでは有効、1ms 超えると無効(境界)", () => {
    expect(isIgnoredEvent(durationMs + cutoff, durationMs)).toBe(false);
    expect(isIgnoredEvent(durationMs + cutoff + 1, durationMs)).toBe(true);
  });

  it("遅延補正後の atMs では判定しない: 補正後に D + lateCutoffMs 以内に戻る遅いタップも無効", () => {
    const eventMs = durationMs + cutoff + 30;
    expect(judgeTimeOf(eventMs, "touch")).toBeLessThan(durationMs + cutoff);
    expect(isIgnoredEvent(eventMs, durationMs)).toBe(true);
  });

  it("判定時刻はイベント時刻から入力種別の遅延補正を引いたもの(タッチ 70ms・マウス 20ms)", () => {
    expect(judgeTimeOf(500, "touch")).toBe(500 - BATTING_PARAMS.inputLatencyMs.touch);
    expect(judgeTimeOf(500, "mouse")).toBe(500 - BATTING_PARAMS.inputLatencyMs.mouse);
  });
});
