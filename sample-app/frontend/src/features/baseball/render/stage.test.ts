import { Matrix4 } from "three";
import type { Camera, Group, InstancedMesh, Mesh, Object3D, Scene } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CharacterSlot, SceneFrame, SceneWipe } from "../types/scene";
import type { StageHandle, StageOptions } from "../types/stage";
import { WIPE_LAYER } from "./character/parts";
import { createStage, readStageStats } from "./stage";
import type { RendererInfoLike, StageStatsDetail } from "./stage";
import { makeBatterPose, makeCrowd, makeFrame, makeGeometry, makeLookData, makePose, makeRig } from "./test-fixtures";

type RenderRecord = {
  readonly scene: Scene;
  readonly camera: Camera;
  /** この描画の時点での、シーン直下の各子の拡大率。 */
  readonly scales: readonly number[];
  readonly target: unknown;
};

const fake = vi.hoisted(() => ({
  renders: [] as RenderRecord[],
  pixelRatio: 0,
  shadowEnabled: false,
}));

// WebGLRenderer だけを偽物に差し替える(node には WebGL が無い)。render() は、カメラの layers から見える描画オブジェクト数を draw call として数える。
vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class FakeRenderer {
    autoClear = true;
    private target: unknown = null;
    readonly info = {
      autoReset: true,
      render: { calls: 0, triangles: 0 },
      memory: { geometries: 7, textures: 3 },
      reset: (): void => {
        this.info.render.calls = 0;
        this.info.render.triangles = 0;
      },
    };
    readonly shadowMap = { enabled: false, type: 0, autoUpdate: true };
    outputColorSpace = "";
    setSize(): void {}
    setPixelRatio(value: number): void {
      fake.pixelRatio = value;
    }
    getPixelRatio(): number {
      return fake.pixelRatio;
    }
    setViewport(): void {}
    setScissor(): void {}
    setScissorTest(): void {}
    setRenderTarget(target: unknown): void {
      this.target = target;
    }
    dispose(): void {}
    forceContextLoss(): void {}
    render(scene: Scene, camera: Camera): void {
      let drawn = scene.background ? 1 : 0;
      scene.traverseVisible((object) => {
        if (("isMesh" in object || "isLine" in object) && object.layers.test(camera.layers)) drawn += 1;
      });
      this.info.render.calls += drawn;
      this.info.render.triangles += drawn * 100;
      fake.shadowEnabled = this.shadowMap.enabled;
      fake.renders.push({ scene, camera, scales: scene.children.map((child) => child.scale.x), target: this.target });
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
  vi.stubGlobal("window", { devicePixelRatio: 2 });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
}

function makeOptions(quality: StageOptions["quality"] = "low"): StageOptions {
  return {
    container: { clientWidth: 390, clientHeight: 844, append: () => undefined } as unknown as HTMLElement,
    geometry: makeGeometry(),
    crowd: makeCrowd(),
    rig: makeRig(),
    battingCameraFor: () => makeFrame().camera,
    quality,
    onStatusChange: () => undefined,
    onResize: () => undefined,
  };
}

function makeStage(quality: StageOptions["quality"] = "low"): StageHandle {
  stubBrowser({ getExtension: () => null });
  const stage = createStage(makeOptions(quality));
  if (stage === null) throw new Error("stage was not created");
  return stage;
}

afterEach(() => {
  vi.unstubAllGlobals();
  markerSpy.applied.length = 0;
  fake.renders.length = 0;
  fake.pixelRatio = 0;
});

function detailOf(stage: StageHandle): StageStatsDetail {
  const stats = stage.stats();
  if (stats === null) throw new Error("stats is null");
  return stats as StageStatsDetail;
}

/** 位置の x で見分けたキャラクターの根(シーン直下の Group)。 */
function rootAt(scene: Scene, x: number): Group {
  const found = scene.children.find((child) => child.type === "Group" && child.position.x === x && child.children.some((c) => c.name === "body"));
  if (!found) throw new Error(`no character at x=${x}`);
  return found as Group;
}

/** 足元の円盤の i 番目の大きさ(行列の x 軸の長さ。非表示は 0。`decompose` は 0 を 1 に直すので使えない)。 */
function discSize(discs: InstancedMesh, index: number): number {
  const matrix = new Matrix4();
  discs.getMatrixAt(index, matrix);
  return Math.hypot(...matrix.elements.slice(0, 3));
}

function meshesNamed(scene: Scene, name: string): Mesh[] {
  const found: Mesh[] = [];
  scene.traverse((object) => {
    if (object.name === name && "isMesh" in object) found.push(object as Mesh);
  });
  return found;
}

function firstScene(): Scene {
  const first = fake.renders.at(0);
  if (!first) throw new Error("no render");
  return first.scene;
}

/** キャラクターを見分けられるよう、位置を散らしたフレーム。 */
function spreadFrame(overrides: Partial<SceneFrame> = {}): SceneFrame {
  const base = makeFrame({
    ball: { ...makeFrame().ball, visible: false },
    pitcher: makePose({ position: { x: 3, y: 0.25, z: -18.4 }, scale: 1.3 }),
    catcher: makePose({ position: { x: 0, y: 0, z: 1 } }),
    batter: { ...makeBatterPose(), position: { x: -5, y: 0, z: 0.05 }, scale: 0.7 },
    fielders: Array.from({ length: 7 }, (_, index) => makePose({ position: { x: 7 + index, y: 0, z: -30 }, scale: 1 })),
  });
  return { ...base, ...overrides };
}

function wipeOf(target: CharacterSlot, alpha = 1): SceneWipe {
  return { ...makeFrame().wipe, visible: true, target, alpha };
}

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
    const stage = makeStage();
    const frame = spreadFrame();
    stage.apply(frame);
    expect(markerSpy.applied).toEqual([frame]);
    const stats = detailOf(stage);
    expect(stats.drawCalls).toBeGreaterThan(0);
    expect(stats.triangles).toBe(stats.drawCalls * 100);
    expect(stats.geometries).toBe(7);
    expect(stats.textures).toBe(3);
    stage.dispose();
    expect(stage.stats()).toBeNull();
    stage.dispose();
    expect(stage.stats()).toBeNull();
  });

  it("品質ティア・ワイプの有無・球場の基準値・1 体あたりのメッシュ数を含む", () => {
    const stage = makeStage();
    stage.apply(spreadFrame());
    const stats = detailOf(stage);
    expect(stats.qualityTier).toBe(0);
    expect(stats.pendingTier).toBeNull();
    expect(stats.wipe).toBe(false);
    expect(stats.wipeDrawCalls).toBe(0);
    expect(stats.stadiumDrawCalls).toBeGreaterThan(15);
    expect(stats.stadiumDrawCalls).toBeLessThan(60);
    expect(stats.stadiumShadowCasters).toBe(3);
    expect(stats.meshesPerCharacter).toEqual({ near: 4, far: 2 });
  });
});

