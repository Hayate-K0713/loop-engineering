type StageTelopProps = {
  /** 表示する結果の文言。`null` のときは非表示(CSS のトランジションで消える)。 */
  readonly text: string | null;
};

/** 結果テロップ(「センター前ヒット!」など)。ステージ中央やや上に黄色の太字で出す装飾要素で、操作を受けず支援技術にも読ませない。 */
export function StageTelop({ text }: StageTelopProps) {
  return (
    <div className={text === null ? "bb-stage__telop" : "bb-stage__telop bb-stage__telop--show"} data-testid="stage-telop" aria-hidden="true">
      {text}
    </div>
  );
}
