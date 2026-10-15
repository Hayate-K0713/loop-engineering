import { test, expect, type Locator, type Page } from "@playwright/test";

// 注意: 起動パラメータ(?seed=&innings=&fast=1)は開発ビルド(import.meta.env.DEV)でのみ有効で、本番ビルドでは無視される。
// playwright.config.ts の webServer は `npm run dev`(vite dev)なので問題ないが、webServer を `vite preview` 等の
// 本番ビルドに変えるとパラメータが無視されてこのファイルのテストが壊れる。
//
// 画面は three.js の 3D ステージ全面(`stage-3d`)+ その上に重ねた HUD・ネームプレート・ティッカー・操作バー。
// ヘッドレス Chromium の WebGL は SwiftShader(ソフトウェア描画)で重く、3D 画面では要素のクリックに数秒かかることがある。
// そのため (1) 固定の sleep は使わず、状態は `expect` の自動待機か `page.waitForFunction` で待つ、(2) 短い区間を狙う操作は
// 先にマウスを置いてから down/up だけを送る、(3) 速度に依存しない進行の検証は `fast=1`(演出が短く、描画品質も低い)で行う。

// 1試合(1イニング)の守備ターン数の上限。通常は十数回で終わるので、無限ループ防止の保険にすぎない。
const MAX_PITCH_TURNS = 300;

// 試合を結果画面まで通すテスト(テスト2・3・5)で使う seed。先攻・全球見送り・守備は中央ストレートで、延長に入らず 1 イニング(裏の途中)で
// 終わり、しかも投球数が少ない(3D 画面は 1 球ごとに 1〜2 秒かかるので、延長に入る・球数が多いとタイムアウト(120 秒)や 1 ターンの待ち(60 秒)を
// 超えて失敗しうる)。判定・CPU の変更(乱数の消費順)で試合の流れが変わるので、変えたら探し直す。
// 探し方: `model/game/reducer` を直接回す使い捨てのスクリプトで、`humanSide: "away"`・`innings: 1` の試合を、攻撃(表)は `PITCH_ARRIVED`(見送り)と
// `CPU_PITCH`、守備(裏)は中央ストレートの `THROW` で終了まで進め、`inning` が 1 のまま終わり、総投球数が少ない seed を選ぶ
// (2026-10-14 の探索: 1〜60 のうち 1 イニングで終わるのは 5,6,13,14,16,19,20,21,26,31,41,49,52,53,58,60。総投球数 14 の 31 を採用。
// 旧 seed 47 は判定の再調整で 4 回まで延びて 2 分近くかかるようになった)。
const GAME_SEED = 31;

// 演出スキップのテスト(テスト4)で使う seed。「後攻・中央(2,2)+ストレート」で投げた 1 球目が `in-play`(滞空+余韻で 2.5〜3 秒続く演出)になる。
// 試合ロジック(model/ 配下の判定・CPU・乱数の消費順)や投球の初期選択を変えると結果が変わるので、その場合は再探索が必要。
// 探し方: 上と同じスクリプトで `humanSide: "home"` の試合の 1 球目(`THROW` のあと `PITCH_ARRIVED`)の `lastInPlay` が非 null になる seed を選ぶ、
// または `?seed=N&innings=1#/baseball`(後攻を選んで開始)を seed を変えながら開き、中央ストレートを投げて `stage-3d` の
// `data-play-kind` が `in-play` になる N を選ぶ(2026-10-14 の探索: 1〜40 のうち 2,4,5,7,8,10,17,18,21,22,23,30,36,37 が in-play。7 を採用)。
const SKIP_SEED = 7;

// レイアウトの切り替えのテスト(テスト5b)で使う seed。「後攻」で始めると表は人間の守備(守備レイアウト)、3 アウトで裏に替わると人間の打撃
// (打撃レイアウト)になる。表が短く(中央ストレートで 5 球)、その間に得点されない seed を選ぶ(探し方は上と同じスクリプトで、`humanSide: "home"` の
// 表が終わるまでの投球数を数える。2026-10-14 の探索: 1〜40 のうち 4,8,35 が 5 球。4 を採用)。
const LAYOUT_SWITCH_SEED = 4;

// Space でスイングするテスト(テスト5)で使う seed。このテストは「飛行中に Space を押す → 早いスイングは必ず空振り(`swinging-strike`、
// 振った演出が約 0.9 秒続く)」だけに依存し、投球の中身(コース・球速)には依らない(seed 1〜4 で同じ結果を確認)。1 球目が飛行中にテストが
// 始まったときは次の投球で押す(`waitForNewFlight`)ので、試合の進行が少し変わっても壊れない。結果が変わるのは、早いスイングの判定
// (model/batting/ の接触判定)を変えたときで、その場合は `?seed=N&innings=1#/baseball`(先攻のまま開始)で飛行中に Space を押して
// `stage-3d` の `data-play-kind` が `swinging-strike` になることを確かめ直す。
const SWING_SEED = 1;

// Space でスイングしてから、`data-phase` が `play` のまま続いているべき時間(ms)。振った演出は約 0.9 秒続く。
const SWING_PLAY_HOLD_MS = 300;

// スキップ(pointerdown)から `data-phase="idle"` になるまでの許容時間(ms)。演出は最短でも約 2.5 秒続くので、これより十分短ければスキップが効いている。
const SKIP_RESPONSE_MS = 300;

/** 未捕捉の例外(`pageerror`)を溜める。`expect(errors).toEqual([])` で試合の最後に確認する。 */
function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

/** タイトルの選択肢(ボタンに見える `label`)の中の `input[type=radio]`。選択状態はこの `checked` で見る。 */
function radioOf(page: Page, optionTestId: string): Locator {
  return page.getByTestId(optionTestId).locator("input");
}

/** タイトルの「試合開始」を押し、3D ステージ(`stage-3d`)が現れるまで待つ。 */
async function startGame(page: Page): Promise<void> {
  await page.getByTestId("start-game").click();
  // 試合画面(three を含む遅延チャンク)の読み込みを待つため、既定より長めにする。
  await expect(page.getByTestId("stage-3d")).toBeVisible({ timeout: 30_000 });
}

/** `stage-3d` の `data-flight-seq`(最後に見た投球の通し番号)。まだ投球が無ければ `null`。 */
async function readFlightSeq(stage: Locator): Promise<number | null> {
  const text = await stage.getAttribute("data-flight-seq");
  return text === null ? null : Number(text);
}

/** 最初の守備ターン: 初期選択は中央で、投球後も選択が保持される。投球で `stage-3d` の飛行の記録(seq・着弾点)が更新される。 */
async function throwFirstPitchAndCheck(page: Page): Promise<void> {
  const stage = page.getByTestId("stage-3d");
  const centerCell = page.getByTestId("course-cell-2-2");
  await expect(centerCell).toHaveAttribute("aria-pressed", "true");
  const seqBefore = await readFlightSeq(stage);

  await page.getByTestId("throw-pitch").click();

  await expect(centerCell).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => readFlightSeq(stage)).toBeGreaterThan(seqBefore ?? -1);
  await expect(stage).toHaveAttribute("data-landing-x", /^-?\d+\.\d{3}$/);
  await expect(stage).toHaveAttribute("data-landing-y", /^-?\d+\.\d{3}$/);
}

/**
 * 結果画面が出るまで試合を進める。人間は攻撃中は何も操作せず(全球見送り)、守備中は「投げる」が押せるようになるたびに投球する。
 * 初期選択は中央(2,2)+ストレートなので、選択操作は不要。ループ内で `isEnabled()` などを使わないのは、
 * 要素が無いときに既定のタイムアウトまで待ってしまうため(見えるかどうかは `expect(...).toBeVisible()`・`isVisible()` で見る)。
 */