describe("キャラクターのプール", () => {
  it("近景 4・遠景 10 の 14 体と、足元の円盤の InstancedMesh 1 つを作る", () => {
    const stage = makeStage();
    stage.apply(spreadFrame());
    const scene = firstScene();
    expect(meshesNamed(scene, "body")).toHaveLength(14);
    expect(meshesNamed(scene, "outline")).toHaveLength(4);
    expect(meshesNamed(scene, "number")).toHaveLength(4);
    expect(meshesNamed(scene, "face")).toHaveLength(14);
    const discs = meshesNamed(scene, "foot-shadows") as InstancedMesh[];
    expect(discs).toHaveLength(1);
    expect(discs.at(0)?.count).toBe(14);
  });

  it("破棄するとジオメトリ・材質・スケルトンまで 1 回以上破棄される", () => {
    const stage = makeStage();
    stage.apply(spreadFrame());
    const scene = firstScene();
    const disposed = new Set<object>();
    const tracked: Array<{ addEventListener: (type: "dispose", listener: () => void) => void }> = [];
    scene.traverse((object) => {
      if (!("isMesh" in object)) return;
      const mesh = object as Mesh;
      tracked.push(mesh.geometry);
      if (!Array.isArray(mesh.material)) tracked.push(mesh.material);
    });
    for (const resource of tracked) resource.addEventListener("dispose", () => disposed.add(resource));
    stage.dispose();
    expect(tracked.length).toBeGreaterThan(40);
    expect(disposed.size).toBe(new Set(tracked).size);
    // キャラクターの根はシーンから外れている。
    expect(meshesNamed(scene, "body")).toHaveLength(0);
  });

  it("ポーズを書き、遠景は足元の円盤が出て近景は(影マップがあれば)出ない", () => {
    const stage = makeStage("normal");
    stage.apply(spreadFrame());
    const scene = firstScene();
    expect(rootAt(scene, 3).scale.x).toBeCloseTo(1.3, 9);
    expect(rootAt(scene, -5).scale.x).toBeCloseTo(0.7, 9);
    const discs = meshesNamed(scene, "foot-shadows").at(0) as InstancedMesh;
    expect(discSize(discs, 0)).toBe(0);
    expect(discSize(discs, 7)).toBeGreaterThan(0);
  });

  it("表情は顔の材質の offset に反映される(setLook で顔を貼った後)", () => {
    const stage = makeStage();
    stage.setLook("pitcher", makeLookData({ slot: "pitcher" }));
    stage.apply(spreadFrame({ pitcher: makePose({ position: { x: 3, y: 0.25, z: -18.4 }, expression: "joy" }) }));
    const face = rootAt(firstScene(), 3).getObjectByName("face") as Mesh | undefined;
    const map = (face?.material as { map: { offset: { y: number } } | null } | undefined)?.map;
    expect(map?.offset.y).toBeCloseTo(100 / 192, 9);
  });
});

