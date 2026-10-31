import { beforeAll, describe, expect, it } from "vitest";
import type { ZonePoint } from "../../types/common";
import type { PitchFlight } from "../../types/pitch";
import {
  type Condition,
  type HumanPlayer,
  LEVELS,
  type Level,
  type RingBiasScenario,
  V2_CONDITION,
  estimateLandingFromFlight,
  mulberry32,
  planPitch,
  randomTraits,
  sampleHumanPlayer,
  stratifiedTraits,
  v3Condition,
} from "./human-bot";
import { type PopulationMetrics, metricsOf, playHuman, quantileOf, runPopulation, summarizePopulation } from "./human-game";

// 人間代理ボット v2(打撃。タップ方式)の検証。設計 本体 §4-1・tests 分冊 E 群。
// 個人差のある仮想プレイヤー(レベルあたり 40 人 × 各 2000 球。結果は P10/P50/P90)が、補助なしの v2 設定で「打てない」を再現でき(E1)、
// v3 の既定(ロックオン・予告・リングあり)で「スマホで普通に打てる」範囲に収まる(E2〜E7・E10・E11)ことを、固定シードで確認する。
// 実際の人間の手触りを保証するものではない(T1・T2 の試遊ログで較正し、ゲート2の主観で確認する。[[game-feel-needs-playability-check]])。
// 母集団のサイズ: 打率の P10(E2 の下限 .13)は下位 10% の個人の寄せ集めで標本ぶれが大きいので、ふつうの初心者だけは 250 人 × 各 1200 球
// (P10 の標本の SD が約 .008)にし、他は 40 人 × 各 2000 球。`BOT_FULL=1` で人数・球数を 2 倍にする。標準で約 20 秒(1 ファイル 60 秒以内)。
// `BOT_SEED=<数>` でシードを変えて頑健性を確かめられる(帯が特定のシードの当たり外れに依存していないかの診断用)。

const FULL = process.env.BOT_FULL === "1";
const SCALE = FULL ? 2 : 1;
const SEED = Number(process.env.BOT_SEED ?? 20261031);
const POPULATION_TIMEOUT_MS = 180_000;

// ---------- 母集団の実行と表 ----------

type PopulationKey = { readonly level: Level; readonly condition: Condition; readonly ring?: RingBiasScenario };

/** 母集団のサイズ。ふつうの初心者(P10 の判定がある)だけ人数を増やす。 */
function sizeOf(key: PopulationKey): { readonly players: number; readonly pitches: number } {
  const wide = key.level === "beginner" && key.condition.name === v3Condition("normal").name && key.ring === undefined;
  return wide ? { players: 250 * SCALE, pitches: 1200 * SCALE } : { players: 40 * SCALE, pitches: 2000 * SCALE };
}

const cache = new Map<string, PopulationMetrics>();

function keyOf(key: PopulationKey): string {
  return `${key.level}|${key.condition.name}|${key.ring ?? "model"}`;
}

function populationOf(key: PopulationKey): PopulationMetrics {
  const cached = cache.get(keyOf(key));
  if (cached !== undefined) {
    return cached;
  }
  const { players, pitches } = sizeOf(key);
  const summary = summarizePopulation(
    runPopulation({ level: key.level, condition: key.condition, players, pitches, seed: SEED, ringBias: key.ring ?? "model" }),
  );
  cache.set(keyOf(key), summary);
  return summary;
}

const NORMAL = v3Condition("normal");
const HARD = v3Condition("hard");
const EASY = v3Condition("easy");

function fixed(value: number, digits = 3): string {
  return value.toFixed(digits);
}

function spread(values: { readonly p10: number; readonly p50: number; readonly p90: number }): string {
  return `${fixed(values.p10)}/${fixed(values.p50)}/${fixed(values.p90)}`;
}

function rowOf(label: string, summary: PopulationMetrics): string {
  return [
    `| ${label}`,
    spread(summary.average),
    spread(summary.contactRate),
    fixed(summary.strikeoutRate.p50),
    fixed(summary.walkRate.p50),
    fixed(summary.homeRunRate.p50),
    fixed(summary.strikeIntentRate.p50),
    fixed(summary.strikeSwingRate.p50),
    fixed(summary.ballSwingRate.p50),
    fixed(summary.noSwingRate.p50),
    fixed(summary.lateRate.p50),
    `${fixed(summary.pressMeanMs.p50, 0)}/${fixed(summary.pressSdMs.p50, 0)}`,
    `${fixed(summary.distanceMedianPx.p50, 0)} |`,
  ].join(" | ");
}

