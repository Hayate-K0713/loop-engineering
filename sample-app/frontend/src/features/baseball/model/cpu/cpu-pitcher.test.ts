import { describe, expect, it } from "vitest";
import type { RngState } from "../../types/common";
import type { Count } from "../../types/game";
import type { CpuPitchChoice, PitchKind } from "../../types/pitch";
import type { PitcherProfile } from "../../types/team";
import { isStrikeCell } from "../pitch/zone";
import { createRng, nextFloat } from "../rng/rng";
import { type ChooseCpuPitchInput, chooseCpuPitch } from "./cpu-pitcher";
import { getDifficulty } from "./difficulty";
import { getPitchPlan } from "./pitcher-weights";

const DRAWS = 10000;

const ALL_KINDS: readonly PitchKind[] = ["straight", "slider", "curve", "fork", "shoot"];

function pitcherWith(repertoire: readonly PitchKind[]): PitcherProfile {
  return { id: "p", name: "テスト投手", speedKmh: 145, control: 70, stamina: 70, repertoire };
}

function inputWith(overrides: Partial<ChooseCpuPitchInput> = {}): ChooseCpuPitchInput {
  return {
    count: { balls: 0, strikes: 0 },
    pitcher: pitcherWith(["straight", "slider", "curve"]),
    lastKind: null,
    difficulty: getDifficulty("normal"),
    ...overrides,
  };
}

/** 同じ入力で `times` 球選び、状態を引き回して結果の列を返す(`lastKind` は固定)。 */
function chooseMany(seed: number, times: number, input: ChooseCpuPitchInput): CpuPitchChoice[] {
  const commands: CpuPitchChoice[] = [];
  let rng: RngState = createRng(seed);
  for (let i = 0; i < times; i += 1) {
    const [command, next] = chooseCpuPitch(rng, input);
    commands.push(command);
    rng = next;
  }
  return commands;
}

function ratioOf(commands: readonly CpuPitchChoice[], predicate: (command: CpuPitchChoice) => boolean): number {
  return commands.filter(predicate).length / commands.length;
}

function ballRate(count: Count, difficultyName: "easy" | "normal" | "hard"): number {
  const commands = chooseMany(11, DRAWS, inputWith({ count, difficulty: getDifficulty(difficultyName) }));
  return ratioOf(commands, (command) => !isStrikeCell(command.cell));
}

