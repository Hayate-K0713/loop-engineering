import type { GameView } from "../types/view";

type NamePlatesProps = {
  readonly batter: GameView["batter"];
  readonly pitcher: GameView["pitcher"];
  readonly pitchSpeedLabel: string;
};

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** スタミナの段階。バーの色分け(CSS)に使う。 */
function staminaLevel(percent: number): "high" | "mid" | "low" {
  if (percent >= 60) return "high";
  if (percent >= 30) return "mid";
  return "low";
}

function PitcherPlate({ pitcher, pitchSpeedLabel }: Pick<NamePlatesProps, "pitcher" | "pitchSpeedLabel">) {
  const stamina = clampPercent(pitcher.staminaPercent);
  return (
    <div className="bb-plate bb-plate--pitcher">
      <p className="bb-plate__head">
        <span className="bb-plate__role">投手</span>
        <span className="bb-plate__name" data-testid="pitcher-name">
          {pitcher.name}
        </span>
      </p>
      <p className="bb-plate__meta">
        <span className="bb-plate__stat">
          球数 <b data-testid="pitch-count">{pitcher.pitchCount}</b>
        </span>
        <span className="bb-stamina" data-level={staminaLevel(stamina)} aria-hidden="true">
          <span className="bb-stamina__bar" style={{ width: `${stamina}%` }} />
        </span>
        <span className="bb-plate__stat" data-testid="pitcher-stamina">{`${stamina}%`}</span>
      </p>
      <p className="bb-plate__meta bb-plate__speed" data-testid="pitch-speed">
        {pitchSpeedLabel}
      </p>
    </div>
  );
}

function BatterPlate({ batter }: Pick<NamePlatesProps, "batter">) {
  return (
    <div className="bb-plate bb-plate--batter">
      <p className="bb-plate__head">
        <span className="bb-plate__role">打者</span>
        <span className="bb-plate__name" data-testid="batter-name">{`${batter.orderLabel} ${batter.name}`}</span>
      </p>
    </div>
  );
}

/**
 * 右上のネームプレート(投手と打者の2枚)。放送画面風に斜めに切ったプレートで、props のみで描く。
 * ルートは操作を受けない(タップはステージへ届く)。
 */
export function NamePlates({ batter, pitcher, pitchSpeedLabel }: NamePlatesProps) {
  return (
    <section className="bb-plates" data-testid="name-plates" aria-label="対戦情報">
      <PitcherPlate pitcher={pitcher} pitchSpeedLabel={pitchSpeedLabel} />
      <BatterPlate batter={batter} />
    </section>
  );
}
