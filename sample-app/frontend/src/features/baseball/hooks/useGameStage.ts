import { useCallback, useLayoutEffect, useRef, useState, type PointerEventHandler, type RefObject } from "react";
import { INITIAL_CURSOR } from "../model/batting/cursor";
import { cellToPoint } from "../model/pitch/zone";
import { isHolding, recordSwing, type SwingRecord } from "../model/world/sequence/session";
import { CPU_SWING_LEAD_MS } from "../model/world/space/params";
import type { ContactQuality, IgnoredInputReason, SwingInput, SwingKind, SwingMeta, TimingCue } from "../types/batting";
import type { PlaybackSpeed } from "../types/game";
import type { CourseCell, PitchFlight, PitchInputView, PitchKind, PitchQuality } from "../types/pitch";
import type { GuideMode, ScenePhase } from "../types/scene";
import type { ScreenRect, StageStatus } from "../types/stage";
import type { BannerView, FieldMarkerView, GameView, PitchOutcomeView, TutorialStep, ZoneFeedbackView } from "../types/view";
import { useBattingControls, type BattingControls, type CursorView } from "./useBattingControls";
import { useCpuTurn } from "./useCpuTurn";
import type { UseGameResult } from "./useGame";
import { useGuidance, type Guidance } from "./useGuidance";
import { useHeldView } from "./useHeldView";
import { useLatest } from "./useLatest";
import { usePitchFlight } from "./usePitchFlight";
import type { PlaytestLogApi } from "./usePlaytestLog";
import { useInputRecorder, usePlaytestRecorder, type SwingLogEntry } from "./usePlaytestRecorder";
import type { PointerHandlers } from "./usePointerInput";
import type { PreferencesApi } from "./usePreferences";
import { useSafeArea } from "./useSafeArea";
import { useSkipInput } from "./useSkipInput";
import { useStage3d, type UseStage3dResult } from "./useStage3d";
import { layoutOf, useStageDirector, type StageDirector } from "./useStageDirector";

/** 人間守備の投球の選択(球種・コースのセル)。段階 A の守備は旧格子 UI のまま。投げるときにセル中心を狙い(`aim`)にする。 */
export type PitchSelection = {
  readonly kind: PitchKind;
  readonly cell: CourseCell;
};

type UseGameStageOptions = {
  readonly game: UseGameResult;
  readonly speed: PlaybackSpeed;
  /** 人間守備の投球の選択(球種・コース)。「投げる」押下時点の値で投げ、守備のレイアウトの判定にも使う。 */
  readonly selection: PitchSelection;
  /** 設定と説明の既読(ページ全体で 1 つ。「もう一度」で試合画面を作り直しても、メモリ上の既読・ヒントの回数が残る)。 */
  readonly prefs: PreferencesApi;
  /** 試遊ログ(ページ全体で 1 つ。試合をまたいで記録が残る)。`enabled` が偽なら何も記録しない。 */
  readonly log: PlaytestLogApi;
  /** 試遊ログ画面などを開いている間は真。説明のカードと同じく、次の投球と打撃の入力を止める(`holding` には混ぜない)。 */
  readonly externalPause: boolean;
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
  /** 捨てたスイングの回数(`data-swing-dropped` ミラー用。開発・E2E の観測用)。入力されたのに、見逃しが先に確定していたスイングの累計。 */
  readonly droppedSwings: number;
  /** 演出バナー(区間外は `null`)。バナーが出る間はテロップを出さない。 */
  readonly banner: BannerView | null;
  /** 現在の着弾点の予告・照準の見せ方(`data-guide-mode` ミラー用)。 */
  readonly guideMode: GuideMode;
  /** 人間守備の投球入力の公開ビュー(`data-input-state` 用)。人間守備でなければ `null`。 */
  readonly inputState: PitchInputView | null;
  /** 直近の投球の質(「ナイス」等の表示用)。なければ `null`。 */
  readonly pitchQuality: PitchQuality | null;
  /** 最初の数球の 1 行ヒント。なければ `null`。 */
  readonly hint: string | null;
  /** タップが通らなかったときの短いヒント(「ポンと おす」)。なければ `null`。 */
  readonly tapHint: string | null;
  /** 位置ずれ表示(DOM のミニ図)。なければ `null`。 */
  readonly zoneFeedback: ZoneFeedbackView | null;
};