async function playToResult(page: Page): Promise<void> {
  const result = page.getByTestId("result-screen");
  const ready = page.locator('[data-testid="pitch-controls"][data-ready="true"]');
  let firstThrowChecked = false;
  for (let turn = 0; turn < MAX_PITCH_TURNS; turn += 1) {
    // 結果画面か投球可能のどちらかが見えるまで待つ(人間の攻撃中・CPU の投球中はどちらも見えないので待つだけになる)。
    await expect(result.or(ready)).toBeVisible({ timeout: 60_000 });
    if (await result.isVisible()) {
      break;
    }
    if (firstThrowChecked) {
      await page.getByTestId("throw-pitch").click();
    } else {
      await throwFirstPitchAndCheck(page);
      firstThrowChecked = true;
    }
  }
  await expect(result).toBeVisible();
  expect(firstThrowChecked).toBe(true);
}

/** 結果画面の最終スコアと、HUD(`ScoreHud`)の得点がどちらも整数で出ている。 */
async function expectScoresShown(page: Page): Promise<void> {
  await expect(page.getByTestId("final-score-away")).toHaveText(/^\d+$/);
  await expect(page.getByTestId("final-score-home")).toHaveText(/^\d+$/);
  await expect(page.getByTestId("score-away")).toHaveText(/^\d+$/);
  await expect(page.getByTestId("score-home")).toHaveText(/^\d+$/);
}

test("navigates from the home page to the baseball game screen", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("open-baseball").click();

  await expect(page).toHaveURL(/#\/baseball$/);
  await expect(page.getByTestId("baseball-title")).toBeVisible();
  // ゲーム画面は従来画面の見出しを重複して出さない。
  await expect(page.getByRole("heading", { name: "loop-basic sample app" })).toHaveCount(0);
});

test("plays a one-inning game through to the result screen", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectPageErrors(page);

  await page.goto(`/?seed=${GAME_SEED}&innings=1&fast=1#/baseball`);
  // タイトルの選択肢はボタン群。`?innings=1` で 1回 が選択済み、攻守は先攻(表)が既定。
  await expect(radioOf(page, "setting-innings-1")).toBeChecked();
  await expect(radioOf(page, "setting-innings-3")).not.toBeChecked();
  await expect(radioOf(page, "setting-side-away")).toBeChecked();
  await startGame(page);

  // WebGL が使える環境では 3D ステージが ready になる(使えない環境ではここで失敗させて気づく)。
  await expect(page.getByTestId("stage-3d")).toHaveAttribute("data-status", "ready");
  await expect(page.getByTestId("scoreboard")).toBeVisible();
  // 旧フィールド図は廃止された。
  await expect(page.getByTestId("field-diagram")).toHaveCount(0);

  await playToResult(page);
  await expectScoresShown(page);
  expect(errors).toEqual([]);
});

test("plays through to the result screen even when WebGL is unavailable", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectPageErrors(page);

  // 3D のコンテキストだけを取れなくする(2D など他の種類は通す)。時計とゲートが renderer 非依存であることの検証。
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    const stub = function (this: HTMLCanvasElement, contextId: string, options?: unknown): RenderingContext | null {
      if (contextId === "webgl" || contextId === "webgl2" || contextId === "experimental-webgl") {
        return null;
      }
      return Reflect.apply(original, this, [contextId, options]) as RenderingContext | null;
    };
    HTMLCanvasElement.prototype.getContext = stub as typeof original;
  });

  await page.goto(`/?seed=${GAME_SEED}&innings=1&fast=1#/baseball`);
  await startGame(page);

  await expect(page.getByTestId("stage-3d")).toHaveAttribute("data-status", "unsupported");
  await expect(page.getByTestId("stage-fallback")).toBeVisible();
  await expect(page.getByTestId("scoreboard")).toBeVisible();

  await playToResult(page);
  await expectScoresShown(page);
  expect(errors).toEqual([]);
});

const SKIP_TRACE_KEY = "__skipTrace";

type SkipTrace = {
  /** 最初の pointerdown が届いた時点(キャプチャ段階)の `data-phase`。 */
  phaseAtPointerDown: string | null;
  pointerDownAt: number | null;
  /** pointerdown の後に `data-phase` が最初に `idle` になった時刻(`performance.now()`)。 */
  idleAt: number | null;
};

/**
 * ページ内で、最初の pointerdown の時刻と、そのあと `data-phase` が `idle` になる時刻を記録し始める。Playwright の往復遅延を含めずに
 * 「アプリがスキップに反応した速さ」だけを測るため。結果は `readSkipTrace` で受け取る。
 */
async function startSkipTrace(page: Page): Promise<void> {
  await page.evaluate((key) => {
    const stage = document.querySelector('[data-testid="stage-3d"]');
    const trace: SkipTrace = { phaseAtPointerDown: null, pointerDownAt: null, idleAt: null };
    Reflect.set(window, key, trace);
    window.addEventListener(
      "pointerdown",
      () => {
        if (trace.pointerDownAt === null) {
          trace.pointerDownAt = performance.now();
          trace.phaseAtPointerDown = stage?.getAttribute("data-phase") ?? null;
        }
      },
      { capture: true },
    );
    if (stage !== null) {
      new MutationObserver(() => {
        if (trace.pointerDownAt !== null && trace.idleAt === null && stage.getAttribute("data-phase") === "idle") {
          trace.idleAt = performance.now();
        }
      }).observe(stage, { attributes: true, attributeFilter: ["data-phase"] });
    }
  }, SKIP_TRACE_KEY);
}

/** pointerdown のあと `idle` になるまで待ち(最長 5 秒)、記録を返す。`idle` にならなければ `idleAt` は `null`。 */
async function readSkipTrace(page: Page): Promise<SkipTrace> {
  await page.waitForFunction((key) => (Reflect.get(window, key) as SkipTrace).idleAt !== null, SKIP_TRACE_KEY, { timeout: 5_000 }).catch(() => undefined);
  return page.evaluate((key) => Reflect.get(window, key) as SkipTrace, SKIP_TRACE_KEY);
}

/** `data-phase` を毎フレーム(rAF)見て、`phase` になった瞬間に解決する。`toHaveAttribute` のポーリングでは短い区間を取り逃す。 */
async function waitForPhase(page: Page, phase: string): Promise<void> {
  await page.waitForFunction((expected) => document.querySelector('[data-testid="stage-3d"]')?.getAttribute("data-phase") === expected, phase, {
    polling: "raf",
    timeout: 20_000,
  });
}

