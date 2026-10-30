# 設計(分冊): ブラウザ野球 v3 — 実装ステップ

- 本書は [2026-10-27-baseball-game-v3.md](2026-10-27-baseball-game-v3.md)(本体)の分冊で、「実装ステップ」にあたる。契約は [contract 分冊](2026-10-27-baseball-game-v3-contract.md)、キャラクターは [character 分冊](2026-10-27-baseball-game-v3-character.md)、最大は [max 分冊](2026-10-27-baseball-game-v3-max.md)、打撃・投球・構図は [play 分冊](2026-10-27-baseball-game-v3-play.md)、受け入れ基準は [tests 分冊](2026-10-27-baseball-game-v3-tests.md)。
- 改訂: 2026-10-29(ラウンド2の反映: E0 の追加、A14 を E3・E4 より先に確定、位置ずれ表示の DOM 化、E5 を `SkinnedMesh` 方式に)
- 改訂: 2026-10-30(**ゲート1回答後: Q1 = タップ方式の維持** で A4・A9・A14 を縮小、**Q-char = 最大** で **段階 M(M0〜M13、14 ステップ)を追加**。総ステップ **43 → 57**。**未再レビュー**)

**6 段階で作り、各段階の終わりに全体(typecheck・lint・test・build)を緑にする**。段階 A の終わりで打撃だけが動くビルドを人間に渡し(**T1**)、段階 E の終わりでキャラクターの見た目を人間に確認してもらう(**T1b**)。段階 M の終わりには、球場・リプレイの確認用に**任意の T1c** を設ける(ゲート1後も残る論点。本体の「未解決の疑問」)。**総ステップ数は 57**(A: A0〜A14 の 15、E: E0〜E11 の 12、B: 6、C: 7、**M: M0〜M13 の 14**、D: 3)。

| 段階 | 内容 | 終わりの状態 |
| --- | --- | --- |
| A(A0〜A14) | 契約の凍結(A・B・C の型)+**打撃の骨格**(**タップ方式のまま**。予告・縮むリング・ロックオン・視認性・説明・位置ずれ)。投球側は旧格子 UI のまま動く | **T1: 打撃だけを人間が試遊**(A13 の直後) |
| E(E0〜E11) | **キャラクターの作り直し(標準)**(顔・表情・髪・個性・フォーム・走者・送球・ワイプ・品質ティア) | **T1b: キャラクターの見た目を人間が確認**(E11 の直後) |
| B(B1〜B6) | **投球の骨格**(ゾーン直接ドラッグ+ゲージ・CPU 打者の反応・操作バー) | 全体緑(投球が新操作) |
| C(C1〜C7) | **演出・音**(バナー・接触演出・効果音・触覚) | 全体緑 |
| **M(M0〜M13)** | **最大**(スライディング・ベースカバー・20 人の固有フォーム・観客の動き・球場の作り込み・時間帯・スコアボード・リプレイ・イントロ) | 全体緑。**T1c(任意): 球場・リプレイの確認** |
| D(D1〜D3) | 投球ボット・E2E とドキュメント・見た目の調整 | 最終の E2E 実行 |

**段階の順序の理由**: (1) 不満の中心である打撃(A)とキャラクター(E)を先に、(2) 投球(B)と演出・音(C)で遊びの骨格を完成させ、(3) 最大(M)は E のスケルトン・走者・ワイプ・C の音・B の投球が前提なのでその後に置く、(4) 検証・調整(D)は全機能が揃った状態で行う。M は規模が大きいが、**M0 の契約で並列の入口を固定**してあるので、M1〜M7 の 7 並列・M8〜M12 の 5 並列で進められる。各段階の終わりで全体が緑になるので、規模を調整する場合は **M を後続の別サイクルに回しても、A・E・B・C・D は成立する**(M の型は M0 で独立に凍結)。

**ファイルの所有**: 同じファイルを**並列のステップ**で触らない。段階をまたいで同じファイルを順番に触るのは許す(例: `frame.ts` は A11 → E8 → B5 → C6 → **M9**、`useStageDirector.ts` は A13 → E11 → B6 → C7 → **M13**、`StageView.tsx` は A12 → E10 → C4 → **M11**、`GameLayout.tsx` は A12 → B2 → C4 → **M11**、`stage.ts` は A8 → E7 → **M8**、`look.ts` は A7 → E7 → **M6**、`pose-apply.ts` は A8 → E6、`teams.ts` は E1 → **M1**、`motion/{forms,fielder}.ts` は E3 → **M2**、`path/{runners,fielders}.ts` は E4 → **M3**、`model/sound/*` は C2 → **M12**、`params.ts` は A0 → E0 → E3 → **M0**、`camera/{rig,project}.test.ts`・`path/pitch-*.test.ts` は A2 → E3)。実装者は担当ファイル以外を編集しない。`types/` は A0(A・B・C の分)・E0(E の分)・M0(M の分)で凍結し、型の変更が必要になったら編集せず報告する。

### ウェーブ構成と依存

| ウェーブ | ステップ | 並列・依存 |
| --- | --- | --- |
| A-1 | A0 | 直列 |
| A-2 | A1〜A8 | 並列可(8。A0 だけに依存) |
| A-3 | A9, A10, A11, A12 | 並列可(4。A9 は A1・A4、A10 は A6、A11 は A1・A2・A3・A5、A12 は A5・A6) |
| A-4 | A13 | 直列(A7〜A12 の後)。**→ T1** |
| A-5 | A14, E0, B1, B2 | 並列可(A13 の後。A14 は T1 のログがあればそれも使う。E0 は `types/`・`render/character/parts.ts`・`render/test-fixtures.ts`・`space/params.ts` だけを触る。B1・B2 は別ファイル) |
| E-1 | E1, E2, E5, E6 | 並列可(4。E0 の後。**A14 を待たない**) |
| E-1b | E3, E4 | 並列可(2。**A14 の完了と T1 の結果の反映(A1・A2・A4 の修正の要否)を待つ**) |
| E-2 | E7, E8, E9, E10 | 並列可(4。E7 は E5・E6、E8 は E1・E3・E4(A11 の後)、E9 は E2、E10 は E0) |
| E-3 | E11 | 直列(E7〜E10 の後)。**→ T1b** |
| B-2 | B3, B4, B5 | 並列可(B3 は **A14 の後**、B4 は B1、B5 は B1・A5・E8) |
| B-3 | B6 | 直列(B2〜B5・E11 の後) |
| C-1 | C1, C2, C3, C4 | 並列可(4。B6 の後) |
| C-2 | C5, C6 | 並列可(C5 は C2・C3、C6 は C1) |
| C-3 | C7 | 直列(C4〜C6 の後) |
| **M-0** | **M0** | 直列(C7 の後。段階 M の契約を凍結) |
| **M-1** | **M1〜M7** | **並列可(7)**。M1 は M0・E1・E3、M2 は M0・E3、M3 は M0・E4、M4・M5・M6・M7 は M0 だけ。ファイルは互いに重ならない |
| **M-2** | **M8〜M12** | **並列可(5)**。M8 は M6・M7、M9 は M1〜M5・C6、M10 は M5、M11 は M0、M12 は M0・C2 |
| **M-3** | **M13** | 直列(M8〜M12 の後)。**→ T1c(任意)** |
| D | D1, D3 → D2 | D1(B6・C7 の後)と D3(M13 の後)は並列可。**D2 は判定と CPU の値を調整する A14・B3・D1 と、M13 の後**。最終の E2E は D1〜D3 の後に orchestrator が実行する |

**T1 と段階 E の重なり、A14 と E3 の関係**:
- E0・E1・E2・E5・E6 は T1 の結果を待たない(T1 で直す A1・A2・A4 のファイルと重ならない)。
- **E3 は `camera/{rig,project}.test.ts`・`path/pitch-*.test.ts`・`space/params.ts` を触り、A2 と同じファイルを使う**。T1 の結果で A2(構図)を直す必要が出た場合、E3 の着手前なら A2 の担当が直し、E3 は**その修正の後に着手**する。E3 の着手後に A2 の修正が必要になった場合は、E3 の完了後に別タスクとして直列に直す。
- **E3 は RELEASE_POINT と lift を変え、ゾーンが約 23px 下がる**ので、A14 のボット結果が後から変わりうる。**A14 を E3 より先に確定する**。それでも E3 の後に変わるため、**E11 でボットのテスト(`model/sim`)を再実行**し、帯を外れたら値を触らず上申して、**A14b(条件付きの再較正。A14 の担当ファイルだけを触る追加タスク)**を B3 の前に dispatch する。

**全体の typecheck の扱い**: A0 で `PitchCommand`・`SceneFrame`・`StageHandle`・`PlaybackSpeed` の型を変えるので、**A0〜A12 の間は全体の typecheck が緑にならない**。E0 の型変更で **E0〜E10 の間**(B1・B2 も)、M0 の型変更で **M0〜M12 の間**も緑にならない。各ステップの完了条件は「`cd sample-app && npm run typecheck` の出力を担当パスで絞り込み、担当ファイル起因が 0 件(他ステップ起因のエラーは完了報告に列挙)」。A0・E0・M0 は型変更で壊れる箇所の一覧を完了報告に書く。**各段階の統合ステップ(A13・E11・B6・C7・M13)の完了条件で全体が緑に戻る**。この間のコミットは出荷しない。