describe("setLook", () => {
  it("未知のスロットは何もしない", () => {
    const stage = makeStage();
    stage.apply(spreadFrame());
    const before = firstScene().children.slice();
    expect(() => stage.setLook("nobody" as CharacterSlot, makeLookData())).not.toThrow();
    expect(firstScene().children).toEqual(before);
  });

  it("髪型・色が変わると造形からやり直し、顔のテクスチャだけが変わるときは作り直さない", () => {
    const stage = makeStage();
    stage.apply(spreadFrame());
    const scene = firstScene();
    const before = rootAt(scene, 3);
    const faceOf = (root: Object3D): Mesh => root.getObjectByName("face") as Mesh;
    expect(faceOf(before) && (faceOf(before).material as { map: unknown }).map).toBeNull();
    stage.setLook("pitcher", makeLookData({ slot: "pitcher", hair: { style: "long", color: 0x123456 } }));
    stage.apply(spreadFrame());
    const rebuilt = rootAt(scene, 3);
    expect(rebuilt).not.toBe(before);
    expect(scene.children).not.toContain(before);
    expect((faceOf(rebuilt).material as { map: unknown }).map).not.toBeNull();
    stage.setLook("pitcher", makeLookData({ slot: "pitcher", hair: { style: "long", color: 0x123456 } }));
    stage.apply(spreadFrame());
    expect(rootAt(scene, 3)).toBe(rebuilt);
    expect(meshesNamed(scene, "body")).toHaveLength(14);
  });

  it("破棄後は何もしない", () => {
    const stage = makeStage();
    stage.dispose();
    expect(() => stage.setLook("pitcher", makeLookData())).not.toThrow();
    expect(() => stage.setQualityTier(2)).not.toThrow();
  });
});