/** 描画フレームを 1 つ進める(「何も起きない」ことを、固定の sleep ではなくフレームを基準に確認するため)。 */
async function nextFrame(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

test("skips a play animation with a tap on the stage", async ({ page }) => {
  test.setTimeout(60_000);

  // 通常速度(`fast` なし)。in-play の演出は滞空+余韻で 2.5 秒以上続くので、スキップの有無を明確に区別できる。
  await page.goto(`/?seed=${SKIP_SEED}&innings=1#/baseball`);
  await page.getByTestId("setting-side-home").click();
  await expect(radioOf(page, "setting-side-home")).toBeChecked();
  await startGame(page);
  await expect(page.getByTestId("stage-3d")).toHaveAttribute("data-status", "ready");

  const stage = page.getByTestId("stage-3d");
  const box = await stage.boundingBox();
  if (box === null) {
    throw new Error("stage-3d has no bounding box");
  }
  // HUD(左上)・ネームプレート(右上)・ティッカーと操作バー(下部)のどれも無い、ステージ中央の少し上。
  const tapX = box.x + box.width / 2;
  const tapY = box.y + box.height * 0.3;

  // 人間守備: 中央・ストレート(初期選択)で 1 球目を投げる。
  const ready = page.locator('[data-testid="pitch-controls"][data-ready="true"]');
  await expect(ready).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("throw-pitch").click();
  // 投げるボタンの pointerdown を数えないよう、計測は投球の後に始める(演出が始まるまでには 1 秒以上ある)。
  await startSkipTrace(page);
  // 3D 画面ではマウス移動が遅いので、演出が始まる前に位置を決めておく(スキップの瞬間は down/up だけを送る)。
  await page.mouse.move(tapX, tapY);

  // 演出(play)が始まる瞬間を検出し、1 球目が in-play であることを確認してからタップする。
  await waitForPhase(page, "play");
  await expect(stage).toHaveAttribute("data-play-kind", "in-play");
  await page.mouse.down();
  await page.mouse.up();

  const skip = await readSkipTrace(page);
  expect(skip.phaseAtPointerDown).toBe("play");
  expect(skip.pointerDownAt).not.toBeNull();
  expect(skip.idleAt).not.toBeNull();
  expect((skip.idleAt ?? Number.POSITIVE_INFINITY) - (skip.pointerDownAt ?? 0)).toBeLessThanOrEqual(SKIP_RESPONSE_MS);
  await expect(stage).toHaveAttribute("data-phase", "idle");
  await expect(ready).toBeVisible();

  // 冪等性: idle 中にもう一度タップしても、何も起きない(演出は始まらず、投球もスイングもされず、得点も変わらない)。
  const awayBefore = await page.getByTestId("score-away").innerText();
  const homeBefore = await page.getByTestId("score-home").innerText();
  const seqBefore = await readFlightSeq(stage);
  await page.mouse.down();
  await page.mouse.up();
  await nextFrame(page);
  await nextFrame(page);
  await expect(stage).toHaveAttribute("data-phase", "idle");
  await expect(ready).toBeVisible();
  await expect(page.getByTestId("score-away")).toHaveText(awayBefore);
  await expect(page.getByTestId("score-home")).toHaveText(homeBefore);
  expect(await readFlightSeq(stage)).toBe(seqBefore);
});

// ---- スイングの E2E 共通: ページ内の記録(トレース)と、有効な試行だけを検証する枠組み ----
//
// SwiftShader の画面では Playwright の実入力がページに届くまで 0.2〜1 秒以上遅れる(docs/memory/entries/swiftshader-playwright-input-latency.md)。
// 投球の飛行は約 1.3〜1.4 秒なので、「飛行中に押す」「D より十分前に押す」といった時間窓を狙う検証は、環境が遅いと前提が崩れる。
// そのため、(1) 入力の時刻・飛行の開始時刻・D はページ内で記録し(Playwright の往復遅延を含めない)、(2) アプリが判定に使う時刻と同じ計算
// (`swingAtMs`)で「前提を満たした試行(有効な試行)」かどうかを見積もり、(3) 有効な試行だけを厳密に検証する。無効な試行(入力が遅れた)は
// 失敗にせず、次の投球で再試行する(最大 MAX_ATTEMPTS 回)。有効な試行で期待が崩れたら必ず失敗(回帰の検出)で、有効な試行が得られなければ
// 「環境が遅すぎる」と明示して失敗させる。
//
// 以下の定数はアプリの値の写し(spec は src を import しない)。値を変えたらここも合わせる。
// 対応する `BATTING_PARAMS`(model/batting/params.ts)・`input-route.ts` の名前をコメントに書く。

/** `BATTING_PARAMS.contactWindowMs`: 接触が成立するタイミング誤差の窓(±ms)。これより早い(Δt < −窓)スイングは必ず空振り。 */
const CONTACT_WINDOW_MS = 150;

/** `BATTING_PARAMS.inputLatencyMs.key`: キー入力の遅延補正(ms)。 */
const KEY_INPUT_LATENCY_MS = 20;

/** `BATTING_PARAMS.maxEventAgeMs`: `event.timeStamp` を判定に使ってよい、イベントから処理までの経過の上限(ms)。これを超えると処理時刻を使う。 */
const MAX_EVENT_AGE_MS = 250;

/** 「確実に早い」と言い切るための余裕(ms)。トレースの飛行開始時刻とアプリの開始時刻の差(同じ commit で同期的に反映されるので数 ms)を吸収する。 */
const EARLY_SAFETY_MARGIN_MS = 50;

/**
 * タップ系の試行で「確実にタップ」と言える押下→離しの長さの上限(ms)。`TAP_MAX_DURATION_MS`(`input-route.ts`)は 180ms。
 * 到達通知の保留(`TAP_ARRIVAL_HOLD_MS` 200ms)に収まる長さでもある。
 */
const SURE_TAP_MS = 150;

/** タップ系の試行で、押下の処理が D からこの時間(ms)以内なら到達通知(`BATTING_PARAMS.lateCutoffMs` 250ms)より十分前とみなす。 */
const TAP_ACCEPT_LIMIT_MS = 150;

/** 遅いタップで、離した処理が D からこの時間(ms)以上あとなら「ボールが着いてから離した」とみなす。 */
const LATE_RELEASE_MS = 50;

/** 遅いタップで、飛行開始から `D + この値` の時点で指を置く(Playwright の遅れを見込んで、D の少し手前に置く)。 */
const LATE_TAP_TRIGGER_MS = -30;

/** 有効な試行を得るための最大の試行回数。 */
const MAX_ATTEMPTS = 5;

/** スイングが受理されたときの `data-play-kind`。見逃し(`ball`/`called-strike`)にはならない。 */
const SWING_RESULT_KINDS = ["swinging-strike", "foul", "in-play"];

const FLIGHT_TRACE_KEY = "__flightTrace";

/** 入力イベントの記録(キャプチャ段階。アプリのハンドラより先に走る)。時刻はどれも `performance.now()` と同じ時計。 */
type InputRecord = {
  readonly kind: "keydown" | "pointerdown" | "pointerup" | "pointercancel";
  readonly isPrimary: boolean | null;
  /** `event.timeStamp`(ブラウザが入力を受け取った時刻)。 */
  readonly timeStamp: number;
  /** リスナが走った時刻 = アプリが入力を処理する時刻(`swingAtMs` の `nowMs` と同じとみなせる)。 */
  readonly handledAt: number;
  /** スイングボタンが押せる = アプリの `swingReady`(投球が出た commit で切り替わる)。 */
  readonly swingReady: boolean;
};

/** `stage-3d` の `data-phase`・`data-play-kind` が変わった時点の値(新しい値と `performance.now()`)。 */
type PhaseSnapshot = { phase: string; playKind: string | null; at: number };

type FlightTrace = {
  /** 直近に見た `data-flight-seq`(新しい投球の検出用)。 */
  seq: string | null;
  /**
   * 記録を始めたあとに新しい投球が出た時刻(`data-flight-seq` の更新を観測した時刻)と、その投球の D(`data-duration-ms`)。まだ無ければ `null`。
   * `data-flight-seq`・`data-duration-ms`・スイングボタンの有効化は、投球が出た同じ commit で更新される(アプリの開始時刻 `startedAtMs` も同じ commit)。
   */
  flightStartedAt: number | null;
  durationMs: number | null;
  inputs: InputRecord[];
  /** 最初の入力のあとの `data-phase`・`data-play-kind` の変化。 */
  snapshots: PhaseSnapshot[];
  /** 新しい投球が出てから見た `data-play-kind`(重複なし、順)。 */
  playKinds: string[];
  /** 新しい投球が出てから最後に見た `data-timing`・`data-timing-ms`(スイングが plan に渡ったときだけ付く)。 */
  timing: { label: string; ms: number } | null;
};

type TraceHandle = { readonly trace: FlightTrace; readonly reset: () => void };

/**
 * ページ内で入力と `stage-3d` の属性の変化を記録し始める(1 テストにつき 1 回)。演出が終わると `data-play-kind` などは消えるので、
 * あとから読むのでは遅い。`armFlightTrace` で記録を空に戻して次の試行を始め、`readFlightTrace` で受け取る。
 */
async function installFlightTrace(page: Page): Promise<void> {
  await page.evaluate((key) => {
    const stage = document.querySelector('[data-testid="stage-3d"]');
    if (stage === null) {
      throw new Error("stage-3d not found");
    }
    const trace: FlightTrace = { seq: null, flightStartedAt: null, durationMs: null, inputs: [], snapshots: [], playKinds: [], timing: null };
    const reset = (): void => {
      trace.seq = stage.getAttribute("data-flight-seq");
      trace.flightStartedAt = null;
      trace.durationMs = null;
      trace.inputs = [];
      trace.snapshots = [];
      trace.playKinds = [];
      trace.timing = null;
    };
    reset();
    Reflect.set(window, key, { trace, reset } satisfies TraceHandle);

    const swingReady = (): boolean => {
      const button = document.querySelector<HTMLButtonElement>('[data-testid="swing-button"]');
      return button !== null && !button.disabled;
    };
    for (const kind of ["keydown", "pointerdown", "pointerup", "pointercancel"] as const) {
      window.addEventListener(
        kind,
        (event) => {
          if (event instanceof KeyboardEvent && event.repeat) {
            return;
          }
          const isPrimary = event instanceof PointerEvent ? event.isPrimary : null;
          trace.inputs.push({ kind, isPrimary, timeStamp: event.timeStamp, handledAt: performance.now(), swingReady: swingReady() });
        },
        { capture: true },
      );
    }
    new MutationObserver(() => {
      const now = performance.now();
      const seq = stage.getAttribute("data-flight-seq");
      if (seq !== trace.seq) {
        trace.seq = seq;
        if (trace.inputs.length === 0) {
          trace.flightStartedAt = now;
          trace.durationMs = Number(stage.getAttribute("data-duration-ms"));
        }
      }
      const playKind = stage.getAttribute("data-play-kind");
      if (trace.inputs.length > 0) {
        trace.snapshots.push({ phase: stage.getAttribute("data-phase") ?? "", playKind, at: now });
      }
      if (trace.flightStartedAt === null) {
        return;
      }
      if (playKind !== null && !trace.playKinds.includes(playKind)) {
        trace.playKinds.push(playKind);
      }
      const label = stage.getAttribute("data-timing");
      if (label !== null) {
        trace.timing = { label, ms: Number(stage.getAttribute("data-timing-ms")) };
      }
    }).observe(stage, { attributes: true, attributeFilter: ["data-phase", "data-play-kind", "data-flight-seq", "data-timing", "data-timing-ms"] });
  }, FLIGHT_TRACE_KEY);
}

/** 記録を空に戻す(次の試行の前)。この時点で見えている `data-flight-seq` より新しい投球だけを「新しい投球」とする。 */
async function armFlightTrace(page: Page): Promise<void> {
  await page.evaluate((key) => (Reflect.get(window, key) as TraceHandle).reset(), FLIGHT_TRACE_KEY);
}

async function readFlightTrace(page: Page): Promise<FlightTrace> {
  return page.evaluate((key) => (Reflect.get(window, key) as TraceHandle).trace, FLIGHT_TRACE_KEY);
}

/**
 * 記録を始めたあとに放たれた投球の飛行が始まるまで毎フレーム待つ。すでに飛行中の投球は対象にしない(試合開始時の 1 球目は
 * 3D の初期化の間に飛び始めていることがあり、入力が飛行の終わりにずれ込むと見送り扱いになってスイングの検証にならないため)。
 */
async function waitForNewFlight(page: Page): Promise<void> {
  await page.waitForFunction((key) => (Reflect.get(window, key) as TraceHandle).trace.flightStartedAt !== null, FLIGHT_TRACE_KEY, {
    polling: "raf",
    timeout: 30_000,
  });
}

/** 飛行の開始から `D + offsetMs` が経つまで毎フレーム待つ(`offsetMs` は負でもよい)。 */
async function waitForFlightElapsed(page: Page, offsetMs: number): Promise<void> {
  await page.waitForFunction(
    ({ key, offset }) => {
      const { flightStartedAt, durationMs } = (Reflect.get(window, key) as TraceHandle).trace;
      return flightStartedAt !== null && durationMs !== null && performance.now() - flightStartedAt >= durationMs + offset;
    },
    { key: FLIGHT_TRACE_KEY, offset: offsetMs },
    { polling: "raf", timeout: 10_000 },
  );
}

/**
 * 入力のあと、(a) 最初に `play` になってから `holdMs` が経つ、または (b) `idle` になる、のどちらかが起きるまで毎フレーム待ち
 * (最長 15 秒)、記録を返す。(b) は演出が飛ばされた(スキップされた)ことを表す。
 */
async function readTraceAfterPlay(page: Page, holdMs: number): Promise<FlightTrace> {
  await page.waitForFunction(
    ({ key, hold }) => {
      const { snapshots } = (Reflect.get(window, key) as TraceHandle).trace;
      const playedAt = snapshots.find((snapshot) => snapshot.phase === "play")?.at ?? null;
      return snapshots.some((snapshot) => snapshot.phase === "idle") || (playedAt !== null && performance.now() - playedAt >= hold);
    },
    { key: FLIGHT_TRACE_KEY, hold: holdMs },
    { polling: "raf", timeout: 15_000 },
  );
  return readFlightTrace(page);
}

/** 入力の処理時刻の、飛行開始からの経過(ms)。 */
function elapsedAt(trace: FlightTrace, input: InputRecord): number {
  return input.handledAt - (trace.flightStartedAt ?? Number.NaN);
}

/** アプリの `swingAtMs`(model/world/sequence/swing-time.ts)と同じ計算でスイングの判定時刻 `atMs` を見積もる(`timeScale` 1、補正 `latencyMs`)。 */
function estimateSwingAtMs(trace: FlightTrace, input: InputRecord, latencyMs: number): number {
  const age = input.handledAt - input.timeStamp;
  const eventMs = age >= 0 && age <= MAX_EVENT_AGE_MS ? input.timeStamp : input.handledAt;
  return eventMs - (trace.flightStartedAt ?? Number.NaN) - latencyMs;
}

/** 試行の診断用の文字列(有効な試行が得られなかったときの失敗メッセージに入れる)。 */
function describeAttempt(trace: FlightTrace): string {
  const inputs = trace.inputs.map(
    (input) => `${input.kind}${input.isPrimary === false ? "(2nd)" : ""}@${elapsedAt(trace, input).toFixed(0)}ms${input.swingReady ? "" : "(not ready)"}`,
  );
  return `D=${trace.durationMs} inputs=[${inputs.join(", ")}] kinds=[${trace.playKinds.join(",")}]`;
}

/** 1 つのスイングの検証。`act` が入力を送り、`isValid` が「前提を満たした試行か」を記録から判定する。 */
type SwingScenario = {
  readonly name: string;
  readonly act: (page: Page) => Promise<void>;
  readonly isValid: (trace: FlightTrace) => boolean;
};

/** 有効な試行が得られるまで、新しい投球ごとに `scenario.act` を繰り返し、有効だった試行の記録を返す。 */
async function runUntilValid(page: Page, scenario: SwingScenario): Promise<FlightTrace> {
  const rejected: string[] = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await armFlightTrace(page);
    await waitForNewFlight(page);
    await scenario.act(page);
    const trace = await readTraceAfterPlay(page, SWING_PLAY_HOLD_MS);
    if (scenario.isValid(trace)) {
      return trace;
    }
    rejected.push(describeAttempt(trace));
  }
  throw new Error(
    `${scenario.name}: no valid attempt in ${MAX_ATTEMPTS} tries (the environment is too slow to hit the timing window): ${rejected.join(" / ")}`,
  );
}

