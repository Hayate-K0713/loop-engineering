import { useCallback, useLayoutEffect, useRef, useState, type PointerEventHandler, type RefObject } from "react";
import { INITIAL_CURSOR } from "../model/batting/cursor";
import { isHolding, recordSwing, type SwingRecord } from "../model/world/sequence/session";
import { CPU_SWING_LEAD_MS } from "../model/world/space/params";
import type { SwingInput, SwingKind, TimingCue } from "../types/batting";
import type { PlaybackSpeed } from "../types/game";
import type { PitchCommand, PitchFlight } from "../types/pitch";
import type { SceneLayout, ScenePhase } from "../types/scene";
import type { ScreenRect, StageStatus } from "../types/stage";
import type { FieldMarkerView, GameView, PitchOutcomeView } from "../types/view";
import { useBattingControls, type BattingControls, type CursorView } from "./useBattingControls";
import { useCpuTurn } from "./useCpuTurn";
import type { UseGameResult } from "./useGame";
import { useHeldView } from "./useHeldView";
import { useLatest } from "./useLatest";
import { usePitchFlight } from "./usePitchFlight";
import type { PointerHandlers } from "./usePointerInput";
import { useSafeArea } from "./useSafeArea";
import { useSkipInput } from "./useSkipInput";
import { useStage3d, type UseStage3dResult } from "./useStage3d";
import { useStageDirector, type StageDirector } from "./useStageDirector";

type UseGameStageOptions = {
  readonly game: UseGameResult;
  readonly speed: PlaybackSpeed;
  /** 人間守備の投球の選択(球種・コース)。「投げる」押下時点の値で投げ、選択中のセルは3D のゾーンにハイライトする。 */
  readonly selection: PitchCommand;
};

/** `StageView` に渡す props(ステージ全面・入力面・テロップ・ヒント・フォールバック・`data-*` ミラー)。 */
export type GameStageViewProps = {
  /** canvas を入れる容器(`bb-stage__canvas`)に付ける ref。 */
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly status: StageStatus;
  /** `StageTelop` の文言。区間外は `null`。 */
  readonly telop: string | null;
  /** 入力面(`bb-stage__input`)に展開するポインタ4ハンドラ。人間打撃中以外もつなぐ(スキップのため)。 */
  readonly pointerHandlers: PointerHandlers;
  /** 人間打撃中(`bb-stage__input--active` = `touch-action: none` を付ける)。 */
  readonly inputActive: boolean;
  /** スキップのヒントを出す(`holding` 中)。 */
  readonly skipHint: boolean;
  readonly phase: ScenePhase;
  readonly playKind: PitchOutcomeView["kind"] | null;
  readonly lastFlight: PitchFlight | null;
  readonly zoneRect: ScreenRect | null;
  /** 非表示の `batted-ball-marker` ミラー用(表示用 view のもの)。 */
  readonly marker: FieldMarkerView | null;
  /** 表示中のタイミング表示(早い/ジャスト/遅い。スイング後 900ms。スキップで消える)。なければ `null`。 */
  readonly timingCue: TimingCue | null;
  /** 直近のスイングのタイミング(`data-timing` ミラー用)。次の投球が飛び始めるまで保持し、なければ `null`。 */
  readonly lastTiming: TimingCue | null;
};

type UseGameStageResult = {
  /** **表示用**の view(演出中は直前のまま保持)。`ScoreHud`・`NamePlates`・`Ticker`・操作バーの種類・`ResultScreen` の判定に使う。 */
  readonly view: GameView;
  /** 演出中。真の間は次の投球を始めず、`ResultScreen` も出さない(`view.result !== null && !holding` のとき表示)。 */
  readonly holding: boolean;
  /** 人間守備の windup 中。 */
  readonly throwing: boolean;
  /** `PitchingControls` の `ready`(= `pitch-controls` の `data-ready`)= 最新の `view.pitchReady && !holding && !throwing`。 */
  readonly pitchReady: boolean;
  /** `SwingControls` の `ready` = 最新の `view.swingReady && !holding`。 */
  readonly swingReady: boolean;
  /** 「投げる」ボタン(`PitchingControls` の `onThrow`)。windup のあと `selection` で投球する。 */
  readonly onThrow: () => void;
  /** `SwingControls` の `swingKind`・`onSelectSwingKind`・`onSwing`(pointerdown)。 */
  readonly swingKind: SwingKind;
  readonly setSwingKind: (kind: SwingKind) => void;
  /** スイングボタンの pointerdown 用(`useBattingControls` の `swingFromButton`)。イベントの時刻と入力種別から判定時刻を求める。 */
  readonly swingNow: PointerEventHandler<HTMLButtonElement>;
  readonly stageProps: GameStageViewProps;
};

