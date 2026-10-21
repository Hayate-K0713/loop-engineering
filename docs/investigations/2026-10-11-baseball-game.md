# 調査: パワプロ風の野球プレイアプリ(1試合モード)

- 日付: 2026-10-11
- ステータス: 完了
- 関連する設計ドキュメント: [docs/designs/2026-10-11-baseball-game.md](../designs/2026-10-11-baseball-game.md)
- 並列調査(ファンアウト)の観点別作業ファイル:
  - ゲームメカニクス: [_parts/baseball-game/game-mechanics.md](_parts/baseball-game/game-mechanics.md)
  - 技術アーキテクチャ: [_parts/baseball-game/tech-architecture.md](_parts/baseball-game/tech-architecture.md)

本書は2観点の作業ファイルを統合した要約である。根拠・出典・比較表の詳細は各作業ファイルを参照。

## 背景・目的

ユーザー要望「パワプロみたいな野球プレイアプリ」を、`sample-app/` に追加する。範囲はユーザー確認済みで **1試合モード(CPU対戦、打撃=ミートカーソル+タイミング、投球=球種・コース選択、スコアボード)**。育成モードは対象外。

明らかにしたいこと:

1. パワプロの打撃・投球の仕組みのうち、再実装に使える分解
2. ブラウザで遊べる規模に簡略化したルール
3. 打席結果判定のアルゴリズム
4. sample-app(Vite+React19 / NestJS / shared)への組み込み方(配置・描画・入力・テスト・静的解析)
5. 著作権・商標上の注意

## 現状の把握

- `sample-app/` に野球関連の実装はない(新規)。frontend は `App.tsx` 1ファイル(health表示と見積取得ボタン)のみ。ルーター・状態管理ライブラリなし。`main.tsx` は `<StrictMode>`。
- 既存e2e `frontend/e2e/home.spec.ts` は `/` で見出し「loop-basic sample app」が1つだけ存在することを前提にしている。
- ユニットテストは backend の vitest のみ(`npm run test` = backend)。frontend に vitest はない。
- `tsconfig.base.json`: `strict`・`noUncheckedIndexedAccess`・`exactOptionalPropertyTypes`。
- 共有メモリで適用した規約: [[pure-function-extraction]](ロジックは純粋関数)、[[eslint-strictness-ratchet-v2]](lintは全てerror)、[[knip-dead-code-detection]](Knipはreport-only・判定に使わない)。

### 静的解析の制約(orchestratorが `npx eslint --stdin` で実測、2026-10-11)

| コード | 結果 | ルール |
| --- | --- | --- |
| `Math.random()` | **error** | `sonarjs/pseudo-random` |
| `arr[i]`、`obj[k]`(変数添字) | **error** | `security/detect-object-injection` |
| `// TODO` コメント | **error** | `sonarjs/todo-tag` |
| mulberry32(`Math.imul`・ビット演算)によるシード付きPRNG | 通過 | - |
| `arr.at(i)`、`Map#get`、`arr[0]`(リテラル添字) | 通過 | - |
| `crypto.getRandomValues` | 通過 | - |

加えて読解ベースで `sonarjs/cognitive-complexity`(15)、`max-lines-per-function`(60、JSX行を含む)、`complexity`(20)、ネストした三項演算子禁止が効く。`eslint-plugin-react-hooks` は未導入。

## 選択肢の比較

### 1. 打席結果判定(最重要)

| 選択肢 | メリット | デメリット |
| --- | --- | --- |
| A: 物理風(打球初速・角度→軌道積分→野手判定) | 飛びの納得感、将来の守備操作に向く | 実装大、野手モデル必須、得点環境の調整が難しい |
| B: 確率テーブル(質スコア→結果確率表) | 実装小、テスト容易、得点環境を直接調整可 | 入力と結果の因果が弱く運ゲーに見える |
| **C: ハイブリッド** | 入力から接触・打球タイプ(高さ)・方向(タイミング)・強さを**決定論で**決め、最後に確率表を1回抽選。パワプロの分解に近い。網羅テスト可 | 段階の閾値設計に試行錯誤が要る |

### 2. 投球入力

| 選択肢 | メリット | デメリット |
| --- | --- | --- |
| **2-1: 選んだセル=最終着弾点**(5×5グリッド、中央3×3がストライク)+ガウス誤差(コントロール) | UI単純、CPUとロジック共有容易 | 球種の変化が演出寄り |
| 2-2: 狙い点+球種ごとの変化ベクトル | 戦略性が深い | 着弾点を予想しにくい、調整が難しい |

### 3. ロジックの配置

| 選択肢 | メリット | デメリット |
| --- | --- | --- |
| a: `shared/` | frontend/backend共用 | sharedのランタイムimportは未検証(backendはcommonjs) |
| **b: `frontend/src/features/baseball/model/`** | 標準構成(`frontend-designer`)と一致、変更範囲がfrontendに閉じる | backendから再利用不可(不要) |
| c: backend API で判定 | 既存の構成に乗る | 毎投球のHTTP往復でタイミング操作が破綻 |

### 4. 描画方式

| 選択肢 | メリット | デメリット |
| --- | --- | --- |
| **A: React DOM + SVG** | `data-testid` でe2e検証可、依存追加なし、a11y | 連続値の毎フレームsetStateは避ける作法が必要 |
| B: Canvas 2D | 描画自由度 | e2eで状態が見えない、高DPI等の自前実装 |
| C: Phaser / PixiJS | 機能が揃う | バンドル大、Reactとの橋渡し、本件には過剰 |

