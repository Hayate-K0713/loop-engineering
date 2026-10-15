import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { scaleRadiiForPitch } from "../model/batting/contact";
import { sceneFrameAt, type SceneFrameInput } from "../model/world/sequence/frame";
import { planPlay, type PlayPlan } from "../model/world/sequence/play-plan";
import { isPlayFinished, phaseOf, planSwingOf, windupProgress, type SwingRecord } from "../model/world/sequence/session";
import { telopAt } from "../model/world/sequence/telop";
import { timingAt } from "../model/world/sequence/timing-cue";
import type { TimingCue } from "../types/batting";
import type { PlaybackSpeed } from "../types/game";
import type { CourseCell, PitchFlight } from "../types/pitch";
import type { SafeArea, SceneLayout, ScenePhase, UniformColors } from "../types/scene";
import type { StageHandle } from "../types/stage";
import type { GameView, PitchOutcomeView } from "../types/view";
import { useAnimationFrame, type FrameResult } from "./useAnimationFrame";
import type { CursorView } from "./useBattingControls";
import { useLatest } from "./useLatest";

type PlayKind = PitchOutcomeView["kind"];

type UseStageDirectorOptions = {
  /** 最新の view(制御用)。`flight`・`outcome`・`cpuPitchPending`・`pitchReady` を読む。表示用に保持された view ではない。 */
  readonly view: GameView;
  /** 3D ステージ。`null`(生成前・WebGL 不可・破棄後)でも演出の進行は止まらない(`apply` だけを省く)。 */
  readonly stage: StageHandle | null;
  /** 演出中(`isHolding`)。`useGameStage` が `finishedSeq` から導出して渡す。director は `finishedSeq` を持たない。 */
  readonly holding: boolean;
  /** 演出の終了(`plan.endMs` 到達)またはスキップで呼ぶ。`finishedSeq` を更新して `holding` を解除する。 */
  readonly onFinished: (seq: number) => void;
  /** `usePitchFlight` の `getElapsedMs`。演出の時計(リリースからの経過ゲーム時間)。 */
  readonly getElapsedMs: () => number;
  /** `useStage3d` の `getAspect`。ステージの現在の縦横比(幅 ÷ 高さ)。毎フレーム読んで `SceneFrameInput.aspect` に渡す。 */
  readonly getAspect: () => number;
  /** `useSafeArea` の `getSafeArea`。空き領域の実測値(測れなければ `null` = model が既定値を使う)。毎フレーム読んで `SceneFrameInput.safeArea` に渡す。 */
  readonly getSafeArea: () => SafeArea | null;
  /** スイングカーソルの位置と半径の getter(安定した関数)。`useBattingControls` との循環を避けるため ref 経由で受ける。 */
  readonly getCursorView: () => CursorView;
  /** 人間のスイング記録(`useGameStage` が `onSwing` で書き込む)。plan 作成時に読み、作成後に `null` へ戻す。 */
  readonly swingRecordRef: RefObject<SwingRecord | null>;
  /** 人間守備のとき選択中のセル。`null` なら5×5の格子も狙いのハイライトも出さない。 */
  readonly aimCell: CourseCell | null;
  /** 描画するユニフォーム色。**保持される表示用 view のもの**(3アウト目の演出中は旧配色のまま)。 */
  readonly uniforms: UniformColors;
  /** スイングカーソルを出すか(表示用 view が人間打撃)。 */
  readonly cursorVisible: boolean;
  readonly speed: PlaybackSpeed;
};

export type StageDirector = {
  /** 人間守備の windup 中(「投げる」押下からリリースまで)。`view.flight` が出たら偽に戻る。 */
  readonly throwing: boolean;
  /** 表示中のテロップの文言。区間外は `null`。 */
  readonly telop: string | null;
  readonly phase: ScenePhase;
  /** 演出中の `outcome.kind`(`data-play-kind` 用)。演出中でなければ `null`。 */
  readonly playKind: PlayKind | null;
  /** 最後に見た `flight`(`data-*` ミラー用。飛行が短くても E2E が取り逃さない)。 */
  readonly lastFlight: PitchFlight | null;
  /** 表示中のタイミング表示(`plan.timing` の区間内だけ。スキップで消える)。なければ `null`。 */
  readonly timingCue: TimingCue | null;
  /** 直近のスイングのタイミング(`data-timing` ミラー用)。plan ができたとき設定し、次の `flight` が出るまで保持する(スキップでは消さない)。 */
  readonly lastTiming: TimingCue | null;
  /** 捨てたスイングの回数(`data-swing-dropped` ミラー用。開発・E2E の観測用)。人間のスイングが入力されたのに、到達通知が先に処理されて見逃しが確定していた回数。 */
  readonly droppedSwings: number;
  /** 人間守備: windup を始め、`cpuWaitMs` 後に `onRelease()`(投球の dispatch)を呼ぶ。投げられない状況では何もしない。 */
  readonly startThrow: (onRelease: () => void) => void;
  /** 演出のスキップ。`holding` 中だけ有効で、表示だけを飛ばす(reducer・`GameState` に触れない。冪等)。 */
  readonly skip: () => void;
};