**共通の完了条件**: 担当ファイルが `cd sample-app && npx eslint <担当パス>` で 0 件。型は上記。テストがあるステップは `cd sample-app/frontend && npx vitest run <担当パス>` が成功。コミット・共有メモリへの書き込みは並列 dispatch 中は行わない。**lint の注意([[sample-app-lint-random-and-index-access]])**: `Math.random` 禁止、変数添字の `arr[i]` 禁止(`.at`/`Map`/`for...of`/`switch`)、`// TODO` 禁止、`toSorted`/`with` 禁止(ES2022)、テストでリテラル同士の assertion 禁止・小数の `toBe` 禁止・ネスト関数 4 段禁止、定数オブジェクトは `DeepReadonly<typeof PARAMS>`、補間は `a*(1−k) + b*k`。

## 段階 A: 打撃の骨格

- [ ] **A0: 契約と定数の凍結(段階 A・B・C の分)**(直列)
  - 依存: なし。担当ファイル: `types/{batting,pitch,game,scene,stage,view}.ts`、新規 `types/{sound,telemetry}.ts`、`hooks/useGameStage.ts`(`GameStageViewProps` の型だけ)、`render/test-fixtures.ts`(`makeFrame` の新フィールドの既定値)、`model/world/space/params.ts`、`model/batting/params.ts`(**v2 の値は変更しない**)、`model/pitch/params.ts`、新規 `model/batting/assist.ts`(型・`ASSIST_TABLE`・`assistFor` だけ)。
  - やること: contract 分冊 §5-1 のとおり、**段階 A・B・C の分の型だけ**を定義し(`IgnoredInputReason` はタップ方式用の `not-ready`/`holding`/`tap-too-long`/`tap-moved`/`cancel`/`held-release`、`ZoneFeedbackView`、`zoneFeedback` と `tapHint` の props を含む。**段階 E・M の型は触らない**)、`WORLD_PARAMS`・`PITCH_PARAMS` に値まで入れる(`actors.pitcher.scale`・`RELEASE_POINT` は v2 の値のまま)。**`BATTING_PARAMS` に `aimGraceMs`・`regripBeforeMs` は追加しない**。`launch-params.ts` の速度値は A3。型の変更で壊れる箇所を完了報告に一覧する。
  - 完了条件: 担当ファイルの lint 0 件・typecheck 起因 0 件。`types/` が他セグメントを import していない。値を参照する既存テストがリテラルで固定されていないことを確認し、落ちるものを担当ステップに申し送る。

### ウェーブ A-2(純粋ロジック・部品。8 並列)

- [ ] **A1: アシスト(ロックオン・予告・質の補正)**
  - 依存: A0。担当ファイル: `model/batting/assist.ts`、`contact.ts`、`resolve-pitch.ts`(+test)。
  - やること: `lockOnCursor`・`previewCenterOf`・`qualityScaleOf` を実装。`measureContact` が `swing.assistK` で `q` を `qualityScaleOf` 倍する(省略は 0 で v2 と同値)。
  - 完了条件: 単体テスト — `lockStrength 0` で恒等、`progress < rampStart` で素、`k ∈ [0,1]`・単調、`captureRadius` の外で `k = 0`、有効カーソルは raw と landing の線分上、`fade` の中心が決定論かつ `|ずれ| ≤ fadeJitter` で円が着弾を含む、`preview: "none"`、`assistK` 省略時に v2 と同じ結果。
- [ ] **A2: 構図・カメラ関数・打者のレイアウト**
  - 依存: A0。担当ファイル: `model/world/camera/{rig,project}.ts`(+test)、新規 `model/world/motion/batter-layout.ts`(+test)、`model/world/path/{pitch-path,pitch-screen}.test.ts`(カメラ x 0 で変わる S300 と画面上の前提値)。
  - やること: `rig.ts` の式・定数参照を v3 の姿勢・`fit.pitching` に合わせる。**`ballScaleFor(camera, ball, minRatio)` のシグネチャ変更**と `outlineScaleFor`・`ringWidthFor` を追加。`batter-layout.ts`: `batterRootFor(aspect)`・`batLengthScaleFor`・`batTipX`(play 分冊 §3-1 の式)。テストを v3 の数値(段階 A 完了時の列)に更新する。S300 と `pitch-screen.test` の前提値を v3 の姿勢で再計算して更新する。
  - 完了条件: 単体テスト — 390×844 の打撃・守備でゾーン矩形が x 117.7〜272.3・y 410〜585(±3px)、幅×高 ≥ 150×170。**打者の頭の右端(ヘルメット込み)≤ 115px(設計値 109)**・素の頭の右端 ≤ 110px・胴の右端 ≤ 75px。接触時のバット先端 x ≥ +0.28(縦長)・横長は v2 と同値。守備の格子の下端が空き領域の下端(0.846)から 8px 以上上。高さ 560〜900px の走査でゾーン/格子が下のオーバーレイに掛からない。390×664 で打撃のゾーンが ≥ 115×130、守備のゾーン幅が打撃以上。`aspect ≥ 1.0` の横長の姿勢は v2 と厳密に一致。`ballScaleFor`・`outlineScaleFor`・`ringWidthFor` が `ratio × 2 × dist × tan(fov/2)` の式と一致。`pitch-path.test`・`pitch-screen.test`(S300 を含む)が v3 の姿勢で成功。
- [ ] **A3: 投球コマンドの移行(CPU は変換)・ゲージの純関数**
  - 依存: A0。担当ファイル: `model/pitch/{delivery,params}.ts`、新規 `model/pitch/gauge.ts`、`model/game/{reducer,view,test-fixtures,launch-params}.ts`、`model/cpu/cpu-pitcher.ts`、`model/sim/bot-sim.ts`(型の追従だけ)(+test)。
  - やること: `deliverPitch` が `command.aim` と `command.quality` から σ を決める(乱数の消費数は不変)。`gauge.ts` を実装。`chooseCpuPitch` が `CpuPitchChoice` を返し、reducer がセル中心を `aim`・`quality: "normal"` にして `launchPitch`。`view.ts` が `difficulty`・`assist`・チップ用の `speedKmh`/`arrow` を出す。`launch-params.ts` の速度値を更新。
  - 完了条件: 単体テスト — `pitchQualityOf` の境界、`sigmaScaleOf` が単調非減少、`isStopAccepted`、`deliverPitch` の乱数消費が 24 個のまま・CPU の決定論テストが構造を保って通る、失投で着弾が `(0, 0.15)` 側へ寄る、`gaugeRingAt` の端点・単調・`expired`、`aim` が ±1.67 に収まる。
- [ ] **A4: タップ入力の整理(v2 の操作は維持)**
  - 依存: A0。担当ファイル: `model/world/sequence/input-route.ts`(+test)、`session.ts`(+test)。
  - やること: **v2 の `routeStagePointer`/`routeStageMove`/`routeStageRelease`/`isTapGesture` と定数 `TAP_*`、`arrival.ts` は変更しない**。追加は純関数 `tapReleaseReason(input)`(タップが通らなかった理由を `tap-too-long`/`tap-moved`/`not-ready`/`holding`/`cancel`/`held-release` に分類する。play 分冊 §1-1 の T1)と、その境界テストの強化のみ。
  - 完了条件: `input-route.test.ts` が**全組み合わせを走査** — (1) 2 本目以降の指は `swing-here`/`ignore` のみ、(2) `holding` が真のタッチは必ず `skip`、(3) 1 本目の指は `drag-start`、(4) スキップに使った指の離しは `none`(`held-release`)、(5) `isTapGesture` の境界: 持続 180ms ちょうどは真・181ms は偽・負/NaN は偽、移動 10px ちょうどは真・10.01px は偽、(6) 到達の後(`swingReady` 偽)の押下は `not-ready`(空振りにならない)、到達の前の押下は離しが 200ms 保留内なら押下の時刻で判定、(7) マウス/ペンの離しは `none`、(8) `tapReleaseReason` が全入力で定義される。既存のテストが不変で成功。`isSkipKey` は不変。
- [ ] **A5: 演出の純関数(予告・照準とリング・ボールの回転・位置ずれ)**
  - 依存: A0。担当ファイル: 新規 `model/world/sequence/{guide,ball-look,contact-feedback}.ts`(+test)。
  - やること: `guideFrameAt`・`previewRingAt`、`pitchGuideAt`(守備。段階 B で使う)、`ballSpinAt`・`ballHaloAt`、**`zoneFeedbackOfSwing`・`zoneFeedbackOfPitch`**(`ZoneFeedbackView` をゾーン単位で返す)。リングの線幅は `ringWidthFor` の結果を受ける。
  - 完了条件: 単体テスト — リング半径が `t = 0` で startRadius・`t = D` で endRadius(±1e-9)・単調減少・D 以降は保持、`exact` の点が `flight.landing` に厳密一致、`fade` が着弾を含む、`none`、`ballSpinAt` が球種ごとに異なりフォークが最小、`zoneFeedbackOfSwing` の from が判定に使った有効カーソル・to が着弾点に厳密一致し alpha が単調減少して `swingMs` で 0、`zoneFeedbackOfPitch` は `pitchMs` で 0、`pitchGuideAt` のリングが `gaugeRingAt` に一致。
- [ ] **A6: telemetry・prefs・tutorial の純粋ロジック**
  - 依存: A0。担当ファイル: 新規 `model/telemetry/*`、`model/prefs/{prefs,safe-store}.ts`、`model/tutorial/steps.ts`(+test)。
  - やること: 記録の組み立て・リングバッファ(最大 600、JSON 往復)・`summarize`(**タップが通らなかった理由の件数を含む**)・`toCsv`・`fitBotParams`・`parsePrefs`・**`createSafeStore(getStorage)`**・チュートリアルのカード(**タップ方式の文言**。play 分冊 §1-5)。
  - 完了条件: 単体テスト — 600 件超で先頭が落ちる・JSON 往復・不正 JSON は空、`summarize` が手計算と一致、`fitBotParams` が既知の分布を ±5% で復元、`parsePrefs` が欠損を既定値で補う、`getStorage`/`setItem` が例外を投げる偽のストレージでも例外を出さない。
