// 試遊ログの記録の組み立て(純粋関数)。hooks が実測値(時刻・座標・メタ)を渡し、ここで `PlaytestRecord` の形にする。
// 座標はゾーン単位、時刻は ms。`atMs` はセッション開始からの経過時間(呼び出し側が渡す)。
import type { Difficulty } from "../../types/game";
import type { IgnoredInputReason, PitchResult, PreviewMode, SwingKind, SwingMeta } from "../../types/batting";
import type { ZonePoint } from "../../types/common";
import type { PitchKind, PitchQuality } from "../../types/pitch";
import type { PlaytestDevice, PlaytestRecord, PlaytestResultKind, PlaytestSwing } from "../../types/telemetry";
import { isStrike } from "../pitch/zone";

type RecordOf<T extends PlaytestRecord["type"]> = Extract<PlaytestRecord, { readonly type: T }>;

/** 1 球の結果を試遊ログの語彙にする(`PitchResult["kind"]` と同じ)。 */
export function resultKindOf(result: PitchResult): PlaytestResultKind {
  return result.kind;
}

function zoneDistance(a: ZonePoint, b: ZonePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** `buildPlaytestSwing` の入力。 */
export type SwingLogInput = {
  /** スイングの付随情報(入力種別・押下時刻・素/有効カーソル・assistK・タップの持続と移動・指の移動量)。 */
  readonly meta: SwingMeta;
  readonly kind: SwingKind;
  /** 判定時刻(`SwingInput.atMs`。リリースからのゲーム時間。遅延補正後)。 */
  readonly atMs: number;
  /** 判定時刻 − 到達時刻(負 = 早い)。 */
  readonly dtMs: number;
  /** ボールの着弾点(ゾーン単位)。 */
  readonly landing: ZonePoint;
  /** 1 ゾーン単位あたりの画面 px。換算できないとき(`zoneRect` が無い)は `null`。 */
  readonly pxPerZoneUnit: number | null;
};

/** スイングの詳細。距離は有効カーソルと着弾点の距離(ゾーン単位とその画面 px)。 */
export function buildPlaytestSwing(input: SwingLogInput): PlaytestSwing {
  const distanceZone = zoneDistance(input.meta.effective, input.landing);
  return {
    source: input.meta.source,
    kind: input.kind,
    pressAtMs: input.meta.pressTimeStamp,
    atMs: input.atMs,
    dtMs: input.dtMs,
    raw: input.meta.raw,
    effective: input.meta.effective,
    assistK: input.meta.assistK,
    distanceZone,
    distancePx: input.pxPerZoneUnit === null ? null : distanceZone * input.pxPerZoneUnit,
    fingerTravelPx: input.meta.fingerTravelPx,
    tapHoldMs: input.meta.tapHoldMs,
    tapMovePx: input.meta.tapMovePx,
  };
}

/** `buildBatRecord` の入力。 */
export type BatLogInput = {
  readonly atMs: number;
  readonly seq: number;
  readonly pitchKind: PitchKind;
  readonly durationMs: number;
  readonly landing: ZonePoint;
  readonly preview: PreviewMode;
  readonly difficulty: Difficulty;
  /** スイングしなかった球(見逃し)は `null`。 */
  readonly swing: PlaytestSwing | null;
  readonly result: PitchResult;
};

/** 打撃 1 球の記録。`inZone` は着弾点がストライクゾーン内か(見逃しの球にも付く)。 */
export function buildBatRecord(input: BatLogInput): RecordOf<"bat"> {
  return {
    type: "bat",
    atMs: input.atMs,
    seq: input.seq,
    pitchKind: input.pitchKind,
    durationMs: input.durationMs,
    landing: input.landing,
    inZone: isStrike(input.landing),
    preview: input.preview,
    difficulty: input.difficulty,
    swing: input.swing,
    result: resultKindOf(input.result),
  };
}

/** `buildPitchRecord` の入力。 */
export type PitchLogInput = {
  readonly atMs: number;
  readonly seq: number;
  readonly pitchKind: PitchKind;
  readonly aim: ZonePoint;
  readonly landing: ZonePoint;
  /** ゲージを止めた時刻(ゲージ開始からの ms)。止めなかった(自動投球)ときは `null`。 */
  readonly stopAtMs: number | null;
  /** ゲージの停止の誤差(ms)。止めなかったときは `null`。 */
  readonly errMs: number | null;
  readonly quality: PitchQuality;
  readonly result: PitchResult;
};

/** 投球 1 球の記録。 */
export function buildPitchRecord(input: PitchLogInput): RecordOf<"pitch"> {
  return {
    type: "pitch",
    atMs: input.atMs,
    seq: input.seq,
    pitchKind: input.pitchKind,
    aim: input.aim,
    landing: input.landing,
    stopAtMs: input.stopAtMs,
    errMs: input.errMs,
    quality: input.quality,
    result: resultKindOf(input.result),
  };
}

/** 押したのにスイングにならなかった入力の記録。 */
export function buildIgnoredRecord(atMs: number, reason: IgnoredInputReason): RecordOf<"ignored"> {
  return { type: "ignored", atMs, reason };
}

/** pointercancel の記録。 */
export function buildPointerCancelRecord(atMs: number): RecordOf<"pointercancel"> {
  return { type: "pointercancel", atMs };
}

/** セッション開始の記録(端末情報つき)。 */
export function buildSessionRecord(atMs: number, sessionId: string, device: PlaytestDevice): RecordOf<"session"> {
  return { type: "session", atMs, sessionId, device };
}

/** 起動時 1 回のステージ統計(`StageHandle.stats()`)の記録。 */
export function buildStageRecord(atMs: number, drawCalls: number, triangles: number): RecordOf<"stage"> {
  return { type: "stage", atMs, drawCalls, triangles };
}

/** 縮小表示の疑い(`innerWidth ≥ 900` かつ粗いポインタ)。画面で警告を出すのに使う。 */
export function isSuspectedScaledDown(device: PlaytestDevice): boolean {
  return device.innerWidth >= 900 && device.pointerCoarse;
}
