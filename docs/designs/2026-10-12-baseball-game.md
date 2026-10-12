# 設計: ブラウザ野球(1試合モード・CPU対戦)— 画面の Three.js 3D 化と周辺 UI のオーバーレイ化(第1版の描画層・UI 層を置き換える改訂)

- 日付: 2026-10-12
- ステータス: 承認済み
- 対応する調査ドキュメント: [docs/investigations/2026-10-11-baseball-game.md](../investigations/2026-10-11-baseball-game.md)(第1版と共通。本改訂のための追加調査は行っていない。根拠は下記のテストレポート・承認済みモック・frontend-designer 案)
- 第1版の設計: [docs/designs/2026-10-11-baseball-game.md](2026-10-11-baseball-game.md)(承認済み・実装済み。以下「第1版」)
- 改訂の契機(テストレポート): [docs/tests/2026-10-11-baseball-game.md](../tests/2026-10-11-baseball-game.md)(ゲート2「設計からやり直し」)
- 承認済みモック(Three.js r128 の3Dモック、2026-10-12 にユーザー承認): [docs/designs/assets/2026-10-11-baseball-game-mock3d.html](assets/2026-10-11-baseball-game-mock3d.html)(以下「モック」)
- 承認者: ユーザー(hyt.wbes)
- 承認日: 2026-10-12

**本書は第1版の描画層と UI 層を置き換える改訂である。ロジック層(`model/` のルール・判定・CPU・データ)・テスト・ルールは第1版の定義を引き継ぐ(参照先は次節の表に明記)。** 第1版のファイルは履歴として無改変とし、描画・演出・画面構成・UI・hooks のうち描画に関わる部分・E2E・手動確認については本書が優先する。

## 本書の位置づけ(第1版との関係)

### 経緯

1. 2026-10-11: 第1版(DOM+SVG の平面表示)を実装し、自動テスト(frontend 29ファイル・749件)・型・lint・ビルド・E2E・コードレビューまで通過した。
2. 同日のユーザー試遊でゲート2「設計からやり直し」。理由は「どこがパワプロなんだよ、昭和のレトロゲームより酷い」。期待は「捕手後方からボールが迫る打撃画面」「2頭身のキャラクター」「打球が球場に飛ぶ演出」で、第1版はこれらを設計時に「やらないこと」へ入れていた(共有メモリ [[visual-scope-must-be-shown-at-gate1]])。ロジック面の不具合は報告されていない。
3. Canvas 2D の疑似3Dモックは不合格。
4. 2026-10-12: Three.js の3Dモックをユーザーが承認。重視点は **打撃画面の視点(捕手後方からボールが迫る)・キャラクター(2頭身・モーション)・打球の演出(球場に飛び野手が追う)** の3つ。実況テロップ・効果音は重視点に含まれない。
5. 本書は 4 の方針で描画層を作り直す設計である。同日の壁打ちで、チーム色・演出スキップ・スコア更新のタイミングが確定した(末尾「壁打ち記録」)。
6. 2026-10-12: 設計レビュー(2ラウンド、最終 PASS)の後、ユーザーから「デザインとUIがクソだからなおせ」と指示があった。3D の作り直しに加えて、**周辺 UI(スコア・対戦情報・操作・実況・タイトル・結果)を「管理画面のようなパネル型」から「ゲーム画面らしいオーバーレイ型」に作り直す**方針を本書に追加した(論点 N7・N16・N17)。

### 第1版から引き継ぐもの(変更しない)

| 領域 | 本書での扱い | 参照先(第1版) |
| --- | --- | --- |
| ルール・判定・CPU・データ(`model/` の `rng`・`pitch`・`batting`・`cpu`・`data`・`game`) | ロジックは無改変。**加算のみ**: `game/view.ts` の `outcome`・`teamColors`・`uniforms`・`ScoreRowView.shortName`、`Team.uniformColor`・`Team.shortName`(チームデータ。描画・表示用で、判定・乱数に影響しない)。reducer・`GameState` は不変 | 「モデル設計(`model/`)」全節、「設計の既定値と論点」#1〜#13・#15〜#19 |
| 型(`types/` の `common`・`pitch`・`batting`・`game`・`actions`、`team`・`view` の既存部分) | 無改変。`team.ts` に `uniformColor`・`shortName`、`view.ts` に `outcome`・`teamColors`・`uniforms` と `ScoreRowView.shortName` を加算するのみ | 「型設計(`types/`)」 |
| 起動パラメータ・再生速度(`?seed=&innings=&fast=1`、開発ビルドのみ、`timeScale`) | 無改変。`timeScale` は演出時間にも適用する | 「起動パラメータと再生速度」、論点 #8・#11・#16 |
| hooks(`useGame`・`useCpuTurn`・`useAnimationFrame`・`useKeyboardInput`・`useLatest`・`useLaunchParams`・`random-seed`) | 無改変 | 「hooks 設計」 |
| 表示コンポーネントのうち `SwingControls`・`PitchingControls`・`PitchKindButtons`・`CourseGrid`・`LineScore`・`CountLamps`・`BaseDiamond` | **props は無改変**。testid も維持(例外: `LineScore` の合計セルの `score-<side>` は HUD 側に移すため `line-score-runs-<side>` に改名)。見た目とマークアップはオーバーレイ型に作り直す | 「UI 設計」の props 表・testid 対応表 |
| 表示コンポーネントのうち `TitleScreen`・`ResultScreen` | props(`defaultInnings`/`onStart`、`result`/`onRestart`/`onBackToTitle`)は無改変。見た目とマークアップをゲームらしく作り直す(セレクトボックス→ボタン群、testid は維持し、選択肢ごとの testid を追加) | 同上 |
| ルーティング(`routes/`、`#/baseball`)、ドキュメント運用 | 無改変 | 「アーキテクチャ・変更概要」 |
| 静的解析規約 | 継承し、three 固有の規約を追加 | 「静的解析・規約への対応」、[[sample-app-lint-random-and-index-access]] |
| 自動テスト | 既存749件の**アサーションは無改変**(`view.test.ts`・`teams.test.ts` は追記のみ、`test-fixtures.ts` は `Team` の新フィールドを足すだけ) | 「テスト戦略」 |

### 本書が置き換える・廃止する第1版の記述

- 「やらないこと」の「打球の軌道アニメーション・野手モデル」「Canvas 描画の導入」: **打球アニメーションと野手の表示は本書で「やること」に移した**(守備判定は引き続きやらない)。描画は Three.js を導入して行う。
- 「やること」の簡易フィールド図と論点 #14: 3D 球場での打球演出に置き換えて廃止する(`FieldDiagram` 削除)。
- 「全体方針」の「連続値は ref 経由で SVG 属性を直接更新する」: 毎フレーム `SceneFrame` を three に適用する方式に置き換える。
- 「UI 設計」のレイアウト(上段の Scoreboard+フィールド図、ゾーン+右側パネル)、コンポーネント構成・props 表・testid 表のうち、`BattingView`・`StrikeZoneSvg`・`FieldDiagram`・`baseball-field.css`・`Scoreboard`・`MatchupPanel`・`CommentaryLog` と、testid `field-diagram`・`batting-view`・`zone-svg`・`ball`・`swing-cursor`。**画面構成は「ステージ全面+オーバーレイ」に置き換える**(`Scoreboard`→`ScoreHud`、`MatchupPanel`→`NamePlates`、`CommentaryLog`→`Ticker`)。
- 「hooks 設計」の `usePitchFlight`・`usePointerInput`・`useBattingControls`(変更)と、新規 `useStage3d`・`useStageDirector`・`useHeldView`・`useGameStage`・`useSkipInput`。
- 「実装ステップ」(14ステップ)は本書の実装ステップに置き換える。「テスト戦略」のうち E2E・手動確認・構造検査は本書で更新する(単体テストの合格基準は第1版のまま)。
- 「ロールバック方針」は本書のものに置き換える。

## 目的・スコープ

### 目的

第1版の試遊不合格(視点・キャラクター・打球演出が無い)を解消するため、試合画面を **Three.js の3D** で作り直す。承認済みモックの世界観(デーゲームの球場、捕手後方の打撃カメラ、2頭身トゥーンキャラ、中継カメラでの打球追従、結果テロップ)を、既存のゲームロジック(判定・CPU・ルール)にそのまま接続する。判定は変えず、見た目と操作体験の層だけを置き換える。

あわせて、ユーザー指示(「デザインとUIがクソだからなおせ」)を受け、**周辺 UI を「ゲーム画面らしいオーバーレイ型」に作り直す**。ステージ(3D)を画面いっぱいに置き、スコア・対戦情報・操作・実況をその上に重ねる。右パネル・カード並びの管理画面風レイアウトはやめる。タイトル画面と結果画面もゲームらしくする。

### やること

- **3D 球場**(芝・内野の土・ベース・ファウルライン・フェンス・観客席・空)を Three.js で表示する(画像素材なし。テクスチャはコード生成)。
- **2頭身トゥーンキャラクター**(投手・捕手・打者・野手7人)を、プリミティブ形状+トゥーン材質+背面法の輪郭線でコード生成する(モックの `makePlayer` の再現)。
- **チームごとに固定のユニフォーム色**(ルミナス=青、ノーブルズ=赤)。打者は攻撃側チームの色、投手・捕手・野手は守備側チームの色で、攻守交代のたびに切り替える。
- **投球モーション**(ワインドアップ→リリース→フォロースルー)、**打者のスイング**(構え→スイング→フォロースルー)、野手・捕手の姿勢。
- **ボール軌道を判定の `flight`(`landing`・`durationMs`)と同期**させる。ボールは `t = durationMs` で必ず `landing` 位置(ゾーン平面)に到達する。
- **打球の中継カメラ追従**(接触後、打撃カメラから高い位置の中継カメラへ滑らかに移り、打球を追う)と、打球軌道(フライ/ライナー/ゴロのバウンド/ファウル/ホームランはフェンス越え)。落下点は第1版の `computeBattedLanding` と同値。
- **野手の走行**(落下点に最も近い野手が走る。他の野手は打球の方を向く)。
- **結果テロップ**(「センター前ヒット!」「ホームラン!!」「空振り!」等)。
- **演出のスキップ**: 演出中(`holding` 中)にステージのタップ/クリック、または Space/Enter で、残りの演出(打球の飛行・余韻・テロップ)を即終了して次へ進める。スイング可能な間のタップはスイングであり、スキップと衝突しない。
- **オーバーレイ型の試合画面**: ステージ全面+左上のスコア HUD(回表裏・両チーム略称とチーム色チップと得点・B/S/O ランプ・走者ダイヤモンド。回別スコアは開閉)+右上のネームプレート(打者・投手)+下部の実況ティッカー(1〜2行、全ログは開閉)+下部の操作バー(打撃: 大きなスイングボタンとミート/強振切替、守備: 球種の横並びチップと5×5の小型グリッドと「投げる」)+中央の結果テロップ。**スマホ縦(390×844)とデスクトップの両方**で成立させる。
- **ゲームらしいタイトル画面と結果画面**: 球場の絵を背景にしたロゴ風タイトル「ブラウザ野球」、選択肢はボタン群(セレクトボックスは使わない)。結果画面は3D の試合画面をぼかして背景にし、大きなスコアと勝敗を出す。
- **見た目のトーン**: 承認済みモックの世界観(昼の球場、トゥーン調)に合わせる。太めの丸ゴシック系(システムフォント)、白文字+濃い縁取り、半透明の濃紺パネル、アクセントは黄。
- 入力: 3D ステージ上でのスイングカーソル操作(マウスは絶対位置、タッチは相対ドラッグ。キーボード・「スイング」ボタンは第1版のまま)。
- `GameView.outcome`(解決した1球の事実)・`teamColors`・`uniforms`・`ScoreRowView.shortName` を `model/game/view.ts` に、`Team.uniformColor`・`Team.shortName` をチームデータに**加算的に**追加する(reducer・`GameState` は不変)。
- `GameScreen` を `React.lazy` で遅延ロードする(`/` とタイトル画面のバンドルに three を含めない)。
- E2E・`sample-app/README.md`・`docs/process/sample-app-dev.md` の更新。

### やらないこと(スコープ外)

- **送球・走塁アニメーション**(打者走者・走者の移動、塁上の走者の3D 表示、ゴロ捕球後の送球動作を含む)。野手は落下点に到達するまでの演出のみ。
- **守備操作・守備判定**。野手の動きは演出であり、判定(`resolvePitch` の結果)には一切関与しない。
- **効果音・BGM**(サウンド全般。重視点外)。
- **画像・3Dモデル素材の外部読み込み**(テクスチャ画像・GLTF・外部フォントを含む)。形状・テクスチャはすべてコードで生成する。タイトル/結果画面の背景も画像ではなく CSS で描く。
- **react-three-fiber / drei / three addons / Phaser / Pixi / 状態管理ライブラリ**の導入。
- 実況の拡充(音声、イニング別演出、リプレイ)。テロップは結果1行のみ。
- 物理シミュレーション(打球軌道は演出用の閉形式。判定・得点とは独立)。
- 判定・CPU・ルール・バランスの変更(第1版のまま)。スキップも表示の短縮だけで、試合の状態には触れない。
- ユニフォームの色以外のチーム差(縞・帽子マークの違い、チームロゴ)。
- **タイトル画面で3D 球場を実際に描画すること**(CSS で描いた球場の背景にする。3D 背景は将来案。N16)。
- モバイル実機での検証(Playwright の `hasTouch`+viewport 縮小で確認するのみ)、Playwright のモバイル project 追加。
- 第1版の「やらないこと」のうち描画に関わらないもの(育成・守備走塁の操作・盗塁/バント/代打/継投・コールド・結果保存・「パワプロ」等の名称の使用・backend/shared の変更・react-router 導入 等)は引き続きスコープ外。

### 見た目の受け入れ基準

共有メモリ [[visual-scope-must-be-shown-at-gate1]] の適用。第1版の失敗(見た目の帰結をゲート1で見せなかった)を繰り返さないため、**ゲート1では承認済みモックと本節の基準を提示する**。実装後は、モックと実装のスクリーンショットを並べ、下記チェックリストで判定する。モックに無い部分(HUD の詳細・操作バー・タイトル・結果)は、モックとの比較ではなく「**ゲーム画面として成立しているか**」の絶対基準で判定する。

**比較の方法**

- モック側: `docs/designs/assets/2026-10-11-baseball-game-mock3d.html` を Playwright(または通常のブラウザ)で開いて撮る。モックは three r128 と Google Fonts を CDN から読むため、到達できない環境では `three@0.128.0` を scratchpad に取得し、`<script src>` を差し替えたコピーで撮る(モック本体は改変しない)。
- 実装側: `cd sample-app && npm run dev:frontend` で開き、`/?seed=<固定値>&innings=3#/baseball` を開始して撮る。`stage-3d[data-phase]`(`idle`/`windup`/`flight`/`play`)を目印にして、飛行中・打球中は **50ms 間隔の連写(最大40枚)** から該当フレームを選ぶ。
- 画面サイズ: デスクトップは 1280×720、スマホ縦は 390×844(`hasTouch`)。
- 判定者と手順: ステップ G の implementer が自己判定して調整し、`/test` の tester が撮り直して判定し、ゲート2で人間が最終確認する。
- **ピクセル差分は使わない**(キャラクターの配置、HUD、ゲーム状態、時刻が一致しないため意味がない)。判定は下記チェックリストの〇×。1項目でも × なら不合格として調整に戻す。「同等以上」とは、各項目でモックの見え方と同等以上であること。

| 画面 | 実装側の撮り方 | モック側の撮り方 | 判定項目(すべて〇で合格) |
| --- | --- | --- | --- |
| S1 打撃画面(待機) | 人間先攻で開始直後、`data-phase="idle"` | 起動直後(t≈0.3s) | (a) カメラが捕手後方(高さ約1.25m)から投手方向を向き、**手前左に打者、奥の中央に投手**が見え、両者の全身が画面内に収まる (b) 打者と投手の間に**白いゾーン枠**と**黄色のスイングカーソル**(半透明の楕円+輪郭リング+中心点)が見える (c) 空のグラデーション、縞の芝、内野の土、ベース、ファウルライン、緑のフェンスと黄色の縁、観客席(ドット柄)、霧による遠景の霞が見える (d) キャラクターが2頭身で、トゥーンの段階影・黒い輪郭線・目のハイライト・頬・帽子とマークを備える (e) 品質 normal で人物とベースに影が落ちる (f) 左上に回表裏・両チームの略称・得点・B/S/O ランプの HUD があり、両チーム名の横にチーム色のチップがある(モックの HUD 相当) (g) **打者が攻撃側チームの色、投手・捕手・野手が守備側チームの色**で、ルミナス攻撃時(後攻で開始して表の守備を終えた後など)はモックと同じ配色(打者=青、守備=赤) |
| S2 投球中 | `data-phase="flight"` の連写 | t≈1.0〜1.4s | (a) ボールが**投手の手から離れ**、ゾーンに向かって大きくなりながら進む (b) ボールに黒い輪郭線と地面の影がある (c) 投手がワインドアップ→投球→フォロースルーの動きをする |
| S3 スイング〜接触 | `data-phase="flight"` 終盤〜`play` 冒頭の連写 | t≈1.55〜1.75s | (a) 打者の体が回転し、バットが水平に振られる (b) スイング中にカーソルが強調(濃くなる)される (c) 空振り時はバットがボールの位置を外して通過する (d) ジャスト付近のクリックでも、構えから接触姿勢へ1フレームで飛ばず、短い時間(60ms 以上)で補間される |
| S4 打球追従(ヒット) | `data-phase="play"` の連写(後攻で開始し CPU 打者のヒットを待つか、人間打撃でヒットを打つ) | 「ヒット」ボタンの再生中 | (a) 接触後、約0.5秒かけて**高い位置の中継カメラへ滑らかに移る**(瞬間切替ではない) (b) 打球(ボールと影)と、**落下点へ走る最寄りの野手**が同時に画面内に見え、他の野手は打球の方を向く (c) 捕手が現れ、ゾーン枠とカーソルは消える (d) ゴロはバウンドし、ライナーは低く、フライは高い放物線になる |
| S4' 打球追従(ホームラン) | 同上(ホームランは数試合試してよい。出ない場合は単体テストの端点検証で代替し、その旨を報告) | 「ホームラン」ボタンの再生中 | (a) 打球がフェンスを越えて観客席へ飛び、カメラが追う (b) 野手は走らず打球を見送る |
| S5 テロップ | 打球の落下時 / 空振り時 / ボール・ストライク時 | 打球落下時・空振り時 | (a) 画面中央やや上(上から約38%)に**黄色の太字+黒い縁取り+影**の大きな文字が、0.18秒で拡大しながら現れる (b) 文言が結果に対応する(例: センター前ヒット!/ホームラン!!/空振り!) |
| S6 スマホ縦 | 390×844 で S1 と S4 相当。人間打撃と人間守備の両方 | (基準なし。絶対基準) | (a) **ステージが画面全面**で、打者・投手・ゾーン枠が見え、オーバーレイに隠れない(ゾーン枠の画面上の幅が 70px 以上) (b) 左上の HUD と右上のネームプレートが重ならず画面内に収まる (c) **人間打撃**ではスイングボタン(64px 以上)とミート/強振切替(44px 以上)、**人間守備**では球種チップ・5×5グリッド(セル 44px 以上)・「投げる」ボタンの全体が、スクロールなしで下部の操作バーに収まり、ゾーン枠・投手・打者を覆わない (d) ページがスクロールしない |
| S7 攻守交代の配色 | 守備側が3アウト目を取る打球〜次の半イニングの待機画面の連写(後攻で開始すると最初に起きる) | (基準なし。絶対基準) | (a) 打者=攻撃側チームの色、投手・捕手・野手=守備側チームの色(ルミナス=青、ノーブルズ=赤) (b) **3アウト目の打球演出が終わるまでは旧配色のまま** (c) 次の半イニングの待機画面から、打者と守備側の配色が入れ替わる (d) HUD のチップの色がユニフォームの色と一致する |
| S8 オーバーレイ型の画面構成(ゲーム画面として成立) | デスクトップとスマホ縦の S1・S4 の画面 | (HUD はモックの `.hud` 相当。他は絶対基準) | (a) **ステージが画面全面**で、右パネル・カード並び・管理画面風の余白付き枠が無い (b) 左上に HUD(回表裏、両チームの略称+色チップ+得点、B/S/O ランプ、走者ダイヤモンド、延長のとき「延長」)。回別スコアは HUD の「回別」から開ける (c) 右上にネームプレート(打者: 打順と名前、投手: 名前・球数・スタミナバー・球速表示) (d) 下部に実況ティッカー(1〜2行)。全ログは「ログ」から開ける (e) すべてステージの上に重なり、ゾーン枠・投手・打者・テロップを隠さない (f) 文字は太めの丸ゴシック系で白字+濃い縁取り、パネルは半透明の濃紺、アクセントは黄。**グラデーションのヒーロー、全面角丸カードの並び、既定のフォーム見た目を使っていない** (g) 演出中(`holding`)に HUD・ネームプレートの上をタップしてもスキップできる |
| S9 操作バー | デスクトップとスマホ縦、人間打撃・人間守備の両方 | (絶対基準) | (a) **打撃**: 大きなスイングボタンが親指で押せる位置(右下)にあり、ミート/強振の切替が隣にある。押せないとき(`disabled`)は見た目で分かる (b) **守備**: 球種が横並びのチップで、選択中が黄で強調される。5×5の小型グリッドで選択中のセルが強調され、「投げる」ボタンが大きく目立つ。投球中は「投げる」が押せない見た目になる (c) ボタン・セルは 44px 以上(デスクトップのグリッドのセルを除く) (d) 操作バーはステージの下部に重なり、バーの背景部分を押してもスキップ/スイングにならない |
| S10 タイトル画面 | `#/baseball` を開いた直後 | (絶対基準) | (a) 背景に球場(空、観客席、縞の芝)が描かれている (b) ロゴ風の大きな「ブラウザ野球」(太字・濃い縁取り・黄色の差し色) (c) イニング数・先攻/後攻・難易度が**ボタン群**(`select` ではない)で、選択中が黄で強調され、各 44px 以上 (d) 「試合開始」ボタンが大きく目立つ (e) 白いカードに `select` が縦に並ぶ既定のフォーム風に見えない |
| S11 結果画面 | 試合終了直後(勝ち・負け・引き分けの各1回。難しければ勝ちと負けの2回) | (絶対基準) | (a) 3D の試合画面がぼかして背景に見える (b) 大きなスコア(両チームの略称+色チップ付き)と勝敗表示(勝ち/負け/引き分けで文言と色が変わる) (c) 「もう一度」が主、「タイトルへ」が従と分かる大きなボタン (d) 管理画面風のダイアログに見えない |

**動き・体験の確認(手動)**: 通常速度(`fast` なし)で人間打撃を10球以上行い、(1)ボールが捕手後方のカメラに向かって迫って見える (2)空振り・見逃し・ファウル・インプレーのうち少なくとも2種類が起きる (3)ヒットでは中継カメラに切り替わり野手が走る (4)演出中にタップ/クリック/Space でスキップでき、次の投球に進む(スイング可能な間のタップはスイングになり、スキップにならない)、ことを確認する。操作の遅延や極端なフレーム落ちがないことを目視する(実機の数値計測は行わない)。

### 設計の判断と論点(壁打ち用)

