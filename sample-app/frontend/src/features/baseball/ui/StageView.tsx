import type { CSSProperties } from "react";
import type { GameStageViewProps } from "../hooks/useGameStage";
import type { TimingCue } from "../types/batting";
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

/** タイミング表示の文言。ジャストは「ジャスト!」、早い/遅いは符号つきの ms(符号はラベルで決める。丸めて 0 になっても「−0」と出さない)。 */
function timingText(cue: TimingCue): string {
  switch (cue.label) {
    case "just":
      return "ジャスト!";
    case "early":
      return `早い −${Math.abs(cue.dtMs)}ms`;
    default:
      return `遅い +${Math.abs(cue.dtMs)}ms`;
  }
}

/**
 * タイミング表示(スイング後に出る小さなピル)。ゾーン枠の上端中央の直上に置き、枠の矩形に追従する(ビューポートが変わっても枠からの相対位置は同じ)。
 * 枠の位置が未計測のときは出さない。操作は受けず(`pointer-events: none`)、支援技術にも読ませない。
 */
function TimingCuePill({ cue, zoneRect }: { readonly cue: TimingCue; readonly zoneRect: ScreenRect | null }) {
  if (zoneRect === null) {
    return null;
  }
  const position: CSSProperties = { left: zoneRect.left + zoneRect.width / 2, top: zoneRect.top };
  return (
    <p className={`bb-stage__timing bb-stage__timing--${cue.label}`} data-testid="timing-cue" aria-hidden="true" style={position}>
      {timingText(cue)}
    </p>
  );
}

/** スキップのヒント。タッチ端末(`pointer: coarse`)では「タップでスキップ」、それ以外は「タップ / Space でスキップ」(CSS の `@media` で切り替える)。 */
function SkipHint() {
  return (
    <p className="bb-stage__skip-hint" aria-hidden="true">
      <span className="bb-stage__skip-hint-touch">タップでスキップ</span>
      <span className="bb-stage__skip-hint-pointer">タップ / Space でスキップ</span>
    </p>
  );
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
  timingCue,
  lastTiming,
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
      data-timing={lastTiming?.label}
      data-timing-ms={lastTiming === null ? undefined : String(lastTiming.dtMs)}
      {...flightData(lastFlight)}
    >
      <div className="bb-stage__canvas" ref={containerRef} />
      <div className={inputActive ? "bb-stage__input bb-stage__input--active" : "bb-stage__input"} {...pointerHandlers} />
      <StageTelop text={telop} />
      {timingCue === null ? null : <TimingCuePill cue={timingCue} zoneRect={zoneRect} />}
      {skipHint ? <SkipHint /> : null}
      {fallback === null ? null : (
        <p className="bb-stage__fallback" role="status" data-testid="stage-fallback">
          {fallback}
        </p>
      )}
      {marker === null ? null : <BattedBallMarker marker={marker} />}
    </div>
  );
}
