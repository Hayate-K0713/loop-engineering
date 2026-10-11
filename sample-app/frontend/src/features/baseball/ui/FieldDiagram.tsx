import type { InPlayResult } from "../types/batting";
import type { FieldDiagramGeometry, FieldMarkerView } from "../types/view";

const RESULT_LABELS: ReadonlyMap<InPlayResult, string> = new Map<InPlayResult, string>([
  ["groundout", "ゴロアウト"],
  ["doublePlay", "併殺打"],
  ["flyout", "フライアウト"],
  ["lineout", "ライナーアウト"],
  ["single", "ヒット"],
  ["double", "二塁打"],
  ["triple", "三塁打"],
  ["homerun", "ホームラン"],
  ["error", "エラー"],
]);

const MARKER_RADIUS = 2.6;
const BASE_SIZE = 3.6;

function describeDiagram(marker: FieldMarkerView | null): string {
  if (marker === null) return "フィールド図";
  const label = RESULT_LABELS.get(marker.result) ?? marker.result;
  return `フィールド図。直近の打球は${label}、飛距離はおよそ${Math.round(marker.distance)}メートル`;
}

function DiagramBase({ x, y }: { readonly x: number; readonly y: number }) {
  return (
    <rect className="bb-diagram-base" x={x - BASE_SIZE / 2} y={y - BASE_SIZE / 2} width={BASE_SIZE} height={BASE_SIZE} transform={`rotate(45 ${x} ${y})`} />
  );
}

/** 座標系は本塁が原点・y が外野方向(上)。呼び出し側の `<g transform="scale(1 -1)">` 内で描く。 */
function DiagramBackdrop({ geometry }: { readonly geometry: FieldDiagramGeometry }) {
  const radius = geometry.fenceRadius;
  const edge = radius * Math.SQRT1_2;
  const side = geometry.baseDistance * Math.SQRT1_2;
  const second = geometry.baseDistance * Math.SQRT2;
  const fenceArc = `M ${-edge} ${edge} A ${radius} ${radius} 0 0 0 ${edge} ${edge}`;
  return (
    <g>
      <path className="bb-diagram-grass" d={`${fenceArc} L 0 0 Z`} />
      <polygon className="bb-diagram-infield" points={`0,0 ${side},${side} 0,${second} ${-side},${side}`} />
      <path className="bb-diagram-foul" d={`M ${-edge} ${edge} L 0 0 L ${edge} ${edge}`} />
      <path className="bb-diagram-fence" d={fenceArc} />
      <DiagramBase x={0} y={0} />
      <DiagramBase x={side} y={side} />
      <DiagramBase x={0} y={second} />
      <DiagramBase x={-side} y={side} />
    </g>
  );
}

function DiagramMarker({ marker }: { readonly marker: FieldMarkerView }) {
  return (
    <g className="bb-diagram-marker-group">
      <line className="bb-diagram-trace" x1={0} y1={0} x2={marker.x} y2={marker.y} />
      <circle
        className="bb-diagram-marker"
        data-testid="batted-ball-marker"
        data-result={marker.result}
        data-seq={marker.seq}
        data-over-fence={String(marker.overFence)}
        data-distance={marker.distance.toFixed(1)}
        data-lateral={marker.lateral.toFixed(2)}
        cx={marker.x}
        cy={marker.y}
        r={MARKER_RADIUS}
      />
    </g>
  );
}

type FieldDiagramProps = {
  readonly marker: FieldMarkerView | null;
  readonly geometry: FieldDiagramGeometry;
};

/** 簡易フィールド図。直近のインプレー打球の方向・飛距離を点で示す(見た目の目安)。 */
export function FieldDiagram({ marker, geometry }: FieldDiagramProps) {
  const viewBox = `${-geometry.viewHalfWidth} ${-geometry.viewTop} ${geometry.viewHalfWidth * 2} ${geometry.viewTop - geometry.viewBottom}`;
  return (
    <svg className="bb-diagram" data-testid="field-diagram" role="img" aria-label={describeDiagram(marker)} viewBox={viewBox}>
      <g transform="scale(1 -1)">
        <DiagramBackdrop geometry={geometry} />
        {marker === null ? null : <DiagramMarker key={marker.seq} marker={marker} />}
      </g>
    </svg>
  );
}
