# 設計: ブラウザ野球(1試合モード・CPU対戦)の追加

- 日付: 2026-10-11
- ステータス: レビュー待ち
- 対応する調査ドキュメント: [docs/investigations/2026-10-11-baseball-game.md](../investigations/2026-10-11-baseball-game.md)(観点別: [game-mechanics](../investigations/_parts/baseball-game/game-mechanics.md) / [tech-architecture](../investigations/_parts/baseball-game/tech-architecture.md))
- 承認者: (承認ゲート通過時に記入)
- 承認日: (承認ゲート通過時に記入)

## 目的・スコープ

ユーザー要望「パワプロみたいな野球プレイアプリ」を、`sample-app/frontend` に**1試合モード(CPU対戦)の野球ゲーム**として追加する。ゲームロジックは `frontend/src/features/baseball/model/` の React 非依存な純粋関数として実装し(共有メモリ [[pure-function-extraction]])、乱数はすべて GameState 内のシード付きPRNG(mulberry32)で reducer 内消費する(`Math.random` は lint で error のため使わない: [[sample-app-lint-random-and-index-access]])。backend と `@sample-app/shared` は変更しない。画面は既存の `/` を保ったまま、ハッシュ `#/baseball` でゲームに切り替える。

### やること

- 1試合モード(CPU対戦)。画面タイトルは中立名「ブラウザ野球」。カーソルは「スイングカーソル」と呼ぶ。チーム・選手は架空の固定プリセット2チーム。
- 試合設定(タイトル画面): イニング数 1/3/5/9(既定3)、先攻/後攻、難易度 かんたん/ふつう/むずかしい(既定ふつう)。延長は最大3イニング、延長回は無死一・二塁タイブレーク、決着しなければ引き分け。サヨナラあり。
- 打撃(人間攻撃時): 投球中にスイングカーソル(横長楕円)をポインタ(マウス移動/タッチドラッグ)・矢印/WASD キーで動かし、Space/Enter・クリック・画面の「スイング」ボタンでスイング。ミート打ち/強振の切替あり(強振=カーソル小・パワー補正大)。見送りはスイングしないこと。
  - 判定は調査の案C(ハイブリッド): 楕円距離+タイミング誤差Δt → 接触・質q、カーソル内の高さ → ゴロ/ライナー/フライ、Δtの早遅 → 引っ張り/流し/ファウル、q×パワー×スイング種別 → 強さ段階、表[タイプ×強さ]で1回抽選(併殺は結果種別として同じ抽選に含める)。判定窓・半径などは `params.ts` に外出し。
- 投球(人間守備時): 球種ボタン(投手ごとの持ち球。全体の球種セットはストレート/スライダー/カーブ/フォーク/シュート)+5×5コースグリッド(中央3×3がストライク)で選んで投げる。調査の案2-1: 選んだセル=狙い、着弾点=狙い+ガウス誤差(σはコントロールとスタミナ)。球種は球速(=タイミング)・見た目の軌道・打ちにくさ補正に効く。スタミナは球数で減り、球速低下と誤差増。投手交代なし。
- CPU: 投手=カウント別の重み付き配球(難易度パラメータ)。打者=擬似入力(カーソル位置・スイング時刻にガウスノイズ、ゾーン内/外スイング率)を生成し、人間と同じ `resolve-pitch` を通す。
- 走者進塁は決定論(調査 game-mechanics §3-4 の表を本設計で具体化)。
- テスト用起動パラメータ `location.search` の `?seed=<uint32>&innings=<1|3|5|9>&fast=1`(`fast=1` は投球アニメ・CPU待機時間の短縮。不正値は無視して既定値)。
- デスクトップ(マウス+キーボード)とタッチ(スマホ縦画面)の両方で操作可能なレスポンシブUI。
- ルーティング: `#/baseball` で切替する自前の薄い `routes/` 層(react-router は導入しない)。`/` は従来画面のまま、`App.tsx` にゲームへのリンクを1つ追加する。
- テスト基盤: `frontend` に vitest を導入し、ルート `npm run test` を全 workspace 対象に変更(lockfile 同期を含む)。単体テスト(model 全モジュール・routes)と E2E(`e2e/baseball.spec.ts`)を新規作成する。
- ドキュメント更新: `sample-app/README.md`、`docs/process/sample-app-dev.md`(任意で `ci.yml` の step 名)。

### やらないこと(スコープ外)

- 育成モード、守備・走塁の操作、盗塁/バント/代打/継投、コールド、結果保存(localStorage/backend)、サウンド。
- backend・`@sample-app/shared` の変更。結果保存 API は作らない。
- 「パワプロ」等の名称・キャラクター・UIの使用や模倣(README・アプリ内文言・チーム名・選手名を含む)。実在の球団名・選手名・ロゴ、およびそれらを連想させる名称。
- 打球の軌道アニメーション・野手モデル(結果は文章ログと結果バナーで示す)、物理風判定(案A)、変化ベクトル方式の投球(案2-2)、ブレの失投確率モデル(β)。
- 確率進塁(走力による補正)、盗塁以外を含む走塁判断、死球・暴投・捕逸・ファウルフライのアウト、犠打。
- プレイヤー側アシスト(ロックオン等)、動的難易度調整(DDA)、CPU打者の「配球の読み」「連投への慣れ」。
- ルーターライブラリ(react-router)、状態管理ライブラリ、ゲームライブラリ(Phaser/Pixi)、Canvas 描画の導入。`eslint-plugin-react-hooks` の導入(別topic。open-question: [[react-hooks-lint-not-installed]])。
- Playwright のモバイル project 追加(e2e は既存の Desktop Chrome のみ)、ui/hooks のコンポーネントテスト(jsdom は使わない)。
- 多言語化(日本語固定)、本番ホスティング設定の変更、`ci.yml` の動作変更(任意の step 名変更を除く)。

### 設計の既定値と論点(壁打ち用)