/**
 * 人間のスイング入力を `seq` 付きで記録し(1つの `seq` につき最初の1回だけ)、そのあとに `game.swing` を呼ぶ。
 * 記録は director が `planPlay` に渡し(`seq` が一致するときだけ)、plan 作成後に `null` へ戻す。
 */
function useSwingRecording(game: UseGameResult): { readonly swingRecordRef: RefObject<SwingRecord | null>; readonly onSwing: (input: SwingInput) => void } {
  const swingRecordRef = useRef<SwingRecord | null>(null);
  const latest = useLatest(game);
  const onSwing = useCallback(
    (input: SwingInput): void => {
      const { view, swing } = latest.current;
      if (view.flight !== null) {
        swingRecordRef.current = recordSwing(swingRecordRef.current, view.flight.seq, input);
      }
      swing(input);
    },
    [latest],
  );
  return { swingRecordRef, onSwing };
}

/**
 * director が毎フレーム読むカーソルの getter の差し替え先 ref。director は `useBattingControls` より先に作る必要があり(`useBattingControls` が
 * `director.skip` を受けるため)、循環を切るために ref 経由の安定した getter を director に渡す。実体は `useBindCursorSource` が差し込む。
 */
function useCursorSourceRef(fallbackView: GameView): RefObject<() => CursorView> {
  // 最初の layout effect(`useBindCursorSource`)で差し替わるまでの仮の getter。director の最初のフレームより前に必ず差し替わる。
  return useRef<() => CursorView>(() => ({ point: INITIAL_CURSOR, radii: fallbackView.batter.cursorRadii.meet }));
}

/**
 * `useBattingControls` の `getCursorView` を ref に差し込む。ref 代入だけの layout effect なので cleanup は付けない
 * (解放する資源が無く、StrictMode の再実行でも同じ getter を入れ直すだけで無害。`useLatest` と同じ扱い)。
 */
function useBindCursorSource(sourceRef: RefObject<() => CursorView>, source: () => CursorView): void {
  useLayoutEffect(() => {
    sourceRef.current = source;
  }, [sourceRef, source]);
}

/** 構図のレイアウト(人間守備は守備レイアウト、それ以外は打撃レイアウト)。表示用の view で決める(director の `aimCell` と同じ基準)。 */
function layoutOf(heldView: GameView): SceneLayout {
  return heldView.mode === "human-pitching" ? "pitching" : "batting";
}

type PlaybackOptions = {
  readonly game: UseGameResult;
  readonly speed: PlaybackSpeed;
  readonly selection: PitchCommand;
  readonly holding: boolean;
  readonly swingReady: boolean;
  /** 保持される表示用の view。ユニフォーム色・カーソルの半径・人間打撃/守備の表示(カーソル・格子)に使う。 */
  readonly heldView: GameView;
  readonly onFinished: (seq: number) => void;
};

type Playback = {
  readonly stage3d: UseStage3dResult;
  readonly director: StageDirector;
  readonly controls: BattingControls;
};

/**
 * ステージ・時計・director・打撃操作の結線。操作可否や演出の入力には最新の view、表示(ユニフォーム色・カーソル・格子)には保持された view を使う。
 * CPU 打者の判定通知は `CPU_SWING_LEAD_MS` だけ前倒しする(人間打者は 0 = 従来どおり判定窓の後)。
 */
