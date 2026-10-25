import type { Bases } from "../types/game";

type BaseMarkProps = {
  readonly cx: number;
  readonly cy: number;
  readonly occupied: boolean;
};

function BaseMark({ cx, cy, occupied }: BaseMarkProps) {
  return (
    <rect className={occupied ? "bb-base bb-base--occupied" : "bb-base"} x={cx - 6} y={cy - 6} width={12} height={12} transform={`rotate(45 ${cx} ${cy})`} />
  );
}

function describeRunners(bases: Bases): string {
  const names = [bases.first ? "1塁" : null, bases.second ? "2塁" : null, bases.third ? "3塁" : null].filter((name) => name !== null);
  return names.length === 0 ? "なし" : names.join("・");
}

type BaseDiamondProps = {
  readonly bases: Bases;
};

/** 走者の有無を示すダイヤモンド。本塁が下、1塁が右、2塁が上、3塁が左。 */
export function BaseDiamond({ bases }: BaseDiamondProps) {
  return (
    <svg
      className="bb-bases"
      data-testid="bases"
      data-first={String(bases.first)}
      data-second={String(bases.second)}
      data-third={String(bases.third)}
      viewBox="0 0 60 58"
      role="img"
      aria-label={`走者: ${describeRunners(bases)}`}
    >
      <polygon className="bb-bases__diamond" points="30,50 50,30 30,10 10,30" />
      <BaseMark cx={30} cy={10} occupied={bases.second} />
      <BaseMark cx={10} cy={30} occupied={bases.third} />
      <BaseMark cx={50} cy={30} occupied={bases.first} />
      <polygon className="bb-bases__home" points="24,50 36,50 36,54 30,58 24,54" />
    </svg>
  );
}
