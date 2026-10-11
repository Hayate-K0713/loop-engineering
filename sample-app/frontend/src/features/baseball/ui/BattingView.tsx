import { useRef, type ReactNode } from "react";
import { useBattingControls } from "../hooks/useBattingControls";
import { usePitchFlight } from "../hooks/usePitchFlight";
import type { CursorRadii, SwingInput } from "../types/batting";
import type { PitchFlight } from "../types/pitch";
import type { FieldGeometry } from "../types/view";
import { StrikeZoneSvg } from "./StrikeZoneSvg";
import { SwingControls } from "./SwingControls";

type BattingViewProps = {
  readonly flight: PitchFlight | null;
  readonly arriveAfterMs: number;
  readonly geometry: FieldGeometry;
  readonly swingReady: boolean;
  /** 人間打撃時のみ真(スイングカーソルと `SwingControls` を出し、ポインタ・キー入力を有効にする)。 */
  readonly showCursor: boolean;
  /** `GameView.batter.cursorRadii`。 */
  readonly cursorRadii: { readonly meet: CursorRadii; readonly power: CursorRadii };
  readonly timeScale: number;
  readonly onSwing: (input: SwingInput) => void;
  readonly onPitchArrived: () => void;
  /** ゾーンと同じ正方形に重ねる要素(人間守備時のコース選択グリッド)。無いときは `null`。 */
  readonly overlay: ReactNode;
};

/**
 * ゾーン周りの結線。`usePitchFlight`(ボールの rAF 更新と到達通知)と `useBattingControls`(カーソル・スイング入力)を呼ぶ。
 * 人間守備中も CPU 打者の `PITCH_ARRIVED` を送るため、試合中は常時マウントする(`showCursor` が偽のときは入力が無効なだけ)。
 */
export function BattingView({
  flight,
  arriveAfterMs,
  geometry,
  swingReady,
  showCursor,
  cursorRadii,
  timeScale,
  onSwing,
  onPitchArrived,
  overlay,
}: BattingViewProps) {
  const ballRef = useRef<SVGCircleElement>(null);
  const { getElapsedMs } = usePitchFlight({ flight, arriveAfterMs, timeScale, ballRadius: geometry.ballRadius, onArrive: onPitchArrived, ballRef });
  const controls = useBattingControls({ enabled: showCursor, swingReady, cursorRadii, getElapsedMs, onSwing });
  return (
    <div className="bb-batting-view" data-testid="batting-view">
      <div className="bb-zone-stack">
        <StrikeZoneSvg
          geometry={geometry}
          flight={flight}
          showCursor={showCursor}
          cursorRadii={controls.currentRadii}
          svgRef={controls.svgRef}
          ballRef={ballRef}
          cursorRef={controls.cursorRef}
          {...controls.pointerHandlers}
        />
        {overlay === null ? null : <div className="bb-zone-overlay">{overlay}</div>}
      </div>
      {showCursor ? (
        <SwingControls ready={swingReady} swingKind={controls.swingKind} onSelectSwingKind={controls.setSwingKind} onSwing={controls.swingNow} />
      ) : null}
    </div>
  );
}