/** 先攻(既定)で人間の打撃から始め、投球の記録を取り始める。通常速度(CPU の投球の飛行は約 1.3〜1.4 秒)。 */
async function startBattingWithTrace(page: Page): Promise<void> {
  await page.goto(`/?seed=${SWING_SEED}&innings=1#/baseball`);
  await expect(radioOf(page, "setting-side-away")).toBeChecked();
  await startGame(page);
  await expect(page.getByTestId("stage-3d")).toHaveAttribute("data-status", "ready");
  await expect(page.getByTestId("stage-3d")).toHaveAttribute("data-zone-rect", ZONE_RECT_PATTERN);
  await installFlightTrace(page);
}

// Space でスイングした keydown が、そのまま演出のスキップにならない(テスト5): Space を扱う window のリスナは複数あり、
// スイング側が先に state を更新すると、ネイティブイベントのリスナ間のマイクロタスクで React が `holding = true` で再描画済みになる。
// スキップ側が `holding` だけで判定すると、スイングに使った同じ keydown で演出が飛ばされる(`flight` から `play` を経ずに `idle` になる)。
// 合成イベント(`dispatchEvent`)はリスナ間にマイクロタスクが挟まらず再現しないので、Playwright の実キー入力(`keyboard.down`)で送る。
//
// 有効な試行の条件(アプリの `swingAtMs` と同じ計算): keydown がスイング可能な間(`swingReady`)に届き、
// `atMs の見積もり = (keydown.timeStamp, ただし処理が 250ms より遅れたなら処理時刻) − 飛行の開始時刻 − 20 < D − 150(判定窓) − 50(余裕)`。
// つまり「確実に早いスイング」と言える試行だけを検証する(早いスイングは必ず空振り)。
const spaceSwingScenario: SwingScenario = {
  name: "Space swing",
  act: async (page) => {
    await page.keyboard.down("Space");
    await page.keyboard.up("Space");
  },
  isValid: (trace) => {
    const keyDown = trace.inputs.find((input) => input.kind === "keydown");
    if (keyDown === undefined || !keyDown.swingReady || trace.durationMs === null) {
      return false;
    }
    return estimateSwingAtMs(trace, keyDown, KEY_INPUT_LATENCY_MS) < trace.durationMs - CONTACT_WINDOW_MS - EARLY_SAFETY_MARGIN_MS;
  },
};

