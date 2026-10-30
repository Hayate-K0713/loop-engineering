import type { Half, RngState, Side, SideTally } from "./common";
import type { InPlayResult, BattedBall, PitchResult, PlateOutcome } from "./batting";
import type { PitchFlight, PitchKind } from "./pitch";
import type { Team } from "./team";

export type Difficulty = "easy" | "normal" | "hard";

export type Innings = 1 | 3 | 5 | 9;

/** 試合設定。`humanSide: null` は CPU 同士(テスト/バランス検証専用。UI では選べない)。 */
export type GameConfig = {
  readonly innings: Innings;
  readonly humanSide: Side | null;
  readonly difficulty: Difficulty;
};

/** カウント。不変条件: balls 0〜3、strikes 0〜2。 */
export type Count = {
  readonly balls: number;
  readonly strikes: number;
};

export type Bases = {
  readonly first: boolean;
  readonly second: boolean;
  readonly third: boolean;
};

/** 試合の進行フェーズ。`winner: null` は引き分け。 */
export type Phase =
  | { readonly kind: "await-pitch" }
  | { readonly kind: "in-flight"; readonly flight: PitchFlight }
  | { readonly kind: "game-over"; readonly winner: Side | null };

/** 各半イニングの得点。添字=イニング-1。未到達/スキップされた裏は配列長で表現する。 */
export type LineScore = {
  readonly away: readonly number[];
  readonly home: readonly number[];
};

export type LogEntry = {
  readonly seq: number;
  readonly text: string;
};

/** 直近のインプレー打球。`seq` はその投球の `pitchSeq`。 */
export type InPlayRecord = {
  readonly seq: number;
  readonly result: InPlayResult;
  readonly ball: BattedBall;
};

/** 試合の全状態。乱数状態 `rng` も含み、reducer は完全に純粋。 */
export type GameState = {
  readonly config: GameConfig;
  readonly teams: { readonly away: Team; readonly home: Team };
  readonly rng: RngState;
  /** 1始まり。 */
  readonly inning: number;
  readonly half: Half;
  /** 0〜2。3 は outcome から inning に渡す一時値。 */
  readonly outs: number;
  readonly count: Count;
  readonly bases: Bases;
  readonly lineScore: LineScore;
  readonly hits: SideTally;
  /** 守備側チームの失策数。 */
  readonly errors: SideTally;
  /** 各チームの現在の打者番号(0〜8)。 */
  readonly lineupIndex: SideTally;
  /** 各チームの投手の投球数。 */
  readonly pitchCounts: SideTally;
  /** 投球通し番号。 */
  readonly pitchSeq: number;
  /** 直前の投球の球種。攻守交代でリセットする。 */
  readonly lastPitchKind: PitchKind | null;
  /** 直近の1球の結果。 */
  readonly lastResult: PitchResult | null;
  /** 直近の1球で打席が終わったならその結果、続くなら null。 */
  readonly lastPlate: PlateOutcome | null;
  /** 直近のインプレー打球。インプレー以外の投球では更新せず保持し、攻守交代でもクリアしない。 */
  readonly lastInPlay: InPlayRecord | null;
  readonly phase: Phase;
  readonly log: readonly LogEntry[];
};

/** 起動パラメータ(`?seed=&innings=&fast=1`)の検証済みの値。 */
export type LaunchParams = {
  readonly seed: number | null;
  readonly innings: Innings | null;
  readonly fast: boolean;
};

/**
 * 再生速度。`timeScale` は壁時計の再生だけを速める倍率、`cpuWaitMs` は CPU 手番の待機時間(windup。通常 550)、
 * `humanWindupMs` は人間守備の windup(通常 280 / fast 20)。
 */
export type PlaybackSpeed = {
  readonly timeScale: number;
  readonly cpuWaitMs: number;
  readonly humanWindupMs: number;
};