- [ ] **A7: render — マーカー(予告・リング・照準・ボール)**
  - 依存: A0。担当ファイル: `render/{markers,look}.ts`、`render/dispose.test.ts`(+test)。
  - やること: `guide`・`cursor.raw`・`ball.rotation`/`halo`(**必須**・暖色)/`outlineScale`・縫い目(太い赤い帯の弧 2 本)・旧 `aim` の削除。描画順は v2 の規則に新要素を割り当てる。**3D の位置ずれ表示(`feedback`)は作らない**(DOM。A12)。
  - 完了条件: 単体テスト(smoke)— 生成・可視・破棄(リークなし)、縫い目が `rotation` に従う、リングの半径・線幅が `guide.ring` に一致、ボールが `transparent`/`depthTest false`、ハローが常に生成される。`import * as THREE`・`document`・`window` が無い。
- [ ] **A8: render — ステージ・ポーズ・統計**
  - 依存: A0。担当ファイル: `render/{stage,pose-apply}.ts`(+test)。
  - やること: `StageHandle.stats()`、バットの `lengthScale` をチルトグループの z 方向に適用、新フィールドを含むフレームを `applyMarkers` へ渡す。
  - 完了条件: 担当 test 成功。`stats()` が破棄後 `null`。`window`/`document`/`matchMedia` を使うのは `stage.ts` のみ。

### ウェーブ A-3(接続・合成・UI。4 並列)

- [ ] **A9: hooks — 打撃入力(タップ方式のまま)**
  - 依存: A0, A1, A4。担当ファイル: `hooks/{usePointerInput,useBattingControls,usePitchFlight,useKeyboardInput}.ts`。
  - やること: **`usePointerInput` のジェスチャ処理(ドラッグ・タップ候補・保留・held)は v2 のまま**。変更は (1) `onSwing(origin, cursorAtDown)` を受ける `useBattingControls` が、**押下時刻の `progress`** で `lockOnCursor(cursorAtDown)` を適用して `SwingInput.cursor` と `assistK` を作る(play 分冊 §1-1 の T4)、(2) 有効カーソルを director へ渡す、(3) `tapReleaseReason` で分類した理由を通知する(ヒント・ログ)、(4) pointercancel を記録する。`usePitchFlight` の `isAiming` などは不要。
  - 完了条件: lint 0 件・typecheck 起因 0 件。`usePointerInput` が `holding` を直接参照していない。unmount・pointercancel でタップ候補と保留が解除される。スキップに使った指の離しでスイングしない。**タップのスイングの `SwingInput.cursor` が、押下時刻に表示されていた有効カーソルと一致する**(離した時刻の進行度で計算しない)。
- [ ] **A10: hooks — 設定・ログ・fps**
  - 依存: A0, A6。担当ファイル: 新規 `hooks/{usePreferences,usePlaytestLog,useFramePerf}.ts`。
  - やること: `usePreferences`(`createSafeStore`)、`usePlaytestLog`(`PLAYTEST_ENABLED`・メモリのリングバッファを主・任意の保存)、`useFramePerf`(rAF 間隔の収集と窓ごとの p95)。全 effect に cleanup。
  - 完了条件: lint 0 件・typecheck 起因 0 件。`PLAYTEST_ENABLED` が偽のとき `localStorage` に書かない。`localStorage` は `createSafeStore` 経由だけ。
- [ ] **A11: sequence の合成 A(予告・リング・ボール・打者)**
  - 依存: A0, A1, A2, A3, A5。担当ファイル: `model/world/sequence/{frame,play-plan}.ts`(+test)、`sequence/{world-consistency,batter-screen}.test.ts`。
  - やること: `guide`(打撃の予告)・`cursor.raw`・`ball.rotation/halo/scale(飛行中の最小径)/outlineScale`・`BatPose.lengthScale`・`batterRootFor` を合成。`batHeightInRoot` は補間後の scale で割る。旧 `aim` を削除。`SceneFrameInput` に `assist`。`PlayPlan.chaseFromMs` は v2 のまま `contactMs`(変更しない)。位置ずれは A13 の director が props に渡すので `frame.ts` では合成しない。
  - 完了条件: 単体テスト — `guide` の `exact` がリリースから D+hold まで可視、リング半径が `previewRingAt` に一致、ボールの表示径が飛行中ずっと最小径以上(「一度消えたら再出現しない」性質を維持)、縦横比の補間域でバットの高さがボールの高さと一致、接触後のカメラが v2 と同じ時刻表のままで `rig.test` の既存のテストが不変、既存の性質を維持。`batter-screen.test.ts` は v3 の数値に更新。各関数 60 行以内。
- [ ] **A12: UI — 説明・試遊ログ画面・位置ずれ(DOM)・ピル・ヒント・入力面の抑止**
  - 依存: A0, A5, A6。担当ファイル: 新規 `ui/{Tutorial,PlaytestPanel,ZoneFeedback}.tsx`+CSS、`ui/{StageView,SwingControls,GameLayout}.tsx`、`ui/baseball-stage.css`。
  - やること: `Tutorial`(タップ方式のカード)・`PlaytestPanel`(要約表・全選択できる `<textarea readonly>`・コピー・ダウンロード・共有・消去・保存失敗の表示・縮小表示の警告)。`ZoneFeedback`(`zoneRect` に固定した DOM のミニ図。線のみ、`pointer-events: none`)。`StageView` のピルを 2 行に、ヒント文(**タップのヒント `tapHint`: 「ポンと おす」**)、`data-*` ミラー、**ステージの `contextmenu` を `preventDefault`**。`SwingControls` を縮小(80px)。`GameLayout` に `tutorial`/`playtest`/`zoneFeedback` スロット。CSS: `.bb-stage__input--active` に callout/user-select 抑止を足し、人間守備中も付けられる構造にする。
  - 完了条件: lint 0 件・typecheck 起因 0 件。`ui/` が `../model`・`../render`・`../audio` を import していない。hooks を呼ばない。ピル・ヒント・`ZoneFeedback` が `pointer-events: none`。ボタンは 44px 以上。`ZoneFeedback` が `zoneRect` の変化に追従する。

### ウェーブ A-4

- [ ] **A13: 統合 A と全体確認(打撃の骨格)**(直列)
  - 依存: A7〜A12。担当ファイル: `hooks/{useStageDirector,useGameStage,useGame,useStage3d}.ts`、`ui/{GameScreen,BaseballGamePage}.tsx`、残った型・lint エラーの解消に必要な最小限のファイル。
  - やること: director が新項目を毎フレーム渡し、有効カーソルを表示する。`zoneFeedback`・`tapHint` を props に渡す。`useGameStage` が `tutorialActive`・`usePreferences`・`usePlaytestLog`・`useFramePerf` を結線し、`stage.stats()` を起動時にログへ。`inputActive` を人間打撃中に付ける。**人間守備は旧格子 UI のまま**、`onThrow` が `{ kind, aim: セル中心, quality: "normal" }` を作って渡す。`skip()` は reducer に触れない・`stage === null` でも進行が止まらない。`cd sample-app && npm run typecheck && npm run lint && npm run test && npm run build` を通す。構造検査・knip レポートを確認。バンドルサイズを記録。**試遊ビルド**(`VITE_PLAYTEST=1`)を作り、1 試合が通ることを確認する。E2E は D2 で更新するので、ここでは手動確認だけ。
  - 完了条件: 上記がすべて成功(typecheck は全体で緑)。構造検査 1〜15 が pass。試遊ビルドの手順を完了報告にまとめる。
  - **→ T1(中間試遊。ゲート1で承認済み: Q8)**: orchestrator が試遊ビルドを人間に渡し、「**打撃 20 打席(約 60 球)を遊んで、試遊ログ(画面の JSON)をコピーして貼る**」ことと「打てた/微妙/打てない」の 3 択を `AskUserQuestion` で聞く(キャラクターは v2 のまま・演出と音と新しい投球は未実装と伝える。**操作は v2 と同じタップ方式で、予告・リング・ロックオンが加わった版**)。ログは A14 の較正に使い、結果によっては E3 の前に A1・A2・A4 を直す。
- [ ] **A14: 人間代理ボット v2(打撃)と打撃バランス**
  - 依存: A13(と T1 のログがあればそれ)。E0・B1・B2 と並列可。**E3・E4 より先に完了する**。担当ファイル: 新規 `model/sim/{human-bot,human-game}.ts`、`model/sim/human-bot.test.ts`、`model/sim/bot-balance.test.ts`、`model/batting/{params,result-table,batted-ball,assist}.ts` の**値**。
  - やること: 「人間代理ボット v2」を実装し、受け入れ帯(E 群)を満たすよう、ロックオン強度・結果表・強さのしきい値・`foulRatio`・`qualityPenalty` を調整する。**失敗の型はタップ方式のもの**(`slowTapRate`・`driftTapRate`・`cancelRate`・`ignoreRing`。本体 §4-1)。**検出力テストを先に通す**(調整先は共有パラメータだけ)。旧ボット(A〜E)は「補助なし・理想知覚」の参照として残す。
  - 動かしてよい値(この順に): `ASSIST_TABLE` の `lockStrength`(±0.15)・`captureRadius`(±0.4)・`qualityPenalty`(0.2〜0.5)、`linerHalfBand`(0.08〜0.22)、`mediumFrom`(0.28〜0.45)、`strongFrom`(0.5〜0.75)、`RESULT_TABLE` の重み(v2 の不変条件を守る範囲で各セル ±8)、`foulRatio`(0.6〜0.8)。**動かさない値**: `contactWindowMs`・`powerWindowScale`・`centerRatio`・`lateCutoffMs`・`inputLatencyMs`・`ballReachX/Y`・`meetBaseRx`・`TAP_*`、ボットの「リング無し」の `biasMs`。
  - 完了条件: `npx vitest run src/features/baseball/model/sim` 成功、E 群の帯をすべて満たす。満たせない帯は緩めずに理由と最良の値を報告。ボットテストの時間予算内。E3 の後(E11)に再実行され、帯を外れたら A14b で再較正される。