const TABLE_HEADER = [
  "| 母集団 | 打率 P10/P50/P90 | コンタクト率 P10/P50/P90 | 三振率 P50 | 四球率 P50 | 本塁打率 P50 | ストライクを振ろうとした率 | ストライクを振った率 | ボールを振ろうとした率 | 押したのに不発 | 到達後の押下 | 押下 dt 平均/SD(ms) | 距離 中央(px) |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
];

function labelOf(level: Level): string {
  switch (level) {
    case "beginner":
      return "初心者";
    case "intermediate":
      return "中級";
    case "advanced":
      return "上級";
  }
}

// ---------- 手作りのプレイヤーと球(1 球の計画の単体テスト用) ----------

const DURATION_MS = 1310;

function flightAt(landing: ZonePoint): PitchFlight {
  return { seq: 1, kind: "straight", aim: landing, landing, speedKmh: 145, durationMs: DURATION_MS, quality: "normal" };
}

/** ばらつきゼロ・偏りゼロ・必ず振る(ボールは振らない)プレイヤー。上書きしたい項目だけ渡す。 */
function steadyPlayer(overrides: Partial<HumanPlayer> = {}): HumanPlayer {
  return {
    level: "intermediate",
    reactMs: 200,
    ringBiasMs: 0,
    noRingBiasMs: 0,
    latencyMs: 70,
    timingSigmaMs: 0,
    fingerSigmaPx: 0,
    perceiveSigmaZone: 0,
    swingAtStrike: 1,
    chaseBall: 0,
    fittsB: 0,
    slowTapRate: 0,
    driftTapRate: 0,
    cancelRate: 0,
    ignoreRing: false,
    secondFingerRate: 1,
    ...overrides,
  };
}

const CENTER: ZonePoint = { x: 0, y: 0 };
const NO_BALLS_AND_STRIKES = { balls: 0, strikes: 0 };

function planOf(player: HumanPlayer, condition: Condition, landing: ZonePoint, start: ZonePoint = CENTER) {
  return planPitch({ player, condition, flight: flightAt(landing), count: NO_BALLS_AND_STRIKES, start }, mulberry32(7));
}