/** director の可変なセッション(ref に持つ)。React の再描画を起こさず、rAF とイベントハンドラから読み書きする。 */
type Session = {
  /** 飛行中、または演出中に保持している投球。`view.flight` が `null` になっても(人間のスイング後も)演出が終わるまで保持する。 */
  flight: PitchFlight | null;
  /** 解決した球の演出の時刻表。演出中だけ非 `null`。 */
  plan: PlayPlan | null;
  /** windup の開始時刻(`performance.now()`)。windup 中でなければ `null`。 */
  windupStartedAtMs: number | null;
  /** 捨てたスイングの回数(`planSwingOf` の `dropped`。この director が生きている間の累計)。 */
  droppedSwings: number;
};

/** 再描画を伴う表示用の state(DOM の `data-*` ミラー、テロップ、「投げる」の可否に使う)。 */
type Shown = {
  readonly telop: string | null;
  readonly throwing: boolean;
  readonly phase: ScenePhase;
  readonly playKind: PlayKind | null;
  readonly lastFlight: PitchFlight | null;
  readonly timingCue: TimingCue | null;
  readonly lastTiming: TimingCue | null;
  readonly droppedSwings: number;
};

type PatchShown = (change: Partial<Shown>) => void;

const INITIAL_SHOWN: Shown = {
  telop: null,
  throwing: false,
  phase: "idle",
  playKind: null,
  lastFlight: null,
  timingCue: null,
  lastTiming: null,
  droppedSwings: 0,
};

/** タイミング表示の同値判定。`timingAt` は毎フレーム新しいオブジェクトを返すので、参照ではなく値で比べる(再描画を増やさない)。 */
function sameCue(a: TimingCue | null, b: TimingCue | null): boolean {
  return a === b || (a !== null && b !== null && a.label === b.label && a.dtMs === b.dtMs);
}

function sameShown(a: Shown, b: Shown): boolean {
  return (
    a.telop === b.telop &&
    a.throwing === b.throwing &&
    a.phase === b.phase &&
    a.playKind === b.playKind &&
    a.lastFlight === b.lastFlight &&
    sameCue(a.timingCue, b.timingCue) &&
    sameCue(a.lastTiming, b.lastTiming) &&
    a.droppedSwings === b.droppedSwings
  );
}

/**
 * 表示用 state。`patch` は変化があるときだけ `setState` するので、毎フレーム呼んでも再描画は増えない
 * (直近に要求した値を ref に持って比較する。要求した値と描画された値は同じ順序で進む)。
 */
function useShown(): readonly [Shown, PatchShown] {
  const [shown, setShown] = useState<Shown>(INITIAL_SHOWN);
  const requestedRef = useRef<Shown>(INITIAL_SHOWN);
  const patch = useCallback<PatchShown>((change) => {
    const next: Shown = { ...requestedRef.current, ...change };
    if (!sameShown(next, requestedRef.current)) {
      requestedRef.current = next;
      setShown(next);
    }
  }, []);
  return [shown, patch];
}

/**
 * 投球(`view.flight`)が出たら session に取り込む。windup は終わり(`windupStartedAtMs` を戻す)、`throwing` も偽に戻す。
 * session の `flight` は `view.flight` が `null` になっても演出が終わるまで保持するので、**この layout effect だけ cleanup を付けない**
 * (cleanup で戻すと、人間のスイング直後に `flight` が消えて接触前の投球が描けなくなる)。ref と state への代入だけで解放する資源は無く、
 * StrictMode の再実行でも同じ値を入れ直すだけなので無害。
 */
function useFlightSession(sessionRef: RefObject<Session>, flight: PitchFlight | null, patch: PatchShown): void {
  useLayoutEffect(() => {
    if (flight === null) {
      return undefined;
    }
    sessionRef.current.flight = flight;
    sessionRef.current.windupStartedAtMs = null;
    patch({ lastFlight: flight, throwing: false, lastTiming: null });
    return undefined;
  }, [flight, sessionRef, patch]);
}

