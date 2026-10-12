# 設計: ブラウザ野球(1試合モード・CPU対戦)— 画面の Three.js 3D 化(第1版の描画層を置き換える改訂)

- 日付: 2026-10-12
- ステータス: レビュー待ち
- 対応する調査ドキュメント: [docs/investigations/2026-10-11-baseball-game.md](../investigations/2026-10-11-baseball-game.md)(第1版と共通。本改訂のための追加調査は行っていない。根拠は下記のテストレポート・承認済みモック・frontend-designer 案)
- 第1版の設計: [docs/designs/2026-10-11-baseball-game.md](2026-10-11-baseball-game.md)(承認済み・実装済み。以下「第1版」)
- 改訂の契機(テストレポート): [docs/tests/2026-10-11-baseball-game.md](../tests/2026-10-11-baseball-game.md)(ゲート2「設計からやり直し」)
- 承認済みモック(Three.js r128 の3Dモック、2026-10-12 にユーザー承認): [docs/designs/assets/2026-10-11-baseball-game-mock3d.html](assets/2026-10-11-baseball-game-mock3d.html)(以下「モック」)
- 承認者: (承認ゲート通過時に記入)
- 承認日: (承認ゲート通過時に記入)

**本書は第1版の描画層を置き換える改訂である。ロジック層(`model/` のルール・判定・CPU・データ)・テスト・ルールは第1版の定義を引き継ぐ(参照先は次節の表に明記)。** 第1版のファイルは履歴として無改変とし、描画・演出・画面構成・hooks のうち描画に関わる部分・E2E・手動確認については本書が優先する。

## 本書の位置づけ(第1版との関係)

### 経緯

1. 2026-10-11: 第1版(DOM+SVG の平面表示)を実装し、自動テスト(frontend 29ファイル・749件)・型・lint・ビルド・E2E・コードレビューまで通過した。
2. 同日のユーザー試遊でゲート2「設計からやり直し」。理由は「どこがパワプロなんだよ、昭和のレトロゲームより酷い」。期待は「捕手後方からボールが迫る打撃画面」「2頭身のキャラクター」「打球が球場に飛ぶ演出」で、第1版はこれらを設計時に「やらないこと」へ入れていた(共有メモリ [[visual-scope-must-be-shown-at-gate1]])。ロジック面の不具合は報告されていない。
3. Canvas 2D の疑似3Dモックは不合格。
4. 2026-10-12: Three.js の3Dモックをユーザーが承認。重視点は **打撃画面の視点(捕手後方からボールが迫る)・キャラクター(2頭身・モーション)・打球の演出(球場に飛び野手が追う)** の3つ。実況テロップ・効果音は重視点に含まれない。
5. 本書は 4 の方針で描画層を作り直す設計である。同日の壁打ちで、チーム色・演出スキップ・スコア更新のタイミングが確定した(末尾「壁打ち記録」)。

### 第1版から引き継ぐもの(変更しない)

| 領域 | 本書での扱い | 参照先(第1版) |
| --- | --- | --- |
| ルール・判定・CPU・データ(`model/` の `rng`・`pitch`・`batting`・`cpu`・`data`・`game`) | ロジックは無改変。**加算のみ**: `game/view.ts` の `outcome`・`teamColors`・`uniforms`、`Team.uniformColor`(チームデータ。描画色で、判定・乱数に影響しない)。reducer・`GameState` は不変 | 「モデル設計(`model/`)」全節、「設計の既定値と論点」#1〜#13・#15〜#19 |
| 型(`types/` の `common`・`pitch`・`batting`・`game`・`actions`、`team`・`view` の既存部分) | 無改変。`team.ts` に `uniformColor`、`view.ts` に `outcome`・`teamColors`・`uniforms` を加算するのみ | 「型設計(`types/`)」 |
| 起動パラメータ・再生速度(`?seed=&innings=&fast=1`、開発ビルドのみ、`timeScale`) | 無改変。`timeScale` は演出時間にも適用する | 「起動パラメータと再生速度」、論点 #8・#11・#16 |
| hooks(`useGame`・`useCpuTurn`・`useAnimationFrame`・`useKeyboardInput`・`useLatest`・`useLaunchParams`・`random-seed`) | 無改変 | 「hooks 設計」 |
| 表示コンポーネント(`TitleScreen`・`Scoreboard`/`LineScore`/`CountLamps`/`BaseDiamond`・`MatchupPanel`・`SwingControls`・`PitchingControls`・`PitchKindButtons`・`CommentaryLog`・`ResultScreen`) | props・ロジック・testid は無改変。見た目だけ CSS テーマで変える | 「UI 設計」の props 表・testid 対応表 |
| ルーティング(`routes/`、`#/baseball`)、ドキュメント運用 | 無改変 | 「アーキテクチャ・変更概要」 |
| 静的解析規約 | 継承し、three 固有の規約を追加 | 「静的解析・規約への対応」、[[sample-app-lint-random-and-index-access]] |
| 自動テスト | 既存749件の**アサーションは無改変**(`view.test.ts`・`teams.test.ts` は追記のみ、`test-fixtures.ts` は `Team` の新フィールドを足すだけ) | 「テスト戦略」 |

### 本書が置き換える・廃止する第1版の記述

- 「やらないこと」の「打球の軌道アニメーション・野手モデル」「Canvas 描画の導入」: **打球アニメーションと野手の表示は本書で「やること」に移した**(守備判定は引き続きやらない)。描画は Three.js を導入して行う。
- 「やること」の簡易フィールド図と論点 #14: 3D 球場での打球演出に置き換えて廃止する(`FieldDiagram` 削除)。
- 「全体方針」の「連続値は ref 経由で SVG 属性を直接更新する」: 毎フレーム `SceneFrame` を three に適用する方式に置き換える。
- 「UI 設計」のコンポーネント構成・props 表・レイアウト・testid 表のうち、`BattingView`・`StrikeZoneSvg`・`FieldDiagram`・`baseball-field.css` と、testid `field-diagram`・`batting-view`・`zone-svg`・`ball`・`swing-cursor`。
- 「hooks 設計」の `usePitchFlight`・`usePointerInput`・`useBattingControls`(変更)と、新規 `useStage3d`・`useStageDirector`・`useHeldView`・`useGameStage`・`useSkipInput`。
- 「実装ステップ」(14ステップ)は本書の実装ステップに置き換える。「テスト戦略」のうち E2E・手動確認・構造検査は本書で更新する(単体テストの合格基準は第1版のまま)。
- 「ロールバック方針」は本書のものに置き換える。

## 目的・スコープ

### 目的

第1版の試遊不合格(視点・キャラクター・打球演出が無い)を解消するため、試合画面を **Three.js の3D** で作り直す。承認済みモックの世界観(デーゲームの球場、捕手後方の打撃カメラ、2頭身トゥーンキャラ、中継カメラでの打球追従、結果テロップ)を、既存のゲームロジック(判定・CPU・ルール)にそのまま接続する。判定は変えず、見た目と操作体験の層だけを置き換える。

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
- **HUD(イニング・スコア・BSO ランプ)と操作パネル**(スイング/投球、コース選択、対戦情報、スコアボード、実況ログ)。**スマホ縦画面に対応**する。
- 入力: 3D ステージ上でのスイングカーソル操作(マウスは絶対位置、タッチは相対ドラッグ。キーボード・「スイング」ボタンは第1版のまま)。
- `GameView.outcome`(解決した1球の事実)・`teamColors`・`uniforms` を `model/game/view.ts` に、`Team.uniformColor` をチームデータに**加算的に**追加する(reducer・`GameState` は不変)。
- テーマをモック基調のダークに変更し、`GameScreen` を `React.lazy` で遅延ロードする(`/` とタイトル画面のバンドルに three を含めない)。
- E2E・`sample-app/README.md`・`docs/process/sample-app-dev.md` の更新。

### やらないこと(スコープ外)

- **送球・走塁アニメーション**(打者走者・走者の移動、塁上の走者の3D 表示、ゴロ捕球後の送球動作を含む)。野手は落下点に到達するまでの演出のみ。
- **守備操作・守備判定**。野手の動きは演出であり、判定(`resolvePitch` の結果)には一切関与しない。
- **効果音・BGM**(サウンド全般。重視点外)。
- **画像・3Dモデル素材の外部読み込み**(テクスチャ画像・GLTF・外部フォントを含む)。形状・テクスチャはすべてコードで生成する。
- **react-three-fiber / drei / three addons / Phaser / Pixi / 状態管理ライブラリ**の導入。
- 実況の拡充(音声、イニング別演出、リプレイ)。テロップは結果1行のみ。
- 物理シミュレーション(打球軌道は演出用の閉形式。判定・得点とは独立)。
- 判定・CPU・ルール・バランスの変更(第1版のまま)。スキップも表示の短縮だけで、試合の状態には触れない。
- ユニフォームの色以外のチーム差(縞・帽子マークの違い、チームロゴ)。
- モバイル実機での検証(Playwright の `hasTouch`+viewport 縮小で確認するのみ)、Playwright のモバイル project 追加。
- 第1版の「やらないこと」のうち描画に関わらないもの(育成・守備走塁の操作・盗塁/バント/代打/継投・コールド・結果保存・「パワプロ」等の名称の使用・backend/shared の変更・react-router 導入 等)は引き続きスコープ外。

### 見た目の受け入れ基準

共有メモリ [[visual-scope-must-be-shown-at-gate1]] の適用。第1版の失敗(見た目の帰結をゲート1で見せなかった)を繰り返さないため、**ゲート1では承認済みモックと本節の基準を提示する**。実装後は、モックと実装のスクリーンショットを並べ、下記チェックリストで判定する。

**比較の方法**

- モック側: `docs/designs/assets/2026-10-11-baseball-game-mock3d.html` を Playwright(または通常のブラウザ)で開いて撮る。モックは three r128 と Google Fonts を CDN から読むため、到達できない環境では `three@0.128.0` を scratchpad に取得し、`<script src>` を差し替えたコピーで撮る(モック本体は改変しない)。
- 実装側: `cd sample-app && npm run dev:frontend` で開き、`/?seed=<固定値>&innings=3#/baseball` を開始して撮る。`stage-3d[data-phase]`(`idle`/`windup`/`flight`/`play`)を目印にして、飛行中・打球中は **50ms 間隔の連写(最大40枚)** から該当フレームを選ぶ。
- 画面サイズ: デスクトップは 1280×720、スマホ縦は 390×844(`hasTouch`)。
- 判定者と手順: ステップ G の implementer が自己判定して調整し、`/test` の tester が撮り直して判定し、ゲート2で人間が最終確認する。
- **ピクセル差分は使わない**(キャラクターの配置、HUD、ゲーム状態、時刻が一致しないため意味がない)。判定は下記チェックリストの〇×。1項目でも × なら不合格として調整に戻す。「同等以上」とは、各項目でモックの見え方と同等以上であること。

| 画面 | 実装側の撮り方 | モック側の撮り方 | 判定項目(すべて〇で合格) |
| --- | --- | --- | --- |
| S1 打撃画面(待機) | 人間先攻で開始直後、`data-phase="idle"` | 起動直後(t≈0.3s) | (a) カメラが捕手後方(高さ約1.25m)から投手方向を向き、**手前左に打者、奥の中央に投手**が見え、両者の全身が画面内に収まる (b) 打者と投手の間に**白いゾーン枠**と**黄色のスイングカーソル**(半透明の楕円+輪郭リング+中心点)が見える (c) 空のグラデーション、縞の芝、内野の土、ベース、ファウルライン、緑のフェンスと黄色の縁、観客席(ドット柄)、霧による遠景の霞が見える (d) キャラクターが2頭身で、トゥーンの段階影・黒い輪郭線・目のハイライト・頬・帽子とマークを備える (e) 品質 normal で人物とベースに影が落ちる (f) 左上に回表裏・両チームのスコア・B/S/O ランプの HUD があり、両チーム名の横にチーム色のチップがある (g) **打者が攻撃側チームの色、投手・捕手・野手が守備側チームの色**で、ルミナス攻撃時(後攻で開始して表の守備を終えた後など)はモックと同じ配色(打者=青、守備=赤) |
| S2 投球中 | `data-phase="flight"` の連写 | t≈1.0〜1.4s | (a) ボールが**投手の手から離れ**、ゾーンに向かって大きくなりながら進む (b) ボールに黒い輪郭線と地面の影がある (c) 投手がワインドアップ→投球→フォロースルーの動きをする |
| S3 スイング〜接触 | `data-phase="flight"` 終盤〜`play` 冒頭の連写 | t≈1.55〜1.75s | (a) 打者の体が回転し、バットが水平に振られる (b) スイング中にカーソルが強調(濃くなる)される (c) 空振り時はバットがボールの位置を外して通過する |
| S4 打球追従(ヒット) | `data-phase="play"` の連写(後攻で開始し CPU 打者のヒットを待つか、人間打撃でヒットを打つ) | 「ヒット」ボタンの再生中 | (a) 接触後、約0.5秒かけて**高い位置の中継カメラへ滑らかに移る**(瞬間切替ではない) (b) 打球(ボールと影)と、**落下点へ走る最寄りの野手**が同時に画面内に見え、他の野手は打球の方を向く (c) 捕手が現れ、ゾーン枠とカーソルは消える (d) ゴロはバウンドし、ライナーは低く、フライは高い放物線になる |
| S4' 打球追従(ホームラン) | 同上(ホームランは数試合試してよい。出ない場合は単体テストの端点検証で代替し、その旨を報告) | 「ホームラン」ボタンの再生中 | (a) 打球がフェンスを越えて観客席へ飛び、カメラが追う (b) 野手は走らず打球を見送る |
| S5 テロップ | 打球の落下時 / 空振り時 / ボール・ストライク時 | 打球落下時・空振り時 | (a) 画面中央やや上(上から約38%)に**黄色の太字+黒い縁取り+影**の大きな文字が、0.18秒で拡大しながら現れる (b) 文言が結果に対応する(例: センター前ヒット!/ホームラン!!/空振り!) |
| S6 スマホ縦 | 390×844 で S1 と S4 相当 | (基準なし。絶対基準) | (a) ステージの全幅で打者・投手・ゾーン枠が見える(ゾーン枠の画面上の幅が 70px 以上) (b) HUD がステージ内に収まる (c) スイング/投げるボタンが 44px 以上で、ステージと同じ画面(スクロールなし)に入る |
| S7 攻守交代の配色 | 守備側が3アウト目を取る打球〜次の半イニングの待機画面の連写(後攻で開始すると最初に起きる) | (基準なし。絶対基準) | (a) 打者=攻撃側チームの色、投手・捕手・野手=守備側チームの色(ルミナス=青、ノーブルズ=赤) (b) **3アウト目の打球演出が終わるまでは旧配色のまま** (c) 次の半イニングの待機画面から、打者と守備側の配色が入れ替わる (d) HUD のチップの色がユニフォームの色と一致する |

**動き・体験の確認(手動)**: 通常速度(`fast` なし)で人間打撃を10球以上行い、(1)ボールが捕手後方のカメラに向かって迫って見える (2)空振り・見逃し・ファウル・インプレーのうち少なくとも2種類が起きる (3)ヒットでは中継カメラに切り替わり野手が走る (4)演出中にタップ/クリック/Space でスキップでき、次の投球に進む(スイング可能な間のタップはスイングになり、スキップにならない)、ことを確認する。操作の遅延や極端なフレーム落ちがないことを目視する(実機の数値計測は行わない)。

### 設計の判断と論点(壁打ち用)

