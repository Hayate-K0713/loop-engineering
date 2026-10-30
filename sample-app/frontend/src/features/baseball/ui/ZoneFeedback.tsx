import type { CSSProperties } from "react";
import type { ZonePoint } from "../types/common";
import type { ScreenRect } from "../types/stage";
import type { ZoneFeedbackView } from "../types/view";
import "./ZoneFeedback.css";

/** 十字(判定に使ったカーソル・狙い)の径(px)。play 分冊 §1-6。 */
const CROSS_DIAMETER_PX = 16;
/** 十字・輪・線の線幅(px)。 */
const STROKE_PX = 3;

type ZoneFeedbackProps = {
  /** 位置ずれの内容(ゾーン単位)。区間外は `null`(何も描かない)。 */
  readonly feedback: ZoneFeedbackView | null;
  /** ゾーン枠の画面矩形(キャンバス左上基準)。未計測の `null` のときは何も描かない。変化(リサイズ・構図の変更)にはそのまま追従する。 */
  readonly zoneRect: ScreenRect | null;
};

/** ゾーン座標([-1, 1]²。y は上が正)を、ゾーン矩形の左上基準の px(y は下が正)へ。 */
function toLocalPx(point: ZonePoint, rect: ScreenRect): { readonly x: number; readonly y: number } {
  return { x: ((point.x + 1) / 2) * rect.width, y: ((1 - point.y) / 2) * rect.height };
}

/**
 * スイング後(`swing`)・投球後(`pitch`)の位置ずれのミニ図。`zoneRect` に固定した SVG に、薄いゾーン枠・十字(`from`)・輪(`to`)・2 点を結ぶ線を線だけで描く。
 * 塗りつぶさないので、追跡カメラに切り替わったあとも背後の打球が見える。操作は受けず(`pointer-events: none`)、支援技術にも読ませない。
 */
export function ZoneFeedback({ feedback, zoneRect }: ZoneFeedbackProps) {
  if (feedback === null || zoneRect === null) {
    return null;
  }
  const from = toLocalPx(feedback.from, zoneRect);
  const to = toLocalPx(feedback.to, zoneRect);
  const ringRadius = feedback.ringRadiusZone * (zoneRect.width / 2);
  const arm = CROSS_DIAMETER_PX / 2;
  const box: CSSProperties = { left: zoneRect.left, top: zoneRect.top, width: zoneRect.width, height: zoneRect.height, opacity: feedback.alpha };
  return (
    <div className="bb-zone-feedback" data-testid="zone-feedback" data-tone={feedback.tone} aria-hidden="true">
      <svg className="bb-zone-feedback__svg" style={box} width={zoneRect.width} height={zoneRect.height} viewBox={`0 0 ${zoneRect.width} ${zoneRect.height}`}>
        <rect className="bb-zone-feedback__frame" x={0} y={0} width={zoneRect.width} height={zoneRect.height} />
        <line className="bb-zone-feedback__link" x1={from.x} y1={from.y} x2={to.x} y2={to.y} strokeWidth={STROKE_PX} />
        <circle className="bb-zone-feedback__ring" cx={to.x} cy={to.y} r={ringRadius} strokeWidth={STROKE_PX} />
        <line className="bb-zone-feedback__cross" x1={from.x - arm} y1={from.y} x2={from.x + arm} y2={from.y} strokeWidth={STROKE_PX} />
        <line className="bb-zone-feedback__cross" x1={from.x} y1={from.y - arm} x2={from.x} y2={from.y + arm} strokeWidth={STROKE_PX} />
      </svg>
      {feedback.label === null ? null : (
        <span className="bb-zone-feedback__label" style={{ left: zoneRect.left + to.x, top: zoneRect.top + to.y + ringRadius + 4, opacity: feedback.alpha }}>
          {feedback.label}
        </span>
      )}
    </div>
  );
}
