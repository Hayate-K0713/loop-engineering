import { describe, expect, it } from "vitest";
import { CPU_TEAM, PLAYER_TEAM } from "../model/data/teams";
import type { CharacterLookData, CharacterSlot } from "../types/scene";
import type { PlayerLook } from "../types/team";
import {
  DEFAULT_LOOK_RASTER,
  canGenerateLooks,
  createLookController,
  faceKeyOf,
  isOffenseSlot,
  lookKeyOf,
  prefetchLooks,
  uniformColorsOf,
  wantedLooks,
  type LookRaster,
  type LookRequest,
} from "./useCharacterLooks";

type Counters = { faces: number; plains: number; numbers: number; fabrics: number };

/** 重い実ラスタの代わりに、呼ばれた回数を数える小さなラスタ。 */
function countingRaster(): { readonly raster: LookRaster; readonly counters: Counters } {
  const counters: Counters = { faces: 0, plains: 0, numbers: 0, fabrics: 0 };
  const raster: LookRaster = {
    face: () => {
      counters.faces += 1;
      return { width: 4, height: 2, cell: 1, rgba: new Uint8Array(32) };
    },
    plain: () => {
      counters.plains += 1;
      return { width: 4, height: 2, cell: 1, rgba: new Uint8Array(32) };
    },
    number: () => {
      counters.numbers += 1;
      return { width: 2, height: 2, rgba: new Uint8Array(16) };
    },
    pinstripe: () => {
      counters.fabrics += 1;
      return { width: 2, height: 2, rgba: new Uint8Array(16) };
    },
  };
  return { raster, counters };
}

type Applied = { slot: CharacterSlot; data: CharacterLookData };

function collector(): { readonly sink: (slot: CharacterSlot, data: CharacterLookData) => void; readonly calls: Applied[] } {
  const calls: Applied[] = [];
  return { sink: (slot, data) => calls.push({ slot, data }), calls };
}

const WANTED = wantedLooks(PLAYER_TEAM, CPU_TEAM, 0);
const PREFETCH = prefetchLooks(PLAYER_TEAM, CPU_TEAM, 0);

/** 顔のキーが重ならない `PlayerLook` の数(= 顔アトラスを作る回数の下限)。 */
function distinctFaces(looks: readonly PlayerLook[]): number {
  return new Set(looks.map(faceKeyOf)).size;
}

describe("canGenerateLooks", () => {
  it("idle だけ真で、windup・flight・play(飛行中・演出中)は偽", () => {
    expect(canGenerateLooks("idle")).toBe(true);
    expect(canGenerateLooks("windup")).toBe(false);
    expect(canGenerateLooks("flight")).toBe(false);
    expect(canGenerateLooks("play")).toBe(false);
  });
});

describe("wantedLooks / prefetchLooks", () => {
  it("14 枠すべてを、打者・投手・捕手の順に並べる", () => {
    expect(WANTED).toHaveLength(14);
    expect(WANTED.slice(0, 3).map((request) => request.slot)).toEqual(["batter", "pitcher", "catcher"]);
    expect(new Set(WANTED.map((request) => request.slot)).size).toBe(14);
  });

  it("打者・走者は攻撃側のチーム、それ以外は守備側のチームの色を使う", () => {
    for (const request of WANTED) {
      expect(request.team.id).toBe(isOffenseSlot(request.slot) ? PLAYER_TEAM.id : CPU_TEAM.id);
    }
  });

  it("先読みは次の打者から始まり、両チームの投手・打線を含む", () => {
    const nextBatter = PLAYER_TEAM.batters.at(1);
    expect(PREFETCH.at(0)).toBe(nextBatter?.look);
    expect(PREFETCH).toContain(CPU_TEAM.pitcher.look);
    expect(PREFETCH).toContain(PLAYER_TEAM.pitcher.look);
  });

  it("ユニフォームの色はチーム色から決まり、ストッキング・帽子・ヘルメットはチーム色", () => {
    const colors = uniformColorsOf(CPU_TEAM);
    expect(colors.base).toBe(CPU_TEAM.uniformColor);
    expect(colors.socks).toBe(CPU_TEAM.uniformColor);
    expect(colors.cap).toBe(CPU_TEAM.uniformColor);
    expect(colors.helmet).toBe(CPU_TEAM.uniformColor);
  });
});