## 段階 E: キャラクターの作り直し(標準)

「最大」の分は段階 M。**描画予算(draw call・三角形)の目標と品質ティアは character 分冊 §3-4-10**。

- [ ] **E0: 段階 E の契約と定数の凍結**(直列。A13 の後。A14・B1・B2 と並列可)
  - 依存: A13。担当ファイル: `types/{team,game,scene,stage,view}.ts`(段階 E の分)、新規 `render/character/parts.ts`(型と定数のみ)、`render/test-fixtures.ts`(E の新フィールドの既定値)、`model/world/space/params.ts`(E の分の値)。
  - やること: contract 分冊 §5-2 のとおり、E の型を定義し、**`render/character/parts.ts` に `CharacterParts` 契約(`SkinnedMesh` 方式のハンドル)と `JOINT_ORDER`・`FACE_PATCH`・`DECAL_SIZE`・`WIPE_LAYER` を置く**。`WORLD_PARAMS` に `character`・`runners`(**`infieldCamera.halfWidthTan 0.60` を含む**)・`wipe`・`qualityTier`(`heavy*` を含む)・`actors.framingScale` を入れる。`motion/*`・`teams.ts`・`state.ts` には触れない。壊れる箇所の一覧を完了報告に書く。
  - 完了条件: 担当ファイルの lint 0 件・typecheck 起因 0 件。`types/` が他セグメントを import していない。`render/character/parts.ts` が型と定数だけで、`render/` 以外から import されない。E5・E6 が `parts.ts` だけを見て並列に作業できる。

#### ウェーブ E-1(4 並列。E0 の後)

- [ ] **E1: 見た目のデータ・表情のタイムライン・ティア・表示倍率の純関数**
  - 依存: E0。担当ファイル: `model/data/teams.ts`(+test)、新規 `model/character/{look,expression,quality-tier,framing-scale}.ts`(+test)。
  - やること: 20 人の `PlayerLook` を `teams.ts` に加算(判定・乱数に影響しない)。`look.ts`: 守備/走者のスロットへの割り当て。`expression.ts`: `expressionAt`。`quality-tier.ts`: `nextTier`(**2 秒窓・p95 > 28ms が 2 窓連続で 1 段下げる・p95 > 45ms またはフレームの 10% 以上が 50ms 超なら 2 段下げる・自動では上げない**)。`framing-scale.ts`: `framingScaleAt`。
  - 完了条件: 単体テスト — 20 人全員で (髪型, 髪色, 肌, 体格, 目) の組が異なり背番号がチーム内で一意、全スロットに look が割り当たる、全 `outcome.kind × inPlay.result × plate × 役割` で `expressionAt` が定義される、まばたきが決定論で周期 2.8 秒・120ms、`nextTier` が閾値・連続窓・**重い場合の 2 段降格**・上限(T3)・自動で上げないことを満たす、`framingScaleAt` が連続で `cameraBlend = 1` のとき全スロット 1.0・走者/野手/捕手は常に 1.0。
- [ ] **E2: 顔・背番号・ユニフォーム柄のラスタ(純粋関数)**
  - 依存: E0。担当ファイル: 新規 `model/character/raster/{face,number,fabric,primitives}.ts`(+test)。
  - やること: SDF のプリミティブで、96×96 のセル 8 表情の顔アトラス(384×192 RGBA)を `PlayerLook` から生成。**各セルの外周 4px は肌色で塗る**。0〜99 の背番号(自前の 5×7 ビットマップ拡大)、ピンストライプの縞(64×64)。
  - 完了条件: 単体テスト — 8 表情のセルが互いに異なる画素を持つ、同じ入力で同じ出力(ハッシュ固定)、目の中心画素が不透明で期待位置にある、目の形 4 種が異なる、背番号 0〜99 が全て描ける、アトラスの大きさ 384×192×4、各セルの外周 4px が肌色。生成時間は参考値として出力するだけ(判定に使わない)。`document`・`window`・`three` を import しない。
- [ ] **E5: render — キャラクターの造形(`SkinnedMesh`・メッシュ統合・LOD)**
  - 依存: E0(`render/character/parts.ts`)。担当ファイル: 新規 `render/character/{index,geometry-merge,skeleton,head,hair,headwear,torso,limbs,gear,outline,lod}.ts`(+test)、削除 `render/character.ts`(置換)。
  - やること: 頭・髪 6 種・ヘルメット(打者。投手側の左耳のフラップ)/帽子・胴・腕・脚・バットを、**自前の `mergeGeometries`(`skinIndex`・`skinWeight` を保持)で 1 つの `BufferGeometry` に統合**し(頂点カラー。各頂点を 12(打者 13)本のボーンのいずれか 1 本に剛体として割り当てる)、`Skeleton` + `Bone` で `SkinnedMesh` 1 つにする。輪郭は法線方向に押し出した複製の `SkinnedMesh`(同じ `Skeleton` を共有・`BackSide`)。顔と背番号は通常の `Mesh`。`createCharacterParts(look, lod)`・`dispose()`・`setWipeLayer`。体格。LOD: 近景(体+輪郭+顔+背番号)・遠景(体+顔)。`BufferGeometryUtils` を使わない。**character 分冊 §3-4-10 の `SkinnedMesh` の確認事項 1〜6 を r186 で確認し、結果を完了報告に書く**。
  - 完了条件: 単体テスト(smoke)— 近景 1 体 = 体 1 + 輪郭 1 + 顔 1 + 背番号 1 = 4(影を除く)、遠景 = 2、三角形 近景 ≤ 4000(輪郭込み ≤ 6000)・遠景 ≤ 1200、体格 3 種で幅の比が 0.9:1.0:1.15、ボーン数 12(打者 13)、体と輪郭が同じ `Skeleton` を共有、破棄でリークなし、`BufferGeometryUtils` を import していない。`SkinnedMesh` で致命的な問題が出て回避できない場合は実装せずに上申する。
- [ ] **E6: render — 顔・ユニフォーム・表情の適用・ボーンへのポーズ**
  - 依存: E0(`CharacterParts` 契約)。E5 の実装を待たない。担当ファイル: 新規 `render/{character-look,textures}.ts`、`render/pose-apply.ts`(+test)。
  - やること: `applyLook(parts, data)`(`DataTexture` を作り、顔アトラス・背番号・縞を貼る。**`LinearFilter`・`LinearMipmapLinearFilter`・`generateMipmaps = true`**。キャッシュと破棄)、`applyExpression(parts, expression)`(**`offset` の UV 切替だけ**)、色の反映、`pose-apply.ts` に**ボーン**への回転の適用(肘・膝を含む。`CharacterPose.scale`)。
  - 完了条件: 単体テスト — 表情の切替で `texture.offset` だけが変わり `needsUpdate` が立たない、`applyLook` の再呼び出しで古いテクスチャが破棄される、顔のテクスチャが Linear+mipmap、肘・膝のボーンの回転が反映される、`CharacterPose.scale` が root に反映される、`document`・`window` を使わない。

#### ウェーブ E-1b(2 並列。A14 の完了と T1 の結果の反映の後)

- [ ] **E3: リグ・フォーム・投手の拡大**
  - 依存: E0, **A14 の完了**, T1 の結果(A2 の修正が必要ならその修正の後)。担当ファイル: `model/world/motion/{rig,pose,fk,batter,pitcher,fielder}.ts`、新規 `model/world/motion/forms.ts`、`model/world/space/params.ts`(`actors.pitcher.scale 1.30`・`RELEASE_POINT` の値のみ)、`camera/{rig,project}.test.ts`・`path/pitch-path.test.ts`・`path/pitch-screen.test.ts`・`motion/*.test.ts`(数値の更新)。
  - やること: 腕を上腕+前腕・脚を大腿+下腿に分ける(FK。`CharacterPose` に `expression`・`elbowL/R`・`kneeL/R`・`scale` を出す)。`forms.ts`: 投球フォーム 3 種・打撃の構え 3 種・野手(待機・走り・捕球・ゴロ捕球・送球)・走者(リード・走り・喜び)・感情のポーズ。**固有フォーム(段階 M)のパラメータを受けられる構造にする**(`forms.ts` の関数が `params` を引数に取る)。**投手を scale 1.30(構図の倍率)にし、`RELEASE_POINT` を FK の手先に合わせて更新**(手先が 0.15m 以内。フォーム別のリリース点は採らない)。カメラの `fit` が追従することを `rig.test`/`project.test` の数値(E 完了後の列)で確認する。`pitch-screen.test` の S300 が崩れるときは `speedProfile` の範囲で調整。
  - 完了条件: 単体テスト — 投球 3 種の FK の手先がリリース点から 0.15m 以内、打撃の構え 3 種がゾーン枠・格子と重ならない、野手の捕球ポーズでグローブが落下点に届く、全フォームで関節の角度が有限・連続、全身の高さ ÷ 頭の高さが全体格で 2.0〜2.6、390×844 の打撃で投手の頭頂 y ≥ HUD 下端 + 8px・身長 ≥ 90px・頭径 ≥ 40px。`pitch-screen.test`・`bot-balance.test` が成功。
