import type { CameraPose } from "../../../types/scene";
import { WORLD_PARAMS } from "../space/params";
import { easeInOut } from "./rig";

// 内野カメラ(character 分冊 §3-4-8)。打球の追跡カメラ(外野を追う)では走者が見えないので、落下後に走者が動くプレーでは、高い内野のカメラへ blend し、
// 走者の進塁が終わるまで保持する。画角は水平半幅 tan `halfWidthTan`(0.60)で決まる: 縦長(390×844)でも一塁・三塁(x ±19.4m)が画面の端に入る。
// 状態を持たず、three は import しない。blend の割合は呼び出し側(`sequence/frame.ts`)が `PlayPlan.infieldFromMs` から決める。

const INFIELD = WORLD_PARAMS.runners.infieldCamera;

/** 縦横比が使えない(非有限・0 以下)ときに使う値(横長)。 */
const DEFAULT_ASPECT = 16 / 9;

const RAD_TO_DEG = 180 / Math.PI;

function isValidAspect(aspect: number): boolean {
  return Number.isFinite(aspect) && aspect > 0;
}

/** 内野カメラの縦 FOV(度)。水平半幅 tan(= `tan(fov/2) × aspect`)がちょうど `halfWidthTan` になる。 */
export function infieldFovDeg(aspect: number): number {
  const usable = isValidAspect(aspect) ? aspect : DEFAULT_ASPECT;
  return 2 * Math.atan(INFIELD.halfWidthTan / usable) * RAD_TO_DEG;
}

/** 内野カメラの姿勢。位置・注視点は `WORLD_PARAMS.runners.infieldCamera`、`lift` は 0(打撃の lift を引き継がない)。 */
export function infieldCameraFor(aspect: number): CameraPose {
  return {
    position: INFIELD.position,
    target: INFIELD.target,
    fovDeg: infieldFovDeg(aspect),
    lift: 0,
  };
}

/**
 * 内野カメラへの移り具合(0〜1)。`sinceMs` は blend の開始(`PlayPlan.infieldFromMs`)からの経過で、`blendMs`(400ms)かけて smoothstep で 0 → 1。
 * 開始前・非有限は 0、終了後は 1(走者の進塁が終わるまで保持する)。
 */
export function infieldBlendAt(sinceMs: number): number {
  return Number.isFinite(sinceMs) ? easeInOut(sinceMs / INFIELD.blendMs) : 0;
}