test("swinging with the Space key does not skip the play animation in the same keydown", async ({ page }) => {
  test.setTimeout(90_000);
  await startBattingWithTrace(page);

  const trace = await runUntilValid(page, spaceSwingScenario);

  // (1) スイングが受理された(`data-timing` は人間のスイングが plan に渡ったときだけ付く)。
  // (2) 確実に早いスイングなので「早い」で、Δt は判定窓より早い。
  expect(trace.timing).not.toBeNull();
  expect(trace.timing?.label).toBe("early");
  expect(trace.timing?.ms ?? 0).toBeLessThan(-CONTACT_WINDOW_MS);
  // (3) 早いスイングは必ず空振りで、見逃し(CPU 任せの判定)ではない。
  expect(trace.playKinds).toContain("swinging-strike");
  // (4) 飛行(flight)を抜けた最初の遷移は `play`(スキップされると `play` を経ずに `idle` になる)で、`play` に入ってからしばらくは
  // `idle` に戻らない(`holding` の間は、スキップされない限り演出が続く)。このテストの本来の目的。
  const left = trace.snapshots.find((snapshot) => snapshot.phase !== "flight");
  expect(left?.phase).toBe("play");
  const earlyIdle = trace.snapshots.filter((snapshot) => snapshot.phase === "idle" && snapshot.at - (left?.at ?? 0) < SWING_PLAY_HOLD_MS);
  expect(earlyIdle).toEqual([]);
});

type PagePoint = { readonly x: number; readonly y: number };

/** ステージ上のゾーン枠の中心(ページ座標)。ステージの入力面の上で、HUD・操作バーに覆われない位置。 */
async function zoneCenterOf(page: Page): Promise<PagePoint> {
  const stage = page.getByTestId("stage-3d");
  const stageBox = await stage.boundingBox();
  const zone = stageBox === null ? null : zoneRectInPage(stageBox, await stage.getAttribute("data-zone-rect"));
  if (zone === null) {
    throw new Error("stage-3d has no bounding box or data-zone-rect is invalid");
  }
  return { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 };
}

/** タップ(押下→離し)の記録。押下と離しの両方が届いていなければ `null`。 */
function tapOf(trace: FlightTrace): { readonly down: InputRecord; readonly up: InputRecord } | null {
  const down = trace.inputs.find((input) => input.kind === "pointerdown");
  const up = trace.inputs.find((input) => input.kind === "pointerup");
  return down === undefined || up === undefined ? null : { down, up };
}

/**
 * 確実にタップと言える試行: 押下がスイング可能な間(到達通知の十分前)に処理され、押下→離しが 150ms 以内(`TAP_MAX_DURATION_MS` 180ms 未満、
 * イベントの時刻と処理の時刻のどちらも)。Playwright の遅れでこれを満たさない試行は無効にする。
 */
function isSureTap(trace: FlightTrace): boolean {
  const tap = tapOf(trace);
  if (tap === null || trace.durationMs === null) {
    return false;
  }
  const { down, up } = tap;
  return (
    down.swingReady &&
    elapsedAt(trace, down) < trace.durationMs + TAP_ACCEPT_LIMIT_MS &&
    up.timeStamp - down.timeStamp <= SURE_TAP_MS &&
    up.handledAt - down.handledAt <= SURE_TAP_MS
  );
}

/** スイングが受理された: `data-timing` が付き、結果は空振り・ファウル・インプレーのどれか(見逃しの `ball`/`called-strike` ではない)。 */
function expectSwingAccepted(trace: FlightTrace): void {
  expect(trace.timing).not.toBeNull();
  expect(trace.playKinds.length).toBeGreaterThan(0);
  for (const kind of trace.playKinds) {
    expect(SWING_RESULT_KINDS).toContain(kind);
  }
}