describe("setQualityTier", () => {
  it("飛行中(ボールが見えている間)はペンディングにし、見えなくなった最初のフレームで適用する", () => {
    const stage = makeStage();
    const flying = spreadFrame({ ball: { ...makeFrame().ball, visible: true } });
    stage.apply(flying);
    stage.setQualityTier(2);
    expect(detailOf(stage)).toMatchObject({ qualityTier: 0, pendingTier: 2 });
    stage.apply(flying);
    expect(detailOf(stage)).toMatchObject({ qualityTier: 0, pendingTier: 2 });
    stage.apply(spreadFrame());
    expect(detailOf(stage)).toMatchObject({ qualityTier: 2, pendingTier: null });
  });

  it("飛行中でなければ即座に適用し、現在のティアへの切替でペンディングは取り消される", () => {
    const stage = makeStage();
    stage.apply(spreadFrame());
    stage.setQualityTier(1);
    expect(detailOf(stage)).toMatchObject({ qualityTier: 1, pendingTier: null });
    stage.apply(spreadFrame({ ball: { ...makeFrame().ball, visible: true } }));
    stage.setQualityTier(3);
    expect(detailOf(stage).pendingTier).toBe(3);
    stage.setQualityTier(1);
    expect(detailOf(stage).pendingTier).toBeNull();
  });

  it("画素比がティアの上限に従う(T0 1.5 → T3 0.85)", () => {
    const stage = makeStage("normal");
    expect(fake.pixelRatio).toBe(1.5);
    stage.apply(spreadFrame());
    stage.setQualityTier(2);
    expect(fake.pixelRatio).toBe(1);
    stage.setQualityTier(3);
    expect(fake.pixelRatio).toBeCloseTo(0.85, 9);
  });

  it("影: T0 は近景 4 体・T1 は 3 体・T2 以降は影マップなし(近景にも足元の円盤)", () => {
    const stage = makeStage("normal");
    stage.apply(spreadFrame());
    const scene = firstScene();
    const casters = (): number => meshesNamed(scene, "body").filter((mesh) => mesh.castShadow).length;
    expect(casters()).toBe(4);
    expect(fake.shadowEnabled).toBe(true);
    stage.setQualityTier(1);
    expect(casters()).toBe(3);
    stage.setQualityTier(2);
    expect(casters()).toBe(0);
    expect(fake.shadowEnabled).toBe(false);
    const discs = meshesNamed(scene, "foot-shadows").at(0) as InstancedMesh;
    stage.apply(spreadFrame());
    expect(discSize(discs, 0)).toBeGreaterThan(0);
  });

  it("遠景の関節の更新: T2 以降はボーンの回転を書かず、根の位置だけ追従する", () => {
    const stage = makeStage();
    const withArm = (x: number, z: number): SceneFrame =>
      spreadFrame({ fielders: Array.from({ length: 7 }, (_, index) => makePose({ position: { x: 7 + index, y: 0, z }, armL: { x, y: 0, z: 0 } })) });
    stage.apply(withArm(-1.1, -30));
    const boneOf = (): Object3D | undefined => rootAt(firstScene(), 7).getObjectByName("upperArmL");
    expect(boneOf()?.rotation.x).toBeCloseTo(-1.1, 9);
    stage.setQualityTier(2);
    stage.apply(withArm(0.3, -25));
    expect(boneOf()?.rotation.x).toBeCloseTo(-1.1, 9);
    expect(rootAt(firstScene(), 7).position.z).toBe(-25);
    stage.setQualityTier(1);
    stage.apply(withArm(0.3, -25));
    expect(boneOf()?.rotation.x).toBeCloseTo(0.3, 9);
  });

  it("T3 は動いていない遠景を隠し(近景は残す)、ワイプを描かない", () => {
    const stage = makeStage();
    const frame = spreadFrame({ wipe: wipeOf("batter") });
    stage.apply(frame);
    expect(detailOf(stage).wipe).toBe(true);
    stage.setQualityTier(3);
    for (let i = 0; i < 70; i += 1) stage.apply(frame);
    expect(detailOf(stage).wipe).toBe(false);
    expect(rootAt(firstScene(), 7).visible).toBe(false);
    expect(rootAt(firstScene(), 3).visible).toBe(true);
    // 動けば再び見える。
    stage.apply(spreadFrame({ fielders: Array.from({ length: 7 }, (_, index) => makePose({ position: { x: 7 + index, y: 0, z: -20 }, scale: 1 })) }));
    expect(rootAt(firstScene(), 7).visible).toBe(true);
  });
});