orchestrator が決めた既定値(#1〜#9)と、本設計で新たに置いた判断(#10〜#19)を、根拠と「壁打ちで確認したい論点」付きで並べる。数値は全て仮値であり、`balance.test.ts` とプレイで調整する前提。

| # | 項目 | 設計での決定 | 根拠 | 壁打ちで確認したい論点 |
| --- | --- | --- | --- | --- |
| 1 | スコープ | 1試合モード(CPU対戦)のみ。育成・守備走塁操作・盗塁/バント/代打/継投・コールド・結果保存・サウンドは対象外 | 調査で範囲確認済み。操作系を増やすと判定・UI・テストが指数的に増える | 結果保存(localStorage)を次topicにするか。コールドを設定に足す価値があるか |
| 2 | 名称・UI | 「ブラウザ野球」、「スイングカーソル」、架空2チーム(名前のみの選手名) | 調査 Q6: 名称は商標、UI/キャラの模倣は不競法の論点。「ミートカーソル」はパワプロ由来の呼称の可能性 | 画面名・チーム名・選手名の最終決定。公開前の J-PlatPat 確認は人間作業 |
| 3 | 試合設定 | イニング 1/3/5/9(既定3)、先攻/後攻、難易度3段階(既定ふつう)。延長最大3回+無死一・二塁タイブレーク+引き分け+サヨナラ | 調査 3-2: 3回≈10〜15分、9回≈25〜50分。タイブレークは必ず決着に近づける | 既定3回でよいか。延長上限3回・引き分けありで爽快感は足りるか。チーム選択は設けない(自軍=固定、CPU=固定)でよいか |
| 4 | 打撃判定 | 案C。窓 ±150ms(強振は×0.75)、強さ段階は q×能力から算出、最後に表を1回抽選 | 調査 比較1: 実装小・網羅テスト可・得点環境を表で制御可 | 最後の抽選による「当たったのにアウト」はどこまで許容か。タイミング窓の広さ(入力遅延の吸収)。強振の旨味(×1.5)は妥当か |
| 5 | 投球 | 案2-1。クリック=即投球(確認ボタンなし)、狙い=セル中心、ガウス誤差、球種は球速・軌道・打ちにくさ補正。CPU打者はファストボール基準でタイミングを取るため、遅い球は早振り気味になる | UI最小・CPUとロジック共有。調査 比較2、2.7(球速差は打ち損じを増やす) | 即投球のミスタップ(特にタッチ)は許容か。球種の戦略性が薄い点(案2-2は将来拡張)は許容か |
| 6 | CPU | 投手=カウント別重み表+難易度。打者=擬似入力(ノイズ)を人間と同じ判定へ。難易度はCPUの強さのみを変える | 調査 Q4: 人間と同じ解決関数を通す・σに下限 | 人間側アシストが無い「かんたん」は初心者に優しいか |
| 7 | 進塁 | 決定論(単打は2塁走者生還、1塁走者は2塁止まり等) | テスト容易・UI説明容易。調査 比較3 | 1塁走者が単打で3塁へ行かない単調さは許容か |
| 8 | テスト用起動パラメータ | `?seed=&innings=&fast=1`。本番ビルドにも残す | e2e を決定的かつ短時間にする(30秒/test に収める)。対戦相手がCPUのみで不正対策の価値が無い。同一シードでの不具合再現にも使える | 本番に残してよいか(`import.meta.env.DEV` 限定にすると本番で不具合を再現できなくなるため採らなかった) |
| 9 | 端末 | デスクトップ+スマホ縦画面のレスポンシブ。e2e は Desktop Chrome のみ | タッチ仕様(ドラッグ=移動、ボタン=スイング)を入れるが、モバイルprojectはコスト過大 | タッチは手動確認(viewport縮小+hasTouch)のみで十分か |
| 10 | 乱数 | mulberry32。ガウスは Irwin–Hall(一様乱数12個の和−6)で近似し、`sin/cos/log/exp` を使わない | StrictMode の reducer 二重呼び出しに耐える。超越関数の実装差でエンジン間に差が出ないため同一シードの再現性が強い。lint 例外不要 | 裾が±6σで切れる点は問題ないか |
| 11 | 再生速度 | `fast=1` は壁時計の再生だけを高速化(`timeScale`)し、モデルの数値(球速・窓)は不変 | `fast` の有無で試合結果(同一シード・同一入力)が変わらない。e2e が本番ロジックを検証できる | — |
| 12 | 画面状態 | タイトル↔試合の切替は page 層の state。`GameState.phase` は `await-pitch`/`in-flight`/`game-over` のみ | `GameState` を常に有効な試合にでき、型と reducer が簡潔になる。frontend-designer 案からの調整 | — |
| 13 | rAF/副作用の作法 | 最新コールバックは `useLatest`(ref)パターン。`useEffectEvent` は使わない | `frontend/package.json` の react 範囲が `^19.0.0` で 19.2 を保証しない(lockfile は 19.2.8)。バージョン依存を増やさない | 19.2 へ範囲を引き上げて `useEffectEvent` を使う方がよいか |
| 14 | 打球の見せ方 | 打球アニメ無し。結果バナー(最新イベント)+ログ+スコアボード | 守備モデルを持たない前提(調査 3-5 (iii) の演出は将来拡張)。規模を抑える | 手応えが物足りないか。ゾーン上の「当たり位置マーカー」だけ足すか |
| 15 | CPU同士の試合 | `GameConfig.humanSide: null` を許容(UIでは選べない)。`simulate.ts` と `balance.test.ts` が使う | 得点環境のモンテカルロ検証に必要。調査の推奨(バランス検証) | — |
| 16 | シードの扱い | `?seed=` は最初の1試合にのみ適用。2試合目以降は `crypto.getRandomValues` | 連続プレイで同じ試合が再現されるのを避ける | — |
| 17 | 投手の疲労 | 球数でスタミナが減り、6割を切ると球速低下・誤差増。交代なし | 調査 2.5(開発者対談の方針を単純化)。9回制は後半に打たれやすくなる | 9回制で先発が持たない展開は許容か(`pitchesPerStamina` で調整可) |
| 18 | `ci.yml` | step 名「Unit tests (backend pure functions)」を実態に合わせて改名する(任意) | 名前が不正確になるため | 触らない方針か |
| 19 | Knip | vitest 追加で Knip の vitest プラグインが有効になるが、report-only の決定どおり判定に使わない | [[knip-dead-code-detection]] | — |

## アーキテクチャ・変更概要

### 全体方針

- 依存の向きは `main.tsx → routes/AppRoutes → (App.tsx / features/baseball/index.ts) → ui → hooks → model → types`。`model/` は React/DOM 非依存、`Math.random`・`Date`・`performance` 不使用(時刻は引数)。
- 状態は `useReducer`(離散: 打席結果・フェーズ遷移)+ ref と rAF(連続: ボール位置・カーソル位置)。連続値は state に入れず、ref 経由で SVG 属性を直接更新する。
- reducer は完全に純粋(`(state, action) → state`)。乱数状態は `GameState.rng` に持ち、CPU の配球・打撃判断も reducer 内で消費する。無効な action(phase や操作主体が合わない)は同一参照の state を返して無視する。
- スイング時刻は hooks が `performance.now()` から「投球開始からの経過ゲーム時間 ms」を計算して action に載せる。判定はすべてその引数に対する純粋関数。

試合内のフェーズ遷移(`GameState.phase`):

```
await-pitch ──(CPU_PITCH / THROW)──> in-flight ──(SWING / PITCH_ARRIVED)──> await-pitch
                                                                        └─> game-over
```

1球の流れ:

1. 守備側の選択: 人間なら ui → `THROW{command}`、CPU なら hooks の `useCpuTurn` が待機後に `CPU_PITCH`。reducer が `deliverPitch`(狙い+ガウス誤差で着弾点・球速・飛行時間を決定)し、`phase = in-flight(flight)` にする。
2. 飛行中: `usePitchFlight` が rAF でボール位置を更新。人間打者がスイングすれば `SWING{swing}`、しなければ飛行時間+窓の経過後に `PITCH_ARRIVED`。CPU 打者の場合は `flight.durationMs` 経過時に `PITCH_ARRIVED`。
3. 判定: reducer が(CPU 打者なら `decideCpuBat` で擬似入力を生成し)`resolvePitch` → `PitchResult` を得て、`outcome`(カウント・アウト・走者・得点)→ `inning`(攻守交代・延長・サヨナラ・終了)の順に遷移を計算し、ログを追記して `await-pitch` か `game-over` へ。

`PITCH_ARRIVED` の意味は「ボールが到達した。人間打者ならスイング無し(見送り)、CPU 打者ならここで打撃判断を行う」。

### 変更ファイル(概要)

| 区分 | ファイル | 内容 |
| --- | --- | --- |
| 変更 | `sample-app/package.json` | `scripts.test` を `npm run test --workspaces --if-present` に |
| 変更 | `sample-app/package-lock.json` | frontend の devDependencies(vitest)を同期(CI は `npm ci`) |
| 変更 | `sample-app/frontend/package.json` | devDependencies に `vitest ^3.0.4`(backend と同範囲)、`scripts.test = "vitest run"` |
| 変更 | `sample-app/frontend/tsconfig.json` | `include` に `vitest.config.ts` を追加 |
| 新規 | `sample-app/frontend/vitest.config.ts` | `include: ["src/**/*.test.ts"]`、`environment: "node"`([[vitest-include-picks-playwright-specs]]) |
| 変更 | `sample-app/frontend/src/main.tsx` | `<App />` を `<AppRoutes />` に差し替えるだけ(StrictMode 維持) |
| 変更 | `sample-app/frontend/src/App.tsx` | `<a href="#/baseball" data-testid="open-baseball">` を1つ追加するのみ(見出し・既存 testid は不変) |
| 新規 | `sample-app/frontend/src/routes/` | 4ファイル(下記) |
| 新規 | `sample-app/frontend/src/features/baseball/` | `types/`・`model/`・`hooks/`・`ui/`・`index.ts` |
| 新規 | `sample-app/frontend/e2e/baseball.spec.ts` | 新規 e2e(`home.spec.ts` は無改変) |
| 変更 | `sample-app/README.md`、`docs/process/sample-app-dev.md` | テスト説明・構成図・ゲームの起動方法 |
| 変更(任意) | `.github/workflows/ci.yml` | step 名のみ |

### DBスキーマ設計

該当なし(DB・永続化の変更を含まないため `db-designer` への委譲は行わない)。

### フロントエンド構成

`frontend-designer` の返答をほぼそのまま転記する。designer による追加・調整は ★ で示し、直後の「frontend-designer 案からの調整点」にまとめた。

#### 結論(判断が必要だった点)

| 論点 | 判断 | 理由 |
| --- | --- | --- |
| `routes/` 層 | 作る(最小4ファイル)。`main.tsx` 内の切替では代替しない | `hashchange` の購読(`useSyncExternalStore`)はコンポーネント/フックになる。`resolveRoute(hash)` を純粋関数として単体テストしたい。`main.tsx` は `<App/>` を `<AppRoutes/>` に差し替えるだけ |
| ルーターライブラリ | 導入しない | 画面2つのため `routes/` 内の自前ハッシュ切替で足りる |
| `api/` セグメント | 作らない | 外部通信なし。backend と `@sample-app/shared` も変更しない |
| `types/` セグメント | 作る | `GameState`・`GameAction`・`PitchFlight`・`GameView` などが model・hooks・ui に跨る |
| `src/shared/`(共有層) | 今回は作らない | feature が1つで共有資材がまだない |
| 乱数の呼び出し位置 | CPU AI も reducer 内(model)で呼ぶ。hooks から乱数を消費しない | 乱数状態を `GameState` に持たせ、StrictMode の reducer 二重呼び出しでも再現性を保つ |
| model 内のサブフォルダ | 6つに分ける(標準構成の拡張点) | model だけで約20ソース+約16テスト。並列 dispatch のタスク境界にもなる |

#### ツリー(凡例: [新規] / [変更] / [既存] / ★=designer が追加・調整)

```
sample-app/
├── package.json                         [変更] scripts.test を backend+frontend 対象に(npm run test --workspaces --if-present)
├── package-lock.json                    [変更] frontend の devDependencies(vitest)を同期(CIは npm ci)
├── README.md                            [変更] 「実行方法」の npm run test 説明・構成図
└── frontend/
    ├── package.json                     [変更] devDependencies に vitest ^3.0.4、scripts.test = "vitest run"
    ├── tsconfig.json                    [変更] include に "vitest.config.ts" を追加
    ├── vitest.config.ts                 [新規] include: ["src/**/*.test.ts"], environment: "node"
    ├── e2e/
    │   ├── home.spec.ts                 [既存]
    │   └── baseball.spec.ts             [新規]
    └── src/
        ├── main.tsx                     [変更] <App/> を <AppRoutes/> に差し替えるだけ(StrictMode は維持)
        ├── App.tsx                      [変更] <a href="#/baseball" data-testid="open-baseball"> を1つ追加のみ
        ├── routes/                      [新規] ルート定義だけの薄い層
        │   ├── AppRoutes.tsx            resolveRoute の結果で <App/> か <BaseballGamePage/> を描画(2分岐は if で書く)
        │   ├── use-hash-route.ts        useSyncExternalStore で hashchange を購読
        │   ├── resolve-route.ts         純粋関数 resolveRoute(hash): "home" | "baseball"(未知は "home")
        │   └── resolve-route.test.ts
        └── features/
            └── baseball/                [新規]
                ├── index.ts             公開口。export は BaseballGamePage のみ
                ├── types/               複数セグメントに跨る型だけ。実行時コードなし(葉)
                │   ├── common.ts        RngState, Side, ZonePoint(ゾーン=[-1,1]² の正規化座標)
                │   ├── team.ts          BatterProfile, PitcherProfile, Team
                │   ├── pitch.ts         PitchKind, CourseCell(5×5), PitchCommand, PitchFlight
                │   ├── batting.ts       SwingKind, SwingInput, CpuBatDecision, BattedBall, PitchResult(designer案の PlateResult を 1球の結果として改名)
                │   ├── game.ts          GameConfig, Phase(判別共用体), Count, Bases, GameState(rng を含む)
                │   ├── actions.ts       GameAction(判別共用体)
                │   └── view.ts          GameView ほか ui 用の表示データ型
                ├── model/               React 非依存の純粋関数 + 同居 *.test.ts
                │   ├── rng/             rng.ts(mulberry32: createRng/nextFloat/nextInt、[値, 次状態]を返す), sampling.ts(nextGaussian, pickWeighted)
                │   ├── pitch/           zone.ts(5×5セル↔ZonePoint、isStrike), kinds.ts(Map<PitchKind, PitchSpec>), delivery.ts(狙い+コントロール/疲労→ガウス誤差→着弾点), flight.ts(ballPositionAt(flight, elapsedMs)), ★params.ts(投球・飛行の定数)
                │   ├── batting/         params.ts(判定窓・カーソル半径・閾値、データ), cursor.ts(移動・クランプ・clientToZonePoint・楕円半径), contact.ts(楕円距離+タイミング誤差→接触・質q), batted-ball.ts(q・高さ・Δt・パワー→タイプ/強さ/方向/ファウル、決定論), result-table.ts([タイプ×強さ]→結果の重み表、drawInPlayResult で1回抽選), resolve-pitch.ts(1球判定の司令塔。人間もCPUも同じ関数)
                │   ├── cpu/             difficulty.ts(データ。★CPU共通定数も同居), pitcher-weights.ts(カウント別配球重み、キー "b-s" の Map), cpu-pitcher.ts(chooseCpuPitch), cpu-batter.ts(decideCpuBat: スイング判断+ガウスノイズ)
                │   ├── data/            teams.ts(架空チーム・選手プリセット+getTeam), teams.test.ts
                │   └── game/            state.ts(createInitialState), count.ts, runners.ts(決定論進塁、乱数なし), outcome.ts, inning.ts(攻守交代・最終回/延長/サヨナラ/引き分け), reducer.ts(action種別ごとに委譲), view.ts(toGameView), commentary.ts, launch-params.ts(?seed=&innings= 等の検証), balance.test.ts(CPU同士の固定シード試合ループ: 必ず終了・得点環境が許容範囲), ★side.ts(Side の補助。SideTally の添字アクセスを関数化), ★simulate.ts(CPU同士の試合を最後まで回す。balance.test.ts と reducer.test.ts が使う)
                ├── hooks/               useGame.ts(useReducer+useMemo(toGameView)+操作関数), useCpuTurn.ts(CPU手番・自動進行を setTimeout で dispatch、cleanup必須), useAnimationFrame.ts(汎用rAF、cleanupでcancel。★最新コールバックは useLatest), usePitchFlight.ts(ref+rAFで SVG 属性を更新、到達時 onArrive), usePointerInput.ts, useKeyboardInput.ts(event.repeat 無視), useBattingControls.ts(合成), useLaunchParams.ts(location.search を1回読む), ★useLatest.ts(最新値 ref), ★random-seed.ts(createRandomSeed: crypto.getRandomValues)
                └── ui/                  BaseballGamePage.tsx(★タイトル↔試合の切替は page 層 state。試合中の GameState.phase で結果画面を重ねる), TitleScreen.tsx, GameScreen.tsx, Scoreboard.tsx, LineScore.tsx, CountLamps.tsx, BaseDiamond.tsx, BattingView.tsx(ゾーンSVG・カーソル・ボール。★人間守備中もボール軌跡の表示に使う), PitchingControls.tsx, PitchKindButtons.tsx, CourseGrid.tsx(5×5 の <button>), ResultScreen.tsx, CommentaryLog.tsx(aria-live), baseball.css(クラス名は bb- 接頭辞), ★baseball-field.css(BattingView/GameScreen 用。CSS の所有ステップを分けるため)
```

作らないもの(意図的): `features/baseball/api/`、`src/shared/`、`src/utils`。ui のコンポーネントテスト(jsdom 不使用。ui/hooks の検証は e2e に寄せる)。

#### 層ごとの役割分担

依存の向き(上から下へのみ import 可。`types/` は葉):

```
main.tsx → routes/AppRoutes ─┬→ App.tsx(従来画面)
                             └→ features/baseball/index.ts → ui → hooks → model → (types)
```

| 層 | 責務 | やらないこと |
| --- | --- | --- |
| `routes/` | hash と画面の対応づけだけ | ゲーム設定・クエリの解釈、状態 |
| `types/` | 3層以上に跨る型 | 実行時コード、他セグメントの import |
| `model/` | 判定・状態遷移・AI・表示データ整形。React/DOM 非依存 | React、`window`、`Math.random`、`Date`/`performance`(時刻は引数) |
| `hooks/` | useReducer、rAF/Pointer/Keyboard/タイマー購読、ref、シード生成(`crypto.getRandomValues`、`?seed=` 指定時はその値) | 判定ロジック、JSX |
| `ui/` | view と callback を描画・配線するだけ | `model/` の直接 import、データ加工 |

model 内部の依存 DAG(循環禁止): `rng ← pitch ← batting ← game`(game が最上位)、`rng ← cpu`(cpu は pitch 参照可、batting/game 参照不可)、`data ← types のみ`。CPU打者は擬似入力を返すだけで、判定は batting/resolve-pitch に渡す。

lint を踏まえたモジュール規約: 変数添字禁止(`Array.from`、`readonly Row[]`+`.find()`、`Map`、`switch`。`record[kind]` 禁止)/`Math.random` 禁止(乱数は state.rng のみ)/2ケース switch 禁止(no-small-switch)/reducer は action ごとにハンドラ委譲し 60行・複雑度20・cognitive 15 以内/ネスト三項禁止/大きなテーブルは関数外のデータ定数/TODO コメント禁止。

命名: コンポーネント `PascalCase.tsx`、フック `useXxx.ts`、その他 `kebab-case.ts`。テストは `*.test.ts` のみ(`.test.tsx` は eslint のテスト緩和対象外・vitest include 外)。

#### 既存との差分

- 新規: `src/routes/`、`src/features/baseball/{types,model,hooks,ui}`、`frontend/vitest.config.ts`、`frontend/e2e/baseball.spec.ts`
- 変更: `src/main.tsx`(1 import・1 JSX)、`src/App.tsx`(リンク1つ)、`frontend/package.json`、`frontend/tsconfig.json`、ルート `package.json`(test)、`package-lock.json`(同期必須)
- 新規依存: `vitest ^3.0.4` のみ(lockfile 上 backend が 3.2.7 使用中)
- 導入しない: ルーターライブラリ(導入時の置換箇所は `routes/` のみ)、状態管理・ゲームライブラリ、`@sample-app/shared` と backend の変更
- 標準構成からの意図的逸脱: (1) `App.tsx` は `src/` 直下のまま (2) `model/` をサブフォルダ分割 (3) `api/`・`src/shared/` を作らない
- 周辺ドキュメント: `sample-app/README.md`、`docs/process/sample-app-dev.md` の「backend の純粋関数ユニットテスト」記述、`ci.yml` step 名(任意)

#### frontend-designer 案からの調整点(designer)

1. **タイトル画面は page 層の state**: `BaseballGamePage` が `session`(config・seed・runId、または未開始)を持ち、未開始ならタイトル、開始後は `<GameScreen key={runId}>` を描画する。`Phase` は `await-pitch`/`in-flight`/`game-over` のみ。結果画面は `GameScreen` が `view.status === "game-over"` のときに表示する(「もう一度」は新しい runId で remount、「タイトルへ」は session を未開始に戻す)。理由: `GameState` を常に有効な試合に保てる。
2. **`PlateResult` を `PitchResult`(1球の結果)と `InPlayResult`(インプレー結果)に分けた**(型設計参照)。
3. **ファイル追加**: `model/pitch/params.ts`(投球定数をbattingから分離しDAGを保つ)、`model/game/side.ts`(`tally[side]` は `detect-object-injection` に触れるため関数化)、`model/game/simulate.ts`、`hooks/useLatest.ts`、`hooks/random-seed.ts`、`ui/baseball-field.css`。
4. **`useEffectEvent` を使わない**(#13): 最新コールバックは `useLatest` の ref パターン。
5. **GameState に `lastResult`/`lastPlate` を持たせた**: バランス検証・結果バナー・ログ生成のため。
6. **`types/view.ts` に `FieldGeometry` を含める**: ui が `model/` を import せずにゾーンSVGを描くため。
7. **`useLaunchParams` が再生速度も返す**: ui が `getPlaybackSpeed`(model)を直接 import しないため、hooks 側で `parseLaunchParams` と `getPlaybackSpeed` を呼ぶ。

#### リスク・要検証事項(frontend-designer より)

1. セグメント間依存は機械的に強制されない → code-reviewer/tester が grep で確認(`model/` に `from "react"`・`window.`・`document.` なし、`ui/` に `../model` import なし、`types/` に他セグメント import なし)
2. `eslint-plugin-react-hooks` 未導入 → effect を持つ hooks(useAnimationFrame, usePitchFlight, usePointerInput, useKeyboardInput, useCpuTurn)を重点レビュー
3. hooks/ui は unit テスト不可 → e2e。CPUの待ち時間・投球アニメ時間を短縮する入口が必要(本設計では `fast=1`)
4. `src/shared/`(共有層、今回は作らない)と `@sample-app/shared`(ワークスペース)は別物
5. 実装初手で `npx eslint` 試験実測を行い規約を確定

### 型設計(`types/`)

`types/` は並列実装タスク間の契約である。実行時コードを持たない(型と `readonly`、リテラル型のみ)。プロパティはすべて `readonly`。`exactOptionalPropertyTypes` のため、省略可能な値は `?` ではなく `T | null` で表す。ここに無い型の追加が必要になったタスクは、並列実行中は `types/` を編集せず、完了報告で上申する(orchestrator がウェーブ間で直列に反映する)。

- `common.ts`
  - `Side = "away" | "home"`(先攻=away、後攻=home)、`Half = "top" | "bottom"`
  - `RngState = number`(uint32)、`WithRng<T> = readonly [T, RngState]`(値と次状態の組)
  - `ZonePoint = { x: number; y: number }`(ストライクゾーン=[-1,1]²、y は上が正)
  - `GridIndex = 0 | 1 | 2 | 3 | 4`
  - `SideTally = { away: number; home: number }`(チーム別の集計値)
- `pitch.ts`
  - `PitchKind = "straight" | "slider" | "curve" | "fork" | "shoot"`
  - `CourseCell = { col: GridIndex; row: GridIndex }`(col 0=打者視点で左、row 0=上段。中央3×3(1〜3)がストライク)
  - `PitchCommand = { kind: PitchKind; cell: CourseCell }`
  - `PitchSpec = { kind; label: string; speedOffsetKmh: number; cursorScale: { x: number; y: number }; bend: ZonePoint }`(`bend` は表示用の軌道の曲がり量で、判定には使わない)
  - `PitchFlight = { seq: number; kind: PitchKind; aim: ZonePoint; landing: ZonePoint; speedKmh: number; durationMs: number }`
  - `BallPosition = { x: number; y: number; scale: number }`(表示用)
- `team.ts`
  - `BatterProfile = { id: string; name: string; meet: number; power: number; trajectory: 1 | 2 | 3 | 4 }`(meet/power は1〜100)
  - `PitcherProfile = { id: string; name: string; speedKmh: number; control: number; stamina: number; repertoire: readonly PitchKind[] }`(`repertoire` は `straight` を必ず含む)
  - `Team = { id: string; name: string; batters: readonly BatterProfile[]; pitcher: PitcherProfile }`(batters は9人)
- `batting.ts`
  - `SwingKind = "meet" | "power"`、`CursorRadii = { rx: number; ry: number }`
  - `SwingInput = { kind: SwingKind; cursor: ZonePoint; atMs: number }`(`atMs` は投球開始(リリース)からの経過ゲーム時間)
  - `CpuBatDecision = { type: "take" } | { type: "swing"; input: SwingInput }`
  - `BattedType = "ground" | "liner" | "fly"`、`Strength = "weak" | "medium" | "strong"`、`Direction = "pull" | "center" | "opposite"`
  - `BattedBall = { type: BattedType; strength: Strength; direction: Direction }`(フェア打球のみ)
  - `ContactJudgement = { kind: "miss" } | { kind: "foul" } | { kind: "fair"; ball: BattedBall }`
  - `InPlayResult = "groundout" | "doublePlay" | "flyout" | "lineout" | "single" | "double" | "triple" | "homerun" | "error"`
  - `PitchResult = { kind: "ball" } | { kind: "called-strike" } | { kind: "swinging-strike" } | { kind: "foul" } | { kind: "in-play"; result: InPlayResult; ball: BattedBall }`
  - `PlateOutcome = "walk" | "strikeout" | InPlayResult`(打席の終わり方)
- `game.ts`
  - `Difficulty = "easy" | "normal" | "hard"`、`Innings = 1 | 3 | 5 | 9`
  - `GameConfig = { innings: Innings; humanSide: Side | null; difficulty: Difficulty }`(`humanSide: null` は CPU 同士=テスト/バランス検証専用。UI では選べない)
  - `Count = { balls: number; strikes: number }`(不変条件: 0〜3 / 0〜2)、`Bases = { first: boolean; second: boolean; third: boolean }`
  - `Phase = { kind: "await-pitch" } | { kind: "in-flight"; flight: PitchFlight } | { kind: "game-over"; winner: Side | null }`(`winner: null` は引き分け)
  - `LineScore = { away: readonly number[]; home: readonly number[] }`(各半イニングの得点。添字=イニング-1。未到達/スキップされた裏は配列長で表現)
  - `LogEntry = { seq: number; text: string }`
  - `GameState`:
    - `config`、`teams: { away: Team; home: Team }`、`rng: RngState`
    - `inning`(1始まり)、`half`、`outs`(0〜2。3は `outcome` から `inning` に渡す一時値)、`count`、`bases`
    - `lineScore`、`hits: SideTally`、`errors: SideTally`(守備側チームの失策数)
    - `lineupIndex: SideTally`(各チームの現在の打者番号 0〜8)、`pitchCounts: SideTally`(各チームの投手の投球数)
    - `pitchSeq: number`(投球通し番号)、`lastPitchKind: PitchKind | null`(直前の投球。攻守交代でリセット)
    - `lastResult: PitchResult | null`、`lastPlate: PlateOutcome | null`(直近の1球の結果と、打席が終わったならその結果。バランス検証・バナー・ログ用)
    - `phase: Phase`、`log: readonly LogEntry[]`
  - `LaunchParams = { seed: number | null; innings: Innings | null; fast: boolean }`、`PlaybackSpeed = { timeScale: number; cpuWaitMs: number }`
- `actions.ts`
  - `GameAction = { type: "CPU_PITCH" } | { type: "THROW"; command: PitchCommand } | { type: "SWING"; swing: SwingInput } | { type: "PITCH_ARRIVED" }`
- `view.ts`(ui 向けの表示データ。ui はこれだけを見る)
  - `GameView`:
    - `status: "playing" | "game-over"`、`mode: "human-batting" | "human-pitching" | "cpu-only"`
    - `inningLabel: string`(例「3回表」)、`isExtra: boolean`、`outs`/`balls`/`strikes: number`、`bases: Bases`
    - `scoreboard: ScoreboardView`(`columns: number`、`rows: readonly ScoreRowView[]`。`ScoreRowView = { side; teamName; cells: readonly string[]; runs: number; hits: number; errors: number }`。`cells` は整形済み文字列で、未到達は「-」、スキップされた裏は「x」)
    - `batter: { name; orderLabel; cursorRadii: { meet: CursorRadii; power: CursorRadii } }`
    - `pitcher: { name; pitchCount: number; staminaPercent: number; repertoire: readonly { kind: PitchKind; label: string }[] }`
    - `flight: PitchFlight | null`、`arriveAfterMs: number`(`PITCH_ARRIVED` を送るまでの経過ゲーム時間)
    - `pitchReady: boolean`(人間が投げられる)、`swingReady: boolean`(人間がスイングできる)、`cpuPitchPending: boolean`(CPU が投げる番)
    - `turnKey: string`(`${pitchSeq}:${phase.kind}`。effect のキー)
    - `lastEvent: string`、`log: readonly LogEntry[]`(直近50件)
    - `geometry: FieldGeometry`(`FieldGeometry = { viewHalfExtent: number; zoneHalf: number; gridHalf: number; ballRadius: number }`)
    - `result: ResultView | null`(`ResultView = { humanOutcome: "win" | "lose" | "draw" | null; headline: string; awayRuns: number; homeRuns: number }`)

### モデル設計(`model/`)

以降、数値は**すべて仮値**(`params.ts` 等のデータ定数に外出し。`balance.test.ts` とプレイで調整する)。叩き台は調査の値を、本設計のカーソル半径(ゾーン単位)に合わせて置き直したもの。

#### 乱数(`rng/`)

- `createRng(seed: number): RngState` … `seed >>> 0`。
- `nextFloat(state): WithRng<number>` … mulberry32(状態+0x6D2B79F5、`Math.imul`、`>>> 0`)。値は [0,1)。
- `nextInt(state, maxExclusive): WithRng<number>` … `floor(値×max)`。
- `nextGaussian(state): WithRng<number>` … 一様乱数12個の和−6(Irwin–Hall、平均0・分散1、|値|≤6)。加減算のみで、エンジン間で結果が一致する。
- `pickWeighted<T>(state, entries: readonly { value: T; weight: number }[]): WithRng<T>` … 重み0の要素は選ばれない。合計が0以下・空配列は `Error` を投げる(プログラミングエラー)。

#### 投球(`pitch/`)

- ゾーン座標: 5×5 セルの幅=2/3。`cellToPoint(cell)`: `x = (col - 2) × 2/3`、`y = (2 - row) × 2/3`(row 0 が上段=y 正)。`isStrike(point)`: `|x| ≤ 1 かつ |y| ≤ 1`(境界含む)。`isStrikeCell(cell)`: col・row がともに 1〜3。`ALL_CELLS`(25)/`ZONE_CELLS`(9)/`RING_CELLS`(16) を定数で公開。
- `getPitchSpec(kind)`(Map):

  | kind | label | speedOffsetKmh | cursorScale(x, y) | bend(表示のみ) |
  | --- | --- | --- | --- | --- |
  | straight | ストレート | 0 | 1.00, 1.00 | 0, 0 |
  | slider | スライダー | -12 | 0.95, 0.90 | +0.6, 0 |
  | curve | カーブ | -30 | 0.95, 0.85 | +0.3, +0.8 |
  | fork | フォーク | -15 | 0.95, 0.80 | 0, +0.7 |
  | shoot | シュート | -8 | 0.90, 0.95 | -0.6, 0 |

  `cursorScale` は打者のカーソル半径に掛ける「打ちにくさ補正」(横長カーソルは縦の変化に弱い: 調査 1.6)。
- `staminaRatio(pitcher, pitchCount) = max(0, 1 - pitchCount / (stamina × pitchesPerStamina))`、`fatigueOf(ratio) = clamp((fatigueStartRatio - ratio) / fatigueStartRatio, 0, 1)`。
- `deliverPitch(rng, { pitcher, command, pitchCount, aimSigmaScale, seq }): WithRng<PitchFlight>`:
  - `aim = cellToPoint(command.cell)`、`σ = baseSigma × (1 + (100 - control)/100 × controlSigmaFactor) × (1 + fatigue × fatigueSigmaGain) × aimSigmaScale`(人間投手は `aimSigmaScale = 1`、CPU は難易度の値)。
  - `landing = aim + (gauss×σ, gauss×σ)` を ±`landingLimit` にクランプ。
  - `speedKmh = pitcher.speedKmh + spec.speedOffsetKmh - fatigue × fatigueSlowKmh`、`durationMs = round(flightMsKmh / speedKmh)`。
- `ballPositionAt(flight, elapsedMs): BallPosition`(表示専用): 進行度 `p = clamp(elapsed/duration, 0, 1)`。開始点(`startPoint`、`startScale`)から着弾点へ補間し、`bend × (1 - p)²` を加算して `p=1` で必ず `landing` に一致。`scale` は `startScale` から 1 へ。`sin/cos` は使わない。
- `pitch/params.ts`(`PITCH_PARAMS`): `baseSigma 0.28`、`controlSigmaFactor 1.0`、`pitchesPerStamina 2.2`、`fatigueStartRatio 0.6`、`fatigueSigmaGain 0.8`、`fatigueSlowKmh 10`、`flightMsKmh 190000`(140km/h≈1357ms)、`landingLimit 2.0`、`viewHalfExtent 2.0`、`startPoint (0, 0.4)`、`startScale 0.25`。

#### 打撃判定(`batting/`、案C)

入力座標はすべてゾーン単位。判定は次の5段で、**抽選は最後の1回だけ**(乱数を消費するのは `drawInPlayResult` のみ)。

1. **カーソル半径** `cursorRadii(batter, kind)`: `rx = meetBaseRx + meetRxPerAbility × meet`、`ry = rx × aspect`。強振は `× powerScale`。判定時はさらに球種の `cursorScale` を掛ける。
2. **接触** `measureContact`: `dtMs = swing.atMs - flight.durationMs`(負=早い)、`windowMs = contactWindowMs × (強振なら powerWindowScale)`、`d = sqrt(((bx-cx)/rx)² + ((by-cy)/ry)²)`(`Math.hypot` は使わない)。`contact = d ≤ 1 かつ |dtMs| ≤ windowMs`。`q = (1 - d) × (1 - |dtMs|/windowMs) × edgeFactor`、`edgeFactor = 1 - edgePenaltyPerUnit × max(0, max(|bx|,|by|) - edgePenaltyStart)`(ゾーン端・ボールゾーンほど質が落ちる)。接触しなければ `miss`(空振り)。
3. **打球形成** `shapeContact`:
   - 高さ: `v = (by - cy)/ry`。`s = (trajectory - 2) × trajectoryShiftPerLevel`。`v > linerHalfBand - s` → `fly`、`v < -(linerHalfBand + s)` → `ground`、それ以外 `liner`。
   - 方向: `|dtMs|/windowMs < centerRatio` → `center`、`dtMs < 0` → `pull`、`dtMs > 0` → `opposite`。
   - ファウル: `|dtMs|/windowMs ≥ foulRatio` → `foul`(抽選なし)。
   - 強さ: `score = q × (powerBase + powerPerAbility × power) × スイング種別係数 × 方向係数`。スイング種別係数は `switch (swing.kind)` で `kindFactor.meet`/`kindFactor.power` を、方向係数は `switch (direction)` で `directionFactor.pull`/`.center`/`.opposite` を返す小関数で引く(`kindFactor[swing.kind]` のような変数添字は lint error)。`score < mediumFrom` → weak、`< strongFrom` → medium、それ以上 strong。
4. **結果表** `RESULT_TABLE`(9行: タイプ×強さ)から `drawInPlayResult(rng, ball, doublePlayPossible)` で1回抽選。`doublePlayPossible = bases.first かつ outs < 2`。不可能な場合は `doublePlay` の重みを `groundout` に畳み込んでから抽選する(結果種別としての併殺を同じ1回の抽選に含める)。
5. **`resolvePitch(rng, { flight, swing, batter, outs, bases }): WithRng<PitchResult>`**: `swing` が `null`(見送り)なら `isStrike(landing)` で `called-strike`/`ball`(乱数を消費しない)。スイングありなら 2→3 を経て `miss` → `swinging-strike`、`foul` → `foul`、`fair` → 4 の抽選結果を `in-play` で返す。人間・CPU 共通。

`batting/cursor.ts` の補助: `INITIAL_CURSOR`(ゾーン中心 (0,0))、`clampCursor`、`moveCursor(cursor, direction, dtMs)`(押下方向×`keyboardSpeed`×dt、クランプ)、`clientToZonePoint(client, rect)`(SVG の矩形→ゾーン座標。y 反転。`viewHalfExtent` 基準でクランプ)。

`batting/params.ts`(`BATTING_PARAMS`)初期値: `meetBaseRx 0.50`、`meetRxPerAbility 0.004`、`aspect 0.6`、`powerScale 0.65`、`cursorLimit 1.8`、`keyboardSpeed 3.0`(ゾーン単位/秒)、`contactWindowMs 150`、`powerWindowScale 0.75`、`foulRatio 0.70`、`centerRatio 0.25`、`edgePenaltyStart 0.6`、`edgePenaltyPerUnit 0.4`、`linerHalfBand 0.30`、`trajectoryShiftPerLevel 0.10`、`powerBase 0.6`、`powerPerAbility 0.008`、`kindFactor {meet 1.0, power 1.5}`、`directionFactor {pull 1.15, center 1.0, opposite 0.9}`、`mediumFrom 0.15`、`strongFrom 0.35`(CPU 普通の q 平均≈0.27 を想定した叩き台)。

結果表の初期値(重み。仮値。調査の叩き台に、併殺・ライナー弱を補った):

| タイプ | 強さ | groundout | doublePlay | flyout | lineout | single | double | triple | homerun | error |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ground | weak | 52 | 38 | - | - | 10 | - | - | - | - |
| ground | medium | 44 | 32 | - | - | 22 | - | - | - | 2 |
| ground | strong | 30 | 25 | - | - | 38 | 5 | - | - | 2 |
| liner | weak | - | - | - | 60 | 36 | 4 | - | - | - |
| liner | medium | - | - | - | 30 | 50 | 18 | 2 | - | - |
| liner | strong | - | - | - | 15 | 40 | 35 | 5 | 5 | - |
| fly | weak | - | - | 96 | - | 4 | - | - | - | - |
| fly | medium | - | - | 75 | - | 8 | 12 | 1 | 4 | - |
| fly | strong | - | - | 35 | - | - | 20 | 3 | 42 | - |

`-` は重み0。各行は非負・合計正。タイプと矛盾する結果(ground 行の flyout 等)は0。`doublePlay` は ground 行のみ。

#### CPU(`cpu/`)

- 難易度表 `getDifficulty(difficulty): DifficultyParams`(フラットなオブジェクト。初期値は調査 4-3 をカーソル半径に合わせて置き直したもの):

  | 難易度 | zoneSwingRate | chaseSwingRate | cursorSigma | timingSigmaMs | aimSigmaScale | twoStrikeOutsideRate |
  | --- | --- | --- | --- | --- | --- | --- |
  | easy | 0.55 | 0.40 | 0.45 | 90 | 1.4 | 0.20 |
  | normal | 0.65 | 0.30 | 0.30 | 60 | 1.0 | 0.35 |
  | hard | 0.70 | 0.20 | 0.20 | 40 | 0.75 | 0.50 |

  `cursorSigma`/`timingSigmaMs` は CPU 打者のノイズ(0にならない=下限あり)、`aimSigmaScale` は CPU 投手の狙いの外し(`deliverPitch` の `aimSigmaScale` にそのまま渡す)、`twoStrikeOutsideRate` は 0-2/1-2 でボール球を選ぶ率。CPU 共通定数(同ファイル): `twoStrikeSwingBoost 0.2`、`threeBallsSwingFactor 0.4`、`outsideSigmaScale 1.5`(ゾーン外のスイングはノイズ増)、`powerSwingBase 0.10`、`powerSwingPerAbility 0.004`、`repeatKindPenalty 0.6`、`speedDiffBiasRatio 0.15`(球速差による早振り)。
- 配球プラン `getPitchPlan(count)`(キー `"b-s"` の Map。12カウント):

  | カウント | zoneRate | fastballRate | edgeBias |
  | --- | --- | --- | --- |
  | 0-0 | 0.70 | 0.60 | 0.6 |
  | 1-0 | 0.70 | 0.60 | 0.4 |
  | 2-0 | 0.78 | 0.70 | 0.2 |
  | 3-0 | 0.90 | 0.88 | 0.0 |
  | 0-1 | 0.62 | 0.55 | 0.8 |
  | 1-1 | 0.65 | 0.55 | 0.6 |
  | 2-1 | 0.72 | 0.56 | 0.4 |
  | 3-1 | 0.85 | 0.75 | 0.1 |
  | 0-2 | 0.40 | 0.50 | 1.5 |
  | 1-2 | 0.40 | 0.50 | 1.5 |
  | 2-2 | 0.60 | 0.50 | 1.2 |
  | 3-2 | 0.78 | 0.62 | 0.6 |

- `chooseCpuPitch(rng, { count, pitcher, lastKind, difficulty }): WithRng<PitchCommand>`: ①ゾーン内/外: `zoneRate`(ただし strikes=2 かつ balls<2 は `1 - twoStrikeOutsideRate`)。②球種: `straight` に `fastballRate`、持ち球の他の球種に `(1 - fastballRate)/n` ずつ。直前と同じ球種は `repeatKindPenalty` を掛ける。持ち球が `straight` のみなら `straight`。③セル: ゾーン内は 9 セルを `1 + edgeBias × (|col-2| + |row-2|)` の重みで、ゾーン外は 16 セル(外周角は重み1、他は2)。
- `decideCpuBat(rng, { flight, count, batter, pitcher, difficulty }): WithRng<CpuBatDecision>`: ①`inZone = isStrike(landing)`、`swingRate = inZone ? zoneSwingRate : chaseSwingRate`。strikes=2 なら `+twoStrikeSwingBoost`(上限0.95)、balls=3 かつ strikes<2 なら `× threeBallsSwingFactor`。乱数が `swingRate` 以上なら `take`。②スイング種別: strikes=2 は `meet`、それ以外は確率 `powerSwingBase + powerSwingPerAbility × power` で `power`。③`cursor = landing + gauss×(cursorSigma × (inZone ? 1 : outsideSigmaScale))`(x・y 独立)。④`atMs = durationMs - speedDiffBiasRatio × (durationMs - fastballDurationMs) + gauss × timingSigmaMs`。`fastballDurationMs = round(flightMsKmh / pitcher.speedKmh)`(CPU 打者は投手のストレート基準でタイミングを取るため、遅い球は早振りになり、ファウル・空振りが増える)。

#### チームデータ(`data/`)

- 固定プリセット2チーム(ユーザー側 `PLAYER_TEAM`、CPU側 `CPU_TEAM`)。各チーム9人の打者と先発投手1人。名前は実在の球団・選手と一致/連想しない架空名(チーム例: 「ルミナス」「ノーブルズ」。選手は名のみのカタカナ。最終決定は実装時に人間レビュー)。
- 能力の目安: 打者 meet 45〜70・power 35〜75・trajectory 1〜3(各チーム1人は4)。投手 speedKmh 140〜146・control 55〜70・stamina 60〜75。持ち球は `straight` を含む3〜4球種(チームごとに構成を変える)。2チームの打者能力の平均差は小さく(meet・power とも差5以内)、投手能力も同程度にする(先攻/後攻・チームの有利不利を作らない)。
- `getTeam(id): Team`(未知 id は `Error`)。ユーザーの陣営割り当ては `createInitialState` が行う(`humanSide` が `"home"` ならユーザーチームが後攻、それ以外(`"away"`/`null`)は先攻)。

#### 試合進行(`game/`)

- `side.ts`: `opponent(side)`、`offenseSide(half)`、`defenseSide(half)`、`tallyGet(tally, side)`、`tallyAdd(tally, side, n)`(`side === "away" ? ... : ...` で実装。変数添字を使わない)。
- `count.ts`: `applyBall`/`applyStrike`/`applyFoul(count) → { count, end: "none" | "walk" | "strikeout" }`。ボール4で `walk`、ストライク3(見逃し・空振り)で `strikeout`。ファウルは strikes<2 なら +1、2ストライク後は不変。
- `runners.ts`: `advanceRunners(bases, outs, play: { kind: "walk" | "strikeout" | InPlayResult; strength: Strength | null }): { bases; runs; outsAdded }`。**決定論**:

  | 打席結果 | 走者・打者の動き | outsAdded |
  | --- | --- | --- |
  | walk | 強制進塁のみ(打者は1塁、1塁が埋まっていれば押し出し連鎖) | 0 |
  | single | 全走者+1塁(2塁・3塁走者は生還)、打者1塁 | 0 |
  | double | 3塁・2塁走者は生還、1塁走者は3塁、打者2塁 | 0 |
  | triple | 全走者生還、打者3塁 | 0 |
  | homerun | 全走者と打者が生還 | 0 |
  | groundout | 弱=強制進塁分のみ+1、中・強=全走者+1(3塁走者は生還)。打者アウト | 1 |
  | doublePlay | 打者と1塁走者がアウト。残りの2塁・3塁走者は+1(3塁走者は生還) | 2 |
  | flyout | 打者アウト。3塁走者は強さが中・強のとき生還(犠飛)。他は動かない | 1 |
  | lineout | 打者アウト。走者は動かない | 1 |
  | strikeout | 打者アウト。走者は動かない | 1 |
  | error | 打者1塁、全走者+1塁 | 0 |

  `outs + outsAdded ≥ 3` の場合は得点なし(`runs = 0`)で、走者は後続処理(攻守交代)でクリアされる。
- `outcome.ts`: `applyPitchResult(state, result): GameState`。`count.ts` でカウントを進め、打席が終わる(walk/strikeout/in-play)なら `advanceRunners` を適用して outs・bases・現在の半イニングの得点・`hits`(single〜homerun)・`errors`(守備側。`error`)・`lineupIndex`(+1 mod 9)を更新し、カウントを0-0に戻す。`lastResult`/`lastPlate` を設定する。攻守交代は行わない(`outs` が3になりうる)。
- `inning.ts`: `settleInning(state): GameState`。順に判定する: ①**サヨナラ**: 裏で `inning ≥ innings` かつ後攻が先攻を上回った瞬間に `game-over`(後攻勝ち)。②`outs ≥ 3` なら半イニング終了: 表の終了で `inning ≥ innings` かつ後攻リード → `game-over`(後攻勝ち。裏は行わず「x」)、それ以外は同イニングの裏へ。裏の終了で `inning < innings` → 次イニングの表。`inning ≥ innings` で得点差あり → `game-over`、同点なら延長へ(`inning < innings + 3`)、`inning ≥ innings + 3` なら引き分け。③新しい半イニング開始時は outs=0、カウント0-0、走者クリア、`lastPitchKind = null`、`lineScore` に0を追加。延長の各半イニング(`inning > innings`)は走者を1塁・2塁にセット(タイブレーク)。`EXTRA_INNINGS_MAX = 3` を公開。
- `state.ts`: `createInitialState({ config, seed })`。1回表、outs 0、0-0、走者なし、`lineScore = { away: [0], home: [] }`、`rng = createRng(seed)`、`phase = await-pitch`、`pitchSeq 0`、`pitchCounts`/`hits`/`errors`/`lineupIndex` 全0、`log` 空。
- `reducer.ts`: `reduce(state, action)`。`switch (action.type)`(4ケース)で `handleCpuPitch`/`handleThrow`/`handleSwing`/`handlePitchArrived` に委譲。

  | action | 有効条件 | 効果 |
  | --- | --- | --- |
  | `CPU_PITCH` | `await-pitch` かつ守備側が CPU | `chooseCpuPitch` → `deliverPitch` → `in-flight`。`pitchSeq`+1、守備側 `pitchCounts`+1、`lastPitchKind` 更新 |
  | `THROW` | `await-pitch` かつ守備側が人間 | `command` を `deliverPitch`(`aimSigmaScale = 1`)→ `in-flight`。他は同上 |
  | `SWING` | `in-flight` かつ攻撃側が人間 | `resolvePitch(swing)` → `applyPitchResult` → `settleInning` → ログ追記 → `await-pitch`/`game-over` |
  | `PITCH_ARRIVED` | `in-flight` | 攻撃側が CPU なら `decideCpuBat` の結果(`take` なら `swing = null`)、人間なら `swing = null` で `resolvePitch` し、以降は `SWING` と同じ |

  無効な組み合わせは同一参照の `state` を返す。
- `view.ts`: `toGameView(state): GameView`。`arriveAfterMs = durationMs + (人間打者 ? contactWindowMs : 0)`。`pitchReady = await-pitch かつ人間が守備`、`swingReady = in-flight かつ人間が攻撃`、`cpuPitchPending = await-pitch かつ CPU が守備`。`scoreboard.columns = max(innings, inning)`。`result` は `game-over` のときのみ。
- `commentary.ts`: `PitchResult`・`PlateOutcome`・得点・攻守交代・試合終了から日本語のログ行を作る(例: 「ボール」「見逃しストライク」「空振り」「ファウル」「ヒット」「二塁打」「ホームラン」「併殺打」「三振」「四球」「3アウトチェンジ」「N点が入りました」「試合終了」)。反映は reducer が1解決につき数行まで `log` に追記する。
- `launch-params.ts`: `parseLaunchParams(search: string): LaunchParams`、`getPlaybackSpeed(fast): PlaybackSpeed`(通常 `{ timeScale: 1, cpuWaitMs: 700 }`、fast `{ timeScale: 8, cpuWaitMs: 20 }`)。検証規則: `seed` は `/^\d{1,10}$/` かつ 0〜4294967295 の整数のみ有効(それ以外は `null`)、`innings` は 1/3/5/9 のみ有効、`fast` は値が正確に `"1"` のときのみ `true`。先頭の `?` の有無どちらも可。重複キーは最初の値。
- `simulate.ts`: `simulateGame(config, seed, maxActions): GameState`(`humanSide: null` を前提。`CPU_PITCH` と `PITCH_ARRIVED` を交互に dispatch して `game-over` まで回す。`maxActions` 超過は `Error`)。専用テストは設けず、`reducer.test.ts`・`balance.test.ts` で検証する。

### 起動パラメータと再生速度

- `location.search` は `useLaunchParams`(`useState` の遅延初期化)で1回だけ読む。`?seed=` は最初の1試合にのみ適用(#16)。`?innings=` はタイトル画面の既定値になる(開始ボタンは押す必要がある)。
- `timeScale`: hooks が `elapsedGameMs = (performance.now() - startedAt) × timeScale` を計算する。`fast=1` でも `flight.durationMs`・判定窓などモデルの数値は変えない(#11)。`cpuWaitMs` は CPU 手番の `setTimeout` 待機。
- e2e の所要時間見積もり: fast では1球≈飛行170ms+待機20ms+操作遅延で約0.25秒。1イニング(両軍)≈30球で約8秒、延長を含めて最大でも約30秒。

### hooks 設計

- `useGame(config, seed)`: `useReducer(reduce, { config, seed }, createInitialState)`、`view = useMemo(() => toGameView(state), [state])`。戻り値は `view` と `throwPitch(command)`・`swing(input)`・`cpuPitch()`・`pitchArrived()`。
- `useLaunchParams()`: `{ seed, innings, fast, speed }` を返す(`speed` は `getPlaybackSpeed(fast)`)。
- `useCpuTurn({ cpuPitchPending, turnKey, cpuWaitMs, onCpuPitch })`: `cpuPitchPending` が真の間 `setTimeout(cpuWaitMs)` で `onCpuPitch` を呼ぶ。cleanup で `clearTimeout`(StrictMode の二重 mount でも1回だけ dispatch される)。
- `usePitchFlight({ flight, arriveAfterMs, timeScale, onArrive, ballRef })`: `flight` が現れたら開始時刻を記録(effect 内)、rAF で `ballPositionAt` を呼び ref の SVG 属性(`cx`/`cy`/`r`)を直接更新。経過が `arriveAfterMs` に達したら `onArrive()` を1回呼んで停止。`getElapsedMs()` を返し、スイング時刻の算出に使う。cleanup で `cancelAnimationFrame`。
- `usePointerInput`/`useKeyboardInput`/`useBattingControls`: カーソルは ref(`INITIAL_CURSOR` から開始)に保持し、SVG の楕円属性を直接更新。入力の対応は次の表。スイングは `swingReady` のときのみ有効で、`atMs = getElapsedMs()`、`cursor = 現在のカーソル`、`kind = 選択中のスイング種別` を載せて `swing(input)`。以降の入力は phase が変わるため reducer のガードで無視される。

  | 入力 | 動作 |
  | --- | --- |
  | マウス/ペンの pointermove | カーソルをその位置へ(`clientToZonePoint`) |
  | マウス/ペンの primary pointerdown | その位置へ移動して即スイング |
  | タッチの pointerdown/move | ドラッグでカーソル移動(`setPointerCapture`)。スイングはしない |
  | 「スイング」ボタンの pointerdown | 現在位置でスイング |
  | 矢印/WASD の keydown/keyup | 押下中は毎フレーム `moveCursor` |
  | Space/Enter の keydown | スイング(`event.repeat` は無視。`preventDefault` し、フォーカス中のボタンの click と二重発火させない) |
  | Z / X の keydown | ミート / 強振 切替 |

- `useLatest(value)`: 最新値を保持する ref(effect 内で更新)。rAF/タイマー/イベントリスナのコールバックから最新の props・state を読むために使い、依存配列の誤りを防ぐ(`exhaustive-deps` が効かないため)。
- `random-seed.ts`: `createRandomSeed()`(`crypto.getRandomValues(new Uint32Array(1))`)。

### UI 設計

- 画面: タイトル(設定: イニング数 select・先攻/後攻 select・難易度 select・開始ボタン)→ 試合(スコアボード、ゾーンSVG、操作系、実況ログ)→ 結果(勝敗・最終スコア・「もう一度(同じ設定)」「タイトルへ」)。全画面共通でページ見出しとホームへ戻るリンクを持つ。
- イニング選択肢(1/3/5/9)・難易度ラベルなどの選択肢は ui 側の定数として持つ(`ui/` は `model/` を import しない)。
- レイアウト: デスクトップは上段にスコアボード、中央にゾーンSVG、下段/右に操作系とログ。スマホ縦(`max-width: 640px`)は縦積みで、スイング/コースのボタンは親指で押せる大きさ(高さ44px以上)。ゾーンSVGは正方形(`aspect-ratio: 1`)で `viewBox` は `±viewHalfExtent`(2.0)。`touch-action: none`・`user-select: none` をSVGに付ける。
- `BattingView`: ストライクゾーン枠、5×5 グリッド線、ボール(ref)、人間打撃時のみスイングカーソル(楕円、ref)。`CourseGrid` は人間守備時に同じ正方形へ重ねる(CSS grid 5×5、`inset: 8.333%` = (2 − 5/3)/4)。
- `data-testid`(e2e・手動確認の契約):
  - ページ共通: `back-home`(`#/` へのリンク)
  - ホーム: `open-baseball`(`App.tsx` のリンク)
  - タイトル: `baseball-title`、`setting-innings`、`setting-side`、`setting-difficulty`、`start-game`
  - 試合: `scoreboard`、`line-score`、`score-away`、`score-home`、`inning-label`、`count-balls`/`count-strikes`/`count-outs`、`bases`(`data-first`/`data-second`/`data-third`)、`batter-name`、`pitcher-name`、`pitch-count`、`pitcher-stamina`、`last-event`、`commentary-log`
  - 打撃: `batting-view`、`zone-svg`、`ball`(`data-seq`/`data-landing-x`/`data-landing-y`/`data-duration-ms`。飛行中のみ)、`swing-cursor`、`swing-button`、`swing-kind-meet`/`swing-kind-power`(`aria-pressed`)、`pitch-speed`
  - 投球: `pitch-controls`(`data-ready="true"/"false"`)、`pitch-kind-<kind>`、`course-cell-<col>-<row>`
  - 結果: `result-screen`、`result-text`、`final-score-away`、`final-score-home`、`restart-game`、`back-to-title`
- 守備側の選択: 球種は持ち球のボタン(既定=`straight`)で、グリッドのセルをクリックした時点で即投球する。飛行中・CPU手番中は `disabled`。
- `BaseballGamePage` は `<h1>ブラウザ野球</h1>` を持つ(従来画面の見出し「loop-basic sample app」を重複して出さない)。

### 静的解析・規約への対応

[[sample-app-lint-random-and-index-access]]・[[eslint-strictness-ratchet-v2]] に従う。実装者向けの要点:

- 禁止: `Math.random()`、変数添字(`arr[i]`/`obj[key]`/`tally[side]`)、`// TODO`/`// FIXME`、ネストした三項演算子、2ケース以下の `switch`、引数の再代入、インラインの `eslint-disable`。
- 使う: `.at(i)`、`Map#get`、`for...of`、`.find()`、`Array.from({ length: n }, (_, i) => ...)`、リテラル添字(`arr[0]`)、`switch`(3ケース以上)、早期 return。
- サイズ: 関数は60行(JSX含む)・複雑度20・cognitive 15 以内。コンポーネントは小さく分割し、reducer・resolve は小関数へ委譲。大きなテーブルは関数の外のデータ定数にする。
- 型: `any`・非 null アサーション(`!`)禁止。`noUncheckedIndexedAccess` のため `.at()` の戻りは `T | undefined` として扱う(不変条件違反は `Error` を投げるヘルパーに集約)。`exactOptionalPropertyTypes` のため省略可能は `T | null`。
- `lib` は ES2022(`Array.prototype.toSorted`/`with` など ES2023 は使わない)。
- テストファイルは `*.test.ts` のみ(`max-lines-per-function` 等の緩和対象)。フォーマットは prettier(`printWidth: 160`)。`npx eslint --fix` で整形する。
- `sonarjs/no-identical-functions`(同一本体の関数の重複)、`sonarjs/no-nested-functions`(深さ4)に注意する。
- model に `Math.hypot`/`sin`/`cos`/`log`/`exp` を使わない(再現性: #10)。

## 実装ステップ

実装順のチェックリスト。**同じファイルを複数ステップで触らない**ように分割している。「並列」欄のステップ同士は同時に dispatch できる(ファイル所有が重ならず、依存も無い)。実装者は担当ファイル以外を編集しない。例外は **ステップ9** のみ(下記)。型の変更が必要になったら編集せず報告する。

ウェーブ計画:

| ウェーブ | ステップ | 並列 |
| --- | --- | --- |
| 1 | 1 | — |
| 2 | 2 | — |
| 3 | 3, 4, 7, 8 | 並列可(4ステップ) |
| 4 | 5, 6 | 並列可(3 の完了後) |
| 5 | 9 | — |
| 6 | 10 | — |
| 7 | 11 | — |
| 8 | 12 | — |
| 9 | 13, 14 | 並列可 |

共通の完了条件(各ステップ): 担当ファイルが `cd sample-app && npx eslint <担当パス>` で0件。テストがあるステップは `cd sample-app/frontend && npx vitest run <担当パス>` が成功。`cd sample-app && npm run typecheck --workspace frontend` で担当ファイル起因のエラーが0(並列中は他タスクの未完成ファイル起因のエラーを無視し、完了報告に記す)。コミット・共有メモリへの書き込みは並列 dispatch 中は行わない(orchestrator が集約)。

- [ ] **ステップ1: vitest 導入・ルート test スクリプト変更・lockfile 同期・eslint 試験実測**(直列・前提)
  - 依存: なし。担当ファイル: `sample-app/package.json`、`sample-app/frontend/package.json`、`sample-app/frontend/tsconfig.json`、`sample-app/frontend/vitest.config.ts`(新規)、`sample-app/package-lock.json`、`sample-app/frontend/src/routes/resolve-route.ts`・`resolve-route.test.ts`(新規)
  - やること:
    1. `cd sample-app && npm install --workspace frontend --save-dev vitest@^3.0.4`(backend と同範囲)。`frontend/package.json` に `scripts.test = "vitest run"` を追加。ルート `package.json` の `scripts.test` を `npm run test --workspaces --if-present` に変更。
    2. `frontend/vitest.config.ts` を新規作成(`vitest/config` の `defineConfig`、`test.include = ["src/**/*.test.ts"]`、`test.environment = "node"`)。`frontend/tsconfig.json` の `include` に `"vitest.config.ts"` を追加。`tsc` が `vitest/config` の型を解決できることを確認する(解決できない場合は原因を報告)。
    3. 動作確認を兼ねて `routes/resolve-route.ts`(純粋関数 `resolveRoute(hash: string): "home" | "baseball"`。`#/baseball` と `#/baseball/` のみ `"baseball"`、他は `"home"`)と `resolve-route.test.ts` を作る。`vitest run` が `e2e/home.spec.ts` を拾わないこと(対象一覧で確認)。テストが1件も無い状態で `vitest run` が失敗する(No test files found)のを避ける目的も兼ねる。
    4. **eslint 試験実測**: `cd sample-app && npx eslint --stdin --stdin-filename frontend/src/features/baseball/model/probe.ts`(`.tsx` 用は `probe.tsx`、テスト用は `probe.test.ts`)に下記スニペットを流し、結果(error/通過とルール名)を表にして完了報告に含める。ファイルは作らない(stdin のみ)。
       - 通過を期待: mulberry32(`Math.imul`・`>>>`・ビット演算)、`arr.at(i)`、`Map#get`、`for...of`、`arr[0]`、`Array.from({ length: 5 }, (_, i) => i - 2)`、`crypto.getRandomValues(new Uint32Array(1))`、`switch`(3ケース以上)、タプル戻り値 `readonly [number, number]`、`new Map<string, X>([...])`、`Object.entries`
       - error を期待: `Math.random()`、`arr[i]`、`obj[key]`、`tally[side]`、`// TODO`、ネスト三項、2ケースの `switch`
       - 実測が必要: 61行以上の JSX を返すコンポーネントで `max-lines-per-function` が JSX 行を数えるか、`*.test.ts` で長い `describe` が通るか
    5. 想定と異なる結果が出た場合は、先のステップに進まず orchestrator に報告する(本設計の「静的解析・規約への対応」の見直しが必要になる)。
  - 完了条件: ルートで `npm run test`(backend+frontend)・`npm run typecheck`・`npm run lint`・`npm run build` が成功。`npm ci --dry-run`(または一時ディレクトリでの `npm ci`)で lockfile 同期を確認。`package-lock.json` の差分が frontend エントリ(と必要最小限の依存解決)に限られる。試験実測の表を報告(orchestrator が本書末尾「ステップ1 試し打ち結果」に転記する)。

- [ ] **ステップ2: `types/` の作成**(直列)
  - 依存: ステップ1。担当ファイル: `features/baseball/types/{common,team,pitch,batting,game,actions,view}.ts`(新規7ファイル)
  - やること: 本書「型設計」のとおりに型を定義する。実行時コードは書かない。`GameView` 周辺は本書のフィールド一覧に従う(不足は報告)。
  - 完了条件: `npm run typecheck --workspace frontend` が成功、lint 0件。`types/` が他セグメントを import していない。

- [ ] **ステップ3: `model/rng/` と `model/pitch/`**(並列: 4, 7, 8)
  - 依存: ステップ2。担当ファイル: `model/rng/{rng,sampling}.ts`+各 `.test.ts`、`model/pitch/{params,zone,kinds,delivery,flight}.ts`+`params` を除く各 `.test.ts`
  - やること: 本書「乱数」「投球」のとおり実装し、テスト戦略の該当テストを同居させる。
  - 完了条件: 担当の `vitest run` が成功(テスト戦略の合格基準を満たす)、`model/` に `from "react"`・`window`・`Math.random` が無い。

- [ ] **ステップ4: `ui/` の表示コンポーネントと基本CSS**(並列: 3, 7, 8)
  - 依存: ステップ2(`types/` のみ。hooks・model に依存しない)。担当ファイル: `ui/{TitleScreen,Scoreboard,LineScore,CountLamps,BaseDiamond,CommentaryLog,PitchKindButtons,CourseGrid,PitchingControls,ResultScreen}.tsx`、`ui/baseball.css`
  - やること: props のみで描画するコンポーネントを作る。`TitleScreen`(props: `defaultInnings`・`onStart(config)`。イニング・先攻後攻・難易度の select)、`PitchingControls`(球種の選択状態をローカル `useState` で持ち、`onThrow(command)` を呼ぶ。`data-ready`)、`ResultScreen`(props: `result`・`onRestart`・`onBackToTitle`)、`Scoreboard`(`LineScore`・`CountLamps`・`BaseDiamond` を合成)ほか。`data-testid` は本書「UI 設計」の一覧に従う。クラス名は `bb-` 接頭辞。レスポンシブ(`max-width: 640px`)対応。`ui/` から `../model` を import しない。
  - 完了条件: lint 0件、typecheck 通過(担当分)。各コンポーネントが 60行以内。

- [ ] **ステップ5: `model/batting/`**(並列: 6)
  - 依存: ステップ3。担当ファイル: `model/batting/{params,cursor,contact,batted-ball,result-table,resolve-pitch}.ts`+`params` を除く各 `.test.ts`
  - やること: 本書「打撃判定」のとおり実装する。値は `params.ts` に外出し。
  - 完了条件: 担当の `vitest run` が成功。`resolve-pitch` が人間・CPU 共通の唯一の1球判定である。

- [ ] **ステップ6: `model/cpu/`**(並列: 5)
  - 依存: ステップ3。担当ファイル: `model/cpu/{difficulty,pitcher-weights,cpu-pitcher,cpu-batter}.ts`+各 `.test.ts`
  - やること: 本書「CPU」のとおり実装する。`cpu/` は `batting/`・`game/` を import しない。
  - 完了条件: 担当の `vitest run` が成功。

- [ ] **ステップ7: `model/data/`**(並列: 3, 4, 8)
  - 依存: ステップ2。担当ファイル: `model/data/teams.ts`・`teams.test.ts`
  - やること: 架空2チームのプリセットと `getTeam`。名前は実在名と連想しないこと。
  - 完了条件: 担当の `vitest run` が成功。

- [ ] **ステップ8: `model/game/` のルール部分**(並列: 3, 4, 7)
  - 依存: ステップ2。担当ファイル: `model/game/{side,count,runners,outcome,inning}.ts`+各 `.test.ts`
  - やること: 本書「試合進行」のとおり、乱数を使わない純粋関数として実装する。`runners` の表を表駆動テストで網羅する。
  - 完了条件: 担当の `vitest run` が成功。

- [ ] **ステップ9: `model/game/` の統合部分(state/reducer/view/commentary/launch-params/simulate)とバランス検証**(直列)
  - 依存: ステップ5, 6, 7, 8。担当ファイル: `model/game/{state,reducer,view,commentary,launch-params,simulate}.ts`+`simulate` を除く各 `.test.ts`、`model/game/balance.test.ts`
  - **例外(値のみ調整可)**: `balance.test.ts` を通すためにのみ、`batting/params.ts`・`batting/result-table.ts`・`cpu/difficulty.ts`・`cpu/pitcher-weights.ts`・`pitch/params.ts`・`data/teams.ts` の**数値だけ**を調整してよい(構造・関数は変更しない)。このステップは単独で動くため所有の競合は無い。調整内容(変更前後)は完了報告に記す。
  - やること: 本書「試合進行」のとおり実装。`reduce` は action ごとにハンドラへ委譲し、無効な組み合わせは同一参照を返す。`simulate.ts` で CPU 同士の試合を回し、`balance.test.ts` のしきい値(テスト戦略)を満たすよう数値を調整する。しきい値を緩める場合は理由を報告する。
  - 完了条件: `cd sample-app/frontend && npx vitest run` が全て成功(`balance.test.ts` を含む)。

- [ ] **ステップ10: `hooks/`**(直列)
  - 依存: ステップ9。担当ファイル: `hooks/{useGame,useCpuTurn,useAnimationFrame,usePitchFlight,usePointerInput,useKeyboardInput,useBattingControls,useLaunchParams,useLatest}.ts`、`hooks/random-seed.ts`
  - やること: 本書「hooks 設計」のとおり実装する。全ての effect に cleanup(rAF の cancel、`clearTimeout`、リスナ解除)を付け、「二重実行を防ぐ ref ガード」で StrictMode を回避しない。判定ロジック・JSX を書かない。コールバックは `useLatest` 経由で最新値を参照する。
  - 完了条件: lint・typecheck 通過。`hooks/` から `Math.random`・`Date` が使われていない(時刻は `performance.now()` のみ)。

- [ ] **ステップ11: `ui/` の結線コンポーネントと公開口**(直列)
  - 依存: ステップ4, 10。担当ファイル: `ui/{BattingView,GameScreen,BaseballGamePage}.tsx`、`ui/baseball-field.css`、`features/baseball/index.ts`
  - やること: `BaseballGamePage`(session 管理、`useLaunchParams`、`baseball.css`・`baseball-field.css` の import、`<h1>ブラウザ野球</h1>`、ホームへ戻るリンク `back-home`)、`GameScreen`(各 hooks の結線、`result` があれば `ResultScreen`)、`BattingView`(ゾーンSVG・ボール・カーソル・スイング操作)を実装。`index.ts` は `BaseballGamePage` のみ export。各コンポーネントは 60行以内になるよう分割する。
  - 完了条件: lint・typecheck 通過。`ui/` から `../model` を import していない。

- [ ] **ステップ12: ルーティングの結線**(直列)
  - 依存: ステップ11。担当ファイル: `routes/AppRoutes.tsx`、`routes/use-hash-route.ts`(新規)、`src/main.tsx`、`src/App.tsx`
  - やること: `useHashRoute`(`useSyncExternalStore` で `hashchange` を購読し `resolveRoute` の結果を返す)、`AppRoutes`(`"baseball"` なら `BaseballGamePage`、それ以外は `App`)。`main.tsx` は `<App />` を `<AppRoutes />` に差し替えるだけ(StrictMode 維持)。`App.tsx` には `<a href="#/baseball" data-testid="open-baseball">` を1つ追加するのみ(見出し・既存 testid・既存ロジックは不変)。
  - 完了条件: lint・typecheck・`npm run build` 通過。`npm run dev:frontend` で `/` は従来画面、`/#/baseball` はタイトル画面が表示される。既存 `home.spec.ts` が無改変で通る。

- [ ] **ステップ13: E2E `e2e/baseball.spec.ts`**(並列: 14)
  - 依存: ステップ12。担当ファイル: `frontend/e2e/baseball.spec.ts`(新規)
  - やること: テスト戦略の E2E 仕様のとおり2テストを作る。固定 sleep を避け、`locator.waitFor`/`Promise.race` で「投球可能(`pitch-controls[data-ready="true"]`)」か「結果画面」を待つ。`test.setTimeout(120_000)`。
  - 完了条件: `cd sample-app && npm run test:e2e --workspace frontend` で `home.spec.ts`(無改変)と新規2テストが成功。3回連続実行して安定している。

- [ ] **ステップ14: ドキュメント更新**(最後。並列: 13)
  - 依存: ステップ12。担当ファイル: `sample-app/README.md`、`docs/process/sample-app-dev.md`、(任意)`.github/workflows/ci.yml`
  - やること:
    - `sample-app/README.md`: 構成図に `frontend/src/routes/`・`features/baseball/`・`vitest.config.ts`・`e2e/baseball.spec.ts` を追加。「実行方法」の `npm run test` を「backend/frontend の純粋関数ユニットテスト(vitest)」に更新。ゲームの起動方法(`npm run dev:frontend` → `/#/baseball`、テスト用 `?seed=&innings=&fast=1`)と、ロジックが `model/` の純粋関数・乱数がシード付きPRNGである旨を「この構成が示している方針」に追記。「パワプロ」等の名称は書かない。
    - `docs/process/sample-app-dev.md`: コマンド一覧の「自動テスト(backendの純粋関数)」を backend+frontend に更新し、E2E 行にゲームの e2e が含まれる旨を追記。手動確認の使い分け(フロントエンドは Playwright CLI)にゲーム画面の確認方法を一行追記。
    - (任意)`ci.yml` の step 名「Unit tests (backend pure functions)」を「Unit tests (pure functions)」へ。動作は変えない。
  - 完了条件: 記述が実装と一致している。`grep -rin "パワプロ\|パワフル" sample-app --exclude-dir=node_modules` が0件。

## テスト戦略

**自動テストを新規作成するか:** する。

- 単体(vitest, `frontend`): `features/baseball/model/` の全モジュールと `routes/resolve-route`。配置は各ソースに同居する `*.test.ts`。ui/hooks は単体テストしない(jsdom 不使用)。
- E2E(Playwright): `frontend/e2e/baseball.spec.ts`。
- 実装ステップのチェックリストにテスト作成を含めてある(ステップ1・3・5〜9・13)。

### 単体テストの合格基準

全テストは固定シード・決定論で、確率的な検証も固定シードでの許容誤差判定にする(フレークしない)。テストを通すためにテスト自体を歪めない。しきい値を緩める場合は理由を報告する。

- `rng.test.ts`: 同一シードで同一列(先頭1000個)。値は [0,1)。テスト内の参照実装(mulberry32 を直書き)と先頭N個が一致。`nextInt` が [0,max) で全値が出る(10,000回)。平均≈0.5±0.02。シードの正規化(負数・2^32超でも `>>> 0` と一致)。
- `sampling.test.ts`: `nextGaussian` の平均|m|<0.03・標準偏差0.95〜1.05(20,000回)、|値|≤6。`pickWeighted` は重み0を選ばず、頻度が重み比に±2ptで一致、空配列・合計0は `Error`、同一状態で同一結果。
- `zone.test.ts`: `cellToPoint` — (2,2)→(0,0)、(1,1)→(-2/3,+2/3)、(0,0)→(-4/3,+4/3)。`isStrikeCell` は25セル中ちょうど9が真。`isStrike` の境界: (1,1) は真、(1.0001,0) は偽。
- `kinds.test.ts`: 5球種すべてに spec。`straight` の速度オフセット0・`cursorScale` (1,1)。全 `cursorScale` が (0,1]。label 非空。
- `delivery.test.ts`: 同一入力で同一出力。コントロール高(90)は低(20)より着弾の標準偏差が小さい(2,000回)。疲労時(球数が上限近い)は標準偏差が大きく球速が低下。`speedKmh`・`durationMs = round(k/speed)`(遅い球ほど長い)。`landing` が ±`landingLimit` 内。疲労ゼロのとき疲労項が効かない。
- `flight.test.ts`: `elapsed=0` で開始点・小さい scale、`elapsed≥duration` で `landing` に厳密一致・scale 1。範囲外の経過時間はクランプ。`straight` は直線(中間点が補間点)。曲がる球種は中間で直線から外れ、終点では一致。
- `cursor.test.ts`: `clampCursor`/`moveCursor` の境界クランプ。`clientToZonePoint` — 矩形中心→(0,0)、左上隅→(-viewHalfExtent,+viewHalfExtent)(y 反転)、矩形外はクランプ。`cursorRadii` — meet が高いほど大、強振は `powerScale` 倍、`rx > ry`。
- `contact.test.ts`: カーソル=着弾点・Δt=0 で `contact`。`d>1` は miss。`|Δt|=window` は contact、`window` 超は miss(境界)。強振は窓が狭い。q は d・|Δt| に対して単調非増加。球種の `cursorScale` が小さいほど接触しにくい。`edgeFactor` により端・ボールゾーンは q が下がる。
- `batted-ball.test.ts`: 高さの境界値で ground/liner/fly が切り替わる。同じ v で弾道4の方が弾道1より fly になりやすい。Δt の符号と `centerRatio` で pull/center/opposite。`|Δt|/window ≥ foulRatio` で foul(境界の前後)。強さ段階の境界(score が `mediumFrom`/`strongFrom` の直前・ちょうど・直後)。強振>ミート、pull>opposite。
- `result-table.test.ts`: 9行(タイプ×強さ)がすべて存在。各重みは非負で合計が正。タイプと矛盾する結果の重みは0、`doublePlay` は ground 行のみ。`doublePlayPossible=false` で `doublePlay` が5,000回で一度も出ず、重みは `groundout` に畳み込まれる。10,000回の頻度が重みと±2pt。同一 rng で同一結果。タイプごとに強さが上がるほど安打系(single〜homerun)の合計重みが単調増加。
- `resolve-pitch.test.ts`: 見送りはゾーン内→`called-strike`・外→`ball`で、返る rng が入力と同一(乱数を消費しない)。遠いカーソル→`swinging-strike`。窓の端→`foul`。完璧なスイング(カーソル=着弾点・Δt=0・強振・power 80)を連続シード1000個で打つと全てインプレーで、安打系が1件以上出る(「打撃でヒットが出る」の自動化)。同一入力・同一 rng で同一出力。
- `difficulty.test.ts`/`pitcher-weights.test.ts`: 難易度の単調性(easy→hard で `cursorSigma`・`timingSigmaMs`・`aimSigmaScale` 減、`zoneSwingRate`・`twoStrikeOutsideRate` 増、`chaseSwingRate` 減)、σ・ノイズが0でない。12カウントすべてが Map にあり、`zoneRate`/`fastballRate` ∈ (0,1]、3-0 の `fastballRate` ≥ 0.8。
- `cpu-pitcher.test.ts`: 持ち球に無い球種を選ばない。3-0 でゾーン内セル選択が85%以上(10,000回)。0-2/1-2 のボール球率が hard > easy。直前と同じ球種の連投が `repeatKindPenalty` で減る。同一 rng で同一出力。
- `cpu-batter.test.ts`: ゾーン内/外スイング率が難易度の値と±0.02(10,000回)。2ストライク補正・3ボール補正が効く。カーソルノイズの標準偏差が `cursorSigma`±10%、タイミングが `timingSigmaMs`±10%。ストレートでは `atMs - durationMs` の平均が≈0、遅い球(カーブ)では負(早振り)。`take` に入力が付かない。同一 rng で同一出力。
- `teams.test.ts`: 2チーム、各9人、id 重複なし、能力が範囲内(meet/power 1〜100、trajectory 1〜4)、`repertoire` に `straight`、投手球速 120〜160、2チームの meet・power の平均差が5以内、`getTeam` の未知 id は `Error`。
- `count.test.ts`: ボール4で `walk`、ストライク3で `strikeout`、ファウルは 0/1 ストライクで+1・2ストライクで不変、不変条件(balls≤3, strikes≤2)。
- `runners.test.ts`: 上の進塁表の全結果 × 8通りの塁状況 × outs 0/1/2 を表駆動で。保存則 `走者数(前)+1 = runs + 走者数(後) + outsAdded`(3アウト未満の場合)。併殺は1塁走者あり・2アウト未満のみ。犠飛は3塁走者あり・強さ中以上・2アウト未満のみ。押し出し、エラー、3アウト目で得点なし。
- `outcome.test.ts`: ボール/ストライク/ファウルでカウントのみ変化。打席終了でカウント0-0・`lineupIndex`+1(9で0に戻る)・得点が現在の半イニングに加算。`single`〜`homerun` で `hits` 増、`error` で守備側 `errors` 増(`hits` は不変)。`lastResult`/`lastPlate` の設定。
- `inning.test.ts`(イニング数 1/3/5/9 で表駆動): 表の終了→同イニングの裏、裏の終了→次イニング表。最終回表終了で後攻リード→裏なしで後攻勝ち(「x」)。最終回裏でサヨナラ(リードを奪った瞬間に終了)。最終回裏終了で先攻リード→先攻勝ち。同点→延長1回目(表、走者1・2塁、outs 0)。延長でのサヨナラ。`innings+3` 終了で同点→引き分け。
- `state.test.ts`: 初期値(1回表・0アウト・0-0・走者なし・`lineScore`・`rng = createRng(seed)`・`await-pitch`)。`humanSide` に応じたチーム割り当て(`"home"` のときユーザーチームが後攻)。
- `reducer.test.ts`(タイムアウト30秒): 純粋性(同一入力2回で deep equal、deep freeze した入力で変更されない)。`CPU_PITCH`/`THROW` が `in-flight`・`pitchSeq`+1・`pitchCounts`+1・`rng` 更新。無効な組み合わせ(人間守備で `CPU_PITCH`、`in-flight` 以外で `SWING`/`PITCH_ARRIVED`、人間攻撃以外で `SWING`)が同一参照を返す。人間打者の `PITCH_ARRIVED` は見逃し判定。同一シード・同一アクション列で最終状態が一致。CPU 同士の固定シード試合が必ず `game-over` に到達(イニング1/3/5/9 × 難易度3種 × 30シード)。`humanSide` を持つ試合で、人間側が全球見送り(人間攻撃時は `PITCH_ARRIVED` のみ、人間守備時は固定セルへ `THROW`)でも必ず終了する。
- `view.test.ts`: `inningLabel`(「1回表」等)、`mode`、`pitchReady`/`swingReady`/`cpuPitchPending` の組み合わせ、`scoreboard` の整形(「-」「x」)、`result` の勝敗(人間視点)、`arriveAfterMs`。
- `commentary.test.ts`: すべての `PitchResult`・`PlateOutcome` に空でない文字列。
- `launch-params.test.ts`: `?seed=42&innings=1&fast=1` → (42, 1, true)。不正値は無視して既定(seed が負・小数・文字・4294967296・空 → `null`、innings が 2/0/文字 → `null`、fast が 0/true/yes → `false`、`seed=0`・`4294967295` は有効)。先頭 `?` の有無。重複キーは最初。`getPlaybackSpeed` の2値。
- `routes/resolve-route.test.ts`: `""`・`"#"`・`"#/"`→home、`"#/baseball"`・`"#/baseball/"`→baseball、`"#/unknown"`・`"#/baseballs"`・`"#baseball"`→home。
- `balance.test.ts`(`simulate.ts` で CPU 同士、`humanSide: null`、難易度ふつう、9回制、シード1〜100、タイムアウト30秒):
  - 全試合が上限アクション数内に終了する。
  - 1チーム1イニング(半イニング)あたり得点の平均が **0.2〜1.5**。
  - 打席あたり 三振率 8〜35%、四球率 3〜15%、打率(安打/(打席-四球)) .180〜.340、本塁打率 ≤ 6%。併殺が100試合で1件以上。引き分け率 ≤ 10%。
  - ユーザーチームと CPU チームの勝率(引き分け除く)が 30〜70%(チーム間の有利不利が無い)。
  - 上記は仮のしきい値。調整は `params`・結果表・難易度・チームデータの**数値のみ**で行う(ステップ9)。

### E2E(Playwright)

- 既存 `home.spec.ts` が**無改変**で通ること。
- 新規 `baseball.spec.ts`:
  1. 「`/` のリンクからゲーム画面へ遷移できる」: `/` を開き `open-baseball` をクリック → URL が `#/baseball`、`baseball-title` が可視、見出し「loop-basic sample app」が存在しない(0件)。
  2. 「1イニングの試合が結果画面まで到達する」: `/?seed=42&innings=1&fast=1#/baseball` を開く → `setting-innings` の値が `1` → `start-game` をクリック → `scoreboard` が可視。人間は先攻(既定)で、人間攻撃中は何も操作しない(全球見送り)。人間守備中は `pitch-controls[data-ready="true"]` になるたびに `course-cell-2-2` をクリック(固定セルへ投球)。これを `result-screen` が可視になるまで繰り返す。到達後、`final-score-away`/`final-score-home` と `score-away`/`score-home` の text が `/^\d+$/`。
- 同一シード・人間の入力が見送りと固定セルのみなので試合は壁時計に依存せず決定的。`test.setTimeout(120_000)`、固定 sleep を使わない。

### 静的チェック

- `cd sample-app && npm run typecheck`、`npm run lint`、`npm run test`、`npm run build`、`npm run test:e2e --workspace frontend` がすべて成功。Knip(report-only)は判定に使わない([[knip-dead-code-detection]])。
- 構造検査(code-reviewer/tester が grep): `model/` に `from "react"`・`window.`・`document.`・`Math.random`・`Date`・`performance` が無い。`ui/` に `../model` の import が無い。`types/` が他セグメントを import していない。`cpu/` が `batting/`・`game/` を import していない。`grep -rin "パワプロ\|パワフル" sample-app --exclude-dir=node_modules` が0件。

### 手動確認(Playwright CLI でスクリーンショット)

通常速度(`fast` なし)で `npm run dev:frontend` を起動し(ゲームは backend 不要)、使い捨てスクリプト(コミットしない)で確認する。保存先は tester が決める。

1. 打撃でヒットが出る: `/?seed=7&innings=1#/baseball` を開いて開始。`ball` の `data-landing-x/y`・`data-duration-ms` を読み、`zone-svg` の矩形から画面座標へ変換(`px = left + (x / (2 × viewHalfExtent) + 0.5) × width`、`py = top + (0.5 - y / (2 × viewHalfExtent)) × height`)してマウスを移動、`data-duration-ms` 経過の直前にクリックでスイング。10球以内に実況ログに安打系(ヒット/二塁打/三塁打/ホームラン)が出る。スイング直前・結果後のスクリーンショットを撮る。Space キーでのスイングが、フォーカス中のボタンの click と二重発火しないことも確認する。
2. 投球できる: 後攻を選んで開始(人間が先に守備)。球種ボタンとコースを選んで投げ、ボールが飛行して判定されログに出る。スクリーンショットを撮る。
3. スマホ縦(viewport 390×844、`hasTouch`): レイアウトが崩れず、ドラッグでカーソルが動き、「スイング」ボタンでスイングできる(実機では未検証)。

合格基準: 1・2 でヒット/投球が確認でき、致命的な表示崩れ・コンソールエラーがない。

## リスク・トレードオフ

- **バランス(最大の不確実性)**: 結果表・強さしきい値・難易度は全て仮値。`balance.test.ts` は得点環境の「大外れ」を防ぐ程度で、面白さは保証しない。実プレイでの調整が必要。打つ側(人間)が精密にスイングすると強い打球が出やすく、簡単すぎる可能性がある(窓・強振倍率・`strongFrom` で調整)。人間投手の側は CPU 打者のノイズが位置に依存しないため、コース選択の戦略性が薄い(ゾーン内外の見極めと端の質低下、球種の打ちにくさ・球速差で差が出る程度)。
- **静的解析**: `detect-object-injection`・`pseudo-random`・cognitive complexity・`todo-tag` がゲームの典型的な書き方に直撃し、CI の `checks` が落ちると `e2e` も走らない。ステップ1の実測と、規約の徹底(code-reviewer が grep)で緩和する。
- **StrictMode と effect**: `eslint-plugin-react-hooks` 未導入のため依存配列・cleanup 漏れを lint が検出しない([[react-hooks-lint-not-installed]])。`useLatest`、cleanup の徹底、dev server(StrictMode)で走る e2e、hooks の重点レビューで緩和する。
- **タイミング精度と入力遅延**: rAF は約16.7ms刻み、タッチは遅延が数十ms。窓を±150msと広めにして `params.ts` に外出し。スイング時刻は `performance.now()` 系で統一(`event.timeStamp` は使わない: `page.clock` と整合し、判定は引数の純粋関数のまま)。
- **タブ非表示**: タブが非表示になると rAF が止まり、復帰時に経過時間が飛んで見逃し扱いになりうる(許容。将来 `visibilitychange` での一時停止を検討)。
- **キー入力の二重発火**: Space/Enter のスイングとフォーカス中ボタンの click が重なる恐れ(`preventDefault` で回避、手動確認項目に含める)。
- **e2e の長さと安定性**: `fast=1`・固定シード・見送り/固定セルのみで決定的。ただし延長で長引く可能性があるため上限120秒。ロジックを変えるとシードごとの試合展開が変わる(スコアは検証せず「到達」と「数値表示」のみを検証)。
- **再現性**: 同一シード・同一入力で同一結果。ガウスは Irwin–Hall(加減算のみ)で、エンジン差が出ない。
- **規模**: model が約30ソース+約25テスト。ステップ分割・`types/` 先行・シグネチャ固定で並列実装のずれを抑える。型契約の不一致は完了報告で上申させ、orchestrator が直列で解決する。
- **著作権/商標**: 名称・チーム名・選手名・UIは独自(架空)。公開前の最終確認(J-PlatPat 等)は人間作業。README・アプリ内文言に「パワプロ」等を書かない(grep で検査)。
- **本番にテスト用パラメータが残る**: `?seed=`/`fast=1` はCPU戦のみで実害が無いため許容(#8)。
- **Knip**: vitest 追加で Knip の vitest プラグインが有効になり、`*.test.ts` が entry 扱いになる。barrel の過剰 export は未使用 export として報告されうるが、report-only のため判定に使わない。
- **未実機検証**: タッチ操作は Playwright の `hasTouch` と viewport 縮小でしか確認しない。
- **依存**: 新規依存は `vitest`(devDependency)のみ。lockfile 同期漏れは CI の `npm ci` で失敗するため、ステップ1で `npm ci --dry-run` 相当を確認する。

## ロールバック方針

- 機能追加のみで既存機能は変更しないため、`main.tsx`(`<App />` への復元)と `App.tsx`(リンク削除)の差分を戻せば従来のアプリに復元できる。`features/baseball/`・`routes/`・`e2e/baseball.spec.ts` は孤立するので、削除しても他に影響しない。
- テスト基盤の変更(`frontend/package.json`・`frontend/vitest.config.ts`・`frontend/tsconfig.json`・ルート `package.json` の `test`・`package-lock.json`)は、元に戻すと `npm run test` は backend のみに戻る。lockfile も併せて戻すこと(CI は `npm ci`)。
- PR 単位で `git revert` 可能(DB・外部システム・データ移行なし)。backend・shared・`ci.yml` の動作は変更しない。

## 設計レビュー結果

`design-reviewer` による自動レビュー(最大2ラウンド、`/design` 実行時)の記録。

| ラウンド | 判定 | 主な指摘 |
| --- | --- | --- |
| 1 | PASS / MAJOR |  |
| 2(ラウンド1がMAJORの場合のみ) | PASS / MAJOR |  |

未解決のMAJORが残った場合: (なければ「なし」)

## コードレビュー結果

`code-reviewer` による自動レビュー(最大2ラウンド、`/implement` 実行時)の記録。

| ラウンド | 判定 | 主な指摘 |
| --- | --- | --- |
| 1 | PASS / MAJOR |  |
| 2(ラウンド1がMAJORの場合のみ) | PASS / MAJOR |  |

未解決のMAJORが残った場合: (なければ「なし」。テストレポートにも引き継ぐこと)

## 人間確認ゲート記録

| 日時 | 判断 | コメント |
| --- | --- | --- |
|  | 承認 / 修正依頼 / 差し戻し |  |

## ステップ1 試し打ち結果(実装時に記入)

ステップ1の eslint 試験実測の結果(スニペット・error/通過・ルール名)をここに転記する。

## 壁打ち(grilling)記録