- [ ] **E4: 進塁の事実・走者・捕球・送球の計画**
  - 依存: E0, **A14 の完了**。担当ファイル: `model/game/{state,outcome,view}.ts`(加算のみ)、`model/game/{reducer,state}.test.ts`(`lastAdvance` による全体 `toEqual` の更新)、`model/world/path/{runners,fielders}.ts`(+test)、`sequence/world-consistency.test.ts` の追記。
  - やること: reducer が結果の適用時に `GameState.lastAdvance` を記録(乱数・判定には影響しない)し、`view.ts` が `PitchOutcomeView.runners` を作る。`runners.ts`: 塁間の位置と時刻(1 塁 1.6 秒・最大 3.0 秒・ホームランは動かさない)。`fielders.ts`: 捕球・ゴロ捕球・送球の計画と送球のボール軌道。結果ごとの演出の表。
  - 完了条件: 単体テスト — `lastAdvance` の追加で reducer の既存の決定論テストが不変、全結果 × 塁状況の組で走者の最終位置が `after` と一致・得点数と本塁に着いた走者の数が一致・アニメの長さ ≤ 3.0s、アウトのとき送球のボールが走者より先に着く・安打のとき走者が先に着く、併殺で 2 回送球、ホームランで走者が動かない。

#### ウェーブ E-2(4 並列)

- [ ] **E7: render — ステージ(14 体のプール・ワイプ・品質ティア)**
  - 依存: E5, E6。担当ファイル: `render/{stage,look,stadium}.ts`(+test)。
  - やること: 近景 4 体・遠景 10 体のプール(`SceneFrame.runners`・各 `CharacterPose.expression`)。足元の影の円盤(遠景)は `InstancedMesh` 1 つ。`StageHandle.setLook`。**ワイプ**: 第 2 パス(対象キャラクターだけ `setWipeLayer(true)`、ワイプ用カメラは `layers.set(WIPE_LAYER)`、地面と空だけ同じレイヤー。draw call ≤ 12)。`setQualityTier`(**飛行中はペンディング、`idle`/`holding` で実行**)。`stats()` に品質ティアとワイプの有無を含む。
  - 完了条件: 単体テスト(smoke)— プールの生成・破棄、ティアの切替で遠景の更新・影・ワイプの可否が変わる、飛行中の `setQualityTier` がペンディングされ `idle` で適用される、`setLook` が未知のスロットを無視、ワイプの第 2 パスで描かれるメッシュが対象キャラクター+背景のみ、`window`/`document`/`matchMedia` を使うのは `stage.ts` のみ。
- [ ] **E8: sequence の合成 E(表情・フォーム・走者・送球・ワイプ・内野カメラ・表示倍率)**
  - 依存: E1, E3, E4(A11 の後)。担当ファイル: `model/world/sequence/{frame,play-plan}.ts`(+test)、新規 `model/world/camera/{infield,wipe}.ts`(+test)。
  - やること: 各キャラクターの `expression`・フォーム・`CharacterPose.scale`(`framingScaleAt`)・`SceneFrame.runners`・野手の捕球/送球・送球のボール・走者が動くプレーでの内野カメラへの blend(400ms。**画角 tan 0.60**)・ワイプ(場面と対象。矩形は HUD の下端 + 20px)を合成。**打席の紹介はワイプで出す**(振り向きの動きは作らない)。`PlayPlan` に走者・送球・ワイプの区間を追加し、走者が動くとき `endMs` を最大 +3.0 秒延ばす。
  - 完了条件: 単体テスト — ワイプのカメラの前方と顔の向きの内積 ≤ −0.6、矩形が 390×844 と 390×664 でゾーン・ボールの通り道・HUD と重ならない、走者が動くプレーだけ内野カメラへ blend しカメラが連続、内野カメラの画角で一塁・三塁の走者が画面内、`CharacterPose.scale` が連続で blend 終了時に 1.0、`endMs` の上限、既存の性質を維持。各関数 60 行以内。
- [ ] **E9: hooks — 見た目のデータの受け渡し・品質ティア**
  - 依存: E2。担当ファイル: 新規 `hooks/{useCharacterLooks,useQualityTier}.ts`。
  - やること: `useCharacterLooks`(スロットの `PlayerLook` が変わったら `CharacterLookData` を作り `stage.setLook`。キャッシュ。1 フレーム 1 体まで・飛行中/演出中は生成しない・先読み・無地の仮の顔)。`useQualityTier`(`useFramePerf` の窓の p95 を `nextTier` に渡し `stage.setQualityTier`。飛行中はペンディング。**初期ティアは直近のセッションのティア(`createSafeStore` 経由)を使い、起動直後 60 フレームの中央値が 22ms を超えたら T1 から始める**。`?tier=` で固定。切替をログへ)。全 effect に cleanup。
  - 完了条件: lint 0 件・typecheck 起因 0 件。`hooks/` から `three` を import していない。`useCharacterLooks` が同じ look を二度生成しない。飛行中に生成・ティア切替を呼ばない。
- [ ] **E10: UI — ワイプの縁取り・打席の紹介**
  - 依存: E0。担当ファイル: 新規 `ui/CutIn.tsx`+CSS、`ui/StageView.tsx`。
  - やること: `CutIn`(縁・名前・背番号・役割ラベル。props のみ。`pointer-events: none`)、`StageView` に `wipe` と `data-wipe`・`data-quality-tier`・`data-expr-*` を追加。打席の紹介カード。
  - 完了条件: lint 0 件・typecheck 起因 0 件。`ui/` が `../model`・`../render`・`../audio` を import していない。縁取りが `pointer-events: none`。

#### ウェーブ E-3

- [ ] **E11: 統合 E と全体確認(キャラクター)**(直列)
  - 依存: E7〜E10。担当ファイル: `hooks/{useStageDirector,useGameStage,useStage3d}.ts`、`ui/GameScreen.tsx`、必要最小限の修正(**`model/world/sequence/*` は対象外**。必要な修正は編集せず上申する)。
  - やること: director が `runners`・`wipe`・表情・フォームの入力を渡し、`useGameStage` が `useCharacterLooks`・`useQualityTier` を結線する。全体の typecheck・lint・test・build を通す。**`renderer.info` で描画予算を実測**(`stats()`: ティア T0〜T3 の draw call・三角形・キャラクター 1 体あたりのメッシュ数・ワイプの第 2 パスの draw call。**球場の既存の draw call の基準値を確定する**)し、character 分冊 §3-4-10 の目標に対する結果を完了報告に書く。knip・バンドルサイズを記録。**`model/sim` のボットのテストを再実行**し、帯を外れたら値を触らず上申(A14b)。**キャラクターの確認用のスクリーンショット**(打撃・守備・表情シート・個性・フォーム・走者・ワイプ。390×844 と 390×664)を撮り、`docs/tests/assets/2026-10-27-baseball-game-v3/characters/` に保存する(1 枚 500KB 以下)。
  - 完了条件: 全体の typecheck・lint・test・build が成功。構造検査 1〜15 が pass。描画予算の目標を満たす(満たさない項目は理由と対策を報告)。`model/sim` のテストの結果を報告。
  - **→ T1b(キャラクターの見た目の確認。ゲート1で承認済み: Q8)**: orchestrator が上のスクリーンショットと試遊ビルドを人間に渡し、「パワプロっぽいか(はい/まだ足りない)」と足りない点を `AskUserQuestion` で聞く。足りない点は段階 B 以降の前に E の調整に回す。

## 段階 B: 投球の骨格

- [ ] **B1: 投球入力の状態機械**
  - 依存: A13。担当ファイル: 新規 `model/world/sequence/pitch-input.ts`(+test)。
  - やること: `reducePitchInput(state, event, ctx)`(`idle` → `aiming` → `gauge` → `throwing`)。ゲージ開始から `stopGuardMs` の停止は無視。副作用は `effect`。`holding`・`enabled` が偽なら無視。**持ち越しの指(スキップに使った指)の規則**: その指の離しはゲージを始めない(`none`)、最初の move で狙い開始(`aiming`)、複数あるときは最初に下りた `pointerId` を昇格。
  - 完了条件: 全組み合わせの単体テスト — 離し=確定+ゲージ開始、ゲージ中の押す=停止+投球、`stopGuardMs` 未満の停止は無視、`ringMs + graceMs` で自動投球(失投)、ゲージ中の動きは狙いを変えない、`aimLimit`、キー・ボタンでも同じ遷移、`timeScale`、`holding` 中は何も起きない、持ち越しの指を離してもゲージが始まらない・最初の move で `aiming` になる・複数の持ち越しの指で最初に下りた pointerId が昇格する。
- [ ] **B2: UI — 守備の操作バー**
  - 依存: A13。担当ファイル: `ui/{GameLayout,PitchingControls,PitchKindButtons}.tsx`、削除 `ui/CourseGrid.tsx`、CSS。
  - やること: 守備の操作バーを「球種チップ(球速・矢印つき、76×52px)+ 操作ボタン(投げる/とめる!、96×52px)」に作り直す(高さ ≈ 130px、800px 未満で ≤ 140px)。`inputState` を `data-input-state` に反映。
  - 完了条件: lint 0 件・typecheck 起因 0 件。`ui/` が `../model`・`../render`・`../audio` を import していない。守備の `bb-overlay__bottom` の高さを 390×844・745・664 で測った値を完了報告に書く(≤ 135 / 140 / 140px)。ボタン・チップは 44px 以上。
