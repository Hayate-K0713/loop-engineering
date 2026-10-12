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

// 試合を結果画面まで通すテスト(テスト2・3・5)で使う seed。先攻・全球見送り・守備は中央ストレートで、延長に入らず 1 イニングで終わる
// (3D 画面は 1 球ごとに 1〜2 秒かかるので、延長に入ると所要時間が倍になる)。試合ロジックを変えると延長に入ることがあるが、
// その場合もテストは壊れず遅くなるだけなので、遅いと感じたら探し直す(2026-10-12 の探索: 40〜48 のうち 43,44,47,48 が延長なし。47 を採用)。
const GAME_SEED = 47;

// 演出スキップのテスト(テスト4)で使う seed。「後攻・中央(2,2)+ストレート」で投げた 1 球目が `in-play`(滞空+余韻で 2.5〜3 秒続く演出)になる。
// 試合ロジック(model/ 配下の判定・CPU・乱数の消費順)や投球の初期選択を変えると結果が変わるので、その場合は再探索が必要。
// 探し方: `?seed=N&innings=1#/baseball`(後攻を選んで開始)を seed を変えながら開き、中央ストレートを投げて `stage-3d` の
// `data-play-kind` が `in-play` になる N を選ぶ(2026-10-12 の探索: 1〜24 のうち 2,4,5,7,8,11,15〜19,21,23 が in-play。7 を採用)。
const SKIP_SEED = 7;

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

type Box = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
type Viewport = { readonly width: number; readonly height: number };
type LayoutKind = "batting" | "pitching";

// ゾーン枠とオーバーレイの間に見込む余白(px)。
const ZONE_MARGIN = 4;
const OVERLAY_TESTIDS = ["scoreboard", "name-plates", "ticker", "action-bar"] as const;

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

/** (c) 4 要素が可視でビューポート内にある、(d) ゾーン枠がどの要素とも重ならない(余白 4px)。重なりは幅 × 高さ(px)で報告する。 */
async function overlayViolations(page: Page, viewport: Viewport, zone: Box): Promise<string[]> {
  const violations: string[] = [];
  for (const testId of OVERLAY_TESTIDS) {
    const box = await boxOf(page, testId);
    if (box === null) {
      violations.push(`(c) ${testId} is not visible`);
      continue;
    }
    if (!isInside(box, viewport)) {
      violations.push(`(c) ${testId} ${show(box)} is outside the viewport ${viewport.width}x${viewport.height}`);
    }
    const overlap = overlapOf(inflate(zone, ZONE_MARGIN), box);
    if (overlap !== null) {
      const by = `${overlap.width.toFixed(1)}x${overlap.height.toFixed(1)}px`;
      violations.push(`(d) zone frame ${show(zone)} overlaps ${testId} ${show(box)} by ${by} (margin ${ZONE_MARGIN}px)`);
    }
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

/**
 * (e) 操作部品の寸法。人間守備は 投げる・左上と右下のセルがビューポート内にあり、スマホ縦ではセルと「投げる」が 44px 以上
 * (デスクトップのセルは 36px 程度で、大きさの検査の対象外)。人間打撃は swing-button が 44px 以上(スマホ縦は 64px 以上)。
 */
async function controlViolations(page: Page, viewport: Viewport, kind: LayoutKind, phone: boolean): Promise<string[]> {
  const none = { width: 0, height: 0 };
  const tap = { width: 44, height: 44 };
  const checks =
    kind === "pitching"
      ? [
          await controlViolation(page, viewport, "throw-pitch", phone ? { width: 0, height: 44 } : none),
          await controlViolation(page, viewport, "course-cell-0-0", phone ? tap : none),
          await controlViolation(page, viewport, "course-cell-4-4", phone ? tap : none),
        ]
      : [await controlViolation(page, viewport, "swing-button", { width: 0, height: phone ? 64 : 44 })];
  return checks.filter((message): message is string => message !== null);
}

/** オーバーレイ型レイアウトの違反を全部集める(1 件目で止めず、計測値を全件報告する)。 */
async function collectLayoutViolations(page: Page, viewport: Viewport, kind: LayoutKind): Promise<string[]> {
  const stage = page.getByTestId("stage-3d");
  await expect(stage).toHaveAttribute("data-status", "ready");
  // ゾーン枠の画面矩形(`data-zone-rect`)が計測されるまで待つ。
  await expect(stage).toHaveAttribute("data-zone-rect", /^[-\d.]+,[-\d.]+,[\d.]+,[\d.]+$/);
  await expect(page.getByTestId("action-bar")).toBeVisible();
  const stageBox = await stage.boundingBox();
  const zone = stageBox === null ? null : zoneRectInPage(stageBox, await stage.getAttribute("data-zone-rect"));
  if (stageBox === null || zone === null) {
    return ["stage-3d has no bounding box or data-zone-rect is invalid"];
  }
  const phone = viewport.width <= 640;
  return [
    ...(await stageCoverageViolations(page, viewport, stageBox)),
    ...(await overlayViolations(page, viewport, zone)),
    ...(await controlViolations(page, viewport, kind, phone)),
  ];
}

const LAYOUT_VIEWPORTS = [
  { name: "desktop 1280x720", width: 1280, height: 720, hasTouch: false },
  { name: "phone portrait 390x844", width: 390, height: 844, hasTouch: true },
] as const;

const LAYOUT_KINDS = [
  { name: "human batting", kind: "batting", sideTestId: "setting-side-away" },
  { name: "human pitching", kind: "pitching", sideTestId: "setting-side-home" },
] as const;

// オーバーレイ型レイアウトの幾何検証(テスト5): ステージが全面、ページがスクロールしない、4 要素がビューポート内、
// ゾーン枠がどの要素にも隠されない、操作部品が収まって大きさを満たす。見た目の調整(ステップ G)の合否を機械的に確認するもので、
// 失敗したらしきい値を緩めずに G(CSS・framingLift)へ戻す。
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