function usePlayback({ game, speed, selection, holding, swingReady, heldView, onFinished }: PlaybackOptions): Playback {
  const { view } = game;
  const humanBatting = view.mode === "human-batting";
  const stage3d = useStage3d({ quality: speed.timeScale > 1 ? "low" : "normal" });
  const { getElapsedMs, getSwingAtMs, holdArrivalFor, releaseArrival } = usePitchFlight({
    flight: view.flight,
    arriveAfterMs: view.arriveAfterMs,
    leadMs: humanBatting ? 0 : CPU_SWING_LEAD_MS,
    timeScale: speed.timeScale,
    onArrive: game.pitchArrived,
  });
  const { swingRecordRef, onSwing } = useSwingRecording(game);
  // 空き領域の実測。打撃/守備の切り替えでオーバーレイの高さが変わるので、レイアウトを再測定のキーに渡す。
  const { getSafeArea } = useSafeArea(stage3d.containerRef, layoutOf(heldView));
  const cursorSourceRef = useCursorSourceRef(view);
  const getCursorView = useCallback((): CursorView => cursorSourceRef.current(), [cursorSourceRef]);

  const director = useStageDirector({
    view,
    stage: stage3d.stage,
    holding,
    onFinished,
    getElapsedMs,
    getAspect: stage3d.getAspect,
    getSafeArea,
    getCursorView,
    swingRecordRef,
    aimCell: heldView.mode === "human-pitching" ? selection.cell : null,
    uniforms: heldView.uniforms,
    cursorVisible: heldView.mode === "human-batting",
    speed,
  });
  const controls = useBattingControls({
    enabled: humanBatting,
    holding,
    swingReady,
    cursorRadii: heldView.batter.cursorRadii,
    getSwingAtMs,
    holdArrivalFor,
    releaseArrival,
    onSwing,
    onSkip: director.skip,
    pickZone: stage3d.pickZone,
    getZoneRect: stage3d.getZoneRect,
    getViewSize: stage3d.getViewSize,
    getSafeArea,
  });
  useBindCursorSource(cursorSourceRef, controls.getCursorView);
  return { stage3d, director, controls };
}

/**
 * 試合の画面(3D ステージと操作)の統合 hook。`finishedSeq` を持ち、`holding = isHolding(view.outcome, finishedSeq)` を **render 中に導出**する
 * (effect で立てると 1 commit の隙間で `useCpuTurn` が先走る)。演出が終わる(またはスキップされる)まで次の投球を止める。
 * 返す `view` は演出の後に更新される表示用 view(N8)。`pitchReady`・`swingReady`・`throwing`・`holding` は最新の view から求める。
 */
export function useGameStage({ game, speed, selection }: UseGameStageOptions): UseGameStageResult {
  const { view } = game;
  const [finishedSeq, setFinishedSeq] = useState<number | null>(null);
  const holding = isHolding(view.outcome, finishedSeq);
  const heldView = useHeldView(view, holding);
  const swingReady = view.swingReady && !holding;
  const { stage3d, director, controls } = usePlayback({ game, speed, selection, holding, swingReady, heldView, onFinished: setFinishedSeq });

  useSkipInput({ holding, onSkip: director.skip });
  useCpuTurn({ cpuPitchPending: view.cpuPitchPending && !holding, turnKey: view.turnKey, cpuWaitMs: speed.cpuWaitMs, onCpuPitch: game.cpuPitch });

  return {
    view: heldView,
    holding,
    throwing: director.throwing,
    pitchReady: view.pitchReady && !holding && !director.throwing,
    swingReady,
    onThrow: () => director.startThrow(() => game.throwPitch(selection)),
    swingKind: controls.swingKind,
    setSwingKind: controls.setSwingKind,
    swingNow: controls.swingFromButton,
    stageProps: {
      containerRef: stage3d.containerRef,
      status: stage3d.status,
      telop: director.telop,
      pointerHandlers: controls.pointerHandlers,
      inputActive: view.mode === "human-batting",
      skipHint: holding,
      phase: director.phase,
      playKind: director.playKind,
      lastFlight: director.lastFlight,
      zoneRect: stage3d.zoneRect,
      marker: heldView.fieldMarker,
      timingCue: director.timingCue,
      lastTiming: director.lastTiming,
    },
  };
}
