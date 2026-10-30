import type { ZonePoint } from "../../../types/common";
import type { ZoneFeedbackView } from "../../../types/view";
import { clamp } from "../../pitch/zone";
import { WORLD_PARAMS } from "../space/params";

// スイング後・投球後の位置ずれ表示(`ui/ZoneFeedback.tsx`)の内容を、ゾーン単位で返す純関数。px への換算は UI が `zoneRect` で行う。
// 3D の `SceneFrame.feedback` は作らない(追跡カメラに切り替わっても見えるよう DOM で出す。play 分冊 §1-6)。

const FEEDBACK = WORLD_PARAMS.zoneFeedback;

/** 画面の幅が分からないときのゾーン矩形の幅(px)。390×844 の打撃構図の値。 */
const FALLBACK_ZONE_WIDTH_PX = 155;

/** 表示時間(ms)。スイングは `swingMs`、投球は `pitchMs`。 */
function durationOf(tone: ZoneFeedbackView["tone"]): number {
  return tone === "swing" ? FEEDBACK.swingMs : FEEDBACK.pitchMs;
}

/**
 * 表示の不透明度(0〜1)。`sinceMs`(スイング・着弾からの経過)が 0 で 1、表示時間で 0 になる線形のフェードアウト。
 * 負は 1、表示時間以降は 0、有限でない値は 0。
 */
export function feedbackAlphaAt(tone: ZoneFeedbackView["tone"], sinceMs: number): number {
  if (!Number.isFinite(sinceMs)) {
    return 0;
  }
  return clamp(1 - sinceMs / durationOf(tone), 0, 1);
}

/** 着弾の輪の半径(ゾーン単位)。径 `ringPx` を、ゾーン矩形の幅(px。ゾーン座標 2 単位分)で割って換算する。 */
function ringRadiusZoneOf(zoneWidthPx: number): number {
  const width = Number.isFinite(zoneWidthPx) && zoneWidthPx > 0 ? zoneWidthPx : FALLBACK_ZONE_WIDTH_PX;
  return FEEDBACK.ringPx / width;
}

export type ZoneFeedbackInput = {
  /** スイング・着弾からの経過ゲーム時間(ms)。負(まだ起きていない)や表示時間以降は `null` を返す。 */
  readonly sinceMs: number;
  /** ゾーン矩形の幅(px)。着弾の輪の半径の換算に使う。 */
  readonly zoneWidthPx: number;
};

/** 表示区間の外(未発生・消えた後・有効でない時刻)か。 */
function isOutside(tone: ZoneFeedbackView["tone"], sinceMs: number): boolean {
  return !Number.isFinite(sinceMs) || sinceMs < 0 || sinceMs >= durationOf(tone);
}

export type SwingFeedbackInput = ZoneFeedbackInput & {
  /** 判定に使った有効カーソル(ロックオン適用後。`SwingInput.cursor`)。 */
  readonly effectiveCursor: ZonePoint;
  /** ボールの着弾点(`flight.landing`)。 */
  readonly landing: ZonePoint;
};

/**
 * スイング後の位置ずれ(十字 = 判定に使った有効カーソル、輪 = 着弾点)。接触・空振り・ファウルなど、スイングした全結果で出す。
 * `0 ≤ sinceMs < swingMs` の間だけ返し、それ以外は `null`。ラベルは無い(タイミングのピルは別)。
 */
export function zoneFeedbackOfSwing(input: SwingFeedbackInput): ZoneFeedbackView | null {
  if (isOutside("swing", input.sinceMs)) {
    return null;
  }
  return {
    tone: "swing",
    from: input.effectiveCursor,
    to: input.landing,
    ringRadiusZone: ringRadiusZoneOf(input.zoneWidthPx),
    alpha: feedbackAlphaAt("swing", input.sinceMs),
    label: null,
  };
}

export type PitchFeedbackInput = ZoneFeedbackInput & {
  /** 狙い(ゾーン座標)。 */
  readonly aim: ZonePoint;
  /** 着弾点(`flight.landing`)。 */
  readonly landing: ZonePoint;
};

/** 狙いと着弾の距離(ゾーン単位)の表示文字列。小数 1 桁(「ズレ 0.2」)。 */
function offsetLabelOf(aim: ZonePoint, landing: ZonePoint): string {
  const distance = Math.hypot(landing.x - aim.x, landing.y - aim.y);
  return `ズレ ${distance.toFixed(1)}`;
}

/**
 * 守備の位置ずれ(十字 = 狙い、輪 = 着弾)。`0 ≤ sinceMs < pitchMs` の間だけ返し、それ以外は `null`。
 * ラベルは狙いと着弾の距離(ゾーン単位。「ズレ 0.2」)。
 */
export function zoneFeedbackOfPitch(input: PitchFeedbackInput): ZoneFeedbackView | null {
  if (isOutside("pitch", input.sinceMs)) {
    return null;
  }
  return {
    tone: "pitch",
    from: input.aim,
    to: input.landing,
    ringRadiusZone: ringRadiusZoneOf(input.zoneWidthPx),
    alpha: feedbackAlphaAt("pitch", input.sinceMs),
    label: offsetLabelOf(input.aim, input.landing),
  };
}
