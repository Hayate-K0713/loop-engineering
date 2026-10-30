import type { CSSProperties, MouseEvent } from "react";
import type { GameStageViewProps } from "../hooks/useGameStage";
import type { ContactQuality, TimingCue } from "../types/batting";
import type { PitchFlight } from "../types/pitch";
import type { ScreenRect, StageStatus } from "../types/stage";
import type { FieldMarkerView } from "../types/view";
import { StageTelop } from "./StageTelop";

/**
 * `StageView` の props。`GameStageViewProps`(A0 が凍結)に、タイミングのピルの 2 行目(接触の質)を足したもの。
 * `contactQuality` を渡さない(省略・`null`)ときは、ピルは 1 行(v2 と同じ)。
 */
type StageViewProps = GameStageViewProps & {
  /** タイミングのピルの 2 行目(「芯」「ふつう」「かすり」「ミス」)。`timingCue` と同じ区間に出す。 */
  readonly contactQuality?: ContactQuality | null;
};

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

/** ステージ全体の `data-*` ミラー(E2E・手動確認が読む。見た目には効かない)。値が無いものは属性を出さない。 */
function stageMirrors(props: StageViewProps): Record<string, string | undefined> {
  const { status, phase, playKind, zoneRect, lastTiming, droppedSwings, guideMode, inputState, pitchQuality, banner } = props;
  return {
    "data-status": status,
    "data-phase": phase,
    "data-play-kind": playKind ?? undefined,
    "data-zone-rect": zoneRectText(zoneRect),
    "data-timing": lastTiming?.label,
    "data-timing-ms": lastTiming === null ? undefined : String(lastTiming.dtMs),
    "data-swing-dropped": String(droppedSwings),
    "data-guide-mode": guideMode,
    "data-input-state": inputState?.phase,
    "data-pitch-quality": pitchQuality ?? undefined,
    "data-banner": banner?.kind,
    ...flightData(props.lastFlight),
  };
}

/** タイミング表示の 1 行目の文言。ジャストは「ジャスト!」、早い/遅いは符号つきの ms(符号はラベルで決める。丸めて 0 になっても「−0」と出さない)。 */
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

/** タイミング表示の 2 行目の文言(接触の質)。 */
function qualityText(quality: ContactQuality): string {
  switch (quality) {
    case "core":
      return "芯";
    case "normal":
      return "ふつう";
    case "graze":
      return "かすり";
    default:
      return "ミス";
  }
}

/**
 * タイミング表示(スイング後に出る小さなピル。2 行 = 1 行目: ジャスト!/早い −62ms/遅い +48ms、2 行目: 芯/ふつう/かすり/ミス)。
 * ゾーン枠の上端中央の直上に置き、枠の矩形に追従する(ビューポートが変わっても枠からの相対位置は同じ)。
 * 枠の位置が未計測のときは出さない。操作は受けず(`pointer-events: none`)、支援技術にも読ませない。
 */
function TimingCuePill({ cue, quality, zoneRect }: { readonly cue: TimingCue; readonly quality: ContactQuality | null; readonly zoneRect: ScreenRect | null }) {
  if (zoneRect === null) {
    return null;
  }
  const position: CSSProperties = { left: zoneRect.left + zoneRect.width / 2, top: zoneRect.top };
  return (
    <p className={`bb-stage__timing bb-stage__timing--${cue.label}`} data-testid="timing-cue" aria-hidden="true" style={position}>
      <span className="bb-stage__timing-main" data-testid="timing-cue-main">
        {timingText(cue)}
      </span>
      {quality === null ? null : (
        <span className="bb-stage__timing-sub" data-testid="timing-cue-quality" data-quality={quality}>
          {qualityText(quality)}
        </span>
      )}
    </p>
  );
}

/**
 * 1 行のヒント(最初の数球の操作案内。タップが通らなかったときの「ポンと おす」が優先)。ゾーン枠の下に置き、枠の矩形に追従する
 * (低い画面で下のオーバーレイに掛からないよう、画面の下端から 190px までに収める)。枠が未計測のときは画面下寄りに出す。
 * 操作は受けず(`pointer-events: none`)、支援技術へは `role="status"` で控えめに伝える。
 */
function StageHint({ text, isTap, zoneRect }: { readonly text: string; readonly isTap: boolean; readonly zoneRect: ScreenRect | null }) {
  const position: CSSProperties | undefined = zoneRect === null ? undefined : { top: `min(${zoneRect.top + zoneRect.height + 10}px, calc(100% - 190px))`, bottom: "auto" };
  return (
    <p className={isTap ? "bb-stage__hint bb-stage__hint--tap" : "bb-stage__hint"} data-testid={isTap ? "tap-hint" : "stage-hint"} role="status" style={position}>
      {text}
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

/** 長押しのメニュー(Android/デスクトップの右クリック・長押しのコンテキストメニュー)を出さない。ステージでの操作が中断されるため。 */
function suppressContextMenu(event: MouseEvent<HTMLElement>): void {
  event.preventDefault();
}

/**
 * 全面ステージ。canvas の容器・入力面・テロップ・タイミングのピル・ヒント・スキップのヒント・フォールバック・`data-*` ミラーを描く。
 * HUD などのオーバーレイは子にしない(`GameLayout` が `bb-overlay` として重ねる)。入力面のハンドラは人間打撃中以外も常時つなぐ(スキップのため)。
 * 位置ずれのミニ図(`ZoneFeedback`)は `GameLayout` がステージの上に重ねる。
 */
export function StageView(props: StageViewProps) {
  const { containerRef, status, telop, pointerHandlers, inputActive, skipHint, zoneRect, marker, timingCue, contactQuality, hint, tapHint } = props;
  const fallback = fallbackText(status);
  const hintText = tapHint ?? hint;
  return (
    <div className="bb-stage" data-testid="stage-3d" onContextMenu={suppressContextMenu} {...stageMirrors(props)}>
      <div className="bb-stage__canvas" ref={containerRef} />
      <div className={inputActive ? "bb-stage__input bb-stage__input--active" : "bb-stage__input"} {...pointerHandlers} />
      <StageTelop text={telop} />
      {timingCue === null ? null : <TimingCuePill cue={timingCue} quality={contactQuality ?? null} zoneRect={zoneRect} />}
      {hintText === null ? null : <StageHint text={hintText} isTap={tapHint !== null} zoneRect={zoneRect} />}
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
