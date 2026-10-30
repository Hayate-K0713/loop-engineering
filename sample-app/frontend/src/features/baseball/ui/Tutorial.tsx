import { useState } from "react";
import type { TutorialStep } from "../types/view";
import "./Tutorial.css";

type TutorialProps = {
  /** カード(通常 3 ページ。`model/tutorial` の `tutorialStepsFor` の結果を親が渡す)。 */
  readonly steps: readonly TutorialStep[];
  /** 最後のページの「はじめる」を押したとき(既読の保存と、次の投球の開始は親の責務)。 */
  readonly onFinish: () => void;
};

/** カードの絵(CSS だけで描く。`illustration` の値でクラスを切り替える。指・カーソル・点・リングなどの部品を、種類ごとに組み合わせる)。 */
function Illustration({ kind }: { readonly kind: TutorialStep["illustration"] }) {
  return (
    <div className={`bb-tutorial__art bb-tutorial__art--${kind}`} aria-hidden="true" data-testid="tutorial-art" data-art={kind}>
      <span className="bb-tutorial__zone" />
      <span className="bb-tutorial__ring" />
      <span className="bb-tutorial__target" />
      <span className="bb-tutorial__cursor" />
      <span className="bb-tutorial__finger" />
      <span className="bb-tutorial__chips">
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}

/** ページ送りの点(現在のページが黄)。 */
function PageDots({ count, index }: { readonly count: number; readonly index: number }) {
  return (
    <p className="bb-tutorial__dots" aria-hidden="true">
      {Array.from({ length: count }, (_, page) => (
        <span key={page} className={page === index ? "bb-tutorial__dot-page bb-tutorial__dot-page--current" : "bb-tutorial__dot-page"} />
      ))}
    </p>
  );
}

/**
 * 遊び方の説明カード(タップ方式。「つぎへ」→「はじめる」)。全面の幕で背後の入力を受け止め、表示中のゲームの進行は親(`tutorialActive`)が止める。
 * ボタンは 44px 以上。`autoFocus` は付けない(押しっぱなしの Enter/Space の repeat が、出た直後のボタンを押さないように)。
 */
export function Tutorial({ steps, onFinish }: TutorialProps) {
  const [index, setIndex] = useState(0);
  const step = steps.at(index);
  if (step === undefined) {
    return null;
  }
  const isLast = index >= steps.length - 1;
  return (
    <div className="bb-tutorial" data-testid="tutorial" role="dialog" aria-modal="true" aria-labelledby="bb-tutorial-title">
      <div className="bb-tutorial__card" data-step={step.id}>
        <p className="bb-tutorial__page" data-testid="tutorial-page">
          {index + 1} / {steps.length}
        </p>
        <Illustration kind={step.illustration} />
        <h2 id="bb-tutorial-title" className="bb-tutorial__title" data-testid="tutorial-title">
          {step.title}
        </h2>
        <p className="bb-tutorial__body" data-testid="tutorial-body">
          {step.body}
        </p>
        <PageDots count={steps.length} index={index} />
        <button
          type="button"
          className="bb-button bb-button--primary bb-tutorial__next"
          data-testid="tutorial-next"
          onClick={() => (isLast ? onFinish() : setIndex(index + 1))}
        >
          {isLast ? "はじめる" : "つぎへ"}
        </button>
      </div>
    </div>
  );
}