describe("createLookController: 1 フレーム 1 体", () => {
  it("1 回の step で作る顔アトラスは 1 体まで", () => {
    const { raster, counters } = countingRaster();
    const controller = createLookController(raster);
    const { sink } = collector();
    const result = controller.step(WANTED, PREFETCH, sink);
    expect(result.generatedFaces).toBe(1);
    expect(counters.faces).toBe(1);
    expect(result.pending).toBe(true);
  });

  it("最初の step は最優先の打者に本物、顔のまだの体には無地の仮の顔を貼る", () => {
    const { raster } = countingRaster();
    const controller = createLookController(raster);
    const { sink, calls } = collector();
    controller.step(WANTED, PREFETCH, sink);
    const batterCall = calls.find((call) => call.slot === "batter");
    const pitcherCall = calls.find((call) => call.slot === "pitcher");
    const batterRequest = WANTED.find((request) => request.slot === "batter");
    expect(batterCall?.data.faceAtlas.cell).toBe(1);
    expect(batterRequest).toBeDefined();
    expect(calls).toHaveLength(14);
    // 仮の顔は肌色ごとに 1 度だけ作り、同じ肌の体で共有する。
    const plainCalls = calls.filter((call) => call.slot !== "batter" && call.data.faceAtlas === pitcherCall?.data.faceAtlas);
    expect(plainCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("step を重ねると本物に置き換わり、全部そろうと先読みを経て pending が偽になる", () => {
    const { raster } = countingRaster();
    const controller = createLookController(raster);
    const { sink } = collector();
    const steps = Array.from({ length: 60 }, () => controller.step(WANTED, PREFETCH, sink));
    const finished = steps.findIndex((step) => !step.pending);
    expect(finished).toBeGreaterThan(0);
    expect(steps.every((step) => step.generatedFaces <= 1)).toBe(true);
  });
});

describe("createLookController: 同じ look を二度生成しない", () => {
  it("全部そろうまでの顔アトラスの生成数は、顔のキーの種類数と一致する", () => {
    const { raster, counters } = countingRaster();
    const controller = createLookController(raster);
    const { sink } = collector();
    for (let frame = 0; frame < 60; frame += 1) {
      controller.step(WANTED, PREFETCH, sink);
    }
    const looks = [...WANTED.map((request) => request.look), ...PREFETCH];
    expect(counters.faces).toBe(distinctFaces(looks));
    expect(controller.generatedFaceCount()).toBe(counters.faces);
  });

  it("そろった後に step を続けても、生成も setLook もしない", () => {
    const { raster, counters } = countingRaster();
    const controller = createLookController(raster);
    const { sink, calls } = collector();
    for (let frame = 0; frame < 60; frame += 1) {
      controller.step(WANTED, PREFETCH, sink);
    }
    const generatedBefore = counters.faces;
    const callsBefore = calls.length;
    const result = controller.step(WANTED, PREFETCH, sink);
    expect(result).toEqual({ generatedFaces: 0, appliedSlots: 0, pending: false });
    expect(counters.faces).toBe(generatedBefore);
    expect(calls).toHaveLength(callsBefore);
  });

  it("reset(ステージの作り直し)の後は貼り直すが、顔は作り直さない", () => {
    const { raster, counters } = countingRaster();
    const controller = createLookController(raster);
    const { sink, calls } = collector();
    for (let frame = 0; frame < 60; frame += 1) {
      controller.step(WANTED, PREFETCH, sink);
    }
    const generatedBefore = counters.faces;
    controller.reset();
    const callsBefore = calls.length;
    controller.step(WANTED, PREFETCH, sink);
    expect(calls.length - callsBefore).toBe(14);
    expect(counters.faces).toBe(generatedBefore);
  });

  it("打席が変わると、新しい打者の顔だけを新しく作る", () => {
    const { raster, counters } = countingRaster();
    const controller = createLookController(raster);
    const { sink } = collector();
    for (let frame = 0; frame < 60; frame += 1) {
      controller.step(WANTED, PREFETCH, sink);
    }
    const generatedBefore = counters.faces;
    const nextWanted = wantedLooks(PLAYER_TEAM, CPU_TEAM, 1);
    const result = controller.step(nextWanted, PREFETCH, sink);
    // 次の打者は先読みで作ってあるので、生成なしで本物をすぐ貼れる。
    expect(result.generatedFaces).toBe(0);
    expect(counters.faces).toBe(generatedBefore);
    expect(result.appliedSlots).toBeGreaterThan(0);
  });
});

describe("createLookController: 背番号と縞は同じ配列を共有する", () => {
  it("同じ背番号・同じチームには同じ Uint8Array を渡す", () => {
    const { raster, counters } = countingRaster();
    const controller = createLookController(raster);
    const { sink, calls } = collector();
    const base = WANTED.find((request) => request.slot === "batter");
    expect(base).toBeDefined();
    const twin: LookRequest = { slot: "runner0", look: base?.look ?? PLAYER_TEAM.pitcher.look, team: PLAYER_TEAM };
    const request: LookRequest = { slot: "batter", look: twin.look, team: PLAYER_TEAM };
    for (let frame = 0; frame < 3; frame += 1) {
      controller.step([request, twin], [], sink);
    }
    const batter = calls.filter((call) => call.slot === "batter").at(-1);
    const runner = calls.filter((call) => call.slot === "runner0").at(-1);
    expect(batter?.data.numberDecal.rgba).toBe(runner?.data.numberDecal.rgba);
    expect(batter?.data.numberDecal).toBe(runner?.data.numberDecal);
    expect(batter?.data.faceAtlas.rgba).toBe(runner?.data.faceAtlas.rgba);
    expect(counters.numbers).toBe(1);
  });

  it("ピンストライプのチームだけ縞を持ち、チームで 1 枚を共有する", () => {
    const { raster, counters } = countingRaster();
    const controller = createLookController(raster);
    const { sink, calls } = collector();
    const requests: readonly LookRequest[] = [
      { slot: "batter", look: CPU_TEAM.batters.at(0)?.look ?? CPU_TEAM.pitcher.look, team: CPU_TEAM },
      { slot: "runner1", look: CPU_TEAM.batters.at(1)?.look ?? CPU_TEAM.pitcher.look, team: CPU_TEAM },
      { slot: "pitcher", look: PLAYER_TEAM.pitcher.look, team: PLAYER_TEAM },
    ];
    for (let frame = 0; frame < 5; frame += 1) {
      controller.step(requests, [], sink);
    }
    const batter = calls.filter((call) => call.slot === "batter").at(-1);
    const runner = calls.filter((call) => call.slot === "runner1").at(-1);
    const pitcher = calls.filter((call) => call.slot === "pitcher").at(-1);
    expect(batter?.data.uniform.pattern).not.toBeNull();
    expect(batter?.data.uniform.pattern).toBe(runner?.data.uniform.pattern);
    expect(pitcher?.data.uniform.pattern).toBeNull();
    expect(counters.fabrics).toBe(1);
  });
});

describe("実ラスタとの結合", () => {
  it("実際の rasterAtlas / rasterNumber の出力が CharacterLookData の形で渡る", () => {
    const controller = createLookController(DEFAULT_LOOK_RASTER);
    const { sink, calls } = collector();
    const only = WANTED.slice(0, 1);
    controller.step(only, [], sink);
    const data = calls.at(0)?.data;
    expect(data?.slot).toBe("batter");
    expect(data?.faceAtlas.rgba.length).toBe((data?.faceAtlas.width ?? 0) * (data?.faceAtlas.height ?? 0) * 4);
    expect(data?.numberDecal.rgba.length).toBe((data?.numberDecal.width ?? 0) * (data?.numberDecal.height ?? 0) * 4);
    expect(lookKeyOf(only.at(0)?.look ?? PLAYER_TEAM.pitcher.look, PLAYER_TEAM)).toContain("|");
  });
});
