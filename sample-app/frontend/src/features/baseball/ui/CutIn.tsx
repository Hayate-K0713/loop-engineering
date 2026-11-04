import type { CSSProperties } from "react";
import type { WipeView } from "../types/view";
import "./CutIn.css";

/**
 * 縁取りの下の帯に出す補足(`WipeView.label` = 名前の行の、もう 1 行と背番号)。どちらも省略できる。
 * `role` = 「ヒット!」「三振」「ナイスピッチ!」「打席」などの役割・場面のラベル、`number` = 背番号。
 */
export type CutInDetail = {
  readonly number: number | null;
  readonly role: string | null;
};

type CutInProps = {
  /** ワイプの DOM 側の表示(矩形は model が決めた px。キャンバス左上基準)。出さないときは `null`。 */
  readonly wipe: WipeView | null;
  /** 補足(背番号・役割ラベル)。省略・`null` なら名前の行だけ。 */
  readonly detail?: CutInDetail | null;
};

/** 帯の 2 行目。役割ラベルがあればそれ、なければ背番号(「背番号 18」)。どちらも無ければ `null`。 */
function secondLine(detail: CutInDetail | null): string | null {
  if (detail === null) {
    return null;
  }
  if (detail.role !== null) {
    return detail.role;
  }
  return detail.number === null ? null : `背番号 ${detail.number}`;
}

/**
 * ワイプ(顔アップ)の縁取り・名前・背番号・役割ラベル。顔そのものは canvas の第 2 パスが `wipe.rect` に描くので、
 * ここは同じ矩形に縁を重ね、名前・役割の帯は矩形の**下の外側**に付けるだけ(顔の目・口に帯を重ねない。新しい描画はしない)。操作は受けず(`pointer-events: none`)、支援技術にも読ませない。
 * 位置と大きさは props の矩形のまま(model が HUD の下端などから決める)。区間外・矩形が不正なときは何も描かない。
 */
export function CutIn({ wipe, detail = null }: CutInProps) {
  if (wipe === null || !wipe.visible || wipe.rect.width <= 0 || wipe.rect.height <= 0) {
    return null;
  }
  const { x, y, width, height } = wipe.rect;
  const box: CSSProperties = { left: x, top: y, width, height };
  const sub = secondLine(detail);
  const badge = detail !== null && detail.role !== null && detail.number !== null ? detail.number : null;
  return (
    <div className="bb-cutin" data-testid="cut-in" aria-hidden="true" style={box}>
      {badge === null ? null : (
        <span className="bb-cutin__number" data-testid="cut-in-number">
          {badge}
        </span>
      )}
      {wipe.label === null && sub === null ? null : (
        <p className="bb-cutin__caption">
          {wipe.label === null ? null : (
            <span className="bb-cutin__name" data-testid="cut-in-name">
              {wipe.label}
            </span>
          )}
          {sub === null ? null : (
            <span className="bb-cutin__role" data-testid="cut-in-role">
              {sub}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