### 5. 画面遷移

| 選択肢 | メリット | デメリット |
| --- | --- | --- |
| A: App内のview状態切替 | 依存なし | 直接URLで開けない |
| **B: ハッシュ切替(`#/baseball`)** | 依存なし、`/` は従来画面のまま(既存e2e維持)、e2eで直行可 | 自前ルーティング(画面2つなので軽い) |
| C: react-router | 標準構成の `routes/` に正式に乗る | 依存追加、画面2つには過剰 |

### 6. 乱数

| 選択肢 | メリット | デメリット |
| --- | --- | --- |
| **R1: シード付きPRNG、状態をゲーム状態に含める** | 決定的テスト、リプレイ可、StrictModeのreducer二重呼び出しでも壊れない、lint例外不要 | PRNGの自前実装(十数行) |
| R2: `Math.random` + lint例外 | 単純 | 非決定的、lint例外が増える |

## 推奨アプローチ

1. **判定は案C(ハイブリッド)**。カーソル(横長楕円)とボールの距離→接触/質、カーソル内の高さ→ゴロ/ライナー/フライ、スイング時刻の早遅→引っ張り/流し/ファウル、質×パワー×スイング種別→強さ段階、最後に表[タイプ][強さ]を1回抽選。
2. **ルール**: イニング数選択(既定3回)、先攻後攻選択、守備・走塁はオート、走者は決定論進塁、延長は上限付き+引き分け。盗塁・バント・継投・代打はスコープ外。
3. **投球は案2-1+ガウス誤差**。CPU投手はカウント別の重み付き配球、CPU打者は擬似入力(ガウスノイズ)を生成して**人間と同じ判定関数**を通す。
4. **配置はb**(`frontend/src/features/baseball/`、`model/` に純粋関数+`*.test.ts`)。backend・sharedは変更しない。
5. **描画はA(DOM+SVG)**、状態は `useReducer`(離散)+ref+rAF(連続値)。
6. **画面遷移はB(ハッシュ切替)**。
7. **乱数はR1**。`Math.random` は使わない。
8. **テスト**: frontend に vitest を追加(別ファイル `vitest.config.ts`、`include` を `src/**/*.test.ts` に限定)、ルート `npm run test` を全workspace対象に変更。e2e は `e2e/baseball.spec.ts` を追加し、シード指定などで決定的にする。
9. **名称・UI・チーム/選手は独自(架空)**。「パワプロ」の名称・キャラクターは使わない。

## 制約・リスク

- **lint**: 上表の通りゲームで典型的な書き方(変数添字、`Math.random`、巨大switch、TODO)がCIを落とす。違反すると `checks` が落ち `e2e` も走らない。
- **既存e2e**: `/` の従来画面・見出し1つを維持する。
- **StrictMode**: reducer/updater が開発時に2回呼ばれる。乱数を reducer 内で可変消費すると再現性が壊れる。
- **タイミング精度**: rAF は約16.7ms刻み。入力遅延(タッチで数十ms)を考えると判定窓は広めにし、パラメータとして外出しする。
- **バランス**: 確率表の初期値は仮。モンテカルロで得点環境(打率・HR率・三振率)を確認して調整する必要がある。
- **Vitest既定 `include`** は Playwright の `e2e/*.spec.ts` も拾う(要限定)。
- **依存変更時は `package-lock.json` 同期必須**(CIは `npm ci`)。
- 一次資料は WebFetch 不可のため検索要約ベース。パワプロの内部式は未確認であり、数値は独自にチューニングする前提。

## 未解決の疑問・要確認事項

1. タッチ端末(スマホ)を正式サポートするか(タッチ操作仕様とPlaywrightのモバイルproject)。
2. 試合結果の保存(しない / localStorage / backend API)。
3. 打撃のミート打ち/強振の切替を MVP に含めるか。
4. 難易度選択を MVP に含めるか、固定(ふつう)にするか。
5. e2e で1試合を通す方法(テスト用クエリ `?seed=`・`?innings=1` 等)。
6. 選手データ(固定プリセット / ランダム生成)。

## 参考資料

主要なもののみ。全リストは各作業ファイル参照。

- KONAMI WBSC eBASEBALL パワプロ プレイガイド: https://img.konami.com/pawa/wbsc/s/playguide_ja.pdf
- パワプロ2016 開発者対談: https://www.konami.com/pawa/2016/eve/3/index.html
- Peter Norvig「Dice Baseball」: https://nbviewer.org/github/norvig/pytudes/blob/HEAD/ipynb/Dice%20Baseball.ipynb
- FanGraphs Library(打球タイプ): https://library.fangraphs.com/offense/batted-ball
- NPB 2024 チーム打撃成績: https://npb.jp/bis/2024/stats/tmb_c.html
- Vitest `include`: https://vitest.dev/config/include
- Playwright Clock: https://playwright.dev/docs/clock
- mulberry32 / sfc32: https://github.com/bryc/code/blob/master/jshash/PRNGs.md
- 知財高裁 球団の氏名・肖像使用許諾権限: https://www.ip.courts.go.jp/app/files/hanrei_jp/891/035891_hanrei.pdf

---
次のアクション: `/design` で設計フェーズに進む