test.describe("touch swing on phone portrait 390x844", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  // (1) 飛行中にステージを 1 本指でタップ → スイングになる(押下時点のカーソル位置、離したときに発火)。
  test("a tap on the stage during the flight swings", async ({ page }) => {
    test.setTimeout(90_000);
    await startBattingWithTrace(page);
    const point = await zoneCenterOf(page);

    const trace = await runUntilValid(page, {
      name: "stage tap",
      act: (target) => target.touchscreen.tap(point.x, point.y),
      isValid: isSureTap,
    });

    expectSwingAccepted(trace);
  });

  // (2) 1 本目の指でドラッグ中に、2 本目の指でステージをタップ → カーソルを動かさずその場でスイングになる。
  test("a second finger tap swings while the first finger is dragging", async ({ page }) => {
    test.setTimeout(90_000);
    await startBattingWithTrace(page);
    const point = await zoneCenterOf(page);
    const client = await page.context().newCDPSession(page);
    const first = { x: point.x - 40, y: point.y, id: 1 };
    const dragged = { ...first, x: first.x + 24 };
    const second = { x: point.x + 40, y: point.y, id: 2 };

    const trace = await runUntilValid(page, {
      name: "second finger tap",
      act: async () => {
        try {
          await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [first] });
          await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [dragged] });
          await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [dragged, second] });
        } finally {
          await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        }
      },
      isValid: (attempt) => {
        const secondDown = attempt.inputs.find((input) => input.kind === "pointerdown" && input.isPrimary === false);
        return secondDown !== undefined && secondDown.swingReady && elapsedAt(attempt, secondDown) < (attempt.durationMs ?? 0) + TAP_ACCEPT_LIMIT_MS;
      },
    });

    expectSwingAccepted(trace);
  });

  // (3) 遅いタップ: ボールが着く直前に指を置き、着いたあとに離す → 見逃しにならずスイングの結果になる(旧仕様は D+150ms で見逃しが確定し、
  // 離したときには確定済みだった。到達通知の保留 `holdArrivalFor` の単体テストと手動確認が、保留そのものを担保する)。
  test("a tap released after the ball arrives still swings instead of taking the pitch", async ({ page }) => {
    test.setTimeout(90_000);
    await startBattingWithTrace(page);
    const point = await zoneCenterOf(page);

    const trace = await runUntilValid(page, {
      name: "late tap",
      act: async (target) => {
        await waitForFlightElapsed(target, LATE_TAP_TRIGGER_MS);
        await target.touchscreen.tap(point.x, point.y);
      },
      isValid: (attempt) => {
        const tap = tapOf(attempt);
        return isSureTap(attempt) && tap !== null && elapsedAt(attempt, tap.up) >= (attempt.durationMs ?? 0) + LATE_RELEASE_MS;
      },
    });

    expectSwingAccepted(trace);
  });
});

// 結果画面が出る前から押しっぱなしの Enter/Space が、結果画面の「もう一度」を押さない(テスト6): 最後の打席の演出を Enter/Space の長押しで
// スキップすると、結果画面が出て `autoFocus` された「もう一度」に、押しっぱなしのキーの repeat(Enter は keydown、Space は repeat のあとの keyup が
// 既定動作でクリックになる)が届き、意図せず再試合になっていた。ここでは速い `fast=1` で、人間守備に入ってからキーを押しっぱなしにして結果画面が
// 自然に出るのを待つ(押されていたキーの repeat が結果画面に届く点はスキップ経由と同じ。スキップ経由は通常速度で手動確認した)。
// repeat は実キー入力でしか届かない: 押したままの同じキーに `keyboard.down` を繰り返すと `repeat: true` の keydown になる(合成イベントはボタンの
// 既定動作を起こさない)。

// 結果画面が出るまでキーを押し続けるときの上限(フレーム数)。人間守備の 1 イニングは、通常 150 フレーム前後で終わる。
const MAX_HELD_KEY_FRAMES = 1500;

// 結果画面が出たあとに送る repeat の回数。
const REPEATS_AFTER_RESULT = 8;

