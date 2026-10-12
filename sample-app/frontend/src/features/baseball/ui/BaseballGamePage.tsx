import { lazy, Suspense, useState } from "react";
import { createRandomSeed } from "../hooks/random-seed";
import { useLaunchParams } from "../hooks/useLaunchParams";
import type { GameConfig, Innings } from "../types/game";
import "./baseball.css";
import "./baseball-stage.css";
import { TitleScreen } from "./TitleScreen";

// three を含む試合画面は遅延ロードする(`/` とタイトル画面のバンドルに three を入れない)。
const GameScreen = lazy(() => import("./GameScreen").then((module) => ({ default: module.GameScreen })));

const DEFAULT_INNINGS: Innings = 3;

type Run = {
  readonly config: GameConfig;
  readonly seed: number;
  /** 試合ごとの通し番号。`GameScreen` の `key` にして、「もう一度」で確実に再マウントする。 */
  readonly runId: number;
};

type PageState = {
  readonly runCount: number;
  /** `null` の間はタイトル画面。 */
  readonly run: Run | null;
};

const INITIAL_PAGE: PageState = { runCount: 0, run: null };

/**
 * ブラウザ野球のページ。タイトル↔試合の切替は、この層の state(`run`)で行う。
 * `?seed=`(開発ビルドのみ)は最初の1試合にのみ適用し、2試合目以降は乱数シードを新しく作る。
 * 画面は全面(`bb-page`)で、ヘッダは持たない。見出し(`h1`)は視覚的に隠し、ホームへの戻りは右上の小さなピルにする。
 * ピルは DOM の最後に置く(タイトル画面の本体 `.bb-title__body` と同じ z-index 1 なので、後ろに置いてタイトルの上で押せるようにする)。
 */
export function BaseballGamePage() {
  const launch = useLaunchParams();
  const [page, setPage] = useState<PageState>(INITIAL_PAGE);
  const { run } = page;

  const startRun = (config: GameConfig): void => {
    const seed = page.runCount === 0 && launch.seed !== null ? launch.seed : createRandomSeed();
    setPage({ runCount: page.runCount + 1, run: { config, seed, runId: page.runCount } });
  };
  const backToTitle = (): void => setPage({ runCount: page.runCount, run: null });

  return (
    <main className="bb-page">
      <h1 className="bb-visually-hidden">ブラウザ野球</h1>
      {run === null ? (
        <TitleScreen defaultInnings={launch.innings ?? DEFAULT_INNINGS} onStart={startRun} />
      ) : (
        <Suspense fallback={<p className="bb-page__loading">読み込み中…</p>}>
          <GameScreen
            key={run.runId}
            config={run.config}
            seed={run.seed}
            speed={launch.speed}
            onRestart={() => startRun(run.config)}
            onBackToTitle={backToTitle}
          />
        </Suspense>
      )}
      <a className="bb-home-link" href="#/" data-testid="back-home">
        ホームへ戻る
      </a>
    </main>
  );
}