describe("chooseCpuPitch", () => {
  it("持ち球に無い球種は選ばない", () => {
    const repertoire: readonly PitchKind[] = ["straight", "fork"];
    const commands = chooseMany(1, DRAWS, inputWith({ pitcher: pitcherWith(repertoire) }));
    expect(commands.every((command) => repertoire.includes(command.kind))).toBe(true);
    expect(new Set(commands.map((command) => command.kind))).toEqual(new Set(repertoire));
  });

  it("持ち球が straight のみなら常に straight", () => {
    const commands = chooseMany(2, 2000, inputWith({ pitcher: pitcherWith(["straight"]) }));
    expect(commands.every((command) => command.kind === "straight")).toBe(true);
  });

  it("全カウントで、セルは 5×5 グリッド内に収まる", () => {
    for (const balls of [0, 1, 2, 3]) {
      for (const strikes of [0, 1, 2]) {
        const commands = chooseMany(3, 500, inputWith({ count: { balls, strikes }, pitcher: pitcherWith(ALL_KINDS) }));
        expect(commands.every(({ cell }) => cell.col >= 0 && cell.col <= 4 && cell.row >= 0 && cell.row <= 4)).toBe(true);
      }
    }
  });

  it("3-0 はゾーン内のセルを 85% 以上選ぶ", () => {
    const commands = chooseMany(4, DRAWS, inputWith({ count: { balls: 3, strikes: 0 } }));
    expect(ratioOf(commands, (command) => isStrikeCell(command.cell))).toBeGreaterThanOrEqual(0.85);
  });

  it("0-0 のゾーン内率はプランの zoneRate と ±0.02 で一致する", () => {
    const commands = chooseMany(5, DRAWS, inputWith());
    const expected = getPitchPlan({ balls: 0, strikes: 0 }).zoneRate;
    expect(Math.abs(ratioOf(commands, (command) => isStrikeCell(command.cell)) - expected)).toBeLessThanOrEqual(0.02);
  });

  it("0-2/1-2 のボール球率は hard > easy で、難易度の twoStrikeOutsideRate と ±0.02 で一致する", () => {
    for (const count of [
      { balls: 0, strikes: 2 },
      { balls: 1, strikes: 2 },
    ]) {
      const easy = ballRate(count, "easy");
      const hard = ballRate(count, "hard");
      expect(hard).toBeGreaterThan(easy);
      expect(Math.abs(easy - getDifficulty("easy").twoStrikeOutsideRate)).toBeLessThanOrEqual(0.02);
      expect(Math.abs(hard - getDifficulty("hard").twoStrikeOutsideRate)).toBeLessThanOrEqual(0.02);
    }
  });

  it("2-2(2 ボール)は twoStrikeOutsideRate ではなくカウントのプランに従う", () => {
    const commands = chooseMany(6, DRAWS, inputWith({ count: { balls: 2, strikes: 2 }, difficulty: getDifficulty("hard") }));
    const expected = getPitchPlan({ balls: 2, strikes: 2 }).zoneRate;
    expect(Math.abs(ratioOf(commands, (command) => isStrikeCell(command.cell)) - expected)).toBeLessThanOrEqual(0.02);
  });

  it("ストレートの割合はプランの fastballRate と ±0.02 で一致する", () => {
    const commands = chooseMany(7, DRAWS, inputWith());
    const expected = getPitchPlan({ balls: 0, strikes: 0 }).fastballRate;
    expect(Math.abs(ratioOf(commands, (command) => command.kind === "straight") - expected)).toBeLessThanOrEqual(0.02);
  });

  it("直前と同じ球種の連投は repeatKindPenalty で減る", () => {
    const fresh = ratioOf(chooseMany(8, DRAWS, inputWith({ lastKind: null })), (command) => command.kind === "straight");
    const repeated = ratioOf(chooseMany(8, DRAWS, inputWith({ lastKind: "straight" })), (command) => command.kind === "straight");
    expect(repeated).toBeLessThan(fresh - 0.05);
    const breakingFresh = ratioOf(chooseMany(8, DRAWS, inputWith({ lastKind: null })), (command) => command.kind === "slider");
    const breakingRepeated = ratioOf(chooseMany(8, DRAWS, inputWith({ lastKind: "slider" })), (command) => command.kind === "slider");
    expect(breakingRepeated).toBeLessThan(breakingFresh);
  });

  it("ゾーン内では edgeBias が大きいカウントほど中央を選びにくい", () => {
    const centerRate = (count: Count): number => {
      const commands = chooseMany(9, DRAWS, inputWith({ count, difficulty: getDifficulty("hard") }));
      const inZone = commands.filter((command) => isStrikeCell(command.cell));
      return ratioOf(inZone, (command) => command.cell.col === 2 && command.cell.row === 2);
    };
    expect(centerRate({ balls: 3, strikes: 0 })).toBeGreaterThan(centerRate({ balls: 2, strikes: 2 }));
  });

  it("ゾーン外では外周の角より角以外のセルを多く選ぶ(1 セルあたり約 2 倍)", () => {
    const commands = chooseMany(10, DRAWS * 2, inputWith({ count: { balls: 0, strikes: 2 }, difficulty: getDifficulty("hard") })).filter(
      (command) => !isStrikeCell(command.cell),
    );
    const isCorner = (command: CpuPitchChoice): boolean =>
      (command.cell.col === 0 || command.cell.col === 4) && (command.cell.row === 0 || command.cell.row === 4);
    const perCorner = commands.filter(isCorner).length / 4;
    const perEdge = commands.filter((command) => !isCorner(command)).length / 12;
    expect(perEdge / perCorner).toBeGreaterThan(1.7);
    expect(perEdge / perCorner).toBeLessThan(2.3);
  });

  it("同一 rng・同一入力で同一出力、次の rng は入力と異なる", () => {
    const rng = createRng(42);
    const first = chooseCpuPitch(rng, inputWith());
    expect(chooseCpuPitch(rng, inputWith())).toEqual(first);
    expect(first[1]).not.toBe(rng);
  });

  it("乱数をちょうど 3 個消費する(ゾーン内外・球種・セル)", () => {
    const rng = createRng(77);
    const [, afterFirst] = nextFloat(rng);
    const [, afterSecond] = nextFloat(afterFirst);
    const [, afterThird] = nextFloat(afterSecond);
    const [, next] = chooseCpuPitch(rng, inputWith());
    expect(next).toBe(afterThird);
  });
});