- [ ] **B3: CPU 打者の反応(位置・質・連投)**
  - 依存: A14。担当ファイル: `model/cpu/{cpu-batter,difficulty}.ts`、`model/game/balance.test.ts`(基準は不変)。
  - やること: play 分冊 §2 の式を実装し、`qualitySensitivity` を追加。`cursorSigma`・`timingSigmaMs`・`zoneSwingRate` の出発値を、CPU 同士の打率 .23〜.29・三振率・四球率の基準を保つよう調整する。
  - 完了条件: 単体テスト — ナイスは ふつう より実効 cursorSigma が大きい(`hard` では差が小さい)、縁は中央より大きい、失投は振る確率が上がる(上限あり)、`quality: "normal"` かつ extent ≤ 0.5 で v2 と同値。`balance.test.ts` が基準を変えずに成功。難易度の順序を維持。
- [ ] **B4: hooks — 投球入力**
  - 依存: B1。担当ファイル: 新規 `hooks/{usePitchingControls,usePitchKeyboard}.ts`。
  - やること: `usePitchingControls`(ポインタ・操作ボタン・キーから `reducePitchInput` を駆動、`aim`/`quality` を `onThrow` で渡す、`PitchInputView` の公開、タイマー解除。`pickZone`・`getZoneRect`・`holding`・`onSkip` を注入で受け、演出中のスキップは `routeStagePointer` を先に通す。持ち越しの指を `pointerId` の ref で持ち、離してもゲージを始めず、最初の move で狙い開始)。`usePitchKeyboard`(矢印・Space/Enter。`defaultPrevented` で排他。[[dom-key-input-exclusivity]])。
  - 完了条件: lint 0 件・typecheck 起因 0 件。ゲージ時刻は `event.timeStamp` 経由。`timeScale` を反映。`getBoundingClientRect` を自分では使わない。Space の keydown 1回でスキップと投球が同時に起きない。スキップに使った指の離しでゲージが始まらない。
- [ ] **B5: sequence の合成 B(照準・ゲージ)**
  - 依存: A5, B1, E8。担当ファイル: `model/world/sequence/{frame,play-plan}.ts`(+test)。
  - やること: `pitchInput` から守備の `guide`(`reticle`・散布円・ゲージのリング)を合成。`layout` は人間守備なら `"pitching"`。狙いと着弾の重ね表示は DOM なので `frame.ts` では合成しない。
  - 完了条件: 単体テスト — 守備の `guide.mode = "reticle"`・ゲージ中のリングが `gaugeRingAt` に一致・飛行中は狙いを保持し選択の変更で動かない、段階 A・E の性質テストが不変。
- [ ] **B6: 統合 B と全体確認(投球)**(直列)
  - 依存: B2〜B5, E11。担当ファイル: `hooks/{useStageDirector,useGameStage,useGame,useStage3d}.ts`、`ui/GameScreen.tsx`、必要最小限の修正。
  - やること: director が `pitchInput` を渡し、`layoutOf` を「人間守備 = pitching」に。windup を `humanWindupMs` で。人間守備のモードで `usePitchingControls` のハンドラをステージの入力面に渡す。`inputActive` を人間守備中も真に。`onThrow` を新しい `PitchCommand` に。`zoneFeedback`(`zoneFeedbackOfPitch`)を props に渡す。`GameScreen` から `selection`(セル)を削除。投球のログ。全体の typecheck・lint・test・build を通す。
  - 完了条件: 全体が緑。`skip()` が reducer に触れない。守備の入力面で `touch-action: none` が有効。

## 段階 C: 演出・音

- [ ] **C1: 演出の純関数(バナー・接触演出)**
  - 依存: B6。担当ファイル: 新規 `model/world/sequence/{banner,hit-fx}.ts`(+test)。
  - やること: `bannerFor`(帯の位置は play 分冊 §3-2)、`hitFxAt`(`reducedMotion` は入力)。
  - 完了条件: 単体テスト — `bannerFor` が全 `kind × inPlay.result × plate` を網羅(なしは `null`)、帯が y 312〜408px の範囲、`hitFxAt` が連続・`reducedMotion` で 0。
- [ ] **C2: 音・触覚の対応表**
  - 依存: B6。担当ファイル: 新規 `model/sound/{cues,sfx-plan,haptics}.ts`(+test)。
  - やること: `SFX_RECIPES`(`throw`・`catch` を含む)、`sfxEventsOf`、`gaugeTicksOf`、`hapticFor`(最短 15〜20ms)。
  - 完了条件: 単体テスト — 全 `SfxCue` にレシピ、長さ ≤ 2.5s・ゲイン ≤ 1・周波数 20〜12000Hz、`sfxEventsOf` が結果種別ごとに期待する cue を `atMs` 昇順で返す、決定論、`hapticFor` の最短が 15ms 以上。
- [ ] **C3: audio — Web Audio エンジン**
  - 依存: B6。担当ファイル: 新規 `audio/{engine,voices,index}.ts`(+test)。
  - やること: `createAudioEngine({ recipes, createContext })`(`unlock()` はユーザー操作として認められるイベントの中で。`resume()` による復帰、ミュート、同時発音 8、終了後の切断、`dispose`)。ノイズバッファは mulberry32 で 1 回。
  - 完了条件: 偽のコンテキストで単体テスト — `unlock` 前は無音、`suspended` から復帰、ミュートで node 0、同時発音の上限、切断(リーク 0)、`dispose` が冪等。`AudioContext` に触れるのは `audio/` のみ。
- [ ] **C4: UI — 演出の表示・音ボタン・画質**
  - 依存: B6(A0 の型)。担当ファイル: 新規 `ui/EffectBanner.tsx`+CSS、`ui/{StageView,StageTelop,TitleScreen,ScoreHud,GameLayout}.tsx`+CSS。
  - やること: `EffectBanner`(位置は play 分冊 §3-2)、ゲージ中のヒント文、バナーが出る間はテロップを出さない。HUD にスピーカーボタンと「?」、タイトルに音・振動の切替(**既定 ON**)・「画質: 自動/標準/低」・「あそびかた」・(試遊ビルドだけ)「試遊ログ」。`GameLayout` に `sound`・`onOpenHelp`。
  - 完了条件: lint 0 件・typecheck 起因 0 件。`ui/` が `../model`・`../render`・`../audio` を import していない。バナーが `pointer-events: none`。ボタンは 44px 以上。
- [ ] **C5: hooks — 音・触覚**
  - 依存: C2, C3。担当ファイル: 新規 `hooks/{useSfx,useHaptics}.ts`。
  - やること: `useSfx`(エンジンの生成・`pointerup`/`touchend`/`click`/`keydown` で `unlock`・`visibilitychange` で `resume`・`fire(prevMs, nowMs)`・ミュート・UI 音)、`useHaptics`。全 effect に cleanup。
  - 完了条件: lint 0 件・typecheck 起因 0 件。`hooks/` から `three` を import していない。`pointerdown` のみで `unlock` していない。
- [ ] **C6: sequence の合成 C(バナー・ヒットストップ・カメラ演出)**
  - 依存: C1。担当ファイル: `model/world/sequence/{frame,play-plan,telop}.ts`(+test)。
  - やること: `PlayPlan` に `banner`・`hitStopMs`(打球・野手・走者・テロップ・終了時刻を後ろへずらす)、カメラへ `hitFx`、バナーのある結果はテロップを `null`。
  - 完了条件: 単体テスト — 接触時のカメラが連続、ヒットストップが 0 のとき段階 A・E と同じ時刻表、`reducedMotion` で `hitFx` が 0、バナー有りでテロップが `null`、`endMs ≤ D + 上限`。
- [ ] **C7: 統合 C と全体確認(演出・音)**(直列)
  - 依存: C4〜C6。担当ファイル: `hooks/{useStageDirector,useGameStage}.ts`、`ui/GameScreen.tsx`、必要最小限の修正。
  - やること: director が `reducedMotion` を渡し、`banner` を props に入れる。`useGameStage` が `useSfx`・`useHaptics` を結線。`GameLayout` へ `sound`・`onOpenHelp`・`banner`。全体の typecheck・lint・test・build、バンドルサイズ・knip レポートを記録。
  - 完了条件: 全体が緑。構造検査 1〜15 が pass。

## 段階 M: 最大(ゲート1の回答 Q-char = 最大で追加。設計は [max 分冊](2026-10-27-baseball-game-v3-max.md))

**規模**: 14 ステップ・4 ウェーブ(M0 直列 → M1〜M7 の 7 並列 → M8〜M12 の 5 並列 → M13 直列)。新規ファイル約 45。**描画予算**: T0 で +約 10 draw call・+約 21k 三角形(シーン全体 T0 ≤ 215・T1 ≤ 205・T2 ≤ 166・T3 ≤ 113。max 分冊 §3-5-10)。

- [ ] **M0: 段階 M の契約と定数の凍結**(直列。C7 の後)
  - 依存: C7。担当ファイル: `types/{team,scene,view}.ts`(M の分)、新規 `types/replay.ts`、新規 `render/stadium/parts.ts`(型と定数のみ)、`render/test-fixtures.ts`、`model/world/space/params.ts`(M の分)。
  - やること: contract 分冊 §5-4 のとおり、`SignatureForm`・`TimeOfDay`・`SceneFrame.stadium`・`SceneFrame.fx`・`ScoreboardView`・`ReplayView`・`ReplayRecord`・`GameStageViewProps` の追加・`StadiumParts`/`CrowdParts`/`DustParts` 契約と定数を定義し、`WORLD_PARAMS` に `stadiumMax`・`replay`・`slide`・`cover` と更新後の `budget` を入れる。`motion/*`・`render/stadium.ts` などの実装には触れない。壊れる箇所を完了報告に一覧する。
  - 完了条件: 担当ファイルの lint 0 件・typecheck 起因 0 件。`types/` が他セグメントを import していない。`render/stadium/parts.ts` が型と定数だけで `render/` 以外から import されない。M6・M7・M8 が `parts.ts` だけを見て並列に作業できる。