function distance(a: ZonePoint, b: ZonePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe("1 球の計画(planPitch)", () => {
  it("ゾーンの中の球は振ろうとし、ゾーンから十分に外れた球は見送る(見送りでは開始位置のまま)", () => {
    const strike = planOf(steadyPlayer(), NORMAL, CENTER);
    expect(strike.intent).toBe(true);
    const start = { x: 0.3, y: -0.2 };
    const ball = planOf(steadyPlayer(), NORMAL, { x: 2.2, y: 0 }, start);
    expect(ball.intent).toBe(false);
    expect(ball.swing).toBeNull();
    expect(ball.cursorAfter).toEqual(start);
    expect(ball.pressOffsetMs).toBeNull();
  });

  it("2 ストライクでは境界を広げて、ゾーンのすぐ外の球も振る", () => {
    const outside = { x: 1.3, y: 0 };
    const swings = (strikes: number): number =>
      Array.from({ length: 200 }, (_, seed) =>
        planPitch({ player: steadyPlayer(), condition: NORMAL, flight: flightAt(outside), count: { balls: 0, strikes }, start: CENTER }, mulberry32(seed + 1)),
      ).filter((plan) => plan.intent).length;
    expect(swings(2)).toBeGreaterThan(swings(0) + 40);
  });

  it("判定時刻は押下の時刻 − 遅延補正(偏り 0・遅延 70ms なら到達ちょうど)", () => {
    const plan = planOf(steadyPlayer(), NORMAL, CENTER);
    expect(plan.swing?.atMs).toBeCloseTo(DURATION_MS, 6);
    expect(plan.pressOffsetMs).toBeCloseTo(70, 6);
  });

  it("偏りの分だけ押下が遅れる。リング有りの人はリングの偏り、ignoreRing の人と v2 設定はリング無しの偏り", () => {
    const player = steadyPlayer({ ringBiasMs: 20, noRingBiasMs: 130 });
    const offsetOf = (candidate: HumanPlayer, condition: Condition): number => planOf(candidate, condition, CENTER).pressOffsetMs ?? Number.NaN;
    expect(offsetOf(player, NORMAL)).toBeCloseTo(70 + 20, 6);
    expect(offsetOf({ ...player, ignoreRing: true }, NORMAL)).toBeCloseTo(70 + 130, 6);
    expect(offsetOf(player, V2_CONDITION)).toBeCloseTo(70 + 130, 6);
  });

  it("到達の後(D + 250ms 超)の押下は届かず、見逃し扱い(late)になる", () => {
    const plan = planOf(steadyPlayer({ ringBiasMs: 400 }), NORMAL, CENTER);
    expect(plan.intent).toBe(true);
    expect(plan.swing).toBeNull();
    expect(plan.noSwing).toBe("late");
  });

  it("タップ方式の失敗の型: 長押し・移動は 1 本指のタップだけ、pointercancel は 2 本目の指でも起きる", () => {
    const onlyTap = (overrides: Partial<HumanPlayer>) => planOf(steadyPlayer(overrides), NORMAL, CENTER);
    expect(onlyTap({ slowTapRate: 1, secondFingerRate: 0 }).noSwing).toBe("slow");
    expect(onlyTap({ driftTapRate: 1, secondFingerRate: 0 }).noSwing).toBe("drift");
    expect(onlyTap({ slowTapRate: 1, driftTapRate: 1, secondFingerRate: 1 }).swing).not.toBeNull();
    expect(onlyTap({ cancelRate: 1, secondFingerRate: 1 }).noSwing).toBe("cancel");
    expect(onlyTap({ cancelRate: 1, secondFingerRate: 0 }).noSwing).toBe("cancel");
  });

  it("v2 設定はロックオンなし(有効カーソル = 素のカーソル、assistK = 0)、v3 はロックオンで着弾点へ寄る", () => {
    const landing = { x: 0.2, y: 0.1 };
    const start = { x: 1.0, y: 1.0 };
    const slowHand = steadyPlayer({ fittsB: 10_000 });
    const off = planOf(slowHand, V2_CONDITION, landing, start);
    expect(off.swing?.assistK).toBe(0);
    expect(off.swing?.cursor).toEqual(off.cursorAfter);
    const on = planOf(slowHand, NORMAL, landing, start);
    expect(on.swing?.assistK ?? 0).toBeGreaterThan(0.3);
    expect(distance(on.swing?.cursor ?? start, landing)).toBeLessThan(distance(on.cursorAfter, landing));
  });

  it("指の移動時間(Fitts): 遅い人は目標まで届かない", () => {
    const landing = { x: 0.9, y: -0.9 };
    const start = { x: -0.9, y: 0.9 };
    const quick = planOf(steadyPlayer({ fittsB: 0 }), NORMAL, landing, start);
    const slow = planOf(steadyPlayer({ fittsB: 5000 }), NORMAL, landing, start);
    expect(distance(quick.cursorAfter, landing)).toBeLessThan(0.01);
    expect(distance(slow.cursorAfter, landing)).toBeGreaterThan(1);
  });

  it("同じ乱数なら同じ計画(決定論)", () => {
    const player = steadyPlayer({ timingSigmaMs: 60, fingerSigmaPx: 8, perceiveSigmaZone: 0.1, slowTapRate: 0.3, secondFingerRate: 0.5 });
    const flight = flightAt({ x: 0.4, y: 0.3 });
    const input = { player, condition: NORMAL, flight, count: NO_BALLS_AND_STRIKES, start: CENTER };
    expect(planPitch(input, mulberry32(99))).toEqual(planPitch(input, mulberry32(99)));
  });
});

describe("予告なし(v2 設定)の着弾の見積もり", () => {
  const landing = { x: 0.7, y: 0.7 };

  it("観測が遅いほど見積もりが着弾に近い(奥行きの誤差なしでも、終盤の曲がり・落ちは見積もれない)", () => {
    const flight = flightAt(landing);
    const errorAt = (observedMs: number): number => distance(estimateLandingFromFlight(flight, observedMs, 1), landing);
    expect(errorAt(1100)).toBeLessThan(errorAt(700));
    expect(errorAt(700)).toBeLessThan(errorAt(400));
  });

  it("奥行きの取り違え offsetGain は、ゾーン中心からのずれを倍率で変える", () => {
    const flight = flightAt(landing);
    const exact = estimateLandingFromFlight(flight, 900, 1);
    const stretched = estimateLandingFromFlight(flight, 900, 1.2);
    expect(stretched.x).toBeCloseTo(exact.x * 1.2, 9);
    expect(stretched.y).toBeCloseTo(exact.y * 1.2, 9);
  });
});

// ---------- 個人差の母集団 ----------

function meanOf(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sdOf(values: readonly number[]): number {
  const mean = meanOf(values);
  return Math.sqrt(meanOf(values.map((value) => (value - mean) * (value - mean))));
}

/** 本体 §4-1 の表の値(ignoreRing の割合と反応時間の平均)。 */
function tableValuesOf(level: Level): { readonly ignoreRing: number; readonly reactMs: number } {
  switch (level) {
    case "beginner":
      return { ignoreRing: 0.25, reactMs: 280 };
    case "intermediate":
      return { ignoreRing: 0.15, reactMs: 230 };
    case "advanced":
      return { ignoreRing: 0.05, reactMs: 190 };
  }
}

describe("個人差の母集団(層化抽出)", () => {
  const SIZE = 400;
  const traits = stratifiedTraits(SIZE, mulberry32(5));

  it("標準正規の項目は平均 0・SD 1、一様の項目は平均 0.5 に近い(人数が少なくても分位がぶれない)", () => {
    const z = traits.map((trait) => trait.react);
    expect(Math.abs(meanOf(z))).toBeLessThan(0.02);
    expect(Math.abs(sdOf(z) - 1)).toBeLessThan(0.03);
    expect(Math.abs(meanOf(traits.map((trait) => trait.slow)) - 0.5)).toBeLessThan(0.01);
  });

  it("項目どうしは並べ替えられていて相関が小さい", () => {
    const a = traits.map((trait) => trait.react);
    const b = traits.map((trait) => trait.timing);
    const meanA = meanOf(a);
    const meanB = meanOf(b);
    const covariance = meanOf(a.map((value, index) => (value - meanA) * ((b.at(index) ?? 0) - meanB)));
    expect(Math.abs(covariance / (sdOf(a) * sdOf(b)))).toBeLessThan(0.15);
  });

  it("randomTraits は乱数列で決まる(同じシードで同一)", () => {
    expect(randomTraits(mulberry32(3))).toEqual(randomTraits(mulberry32(3)));
  });

  it.each(LEVELS)("%s: ignoreRing の人の割合は表の値、反応時間などの平均は表の値に近い", (level) => {
    const players = traits.map((trait) => sampleHumanPlayer(level, trait));
    const { ignoreRing, reactMs } = tableValuesOf(level);
    expect(Math.abs(players.filter((player) => player.ignoreRing).length / SIZE - ignoreRing)).toBeLessThan(0.01);
    expect(Math.abs(meanOf(players.map((player) => player.reactMs)) - reactMs)).toBeLessThan(2);
  });

  it("「リング無し」の偏りは調査の値(初心者・中級 N(130, 50)、上級 N(100, 40))で、悲観シナリオでも動かない", () => {
    const noRing = (level: Level, scenario: RingBiasScenario) => traits.map((trait) => sampleHumanPlayer(level, trait, scenario).noRingBiasMs);
    expect(Math.abs(meanOf(noRing("beginner", "model")) - 130)).toBeLessThan(2);
    expect(Math.abs(sdOf(noRing("beginner", "model")) - 50)).toBeLessThan(3);
    expect(Math.abs(meanOf(noRing("intermediate", "model")) - 130)).toBeLessThan(2);
    expect(Math.abs(meanOf(noRing("advanced", "model")) - 100)).toBeLessThan(2);
    expect(noRing("beginner", "pessimistic")).toEqual(noRing("beginner", "model"));
  });

  it("リング有りの偏りは初心者 N(+40, 45)・中級 N(+15, 35)・上級 N(0, 25)、悲観シナリオは中間(初心者 +85)", () => {
    const ring = (level: Level, scenario: RingBiasScenario) => meanOf(traits.map((trait) => sampleHumanPlayer(level, trait, scenario).ringBiasMs));
    expect(Math.abs(ring("beginner", "model") - 40)).toBeLessThan(2);
    expect(Math.abs(ring("intermediate", "model") - 15)).toBeLessThan(2);
    expect(Math.abs(ring("advanced", "model"))).toBeLessThan(2);
    expect(Math.abs(ring("beginner", "pessimistic") - 85)).toBeLessThan(2);
    expect(Math.abs(ring("intermediate", "pessimistic") - 72.5)).toBeLessThan(2);
    expect(Math.abs(ring("advanced", "pessimistic") - 50)).toBeLessThan(2);
  });

  it("レベルが上がるほど、時刻のばらつき・指のぶれ・知覚誤差・失敗の型が小さい", () => {
    const average = (level: Level, pick: (player: HumanPlayer) => number): number => meanOf(traits.map((trait) => pick(sampleHumanPlayer(level, trait))));
    const picks: readonly ((player: HumanPlayer) => number)[] = [
      (player) => player.timingSigmaMs,
      (player) => player.fingerSigmaPx,
      (player) => player.perceiveSigmaZone,
      (player) => player.slowTapRate + player.driftTapRate + player.cancelRate,
    ];
    for (const pick of picks) {
      expect(average("beginner", pick)).toBeGreaterThan(average("intermediate", pick));
      expect(average("intermediate", pick)).toBeGreaterThan(average("advanced", pick));
    }
  });
});

// ---------- PA シミュレータ ----------

describe("PA シミュレータ(reduce を直接駆動)", () => {
  const player = sampleHumanPlayer("intermediate", randomTraits(mulberry32(11)));

  it("球・打席・押下の集計が矛盾しない", () => {
    const tally = playHuman(player, NORMAL, 3000, 5);
    expect(tally.pitches).toBe(3000);
    expect(tally.strikePitches + tally.ballPitches).toBe(tally.pitches);
    expect(tally.plateAppearances).toBeGreaterThan(500);
    expect(tally.hits).toBeLessThanOrEqual(tally.plateAppearances - tally.walks);
    expect(tally.swings).toBe(tally.presses - tally.late - tally.slow - tally.drift - tally.cancel);
    expect(tally.contacts).toBeLessThanOrEqual(tally.swings);
    expect(tally.strikeIntents + tally.ballIntents).toBe(tally.presses);
    expect(tally.distancesPx).toHaveLength(tally.swings);
  });

  it("同じシードなら同一、違うシードなら別の結果(攻守交代でも止まらずに続く)", () => {
    expect(playHuman(player, NORMAL, 800, 5)).toEqual(playHuman(player, NORMAL, 800, 5));
    expect(playHuman(player, NORMAL, 800, 5)).not.toEqual(playHuman(player, NORMAL, 800, 6));
  });

  it("0 球では全指標が 0(分母 0 でも NaN にならない)", () => {
    const metrics = metricsOf(playHuman(player, NORMAL, 0, 1));
    expect(Object.values(metrics).every((value) => value === 0)).toBe(true);
  });

  it("四球・三振・安打が出て、打率の定義は 安打 ÷ (打席 − 四球)", () => {
    const tally = playHuman(player, NORMAL, 4000, 8);
    const metrics = metricsOf(tally);
    expect(tally.walks).toBeGreaterThan(0);
    expect(tally.hits).toBeGreaterThan(0);
    expect(metrics.average).toBeCloseTo(tally.hits / (tally.plateAppearances - tally.walks), 12);
  });

  it("分位は線形補間(P10・P50・P90)", () => {
    expect(quantileOf([5, 1, 3, 2, 4], 0.5)).toBeCloseTo(3, 12);
    expect(quantileOf([1, 2, 3, 4, 5], 0.1)).toBeCloseTo(1.4, 12);
    expect(quantileOf([], 0.5)).toBeCloseTo(0, 12);
  });
});

// ---------- 受け入れ帯(tests 分冊 E 群) ----------

describe("E 群: 受け入れ帯", () => {
  const rows: string[] = [];

  beforeAll(() => {
    const plan: readonly (readonly [string, PopulationKey])[] = [
      ...LEVELS.map((level) => [`v2 設定(補助なし) ${labelOf(level)}`, { level, condition: V2_CONDITION }] as const),
      ...LEVELS.map((level) => [`v3 ふつう ${labelOf(level)}`, { level, condition: NORMAL }] as const),
      ...LEVELS.map((level) => [`v3 むずかしい ${labelOf(level)}`, { level, condition: HARD }] as const),
      ...LEVELS.map((level) => [`v3 かんたん ${labelOf(level)}`, { level, condition: EASY }] as const),
      ...LEVELS.map((level) => [`悲観(リング有りの偏りを中間値) ふつう ${labelOf(level)}`, { level, condition: NORMAL, ring: "pessimistic" }] as const),
    ];
    for (const [label, key] of plan) {
      rows.push(rowOf(label, populationOf(key)));
    }
    console.info(
      [`人間代理ボット v2(40 人 × 2000 球、ふつうの初心者だけ 250 人 × 1200 球。倍率 ${SCALE}、シード ${SEED})`, ...TABLE_HEADER, ...rows].join("\n"),
    );
  }, POPULATION_TIMEOUT_MS);

  it("E1 検出力: v2 設定(リング無しの偏りは調査の値で固定)で「打てない」を再現する(初心者の打率 P50 ≤ .17 かつ コンタクト率 P50 ≤ 50%、中級の打率 P50 ≤ .22)", () => {
    const beginner = populationOf({ level: "beginner", condition: V2_CONDITION });
    const intermediate = populationOf({ level: "intermediate", condition: V2_CONDITION });
    expect(beginner.average.p50).toBeLessThanOrEqual(0.17);
    expect(beginner.contactRate.p50).toBeLessThanOrEqual(0.5);
    expect(intermediate.average.p50).toBeLessThanOrEqual(0.22);
  });

  it("E1 の裏付け: v2 設定では到達の後の押下(見逃し扱い)が多く、v3 では補助で打率が大きく上がる", () => {
    const v2 = populationOf({ level: "beginner", condition: V2_CONDITION });
    const v3 = populationOf({ level: "beginner", condition: NORMAL });
    expect(v2.lateRate.p50).toBeGreaterThan(0.2);
    expect(v3.lateRate.p50).toBeLessThan(v2.lateRate.p50);
    expect(v3.average.p50).toBeGreaterThan(v2.average.p50 + 0.07);
  });

  it("E2 ふつうの打率 P50: 初心者 .20〜.30、中級 .26〜.34、上級 .32〜.45。どのレベルも P10 ≥ .13、P90 ≤ .52", () => {
    const bands: readonly (readonly [Level, number, number])[] = [
      ["beginner", 0.2, 0.3],
      ["intermediate", 0.26, 0.34],
      ["advanced", 0.32, 0.45],
    ];
    for (const [level, min, max] of bands) {
      const average = populationOf({ level, condition: NORMAL }).average;
      expect(average.p50, `${level} P50`).toBeGreaterThanOrEqual(min);
      expect(average.p50, `${level} P50`).toBeLessThanOrEqual(max);
      expect(average.p10, `${level} P10`).toBeGreaterThanOrEqual(0.13);
      expect(average.p90, `${level} P90`).toBeLessThanOrEqual(0.52);
    }
  });

  it("E3 ふつうのコンタクト率 P50 / 三振率 P50: 初心者 ≥ 55% / ≤ 35%、中級 ≥ 70% / ≤ 25%、上級 ≥ 82% / ≤ 18%", () => {
    const bands: readonly (readonly [Level, number, number])[] = [
      ["beginner", 0.55, 0.35],
      ["intermediate", 0.7, 0.25],
      ["advanced", 0.82, 0.18],
    ];
    for (const [level, contact, strikeout] of bands) {
      const summary = populationOf({ level, condition: NORMAL });
      expect(summary.contactRate.p50, `${level} コンタクト率`).toBeGreaterThanOrEqual(contact);
      expect(summary.strikeoutRate.p50, `${level} 三振率`).toBeLessThanOrEqual(strikeout);
    }
  });

  it("E4 技量の勾配: 上級 − 中級 ≥ .04、中級 − 初心者 ≥ .03(ふつうの打率 P50)", () => {
    const average = (level: Level): number => populationOf({ level, condition: NORMAL }).average.p50;
    expect(average("advanced") - average("intermediate")).toBeGreaterThanOrEqual(0.04);
    expect(average("intermediate") - average("beginner")).toBeGreaterThanOrEqual(0.03);
  });

  it("E5 むずかしいの中級の打率 P50 は .20〜.28 で、ふつうより .04 以上低い", () => {
    const hard = populationOf({ level: "intermediate", condition: HARD }).average.p50;
    const normal = populationOf({ level: "intermediate", condition: NORMAL }).average.p50;
    expect(hard).toBeGreaterThanOrEqual(0.2);
    expect(hard).toBeLessThanOrEqual(0.28);
    expect(normal - hard).toBeGreaterThanOrEqual(0.04);
  });

  it("E6 かんたんの初心者の打率 P50 は、ふつうの初心者 + .02 以上", () => {
    const easy = populationOf({ level: "beginner", condition: EASY }).average.p50;
    const normal = populationOf({ level: "beginner", condition: NORMAL }).average.p50;
    expect(easy - normal).toBeGreaterThanOrEqual(0.02);
  });

  it("E7 ボール球を振ろうとした率(中級) ≤ 30%、ストライクを振ろうとした率 ≥ 70%(全レベル)、実際にスイングになった率は中級・上級で ≥ 70%", () => {
    expect(populationOf({ level: "intermediate", condition: NORMAL }).ballSwingRate.p50).toBeLessThanOrEqual(0.3);
    for (const level of LEVELS) {
      expect(populationOf({ level, condition: NORMAL }).strikeIntentRate.p50, `${level} 振ろうとした率`).toBeGreaterThanOrEqual(0.7);
    }
    expect(populationOf({ level: "intermediate", condition: NORMAL }).strikeSwingRate.p50).toBeGreaterThanOrEqual(0.7);
    expect(populationOf({ level: "advanced", condition: NORMAL }).strikeSwingRate.p50).toBeGreaterThanOrEqual(0.7);
  });

  it("E10 悲観シナリオ(リング有りの偏りを中間値 = 初心者 +85): 初心者の打率 P50 ≥ .15・コンタクト率 P50 ≥ 45%", () => {
    const pessimistic = populationOf({ level: "beginner", condition: NORMAL, ring: "pessimistic" });
    expect(pessimistic.average.p50).toBeGreaterThanOrEqual(0.15);
    expect(pessimistic.contactRate.p50).toBeGreaterThanOrEqual(0.45);
  });

  it("E10 の整合: 悲観シナリオは楽観の設定より打てない(打率・コンタクト率が低い)が、v2 設定よりは打てる", () => {
    const model = populationOf({ level: "beginner", condition: NORMAL });
    const pessimistic = populationOf({ level: "beginner", condition: NORMAL, ring: "pessimistic" });
    const v2 = populationOf({ level: "beginner", condition: V2_CONDITION });
    expect(pessimistic.contactRate.p50).toBeLessThan(model.contactRate.p50);
    expect(pessimistic.average.p50).toBeLessThan(model.average.p50);
    expect(pessimistic.average.p50).toBeGreaterThan(v2.average.p50);
  });

  it("E11 失敗の型(タップ方式): 押したのにスイングにならなかった率 P50 は 初心者 ≤ 15%・中級 ≤ 8%(長押し + 移動 + pointercancel)。上級ほど少ない", () => {
    const rate = (level: Level): number => populationOf({ level, condition: NORMAL }).noSwingRate.p50;
    expect(rate("beginner")).toBeLessThanOrEqual(0.15);
    expect(rate("intermediate")).toBeLessThanOrEqual(0.08);
    expect(rate("beginner")).toBeGreaterThan(rate("intermediate"));
    expect(rate("intermediate")).toBeGreaterThan(rate("advanced"));
    expect(rate("advanced")).toBeGreaterThan(0);
  });

  it("T2 の目安(ログの客観値)と同じ定義の指標が範囲に収まる: 押下の dt の SD ≤ 100ms、素のカーソルと着弾点の距離の中央値 ≤ 60px(初心者・ふつう)", () => {
    const beginner = populationOf({ level: "beginner", condition: NORMAL });
    expect(beginner.pressSdMs.p50).toBeLessThanOrEqual(100);
    expect(beginner.distanceMedianPx.p50).toBeLessThanOrEqual(60);
  });
});
