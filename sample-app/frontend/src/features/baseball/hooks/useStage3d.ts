import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { battingCamera } from "../model/world/camera/rig";
import { CHARACTER_RIG } from "../model/world/motion/rig";
import { worldToZone } from "../model/world/space/coords";
import { buildCrowdPattern } from "../model/world/space/crowd";
import { buildStageGeometry } from "../model/world/space/geometry";
import { createStage } from "../render/stage";
import type { ZonePoint } from "../types/common";
import type { ScreenRect, StageHandle, StageQuality, StageStatus } from "../types/stage";

/** 観客席の点の配置のシード。見た目だけの定数で、試合のシードとは無関係(毎回同じ観客席にする)。 */
const CROWD_SEED = 20261012;

type UseStage3dOptions = {
  /** 描画品質。`speed.timeScale > 1`(`fast=1`)のときは `"low"`。この値が変わったときだけステージを作り直す。 */
  readonly quality: StageQuality;
};

export type UseStage3dResult = {
  /** ステージ(canvas)を入れる要素に付ける ref。 */
  readonly containerRef: RefObject<HTMLDivElement | null>;
  /** 生成済みのステージ。作る前・破棄後・WebGL 不可のときは `null`(director は `null` でも進行を止めない)。 */
  readonly stage: StageHandle | null;
  readonly status: StageStatus;
  /** 打撃カメラでのゾーン枠の画面矩形(キャンバス左上基準の CSS px)。リサイズ時に更新する。 */
  readonly zoneRect: ScreenRect | null;
  /** 画面座標(client)をゾーン座標へ変換する。ゾーン平面に当たらない・ステージが無いときは `null`。 */
  readonly pickZone: (clientX: number, clientY: number) => ZonePoint | null;
  /** 最新のゾーン枠の画面矩形(イベントハンドラ向けの getter)。ステージが無いときは `null`。 */
  readonly getZoneRect: () => ScreenRect | null;
};

/**
 * 3D ステージの生成・破棄とゾーン座標の変換。
 * 生成 effect の deps は `quality` のみ(半イニングごとに変わるユニフォーム色などは director の `apply` で渡すので、ここでは作り直さない)。
 * cleanup で必ず `dispose()` し、state を初期値へ戻す(StrictMode の二重 mount でも canvas が残らない)。
 */
export function useStage3d({ quality }: UseStage3dOptions): UseStage3dResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<StageHandle | null>(null);
  const [stage, setStage] = useState<StageHandle | null>(null);
  const [status, setStatus] = useState<StageStatus>("loading");
  const [zoneRect, setZoneRect] = useState<ScreenRect | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return undefined;
    }
    let handle: StageHandle | null = null;
    handle = createStage({
      container,
      geometry: buildStageGeometry(),
      crowd: buildCrowdPattern(CROWD_SEED),
      rig: CHARACTER_RIG,
      battingCamera: battingCamera(),
      quality,
      onStatusChange: setStatus,
      onResize: () => setZoneRect(handle === null ? null : handle.zoneScreenRect()),
    });
    if (handle === null) {
      setStatus("unsupported");
      return undefined;
    }
    const created = handle;
    stageRef.current = created;
    setStage(created);
    setZoneRect(created.zoneScreenRect());
    setStatus("ready");
    return () => {
      created.dispose();
      stageRef.current = null;
      setStage(null);
      setZoneRect(null);
      setStatus("loading");
    };
  }, [quality]);

  const pickZone = useCallback((clientX: number, clientY: number): ZonePoint | null => {
    const hit = stageRef.current?.pickPlane(clientX, clientY) ?? null;
    return hit === null ? null : worldToZone(hit);
  }, []);

  const getZoneRect = useCallback((): ScreenRect | null => stageRef.current?.zoneScreenRect() ?? null, []);

  return { containerRef, stage, status, zoneRect, pickZone, getZoneRect };
}