本改訂で新たに置いた判断を N1〜N15 として並べる(第1版の #1〜#19 は上記のとおり引き継ぐ)。推奨を決めたうえで、壁打ちで確認したい論点を明記する。**N8・N9・N14 は壁打ち(2026-10-12)の人間回答により確定/変更した**(行頭に【壁打ち確定】/【壁打ち変更】と記す。経緯は末尾「壁打ち記録」)。数値は初期値で、実装後のステップ G と試遊で調整する。

| # | 項目 | 設計での決定(推奨) | 根拠 | 壁打ちで確認したい論点 |
| --- | --- | --- | --- | --- |
| N1 | 描画方式 | Three.js(npm)を命令的 API で使い、`render/` に閉じる。react-three-fiber・Phaser・Pixi・three addons は使わない | モックが Three.js で承認済み。r3f は「ui は dumb」の方針と衝突し、model の純粋性・テスト容易性も損なう | three 追加(遅延チャンクで数百KB)は許容か |
| N2 | three の版 | `three@0.186.1` + `@types/three` を同一リビジョン(0.186.x)で。公開(2026-09-24)から2週間以上経過。ステップ0で `npm view` して確定。モック(r128)との差(色管理・ライト強度の単位・`RedFormat`・`outputColorSpace`)は `render/look.ts` に集約し、見た目基準で受け入れる | 最新の安定版を使う。r128 固定は型・保守の面で不利 | r128 に固定してモックとの差を無くす案(不採用)でよいか |
| N3 | `model/world/` | three 非依存の純粋関数群。表示専用の数学なので、`model/` の再現性規約(`sin/cos/log/exp/hypot` 禁止)の**適用外**。`Math.random`・`Date`・`performance`・`window`・`document` の禁止は適用 | 結果が `GameState` に戻らない。三角関数なしでは自然な動きを作りにくい。決定: [[frontend-3d-three-in-render-segment]] | — |
| N4 | 演出状態の置き場 | hooks のローカル状態(ref+少数の state)。reducer・`GameState`・既存749テストは変えない。次の投球を止める `holding` ゲートと、解決した球の事実 `GameView.outcome` を加算する | reducer は `SWING`/`PITCH_ARRIVED` で即解決し `phase` は `await-pitch` に戻るため、演出の長さを `GameState` は持てない | — |
| N5 | 接触の見た目の時刻 | ファウル/インプレーの接触は `durationMs`(ボールがゾーンに着く時刻)に固定して描く。バットは `durationMs − 132ms` から振り始める。判定の Δt(±150ms)と見た目は一致しない(見た目のごまかし)。人間の遅いクリック(Δt>0)では接触がクリック時刻まで遅れ、ボールがミット方向へ少し進んでから接触位置に戻って飛ぶ(最大150ms) | 判定窓を広く取っており、Δt ごとに接触の位置をずらすと軌道の連続性が崩れる | 遅れたクリックでボールが一瞬ずれて見える挙動を許容するか(目立てば判定待ち中だけボールを非表示にする案へ切替) |
| N6 | CPU 打者の解決の前倒し | CPU 打者の `PITCH_ARRIVED` を `durationMs − 150ms` に前倒しして送る(hooks 側。reducer・`decideCpuBat` は `flight.durationMs` 基準なので結果は不変) | 結果(空振り/ファウル/ヒット)を接触の150ms前に知り、スイングの演出を結果と整合させるため | — |
| N7 | Scoreboard の置き場 | **既存 `Scoreboard`(回別得点を含む完全版・全 testid)は操作パネル側**(デスクトップは右、スマホ縦はステージの下)に置き、**ステージ内の左上には装飾用の `StageHud`(`aria-hidden`、testid なし、イニング・両チーム得点とチーム色のチップ・B/S/O ランプ)を重ねる** | モックの HUD と同じ見え方で、ステージを覆わない(9回制の回別得点表は幅が大きく、スマホ縦で上段に置くとステージが下に押される)。testid は `Scoreboard` 側の1つだけ | HUD と Scoreboard で情報が二重になるが、よいか。HUD に塁(ダイヤモンド)を足すか |
| N8 | スコアの更新タイミング | 【壁打ち確定】**演出の後に更新する**。`useHeldView` が `holding` 中は直前の `GameView` を表示用に保持し、スコア・カウント・実況ログ・HUD・対戦情報は演出が終わってから(スキップした場合はスキップした時点で)更新する。操作可否や演出の入力には最新の view を使う | ホームランの瞬間にスコアと実況ログが先に変わると、テロップと打球演出の価値が下がる。推奨どおり確定 | — |
| N9 | チーム色 | 【壁打ち変更】**チームごとに固定**(ルミナス=青 `0x2f63c8`、ノーブルズ=赤 `0xe8473c`。モックの配色)。色は `Team.uniformColor`(チームデータ)に持たせ、`GameView.teamColors`(サイド別。HUD のチップ用)と `GameView.uniforms`(攻撃/守備の役割別。描画用)として渡す。打者=攻撃側チームの色、投手・捕手・野手=守備側チームの色。攻守交代で `SceneFrame.uniforms` が入れ替わり、render は**共有のアクセント材質2つ(攻撃用・守備用)の色を更新するだけ**(キャラクターは1組のまま)。**3アウト目の打球演出中は旧配色を保つ**(director は演出中も保持される表示用 view(N8)の `uniforms` を使う) | ユーザー回答「チームごとに変えるに決まってんだろ」。`render/` がチーム知識を持たない構造を保てる。キャラクターを2組持つと draw call とメモリが倍になる | 青/赤の組み合わせでよいか。色以外のチーム差(縞・帽子マーク)は今回不要でよいか |
| N10 | コース選択(人間守備) | DOM の `CourseGrid` を操作パネルに置く(通常フロー、各セル44px以上)。3D 側は選択セルのハイライト(`aim`)と5×5の格子線のみ | スマホ縦でゾーン上に重ねるとセルが約23pxになり44pxのタップ目標を満たせない | — |
| N11 | スマホ縦の打撃入力 | ステージの縦横比を 4:5、FOV を縦横比に応じて広げて打者を画面内に収める。**タッチは相対ドラッグ**(指の移動量×ゾーンの画面上の大きさ比でカーソルを動かす。指がゾーンを隠さない)。マウスは絶対位置(レイキャスト) | 3D ではゾーンが第1版の約半分の大きさになり、絶対位置のタッチでは精度が出ず指で隠れる | 相対ドラッグでよいか(実機未検証) |
| N12 | 簡易フィールド図(第1版 #14) | 廃止し、3D の打球演出に置き換える。`fieldMarker` は testid `batted-ball-marker` の非表示 DOM ミラーとして残す(E2E・手動確認用) | 打球は球場そのものに映る | — |
| N13 | テーマ | モック基調のダーク(`--bb-*` 変数の値を差し替え)。外部フォントは使わずシステムフォント(`"Hiragino Maru Gothic ProN", "Yu Gothic", sans-serif`)。ページ背景は `body:has(.bb-page)` で、ホーム(`/`)へ漏らさない | モックの世界観。外部通信を増やさない | — |
| N14 | 1球のテンポと演出スキップ | 【壁打ち変更】**タップで演出をスキップできる**。windup 0.7秒 + 飛行約1.4秒 + 余韻(見逃し・ボールは判定後約0.7秒、インプレーは落下後約1.3秒)で、ボール・ストライクは約3秒、インプレーは約5〜6秒、3回制の試合は約5〜6分(第1版は約3分)。**`holding` 中に限り**、ステージのタップ/クリック、または Space/Enter で残りの演出(打球の飛行・余韻・テロップ)を即終了して次へ進める(`useStageDirector.skip()`)。スイング可能な間(`swingReady`)のタップはスイングで、スキップは `holding` 中だけ有効。入力の振り分けは純関数 `routeStagePointer`/`isSkipKey` に集約する。スキップは表示だけを飛ばし、reducer・`GameState` に触れない。E2E は通常は使わず(`fast=1` で短い)、スキップ専用のテストを1本追加する | ユーザー回答でスキップ可。`holding` と `swingReady` は同時に真にならない(次の投球は演出が終わってから始まる)ため衝突しないが、純関数で優先順位(`holding` が優先)を固定して保証する | スキップ後は即カット(打撃カメラへ戻る)でよいか。スキップ中のヒントを出す(`bb-stage__skip-hint`)のでよいか |
| N15 | WebGL が使えないとき | ステージに「3D表示を使えません」を出し、試合は続行できる(時計とゲートは renderer に依存しない)。SVG フォールバックは作らない | 第1版の SVG 描画は廃止する。ロジックと操作は有効のまま | フォールバック表示を作る価値があるか |

## アーキテクチャ・変更概要

### 全体方針

- 3D 描画は Three.js を命令的に使い、**`render/` セグメントに閉じる**([[frontend-3d-three-in-render-segment]])。位置・軌道・ポーズ・カメラ・時刻表・テロップ文言・入力の振り分けは three 非依存の純粋関数 `model/world/` に置き、vitest(node)でテストする([[pure-function-extraction]])。
- 演出の駆動は「**時刻 t の純関数 → プレーンデータ `SceneFrame` → `StageHandle.apply`**」。毎フレーム、`useStageDirector` が `sceneFrameAt(input)` を呼んで `stage.apply(frame)` に渡す。three のオブジェクトは `render/` の外に出ない。**チーム固有の知識(色)は `Team.uniformColor` → `GameView` → `SceneFrame.uniforms` のプレーンな数値で渡し、`render/` はチームを知らない。**
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
| 新規 | `features/baseball/types/{scene,stage}.ts` | 描画契約(`SceneFrame`・`UniformColors`・`StageHandle` ほか) |
| 変更(加算) | `features/baseball/types/team.ts`、`model/data/teams.ts`・`teams.test.ts`、`model/game/test-fixtures.ts` | `Team.uniformColor`(チーム色)を加算。ルミナス=青、ノーブルズ=赤 |
| 変更(加算) | `features/baseball/types/view.ts`、`model/game/view.ts`・`view.test.ts` | `PitchOutcomeView`・`GameView.outcome`・`teamColors`・`uniforms` を加算(既存 model への加算変更) |
| 新規 | `features/baseball/model/world/` | 3D の純粋計算(座標・軌道・野手・ポーズ・カメラ・時刻表・テロップ・入力の振り分け)+各テスト |
| 新規 | `features/baseball/render/` | three のビルダーと `createStage`+smoke テスト |
| 新規/変更 | `features/baseball/hooks/` | `useStage3d`・`useStageDirector`・`useHeldView`・`useGameStage`・`useSkipInput`(新規)、`usePitchFlight`・`usePointerInput`・`useBattingControls`(変更) |
| 新規/変更/削除 | `features/baseball/ui/` | `StageView`・`StageHud`・`StageTelop`・`baseball-stage.css`(新規)、`GameLayout`・`GameScreen`・`BaseballGamePage`・`baseball.css`・`CourseGrid.tsx`(変更)、`BattingView`・`StrikeZoneSvg`・`FieldDiagram`・`baseball-field.css`(削除) |
| 変更 | `sample-app/frontend/e2e/baseball.spec.ts` | `field-diagram` の待機を `stage-3d` に差し替え。WebGL 非対応でも進行するテストと、演出スキップのテストを追加 |
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
| 次の投球を止める | 演出終了(またはスキップ)まで `holding`(render 中に `view.outcome` と `finishedSeq` から導出) | effect でフラグを立てると1 commit の隙間で `useCpuTurn` が先走る |
| 演出に必要な事実 | `GameView.outcome`(`PitchOutcomeView`)を `model/game/view.ts` に**加算的に**追加 | 解決した1球の種別・インプレーの結果・打席の終わり方が view に無い。reducer・state は不変 |
| チーム色 | ★ `Team.uniformColor`(データ)→ `GameView.uniforms`/`teamColors` → `SceneFrame.uniforms` | render にチーム知識を持たせない。N9 |
| 演出のスキップ | ★ `useStageDirector.skip()`。入力の振り分けは純関数(`routeStagePointer`/`isSkipKey`)で、`holding` 中のみスキップ、それ以外は従来のスイング/ドラッグ | スイング入力との衝突を型と表で保証する。N14 |
| 3D の純粋計算 | `model/world/`(新規)。React/DOM/three 非依存、vitest(node)可。座標は `Vec3`、回転は `Rot3`(three の Euler XYZ rad と同義) | 正しさの本体をテスト可能にする |
| three のコード | 新セグメント `render/`(標準5セグメントへの意図的追加) | three を1か所に閉じる。DOM/GL に触れるのは `render/stage.ts` だけ |
| model と render の接続 | hooks のみ。契約は `types/scene.ts`・`types/stage.ts` | 互いに import しない兄弟にする |
| `StageHandle` の置き場 | `types/stage.ts` | `useStage3d`(hooks)と `render/stage.ts` を並列実装できる |
| 入力 | `Raycaster` でゾーン平面に当てる。`usePointerInput`/`useBattingControls` は SVG 依存を外して流用、`useAnimationFrame` はそのまま、`usePitchFlight` は SVG 描画を捨てて時計と到達通知のみ | 現行のポリシーを保つ(タッチのみ N11 で相対ドラッグへ) |
| コース選択 | DOM の `CourseGrid` を操作パネルに置く。3D 側は選択セルのハイライトのみ | N10 |
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
    ├── e2e/baseball.spec.ts                   [変更] field-diagram → stage-3d の待機に差し替え(他は維持)、★ WebGL 非対応でも進行するテストと演出スキップのテストを追加
    └── src/features/baseball/
        ├── types/
        │   ├── scene.ts   [新規] Vec3, Rot3, CameraPose, CharacterPose, BatPose, BatterPose, ★UniformColors, SceneFrame, ScenePhase
        │   ├── stage.ts   [新規] StageGeometry, CrowdCell, ★CharacterRig, ScreenRect, StageStatus, StageQuality, StageOptions, StageHandle
        │   ├── team.ts    [変更] ★ Team.uniformColor を加算
        │   └── view.ts    [変更] PitchOutcomeView 追加、GameView.outcome / ★teamColors / ★uniforms 追加
        ├── model/
        │   ├── rng/ pitch/ batting/ cpu/    [既存] 無改変
        │   ├── data/teams.ts, teams.test.ts [変更] ★ uniformColor(ルミナス=青、ノーブルズ=赤)と、その検証を追記
        │   ├── game/view.ts, view.test.ts   [変更] outcomeOf / ★colorsOf を追加(state・reducer 不変)。★test-fixtures.ts は Team の新フィールドを足すだけ
        │   └── world/                            [新規]
        │       ├── space/{params,vec3,coords,geometry,crowd}.ts
        │       │     params: WORLD_PARAMS(ゾーン実寸・リリース点・ミット・守備位置・カメラ・演出時間(ゲームms)・CPU_SWING_LEAD_MS ほか)
        │       │     coords: zoneToWorld / worldToZone / cellToWorld / landingToWorld((x,0,-y)。本塁原点、センター方向 -z) / ★zoneDeltaFromScreenDelta
        │       │     geometry: buildStageGeometry()(塁・フェンス半径・守備位置。フェンス半径105・塁間27.4は LANDING_PARAMS から)
        │       │     crowd: buildCrowdPattern(seed)(createRng 使用)
        │       ├── path/{pitch-path,batted-path,fielders}.ts
        │       │     pitchBallAt(flight, elapsedMs): t=durationMs で zoneToWorld(landing) に厳密一致 / ★mittBallAt(flight, sinceArrivalMs)
        │       │     planBattedBall(ball, result, seq, start) / planFoul(seq, start) / battedBallAt(plan, sinceContactMs)。落下点は computeBattedLanding を呼ぶ
        │       │     pickFielder(target), ★fielderRunAt(from, to, progress)
        │       ├── camera/rig.ts   battingCamera / chaseCamera / blendCamera(状態なし、t の閉形式。モックの lerp 平滑化は使わない)
        │       ├── motion/{rig,pose,pitcher,batter,fielder,fk}.ts   ★rig: CHARACTER_RIG / キーフレーム表(関数外データ定数)+ sampleKeyframes + lerpPose(明示フィールドごと) / ★fk: 手先位置の順運動学(リリース点の検証用)
        │       └── sequence/{play-plan,frame,telop,input-route}.ts   planPlay({flight,outcome,swing,resolvedAtMs}) → PlayPlan / sceneFrameAt(input) → SceneFrame(唯一の外向き)/ telopFor(outcome, landing) / telopAt(plan, tMs) / ★input-route: routeStagePointer・isSkipKey(スキップとスイングの振り分け)
        │       (各 .ts に *.test.ts 同居。params・types のみのファイルを除く)
        ├── render/                                [新規] import は types/ と three のみ
        │   ├── look.ts        色管理・ライト強度・フォグ・輪郭線太さ・パレット・★fovFor(aspect)・★gradientPixels(モック r128 との差の吸収点)
        │   ├── stadium.ts     buildStadium(geometry, crowd)(テクスチャは DataTexture。CanvasTexture/document 不使用で node 生成可)
        │   ├── character.ts   buildCharacter(rig, style): 2頭身トゥーン+背面法輪郭線。{root, joints, bat}。★ createTeamMaterials / applyUniforms(攻撃用・守備用の共有アクセント材質の色を更新)
        │   ├── pose-apply.ts  applyPose / applyBatterPose(明示フィールド代入)
        │   ├── markers.ts     ゾーン枠・5×5格子・スイングカーソル・狙いセルのハイライト・ボールと影
        │   ├── dispose.ts     disposeObject3D(root)
        │   ├── stage.ts       createStage(opts): StageHandle | null(WebGLRenderer/canvas 生成・破棄、ResizeObserver、apply、pickPlane、zoneScreenRect)。唯一 DOM と GL を触る
        │   └── look|stadium|character|pose-apply|markers|dispose の *.test.ts(smoke のみ)
        ├── hooks/
        │   ├── useStage3d.ts       [新規] createStage の生成/破棄/リサイズ、pickZone、ゾーン画面矩形
        │   ├── useStageDirector.ts [新規] 演出 session(ref)・毎フレーム sceneFrameAt→apply・holding/telop/throwing の公開・★skip()
        │   ├── useHeldView.ts      [新規] ★ holding 中は直前の GameView を表示用に保持(N8)
        │   ├── useSkipInput.ts     [新規] ★ holding 中の Space/Enter でスキップ(N14)
        │   ├── useGameStage.ts     [新規] ★ 上記と usePitchFlight・useBattingControls・useCpuTurn を合成(GameScreen を薄く保つ)
        │   ├── usePitchFlight.ts   [変更] SVG 描画(ballRef/ballRadius)削除。時計と到達通知のみ。flight 終了後も開始時刻を保持、CPU 打者の前倒し(leadMs)
        │   ├── usePointerInput.ts  [変更] 要素型を HTMLElement に一般化、pickZone 注入式、タッチは相対ドラッグ、★ pointerdown を routeStagePointer で振り分け(スキップ/スイング/ドラッグ)
        │   ├── useBattingControls.ts [変更] svgRef/cursorRef/applyCursor/useLayoutEffect 削除、getCursor を返す、★ holding・onSkip を受ける
        │   └── その他             [既存]
        └── ui/
            ├── StageView.tsx        [新規] キャンバス容器・入力面・テロップ・hud スロット・★スキップのヒント・data-* ミラー
            ├── StageHud.tsx         [新規] ★ ステージ内 HUD(イニング・両チーム得点とチーム色のチップ・B/S/O。aria-hidden、testid なし)
            ├── StageTelop.tsx       [新規] 結果テロップ(DOM オーバーレイ)
            ├── GameLayout.tsx       [変更(書き換え)] StageView + 操作パネル
            ├── GameScreen.tsx       [変更] useGameStage 配線、ResultScreen の遅延表示
            ├── BaseballGamePage.tsx [変更] css import 名、GameScreen を lazy+Suspense
            ├── baseball-stage.css   [新規] baseball-field.css の置換
            ├── baseball.css         [変更] ダークテーマ変数(モック基調)、FieldDiagram/StrikeZone 規則削除、CourseGrid 通常フロー化
            ├── CourseGrid.tsx       [変更(コメントのみ)]
            ├── StrikeZoneSvg.tsx, FieldDiagram.tsx, BattingView.tsx, baseball-field.css   [削除]
            └── Title/Scoreboard系/MatchupPanel/SwingControls/PitchingControls/PitchKindButtons/CommentaryLog/ResultScreen [既存]
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
| `model/world` | 座標変換・軌道・野手・ポーズ・カメラ・時刻表・`SceneFrame` 合成・テロップ文言・スキップ/スイングの振り分け(入力+t → プレーンデータの純関数) | three/React/DOM/`Math.random`/`Date`/`performance`、`GameState` への書き戻し |
| `render` | `SceneFrame` を three に適用、球場/キャラ生成、材質・輪郭線、ユニフォーム色の更新、破棄 | `model` の import、ゲーム知識・チーム知識、乱数。DOM/GL は `stage.ts` のみ |
| `hooks/useStage3d` | キャンバスのライフサイクル・リサイズ・`pickZone` | ゲーム判断 |
| `hooks/useStageDirector` | view の事実(`flight`・`outcome`)から演出 session を作り、毎フレーム `sceneFrameAt` → `apply`。`holding`/`telop`/`throwing` を公開し、`skip()` で演出を打ち切る | 判定、reducer への書き込み |
| `ui/StageView` ほか | 容器・入力面・オーバーレイ DOM・`data-*` ミラー | `model`/`render` の import |

#### 標準構成からの意図的逸脱

(1) `App.tsx` は `src/` 直下のまま(第1版) (2) `model/` のサブフォルダ分割(第1版) (3) `api/`・`src/shared/` を作らない(第1版) (4) **`render/` セグメントを標準5セグメントへ追加**(three を閉じ込める) (5) **`model/world/` を追加**(3D の純粋計算)。

#### frontend-designer 案からの調整点(designer)

1. **`StageHud` を追加**(N7): ステージ内の装飾用 HUD。`aria-hidden`・testid なしにして `Scoreboard` との testid 重複を避ける。チーム色のチップを持つ(N9)。
2. **チーム固有色に対応**(N9): frontend-designer 案の `SceneFrame` に `uniforms: UniformColors`(攻撃側/守備側の色)を含めた。色は `Team.uniformColor` → `GameView.uniforms` → `SceneFrame.uniforms` と流れ、render は共有アクセント材質2つの色を更新するだけでチームを知らない。
3. **`CharacterRig` を `types/stage.ts` に置いた**: 関節の寸法(腰・肩・手先の位置)を `world/motion/rig.ts`(データ)と `render/character.ts`(形状)で二重に持たないため。`StageOptions` で `render` に渡す(`motion` が `space` に依存すると B1/B2 を並列にできない)。
4. **`useHeldView`・`useGameStage` を追加**(N8): 表示用の view 保持と、複数 hook の合成。
5. **`mittBallAt`・`fielderRunAt`・`zoneDeltaFromScreenDelta`・`fk.ts`・`fovFor` を追加**: 判定待ちの間のボール、野手の移動、タッチの相対ドラッグ、リリース点の機械検証、縦横比ごとの FOV のため。
6. **`vite.config.ts` を「要検証」の変更に追加**: `React.lazy` の遅延ロードで依存の再最適化リロードが出る場合の対策(E2E の安定化)。
7. **ステップに G(見た目の突き合わせと数値調整)を追加**: 受け入れ基準が見た目なので、B3 のブラインド調整に頼らず、全体が動いた後に実測する。
8. **演出スキップの追加**(N14): `useStageDirector.skip()`、`useSkipInput`(キー)、`usePointerInput` の振り分け、純関数 `input-route.ts`(`routeStagePointer`・`isSkipKey`)。`useKeyboardInput` は変更せず、`useSkipInput` を別 hook にして既存の Space/Enter(スイング)と排他に保つ。

#### リスク・要検証事項(frontend-designer より、本書の「リスク・トレードオフ」に統合)

- 構造検査は機械強制ではない(grep)。`no-restricted-imports` の追加は別判断([[feature-segment-import-boundaries-not-enforced]])。
- hooks/ui は単体テスト不可 → E2E と手動。`eslint-plugin-react-hooks` 未導入([[react-hooks-lint-not-installed]])のため、`useLatest`・cleanup の徹底と hooks の重点レビューで代替する。
- headless Chromium での WebGL が最大の不確実性(ステップ0で実測)。

### 時間軸・ゲートの規約

3D 演出と reducer の時刻を整合させるための規約。以降の全ステップがこれに従う。

1. **時計は1本**: `usePitchFlight.getElapsedMs()`(リリース = `flight` 出現からの経過ゲーム時間 ms。`timeScale` 適用済み)。スイング時刻 `atMs` と演出時刻は同じ時計。開始時刻は **`useLayoutEffect`** で記録し(`flight` 出現直後の1フレームに古い値が見えないようにする)、`flight` が `null` になっても**次の `flight` が出るまで保持**する(人間がスイングすると `view.flight` は即 `null` になるが、演出は続くため)。
2. **windup はリリース前の別区間**で、壁時計を `speed.cpuWaitMs` で 0〜1 に正規化した `u` で表す。`u = 1` がリリース直前のポーズ。リリース後のフォロースルーはゲーム時間 `t`(`pitcherFollowMs`)で再生する。`u = 1` のポーズと `t = 0` のポーズは一致させる(連続性をテストで固定)。
3. **ボールの本塁通過 = `flight.durationMs`**(`pitchBallAt` のテストで固定)。通過後は `mittBallAt` が `mittMs`(150ms)かけて捕手ミットへ進む(人間打者の判定窓 `contactWindowMs` と同じ長さ)。
4. **ファウル/インプレーの見た目の接触時刻は `contactMs = max(durationMs, swing.atMs)`**(CPU 打者はスイング入力を持たないので `durationMs`)。バットは `swingStart = contactMs − 132ms`(`swing.durationMs 200ms × contactRatio 0.66`)から振り始める。人間のクリックが `swingStart` より遅ければ**途中の姿勢から**再生し、早ければ `swingStart` まで構えて待つ。クリックが `durationMs` より遅い(Δt>0)接触では、`atMs` までボールがミット方向へ進んでから接触位置に戻って飛ぶ(最大150msのずれ。N5 のごまかしとして許容し、手動確認で見え方を確認する。目立つ場合はボールを判定待ちの間だけ非表示にする案へ切り替える)。
5. **空振りは `atMs` から再生**(人間)。CPU の空振りは入力が無いので、接触姿勢の時刻を `durationMs ± missOffsetMs`(70ms。`seq` の偶奇で早/遅)にずらして、タイミングを外したスイングに見せる。見逃しは振らない。
6. **CPU 打者の `PITCH_ARRIVED` を前倒し**: `leadMs = CPU_SWING_LEAD_MS`(150ms。`world/space/params.ts`)として、`arriveAfterMs − leadMs` に送る。`decideCpuBat` は `flight.durationMs` 基準でディスパッチ時刻に依存しないため、reducer・view・テストは不変。人間打者は `leadMs = 0`(従来どおり `durationMs + contactWindowMs`)。
7. **人間スイング後も director が `flight` を session に保持**して演出を続ける。`outcome.seq` で session の `flight` と対応づける。対応する `flight` が無い(想定外)場合は、演出なしで即座に `finishedSeq` を更新して進行を止めない。
8. **すべての演出時間はゲーム時間で定義**し、`timeScale` で壁時計に換算する(`fast=1` の E2E を短く保つ)。windup のみ壁時計(`cpuWaitMs`)。
9. **`holding`(演出中)**: `view.outcome !== null && view.outcome.seq !== finishedSeq` を **render 中に導出**する。`holding` は演出の終了(`plan.endMs` 到達)または**スキップ**(規約13)で `finishedSeq` が更新されて解除される。`holding` の間は次を止める: ①`useCpuTurn` の `cpuPitchPending`(`view.cpuPitchPending && !holding`)、②`PitchingControls` の `ready`(`view.pitchReady && !holding && !throwing`)、③`ResultScreen` の表示(`view.result !== null && !holding`)。`pitch-controls` の `data-ready` は②と一致させる。
10. **3D が描けなくても進行する**: director の毎フレーム処理は、`stage` が `null`(WebGL 不可・context lost)でも plan の進行と `finishedSeq` の更新を行う(`apply` だけを省く)。これを満たさないと `holding` が解除されず試合が止まる。スキップも `stage` に依存しない。
11. **人間守備の windup**: 「投げる」押下で同期的に `throwing = true`、`cpuWaitMs` 後に `throwPitch(selection)`(タイマーは cleanup で解除)。CPU 守備は `useCpuTurn` の待機(`cpuWaitMs`)を windup の長さとして使い、`cpuPitchPending && !holding` の立ち上がりで windup を始める。
12. **品質**: `speed.timeScale > 1`(`fast=1`)のとき `createStage` に `quality: "low"`(影なし、`pixelRatio` 1、`antialias` なし)。`import.meta.env` を参照するのは `useLaunchParams.ts` のみ(品質は `speed` から決める)。
13. **演出のスキップ(N14)**: `useStageDirector.skip()` は **`holding` 中だけ**有効で、`finishedSeq` を現在の `view.outcome.seq` に更新し、plan・telop を破棄し、`phase` を `idle` に戻す(次のフレームで打撃カメラ・待機姿勢へ即カット。`playKind` もクリア)。`holding` でないときは何もしない。reducer・`GameState`・乱数に触れない(表示だけを飛ばす)。スキップの直後、表示用の view は最新の view に切り替わる(N8。スコア・実況が更新される)。次の投球は従来どおり windup から始まる(CPU 守備なら `cpuWaitMs` 後)。
    - **入力の振り分け**(`routeStagePointer`、pointerdown のみ): **`holding` が真なら常にスキップ**(`swingReady` や `enabled` に関係なく。主ボタン/主ポインタのみ。それ以外は無視)。`holding` が偽のときは従来どおり、人間打撃中(`enabled`)のマウス/ペンの主ボタンは「カーソルを移動してスイング」(スイング可否は `swingReady` で `swingNow` が判定)、タッチは「ドラッグ開始」、人間打撃中でなければ無視。`holding` と `swingReady` は同時に真にならない(次の投球は演出が終わってから始まる)が、同時に真になった場合も `holding` を優先してスイングを出さない。スキップに使った pointerdown は、スイングにもドラッグ開始にも使わない。
    - **キー**(`isSkipKey`): Space/Enter の keydown で、`holding` が真、`event.repeat` が偽、かつ target がリンク・select・input・textarea でないときスキップし、`preventDefault` する。`useKeyboardInput`(スイング)は `swingReady` のときだけ Space/Enter を扱うので排他。
    - 入力面(`bb-stage__input`)のハンドラは人間打撃中以外も常時つなぐ(CPU 打者のとき、人間守備のときもスキップできる)。`touch-action: none` は人間打撃中だけ。
14. **ユニフォーム色の切替(N9)**: director は `SceneFrame.uniforms` の元に、`useHeldView` が保持する**表示用の view の `uniforms`** を使う。3アウト目の打球演出中は保持される view が旧半イニングのものなので旧配色のまま、`holding` が解除された(演出の終了またはスキップ)次のフレームから新配色になる。render は `uniforms` が前回と変わったときだけアクセント材質の色を更新する。

**演出時間表**(ゲーム ms。初期値。`WORLD_PARAMS` に外出しし、ステップ G と試遊で調整):

| 区間 | 開始 | 長さ | 備考 |
| --- | --- | --- | --- |
| windup | 壁時計(`cpuWaitMs` = 700ms、`fast` で 20ms) | 1.0 に正規化 | リリース前 |
| 飛行 | `t = 0` | `durationMs` | 投手のフォロースルーは `t = 0` から `pitcherFollowMs` 400ms |
| ミット | `durationMs` | 150ms | 見逃し/空振り/人間の判定待ち |
| スイング | `contactMs − 132` | 200ms(`contactRatio` 0.66) | カーソルは同区間 `flash` |
| 打球 | `contactMs` | 滞空: フライ `700 + 17×距離`、ライナー `500 + 11×距離`、ゴロ `250 + 30×距離` | 距離は落下点(m)。ファウルは別式 |
| カメラ | `contactMs` | 位置 500ms(smoothstep)、注視点 250ms | 打撃カメラ→中継カメラ |
| 野手の走行 | `contactMs` | 滞空 × 1.15 | 最寄りの1人のみ |
| テロップ | インプレー: 落下時 / 空振り: 接触姿勢 / 見逃し・ボール: `max(durationMs, resolvedAtMs)` | インプレー 1100、ファウル・空振り 700、見逃し・ボール 500 | `StageTelop` の DOM |
| 余韻 | テロップ終了後 | 200ms | `endMs = telop.endMs + 200` で `holding` 解除(スキップで前倒し) |

### 型契約(`types/` の追加)

`types/` は並列実装タスク間の契約で、実行時コードを持たず、プロパティはすべて `readonly`、省略は `T | null`(`exactOptionalPropertyTypes`)。**ステップ A で凍結し、並列中の不足は編集せず完了報告で上申する**(orchestrator がウェーブ間で直列に反映)。

- `types/team.ts`(加算)
  - `Team.uniformColor: number`(24bit RGB。例: 青 `0x2f63c8`)。描画色であり、判定・乱数・バランスには影響しない。`data/teams.ts` が設定し、ルミナス=青(`0x2f63c8`)、ノーブルズ=赤(`0xe8473c`)。
- `types/view.ts`(追加)
  - `PitchOutcomeView = { seq: number; kind: "ball" | "called-strike" | "swinging-strike" | "foul" | "in-play"; inPlay: { result: InPlayResult; ball: BattedBall } | null; plate: PlateOutcome | null }`
    - `seq` は解決した投球の通し番号(= その球の `flight.seq`)。`inPlay` は `kind = "in-play"` のときのみ非 `null`。`plate` は打席が終わった球のみ(`walk`/`strikeout`/`InPlayResult`)。
  - `GameView.outcome: PitchOutcomeView | null`(`state.lastResult` が `null` の間は `null`)。
  - `GameView.teamColors: { away: number; home: number }`(サイド別のチーム色。HUD のチップ用)、`GameView.uniforms: UniformColors`(攻撃側チームの色と守備側チームの色。描画用)。
  - `outcomeOf(state)`(`model/game/view.ts`、約15行): `state.lastResult`・`lastPlate`・`pitchSeq`・`phase` から作る。**`phase` が `in-flight` の間は `lastResult` が前の球のものなので `seq = pitchSeq − 1`、それ以外は `seq = pitchSeq`**(次の投球が始まっても `outcome.seq` が変わらず、`holding` が誤って立たない)。乱数を使わず、state を変更しない。
  - `colorsOf(state)`(`model/game/view.ts`): `teamColors = { away: teams.away.uniformColor, home: teams.home.uniformColor }`、`uniforms = { offense: 攻撃側(`offenseSide(half)`)チームの色, defense: 守備側チームの色 }`。乱数を使わず、state を変更しない。
- `types/scene.ts`(新規)
  - `Vec3 = { x: number; y: number; z: number }`、`Rot3 = { x: number; y: number; z: number }`(three の Euler XYZ、rad)。座標系: **本塁原点、+x = 右(ライト側)、+y = 上、−z = センター方向**、単位は m。
  - `CameraPose = { position: Vec3; target: Vec3; fovDeg: number }`
  - `CharacterPose = { visible: boolean; position: Vec3(足元); yaw: number; scale: number; torso: Rot3; head: Rot3; armL: Rot3; armR: Rot3; legL: Rot3; legR: Rot3 }`
  - `BatPose = { visible: boolean; sweepYaw: number; tilt: number; height: number }`(モックの `swing.rotation.y`・`batTilt.rotation.x`・グループの高さ)、`BatterPose = CharacterPose & { bat: BatPose }`
  - `UniformColors = { offense: number; defense: number }`(24bit RGB。打者=`offense`、投手・捕手・野手=`defense`)
  - `ScenePhase = "idle" | "windup" | "flight" | "play"`
  - `SceneFrame = { camera: CameraPose; uniforms: UniformColors; ball: { visible: boolean; position: Vec3 }; pitcher: CharacterPose; catcher: CharacterPose; batter: BatterPose; fielders: readonly CharacterPose[](固定順 7人: 一塁・二塁・遊撃・三塁・左・中・右); zone: { visible: boolean; grid: boolean }; cursor: { visible: boolean; position: Vec3; scaleX: number; scaleY: number; flash: boolean }; aim: { visible: boolean; position: Vec3; width: number; height: number } }`
- `types/stage.ts`(新規)
  - `StageGeometry`: 地面・内野の土と芝・マウンド・ラバー・塁・本塁・ファウルライン・打席ボックス・フェンス(半径は `LANDING_PARAMS.fenceRadius`)・スタンド・屋根の寸法(モックの `flat(...)`/`arc(...)`/`BoxGeometry` の値を転記したフィールド。**フィールド名はステップ A の実装者が定義し、B1(生成側)と B3(消費側)はそれに従う**)。
  - `CrowdCell = { col: number; row: number; paletteIndex: number }`(観客席の点の配置。色は `render/look.ts` のパレットが解決する)。
  - `CharacterRig = { hipX: number; hipY: number; torsoY: number; shoulderX: number; shoulderY: number; headY: number; armLength: number }`(関節の寸法。初期値はモックの 0.14/0.5/0.55/0.36/0.48/0.98/0.38)。
  - `ScreenRect = { left: number; top: number; width: number; height: number }`(**キャンバス左上基準**の CSS px)、`StageStatus = "loading" | "ready" | "unsupported" | "lost"`、`StageQuality = "normal" | "low"`。
  - `StageOptions = { container: HTMLElement; geometry: StageGeometry; crowd: readonly CrowdCell[]; rig: CharacterRig; quality: StageQuality; onStatusChange: (status: StageStatus) => void; onResize: (size: { width: number; height: number }) => void }`
  - `StageHandle = { apply(frame: SceneFrame): void; resize(width: number, height: number): void; pickPlane(clientX: number, clientY: number): Vec3 | null; zoneScreenRect(): ScreenRect | null; dispose(): void }`
  - `createStage(options: StageOptions): StageHandle | null` のシグネチャ(`render/stage.ts` が実装し、WebGL 不可なら `null`)。関数そのものは実行時コードなので `types/` に置けない。ステップ C2 と C3 はこのシグネチャを契約として並列実装する。
- `model/world` 内部の型(`types/` には置かない。`render` は参照しない): `PlayPlan`・`BattedPlan`・`SceneFrameInput`・`StagePointerAction`(下記「world 設計」)。`hooks/` は `model/world` から import してよい。

### world 設計(`model/world/`)

すべて純粋関数(入力+時刻 → プレーンデータ)。数値は**初期値**で `space/params.ts`(`WORLD_PARAMS`)に外出しする。モック由来の値はモックを正とする。

**座標・寸法(`space/`)**

| 項目 | 初期値 | 由来・備考 |
| --- | --- | --- |
| ゾーン実寸 | 半幅 x ±0.26m、y 0.42〜1.02m(中心 0.72、半高 0.30)、z = 0.03 | モック `ZONE`。`zoneToWorld(p) = (p.x×0.26, 0.72 + p.y×0.30, 0.03)`。ゾーン外(±2まで)も線形に外挿 |
| リリース点 | (−0.30, 1.65, −18.1) | 投手(右投げ)の手先。投手の release ポーズから `fk.ts` で求めた手先位置と 0.15m 以内(テストで固定) |
| ミット | z = 1.6、y = `landing.y − 0.2` | モックの `endZ`・`target.y − 0.2` |
| 投手 | 足元 (0, 0.25, −18.4)、yaw 0 | モック。マウンド高 0.25 |
| 捕手 | (0, −0.25, 1.3)、yaw π | モック。打撃カメラの視界を遮るため、中継カメラの `blend ≥ 0.35` になってから `visible` |
| 打者 | (−0.85, 0, 0.05)、yaw π/2、頭は投手側へ | モック。右打ち固定(引っ張り=レフト側 x<0 と整合) |
| 野手7人(x, z) | 一塁 (16.5,−23)、二塁 (6,−32.5)、遊撃 (−7,−32.5)、三塁 (−16.5,−23)、左 (−38,−72)、中 (0,−86)、右 (38,−72)。scale 1.15 | モック `FIELD_POS` |
| 打撃カメラ | 位置 (0, 1.25, 3.4)、注視 (0, 1.0, −18)、fov 34° | モック `BATTING_CAM`。テストでモックの値に固定 |
| 中継カメラ | 位置 = (ball.x×0.45, 16 + ball.y×0.35, 22 + ball.z×0.45)、注視 = (ball.x, max(0, ball.y×0.6), ball.z)、fov 34° | モックの式。位置の blend 500ms、注視点の blend 250ms(smoothstep) |
| 球場寸法 | 塁間 27.4(= `LANDING_PARAMS.baseDistance`、塁の座標は (±19.4, −19.4)/(0, −38.8))、フェンス半径 105(= `LANDING_PARAMS.fenceRadius`。**モックの100から変更**)、スタンドの内側 109〜外側 147、高さ 34、屋根半径 155 | モックの寸法を転記。本塁の五角形は**尖りを捕手側(+z)に向ける**(モックは投手側向きだった) |
| フォグ | 色 0xb9d9f2、near 150、far 320 | モック |

**`space/`**

- `vec3.ts`: `lerpVec3`・`addVec3`・`distanceXZ` ほか最小限。
- `coords.ts`: `zoneToWorld(ZonePoint) → Vec3`、`worldToZone(Vec3) → ZonePoint`(ゾーン平面への逆写像)、`cellToWorld(CourseCell) → Vec3`(`cellToPoint` → `zoneToWorld`)、`landingToWorld({x, y}) → Vec3`(`(x, 0, −y)`)、`zoneDeltaFromScreenDelta(dx, dy, rect: ScreenRect) → ZonePoint`(ゾーン枠の画面矩形の幅・高さを ±1 に対応させた差分。dy は下向きが正)。
- `geometry.ts`: `buildStageGeometry() → StageGeometry`。`crowd.ts`: `buildCrowdPattern(seed) → readonly CrowdCell[]`(`createRng` を使い決定論。32×16 セル)。

**ボール軌道(`path/`)**

- `pitchBallAt(flight, elapsedMs) → Vec3`: 進行度 `p = clamp(elapsed / durationMs, 0, 1)`。`aim' = zoneToWorld(landing) + bendWorld`(`bendWorld = getPitchSpec(kind).bend × 半幅/半高 × bendGain(2.5)`)に向かって直進し、**終盤に曲がる**: `pos = lerp(release, aim', p) − bendWorld × p³ + (0, arcHeight × 4p(1−p), 0)`(`arcHeight` 0.12)。`p = 1` では `zoneToWorld(landing)` を直接返す(浮動小数の誤差を避ける)。`p = 0` はリリース点に厳密一致。z は単調に増える。
- `mittBallAt(flight, sinceArrivalMs) → Vec3`: `landing` からミット位置へ `mittMs`(150ms)で線形に進み、以降はミット位置。`sinceArrivalMs = 0` は `pitchBallAt(flight, durationMs)` に厳密一致。
- `planBattedBall(ball, result, seq, start: Vec3) → BattedPlan`: `BattedPlan = { start: Vec3; end: Vec3; peak: number; hangMs: number; hops: number; shape: "fly" | "liner" | "ground"; overFence: boolean }`。`end` の x・z は `computeBattedLanding(ball, result, seq)` の `landingToWorld`(= `GameView.fieldMarker` と同値)。`y`: ホームラン以外は 0、ホームランはスタンド斜面の高さ(`StageGeometry` から算出)。`peak`・`hangMs` は打球タイプ別の式(上の時間表。フライの頂点 = `0.24 × 距離`、ライナー `0.08 ×`、ゴロ 0 でバウンド3回・高さ 0.35m から減衰)。
- `planFoul(seq, start) → BattedPlan`: `seq` の偶奇と黄金比数列で、ファウルライン外側(|x| > |z|)への飛球、またはバックネット方向(z>0)への飛球を決定論的に作る。
- `battedBallAt(plan, sinceContactMs) → Vec3`: `p = clamp(s / hangMs, 0, 1)`。xz は線形、y はフライ/ライナーが `lerp + 4·peak·p(1−p)`、ゴロはバウンド(`y ≥ 0`)。`p = 1` では `plan.end` を直接返す。
- `fielders.ts`: `FIELDER_SLOTS`(固定順7人)、`pickFielder(target: Vec3) → number`(XZ 距離が最小の野手。同距離は添字の小さい方)、`fielderRunAt(from, to, progress) → Vec3`(線形)。

**カメラ(`camera/rig.ts`)**: `battingCamera()`、`chaseCamera(ball: Vec3) → CameraPose`、`blendCamera(a, b, k) → CameraPose`、`easeInOut(x)`(smoothstep)。いずれも**状態を持たず t の閉形式**(モックのフレーム依存の lerp 平滑化は使わない)。

**モーション(`motion/`)**: `CHARACTER_RIG`(`rig.ts`)、`lerpPose`・`sampleKeyframes`(`pose.ts`)、`pitcherWindupPose(u)`・`pitcherFollowPose(sinceReleaseMs)`、`batterStancePose()`・`batterSwingPose(progress, height)`(`progress` 0〜1 がスイング、1〜1.4 がフォロースルー)、`fielderIdlePose()`・`fielderRunPose(timeMs)`・`catcherPose()`、`handPosition(pose, rig, root)`(`fk.ts`)。キーフレーム表は関数外のデータ定数(初期値はモックの `posePitcher`/`poseBatter`/`runPose` の式を表に起こしたもの。投手の腕は上から前へ振り抜く動きに直し、リリース時に手先が `RELEASE_POINT` を通るようにする)。関節角の範囲は ±2π、隣接フレーム(16ms)の変化は 0.5rad 以内(スイングの最大速度を許容しつつ、切替点の飛びを検出できる値)。

**時刻表と合成(`sequence/`)**

- `planPlay({ flight, outcome, swing: SwingInput | null, resolvedAtMs }) → PlayPlan`(純関数・決定論)。`PlayPlan = { seq: number; kind: PitchOutcomeView["kind"]; durationMs: number; resolvedAtMs: number; swing: { startMs: number; contactAtMs: number; height: number } | null; contactMs: number | null; batted: BattedPlan | null; fielder: { index: number; from: Vec3; to: Vec3; startMs: number; arriveMs: number } | null; chaseFromMs: number | null; telop: { text: string; startMs: number; endMs: number }; endMs: number }`。`swing.height` はインプレー/ファウルでは `landing` の世界 y、人間の空振りでは `swing.cursor` の世界 y。
- `sceneFrameAt(input) → SceneFrame`(唯一の外向き関数)。`SceneFrameInput = { phase: ScenePhase; tMs: number; windupU: number; flight: PitchFlight | null; plan: PlayPlan | null; uniforms: UniformColors; cursor: { visible: boolean; point: ZonePoint; radii: CursorRadii }; aim: CourseCell | null; grid: boolean }`。`frame.uniforms` は `input.uniforms` をそのまま写す(どの `uniforms` を渡すかは director が決める。規約14)。ボールの位置は、`contactMs` より前は `pitchBallAt`(`tMs ≤ durationMs`)/`mittBallAt`(それ以降。plan が無い人間打者の判定待ちを含む)、インプレー/ファウルの `contactMs` 以降は `battedBallAt`(落下後は終点に留まる)。アクターごとの小関数(`pitcherFrame`・`batterFrame`・`ballFrame`・`cameraFrame` ほか)に分け、各 60行以内にする。
- `telopFor(outcome, landing)`・`telopAt(plan, tMs) → string | null`(下表)。
- `input-route.ts`(入力の振り分け。純関数): `routeStagePointer({ holding, enabled, swingReady, pointerType, isPrimary, button }) → StagePointerAction`(`"skip" | "swing" | "drag-start" | "ignore"`。`swing` は「カーソルを移動してスイングを試みる」)と、`isSkipKey({ holding, key, repeat, targetTag }) → boolean`。判定表は規約13のとおり(`holding` が最優先)。

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

- **共通**: `import` は `types/` と `three` のみ。名前付き import のみ(`import * as THREE` 禁止、addons 不使用)。three オブジェクトは `getObjectByName` で探さず、ビルダーが返す参照を保持する。関数は60行以内(球場は部品ごとの小関数に分割)。`exactOptionalPropertyTypes` のため three のオプションに `undefined` を渡さない。チーム名・チーム id・`Team` は扱わない。
- `look.ts`: 色管理・ライト・フォグ・パレット・輪郭線の太さ(1.07)・`fovFor(baseFovDeg, aspect)`・`gradientPixels(stops, height)`・ユニフォーム色の既定値(最初の `apply` までの仮の色。モックの青/赤)を集約する、**モック(r128)との差の吸収点**。第一候補は r128 の描画経路の再現: `ColorManagement.enabled = false` + `renderer.outputColorSpace = LinearSRGBColorSpace`、ライト強度は r128 の値に π を掛けた値(物理単位への換算)。見た目が合わなければステップ G で再調整する。`fovFor` は縦横比が小さいとき、ゾーン平面での画面の半幅が約 1.25m(`tan` 換算 0.37)以上になるよう縦 FOV を広げる(16:10 では 34° のまま、4:5 で約 50°)。
- `stadium.ts`: `buildStadium(geometry, crowd)`。地面(縞の芝)・内野・マウンド・塁・本塁・ファウルライン・打席ボックス・フェンス・スタンド(観客のドット柄)・屋根・空・ライト。テクスチャは **`DataTexture` のみ**(`CanvasTexture`・`document` を使わず node で生成可能)。ピクセル配列は `Uint8Array.from(...)` を使うヘルパーに集約する(変数添字の書き込みを避ける)。
- `character.ts`: `buildCharacter(rig, style) → { root, joints: { torso, head, armL, armR, legL, legR }, bat }`。モックの `makePlayer` を再現(脚・靴・胴・ベルト・縞・頭・帽子・つば・マーク・目・ハイライト・頬・腕・手、グローブ、バット)。`MeshToonMaterial` + 3段の `gradientMap`(`DataTexture`、`RedFormat`、`NearestFilter`)+ 背面法の輪郭線。`buildLeg`/`buildTorso`/`buildHead`/`buildFace`/`buildArm`/`buildBat` に分割する。**ユニフォームのアクセント色(ベルト・縞・帽子・つば)は `style.accent`(共有の `MeshToonMaterial`)を使う**。`createTeamMaterials(gradient) → { offense, defense }` が攻撃用・守備用の2材質を作り、打者は `offense`、投手・捕手・野手は `defense` を共有する。`applyUniforms(materials, uniforms)` は2材質の `color` を `uniforms.offense`/`uniforms.defense` に更新する(変化があるときだけ呼ぶ)。
- `pose-apply.ts`: `applyPose(parts, pose)`・`applyBatterPose(parts, pose)`(明示フィールドの代入)。
- `markers.ts`: ゾーン枠、5×5格子、スイングカーソル(塗り・リング・中心点、`depthTest` なし)、狙いセルのハイライト、ボール(輪郭線つき)と地面の影。`SceneFrame` の該当部分を適用する関数を持つ。
- `dispose.ts`: `disposeObject3D(root)`(geometry・material・texture を破棄)。
- `stage.ts`: `createStage(options)`。canvas は**自分で生成**して `container` に追加し、`dispose` で remove する(StrictMode の二重 mount 対策)。`WebGLRenderer` の生成に失敗したら `null`。`ResizeObserver` で `resize` と `onResize`。`webglcontextlost` で `onStatusChange("lost")`、復帰で `"ready"`。`apply(frame)` は camera・fov(`fovFor`)・ユニフォーム色(`frame.uniforms` が前回から変わったときだけ `applyUniforms`)・各ポーズ・マーカーを更新して描画する。`pickPlane`/`zoneScreenRect` は**最後に `apply` されたカメラ**(打撃中は打撃カメラ)で計算する: `pickPlane` はキャンバス矩形でレイを作りゾーン平面と交差、`zoneScreenRect` はゾーン枠の4隅を投影した矩形。`quality: "low"` は影なし・`pixelRatio` 1・`antialias` なし。**`document`・`window`・`ResizeObserver`・`WebGLRenderer` を使うのはこのファイルだけ**。

### hooks 設計

| hook | 変更 | 内容 |
| --- | --- | --- |
| `useStage3d({ quality, uniforms })` | 新規 | `containerRef`・`stage`(state)・`status`・`zoneRect`・`pickZone(clientX, clientY)`(`stage.pickPlane` → `worldToZone`。平面と交差しなければ `null`)・`getZoneRect()` を返す。`useEffect` で `createStage`、cleanup で `dispose`。生成直後に idle の `SceneFrame`(`uniforms` は引数の初期値)を1回 `apply` してカメラとユニフォーム色を確定させ、その後 `zoneRect` を更新する。`buildStageGeometry`・`buildCrowdPattern`・`CHARACTER_RIG` を `StageOptions` に渡す(静的データは model で作り hooks 経由で render へ渡す)。`createStage` が `null` なら `status = "unsupported"` |
| `usePitchFlight({ flight, arriveAfterMs, leadMs, timeScale, onArrive })` | 変更 | SVG 描画(`ballRef`/`ballRadius`)を削除。開始時刻を `useLayoutEffect` で記録し、`flight` が `null` になっても保持。`arriveAfterMs − leadMs` で `onArrive` を1回。`getElapsedMs()` を返す |
| `usePointerInput({ enabled, holding, swingReady, onSkip, pickZone, getZoneRect, getCursor, moveCursorTo, onSwing })` | 変更 | 対象要素を `HTMLElement`(入力面の div)に一般化。**pointerdown は `routeStagePointer` の結果で分岐する**(`skip` → `onSkip()` のみ。`swing` → カーソル移動+`onSwing()`。`drag-start` → 相対ドラッグの開始。`ignore` → 何もしない)。pointermove は従来どおり(`enabled` のときカーソルに反映)。下表のポリシー |
| `useBattingControls({ enabled, holding, swingReady, cursorRadii, getElapsedMs, onSwing, onSkip, pickZone, getZoneRect })` | 変更 | `svgRef`/`cursorRef`/`applyCursor`/`useLayoutEffect` を削除し、`getCursor` を返す。カーソル位置は ref(`INITIAL_CURSOR` から)。`swingKind`・`currentRadii`・`swingNow`・`pointerHandlers` は従来どおり。`holding`・`onSkip` を `usePointerInput` へ渡す |
| `useSkipInput({ holding, onSkip })` | 新規 | `window` の keydown を購読し、`isSkipKey` が真なら `preventDefault()` して `onSkip()`。cleanup でリスナ解除。`useKeyboardInput`(スイング)は変更しない |
| `useStageDirector({ view, stage, getElapsedMs, getCursorView, swingRef, aimCell, uniforms, speed })` | 新規 | 下記。`getCursorView()` は `{ point, radii }` を返す getter(循環を避ける) |
| `useHeldView(view, holding)` | 新規 | `holding` が偽の間は最新の view を `ref` に保存(effect)し、真の間は保存した直前の view を返す。表示用(スコアボード・HUD・MatchupPanel・実況)と、director に渡す `uniforms` にのみ使う |
| `useGameStage({ game, speed, selection })` | 新規 | `usePitchFlight`・`useStage3d`・`useBattingControls`・`useStageDirector`・`useHeldView`・`useSkipInput`・`useCpuTurn`(`cpuPitchPending && !holding`)を合成し、`GameScreen` が使う値(表示用 view・`holding`・`throwing`・操作関数・`StageView` 用の props)を返す。director と `useBattingControls` の循環(カーソル ↔ `holding`/`skip`)は ref 経由の getter で切る |

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

**`useStageDirector` の責務**(React state は `finishedSeq`・`telop`・`throwing`・`lastFlight`・`phase`・`playKind` のみ。session は ref):

- **session**: `flight`(`view.flight` が非 `null` になるたび、`useLayoutEffect` で更新)、`plan`、`windupStartedAtMs`。`view.outcome` の `seq` が変わったら(`useLayoutEffect`)、`planPlay({ flight, outcome, swing: swingRef.current, resolvedAtMs: getElapsedMs() })` を作る。
- **毎フレーム**(`useAnimationFrame(cb, "stage")` 常時): `phase` を決め(plan あり → `play`、`view.flight` あり → `flight`、windup 中 → `windup`、それ以外 → `idle`)、`sceneFrameAt` の入力(`uniforms` は引数の表示用 view のもの)を組み立てて `stage?.apply(frame)`。`t ≥ plan.endMs` で `setFinishedSeq(plan.seq)`・plan を破棄。`telopAt`・`phase` が変わったときだけ `setTelop`・`setPhase`。**`stage` が `null` でも plan の進行は行う**(規約10)。関数は「入力の組み立て」「進行の判定」「反映」に小さく分ける。
- **windup**: CPU 守備は `cpuPitchPending && !holding` の立ち上がりで `performance.now()` を記録(`u = (now − start) / cpuWaitMs`)。人間守備は `startThrow(onRelease)` を公開し、押下で `throwing = true`・windup 開始・`cpuWaitMs` 後に `onRelease()`(タイマーは unmount の cleanup で解除)。`throwing` は `view.flight` が出たら偽に戻す。
- **`skip()`**(規約13): `holding` のときだけ、`finishedSeq` を現在の `view.outcome.seq`(最新の view を `useLatest` 経由で参照)に更新し、plan・telop を破棄して `phase`/`playKind` を戻す。冪等(連続して呼んでも2回目以降は `holding` でないので何もしない)。タイマーや rAF を止めず、次のフレームから `idle` の `SceneFrame` を描く。
- **公開**: `holding`(render 中に導出)、`throwing`、`telop`、`phase`、`playKind`(演出中の `outcome.kind`)、`lastFlight`(E2E/手動確認の `data-*` ミラー用。最後に見た `flight` を保持)、`startThrow`、`skip`。
- `swingRef` は `useGameStage` が作り、`useBattingControls` の `onSwing`(`swingRef.current = input` してから `game.swing(input)`)と director の両方に渡す(循環を避ける)。

### UI 設計

**レイアウト**

- デスクトップ(幅 641px 以上): 2列グリッド `minmax(0, 1.7fr) minmax(300px, 1fr)`。左に `StageView`(`aspect-ratio: 16/10`、角丸、枠線、背景は空色)。右に操作パネル(上から: 操作(人間打撃は `SwingControls`、人間守備は `CourseGrid` + `PitchingControls`)→ `MatchupPanel` → `Scoreboard` → `CommentaryLog`)。ステージ内の左上に `StageHud`、中央やや上(上から38%)に `StageTelop`、右下に(`holding` 中だけ)スキップのヒント。ページの最大幅は 1100px。
- スマホ縦(幅 640px 以下): 1列。順序は `StageView`(`aspect-ratio: 4/5`、初期値。ステップ G で 390×844 に収まるよう調整)→ 操作 → `MatchupPanel` → `Scoreboard` → `CommentaryLog`。ボタン・コースのセルは 44px 以上。
- `ResultScreen` は従来どおり `position: fixed` の dialog。WebGL 不可・context lost のときはステージ中央に `bb-stage__fallback`(`role="status"`)で「3D表示を使えません(WebGL が利用できない環境です)。操作と試合の進行は続けられます。」/「描画が中断されました。ページを再読み込みしてください。」を出す。

**コンポーネント(新規・変更)**

| コンポーネント | ステップ | props / 内容 |
| --- | --- | --- |
| `StageView` | E | `containerRef`、`status`、`telop`、`hud: ReactNode`、`pointerHandlers`、`inputActive`(人間打撃中)、`skipHint`(`holding` 中に真)、`phase`、`playKind`、`lastFlight`、`zoneRect`、`marker`(`FieldMarkerView` または `null`)。`bb-stage` ルートに `data-testid="stage-3d"` と `data-*` ミラー、`bb-stage__canvas`(容器)、`bb-stage__input`(canvas 上の入力面。ハンドラは常時つなぐ)、`StageTelop`、スキップのヒント(`bb-stage__skip-hint`、`aria-hidden`、「タップ / Space でスキップ」)、フォールバック表示、非表示の `batted-ball-marker` を描く |
| `StageHud` | B4 | `scoreboard: ScoreboardView`、`teamColors: { away: number; home: number }`、`inningLabel`、`isExtra`、`balls`、`strikes`、`outs`。`aria-hidden="true"`、testid なし。モックの `.hud` 相当で、各チーム名の横にチーム色のチップ(`bb-hud__team-dot`。inline style の背景色に `#rrggbb` を設定) |
| `StageTelop` | B4 | `text`(文字列または `null`)。`data-testid="stage-telop"`、`aria-hidden="true"`。表示/非表示は CSS クラス(`--show`)とトランジション |
| `GameLayout` | E | 表示用 `view`、`pitchReady`、`swingReady`、`throwing`、`selection`、`stageProps`、各コールバック。上記レイアウトの配線のみ |
| `GameScreen` | E | `useGame`・`useGameStage` の結線、投球の選択状態 `{ kind, cell }`(第1版どおり)、`ResultScreen`(`view.result !== null && !holding`) |
| `BaseballGamePage` | E | `baseball.css`・`baseball-stage.css` を import。`GameScreen` を `React.lazy`(`.then((m) => ({ default: m.GameScreen }))`)+ `Suspense`(fallback は「読み込み中…」) |

各コンポーネントは60行以内。60行を超える場合は担当ステップ内で `ui/` に分割ファイルを追加してよい(追加したファイル名は完了報告に記す)。`StageHud`・`StageTelop` は hooks を呼ばない(props のみ)。

**クラス名の契約**(B4 の CSS と E の TSX が並列でも食い違わないよう、ここで固定する)

| クラス | 役割 |
| --- | --- |
| `bb-game` / `bb-game__stage` / `bb-game__panel` | 2列グリッド / 左列 / 右列 |
| `bb-stage` | ステージのルート(`position: relative`、縦横比、`overflow: hidden`) |
| `bb-stage__canvas` | canvas の容器(`position: absolute; inset: 0`。内側の canvas は 100%) |
| `bb-stage__input` / `bb-stage__input--active` | canvas 上の入力面(`inset: 0`)/ 人間打撃中(`touch-action: none`) |
| `bb-stage__hud` | HUD の置き場(左上 12px、`pointer-events: none`) |
| `bb-stage__skip-hint` | スキップのヒント(右下、小さく低コントラスト、`pointer-events: none`、`holding` 中だけ表示) |
| `bb-stage__fallback` | WebGL 不可の表示 |
| `bb-hud` / `bb-hud__row` / `bb-hud__team-dot` / `bb-hud__lamps` / `bb-hud__lamp` + `--b` `--s` `--o` + `--on` | `StageHud` の内部 |
| `bb-stage__telop` / `bb-stage__telop--show` | `StageTelop` |

**テーマ(`baseball.css`、モック基調)**: `--bb-bg: #0d1722`、`--bb-panel: #15283a`、`--bb-border: #2d4a63`、`--bb-text: #f1f5f9`、`--bb-muted: #a3b8ca`、`--bb-accent: #ffd23f`(主ボタンは背景 accent・文字は暗色)、`--bb-out: #e8473c`、`--bb-ball-lamp: #3fcf6b`、`--bb-strike: #ffd23f`。`color-scheme: dark`。ページ背景は `body:has(.bb-page)` に付け、ホーム(`/`)へ漏らさない。`CourseGrid` は通常フローの 5×5(`grid-template-columns: repeat(5, minmax(44px, 1fr))`、セルの `aspect-ratio: 1`)に変える(`position: absolute; inset: 8.333%` を廃止)。FieldDiagram・StrikeZone の規則は削除する。

**testid 対応表の更新**(第1版の表のうち変更分。ここに無いものは第1版のまま)

| testid | 扱い |
| --- | --- |
| `field-diagram` | 廃止(E2E の待機は `stage-3d` に差し替え) |
| `batted-ball-marker` | **維持**(`StageView` の非表示 DOM ミラー。`view.fieldMarker` から `data-result`/`data-seq`/`data-over-fence`/`data-distance`/`data-lateral` を同じ形式で) |
| `batting-view`・`zone-svg`・`swing-cursor`・`ball` | 廃止。代わりに `stage-3d` の `data-*`(下記) |
| `stage-3d`(新規、`StageView`) | `data-status`(`loading`/`ready`/`unsupported`/`lost`)、`data-phase`(`idle`/`windup`/`flight`/`play`)、`data-play-kind`(演出中の `outcome.kind`)、`data-flight-seq`・`data-landing-x`・`data-landing-y`(ゾーン座標、小数3桁)・`data-duration-ms`(**最後に見た flight を保持**。E2E が飛行の短い区間を取り逃さないため)、`data-zone-rect`(`left,top,width,height`、キャンバス左上基準。リサイズ時の `zoneScreenRect()`) |
| `stage-telop`(新規、`StageTelop`) | テロップの要素 |
| `pitch-controls` の `data-ready` | `view.pitchReady && !holding && !throwing` と一致 |
| `scoreboard`・`inning-label`・`line-score`・`score-away`/`score-home`・`count-*`・`bases` | 維持(`Scoreboard` は操作パネルに置く。`StageHud` は testid なし) |
| その他(`swing-button`・`swing-kind-*`・`throw-pitch`・`pitch-kind-*`・`course-cell-*`・`last-event`・`commentary-log`・`result-screen` ほか) | 維持 |

### 静的解析・規約への対応

[[sample-app-lint-random-and-index-access]]・[[eslint-strictness-ratchet-v2]] に従う(第1版の規約をそのまま適用)。three 固有の要点:

- 変数添字禁止: `Map`・`.find`・`.at`・`for...of`・明示フィールド代入で書く。`DataTexture` のピクセルは `Uint8Array.from(...)` ヘルパー、キーフレームは `.find`/`for...of` で探す。
- `Math.random` 禁止(乱数は `createRng`)。`world/` では三角関数・`hypot` を使ってよい(N3)。インライン `eslint-disable` 禁止。
- 関数は60行・複雑度20・cognitive 15・`max-params` 6 以内。ネスト三項禁止。ES2022(`toSorted`/`with` 不可)。
- three のオブジェクトは `getObjectByName` で探さずビルダーの参照を保持する。`exactOptionalPropertyTypes` のため three のオプションに `undefined` を渡さない。
- ステップ0で three 風スニペットを `npx eslint --stdin` に流して実測し、`no-param-reassign` 相当(引数オブジェクトのプロパティ代入 `mesh.position.y = …`)・`Map`・`.set()` が通ることを確認する。error になる書き方があれば規約表を更新して報告する。

## 実装ステップ

実装順のチェックリスト。**同じファイルを複数ステップで触らない**。「並列」欄のステップ同士は同時に dispatch できる(ファイル所有が重ならず、依存も無い)。実装者は担当ファイル以外を編集しない(例外はステップ G のみ)。`types/` はステップ A で凍結し、型の変更が必要になったら編集せず報告する。

| ウェーブ | ステップ | 並列 |
| --- | --- | --- |
| 1 | 0 | — |
| 2 | A | — |
| 3 | B1, B2, B3, B4 | 並列可(4ステップ) |
| 4 | C1, C2, C3 | 並列可(3ステップ。C1 は B1・B2、C2 は B3、C3 は A・B1・B2 の完了後) |
| 5 | D | — |
| 6 | E | — |
| 7 | F, G | 並列可 |

共通の完了条件(各ステップ): 担当ファイルが `cd sample-app && npx eslint <担当パス>` で0件。テストがあるステップは `cd sample-app/frontend && npx vitest run <担当パス>` が成功。`cd sample-app && npm run typecheck --workspace frontend` で担当ファイル起因のエラーが0(並列中は他タスクの未完成ファイル起因のエラーを無視し、完了報告に記す)。コミット・共有メモリへの書き込みは並列 dispatch 中は行わない(orchestrator が集約)。

- [ ] **ステップ0: three の導入と試し打ち**(直列・前提)
  - 依存: なし。担当ファイル: `sample-app/frontend/package.json`、`sample-app/package-lock.json`、(必要な場合のみ)`sample-app/frontend/vite.config.ts`。使い捨てのプローブは scratchpad に置き、リポジトリにはコミットしない。
  - やること:
    1. `npm view three version time` と `npm view @types/three versions` で three の最新版と公開日、同一リビジョンの `@types/three` を確定する。**想定: three 0.186.1(2026-09-24 公開、2週間以上経過)、`@types/three` 0.186.x。** 想定と異なる場合(その版が無い、公開から2週間未満、`@types/three` の同リビジョンが無い 等)は先に進まず報告する。
    2. `cd sample-app && npm install --workspace frontend three` と `npm install --workspace frontend --save-dev @types/three@<同一リビジョン>`。`npm install` が範囲指定を書き換える前例(vitest)があるため `frontend/package.json` を目視し、0.x 系の範囲(`^0.186.x`)であることを確認する。
    3. 次の確認項目を実測し、結果を表にして報告する(orchestrator が本書末尾「ステップ0 試し打ち結果」に転記する):
       - (1) `npm ci --dry-run` が成功し、`package-lock.json` の差分が three と `@types/three`(とその依存)に限られる。
       - (2) vitest(node)で `three` を名前付き import し、`Group`・`Mesh`・`DataTexture`(`RedFormat`)・`MeshToonMaterial`(`gradientMap`、`color.setHex`)を生成して `dispose` できる。`ColorManagement`・`WebGLRenderer#outputColorSpace`・`RedFormat`・`LinearSRGBColorSpace` が `@types/three` に実在し、`npm run typecheck` が通る。
       - (3) Playwright headless Chromium(クラウドでは [[playwright-browser-revision-mismatch]] の回避構成を含む)で、素のページに `WebGLRenderer` を作って1フレーム描画できるか(`getContext("webgl2")` が非 `null`、描画後に `gl.getError() === 0`、`readPixels` で背景以外の画素がある)。作れない場合は `launchOptions.args`(`--use-angle=swiftshader`・`--enable-unsafe-swiftshader`・`--ignore-gpu-blocklist` 等)を試し、**必要な最小の引数**を報告する(適用はステップ F)。
       - (4) 名前付き import のみで toon キャラ+球場相当のスニペットを `vite build` したときのチャンクサイズ(minify/gzip)。あわせて、現状の `index` チャンクのサイズを記録する(`React.lazy` 後に増えていないことの基準)。500KB 超の警告は許容。
       - (5) `npx eslint --stdin --stdin-filename frontend/src/features/baseball/render/probe.ts` に three 風スニペット(引数オブジェクトのプロパティ代入、`mesh.position.set(...)`、`Map<string, Object3D>`、`for...of`、`Uint8Array.from(...)`、60行制限、`max-params`)を流した結果。
       - (6) `vite` dev で `GameScreen` を `React.lazy` した最小構成を開き、初回ロードで「optimized dependencies changed. reloading」が出るか。出る場合は `vite.config.ts` に `optimizeDeps.include: ["three"]` を追加する。
    4. 想定外の結果(版・公開日の不一致、lockfile 差分の肥大、フラグを付けても WebGL を作れない、vitest で three を import できない、eslint 規約が本書の規約と矛盾 等)が出たら、先のステップに進まずその場で orchestrator に報告する(設計の見直しが必要になる)。
  - 完了条件: ルートで `npm run typecheck`・`npm run lint`・`npm run build`・`npm run test` が成功。`npm ci --dry-run` が成功。(1)〜(6) の実測表を報告。

- [ ] **ステップ A: 契約(`types/`、`outcome`、チーム色)**(直列)
  - 依存: ステップ0。担当ファイル: `features/baseball/types/{scene,stage}.ts`(新規)、`types/team.ts`、`types/view.ts`、`model/data/teams.ts`、`model/data/teams.test.ts`、`model/game/view.ts`、`model/game/view.test.ts`、`model/game/test-fixtures.ts`
  - やること: 本書「型契約」のとおり型を定義する(実行時コードなし)。`StageGeometry` のフィールド名はモックの寸法に沿ってここで定義する。`Team.uniformColor` を加算し、`data/teams.ts` にルミナス=`0x2f63c8`(青)、ノーブルズ=`0xe8473c`(赤)を設定、`test-fixtures.ts` の `makeTeam` に固定の色を足す(2チームで別の値)。`outcomeOf(state)` と `colorsOf(state)` を `model/game/view.ts` に追加し、`toGameView` の戻り値に `outcome`・`teamColors`・`uniforms` を加える(**`phase` が `in-flight` のときの `outcome.seq` は `pitchSeq − 1`**)。`view.test.ts`・`teams.test.ts` に追記する(テスト戦略の該当項)。
  - 完了条件: `npm run typecheck --workspace frontend` 成功、lint 0件、**既存749件のアサーションが無改変で成功**(`view.test.ts`・`teams.test.ts` は追記のみ)。`types/` が他セグメントを import していない(`scene.ts`/`stage.ts` は `types/` 内と DOM 型のみ)。`balance.test.ts` の結果が変わらない(色は判定に影響しない)。

- [ ] **ステップ B1: `model/world` の空間・軌道・カメラ**(並列: B2, B3, B4)
  - 依存: A。担当ファイル: `model/world/space/{params,vec3,coords,geometry,crowd}.ts`、`model/world/path/{pitch-path,batted-path,fielders}.ts`、`model/world/camera/rig.ts` と、`params` を除く各 `.test.ts`
  - やること: 本書「world 設計」のとおり実装する。値は `WORLD_PARAMS` に外出しする。フェンス半径・塁間は `LANDING_PARAMS` から導出し、`sin/cos` を使ってよいが `Math.random`/`Date`/`performance` は使わない。ファイルが多いため、orchestrator は B1 を B1a(`space/`・`camera/`)→ B1b(`path/`)に分けてよい(ファイルは重ならない)。
  - 完了条件: 担当の `vitest run` 成功(テスト戦略の合格基準)。`world/` が `game/`・`cpu/`・`data/` を import していない。`from "three"`・`react`・`document`・`window` が無い。

- [ ] **ステップ B2: `model/world` のモーション**(並列: B1, B3, B4)
  - 依存: A。担当ファイル: `model/world/motion/{rig,pose,pitcher,batter,fielder,fk}.ts` と各 `.test.ts`(`rig` を除く)
  - やること: キーフレーム表(関数外のデータ定数)と補間でポーズ関数を作る。`motion` は `types/` だけに依存する。投手の release ポーズから `fk.ts` で求めた手先位置が `RELEASE_POINT`(−0.30, 1.65, −18.1)と 0.15m 以内になるよう合わせる(`RELEASE_POINT` は B1 の `params.ts` の値。**B2 は同値をテスト内の定数で持ち、B1 完了後の統合確認はステップ G で行う**)。
  - 完了条件: 担当の `vitest run` 成功(ポーズの連続性・範囲・境界の一致)。

- [ ] **ステップ B3: `render/` のビルダー**(並列: B1, B2, B4)
  - 依存: A、0。担当ファイル: `render/{look,stadium,character,pose-apply,markers,dispose}.ts` と `look|stadium|character|pose-apply|markers|dispose` の smoke テスト
  - やること: 本書「render 設計」のとおり実装する(`character.ts` に `createTeamMaterials`・`applyUniforms` を含む)。`render/` は `types/` と `three` のみを import する。テストは node で three を import して生成・適用・破棄を確認する(テスト内のリグ寸法・色はフィクスチャで持ち、`model` を import しない)。
  - 完了条件: 担当の `vitest run` 成功。`import * as THREE` が無い。`document`・`window`・`CanvasTexture` が無い(`stage.ts` はステップ C2)。`render/` にチーム名・`Team` が現れない。

- [ ] **ステップ B4: 表示の dumb 部品と CSS・テーマ**(並列: B1, B2, B3)
  - 依存: なし(本書のクラス名の契約と testid 表に従う)。担当ファイル: `ui/StageHud.tsx`、`ui/StageTelop.tsx`、`ui/baseball-stage.css`、`ui/baseball.css`、`ui/CourseGrid.tsx`(コメントのみ)
  - やること: `StageHud`(チーム色のチップを含む)・`StageTelop` を props のみで作る(hooks を呼ばない、testid は `stage-telop` のみ)。`baseball.css` のテーマ変数をダークに差し替え、`CourseGrid` を通常フロー化し、FieldDiagram・StrikeZone の規則を削除する(コンポーネント本体の削除はステップ E)。`baseball-stage.css` に「クラス名の契約」の全クラス(スキップのヒント、チームのチップを含む)を定義する(デスクトップ/スマホ縦、テロップのトランジション、`prefers-reduced-motion`、`body:has(.bb-page)`)。外部フォントは使わない。
  - 完了条件: lint・typecheck 通過。`StageHud`・`StageTelop` に hooks の呼び出しが無い。各コンポーネント60行以内。

- [ ] **ステップ C1: `model/world` の合成と入力の振り分け**(並列: C2, C3)
  - 依存: B1, B2。担当ファイル: `model/world/sequence/{play-plan,frame,telop,input-route}.ts` と各 `.test.ts`
  - やること: `planPlay`・`sceneFrameAt`(`uniforms` を写す)・`telopFor`・`telopAt` を「時間軸・ゲートの規約」と演出時間表のとおり実装する。`sceneFrameAt` はアクターごとの小関数に分ける。`input-route.ts` に `routeStagePointer`・`isSkipKey` を規約13の判定表どおり実装し、全組み合わせをテストする。
  - 完了条件: 担当の `vitest run` 成功(時刻表の単調性・決定性・テロップ文言・振り分けの全組み合わせ)。

- [ ] **ステップ C2: `render/stage.ts`**(並列: C1, C3)
  - 依存: B3(契約は A)。担当ファイル: `render/stage.ts`
  - やること: `createStage(options): StageHandle | null` を実装する。WebGL 不可・context lost の扱い、canvas の自前生成と remove、`ResizeObserver`、`quality`、`pickPlane`、`zoneScreenRect`、`apply` でのユニフォーム色の更新(前回から変わったときだけ `applyUniforms`)、`dispose`(geometry/material/texture → `renderer.dispose` → `forceContextLoss` → canvas remove)。単体テストは書かない(E2E と手動で担保)。
  - 完了条件: lint・typecheck 通過。`document`・`window`・`ResizeObserver`・`WebGLRenderer` を使うのがこのファイルだけ。

- [ ] **ステップ C3: hooks の部品**(並列: C1, C2)
  - 依存: A、B1、B2(`createStage` のシグネチャは本書が契約。typecheck は C2 完了後に最終確認。`routeStagePointer`・`isSkipKey` のシグネチャは本書が契約で、C1 完了後に最終確認)。担当ファイル: `hooks/{useStage3d,usePitchFlight,usePointerInput,useBattingControls,useSkipInput}.ts`
  - やること: 本書「hooks 設計」のとおり実装・変更する(pointerdown は `routeStagePointer` の結果で分岐、`useSkipInput` はキーのスキップ)。全ての effect に cleanup を付け、ref ガードで StrictMode を回避しない。
  - 完了条件: lint・typecheck 通過。`hooks/` から `three` を import していない。`Math.random`・`Date` が無い。`usePointerInput` が `holding` を直接分岐せず `routeStagePointer` を経由している。

- [ ] **ステップ D: hooks の統合**(直列)
  - 依存: C1, C3(typecheck は C2 も必要)。担当ファイル: `hooks/{useStageDirector,useHeldView,useGameStage}.ts`
  - やること: 「時間軸・ゲートの規約」のとおり `useStageDirector`(session・毎フレームの `sceneFrameAt` → `apply`・`holding`/`throwing`/`telop`/`phase`/`playKind`/`lastFlight`・windup・`skip()`)、`useHeldView`、合成の `useGameStage` を実装する。`holding` は render 中に導出する。`stage` が `null` でも plan を進める。CPU 打者の前倒し(`leadMs = CPU_SWING_LEAD_MS`)と `useCpuTurn` の `holding` ゲートを配線する。`uniforms` には保持される表示用 view のものを使う。`useSkipInput`・`useBattingControls` に `holding`/`skip` を配線し、director との循環は getter で切る。
  - 完了条件: lint・typecheck 通過。`holding` を effect 内で立てていない。`stage === null` の分岐が `apply` のみを省略している。`skip()` が reducer に触れていない(`dispatch` 系の関数を呼ばない)。

- [ ] **ステップ E: ui の配線**(直列)
  - 依存: D、B4。担当ファイル: `ui/{StageView,GameLayout,GameScreen,BaseballGamePage}.tsx`、`ui/` の削除4件(`StrikeZoneSvg.tsx`・`FieldDiagram.tsx`・`BattingView.tsx`・`baseball-field.css`)
  - やること: 本書「UI 設計」のとおり配線する(`StageHud` へ `teamColors`、`StageView` へ `skipHint`)。`BaseballGamePage` は `baseball-stage.css` を import し、`GameScreen` を `React.lazy`+`Suspense` にする。`StageView` は「クラス名の契約」と testid 表に従う。削除したファイルを参照するものが無いこと(Knip・typecheck)を確認する。
  - 完了条件: lint・typecheck・`npm run build` 通過。`ui/` から `../model`・`../render` を import していない。`npm run dev:frontend` で `/#/baseball` を開いてタイトル→開始→ステージが表示され、コンソールエラーが無い(詳細な見た目の調整はステップ G)。build 後、`index` チャンクに three が含まれず、サイズがステップ0の基準から +5KB 以内(three は遅延チャンクにある)。

- [ ] **ステップ F: E2E とドキュメント**(並列: G)
  - 依存: E。担当ファイル: `frontend/e2e/baseball.spec.ts`、(要検証時のみ)`frontend/playwright.config.ts`、`sample-app/README.md`、`docs/process/sample-app-dev.md`
  - やること: テスト戦略の E2E のとおり更新する(`field-diagram` → `stage-3d`、既存の守備側ロジック維持、WebGL 非対応でも進行するテストと演出スキップのテストを追加)。ステップ0で WebGL にフラグが必要と分かった場合のみ `playwright.config.ts` に `launchOptions.args` を追加する。README に Three.js の使用・WebGL 要件・構成(`render/`・`model/world/`)・演出スキップの操作を追記し、`sample-app-dev.md` の手動確認(ゲーム画面のスクリーンショット確認、WebGL の注意)を更新する。「パワプロ」等の名称は書かない。
  - 完了条件: `cd sample-app && npm run test:e2e --workspace frontend` で `home.spec.ts`(無改変)と `baseball.spec.ts` が成功し、3回連続で安定。`grep -rin "パワプロ\|パワフル" sample-app --exclude-dir=node_modules` が0件。

- [ ] **ステップ G: 見た目の突き合わせと数値調整**(並列: F)
  - 依存: E。**例外として次のファイルの数値・色・寸法のみを調整してよい**(構造・関数・型は変更しない): `render/{look,character,stadium,markers}.ts`、`model/world/space/params.ts`、`model/world/motion/` のキーフレーム表、`model/data/teams.ts` の `uniformColor`、`ui/baseball-stage.css`。それ以外の変更が必要なら報告する。
  - やること: 「見た目の受け入れ基準」のとおり、モックと実装の S1〜S7 のスクリーンショットを撮って比較し、チェックリストを自己判定する。× の項目は上記ファイルの数値を調整し、最大3ラウンド繰り返す。あわせて B2 の `RELEASE_POINT` の値が B1 の `params.ts` と一致していることを確認する。最終版のスクリーンショット(JPEG/PNG、1枚 500KB 以下、計12枚程度)を `docs/tests/assets/2026-10-12-baseball-game/` に保存し、判定表(〇×と所見)を完了報告に書く。3ラウンドで未達の項目はその理由を報告して人間ゲートへ引き継ぐ。
  - 完了条件: S1〜S7 のチェックリスト全項目が〇、または未達項目の理由が報告されている。`npm run lint`・`npm run test` が成功(world のテストは関係式を検証しており、数値調整で壊れない。モックの値に固定した打撃カメラは変更しない)。

## テスト戦略

**自動テストを新規作成するか:** する。

- 単体(vitest、node): `model/world/` の全モジュール(入力の振り分けを含む)、`model/game/view.ts` の `outcome`・`teamColors`・`uniforms`、`model/data/teams.ts` の色、`render/` の smoke。配置は各ソースに同居する `*.test.ts`。`hooks/`・`ui/`・`render/stage.ts` は単体テストしない(jsdom・WebGL を使わない。E2E と手動確認で担保)。スキップとスイングの衝突は、純関数 `routeStagePointer`/`isSkipKey` の全組み合わせテストで保証する。
- E2E(Playwright): `frontend/e2e/baseball.spec.ts` を更新する。
- 実装ステップのチェックリストにテスト作成を含めてある(A・B1・B2・B3・C1・F)。

### 単体テストの合格基準

全テストは固定入力・決定論(グリッド走査)で、乱数やタイミングに依存しない。テストを通すためにテスト自体を歪めない。しきい値を緩める場合は理由を報告する。

**`model/world/space/`**

- `coords.test.ts`: `zoneToWorld({0,0}) = (0, 0.72, 0.03)`、`zoneToWorld(±1, ±1)` が枠の4隅 (±0.26, 0.42/1.02)。`worldToZone(zoneToWorld(p))` が ±2 の格子点で `p` に一致(1e-9)。`cellToWorld({2,2})` がゾーン中心、`{0,0}` が左上遠隅((−0.347, 1.12))。`landingToWorld({x: 10, y: 50}) = (10, 0, −50)`。`zoneDeltaFromScreenDelta(rect.width, 0, rect) = (2, 0)`、`(0, rect.height, rect) = (0, −2)`。
- `geometry.test.ts`: フェンス半径 = `LANDING_PARAMS.fenceRadius`。本塁から各塁までの距離 = `baseDistance`(±0.1)。スタンド内側半径 > フェンス半径。
- `crowd.test.ts`: 同一 seed で同一配置(deep equal)、別 seed で異なる、セル数が 32×16、`paletteIndex` が 0〜7。
- `vec3.test.ts`: `lerpVec3` の端点・中点、`distanceXZ`。

**`model/world/path/`**

- `pitch-path.test.ts`(5球種 × 25セルの着弾点の全組み合わせ): `pitchBallAt(flight, 0)` が `RELEASE_POINT` に厳密一致、**`pitchBallAt(flight, durationMs)` が `zoneToWorld(landing)` に一致(1e-9)**、範囲外の経過時間はクランプ、z が単調増加、y が 0 以上 3 以下。曲がる球種(カーブ/スライダー/フォーク/シュート)は中間で直線からずれ、終点では一致する。`mittBallAt(flight, 0)` が `pitchBallAt(flight, durationMs)` に厳密一致、`mittMs` 以降はミット位置 (z = 1.6)で不動。
- `batted-path.test.ts`(9結果 × 3タイプ × 3強さ × 3方向 × seq 1〜50): `battedBallAt(plan, 0)` が `start` に厳密一致、**`battedBallAt(plan, hangMs)` の x・z が `landingToWorld(computeBattedLanding(ball, result, seq))` に一致**、`p ≥ 1` で `end` に厳密一致。ホームラン以外は終点の y = 0 かつ全区間で y ≥ 0、ホームランは終点が `fenceRadius` 以遠でスタンド斜面の上(y > 0)。頂点の高さが `peak` の ±1%(フライ/ライナー)。ゴロは y ≥ 0 でバウンドする(区間内で y が複数回極大)。`planFoul` の落下点がフェア領域(|x| ≤ |z| かつ z < 0)に入らない。
- `fielders.test.ts`: 格子(x ±90、z −130〜−5、5m刻み)の全点で `pickFielder` が総当たりの最小距離の野手と一致(同距離は小さい添字)。`fielderRunAt` の端点と中点。`FIELDER_SLOTS` が7人で固定順。

**`model/world/camera/`**

- `rig.test.ts`: `battingCamera()` がモックの値((0,1.25,3.4)/(0,1.0,−18)/34°)に一致。`chaseCamera(ball)` が式 (ball.x×0.45, 16 + ball.y×0.35, 22 + ball.z×0.45) / 注視 (ball.x, max(0, ball.y×0.6), ball.z) に一致。`blendCamera(a, b, 0) = a`、`(a, b, 1) = b`、`k` について単調。

**`model/world/motion/`**

- `pose.test.ts`・`pitcher.test.ts`・`batter.test.ts`・`fielder.test.ts`: 全ポーズ関数について、**全関節の角度が ±2π 以内**、有限値。**連続性**: 16ms 刻みで走査し、隣接サンプル間の各関節の差が 0.5rad 以下(切替点を含む)。**境界の一致**: `pitcherWindupPose(1)` と `pitcherFollowPose(0)` が一致、`pitcherWindupPose(0)` が待機姿勢、`batterSwingPose(0, h)` が構え姿勢に一致、`batterSwingPose` の `progress` 1 と 1.4 の連続。`lerpPose(a, b, 0) = a`、`(a, b, 1) = b`。`handPosition`(順運動学)で、リリース時の投手の手先が `RELEASE_POINT` の 0.15m 以内。

**`model/world/sequence/`**

- `play-plan.test.ts`(kind: `ball`/`called-strike`/`swinging-strike`/`foul`/`in-play`(9結果 × 3タイプ)× スイング(なし/人間の早い・同時・遅いクリック/CPU の空振り)の全組み合わせ): **時刻表の単調性** `0 ≤ swing.startMs`、`durationMs ≤ contactMs ≤ contactMs + hangMs`、`telop.startMs ≥ durationMs`、`telop.startMs < telop.endMs ≤ endMs`、`fielder.startMs = contactMs ≤ fielder.arriveMs ≤ endMs`、`endMs` が有限かつ `durationMs + 6000` 以下。`contactMs = max(durationMs, swing.atMs)`(人間)、CPU は `durationMs`。見逃しに `swing` が無い。ホームランは `fielder = null`、フェアのゴロ/フライ/ライナーは `fielder` あり、ファウルは `fielder = null`。同一入力で deep equal(決定論)。`outcome` に `inPlay` があるとき `batted.end` が `computeBattedLanding` と一致。
- `frame.test.ts`: `sceneFrameAt` が同一入力で deep equal、入力を変更しない(deep freeze)、`fielders.length = 7`、全数値が有限(`phase` × `plan` の全組み合わせ × 時刻グリッド)。**`frame.uniforms` が `input.uniforms` と一致**(`phase`・`plan` によらず、攻守交代後に別の値を渡せば別の値になる)。可視性: 打撃カメラ中は `catcher.visible = false`、`blend ≥ 0.35` で `true`。`cursor.visible` は入力が真かつ中継カメラに移る前のみ。`cursor.flash` はスイング区間のみ。`aim.visible` は `aim` 入力があるときのみ。`zone.grid` は入力に従う。ボールは `phase = idle`/`windup` で非表示、リリース後に表示。`idle`/`windup`/`flight` のカメラは `battingCamera()` に一致、`play` で `chaseFromMs` 以降 `blendCamera` に一致し、16ms 間の移動が 1.5m 以下。
- `telop.test.ts`: `telopFor` が全 `kind`・全 `InPlayResult`・`plate` の組み合わせで空でない文字列。`homerun` → 「ホームラン!!」、`plate = strikeout` が `swinging-strike` で「空振り三振!」、`walk` で「フォアボール」、`single` で落下点が内野なら「内野安打!」、`lateral` による方向名(レフト/センター/ライト)。`telopAt` が `startMs` 前で `null`、区間内で文言、`endMs` 後で `null`。
- `input-route.test.ts`(**スキップとスイングが衝突しないことの保証**): `routeStagePointer` を `holding`(真/偽)× `enabled`(真/偽)× `swingReady`(真/偽)× `pointerType`(mouse/pen/touch)× `isPrimary`(真/偽)× `button`(0/1/2)の全組み合わせで走査し、(1)`holding` が真で主ポインタ(マウス/ペンは `button` 0)なら必ず `"skip"`(`swingReady`・`enabled` によらない)、(2)`holding` が真のとき `"swing"`/`"drag-start"` は一度も返らない、(3)`holding` が偽で `enabled` が真のとき、マウス/ペンの主ボタンは `"swing"`、タッチは `"drag-start"`、(4)`holding` が偽で `enabled` も偽なら `"ignore"`、(5)非主ポインタ・非主ボタンは `"ignore"`、(6)`"skip"` を返すとき同じ入力で `"swing"` を返さない(戻り値は1つ)。`isSkipKey`: `holding` が真で Space(`" "`)・Enter、`repeat` が偽、`targetTag` が `BODY`/`DIV`/`BUTTON` のとき真。`holding` が偽・`repeat` が真・他のキー・`targetTag` が `A`/`SELECT`/`INPUT`/`TEXTAREA` のときは偽。

**`model/game/view.test.ts`(追記)**: `outcome` が最初の投球の解決前は `null`。ボール/見逃し/空振り/ファウルの解決後は `{ seq: pitchSeq, kind, inPlay: null, plate }`。インプレー後は `inPlay = { result, ball }`。三振・四球で `plate` が `strikeout`/`walk`。**次の投球が始まった(`in-flight`)間も前の球の `outcome` が保持され、`seq` が変わらない(`pitchSeq − 1`)**。**`teamColors` が `teams.away/home.uniformColor` と一致。`uniforms` は、表(`half = "top"`)では `offense = away の色`・`defense = home の色`、裏では逆。攻守交代の前後(3アウト目の解決後)で入れ替わる。`in-flight` の間は変わらない**。`toGameView` が state を変更しない。既存の749件のアサーションが無改変で成功。

**`model/data/teams.test.ts`(追記)**: 各チームの `uniformColor` が 0〜0xffffff の整数。2チームの色が異なり、RGB 各成分の差の合計が 200 以上(見分けがつく)。ルミナスが青系(B 成分が最大)、ノーブルズが赤系(R 成分が最大)。

**`render/`(smoke のみ。node)**: `look.test`: `fovFor(34, 1.6) = 34`、`fovFor(34, 0.8)` が約50°(±0.5)、縦横比に対して単調非増加で 34 を下回らない、`gradientPixels` の長さと両端の色。`stadium.test`: `buildStadium` が `Group` を返し、テクスチャがすべて `DataTexture`、子の数が妥当。`character.test`: `buildCharacter` の `joints` が全て揃い、メッシュ数が妥当。**`createTeamMaterials` が攻撃用・守備用の2材質を返し、打者は攻撃用、複数の守備側キャラクターが同一の守備用材質インスタンスを共有する。`applyUniforms` で2材質の `color` が指定の色になり(1回の呼び出しで全守備側キャラクターのアクセントが変わる)、再度別の色で呼ぶと入れ替わる。`render/` のテストに `Team`・チーム id が現れない**。`pose-apply.test`: `applyPose` が各関節の `rotation`・`root.position`・`visible` に正しく反映される。`dispose.test`: `disposeObject3D` 後、全 geometry・material・texture の `dispose` イベントが1回ずつ発火する。`markers.test`: ゾーン枠・カーソル・ボールの生成と破棄。

### E2E(Playwright)

- 既存 `home.spec.ts` が**無改変**で通る。
- `baseball.spec.ts`(`field-diagram` の待機を `stage-3d` に差し替え、他は維持):
  1. 「`/` のリンクからゲーム画面へ遷移できる」(変更なし)。
  2. 「1イニングの試合が結果画面まで到達する」: 開始後、`stage-3d` が可視で `data-status="ready"`(WebGL が使える環境。使えない環境では失敗させて気づく)。第1版の待ち合わせ(結果画面か `pitch-controls[data-ready="true"]` のどちらか)と、人間守備中の `throw-pitch` クリック、初期選択 `course-cell-2-2` の保持確認はそのまま。追加: 最初の投球後に `stage-3d` の `data-flight-seq` が数値になり、`data-landing-x`/`data-landing-y` が数値、結果画面で `final-score-*`/`score-*` が `/^\d+$/`。**スキップは使わない**(`fast=1` で演出が短く、スキップに依存しない通常の進行を検証する)。
  3. 「3D が使えなくても試合が結果画面まで進む」: `page.addInitScript` で `HTMLCanvasElement.prototype.getContext` が `webgl`/`webgl2` に `null` を返すようにし、`stage-3d` が `data-status="unsupported"`、フォールバック表示が見えることを確認したうえで、テスト2と同じ進行ループで結果画面に到達する(**時計とゲートが renderer 非依存であることの検証**)。進行ループは spec 内のヘルパー関数にして共有する。
  4. 「演出中のタップでスキップできる」(**通常速度**。`?seed=42&innings=1#/baseball` で `fast` を付けない): `setting-side` を `home`(後攻)にして開始し、人間守備で `throw-pitch` をクリック。`stage-3d` の `data-phase` が `play` になったら(`toHaveAttribute`、タイムアウト 10 秒)、`stage-3d` をクリックする。クリックから **300ms 以内に** `data-phase` が `idle` になり、`pitch-controls[data-ready="true"]` が見える(スキップが無ければ `holding` が最短でも約500ms 続くため、スキップの有無を区別できる)。さらに、`play` 中に再度クリックしても例外やエラーが出ないこと(冪等)は、次の投球が始まる前の `idle` 状態でクリックして何も起きない(`data-phase` が `idle` のまま、`score-*` が変わらない)ことで確認する。所要は1球分(約5秒)で、`test.setTimeout(60_000)`。
- `fast=1` の所要時間: 1球あたり windup 20ms + 飛行約170ms + 余韻(見逃し・ボールは約100ms、インプレーは滞空込みで約350〜500ms)で約0.3〜0.7秒。1イニング(両軍・約30球)で約10〜20秒。`test.setTimeout(120_000)`、固定 sleep を使わない。ブラウザの負荷が高い環境では spec 内で `test.describe.configure({ mode: "serial" })` にしてよい(`playwright.config.ts` は共有のため変えない)。
- 起動パラメータは開発ビルドのみ有効(第1版 #8)。`playwright.config.ts` の webServer は `npm run dev` のまま。

### 静的チェック

- `cd sample-app && npm run typecheck`・`npm run lint`・`npm run test`・`npm run build`・`npm run test:e2e --workspace frontend` がすべて成功。Knip(report-only)は判定に使わない([[knip-dead-code-detection]])。
- **構造検査(code-reviewer/tester が grep)**:
  1. `from "three"` が `render/` 配下のみ。`import * as THREE`・`getObjectByName` が無い。
  2. `render/`(テストを含む)が `../model`・`../hooks`・`../ui` を import していない。`render/` に `Team`・`uniformColor`・チーム id・チーム名が現れない(色は `UniformColors` の数値だけ)。
  3. `model/` の他サブフォルダが `world/` を import していない。`world/` が `game/`・`cpu/`・`data/` を import していない。
  4. `render/` 内で `document`・`window`・`ResizeObserver`・`WebGLRenderer` を使うのが `stage.ts` のみ。`CanvasTexture`・`document.createElement("canvas")` が無い(canvas の生成は `stage.ts` のみ)。
  5. `model/`(`world/` を含む)に `from "react"`・`document`・`window`・`Math.random`・`Date`・`performance` が無い。`sin`/`cos`/`log`/`exp`/`hypot` が `model/world/` の外に無い。
  6. `import.meta.env` が `hooks/useLaunchParams.ts` のみ。
  7. `ui/` から `../model`・`../render` を import していない。`StageHud`・`StageTelop` 等の props のみのコンポーネントに hooks の呼び出しが無い。
  8. `holding` を effect 内で `setState` していない(render 中の導出のみ)。director の毎フレーム処理が `stage === null` でも plan を進めている。
  9. **`skip()` が `dispatch`/`throwPitch`/`swing`/`cpuPitch`/`pitchArrived` を呼んでいない**(表示状態だけを変更する)。**`usePointerInput` の pointerdown 分岐が `routeStagePointer` の戻り値で決まり、`holding` を直接参照して分岐していない**。`useKeyboardInput.ts` が変更されていない。
  10. 各 `data-testid` が testid 表のコンポーネントにだけ現れる(重複なし)。
  11. `grep -rin "パワプロ\|パワフル" sample-app --exclude-dir=node_modules` が0件。

### 手動確認(Playwright CLI でスクリーンショット)

通常速度(`fast` なし)で `npm run dev:frontend` を起動し(ゲームは backend 不要)、使い捨てスクリプト(コミットしない)で確認する。保存先は tester が決める。

1. **見た目の突き合わせ**: 「見た目の受け入れ基準」の S1〜S7(モックとの並置)。tester が撮り直して判定する。
2. **打撃体験**: `/?seed=7&innings=1#/baseball` で開始し、`stage-3d` の `data-landing-x/y`・`data-duration-ms`・`data-zone-rect` から画面座標を求めてマウスを動かし、`durationMs` の少し前にクリックしてスイングする(`px = canvas.left + zoneRect.left + (x/2 + 0.5) × zoneRect.width`、`py = canvas.top + zoneRect.top + (0.5 − y/2) × zoneRect.height`)。10球以内に実況ログへ安打系が出て、中継カメラで野手が走る。Space キーのスイングが、フォーカス中のボタンの click と二重発火しないこと。
3. **投球**: 後攻を選んで開始。コースのセルを選ぶと 3D のゾーン上の同じセルがハイライトされ(投球はされない)、「投げる」で windup→投球。投球後も選択が保持され、飛行中は「投げる」が押せない。
4. **ネタバレ抑止**: ホームラン/ヒットの打球中、スコアボード・HUD・実況ログがテロップ表示後(またはスキップした時点)に更新される。
5. **スマホ縦(390×844、`hasTouch`)**: ステージとスイング/投げるボタンがスクロールなしで収まり、相対ドラッグでカーソルが動き、「スイング」ボタンでスイングできる。演出中のタップでスキップできる(実機では未検証)。
6. **WebGL 不可**: フォールバック表示が出て、試合が進行する(E2E テスト3の目視版)。
7. **リソース解放**: 「もう一度」「タイトルへ」→再開始を5回繰り返しても、DOM の `canvas` が1つ以下で、コンソールに "Too many active WebGL contexts" が出ない。
8. **本番ビルドで起動パラメータが無視される**(第1版 手動確認5と同じ)。`index` チャンクに three が含まれない(`/` とタイトルの読み込みで three のチャンクが取得されない)。
9. **コンソールエラー0**(各画面)。
10. **演出スキップ**: 人間打撃で、スイング直後の演出中に (a)マウスクリック (b)タッチのタップ (c)Space (d)Enter でスキップでき、次の投球に進むこと。スキップ前は打撃中のクリック=スイングで、スキップにならないこと。スキップに使ったクリックが次の投球のスイングとして扱われないこと(ヒントの表示/非表示、スキップ直後のスコア・実況の更新も確認)。最後の打席(試合終了)の演出をスキップすると結果画面が出ること。
11. **攻守交代の配色**: 3アウト目の打球演出が終わるまでは旧配色で、次の半イニングの待機画面から打者と守備側の配色が入れ替わる(S7)。HUD のチップの色がユニフォームと一致する。

合格基準: 1 のチェックリストが全て〇、2〜11 が確認でき、致命的な表示崩れ・コンソールエラーがない。

## リスク・トレードオフ

- **headless WebGL(最大の不確実性)**: Playwright の headless Chromium(クラウドと CI の双方)で WebGL が作れないと E2E でステージを検証できない。ステップ0で実測し、ダメなら `launchOptions.args`(swiftshader 系)、`quality: "low"`、最悪は WebGL 非対応でも進行する経路(規約10・E2E テスト3)で試合ロジックだけを検証する。CI での実挙動はクラウドの実測と一致しない可能性があり、PR の CI 結果で初めて分かる(失敗時は自動解決せず報告)。ソフトウェア描画(SwiftShader)は遅く、`fast=1` では `quality: "low"` で負荷を下げる。
- **モック(r128)との見た目の差**: 色管理・ライト強度の単位・`RedFormat` が異なるため同じ数値でも同じ見た目にならない。`render/look.ts` に集約し、ステップ G のスクリーンショット比較で受け入れる。「同等以上」の判定は主観が入るため、チェックリスト化した(ピクセル差分は使わない)。2頭身キャラの出来は最終的にゲート2で人間が判断する。
- **ゲートと E2E の整合**: `holding`・`throwing` が `pitch-controls` の `data-ready` に含まれないと、E2E が演出中に二重投球する。演出時間はゲーム時間で定義して `timeScale` で縮める。windup は壁時計(`fast` で 20ms)。スキップ専用の E2E(テスト4)は通常速度で1球だけ行い、`fast` の通常進行テストには影響させない。
- **スキップとスイングの誤爆**: 人間打撃中の演出直後は「スキップのクリック」と「次の投球のスイング」が連続しうる。`holding` と `swingReady` は同時に真にならず(次の投球は windup を経てから始まる)、`routeStagePointer` が `holding` を優先して1つの入力に1つの動作だけを返す。スキップに使った pointerdown はスイング・ドラッグに使わない。結果画面の `autoFocus` ボタンへの誤作動(Enter/Space のキー操作で最後の演出をスキップした直後に「もう一度」が押される)は、keydown で `preventDefault` し `event.repeat` を無視することで避け、手動確認10で確認する。
- **スキップの即カット**: スキップすると、打撃カメラ・待機姿勢へ補間なしで戻る(演出途中の野手・ボールは消える)。違和感があれば短いフェードやカメラの戻りを後続で足す(今回は入れない)。
- **接触時刻固定は見た目のごまかし**: 判定の Δt(±150ms)と見た目の接触時刻は一致しない(N5)。遅いクリックではボールが最大150ms分ずれて見える。目立てば判定待ち中のボール非表示に切り替える。CPU 打者の前倒し(N6)も同様に判定上の時刻とは独立。
- **スコアのネタバレ抑止**: `useHeldView` で抑止する(N8、確定)。保持中の view と最新の view の取り違えが不具合の温床になるため、表示用(スコアボード・HUD・MatchupPanel・実況・ユニフォーム色)と制御用(操作可否・演出の入力)を明確に分け、手動確認4・11で確認する。
- **チーム色**: 青/赤以外の色を足す場合、トゥーンの3段階の陰影(`gradientMap`)で明るい色が白く飛ぶ、暗い色が黒い輪郭線に沈むなど見え方が変わる。色はデータ(`uniformColor`)だけで変えられるが、見た目はステップ G で確認する。攻守交代の色の切替は表示用 view に追従するため、`useHeldView` の不具合は配色の誤りとして現れる(S7 で検出)。
- **リリース点とキーフレームの合わせ込み**: 手先がリリース点を通るかは `fk.ts` のテストで機械検証するが、見た目の自然さは目視(ステップ G)。B2 と B1 の `RELEASE_POINT` を別ステップで持つため、G で一致を確認する。
- **打球演出の範囲**: 送球・走塁・捕球後の動作は含めない(ヒット後は野手が落下点に着いて止まる)。ファウル・ゴロ(バウンド)・ライナーの軌道は新規設計で、見た目は目視で調整する。
- **バンドルサイズ**: three は遅延チャンクに隔離する(`/` とタイトルは増えない)が、ゲーム画面の初回表示は数百KBの追加読み込みになる。ステップ0・E で実測する。
- **モバイル GPU / context lost**: 影マップとピクセル比が負荷になる。縮小は未実装で、`webglcontextlost` は「描画が中断されました」の表示にとどめる。実機未検証。縦画面の FOV 補正・相対ドラッグ(N11)も実機未検証。
- **テンポ**: ボール・ストライクで約3秒、インプレーで約5〜6秒と、第1版より長い(N14)。タップ/Space によるスキップで短縮できる(確定)。
- **StrictMode / リソースリーク**: `createStage` の二重生成・canvas 残留・WebGL コンテキストの枯渇に注意。`dispose` で `forceContextLoss` と canvas の remove を行い、手動確認7で確認する。`eslint-plugin-react-hooks` 未導入([[react-hooks-lint-not-installed]])のため effect の cleanup 漏れは lint で検出されない。hooks(特に `useSkipInput` の window リスナ解除)を重点レビューする。
- **依存の再最適化リロード**: Vite の dev で遅延ロード時に依存が再最適化されるとページがリロードされ、E2E が不安定になる。ステップ0で確認する。
- **構造検査は機械強制でない**: `render/` と `world/` の境界、`render/` にチーム知識が無いこと、`skip()` が reducer に触れないことは grep で検査する([[feature-segment-import-boundaries-not-enforced]])。
- **未使用の view フィールド**: `GameView.geometry`・`fieldDiagram`・`fieldMarker`(ミラー以外)は ui が使わなくなる。既存テストを触らないことを優先して残置する(整理は後続)。`ballPositionAt`・`BallPosition` ほか 2D 用の定数も残置。Knip は report-only のため影響しない。
- **規模**: `world/` が約21ソース+約16テスト、`render/` が約7ソース+6テスト。ステップ分割・`types/` 先行・契約の固定で並列実装のずれを抑える。型の不一致は上申させ、orchestrator が直列で解決する。
- **three のライセンス**: MIT。画像・フォント・3Dモデルの外部素材は使わない。

## ロールバック方針

- 描画層の置き換えは `ui/`・`hooks/`・`render/`・`model/world/`・`types/{scene,stage}.ts`・`e2e/baseball.spec.ts`・依存(`three`・`@types/three`、`package-lock.json`)に閉じる。PR 単位で `git revert` すれば第1版の DOM+SVG 描画(試遊で不合格だった状態)に戻る。**第1版の SVG 描画を部分的に復活させる(フォールバックとして併用する)ことはしない。**
- 加算変更(`PitchOutcomeView`・`GameView.outcome`/`teamColors`/`uniforms`・`Team.uniformColor`)は他に影響しないため、revert しなくても残してよい。reducer・`GameState`・判定ロジックは変更していない(`Team` の新フィールドは読まれるだけ)。
- 依存を戻す場合は `package.json` と `package-lock.json` を併せて戻す(CI は `npm ci`)。`vite.config.ts` の `optimizeDeps` 変更も戻す。
- DB・外部システム・データ移行なし。backend・shared・`ci.yml` の動作は変更しない。

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

## ステップ0 試し打ち結果(実装時に記入)

(ステップ0 の実測表を orchestrator が転記する。three の確定版・`@types/three` の版・WebGL の可否と必要な launchOptions・チャンクサイズ・eslint 実測・再最適化リロードの有無。)

## 壁打ち(grilling)記録

承認ゲートの代替ではない(設計レビュー・人間確認ゲートは別途実施する)。

| # | 論点 | 人間の回答 | 設計への反映 |
| --- | --- | --- | --- |
| Q0 | モック方針の確認(2026-10-12) | ユーザーが Three.js の3Dモック([docs/designs/assets/2026-10-11-baseball-game-mock3d.html](assets/2026-10-11-baseball-game-mock3d.html))の方向を承認。重視点は「打撃画面の視点(捕手後方からボールが迫る)」「キャラクター(2頭身・モーション)」「打球の演出(球場に飛び野手が追う)」。実況テロップ・効果音は重視点外 | 本書全体(描画を Three.js の3Dで作り直す)、「見た目の受け入れ基準」、論点 N1〜N15 の前提 |
| Q1 | チーム色(論点 N9。当初案は攻撃=青・守備=赤の役割固定) | **チームごとに固定**(2026-10-12。「チームごとに変えるに決まってんだろ」)。ルミナス=青、ノーブルズ=赤など、チーム固有の色にして、攻守交代しても色が変わらない。打者は攻撃側チームの色、投手・捕手・野手は守備側チームの色になるよう、攻守交代時にキャラの色を切り替える | 論点表 N9(【壁打ち変更】)、「やること」、型契約(`Team.uniformColor`・`GameView.teamColors`/`uniforms`・`UniformColors`・`SceneFrame.uniforms`。`colorsOf`)、規約14(演出中は保持される表示用 view の `uniforms` を使い、3アウト目の演出中は旧配色)、world 設計(`sceneFrameAt` の `uniforms`)、render 設計(`createTeamMaterials`・`applyUniforms`、共有アクセント材質2つの色更新。render はチーム知識を持たない)、hooks 設計(`useStage3d`/`useStageDirector` の `uniforms`)、UI 設計(`StageHud` のチーム色チップ、クラス `bb-hud__team-dot`)、変更ファイル(`types/team.ts`・`data/teams.ts`・`teams.test.ts`・`test-fixtures.ts`)、受け入れ基準 S1(g)・S7、ステップ A・B3・B4・C1・C2・C3・D・E・G、テスト戦略(`view.test`・`teams.test`・`frame.test`・`character.test`、構造検査 2、手動確認 11)、リスク |
| Q2 | 1球のテンポ(論点 N14。当初案は余韻のスキップなし) | **タップで演出スキップ可**(2026-10-12)。演出中(`holding` 中)に、ステージのタップ/クリック、または Space/Enter で、残りの演出(打球の飛行・余韻・テロップ)を即終了して次へ進める。人間打撃でスイング可能なとき(`swingReady`)はタップ=スイングなので、スキップは `holding` 中のみ有効で、スイング入力と衝突しない | 論点表 N14(【壁打ち変更】)、「やること」、規約9・13(`skip()`・入力の振り分け・キー)、world 設計(`input-route.ts` の `routeStagePointer`/`isSkipKey`)、hooks 設計(`useStageDirector.skip`・`useSkipInput`・`usePointerInput`/`useBattingControls` の `holding`/`onSkip`。ポリシー表)、UI 設計(`StageView` の `skipHint`、`bb-stage__skip-hint`)、ステップ C1・C3・D・E・F、テスト戦略(`input-route.test` の全組み合わせ、E2E テスト4=通常速度のスキップ、通常の進行テストはスキップを使わず `fast=1` のまま。構造検査 9、手動確認 10)、リスク(誤爆・即カット・結果画面の `autoFocus`) |
| Q3 | スコアの更新タイミング(論点 N8。推奨は `useHeldView`) | **演出の後に更新**(2026-10-12。推奨どおり `useHeldView` を入れる)。スキップした場合はスキップの時点で更新する | 論点表 N8(【壁打ち確定】)、hooks 設計(`useHeldView`。表示用 view と `uniforms` に使う)、規約13(スキップ直後に最新の view へ切り替え)、リスク、手動確認 4 |

(以降の行は、本書の他の論点(N5・N7・N11・N15 ほか)の壁打ちで追記する。)

---

スキル化候補: なし(適用した decision/convention/pitfall エントリの `related_topics` は、いずれも `baseball-game` の1件のみ)。
