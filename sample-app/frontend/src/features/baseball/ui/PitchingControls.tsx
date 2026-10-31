import type { MouseEvent, PointerEvent, SyntheticEvent } from "react";
import type { PitchInputPhase, PitchKind } from "../types/pitch";
import { PitchKindButtons, type PitchChip } from "./PitchKindButtons";

/** 「とめる!」のハンドラ。ゲージの停止は押した瞬間の時刻(`event.timeStamp`)で質が決まるので、イベントごと渡す。 */
export type StopHandler = (event: SyntheticEvent<HTMLButtonElement>) => void;

type PitchingControlsProps = {
  /** 操作ボタンを押せるか(最新の view に基づく。`holding`・windup 中・説明のカード表示中は偽)。 */
  readonly ready: boolean;
  readonly repertoire: readonly PitchChip[];
  readonly selectedKind: PitchKind;
  readonly onSelectKind: (kind: PitchKind) => void;
  /** 投球入力の状態(`PitchInputView.phase`)。人間守備でなければ `null`。`data-input-state` に反映し、`gauge` のときボタンを「とめる!」にする。 */
  readonly inputState: PitchInputPhase | null;
  /** 待機・狙い中の「投げる」(= 狙いを確定してゲージを始める)。 */
  readonly onThrow: () => void;
  /** ゲージ中の「とめる!」(= 停止して投球)。省略時は `onThrow` を呼ぶ。 */
  readonly onStop: StopHandler | undefined;
};

/** 操作ボタンの文言。ゲージ中だけ「とめる!」、それ以外は「投げる」。 */
export function throwButtonLabel(inputState: PitchInputPhase | null): string {
  return inputState === "gauge" ? "とめる!" : "投げる";
}

/** 長押しのメニューを出さない(「とめる!」を押し続けたときに、メニューが出て pointercancel になるのを防ぐ)。 */
function suppressContextMenu(event: MouseEvent<HTMLElement>): void {
  event.preventDefault();
}

/**
 * 投球の操作バー(球種チップ+操作ボタン。制御コンポーネント)。コース選択の格子は無い(狙いはステージのゾーンを直接なぞる)。
 * 操作ボタン(`throw-pitch`)は、待機・狙い中は「投げる」(click で `onThrow`)、ゲージ中は「とめる!」で、
 * 停止のタイミングを遅らせないよう pointerdown で `onStop` を呼ぶ(キーボードで押したときの click(`detail === 0`)も同じ)。
 */
export function PitchingControls({ ready, repertoire, selectedKind, onSelectKind, inputState, onThrow, onStop }: PitchingControlsProps) {
  const stopping = inputState === "gauge";
  const stop = (event: SyntheticEvent<HTMLButtonElement>): void => {
    if (onStop === undefined) {
      onThrow();
    } else {
      onStop(event);
    }
  };
  const onPointerDown = (event: PointerEvent<HTMLButtonElement>): void => {
    if (stopping) {
      stop(event);
    }
  };
  const onClick = (event: MouseEvent<HTMLButtonElement>): void => {
    if (!stopping) {
      onThrow();
    } else if (event.detail === 0) {
      stop(event);
    }
  };
  return (
    <section className="bb-pitching" data-testid="pitch-controls" data-ready={String(ready)} data-input-state={inputState ?? undefined} aria-label="投球操作">
      <PitchKindButtons repertoire={repertoire} selectedKind={selectedKind} onSelectKind={onSelectKind} />
      <button
        type="button"
        className={stopping ? "bb-button bb-button--primary bb-pitching__button bb-pitching__button--stop" : "bb-button bb-button--primary bb-pitching__button"}
        data-testid="throw-pitch"
        disabled={!ready || inputState === "throwing"}
        onPointerDown={onPointerDown}
        onClick={onClick}
        onContextMenu={suppressContextMenu}
      >
        {throwButtonLabel(inputState)}
      </button>
    </section>
  );
}