/** ページ内で毎フレーム、「投げる」が押せるなら押す。Playwright の往復遅延のせいで、最後の投球が終わったあとにキーを押し始めることを避ける。 */
async function autoThrowWhenReady(page: Page): Promise<void> {
  await page.evaluate(() => {
    const tick = (): void => {
      if (document.querySelector('[data-testid="pitch-controls"][data-ready="true"]') !== null) {
        document.querySelector<HTMLElement>('[data-testid="throw-pitch"]')?.click();
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** 押しっぱなしのキーの repeat を `times` 回、1 フレームおきに送る。 */
async function repeatKey(page: Page, key: string, times: number): Promise<void> {
  for (let count = 0; count < times; count += 1) {
    await page.keyboard.down(key);
    await nextFrame(page);
  }
}

/** `target` が現れるまで、押しっぱなしのキーの repeat を 1 フレームおきに送る。 */
async function repeatKeyUntilVisible(page: Page, key: string, target: Locator): Promise<void> {
  for (let frame = 0; frame < MAX_HELD_KEY_FRAMES; frame += 1) {
    if ((await target.count()) > 0) {
      return;
    }
    await repeatKey(page, key, 1);
  }
  throw new Error(`${key} was held for ${MAX_HELD_KEY_FRAMES} frames but the target did not appear`);
}

for (const key of ["Enter", "Space"] as const) {
  test(`holding ${key} until the result screen appears does not restart the game`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors = collectPageErrors(page);

    await page.goto(`/?seed=${GAME_SEED}&innings=1&fast=1#/baseball`);
    await startGame(page);
    await expect(page.getByTestId("stage-3d")).toHaveAttribute("data-status", "ready");

    // 攻撃中(全球見送り)は Enter/Space がスイングになるので押さない。人間守備になってから押しっぱなしにし、投球はページ内で自動化する。
    await expect(page.locator('[data-testid="pitch-controls"][data-ready="true"]')).toBeVisible({ timeout: 60_000 });
    await autoThrowWhenReady(page);
    await page.keyboard.down(key);
    const result = page.getByTestId("result-screen");
    await repeatKeyUntilVisible(page, key, result);

    // 前提: 結果画面が出た時点で「もう一度」にフォーカスがあり、キーは押されたまま(ここから先の repeat がこのボタンに届く)。
    await expect(page.getByTestId("restart-game")).toBeFocused();
    await repeatKey(page, key, REPEATS_AFTER_RESULT);
    await page.keyboard.up(key);
    await nextFrame(page);
    await nextFrame(page);

    // 再試合になっていない: 結果画面が残り、最終スコアも表示されたまま。
    await expect(result).toBeVisible();
    await expectScoresShown(page);

    // 通常の操作は妨げない: 離したあとに押し直せば、フォーカス中の「もう一度」が押されて再試合になる(結果画面が消える)。
    await page.keyboard.press(key);
    await expect(result).toBeHidden();
    expect(errors).toEqual([]);
  });
}

type Box = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
type Viewport = { readonly width: number; readonly height: number };
type LayoutKind = "batting" | "pitching";

// ゾーン枠(守備は 5×5 格子)とオーバーレイの間に見込む余白(px)。
const ZONE_MARGIN = 4;
const OVERLAY_TESTIDS = ["scoreboard", "name-plates", "ticker", "action-bar"] as const;

/** `data-zone-rect` の書式(`left,top,width,height`)。 */
const ZONE_RECT_PATTERN = /^[-\d.]+,[-\d.]+,[\d.]+,[\d.]+$/;

// 守備の 5×5 格子は、ゾーン枠を中心から 5/3 倍に広げた範囲(`camera/project.ts` の `zoneRectOf` と同じ。ストライクゾーン 3×3 の外に 1 マスずつ)。
// `data-zone-rect` はどちらのレイアウトでもゾーン枠(3×3)なので、守備ではこれで格子の画面矩形を求める。
const GRID_SCALE = 5 / 3;

// 守備の操作バーを詰める画面の高さの境界(px)。これ未満ではティッカーを出さず、格子のセルを小さくする(`ui/baseball-stage.css`)。
const COMPACT_HEIGHT_PX = 800;

// スマホ縦の打撃: ゾーン枠の左右に確保する余白(px。設計の受け入れ基準 §15 #1)。
const PHONE_BATTING_SIDE_MARGIN = 40;

/** `data-zone-rect`(`left,top,width,height`。キャンバス左上基準)を、ページ座標の矩形にする。 */
function zoneRectInPage(stageBox: Box, text: string | null): Box | null {
  const values = (text ?? "").split(",").map(Number);
  const [left, top, width, height] = values;
  if (values.length !== 4 || left === undefined || top === undefined || width === undefined || height === undefined || !values.every(Number.isFinite)) {
    return null;
  }
  return { x: stageBox.x + left, y: stageBox.y + top, width, height };
}

/** 2 つの矩形の重なり(幅 × 高さ)。重ならなければ `null`。 */
function overlapOf(a: Box, b: Box): { readonly width: number; readonly height: number } | null {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? { width, height } : null;
}

function inflate(box: Box, margin: number): Box {
  return { x: box.x - margin, y: box.y - margin, width: box.width + margin * 2, height: box.height + margin * 2 };
}

/** 矩形がビューポートに収まっている(0.5px の丸め誤差は許す)。 */
function isInside(box: Box, viewport: Viewport): boolean {
  return box.x >= -0.5 && box.y >= -0.5 && box.x + box.width <= viewport.width + 0.5 && box.y + box.height <= viewport.height + 0.5;
}

function show(box: Box): string {
  return `[x=${box.x.toFixed(1)} y=${box.y.toFixed(1)} w=${box.width.toFixed(1)} h=${box.height.toFixed(1)}]`;
}

/** 要素のバウンディングボックス(可視でなければ `null`)。 */
async function boxOf(page: Page, testId: string): Promise<Box | null> {
  return page.getByTestId(testId).boundingBox();
}

/** (a) ステージがビューポート全体を覆う、(b) ページがスクロールしない。 */
async function stageCoverageViolations(page: Page, viewport: Viewport, stageBox: Box): Promise<string[]> {
  const violations: string[] = [];
  if (stageBox.width < viewport.width * 0.99 || stageBox.height < viewport.height * 0.99) {
    violations.push(`(a) stage-3d ${show(stageBox)} does not cover the viewport ${viewport.width}x${viewport.height}`);
  }
  const scroll = await page.evaluate(() => ({ scrollHeight: document.documentElement.scrollHeight, innerHeight: window.innerHeight }));
  if (scroll.scrollHeight > scroll.innerHeight) {
    violations.push(`(b) page scrolls: scrollHeight=${scroll.scrollHeight} > innerHeight=${scroll.innerHeight}`);
  }
  return violations;
}

/** 検証するビューポートと、そのときのゾーンの大きさの下限(設計の受け入れ基準 §15 #1・#2。下限がないビューポートは `null`)。 */
type LayoutViewport = Viewport & {
  readonly name: string;
  readonly hasTouch: boolean;
  /** 打撃: ゾーン枠の幅・高さの下限(px)。 */
  readonly battingZoneMin: { readonly width: number; readonly height: number } | null;
  /** 守備: ゾーン枠(3×3)の幅の下限(px)。 */
  readonly pitchingZoneMinWidth: number | null;
};

/** 守備の操作バーを詰める画面(高さ 800px 未満)では、ティッカーを出さない。 */
function isCompact(viewport: Viewport): boolean {
  return viewport.height < COMPACT_HEIGHT_PX;
}

/** ゾーン枠を中心から 5/3 倍に広げた、守備の 5×5 格子の画面矩形。 */
function gridOf(zone: Box): Box {
  const width = zone.width * GRID_SCALE;
  const height = zone.height * GRID_SCALE;
  return { x: zone.x + (zone.width - width) / 2, y: zone.y + (zone.height - height) / 2, width, height };
}

/**
 * (c) 4 要素が可視でビューポート内にある(守備の高さ 800px 未満のティッカーは出さない設計なので除く)、
 * (d) 隠されてはいけない範囲(打撃はゾーン枠、守備は 5×5 格子)がどの要素とも重ならない(余白 4px)。重なりは幅 × 高さ(px)で報告する。
 */
async function overlayViolations(page: Page, viewport: Viewport, kind: LayoutKind, protectedArea: Box): Promise<string[]> {
  const violations: string[] = [];
  const area = kind === "pitching" ? "grid" : "zone frame";
  for (const testId of OVERLAY_TESTIDS) {
    const box = await boxOf(page, testId);
    if (box === null) {
      if (!(testId === "ticker" && kind === "pitching" && isCompact(viewport))) {
        violations.push(`(c) ${testId} is not visible`);
      }
      continue;
    }
    if (!isInside(box, viewport)) {
      violations.push(`(c) ${testId} ${show(box)} is outside the viewport ${viewport.width}x${viewport.height}`);
    }
    const overlap = overlapOf(inflate(protectedArea, ZONE_MARGIN), box);
    if (overlap !== null) {
      const by = `${overlap.width.toFixed(1)}x${overlap.height.toFixed(1)}px`;
      violations.push(`(d) ${area} ${show(protectedArea)} overlaps ${testId} ${show(box)} by ${by} (margin ${ZONE_MARGIN}px)`);
    }
  }
  return violations;
}

/**
 * (f) ゾーンの大きさ。打撃はゾーン枠の幅・高さが下限以上で、枠がビューポート内に収まり左右に余白(40px)がある。守備はゾーン枠の幅が下限以上、
 * 5×5 格子がビューポートに収まる。下限が無いビューポート(デスクトップ・タブレット)は、重なりと収まりだけを見る。
 */
function zoneSizeViolations(viewport: LayoutViewport, kind: LayoutKind, zone: Box): string[] {
  const violations: string[] = [];
  if (kind === "batting") {
    const min = viewport.battingZoneMin;
    if (min !== null && (zone.width < min.width || zone.height < min.height)) {
      violations.push(`(f) zone frame is ${zone.width.toFixed(1)}x${zone.height.toFixed(1)}px, expected at least ${min.width}x${min.height}px`);
    }
    if (min !== null && (zone.x < PHONE_BATTING_SIDE_MARGIN || viewport.width - (zone.x + zone.width) < PHONE_BATTING_SIDE_MARGIN)) {
      violations.push(`(f) zone frame ${show(zone)} has less than ${PHONE_BATTING_SIDE_MARGIN}px of side margin in ${viewport.width}px`);
    }
    if (!isInside(zone, viewport)) {
      violations.push(`(f) zone frame ${show(zone)} is outside the viewport ${viewport.width}x${viewport.height}`);
    }
    return violations;
  }
  const minWidth = viewport.pitchingZoneMinWidth;
  if (minWidth !== null && zone.width < minWidth) {
    violations.push(`(f) zone frame is ${zone.width.toFixed(1)}px wide, expected at least ${minWidth}px`);
  }
  if (!isInside(gridOf(zone), viewport)) {
    violations.push(`(f) grid ${show(gridOf(zone))} is outside the viewport ${viewport.width}x${viewport.height}`);
  }
  return violations;
}

/** (e) 要素がビューポート内にあり、高さ(と、指定があれば幅)が最小値以上。 */
async function controlViolation(
  page: Page,
  viewport: Viewport,
  testId: string,
  min: { readonly width: number; readonly height: number },
): Promise<string | null> {
  const box = await boxOf(page, testId);
  if (box === null) {
    return `(e) ${testId} is not visible`;
  }
  if (!isInside(box, viewport)) {
    return `(e) ${testId} ${show(box)} is outside the viewport ${viewport.width}x${viewport.height}`;
  }
  if (box.height < min.height || box.width < min.width) {
    return `(e) ${testId} is ${box.width.toFixed(1)}x${box.height.toFixed(1)}px, expected at least ${min.width}x${min.height}px`;
  }
  return null;
}

// 守備の詰めた操作バー(高さ 800px 未満)のセルの下限(px)。`ui/baseball-stage.css` のセルの大きさ。
const CELL_MIN_COMPACT_PX = 36;

/**
 * (e) 操作部品の寸法。人間守備は 投げる・左上と右下のセルがビューポート内にあり、スマホ縦では「投げる」が 44px 以上、セルが 44px 以上
 * (高さ 800px 未満の詰めた操作バーでは 36px 以上)。デスクトップのセルは 36px 程度で、大きさの検査の対象外。
 * 人間打撃は swing-button が 44px 以上(スマホ縦は 64px 以上)。
 */
async function controlViolations(page: Page, viewport: Viewport, kind: LayoutKind, phone: boolean): Promise<string[]> {
  const none = { width: 0, height: 0 };
  const cellSize = isCompact(viewport) ? CELL_MIN_COMPACT_PX : 44;
  const cell = { width: cellSize, height: cellSize };
  const checks =
    kind === "pitching"
      ? [
          await controlViolation(page, viewport, "throw-pitch", phone ? { width: 0, height: 44 } : none),
          await controlViolation(page, viewport, "course-cell-0-0", phone ? cell : none),
          await controlViolation(page, viewport, "course-cell-4-4", phone ? cell : none),
        ]
      : [await controlViolation(page, viewport, "swing-button", { width: 0, height: phone ? 64 : 44 })];
  return checks.filter((message): message is string => message !== null);
}

/** オーバーレイ型レイアウトの違反を全部集める(1 件目で止めず、計測値を全件報告する)。 */
async function collectLayoutViolations(page: Page, viewport: LayoutViewport, kind: LayoutKind): Promise<string[]> {
  const stage = page.getByTestId("stage-3d");
  await expect(stage).toHaveAttribute("data-status", "ready");
  // ゾーン枠の画面矩形(`data-zone-rect`)が計測されるまで待つ。
  await expect(stage).toHaveAttribute("data-zone-rect", ZONE_RECT_PATTERN);
  // 空き領域の測定(`useSafeArea`)のあとで矩形が更新されることがあるので、数フレーム続けて変わらなくなるまで待つ。
  await expect
    .poll(async () => {
      const before = await stage.getAttribute("data-zone-rect");
      await nextFrame(page);
      await nextFrame(page);
      await nextFrame(page);
      return (await stage.getAttribute("data-zone-rect")) === before;
    })
    .toBe(true);
  await expect(page.getByTestId("action-bar")).toBeVisible();
  const stageBox = await stage.boundingBox();
  const zone = stageBox === null ? null : zoneRectInPage(stageBox, await stage.getAttribute("data-zone-rect"));
  if (stageBox === null || zone === null) {
    return ["stage-3d has no bounding box or data-zone-rect is invalid"];
  }
  const phone = viewport.width <= 640;
  return [
    ...(await stageCoverageViolations(page, viewport, stageBox)),
    ...(await overlayViolations(page, viewport, kind, kind === "pitching" ? gridOf(zone) : zone)),
    ...zoneSizeViolations(viewport, kind, zone),
    ...(await controlViolations(page, viewport, kind, phone)),
  ];
}

// ゾーンの大きさの下限は、設計の受け入れ基準 §15 #1(打撃の幅×高)・#2(守備のゾーン幅)。設計値より小さい許容値で、見た目の調整(ステップ H12)で
// 設計値に近づけるが、E2E はこの下限を割らないことを機械的に確認する。390 幅は縦長、1280×720 はデスクトップ、768×1024 は縦長の
// タブレット(縦横比 0.75 は縦長の構図と横長の構図の間を補間する範囲)。
const LAYOUT_VIEWPORTS: readonly LayoutViewport[] = [
  { name: "desktop 1280x720", width: 1280, height: 720, hasTouch: false, battingZoneMin: null, pitchingZoneMinWidth: null },
  { name: "phone portrait 390x844", width: 390, height: 844, hasTouch: true, battingZoneMin: { width: 140, height: 155 }, pitchingZoneMinWidth: 85 },
  { name: "phone portrait 390x745", width: 390, height: 745, hasTouch: true, battingZoneMin: { width: 140, height: 155 }, pitchingZoneMinWidth: 85 },
  { name: "phone portrait 390x664", width: 390, height: 664, hasTouch: true, battingZoneMin: { width: 115, height: 130 }, pitchingZoneMinWidth: 60 },
  { name: "tablet portrait 768x1024", width: 768, height: 1024, hasTouch: true, battingZoneMin: null, pitchingZoneMinWidth: null },
];

const LAYOUT_KINDS = [
  { name: "human batting", kind: "batting", sideTestId: "setting-side-away" },
  { name: "human pitching", kind: "pitching", sideTestId: "setting-side-home" },
] as const;

// オーバーレイ型レイアウトの幾何検証(テスト5): ステージが全面、ページがスクロールしない、4 要素がビューポート内、
// ゾーン枠(守備は 5×5 格子)がどの要素にも隠されない、ゾーンの大きさが下限以上、操作部品が収まって大きさを満たす。
// 縦長の構図は画面の高さ(ブラウザのツールバーを含む実際の高さ)で変わるので、390 幅で高さ 844・745・664 の 3 つを見る。
// 失敗したらしきい値を緩めずに、構図の式(`model/world/camera/rig.ts`)と CSS(`ui/baseball-stage.css`)へ戻す。
for (const viewport of LAYOUT_VIEWPORTS) {
  test.describe(`overlay layout on ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.hasTouch });

    for (const variant of LAYOUT_KINDS) {
      test(`covers the stage and keeps the strike zone visible (${variant.name})`, async ({ page }) => {
        test.setTimeout(60_000);
        await page.goto(`/?seed=${GAME_SEED}&innings=1&fast=1#/baseball`);
        await page.getByTestId(variant.sideTestId).click();
        await startGame(page);

        const violations = await collectLayoutViolations(page, viewport, variant.kind);
        expect(violations).toEqual([]);
      });
    }
  });
}