type UseGameStageResult = {
  /** **表示用**の view(演出中は直前のまま保持)。`ScoreHud`・`NamePlates`・`Ticker`・操作バーの種類・`ResultScreen` の判定に使う。 */
  readonly view: GameView;
  /** 演出中。真の間は次の投球を始めず、`ResultScreen` も出さない(`view.result !== null && !holding` のとき表示)。 */
  readonly holding: boolean;
  /** 人間守備の windup 中。 */
  readonly throwing: boolean;
  /** `PitchingControls` の `ready`(= `pitch-controls` の `data-ready`)= 最新の `view.pitchReady && !holding && !throwing`。説明のカード・試遊ログ画面の表示中は偽。 */
  readonly pitchReady: boolean;
  /** `SwingControls` の `ready` = 最新の `view.swingReady && !holding`。説明のカード・試遊ログ画面の表示中は偽。 */
  readonly swingReady: boolean;
  /** 「投げる」ボタン(`PitchingControls` の `onThrow`)。windup のあと `selection` のセル中心を狙って投球する(質は `normal`)。 */
  readonly onThrow: () => void;
  /** `SwingControls` の `swingKind`・`onSelectSwingKind`・`onSwing`(pointerdown)。 */
  readonly swingKind: SwingKind;
  readonly setSwingKind: (kind: SwingKind) => void;
  /** スイングボタンの pointerdown 用(`useBattingControls` の `swingFromButton`)。イベントの時刻と入力種別から判定時刻を求める。 */
  readonly swingNow: PointerEventHandler<HTMLButtonElement>;
  readonly stageProps: GameStageViewProps;
  /** タイミングのピルの 2 行目(接触の質)。`GameLayout` の `contactQuality` に渡す。 */
  readonly contactQuality: ContactQuality | null;
  /** 説明のカード(`<Tutorial steps>`)。表示中だけ非 `null`。 */
  readonly tutorialSteps: readonly TutorialStep[] | null;
  /** 説明のカードの「はじめる」(既読を保存して閉じる)。 */
  readonly finishTutorial: () => void;
};

/**
 * 人間のスイング入力を `seq` 付きで記録し(1つの `seq` につき最初の1回だけ)、そのあとに `game.swing` を呼ぶ。
 * 記録は director が `planPlay` に渡し(`seq` が一致するときだけ)、plan 作成後に `null` へ戻す。試遊ログ用の付随情報(`meta`)も同じ規則で別に持つ。
 */
function useSwingRecording(game: UseGameResult): {
  readonly swingRecordRef: RefObject<SwingRecord | null>;
  readonly swingLogRef: RefObject<SwingLogEntry | null>;
  readonly onSwing: (input: SwingInput, meta: SwingMeta) => void;
} {
  const swingRecordRef = useRef<SwingRecord | null>(null);
  const swingLogRef = useRef<SwingLogEntry | null>(null);
  const latest = useLatest(game);
  const onSwing = useCallback(
    (input: SwingInput, meta: SwingMeta): void => {
      const { view, swing } = latest.current;
      if (view.flight !== null) {
        const seq = view.flight.seq;
        swingRecordRef.current = recordSwing(swingRecordRef.current, seq, input);
        swingLogRef.current = swingLogRef.current !== null && swingLogRef.current.seq === seq ? swingLogRef.current : { seq, input, meta };
      }
      swing(input);
    },
    [latest],
  );
  return { swingRecordRef, swingLogRef, onSwing };
}

/**
 * director が毎フレーム読むカーソルの getter の差し替え先 ref。director は `useBattingControls` より先に作る必要があり(`useBattingControls` が
 * `director.skip` を受けるため)、循環を切るために ref 経由の安定した getter を director に渡す。実体は `useBindCursorSource` が差し込む。
 */