#### ウェーブ M-1(7 並列。M0 の後)

- [ ] **M1: 選手別の固有フォーム(データ)**
  - 依存: M0, E1, E3。担当ファイル: `model/data/teams.ts`(`signature` の加算)、新規 `model/character/signature.ts`、新規 `model/world/motion/signature.ts`(+test)。
  - やること: 20 人の `SignatureForm`(打者 18 人 = 構えの幅・バットの傾き・手の高さ・waggle 周期・leg kick 量・頭の傾き+追加キーフレーム+ホームラン後の喜び 5 種、投手 2 人 = 固有の windup とフォロースルー、野手のグローブ/送球スタイル)を定義。`signatureOf(slot)`。`params`/`extras` から `JointPose` のキーフレームを作る純関数。判定・乱数に影響しない。
  - 完了条件: 単体テスト — 20 人全員で `SignatureForm` が互いに異なる(`params` と `extras` のいずれか 2 項目以上が違う)、構えの代表ポーズ同士の関節角の最大差 ≥ 0.10rad、全フォームで関節角が有限・連続、投球フォームの手先がリリース点から 0.15m 以内、決定論。
- [ ] **M2: スライディング・ベースカバー・喜びのキーフレーム**
  - 依存: M0, E3。担当ファイル: 新規 `model/world/motion/slide.ts`、`model/world/motion/{forms,fielder}.ts`(追加のキーフレーム)(+test)。
  - やること: スライディング(足から/頭から。0.5 秒)、ベースカバーの構え・送球を受ける動き、喜びのポーズ 5 種、`dustAt(t)`(土煙の位置と年齢。最大 24 点)。
  - 完了条件: 単体テスト — 全ポーズで関節角が有限・連続、スライディングの開始・終了が走りのポーズと連続(飛ばない)、足から/頭から で終端の高さが 0.5m 以下、`dustAt` の点が 24 以下で `slide.dustMs` で全て消える。
- [ ] **M3: スライディング・ベースカバーの計画**
  - 依存: M0, E4。担当ファイル: `model/world/path/{runners,fielders}.ts`、`sequence/world-consistency.test.ts` の追記。
  - やること: `slidePlanOf(outcomeView, seq)`(本塁に生還する安打、併殺の二塁でスライディング。接戦かは `outcomeView` と `seq` のハッシュで決定論)と `coverPlan(outcomeView)`(一塁手が捕ったゴロは投手が一塁をカバー、併殺は反対側の内野手が二塁をカバー、外野から本塁への送球は投手が本塁の後ろをカバー)。塁間の所要時間の枠(最大 3.0 秒)に収める。
  - 完了条件: 単体テスト — 全結果 × 塁状況でスライディングの走者が塁に着く時刻が送球の到着と矛盾しない(アウト = 送球が先、セーフ = 走者が先)、カバーの野手が送球の到着の 0.2 秒以上前に塁に着く、アニメの長さ ≤ 3.0s、決定論、ホームランで動かない。
- [ ] **M4: 球場・時間帯・観客・スコアボードの純関数とラスタ**
  - 依存: M0。担当ファイル: 新規 `model/stadium/{layout,time-of-day,crowd,scoreboard}.ts`、新規 `model/stadium/raster/{grass,ads,sky,scoreboard}.ts`(+test)。
  - やること: `layout.ts`(フェンス・観客席・照明塔・ダグアウト・スコアボードの配置。既存の `WORLD_PARAMS.stadium` に整合)、`timeOfDayFor(inning)`・`timeOfDayAt(inning, tMs)`(光・空・霧・色の膜・ランプ発光の連続な補間)、`crowdEventsOf`・`crowdStateAt`・`crowdPoseOf`(決定論、インデックスのハッシュ)、`scoreboardViewOf`、ラスタ(芝 64×64、看板 512×64、空 4×256、スコアボード 128×64。架空のブランド名)。
  - 完了条件: 単体テスト — 打撃カメラの検算(フェンス y 181〜205、観客席の下段 y 155〜181 が投影で再現できる)、時間帯の値が全て有限・連続・夜のランプ発光が night の blend に比例・`reducedMotion` で即時、`crowdPoseOf` が上下 ≤ 0.35m・傾き ≤ 0.2rad・立ち上がり ≤ 1.25・決定論、`scoreboardViewOf` が `GameView` と一致、ラスタのサイズと画素(看板に実在の商標が無い)。`three`・`document`・`window` を import しない。
- [ ] **M5: リプレイ(記録・時間写像・カメラ・出す条件)とイントロ**
  - 依存: M0。担当ファイル: 新規 `model/replay/{record,timeline,camera,policy}.ts`、新規 `model/world/camera/intro.ts`(+test)。
  - やること: `recordOf`(1 プレーの入力を不変の値に固める。直近 3 プレーのリングの純関数)、`replayTimeAt`(接触の前後 ±0.6 秒を 0.35 倍速、最大 7 秒。単調・連続)、`replayCameraAt`(バックネット高め・一塁側の低め・外野スタンド。結果から選択。0.3 秒のクロスブレンド)、`shouldOfferReplay`(HR・三塁打・二塁打・走者が生還した安打)、`introCameraAt(tMs)`(2.0 秒。打撃カメラへ連続につなぐ)。
  - 完了条件: 単体テスト — `replayTimeAt` が単調・連続・最大 7 秒・スロー区間の傾き 0.35、3 つのカメラが地面の下に潜らない・打球が画面内、カメラ切替が連続、`recordOf` の結果が不変(凍結)で元の入力を変更しない、`shouldOfferReplay` が全結果で定義、`introCameraAt` の終端が打撃カメラと一致、`reducer` を import していない。
- [ ] **M6: render — 球場の静的部分(看板・照明塔・ダグアウト・スコアボード・芝・時間帯)**
  - 依存: M0(`render/stadium/parts.ts`)。担当ファイル: 新規 `render/stadium/{index,stands,towers,dugout,scoreboard,ads,ground,sky}.ts`(+test)、削除 `render/stadium.ts`(置換)、`render/look.ts`(光・空)。
  - やること: `StadiumParts` 契約を満たす `createStadium(...)` を実装(既存の芝・土・ライン・フェンス・観客席の円弧・霧を引き継ぐ)。照明塔 4 基・ダグアウト 2 基を統合ジオメトリ(頂点カラー)、看板の帯・スコアボードの表示面は `DataTexture`、時間帯で光・空・霧・材質の色の係数・ランプの発光を切り替える `setTimeOfDay`。点光源は使わない。
  - 完了条件: 単体テスト(smoke)— 生成・破棄(リークなし)、追加の draw call が +7 以内(観客と土煙を除く)・三角形 +6k 以内、時間帯の切替で光・空・霧・材質の色が変わる(再コンパイルを伴わない)、`setScoreboard` が `needsUpdate` を 1 回だけ立てる、`BufferGeometryUtils`・`document` を使わない。
- [ ] **M7: render — 観客と土煙**
  - 依存: M0(`CrowdParts`/`DustParts`)。担当ファイル: 新規 `render/crowd/{index,instances,dust}.ts`(+test)。
  - やること: `InstancedMesh` 2 つ(胴・頭。最大 480 体・約 32 三角形/体)と `Points`(土煙。最大 24)。`setCount(n)`・`update(poses)`(行列を更新)。ティアに応じた体数と更新間引きは呼び出し側(M8)が決める。スキニングは使わない。
  - 完了条件: 単体テスト(smoke)— 生成・破棄(リークなし)、`setCount` で描画数が変わる、`update` が行列だけを更新する、draw call 追加が +3(胴・頭・土煙)、`three` 以外・`document` を使わない。
- [ ] (M-1 は以上。M1〜M7 の 7 ステップ)

#### ウェーブ M-2(5 並列)

- [ ] **M8: render — ステージへの結線(球場・観客・土煙・時間帯・ティア・カメラ)**
  - 依存: M6, M7。担当ファイル: `render/stage.ts`(+test)。
  - やること: `createStadium`・観客・土煙を組み込み、`SceneFrame.stadium`/`fx` を反映。**品質ティアごとの観客の体数 [480, 240, 96, 0]・更新間隔 [1, 2, 4, 0]・ランプ発光/土煙/看板の簡略化**(max 分冊 §3-5-10 の表)。時間帯の切替は `idle`/`holding` の間だけ。リプレイ/イントロのカメラ(`SceneFrame` のカメラをそのまま使うので追加の分岐は最小限)。`stats()` に観客の体数を含む。
  - 完了条件: 単体テスト(smoke)— ティアごとの観客の体数・更新間隔が表のとおり、T3 で観客・土煙・ランプが無い、時間帯の切替が飛行中はペンディング、破棄でリークなし、`window`/`document`/`matchMedia` を使うのは `stage.ts` のみ。
- [ ] **M9: sequence の合成 M(固有フォーム・スライディング・カバー・観客・時間帯・スコアボード・イントロ)**
  - 依存: M1, M2, M3, M4, M5, C6。担当ファイル: `model/world/sequence/{frame,play-plan}.ts`(+test)。
  - やること: `signatureOf` のフォームを各キャラクターのポーズに適用、`slidePlanOf`/`coverPlan` に従う走者・野手のポーズと土煙、`crowdStateAt` を `SceneFrame.stadium.crowd` に、`timeOfDayAt` を `timeOfDay`/`blend` に、`scoreboardViewOf` を `scoreboard` に、イントロのカメラ区間を合成。`PlayPlan` の走者の進塁区間にスライディングを含める。**`sceneFrameAt` が引き続き t の純関数で、入力を変更しない**ことを守る。
  - 完了条件: 単体テスト — 既存の性質(決定論・入力を変更しない・全数値が有限・ボールが一度消えたら再出現しない)を維持、スライディングの走者の位置が塁に着く時刻に一致、カバーの野手が送球の前に塁に着く、観客の `excitement` が歓声の時刻と同期、時間帯の `blend` が連続、`endMs` の上限が最大 3.0 秒の進塁を含めて守られる。各関数 60 行以内。
