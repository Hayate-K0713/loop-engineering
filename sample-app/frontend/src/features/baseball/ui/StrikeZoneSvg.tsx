import type { PointerEventHandler, RefObject } from "react";
import type { CursorRadii } from "../types/batting";
import type { PitchFlight } from "../types/pitch";
import type { FieldGeometry } from "../types/view";

// ボールの初期表示(飛行開始点の目安)。実際の位置は hooks が ref 経由で毎フレーム上書きする。
const BALL_INITIAL_Y = 0.4;
const BALL_INITIAL_SCALE = 0.25;

const GRID_LINE_STEPS = [0, 1, 2, 3, 4, 5] as const;

function ZoneGrid({ gridHalf }: { readonly gridHalf: number }) {
  const positions = GRID_LINE_STEPS.map((step) => -gridHalf + (step * 2 * gridHalf) / 5);
  return (
    <g className="bb-zone-grid">
      {positions.map((position) => (
        <g key={position}>
          <line x1={position} y1={-gridHalf} x2={position} y2={gridHalf} />
          <line x1={-gridHalf} y1={position} x2={gridHalf} y2={position} />
        </g>
      ))}
    </g>
  );
}

type ZoneBallProps = {
  readonly flight: PitchFlight;
  readonly radius: number;
  readonly ballRef: RefObject<SVGCircleElement | null>;
};

function ZoneBall({ flight, radius, ballRef }: ZoneBallProps) {
  return (
    <circle
      ref={ballRef}
      className="bb-zone-ball"
      data-testid="ball"
      data-seq={flight.seq}
      data-landing-x={flight.landing.x}
      data-landing-y={flight.landing.y}
      data-duration-ms={flight.durationMs}
      cx={0}
      cy={BALL_INITIAL_Y}
      r={radius * BALL_INITIAL_SCALE}
    />
  );
}

type StrikeZoneSvgProps = {
  readonly geometry: FieldGeometry;
  readonly flight: PitchFlight | null;
  readonly showCursor: boolean;
  readonly cursorRadii: CursorRadii;
  readonly svgRef: RefObject<SVGSVGElement | null>;
  readonly ballRef: RefObject<SVGCircleElement | null>;
  readonly cursorRef: RefObject<SVGEllipseElement | null>;
  readonly onPointerDown: PointerEventHandler<SVGSVGElement>;
  readonly onPointerMove: PointerEventHandler<SVGSVGElement>;
  readonly onPointerUp: PointerEventHandler<SVGSVGElement>;
  readonly onPointerCancel: PointerEventHandler<SVGSVGElement>;
};

/**
 * ストライクゾーンの SVG。描画のみで状態を持たない。
 * 内側の `<g transform="scale(1 -1)">` によりゾーン座標(y が上)をそのまま使える:
 * ボール・カーソルの `cx`/`cy` はゾーン座標、ボールの `r` は `ballRadius × scale`。
 */
export function StrikeZoneSvg({ geometry, flight, showCursor, cursorRadii, svgRef, ballRef, cursorRef, ...handlers }: StrikeZoneSvgProps) {
  const extent = geometry.viewHalfExtent;
  return (
    <svg ref={svgRef} className="bb-zone-svg" data-testid="zone-svg" viewBox={`${-extent} ${-extent} ${extent * 2} ${extent * 2}`} {...handlers}>
      <rect className="bb-zone-bg" x={-extent} y={-extent} width={extent * 2} height={extent * 2} />
      <g transform="scale(1 -1)">
        <ZoneGrid gridHalf={geometry.gridHalf} />
        <rect className="bb-zone-frame" x={-geometry.zoneHalf} y={-geometry.zoneHalf} width={geometry.zoneHalf * 2} height={geometry.zoneHalf * 2} />
        {flight === null ? null : <ZoneBall key={flight.seq} flight={flight} radius={geometry.ballRadius} ballRef={ballRef} />}
        {showCursor ? (
          <ellipse ref={cursorRef} className="bb-zone-cursor" data-testid="swing-cursor" cx={0} cy={0} rx={cursorRadii.rx} ry={cursorRadii.ry} />
        ) : null}
      </g>
    </svg>
  );
}