describe("ワイプの第 2 パス", () => {
  /** ワイプ用カメラから見える描画オブジェクト。 */
  function visibleToWipe(record: RenderRecord): Mesh[] {
    const found: Mesh[] = [];
    record.scene.traverseVisible((object) => {
      if ("isMesh" in object && object.layers.test(record.camera.layers)) found.push(object as Mesh);
    });
    return found;
  }

  function isInside(root: Object3D, object: Object3D): boolean {
    for (let current: Object3D | null = object; current; current = current.parent) {
      if (current === root) return true;
    }
    return false;
  }

  it("ワイプなしなら第 1 パスだけ、ありなら対象キャラクターと背景だけを描く第 2 パスが加わる(draw call ≤ 12)", () => {
    const stage = makeStage();
    stage.apply(spreadFrame());
    expect(fake.renders).toHaveLength(1);
    fake.renders.length = 0;
    stage.apply(spreadFrame({ wipe: wipeOf("batter") }));
    expect(fake.renders).toHaveLength(2);
    const [main, second] = fake.renders;
    if (!main || !second) throw new Error("missing render");
    expect(second.camera.layers.test(main.camera.layers)).toBe(false);
    expect(second.camera.layers.isEnabled(WIPE_LAYER)).toBe(true);
    const target = rootAt(second.scene, -5);
    const drawn = visibleToWipe(second);
    const characterMeshes = drawn.filter((mesh) => isInside(target, mesh));
    const background = drawn.filter((mesh) => !isInside(target, mesh));
    expect(characterMeshes).toHaveLength(4);
    // 地面・内野の土・本塁周りの土・マウンドだけ。他のキャラクター・マーカー・影の円盤・球場の残りは描かない。
    expect(background).toHaveLength(4);
    expect(background.every((mesh) => mesh.receiveShadow)).toBe(true);
    const stats = detailOf(stage);
    expect(stats.wipe).toBe(true);
    expect(stats.wipeDrawCalls).toBe(drawn.length + 1);
    expect(stats.wipeDrawCalls).toBeLessThanOrEqual(12);
  });

  it("ライトも WIPE_LAYER に載り、対象は第 2 パスの間だけ実寸(scale 1)になる", () => {
    const stage = makeStage();
    stage.apply(spreadFrame({ wipe: wipeOf("batter") }));
    const [main, second] = fake.renders;
    if (!main || !second) throw new Error("missing render");
    const lights: Object3D[] = [];
    second.scene.traverse((object) => {
      if ("isLight" in object) lights.push(object);
    });
    expect(lights.length).toBeGreaterThanOrEqual(2);
    expect(lights.every((light) => light.layers.test(second.camera.layers))).toBe(true);
    const index = second.scene.children.indexOf(rootAt(second.scene, -5));
    expect(main.scales.at(index)).toBeCloseTo(0.7, 9);
    expect(second.scales.at(index)).toBeCloseTo(1, 9);
    expect(rootAt(second.scene, -5).scale.x).toBeCloseTo(0.7, 9);
  });

  it("対象が見えていない・visible が偽・alpha が 0 のときは描かず、WIPE_LAYER も外す", () => {
    const stage = makeStage();
    stage.apply(spreadFrame({ wipe: wipeOf("batter") }));
    const bodyOf = (): Mesh => rootAt(firstScene(), -5).getObjectByName("body") as Mesh;
    expect(bodyOf().layers.isEnabled(WIPE_LAYER)).toBe(true);
    fake.renders.length = 0;
    stage.apply(spreadFrame({ wipe: { ...wipeOf("batter"), visible: false } }));
    expect(fake.renders).toHaveLength(1);
    expect(bodyOf().layers.isEnabled(WIPE_LAYER)).toBe(false);
    fake.renders.length = 0;
    stage.apply(spreadFrame({ wipe: wipeOf("batter", 0) }));
    expect(fake.renders).toHaveLength(1);
    stage.apply(spreadFrame({ wipe: wipeOf("fielder3"), fielders: Array.from({ length: 7 }, () => makePose({ visible: false })) }));
    expect(detailOf(stage).wipe).toBe(false);
  });

  it("alpha < 1 は render target に描いてから半透明の板として重ねる", () => {
    const stage = makeStage();
    stage.apply(spreadFrame({ wipe: wipeOf("pitcher", 0.5) }));
    expect(fake.renders).toHaveLength(3);
    const [, offscreen, composite] = fake.renders;
    expect(offscreen?.target).not.toBeNull();
    expect(composite?.target).toBeNull();
    expect(composite?.scene).not.toBe(firstScene());
    expect(detailOf(stage).wipe).toBe(true);
    stage.dispose();
  });

  it("未知の対象は描かない", () => {
    const stage = makeStage();
    stage.apply(spreadFrame({ wipe: wipeOf("nobody" as CharacterSlot) }));
    expect(fake.renders).toHaveLength(1);
  });
});

describe("構造検査", () => {
  it("window・document・matchMedia を使う render/ のソースは stage.ts だけ", () => {
    const modules = import.meta.glob<string>(["./**/*.ts", "!./**/*.test.ts"], { query: "?raw", import: "default", eager: true });
    const names = Object.keys(modules);
    expect(names).toContain("./stage.ts");
    const isCode = (line: string): boolean => !["//", "/*", "*"].some((prefix) => line.trim().startsWith(prefix));
    const offenders = Object.entries(modules)
      .filter(([, source]) =>
        source
          .split("\n")
          .filter(isCode)
          .some((line) => /\b(?:window|document|matchMedia)\b/.test(line.split("//")[0] ?? "")),
      )
      .map(([name]) => name);
    expect(offenders).toEqual(["./stage.ts"]);
  });
});
