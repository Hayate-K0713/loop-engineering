# 設計: ブラウザ野球(1試合モード・CPU対戦)の追加

- 日付: 2026-10-11
- ステータス: 承認済み
- 対応する調査ドキュメント: [docs/investigations/2026-10-11-baseball-game.md](../investigations/2026-10-11-baseball-game.md)(観点別: [game-mechanics](../investigations/_parts/baseball-game/game-mechanics.md) / [tech-architecture](../investigations/_parts/baseball-game/tech-architecture.md))
- 承認者: ユーザー(hyt.wbes)
- 承認日: 2026-10-11

## 目的・スコープ

ユーザー要望「パワプロみたいな野球プレイアプリ」を、`sample-app/frontend` に**1試合モード(CPU対戦)の野球ゲーム**として追加する。ゲームロジックは `frontend/src/features/baseball/model/` の React 非依存な純粋関数として実装し(共有メモリ [[pure-function-extraction]])、乱数はすべて GameState 内のシード付きPRNG(mulberry32)で reducer 内消費する(`Math.random` は lint で error のため使わない: [[sample-app-lint-random-and-index-access]])。backend と `@sample-app/shared` は変更しない。画面は既存の `/` を保ったまま、ハッシュ `#/baseball` でゲームに切り替える。

### やること

- 1試合モード(CPU対戦)。画面タイトルは中立名「ブラウザ野球」。カーソルは「スイングカーソル」と呼ぶ。チーム・選手は架空の固定プリセット2チーム(「ルミナス」「ノーブルズ」。壁打ちで設計案どおり確定)。
- 試合設定(タイトル画面): イニング数 1/3/5/9(既定3)、先攻/後攻、難易度 かんたん/ふつう/むずかしい(既定ふつう)。延長は最大3イニング、延長回は無死一・二塁タイブレーク、決着しなければ引き分け。サヨナラあり。
- 打撃(人間攻撃時): 投球中にスイングカーソル(横長楕円)をポインタ(マウス移動/タッチドラッグ)・矢印/WASD キーで動かし、Space/Enter・クリック・画面の「スイング」ボタンでスイング。ミート打ち/強振の切替あり(強振=カーソル小・パワー補正大)。見送りはスイングしないこと。
  - 判定は調査の案C(ハイブリッド): 楕円距離+タイミング誤差Δt → 接触・質q、カーソル内の高さ → ゴロ/ライナー/フライ、Δtの早遅 → 引っ張り/流し/ファウル、q×パワー×スイング種別 → 強さ段階、表[タイプ×強さ]で1回抽選(併殺は結果種別として同じ抽選に含める)。判定窓・半径などは `params.ts` に外出し。
- 投球(人間守備時): 球種ボタン(投手ごとの持ち球。全体の球種セットはストレート/スライダー/カーブ/フォーク/シュート)で球種を選び、5×5コースグリッド(中央3×3がストライク)の**セルをクリックして選択(`aria-pressed`)→「投げる」ボタン(`throw-pitch`)で投球**する。選択は投球後も保持し、初期選択は中央(2,2)+ストレート。調査の案2-1: 選んだセル=狙い、着弾点=狙い+ガウス誤差(σはコントロールとスタミナ)。球種は球速(=タイミング)・見た目の軌道・打ちにくさ補正に効く。スタミナは球数で減り、球速低下と誤差増。投手交代なし。
- 簡易フィールド図: 小さなフィールド図(SVG。ダイヤモンド+外野フェンス弧)に、直近のインプレー打球の方向・飛距離を点(+本塁からの線)で表示する。守備モデルは持たず、`BattedBall`(type/strength/direction)と `InPlayResult` から**決定論で**逆算する(乱数を消費しない。ばらつきは `pitchSeq` 由来の決定論的な数列で作る)。
- CPU: 投手=カウント別の重み付き配球(難易度パラメータ)。打者=擬似入力(カーソル位置・スイング時刻にガウスノイズ、ゾーン内/外スイング率)を生成し、人間と同じ `resolve-pitch` を通す。
- 走者進塁は決定論(調査 game-mechanics §3-4 の表を本設計で具体化)。
- テスト用起動パラメータ `location.search` の `?seed=<uint32>&innings=<1|3|5|9>&fast=1`(`fast=1` は投球アニメ・CPU待機時間の短縮。不正値は無視して既定値)。**開発ビルド(`import.meta.env.DEV`)でのみ有効で、本番ビルドでは無視する**(判定は hooks の `useLaunchParams`)。
- デスクトップ(マウス+キーボード)とタッチ(スマホ縦画面)の両方で操作可能なレスポンシブUI。
- ルーティング: `#/baseball` で切替する自前の薄い `routes/` 層(react-router は導入しない)。`/` は従来画面のまま、`App.tsx` にゲームへのリンクを1つ追加する。
- テスト基盤: `frontend` に vitest を導入し、ルート `npm run test` を全 workspace 対象に変更(lockfile 同期を含む)。単体テスト(model 全モジュール・routes)と E2E(`e2e/baseball.spec.ts`)を新規作成する。
- ドキュメント更新: `sample-app/README.md`、`docs/process/sample-app-dev.md`(任意で `ci.yml` の step 名)。

### やらないこと(スコープ外)

- 育成モード、守備・走塁の操作、盗塁/バント/代打/継投、コールド、結果保存(localStorage/backend)、サウンド。
- backend・`@sample-app/shared` の変更。結果保存 API は作らない。
- 「パワプロ」等の名称・キャラクター・UIの使用や模倣(README・アプリ内文言・チーム名・選手名を含む)。実在の球団名・選手名・ロゴ、およびそれらを連想させる名称。
- 打球の軌道アニメーション・野手モデル(守備判定)。結果は文章ログと結果バナーに加え、簡易フィールド図の点(落下点の目安)で示すに留める。物理風判定(案A)、変化ベクトル方式の投球(案2-2)、ブレの失投確率モデル(β)。
- 確率進塁(走力による補正)、盗塁以外を含む走塁判断、死球・暴投・捕逸・ファウルフライのアウト、犠打。
- プレイヤー側アシスト(ロックオン等)、動的難易度調整(DDA)、CPU打者の「配球の読み」「連投への慣れ」。
- ルーターライブラリ(react-router)、状態管理ライブラリ、ゲームライブラリ(Phaser/Pixi)、Canvas 描画の導入。`eslint-plugin-react-hooks` の導入(別topic。open-question: [[react-hooks-lint-not-installed]])。
- Playwright のモバイル project 追加(e2e は既存の Desktop Chrome のみ)、ui/hooks のコンポーネントテスト(jsdom は使わない)。
- 多言語化(日本語固定)、本番ホスティング設定の変更、`ci.yml` の動作変更(任意の step 名変更を除く)。

### 設計の既定値と論点(壁打ち用)