/**
 * 解決した球(`outcome.seq` が変わる)ごとに演出の時刻表を作る。人間のスイング記録は `seq` が一致するときだけ渡し、作成後に `null` へ戻す。
 * 時刻表の `resolvedAtMs`(受付時刻 = いまの経過ゲーム時間)は、スイングの判定時刻 `atMs`(遅延補正で過去になりうる)と区別して `planPlay` に渡す。
 * 人間のスイングがあれば、`plan.timing` から `lastTiming`(`data-timing` ミラー)を設定する(スイングなしは `null`)。
 * 対応する `flight` が session に無い(想定外)ときは、演出なしで即座に終了して進行を止めない。
 * layout effect なので、結果が commit された同じ tick で plan ができる(次のフレームから `play`)。cleanup で plan を破棄する。
 */
function usePlanSession(
  latest: RefObject<UseStageDirectorOptions>,
  sessionRef: RefObject<Session>,
  finishPlay: (seq: number) => void,
  patch: PatchShown,
  outcomeSeq: number | null,
): void {
  useLayoutEffect(() => {
    const { view, swingRecordRef, getElapsedMs } = latest.current;
    const outcome = view.outcome;
    if (outcome === null) {
      return undefined;
    }
    const session = sessionRef.current;
    const flight = session.flight;
    if (flight === null || flight.seq !== outcome.seq) {
      finishPlay(outcome.seq);
      return undefined;
    }
    const { swing, dropped } = planSwingOf(swingRecordRef.current, outcome);
    const plan = planPlay({ flight, outcome, swing, resolvedAtMs: getElapsedMs() });
    session.plan = plan;
    swingRecordRef.current = null;
    session.droppedSwings += dropped ? 1 : 0;
    patch({
      playKind: outcome.kind,
      lastTiming: plan.timing === null ? null : { label: plan.timing.label, dtMs: plan.timing.dtMs },
      droppedSwings: session.droppedSwings,
    });
    return () => {
      session.plan = null;
    };
  }, [outcomeSeq, latest, sessionRef, finishPlay, patch]);
}

/**
 * CPU 守備の windup。`wanted`(`cpuPitchPending && !holding`)が立った時点で開始時刻を記録する(立ち上がりごと、`turnKey` が変わるたびにやり直す)。
 * `useCpuTurn` が同じ条件で `cpuWaitMs` のタイマーを張るので、windup の長さはその待機時間と一致する。cleanup で開始時刻を戻す。
 */
function useCpuWindup(sessionRef: RefObject<Session>, wanted: boolean, turnKey: string): void {
  useEffect(() => {
    if (!wanted) {
      return undefined;
    }
    const session = sessionRef.current;
    session.windupStartedAtMs = performance.now();
    return () => {
      session.windupStartedAtMs = null;
    };
  }, [wanted, turnKey, sessionRef]);
}

/**
 * 人間守備の windup。押下で同期的に `throwing` を立て、`cpuWaitMs` 後に `onRelease()` を呼ぶ(`throwing` と windup の終了は `view.flight` が出たときに戻る)。
 * タイマーは unmount の cleanup で解除する。投げられない状況(`pitchReady` が偽・演出中・すでに windup 中)では何もしない。
 */
function useThrowStarter(latest: RefObject<UseStageDirectorOptions>, sessionRef: RefObject<Session>, patch: PatchShown): StageDirector["startThrow"] {
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    [],
  );

  return useCallback(
    (onRelease: () => void): void => {
      const { view, holding, speed } = latest.current;
      if (timerRef.current !== null || !view.pitchReady || holding) {
        return;
      }
      patch({ throwing: true });
      sessionRef.current.windupStartedAtMs = performance.now();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        onRelease();
      }, speed.cpuWaitMs);
    },
    [latest, sessionRef, patch],
  );
}

/** 構図のレイアウト。人間守備(`aimCell` あり = 守備レイアウト)は `"pitching"`、それ以外は `"batting"`。空き領域の再測定のキー(`useGameStage`)も同じ関数で決める。 */
export function layoutOf(aimCell: CourseCell | null): SceneLayout {
  return aimCell !== null ? "pitching" : "batting";
}

/**
 * 描画するスイングカーソル。投球(`session.flight`)があるあいだは、判定(`effectiveRadii`)と同じ球種の打ちにくさ補正(`cursorScale`)を半径に掛ける。
 * 投球がない間(待機中など)は補正なしの半径。
 */