// レイアウト(打撃/守備)が切り替わると、構図(ゾーン枠の画面矩形)も切り替わる(テスト5b): 後攻で始めると表は人間の守備(守備レイアウト)、
// 3 アウトで裏に替わると人間の打撃(打撃レイアウト)になる。守備の構図は 5×5 格子を、打撃の構図はゾーン全体を空き領域に収めるので、
// 打撃のほうがゾーン枠が大きい(390×844 で設計値 154 対 102px)。切り替え後の矩形が更新され、切り替え後の幾何も検証を満たすことで、
// レイアウト別の構図と空き領域の測定が効いているかを機械的に確認する。
test.describe("zone rect follows the layout switch on phone portrait 390x844", () => {
  const viewport = LAYOUT_VIEWPORTS.find((candidate) => candidate.name === "phone portrait 390x844");
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("pitching to batting", async ({ page }) => {
    test.setTimeout(90_000);
    if (viewport === undefined) {
      throw new Error("phone portrait 390x844 is not in LAYOUT_VIEWPORTS");
    }
    await page.goto(`/?seed=${LAYOUT_SWITCH_SEED}&innings=1&fast=1#/baseball`);
    await page.getByTestId("setting-side-home").click();
    await startGame(page);

    const stage = page.getByTestId("stage-3d");
    await expect(stage).toHaveAttribute("data-zone-rect", ZONE_RECT_PATTERN);
    await expect(page.getByTestId("throw-pitch")).toBeVisible();
    const pitchingRect = await stage.getAttribute("data-zone-rect");
    expect(await collectLayoutViolations(page, viewport, "pitching")).toEqual([]);

    // 守備(表)を最後まで進める(投球はページ内で自動化する)。3 アウトで裏に替わり、人間の打撃になる。
    await autoThrowWhenReady(page);
    await expect(page.getByTestId("swing-button")).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => stage.getAttribute("data-zone-rect"), { timeout: 10_000 }).not.toBe(pitchingRect);
    const battingRect = await stage.getAttribute("data-zone-rect");
    const widthOf = (text: string | null): number => Number((text ?? "").split(",")[2]);
    expect(widthOf(battingRect)).toBeGreaterThan(widthOf(pitchingRect));
    await expect.poll(() => collectLayoutViolations(page, viewport, "batting"), { timeout: 15_000 }).toEqual([]);
  });
});