orchestrator が決めた既定値(#1〜#9)と、本設計で新たに置いた判断(#10〜#19)を、根拠と「壁打ちで確認したい論点」付きで並べる。数値は全て仮値であり、`balance.test.ts` とプレイで調整する前提。**#2・#5・#8・#14 は壁打ち(2026-10-11)の人間回答により確定/変更した**(行頭に【壁打ち確定】と記す。経緯は末尾「壁打ち(grilling)記録」)。

| # | 項目 | 設計での決定 | 根拠 | 壁打ちで確認したい論点 |
| --- | --- | --- | --- | --- |
| 1 | スコープ | 1試合モード(CPU対戦)のみ。育成・守備走塁操作・盗塁/バント/代打/継投・コールド・結果保存・サウンドは対象外 | 調査で範囲確認済み。操作系を増やすと判定・UI・テストが指数的に増える | 結果保存(localStorage)を次topicにするか。コールドを設定に足す価値があるか |
| 2 | 名称・UI | 【壁打ち確定】「ブラウザ野球」、「スイングカーソル」、架空2チーム「ルミナス」(ユーザー側)・「ノーブルズ」(CPU側)、選手は名のみ | 調査 Q6: 名称は商標、UI/キャラの模倣は不競法の論点。「ミートカーソル」はパワプロ由来の呼称の可能性 | 設計案のまま確定。公開前の J-PlatPat 確認は人間作業(残) |
| 3 | 試合設定 | イニング 1/3/5/9(既定3)、先攻/後攻、難易度3段階(既定ふつう)。延長最大3回+無死一・二塁タイブレーク+引き分け+サヨナラ | 調査 3-2: 3回≈10〜15分、9回≈25〜50分。タイブレークは必ず決着に近づける | 既定3回でよいか。延長上限3回・引き分けありで爽快感は足りるか。チーム選択は設けない(自軍=固定、CPU=固定)でよいか |
| 4 | 打撃判定 | 案C。窓 ±150ms(強振は×0.75)、強さ段階は q×能力から算出、最後に表を1回抽選 | 調査 比較1: 実装小・網羅テスト可・得点環境を表で制御可 | 最後の抽選による「当たったのにアウト」はどこまで許容か。タイミング窓の広さ(入力遅延の吸収)。強振の旨味(×1.5)は妥当か |
| 5 | 投球 | 【壁打ち変更】案2-1。**セルをクリックして選択(`aria-pressed`)→「投げる」ボタン(`throw-pitch`)で投球**。選択は投球後も保持、初期選択は中央(2,2)+ストレート。狙い=セル中心、ガウス誤差、球種は球速・軌道・打ちにくさ補正。CPU打者はストレート基準でタイミングを取るため、遅い球は早振り気味になる | ミスタップ(特にタッチ)の防止。同じコースへ連投するときはボタンを押すだけで済む。UI最小・CPUとロジック共有。調査 比較2、2.7(球速差は打ち損じを増やす) | 球種の戦略性が薄い点(案2-2は将来拡張)は許容か。投球に2操作(選択+投げる)かかるテンポは許容か |
| 6 | CPU | 投手=カウント別重み表+難易度。打者=擬似入力(ノイズ)を人間と同じ判定へ。難易度はCPUの強さのみを変える | 調査 Q4: 人間と同じ解決関数を通す・σに下限 | 人間側アシストが無い「かんたん」は初心者に優しいか |
| 7 | 進塁 | 決定論(単打は2塁走者生還、1塁走者は2塁止まり等) | テスト容易・UI説明容易。調査 比較3 | 1塁走者が単打で3塁へ行かない単調さは許容か |
| 8 | テスト用起動パラメータ | 【壁打ち変更】`?seed=&innings=&fast=1` は**開発ビルド(`import.meta.env.DEV`)でのみ有効**。本番ビルドでは無視する。判定は hooks の `useLaunchParams` で行い、model の `parseLaunchParams` は渡された文字列だけを解釈する純粋関数のまま | 本番に隠しパラメータ(固定シード・高速化)を残さない。e2e は Playwright の webServer が `npm run dev`(vite dev)なので影響なし | 本番ビルドでの不具合再現(同一シード)はできなくなる(再現は dev ビルドで行う)。e2e の webServer を `vite preview` 等に変えると効かなくなる点に注意 |
| 9 | 端末 | デスクトップ+スマホ縦画面のレスポンシブ。e2e は Desktop Chrome のみ | タッチ仕様(ドラッグ=移動、ボタン=スイング)を入れるが、モバイルprojectはコスト過大 | タッチは手動確認(viewport縮小+hasTouch)のみで十分か |
| 10 | 乱数 | mulberry32。ガウスは Irwin–Hall(一様乱数12個の和−6)で近似し、`sin/cos/log/exp` を使わない | StrictMode の reducer 二重呼び出しに耐える。超越関数の実装差でエンジン間に差が出ないため同一シードの再現性が強い。lint 例外不要 | 裾が±6σで切れる点は問題ないか |
| 11 | 再生速度 | `fast=1` は壁時計の再生だけを高速化(`timeScale`)し、モデルの数値(球速・窓)は不変 | `fast` の有無で試合結果(同一シード・同一入力)が変わらない。e2e が本番ロジックを検証できる | — |
| 12 | 画面状態 | タイトル↔試合の切替は page 層の state。`GameState.phase` は `await-pitch`/`in-flight`/`game-over` のみ | `GameState` を常に有効な試合にでき、型と reducer が簡潔になる。frontend-designer 案からの調整 | — |
| 13 | rAF/副作用の作法 | 最新コールバックは `useLatest`(ref)パターン。`useEffectEvent` は使わない | `frontend/package.json` の react 範囲が `^19.0.0` で 19.2 を保証しない(lockfile は 19.2.8)。バージョン依存を増やさない | 19.2 へ範囲を引き上げて `useEffectEvent` を使う方がよいか |
| 14 | 打球の見せ方 | 【壁打ち変更】**簡易フィールド図を追加**。ダイヤモンド+外野フェンス弧の SVG に、直近のインプレー打球の方向・飛距離を点(+本塁からの線)で表示する。`BattedBall`/`InPlayResult` から決定論で逆算(乱数を消費しない。ばらつきは `pitchSeq` 由来の数列)。打球の軌道アニメ・守備モデルは持たない | 結果の手応えを補う最小コスト案。乱数を消費しないので既存の rng 消費順とシード再現性に影響しない。見た目だけの目安であり判定とは独立 | 点の位置は結果と整合する範囲の目安にすぎない(実際の野手配置とは無関係)。距離帯・フェンス距離は見た目の調整対象 |
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
- フィールド図の点は `GameState.lastInPlay` から `toGameView` が**乱数を使わず**計算する(state を変更しない)。reducer の乱数消費順は変わらない。

試合内のフェーズ遷移(`GameState.phase`):

```
await-pitch ──(CPU_PITCH / THROW)──> in-flight ──(SWING / PITCH_ARRIVED)──> await-pitch
                                                                        └─> game-over
```

1球の流れ:

1. 守備側の選択: 人間なら ui(「投げる」ボタン)→ `THROW{command}`、CPU なら hooks の `useCpuTurn` が待機後に `CPU_PITCH`。reducer が `deliverPitch`(狙い+ガウス誤差で着弾点・球速・飛行時間を決定)し、`phase = in-flight(flight)` にする。
2. 飛行中: `usePitchFlight` が rAF でボール位置を更新。人間打者がスイングすれば `SWING{swing}`、しなければ飛行時間+窓の経過後に `PITCH_ARRIVED`。CPU 打者の場合は `flight.durationMs` 経過時に `PITCH_ARRIVED`。
3. 判定: reducer が(CPU 打者なら `decideCpuBat` で擬似入力を生成し)`resolvePitch` → `PitchResult` を得て、`outcome`(カウント・アウト・走者・得点。インプレーなら `lastInPlay` も記録)→ `inning`(攻守交代・延長・サヨナラ・終了)の順に遷移を計算し、ログを追記して `await-pitch` か `game-over` へ。

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
                │   ├── batting.ts       SwingKind, SwingInput, CpuBatDecision, BattedBall, PitchResult(designer案の PlateResult を 1球の結果として改名), ★BattedLanding
                │   ├── game.ts          GameConfig, Phase(判別共用体), Count, Bases, GameState(rng を含む), ★InPlayRecord
                │   ├── actions.ts       GameAction(判別共用体)
                │   └── view.ts          GameView ほか ui 用の表示データ型(★FieldMarkerView, FieldDiagramGeometry)
                ├── model/               React 非依存の純粋関数 + 同居 *.test.ts
                │   ├── rng/             rng.ts(mulberry32: createRng/nextFloat/nextInt、[値, 次状態]を返す), sampling.ts(nextGaussian, pickWeighted)
                │   ├── pitch/           zone.ts(5×5セル↔ZonePoint、isStrike), kinds.ts(Map<PitchKind, PitchSpec>), delivery.ts(狙い+コントロール/疲労→ガウス誤差→着弾点), flight.ts(ballPositionAt(flight, elapsedMs)), ★params.ts(投球・飛行の定数)
                │   ├── batting/         params.ts(判定窓・カーソル半径・閾値、データ。★落下点の距離帯・フェンス距離も含む), cursor.ts(移動・クランプ・clientToZonePoint・楕円半径), contact.ts(楕円距離+タイミング誤差→接触・質q), batted-ball.ts(q・高さ・Δt・パワー→タイプ/強さ/方向/ファウル、決定論), result-table.ts([タイプ×強さ]→結果の重み表、drawInPlayResult で1回抽選), resolve-pitch.ts(1球判定の司令塔。人間もCPUも同じ関数), ★batted-landing.ts(BattedBall+InPlayResult+pitchSeq → フィールド図上の落下点。決定論・乱数なし)
                │   ├── cpu/             difficulty.ts(データ。★CPU共通定数も同居), pitcher-weights.ts(カウント別配球重み、キー "b-s" の Map), cpu-pitcher.ts(chooseCpuPitch), cpu-batter.ts(decideCpuBat: スイング判断+ガウスノイズ)
                │   ├── data/            teams.ts(架空チーム・選手プリセット+getTeam), teams.test.ts
                │   └── game/            state.ts(createInitialState), count.ts, runners.ts(決定論進塁、乱数なし), outcome.ts, inning.ts(攻守交代・最終回/延長/サヨナラ/引き分け), reducer.ts(action種別ごとに委譲), view.ts(toGameView), commentary.ts, launch-params.ts(?seed=&innings= 等の検証), balance.test.ts(CPU同士の固定シード試合ループ: 必ず終了・得点環境が許容範囲), ★side.ts(Side の補助。bySide/updateSide で SideTally・teams・lineScore の添字アクセスを関数化), ★simulate.ts(CPU同士の試合を最後まで回し、最終状態と打席結果の列を返す。balance.test.ts と reducer.test.ts が使う), ★test-fixtures.ts(game のルール部分のテスト用に GameState/Team を直書きしたフィクスチャ。本番コードからは import しない)
                ├── hooks/               useGame.ts(useReducer+useMemo(toGameView)+操作関数), useCpuTurn.ts(CPU手番・自動進行を setTimeout で dispatch、cleanup必須), useAnimationFrame.ts(汎用rAF、cleanupでcancel。★最新コールバックは useLatest), usePitchFlight.ts(ref+rAFで SVG 属性を更新、到達時 onArrive), usePointerInput.ts, useKeyboardInput.ts(event.repeat 無視), useBattingControls.ts(合成。★スイング種別の state も持つ), useLaunchParams.ts(location.search を1回読む。★開発ビルドのみ), ★useLatest.ts(最新値 ref), ★random-seed.ts(createRandomSeed: crypto.getRandomValues)
                └── ui/                  BaseballGamePage.tsx(★タイトル↔試合の切替は page 層 state。試合中の GameState.phase で結果画面を重ねる), TitleScreen.tsx, GameScreen.tsx(★投球の選択状態 {kind, cell} を持つ), ★GameLayout.tsx(試合画面のレイアウト・配線), Scoreboard.tsx(★inning-label と LineScore・CountLamps・BaseDiamond を内包), LineScore.tsx, CountLamps.tsx, BaseDiamond.tsx, ★FieldDiagram.tsx(簡易フィールド図: ダイヤモンド+フェンス弧+打球の点), ★MatchupPanel.tsx(打者・投手・球数・スタミナ・球速), BattingView.tsx(★ゾーン周りの hooks 結線。人間守備中もボール軌跡の表示に使い、overlay で CourseGrid を重ねる), ★StrikeZoneSvg.tsx(ゾーンSVG・カーソル・ボールの描画のみ), ★SwingControls.tsx(スイングボタン・ミート/強振切替), PitchingControls.tsx(★球種ボタン+「投げる」ボタン。制御コンポーネント), PitchKindButtons.tsx(★制御コンポーネント), CourseGrid.tsx(5×5 の <button>。★制御コンポーネント、aria-pressed で選択), ResultScreen.tsx, CommentaryLog.tsx(aria-live。★last-event も表示), baseball.css(クラス名は bb- 接頭辞), ★baseball-field.css(GameLayout/BattingView 用。CSS の所有ステップを分けるため)
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
| `hooks/` | useReducer、rAF/Pointer/Keyboard/タイマー購読、ref、シード生成(`crypto.getRandomValues`、`?seed=` 指定時はその値。開発ビルドのみ)、`import.meta.env.DEV` の判定 | 判定ロジック、JSX |
| `ui/` | view と callback を描画・配線するだけ | `model/` の直接 import、データ加工 |

model 内部の依存 DAG(循環禁止): `rng ← pitch ← batting ← game`(game が最上位)、`rng ← cpu`(cpu は pitch 参照可、batting/game 参照不可)、`data ← types のみ`。CPU打者は擬似入力を返すだけで、判定は batting/resolve-pitch に渡す。落下点の計算(`batting/batted-landing.ts`)は `BattedBall`/`InPlayResult` の派生値なので batting に置き、game の `view.ts` から呼ぶ(DAG の向きに沿う)。

lint を踏まえたモジュール規約: 変数添字禁止(`Array.from`、`readonly Row[]`+`.find()`、`Map`、`switch`。`record[kind]` 禁止)/`Math.random` 禁止(乱数は state.rng のみ)/case 1つ以下、または default を含む case 2つの switch 禁止(no-small-switch。★実挙動に合わせて修正。明示 case 2つの switch は通過するが、本設計では2値の分岐は非ネストの三項演算子に統一する)/reducer は action ごとにハンドラ委譲し 60行・複雑度20・cognitive 15 以内/ネスト三項禁止/大きなテーブルは関数外のデータ定数/TODO コメント禁止。

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
3. **ファイル追加**: `model/pitch/params.ts`(投球定数をbattingから分離しDAGを保つ)、`model/game/side.ts`(`tally[side]` は `detect-object-injection` に触れるため関数化)、`model/game/simulate.ts`、`model/game/test-fixtures.ts`、`hooks/useLatest.ts`、`hooks/random-seed.ts`、`ui/baseball-field.css`、`ui/GameLayout.tsx`・`ui/MatchupPanel.tsx`・`ui/StrikeZoneSvg.tsx`・`ui/SwingControls.tsx`(60行制限とステップ境界のための分割。下記10)。
4. **`useEffectEvent` を使わない**(#13): 最新コールバックは `useLatest` の ref パターン。
5. **GameState に `lastResult`/`lastPlate` を持たせた**: バランス検証・結果バナー・ログ生成のため。
6. **`types/view.ts` に `FieldGeometry` を含める**: ui が `model/` を import せずにゾーンSVGを描くため。
7. **`useLaunchParams` が再生速度も返す**: ui が `getPlaybackSpeed`(model)を直接 import しないため、hooks 側で `parseLaunchParams` と `getPlaybackSpeed` を呼ぶ。起動パラメータは開発ビルドのみ有効(#8)で、`import.meta.env.DEV` の判定も hooks 側に置く。
8. **簡易フィールド図の追加(壁打ち Q1)**: `model/batting/batted-landing.ts`(落下点の計算。batting に置く理由は上記 DAG の項)、`ui/FieldDiagram.tsx`、`GameState.lastInPlay`(`InPlayRecord`)、`GameView.fieldMarker`/`fieldDiagram`、型 `BattedLanding`/`FieldMarkerView`/`FieldDiagramGeometry`。
9. **投球操作を「セル選択→投げるボタン」に変更(壁打ち Q2)**: 選択状態 `{ kind, cell }` は `GameScreen`(ステップ11)が `useState` で持つ(初期=ストレート+中央(2,2))。`PitchingControls`・`PitchKindButtons`・`CourseGrid` は選択値と変更コールバックを props で受ける**制御コンポーネント**(ステップ4)で、選択中を `aria-pressed` で示す。`CourseGrid` はゾーンの正方形に重ねるため、`GameLayout` が `BattingView` の `overlay` prop に渡す(`PitchingControls` とは兄弟になるので、状態を共通の親に持ち上げた。設計レビュー M1)。
10. **ui のステップ境界(設計レビュー M1)**: props だけで描けるもの(`Scoreboard` 系、`FieldDiagram`、`MatchupPanel`、`StrikeZoneSvg`、`SwingControls`、`PitchingControls` 系、`CommentaryLog`、`ResultScreen`、`TitleScreen`)はステップ4、hooks を使って結線するもの(`BaseballGamePage`・`GameScreen`・`GameLayout`・`BattingView`)はステップ11。`data-testid` の所属は「UI 設計」の対応表で一意に決める。

#### リスク・要検証事項(frontend-designer より)

1. セグメント間依存は機械的に強制されない → code-reviewer/tester が grep で確認(`model/` に `from "react"`・`window.`・`document.` なし、`ui/` に `../model` import なし、`types/` に他セグメント import なし)
2. `eslint-plugin-react-hooks` 未導入 → effect を持つ hooks(useAnimationFrame, usePitchFlight, usePointerInput, useKeyboardInput, useCpuTurn)を重点レビュー
3. hooks/ui は unit テスト不可 → e2e。CPUの待ち時間・投球アニメ時間を短縮する入口が必要(本設計では `fast=1`。開発ビルドのみ)
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
  - `BattedLanding = { x: number; y: number; distance: number; lateral: number; overFence: boolean }`(フィールド図上の落下点。**座標系**: 原点=本塁、y=本塁からセンター方向(外野側)が正、x=右(ライト側)が正、単位はメートル相当の図上の長さ。`distance = sqrt(x² + y²)`、`lateral = x / y`(左右の振れ。±1 がファウルライン=45°)。**値域**: `0 < y ≤ 125`、`distance` は 14〜125、`|lateral| ≤ 0.85`(フェア内)、`overFence = distance ≥ fenceRadius`(フェンス半径 105)。打者の左右は持たず全員右打ち扱いとし、引っ張り=レフト側(x<0)、流し=ライト側(x>0)で固定)
- `game.ts`
  - `Difficulty = "easy" | "normal" | "hard"`、`Innings = 1 | 3 | 5 | 9`
  - `GameConfig = { innings: Innings; humanSide: Side | null; difficulty: Difficulty }`(`humanSide: null` は CPU 同士=テスト/バランス検証専用。UI では選べない)
  - `Count = { balls: number; strikes: number }`(不変条件: 0〜3 / 0〜2)、`Bases = { first: boolean; second: boolean; third: boolean }`
  - `Phase = { kind: "await-pitch" } | { kind: "in-flight"; flight: PitchFlight } | { kind: "game-over"; winner: Side | null }`(`winner: null` は引き分け)
  - `LineScore = { away: readonly number[]; home: readonly number[] }`(各半イニングの得点。添字=イニング-1。未到達/スキップされた裏は配列長で表現)
  - `LogEntry = { seq: number; text: string }`
  - `InPlayRecord = { seq: number; result: InPlayResult; ball: BattedBall }`(直近のインプレー打球。`seq` はその投球の `pitchSeq`)
  - `GameState`:
    - `config`、`teams: { away: Team; home: Team }`、`rng: RngState`
    - `inning`(1始まり)、`half`、`outs`(0〜2。3は `outcome` から `inning` に渡す一時値)、`count`、`bases`
    - `lineScore`、`hits: SideTally`、`errors: SideTally`(守備側チームの失策数)
    - `lineupIndex: SideTally`(各チームの現在の打者番号 0〜8)、`pitchCounts: SideTally`(各チームの投手の投球数)
    - `pitchSeq: number`(投球通し番号)、`lastPitchKind: PitchKind | null`(直前の投球。攻守交代でリセット)
    - `lastResult: PitchResult | null`、`lastPlate: PlateOutcome | null`(直近の1球の結果と、打席が終わったならその結果。バランス検証・バナー・ログ用)
    - `lastInPlay: InPlayRecord | null`(直近のインプレー打球。インプレー以外の投球では更新せず保持し、攻守交代でもクリアしない。フィールド図用)
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
    - `flight: PitchFlight | null`、`arriveAfterMs: number`(`PITCH_ARRIVED` を送るまでの経過ゲーム時間)、`pitchSpeedLabel: string`(飛行中は「142km/h ストレート」のように球速(整数に丸め)と球種名、それ以外は「-」。ui が整形しないで済むように view で作る)
    - `pitchReady: boolean`(人間が投げられる)、`swingReady: boolean`(人間がスイングできる)、`cpuPitchPending: boolean`(CPU が投げる番)
    - `turnKey: string`(`${pitchSeq}:${phase.kind}`。effect のキー)
    - `lastEvent: string`、`log: readonly LogEntry[]`(直近50件)
    - `geometry: FieldGeometry`(`FieldGeometry = { viewHalfExtent: number; zoneHalf: number; gridHalf: number; ballRadius: number }`。ゾーンSVG用)
    - `fieldMarker: FieldMarkerView | null`(`lastInPlay` が `null` の間は `null`)、`fieldDiagram: FieldDiagramGeometry`(フィールド図SVG用の定数)
    - `result: ResultView | null`(`ResultView = { humanOutcome: "win" | "lose" | "draw" | null; headline: string; awayRuns: number; homeRuns: number }`)
  - `FieldMarkerView = { seq: number; result: InPlayResult; x: number; y: number; distance: number; lateral: number; overFence: boolean }`(`BattedLanding` の各値+`seq`・`result`。座標系・値域は `BattedLanding` と同じ)
  - `FieldDiagramGeometry = { baseDistance: number; fenceRadius: number; viewHalfWidth: number; viewTop: number; viewBottom: number }`(図の座標系は `BattedLanding` と同じ。値は `batting/params.ts` の `LANDING_PARAMS` の同名フィールドで、初期値は `baseDistance 27.4`、`fenceRadius 105`、`viewHalfWidth 85`、`viewTop 130`、`viewBottom -8`。ui はこれらから SVG の `viewBox`(y を反転)、塁の位置(1塁 (+baseDistance/√2, +baseDistance/√2)、2塁 (0, baseDistance×√2)、3塁 (-baseDistance/√2, +baseDistance/√2))、ファウルライン(本塁から ±45° でフェンスまで)、フェンス弧(半径 `fenceRadius`、±45° の間)を描く)

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
- `deliverPitch(rng, { pitcher, command, pitchCount, aimSigmaScale, seq }): WithRng<PitchFlight>`(`seq` には呼び出し側が**加算後の** `pitchSeq`(= `state.pitchSeq + 1`)を渡し、`flight.seq` になる。`ball` の `data-seq` と `lastInPlay.seq` をこの値で一致させるため。`pitchCount` は加算前の投球数):
  - `aim = cellToPoint(command.cell)`、`σ = baseSigma × (1 + (100 - control)/100 × controlSigmaFactor) × (1 + fatigue × fatigueSigmaGain) × aimSigmaScale`(人間投手は `aimSigmaScale = 1`、CPU は難易度の値)。
  - `landing = aim + (gauss×σ, gauss×σ)` を ±`landingLimit` にクランプ。
  - `speedKmh = pitcher.speedKmh + spec.speedOffsetKmh - fatigue × fatigueSlowKmh`、`durationMs = round(flightMsKmh / speedKmh)`。
- `ballPositionAt(flight, elapsedMs): BallPosition`(表示専用): 進行度 `p = clamp(elapsed/duration, 0, 1)`。開始点(`startPoint`、`startScale`)から着弾点へ補間し、`bend × (1 - p)²` を加算して `p=1` で必ず `landing` に一致。`scale` は `startScale` から 1 へ。`sin/cos` は使わない。
- `pitch/params.ts`(`PITCH_PARAMS`): `baseSigma 0.28`、`controlSigmaFactor 1.0`、`pitchesPerStamina 2.2`、`fatigueStartRatio 0.6`、`fatigueSigmaGain 0.8`、`fatigueSlowKmh 10`、`flightMsKmh 190000`(140km/h≈1357ms)、`landingLimit 2.0`、`viewHalfExtent 2.0`、`zoneHalf 1.0`(ストライクゾーンの半幅)、`gridHalf 5/3`(5×5 グリッドの半幅)、`ballRadius 0.12`、`startPoint (0, 0.4)`、`startScale 0.25`。`GameView.geometry`(`FieldGeometry`)の4値(`viewHalfExtent`・`zoneHalf`・`gridHalf`・`ballRadius`)は `game/view.ts` がここから組み立てる。

#### 打撃判定(`batting/`、案C)

入力座標はすべてゾーン単位。判定は次の5段で、**抽選は最後の1回だけ**(乱数を消費するのは `drawInPlayResult` のみ)。

1. **カーソル半径** `cursorRadii(batter, kind)`: `rx = meetBaseRx + meetRxPerAbility × meet`、`ry = rx × aspect`。強振は `× powerScale`。判定時はさらに球種の `cursorScale` を掛ける。
2. **接触** `measureContact`: `dtMs = swing.atMs - flight.durationMs`(負=早い)、`windowMs = contactWindowMs × (強振なら powerWindowScale)`、`d = sqrt(((bx-cx)/rx)² + ((by-cy)/ry)²)`(`Math.hypot` は使わない)。`contact = d ≤ 1 かつ |dtMs| ≤ windowMs`。`q = (1 - d) × (1 - |dtMs|/windowMs) × edgeFactor`、`edgeFactor = 1 - edgePenaltyPerUnit × max(0, max(|bx|,|by|) - edgePenaltyStart)`(ゾーン端・ボールゾーンほど質が落ちる)。接触しなければ `miss`(空振り)。
3. **打球形成** `shapeContact`:
   - 高さ: `v = (by - cy)/ry`。`s = (trajectory - 2) × trajectoryShiftPerLevel`。`v > linerHalfBand - s` → `fly`、`v < -(linerHalfBand + s)` → `ground`、それ以外 `liner`。
   - 方向: `|dtMs|/windowMs < centerRatio` → `center`、`dtMs < 0` → `pull`、`dtMs > 0` → `opposite`。
   - ファウル: `|dtMs|/windowMs ≥ foulRatio` → `foul`(抽選なし)。
   - 強さ: `score = q × (powerBase + powerPerAbility × power) × スイング種別係数 × 方向係数`。スイング種別係数は2値なので非ネストの三項演算子(`swing.kind === "power" ? kindFactor.power : kindFactor.meet`)で、方向係数は3値なので `switch (direction)`(case 3つ)で `directionFactor.pull`/`.center`/`.opposite` を返す小関数で引く(`kindFactor[swing.kind]` のような変数添字は lint error)。`score < mediumFrom` → weak、`< strongFrom` → medium、それ以上 strong。
4. **結果表** `RESULT_TABLE`(9行: タイプ×強さ)から `drawInPlayResult(rng, ball, doublePlayPossible)` で1回抽選。`doublePlayPossible = bases.first かつ outs < 2`。不可能な場合は `doublePlay` の重みを `groundout` に畳み込んでから抽選する(結果種別としての併殺を同じ1回の抽選に含める)。
5. **`resolvePitch(rng, { flight, swing, batter, outs, bases }): WithRng<PitchResult>`**: `swing` が `null`(見送り)なら `isStrike(landing)` で `called-strike`/`ball`(乱数を消費しない)。スイングありなら 2→3 を経て `miss` → `swinging-strike`、`foul` → `foul`、`fair` → 4 の抽選結果を `in-play` で返す。人間・CPU 共通。

`batting/cursor.ts` の補助: `INITIAL_CURSOR`(ゾーン中心 (0,0))、`clampCursor`、`moveCursor(cursor, direction, dtMs)`(押下方向×`keyboardSpeed`×dt、クランプ)、`clientToZonePoint(client, rect)`(SVG の矩形→ゾーン座標。y 反転。`viewHalfExtent` 基準でクランプ)。

`batting/params.ts`(`BATTING_PARAMS`)初期値: `meetBaseRx 0.50`、`meetRxPerAbility 0.004`、`aspect 0.6`、`powerScale 0.65`、`cursorLimit 1.8`、`keyboardSpeed 3.0`(ゾーン単位/秒)、`contactWindowMs 150`、`powerWindowScale 0.75`、`foulRatio 0.70`、`centerRatio 0.25`、`edgePenaltyStart 0.6`、`edgePenaltyPerUnit 0.4`、`linerHalfBand 0.30`、`trajectoryShiftPerLevel 0.10`、`powerBase 0.6`、`powerPerAbility 0.008`、`kindFactor {meet 1.0, power 1.5}`、`directionFactor {pull 1.15, center 1.0, opposite 0.9}`、`mediumFrom 0.18`、`strongFrom 0.42`(当初の叩き台 0.15/0.35 から、ステップ9のバランス検証で調整。CPU ふつうの q が想定より高く打率 .36 になったため)。

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

#### 落下点(`batting/batted-landing.ts`、フィールド図用)

打球の見た目の目安を、守備モデルを持たずに**決定論で**逆算する(壁打ち Q1)。`computeBattedLanding(ball: BattedBall, result: InPlayResult, seq: number): BattedLanding`。**乱数(`RngState`)を引数に取らず消費しない**ため、reducer の乱数消費順・シード再現性に影響しない。`sin/cos/log/exp` も使わない。

- **ばらつき**: `seq`(投球通し番号)から黄金比数列で 0〜1 の2値を作る: `t1 = frac(seq × 0.6180339887)`、`t2 = frac(seq × 0.7548776662 + 0.5)`(`frac(x) = x - floor(x)`)。同じ打球でも `seq` が違えば点が変わるが、同じ入力は常に同じ点になる。
- **距離**: `distance = min + t1 × (max - min)`。`[min, max]` は `(result, type, strength)` から `LANDING_BANDS`(`params.ts` のデータ表。`.find()` で先頭一致、`any` は任意に一致)で引く。初期値(メートル相当、フェンス半径 105):

  | result | type | strength | min | max |
  | --- | --- | --- | --- | --- |
  | groundout | any | any | 14 | 32 |
  | doublePlay | any | any | 16 | 30 |
  | flyout | any | weak | 35 | 60 |
  | flyout | any | medium | 60 | 90 |
  | flyout | any | strong | 90 | 103 |
  | lineout | any | weak | 25 | 45 |
  | lineout | any | medium | 40 | 70 |
  | lineout | any | strong | 55 | 90 |
  | single | ground | any | 28 | 55 |
  | single | liner | any | 45 | 80 |
  | single | fly | any | 38 | 65 |
  | double | any | any | 78 | 98 |
  | triple | any | any | 98 | 104 |
  | homerun | any | any | 106 | 125 |
  | error | any | any | 18 | 50 |

  全 `InPlayResult` × `BattedType` × `Strength` の組み合わせに必ず1行以上一致すること(一致なしは `Error`)。ホームラン以外は `distance < fenceRadius`(フェンス内)、ホームランは `distance ≥ fenceRadius`(フェンス外)。
- **左右**: `lateral`(= x/y)を方向の範囲内で `t2` で決める: `pull` は -0.85〜-0.25(レフト側)、`center` は -0.25〜+0.25、`opposite` は +0.25〜+0.85(ライト側)。tan 換算で約14°と約40°が境界。
- **座標**: `y = distance / sqrt(1 + lateral²)`、`x = lateral × y`(`distance² = x² + y²`、`x/y = lateral`)。`overFence = distance ≥ fenceRadius`。
- 定数(`batting/params.ts` の `LANDING_PARAMS`): `fenceRadius 105`、`baseDistance 27.4`、`viewHalfWidth 85`、`viewTop 130`、`viewBottom -8`(この3つはフィールド図の描画範囲。全落下点が収まる: 最大 `distance 125`・`|lateral| 0.85` で `|x| ≈ 81`、`y ≤ 125`)、方向ごとの `lateral` 範囲、`LANDING_BANDS`、黄金比の係数。`FieldDiagramGeometry` の5値(`baseDistance`・`fenceRadius`・`viewHalfWidth`・`viewTop`・`viewBottom`)は `game/view.ts` がここから組み立てる。

#### CPU(`cpu/`)

- 難易度表 `getDifficulty(difficulty): DifficultyParams`(フラットなオブジェクト。初期値は調査 4-3 をカーソル半径に合わせて置き直したもの):

  | 難易度 | zoneSwingRate | chaseSwingRate | cursorSigma | timingSigmaMs | aimSigmaScale | twoStrikeOutsideRate |
  | --- | --- | --- | --- | --- | --- | --- |
  | easy | 0.55 | 0.40 | 0.40 | 80 | 1.4 | 0.20 |
  | normal | 0.65 | 0.30 | 0.34 | 65 | 1.0 | 0.35 |
  | hard | 0.70 | 0.20 | 0.27 | 52 | 0.75 | 0.50 |

  (`cursorSigma`/`timingSigmaMs` はステップ9で調整済み。当初値 easy 0.45/90・normal 0.30/60・hard 0.20/40 では easy の CPU 打率 .167・hard .49 と極端だったため)

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

- 引数の `difficulty` は、`chooseCpuPitch`・`decideCpuBat` とも **`DifficultyParams`(解決済みのパラメータオブジェクト)**。`Difficulty`(`"easy"` 等のキー)から `getDifficulty` で引くのは呼び出し側(`game/reducer.ts`)の責務。
- `chooseCpuPitch(rng, { count, pitcher, lastKind, difficulty }): WithRng<PitchCommand>`: ①ゾーン内/外: `zoneRate`(ただし strikes=2 かつ balls<2 は `1 - twoStrikeOutsideRate`)。②球種: `straight` に `fastballRate`、持ち球の他の球種に `(1 - fastballRate)/n` ずつ。直前と同じ球種は `repeatKindPenalty` を掛ける。持ち球が `straight` のみなら `straight`。③セル: ゾーン内は 9 セルを `1 + edgeBias × (|col-2| + |row-2|)` の重みで、ゾーン外は 16 セル(外周角は重み1、他は2)。
- `decideCpuBat(rng, { flight, count, batter, pitcher, difficulty }): WithRng<CpuBatDecision>`: ①`inZone = isStrike(landing)`、`swingRate = inZone ? zoneSwingRate : chaseSwingRate`。strikes=2 なら `+twoStrikeSwingBoost`(上限0.95)、balls=3 かつ strikes<2 なら `× threeBallsSwingFactor`。乱数が `swingRate` 以上なら `take`。②スイング種別: strikes=2 は `meet`、それ以外は確率 `powerSwingBase + powerSwingPerAbility × power` で `power`。③`cursor = landing + gauss×(cursorSigma × (inZone ? 1 : outsideSigmaScale))`(x・y 独立)。④`atMs = durationMs - speedDiffBiasRatio × (durationMs - fastballDurationMs) + gauss × timingSigmaMs`。`fastballDurationMs = round(flightMsKmh / pitcher.speedKmh)`(CPU 打者は投手のストレート基準でタイミングを取るため、遅い球は早振りになり、ファウル・空振りが増える)。

#### チームデータ(`data/`)

- 固定プリセット2チーム(ユーザー側 `PLAYER_TEAM`=「ルミナス」、CPU側 `CPU_TEAM`=「ノーブルズ」)。各チーム9人の打者と先発投手1人。選手名は実在の球団・選手と一致/連想しない架空の名のみ(カタカナ)。
- 能力の目安: 打者 meet 45〜70・power 35〜75・trajectory 1〜3(各チーム1人は4)。投手 speedKmh 140〜146・control 55〜70・stamina 60〜75。持ち球は `straight` を含む3〜4球種(チームごとに構成を変える)。2チームの打者能力の平均差は小さく(meet・power とも差5以内)、投手能力も同程度にする(先攻/後攻・チームの有利不利を作らない)。
- `getTeam(id): Team`(未知 id は `Error`)。ユーザーの陣営割り当ては `createInitialState` が行う(`humanSide` が `"home"` ならユーザーチームが後攻、それ以外(`"away"`/`null`)は先攻)。

#### 試合進行(`game/`)

- `side.ts`: `opponent(side)`、`offenseSide(half)`、`defenseSide(half)`、汎用の `bySide<T>(pair: { readonly away: T; readonly home: T }, side): T` と `updateSide<T>(pair, side, fn: (value: T) => T): { away: T; home: T }`(不変更新)。`SideTally`・`teams`・`lineScore` のいずれにも使う。`tallyAdd(tally, side, n)` は `updateSide` の薄いラッパ。2値なので `side === "away" ? ... : ...` の非ネスト三項で実装し、変数添字を使わない。
- `count.ts`: `applyBall`/`applyStrike`/`applyFoul(count) → { count, end: "none" | "walk" | "strikeout" }`。ボール4で `walk`、ストライク3(見逃し・空振り)で `strikeout`。ファウルは strikes<2 なら +1、2ストライク後は不変。
- `runners.ts`: `advanceRunners(bases, outs, play: { kind: "walk" | "strikeout" | InPlayResult; strength: Strength | null }): { bases; runs; outsAdded }`。**決定論**:

  | 打席結果 | 走者・打者の動き | outsAdded |
  | --- | --- | --- |
  | walk | 強制進塁のみ(打者は1塁、1塁が埋まっていれば押し出し連鎖) | 0 |
  | single | 1塁走者→2塁、2塁走者・3塁走者→生還、打者→1塁 | 0 |
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

  `doublePlay` の事前条件は「1塁走者あり かつ `outs < 2`」。満たさない入力(1塁が空き、または2アウト)は**プログラミングエラーとして `Error` を投げる**(`drawInPlayResult` がその場合に `doublePlay` を `groundout` に畳み込むため、正しい呼び出しでは到達しない)。事前条件から `outs + 2 ≤ 3` なので、アウト数が4になることはない(丸め処理は不要)。テストでは事前条件違反の組み合わせを網羅対象から除外し、代わりに `Error` を投げることを確認する。
- `outcome.ts`: `applyPitchResult(state, result): GameState`。`count.ts` でカウントを進め、打席が終わる(walk/strikeout/in-play)なら `advanceRunners` を適用して outs・bases・現在の半イニングの得点・`hits`(single〜homerun)・`errors`(守備側。`error`)・`lineupIndex`(+1 mod 9)を更新し、カウントを0-0に戻す。`lastResult` は毎球その球の結果を設定する。**`lastPlate` は打席が終わった球ではその結果(`walk`/`strikeout`/`InPlayResult`)、打席が続く球(ボール3つ以下・ストライク2つ以下・ファウル)では `null` を設定する**(`simulate.ts` が `lastPlate !== null` で打席の終わりを数えるための契約)。`result.kind === "in-play"` のときは `lastInPlay = { seq: state.pitchSeq, result: result.result, ball: result.ball }` を設定する(それ以外の投球では更新しない)。`state.pitchSeq` は投球時に加算済みで次の投球まで変わらないため、解決中の球の `flight.seq` と一致する。攻守交代は行わない(`outs` が3になりうる)。
- `inning.ts`: `settleInning(state): GameState`。順に判定する: ①**サヨナラ**: 裏で `inning ≥ innings` かつ後攻が先攻を上回った瞬間に `game-over`(後攻勝ち)。②`outs ≥ 3` なら半イニング終了: 表の終了で `inning ≥ innings` かつ後攻リード → `game-over`(後攻勝ち。裏は行わず「x」)、それ以外は同イニングの裏へ。裏の終了で `inning < innings` → 次イニングの表。`inning ≥ innings` で得点差あり → `game-over`、同点なら延長へ(`inning < innings + 3`)、`inning ≥ innings + 3` なら引き分け。③新しい半イニング開始時は outs=0、カウント0-0、走者クリア、`lastPitchKind = null`、`lineScore` に0を追加(`lastInPlay` は保持)。延長の各半イニング(`inning > innings`)は走者を1塁・2塁にセット(タイブレーク)。`EXTRA_INNINGS_MAX = 3` を公開。
- `state.ts`: `createInitialState({ config, seed })`。1回表、outs 0、0-0、走者なし、`lineScore = { away: [0], home: [] }`、`rng = createRng(seed)`、`phase = await-pitch`、`pitchSeq 0`、`pitchCounts`/`hits`/`errors`/`lineupIndex` 全0、`lastInPlay = null`、`log` 空。
- `reducer.ts`: `reduce(state, action)`。`switch (action.type)`(4ケース)で `handleCpuPitch`/`handleThrow`/`handleSwing`/`handlePitchArrived` に委譲。

  | action | 有効条件 | 効果 |
  | --- | --- | --- |
  | `CPU_PITCH` | `await-pitch` かつ守備側が CPU | `chooseCpuPitch`(`difficulty = getDifficulty(config.difficulty)`)→ `deliverPitch`(`seq = pitchSeq + 1`)→ `in-flight`。`pitchSeq`+1、守備側 `pitchCounts`+1、`lastPitchKind` 更新 |
  | `THROW` | `await-pitch` かつ守備側が人間 | `command` を `deliverPitch`(`aimSigmaScale = 1`)→ `in-flight`。他は同上 |
  | `SWING` | `in-flight` かつ攻撃側が人間 | `resolvePitch(swing)` → `applyPitchResult` → `settleInning` → ログ追記 → `await-pitch`/`game-over` |
  | `PITCH_ARRIVED` | `in-flight` | 攻撃側が CPU なら `decideCpuBat` の結果(`take` なら `swing = null`)、人間なら `swing = null` で `resolvePitch` し、以降は `SWING` と同じ |

  無効な組み合わせは同一参照の `state` を返す。
- `view.ts`: `toGameView(state): GameView`。`arriveAfterMs = durationMs + (人間打者 ? contactWindowMs : 0)`。`pitchReady = await-pitch かつ人間が守備`、`swingReady = in-flight かつ人間が攻撃`、`cpuPitchPending = await-pitch かつ CPU が守備`。`scoreboard.columns = max(innings, inning)`。`result` は `game-over` のときのみ。`fieldMarker` は `state.lastInPlay` が非 `null` のとき `computeBattedLanding(ball, result, seq)` の結果に `seq`・`result` を加えて作り(`null` なら `null`)、`fieldDiagram` は `LANDING_PARAMS`、`geometry` は `PITCH_PARAMS` から組み立てる。`state` も `rng` も変更しない。
- `commentary.ts`: `PitchResult`・`PlateOutcome`・得点・攻守交代・試合終了から日本語のログ行を作る(例: 「ボール」「見逃しストライク」「空振り」「ファウル」「ヒット」「二塁打」「ホームラン」「併殺打」「三振」「四球」「3アウトチェンジ」「N点が入りました」「試合終了」)。反映は reducer が1解決につき数行まで `log` に追記する。
- `launch-params.ts`: `parseLaunchParams(search: string): LaunchParams`、`getPlaybackSpeed(fast): PlaybackSpeed`(通常 `{ timeScale: 1, cpuWaitMs: 700 }`、fast `{ timeScale: 8, cpuWaitMs: 20 }`)。検証規則: `seed` は `/^\d{1,10}$/` かつ 0〜4294967295 の整数のみ有効(それ以外は `null`)、`innings` は 1/3/5/9 のみ有効、`fast` は値が正確に `"1"` のときのみ `true`。先頭の `?` の有無どちらも可。重複キーは最初の値。**開発ビルド限定の判定(`import.meta.env.DEV`)は hooks 側で行い、この関数は渡された文字列だけを解釈する純粋関数のまま**(本番では hooks が空文字列を渡す)。
- `commentary.ts` と `launch-params.ts` は `types/` にしか依存しないので、ルール部分と同じステップ8で実装する(ステップ9を短くするため)。
- `simulate.ts`: `simulateGame(config, seed, maxActions = 10_000): SimulationResult`。`SimulationResult = { final: GameState; plates: readonly PlateOutcome[]; actions: number }` は model 内部の型として `simulate.ts` に定義する(`types/` には置かない)。`humanSide: null` を前提に、`CPU_PITCH` と `PITCH_ARRIVED` を交互に dispatch して `game-over` まで回し、`PITCH_ARRIVED` の後に `lastPlate !== null` なら `plates` に追加する。`maxActions` を超えたら `Error`。上限 10,000 アクション(=5,000球)の根拠: 9回+延長3回の24半イニングで1半イニング約20球なら約480球なので、10倍以上の余裕がある。`balance.test.ts` は `plates` から三振率・四球率・打率・本塁打率・併殺数を、`final.lineScore` から半イニングあたり得点を数える。専用テストは設けず、`reducer.test.ts`・`balance.test.ts` で検証する。

### 起動パラメータと再生速度

- `location.search` は `useLaunchParams`(`useState` の遅延初期化)で1回だけ読む。**`import.meta.env.DEV` が真のときのみ読み、本番ビルドでは `search` を無視して既定値(`seed: null`、`innings: null`、`fast: false`)を返す**(#8)。Playwright の webServer は `npm run dev`(vite dev)なので e2e には影響しない。`?seed=` は最初の1試合にのみ適用(#16)。`?innings=` はタイトル画面の既定値になる(開始ボタンは押す必要がある)。
- `timeScale`: hooks が `elapsedGameMs = (performance.now() - startedAt) × timeScale` を計算する。`fast=1` でも `flight.durationMs`・判定窓などモデルの数値は変えない(#11)。`cpuWaitMs` は CPU 手番の `setTimeout` 待機。
- e2e の所要時間見積もり: fast では1球≈飛行170ms+待機20ms+操作遅延で約0.25秒(守備時は「投げる」クリックの分が加わる)。1イニング(両軍)≈30球で約8秒、延長を含めて最大でも約30秒。

### hooks 設計

- `useGame(config, seed)`: `useReducer(reduce, { config, seed }, createInitialState)`、`view = useMemo(() => toGameView(state), [state])`。戻り値は `view` と `throwPitch(command)`・`swing(input)`・`cpuPitch()`・`pitchArrived()`。
- `useLaunchParams()`: `{ seed, innings, fast, speed }` を返す(`speed` は `getPlaybackSpeed(fast)`)。`import.meta.env.DEV` が偽(本番ビルド)のときは `parseLaunchParams("")` と同じ既定値を返し、`location.search` を読まない。
- `useCpuTurn({ cpuPitchPending, turnKey, cpuWaitMs, onCpuPitch })`: `cpuPitchPending` が真の間 `setTimeout(cpuWaitMs)` で `onCpuPitch` を呼ぶ。cleanup で `clearTimeout`(StrictMode の二重 mount でも1回だけ dispatch される)。
- `usePitchFlight({ flight, arriveAfterMs, timeScale, onArrive, ballRef })`: `flight` が現れたら開始時刻を記録(effect 内)、rAF で `ballPositionAt` を呼び ref の SVG 属性(`cx`/`cy`/`r`)を直接更新。経過が `arriveAfterMs` に達したら `onArrive()` を1回呼んで停止。`getElapsedMs()` を返し、スイング時刻の算出に使う。cleanup で `cancelAnimationFrame`。
- `useBattingControls({ enabled, swingReady, cursorRadii, getElapsedMs, onSwing })`: `usePointerInput`・`useKeyboardInput` を合成し、`{ svgRef, cursorRef, swingKind, setSwingKind, currentRadii, swingNow, pointerHandlers }` を返す。スイング種別 `swingKind`(初期 `"meet"`)は `useState` でここに持ち、`SwingControls` のボタンと Z/X キーの両方から変える。`currentRadii` は `swingKind` に応じた `cursorRadii.meet`/`.power`。カーソル位置は ref(`INITIAL_CURSOR` から開始)に保持し、SVG の楕円の `cx`/`cy` を直接更新する。`enabled`(人間打撃時)が偽のときはポインタ・キー入力を無視する。入力の対応は次の表。スイングは `swingReady` のときのみ有効で、`atMs = getElapsedMs()`、`cursor = 現在のカーソル`、`kind = swingKind` を載せて `onSwing(input)`。以降の入力は phase が変わるため reducer のガードで無視される。

  | 入力 | 動作 |
  | --- | --- |
  | マウス/ペンの pointermove | カーソルをその位置へ(`clientToZonePoint`) |
  | マウス/ペンの primary pointerdown | その位置へ移動して即スイング |
  | タッチの pointerdown/move | ドラッグでカーソル移動(`setPointerCapture`)。スイングはしない |
  | 「スイング」ボタンの pointerdown | 現在位置でスイング |
  | 矢印/WASD の keydown/keyup | 押下中は毎フレーム `moveCursor` |
  | Space/Enter の keydown | `swingReady` のときのみスイングし、そのときだけ `preventDefault` する(フォーカス中のボタンの click と二重発火させない)。`swingReady` でないときは何もせず `preventDefault` もしない(「投げる」「もう一度」「タイトルへ」等をキーボードで押せるようにするため)。`event.repeat` は無視 |
  | Z / X の keydown | ミート / 強振 切替 |

- `useLatest(value)`: 最新値を保持する ref(effect 内で更新)。rAF/タイマー/イベントリスナのコールバックから最新の props・state を読むために使い、依存配列の誤りを防ぐ(`exhaustive-deps` が効かないため)。
- `random-seed.ts`: `createRandomSeed()`(`crypto.getRandomValues(new Uint32Array(1))`)。

### UI 設計

- 画面: タイトル(設定: イニング数 select・先攻/後攻 select・難易度 select・開始ボタン)→ 試合(スコアボード、簡易フィールド図、ゾーンSVG、操作系、実況ログ)→ 結果(勝敗・最終スコア・「もう一度(同じ設定)」「タイトルへ」)。全画面共通でページ見出しとホームへ戻るリンクを持つ。
- タイトル画面の既定値: イニング数は `?innings=`(開発ビルドのみ)があればその値、なければ3。先攻/後攻(`setting-side`)は **`away`(先攻)**。難易度は `normal`(ふつう)。
- イニング選択肢(1/3/5/9)・難易度ラベルなどの選択肢は ui 側の定数として持つ(`ui/` は `model/` を import しない)。

#### コンポーネント構成とステップ境界(設計レビュー M1)

props だけで描けるコンポーネントはステップ4、hooks を呼んで結線するコンポーネントはステップ11が担当する。括弧内はステップ番号。

```
BaseballGamePage (11)        h1・back-home・session(未開始/開始中)の管理・useLaunchParams
├── TitleScreen (4)
└── GameScreen (11)          useGame・useCpuTurn・投球の選択状態 {kind, cell}(useState)
    ├── GameLayout (11)      レイアウトと配線のみ
    │   ├── [上段 bb-top-row]
    │   │   ├── Scoreboard (4)      inning-label・LineScore (4)・CountLamps (4)・BaseDiamond (4) を内包
    │   │   └── FieldDiagram (4)    Scoreboard の横(スマホ縦では直下)
    │   ├── MatchupPanel (4)
    │   ├── BattingView (11)        usePitchFlight・useBattingControls。試合中は常時マウント
    │   │   ├── StrikeZoneSvg (4)
    │   │   ├── overlay             人間守備時のみ GameLayout が CourseGrid (4) を渡す
    │   │   └── SwingControls (4)   人間打撃時のみ
    │   ├── PitchingControls (4)    PitchKindButtons (4) と「投げる」ボタン throw-pitch。人間守備時のみ
    │   └── CommentaryLog (4)       last-event とログ
    └── ResultScreen (4)            view.result があるとき GameLayout に重ねる
```

主要な props(型は `types/` のもの。省略可能な値は `T | null`):

| コンポーネント | ステップ | props | 備考 |
| --- | --- | --- | --- |
| `TitleScreen` | 4 | `defaultInnings: Innings`、`onStart(config: GameConfig)` | 先攻/後攻の既定は `away` |
| `Scoreboard` | 4 | `scoreboard: ScoreboardView`、`inningLabel`、`isExtra`、`balls`、`strikes`、`outs`、`bases` | `LineScore`・`CountLamps`・`BaseDiamond` を内部で描く |
| `FieldDiagram` | 4 | `marker: FieldMarkerView \| null`、`geometry: FieldDiagramGeometry` | 下記 |
| `MatchupPanel` | 4 | `batter`(`GameView.batter`)、`pitcher`(`GameView.pitcher`)、`pitchSpeedLabel` | |
| `StrikeZoneSvg` | 4 | `geometry: FieldGeometry`、`flight: PitchFlight \| null`、`showCursor`、`cursorRadii: CursorRadii`、`svgRef`・`ballRef`・`cursorRef`(RefObject を通常の props として受ける)、`onPointerDown`/`onPointerMove`/`onPointerUp`/`onPointerCancel` | 描画のみで状態を持たない。`ball` は `flight` があるときだけ描き、位置は hooks が ref 経由で更新する |
| `SwingControls` | 4 | `ready`(`swingReady`)、`swingKind`、`onSelectSwingKind(kind)`、`onSwing()` | `onSwing` は `swing-button` の **`onPointerDown`** に結ぶ(`onClick` は pointerup 時点になりタイミングが遅れる。ラウンド2 MINOR3)。キーボード操作は Space/Enter(`useBattingControls`)が担う |
| `PitchingControls` | 4 | `ready`(`pitchReady`)、`repertoire`、`selectedKind`、`onSelectKind(kind)`、`onThrow()` | 内部で `PitchKindButtons` と `throw-pitch` を描く。コースのグリッドは含まない |
| `PitchKindButtons` | 4 | `repertoire`、`selectedKind`、`onSelectKind(kind)` | 選択中に `aria-pressed="true"` |
| `CourseGrid` | 4 | `selectedCell: CourseCell`、`onSelectCell(cell)` | 選択中のセル1つに `aria-pressed="true"` |
| `CommentaryLog` | 4 | `lastEvent`、`log` | `aria-live="polite"` |
| `ResultScreen` | 4 | `result: ResultView`、`onRestart()`、`onBackToTitle()` | |
| `BattingView` | 11 | `flight`、`arriveAfterMs`、`geometry`、`swingReady`、`showCursor`(`mode === "human-batting"`)、`cursorRadii`(`GameView.batter.cursorRadii`)、`timeScale`、`onSwing(input)`、`onPitchArrived()`、`overlay: ReactNode` | `usePitchFlight` と `useBattingControls` を呼ぶ。`batting-view` コンテナ内に `StrikeZoneSvg`、ゾーンと同じ正方形に絶対配置した `overlay`、`showCursor` のとき `SwingControls` を描く。人間守備中も CPU 打者の `PITCH_ARRIVED` を送るため常時マウント |
| `GameLayout` | 11 | `view: GameView`、`timeScale`、`selection: PitchCommand`、`onSelectKind`、`onSelectCell`、`onThrow()`、`onSwing(input)`、`onPitchArrived()` | `mode === "human-pitching"` のとき `BattingView` の `overlay` に `CourseGrid` を渡し、`PitchingControls` を描く(それ以外は `overlay = null`) |
| `GameScreen` | 11 | `config`、`seed`、`speed: PlaybackSpeed`、`onRestart()`、`onBackToTitle()` | 投球の選択状態 `{ kind, cell }` を `useState` で持つ(初期=ストレート+中央(2,2))。`onThrow` で選択中の値を `throwPitch` に渡す。`view.result` があれば `ResultScreen` を重ねる |
| `BaseballGamePage` | 11 | なし | `<h1>ブラウザ野球</h1>`、`back-home`、`session`、`baseball.css`・`baseball-field.css` の import |

各コンポーネントは60行(JSX を含む)以内。ステップ11のファイルが超える場合は、ステップ11の担当範囲内で `ui/` に新規ファイルを追加して分割してよい(ステップ4のファイルは変更しない。追加したファイル名は完了報告に記す)。

#### レイアウト

- デスクトップ: 上段に `Scoreboard`(内部に `LineScore`・`CountLamps`・`BaseDiamond` を含む。ステップ4)と `FieldDiagram` を横に並べる(並べるのは `GameLayout`。ステップ11)。中央にゾーン(`BattingView`)、その下か右に操作系(`SwingControls` または `PitchingControls`)と `MatchupPanel`・`CommentaryLog`。
- スマホ縦(`max-width: 640px`): 縦積みにし、`FieldDiagram` は `Scoreboard` の直下に小さく置く。スイング・コース・投げるボタンは親指で押せる大きさ(高さ44px以上)。
- ゾーン: SVG は正方形(`aspect-ratio: 1`)で `viewBox` は `±viewHalfExtent`(2.0)。`touch-action: none`・`user-select: none` を付ける。`StrikeZoneSvg` はストライクゾーン枠、5×5 グリッド線、ボール(ref)、人間打撃時のみスイングカーソル(楕円。`cx`/`cy` は ref で更新し、`rx`/`ry` は props の `cursorRadii`)を描く。`CourseGrid` は `overlay` として同じ正方形に重ねる(CSS grid 5×5、`inset: 8.333%` = (2 − 5/3)/4)。**`BattingView` の重ね用ラッパー(ステップ11)は SVG の正方形と同寸(`inset: 0`)とし、`inset: 8.333%` は `CourseGrid` の root(ステップ4、`baseball.css`)だけが付ける**(二重適用の防止。ラウンド2 MINOR2)。
- `FieldDiagram`: SVG(`viewBox` は `geometry` から。y 反転)に、ダイヤモンド(塁・本塁)、ファウルライン、外野フェンス弧を描き、`marker` があれば本塁からの線と点(ホームランは点をフェンスの外側に描く)を描く。点の色や形は結果ごとに変えてよい(`data-result` で識別)。`marker` が `null` のときは点を描かない。`role="img"` と `aria-label` を付ける。

#### `data-testid` と所属の対応表(e2e・手動確認の契約)

全 testid を1つの表に並べる。1つの testid は1つのコンポーネントにだけ属する。

| testid | 属性 | 要素 | コンポーネント | ステップ |
| --- | --- | --- | --- | --- |
| `open-baseball` | | `#/baseball` へのリンク | `App.tsx` | 12 |
| `back-home` | | `#/` へのリンク | `BaseballGamePage` | 11 |
| `baseball-title` | | タイトル画面のコンテナ | `TitleScreen` | 4 |
| `setting-innings` | | イニング数 select | `TitleScreen` | 4 |
| `setting-side` | | 先攻/後攻 select(既定 `away`) | `TitleScreen` | 4 |
| `setting-difficulty` | | 難易度 select | `TitleScreen` | 4 |
| `start-game` | | 開始ボタン | `TitleScreen` | 4 |
| `scoreboard` | | スコアボードのコンテナ | `Scoreboard` | 4 |
| `inning-label` | | 「3回表」等 | `Scoreboard` | 4 |
| `line-score` | | 回別得点の表 | `LineScore` | 4 |
| `score-away` / `score-home` | | 各チームの合計得点 | `LineScore` | 4 |
| `count-balls` / `count-strikes` / `count-outs` | | B・S・O | `CountLamps` | 4 |
| `bases` | `data-first` / `data-second` / `data-third` | 走者 | `BaseDiamond` | 4 |
| `field-diagram` | | フィールド図(常時表示) | `FieldDiagram` | 4 |
| `batted-ball-marker` | `data-result` / `data-seq` / `data-over-fence` / `data-distance`(小数1桁) / `data-lateral` | 打球の点(`marker` があるときのみ) | `FieldDiagram` | 4 |
| `batter-name` | | 打者名と打順 | `MatchupPanel` | 4 |
| `pitcher-name` | | 投手名 | `MatchupPanel` | 4 |
| `pitch-count` | | 投球数 | `MatchupPanel` | 4 |
| `pitcher-stamina` | | スタミナ% | `MatchupPanel` | 4 |
| `pitch-speed` | | `pitchSpeedLabel` | `MatchupPanel` | 4 |
| `batting-view` | | ゾーン周りのコンテナ | `BattingView` | 11 |
| `zone-svg` | | ゾーンの SVG | `StrikeZoneSvg` | 4 |
| `ball` | `data-seq` / `data-landing-x` / `data-landing-y` / `data-duration-ms` | ボール(飛行中のみ) | `StrikeZoneSvg` | 4 |
| `swing-cursor` | | スイングカーソル(人間打撃時のみ) | `StrikeZoneSvg` | 4 |
| `swing-button` | | 「スイング」ボタン | `SwingControls` | 4 |
| `swing-kind-meet` / `swing-kind-power` | `aria-pressed` | ミート/強振の切替 | `SwingControls` | 4 |
| `pitch-controls` | `data-ready="true"/"false"`(= `pitchReady`) | 投球操作のコンテナ | `PitchingControls` | 4 |
| `throw-pitch` | | 「投げる」ボタン(`ready` が偽なら `disabled`) | `PitchingControls` | 4 |
| `pitch-kind-<kind>` | `aria-pressed` | 球種ボタン | `PitchKindButtons` | 4 |
| `course-cell-<col>-<row>` | `aria-pressed` | コースのセル | `CourseGrid` | 4 |
| `last-event` | | 最新イベントのバナー | `CommentaryLog` | 4 |
| `commentary-log` | | 実況ログ | `CommentaryLog` | 4 |
| `result-screen` | | 結果画面のコンテナ | `ResultScreen` | 4 |
| `result-text` | | 勝敗の文言 | `ResultScreen` | 4 |
| `final-score-away` / `final-score-home` | | 最終スコア | `ResultScreen` | 4 |
| `restart-game` | | 「もう一度」 | `ResultScreen` | 4 |
| `back-to-title` | | 「タイトルへ」 | `ResultScreen` | 4 |

#### 守備側の選択(壁打ち Q2)

- 選択状態 `{ kind, cell }` は `GameScreen` が持ち、`PitchingControls`・`PitchKindButtons`・`CourseGrid` は制御コンポーネントとして選択値とコールバックを受ける。
- 球種は持ち球のボタンで選ぶ(初期=`straight`)。コースのセルをクリックすると**選択状態になるだけで投球はしない**(`aria-pressed="true"`、同時に選択されるのは1セル)。「投げる」ボタン(`throw-pitch`、`PitchingControls` 内)を押すと、`GameScreen` が選択中の `{ kind, cell }` で `throwPitch(command)` を呼ぶ。選択は投球後も保持され、初期選択は中央 (2,2)。
- `pitchReady` が偽の間(飛行中など)は `throw-pitch` を `disabled` にする(球種・セルの選択操作自体は可能のままにしてよい)。`pitch-controls` の `data-ready` は `pitchReady` と一致させる。
- `BaseballGamePage` は `<h1>ブラウザ野球</h1>` を持つ(従来画面の見出し「loop-basic sample app」を重複して出さない)。

### 静的解析・規約への対応

[[sample-app-lint-random-and-index-access]]・[[eslint-strictness-ratchet-v2]] に従う。実装者向けの要点:

- 禁止: `Math.random()`、変数添字(`arr[i]`/`obj[key]`/`tally[side]`)、`// TODO`/`// FIXME`、ネストした三項演算子、`sonarjs/no-small-switch` に当たる `switch`(case が1つ以下、または case 2つで片方が `default`。`node_modules/eslint-plugin-sonarjs/cjs/S1301/rule.js` の実装で確認済み。明示 case 2つは通過する)、引数の再代入、インラインの `eslint-disable`。
- 分岐の書き方の統一: **2値(`SwingKind`・`Side`・`Half` 等)の分岐は非ネストの三項演算子**で書く(明示 case 2つの `switch` は lint 上は通るが、書き方を揃えるため使わない)。3値以上は `switch`(各 case を明示)か `Map`。
- 使う: `.at(i)`、`Map#get`、`for...of`、`.find()`、`Array.from({ length: n }, (_, i) => ...)`、リテラル添字(`arr[0]`)、`switch`(3値以上)、早期 return。
- サイズ: 関数は60行(JSX含む)・複雑度20・cognitive 15 以内。コンポーネントは小さく分割し、reducer・resolve は小関数へ委譲。大きなテーブルは関数の外のデータ定数にする。
- 型: `any`・非 null アサーション(`!`)禁止。`noUncheckedIndexedAccess` のため `.at()` の戻りは `T | undefined` として扱う(不変条件違反は `Error` を投げるヘルパーに集約)。`exactOptionalPropertyTypes` のため省略可能は `T | null`。
- `lib` は ES2022(`Array.prototype.toSorted`/`with` など ES2023 は使わない)。
- テストファイルは `*.test.ts` のみ(`max-lines-per-function` 等の緩和対象)。フォーマットは prettier(`printWidth: 160`)。`npx eslint --fix` で整形する。
- `sonarjs/no-identical-functions`(同一本体の関数の重複)、`sonarjs/no-nested-functions`(深さ4)に注意する。
- model に `Math.hypot`/`sin`/`cos`/`log`/`exp` を使わない(再現性: #10)。落下点の計算も同様(`sqrt` と四則演算、`floor` のみ)。

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

- [x] **ステップ1: vitest 導入・ルート test スクリプト変更・lockfile 同期・eslint 試験実測**(直列・前提)
  - 依存: なし。担当ファイル: `sample-app/package.json`、`sample-app/frontend/package.json`、`sample-app/frontend/tsconfig.json`、`sample-app/frontend/vitest.config.ts`(新規)、`sample-app/package-lock.json`、`sample-app/frontend/src/routes/resolve-route.ts`・`resolve-route.test.ts`(新規)
  - やること:
    1. `cd sample-app && npm install --workspace frontend --save-dev vitest@^3.0.4`(backend と同範囲)。`frontend/package.json` に `scripts.test = "vitest run"` を追加。ルート `package.json` の `scripts.test` を `npm run test --workspaces --if-present` に変更。
    2. `frontend/vitest.config.ts` を新規作成(`vitest/config` の `defineConfig`、`test.include = ["src/**/*.test.ts"]`、`test.environment = "node"`)。`frontend/tsconfig.json` の `include` に `"vitest.config.ts"` を追加。`tsc` が `vitest/config` の型を解決できることを確認する(解決できない場合は原因を報告)。
    3. 動作確認を兼ねて `routes/resolve-route.ts`(純粋関数 `resolveRoute(hash: string): "home" | "baseball"`。`#/baseball` と `#/baseball/` のみ `"baseball"`、他は `"home"`)と `resolve-route.test.ts` を作る。`vitest run` が `e2e/home.spec.ts` を拾わないこと(対象一覧で確認)。テストが1件も無い状態で `vitest run` が失敗する(No test files found)のを避ける目的も兼ねる。
    4. **eslint 試験実測**: `cd sample-app && npx eslint --stdin --stdin-filename frontend/src/features/baseball/model/probe.ts`(`.tsx` 用は `probe.tsx`、テスト用は `probe.test.ts`)に下記スニペットを流し、結果(error/通過とルール名)を表にして完了報告に含める。ファイルは作らない(stdin のみ)。
       - 通過を期待: mulberry32(`Math.imul`・`>>>`・ビット演算)、`arr.at(i)`、`Map#get`、`for...of`、`arr[0]`、`Array.from({ length: 5 }, (_, i) => i - 2)`、`crypto.getRandomValues(new Uint32Array(1))`、`switch`(明示 case 3つ)、`switch`(明示 case 2つ、default なし。`no-small-switch` の実装上は通過する見込み。規約上は使わないが実測で確認する)、非ネストの三項演算子、タプル戻り値 `readonly [number, number]`、`new Map<string, X>([...])`、`Object.entries`、`import.meta.env.DEV`(`.tsx`/`.ts` の hooks 相当)
       - error を期待: `Math.random()`、`arr[i]`、`obj[key]`、`tally[side]`、`// TODO`、ネスト三項、case 1つだけの `switch`、case 1つ+`default` の `switch`(`sonarjs/no-small-switch`)
       - 実測が必要: 61行以上の JSX を返すコンポーネントで `max-lines-per-function` が JSX 行を数えるか、`*.test.ts` で長い `describe` が通るか
    5. 想定と異なる結果が出た場合は、先のステップに進まず orchestrator に報告する(本設計の「静的解析・規約への対応」の見直しが必要になる)。
  - 完了条件: ルートで `npm run test`(backend+frontend)・`npm run typecheck`・`npm run lint`・`npm run build` が成功。`npm ci --dry-run`(または一時ディレクトリでの `npm ci`)で lockfile 同期を確認。`package-lock.json` の差分が frontend エントリ(と必要最小限の依存解決)に限られる。試験実測の表を報告(orchestrator が本書末尾「ステップ1 試し打ち結果」に転記する)。

- [x] **ステップ2: `types/` の作成**(直列)
  - 依存: ステップ1。担当ファイル: `features/baseball/types/{common,team,pitch,batting,game,actions,view}.ts`(新規7ファイル)
  - やること: 本書「型設計」のとおりに型を定義する(`BattedLanding`、`InPlayRecord`、`GameState.lastInPlay`、`FieldMarkerView`、`FieldDiagramGeometry`、`GameView.fieldMarker`/`fieldDiagram` を含む)。実行時コードは書かない。`GameView` 周辺は本書のフィールド一覧に従う(不足は報告)。
  - 完了条件: `npm run typecheck --workspace frontend` が成功、lint 0件。`types/` が他セグメントを import していない。

- [x] **ステップ3: `model/rng/` と `model/pitch/`**(並列: 4, 7, 8)
  - 依存: ステップ2。担当ファイル: `model/rng/{rng,sampling}.ts`+各 `.test.ts`、`model/pitch/{params,zone,kinds,delivery,flight}.ts`+`params` を除く各 `.test.ts`
  - やること: 本書「乱数」「投球」のとおり実装し、テスト戦略の該当テストを同居させる。
  - 完了条件: 担当の `vitest run` が成功(テスト戦略の合格基準を満たす)、`model/` に `from "react"`・`window`・`Math.random` が無い。

- [x] **ステップ4: `ui/` の表示コンポーネントと基本CSS**(並列: 3, 7, 8)
  - 依存: ステップ2(`types/` のみ。hooks・model に依存しない)。担当ファイル: `ui/{TitleScreen,Scoreboard,LineScore,CountLamps,BaseDiamond,FieldDiagram,MatchupPanel,StrikeZoneSvg,SwingControls,PitchingControls,PitchKindButtons,CourseGrid,CommentaryLog,ResultScreen}.tsx`(14ファイル)、`ui/baseball.css`
  - やること: props だけで描画するコンポーネントを作る(`useState` などの状態も持たない)。props と `data-testid` は本書「UI 設計」の「主要な props」表と「`data-testid` と所属の対応表」に従う(表でステップ4に割り当てた testid を全て、このステップのファイルで描く)。
    - `TitleScreen`: イニング・先攻後攻(既定 `away`)・難易度の select と開始ボタン。**非制御フォーム**(`defaultValue` を付けた select、`onSubmit` で `FormData` を読み、ui 定数の `.find()` で `Innings`/`Side`/`Difficulty` に変換して `onStart(config)`)で実装し、`useState` を使わない(設計レビュー ラウンド2 MINOR1)。
    - `Scoreboard`: `inning-label` を持ち、`LineScore`・`CountLamps`・`BaseDiamond` を内部で描く。`FieldDiagram` は含めない(横に並べるのはステップ11の `GameLayout`)。
    - `FieldDiagram`: ダイヤモンド+ファウルライン+フェンス弧+打球の点と線(`field-diagram`・`batted-ball-marker` と data 属性)。
    - `MatchupPanel`: `batter-name`・`pitcher-name`・`pitch-count`・`pitcher-stamina`・`pitch-speed`。
    - `StrikeZoneSvg`: ゾーン枠・5×5 グリッド線・ボール(`flight` があるときのみ。data 属性付き)・スイングカーソル(`showCursor` のときのみ)。ref とポインタハンドラは props で受け取って要素に付けるだけ。
    - `SwingControls`: `swing-button`・`swing-kind-meet`/`swing-kind-power`(`aria-pressed`)。
    - `PitchingControls`・`PitchKindButtons`・`CourseGrid`: **制御コンポーネント**。選択値(`selectedKind`/`selectedCell`)と変更コールバック(`onSelectKind`/`onSelectCell`)、`onThrow()` を props で受ける。`PitchingControls` は `PitchKindButtons` と `throw-pitch`(`ready` が偽なら `disabled`)を描き、コンテナに `pitch-controls`・`data-ready` を付ける。`CourseGrid` は `PitchingControls` に含めない(ステップ11がゾーンに重ねる)。
    - `CommentaryLog`(`last-event`・`commentary-log`、`aria-live`)、`ResultScreen`。
    - クラス名は `bb-` 接頭辞。レスポンシブ(`max-width: 640px`)対応。`ui/` から `../model`・`../hooks` を import しない。
  - 完了条件: lint 0件、typecheck 通過(担当分)。各コンポーネントが 60行以内。担当14コンポーネントに `useState`/`useEffect` 等の hooks が無い。

- [x] **ステップ5: `model/batting/`**(並列: 6)
  - 依存: ステップ3。担当ファイル: `model/batting/{params,cursor,contact,batted-ball,batted-landing,result-table,resolve-pitch}.ts`+`params` を除く各 `.test.ts`
  - やること: 本書「打撃判定」「落下点」のとおり実装する。値(落下点の距離帯・フェンス半径・左右範囲を含む)は `params.ts` に外出し。`batted-landing.ts` は乱数・`RngState` を一切受け取らない。
  - 完了条件: 担当の `vitest run` が成功。`resolve-pitch` が人間・CPU 共通の唯一の1球判定である。

- [x] **ステップ6: `model/cpu/`**(並列: 5)
  - 依存: ステップ3。担当ファイル: `model/cpu/{difficulty,pitcher-weights,cpu-pitcher,cpu-batter}.ts`+各 `.test.ts`
  - やること: 本書「CPU」のとおり実装する。`cpu/` は `batting/`・`game/` を import しない。
  - 完了条件: 担当の `vitest run` が成功。

- [x] **ステップ7: `model/data/`**(並列: 3, 4, 8)
  - 依存: ステップ2。担当ファイル: `model/data/teams.ts`・`teams.test.ts`
  - やること: 架空2チーム(「ルミナス」「ノーブルズ」)のプリセットと `getTeam`。選手名は実在名と連想しないこと。
  - 完了条件: 担当の `vitest run` が成功。

- [x] **ステップ8: `model/game/` のルール部分と、types のみに依存するモジュール**(並列: 3, 4, 7)
  - 依存: ステップ2。担当ファイル: `model/game/{side,count,runners,outcome,inning,commentary,launch-params}.ts`+各 `.test.ts`、`model/game/test-fixtures.ts`
  - やること: 本書「試合進行」のとおり、乱数を使わない純粋関数として実装する。
    - `runners` の表を表駆動テストで網羅する(`doublePlay` の事前条件違反は網羅対象から外し、`Error` を投げることを確認する)。
    - `outcome.ts` の契約: インプレーのとき `lastInPlay` を設定する。**打席が続く球では `lastPlate = null`、打席が終わった球ではその結果**を設定する(`simulate.ts` の前提。テストに含める)。
    - `side.ts` に汎用の `bySide`/`updateSide` を用意する。
    - テストに完全な `GameState`(`teams` を含む)が要るが、`state.ts`(ステップ9)・`data/teams.ts`(並列のステップ7)には依存できない。そのため **`test-fixtures.ts` に最小の `Team`×2 と `GameState` を作る関数を直書き**し、ステップ8のテストはこれを使う。本番コードからは import しない。ステップ9のテストからは読み取り専用で import してよい。
    - `commentary.ts`・`launch-params.ts` は `types/` のみに依存するため、ここで実装する。
  - 完了条件: 担当の `vitest run` が成功。

- [x] **ステップ9: `model/game/` の統合部分(state/reducer/view/simulate)とバランス検証**(直列)
  - 依存: ステップ5, 6, 7, 8。担当ファイル: `model/game/{state,reducer,view,simulate}.ts`+`simulate` を除く各 `.test.ts`、`model/game/balance.test.ts`
  - **例外(値のみ調整可)**: `balance.test.ts` を通すためにのみ、`batting/params.ts`(落下点の定数を除く)・`batting/result-table.ts`・`cpu/difficulty.ts`・`cpu/pitcher-weights.ts`・`pitch/params.ts`・`data/teams.ts` の**数値だけ**を調整してよい(構造・関数は変更しない)。このステップは単独で動くため所有の競合は無い。調整内容(変更前後)は完了報告に記す。
  - やること: 本書「試合進行」のとおり実装。`createInitialState` は `lastInPlay = null`。`toGameView` は `fieldMarker`/`fieldDiagram`(`batted-landing`・`LANDING_PARAMS`)と `geometry`(`PITCH_PARAMS`)、`pitchSpeedLabel` を組み立てる(state を変更しない)。`reduce` は action ごとにハンドラへ委譲し、無効な組み合わせは同一参照を返す。CPU の判断には `getDifficulty(config.difficulty)` で引いた `DifficultyParams` を渡し、`deliverPitch` には加算後の `pitchSeq` を渡す。`simulate.ts`(`SimulationResult` を返す)で CPU 同士の試合を回し、`balance.test.ts` のしきい値(テスト戦略)を満たすよう数値を調整する。しきい値を緩める場合は理由を報告する。
  - 完了条件: `cd sample-app/frontend && npx vitest run` が全て成功(`balance.test.ts` を含む)。

- [x] **ステップ10: `hooks/`**(直列)
  - 依存: ステップ9。担当ファイル: `hooks/{useGame,useCpuTurn,useAnimationFrame,usePitchFlight,usePointerInput,useKeyboardInput,useBattingControls,useLaunchParams,useLatest}.ts`、`hooks/random-seed.ts`
  - やること: 本書「hooks 設計」のとおり実装する。全ての effect に cleanup(rAF の cancel、`clearTimeout`、リスナ解除)を付け、「二重実行を防ぐ ref ガード」で StrictMode を回避しない。判定ロジック・JSX を書かない。コールバックは `useLatest` 経由で最新値を参照する。`useBattingControls` はスイング種別の state(`swingKind`)と `currentRadii` も返す。Space/Enter は `swingReady` のときだけスイングして `preventDefault` する(それ以外は何もしない)。`useLaunchParams` は `import.meta.env.DEV` が真のときのみ `location.search` を読み、偽(本番ビルド)では `parseLaunchParams("")` 相当の既定値を返す。
  - 完了条件: lint・typecheck 通過。`hooks/` から `Math.random`・`Date` が使われていない(時刻は `performance.now()` のみ)。`npm run build` 後の本番ビルドで起動パラメータが無視されることを、ステップ12完了後の手動確認で検証できる実装になっている。

- [x] **ステップ11: `ui/` の結線コンポーネントと公開口**(直列)
  - 依存: ステップ4, 10。担当ファイル: `ui/{BaseballGamePage,GameScreen,GameLayout,BattingView}.tsx`、`ui/baseball-field.css`、`features/baseball/index.ts`(60行を超える場合に分割用の新規ファイルを `ui/` に追加するのは可。ステップ4のファイルは変更しない)
  - やること: 本書「UI 設計」の「コンポーネント構成とステップ境界」「主要な props」のとおり結線する。
    - `BaseballGamePage`: session 管理、`useLaunchParams`、`baseball.css`・`baseball-field.css` の import、`<h1>ブラウザ野球</h1>`、`back-home`。
    - `GameScreen`: `useGame`・`useCpuTurn`、投球の選択状態 `{ kind, cell }` の `useState`(初期=ストレート+中央(2,2))、`onThrow` で `throwPitch(選択中の値)`、`view.result` があれば `ResultScreen` を重ねる。
    - `GameLayout`: 上段に `Scoreboard`(`BaseDiamond` は内包済み)と `FieldDiagram`(`view.fieldMarker`/`view.fieldDiagram`)を横に並べ、`MatchupPanel`・`BattingView`・`CommentaryLog` を配置する。人間守備時は `BattingView` の `overlay` に `CourseGrid` を渡し、`PitchingControls`(`ready = view.pitchReady`、`repertoire = view.pitcher.repertoire`、選択値とコールバック)を描く。
    - `BattingView`: `usePitchFlight`・`useBattingControls` を呼び、`StrikeZoneSvg`・`overlay`・`SwingControls`(人間打撃時)を描く。`batting-view` を持つ。試合中は常時マウントする。
    - `index.ts` は `BaseballGamePage` のみ export。
  - 完了条件: lint・typecheck 通過。`ui/` から `../model` を import していない。各コンポーネントが60行以内。対応表でステップ11に割り当てた testid(`back-home`・`batting-view`)を描いている。

- [x] **ステップ12: ルーティングの結線**(直列)
  - 依存: ステップ11。担当ファイル: `routes/AppRoutes.tsx`、`routes/use-hash-route.ts`(新規)、`src/main.tsx`、`src/App.tsx`
  - やること: `useHashRoute`(`useSyncExternalStore` で `hashchange` を購読し `resolveRoute` の結果を返す)、`AppRoutes`(`"baseball"` なら `BaseballGamePage`、それ以外は `App`)。`main.tsx` は `<App />` を `<AppRoutes />` に差し替えるだけ(StrictMode 維持)。`App.tsx` には `<a href="#/baseball" data-testid="open-baseball">` を1つ追加するのみ(見出し・既存 testid・既存ロジックは不変)。
  - 完了条件: lint・typecheck・`npm run build` 通過。`npm run dev:frontend` で `/` は従来画面、`/#/baseball` はタイトル画面が表示される。既存 `home.spec.ts` が無改変で通る。

- [ ] **ステップ13: E2E `e2e/baseball.spec.ts`**(並列: 14)
  - 依存: ステップ12。担当ファイル: `frontend/e2e/baseball.spec.ts`(新規)
  - やること: テスト戦略の E2E 仕様のとおり2テストを作る。固定 sleep を避け、「結果画面」か「投球可能(`pitch-controls[data-ready="true"]`)」のどちらかを `await expect(resultScreen.or(readyControls)).toBeVisible({ timeout: 30_000 })` で待つ(`Promise.race`+`waitFor` は使わない)。投球は `throw-pitch` のクリックで行う(初期選択が中央のため)。`test.setTimeout(120_000)`。起動パラメータは開発ビルドのみ有効なので、`playwright.config.ts` の webServer(`npm run dev`)を前提にする旨をコメントで残す。
  - 完了条件: `cd sample-app && npm run test:e2e --workspace frontend` で `home.spec.ts`(無改変)と新規2テストが成功。3回連続実行して安定している。

- [ ] **ステップ14: ドキュメント更新**(最後。並列: 13)
  - 依存: ステップ12。担当ファイル: `sample-app/README.md`、`docs/process/sample-app-dev.md`、(任意)`.github/workflows/ci.yml`
  - やること:
    - `sample-app/README.md`: 構成図に `frontend/src/routes/`・`features/baseball/`・`vitest.config.ts`・`e2e/baseball.spec.ts` を追加。「実行方法」の `npm run test` を「backend/frontend の純粋関数ユニットテスト(vitest)」に更新。ゲームの起動方法(`npm run dev:frontend` → `/#/baseball`)と、テスト用 `?seed=&innings=&fast=1` は**開発サーバー(`npm run dev:frontend`)でのみ有効で本番ビルドでは無視される**旨、ロジックが `model/` の純粋関数・乱数がシード付きPRNGである旨を「この構成が示している方針」に追記。「パワプロ」等の名称は書かない。
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

- `rng.test.ts`: 同一シードで同一列(先頭1000個)。値は [0,1)。テスト内の参照実装(mulberry32 を直書き)と先頭N個が一致。`nextInt(state, 7)` を10,000回呼ぶと 0〜6 の全値が出て、各値の頻度が 1/7±2pt、7 以上や負は出ない。`nextInt(state, 1)` は常に0。`nextFloat` の平均≈0.5±0.02(10,000回)。シードの正規化(負数・2^32超でも `>>> 0` と一致)。
- `sampling.test.ts`: `nextGaussian` の平均|m|<0.03・標準偏差0.95〜1.05(20,000回)、|値|≤6。`pickWeighted` は重み0を選ばず、頻度が重み比に±2ptで一致、空配列・合計0は `Error`、同一状態で同一結果。
- `zone.test.ts`: `cellToPoint` — (2,2)→(0,0)、(1,1)→(-2/3,+2/3)、(0,0)→(-4/3,+4/3)。`isStrikeCell` は25セル中ちょうど9が真。`isStrike` の境界: (1,1) は真、(1.0001,0) は偽。
- `kinds.test.ts`: 5球種すべてに spec。`straight` の速度オフセット0・`cursorScale` (1,1)。全 `cursorScale` が (0,1]。label 非空。
- `delivery.test.ts`: 同一入力で同一出力。コントロール高(90)は低(20)より着弾の標準偏差が小さい(2,000回)。疲労時(球数が上限近い)は標準偏差が大きく球速が低下。`speedKmh`・`durationMs = round(k/speed)`(遅い球ほど長い)。`landing` が ±`landingLimit` 内。疲労ゼロのとき疲労項が効かない。
- `flight.test.ts`: `elapsed=0` で開始点・小さい scale、`elapsed≥duration` で `landing` に厳密一致・scale 1。範囲外の経過時間はクランプ。`straight` は直線(中間点が補間点)。曲がる球種は中間で直線から外れ、終点では一致。
- `cursor.test.ts`: `clampCursor`/`moveCursor` の境界クランプ。`clientToZonePoint` — 矩形中心→(0,0)、左上隅→(-viewHalfExtent,+viewHalfExtent)(y 反転)、矩形外はクランプ。`cursorRadii` — meet が高いほど大、強振は `powerScale` 倍、`rx > ry`。
- `contact.test.ts`: カーソル=着弾点・Δt=0 で `contact`。`d>1` は miss。`|Δt|=window` は contact、`window` 超は miss(境界)。強振は窓が狭い。q は d・|Δt| に対して単調非増加。球種の `cursorScale` が小さいほど接触しにくい。`edgeFactor` により端・ボールゾーンは q が下がる。
- `batted-ball.test.ts`: 高さの境界値で ground/liner/fly が切り替わる。同じ v で弾道4の方が弾道1より fly になりやすい。Δt の符号と `centerRatio` で pull/center/opposite。`|Δt|/window ≥ foulRatio` で foul(境界の前後)。強さ段階の境界(score が `mediumFrom`/`strongFrom` の直前・ちょうど・直後)。強振>ミート、pull>opposite。
- `batted-landing.test.ts`(フィールド図の落下点。壁打ち Q1):
  - 決定論・乱数非依存: 同一 `(ball, result, seq)` で同一出力(厳密一致)。関数が `RngState` を引数に取らない(型で保証)。`seq` を 1〜200 で変えると同一入力でも点が複数種類に分かれる(全点が同一でない)が、各 `seq` を再計算すると同じ点に戻る。
  - 方向ごとの左右範囲: `lateral = x/y` が `pull` ∈ [-0.85,-0.25]、`center` ∈ [-0.25,+0.25]、`opposite` ∈ [+0.25,+0.85](全 `result`×`type`×`strength`、`seq` 1〜200 で)。`|lateral| < 1`(フェア内)。pull は x<0、opposite は x>0。
  - 結果ごとの距離帯(`seq` 1〜200 で全点が帯内): groundout 14〜32、doublePlay 16〜30、flyout は weak 35〜60/medium 60〜90/strong 90〜103、lineout は weak 25〜45/medium 40〜70/strong 55〜90、single は ground 28〜55/liner 45〜80/fly 38〜65、double 78〜98、triple 98〜104、error 18〜50、homerun 106〜125。
  - フェンス: homerun は常に `overFence = true` かつ `distance ≥ fenceRadius`(105)、それ以外の全 `InPlayResult` は常に `overFence = false` かつ `distance < fenceRadius`。
  - 凡打の帯: groundout/doublePlay は内野の範囲(`distance ≤ 32` < 2塁までの距離 38.8)。flyout/lineout は外野寄りの帯(強さが上がるほど平均距離が大きい)。
  - 座標の整合: `y > 0`、`distance² ≈ x² + y²`(`toBeCloseTo`)、`x/y ≈ lateral`、`y ≤ 125`、`|x| ≤ 85`(`viewHalfWidth` 内)。
  - 網羅: 全 `InPlayResult`(9)× `BattedType`(3)× `Strength`(3)× `Direction`(3)の組み合わせで例外なく値が返る(到達不能な組み合わせも含む)。`LANDING_BANDS` が全組み合わせに一致する。
- `result-table.test.ts`: 9行(タイプ×強さ)がすべて存在。各重みは非負で合計が正。タイプと矛盾する結果の重みは0、`doublePlay` は ground 行のみ。`doublePlayPossible=false` で `doublePlay` が5,000回で一度も出ず、重みは `groundout` に畳み込まれる。10,000回の頻度が重みと±2pt。同一 rng で同一結果。タイプごとに強さが上がるほど安打系(single〜homerun)の合計重みが単調増加。
- `resolve-pitch.test.ts`: 見送りはゾーン内→`called-strike`・外→`ball`で、返る rng が入力と同一(乱数を消費しない)。遠いカーソル→`swinging-strike`。窓の端→`foul`。完璧なスイング(カーソル=着弾点・Δt=0・強振・power 80)を連続シード1000個で打つと全てインプレーで、安打系が1件以上出る(「打撃でヒットが出る」の自動化)。同一入力・同一 rng で同一出力。
- `difficulty.test.ts`/`pitcher-weights.test.ts`: 難易度の単調性(easy→hard で `cursorSigma`・`timingSigmaMs`・`aimSigmaScale` 減、`zoneSwingRate`・`twoStrikeOutsideRate` 増、`chaseSwingRate` 減)、σ・ノイズが0でない。12カウントすべてが Map にあり、`zoneRate`/`fastballRate` ∈ (0,1]、3-0 の `fastballRate` ≥ 0.8。
- `cpu-pitcher.test.ts`: 持ち球に無い球種を選ばない。3-0 でゾーン内セル選択が85%以上(10,000回)。0-2/1-2 のボール球率が hard > easy。直前と同じ球種の連投が `repeatKindPenalty` で減る。同一 rng で同一出力。
- `cpu-batter.test.ts`: ゾーン内/外スイング率が難易度の値と±0.02(10,000回)。2ストライク補正・3ボール補正が効く。カーソルノイズの標準偏差が `cursorSigma`±10%、タイミングが `timingSigmaMs`±10%。`atMs - durationMs` の平均(10,000回)が、ストレートでは |平均| ≤ 3ms、遅い球(カーブ)では期待値 `-speedDiffBiasRatio × (durationMs − fastballDurationMs)`(仮値で約 -52ms)との差が ±3ms 以内(負=早振り)。`difficulty` 引数には `DifficultyParams` を渡す。`take` に入力が付かない。同一 rng で同一出力。
- `teams.test.ts`: 2チーム、各9人、id 重複なし、能力が範囲内(meet/power 1〜100、trajectory 1〜4)、`repertoire` に `straight`、投手球速 120〜160、2チームの meet・power の平均差が5以内、`getTeam` の未知 id は `Error`。
- `side.test.ts`: `opponent`・`offenseSide`/`defenseSide` の対応。`bySide` が away/home の値を返し、`updateSide` が指定側だけを変えた新しいオブジェクトを返す(元は不変)。`teams`・`lineScore`(配列)にも使える。
- `count.test.ts`: ボール4で `walk`、ストライク3で `strikeout`、ファウルは 0/1 ストライクで+1・2ストライクで不変、不変条件(balls≤3, strikes≤2)。
- `runners.test.ts`: 上の進塁表の全結果 × 8通りの塁状況 × outs 0/1/2 を表駆動で。保存則 `走者数(前)+1 = runs + 走者数(後) + outsAdded`(3アウト未満の場合)。`doublePlay` は事前条件(1塁走者あり・2アウト未満)を満たす組み合わせのみ網羅し、満たさない組み合わせ(1塁空き、または2アウト)は `Error` を投げることを確認する(アウト数は最大でも3)。単打は1塁走者→2塁、2塁・3塁走者→生還。犠飛は3塁走者あり・強さ中以上・2アウト未満のみ。押し出し、エラー、3アウト目で得点なし。
- `outcome.test.ts`: ボール/ストライク/ファウルでカウントのみ変化。打席終了でカウント0-0・`lineupIndex`+1(9で0に戻る)・得点が現在の半イニングに加算。`single`〜`homerun` で `hits` 増、`error` で守備側 `errors` 増(`hits` は不変)。`lastResult` は毎球設定、`lastPlate` は打席が続く球(ボール・ストライク・2ストライク後のファウル等)で `null`、打席が終わった球で `walk`/`strikeout`/`InPlayResult`。インプレーで `lastInPlay = { seq: pitchSeq, result, ball }` が設定され、ボール/ストライク/ファウル/四球/三振では `lastInPlay` が直前の値のまま保持される。`lastInPlay.seq` は `state.pitchSeq`。テストの入力 `GameState` は `test-fixtures.ts` で作る(ステップ8のテスト全般で同様)。
- `inning.test.ts`(イニング数 1/3/5/9 で表駆動): 表の終了→同イニングの裏、裏の終了→次イニング表。最終回表終了で後攻リード→裏なしで後攻勝ち(「x」)。最終回裏でサヨナラ(リードを奪った瞬間に終了)。最終回裏終了で先攻リード→先攻勝ち。同点→延長1回目(表、走者1・2塁、outs 0)。延長でのサヨナラ。`innings+3` 終了で同点→引き分け。攻守交代で `lastInPlay` が保持される。
- `state.test.ts`: 初期値(1回表・0アウト・0-0・走者なし・`lineScore`・`rng = createRng(seed)`・`await-pitch`・`lastInPlay = null`)。`humanSide` に応じたチーム割り当て(`"home"` のときユーザーチームが後攻)。
- `reducer.test.ts`(タイムアウト30秒): 純粋性(同一入力2回で deep equal、deep freeze した入力で変更されない)。`CPU_PITCH`/`THROW` が `in-flight`・`pitchSeq`+1・`pitchCounts`+1・`rng` 更新で、`phase.flight.seq` が加算後の `pitchSeq` と一致。インプレーで解決した後の `lastInPlay.seq` がその球の `flight.seq` と一致。無効な組み合わせ(人間守備で `CPU_PITCH`、`in-flight` 以外で `SWING`/`PITCH_ARRIVED`、人間攻撃以外で `SWING`)が同一参照を返す。人間打者の `PITCH_ARRIVED` は見逃し判定。同一シード・同一アクション列で最終状態が一致。CPU 同士の固定シード試合が `simulateGame` の上限(10,000アクション)内で必ず `game-over` に到達(イニング1/3/5/9 × 難易度3種 × 30シード)。`simulateGame` の `plates` の件数について `(final.lineupIndex.away + final.lineupIndex.home) % 9 === plates.length % 9` が成り立つ(ラウンド2 MINOR4)。`humanSide` を持つ試合で、人間側が全球見送り(人間攻撃時は `PITCH_ARRIVED` のみ、人間守備時は固定セルへ `THROW`)でも必ず終了する。**`toGameView` を呼んでも呼ばなくても最終状態(`rng` を含む)が同一**(フィールド図の計算が乱数消費順に影響しない)。
- `view.test.ts`: `inningLabel`(「1回表」等)、`mode`、`pitchReady`/`swingReady`/`cpuPitchPending` の組み合わせ、`scoreboard` の整形(「-」「x」)、`result` の勝敗(人間視点)、`arriveAfterMs`。`fieldMarker` は `lastInPlay` が `null` の間 `null`、インプレー後に非 `null` で `computeBattedLanding` の結果と一致し(`seq`・`result` を含む)、次のインプレーまで保持される。`fieldDiagram` の5値が `LANDING_PARAMS` の同名フィールドと、`geometry` の4値が `PITCH_PARAMS` の同名フィールドと一致する。`pitchSpeedLabel` は飛行中に「NNNkm/h 球種名」、それ以外は「-」。`toGameView` が state を変更しない。
- `commentary.test.ts`: すべての `PitchResult`・`PlateOutcome` に空でない文字列。
- `launch-params.test.ts`: `?seed=42&innings=1&fast=1` → (42, 1, true)。不正値は無視して既定(seed が負・小数・文字・4294967296・空 → `null`、innings が 2/0/文字 → `null`、fast が 0/true/yes → `false`、`seed=0`・`4294967295` は有効)。先頭 `?` の有無。重複キーは最初。`""` を渡すと全て既定値(本番ビルドで hooks が渡す入力)。`getPlaybackSpeed` の2値。
- `routes/resolve-route.test.ts`: `""`・`"#"`・`"#/"`→home、`"#/baseball"`・`"#/baseball/"`→baseball、`"#/unknown"`・`"#/baseballs"`・`"#baseball"`→home。
- `balance.test.ts`(`simulateGame` の戻り値 `SimulationResult` の `plates` と `final.lineScore` から集計。CPU 同士、`humanSide: null`、難易度ふつう、9回制、シード1〜100、タイムアウト30秒):
  - 全試合が上限アクション数内に終了する。
  - 1チーム1イニング(半イニング)あたり得点の平均が **0.2〜1.5**。
  - 打席あたり 三振率 8〜35%、四球率 3〜15%、打率(安打/(打席-四球)) .180〜.340、本塁打率 ≤ 6%。併殺が100試合で1件以上。引き分け率 ≤ 10%。
  - ユーザーチームと CPU チームの勝率(引き分け除く)が 30〜70%(チーム間の有利不利が無い)。
  - 上記は仮のしきい値。調整は `params`・結果表・難易度・チームデータの**数値のみ**で行う(ステップ9)。

### E2E(Playwright)

- 既存 `home.spec.ts` が**無改変**で通ること。
- 新規 `baseball.spec.ts`:
  1. 「`/` のリンクからゲーム画面へ遷移できる」: `/` を開き `open-baseball` をクリック → URL が `#/baseball`、`baseball-title` が可視、見出し「loop-basic sample app」が存在しない(0件)。
  2. 「1イニングの試合が結果画面まで到達する」: `/?seed=42&innings=1&fast=1#/baseball` を開く → `setting-innings` の値が `1` → `start-game` をクリック → `scoreboard` と `field-diagram` が可視。人間は先攻(既定)で、人間攻撃中は何も操作しない(全球見送り)。人間守備中は `pitch-controls[data-ready="true"]` になるたびに `throw-pitch` をクリックして投球する(初期選択が中央(2,2)+ストレートのため、選択操作は不要)。最初の守備ターンでは投球前に `course-cell-2-2` の `aria-pressed="true"` を確認し、投球後も選択が保持されている(`aria-pressed="true"` のまま)ことを確認する。待ち合わせは `const result = page.getByTestId("result-screen")`、`const ready = page.locator('[data-testid="pitch-controls"][data-ready="true"]')` として、`await expect(result.or(ready)).toBeVisible({ timeout: 30_000 })` で「結果画面か投球可能のどちらか」を待ち、結果画面なら終了、そうでなければ `throw-pitch` をクリックする、を繰り返す(上限300回。人間の攻撃中はどちらも見えないので待つだけになる)。クリック直後の二重クリックは `throw-pitch` の `disabled` と reducer のガードで無害。到達後、`final-score-away`/`final-score-home` と `score-away`/`score-home` の text が `/^\d+$/`。
- 同一シード・人間の入力が見送りと「投げる」(中央固定)のみなので試合は壁時計に依存せず決定的。`test.setTimeout(120_000)`、固定 sleep を使わない。`batted-ball-marker` の有無はシード展開に依存するため e2e では断定しない(単体テストと手動確認で検証する)。
- 起動パラメータ(`?seed=&innings=&fast=1`)は開発ビルドのみ有効(#8)。`playwright.config.ts` の webServer は `npm run dev`(vite dev)なので問題ない。webServer を `vite preview` 等の本番ビルドに変えるとパラメータが無視されて e2e が壊れる点を、spec のコメントに残す。

### 静的チェック

- `cd sample-app && npm run typecheck`、`npm run lint`、`npm run test`、`npm run build`、`npm run test:e2e --workspace frontend` がすべて成功。Knip(report-only)は判定に使わない([[knip-dead-code-detection]])。
- 構造検査(code-reviewer/tester が grep): `model/` に `from "react"`・`window.`・`document.`・`Math.random`・`Date`・`performance` が無い。`ui/` に `../model` の import が無い。`types/` が他セグメントを import していない。`cpu/` が `batting/`・`game/` を import していない。`batting/batted-landing.ts` が `RngState`・`rng/` を import していない。`import.meta.env` の参照が `hooks/useLaunchParams.ts` のみである。ステップ4の14コンポーネント(props のみで描くもの)に `useState`/`useEffect` 等の hooks の呼び出しが無い。各 `data-testid` が「UI 設計」の対応表のコンポーネントにだけ現れる(重複なし)。`grep -rin "パワプロ\|パワフル" sample-app --exclude-dir=node_modules` が0件。

### 手動確認(Playwright CLI でスクリーンショット)

通常速度(`fast` なし)で `npm run dev:frontend` を起動し(ゲームは backend 不要)、使い捨てスクリプト(コミットしない)で確認する。保存先は tester が決める。

1. 打撃でヒットが出る: `/?seed=7&innings=1#/baseball` を開いて開始。`ball` の `data-landing-x/y`・`data-duration-ms` を読み、`zone-svg` の矩形から画面座標へ変換(`px = left + (x / (2 × viewHalfExtent) + 0.5) × width`、`py = top + (0.5 - y / (2 × viewHalfExtent)) × height`)してマウスを移動、`data-duration-ms` 経過の直前にクリックでスイング。10球以内に実況ログに安打系(ヒット/二塁打/三塁打/ホームラン)が出る。スイング直前・結果後のスクリーンショットを撮る。Space キーでのスイングが、フォーカス中のボタンの click と二重発火しないことも確認する。
2. 投球できる: 後攻を選んで開始(人間が先に守備)。球種ボタンとコースのセルを選び(選択が `aria-pressed` で示され、この時点では投球されない)、「投げる」ボタンで投げる。ボールが飛行して判定されログに出る。投球後も選択が保持され、飛行中は「投げる」が押せない。スクリーンショットを撮る。
3. **フィールド図に打球が表示される**: 1 または 2 でインプレー(ゴロ/ヒット/フライ等)が出たあと、`field-diagram` 内に `batted-ball-marker` が現れ、`data-result` が実況ログの結果と対応し、点が結果に見合った位置(凡打は内野付近、長打は外野、ホームランはフェンス弧の外側。`data-over-fence="true"`)にある。次のインプレーで点が更新される。引っ張りは左側・流しは右側に出る。スクリーンショットを撮る(ホームランが出るまで数試合試してよい。出なくても単体テストで担保済み)。
4. スマホ縦(viewport 390×844、`hasTouch`): レイアウトが崩れず(フィールド図がスコアボード直下に収まる)、ドラッグでカーソルが動き、「スイング」ボタンでスイングできる(実機では未検証)。
5. **本番ビルドで起動パラメータが無視される**: `cd sample-app && npm run build --workspace frontend` 後に `npx vite preview`(`frontend` ディレクトリ)で `/?seed=42&innings=1&fast=1#/baseball` を開き、タイトルのイニング既定が `3` のままで、`fast` も効かない(通常速度)ことを確認する。

合格基準: 1〜3 でヒット/投球/フィールド図の打球が確認でき、致命的な表示崩れ・コンソールエラーがない。5 で本番ビルドの起動パラメータが無視される。

## リスク・トレードオフ

- **バランス(最大の不確実性)**: 結果表・強さしきい値・難易度は全て仮値。`balance.test.ts` は得点環境の「大外れ」を防ぐ程度で、面白さは保証しない。実プレイでの調整が必要。打つ側(人間)が精密にスイングすると強い打球が出やすく、簡単すぎる可能性がある(窓・強振倍率・`strongFrom` で調整)。人間投手の側は CPU 打者のノイズが位置に依存しないため、コース選択の戦略性が薄い(ゾーン内外の見極めと端の質低下、球種の打ちにくさ・球速差で差が出る程度)。
- **静的解析**: `detect-object-injection`・`pseudo-random`・cognitive complexity・`todo-tag` がゲームの典型的な書き方に直撃し、CI の `checks` が落ちると `e2e` も走らない。ステップ1の実測と、規約の徹底(code-reviewer が grep)で緩和する。
- **StrictMode と effect**: `eslint-plugin-react-hooks` 未導入のため依存配列・cleanup 漏れを lint が検出しない([[react-hooks-lint-not-installed]])。`useLatest`、cleanup の徹底、dev server(StrictMode)で走る e2e、hooks の重点レビューで緩和する。
- **タイミング精度と入力遅延**: rAF は約16.7ms刻み、タッチは遅延が数十ms。窓を±150msと広めにして `params.ts` に外出し。スイング時刻は `performance.now()` 系で統一(`event.timeStamp` は使わない: `page.clock` と整合し、判定は引数の純粋関数のまま)。
- **タブ非表示**: タブが非表示になると rAF が止まり、復帰時に経過時間が飛んで見逃し扱いになりうる(許容。将来 `visibilitychange` での一時停止を検討)。
- **キー入力の二重発火**: Space/Enter のスイングとフォーカス中ボタンの click が重なる恐れ。`swingReady` のときだけ `preventDefault` して回避し、それ以外ではキーボードでボタン(「投げる」「もう一度」等)を押せるようにする。手動確認項目に含める。
- **投球操作が2操作になる**: セル選択+「投げる」で、連続投球のテンポは1クリック方式より1操作ぶん遅いが、同じコースへ連投するときは「投げる」だけで済み、ミスタップは防げる(壁打ち Q2 の判断)。スマホでは選択ボタンと「投げる」を親指の届く範囲に置く。
- **フィールド図は見た目の目安**: 落下点は `BattedBall`/`InPlayResult` からの決定論的な逆算で、実際の野手配置や守備判定とは無関係(結果と矛盾しない帯に収めているだけ)。`seq` 由来の黄金比数列なので、同じ結果が続くと点の並びに規則性が見える(許容)。距離帯・フェンス半径は見た目の調整対象(仮値)。左右は全打者を右打ち扱いに固定(引っ張り=レフト側)。乱数を消費しないので既存の乱数消費順・シード再現性には影響しない(`reducer.test.ts` で検証)。
- **起動パラメータが開発ビルドのみ有効**: 本番ビルドでは同一シードでの不具合再現ができない(再現は dev ビルドで行う)。e2e の webServer を `vite preview` 等へ変えるとパラメータが効かなくなり e2e が壊れる(現行は `npm run dev` で影響なし。spec にコメントを残す)。DEV 判定を hooks に置く以上、その分岐は単体テストできず、手動確認5と grep(`import.meta.env` が `useLaunchParams.ts` のみ)で担保する。
- **e2e の長さと安定性**: `fast=1`・固定シード・見送り/中央固定のみで決定的。ただし延長で長引く可能性があるため上限120秒。ロジックを変えるとシードごとの試合展開が変わる(スコアは検証せず「到達」と「数値表示」のみを検証)。
- **再現性**: 同一シード・同一入力で同一結果。ガウスは Irwin–Hall(加減算のみ)で、エンジン差が出ない。
- **規模**: model が約31ソース+約26テスト。ステップ分割・`types/` 先行・シグネチャ固定で並列実装のずれを抑える。型契約の不一致は完了報告で上申させ、orchestrator が直列で解決する。
- **著作権/商標**: 名称・チーム名・選手名・UIは独自(架空)。公開前の最終確認(J-PlatPat 等)は人間作業。README・アプリ内文言に「パワプロ」等を書かない(grep で検査)。
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
| 1 | MAJOR | M1(UIステップ境界・testid割り当て・ステップ11の担当ファイル不足)+MINOR10件 → 全件反映 |
| 2(ラウンド1がMAJORの場合のみ) | PASS | M1・MINOR1〜10 の解消を確認。残MINOR4件(TitleScreen の state 方針、CourseGrid の inset の付け先、スイングボタンのイベント、plates 件数の判定式)は orchestrator が本書へ反映済み |

未解決のMAJORが残った場合: なし

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
| 2026-10-11 | 承認 | 設計レビュー2ラウンド(最終PASS、未解決MAJORなし)を提示のうえ承認。スキル化候補なし。作業ブランチはセッション指定の `claude/quirky-wright-b4lkpi`(規約の `feature/baseball-game` の代わり)である旨を提示済み |

## ステップ1 試し打ち結果(実装時に記入)

2026-10-11 実測(`npx eslint --stdin`、ファイルは作らず)。設計の想定と全件一致し、規約の見直しは不要。

| 区分 | スニペット | 結果 |
| --- | --- | --- |
| 通過 | mulberry32(`Math.imul`・`>>>`・タプル戻り値)、`arr.at(i)`、`Map#get`、`new Map([...])`、`for...of`、`arr[0]`、`Array.from({ length: 5 }, ...)`、`crypto.getRandomValues(...).at(0)`、`switch`(case 3つ/明示 case 2つ)、非ネスト三項、`Object.entries`、`import.meta.env.DEV`(hooks・ui) | 0件 |
| error | `Math.random()` | `sonarjs/pseudo-random` |
| error | `arr[i]`・`obj[key]`・`tally[side]` | `security/detect-object-injection` |
| error | `// TODO` | `sonarjs/todo-tag` |
| error | ネスト三項 | `sonarjs/no-nested-conditional` |
| error | case 1つの `switch`、case 1つ+`default` | `sonarjs/no-small-switch` |
| 実測 | `.tsx` の JSX 行 | `max-lines-per-function` に数えられる(関数全体60行で通過、61行で error) |
| 実測 | `*.test.ts` の長い `describe`/`it`、4段ネスト | 通過(テスト向け緩和が効く) |
| 追加知見 | `*.test.ts` の `expect(1).toBe(1)` のようなリテラル同士の assertion | `sonarjs/no-trivial-assertions` で error。テストは関数の戻り値を期待値と比べる |

ステップ2での追加知見: `type RngState = number` は `sonarjs/redundant-type-aliases` で error になるため、`RngState = Readonly<number>`(`number` と相互代入可)とした。型 `LineScore`(types/game.ts)と ui の `LineScore.tsx` は同名のため、同一ファイルで両方を使う場合は別名 import する。

その他: `npm install --save-dev vitest@^3.0.4` は範囲を `^3.2.7` に書き換えるため、`frontend/package.json` と lockfile の frontend エントリを `^3.0.4` に手で戻した(backend と同範囲)。lockfile 差分は3行、`npm ci --dry-run` 成功。

## 実装時の申し送り(orchestrator 記録)

各ステップの完了報告から、後続ステップが前提にすべき実装上の取り決めを記録する。

- ステップ3: `clamp(value, min, max)` を `model/pitch/zone.ts` から export(共用可)。`ballPositionAt` は曲がる球種では `elapsed=0` で「開始点+bend」から始まり、終点は全球種で `landing` に厳密一致。`pickWeighted` は空・合計0以下・NaN で `Error`。
- ステップ4(ステップ10・11 の前提):
  - `StrikeZoneSvg` のボール・カーソルは `<g transform="scale(1 -1)">` 内。hooks が書き換える `cx`/`cy` は**ゾーン座標そのまま(y 上向き、反転不要)**。ボールの `r` は `geometry.ballRadius × scale`。ボールは `key={flight.seq}` で投球ごとに再マウント。カーソル楕円は `showCursor` が偽→真で再マウントされ `cx/cy` が (0,0) に戻る(ステップ10/11 で ref から再適用するか判断)。
  - `StrikeZoneSvg` のポインタ4ハンドラ(down/move/up/cancel)は必須 props。
  - `count-balls`/`count-strikes`/`count-outs` は数値だけの visually-hidden span。`bases` の `data-first/second/third` は `"true"`/`"false"`。`pitch-controls` の `data-ready` は `String(ready)`。`batted-ball-marker` は `<circle>`(`data-distance` toFixed(1)、`data-lateral` toFixed(2))。
  - `CommentaryLog` は `log`(古い→新しい)を新しい順に表示。`ResultScreen` は `position: fixed` の dialog、「もう一度」に autoFocus。`SwingControls` の `swing-button` は `onPointerDown` のみ配線。
  - `baseball.css` は `--bb-*` 変数と `.bb-course-grid { position:absolute; inset:8.333% }` を持つ。重ね用ラッパー(`inset:0`)と `GameLayout` のレイアウト用クラスはステップ11の `baseball-field.css`。
- ステップ8(ステップ9の前提):
  - 公開API: `side.ts`(`opponent`/`offenseSide`/`defenseSide`/`bySide`/`updateSide`/`tallyAdd`)、`count.ts`(`applyBall`/`applyStrike`/`applyFoul` → `{count, end}`、`EMPTY_COUNT`)、`runners.ts`(`advanceRunners`、`EMPTY_BASES`、`OUTS_PER_INNING`)、`outcome.ts`(`applyPitchResult`、`LINEUP_SIZE`)、`inning.ts`(`settleInning`、`EXTRA_INNINGS_MAX`)、`launch-params.ts`、`commentary.ts`(`describe*`、`INNING_CHANGE_TEXT`、追加の `buildResolutionLines(summary)`)、`test-fixtures.ts`(`makeState(overrides?)` 等。`rng: 12345` 固定で `createInitialState` とは別物)。
  - 解釈: 四球・三振で打席終了時は count を 0-0 で返す。3アウト目の `advanceRunners` は `runs=0`・`bases` 空。`strength: null` の groundout/flyout は弱い当たり扱い(犠飛なし)。`settleInning` はサヨナラ判定を最初に行い、`outs<3` なら同一参照を返す。最終回表終了で後攻リードなら裏を行わず game-over(後攻 `lineScore` が短いことで「x」を表す)。`applyPitchResult` は rng・pitchSeq・pitchCounts・phase・log・lastPitchKind を更新しない(reducer の責務)。
- ステップ5(ステップ9・10の前提): `resolvePitch(rng, {flight, swing, batter, outs, bases})` が唯一の1球判定(乱数はインプレー時のみ1個)。`computeBattedLanding(ball, result, seq)` は乱数なし。`FieldDiagramGeometry` は `LANDING_PARAMS` の同名フィールド(`baseDistance`・`fenceRadius`・`viewHalfWidth`・`viewTop`・`viewBottom`)から組み立てる。`LANDING_BANDS` は `params.ts` の別 export。`clientToZonePoint` は ±`viewHalfExtent`(2.0)でクランプするため、hooks はポインタ位置を `clampCursor`(±`cursorLimit` 1.8)に通してから使う。幅・高さ0以下の矩形では `INITIAL_CURSOR` を返す。
- ステップ6: `getDifficulty(d)` の戻り値(`DifficultyParams`)を `chooseCpuPitch`/`decideCpuBat` にそのまま渡し、`aimSigmaScale` を `deliverPitch` に渡す。`chooseCpuPitch` は乱数3個(ゾーン内外・球種・セル)、`decideCpuBat` は見送りなら1個で終了。`CPU_PARAMS.maxSwingRate=0.95` を追加。CPU 打者のカーソルはクランプしない。バランス調整対象は `DIFFICULTY_TABLE`・`CPU_PARAMS`・`PITCH_PLAN_TABLE` の数値。
- ステップ9: `createInitialState`・`reduce`・`toGameView`・`simulateGame`(既定 `maxActions` 10,000)を実装。補助として `currentBatter(state)`/`currentPitcher(state)` を `state.ts` から export。`lastEvent` は `log` 末尾(空なら「プレイボール」)、`orderLabel` は「N番」、`headline` は人間視点で「あなたの勝ち!」「あなたの負け…」「引き分け」。`state.log` は上限なし、`view.log` で直近50件。
  - バランス実測(ふつう・9回制・CPU同士・シード1〜100): 半イニング平均得点 0.583、K率 23.2%、BB率 5.0%、打率 .295、HR率 2.15%、併殺 109、引き分け 0%、先攻勝率 54.0%(全しきい値内、しきい値は緩めていない)。難易度別(9回制・100シード、CPU打者の成績): かんたん K 38.9%・打率 .209・0.26点、ふつう 23.2%・.295・0.58点、むずかしい 8.7%・.391・1.07点。
  - 懸念: `strongFrom` を上げたため、人間の雑なスイングでは強い打球が出にくい。実プレイ確認が必要(/test の手動確認)。
- ステップ10(ステップ11の前提):
  - `useGame(config, seed)` → `{ view, throwPitch, swing, cpuPitch, pitchArrived }`(操作関数は参照安定)。`useCpuTurn({ cpuPitchPending, turnKey, cpuWaitMs, onCpuPitch })`。`useLaunchParams()` → `{ seed, innings, fast, speed }`(本番ビルドでは既定値)。`?seed=` を最初の1試合だけに適用するのは `BaseballGamePage` の責務。`createRandomSeed()` は `hooks/random-seed.ts`。
  - `usePitchFlight({ flight, arriveAfterMs, timeScale, ballRadius, onArrive, ballRef })` → `{ getElapsedMs }`(設計に `ballRadius` を追加。`BattingView` は `geometry.ballRadius` を渡し、`ballRef` を `useRef<SVGCircleElement>(null)` で作って `StrikeZoneSvg` と共有)。
  - `useBattingControls({ enabled, swingReady, cursorRadii, getElapsedMs, onSwing })` → `{ svgRef, cursorRef, swingKind, setSwingKind, currentRadii, swingNow, pointerHandlers }`。`enabled` は `showCursor`。`StrikeZoneSvg` に `svgRef`/`cursorRef`/`cursorRadii={currentRadii}`/`{...pointerHandlers}`、`SwingControls` に `swingKind`/`onSelectSwingKind={setSwingKind}`/`onSwing={swingNow}`/`ready={swingReady}` を渡す。
  - カーソル楕円の再マウント時は `useLayoutEffect([enabled])` で ref の位置を再適用。矢印キーは `enabled` 中のみ `preventDefault`、Space/Enter は `swingReady` 中のみ。`window` の blur で押下キー状態をクリア。
- ステップ12: ブラウザ確認済み(`/` 従来画面、`#/baseball` 遷移・戻る、先攻/後攻での試合進行、フィールド図の打球表示、`?seed=42&innings=1&fast=1` で結果画面到達(away 1 / home 3)、本番ビルドでは起動パラメータが無視される、コンソールエラー0)。e2e 実行時はクラウド環境の Playwright ブラウザ不一致に注意([[playwright-browser-revision-mismatch]])。
- ステップ7: チーム id は `luminous`(ユーザー側)/`nobles`(CPU側)。`PLAYER_TEAM`/`CPU_TEAM`/`getTeam` を export。

## 壁打ち(grilling)記録

2026-10-11 に人間と壁打ちを行い、以下を確定した。承認ゲートの代替ではない(設計レビュー・人間確認ゲートは別途実施する)。

| # | 論点 | 人間の回答 | 設計への反映 |
| --- | --- | --- | --- |
| Q1 | 打球の見せ方(論点 #14) | 簡易フィールド図を追加する。ダイヤモンド+外野フェンス弧のSVGに、直近のインプレー打球の方向・飛距離を点(+本塁からの線)で表示。守備モデルは持たず `BattedBall`/`InPlayResult` から決定論で逆算し、乱数は消費しない。ばらつきが要るなら `pitchSeq` 等の状態値から決定論的に作る | 「やること」、論点表 #14、型設計(`BattedLanding`・`InPlayRecord`・`GameState.lastInPlay`・`FieldMarkerView`・`FieldDiagramGeometry`・`GameView.fieldMarker`/`fieldDiagram`)、モデル設計「落下点」(`model/batting/batted-landing.ts`。DAG 上 batting に置き、game の `view.ts` から呼ぶ)、UI 設計(`ui/FieldDiagram.tsx`、testid `field-diagram`・`batted-ball-marker`)、ステップ2・4・5・8・9・11、テスト戦略(`batted-landing.test.ts`・`outcome`/`view`/`reducer` の追加基準・手動確認3)、リスク |
| Q2 | 投球操作(論点 #5) | セル選択→投球ボタン。セルのクリックは選択(`aria-pressed`)、「投げる」ボタン(`throw-pitch`)で投球。選択は投球後も保持、初期選択は中央(2,2)。飛行中は `throw-pitch` が disabled | 「やること」、論点表 #5、UI 設計「守備側の選択」と testid、ステップ4(`PitchingControls`・`CourseGrid`・`PitchKindButtons`)・11・13、E2E の投球手順(`throw-pitch` をクリック)、手動確認2、リスク |
| Q3 | テスト用起動パラメータ(論点 #8) | 開発ビルドのみ有効。`import.meta.env.DEV` のときだけ `?seed=`/`?innings=`/`?fast=1` を読み、本番ビルドでは無視。判定は hooks 側(`useLaunchParams`)で、model の `parseLaunchParams` は純粋関数のまま。Playwright の webServer は `npm run dev` なので e2e に影響しない | 「やること」、論点表 #8、「起動パラメータと再生速度」、hooks 設計、ステップ1(DEV 参照の試験実測)・10・13・14、テスト戦略(`launch-params.test.ts` の空文字入力、構造検査、手動確認5)、リスク |
| Q4 | 名称(論点 #2) | 設計案のまま(「ブラウザ野球」「ルミナス」「ノーブルズ」) | 「やること」、論点表 #2、チームデータ、ステップ7。公開前の J-PlatPat 確認は人間作業として残る |
