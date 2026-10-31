import { useCallback, useEffect, useRef, useState } from "react";
import { firstBallHint, tapHintFor, tutorialStepsFor } from "../model/tutorial/steps";
import type { IgnoredInputReason } from "../types/batting";
import type { GameView, TutorialStep } from "../types/view";
import { useLatest } from "./useLatest";
import type { PreferencesApi } from "./usePreferences";

/** タップが通らなかったときのヒントを出しておく時間(ms)。 */
const TAP_HINT_MS = 2200;

type UseGuidanceOptions = {
  /** 最新の view(説明を出すか・球が解決したかの判定に使う)。 */
  readonly view: GameView;
  /** 表示用に保持された view(ヒントを出すモード・球が解決した時点のモードの判定に使う)。 */
  readonly heldView: GameView;
  /** 演出中(`isHolding`)。演出中は説明のカードもヒントも出さない。 */
  readonly holding: boolean;
  readonly prefs: PreferencesApi;
};

export type Guidance = {
  /** 説明のカードを出している間は真。次の投球を始めず、ステージの入力を受けない(`holding` とは別のフラグ)。 */
  readonly tutorialActive: boolean;
  /** 説明のカード(表示中だけ。非表示は `null`)。 */
  readonly tutorialSteps: readonly TutorialStep[] | null;
  /** 最後のページの「はじめる」。既読を保存してカードを閉じる。 */
  readonly finishTutorial: () => void;
  /** 最初の数球の 1 行ヒント。なければ `null`。 */
  readonly hint: string | null;
  /** タップが通らなかったときの短いヒント(表示中だけ)。なければ `null`。 */
  readonly tapHint: string | null;
  /** 押したのにスイングにならなかった理由を受ける(長押し・移動のときだけヒントを出す)。 */
  readonly noteIgnored: (reason: IgnoredInputReason) => void;
};

/**
 * タップが通らなかったときのヒント。理由を受けると、出した回数が上限未満なら `TAP_HINT_MS` だけ文言を出し、回数を保存する。
 * タイマーは unmount の cleanup で解除する。
 */
function useTapHint(prefs: PreferencesApi): { readonly tapHint: string | null; readonly noteIgnored: (reason: IgnoredInputReason) => void } {
  const [tapHint, setTapHint] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const latestPrefs = useLatest(prefs);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    [],
  );

  const noteIgnored = useCallback(
    (reason: IgnoredInputReason): void => {
      const { prefs: current, bumpHint } = latestPrefs.current;
      const text = tapHintFor(reason, current.hintCounts.tap);
      if (text === null) {
        return;
      }
      bumpHint("tap");
      setTapHint(text);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setTapHint(null);
      }, TAP_HINT_MS);
    },
    [latestPrefs],
  );
  return { tapHint, noteIgnored };
}

/**
 * 球が解決するたびに、人間の打撃の球数ヒントの回数を 1 つ進める(解決した時点のモードが人間打撃のときだけ)。
 * 同じ球で二重に進めない(StrictMode の effect の再実行・再描画に対して冪等)。
 */
function useBattingHintCount(view: GameView, heldView: GameView, prefs: PreferencesApi): void {
  const latestPrefs = useLatest(prefs);
  const bumpedSeqRef = useRef<number | null>(null);
  const outcomeSeq = view.outcome === null ? null : view.outcome.seq;
  const battingNow = heldView.mode === "human-batting";
  useEffect(() => {
    if (outcomeSeq === null || bumpedSeqRef.current === outcomeSeq) {
      return;
    }
    bumpedSeqRef.current = outcomeSeq;
    if (battingNow) {
      latestPrefs.current.bumpHint("batting");
    }
  }, [outcomeSeq, battingNow, latestPrefs]);
}

/**
 * 説明(チュートリアル)と最初の数球のヒント。段階 A の説明は**打撃のカードだけ**(人間守備は旧格子 UI のままで、投球のカードの文言
 * 「ゾーンを なぞって ねらう」と合わないため。段階 B で投球のカードとヒントを出す)。
 * カードは初めて人間が打つとき(未読・演出中でない・人間打撃)に 1 球目の前に出し、`tutorialActive` の間は呼び出し側が投球と入力を止める。
 */
export function useGuidance({ view, heldView, holding, prefs }: UseGuidanceOptions): Guidance {
  const { tapHint, noteIgnored } = useTapHint(prefs);
  useBattingHintCount(view, heldView, prefs);
  const battingNow = view.mode === "human-batting";
  const tutorialActive = battingNow && !holding && !prefs.tutorialSeen;
  const hint = heldView.mode === "human-batting" && !tutorialActive && !holding ? firstBallHint("batting", prefs.prefs.hintCounts.batting) : null;
  return {
    tutorialActive,
    tutorialSteps: tutorialActive ? tutorialStepsFor("batting") : null,
    finishTutorial: prefs.markTutorialSeen,
    hint,
    tapHint,
    noteIgnored,
  };
}