本改訂で新たに置いた判断を N1〜N17 として並べる(第1版の #1〜#19 は上記のとおり引き継ぐ)。推奨を決めたうえで、壁打ちで確認したい論点を明記する。**N8・N9・N14 は壁打ち(2026-10-12)の人間回答により確定/変更した**(行頭に【壁打ち確定】/【壁打ち変更】と記す)。**N7・N16・N17、および N11 の変更は、ユーザー指示「デザインとUIがクソだからなおせ」(2026-10-12)に基づく**(行頭に【ユーザー指示】と記す。追加の質問はしない)。経緯は末尾「壁打ち記録」。数値は初期値で、実装後のステップ G と試遊で調整する。

| # | 項目 | 設計での決定(推奨) | 根拠 | 壁打ちで確認したい論点 |
| --- | --- | --- | --- | --- |
| N1 | 描画方式 | Three.js(npm)を命令的 API で使い、`render/` に閉じる。react-three-fiber・Phaser・Pixi・three addons は使わない | モックが Three.js で承認済み。r3f は「ui は dumb」の方針と衝突し、model の純粋性・テスト容易性も損なう | three 追加(遅延チャンクで数百KB)は許容か |
| N2 | three の版 | `three@0.186.1` + `@types/three` を同一リビジョン(0.186.x)で。公開(2026-09-24)から2週間以上経過。ステップ0で `npm view` して確定。モック(r128)との差(色管理・ライト強度の単位・`RedFormat`・`outputColorSpace`、**r163 以降は WebGL2 専用**)は `render/look.ts` と `render/stage.ts` に集約し、見た目基準で受け入れる | 最新の安定版を使う。r128 固定は型・保守の面で不利 | r128 に固定してモックとの差を無くす案(不採用)でよいか |
| N3 | `model/world/` | three 非依存の純粋関数群。表示専用の数学なので、`model/` の再現性規約(`sin/cos/log/exp/hypot` 禁止)の**適用外**。`Math.random`・`Date`・`performance`・`window`・`document` の禁止は適用 | 結果が `GameState` に戻らない。三角関数なしでは自然な動きを作りにくい。決定: [[frontend-3d-three-in-render-segment]] | — |
| N4 | 演出状態の置き場 | hooks のローカル状態(ref+少数の state)。reducer・`GameState`・既存749テストは変えない。次の投球を止める `holding` ゲートと、解決した球の事実 `GameView.outcome` を加算する。演出の進行判定(`holding`・フェーズ・終了・スイング記録の対応づけ)は純関数 `sequence/session.ts` に出して単体テストする | reducer は `SWING`/`PITCH_ARRIVED` で即解決し `phase` は `await-pitch` に戻るため、演出の長さを `GameState` は持てない。hooks は単体テストしない方針なので、判断部分だけ純関数化する | — |
| N5 | 接触の見た目の時刻 | ファウル/インプレーの接触は、原則 `durationMs`(ボールがゾーンに着く時刻)に固定して描く。バットは `contactMs − 132ms` から振り始める。人間のクリックが遅い/ジャスト付近でそれが過ぎている場合は、**スイングを残り時間に圧縮して補間**し(接触はクリックの 60ms 後以降)、構え→接触姿勢が1フレームで飛ばないようにする。判定の Δt(±150ms)と見た目は一致しない(見た目のごまかし)。人間の遅いクリック(Δt>0)では接触がクリック+60ms まで遅れ、ボールがミット方向へ少し進んでから接触位置に戻って飛ぶ(最大約210ms) | 判定窓を広く取っており、Δt ごとに接触の位置をずらすと軌道の連続性が崩れる | 遅れたクリックでボールが一瞬ずれて見える挙動を許容するか(目立てば判定待ち中だけボールを非表示にする案へ切替) |
| N6 | CPU 打者の解決の前倒し | CPU 打者の `PITCH_ARRIVED` を `durationMs − 150ms` に前倒しして送る(hooks 側。reducer・`decideCpuBat` は `flight.durationMs` 基準なので結果は不変) | 結果(空振り/ファウル/ヒット)を接触の150ms前に知り、スイングの演出を結果と整合させるため | — |
| N7 | 試合画面の構成(オーバーレイ型) | 【ユーザー指示】**ステージ(3D)を画面全面に置き、情報と操作をその上に重ねる**。右パネル・カード並びはやめる。左上=`ScoreHud`(回表裏・両チーム略称+色チップ+得点・B/S/O・走者ダイヤモンド。回別スコアは `details` で開閉)、右上=`NamePlates`(打者・投手)、下部=`Ticker`(実況1〜2行+ログの開閉)と操作バー(打撃: 大きなスイングボタン+ミート/強振、守備: 球種チップ+5×5小型グリッド+投げる)、中央=結果テロップ。**既存 `Scoreboard` の testid(`scoreboard`・`inning-label`・`line-score`・`score-away`/`score-home`・`count-*`・`bases`)は `ScoreHud` 側に移して維持**し、1 testid 1 コンポーネントを守る。`Scoreboard`・`MatchupPanel`・`CommentaryLog` は置き換えて削除する。装飾用 `StageHud` は廃止(HUD 自体が実体になるため) | ユーザー指示。管理画面風のパネル型はゲームらしくない。モックの HUD も「ステージ上に重ねる」形 | 回別スコアの開閉を `details`(ネイティブ)にしてよいか(イニング終了時の一時表示は入れない) |
| N8 | スコアの更新タイミング | 【壁打ち確定】**演出の後に更新する**。`useHeldView` が `holding` 中は直前の `GameView` を表示用に保持し、スコア・カウント・実況ログ・HUD・対戦情報は演出が終わってから(スキップした場合はスキップした時点で)更新する。操作可否や演出の入力には最新の view を使う | ホームランの瞬間にスコアと実況ログが先に変わると、テロップと打球演出の価値が下がる。推奨どおり確定 | — |
| N9 | チーム色 | 【壁打ち変更】**チームごとに固定**(ルミナス=青 `0x2f63c8`、ノーブルズ=赤 `0xe8473c`。モックの配色)。色は `Team.uniformColor`(チームデータ)に持たせ、`GameView.teamColors`(サイド別。HUD のチップ用)と `GameView.uniforms`(攻撃/守備の役割別。描画用)として渡す。打者=攻撃側チームの色、投手・捕手・野手=守備側チームの色。攻守交代で `SceneFrame.uniforms` が入れ替わり、render は**共有のアクセント材質2つ(攻撃用・守備用)の色を更新するだけ**(キャラクターは1組のまま)。**3アウト目の打球演出中は旧配色を保つ**(director は演出中も保持される表示用 view(N8)の `uniforms` を使う) | ユーザー回答「チームごとに変えるに決まってんだろ」。`render/` がチーム知識を持たない構造を保てる。キャラクターを2組持つと draw call とメモリが倍になる | 青/赤の組み合わせでよいか。色以外のチーム差(縞・帽子マーク)は今回不要でよいか |
| N10 | コース選択(人間守備) | DOM の `CourseGrid` を下部の操作バーに置く(5×5の小型グリッド。スマホ縦は各セル44px、デスクトップは36px程度)。3D 側は選択セルのハイライト(`aim`)と5×5の格子線のみ | スマホ縦でゾーン上に重ねるとセルが約23pxになり44pxのタップ目標を満たせない | — |
| N11 | スマホ縦の画面とフレーミング・打撃入力 | 【ユーザー指示で変更】ステージは**端末の全面**(縦横比は端末なり。`aspect-ratio` で固定しない)。FOV を縦横比に応じて広げて打者を画面内に収める(`fovFor`)。さらに縦長のとき、下部のティッカー+操作バーがゾーンを覆わないよう、**シーンを上へずらす `framingLift(aspect)`**(`camera.setViewOffset`。初期値は縦長で画面高の 0.16)を使う。**タッチは相対ドラッグ**(指の移動量×ゾーンの画面上の大きさ比でカーソルを動かす。指がゾーンを隠さない)。マウスは絶対位置(レイキャスト) | 全面ステージ+下部オーバーレイでは、守備時のバー(球種+グリッド+投げる)が約290px を占め、固定のカメラではゾーンの下半分に重なる。3D ではゾーンが第1版の約半分の大きさになり、絶対位置のタッチでは精度が出ず指で隠れる | 相対ドラッグでよいか(実機未検証)。シーンを上へずらす量は G で調整 |
| N12 | 簡易フィールド図(第1版 #14) | 廃止し、3D の打球演出に置き換える。`fieldMarker` は testid `batted-ball-marker` の非表示 DOM ミラーとして残す(E2E・手動確認用) | 打球は球場そのものに映る | — |
| N13 | テーマ | モック基調のダーク(`--bb-*` 変数の値を差し替え)。外部フォントは使わずシステムフォント。ページ背景は `body:has(.bb-page)` で、ホーム(`/`)へ漏らさない。詳しいトーンは N17 | モックの世界観。外部通信を増やさない | — |
| N14 | 1球のテンポと演出スキップ | 【壁打ち変更】**タップで演出をスキップできる**。windup 0.7秒 + 飛行約1.4秒 + 余韻(見逃し・ボールは判定後約0.7秒、インプレーは落下後約1.3秒)で、ボール・ストライクは約3秒、インプレーは約5〜6秒、3回制の試合は約5〜6分(第1版は約3分)。**`holding` 中に限り**、ステージのタップ/クリック、または Space/Enter で残りの演出(打球の飛行・余韻・テロップ)を即終了して次へ進める(`useStageDirector.skip()`)。スイング可能な間(`swingReady`)のタップはスイングで、スキップは `holding` 中だけ有効。入力の振り分けは純関数 `routeStagePointer`/`isSkipKey` に集約する。スキップは表示だけを飛ばし、reducer・`GameState` に触れない。E2E は通常は使わず(`fast=1` で短い)、スキップ専用のテストを1本追加する | ユーザー回答でスキップ可。`holding` と `swingReady` は同時に真にならない(次の投球は演出が終わってから始まる)ため衝突しないが、純関数で優先順位(`holding` が優先)を固定して保証する | スキップ後は即カット(打撃カメラへ戻る)でよいか。スキップ中のヒントを出す(`bb-stage__skip-hint`)のでよいか |
| N15 | WebGL が使えないとき | ステージに「3D表示を使えません」を出し、試合は続行できる(時計とゲートは renderer に依存しない)。**WebGL2 が取れない場合(WebGL1 のみの環境を含む)もこの扱い**。SVG フォールバックは作らない | 第1版の SVG 描画は廃止する。ロジックと操作は有効のまま。three は r163 以降 WebGL2 専用で、WebGL1 コンテキストを渡すと例外になる | フォールバック表示を作る価値があるか |
| N16 | タイトル画面と結果画面 | 【ユーザー指示】**タイトル**: CSS だけで描いた球場(空のグラデーション、観客席のシルエット帯、縞の芝)を背景に、ロゴ風の「ブラウザ野球」。選択肢(イニング数・先攻/後攻・難易度)は `select` ではなく**ボタン群**(ネイティブの `input[type=radio]` をボタンに見せる。`useState` 不要の非制御フォームのまま)。大きな「試合開始」ボタン。タイトルでは three を読み込まない(`/` とタイトルのバンドルに three を含めない方針を維持)。**結果画面**: 3D の試合画面を `backdrop-filter` でぼかして背景にし、大きなスコア(略称+色チップ)と勝敗表示、「もう一度」(主)と「タイトルへ」(従) | 画像素材を使わない・タイトルで three を読まない、の両立。3D 球場の実描画は将来案 | タイトルの背景を3D の実描画にするか(今回は CSS の絵) |
| N17 | 見た目のトーン | 【ユーザー指示】モックの世界観(昼の球場、トゥーン調)に合わせる。**太めの丸ゴシック系**(システムフォント: `"Hiragino Maru Gothic ProN"`, `"Hiragino Sans"`, `"Yu Gothic UI"`, `"Meiryo UI"`, `"Noto Sans JP"`, `system-ui`)、**白文字+濃い縁取り**(`text-shadow` で作る。`-webkit-text-stroke` に依存しない)、**半透明の濃紺パネル**(`rgba(8, 20, 34, 0.78)`)、アクセントは黄 `#ffd23f`。放送画面風の斜めに切ったネームプレート・HUD(`clip-path`)、チーム色の縁、ボタンは濃い縁取り+ハードな落ち影(押すと沈む)。**避けるもの**: グラデーションのヒーロー、全部が同じ角丸のカード並び、既定のフォーム見た目、ガラス風パネルの多用 | ユーザー指示。AI 生成風の既定デザインを避け、モックの HUD・テロップ(黄文字+黒縁取り)と揃える | — |

## アーキテクチャ・変更概要

### 全体方針

- 3D 描画は Three.js を命令的に使い、**`render/` セグメントに閉じる**([[frontend-3d-three-in-render-segment]])。位置・軌道・ポーズ・カメラ・時刻表・テロップ文言・演出進行の判断・入力の振り分けは three 非依存の純粋関数 `model/world/` に置き、vitest(node)でテストする([[pure-function-extraction]])。
- 演出の駆動は「**時刻 t の純関数 → プレーンデータ `SceneFrame` → `StageHandle.apply`**」。毎フレーム、`useStageDirector` が `sceneFrameAt(input)` を呼んで `stage.apply(frame)` に渡す。three のオブジェクトは `render/` の外に出ない。**チーム固有の知識(色)は `Team.uniformColor` → `GameView` → `SceneFrame.uniforms` のプレーンな数値で渡し、`render/` はチームを知らない。** ゾーンの実寸・ボール半径も `model/world` の `WORLD_PARAMS` から `StageGeometry` 経由で渡し、`render/` は直書きしない。
- **画面構成は「ステージ全面+オーバーレイ」**(N7)。ステージは `position: absolute; inset: 0` の背景で、HUD・ネームプレート・ティッカー・操作バーは別の DOM 層(`bb-overlay`)に重ねる。オーバーレイは既定で `pointer-events: none`(タップがステージに届く)、操作できる要素(ボタン・グリッド・`details` の開閉)だけ `pointer-events: auto`。
- **時計は1本**(`usePitchFlight.getElapsedMs()`、リリースからの経過ゲーム時間)。投球・スイング・打球・テロップの時刻は同じ時計で表す。
- 演出の長さは `GameState` に無いため、演出の進行は hooks のローカル状態で持ち、**演出が終わる(またはスキップされる)まで次の投球を始めさせない**(`holding`)。reducer・`GameState`・既存テストは変えない。
- 判定とゲーム進行は第1版のとおり reducer が行う。3D は結果を**表示するだけ**(判定に関与しない)。スキップも表示だけを飛ばす。

1球の流れ(`phase` の遷移は第1版のとおり。ここでは演出側の区間を示す):

```
[idle] ─(CPU守備: cpuPitchPending && !holding の立ち上がり / 人間守備: 「投げる」押下)→ [windup  u: 0→1]
   ─(dispatch = リリース。flight 出現 = t0)→ [flight  t: 0→durationMs]
   ─(SWING / PITCH_ARRIVED で outcome 出現 → plan 作成)→ [play  plan.endMs まで]
   ─(plan.endMs 到達、または skip()。finishedSeq 更新 = holding 解除)→ [idle]
```

### 変更ファイル(概要)

| 区分 | ファイル | 内容 |
| --- | --- | --- |
| 変更 | `sample-app/frontend/package.json`、`sample-app/package-lock.json` | `dependencies` に `three`、`devDependencies` に `@types/three`(同一リビジョン) |
| 変更(要検証) | `sample-app/frontend/vite.config.ts` | 遅延ロード時に依存の再最適化リロードが起きる場合のみ `optimizeDeps.include: ["three"]`(ステップ0で判断) |
| 変更(要検証) | `sample-app/frontend/playwright.config.ts` | headless で WebGL が作れない場合のみ `launchOptions.args`(ステップ0で判断、適用はステップ F) |
| 新規 | `features/baseball/types/{scene,stage}.ts` | 描画契約(`SceneFrame`・`UniformColors`・`StageGeometry`・`StageHandle` ほか) |
| 変更(加算) | `features/baseball/types/team.ts`、`model/data/teams.ts`・`teams.test.ts`、`model/game/test-fixtures.ts` | `Team.uniformColor`(チーム色)・`Team.shortName`(略称)を加算。ルミナス=青・「ルミ」、ノーブルズ=赤・「ノブ」 |
| 変更(加算) | `features/baseball/types/view.ts`、`model/game/view.ts`・`view.test.ts` | `PitchOutcomeView`・`GameView.outcome`・`teamColors`・`uniforms`・`ScoreRowView.shortName` を加算(既存 model への加算変更) |
| 新規 | `features/baseball/model/world/` | 3D の純粋計算(座標・軌道・野手・ポーズ・カメラ・時刻表・テロップ・演出進行の判断・入力の振り分け)+各テスト |
| 新規 | `features/baseball/render/` | three のビルダーと `createStage`+smoke テスト |
| 新規/変更 | `features/baseball/hooks/` | `useStage3d`・`useStageDirector`・`useHeldView`・`useGameStage`・`useSkipInput`(新規)、`usePitchFlight`・`usePointerInput`・`useBattingControls`(変更) |
| 新規/変更/削除 | `features/baseball/ui/` | 新規: `StageView`・`ScoreHud`・`NamePlates`・`Ticker`・`StageTelop`・`baseball-stage.css`。変更(作り直し): `GameLayout`・`GameScreen`・`BaseballGamePage`・`TitleScreen`・`ResultScreen`・`baseball.css`。変更(マークアップ・クラス。props 不変): `SwingControls`・`PitchingControls`・`PitchKindButtons`・`CourseGrid`・`LineScore`・`CountLamps`・`BaseDiamond`。削除: `BattingView`・`StrikeZoneSvg`・`FieldDiagram`・`baseball-field.css`(**ステップ A2 で早期に撤去**し、`GameLayout` を暫定版にして全ウェーブで lint/typecheck を緑に保つ)、`Scoreboard`・`MatchupPanel`・`CommentaryLog`(`ScoreHud`・`NamePlates`・`Ticker` に置き換え、ステップ E で削除) |
| 変更 | `sample-app/frontend/e2e/baseball.spec.ts` | `field-diagram` の待機を `stage-3d` に差し替え。タイトルのボタン群、WebGL 非対応でも進行するテスト、演出スキップのテスト、オーバーレイがゾーンを隠さないことの検証を追加 |
| 変更 | `sample-app/README.md`、`docs/process/sample-app-dev.md` | 3D 表示・WebGL 要件・手動確認の更新 |
| 不変 | backend、`@sample-app/shared`、`routes/`、`App.tsx`、`main.tsx`、`ci.yml`、Knip 設定 | — |

### DBスキーマ設計

該当なし(DB・永続化の変更を含まないため `db-designer` への委譲は行わない)。

### フロントエンド構成

`frontend-designer` の返答(構成案)を転記する。designer による追加・調整は ★ で示し、直後の「frontend-designer 案からの調整点」にまとめた。

#### 結論(判断が必要だった点)

| 論点 | 判断 | 理由 |
| --- | --- | --- |
| 演出状態の置き場 | hooks のローカル状態。reducer・`GameState`・既存749テストは変えない | reducer は `SWING`/`PITCH_ARRIVED` で即解決し `phase` は `await-pitch` に戻る。人間スイング後は飛行中でも `view.flight = null`。演出の長さを `GameState` は持てない |
| 次の投球を止める | 演出終了(またはスキップ)まで `holding`(render 中に `view.outcome` と `finishedSeq` から導出。`finishedSeq` は `useGameStage` が持つ) | effect でフラグを立てると1 commit の隙間で `useCpuTurn` が先走る |
| 演出に必要な事実 | `GameView.outcome`(`PitchOutcomeView`)を `model/game/view.ts` に**加算的に**追加 | 解決した1球の種別・インプレーの結果・打席の終わり方が view に無い。reducer・state は不変 |
| チーム色 | ★ `Team.uniformColor`(データ)→ `GameView.uniforms`/`teamColors` → `SceneFrame.uniforms` | render にチーム知識を持たせない。N9 |
| 演出のスキップ | ★ `useStageDirector.skip()`。入力の振り分けは純関数(`routeStagePointer`/`isSkipKey`)で、`holding` 中のみスキップ、それ以外は従来のスイング/ドラッグ | スイング入力との衝突を型と表で保証する。N14 |
| 周辺 UI | ★ ステージ全面+オーバーレイ(`ScoreHud`・`NamePlates`・`Ticker`・操作バー)。`details` で開閉する要素はネイティブの `<details>` を使い、dumb のまま保つ | N7。ユーザー指示 |
| 3D の純粋計算 | `model/world/`(新規)。React/DOM/three 非依存、vitest(node)可。座標は `Vec3`、回転は `Rot3`(three の Euler XYZ rad と同義) | 正しさの本体をテスト可能にする |
| three のコード | 新セグメント `render/`(標準5セグメントへの意図的追加) | three を1か所に閉じる。DOM/GL に触れるのは `render/stage.ts` だけ |
| model と render の接続 | hooks のみ。契約は `types/scene.ts`・`types/stage.ts` | 互いに import しない兄弟にする |
| `StageHandle` の置き場 | `types/stage.ts` | `useStage3d`(hooks)と `render/stage.ts` を並列実装できる |
| 入力 | `Raycaster` でゾーン平面に当てる。`usePointerInput`/`useBattingControls` は SVG 依存を外して流用、`useAnimationFrame` はそのまま、`usePitchFlight` は SVG 描画を捨てて時計と到達通知のみ | 現行のポリシーを保つ(タッチのみ N11 で相対ドラッグへ) |
| コース選択 | DOM の `CourseGrid` を操作バーに置く。3D 側は選択セルのハイライトのみ | N10 |
| 遅延ロード | `GameScreen` 単位の `React.lazy` | `/` とタイトルのバンドルに three を含めない |
| react-three-fiber | 導入しない | N1 |

#### ツリー(凡例: [新規] / [変更] / [削除] / [既存]、★=designer が追加・調整)

```
sample-app/
├── package-lock.json                          [変更] three, @types/three
└── frontend/
    ├── package.json                           [変更] dependencies: three、devDependencies: @types/three(同一リビジョン 0.186.x)
    ├── vite.config.ts                         [変更(要検証)] ★ optimizeDeps.include: ["three"](再最適化リロードが出る場合のみ)
    ├── playwright.config.ts                   [変更(要検証)] headless で WebGL が作れない場合のみ launchOptions.args
    ├── e2e/baseball.spec.ts                   [変更] field-diagram → stage-3d の待機に差し替え、★ タイトルのボタン群、WebGL 非対応でも進行するテスト、演出スキップのテスト、オーバーレイがゾーンを隠さないことの検証を追加
    └── src/features/baseball/
        ├── types/
        │   ├── scene.ts   [新規] Vec3, Rot3, CameraPose, CharacterPose, BatPose, BatterPose, ★UniformColors, SceneFrame, ScenePhase
        │   ├── stage.ts   [新規] StageGeometry(★zone・ballRadius を含む), CrowdCell, ★CharacterRig, ScreenRect, StageStatus, StageQuality, StageOptions(★battingCamera を含む), StageHandle
        │   ├── team.ts    [変更] ★ Team.uniformColor・Team.shortName を加算
        │   └── view.ts    [変更] PitchOutcomeView 追加、GameView.outcome / ★teamColors / ★uniforms 追加、★ScoreRowView.shortName 追加
        ├── model/
        │   ├── rng/ pitch/ batting/ cpu/    [既存] 無改変
        │   ├── data/teams.ts, teams.test.ts [変更] ★ uniformColor・shortName(ルミナス=青・ルミ、ノーブルズ=赤・ノブ)と、その検証を追記
        │   ├── game/view.ts, view.test.ts   [変更] outcomeOf / ★colorsOf を追加、scoreRow に shortName(state・reducer 不変)。★test-fixtures.ts は Team の新フィールドを足すだけ
        │   └── world/                            [新規]
        │       ├── space/{params,vec3,coords,geometry,crowd}.ts
        │       │     params: WORLD_PARAMS(ゾーン実寸・ボール半径・リリース点・ミット・守備位置・カメラ・演出時間(ゲームms)・CPU_SWING_LEAD_MS ほか)
        │       │     coords: zoneToWorld / worldToZone / cellToWorld / landingToWorld((x,0,-y)。本塁原点、センター方向 -z) / ★zoneDeltaFromScreenDelta
        │       │     geometry: buildStageGeometry()(ゾーン・ボール半径・塁・フェンス半径・守備位置。フェンス半径105・塁間27.4は LANDING_PARAMS から)
        │       │     crowd: buildCrowdPattern(seed)(createRng 使用)
        │       ├── path/{pitch-path,batted-path,fielders}.ts
        │       │     pitchBallAt(flight, elapsedMs): t=durationMs で zoneToWorld(landing) に厳密一致 / ★mittBallAt(flight, sinceArrivalMs)
        │       │     planBattedBall(ball, result, seq, start) / planFoul(seq, start) / battedBallAt(plan, sinceContactMs)。落下点は computeBattedLanding を呼ぶ
        │       │     pickFielder(target), ★fielderRunAt(from, to, progress)
        │       ├── camera/rig.ts   battingCamera / chaseCamera / blendCamera(状態なし、t の閉形式。モックの lerp 平滑化は使わない)
        │       ├── motion/{rig,pose,pitcher,batter,fielder,fk}.ts   ★rig: CHARACTER_RIG / キーフレーム表(関数外データ定数)+ sampleKeyframes + lerpPose(明示フィールドごと) / ★fk: 手先位置の順運動学(リリース点の検証用)
        │       └── sequence/{play-plan,frame,telop,input-route,session}.ts   planPlay({flight,outcome,swing,resolvedAtMs}) → PlayPlan / sceneFrameAt(input) → SceneFrame(唯一の外向き)/ telopFor(outcome, landing) / telopAt(plan, tMs) / ★input-route: routeStagePointer・isSkipKey(スキップとスイングの振り分け)/ ★session: isHolding・phaseOf・isPlayFinished・windupProgress・recordSwing・swingForOutcome(演出進行の判断)
        │       (各 .ts に *.test.ts 同居。params・types のみのファイルを除く)
        ├── render/                                [新規] import は types/ と three のみ
        │   ├── look.ts        色管理・ライト強度・フォグ・輪郭線太さ・パレット・★fovFor(aspect)・★framingLift(aspect)・★gradientPixels(モック r128 との差の吸収点)
        │   ├── stadium.ts     buildStadium(geometry, crowd)(テクスチャは DataTexture。CanvasTexture/document 不使用で node 生成可)
        │   ├── character.ts   buildCharacter(rig, style): 2頭身トゥーン+背面法輪郭線。{root, joints, bat}。★ createTeamMaterials / applyUniforms(攻撃用・守備用の共有アクセント材質の色を更新)
        │   ├── pose-apply.ts  applyPose / applyBatterPose(明示フィールド代入)
        │   ├── markers.ts     ゾーン枠・5×5格子・スイングカーソル・狙いセルのハイライト・ボールと影(寸法は StageGeometry から)
        │   ├── dispose.ts     disposeObject3D(root)
        │   ├── stage.ts       createStage(opts): StageHandle | null(canvas と WebGL2 コンテキストの生成・破棄、WebGLRenderer、ResizeObserver、apply、pickPlane、zoneScreenRect)。唯一 DOM と GL を触る
        │   └── look|stadium|character|pose-apply|markers|dispose の *.test.ts(smoke のみ)
        ├── hooks/
        │   ├── useStage3d.ts       [新規] createStage の生成/破棄/リサイズ、pickZone、ゾーン画面矩形
        │   ├── useStageDirector.ts [新規] 演出 session(ref)・毎フレーム sceneFrameAt→apply・telop/throwing/phase の公開・★skip()
        │   ├── useHeldView.ts      [新規] ★ holding 中は直前の GameView を表示用に保持(N8)
        │   ├── useSkipInput.ts     [新規] ★ holding 中の Space/Enter でスキップ(N14)
        │   ├── useGameStage.ts     [新規] ★ finishedSeq・holding を持ち、上記と usePitchFlight・useBattingControls・useCpuTurn を合成(GameScreen を薄く保つ)
        │   ├── usePitchFlight.ts   [変更] SVG 描画(ballRef/ballRadius)削除。時計と到達通知のみ。flight 終了後も開始時刻を保持、CPU 打者の前倒し(leadMs)
        │   ├── usePointerInput.ts  [変更] 要素型を HTMLElement に一般化、pickZone 注入式、タッチは相対ドラッグ、★ pointerdown を routeStagePointer で振り分け(スキップ/スイング/ドラッグ)
        │   ├── useBattingControls.ts [変更] svgRef/cursorRef/applyCursor/useLayoutEffect 削除、getCursor を返す、★ holding・onSkip を受ける
        │   └── その他             [既存]
        └── ui/
            ├── StageView.tsx        [新規] 全面ステージ(canvas 容器・入力面・テロップ・★スキップのヒント・フォールバック・data-* ミラー)
            ├── ScoreHud.tsx         [新規] ★ 左上 HUD(scoreboard・inning-label・score-*・count-*・bases・回別の details)。旧 Scoreboard の置き換え
            ├── NamePlates.tsx       [新規] ★ 右上ネームプレート(打者・投手)。旧 MatchupPanel の置き換え
            ├── Ticker.tsx           [新規] ★ 下部の実況ティッカー(+全ログの details)。旧 CommentaryLog の置き換え
            ├── StageTelop.tsx       [新規] 結果テロップ(DOM オーバーレイ)
            ├── GameLayout.tsx       [変更(書き換え)] ★ A2 で暫定版(ステージなし)、E で「ステージ全面+オーバーレイ」の最終形
            ├── GameScreen.tsx       [変更] useGameStage 配線、ResultScreen の遅延表示
            ├── BaseballGamePage.tsx [変更] ★ A2 で baseball-field.css の import を削除、E で h1 の視覚的非表示・ホームのリンク・css import 名・GameScreen を lazy+Suspense
            ├── TitleScreen.tsx, ResultScreen.tsx [変更(作り直し)] ★ ゲームらしいタイトル(球場の CSS 背景・ロゴ・ボタン群)と結果(ぼかし背景・大きなスコア)。props 不変
            ├── SwingControls.tsx, PitchingControls.tsx, PitchKindButtons.tsx, CourseGrid.tsx [変更(マークアップ・クラス。props・testid 不変)] ★ 下部の操作バー向け
            ├── LineScore.tsx, CountLamps.tsx, BaseDiamond.tsx [変更(HUD 向けのマークアップ・クラス。props 不変。LineScore は合計セルの testid を line-score-runs-<side> に改名)]
            ├── baseball-stage.css   [新規] 全面ステージ・オーバーレイ・HUD・ネームプレート・ティッカー・操作バーの配置と見た目(baseball-field.css の置換)
            ├── baseball.css         [変更] ダークテーマ変数(モック基調)、ボタン・タイトル・結果・操作部品のスタイル。FieldDiagram/StrikeZone 規則削除、CourseGrid 通常フロー化
            ├── StrikeZoneSvg.tsx, FieldDiagram.tsx, BattingView.tsx, baseball-field.css   [削除] ★ ステップ A2
            └── Scoreboard.tsx, MatchupPanel.tsx, CommentaryLog.tsx   [削除] ★ ステップ E(ScoreHud・NamePlates・Ticker に置き換え)
```

#### 依存方向

```
routes → features/baseball/index → ui → hooks ─┬→ model (rng ← pitch ← batting ← {game, world}、cpu、data)
                                               └→ render (three)
types/ はどこからでも参照可
```

- `world/` は `types/`・`rng/`(crowd)・`pitch/{kinds,params,zone}`・`batting/{params,batted-landing,cursor}` を import してよい。`game/`・`cpu/`・`data/` は import しない。他の model サブフォルダは `world/` を import しない。`world/` 内部は `space ← path/motion/camera ← sequence`。`motion` は `types/` だけに依存する(B1/B2 の並列のため)。
- `render/` は `types/` と `three` だけを import する(`model/`・`hooks/`・`ui/` は import しない)。`render/` のテストも `model/` を import しない(寸法や色は test 内のフィクスチャで持つ)。`render/` にチーム名・チーム id・`Team` は現れない(色は数値で受け取る)。

| 層 | 責務 | やらないこと |
| --- | --- | --- |
| `model/world` | 座標変換・軌道・野手・ポーズ・カメラ・時刻表・`SceneFrame` 合成・テロップ文言・演出進行の判断・スキップ/スイングの振り分け(入力+t → プレーンデータの純関数) | three/React/DOM/`Math.random`/`Date`/`performance`、`GameState` への書き戻し |
| `render` | `SceneFrame` を three に適用、球場/キャラ生成、材質・輪郭線、ユニフォーム色の更新、破棄 | `model` の import、ゲーム知識・チーム知識、乱数。DOM/GL は `stage.ts` のみ |
| `hooks/useStage3d` | キャンバスのライフサイクル・リサイズ・`pickZone` | ゲーム判断 |
| `hooks/useStageDirector` | view の事実(`flight`・`outcome`)から演出 session を作り、毎フレーム `sceneFrameAt` → `apply`。`telop`/`throwing`/`phase` を公開し、`skip()` で演出を打ち切る | 判定、reducer への書き込み |
| `hooks/useGameStage` | `finishedSeq`・`holding`、表示用 view、各 hook の合成 | 判定、描画 |
| `ui/`(`StageView`・`ScoreHud` ほか) | 容器・入力面・オーバーレイ DOM・`data-*` ミラー | `model`/`render` の import |

#### 標準構成からの意図的逸脱

(1) `App.tsx` は `src/` 直下のまま(第1版) (2) `model/` のサブフォルダ分割(第1版) (3) `api/`・`src/shared/` を作らない(第1版) (4) **`render/` セグメントを標準5セグメントへ追加**(three を閉じ込める) (5) **`model/world/` を追加**(3D の純粋計算)。

#### frontend-designer 案からの調整点(designer)

1. **周辺 UI をオーバーレイ型に変更**(N7、ユーザー指示): frontend-designer 案の `StageHud`(装飾用 HUD)は廃止し、HUD 自体を実体の `ScoreHud` にして `Scoreboard` の testid を移した。`MatchupPanel`→`NamePlates`、`CommentaryLog`→`Ticker`。回別スコアと全ログは、ネイティブの `<details>` で開閉する(`useState` 不要で dumb を保てる)。
2. **チーム固有色に対応**(N9): frontend-designer 案の `SceneFrame` に `uniforms: UniformColors`(攻撃側/守備側の色)を含めた。色は `Team.uniformColor` → `GameView.uniforms` → `SceneFrame.uniforms` と流れ、render は共有アクセント材質2つの色を更新するだけでチームを知らない。HUD には `Team.shortName`(略称)と `teamColors` を使う。
3. **`CharacterRig` を `types/stage.ts` に置いた**: 関節の寸法(腰・肩・手先の位置)を `world/motion/rig.ts`(データ)と `render/character.ts`(形状)で二重に持たないため。`StageOptions` で `render` に渡す(`motion` が `space` に依存すると B1/B2 を並列にできない)。
4. **`useHeldView`・`useGameStage` を追加**(N8): 表示用の view 保持と、複数 hook の合成。`finishedSeq`(と `holding` の導出)は `useGameStage` が持ち、director と `useHeldView` の循環を避ける。
5. **`mittBallAt`・`fielderRunAt`・`zoneDeltaFromScreenDelta`・`fk.ts`・`fovFor`・`framingLift` を追加**: 判定待ちの間のボール、野手の移動、タッチの相対ドラッグ、リリース点の機械検証、縦横比ごとの FOV と、全面ステージでオーバーレイがゾーンを覆わないためのシーンのずらしのため。
6. **`vite.config.ts` を「要検証」の変更に追加**: `React.lazy` の遅延ロードで依存の再最適化リロードが出る場合の対策(E2E の安定化)。
7. **ステップに G(見た目の突き合わせと数値調整)を追加**: 受け入れ基準が見た目なので、B3 のブラインド調整に頼らず、全体が動いた後に実測する。UI 全体の見た目調整も含める。
8. **演出スキップの追加**(N14): `useStageDirector.skip()`、`useSkipInput`(キー)、`usePointerInput` の振り分け、純関数 `input-route.ts`(`routeStagePointer`・`isSkipKey`)。`useKeyboardInput` は変更せず、`useSkipInput` を別 hook にして既存の Space/Enter(スイング)と排他に保つ。
9. **ステップ A2(旧 ui の撤去と暫定レイアウト)を追加**: C3 で `usePitchFlight`・`useBattingControls`・`PointerHandlers` のシグネチャを変えると、E まで残る `BattingView`・`StrikeZoneSvg` が型エラーになる。先に撤去して `GameLayout` を暫定版にすることで、全ウェーブで lint/typecheck/build を緑に保つ。
10. **`model/world/sequence/session.ts` を追加**: 演出進行の判断(`holding` の導出、フェーズ決定、終了判定、windup の進捗、人間スイング記録の対応づけ)を hooks から純関数に出し、単体テストする。
11. **`StageGeometry` に `zone`・`ballRadius`、`StageOptions` に `battingCamera` を追加**: ゾーンの実寸とボール半径、ゾーン矩形の計算に使うカメラを、`WORLD_PARAMS` から渡し render に直書きさせないため。
12. **UI の実装を B4a(新規のオーバーレイ部品)と B4b(既存部品とタイトル・結果の作り直し)に分割**: 作り直す UI ファイルが多く、新規部品(`ScoreHud` ほか)と既存部品の restyle は所有ファイルが重ならないため並列にできる。

#### リスク・要検証事項(frontend-designer より、本書の「リスク・トレードオフ」に統合)

- 構造検査は機械強制ではない(grep)。`no-restricted-imports` の追加は別判断([[feature-segment-import-boundaries-not-enforced]])。
- hooks/ui は単体テスト不可 → E2E と手動。`eslint-plugin-react-hooks` 未導入([[react-hooks-lint-not-installed]])のため、`useLatest`・cleanup の徹底と hooks の重点レビューで代替する。
- headless Chromium での WebGL が最大の不確実性(ステップ0で実測)。

### 時間軸・ゲートの規約

3D 演出と reducer の時刻を整合させるための規約。以降の全ステップがこれに従う。

1. **時計は1本**: `usePitchFlight.getElapsedMs()`(リリース = `flight` 出現からの経過ゲーム時間 ms。`timeScale` 適用済み)。スイング時刻 `atMs` と演出時刻は同じ時計。開始時刻は **`useLayoutEffect`** で記録し(`flight` 出現直後の1フレームに古い値が見えないようにする)、`flight` が `null` になっても**次の `flight` が出るまで保持**する(人間がスイングすると `view.flight` は即 `null` になるが、演出は続くため)。
2. **windup はリリース前の別区間**で、壁時計を `speed.cpuWaitMs` で 0〜1 に正規化した `u`(`windupProgress`)で表す。`u = 1` がリリース直前のポーズ。リリース後のフォロースルーはゲーム時間 `t`(`pitcherFollowMs`)で再生する。`u = 1` のポーズと `t = 0` のポーズは一致させる(連続性をテストで固定)。
3. **ボールの本塁通過 = `flight.durationMs`**(`pitchBallAt` のテストで固定)。通過後は `mittBallAt` が `mittMs`(150ms)かけて捕手ミットへ進む(人間打者の判定窓 `contactWindowMs` と同じ長さ)。
4. **接触とスイングの時刻**(`planPlay`):
    - `base` = 人間のスイング入力があれば `swing.atMs`、なければ `resolvedAtMs`(CPU 打者は `PITCH_ARRIVED` の前倒しにより `durationMs − CPU_SWING_LEAD_MS`(150ms)付近)。
    - ファウル/インプレーの接触は `contactMs = max(durationMs, base + minSwingMs)`(`minSwingMs` 60ms)。CPU 打者は `durationMs`、人間の早いクリックも `durationMs`、遅い/ジャストのクリックは `atMs + 60ms`。
    - バットは `swing.startMs = max(contactMs − 132, base)` から振り始め、`swing.contactAtMs = contactMs`。`startMs`〜`contactMs` で構え→接触姿勢(`progress` 0→0.66)を線形に補間する。区間が 132ms 未満なら**圧縮**されるが、最短でも 60ms あるので、構え→接触姿勢が1フレームで飛ばない。`contactMs` 以降は通常の速度でフォロースルー(`progress` 0.66→1.0 を 68ms、さらに 1.4 まで)。`progress` は純関数 `swingProgressAt(swing, tMs)` で求める。
    - 人間のクリックが `durationMs` より遅い(Δt>0)接触では、`atMs` までボールがミット方向へ進んでから接触位置に戻って飛ぶ(最大約210msのずれ。N5 のごまかしとして許容し、手動確認で見え方を確認する。目立つ場合はボールを判定待ちの間だけ非表示にする案へ切り替える)。
5. **空振り**: 人間は `swing.startMs = swing.atMs`、`contactAtMs = startMs + 132`(圧縮なし)。CPU は入力が無いので、`contactAtMs = durationMs ± missOffsetMs`(70ms。`seq` の偶奇で早/遅)にずらしてタイミングを外したスイングに見せ、**接触ありと同じく `startMs = max(contactAtMs − 132, base)`(`base` = `resolvedAtMs`)**とする。CPU の早い空振り(`contactAtMs = durationMs − 70`)では `contactAtMs − 132` が `resolvedAtMs`(約 `durationMs − 150`)より前になるため、`startMs = resolvedAtMs` に圧縮される(接触姿勢まで約80ms。スイングが約52ms 飛ぶのを避ける)。見逃しは振らない。**`swing.height`(バットの高さ)**: 人間のスイング入力がある空振りは `zoneToWorld(swing.cursor).y`、それ以外(CPU の空振り・ファウル・インプレー、人間のファウル/インプレー)は `zoneToWorld(flight.landing).y`。
6. **CPU 打者の `PITCH_ARRIVED` を前倒し**: `leadMs = CPU_SWING_LEAD_MS`(150ms。`world/space/params.ts`)として、`arriveAfterMs − leadMs` に送る。`decideCpuBat` は `flight.durationMs` 基準でディスパッチ時刻に依存しないため、reducer・view・テストは不変。人間打者は `leadMs = 0`(従来どおり `durationMs + contactWindowMs`)。
7. **人間のスイング入力の受け渡し**: 人間がスイングすると `view.flight` は即 `null` になるが、director は `flight` を session に保持して演出を続ける。スイング入力は `swingRecord = { seq, input }`(`seq` はスイング時点の `view.flight.seq`)として `useGameStage` が ref に記録する。**1つの `seq` につき最初の1回だけ記録**する(`recordSwing`。reducer が2回目の `SWING` を無視するのと一致)。`planPlay` に渡すのは `swingRecord.seq === outcome.seq` のときだけ(`swingForOutcome`)で、そうでなければ `null`。これにより、人間打撃の次の半イニングで CPU 打者の空振り/ファウル/インプレーに古い人間のスイングが渡らない。plan 作成後は記録を `null` に戻す。`outcome.seq` に対応する `flight` が session に無い(想定外)場合は、演出なしで即座に `finishedSeq` を更新して進行を止めない。
8. **すべての演出時間はゲーム時間で定義**し、`timeScale` で壁時計に換算する(`fast=1` の E2E を短く保つ)。windup のみ壁時計(`cpuWaitMs`)。
9. **`holding`(演出中)**: `isHolding(view.outcome, finishedSeq)`(= `outcome !== null && outcome.seq !== finishedSeq`)を **render 中に導出**する。`finishedSeq` は `useGameStage` が `useState` で持ち、director が演出の終了(`plan.endMs` 到達)または**スキップ**(規約13)で `onFinished(seq)` を呼んで更新する。`holding` の間は次を止める: ①`useCpuTurn` の `cpuPitchPending`(`view.cpuPitchPending && !holding`)、②`PitchingControls` の `ready`(`view.pitchReady && !holding && !throwing`)、③`ResultScreen` の表示(`view.result !== null && !holding`)。`pitch-controls` の `data-ready` は②と一致させる。
10. **3D が描けなくても進行する**: director の毎フレーム処理は、`stage` が `null`(WebGL 不可・context lost)でも plan の進行と `onFinished` の呼び出しを行う(`apply` だけを省く)。これを満たさないと `holding` が解除されず試合が止まる。スキップも `stage` に依存しない。
11. **人間守備の windup**: 「投げる」押下で同期的に `throwing = true`、`cpuWaitMs` 後に `throwPitch(selection)`(タイマーは cleanup で解除)。CPU 守備は `useCpuTurn` の待機(`cpuWaitMs`)を windup の長さとして使い、`cpuPitchPending && !holding` の立ち上がりで windup を始める。
12. **品質**: `speed.timeScale > 1`(`fast=1`)のとき `createStage` に `quality: "low"`(影なし、`pixelRatio` 1、`antialias` なし)。`import.meta.env` を参照するのは `useLaunchParams.ts` のみ(品質は `speed` から決める)。
13. **演出のスキップ(N14)**: `useStageDirector.skip()` は **`holding` 中だけ**有効で、現在の `view.outcome.seq` で `onFinished` を呼び(`finishedSeq` が更新され `holding` が解除される)、plan・telop を破棄し、`phase` を `idle` に戻す(次のフレームで打撃カメラ・待機姿勢へ即カット。`playKind` もクリア)。`holding` でないときは何もしない(冪等)。reducer・`GameState`・乱数に触れない(表示だけを飛ばす)。スキップの直後、表示用の view は最新の view に切り替わる(N8。スコア・実況が更新される)。次の投球は従来どおり windup から始まる(CPU 守備なら `cpuWaitMs` 後)。
    - **入力の振り分け**(`routeStagePointer`、pointerdown のみ): 「主ポインタ操作」= マウス/ペンは `isPrimary` かつ `button === 0`、**タッチは `isPrimary` のみ(`button` は見ない)**。**`holding` が真なら、主ポインタ操作は常にスキップ**(`swingReady` や `enabled` に関係なく)。それ以外のポインタは無視。`holding` が偽のときは従来どおり、人間打撃中(`enabled`)のマウス/ペンの主ポインタ操作は「カーソルを移動してスイング」(スイング可否は `swingReady` で `swingNow` が判定)、タッチは「ドラッグ開始」、人間打撃中でなければ無視。`holding` と `swingReady` は同時に真にならない(次の投球は演出が終わってから始まる)が、同時に真になった場合も `holding` を優先してスイングを出さない。スキップに使った pointerdown は、スイングにもドラッグ開始にも使わない。
    - **キー**(`isSkipKey`): Space/Enter の keydown で、`holding` が真、`event.repeat` が偽、かつ target がリンク・select・input・textarea でないときスキップし、`preventDefault` する。`useKeyboardInput`(スイング)は `swingReady` のときだけ Space/Enter を扱うので排他。
    - 入力面(`bb-stage__input`)のハンドラは人間打撃中以外も常時つなぐ(CPU 打者のとき、人間守備のときもスキップできる)。`touch-action: none` は人間打撃中だけ。**ステージに重なるオーバーレイのうち操作しない要素(HUD・ネームプレート・ティッカー・テロップ・ヒント・フォールバック)は `pointer-events: none`** にして、タップが入力面に届くようにする。操作バーと、開閉する `details` の見出し・パネルだけ `pointer-events: auto`(バーの背景部分のタップはスキップ/スイングにならない)。
14. **ユニフォーム色の切替(N9)**: director は `SceneFrame.uniforms` の元に、`useHeldView` が保持する**表示用の view の `uniforms`** を使う。3アウト目の打球演出中は保持される view が旧半イニングのものなので旧配色のまま、`holding` が解除された(演出の終了またはスキップ)次のフレームから新配色になる。render は `uniforms` が前回と変わったときだけアクセント材質の色を更新する。

**演出時間表**(ゲーム ms。初期値。`WORLD_PARAMS` に外出しし、ステップ G と試遊で調整):

| 区間 | 開始 | 長さ | 備考 |
| --- | --- | --- | --- |
| windup | 壁時計(`cpuWaitMs` = 700ms、`fast` で 20ms) | 1.0 に正規化 | リリース前 |
| 飛行 | `t = 0` | `durationMs` | 投手のフォロースルーは `t = 0` から `pitcherFollowMs` 400ms |
| ミット | `durationMs` | 150ms | 見逃し/空振り/人間の判定待ち |
| スイング | `startMs = max(contactAtMs − 132, base)`(人間の空振りは `atMs`) | 接触姿勢まで 60〜132ms(圧縮あり)、通常 200ms(`contactRatio` 0.66) | カーソルは同区間 `flash` |
| 打球 | `contactMs = max(durationMs, base + 60)` | 滞空: フライ `700 + 17×距離`、ライナー `500 + 11×距離`、ゴロ `250 + 30×距離` | 距離は落下点(m)。ファウルは別式 |
| カメラ | `contactMs` | 位置 500ms(smoothstep)、注視点 250ms | 打撃カメラ→中継カメラ |
| 野手の走行 | `contactMs` | 滞空 × 1.15 | 最寄りの1人のみ |
| テロップ(開始) | インプレー: 落下時(`contactMs + hangMs`)/ **ファウル: 落下時(`contactMs + hangMs`)**/ 空振り: `max(durationMs, swing.contactAtMs)` / 見逃し・ボール: `max(durationMs, resolvedAtMs)` | インプレー 1100、ファウル・空振り 700、見逃し・ボール 500 | `StageTelop` の DOM。**どの種別も `telop.startMs ≥ durationMs`**(早い空振りでもボールが通過してから出す) |
| 余韻 | テロップ終了後 | 200ms | `endMs = telop.endMs + 200` で `holding` 解除(スキップで前倒し) |

### 型契約(`types/` の追加)

`types/` は並列実装タスク間の契約で、実行時コードを持たず、プロパティはすべて `readonly`、省略は `T | null`(`exactOptionalPropertyTypes`)。**ステップ A で凍結し、並列中の不足は編集せず完了報告で上申する**(orchestrator がウェーブ間で直列に反映)。

- `types/team.ts`(加算)
  - `Team.uniformColor: number`(24bit RGB。例: 青 `0x2f63c8`)。描画色であり、判定・乱数・バランスには影響しない。`data/teams.ts` が設定し、ルミナス=青(`0x2f63c8`)、ノーブルズ=赤(`0xe8473c`)。
  - `Team.shortName: string`(HUD 用の略称。全角1〜3文字。ルミナス=「ルミ」、ノーブルズ=「ノブ」)。表示専用で、判定に影響しない。
- `types/view.ts`(追加)
  - `PitchOutcomeView = { seq: number; kind: "ball" | "called-strike" | "swinging-strike" | "foul" | "in-play"; inPlay: { result: InPlayResult; ball: BattedBall } | null; plate: PlateOutcome | null }`
    - `seq` は解決した投球の通し番号(= その球の `flight.seq`)。`inPlay` は `kind = "in-play"` のときのみ非 `null`。`plate` は打席が終わった球のみ(`walk`/`strikeout`/`InPlayResult`)。
  - `GameView.outcome: PitchOutcomeView | null`(`state.lastResult` が `null` の間は `null`)。
  - `GameView.teamColors: { away: number; home: number }`(サイド別のチーム色。HUD のチップ用)、`GameView.uniforms: UniformColors`(攻撃側チームの色と守備側チームの色。描画用)。
  - `ScoreRowView.shortName: string`(既存の `ScoreRowView` に加算。`Team.shortName`。HUD の略称表示用。既存の `teamName` は残す)。
  - `outcomeOf(state)`(`model/game/view.ts`、約15行): `state.lastResult`・`lastPlate`・`pitchSeq`・`phase` から作る。**`phase` が `in-flight` の間は `lastResult` が前の球のものなので `seq = pitchSeq − 1`、それ以外は `seq = pitchSeq`**(次の投球が始まっても `outcome.seq` が変わらず、`holding` が誤って立たない)。乱数を使わず、state を変更しない。
  - `colorsOf(state)`(`model/game/view.ts`): `teamColors = { away: teams.away.uniformColor, home: teams.home.uniformColor }`、`uniforms = { offense: 攻撃側(`offenseSide(half)`)チームの色, defense: 守備側チームの色 }`。乱数を使わず、state を変更しない。
- `types/scene.ts`(新規)
  - `Vec3 = { x: number; y: number; z: number }`、`Rot3 = { x: number; y: number; z: number }`(three の Euler XYZ、rad)。座標系: **本塁原点、+x = 右(ライト側)、+y = 上、−z = センター方向**、単位は m。
  - `CameraPose = { position: Vec3; target: Vec3; fovDeg: number }`
  - `CharacterPose = { visible: boolean; position: Vec3(足元); yaw: number; scale: number; torso: Rot3; head: Rot3; armL: Rot3; armR: Rot3; legL: Rot3; legR: Rot3 }`
  - `BatPose = { visible: boolean; sweepYaw: number; tilt: number; height: number }`(モックの `swing.rotation.y`・`batTilt.rotation.x`・グループの高さ(m))、`BatterPose = CharacterPose & { bat: BatPose }`
  - `UniformColors = { offense: number; defense: number }`(24bit RGB。打者=`offense`、投手・捕手・野手=`defense`)
  - `ScenePhase = "idle" | "windup" | "flight" | "play"`
  - `SceneFrame = { camera: CameraPose; uniforms: UniformColors; ball: { visible: boolean; position: Vec3 }; pitcher: CharacterPose; catcher: CharacterPose; batter: BatterPose; fielders: readonly CharacterPose[](固定順 7人: 一塁・二塁・遊撃・三塁・左・中・右); zone: { visible: boolean; grid: boolean }; cursor: { visible: boolean; position: Vec3; scaleX: number; scaleY: number; flash: boolean }; aim: { visible: boolean; position: Vec3; width: number; height: number } }`
    - **単位はすべてワールド m**。`cursor.scaleX`/`scaleY` は楕円の**半径**(m)で、`radii.rx × zone.halfWidth`(0.26)・`radii.ry × (zone.top − zone.bottom) / 2`(0.30)。単位円のメッシュに掛ける。`aim.width`/`height` は選択セルの**全幅・全高**(m)で、セル幅(ゾーン単位 2/3)× `zone.halfWidth`(= 約0.173m)、× ゾーン半高(= 0.2m)。`aim.position` は `cellToWorld(cell)`。
- `types/stage.ts`(新規)
  - `StageGeometry`: **`zone: { halfWidth: number; bottom: number; top: number; planeZ: number }`(ゾーン実寸。初期値 0.26/0.42/1.02/0.03。`WORLD_PARAMS` から渡し、`zoneToWorld` と同じ値)**、**`ballRadius: number`(初期値 0.1)**、地面・内野の土と芝・マウンド・ラバー・塁・本塁・ファウルライン・打席ボックス・フェンス(半径は `LANDING_PARAMS.fenceRadius`)・スタンド・屋根の寸法(モックの `flat(...)`/`arc(...)`/`BoxGeometry` の値を転記したフィールド。**フィールド名はステップ A の実装者が定義し、B1(生成側)と B3(消費側)はそれに従う**)。`render/` は寸法を直書きせず、すべてここから読む。
  - `CrowdCell = { col: number; row: number; paletteIndex: number }`(観客席の点の配置。色は `render/look.ts` のパレットが解決する)。
  - `CharacterRig = { hipX: number; hipY: number; torsoY: number; shoulderX: number; shoulderY: number; headY: number; armLength: number }`(関節の寸法。初期値はモックの 0.14/0.5/0.55/0.36/0.48/0.98/0.38)。
  - `ScreenRect = { left: number; top: number; width: number; height: number }`(**キャンバス左上基準**の CSS px)、`StageStatus = "loading" | "ready" | "unsupported" | "lost"`、`StageQuality = "normal" | "low"`。
  - `StageOptions = { container: HTMLElement; geometry: StageGeometry; crowd: readonly CrowdCell[]; rig: CharacterRig; battingCamera: CameraPose; quality: StageQuality; onStatusChange: (status: StageStatus) => void; onResize: (size: { width: number; height: number }) => void }`(`battingCamera` は初期カメラと `zoneScreenRect` の計算に使う)
  - `StageHandle = { apply(frame: SceneFrame): void; resize(width: number, height: number): void; pickPlane(clientX: number, clientY: number): Vec3 | null; zoneScreenRect(): ScreenRect | null; dispose(): void }`
  - `createStage(options: StageOptions): StageHandle | null` のシグネチャ(`render/stage.ts` が実装し、WebGL2 が取れない・`WebGLRenderer` の生成に失敗したときは `null`)。関数そのものは実行時コードなので `types/` に置けない。ステップ C2 と C3 はこのシグネチャを契約として並列実装する。
- `model/world` 内部の型(`types/` には置かない。`render` は参照しない): `PlayPlan`・`BattedPlan`・`SceneFrameInput`・`StagePointerAction`・`SwingRecord`(下記「world 設計」)。`hooks/` は `model/world` から import してよい。

### world 設計(`model/world/`)

すべて純粋関数(入力+時刻 → プレーンデータ)。数値は**初期値**で `space/params.ts`(`WORLD_PARAMS`)に外出しする。モック由来の値はモックを正とする。

**座標・寸法(`space/`)**

| 項目 | 初期値 | 由来・備考 |
| --- | --- | --- |
| ゾーン実寸 | 半幅 x ±0.26m、y 0.42〜1.02m(中心 0.72、半高 0.30)、z = 0.03 | モック `ZONE`。`zoneToWorld(p) = (p.x×0.26, 0.72 + p.y×0.30, 0.03)`。ゾーン外(±2まで)も線形に外挿。`StageGeometry.zone` と同じ値 |
| ボール半径 | 0.1m | モック。`StageGeometry.ballRadius` |
| リリース点 | (−0.30, 1.65, −18.1) | 投手(右投げ)の手先。投手の release ポーズから `fk.ts` で求めた手先位置と 0.15m 以内(テストで固定) |
| ミット | z = 1.6、y = `landing.y − 0.2` | モックの `endZ`・`target.y − 0.2` |
| 投手 | 足元 (0, 0.25, −18.4)、yaw 0 | モック。マウンド高 0.25 |
| 捕手 | (0, −0.25, 1.3)、yaw π | モック。打撃カメラの視界を遮るため、中継カメラの `blend ≥ 0.35` になってから `visible` |
| 打者 | (−0.85, 0, 0.05)、yaw π/2、頭は投手側へ | モック。右打ち固定(引っ張り=レフト側 x<0 と整合) |
| 野手7人(x, z) | 一塁 (16.5,−23)、二塁 (6,−32.5)、遊撃 (−7,−32.5)、三塁 (−16.5,−23)、左 (−38,−72)、中 (0,−86)、右 (38,−72)。scale 1.15 | モック `FIELD_POS` |
| 打撃カメラ | 位置 (0, 1.25, 3.4)、注視 (0, 1.0, −18)、fov 34° | モック `BATTING_CAM`。テストでモックの値に固定(ステップ G でも変更しない) |
| 中継カメラ | 位置 = (ball.x×0.45, 16 + ball.y×0.35, 22 + ball.z×0.45)、注視 = (ball.x, max(0, ball.y×0.6), ball.z)、fov 34° | モックの式。係数は `WORLD_PARAMS` に外出し(ステップ G で調整してよい)。位置の blend 500ms、注視点の blend 250ms(smoothstep) |
| スイング | 全体 200ms、接触姿勢まで 132ms(`contactRatio` 0.66)、`minSwingMs` 60ms、CPU の空振りのずれ `missOffsetMs` 70ms | モック(`swingK` の 0.2 秒・接触時の 0.66)から。ステップ G でも変更しない |
| 球場寸法 | 塁間 27.4(= `LANDING_PARAMS.baseDistance`、塁の座標は (±19.4, −19.4)/(0, −38.8))、フェンス半径 105(= `LANDING_PARAMS.fenceRadius`。**モックの100から変更**)、スタンドの内側 109〜外側 147、高さ 34、屋根半径 155 | モックの寸法を転記。本塁の五角形は**尖りを捕手側(+z)に向ける**(モックは投手側向きだった) |
| フォグ | 色 0xb9d9f2、near 150、far 320 | モック |

**`space/`**

- `vec3.ts`: `lerpVec3`・`addVec3`・`distanceXZ` ほか最小限。
- `coords.ts`: `zoneToWorld(ZonePoint) → Vec3`、`worldToZone(Vec3) → ZonePoint`(ゾーン平面への逆写像)、`cellToWorld(CourseCell) → Vec3`(`cellToPoint` → `zoneToWorld`)、`landingToWorld({x, y}) → Vec3`(`(x, 0, −y)`)、`zoneDeltaFromScreenDelta(dx, dy, rect: ScreenRect) → ZonePoint`(ゾーン枠の画面矩形の幅・高さを ±1 に対応させた差分。dy は下向きが正)。
- `geometry.ts`: `buildStageGeometry() → StageGeometry`(`zone`・`ballRadius` を `WORLD_PARAMS` から入れる)。`crowd.ts`: `buildCrowdPattern(seed) → readonly CrowdCell[]`(`createRng` を使い決定論。32×16 セル)。

**ボール軌道(`path/`)**

- `pitchBallAt(flight, elapsedMs) → Vec3`: 進行度 `p = clamp(elapsed / durationMs, 0, 1)`。`aim' = zoneToWorld(landing) + bendWorld`(`bendWorld = getPitchSpec(kind).bend × 半幅/半高 × bendGain(2.5)`)に向かって直進し、**終盤に曲がる**: `pos = lerp(release, aim', p) − bendWorld × p³ + (0, arcHeight × 4p(1−p), 0)`(`arcHeight` 0.12)。`p = 1` では `zoneToWorld(landing)` を直接返す(浮動小数の誤差を避ける)。`p = 0` はリリース点に厳密一致。z は単調に増える。
- `mittBallAt(flight, sinceArrivalMs) → Vec3`: `landing` からミット位置へ `mittMs`(150ms)で線形に進み、以降はミット位置。`sinceArrivalMs = 0` は `pitchBallAt(flight, durationMs)` に厳密一致。
- `planBattedBall(ball, result, seq, start: Vec3) → BattedPlan`: `BattedPlan = { start: Vec3; end: Vec3; peak: number; hangMs: number; hops: number; shape: "fly" | "liner" | "ground"; overFence: boolean }`。`end` の x・z は `computeBattedLanding(ball, result, seq)` の `landingToWorld`(= `GameView.fieldMarker` と同値)。`y`: ホームラン以外は 0、ホームランはスタンド斜面の高さ(`StageGeometry` から算出)。`peak`・`hangMs` は打球タイプ別の式(上の時間表。フライの頂点 = `0.24 × 距離`、ライナー `0.08 ×`、ゴロ 0 でバウンド3回・高さ 0.35m から減衰)。
- `planFoul(seq, start) → BattedPlan`: `seq` の偶奇と黄金比数列で、ファウルライン外側(|x| > |z|)への飛球、またはバックネット方向(z>0)への飛球を決定論的に作る。
- `battedBallAt(plan, sinceContactMs) → Vec3`: `p = clamp(s / hangMs, 0, 1)`。xz は線形、y はフライ/ライナーが `lerp + 4·peak·p(1−p)`、ゴロはバウンド(`y ≥ 0`)。`p = 1` では `plan.end` を直接返す。
- `fielders.ts`: `FIELDER_SLOTS`(固定順7人)、`pickFielder(target: Vec3) → number`(XZ 距離が最小の野手。同距離は添字の小さい方)、`fielderRunAt(from, to, progress) → Vec3`(線形)。

**カメラ(`camera/rig.ts`)**: `battingCamera()`、`chaseCamera(ball: Vec3) → CameraPose`、`blendCamera(a, b, k) → CameraPose`、`easeInOut(x)`(smoothstep)。いずれも**状態を持たず t の閉形式**(モックのフレーム依存の lerp 平滑化は使わない)。

**モーション(`motion/`)**: `CHARACTER_RIG`(`rig.ts`)、`lerpPose`・`sampleKeyframes`(`pose.ts`)、`pitcherWindupPose(u)`・`pitcherFollowPose(sinceReleaseMs)`、`batterStancePose()`・`batterSwingPose(progress, height)`(`progress` 0〜1 がスイング(0.66 が接触姿勢)、1〜1.4 がフォロースルー)、`fielderIdlePose()`・`fielderRunPose(timeMs)`・`catcherPose()`、`handPosition(pose, rig, root)`(`fk.ts`)。キーフレーム表は関数外のデータ定数(初期値はモックの `posePitcher`/`poseBatter`/`runPose` の式を表に起こしたもの。投手の腕は上から前へ振り抜く動きに直し、リリース時に手先が `RELEASE_POINT` を通るようにする)。関節角の範囲は ±2π、隣接フレーム(16ms)の変化は 0.5rad 以内(スイングの最大速度を許容しつつ、切替点の飛びを検出できる値)。

**時刻表と合成(`sequence/`)**

- `planPlay({ flight, outcome, swing: SwingInput | null, resolvedAtMs }) → PlayPlan`(純関数・決定論)。`PlayPlan = { seq: number; kind: PitchOutcomeView["kind"]; durationMs: number; resolvedAtMs: number; swing: { startMs: number; contactAtMs: number; height: number } | null; contactMs: number | null; batted: BattedPlan | null; fielder: { index: number; from: Vec3; to: Vec3; startMs: number; arriveMs: number } | null; chaseFromMs: number | null; telop: { text: string; startMs: number; endMs: number }; endMs: number }`。時刻の決め方は規約4・5、`swing.height` は規約5、テロップの開始時刻は演出時間表のとおり(`telop.startMs ≥ durationMs` を全種別で満たす)。`swingProgressAt(swing, tMs) → number` も公開する(`tMs ≤ startMs` で 0、`contactAtMs` で 0.66、以降 1.0 → 1.4)。
- `sceneFrameAt(input) → SceneFrame`(唯一の外向き関数)。`SceneFrameInput = { phase: ScenePhase; tMs: number; windupU: number; flight: PitchFlight | null; plan: PlayPlan | null; uniforms: UniformColors; cursor: { visible: boolean; point: ZonePoint; radii: CursorRadii }; aim: CourseCell | null; grid: boolean }`。`frame.uniforms` は `input.uniforms` をそのまま写す(どの `uniforms` を渡すかは director が決める。規約14)。ボールの位置は、`contactMs` より前は `pitchBallAt`(`tMs ≤ durationMs`)/`mittBallAt`(それ以降。plan が無い人間打者の判定待ちを含む)、インプレー/ファウルの `contactMs` 以降は `battedBallAt`(落下後は終点に留まる)。`cursor`/`aim` の寸法は上記「型契約」の単位(ワールド m)で、`WORLD_PARAMS` のゾーン実寸から求める。アクターごとの小関数(`pitcherFrame`・`batterFrame`・`ballFrame`・`cameraFrame` ほか)に分け、各 60行以内にする。
- `telopFor(outcome, landing)`・`telopAt(plan, tMs) → string | null`(下表)。
- `input-route.ts`(入力の振り分け。純関数): `routeStagePointer({ holding, enabled, swingReady, pointerType, isPrimary, button }) → StagePointerAction`(`"skip" | "swing" | "drag-start" | "ignore"`。`swing` は「カーソルを移動してスイングを試みる」)と、`isSkipKey({ holding, key, repeat, targetTag }) → boolean`。判定表は規約13のとおり(`holding` が最優先)。
- `session.ts`(演出進行の判断。純関数。hooks の判断部分を単体テストできるように切り出す): `isHolding(outcome, finishedSeq)`、`phaseOf({ hasPlan, hasFlight, windupActive }) → ScenePhase`(優先順位 plan > flight > windup > idle)、`isPlayFinished(plan, tMs)`(`tMs ≥ plan.endMs`)、`windupProgress(nowMs, startedAtMs, cpuWaitMs) → number`(0〜1 にクランプ。`cpuWaitMs ≤ 0` は 1)、`SwingRecord = { seq: number; input: SwingInput }`、`recordSwing(current, seq, input) → SwingRecord`(同じ `seq` なら現在の記録を返す = 最初の1回だけ)、`swingForOutcome(record, outcomeSeq) → SwingInput | null`(`seq` が一致するときだけ)。

| 結果 | テロップ文言 |
| --- | --- |
| `ball` / `called-strike` | 「ボール」/「ストライク」(打席終了時は「フォアボール」/「見逃し三振!」) |
| `swinging-strike` | 「空振り!」(三振時は「空振り三振!」) |
| `foul` | 「ファウル」 |
| `single` | 落下点が内野(距離 < 塁間×√2 ≈ 38.8)なら「内野安打!」、それ以外は「{方向}前ヒット!」 |
| `double` / `triple` | 「{方向}への二塁打!」/「{方向}への三塁打!」 |
| `homerun` | 「ホームラン!!」 |
| `groundout` / `doublePlay` | 「ゴロアウト」/「併殺打!」 |
| `flyout` / `lineout` | 「{方向}フライ」/「{方向}ライナー」 |
| `error` | 「エラー!」 |

方向は落下点の `lateral`(= x/y)で決める: `< −0.25` → レフト、`> +0.25` → ライト、それ以外 → センター(`LANDING_PARAMS.lateral` の境界と同じ)。

### render 設計(`render/`)

- **共通**: `import` は `types/` と `three` のみ。名前付き import のみ(`import * as THREE` 禁止、addons 不使用)。three オブジェクトは `getObjectByName` で探さず、ビルダーが返す参照を保持する。関数は60行以内(球場は部品ごとの小関数に分割)。`exactOptionalPropertyTypes` のため three のオプションに `undefined` を渡さない。チーム名・チーム id・`Team` は扱わない。ゾーン・ボールの寸法は `StageGeometry` から読み、直書きしない。
- `look.ts`: 色管理・ライト・フォグ・パレット・輪郭線の太さ(1.07)・`fovFor(baseFovDeg, aspect)`(と、その定数 `MIN_HALF_WIDTH_TAN`(初期値 0.37)の export)・**`framingLift(aspect)`**(と定数 `PORTRAIT_LIFT`(初期値 0.16)・`LIFT_FULL_ASPECT`(0.6)・`LIFT_ZERO_ASPECT`(1.2)の export)・`gradientPixels(stops, height)`・ユニフォーム色の既定値(最初の `apply` までの仮の色。モックの青/赤)を集約する、**モック(r128)との差の吸収点**。第一候補は r128 の描画経路の再現: `ColorManagement.enabled = false` + `renderer.outputColorSpace = LinearSRGBColorSpace`、ライト強度は r128 の値に π を掛けた値(物理単位への換算)。見た目が合わなければステップ G で再調整する。`fovFor` は縦横比が小さいとき、ゾーン平面での画面の半幅が約 1.25m(`tan` 換算 `MIN_HALF_WIDTH_TAN`)以上になるよう縦 FOV を広げる(`max(base, 2·atan(MIN_HALF_WIDTH_TAN / aspect))`。16:10 では 34° のまま、4:5 で約 50°)。`framingLift` は縦長の画面で、下部のティッカー+操作バーがゾーンを覆わないよう、シーンを上へずらす量(画面高に対する比)を返す(`aspect ≥ LIFT_ZERO_ASPECT` で 0、`aspect ≤ LIFT_FULL_ASPECT` で `PORTRAIT_LIFT`、その間は線形)。
- `stadium.ts`: `buildStadium(geometry, crowd)`。地面(縞の芝)・内野・マウンド・塁・本塁・ファウルライン・打席ボックス・フェンス・スタンド(観客のドット柄)・屋根・空・ライト。テクスチャは **`DataTexture` のみ**(`CanvasTexture`・`document` を使わず node で生成可能)。ピクセル配列は `Uint8Array.from(...)` を使うヘルパーに集約する(変数添字の書き込みを避ける)。
- `character.ts`: `buildCharacter(rig, style) → { root, joints: { torso, head, armL, armR, legL, legR }, bat }`。モックの `makePlayer` を再現(脚・靴・胴・ベルト・縞・頭・帽子・つば・マーク・目・ハイライト・頬・腕・手、グローブ、バット)。`MeshToonMaterial` + 3段の `gradientMap`(`DataTexture`、`RedFormat`、`NearestFilter`)+ 背面法の輪郭線。`buildLeg`/`buildTorso`/`buildHead`/`buildFace`/`buildArm`/`buildBat` に分割する。**ユニフォームのアクセント色(ベルト・縞・帽子・つば)は `style.accent`(共有の `MeshToonMaterial`)を使う**。`createTeamMaterials(gradient) → { offense, defense }` が攻撃用・守備用の2材質を作り、打者は `offense`、投手・捕手・野手は `defense` を共有する。`applyUniforms(materials, uniforms)` は2材質の `color` を `uniforms.offense`/`uniforms.defense` に更新する(変化があるときだけ呼ぶ)。
- `pose-apply.ts`: `applyPose(parts, pose)`・`applyBatterPose(parts, pose)`(明示フィールドの代入)。
- `markers.ts`: ゾーン枠(`geometry.zone` の実寸)、5×5格子、スイングカーソル(塗り・リング・中心点、`depthTest` なし。`scaleX`/`scaleY` を半径(m)として単位円に掛ける)、狙いセルのハイライト(`aim.width`/`height` は全幅・全高(m))、ボール(`geometry.ballRadius`、輪郭線つき)と地面の影。`SceneFrame` の該当部分を適用する関数を持つ。
- `dispose.ts`: `disposeObject3D(root)`(geometry・material・texture を破棄)。
- `stage.ts`: `createStage(options)`。**three は r163 以降 WebGL2 専用で、WebGL1 コンテキストを渡すと例外になる。したがって canvas を自分で生成して `canvas.getContext("webgl2", attrs)` だけを取得し(WebGL1 の `"webgl"` にはフォールバックしない)、`new WebGLRenderer({ canvas, context })` に渡す**。`getContext` が `null` なら three を呼ばず `null` を返す(three の「Error creating WebGL context」の `console.error` を出さない)。**`WebGLRenderer` の生成は try/catch で囲み、例外のときは canvas を `container` から外して(追加済みなら)`null` を返す**(N15 のフォールバック表示へ)。canvas は `container` に追加し、`dispose` で remove する。`ResizeObserver` で `resize` と `onResize`。`webglcontextlost` で `onStatusChange("lost")`、復帰で `"ready"`。`apply(frame)` は camera・fov(`fovFor`)・**シーンの上方向へのずらし(`framingLift(aspect)` が 0 より大きいとき `camera.setViewOffset(w, h, 0, lift × h, w, h)`、0 のとき `clearViewOffset()`)**・ユニフォーム色(`frame.uniforms` が前回から変わったときだけ `applyUniforms`)・各ポーズ・マーカーを更新して描画する。`pickPlane` は**最後に `apply` されたカメラ**(ビューオフセットを含む)でキャンバス矩形からレイを作りゾーン平面(`geometry.zone.planeZ`)と交差する。**`zoneScreenRect` は常に `options.battingCamera`(`fovFor` と `framingLift` を適用)で**ゾーン枠の4隅を投影した矩形を返す(中継カメラ中でも値が変わらない)。`quality: "low"` は影なし・`pixelRatio` 1・`antialias` なし。
  - **`dispose()` の手順(StrictMode の二重 mount でも残骸を出さない)**: ①先頭で `disposed = true` にする(以後 `apply`/`resize` は何もせず、`pickPlane`/`zoneScreenRect` は `null`、`onStatusChange`/`onResize` は一切呼ばない)、②`webglcontextlost`/`webglcontextrestored` のリスナを解除する(後続の `forceContextLoss` が `"lost"` を通知しないため)、③`ResizeObserver.disconnect()`、④geometry・material・texture を破棄、⑤`renderer.dispose()` → `forceContextLoss()`、⑥canvas を remove。冪等(2回呼んでも例外にならない)。
  - **`document`・`window`・`ResizeObserver`・`WebGLRenderer`・`getContext` を使うのはこのファイルだけ**。

### hooks 設計

| hook | 変更 | 内容 |
| --- | --- | --- |
| `useStage3d({ quality })` | 新規 | `containerRef`・`stage`(state)・`status`・`zoneRect`・`pickZone(clientX, clientY)`(`stage.pickPlane` → `worldToZone`。平面と交差しなければ `null`)・`getZoneRect()` を返す。**生成 effect の deps は `quality` のみ**(半イニングごとに作り直さない)。`createStage` の生成と cleanup の `dispose`(と `stage` state を `null` に戻す)。`buildStageGeometry`・`buildCrowdPattern`・`CHARACTER_RIG`・`battingCamera()` を `StageOptions` に渡す(静的データは model で作り hooks 経由で render へ渡す)。`createStage` が `null` なら `status = "unsupported"`。ゾーン矩形は `onResize` で更新する。初期カメラは `battingCamera`、ユニフォーム色は director の最初の `apply` で確定する(`sceneFrameAt` に依存しない) |
| `usePitchFlight({ flight, arriveAfterMs, leadMs, timeScale, onArrive })` | 変更 | SVG 描画(`ballRef`/`ballRadius`)を削除。開始時刻を `useLayoutEffect` で記録し、`flight` が `null` になっても保持。`arriveAfterMs − leadMs` で `onArrive` を1回。`getElapsedMs()` を返す |
| `usePointerInput({ enabled, holding, swingReady, onSkip, pickZone, getZoneRect, getCursor, moveCursorTo, onSwing })` | 変更 | 対象要素を `HTMLElement`(入力面の div)に一般化。**pointerdown は `routeStagePointer` の結果で分岐する**(`skip` → `onSkip()` のみ。`swing` → カーソル移動+`onSwing()`。`drag-start` → 相対ドラッグの開始。`ignore` → 何もしない)。pointermove は従来どおり(`enabled` のときカーソルに反映)。下表のポリシー |
| `useBattingControls({ enabled, holding, swingReady, cursorRadii, getElapsedMs, onSwing, onSkip, pickZone, getZoneRect })` | 変更 | `svgRef`/`cursorRef`/`applyCursor`/`useLayoutEffect` を削除し、`getCursor` と `getCursorView()`(`{ point, radii }`)を返す。カーソル位置は ref(`INITIAL_CURSOR` から)。`swingKind`・`currentRadii`・`swingNow`・`pointerHandlers` は従来どおり。`holding`・`onSkip` を `usePointerInput` へ渡す |
| `useSkipInput({ holding, onSkip })` | 新規 | `window` の keydown を購読し、`isSkipKey` が真なら `preventDefault()` して `onSkip()`。cleanup でリスナ解除。`useKeyboardInput`(スイング)は変更しない |
| `useStageDirector({ view, stage, holding, onFinished, getElapsedMs, getCursorView, swingRecordRef, aimCell, uniforms, speed })` | 新規 | 下記。`holding` と `onFinished(seq)` は `useGameStage` から受ける(`finishedSeq` は持たない)。`getCursorView()` は `{ point, radii }` を返す getter(循環を避ける) |
| `useHeldView(view, holding)` | 新規 | `holding` が偽の間は最新の view を `ref` に保存(effect)し、真の間は保存した直前の view を返す。表示用(`ScoreHud`・`NamePlates`・`Ticker`)と、director に渡す `uniforms` にのみ使う |
| `useGameStage({ game, speed, selection })` | 新規 | **`finishedSeq` を `useState` で持ち、`holding = isHolding(view.outcome, finishedSeq)` を render 中に導出**する。`useHeldView(view, holding)` で表示用 view を得て、`usePitchFlight`・`useStage3d`・`useBattingControls`・`useStageDirector`・`useSkipInput`・`useCpuTurn`(`cpuPitchPending && !holding`)を合成し、`GameScreen` が使う値(表示用 view・`holding`・`throwing`・操作関数・スイングの操作(`swingKind`・`setSwingKind`・`swingNow`)・`StageView` 用の props)を返す。`swingRecordRef` を作り、`useBattingControls` の `onSwing` で `recordSwing(現在の記録, 現在の view.flight.seq, input)` を記録してから `game.swing(input)` を呼ぶ |

**hooks 間の循環の切り方**: (a) director ↔ `useHeldView`(`holding`・`uniforms`): `finishedSeq` と `holding` を `useGameStage` が持ち、director には `holding` と `onFinished` を渡す(director は `finishedSeq` を持たない)。(b) director ↔ `useBattingControls`(カーソル・`skip`): director は `getCursorView` を ref 経由の getter で受け取り(`useGameStage` が `useBattingControls` の戻り値を layout effect で ref に保存)、`useBattingControls` は `director.skip` を `onSkip` として受ける。

`usePointerInput` のポリシー(第1版からの差分は太字):

| 入力 | 動作 |
| --- | --- |
| **`holding` 中の pointerdown(マウス/ペンの主ボタン、タッチの主ポインタ)** | **`onSkip()` のみ。カーソル移動・スイング・ドラッグ開始には使わない** |
| マウス/ペンの pointermove | `pickZone` → `clampCursor` でカーソルをその位置へ(絶対位置) |
| マウス/ペンの primary pointerdown(`holding` でない) | その位置へ移動して即スイング(`swingReady` のときだけ成立) |
| **タッチの pointerdown(`holding` でない・人間打撃中)** | **カーソルは動かさず、開始点と開始時のカーソル位置を記録して `setPointerCapture`** |
| **タッチの pointermove(キャプチャ中)** | **`zoneDeltaFromScreenDelta(指の移動量, getZoneRect())` を開始時のカーソル位置に加えて `clampCursor`(スイングはしない)** |
| 「スイング」ボタン pointerdown / Space・Enter(`swingReady`)/ Z・X / 矢印・WASD | 第1版のとおり |
| **`holding` 中の Space/Enter** | **`useSkipInput` がスキップ**(`useKeyboardInput` は `swingReady` でないため何もしない) |

`touch-action: none` は人間打撃中の入力面だけに付ける(それ以外はページのスクロールを妨げない)。

**`useStageDirector` の責務**(React state は `telop`・`throwing`・`lastFlight`・`phase`・`playKind` のみ。session は ref。判断は `sequence/session.ts` の純関数を使う):

- **session**: `flight`(`view.flight` が非 `null` になるたび、`useLayoutEffect` で更新)、`plan`、`windupStartedAtMs`。`view.outcome` の `seq` が変わったら(`useLayoutEffect`)、`planPlay({ flight, outcome, swing: swingForOutcome(swingRecordRef.current, outcome.seq), resolvedAtMs: getElapsedMs() })` を作り、`swingRecordRef` を `null` に戻す。
- **毎フレーム**(`useAnimationFrame(cb, "stage")` 常時): `phaseOf` で `phase` を決め、`sceneFrameAt` の入力(`uniforms` は引数の表示用 view のもの)を組み立てて `stage?.apply(frame)`。`isPlayFinished(plan, t)` で `onFinished(plan.seq)`・plan を破棄。`telopAt`・`phase` が変わったときだけ `setTelop`・`setPhase`。**`stage` が `null` でも plan の進行は行う**(規約10)。関数は「入力の組み立て」「進行の判定」「反映」に小さく分ける。
- **windup**: CPU 守備は `cpuPitchPending && !holding` の立ち上がりで `performance.now()` を記録(`u = windupProgress(now, start, cpuWaitMs)`)。人間守備は `startThrow(onRelease)` を公開し、押下で `throwing = true`・windup 開始・`cpuWaitMs` 後に `onRelease()`(タイマーは unmount の cleanup で解除)。`throwing` は `view.flight` が出たら偽に戻す。
- **`skip()`**(規約13): `holding` のときだけ、現在の `view.outcome.seq`(最新の view を `useLatest` 経由で参照)で `onFinished` を呼び、plan・telop を破棄して `phase`/`playKind` を戻す。冪等。タイマーや rAF を止めず、次のフレームから `idle` の `SceneFrame` を描く。
- **公開**: `throwing`、`telop`、`phase`、`playKind`(演出中の `outcome.kind`)、`lastFlight`(E2E/手動確認の `data-*` ミラー用。最後に見た `flight` を保持)、`startThrow`、`skip`。

### UI 設計

**方針(N7・N16・N17、ユーザー指示)**: 3D の作り直しに加え、周辺 UI を「管理画面のようなパネル型(右パネル+カード並び)」から「ゲーム画面らしいオーバーレイ型」に作り直す。**ステージが画面全面、情報と操作はその上に重ねる**。デスクトップとスマホ縦で同じ構造にし、幅の違いはオーバーレイの寸法と操作バーの並びで吸収する。

**レイアウト**(ステージは `position: absolute; inset: 0`。ページは `position: fixed; inset: 0` でスクロールしない。高さは `100dvh`、非対応環境は `100vh`)

```
┌────────────────────────────────────────────────────────┐
│ ┌ ScoreHud ──────────┐                    [ホーム]      │  ← back-home(小さなピル、右上の最上段)
│ │ 3回表        ◇     │ ← inning-label + 走者ダイヤモンド │
│ │ ■ルミ   2          │ ← 色チップ+略称+得点(away)     │ ┌ NamePlates ────────┐
│ │ ■ノブ   1          │ ← (home)                         │ │ 投手 イブキ  球速   │
│ │ B●● S● O●  [回別▾] │ ← カウント+回別の details        │ │ 球数 12 ▮▮▮▯       │
│ └────────────────────┘                                  │ │ 打者 4番 ガイ       │
│                                                          │ └─────────────────────┘
│                                                                                    │
│                  ( 3D ステージ全面 : ゾーン枠・投手・打者 )                           │
│                          [ 結果テロップ(上から38%) ]                                 │
│                                                                                    │
│ ┌ Ticker : 実況1〜2行 ────────────────────────────────── [ログ▴] ┐                  │
│ ┌ action-bar ────────────────────────────────────────────────────┐                  │
│ │ 打撃: [ミート][強振]                                  ( SWING ) │                  │
│ │ 守備: [ストレート][スライダー][カーブ][フォーク]   (球種チップ)    │                  │
│ │       ┌5×5┐ グリッド                              [ 投げる ]     │                  │
│ └────────────────────────────────────────────────────────────────┘                  │
└────────────────────────────────────────────────────────┘
```

- **左上 `ScoreHud`**: 回表裏(「3回表」。延長のとき「延長」バッジ)、走者ダイヤモンド(小)、両チームの行(チーム色チップ+略称+得点)、B/S/O ランプ(横並び)、「回別」(`<details>` の見出し。開くと `LineScore`(R/H/E 付き)を HUD の下に出す)。
- **右上 `NamePlates`**: 投手(名前、球数、スタミナバー、球速表示)と打者(打順+名前)の2枚。放送画面風に斜めに切ったプレート。`back-home` のリンク(ページ右上の小さなピル)の下に置く。
- **下部**: `Ticker`(実況の最新1〜2行。右端の「ログ」で全ログのパネルが上へ開く)と、その下の**操作バー**(`bb-bar`、testid `action-bar`)。
- **操作バー(打撃時)**: 右下に大きな円形のスイングボタン(`SwingControls`。64px 以上)、その左にミート/強振の切替(各 44px 以上)。デスクトップではマウス/キーボードでの操作が主で、ボタンも使える。
- **操作バー(守備時)**: 1段目に球種の横並びチップ(`PitchKindButtons`。選択中が黄)、2段目に5×5の小型グリッド(`CourseGrid`。スマホ縦は各セル 44px =約228px 四方、デスクトップは 36px 程度)と「投げる」ボタン(`PitchingControls`。大きく)。スマホ縦では、グリッドを左、「投げる」を右(約138px 幅)に置く。
- **デスクトップ**(幅 641px 以上): HUD とネームプレートは大きめの文字、操作バーは下端中央〜右寄りに最大幅 720px。**スマホ縦**(幅 640px 以下): HUD は約150px 幅、ネームプレートは約170px 幅で左右に並べる。操作バーは全幅。ティッカーとバーの合計は、打撃時で約150px、守備時で約330px(これがゾーンを覆わないよう、`framingLift` でシーンを上へずらす。N11)。
- `ResultScreen` は `position: fixed` の全面オーバーレイで、背景の3D 試合画面を `backdrop-filter: blur()` でぼかす。WebGL 不可・context lost のときはステージ中央に `bb-stage__fallback`(`role="status"`)で「3D表示を使えません(WebGL が利用できない環境です)。操作と試合の進行は続けられます。」/「描画が中断されました。ページを再読み込みしてください。」を出す。
- タイトル画面: 全面の CSS 背景(空のグラデーション、観客席のシルエット帯、縞の芝)の中央に、ロゴ「ブラウザ野球」と選択肢のボタン群、大きな「試合開始」ボタン。

**コンポーネント構成**

```
BaseballGamePage (E)     .bb-page(全面)。視覚的に隠した h1「ブラウザ野球」、back-home のピル、TitleScreen または GameScreen
├── TitleScreen (B4b)
└── GameScreen (E)       useGame・useGameStage、投球の選択状態
    ├── GameLayout (A2 暫定 → E)   .bb-game(+ --batting / --pitching / --cpu)
    │   ├── StageView (E)           全面ステージ(canvas・入力面・テロップ・ヒント・フォールバック・data-* ミラー)
    │   └── .bb-overlay             pointer-events: none
    │       ├── .bb-overlay__top    ScoreHud (B4a) / NamePlates (B4a)
    │       └── .bb-overlay__bottom Ticker (B4a) / .bb-bar [action-bar]: SwingControls | PitchingControls + CourseGrid (B4b)
    └── ResultScreen (B4b)
```

**コンポーネント(新規・変更)**

| コンポーネント | ステップ | props / 内容 |
| --- | --- | --- |
| `StageView` | E | `containerRef`、`status`、`telop`、`pointerHandlers`、`inputActive`(人間打撃中)、`skipHint`(`holding` 中に真)、`phase`、`playKind`、`lastFlight`、`zoneRect`、`marker`(`FieldMarkerView` または `null`)。`bb-stage` ルートに `data-testid="stage-3d"` と `data-*` ミラー、`bb-stage__canvas`(容器)、`bb-stage__input`(canvas 上の入力面。ハンドラは常時つなぐ)、`StageTelop`、スキップのヒント(`bb-stage__skip-hint`、`aria-hidden`、「タップ / Space でスキップ」)、フォールバック表示、非表示の `batted-ball-marker` を描く。HUD などのオーバーレイは子にしない |
| `ScoreHud` | B4a | `scoreboard: ScoreboardView`(行に `shortName`)、`teamColors`、`inningLabel`、`isExtra`、`balls`、`strikes`、`outs`、`bases`。ルートが `data-testid="scoreboard"`。内部に `inning-label`、`BaseDiamond`(`bases`)、`CountLamps`(`count-*`)、両チームの行(`data-side`、色チップ、略称(`aria-label` に正式名)、得点の `score-away`/`score-home`)、`<details className="bb-hud__more">`(見出し `line-score-toggle`、中に `LineScore`(`line-score`))。hooks を呼ばない |
| `NamePlates` | B4a | `batter`(`GameView.batter`)、`pitcher`(`GameView.pitcher`)、`pitchSpeedLabel`。ルートが `data-testid="name-plates"`。`batter-name`(「4番 ガイ」)、`pitcher-name`、`pitch-count`(数値)、`pitcher-stamina`(「66%」。バー付き)、`pitch-speed` を描く |
| `Ticker` | B4a | `lastEvent`、`log`。ルートが `data-testid="ticker"`。`last-event`(`aria-live="polite"`、最大2行)と、`<details>`(見出し `log-toggle`、中に `commentary-log`(新しい順))。旧 `CommentaryLog` の置き換え |
| `StageTelop` | B4a | `text`(文字列または `null`)。`data-testid="stage-telop"`、`aria-hidden="true"`。表示/非表示は CSS クラス(`--show`)とトランジション |
| `TitleScreen` | B4b | props 不変(`defaultInnings`・`onStart(config)`)。**非制御フォーム**(`useState` なし)で、イニング数・先攻/後攻・難易度は `fieldset` の中の `input[type=radio]`(ボタンに見せる)。`FormData` から `onStart` に変換する |
| `ResultScreen` | B4b | props 不変。ぼかし背景、大きなスコア(略称+色チップは `result` に無いため、`awayRuns`/`homeRuns` と勝敗の文言・色のみ)、「もう一度」(主)・「タイトルへ」(従) |
| `SwingControls`・`PitchingControls`・`PitchKindButtons`・`CourseGrid` | B4b | props・testid 不変。操作バー向けのマークアップ・クラスに作り直す(`CourseGrid` は通常フローの5×5) |
| `LineScore`・`CountLamps`・`BaseDiamond` | B4b | props 不変。HUD 向けのマークアップ・クラス。`LineScore` の合計セルの testid を `score-<side>` から `line-score-runs-<side>` に改名(`score-<side>` は `ScoreHud` が持つ) |
| `GameLayout` | A2(暫定)→ E(最終形) | 最終形: 表示用 `view`、`pitchReady`、`swingReady`、`throwing`、`selection`、スイング操作(`swingKind`・`onSelectSwingKind`・`onSwing`)、`stageProps`、各コールバック。上記構成の配線のみ。暫定版(A2): 現行の props 型のまま、`Scoreboard`・`MatchupPanel`・(人間守備のとき)`PitchingControls`→`CourseGrid`・`CommentaryLog` だけを縦に並べる(ステージなし。試合は進行しない) |
| `GameScreen` | E | `useGame`・`useGameStage` の結線、投球の選択状態 `{ kind, cell }`(第1版どおり)、`ResultScreen`(`view.result !== null && !holding`) |
| `BaseballGamePage` | A2(css import 削除のみ)→ E | `baseball.css`・`baseball-stage.css` を import。視覚的に隠した `h1`、`back-home` のピル、`GameScreen` を `React.lazy`(`.then((m) => ({ default: m.GameScreen }))`)+ `Suspense`(fallback は「読み込み中…」) |

各コンポーネントは60行以内。60行を超える場合は担当ステップ内で `ui/` に分割ファイルを追加してよい(追加したファイル名は完了報告に記す)。`ScoreHud`・`NamePlates`・`Ticker`・`StageTelop`・`TitleScreen`・`ResultScreen` など props のみで描くコンポーネントは hooks を呼ばない。

**クラス名の契約**(B4a・B4b の CSS と E の TSX が並列でも食い違わないよう、ここで固定する。「定義」はそのクラスの CSS を書くファイル)

| クラス | 役割 | 定義 |
| --- | --- | --- |
| `bb-page` | ページ全面(`position: fixed; inset: 0; overflow: hidden`) | baseball-stage.css |
| `bb-home-link` | `back-home` のピル(右上の最上段。`pointer-events: auto`) | baseball-stage.css |
| `bb-game` / `bb-game--batting` / `--pitching` / `--cpu` | 試合画面のルート(全面)/ 操作バーの種類 | baseball-stage.css |
| `bb-stage` | ステージのルート(`position: absolute; inset: 0`) | baseball-stage.css |
| `bb-stage__canvas` | canvas の容器(`position: absolute; inset: 0`。内側の canvas は 100%) | baseball-stage.css |
| `bb-stage__input` / `bb-stage__input--active` | canvas 上の入力面(`inset: 0`、オーバーレイより下)/ 人間打撃中(`touch-action: none`) | baseball-stage.css |
| `bb-stage__skip-hint` | スキップのヒント(ステージ中央の下寄り(上から約62%)、小さく低コントラスト、**`pointer-events: none`**、`holding` 中だけ表示) | baseball-stage.css |
| `bb-stage__fallback` | WebGL 不可の表示(**`pointer-events: none`**) | baseball-stage.css |
| `bb-stage__telop` / `bb-stage__telop--show` | `StageTelop`(上から約38%、**`pointer-events: none`**) | baseball-stage.css |
| `bb-overlay` / `bb-overlay__top` / `bb-overlay__bottom` | オーバーレイ層(`position: absolute; inset: 0`、**`pointer-events: none`**、グリッドで上・中央(空き)・下に分ける、`env(safe-area-inset-*)` の余白)/ 上段(HUD 左・ネームプレート右)/ 下段(ティッカー+操作バー) | baseball-stage.css |
| `bb-hud` / `bb-hud__inning` / `bb-hud__extra` / `bb-hud__team` / `bb-hud__chip` / `bb-hud__abbr` / `bb-hud__score` / `bb-hud__more`(`pointer-events: auto`) / `bb-hud__more-summary` / `bb-hud__linescore` | `ScoreHud` の内部(ルートは **`pointer-events: none`**) | baseball-stage.css(`LineScore`・`CountLamps`・`BaseDiamond` の既存クラスを `.bb-hud` 配下で小さく上書き) |
| `bb-plates` / `bb-plate` / `bb-plate--batter` / `bb-plate--pitcher` / `bb-plate__name` / `bb-plate__meta` | `NamePlates` の内部(**`pointer-events: none`**。既存の `bb-stamina` を再利用) | baseball-stage.css |
| `bb-ticker` / `bb-ticker__line` / `bb-ticker__more`(`pointer-events: auto`) / `bb-ticker__summary` / `bb-ticker__log` | `Ticker` の内部(ルートは **`pointer-events: none`**) | baseball-stage.css |
| `bb-bar` / `bb-bar--swing` / `bb-bar--pitch` / `bb-bar__row` | 操作バー(**`pointer-events: auto`**。背景部分のタップはステージに届かない) | baseball-stage.css |
| `bb-swing*` / `bb-pitching*` / `bb-pitch-kinds` / `bb-pitch-kind` / `bb-course-grid` / `bb-course-cell` ほか既存の操作部品のクラス | `SwingControls`・`PitchingControls`・`PitchKindButtons`・`CourseGrid` の内部 | baseball.css |
| `bb-logo` / `bb-title-screen`(CSS の球場背景)/ `bb-title__panel` / `bb-choice`(`fieldset`)/ `bb-choice__legend` / `bb-choice__option`(`label`)/ `bb-choice__input`(視覚的に隠した radio)/ `bb-start` | `TitleScreen` の内部 | baseball.css |
| `bb-result` / `bb-result__panel` / `bb-result__headline` / `bb-result__score` / `bb-result__team` / `bb-result__actions` ほか | `ResultScreen` の内部 | baseball.css |

**テーマとトーン(`baseball.css`、モック基調。N17)**: `--bb-bg: #0d1722`、`--bb-panel: rgba(8, 20, 34, 0.78)`(オーバーレイのパネル。モックの `.hud`)、`--bb-panel-solid: #15283a`(開いたパネル)、`--bb-border: #2d4a63`、`--bb-text: #f1f5f9`、`--bb-muted: #a3b8ca`、`--bb-accent: #ffd23f`、`--bb-ink: #20140a`(縁取り・落ち影の色)、`--bb-out: #e8473c`、`--bb-ball-lamp: #3fcf6b`、`--bb-strike: #ffd23f`、`--bb-font`(丸ゴシック系のシステムフォントのスタック)。`color-scheme: dark`。ページ背景は `body:has(.bb-page)` に付け、ホーム(`/`)へ漏らさない。
- 文字: 太め(800)、白文字+`--bb-ink` の縁取り(`text-shadow` を4方向+下に重ねる)。数字は `font-variant-numeric: tabular-nums`。
- パネル: 半透明の濃紺、小さい角丸(4〜6px)、**斜めに切った形(`clip-path`)とチーム色/黄の縁**。全部を同じ大きな角丸のカードにしない。
- ボタン: 濃い縁取り(3px、`--bb-ink`)+ハードな落ち影(`0 4px 0 var(--bb-ink)`)、押すと2px 沈む。主ボタンは黄の面+暗い文字、選択中は黄の縁取りと文字、`disabled` は彩度を落とし影を消す。タップ目標は 44px 以上(スイングボタンは 64px 以上)。
- 避ける: グラデーションのヒーロー、角丸カードの並び、ガラス風パネルの多用、既定のフォーム見た目、外部フォント。
- タイトルの背景(N16): 空のグラデーション(モックの `#3a7bd5 → #8cc5f2 → #f3e7c9`)、観客席のシルエット帯、`repeating-linear-gradient` の縞の芝。画像は使わない。
- `prefers-reduced-motion` ではテロップのトランジション・ボタンの沈みを止める。

**testid 対応表の更新**(第1版の表のうち変更分。ここに無いものは第1版のまま。1 testid は 1 コンポーネントにだけ属する)

| testid | 扱い |
| --- | --- |
| `field-diagram` | 廃止(E2E の待機は `stage-3d` に差し替え) |
| `batted-ball-marker` | **維持**(`StageView` の非表示 DOM ミラー。`view.fieldMarker` から `data-result`/`data-seq`/`data-over-fence`/`data-distance`/`data-lateral` を同じ形式で) |
| `batting-view`・`zone-svg`・`swing-cursor`・`ball` | 廃止。代わりに `stage-3d` の `data-*`(下記) |
| `stage-3d`(新規、`StageView`) | `data-status`(`loading`/`ready`/`unsupported`/`lost`)、`data-phase`(`idle`/`windup`/`flight`/`play`)、`data-play-kind`(演出中の `outcome.kind`)、`data-flight-seq`・`data-landing-x`・`data-landing-y`(ゾーン座標、小数3桁)・`data-duration-ms`(**最後に見た flight を保持**。E2E が飛行の短い区間を取り逃さないため)、`data-zone-rect`(`left,top,width,height`、キャンバス左上基準。リサイズ時の `zoneScreenRect()`) |
| `stage-telop`(新規、`StageTelop`) | テロップの要素 |
| `scoreboard`・`inning-label`・`score-away`/`score-home`・`count-balls`/`count-strikes`/`count-outs`・`bases` | **維持。持ち主を `ScoreHud` 系に移す**(`scoreboard`・`inning-label`・`score-*` は `ScoreHud`、`count-*` は `CountLamps`、`bases` は `BaseDiamond`)。旧 `Scoreboard`・`LineScore` からは外す |
| `line-score`(`LineScore`) | 維持(`ScoreHud` の「回別」の `details` の中) |
| `line-score-runs-away`/`line-score-runs-home`(新規、`LineScore`) | `LineScore` の合計セル(旧 `score-<side>` の改名) |
| `line-score-toggle`(新規、`ScoreHud`) | 「回別」の `details` の見出し |
| `name-plates`(新規、`NamePlates`) | ネームプレートのルート |
| `batter-name`・`pitcher-name`・`pitch-count`・`pitcher-stamina`・`pitch-speed` | 維持。持ち主を `NamePlates` に移す(旧 `MatchupPanel`) |
| `ticker`(新規、`Ticker`)、`log-toggle`(新規、`Ticker`) | ティッカーのルート、全ログの `details` の見出し |
| `last-event`・`commentary-log` | 維持。持ち主を `Ticker` に移す(旧 `CommentaryLog`) |
| `action-bar`(新規、`GameLayout`) | 操作バーのルート(`bb-bar`) |
| `pitch-controls` の `data-ready` | `view.pitchReady && !holding && !throwing` と一致 |
| `baseball-title`・`start-game` | 維持(`TitleScreen`) |
| `setting-innings`・`setting-side`・`setting-difficulty` | 維持。要素が `select` から **`fieldset`**(ボタン群のコンテナ)に変わる |
| `setting-innings-1`/`-3`/`-5`/`-9`、`setting-side-away`/`-home`、`setting-difficulty-easy`/`-normal`/`-hard`(新規、`TitleScreen`) | 選択肢の `label`(ボタンに見える要素)。選択状態は中の `input[type=radio]` の `checked` |
| その他(`swing-button`・`swing-kind-*`・`throw-pitch`・`pitch-kind-*`・`course-cell-*`・`result-screen`・`result-text`・`final-score-*`・`restart-game`・`back-to-title`・`back-home` ほか) | 維持 |

### 静的解析・規約への対応

[[sample-app-lint-random-and-index-access]]・[[eslint-strictness-ratchet-v2]] に従う(第1版の規約をそのまま適用)。three 固有の要点:

- 変数添字禁止: `Map`・`.find`・`.at`・`for...of`・明示フィールド代入で書く。`DataTexture` のピクセルは `Uint8Array.from(...)` ヘルパー、キーフレームは `.find`/`for...of` で探す。
- `Math.random` 禁止(乱数は `createRng`)。`world/` では三角関数・`hypot` を使ってよい(N3)。インライン `eslint-disable` 禁止。
- 関数は60行・複雑度20・cognitive 15・`max-params` 6 以内。ネスト三項禁止。ES2022(`toSorted`/`with` 不可)。
- three のオブジェクトは `getObjectByName` で探さずビルダーの参照を保持する。`exactOptionalPropertyTypes` のため three のオプションに `undefined` を渡さない。
- ステップ0で three 風スニペットを `npx eslint --stdin` に流して実測し、`no-param-reassign` 相当(引数オブジェクトのプロパティ代入 `mesh.position.y = …`)・`Map`・`.set()` が通ることを確認する。error になる書き方があれば規約表を更新して報告する。

## 実装ステップ

実装順のチェックリスト。**同じファイルを複数ステップで触らない**(例外は、A2 で暫定にして E で最終形にする `GameLayout`・`BaseballGamePage` と、ステップ G)。「並列」欄のステップ同士は同時に dispatch できる(ファイル所有が重ならず、依存も無い)。実装者は担当ファイル以外を編集しない。`types/` はステップ A で凍結し、型の変更が必要になったら編集せず報告する。

| ウェーブ | ステップ | 並列 |
| --- | --- | --- |
| 1 | 0 | — |
| 2 | A | — |
| 3 | A2, B1, B2, B3, B4a, B4b | 並列可(6ステップ。A2 は `ui/` の撤去と暫定版のみ、B4a は新規ファイルと `baseball-stage.css`、B4b は既存部品と `baseball.css` で、互いに重ならない) |
| 4 | C1, C2, C3 | 並列可(3ステップ。C1 は B1・B2、C2 は B3、C3 は A・A2・B1・B2 の完了後) |
| 5 | D | — |
| 6 | E | — |
| 7 | F, G | 並列可 |

**全ウェーブで lint・typecheck・build を緑に保つ**(A2 で旧 ui を撤去するため。B4b は既存部品の props を変えないので A2 の暫定 `GameLayout` が壊れない)。ただしステップ A2 から E までは試合が進行しない中間状態で、`baseball.spec.ts` は失敗する(F で更新する)。この間のコミットは出荷しない。

共通の完了条件(各ステップ): 担当ファイルが `cd sample-app && npx eslint <担当パス>` で0件。テストがあるステップは `cd sample-app/frontend && npx vitest run <担当パス>` が成功。`cd sample-app && npm run typecheck --workspace frontend` が成功(並列中は他タスクの未完成ファイル起因のエラーを無視し、完了報告に記す)。コミット・共有メモリへの書き込みは並列 dispatch 中は行わない(orchestrator が集約)。

- [x] **ステップ0: three の導入と試し打ち**(直列・前提)
  - 依存: なし。担当ファイル: `sample-app/frontend/package.json`、`sample-app/package-lock.json`、(必要な場合のみ)`sample-app/frontend/vite.config.ts`。使い捨てのプローブは scratchpad に置き、リポジトリにはコミットしない。
  - やること:
    1. `npm view three version time` と `npm view @types/three versions` で three の最新版と公開日、同一リビジョンの `@types/three` を確定する。**想定: three 0.186.1(2026-09-24 公開、2週間以上経過)、`@types/three` 0.186.x。** 想定と異なる場合(その版が無い、公開から2週間未満、`@types/three` の同リビジョンが無い 等)は先に進まず報告する。
    2. `cd sample-app && npm install --workspace frontend three` と `npm install --workspace frontend --save-dev @types/three@<同一リビジョン>`。`npm install` が範囲指定を書き換える前例(vitest)があるため `frontend/package.json` を目視し、0.x 系の範囲(`^0.186.x`)であることを確認する。
    3. 次の確認項目を実測し、結果を表にして報告する(orchestrator が本書末尾「ステップ0 試し打ち結果」に転記する):
       - (1) `npm ci --dry-run` が成功し、`package-lock.json` の差分が three と `@types/three`(とその依存)に限られる。
       - (2) vitest(node)で `three` を名前付き import し、`Group`・`Mesh`・`DataTexture`(`RedFormat`)・`MeshToonMaterial`(`gradientMap`、`color.setHex`)を生成して `dispose` できる。`ColorManagement`・`WebGLRenderer#outputColorSpace`・`RedFormat`・`LinearSRGBColorSpace`・`PerspectiveCamera#setViewOffset` が `@types/three` に実在し、`npm run typecheck` が通る。
       - (3) Playwright headless Chromium(クラウドでは [[playwright-browser-revision-mismatch]] の回避構成を含む)で、素のページに canvas を作って `getContext("webgl2")`(**WebGL1 は使わない。three r163 以降は WebGL2 専用**)を取り、そのコンテキストを `new WebGLRenderer({ canvas, context })` に渡して1フレーム描画できるか(コンテキストが非 `null`、描画後に `gl.getError() === 0`、`readPixels` で背景以外の画素がある)。作れない場合は `launchOptions.args`(`--use-angle=swiftshader`・`--enable-unsafe-swiftshader`・`--ignore-gpu-blocklist` 等)を試し、**必要な最小の引数**を報告する(適用はステップ F)。
       - (4) 名前付き import のみで toon キャラ+球場相当のスニペットを `vite build` したときのチャンクサイズ(minify/gzip)。あわせて、現状の `index` チャンクのサイズを記録する(`React.lazy` 後に増えていないことの基準)。500KB 超の警告は許容。
       - (5) `npx eslint --stdin --stdin-filename frontend/src/features/baseball/render/probe.ts` に three 風スニペット(引数オブジェクトのプロパティ代入、`mesh.position.set(...)`、`Map<string, Object3D>`、`for...of`、`Uint8Array.from(...)`、60行制限、`max-params`)を流した結果。
       - (6) `vite` dev で `GameScreen` を `React.lazy` した最小構成を開き、初回ロードで「optimized dependencies changed. reloading」が出るか。出る場合は `vite.config.ts` に `optimizeDeps.include: ["three"]` を追加する。
    4. 想定外の結果(版・公開日の不一致、lockfile 差分の肥大、フラグを付けても WebGL2 を作れない、vitest で three を import できない、eslint 規約が本書の規約と矛盾 等)が出たら、先のステップに進まずその場で orchestrator に報告する(設計の見直しが必要になる)。
  - 完了条件: ルートで `npm run typecheck`・`npm run lint`・`npm run build`・`npm run test` が成功。`npm ci --dry-run` が成功。(1)〜(6) の実測表を報告。

- [x] **ステップ A: 契約(`types/`、`outcome`、チーム色・略称)**(直列)
  - 依存: ステップ0。担当ファイル: `features/baseball/types/{scene,stage}.ts`(新規)、`types/team.ts`、`types/view.ts`、`model/data/teams.ts`、`model/data/teams.test.ts`、`model/game/view.ts`、`model/game/view.test.ts`、`model/game/test-fixtures.ts`
  - やること: 本書「型契約」のとおり型を定義する(実行時コードなし)。`StageGeometry`(`zone`・`ballRadius` を含む)のフィールド名はモックの寸法に沿ってここで定義する。`Team.uniformColor`・`Team.shortName` を加算し、`data/teams.ts` にルミナス=`0x2f63c8`(青)・「ルミ」、ノーブルズ=`0xe8473c`(赤)・「ノブ」を設定、`test-fixtures.ts` の `makeTeam` に固定の色と略称を足す(2チームで別の値)。`outcomeOf(state)` と `colorsOf(state)` を `model/game/view.ts` に追加し、`toGameView` の戻り値に `outcome`・`teamColors`・`uniforms` を加え、`scoreRow` に `shortName` を加える(**`phase` が `in-flight` のときの `outcome.seq` は `pitchSeq − 1`**)。`view.test.ts`・`teams.test.ts` に追記する(テスト戦略の該当項)。
  - 完了条件: `npm run typecheck --workspace frontend` 成功、lint 0件、**既存749件のアサーションが無改変で成功**(`view.test.ts`・`teams.test.ts` は追記のみ)。`types/` が他セグメントを import していない(`scene.ts`/`stage.ts` は `types/` 内と DOM 型のみ)。`balance.test.ts` の結果が変わらない(色・略称は判定に影響しない)。

- [ ] **ステップ A2: 旧 ui の撤去と暫定レイアウト**(並列: B1, B2, B3, B4a, B4b)
  - 依存: なし(C3 の開始前に完了)。担当ファイル: `ui/BattingView.tsx`・`ui/StrikeZoneSvg.tsx`・`ui/FieldDiagram.tsx`・`ui/baseball-field.css`(削除)、`ui/GameLayout.tsx`(暫定版)、`ui/BaseballGamePage.tsx`(`baseball-field.css` の import 削除のみ)
  - やること: 旧 ui の4ファイルを削除する。`GameLayout` を暫定版に書き換える: props 型は現行のまま(`GameScreen` を変更しないため)、`Scoreboard`・`MatchupPanel`・(人間守備のとき)`PitchingControls`→`CourseGrid`・`CommentaryLog` だけを縦に並べる(ステージ・`SwingControls`・`FieldDiagram` は描かない)。使わない props は分割代入しない(未使用変数の lint を避ける)。`BaseballGamePage` から `baseball-field.css` の import を消す(`baseball-stage.css` の import は E)。**`GameLayout`・`BaseballGamePage` を A2 と E で2回触るのは意図的**(C3 以降の全ウェーブで lint/typecheck/build を緑に保つため。A2〜E の間は試合が進行しない)。`Scoreboard`・`MatchupPanel`・`CommentaryLog` は暫定版が使うので、ここでは削除しない(E で削除する)。
  - 完了条件: lint・typecheck・`npm run build`・`npm run test` がすべて成功(削除したファイルへの参照が無い)。

- [ ] **ステップ B1: `model/world` の空間・軌道・カメラ**(並列: A2, B2, B3, B4a, B4b)
  - 依存: A。担当ファイル: `model/world/space/{params,vec3,coords,geometry,crowd}.ts`、`model/world/path/{pitch-path,batted-path,fielders}.ts`、`model/world/camera/rig.ts` と、`params` を除く各 `.test.ts`
  - やること: 本書「world 設計」のとおり実装する。値は `WORLD_PARAMS` に外出しし、`buildStageGeometry()` が `zone`・`ballRadius` を同じ値から入れる。フェンス半径・塁間は `LANDING_PARAMS` から導出し、`sin/cos` を使ってよいが `Math.random`/`Date`/`performance` は使わない。ファイルが多いため、orchestrator は B1 を B1a(`space/`・`camera/`)→ B1b(`path/`)に分けてよい(ファイルは重ならない)。
  - 完了条件: 担当の `vitest run` 成功(テスト戦略の合格基準)。`world/` が `game/`・`cpu/`・`data/` を import していない。`from "three"`・`react`・`document`・`window` が無い。

- [ ] **ステップ B2: `model/world` のモーション**(並列: A2, B1, B3, B4a, B4b)
  - 依存: A。担当ファイル: `model/world/motion/{rig,pose,pitcher,batter,fielder,fk}.ts` と各 `.test.ts`(`rig` を除く)
  - やること: キーフレーム表(関数外のデータ定数)と補間でポーズ関数を作る。`motion` は `types/` だけに依存する。投手の release ポーズから `fk.ts` で求めた手先位置が `RELEASE_POINT`(−0.30, 1.65, −18.1)と 0.15m 以内になるよう合わせる(`RELEASE_POINT` は B1 の `params.ts` の値。**B2 は同値をテスト内の定数で持ち、B1 完了後の統合確認はステップ G で行う**)。
  - 完了条件: 担当の `vitest run` 成功(ポーズの連続性・範囲・境界の一致)。

- [ ] **ステップ B3: `render/` のビルダー**(並列: A2, B1, B2, B4a, B4b)
  - 依存: A、0。担当ファイル: `render/{look,stadium,character,pose-apply,markers,dispose}.ts` と `look|stadium|character|pose-apply|markers|dispose` の smoke テスト
  - やること: 本書「render 設計」のとおり実装する(`character.ts` に `createTeamMaterials`・`applyUniforms` を含む。`markers.ts` はゾーン・ボールの寸法を `StageGeometry` から読む。`look.ts` は `fovFor`・`MIN_HALF_WIDTH_TAN`・`framingLift`・`PORTRAIT_LIFT`・`LIFT_FULL_ASPECT`・`LIFT_ZERO_ASPECT` を export する)。`render/` は `types/` と `three` のみを import する。テストは node で three を import して生成・適用・破棄を確認する(テスト内のリグ寸法・色・`StageGeometry` はフィクスチャで持ち、`model` を import しない)。
  - 完了条件: 担当の `vitest run` 成功。`import * as THREE` が無い。`document`・`window`・`CanvasTexture` が無い(`stage.ts` はステップ C2)。`render/` にチーム名・`Team` が現れない。

- [ ] **ステップ B4a: オーバーレイの新規部品と配置の CSS**(並列: A2, B1, B2, B3, B4b)
  - 依存: なし(本書の「UI 設計」のクラス名の契約と testid 表に従う)。担当ファイル: `ui/ScoreHud.tsx`・`ui/NamePlates.tsx`・`ui/Ticker.tsx`・`ui/StageTelop.tsx`(新規)、`ui/baseball-stage.css`(新規)
  - やること: `ScoreHud`(`scoreboard`・`inning-label`・`score-away`/`score-home`・`count-*`・`bases`・回別の `<details>`)・`NamePlates`(`batter-name`・`pitcher-name`・`pitch-count`・`pitcher-stamina`・`pitch-speed`)・`Ticker`(`last-event`・`commentary-log`・ログの `<details>`)・`StageTelop` を props のみで作る(hooks を呼ばない)。既存の `LineScore`・`CountLamps`・`BaseDiamond` を子として使う(それらの restyle は B4b)。`baseball-stage.css` に、契約の表で「baseball-stage.css」と書かれた全クラス(ページ全面、ホームのピル、ステージ全面、オーバーレイ層、HUD、ネームプレート、ティッカー、操作バー、スキップのヒント、フォールバック、テロップ)を定義する。デスクトップ/スマホ縦(幅 640px 以下)、`env(safe-area-inset-*)`、`100dvh` のフォールバック(`100vh`)、`pointer-events` の指定(契約のとおり)、`prefers-reduced-motion`、`body:has(.bb-page)` のページ背景を含める。トーンは「テーマとトーン」(N17)に従う。外部フォントは使わない。
  - 完了条件: lint・typecheck 通過。各コンポーネントが hooks を呼ばない。各コンポーネント60行以内。`ScoreHud` に旧 `Scoreboard`・`LineScore` と重複する testid が無い(`score-away`/`score-home` は `ScoreHud` のみ)。`bb-stage__telop`・`bb-stage__fallback`・`bb-stage__skip-hint`・`bb-hud`(ルート)・`bb-plates`・`bb-ticker`(ルート)・`bb-overlay` が `pointer-events: none`、`bb-bar`・`bb-hud__more`・`bb-ticker__more`・`bb-home-link` が `pointer-events: auto`。

- [ ] **ステップ B4b: 既存部品の作り直し・タイトル・結果・テーマ**(並列: A2, B1, B2, B3, B4a)
  - 依存: なし(同上)。担当ファイル: `ui/TitleScreen.tsx`・`ui/ResultScreen.tsx`・`ui/SwingControls.tsx`・`ui/PitchingControls.tsx`・`ui/PitchKindButtons.tsx`・`ui/CourseGrid.tsx`・`ui/LineScore.tsx`・`ui/CountLamps.tsx`・`ui/BaseDiamond.tsx`、`ui/baseball.css`
  - やること: **props を変えずに**マークアップとクラスを作り直す(A2 の暫定 `GameLayout` が壊れないため)。`TitleScreen` は `select` をやめ、`fieldset`+`input[type=radio]`(ボタンに見せる)の非制御フォームにして、`setting-innings`/`-side`/`-difficulty`(`fieldset`)と選択肢の `label`(`setting-innings-<n>` ほか)の testid を付け、`defaultInnings`/先攻/普通を初期選択にし、ロゴ「ブラウザ野球」と CSS の球場背景を描く。`ResultScreen` はぼかし背景・大きなスコア・勝敗の色分け・主従のボタン。`SwingControls`(大きな円形のスイングボタン、ミート/強振の切替)・`PitchingControls`・`PitchKindButtons`(横並びのチップ)・`CourseGrid`(通常フローの5×5。スマホ縦は行の高さ 44px 固定、デスクトップはセル 36px 程度)は操作バー向けに作り直す。`LineScore` の合計セルの testid を `line-score-runs-<side>` に改名する。`baseball.css` はダークテーマ変数(N17)と、これらの部品のスタイル、`--bb-font`、ボタンの共通スタイルを定義し、FieldDiagram・StrikeZone の規則を削除する。トーンは N17 に従う(斜めに切ったパネル、濃い縁取り+ハードな落ち影、黄のアクセント。グラデーションのヒーロー・全部が同じ角丸のカードを避ける)。外部フォントは使わない。
  - 完了条件: lint・typecheck 通過(**props 不変なので A2 の暫定 `GameLayout` もコンパイルできる**)。`TitleScreen` が `select` と `useState` を使っていない。各コンポーネント60行以内(超える場合は分割ファイルを追加し、完了報告に記す)。操作部品のボタン・セルが 44px 以上(`swing-button` は 64px 以上。デスクトップのグリッドのセルを除く)。

- [ ] **ステップ C1: `model/world` の合成・入力の振り分け・演出進行の判断**(並列: C2, C3)
  - 依存: B1, B2。担当ファイル: `model/world/sequence/{play-plan,frame,telop,input-route,session}.ts` と各 `.test.ts`
  - やること: `planPlay`(`swingProgressAt` を含む)・`sceneFrameAt`(`uniforms` を写す)・`telopFor`・`telopAt` を「時間軸・ゲートの規約」と演出時間表のとおり実装する。`sceneFrameAt` はアクターごとの小関数に分ける。`input-route.ts` に `routeStagePointer`・`isSkipKey` を規約13の判定表どおり、`session.ts` に `isHolding`・`phaseOf`・`isPlayFinished`・`windupProgress`・`recordSwing`・`swingForOutcome` を実装し、全組み合わせをテストする。
  - 完了条件: 担当の `vitest run` 成功(時刻表の単調性・決定性・テロップ文言・振り分けの全組み合わせ・session の真理値表)。

- [ ] **ステップ C2: `render/stage.ts`**(並列: C1, C3)
  - 依存: B3(契約は A)。担当ファイル: `render/stage.ts`
  - やること: `createStage(options): StageHandle | null` を実装する。canvas と **WebGL2 コンテキストだけ**の自前生成(`getContext("webgl2")` が取れなければ three を呼ばず `null`。WebGL1 にはフォールバックしない)、`WebGLRenderer({ canvas, context })` の生成を **try/catch で囲み、失敗時は canvas を外して `null`**、context lost/restored、`ResizeObserver`、`quality`、`pickPlane`、`zoneScreenRect`(常に `options.battingCamera`。`fovFor` と `framingLift` を適用)、`apply` での `framingLift`(`setViewOffset`/`clearViewOffset`)とユニフォーム色の更新(前回から変わったときだけ `applyUniforms`)。**`dispose()` は「render 設計」の手順どおり**(先頭で `disposed` フラグ → context リスナ解除 → `ResizeObserver.disconnect()` → geometry/material/texture 破棄 → `renderer.dispose()` → `forceContextLoss()` → canvas remove。以後 `onStatusChange`/`onResize` を呼ばない。冪等)。単体テストは書かない(E2E と手動で担保)。
  - 完了条件: lint・typecheck 通過。`document`・`window`・`ResizeObserver`・`WebGLRenderer`・`getContext` を使うのがこのファイルだけ。`getContext("webgl")`(WebGL1)を使っていない。`new WebGLRenderer` が try/catch の中にあり、例外時に canvas を外して `null` を返す。`dispose` の先頭が `disposed = true` で、リスナ解除と `disconnect()` が `forceContextLoss()` より前にあり、`disposed` の後に `onStatusChange`/`onResize` の呼び出しが無い(コードレビューで確認)。ゾーン・ボールの寸法の直書きが無い。

- [ ] **ステップ C3: hooks の部品**(並列: C1, C2)
  - 依存: A、A2、B1、B2(`createStage` のシグネチャは本書が契約。typecheck は C2 完了後に最終確認。`routeStagePointer`・`isSkipKey` のシグネチャは本書が契約で、C1 完了後に最終確認)。担当ファイル: `hooks/{useStage3d,usePitchFlight,usePointerInput,useBattingControls,useSkipInput}.ts`
  - やること: 本書「hooks 設計」のとおり実装・変更する(pointerdown は `routeStagePointer` の結果で分岐、`useSkipInput` はキーのスキップ)。`useStage3d` の生成 effect の deps は `quality` のみ。全ての effect に cleanup を付け、ref ガードで StrictMode を回避しない。
  - 完了条件: lint・typecheck 通過(**旧 ui を A2 で撤去済みのため、プロジェクト全体の typecheck も成功する**)。`hooks/` から `three` を import していない。`Math.random`・`Date` が無い。`usePointerInput` が `holding` を直接分岐せず `routeStagePointer` を経由している。`useStage3d` の生成 effect の deps に `uniforms` 等の半イニングで変わる値が入っていない。

- [ ] **ステップ D: hooks の統合**(直列)
  - 依存: C1, C3(typecheck は C2 も必要)。担当ファイル: `hooks/{useStageDirector,useHeldView,useGameStage}.ts`
  - やること: 「時間軸・ゲートの規約」のとおり `useStageDirector`(session・毎フレームの `sceneFrameAt` → `apply`・`telop`/`throwing`/`phase`/`playKind`/`lastFlight`・windup・`skip()`)、`useHeldView`、合成の `useGameStage` を実装する。`finishedSeq` と `holding`(`isHolding`)は `useGameStage` が持ち、director には `holding`・`onFinished` を渡す。`swingRecordRef`(`recordSwing` で最初の1回だけ記録、`swingForOutcome` で `seq` が一致するときだけ `planPlay` に渡し、plan 作成後に `null` に戻す)を配線する。`stage` が `null` でも plan を進める。CPU 打者の前倒し(`leadMs = CPU_SWING_LEAD_MS`)と `useCpuTurn` の `holding` ゲートを配線する。`uniforms` には保持される表示用 view のものを使う。`useSkipInput`・`useBattingControls` に `holding`/`skip` を配線し、director ↔ `useBattingControls` の循環は ref 経由の getter で切る。`useGameStage` は `SwingControls` 用の `swingKind`・`setSwingKind`・`swingNow` も返す。
  - 完了条件: lint・typecheck 通過。`holding` を effect 内で立てていない。`stage === null` の分岐が `apply` のみを省略している。`skip()` が reducer に触れていない(`dispatch` 系の関数を呼ばない)。

- [ ] **ステップ E: ui の配線(ステージ全面+オーバーレイ)**(直列)
  - 依存: D、B4a、B4b、A2。担当ファイル: `ui/{StageView,GameLayout,GameScreen,BaseballGamePage}.tsx`、`ui/` の削除3件(`Scoreboard.tsx`・`MatchupPanel.tsx`・`CommentaryLog.tsx`)
  - やること: 本書「UI 設計」のとおり配線する。`GameLayout` を暫定版から最終形に書き換える: `StageView` を全面に、その上の `bb-overlay` に `ScoreHud`・`NamePlates`・`Ticker`・操作バー(`bb-bar`、testid `action-bar`。人間打撃のとき `SwingControls`、人間守備のとき `PitchingControls`→`CourseGrid`)を置き、`bb-game--batting`/`--pitching`/`--cpu` を付ける。`ScoreHud`・`NamePlates`・`Ticker` には**表示用の view**(保持される view)を渡し、操作可否(`pitchReady`・`swingReady`・`throwing`)は最新の値を使う。`BaseballGamePage` は `baseball-stage.css` を import し、視覚的に隠した `h1`、`back-home` のピル(`bb-home-link`)、`GameScreen` の `React.lazy`+`Suspense` にする(旧ヘッダは廃止)。`StageView` は「クラス名の契約」と testid 表に従う。削除した3ファイルを参照するものが無いこと(Knip・typecheck)を確認する。
  - 完了条件: lint・typecheck・`npm run build` 通過。`ui/` から `../model`・`../render` を import していない。`npm run dev:frontend` で `/#/baseball` を開いてタイトル→開始→ステージ全面+オーバーレイが表示され、コンソールエラーが無い(詳細な見た目の調整はステップ G)。build 後、`index` チャンクに three が含まれず、サイズがステップ0の基準から +5KB 以内(three は遅延チャンクにある)。testid の重複が無い(`score-away`/`score-home` は `ScoreHud` のみ)。

- [ ] **ステップ F: E2E とドキュメント**(並列: G)
  - 依存: E。担当ファイル: `frontend/e2e/baseball.spec.ts`、(要検証時のみ)`frontend/playwright.config.ts`、`sample-app/README.md`、`docs/process/sample-app-dev.md`
  - やること: テスト戦略の E2E のとおり更新する(`field-diagram` → `stage-3d`、**タイトルのボタン群**(`setting-innings-1` の radio が選択済み、`setting-side-home` のクリック)、既存の守備側ロジック維持、WebGL 非対応でも進行するテスト、演出スキップのテスト、**オーバーレイがゾーンを隠さないことの検証**を追加)。**スキップのテストに使う seed は、実装後に探して定数化する**(後攻で開始し、人間が中央・ストレートで投げた1球目が in-play になる seed を、scratchpad の使い捨てプローブで `?seed=N` を変えながら `data-play-kind` を読んで選ぶ。ロジックを変えたら再探索が必要である旨を spec のコメントに残す)。ステップ0で WebGL にフラグが必要と分かった場合のみ `playwright.config.ts` に `launchOptions.args` を追加する。README に Three.js の使用・WebGL 要件・構成(`render/`・`model/world/`)・オーバーレイ型の画面構成・演出スキップの操作を追記し、`sample-app-dev.md` の手動確認(ゲーム画面のスクリーンショット確認、WebGL の注意)を更新する。「パワプロ」等の名称は書かない。
  - 完了条件: `cd sample-app && npm run test:e2e --workspace frontend` で `home.spec.ts`(無改変)と `baseball.spec.ts` が成功し、3回連続で安定。`grep -rin "パワプロ\|パワフル" sample-app --exclude-dir=node_modules` が0件。レイアウト検証(テスト5)が失敗したら、ステップ G に戻して調整する。

- [ ] **ステップ G: 見た目の突き合わせと数値調整(UI 全体を含む)**(並列: F)
  - 依存: E。**例外として次のファイルの見た目を調整してよい**: `render/{look,character,stadium,markers}.ts`・`model/world/space/params.ts`・`model/world/motion/` のキーフレーム表(いずれも数値・色・寸法のみ。構造・関数・型は変更しない)、`model/data/teams.ts` の `uniformColor`・`shortName`、**`ui/baseball-stage.css`・`ui/baseball.css`(スタイルは自由に調整してよい。ただしクラス名の契約と testid は変えない)**、**`ui/` の表示コンポーネントのマークアップ・クラス・文言(props・testid・hooks の有無は変えない)**。それ以外の変更が必要なら報告する。**ただし次の値は変えてはならない**(入力の対応・テストの固定値・判定との整合に関わるため): ゾーン実寸(`zone.halfWidth`/`bottom`/`top`/`planeZ`)、打撃カメラ(位置・注視・fov)、リリース点 `RELEASE_POINT`、スイングの長さ(全体 200ms・接触姿勢まで 132ms・`minSwingMs` 60ms)、`CPU_SWING_LEAD_MS`、`mittMs`、判定窓に関わる値(`model/batting/params.ts` 全般)。見た目が合わずこれらの変更が必要になる場合は、変更せず報告する。**調整してよい値(中継カメラの係数・blend、滞空式、捕手の表示しきい値、テロップ長・余韻、`fovFor` の `MIN_HALF_WIDTH_TAN`、`framingLift` の定数ほか)は、単体テストがリテラルで固定しておらず `WORLD_PARAMS`/定数を参照する設計なので、調整してもテストは壊れない**(テスト戦略の冒頭を参照)。
  - やること: 「見た目の受け入れ基準」のとおり、モックと実装の S1〜S7 と、モックに無い S8〜S11(HUD・操作バー・タイトル・結果)の「ゲーム画面として成立しているか」をスクリーンショットで比較・判定し、チェックリストを自己判定する。× の項目は上記ファイルを調整し、最大3ラウンド繰り返す。特に**スマホ縦(390×844)とデスクトップ(1280×720)で、HUD・ネームプレート・ティッカー・操作バーがゾーン枠・投手・打者を隠さないこと**(`framingLift` と各オーバーレイの寸法で調整する)、人間守備のバー全体(球種チップ・5×5グリッド・投げる)が収まることを実測する。あわせて B2 の `RELEASE_POINT` の値が B1 の `params.ts` と一致していることを確認する。最終版のスクリーンショット(JPEG/PNG、1枚 500KB 以下、計20枚程度)を `docs/tests/assets/2026-10-12-baseball-game/` に保存し、判定表(〇×と所見)を完了報告に書く。3ラウンドで未達の項目はその理由を報告して人間ゲートへ引き継ぐ。
  - 完了条件: S1〜S11 のチェックリスト全項目が〇、または未達項目の理由が報告されている。`npm run lint`・`npm run typecheck`・`npm run test` が成功(world のテストは関係式を検証しており、数値調整で壊れない)。**G 自身は E2E を実行しない**(F が更新する前の spec は `field-diagram` を待つため必ず失敗する)。**F と G の両方が完了した後に、orchestrator が `npm run test:e2e --workspace frontend` を最終実行して成功を確認する**(G の調整が E2E に影響していないことの確認を兼ねる。レイアウト検証が失敗した場合は G に戻す)。

## テスト戦略

**自動テストを新規作成するか:** する。

- 単体(vitest、node): `model/world/` の全モジュール(入力の振り分け・演出進行の判断を含む)、`model/game/view.ts` の `outcome`・`teamColors`・`uniforms`・`shortName`、`model/data/teams.ts` の色・略称、`render/` の smoke。配置は各ソースに同居する `*.test.ts`。`hooks/`・`ui/`・`render/stage.ts` は単体テストしない(jsdom・WebGL を使わない。E2E と手動確認で担保)。hooks の判断部分(`holding` の導出、フェーズ決定、終了判定、スイング記録の対応づけ)は `session.ts` の純関数でテストする。スキップとスイングの衝突は、純関数 `routeStagePointer`/`isSkipKey` の全組み合わせテストで保証する。
- E2E(Playwright): `frontend/e2e/baseball.spec.ts` を更新する。オーバーレイ型のレイアウト(ステージ全面・ゾーンを隠さない・44px)は E2E の幾何検証(テスト5)で機械的に確認する。
- 実装ステップのチェックリストにテスト作成を含めてある(A・B1・B2・B3・C1・F)。

### 単体テストの合格基準

全テストは固定入力・決定論(グリッド走査)で、乱数やタイミングに依存しない。テストを通すためにテスト自体を歪めない。しきい値を緩める場合は理由を報告する。

**期待値の書き方(ステップ G との整合)**: ステップ G で調整してよい値(`WORLD_PARAMS` の中継カメラ係数・blend、滞空式、捕手の表示しきい値、テロップ長・余韻、`look.ts` の `fovFor`・`framingLift` の定数 `MIN_HALF_WIDTH_TAN`・`PORTRAIT_LIFT` ほか)は、**テストにリテラルを直書きせず、`WORLD_PARAMS`/定数を import して期待値をそこから計算する**。リテラルで固定してよいのは、G で変更を禁止する値(ゾーン実寸・打撃カメラ・リリース点・スイングの長さ・`minSwingMs`・`CPU_SWING_LEAD_MS`・`mittMs`)だけである。以下の合格基準で「`WORLD_PARAMS`」と書いた箇所はこの原則による。

**`model/world/space/`**

- `coords.test.ts`: `zoneToWorld({0,0}) = (0, 0.72, 0.03)`、`zoneToWorld(±1, ±1)` が枠の4隅 (±0.26, 0.42/1.02)(ゾーン実寸は G で変更しないためリテラル可)。`worldToZone(zoneToWorld(p))` が ±2 の格子点で `p` に一致(1e-9)。`cellToWorld({2,2})` がゾーン中心、`{0,0}` が左上遠隅((−0.347, 1.12))。`landingToWorld({x: 10, y: 50}) = (10, 0, −50)`。`zoneDeltaFromScreenDelta(rect.width, 0, rect) = (2, 0)`、`(0, rect.height, rect) = (0, −2)`。
- `geometry.test.ts`: フェンス半径 = `LANDING_PARAMS.fenceRadius`。本塁から各塁までの距離 = `baseDistance`(±0.1)。スタンド内側半径 > フェンス半径。**`geometry.zone` が `zoneToWorld` と一致(`zone.halfWidth = zoneToWorld({1,0}).x`、`zone.top`/`bottom = zoneToWorld({0,±1}).y`、`zone.planeZ = zoneToWorld({0,0}).z`)、`ballRadius > 0`**。
- `crowd.test.ts`: 同一 seed で同一配置(deep equal)、別 seed で異なる、セル数が 32×16、`paletteIndex` が 0〜7。
- `vec3.test.ts`: `lerpVec3` の端点・中点、`distanceXZ`。

**`model/world/path/`**

- `pitch-path.test.ts`(5球種 × 25セルの着弾点の全組み合わせ): `pitchBallAt(flight, 0)` が `RELEASE_POINT` に厳密一致、**`pitchBallAt(flight, durationMs)` が `zoneToWorld(landing)` に一致(1e-9)**、範囲外の経過時間はクランプ、z が単調増加、y が 0 以上 3 以下。曲がる球種(カーブ/スライダー/フォーク/シュート)は中間で直線からずれ、終点では一致する。`mittBallAt(flight, 0)` が `pitchBallAt(flight, durationMs)` に厳密一致、`mittMs` 以降はミット位置 (z = 1.6)で不動。
- `batted-path.test.ts`(**`batting/result-table.ts` の `RESULT_TABLE` で重みが正の(打球タイプ × 強さ × 結果)の組み合わせ**だけを列挙して使う。到達しない組み合わせ(例: ground の `homerun`)は対象外 × 方向3種 × seq 1〜50): `battedBallAt(plan, 0)` が `start` に厳密一致、**`battedBallAt(plan, hangMs)` の x・z が `landingToWorld(computeBattedLanding(ball, result, seq))` に一致**、`p ≥ 1` で `end` に厳密一致。ホームラン以外は終点の y = 0 かつ全区間で y ≥ 0、ホームランは終点が `fenceRadius` 以遠でスタンド斜面の上(y > 0)。頂点の高さが `peak` の ±1%(フライ/ライナー)。ゴロは y ≥ 0 でバウンドする(区間内で y が複数回極大)。`planFoul` の落下点がフェア領域(|x| ≤ |z| かつ z < 0)に入らない。
- `fielders.test.ts`: 格子(x ±90、z −130〜−5、5m刻み)の全点で `pickFielder` が総当たりの最小距離の野手と一致(同距離は小さい添字)。`fielderRunAt` の端点と中点。`FIELDER_SLOTS` が7人で固定順。

**`model/world/camera/`**

- `rig.test.ts`: `battingCamera()` がモックの値((0,1.25,3.4)/(0,1.0,−18)/34°)に一致(G で変更しないためリテラル可)。**`chaseCamera(ball)` が `WORLD_PARAMS` の中継カメラ係数から計算した式 (ball.x×kx, baseY + ball.y×ky, baseZ + ball.z×kz) / 注視 (ball.x, max(0, ball.y×kLook), ball.z) に一致する(係数をテストに直書きしない)**。`blendCamera(a, b, 0) = a`、`(a, b, 1) = b`、`k` について単調。

**`model/world/motion/`**

- `pose.test.ts`・`pitcher.test.ts`・`batter.test.ts`・`fielder.test.ts`: 全ポーズ関数について、**全関節の角度が ±2π 以内**、有限値。**連続性**: 16ms 刻みで走査し、隣接サンプル間の各関節の差が 0.5rad 以下(切替点を含む)。**境界の一致**: `pitcherWindupPose(1)` と `pitcherFollowPose(0)` が一致、`pitcherWindupPose(0)` が待機姿勢、`batterSwingPose(0, h)` が構え姿勢に一致、`batterSwingPose` の `progress` 1 と 1.4 の連続。`lerpPose(a, b, 0) = a`、`(a, b, 1) = b`。`handPosition`(順運動学)で、リリース時の投手の手先が `RELEASE_POINT` の 0.15m 以内。

**`model/world/sequence/`**

- `play-plan.test.ts`(kind: `ball`/`called-strike`/`swinging-strike`/`foul`/`in-play`(**`RESULT_TABLE` で重みが正の結果 × 打球タイプ**のみ)× スイング(なし/人間の早い・同時・遅いクリック、atMs を `durationMs − 300` から `durationMs + 150` まで 15ms 刻み/CPU の空振り・ファウル・インプレー(入力なし、`seq` の偶奇両方))の全組み合わせ。**CPU のケースの `resolvedAtMs` は `durationMs − CPU_SWING_LEAD_MS`(前倒しされた `PITCH_ARRIVED` の想定どおり)を使う**。人間のケースの `resolvedAtMs` は `swing.atMs` に等しいとして渡す):
  - **時刻表の単調性**: `durationMs ≤ contactMs`(インプレー/ファウル)、`contactMs ≤ contactMs + hangMs`、`telop.startMs ≥ durationMs`(**全種別。早い空振り・CPU の空振りでも**)、`telop.startMs < telop.endMs`、`endMs = telop.endMs + (WORLD_PARAMS の余韻)`、`fielder.startMs = contactMs ≤ fielder.arriveMs ≤ endMs`、`endMs` が有限かつ `durationMs + 6000` 以下。
  - **テロップ開始の定義どおり**: インプレー/ファウルは `contactMs + hangMs`、空振りは `max(durationMs, swing.contactAtMs)`、見逃し・ボールは `max(durationMs, resolvedAtMs)`。
  - **スイング**: 接触あり(ファウル/インプレー)で `swing.startMs ≥ base`(`base` は人間は `atMs`、CPU は `resolvedAtMs`)、`60 ≤ swing.contactAtMs − swing.startMs ≤ 132`、`swing.contactAtMs = contactMs`、`contactMs = max(durationMs, base + 60)`(CPU は `durationMs`)。人間の空振りは `startMs = atMs`・`contactAtMs = atMs + 132`。**CPU の空振りは `contactAtMs = durationMs ± 70`、`startMs = max(contactAtMs − 132, resolvedAtMs)`、`startMs ≥ resolvedAtMs`、`60 ≤ contactAtMs − startMs ≤ 132`(早い空振りで約52ms 飛ばない)**。見逃しに `swing` が無い。
  - **`swing.height`**: 人間の空振りは `zoneToWorld(swing.cursor).y`、それ以外は `zoneToWorld(flight.landing).y`(CPU の空振りを含む)。
  - ホームランは `fielder = null`、フェアのゴロ/フライ/ライナーは `fielder` あり、ファウルは `fielder = null`。同一入力で deep equal(決定論)。`outcome` に `inPlay` があるとき `batted.end` が `computeBattedLanding` と一致。
  - `swingProgressAt`: `startMs` 以前で 0、`contactAtMs` で 0.66、単調非減少で連続(16ms 刻みの差が小さい)、`contactAtMs + 68` で 1.0、十分後で 1.4。
- `frame.test.ts`: `sceneFrameAt` が同一入力で deep equal、入力を変更しない(deep freeze)、`fielders.length = 7`、全数値が有限(`phase` × `plan` の全組み合わせ × 時刻グリッド)。**`frame.uniforms` が `input.uniforms` と一致**(`phase`・`plan` によらず、攻守交代後に別の値を渡せば別の値になる)。可視性: 打撃カメラ中は `catcher.visible = false`、`blend ≥ (WORLD_PARAMS の捕手表示しきい値)` で `true`。`cursor.visible` は入力が真かつ中継カメラに移る前のみ。`cursor.flash` はスイング区間のみ。**`cursor.scaleX = radii.rx × 0.26`、`scaleY = radii.ry × 0.30`、`aim.width = (2/3) × 0.26`、`aim.height = (2/3) × 0.30`、`aim.position = cellToWorld(cell)`**(ゾーン実寸は G で変更しないためリテラル可)。`aim.visible` は `aim` 入力があるときのみ。`zone.grid` は入力に従う。ボールは `phase = idle`/`windup` で非表示、リリース後に表示。`idle`/`windup`/`flight` のカメラは `battingCamera()` に一致、`play` で `chaseFromMs` 以降 `blendCamera` に一致し、16ms 間の移動が 1.5m 以下。
- `telop.test.ts`: `telopFor` が全 `kind`・全 `InPlayResult`・`plate` の組み合わせで空でない文字列。`homerun` → 「ホームラン!!」、`plate = strikeout` が `swinging-strike` で「空振り三振!」、`walk` で「フォアボール」、`single` で落下点が内野なら「内野安打!」、`lateral` による方向名(レフト/センター/ライト)。`telopAt` が `startMs` 前で `null`、区間内で文言、`endMs` 後で `null`。
- `input-route.test.ts`(**スキップとスイングが衝突しないことの保証**): 「主ポインタ操作」は、マウス/ペンが `isPrimary` かつ `button === 0`、**タッチは `isPrimary` のみ(`button` は見ない)**。`routeStagePointer` を `holding`(真/偽)× `enabled`(真/偽)× `swingReady`(真/偽)× `pointerType`(mouse/pen/touch)× `isPrimary`(真/偽)× `button`(0/1/2)の全組み合わせで走査し、(1)`holding` が真で主ポインタ操作なら必ず `"skip"`(`swingReady`・`enabled` によらない)、(2)`holding` が真のとき `"swing"`/`"drag-start"` は一度も返らない、(3)`holding` が偽で `enabled` が真のとき、マウス/ペンの主ポインタ操作は `"swing"`、タッチの主ポインタは `button` によらず `"drag-start"`、(4)`holding` が偽で `enabled` も偽なら `"ignore"`、(5)主ポインタ操作でないもの(マウス/ペンの `isPrimary` 偽または `button` ≠ 0、タッチの `isPrimary` 偽)は `holding` によらず `"ignore"`、(6)戻り値は常に4種のいずれか1つ。`isSkipKey`: `holding` が真で Space(`" "`)・Enter、`repeat` が偽、`targetTag` が `BODY`/`DIV`/`BUTTON` のとき真。`holding` が偽・`repeat` が真・他のキー・`targetTag` が `A`/`SELECT`/`INPUT`/`TEXTAREA` のときは偽。
- `session.test.ts`(**hooks の判断部分**): `isHolding`: `outcome = null` で偽、`outcome.seq ≠ finishedSeq` で真、`=` で偽(次の投球が `in-flight` になっても `outcome.seq` が変わらない前提で偽のまま)。`phaseOf`: plan > flight > windup > idle の優先順位(8通りの組み合わせ)。`isPlayFinished`: `tMs < endMs` で偽、`≥` で真(境界)。`windupProgress`: 0〜1 にクランプ、`cpuWaitMs` が 0 以下は 1、単調。`recordSwing`: 初回は記録、**同じ `seq` の2回目は最初の記録を保つ**、別の `seq` は新しい記録に置き換える。`swingForOutcome`: `seq` が一致するときだけ入力を返し、**人間の `seq = 5` の記録に対する CPU の `outcome.seq = 6` では `null`**、記録が `null` のときも `null`。

**`model/game/view.test.ts`(追記)**: `outcome` が最初の投球の解決前は `null`。ボール/見逃し/空振り/ファウルの解決後は `{ seq: pitchSeq, kind, inPlay: null, plate }`。インプレー後は `inPlay = { result, ball }`。三振・四球で `plate` が `strikeout`/`walk`。**次の投球が始まった(`in-flight`)間も前の球の `outcome` が保持され、`seq` が変わらない(`pitchSeq − 1`)**。**`teamColors` が `teams.away/home.uniformColor` と一致。`uniforms` は、表(`half = "top"`)では `offense = away の色`・`defense = home の色`、裏では逆。攻守交代の前後(3アウト目の解決後)で入れ替わる。`in-flight` の間は変わらない**。**`scoreboard.rows[].shortName` が各チームの `shortName` と一致し、`teamName` は従来どおり**。`toGameView` が state を変更しない。既存の749件のアサーションが無改変で成功。

**`model/data/teams.test.ts`(追記)**: 各チームの `uniformColor` が 0〜0xffffff の整数。2チームの色が異なり、RGB 各成分の差の合計が 200 以上(見分けがつく)。ルミナスが青系(B 成分が最大)、ノーブルズが赤系(R 成分が最大)。**各チームの `shortName` が全角1〜3文字で、2チームで異なる**。

**`render/`(smoke のみ。node)**: `look.test`: **`fovFor(base, aspect)` が `max(base, 2·atan(MIN_HALF_WIDTH_TAN / aspect))`(度)に一致する(`MIN_HALF_WIDTH_TAN` は `look.ts` の定数を import して使い、「4:5 で約 50°」のようなリテラルを直書きしない)**、`aspect` が十分大きい(3.0)とき `base` に一致、縦横比に対して単調非増加で `base` を下回らない。**`framingLift(aspect)`: `aspect ≥ LIFT_ZERO_ASPECT` で 0、`aspect ≤ LIFT_FULL_ASPECT` で `PORTRAIT_LIFT`、その間は単調非増加で `[0, PORTRAIT_LIFT]` に収まる(定数は import して使う)**。`gradientPixels` の長さと両端の色。`stadium.test`: `buildStadium` が `Group` を返し、テクスチャがすべて `DataTexture`、子の数が妥当。`character.test`: `buildCharacter` の `joints` が全て揃い、メッシュ数が妥当。**`createTeamMaterials` が攻撃用・守備用の2材質を返し、打者は攻撃用、複数の守備側キャラクターが同一の守備用材質インスタンスを共有する。`applyUniforms` で2材質の `color` が指定の色になり(1回の呼び出しで全守備側キャラクターのアクセントが変わる)、再度別の色で呼ぶと入れ替わる。`render/` のテストに `Team`・チーム id が現れない**。`pose-apply.test`: `applyPose` が各関節の `rotation`・`root.position`・`visible` に正しく反映される。`dispose.test`: `disposeObject3D` 後、全 geometry・material・texture の `dispose` イベントが1回ずつ発火する。`markers.test`: ゾーン枠・カーソル・ボールの生成と破棄、ゾーン枠の寸法が渡した `StageGeometry.zone` に一致する(フィクスチャの値を変えると追従する)。

### E2E(Playwright)

- 既存 `home.spec.ts` が**無改変**で通る。
- `baseball.spec.ts`(`field-diagram` の待機を `stage-3d` に差し替え、他は維持):
  1. 「`/` のリンクからゲーム画面へ遷移できる」(変更なし)。
  2. 「1イニングの試合が結果画面まで到達する」: **タイトルのイニング選択は `setting-innings-1` の中の radio が選択済み(`toBeChecked`)であることを確認して**から開始する(旧 `setting-innings` の `toHaveValue("1")` を置き換え)。開始後、`stage-3d` が可視で `data-status="ready"`(WebGL が使える環境。使えない環境では失敗させて気づく)、`scoreboard` が可視。第1版の待ち合わせ(結果画面か `pitch-controls[data-ready="true"]` のどちらか)と、人間守備中の `throw-pitch` クリック、初期選択 `course-cell-2-2` の保持確認はそのまま。追加: 最初の投球後に `stage-3d` の `data-flight-seq` が数値になり、`data-landing-x`/`data-landing-y` が数値、結果画面で `final-score-*`/`score-*` が `/^\d+$/`(`score-*` は HUD の得点)。**スキップは使わない**(`fast=1` で演出が短く、スキップに依存しない通常の進行を検証する)。
  3. 「3D が使えなくても試合が結果画面まで進む」: `page.addInitScript` で `HTMLCanvasElement.prototype.getContext` が `webgl`/`webgl2` に `null` を返すようにし、`stage-3d` が `data-status="unsupported"`、フォールバック表示が見えることを確認したうえで、テスト2と同じ進行ループで結果画面に到達する(**時計とゲートが renderer 非依存であることの検証**)。進行ループは spec 内のヘルパー関数にして共有する。
  4. 「演出中のタップでスキップできる」(**通常速度**。`fast` を付けない): `?seed=<探して定数化した seed>&innings=1#/baseball` で **`setting-side-home`(後攻)のラベルをクリック**して開始し、人間守備で `throw-pitch`(中央・ストレート)をクリック。**`page.waitForFunction` に `{ polling: "raf" }` を指定して `stage-3d` の `data-phase` が `play` になる瞬間を検出**する(`toHaveAttribute` のポーリングでは取り逃すため)。**1球目が in-play になる seed を使い**、`data-play-kind="in-play"` であることを確認してからクリックする(in-play の演出は滞空+余韻で最短でも約2秒続くため、スキップの有無を明確に区別できる)。クリックは `stage-3d` の中央(HUD・ネームプレート・操作バーが無い位置)に対して行う。クリックから **300ms 以内に** `data-phase` が `idle` になり、`pitch-controls[data-ready="true"]` が見える。さらに `idle` 状態で `stage-3d` をもう一度クリックしても何も起きない(`data-phase` が `idle` のまま、`score-*` が変わらない)ことで冪等性を確認する。所要は1球分(約5秒)で、`test.setTimeout(60_000)`。seed を探す手順はステップ F に記す。
  5. 「オーバーレイがステージ全面に重なり、ゾーンを隠さない」(**レイアウトの幾何検証**): `fast=1` で、viewport を **1280×720(デスクトップ)** と **390×844(`hasTouch` のスマホ縦)** の2通り、**人間打撃(先攻)** と **人間守備(後攻、`setting-side-home`)** の2通りで、計4通り行う。開始後に `stage-3d` が `ready` で `data-zone-rect` が空でないことを待ち、次を検証する: (a) `stage-3d` のバウンディングボックスがビューポート全体を覆う(幅・高さがビューポートの 99% 以上)、(b) ページがスクロールしない(`document.documentElement.scrollHeight <= window.innerHeight`)、(c) `scoreboard`・`name-plates`・`ticker`・`action-bar` がすべて可視でビューポート内にある、(d) `stage-3d` の位置と `data-zone-rect` から求めたゾーン枠のページ座標の矩形が、上記4要素のどの矩形とも交差しない(4px の余白を見込む)、(e) 人間守備では `throw-pitch`・`course-cell-0-0`・`course-cell-4-4` がビューポート内にあり、スマホ縦ではセルの幅・高さが 44px 以上、`throw-pitch` の高さが 44px 以上、人間打撃では `swing-button` の高さが 44px 以上(スマホ縦は 64px 以上)。このテストは見た目の調整(ステップ G)の合否を機械的に確認するもので、失敗したら G に戻す。
- `fast=1` の所要時間: 1球あたり windup 20ms + 飛行約170ms + 余韻(見逃し・ボールは約100ms、インプレーは滞空込みで約350〜500ms)で約0.3〜0.7秒。1イニング(両軍・約30球)で約10〜20秒。`test.setTimeout(120_000)`、固定 sleep を使わない。ブラウザの負荷が高い環境では spec 内で `test.describe.configure({ mode: "serial" })` にしてよい(`playwright.config.ts` は共有のため変えない)。
- 起動パラメータは開発ビルドのみ有効(第1版 #8)。`playwright.config.ts` の webServer は `npm run dev` のまま。

### 静的チェック

- `cd sample-app && npm run typecheck`・`npm run lint`・`npm run test`・`npm run build`・`npm run test:e2e --workspace frontend` がすべて成功。Knip(report-only)は判定に使わない([[knip-dead-code-detection]])。
- **構造検査(code-reviewer/tester が grep)**:
  1. `from "three"` が `render/` 配下のみ。`import * as THREE`・`getObjectByName` が無い。
  2. `render/`(テストを含む)が `../model`・`../hooks`・`../ui` を import していない。`render/` に `Team`・`uniformColor`・チーム id・チーム名が現れない(色は `UniformColors` の数値だけ)。ゾーン・ボールの寸法の直書きが無い(`StageGeometry` から読む)。
  3. `model/` の他サブフォルダが `world/` を import していない。`world/` が `game/`・`cpu/`・`data/` を import していない。
  4. `render/` 内で `document`・`window`・`ResizeObserver`・`WebGLRenderer`・`getContext` を使うのが `stage.ts` のみ。`CanvasTexture`・`document.createElement("canvas")` が無い(canvas の生成は `stage.ts` のみ)。`getContext("webgl")`(WebGL1)を使っていない。`stage.ts` の `dispose` が規定の順序(先頭で `disposed = true`、リスナ解除と `disconnect()` が `forceContextLoss()` より前)。
  5. `model/` のうち `world/` 以外に、`from "react"`・`document`・`window`・`Math.random`・`Date`・`performance`・`Math.sin`/`cos`/`log`/`exp`/`hypot` が無い。`model/world/` には `from "react"`・`document`・`window`・`Math.random`・`Date`・`performance` が無い(三角関数・`hypot` は許可)。`render/`・`hooks/` は三角関数の検査対象外。
  6. `import.meta.env` が `hooks/useLaunchParams.ts` のみ。
  7. `ui/` から `../model`・`../render` を import していない。`ScoreHud`・`NamePlates`・`Ticker`・`StageTelop`・`TitleScreen`・`ResultScreen` など props のみのコンポーネントに hooks の呼び出しが無い。`TitleScreen` に `<select>` が無い。
  8. `holding` を effect 内で `setState` していない(render 中の導出のみ)。director の毎フレーム処理が `stage === null` でも plan を進めている。`useStage3d` の生成 effect の deps が `quality` のみ。
  9. **`skip()` が `dispatch`/`throwPitch`/`swing`/`cpuPitch`/`pitchArrived` を呼んでいない**(表示状態だけを変更する)。**`usePointerInput` の pointerdown 分岐が `routeStagePointer` の戻り値で決まり、`holding` を直接参照して分岐していない**。`useKeyboardInput.ts` が変更されていない。
  10. 各 `data-testid` が testid 表のコンポーネントにだけ現れる(重複なし)。特に `score-away`/`score-home` は `ScoreHud` のみ、`LineScore` は `line-score-runs-<side>`。旧 `Scoreboard`・`MatchupPanel`・`CommentaryLog` が残っていない。
  11. `bb-overlay` 配下で操作しない要素が `pointer-events: none`、操作する要素(`bb-bar`・`bb-hud__more`・`bb-ticker__more`・`bb-home-link`)が `pointer-events: auto`(CSS の grep)。
  12. `grep -rin "パワプロ\|パワフル" sample-app --exclude-dir=node_modules` が0件。

### 手動確認(Playwright CLI でスクリーンショット)

通常速度(`fast` なし)で `npm run dev:frontend` を起動し(ゲームは backend 不要)、使い捨てスクリプト(コミットしない)で確認する。保存先は tester が決める。

1. **見た目の突き合わせ**: 「見た目の受け入れ基準」の S1〜S7(モックとの並置)と、S8〜S11(絶対基準)。tester が撮り直して判定する。
2. **打撃体験**: `/?seed=7&innings=1#/baseball` で開始し、`stage-3d` の `data-landing-x/y`・`data-duration-ms`・`data-zone-rect` から画面座標を求めてマウスを動かし、`durationMs` の少し前にクリックしてスイングする(`px = canvas.left + zoneRect.left + (x/2 + 0.5) × zoneRect.width`、`py = canvas.top + zoneRect.top + (0.5 − y/2) × zoneRect.height`)。10球以内に実況ログへ安打系が出て、中継カメラで野手が走る。Space キーのスイングが、フォーカス中のボタンの click と二重発火しないこと。ジャスト付近(接触の直前直後)のクリックでスイングが滑らかに見えること(S3(d))。
3. **投球**: 後攻を選んで開始。コースのセルを選ぶと 3D のゾーン上の同じセルがハイライトされ(投球はされない)、「投げる」で windup→投球。投球後も選択が保持され、飛行中は「投げる」が押せない。
4. **ネタバレ抑止**: ホームラン/ヒットの打球中、HUD・ネームプレート・ティッカーがテロップ表示後(またはスキップした時点)に更新される。
5. **スマホ縦(390×844、`hasTouch`)**: 人間打撃ではスイングボタンとミート/強振切替、人間守備では球種チップ・5×5グリッド・「投げる」の全体がスクロールなしで操作バーに収まり、ゾーン枠・投手・打者を覆わない。相対ドラッグでカーソルが動き、「スイング」ボタンでスイングできる。演出中のタップでスキップできる(実機では未検証)。
6. **WebGL 不可**: `getContext` を `null` にするスタブで開き、フォールバック表示が出て、試合が進行する(E2E テスト3の目視版)。**このときブラウザが出す WebGL 生成失敗のログは想定内**とし、それ以外のエラーが 0 であることを確認する(`createStage` は three を呼ばずに `null` を返すため、three の「Error creating WebGL context」は出ない想定)。
7. **リソース解放**: 「もう一度」「タイトルへ」→再開始を5回繰り返しても、DOM の `canvas` が1つ以下で、`stage-3d` の `data-status` が `lost` にならず、フォールバック表示(`bb-stage__fallback`)が出ない。**開発サーバー(StrictMode の二重 mount)でタイトル→開始した直後も、`canvas` が1つで、`data-status` が `lost` にならず、フォールバックが出ない**(`dispose` の手順の確認)。**判定にはブラウザが出す context lost や "Too many active WebGL contexts" の警告の有無を使わない**(ブラウザ・環境で出方が異なり、`forceContextLoss` の正常な後始末でも出うるため)。
8. **本番ビルドで起動パラメータが無視される**(第1版 手動確認5と同じ)。`index` チャンクに three が含まれない(`/` とタイトルの読み込みで three のチャンクが取得されない)。
9. **コンソールエラー0**(**WebGL が使える環境**での各画面。6 とは分けて判定する)。
10. **演出スキップ**: 人間打撃で、スイング直後の演出中に (a)マウスクリック (b)タッチのタップ (c)Space (d)Enter でスキップでき、次の投球に進むこと。スキップ前は打撃中のクリック=スイングで、スキップにならないこと。スキップに使ったクリックが次の投球のスイングとして扱われないこと(ヒントの表示/非表示、スキップ直後のスコア・実況の更新も確認)。最後の打席(試合終了)の演出をスキップすると結果画面が出ること。テロップ・HUD・ネームプレートの上でタップしてもスキップできること(`pointer-events: none`)。操作バーの背景を押してもスキップ/スイングにならないこと。
11. **攻守交代の配色**: 3アウト目の打球演出が終わるまでは旧配色で、次の半イニングの待機画面から打者と守備側の配色が入れ替わる(S7)。HUD のチップの色がユニフォームと一致する。
12. **オーバーレイ型の UI**(S8〜S11): デスクトップとスマホ縦で、HUD の「回別」と、ティッカーの「ログ」が開閉できる。タイトルの選択肢がボタン群で、キーボード(矢印・Tab・Space)でも選べる。結果画面が勝ち・負け・引き分けで文言と色が変わる。右パネル・カード並びが残っていない。

合格基準: 1 のチェックリストが全て〇、2〜12 が確認でき、致命的な表示崩れ・コンソールエラーがない。

## リスク・トレードオフ

- **headless WebGL(最大の不確実性)**: Playwright の headless Chromium(クラウドと CI の双方)で WebGL2 が作れないと E2E でステージを検証できない。ステップ0で実測し、ダメなら `launchOptions.args`(swiftshader 系)、`quality: "low"`、最悪は WebGL 非対応でも進行する経路(規約10・E2E テスト3)で試合ロジックだけを検証する。three は r163 以降 WebGL2 専用なので WebGL1 のみの環境ではフォールバック表示になる(N15)。CI での実挙動はクラウドの実測と一致しない可能性があり、PR の CI 結果で初めて分かる(失敗時は自動解決せず報告)。ソフトウェア描画(SwiftShader)は遅く、`fast=1` では `quality: "low"` で負荷を下げる。
- **モック(r128)との見た目の差**: 色管理・ライト強度の単位・`RedFormat` が異なるため同じ数値でも同じ見た目にならない。`render/look.ts` に集約し、ステップ G のスクリーンショット比較で受け入れる。「同等以上」の判定は主観が入るため、チェックリスト化した(ピクセル差分は使わない)。2頭身キャラの出来は最終的にゲート2で人間が判断する。
- **UI の「ゲームらしさ」の判定は主観が入る**: モックに無い HUD・操作バー・タイトル・結果は、「ゲーム画面として成立しているか」のチェックリスト(S8〜S11)で判定する。トーン(N17)は具体的な指定(フォント・縁取り・パネル・アクセント・避けるもの)に落としたが、最終的な出来はゲート2でユーザーが判断する。第1版の失敗(見た目をゲートで確認しなかった)を繰り返さないため、タイトル・結果・操作バーのスクリーンショットも必ず提示する。
- **全面ステージ+オーバーレイでゾーンが隠れる**: 守備時のバー(球種+グリッド+投げる)が約290px、ティッカーを含めると約330pxになり、スマホ縦(390×844)ではゾーンの下半分に重なりうる。`framingLift`(シーンを上へずらす)とオーバーレイの寸法で避け、E2E の幾何検証(テスト5)で機械的に確認する。縦長で FOV が広がり(`fovFor`)、投手が小さく見えるトレードオフがある。実機未検証。
- **タイトルの背景は CSS の絵**: 3D の実描画ではない(N16)。タイトルで three を読み込まない方針(`/` とタイトルのバンドルを軽く保つ)との両立のため。3D 背景にしたい場合は、タイトルでの遅延読み込みと WebGL コンテキストの共有を伴う別の設計が必要になる。
- **ネイティブ要素の見た目**: `details`/`summary`、`input[type=radio]` をゲーム風に見せるため、`appearance`/`clip-path`/`::marker` の CSS が必要になる。ブラウザ差(特に iOS Safari の `summary`)は実機未検証。
- **ゲートと E2E の整合**: `holding`・`throwing` が `pitch-controls` の `data-ready` に含まれないと、E2E が演出中に二重投球する。演出時間はゲーム時間で定義して `timeScale` で縮める。windup は壁時計(`fast` で 20ms)。スキップ専用の E2E(テスト4)は通常速度で1球だけ行い、`fast` の通常進行テストには影響させない。テスト4の seed はロジック変更で変わりうるため、ステップ F で探した手順を spec に残す。タイトルの `select` が radio に変わったため、E2E のタイトル操作(`setting-innings`・`setting-side`)を差し替える。
- **スキップとスイングの誤爆**: 人間打撃中の演出直後は「スキップのクリック」と「次の投球のスイング」が連続しうる。`holding` と `swingReady` は同時に真にならず(次の投球は windup を経てから始まる)、`routeStagePointer` が `holding` を優先して1つの入力に1つの動作だけを返す。スキップに使った pointerdown はスイング・ドラッグに使わない。結果画面の `autoFocus` ボタンへの誤作動(Enter/Space のキー操作で最後の演出をスキップした直後に「もう一度」が押される)は、keydown で `preventDefault` し `event.repeat` を無視することで避け、手動確認10で確認する。
- **スキップの即カット**: スキップすると、打撃カメラ・待機姿勢へ補間なしで戻る(演出途中の野手・ボールは消える)。違和感があれば短いフェードやカメラの戻りを後続で足す(今回は入れない)。
- **接触時刻固定は見た目のごまかし**: 判定の Δt(±150ms)と見た目の接触時刻は一致しない(N5)。遅いクリックではボールが最大約210ms分ずれて見える。ジャスト付近は残り時間にスイングを圧縮して補間する(最短60ms)ので構え→接触姿勢の飛びは出ないが、スイングが速く見える。CPU の早い空振りも同様に圧縮される(約80ms)。目立てば判定待ち中のボール非表示に切り替える。CPU 打者の前倒し(N6)も同様に判定上の時刻とは独立。
- **スコアのネタバレ抑止**: `useHeldView` で抑止する(N8、確定)。保持中の view と最新の view の取り違えが不具合の温床になるため、表示用(`ScoreHud`・`NamePlates`・`Ticker`・ユニフォーム色)と制御用(操作可否・演出の入力)を明確に分け、手動確認4・11で確認する。
- **人間スイング記録の取り違え**: 人間打撃の次の半イニング(CPU 打者)で古い人間のスイングが `planPlay` に渡ると、CPU の空振りが人間の入力どおりに描かれるなど演出が狂う。`swingRecord` を `{ seq, input }` にして `seq` が一致するときだけ渡し、1つの `seq` につき最初の1回だけ記録する(`session.ts` の純関数を単体テスト)。
- **StrictMode の二重 mount と `dispose`**: 開発サーバーでは `createStage` が二重に呼ばれる。`dispose` の手順(先頭の `disposed` フラグ、context リスナ解除、`ResizeObserver.disconnect()`、`forceContextLoss()`、canvas remove)を守らないと、残骸の canvas、`forceContextLoss` による「lost」通知、破棄後のコールバックが起きる。`useStage3d` の生成 effect は `quality` のみに依存させ、半イニングごとに作り直さない。単体テストできないため、コードレビューの確認事項と手動確認7(`data-status`・フォールバック・canvas 数で判定)で担保する。
- **チーム色・略称**: 青/赤以外の色を足す場合、トゥーンの3段階の陰影(`gradientMap`)で明るい色が白く飛ぶ、暗い色が黒い輪郭線に沈むなど見え方が変わる。色はデータ(`uniformColor`)だけで変えられるが、見た目はステップ G で確認する。攻守交代の色の切替は表示用 view に追従するため、`useHeldView` の不具合は配色の誤りとして現れる(S7 で検出)。略称(`shortName`)は全角1〜3文字(HUD の幅に合わせる)。
- **リリース点とキーフレームの合わせ込み**: 手先がリリース点を通るかは `fk.ts` のテストで機械検証するが、見た目の自然さは目視(ステップ G)。B2 と B1 の `RELEASE_POINT` を別ステップで持つため、G で一致を確認する。G は固定値(ゾーン・打撃カメラ・リリース点・スイング長)を変更しない。
- **打球演出の範囲**: 送球・走塁・捕球後の動作は含めない(ヒット後は野手が落下点に着いて止まる)。ファウル・ゴロ(バウンド)・ライナーの軌道は新規設計で、見た目は目視で調整する。
- **バンドルサイズ**: three は遅延チャンクに隔離する(`/` とタイトルは増えない)が、ゲーム画面の初回表示は数百KBの追加読み込みになる。ステップ0・E で実測する。
- **モバイル GPU / context lost**: 影マップとピクセル比が負荷になる。縮小は未実装で、`webglcontextlost` は「描画が中断されました」の表示にとどめる。実機未検証。縦画面の FOV 補正・`framingLift`・相対ドラッグ(N11)も実機未検証。
- **テンポ**: ボール・ストライクで約3秒、インプレーで約5〜6秒と、第1版より長い(N14)。タップ/Space によるスキップで短縮できる(確定)。
- **依存の再最適化リロード**: Vite の dev で遅延ロード時に依存が再最適化されるとページがリロードされ、E2E が不安定になる。ステップ0で確認する。
- **構造検査は機械強制でない**: `render/` と `world/` の境界、`render/` にチーム知識が無いこと、`skip()` が reducer に触れないこと、`dispose` の順序は grep とレビューで検査する([[feature-segment-import-boundaries-not-enforced]]、[[react-hooks-lint-not-installed]])。
- **未使用の view フィールド**: `GameView.geometry`・`fieldDiagram`・`fieldMarker`(ミラー以外)は ui が使わなくなる。既存テストを触らないことを優先して残置する(整理は後続)。`ballPositionAt`・`BallPosition` ほか 2D 用の定数も残置。Knip は report-only のため影響しない。
- **規模**: `world/` が約22ソース+約17テスト、`render/` が約7ソース+6テスト、`ui/` は新規5+作り直し約12。ステップ分割・`types/` 先行・契約の固定で並列実装のずれを抑える。型の不一致は上申させ、orchestrator が直列で解決する。A2〜E の間は試合が進行しない中間状態になる(出荷しない)。
- **three のライセンス**: MIT。画像・フォント・3Dモデルの外部素材は使わない。

## ロールバック方針

- **前提**: 第1版(DOM+SVG)も本改訂(第2版)も `main`/`develop` には未マージで、この topic の作業ブランチにだけ存在する。
- **ゲート2で第2版が不合格になった場合(未マージ)**: 第2版のコミット(描画層と UI 層の置き換え)を捨てる。第1版も試遊で不合格だったため、戻り先は人間が決める(第1版の最終コミットへ戻すか、さらに設計からやり直すか)。依存(`three`・`@types/three`、`package-lock.json`)と `vite.config.ts` の `optimizeDeps` 変更も併せて捨てる(CI は `npm ci`)。
- **マージ後に障害が出た場合**: PR 単位で `git revert` する。ホーム画面(`/`)と `home.spec.ts` は影響を受けない(ゲーム画面 `#/baseball` が消える/元の状態に戻るだけ)。**第1版の SVG 描画を部分的に復活させる(フォールバックとして併用する)ことはしない。**
- 描画層・UI 層の置き換えは `ui/`・`hooks/`・`render/`・`model/world/`・`types/{scene,stage}.ts`・`e2e/baseball.spec.ts`・依存に閉じる。加算変更(`PitchOutcomeView`・`GameView.outcome`/`teamColors`/`uniforms`・`ScoreRowView.shortName`・`Team.uniformColor`/`shortName`)は他に影響しないため、revert しなくても残してよい。reducer・`GameState`・判定ロジックは変更していない(`Team` の新フィールドは読まれるだけ)。
- DB・外部システム・データ移行なし。backend・shared・`ci.yml` の動作は変更しない。

## 設計レビュー結果

`design-reviewer` による自動レビュー(最大2ラウンド、`/design` 実行時)の記録。

| ラウンド | 判定 | 主な指摘 |
| --- | --- | --- |
| 1 | MAJOR | M1〜M5(M1 テロップ開始時刻とテストの矛盾、M2 swingRef のクリア(古い人間スイングが CPU 打者に渡る)、M3 StrictMode 二重 mount の破棄手順と `useStage3d` の deps、M4 ゾーン実寸が描画契約に無い、M5 C3〜E 間の typecheck 不通過)+ MINOR 14件 → 全件反映 |
| 2(ラウンド1がMAJORの場合のみ) | PASS | PASS。残MINOR6件(WebGL2専用化、G の E2E 条件、play-plan.test の CPU 前提、CPU 早い空振りの圧縮、手動確認7の判定、G 調整値のテスト直書き)を反映 |

未解決のMAJORが残った場合: なし

(レビュー後にユーザー指示で追加した「周辺 UI のオーバーレイ化」(N7・N11 の変更・N16・N17、ステップ B4a/B4b/E/G、S8〜S11、E2E テスト5)は、レビュー済みの範囲外である。実装後のコードレビューと `/test` で確認する。)

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
| 2026-10-12 | 承認(修正指示付き) | ユーザー指示『デザインとUIがクソだからなおせ』を受け、3D 作り直しの実装に進むとともに、周辺 UI をゲーム画面らしいオーバーレイ型に作り直す方針を追加 |

## ステップ0 試し打ち結果(実装時に記入)

2026-10-12 実測(implementer、プローブは scratchpad。コミット対象外)。想定外なし。設計の見直しは不要。

| # | 項目 | 結果 |
| --- | --- | --- |
| 版 | three / @types/three | `three ^0.186.1`(2026-09-24 公開)、`@types/three ^0.186.0`(@types に 0.186.1 は無い。同一 r186)。範囲の書き換えなし |
| 1 | `npm ci --dry-run`・lockfile | 成功。追加は three・@types/three とその依存(@dimforge/rapier3d-compat、@tweenjs/tween.js、@types/stats.js、@types/webxr、fflate、meshoptimizer)のみ |
| 2 | vitest(node)で three 生成 | 成功。Group/Mesh/DataTexture(RedFormat)/MeshToonMaterial/PerspectiveCamera#setViewOffset を生成・dispose。strict+exactOptionalPropertyTypes+noUncheckedIndexedAccess の tsc 0 エラー |
| 3 | headless Chromium の WebGL2 | **launchOptions 追加不要**(Playwright 1.62 は常に `--enable-unsafe-swiftshader`)。SwiftShader で描画確認。ローカルは Chromium 141(回避構成)、CI の実挙動は PR の CI で確認 |
| 3b | WebGL1 を渡した場合 | `WebGL 1 is not supported since r163.` で例外 → stage.ts は WebGL2 取得+例外捕捉(設計どおり) |
| 4 | チャンクサイズ | three を含む遅延チャンク 524.3KB(gzip 131.7KB)。index チャンクの基準は 241.77KB / gzip 76.54KB(three 未 import の間は不変) |
| 5 | eslint 実測 | 想定どおり。引数オブジェクトのプロパティ代入・`.set()`・Map・for...of・traverse 内 instanceof・Math.sin/cos/hypot は通過。変数添字・Math.random・ネスト三項・`!`・61行超・引数7個以上・未読の Map(no-unused-collection)は error |
| 6 | vite dev + React.lazy の再最適化リロード | 発生せず(起動時スキャンで three が最適化済み)。`optimizeDeps.include` は不要 |

実装上の注意(後続ステップへ):
- `PCFSoftShadowMap` は r186 で削除扱い(警告のうえ PCFShadowMap に置換)。**`PCFShadowMap` を使う**。
- SwiftShader の描画は重い(1280×720・影あり・pixelRatio1 で約50ms/フレーム、pixelRatio にほぼ比例、初回フレームはシェーダコンパイルで約200ms)。**low 品質/headless では pixelRatio を 1 に固定**し、E2E のビューポートを大きくしない。
- Prettier の printWidth は 160。160桁以内の import は1行にする(prettier/prettier が error)。

## 実装時の申し送り(orchestrator 記録)

- ステップA:
  - `outcomeOf`/`colorsOf` は `model/game/view.ts` の非 export 関数(`toGameView` 経由でテスト)。`outcome.seq` は in-flight 中 `pitchSeq − 1`、それ以外(game-over 含む)は `pitchSeq`。3アウト目の解決直後は `uniforms` が新しい攻守で入れ替わるので、旧配色の保持は `useHeldView` の責務。
  - `makeTeam(id, name, look)`(test-fixtures)。チーム: ルミナス `0x2f63c8`/「ルミ」、ノーブルズ `0xe8473c`/「ノブ」。
  - `StageGeometry` のフィールド: `zone{halfWidth,bottom,top,planeZ}`、`ballRadius`、`groundSize`、`infield{dirtRadius,dirtCenterZ,dirtY,grassSide,grassCenterZ,grassY,homeDirtRadius,homeDirtY}`、`mound{radiusTop,radiusBottom,height,y,z}`、`rubber{width,height,depth,y,z}`、`bases{size,height,first,second,third}`(Vec3, y=0.05, 一塁は +x)、`homePlate{points: GroundPoint[], y}`(尖りは捕手側 +z、ShapeGeometry を x 軸 −π/2 で寝かせるとシェイプの y が世界の −z)、`foulLines{length,width,height,y,centerOffset}`(中心 (±centerOffset, y, −centerOffset)、右は yaw −π/4・左は +π/4)、`batterBoxes{innerX,outerX,halfDepth,y}`、`fence{radius,height,y,spreadRad,cap{radius,height,y}}`、`stands{innerRadius(109),outerRadius(147),height,y,spreadRad}`、`roof{radius,height,y,spreadRad}`。円弧は CylinderGeometry 開口・両面、`thetaStart = π − spreadRad`、`thetaLength = 2·spreadRad`。初期値と意味は `types/stage.ts` の JSDoc。
  - 守備位置は `StageGeometry` に含めない(`WORLD_PARAMS` のみ。render は `SceneFrame.fielders` の座標を使う)。ライト・フォグ・空・芝の縞は look(render/look.ts)の領分。
- ステップB1(`model/world/{space,path,camera}`):
  - `space/params.ts`: `RELEASE_POINT`(−0.30, 1.65, −18.1)、`CPU_SWING_LEAD_MS`=150、`WORLD_PARAMS`(`DeepReadonly<typeof PARAMS>`、数値は `number` 型)。主キー: `zone`・`ballRadius`・`pitch{bendGain,arcHeight}`・`mitt{z,yOffset,travelMs(=設計の mittMs 150)}`・`pitcherFollowMs`(400)・`actors{pitcher,catcher,batter:{position,yaw,scale},fielderScale}`・`fielders{first..right:{x,z}}`・`fielderRun{runFactor,stopRatio}`・`battingCamera{position,target,fovDeg}`・`chaseCamera{kx,baseY,ky,baseZ,kz,kLook,fovDeg,positionBlendMs(500),targetBlendMs(250),catcherVisibleBlend(0.35)}`・`swing{durationMs(200),contactMs(132),contactRatio(0.66),minSwingMs(60),missOffsetMs(70),followEndProgress(1.4)}`・`batted{fly,liner,ground:{hangBaseMs,hangPerMeterMs,peakRatio},groundBounce,contactZ}`・`foul`・`telop{inPlayMs(1100),foulMs(700),swingMissMs(700),takeMs(500),afterglowMs(200)}`・`stadium`。
  - `space/vec3.ts`: `lerp`(t=1 で b に厳密一致)・`lerpVec3`・`addVec3`・`distanceXZ`。`space/coords.ts`: `zoneToWorld`・`worldToZone`・`cellToWorld`・`landingToWorld`・`zoneDeltaFromScreenDelta(dx,dy,rect)`(幅/高さ≤0 は (0,0))、`ZONE_CENTER_Y`(0.72)・`ZONE_HALF_HEIGHT`(0.30)。`space/geometry.ts`: `buildStageGeometry()`・`standsHeightAt(stands, radius)`。`space/crowd.ts`: `buildCrowdPattern(seed)`(32×16 行優先、`paletteIndex` 0〜7)。
  - `path/pitch-path.ts`: `pitchBallAt(flight, elapsedMs)`・`mittBallAt(flight, sinceArrivalMs)`。`path/batted-path.ts`: 型 `BattedPlan{start,end,peak,hangMs,hops,shape,overFence}`・`BattedShape`、`planBattedBall(ball, result, seq, start)`・`planFoul(seq, start)`(黄金比数列。30% バックネット方向/70% ライン外、seq の偶奇で左右)・`battedBallAt(plan, sinceContactMs)`。HR の終点 y は `standsHeightAt`。ゴロは3バウンド。`path/fielders.ts`: `FIELDER_SLOTS: readonly {id: FielderId; position: Vec3}[]`(固定順7人、y=0)・`pickFielder(target): number`・`fielderRunAt(from, to, progress)`。
  - `camera/rig.ts`: `battingCamera()`・`chaseCamera(ball)`・`easeInOut`・`blendCamera(a, b, k, targetK = k)`(位置と注視の blend を別係数で渡せる)・`chaseBlendAt(sinceContactMs): {position, target}`。
  - 塁の座標は `baseDistance × √½` から導出(一塁 x=19.375)。
- ステップB2(`model/world/motion`、`types/` のみに依存):
  - 戻り値は足元を含まない `JointPose`(torso・head・armL・armR・legL・legR の `Rot3`)。配置は `pose.ts` の `placeCharacter(joints, root, visible = true): CharacterPose`・`placeBatter(joints: BatterJoints, root, visible = true): BatterPose` で行う(root = `{position, yaw, scale}`。値は `WORLD_PARAMS.actors`)。ほかに `lerpPose`・`sampleKeyframes`・`smoothstep`・`clamp01`・`mix`・`applyEase`、型 `Keyframe<T>`(区間ごとの `ease`)。
  - `pitcher.ts`: `pitcherWindupPose(u: 0..1)`(u=0 待機、u=1 リリース直前、NaN は 0)・`pitcherFollowPose(sinceReleaseMs)`(400ms 以降は振り切りで停止)。`batter.ts`: `batterStancePose()`・`batterSwingPose(progress 0..1.4, height)`(0.66 で接触、`bat.height` は接触で `height` に一致。関節角は height 非依存)。`fielder.ts`: `fielderIdlePose()`・`fielderRunPose(timeMs)`(周期 449ms)・`catcherPose()`。`fk.ts`: `handPosition(pose, rig, root, hand = "armR")`・`rotateEuler`。
  - `rig.ts`(G で調整する数値): `CHARACTER_RIG`(`StageOptions.rig` に渡す)・`IDLE_POSE`・`CATCHER_POSE`・キーフレーム表・`PITCHER_FOLLOW_MS`(400)・`SWING_CONTACT_PROGRESS`(0.66)・`SWING_FOLLOW_END_PROGRESS`(1.4)。**B1 の `WORLD_PARAMS.pitcherFollowMs`・`swing.contactRatio`/`followEndProgress` と同値の重複**。C1 の時間軸は `WORLD_PARAMS` を正とし、一致確認は G。
  - 実測: リリース時の右手先と `RELEASE_POINT` の誤差 0.043m。接触姿勢はモックと異なり、ボール面でバットがほぼ水平(sweepYaw 約 −0.1)。
  - 60ms に圧縮したスイングではバットが 1 フレームで約 0.86rad 動く(設計のリスク記載の範囲)。野手の走り→待機の切り替えは硬い(到着後の動作はスコープ外)。
- ステップB3(`render/` のビルダー。`types/` と three のみ import):
  - `look.ts`: `applyRendererLook(renderer, quality)`(`outputColorSpace`=`LinearSRGBColorSpace`、`shadowMap.type`=`PCFShadowMap`、影は `normal` のみ。`renderer.shadowMap` を触る前に呼ぶ)・`pixelRatioFor(quality, dpr)`(low=1、normal=min(2, dpr))・`fovFor`・`framingLift`・`createToonGradient(): DataTexture`、定数 `CAMERA_NEAR`(0.1)・`CAMERA_FAR`(800)・`MIN_HALF_WIDTH_TAN`・`PORTRAIT_LIFT`・`LIFT_FULL_ASPECT`・`LIFT_ZERO_ASPECT`・`DEFAULT_UNIFORMS`。**モジュール読み込み時に `ColorManagement.enabled = false`**(r128 の色の再現のため。色の生成より前に必要)。ライト強度はモック × π。
  - `stadium.ts`: `buildStadium(geometry, crowd): Group`(ライト・太陽の target を含む)・`createSkyTexture(): DataTexture`(`scene.background` 用。シーングラフ外なので **C2 の `dispose()` で直接 `.dispose()` する**)・`createFog(): Fog`。
  - `character.ts`: `createTeamMaterials(gradient) → {offense, defense}`・`applyUniforms(materials, uniforms)`・`buildCharacter(rig, style)`(`CharacterStyle = {accent, gradient, glove, bat}`、戻り値 `CharacterParts = {root, joints{torso,head,armL,armR,legL,legR}, bat{swing,tilt}|null}`)。打者は `accent: offense, bat: true`、投手・捕手・野手は `accent: defense, glove: true`。
  - `pose-apply.ts`: `applyPose(parts, pose)`・`applyBatterPose(parts, pose)`。`markers.ts`: `buildMarkers(geometry, gradient): Markers`(`group` をシーンに追加)・`applyMarkers(markers, frame)`。`dispose.ts`: `disposeObject3D(root)`(geometry・material・texture・影を重複なく破棄。親からは外さない)。使われなかったグラデーション・材質は C2 が直接 dispose する。
  - モックとの差: ファウルラインの向きは `types/stage.ts` の JSDoc どおり(モックは右側が逆向きの不具合)。影カメラは `updateProjectionMatrix()` を呼ぶ(モックは未呼び出しで ±5m のまま)。
  - 見た目確認のハーネス(esbuild で bundle → Playwright で撮影、モック r128 も同条件で撮れる)は scratchpad の `b3/` にある。G で再利用する。
- ステップC1(`model/world/sequence`):
  - `play-plan.ts`: `planPlay({ flight, outcome, swing: SwingInput | null, resolvedAtMs }): PlayPlan`(`seq, kind, durationMs, resolvedAtMs, swing, contactMs, batted, fielder, chaseFromMs, telop: TelopWindow, endMs`)・`swingProgressAt(swing, tMs)`。
  - `frame.ts`: `sceneFrameAt({ phase, tMs, windupU, flight, plan, uniforms, cursor: { visible, point, radii }, aim, grid }): SceneFrame`。`plan` は `phase === "play"` のときだけ使う。**`play` 中に `flight` が `null` だと接触前の投球が描かれないので、director は保持している flight を渡す。** `tMs` は負なら 0。`chaseFromMs` 以降は zone・cursor・aim を非表示。
  - `telop.ts`: `telopFor(outcome, landing)`・`telopAt(plan, tMs)`(`startMs ≤ t < endMs` で文言、ほかは `null`)。
  - `input-route.ts`: `routeStagePointer({ holding, enabled, swingReady, pointerType: string, isPrimary, button }) → "skip" | "swing" | "drag-start" | "ignore"`(`holding` が最優先、`"touch"` 以外はマウス/ペン扱い)・`isSkipKey({ holding, key, repeat, targetTag })`(`targetTag` は大文字小文字を区別しない、空文字可)。
  - `session.ts`: `isHolding(outcome, finishedSeq: number | null)`・`phaseOf({ hasPlan, hasFlight, windupActive })`・`isPlayFinished(plan, tMs)`・`windupProgress(nowMs, startedAtMs, cpuWaitMs)`・`recordSwing(current, seq, input)`・`swingForOutcome(record, outcomeSeq)`(型 `SwingRecord = { seq, input }`)。
  - 設計との差: CPU 空振りの接触時刻を `max(durationMs ± 70, resolvedAtMs + minSwingMs)` にした(描画遅延で `resolvedAtMs` が遅れても接触姿勢まで 60ms 以上を保つ。想定どおりの入力では設計の式と同値)。`seq` が偶数なら −70ms、奇数なら +70ms。`aim.visible` は入力があり、かつ中継カメラへ移る前だけ。ファウルも中継カメラが追う(追わせないなら foul のとき `chaseFromMs = null`。G の調整候補)。
  - 打球追跡中のカメラは 16ms あたり最大約 1.07m 動く(許容 1.5m 以内)。G で見え方を確認する。`finishedSeq` は GameScreen の再マウントで初期化される前提。
- ステップC3(`hooks/{useStage3d,usePitchFlight,usePointerInput,useBattingControls,useSkipInput}.ts`):
  - `useStage3d({ quality })` → `{ containerRef, stage, status, zoneRect, pickZone(clientX, clientY), getZoneRect() }`。生成 effect の deps は `[quality]` のみ。`pickZone`/`getZoneRect` は安定関数(ref 経由で最新のステージを読む)。`createStage` が `null` なら `status = "unsupported"`、非 null なら hook が `"ready"` を立てる。cleanup で `dispose()` → `stage`/`zoneRect` を `null`、`status` を `"loading"`。観客席のシードは hook 内定数 `CROWD_SEED`。
  - `usePitchFlight({ flight, arriveAfterMs, leadMs, timeScale, onArrive })` → `{ getElapsedMs }`(SVG 描画は削除)。開始時刻は `flight.seq` の layout effect で記録し、`flight` が `null` になっても保持する(**この layout effect だけ cleanup 無し**。規約1の「開始時刻を保持」と両立させるため。資源を持たない ref 代入なので StrictMode でも無害。コードコメントあり)。`onArrive` は `arriveAfterMs − leadMs` に1回。
  - `usePointerInput({ enabled, holding, swingReady, onSkip, pickZone, getZoneRect, getCursor, moveCursorTo, onSwing })` → `PointerHandlers`(input 面の div に展開)。pointerdown は `routeStagePointer` の結果で skip/swing/drag-start/ignore に分岐。pointermove はドラッグ中なら `zoneDeltaFromScreenDelta` の相対移動、それ以外は `enabled` のときマウス/ペンのみ絶対位置。`swing` で `pickZone` が `null` ならカーソルを動かさずスイング。
  - `useBattingControls({ enabled, holding, swingReady, cursorRadii, getElapsedMs, onSwing, onSkip, pickZone, getZoneRect })` → `{ getCursor, getCursorView, swingKind, setSwingKind, currentRadii, swingNow, pointerHandlers }`(`CursorView = { point, radii }` を export)。
  - `useSkipInput({ holding, onSkip })`: window の keydown を1リスナで購読し、`isSkipKey({ holding, key, repeat, targetTag })` が真なら `preventDefault()` して `onSkip()`。`targetTag` は `event.target.tagName` そのまま(大文字)、`routeStagePointer` の `pointerType` は `string` のまま渡す(C1 に連絡済み)。
  - `model/batting/cursor.ts` の `clientToZonePoint`・`ClientPoint`・`ViewRect` は hooks から参照されなくなった。knip で未使用 export になる場合は E 以降またはコードレビューで扱う。
- ステップB4a(`ui/{ScoreHud,NamePlates,Ticker,StageTelop}.tsx`・`ui/baseball-stage.css`):
  - E の DOM 構造: `.bb-page > [a.bb-home-link] + .bb-game(--batting|--pitching|--cpu) > [StageView(.bb-stage)] + .bb-overlay`。`.bb-overlay` は `.bb-overlay__top`(`ScoreHud`・`NamePlates`)と `.bb-overlay__bottom`(`Ticker`・`.bb-bar`)。`.bb-game` が `isolation:isolate`。z-index: 入力面1、テロップ・ヒント・フォールバック2、オーバーレイ3、`.bb-home-link` 1(`ResultScreen` は 10)。
  - `StageTelop`・`bb-stage__skip-hint`・`bb-stage__fallback` は `.bb-stage` の子。守備バーは `.bb-bar.bb-bar--pitch` 直下に `[PitchingControls, CourseGrid]` の順、打撃バーは `.bb-bar.bb-bar--swing` 直下に `SwingControls`。CPU 打撃時はバーを描かないか空にする(`.bb-bar:empty` は非表示)。
  - `NamePlates` は `margin-top` でホームのピルの下に収まる(E でヘッダを足さない)。`bb-stage__skip-hint` は 0.5 秒遅れてフェードインするので `holding` 中だけ描く。`StageTelop` の `text` は director 側で消えるまで保持する(`null` で即消える)。
  - 守備バー(スマホ縦)はティッカー込みで約 340〜355px(目安 330px より高め)。ゾーンとの重なりは G で `framingLift` とあわせて実測する。
  - 契約表に無い補助クラス(`bb-hud__head`・`bb-plate__*`・`bb-ticker__item` ほか)を `baseball-stage.css` に追加。`.bb-pitching` は `display: contents` ではなくサブグリッド(Playwright の可視判定のため)。
- ステップB4b(既存部品・タイトル・結果・`baseball.css`):
  - `TitleScreen`: `fieldset[data-testid=setting-innings|side|difficulty]` + `label[data-testid=setting-innings-<n>|setting-side-<away|home>|setting-difficulty-<easy|normal|hard>]` + 視覚的に隠した radio(`defaultChecked`、`FormData` で `onStart`)。**F は `toHaveValue` ではなくラベルをクリックし、中の radio の `checked` で確認する。**
  - `LineScore` の合計セルは `line-score-runs-<side>`(`score-away`/`score-home` は `ScoreHud` のみ)。`ResultScreen` は `position: fixed; z-index: 10`、`TitleScreen` は `position: absolute; inset: 0`(`.bb-title__body` が `z-index: 1`)。**E は `back-home` のピルがタイトルの上で押せることを確認する**(DOM 順を後ろにするか z-index を上げる)。
  - `CourseGrid` のセルは 44px(641px 以上かつ `hover:hover`・`pointer:fine` のときだけ 36px、`--bb-cell`)。
  - S11(b)「結果画面の略称+色チップ」は未達(`ResultView` に team 情報が無く props 不変のため)。必要なら E 以降で props 追加を判断し、ゲート2に引き継ぐ。
  - **未解決の重複(G で一本化する)**: 守備バー `.bb-bar--pitch` の配置(サブグリッド)を `baseball.css`(`.bb-bar.bb-bar--pitch`、詳細度が高い)と `baseball-stage.css`(`.bb-bar--pitch`)の両方が定義している。B4a・B4b が並行で互いに相手が持つと想定した結果。契約上は配置=`baseball-stage.css` なので、G は `baseball-stage.css` 側に寄せ、`baseball.css` からは部品内のスタイルだけを残す。

## 壁打ち(grilling)記録

承認ゲートの代替ではない(設計レビュー・人間確認ゲートは別途実施する)。

| # | 論点 | 人間の回答 | 設計への反映 |
| --- | --- | --- | --- |
| Q0 | モック方針の確認(2026-10-12) | ユーザーが Three.js の3Dモック([docs/designs/assets/2026-10-11-baseball-game-mock3d.html](assets/2026-10-11-baseball-game-mock3d.html))の方向を承認。重視点は「打撃画面の視点(捕手後方からボールが迫る)」「キャラクター(2頭身・モーション)」「打球の演出(球場に飛び野手が追う)」。実況テロップ・効果音は重視点外 | 本書全体(描画を Three.js の3Dで作り直す)、「見た目の受け入れ基準」、論点 N1〜N17 の前提 |
| Q1 | チーム色(論点 N9。当初案は攻撃=青・守備=赤の役割固定) | **チームごとに固定**(2026-10-12。「チームごとに変えるに決まってんだろ」)。ルミナス=青、ノーブルズ=赤など、チーム固有の色にして、攻守交代しても色が変わらない。打者は攻撃側チームの色、投手・捕手・野手は守備側チームの色になるよう、攻守交代時にキャラの色を切り替える | 論点表 N9(【壁打ち変更】)、「やること」、型契約(`Team.uniformColor`・`GameView.teamColors`/`uniforms`・`UniformColors`・`SceneFrame.uniforms`。`colorsOf`)、規約14(演出中は保持される表示用 view の `uniforms` を使い、3アウト目の演出中は旧配色)、world 設計(`sceneFrameAt` の `uniforms`)、render 設計(`createTeamMaterials`・`applyUniforms`、共有アクセント材質2つの色更新。render はチーム知識を持たない)、hooks 設計(`useStageDirector` の `uniforms`)、UI 設計(`ScoreHud` のチーム色チップ、クラス `bb-hud__chip`)、変更ファイル(`types/team.ts`・`data/teams.ts`・`teams.test.ts`・`test-fixtures.ts`)、受け入れ基準 S1(g)・S7、ステップ A・B3・B4a・C1・C2・C3・D・E・G、テスト戦略(`view.test`・`teams.test`・`frame.test`・`character.test`、構造検査 2、手動確認 11)、リスク |
| Q2 | 1球のテンポ(論点 N14。当初案は余韻のスキップなし) | **タップで演出スキップ可**(2026-10-12)。演出中(`holding` 中)に、ステージのタップ/クリック、または Space/Enter で、残りの演出(打球の飛行・余韻・テロップ)を即終了して次へ進める。人間打撃でスイング可能なとき(`swingReady`)はタップ=スイングなので、スキップは `holding` 中のみ有効で、スイング入力と衝突しない | 論点表 N14(【壁打ち変更】)、「やること」、規約9・13(`skip()`・入力の振り分け・キー)、world 設計(`input-route.ts` の `routeStagePointer`/`isSkipKey`)、hooks 設計(`useStageDirector.skip`・`useSkipInput`・`usePointerInput`/`useBattingControls` の `holding`/`onSkip`。ポリシー表)、UI 設計(`StageView` の `skipHint`、`bb-stage__skip-hint`)、ステップ C1・C3・D・E・F、テスト戦略(`input-route.test` の全組み合わせ、E2E テスト4=通常速度のスキップ、通常の進行テストはスキップを使わず `fast=1` のまま。構造検査 9、手動確認 10)、リスク(誤爆・即カット・結果画面の `autoFocus`) |
| Q3 | スコアの更新タイミング(論点 N8。推奨は `useHeldView`) | **演出の後に更新**(2026-10-12。推奨どおり `useHeldView` を入れる)。スキップした場合はスキップの時点で更新する | 論点表 N8(【壁打ち確定】)、hooks 設計(`useHeldView`。表示用 view と `uniforms` に使う)、規約13(スキップ直後に最新の view へ切り替え)、リスク、手動確認 4 |
| Q4 | 周辺 UI とデザイン(設計レビュー後のユーザー指示。追加の質問はしていない) | **「デザインとUIがクソだからなおせ」**(2026-10-12)。3D の作り直しに加えて、周辺 UI を「管理画面のようなパネル型」から「ゲーム画面らしいオーバーレイ型」に作り直す。ステージを全面に置き、スコア HUD(左上)・ネームプレート(右上)・実況ティッカー(下部)・操作バー(下部)・結果テロップ(中央)を重ねる。タイトルと結果もゲームらしく(ボタン群の選択肢、ぼかした背景と大きなスコア)。トーンは承認済みモックの世界観(丸ゴシック系のシステムフォント、白文字+濃い縁取り、半透明の濃紺パネル、黄のアクセント。AI 生成風の既定デザインは避ける) | 論点表 N7(【ユーザー指示】、オーバーレイ型の構成)・N11(全面ステージ、`framingLift`)・N16(タイトル・結果)・N17(トーン)、「目的」「やること」「やらないこと」、変更ファイル、フロントエンド構成(結論・ツリー・調整点 1・12)、型契約(`Team.shortName`・`ScoreRowView.shortName`)、render 設計(`framingLift`・`setViewOffset`)、UI 設計(レイアウト図、コンポーネント構成、props、クラス名の契約、テーマとトーン、testid 表)、ステップ A・A2・B3・B4a/B4b・C2・E・F・G、受け入れ基準 S6・S8〜S11、テスト戦略(`view.test`・`teams.test`・`look.test`、E2E テスト2・4 の更新とテスト5(幾何検証)、構造検査 7・10・11、手動確認 12)、リスク |

(以降の行は、本書の他の論点(N5・N11 の相対ドラッグ・N15 ほか)の壁打ちで追記する。)

---

スキル化候補: なし(適用した decision/convention/pitfall エントリの `related_topics` は、いずれも `baseball-game` の1件のみ)。
