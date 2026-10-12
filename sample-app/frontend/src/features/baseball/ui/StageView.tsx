import type { GameStageViewProps } from "../hooks/useGameStage";
import type { PitchFlight } from "../types/pitch";
import type { ScreenRect, StageStatus } from "../types/stage";
import type { FieldMarkerView } from "../types/view";
import { StageTelop } from "./StageTelop";

/** WebGL が使えない・描画が中断されたときの案内。`loading`/`ready` では出さない。 */
function fallbackText(status: StageStatus): string | null {
  switch (status) {
    case "unsupported":
      return "3D表示を使えません(WebGL が利用できない環境です)。操作と試合の進行は続けられます。";
    case "lost":
      return "描画が中断されました。ページを再読み込みしてください。";
    default:
      return null;
  }
}

/** 最後に見た投球の `data-*`(E2E・手動確認用)。まだ投球が無いときは属性を出さない。 */
function flightData(flight: PitchFlight | null): Record<string, string> {
  if (flight === null) {
    return {};
  }
  return {
    "data-flight-seq": String(flight.seq),
    "data-landing-x": flight.landing.x.toFixed(3),
    "data-landing-y": flight.landing.y.toFixed(3),
    "data-duration-ms": String(flight.durationMs),
  };
}

/** ゾーン枠の画面矩形(キャンバス左上基準)を `left,top,width,height` で。計測前は属性を出さない。 */
function zoneRectText(rect: ScreenRect | null): string | undefined {
  return rect === null ? undefined : `${rect.left},${rect.top},${rect.width},${rect.height}`;
}

/** 打球のフィールド図上の点(旧 `FieldDiagram` の `batted-ball-marker` と同じ形式)。見えない DOM ミラーで、E2E と手動確認だけが読む。 */
function BattedBallMarker({ marker }: { readonly marker: FieldMarkerView }) {
  return (
    <span
      hidden
      data-testid="batted-ball-marker"
      data-result={marker.result}
      data-seq={marker.seq}
      data-over-fence={String(marker.overFence)}
      data-distance={marker.distance.toFixed(1)}
      data-lateral={marker.lateral.toFixed(2)}
    />
  );
}

/**
 * 全面ステージ。canvas の容器・入力面・テロップ・スキップのヒント・フォールバック・`data-*` ミラーを描く。
 * HUD などのオーバーレイは子にしない(`GameLayout` が `bb-overlay` として重ねる)。入力面のハンドラは人間打撃中以外も常時つなぐ(スキップのため)。
 */
export function StageView({
  containerRef,
  status,
  telop,
  pointerHandlers,
  inputActive,
  skipHint,
  phase,
  playKind,
  lastFlight,
  zoneRect,
  marker,
}: GameStageViewProps) {
  const fallback = fallbackText(status);
  return (
    <div
      className="bb-stage"
      data-testid="stage-3d"
      data-status={status}
      data-phase={phase}
      data-play-kind={playKind ?? undefined}
      data-zone-rect={zoneRectText(zoneRect)}
      {...flightData(lastFlight)}
    >
      <div className="bb-stage__canvas" ref={containerRef} />
      <div className={inputActive ? "bb-stage__input bb-stage__input--active" : "bb-stage__input"} {...pointerHandlers} />
      <StageTelop text={telop} />
      {skipHint ? (
        <p className="bb-stage__skip-hint" aria-hidden="true">
          タップ / Space でスキップ
        </p>
      ) : null}
      {fallback === null ? null : (
        <p className="bb-stage__fallback" role="status" data-testid="stage-fallback">
          {fallback}
        </p>
      )}
      {marker === null ? null : <BattedBallMarker marker={marker} />}
    </div>
  );
}