function useCursorSourceRef(fallbackView: GameView): RefObject<() => CursorView> {
  // 最初の layout effect(`useBindCursorSource`)で差し替わるまでの仮の getter。director の最初のフレームより前に必ず差し替わる。
  return useRef<() => CursorView>(() => ({ point: INITIAL_CURSOR, raw: INITIAL_CURSOR, k: 0, radii: fallbackView.batter.cursorRadii.meet }));
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

type PlaybackOptions = {
  readonly game: UseGameResult;
  readonly speed: PlaybackSpeed;
  readonly selection: PitchSelection;
  /** 演出中(`isHolding`)。ポインタ・キーのスキップの可否に使う。 */
  readonly holding: boolean;
  /** 次の投球・windup を始めない(`holding` + 説明のカード・試遊ログ画面の表示中)。スキップの可否には使わない。 */
  readonly paused: boolean;
  /** 説明のカード・試遊ログ画面の表示中。打撃の入力(ポインタ・キー)を受けない。 */
  readonly overlayActive: boolean;
  readonly swingReady: boolean;
  /** 保持される表示用の view。ユニフォーム色・カーソルの半径・人間打撃/守備の表示(カーソル・格子)に使う。 */
  readonly heldView: GameView;
  readonly onFinished: (seq: number) => void;
  /** 押したのにスイングにならなかった入力(ヒントと試遊ログ)。 */
  readonly onIgnoredInput: (reason: IgnoredInputReason) => void;
  readonly onPointerCancel: () => void;
};

type Playback = {
  readonly stage3d: UseStage3dResult;
  readonly director: StageDirector;
  readonly controls: BattingControls;
  readonly swingLogRef: RefObject<SwingLogEntry | null>;
};

/**
 * ステージ・時計・director・打撃操作の結線。操作可否や演出の入力には最新の view、表示(ユニフォーム色・カーソル・格子)には保持された view を使う。
 * CPU 打者の判定通知は `CPU_SWING_LEAD_MS` だけ前倒しする(人間打者は 0 = 従来どおり判定窓の後)。
 */
function usePlayback(options: PlaybackOptions): Playback {
  const { game, speed, selection, holding, paused, overlayActive, swingReady, heldView, onFinished } = options;
  const { view } = game;
  const humanBatting = view.mode === "human-batting";
  const stage3d = useStage3d({ quality: speed.timeScale > 1 ? "low" : "normal" });
  const flightClock = usePitchFlight({
    flight: view.flight,
    arriveAfterMs: view.arriveAfterMs,
    leadMs: humanBatting ? 0 : CPU_SWING_LEAD_MS,
    timeScale: speed.timeScale,
    onArrive: game.pitchArrived,
  });
  const { swingRecordRef, swingLogRef, onSwing } = useSwingRecording(game);
  // 空き領域の実測。打撃/守備の切り替えでオーバーレイの高さが変わるので、レイアウトを再測定のキーに渡す。
  // 構図のレイアウトは director と同じ `layoutOf(aimCell)` で決める(人間守備は狙いのセルがあり、守備レイアウト)。
  const aimCell = heldView.mode === "human-pitching" ? selection.cell : null;
  const { getSafeArea } = useSafeArea(stage3d.containerRef, layoutOf(aimCell));
  const cursorSourceRef = useCursorSourceRef(view);
  const getCursorView = useCallback((): CursorView => cursorSourceRef.current(), [cursorSourceRef]);

  const director = useStageDirector({
    view,
    stage: stage3d.stage,
    holding,
    paused,
    onFinished,
    getElapsedMs: flightClock.getElapsedMs,
    getAspect: stage3d.getAspect,
    getSafeArea,
    getCursorView,
    getZoneRect: stage3d.getZoneRect,
    swingRecordRef,
    aimCell,
    uniforms: heldView.uniforms,
    cursorVisible: heldView.mode === "human-batting",
    speed,
  });
  const controls = useBattingControls({
    enabled: humanBatting && !overlayActive,
    holding,
    swingReady,
    cursorRadii: heldView.batter.cursorRadii,
    difficulty: view.difficulty,
    flight: view.flight,
    getElapsedMs: flightClock.getElapsedMs,
    getElapsedAtMs: flightClock.getElapsedAtMs,
    getSwingAtMs: flightClock.getSwingAtMs,
    holdArrivalFor: flightClock.holdArrivalFor,
    releaseArrival: flightClock.releaseArrival,
    onSwing,
    onIgnoredInput: options.onIgnoredInput,
    onPointerCancel: options.onPointerCancel,
    onSkip: director.skip,
    pickZone: stage3d.pickZone,
    getZoneRect: stage3d.getZoneRect,
    getViewSize: stage3d.getViewSize,
    getSafeArea,
  });
  useBindCursorSource(cursorSourceRef, controls.getCursorView);
  return { stage3d, director, controls, swingLogRef };
}

type StagePropsInput = {
  readonly playback: Playback;
  readonly view: GameView;
  readonly heldView: GameView;
  readonly holding: boolean;
  readonly guidance: Guidance;
};

/** 投球入力の公開ビュー(`data-input-state`)。段階 A の人間守備は旧格子 UI なので、常に待機(`idle`)。人間守備でなければ `null`。 */
function inputStateOf(mode: GameView["mode"]): PitchInputView | null {
  return mode === "human-pitching" ? { phase: "idle", aim: INITIAL_CURSOR, gaugeElapsedMs: null, quality: null } : null;
}

/** `StageView` に渡す props。バナー・投球の質は段階 B 以降なので、段階 A では常に `null`。 */
function stagePropsOf({ playback, view, heldView, holding, guidance }: StagePropsInput): GameStageViewProps {
  const { stage3d, director, controls } = playback;
  const humanBatting = view.mode === "human-batting";
  return {
    containerRef: stage3d.containerRef,
    status: stage3d.status,
    telop: director.telop,
    pointerHandlers: controls.pointerHandlers,
    inputActive: humanBatting,
    skipHint: holding,
    phase: director.phase,
    playKind: director.playKind,
    lastFlight: director.lastFlight,
    zoneRect: stage3d.zoneRect,
    marker: heldView.fieldMarker,
    timingCue: director.timingCue,
    lastTiming: director.lastTiming,
    droppedSwings: director.droppedSwings,
    banner: null,
    guideMode: heldView.mode === "human-batting" ? heldView.assist.preview : "none",
    inputState: inputStateOf(heldView.mode),
    pitchQuality: null,
    hint: guidance.hint,
    tapHint: guidance.tapHint,
    zoneFeedback: director.zoneFeedback,
  };
}

/** 押したのにスイングにならなかった入力を、ヒント(長押し・移動のとき)と試遊ログの両方へ流す。 */
function useIgnoredInputHandler(
  noteIgnored: (reason: IgnoredInputReason) => void,
  recordIgnored: (reason: IgnoredInputReason) => void,
): (reason: IgnoredInputReason) => void {
  return useCallback(
    (reason: IgnoredInputReason): void => {
      noteIgnored(reason);
      recordIgnored(reason);
    },
    [noteIgnored, recordIgnored],
  );
}

/**
 * 試合の画面(3D ステージと操作)の統合 hook。`finishedSeq` を持ち、`holding = isHolding(view.outcome, finishedSeq)` を **render 中に導出**する
 * (effect で立てると 1 commit の隙間で `useCpuTurn` が先走る)。演出が終わる(またはスキップされる)まで次の投球を止める。
 * 返す `view` は演出の後に更新される表示用 view(N8)。`pitchReady`・`swingReady`・`throwing`・`holding` は最新の view から求める。
 * 説明のカード・試遊ログ画面の表示中(`overlayActive`。後者は `externalPause`)も次の投球を止めるが、`holding` には混ぜない(その間の入力がスキップ扱いにならない)。
 */
export function useGameStage({ game, speed, selection, prefs, log, externalPause }: UseGameStageOptions): UseGameStageResult {
  const { view } = game;
  const [finishedSeq, setFinishedSeq] = useState<number | null>(null);
  const holding = isHolding(view.outcome, finishedSeq);
  const heldView = useHeldView(view, holding);
  const guidance = useGuidance({ view, heldView, holding, prefs });
  const inputRecorder = useInputRecorder(log);
  const overlayActive = guidance.tutorialActive || externalPause;
  const paused = holding || overlayActive;
  const swingReady = view.swingReady && !paused;

  const onIgnoredInput = useIgnoredInputHandler(guidance.noteIgnored, inputRecorder.recordIgnored);
  const playback = usePlayback({
    game,
    speed,
    selection,
    holding,
    paused,
    overlayActive,
    swingReady,
    heldView,
    onFinished: setFinishedSeq,
    onIgnoredInput,
    onPointerCancel: inputRecorder.recordPointerCancel,
  });
  const { stage3d, director, controls, swingLogRef } = playback;
  usePlaytestRecorder({
    log,
    view,
    heldView,
    lastFlight: director.lastFlight,
    zoneRect: stage3d.zoneRect,
    stage: stage3d.stage,
    swingLogRef,
    phase: director.phase,
  });

  useSkipInput({ holding, onSkip: director.skip });
  useCpuTurn({ cpuPitchPending: view.cpuPitchPending && !paused, turnKey: view.turnKey, cpuWaitMs: speed.cpuWaitMs, onCpuPitch: game.cpuPitch });

  return {
    view: heldView,
    holding,
    throwing: director.throwing,
    pitchReady: view.pitchReady && !paused && !director.throwing,
    swingReady,
    onThrow: () => director.startThrow(() => game.throwPitch({ kind: selection.kind, aim: cellToPoint(selection.cell), quality: "normal" })),
    swingKind: controls.swingKind,
    setSwingKind: controls.setSwingKind,
    swingNow: controls.swingFromButton,
    stageProps: stagePropsOf({ playback, view, heldView, holding, guidance }),
    contactQuality: director.contactQuality,
    tutorialSteps: guidance.tutorialSteps,
    finishTutorial: guidance.finishTutorial,
  };
}
