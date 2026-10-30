import { afterEach, describe, expect, it, vi } from "vitest";
import type { StageOptions } from "../types/stage";
import { createStage, readStageStats } from "./stage";
import type { RendererInfoLike } from "./stage";
import { makeCrowd, makeFrame, makeGeometry, makeRig } from "./test-fixtures";

// WebGLRenderer だけを偽物に差し替える(node には WebGL が無い)。info は 1 回の render ごとに増える値を返す。
vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class FakeRenderer {
    readonly info = { render: { calls: 0, triangles: 0 }, memory: { geometries: 7, textures: 3 } };
    readonly shadowMap = { enabled: false, type: 0 };
    outputColorSpace = "";
    setSize(): void {}
    setPixelRatio(): void {}
    dispose(): void {}
    forceContextLoss(): void {}
    render(): void {
      this.info.render.calls = 42;
      this.info.render.triangles = 12_345;
    }
  }
  return { ...actual, WebGLRenderer: FakeRenderer };
});

// マーカーの生成・適用は markers.test.ts の担当。ここでは「フレームがそのまま applyMarkers に渡る」ことだけを見る。
const markerSpy = vi.hoisted(() => ({ applied: [] as unknown[] }));
vi.mock("./markers", async () => {
  const { Group } = await import("three");
  return {
    buildMarkers: () => ({ group: new Group() }),
    applyMarkers: (_markers: unknown, frame: unknown) => {
      markerSpy.applied.push(frame);
    },
  };
});

type FakeCanvas = {
  readonly style: Record<string, string>;
  getContext: (kind: string) => unknown;
  addEventListener: () => void;
  removeEventListener: () => void;
  getBoundingClientRect: () => { left: number; top: number; width: number; height: number };
  remove: () => void;
};

function makeCanvas(gl: unknown): FakeCanvas {
  return {
    style: {},
    getContext: () => gl,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 }),
    remove: () => undefined,
  };
}

function stubBrowser(gl: unknown): void {
  vi.stubGlobal("document", { createElement: () => makeCanvas(gl) });
  vi.stubGlobal("window", { devicePixelRatio: 1 });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
}

function makeOptions(): StageOptions {
  return {
    container: { clientWidth: 390, clientHeight: 844, append: () => undefined } as unknown as HTMLElement,
    geometry: makeGeometry(),
    crowd: makeCrowd(),
    rig: makeRig(),
    battingCameraFor: () => makeFrame().camera,
    quality: "low",
    onStatusChange: () => undefined,
    onResize: () => undefined,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  markerSpy.applied.length = 0;
});

describe("readStageStats", () => {
  it("renderer.info の描画回数・三角形・ジオメトリ・テクスチャを写す", () => {
    const info: RendererInfoLike = { render: { calls: 9, triangles: 800 }, memory: { geometries: 5, textures: 2 } };
    expect(readStageStats(info)).toEqual({ drawCalls: 9, triangles: 800, geometries: 5, textures: 2 });
  });
});

describe("createStage の stats", () => {
  it("WebGL2 が取れなければ null を返す", () => {
    stubBrowser(null);
    expect(createStage(makeOptions())).toBeNull();
  });

  it("apply の後は直近のフレームの値を返し、破棄後は null になる(破棄は冪等)", () => {
    stubBrowser({ getExtension: () => null });
    const stage = createStage(makeOptions());
    expect(stage).not.toBeNull();
    const frame = makeFrame();
    stage?.apply(frame);
    expect(markerSpy.applied).toEqual([frame]);
    expect(stage?.stats()).toEqual({ drawCalls: 42, triangles: 12_345, geometries: 7, textures: 3 });
    stage?.dispose();
    expect(stage?.stats()).toBeNull();
    stage?.dispose();
    expect(stage?.stats()).toBeNull();
  });
});