- [ ] **M10: hooks — リプレイのモードと時間帯**
  - 依存: M5。担当ファイル: 新規 `hooks/{useReplay,useStadiumState}.ts`。
  - やること: `useReplay`(直近 3 プレーの `ReplayRecord` のリング、`replayActive` フラグ(`tutorialActive` と同じ性質)、再生中は打撃/投球入力と次の球を止める、reducer に dispatch しない、試合時計に触れない、タップ/Space/Enter で終了、ティア T3 では無効)。`useStadiumState`(`timeOfDayFor(inning)`・設定の固定値・`?tod=`)。全 effect に cleanup。
  - 完了条件: lint 0 件・typecheck 起因 0 件。`hooks/` から `three` を import していない。再生の前後で `GameState` が同一参照。再生中に `dispatch` が呼ばれない。unmount で再生が止まる。
- [ ] **M11: UI — リプレイのボタン・色の膜・スコアボードのズーム・設定**
  - 依存: M0。担当ファイル: 新規 `ui/{ReplayControls,TimeTint,ScoreboardZoom}.tsx`+CSS、`ui/{StageView,TitleScreen,GameLayout}.tsx`。
  - やること: `ReplayControls`(「リプレイ」ボタン 44px 以上・4 秒で消える・再生中の「REPLAY」表示とスキップ)、`TimeTint`(全面の色の膜。`mix-blend-mode: multiply`・`pointer-events: none`・`prefers-reduced-motion` で即時)、`ScoreboardZoom`(イニング変更時の 0.8 秒の DOM 表示)、タイトルに「時間帯: 自動/昼/夕/夜」「ホームランを自動でリプレイ(既定 OFF)」。`data-time-of-day`・`data-replay`・`data-crowd-count` の目印。
  - 完了条件: lint 0 件・typecheck 起因 0 件。`ui/` が `../model`・`../render`・`../audio` を import していない。色の膜・ズームが `pointer-events: none`。ボタンは 44px 以上。
- [ ] **M12: 音 — 観客の反応・スライディング・リプレイ**
  - 依存: M0, C2。担当ファイル: `model/sound/{cues,sfx-plan}.ts`、`audio/voices.ts`(+test)。
  - やること: `slide`・`crowd-swell`・`replay-start` のレシピと `sfxEventsOf` への追加(観客の盛り上がりの時刻は `crowdEventsOf` と同じ)。リプレイ中は record から再合成して鳴らす。
  - 完了条件: 単体テスト — 全 `SfxCue` にレシピ、長さ ≤ 2.5s・ゲイン ≤ 1・周波数 20〜12000Hz、`crowd-swell` の時刻が `crowdEventsOf` と一致、決定論、既存の cue の時刻表が不変。

#### ウェーブ M-3

- [ ] **M13: 統合 M と全体確認(最大)**(直列)
  - 依存: M8〜M12。担当ファイル: `hooks/{useStageDirector,useGameStage,useStage3d}.ts`、`ui/GameScreen.tsx`、必要最小限の修正(`model/world/sequence/*` は対象外)。
  - やること: director が `stadium`・`fx`・`replay` を渡し、リプレイ時は `ReplayRecord` から `sceneFrameAt` を時間写像とカメラ付きで呼ぶ。`useGameStage` が `useReplay`・`useStadiumState` を結線。イントロを試合開始時に出す(スキップ可)。全体の typecheck・lint・test・build を通す。**`renderer.info` で最大の描画予算を実測**(ティア T0〜T3 の draw call・三角形・観客の体数・リプレイ中の p95)し、max 分冊 §3-5-10 の表(T0 ≤ 215・T1 ≤ 205・T2 ≤ 166・T3 ≤ 113、三角形)に対する結果を完了報告に書く。超えるときは広告・ダグアウト・照明塔の統合 → 観客の体数の順で対処し、数値を確定する。knip・バンドルサイズを記録。**スクリーンショット**(昼/夕/夜の打撃カメラ・追跡カメラ(HR でスタンド)・内野カメラ(スライディング)・リプレイの 3 カメラ・イントロ・スコアボード。390×844 と 390×664)を `docs/tests/assets/2026-10-27-baseball-game-v3/max/` に保存(1 枚 500KB 以下)。`model/sim` のボットのテストを再実行。
  - 完了条件: 全体の typecheck・lint・test・build が成功。構造検査 1〜17 が pass。最大の描画予算を満たす(満たさない項目は理由と対策を報告)。
  - **→ T1c(任意。本体の「未解決の疑問」)**: orchestrator がスクリーンショットと試遊ビルドを人間に渡し、球場・リプレイ・時間帯の見た目を聞く。

## 段階 D: 検証・調整

- [ ] **D1: 投球ボットと投球バランス**
  - 依存: B6, C7。担当ファイル: 新規 `model/sim/pitch-bot.ts`、`model/sim/pitch-bot.test.ts`、`model/cpu/difficulty.ts`・`model/pitch/params.ts` の**値**。
  - やること: 「投球ボット」を実装し、F 群の帯を満たすよう調整する。A14 の打撃ボットの帯・`balance.test.ts` は基準を変えずに成功させる(競合したら A14 の帯を優先し orchestrator に上申)。
  - 完了条件: F 群の帯を満たす。`balance.test.ts`・`human-bot.test.ts` 成功。
- [ ] **D2: E2E とドキュメント**
  - 依存: A14, B3, D1, C7, M13。担当ファイル: `e2e/baseball.spec.ts`、`playwright.config.ts`、`sample-app/README.md`、`docs/process/sample-app-dev.md`。
  - やること: E2E の更新・追加(テスト戦略)。tutorial 以外の spec は `addInitScript` で既読・球数ヒントの設定、試遊ログは `DEV` で常に有効なので「入口が無い」確認は preview ビルドの別 project、`index.html` の viewport meta の固定。README・`sample-app-dev.md`(新ボット・試遊ビルド・`BOT_FULL=1`・品質ティア・`?tier=`・`?tod=`・リプレイ)を更新。「パワプロ」等の名称は書かない。seed を再探索。
  - 完了条件: `cd sample-app && npm run test:e2e --workspace frontend` が 3 回連続で成功(`home.spec.ts` は無改変)。新しいテストを `--repeat-each=5 --workers=2` で実行して失敗 0 件。
- [ ] **D3: 見た目の確認と調整**
  - 依存: M13。**例外として次を調整してよい**: `WORLD_PARAMS` の「調整可」の値、`render/*` の見た目の値、`ui/*.css`、`model/character/raster/*` の顔の描き込み・`render/character/*` の造形の寸法、**`model/stadium/*` の配置・色・`model/replay/camera.ts` のカメラ位置・時間帯の色の膜**(構造は変えない)。
  - やること: 390×844・745・664(`hasTouch`)と 375×667・360×640・1280×720 で、v2 との前後のスクリーンショット(仮想時計+手動 rAF のハーネス。[[swiftshader-playwright-input-latency]])を比較し、「ゲート1で人間に見せるもの」の画面一覧とモックの数値に対して〇×を付ける(打者の占有・バット到達・予告とリング・ボールの最小径とハロー(**昼・夕・夜**)・バナーの位置・ピル・位置ずれ(DOM のミニ図)が HR・ライナー・ゴロの追跡カメラ上でボールに重ならないか・守備のバー・ホームランの頂点と HUD・ヒットストップ・投手の顔の可読性・表情・個性・ワイプ・走者・送球・**球場の帯(フェンス+観客席の下段)・スタンドと観客・スコアボード・照明塔・時間帯・リプレイ・スライディング・ベースカバー・固有フォーム・イントロ**)。画像(1 枚 500KB 以下、40 枚程度)を `docs/tests/assets/2026-10-27-baseball-game-v3/` に保存。最大 3 ラウンド、未達は理由を報告してゲートへ引き継ぐ。
  - 調整可の値: `actors.batter.portraitScale`(0.62〜0.80)・`portraitX`(−0.85〜−0.60)・`portraitBatLength`(接触時の先端 ≥ +0.28m を保つ範囲)、`actors.pitcher.portraitScale`(1.1〜1.4。1.5 まで上げると 390×664 の打撃ゾーン幅が約 116px で A2 の下限 115px にぎりぎりなので 1.4 を上限とし、変えたら A2 の下限を再確認する)、`ball.minScreenDiameterRatioFlight`(0.014〜0.022)、`halo.opacity`(0.2〜0.5)、`guide.previewRing.startRadius`(0.24〜0.36)、`fx`・`telop`・`banner`・`zoneFeedback` の値、`fit.pitching.defaultSafeArea.bottom`、`wipe.rectPortrait`、`runners.msPerBase`(1.2〜2.0 秒)、**`stadiumMax.timeOfDay.tint`・`crowd.bounceMaxM`・`replay.cameras`・`replay.slowFactor`(0.25〜0.5)**。カメラ・ゾーンの px を変えたら A14 のボットテストを再実行。
  - 完了条件: 受け入れ基準の A・B・C・G・L 群が〇、または未達の理由が報告されている。`npm run lint`・`typecheck`・`test` が成功。**D1〜D3 のすべてが完了した後に、orchestrator が E2E を最終実行して成功を確認する。**