function cursorOf(options: UseStageDirectorOptions, session: Session): SceneFrameInput["cursor"] {
  const { point, radii } = options.getCursorView();
  return { visible: options.cursorVisible, point, radii: session.flight === null ? radii : scaleRadiiForPitch(radii, session.flight.kind) };
}

/** 時刻 `tMs` の `sceneFrameAt` の入力を組み立てる。`play` 中も session に保持した `flight` を渡す(接触前の投球を描くため)。 */
function frameInputOf(options: UseStageDirectorOptions, session: Session, phase: ScenePhase, tMs: number, nowMs: number): SceneFrameInput {
  const windupStartedAtMs = session.windupStartedAtMs;
  return {
    phase,
    tMs,
    windupU: windupStartedAtMs === null ? 0 : windupProgress(nowMs, windupStartedAtMs, options.speed.cpuWaitMs),
    flight: session.flight,
    plan: session.plan,
    aspect: options.getAspect(),
    layout: layoutOf(options.aimCell),
    safeArea: options.getSafeArea(),
    uniforms: options.uniforms,
    cursor: cursorOf(options, session),
    aim: options.aimCell,
    grid: options.aimCell !== null,
  };
}

/**
 * 毎フレーム: 演出の終了判定 → フェーズ決定 → `sceneFrameAt` → `stage.apply` → 表示用 state の反映。
 * `stage` が `null` でも終了判定と反映は行い、`apply` だけを省く(これが止まると `holding` が解除されず試合が止まる)。
 */
function useDirectorLoop(
  latest: RefObject<UseStageDirectorOptions>,
  sessionRef: RefObject<Session>,
  finishPlay: (seq: number) => void,
  patch: PatchShown,
): void {
  useAnimationFrame((nowMs): FrameResult => {
    const options = latest.current;
    const session = sessionRef.current;
    const tMs = options.getElapsedMs();
    if (session.plan !== null && isPlayFinished(session.plan, tMs)) {
      finishPlay(session.plan.seq);
    }
    const phase = phaseOf({ hasPlan: session.plan !== null, hasFlight: session.flight !== null, windupActive: session.windupStartedAtMs !== null });
    options.stage?.apply(sceneFrameAt(frameInputOf(options, session, phase, tMs, nowMs)));
    patch({
      phase,
      telop: session.plan === null ? null : telopAt(session.plan, tMs),
      timingCue: session.plan === null ? null : timingAt(session.plan, tMs),
    });
    return "continue";
  }, "stage");
}

/**
 * 3D 演出の指揮者。解決した球(`view.outcome`)と投球(`view.flight`)から演出の時刻表を作り、毎フレーム `sceneFrameAt` の結果を `stage.apply` に渡す。
 * 演出の終了・スキップは `onFinished(seq)` で `useGameStage` の `finishedSeq` を更新して知らせる(`holding` はそこから導出され、ここでは立てない)。
 * 判定には関与しない(reducer への dispatch を一切呼ばない)。React state は表示用の `Shown` のみで、session は ref。
 */
export function useStageDirector(options: UseStageDirectorOptions): StageDirector {
  const [shown, patch] = useShown();
  const latest = useLatest(options);
  const sessionRef = useRef<Session>({ flight: null, plan: null, windupStartedAtMs: null, droppedSwings: 0 });
  const { view, holding } = options;

  // 演出を終える(終了判定・スキップ・想定外の共通処理)。plan・flight・テロップを破棄して idle に戻し、`finishedSeq` の更新を依頼する。
  const finishPlay = useCallback(
    (seq: number): void => {
      sessionRef.current.plan = null;
      sessionRef.current.flight = null;
      patch({ telop: null, playKind: null, phase: "idle", timingCue: null });
      latest.current.onFinished(seq);
    },
    [latest, patch],
  );

  // `holding` 中だけ有効。現在の `outcome.seq` で終了を知らせる(同じ seq の二重呼び出しは `finishedSeq` が変わらないので冪等)。
  const skip = useCallback((): void => {
    const current = latest.current;
    if (current.holding && current.view.outcome !== null) {
      finishPlay(current.view.outcome.seq);
    }
  }, [latest, finishPlay]);

  useFlightSession(sessionRef, view.flight, patch);
  usePlanSession(latest, sessionRef, finishPlay, patch, view.outcome === null ? null : view.outcome.seq);
  useCpuWindup(sessionRef, view.cpuPitchPending && !holding, view.turnKey);
  const startThrow = useThrowStarter(latest, sessionRef, patch);
  useDirectorLoop(latest, sessionRef, finishPlay, patch);

  return { ...shown, startThrow, skip };
}
