# 設計(分冊): ブラウザ野球 v3 — 実装ステップ

- 本書は [2026-10-27-baseball-game-v3.md](2026-10-27-baseball-game-v3.md)(本体)の分冊で、「実装ステップ」にあたる。契約は [contract 分冊](2026-10-27-baseball-game-v3-contract.md)、キャラクターは [character 分冊](2026-10-27-baseball-game-v3-character.md)、打撃・投球・構図は [play 分冊](2026-10-27-baseball-game-v3-play.md)、受け入れ基準は [tests 分冊](2026-10-27-baseball-game-v3-tests.md)。
- 改訂: 2026-10-29(ラウンド2の反映。**ステップ総数 42 → 43(E0 を追加)**、A14 を E3・E4 より先に確定、位置ずれ表示の DOM 化に伴う A5・A7・A11・A12 の変更、E5 を `SkinnedMesh` 方式に)

**5 段階で作り、各段階の終わりに全体(typecheck・lint・test・build)を緑にする**。段階 A の終わりで打撃だけが動くビルドを人間に渡し(**T1**)、段階 E の終わりでキャラクターの見た目を人間に確認してもらう(**T1b**)。**総ステップ数は 43**(A: A0〜A14 の 15、E: E0〜E11 の 12、B: 6、C: 7、D: 3)。

| 段階 | 内容 | 終わりの状態 |
| --- | --- | --- |
| A(A0〜A14) | 契約の凍結(A・B・C の型)+**打撃の骨格**。投球側は旧格子 UI のまま動く(新しいコマンドへ変換するだけ)。演出・音・新しいキャラクターは無い | **T1: 打撃だけを人間が試遊**(A13 の直後) |
| E(E0〜E11) | **キャラクターの作り直し**(E0 が段階 E の契約を凍結。顔・表情・髪・個性・フォーム・走者・送球・ワイプ・品質ティア) | **T1b: キャラクターの見た目を人間が確認**(E11 の直後) |
| B(B1〜B6) | **投球の骨格**(ゾーン直接ドラッグ+ゲージ・CPU 打者の反応・操作バー) | 全体緑(投球が新操作) |
| C(C1〜C7) | **演出・音**(バナー・接触演出・効果音・触覚) | 全体緑 |
| D(D1〜D3) | 投球ボット・E2E とドキュメント・見た目の調整 | 最終の E2E 実行 |

**ファイルの所有**: 同じファイルを**並列のステップ**で触らない。段階をまたいで同じファイルを順番に触るのは許す(例: `frame.ts` は A11 → E8 → B5 → C6、`useStageDirector.ts` は A13 → E11 → B6 → C7、`StageView.tsx` は A12 → E10 → C4、`GameLayout.tsx` は A12 → B2 → C4、`stage.ts` は A8 → E7、`pose-apply.ts` は A8 → E6、`params.ts` は A0 → E0 → E3(`pitcher.scale`・`RELEASE_POINT` の値のみ)、`camera/{rig,project}.test.ts`・`path/pitch-*.test.ts` は A2 → E3)。実装者は担当ファイル以外を編集しない。`types/` は A0(A・B・C の分)と E0(E の分)で凍結し、型の変更が必要になったら編集せず報告する。

### ウェーブ構成と依存

| ウェーブ | ステップ | 並列・依存 |
| --- | --- | --- |
| A-1 | A0 | 直列 |
| A-2 | A1〜A8 | 並列可(8。A0 だけに依存) |
| A-3 | A9, A10, A11, A12 | 並列可(4。A9 は A1・A4、A10 は A6、A11 は A1・A2・A3・A5、A12 は A5・A6) |
| A-4 | A13 | 直列(A7〜A12 の後)。**→ T1** |
| A-5 | A14, E0, B1, B2 | 並列可(A13 の後。A14 は T1 のログがあればそれも使う。E0 は `types/`・`render/character/parts.ts`・`render/test-fixtures.ts`・`space/params.ts` だけを触る。B1・B2 は別ファイル) |
| E-1 | E1, E2, E5, E6 | 並列可(4。E0 の後。**A14 を待たない**。E5・E6 は E0 の `CharacterParts` 契約だけに依存) |
| E-1b | E3, E4 | 並列可(2。**A14 の完了と T1 の結果の反映(A1・A2・A4 の修正の要否)を待つ**。E3 は投手 scale とカメラのテスト、E4 は reducer・state を触るので、A14 のボットの較正が固まった後) |
| E-2 | E7, E8, E9, E10 | 並列可(4。E7 は E5・E6、E8 は E1・E3・E4(A11 の後)、E9 は E2、E10 は E0) |
| E-3 | E11 | 直列(E7〜E10 の後)。**→ T1b** |
| B-2 | B3, B4, B5 | 並列可(B3 は **A14 の後**(結果表の調整が CPU 同士の打率に効くため)、B4 は B1、B5 は B1・A5・E8) |
| B-3 | B6 | 直列(B2〜B5・E11 の後) |
| C-1 | C1, C2, C3, C4 | 並列可(4。B6 の後) |
| C-2 | C5, C6 | 並列可(C5 は C2・C3、C6 は C1) |
| C-3 | C7 | 直列(C4〜C6 の後) |
| D | D1, D3 → D2 | D1(B6・C7 の後)と D3(C7 の後)は並列可。**D2 は判定と CPU の値を調整する A14・B3・D1 の後**。最終の E2E は D1〜D3 の後に orchestrator が実行する |

**T1 と段階 E の重なり(レビュー R2-m8)と、A14 と E3 の関係(R2-m7)**:
- E0・E1・E2・E5・E6 は T1 の結果を待たない(T1 で直す A1・A2・A4 のファイルと重ならない)。
- **E3 は `camera/{rig,project}.test.ts`・`path/pitch-*.test.ts`・`space/params.ts` を触り、A2 と同じファイルを使う**。T1 の結果で A2(構図)を直す必要が出た場合、E3 の着手前なら A2 の担当が直し、E3 は**その修正の後に着手**する(E3 を T1 の結果の後まで待たせる)。E3 の着手後に A2 の修正が必要になった場合は、E3 の完了後に別タスクとして直列に直す。
- **E3 は RELEASE_POINT と lift を変え、ゾーンが約 23px 下がる**ので、A14 のボット結果(カーソルとゾーンの px)が後から変わりうる。**A14 を E3 より先に確定する**(上の E-1b)。それでも E3 の後に変わるため、**E11 でボットのテスト(`model/sim`)を再実行**し、帯を外れたら E11 では値を触らず orchestrator に上申して、**A14b(条件付きの再較正。A14 の担当ファイルだけを触る追加タスク)**を B3 の前に dispatch する。

**全体の typecheck の扱い**: A0 で `PitchCommand`・`SceneFrame`・`StageHandle`・`PlaybackSpeed` の型を変えるので、**A0〜A12 の間は全体の typecheck が緑にならない**。E0 で `CharacterRig`・`CharacterPose`・`Team`・`GameState`・`PitchOutcomeView` などの型を変えるので、**E0〜E10 の間も緑にならない**(B-1 の B1・B2 も同様)。各ステップの完了条件は「`cd sample-app && npm run typecheck` の出力を担当パスで絞り込み、担当ファイル起因が 0 件(他ステップ起因のエラーは完了報告に列挙)」。A0・E0 は型変更で壊れる箇所の一覧を完了報告に書く。**各段階の統合ステップ(A13・E11・B6・C7)の完了条件で全体が緑に戻る**。この間のコミットは出荷しない。

**共通の完了条件**: 担当ファイルが `cd sample-app && npx eslint <担当パス>` で 0 件。型は上記。テストがあるステップは `cd sample-app/frontend && npx vitest run <担当パス>` が成功。コミット・共有メモリへの書き込みは並列 dispatch 中は行わない。**lint の注意([[sample-app-lint-random-and-index-access]])**: `Math.random` 禁止、変数添字の `arr[i]` 禁止(`.at`/`Map`/`for...of`/`switch`)、`// TODO` 禁止、`toSorted`/`with` 禁止(ES2022)、テストでリテラル同士の assertion 禁止・小数の `toBe` 禁止・ネスト関数 4 段禁止、定数オブジェクトは `DeepReadonly<typeof PARAMS>`、補間は `a*(1−k) + b*k`。

## 段階 A: 打撃の骨格

- [ ] **A0: 契約と定数の凍結(段階 A・B・C の分)**(直列)
  - 依存: なし。担当ファイル: `types/{batting,pitch,game,scene,stage,view}.ts`、新規 `types/{sound,telemetry}.ts`、`hooks/useGameStage.ts`(`GameStageViewProps` の型だけ)、`render/test-fixtures.ts`(`makeFrame` の新フィールドの既定値)、`model/world/space/params.ts`、`model/batting/params.ts`、`model/pitch/params.ts`、新規 `model/batting/assist.ts`(型・`ASSIST_TABLE`・`assistFor` だけ)。
  - やること: 契約分冊 §5-1 のとおり、**段階 A・B・C の分の型だけ**を定義し(`IgnoredInputReason` の `expired`、`ZoneFeedbackView`、`zoneFeedback` の props を含む。**段階 E の型は E0 で凍結するので触らない**)、`WORLD_PARAMS`・`BATTING_PARAMS`・`PITCH_PARAMS` に値まで入れる(`actors.pitcher.scale`・`RELEASE_POINT` は v2 の値のまま)。`launch-params.ts` の速度値は A3。型の変更で壊れる箇所を完了報告に一覧する。
  - 完了条件: 担当ファイルの lint 0 件・typecheck 起因 0 件。`types/` が他セグメントを import していない。値を参照する既存テストがリテラルで固定されていないことを確認し、落ちるものを担当ステップに申し送る。

### ウェーブ A-2(純粋ロジック・部品。8 並列)

- [ ] **A1: アシスト(ロックオン・予告・質の補正)**
  - 依存: A0。担当ファイル: `model/batting/assist.ts`、`contact.ts`、`resolve-pitch.ts`(+test)。
  - やること: `lockOnCursor`・`previewCenterOf`・`qualityScaleOf` を実装。`measureContact` が `swing.assistK` で `q` を `qualityScaleOf` 倍する(省略は 0 で v2 と同値)。
  - 完了条件: 単体テスト — `lockStrength 0` で恒等、`progress < rampStart` で素、`k ∈ [0,1]`・単調、`captureRadius` の外で `k = 0`、有効カーソルは raw と landing の線分上、`fade` の中心が決定論かつ `|ずれ| ≤ fadeJitter` で円が着弾を含む、`preview: "none"`、`assistK` 省略時に v2 と同じ結果。
- [ ] **A2: 構図・カメラ関数・打者のレイアウト**
  - 依存: A0。担当ファイル: `model/world/camera/{rig,project}.ts`(+test)、新規 `model/world/motion/batter-layout.ts`(+test)、**`model/world/path/{pitch-path,pitch-screen}.test.ts`(カメラ x 0 で変わる S300 と画面上の前提値)**。
  - やること: `rig.ts` の式・定数参照を v3 の姿勢・`fit.pitching` に合わせる。**`ballScaleFor(camera, ball, minRatio)` のシグネチャ変更**と `outlineScaleFor`・`ringWidthFor` を追加。`batter-layout.ts`: `batterRootFor(aspect)`(補間後の scale)・`batLengthScaleFor`・`batTipX`(play 分冊 §3-1 の式)。テストを v3 の数値(段階 A 完了時の列)に更新する。**カメラの x を −0.25 → 0 にすると、S300(画面上の軌道の前提)と `pitch-screen.test` の前提値も変わる**ので、これらを v3 の姿勢で再計算して更新する(完了条件に含める)。
  - 完了条件: 単体テスト — 390×844 の打撃・守備でゾーン矩形が x 117.7〜272.3・y 410〜585(±3px)、幅×高 ≥ 150×170。**打者の頭の右端(ヘルメット込み)≤ 115px(設計値 109)**・素の頭の右端 ≤ 110px・胴の右端 ≤ 75px。**接触時のバット先端 x ≥ +0.28(縦長。L = 1.35 で +0.30 前後)・横長は v2 と同値**。守備の格子の下端が空き領域の下端(0.846)から 8px 以上上。高さ 560〜900px の走査でゾーン/格子が下のオーバーレイに掛からない。**390×664 で打撃のゾーンが ≥ 115×130、守備のゾーン幅が打撃以上**。`aspect ≥ 1.0` の横長の姿勢は v2 と厳密に一致。`ballScaleFor`・`outlineScaleFor`・`ringWidthFor` が `ratio × 2 × dist × tan(fov/2)` の式と一致。`pitch-path.test`・`pitch-screen.test`(S300 を含む)が v3 の姿勢で成功。
- [ ] **A3: 投球コマンドの移行(CPU は変換)・ゲージの純関数**
  - 依存: A0。担当ファイル: `model/pitch/{delivery,params}.ts`、新規 `model/pitch/gauge.ts`、`model/game/{reducer,view,test-fixtures,launch-params}.ts`、`model/cpu/cpu-pitcher.ts`、`model/sim/bot-sim.ts`(型の追従だけ)(+test)。
  - やること: `deliverPitch` が `command.aim` と `command.quality` から σ を決める(乱数の消費数は不変)。`gauge.ts` を実装。`chooseCpuPitch` が `CpuPitchChoice` を返し、reducer がセル中心を `aim`・`quality: "normal"` にして `launchPitch`。`view.ts` が `difficulty`・`assist`・チップ用の `speedKmh`/`arrow` を出す。`launch-params.ts` の速度値を更新。
  - 完了条件: 単体テスト — `pitchQualityOf` の境界、`sigmaScaleOf` が単調非減少、`isStopAccepted`、`deliverPitch` の乱数消費が 24 個のまま・CPU の決定論テストが構造を保って通る、失投で着弾が `(0, 0.15)` 側へ寄る、`gaugeRingAt` の端点・単調・`expired`、`aim` が ±1.67 に収まる。
- [ ] **A4: 入力ルート(離す=スイング・指の管理・見逃し/持ち替え/expired・保留・スイング記録)**
  - 依存: A0。担当ファイル: `model/world/sequence/{input-route,arrival,session,swing-time}.ts`(+test)。
  - やること: play 分冊 §1-1 の表を実装する。`routeStagePointer` は `aiming` で振り分ける。`routeStageRelease` は `{ isAimingPointer, swingReady, holding, enabled, eventMs, durationMs }` から `{ action, reason }` を返す(`reason` に `expired` を含む)。`shouldPromoteHeld`(**持ち越しの指が複数のときは最初に下りた `pointerId` を昇格**)。`swing-time.ts` に `eventElapsedMs`。`arrivalDue` は狙いの指がいる間 D + 250 + 120 まで保留。タップ判定を削除。`SwingRecord` に `meta?`。
  - 完了条件: `input-route.test.ts` が**全組み合わせを走査** — (1) 狙いの指がいるときの追加のタッチは `swing-here`/`ignore` のみ、(2) `holding` が真のタッチは必ず `skip`、(3) 狙いの指がいなければ `isPrimary` に関わらず `drag-start`、(4) スキップに使った指の離しは `none`、(5) `not-ready`、(6) `eventMs > D+250` は `late`・`< D−300` は `regrip`・その間は `swing-release`(境界を含む)、**(6b) イベント時刻 D−300〜D−80 の離しは `swing-release` だが `atMs` が窓外(「早い」の空振り)、D−80 以降は窓内**、(7) マウス/ペンの離しは `none`、(8) 持ち越しの指は演出後に昇格し離すとスイング、**(8b) 持ち越しの指が複数のとき最初に下りた `pointerId` が昇格し、他は次の move で昇格**、(9) 狙いの指が離れたとき他の指が次の move で昇格、**(10) イベント時刻は窓内だが処理が `D+250+120` を超えて遅れた離しは `expired`(`not-ready` ではない)**。`arrival.test.ts`・`swing-time.test.ts`・`session.test.ts`。`isSkipKey` は不変。
- [ ] **A5: 演出の純関数(予告・照準とリング・ボールの回転・位置ずれ)**
  - 依存: A0。担当ファイル: 新規 `model/world/sequence/{guide,ball-look,contact-feedback}.ts`(+test)。
  - やること: `guideFrameAt`・`previewRingAt`、`pitchGuideAt`(守備。段階 B で使う)、`ballSpinAt`・`ballHaloAt`(縫い目の帯の回転)、**`zoneFeedbackOfSwing`・`zoneFeedbackOfPitch`**(`ZoneFeedbackView` をゾーン単位で返す。DOM が px に換算する)。リングの線幅は `ringWidthFor` の結果を受ける。
  - 完了条件: 単体テスト — リング半径が `t = 0` で startRadius・`t = D` で endRadius(±1e-9)・単調減少・D 以降は保持、`exact` の点が `flight.landing` に厳密一致、`fade` が着弾を含む、`none`、`ballSpinAt` が球種ごとに異なりフォークが最小、**`zoneFeedbackOfSwing` の from が判定に使った有効カーソル・to が着弾点に厳密一致し、alpha が時間で単調減少して `swingMs` で 0**、**`zoneFeedbackOfPitch` の from が狙い・to が着弾で `pitchMs` で 0**、`pitchGuideAt` のリングが `gaugeRingAt` に一致。
- [ ] **A6: telemetry・prefs・tutorial の純粋ロジック**
  - 依存: A0。担当ファイル: 新規 `model/telemetry/*`、`model/prefs/{prefs,safe-store}.ts`、`model/tutorial/steps.ts`(+test)。
  - やること: 記録の組み立て・リングバッファ(最大 600、JSON 往復)・`summarize`(**`expired` の件数を含む**)・`toCsv`・`fitBotParams`・`parsePrefs`・**`createSafeStore(getStorage)`(例外でもメモリで動く)**・チュートリアルのカード。
  - 完了条件: 単体テスト — 600 件超で先頭が落ちる・JSON 往復・不正 JSON は空、`summarize` が手計算と一致、`fitBotParams` が既知の分布を ±5% で復元、`parsePrefs` が欠損を既定値で補う、**`getStorage`/`setItem` が例外を投げる偽のストレージでも例外を出さない**。
- [ ] **A7: render — マーカー(予告・リング・照準・ボール)**
  - 依存: A0。担当ファイル: `render/{markers,look}.ts`、`render/dispose.test.ts`(+test)。
  - やること: `guide`・`cursor.raw`・`ball.rotation`/`halo`(**必須**・暖色)/`outlineScale`・縫い目(太い赤い帯の弧 2 本)・旧 `aim` の削除。描画順は v2 の規則に新要素を割り当てる。縮尺は知らない。**3D の位置ずれ表示(`feedback`)は作らない**(DOM。A12)。
  - 完了条件: 単体テスト(smoke)— 生成・可視・破棄(リークなし)、縫い目が `rotation` に従う、リングの半径・線幅が `guide.ring` に一致、ボールが `transparent`/`depthTest false`、ハローが常に生成される。`import * as THREE`・`document`・`window` が無い。
- [ ] **A8: render — ステージ・ポーズ・統計**
  - 依存: A0。担当ファイル: `render/{stage,pose-apply}.ts`(+test)。
  - やること: `StageHandle.stats()`、バットの `lengthScale` をチルトグループの z 方向に適用、新フィールドを含むフレームを `applyMarkers` へ渡す。
  - 完了条件: 担当 test 成功。`stats()` が破棄後 `null`。`window`/`document`/`matchMedia` を使うのは `stage.ts` のみ。

### ウェーブ A-3(接続・合成・UI。4 並列)

- [ ] **A9: hooks — 打撃入力**
  - 依存: A0, A1, A4。担当ファイル: `hooks/{usePointerInput,useBattingControls,usePitchFlight,useKeyboardInput}.ts`。
  - やること: `usePointerInput` を `routeStage*`/`shouldPromoteHeld` の戻り値だけで分岐。狙いの指を `pointerId` の ref で持ち、昇格を実装。`usePitchFlight` に `isAiming()`。`useBattingControls` が有効カーソル(`lockOnCursor`)を director へ、`swingNow` が `assistK`・`meta` を渡し、**ボタン・追加の指・キーでも `eventElapsedMs > D + 250` なら何もしない**。無視された入力(`late`・`regrip`・`not-ready`・`holding`・`expired`)と pointercancel を通知。
  - 完了条件: lint 0 件・typecheck 起因 0 件。`usePointerInput` が `holding` を直接参照していない。unmount・pointercancel で狙いの指が解除される。スキップに使った指の離しでスイングしない。
- [ ] **A10: hooks — 設定・ログ・fps**
  - 依存: A0, A6。担当ファイル: 新規 `hooks/{usePreferences,usePlaytestLog,useFramePerf}.ts`。
  - やること: `usePreferences`(`createSafeStore`)、`usePlaytestLog`(`PLAYTEST_ENABLED`・**メモリのリングバッファを主**・任意の保存)、`useFramePerf`(rAF 間隔の収集と窓ごとの p95)。全 effect に cleanup。
  - 完了条件: lint 0 件・typecheck 起因 0 件。`PLAYTEST_ENABLED` が偽のとき `localStorage` に書かない。`localStorage` は `createSafeStore` 経由だけ。
- [ ] **A11: sequence の合成 A(予告・リング・ボール・打者)**
  - 依存: A0, A1, A2, A3, A5。担当ファイル: `model/world/sequence/{frame,play-plan}.ts`(+test)、`sequence/{world-consistency,batter-screen}.test.ts`。
  - やること: `guide`(打撃の予告)・`cursor.raw`・`ball.rotation/halo/scale(飛行中の最小径)/outlineScale`・`BatPose.lengthScale`・`batterRootFor` を合成。**`batHeightInRoot` は補間後の scale で割る**。旧 `aim` を削除。`SceneFrameInput` に `assist`。**`PlayPlan.chaseFromMs` は v2 のまま `contactMs`(変更しない)**。位置ずれ(`ZoneFeedbackView`)は A13 が director で `contact-feedback.ts` から作って props に渡すので、`frame.ts` では合成しない。
  - 完了条件: 単体テスト — `guide` の `exact` がリリースから D+hold まで可視、リング半径が `previewRingAt` に一致、ボールの表示径が飛行中ずっと最小径以上(「一度消えたら再出現しない」性質を維持)、縦横比の補間域でバットの高さがボールの高さと一致、**接触後のカメラが v2 と同じ時刻表(`chaseFromMs = contactMs`)のままで、`rig.test` の既存のテスト(ホームラン追跡の画面内・HUD 下)が不変**、既存の性質を維持。`batter-screen.test.ts` は v3 の数値に更新。各関数 60 行以内。
- [ ] **A12: UI — 説明・試遊ログ画面・位置ずれ(DOM)・ピル・ヒント・入力面の抑止**
  - 依存: A0, A5(`ZoneFeedbackView` の契約)、A6(文言の契約)。担当ファイル: 新規 `ui/{Tutorial,PlaytestPanel,ZoneFeedback}.tsx`+CSS、`ui/{StageView,SwingControls,GameLayout}.tsx`、`ui/baseball-stage.css`。
  - やること: `Tutorial`・`PlaytestPanel`(要約表・**全選択できる `<textarea readonly>`**・コピー・ダウンロード・共有・消去・保存失敗の表示・縮小表示の警告。props のみ)。**`ZoneFeedback`**(`zoneRect` に固定した DOM のミニ図: 薄いゾーン枠・白の十字 16px・シアンの輪 30px・線 3px、線のみで塗りなし、`pointer-events: none`。ゾーン単位 → px は `zoneRect` で換算)。`StageView` のピルを 2 行に、ヒント文、`data-*` ミラー、**ステージの `contextmenu` を `preventDefault`**。`SwingControls` を縮小(80px)。`GameLayout` に `tutorial`/`playtest`/`zoneFeedback` スロット。CSS: `.bb-stage__input--active` に callout/user-select 抑止を足し、人間守備中も付けられる構造にする。
  - 完了条件: lint 0 件・typecheck 起因 0 件。`ui/` が `../model`・`../render`・`../audio` を import していない。hooks を呼ばない。ピル・ヒント・`ZoneFeedback` が `pointer-events: none`。ボタンは 44px 以上。`ZoneFeedback` が `zoneRect` の変化(画面サイズ)に追従する。

### ウェーブ A-4

- [ ] **A13: 統合 A と全体確認(打撃の骨格)**(直列)
  - 依存: A7〜A12。担当ファイル: `hooks/{useStageDirector,useGameStage,useGame,useStage3d}.ts`、`ui/{GameScreen,BaseballGamePage}.tsx`、残った型・lint エラーの解消に必要な最小限のファイル。
  - やること: director が新項目を毎フレーム渡し、有効カーソルを表示する。**`zoneFeedback`(`zoneFeedbackOfSwing` の結果)を props に渡す**。`useGameStage` が `tutorialActive`(`holding` とは別のフラグ)・`usePreferences`・`usePlaytestLog`・`useFramePerf` を結線し、`stage.stats()` を起動時にログへ。`inputActive` を人間打撃中に付ける。**人間守備は旧格子 UI のまま**、`onThrow` が `{ kind, aim: セル中心, quality: "normal" }` を作って渡す。`skip()` は reducer に触れない・`stage === null` でも進行が止まらない。`cd sample-app && npm run typecheck && npm run lint && npm run test && npm run build` を通す。構造検査・knip レポートを確認。バンドルサイズを記録。**試遊ビルド**(`VITE_PLAYTEST=1`)を作り、1 試合が通ることを確認する。E2E は D2 で更新するので、ここでは手動確認だけ。
  - 完了条件: 上記がすべて成功(typecheck は全体で緑)。構造検査 1〜15 が pass。**試遊ビルドの手順を完了報告にまとめる**。
  - **→ T1(中間試遊。ゲート1で承認を得た場合)**: orchestrator が試遊ビルドを人間に渡し、「**打撃 20 打席(約 60 球)を遊んで、試遊ログ(画面の JSON)をコピーして貼る**」ことと「打てた/微妙/打てない」の 3 択を `AskUserQuestion` で聞く(キャラクターは v2 のまま・演出と音と新しい投球は未実装と伝える)。ログは A14 の較正に使い、結果によっては E3 の前に A1・A2・A4 を直す。
- [ ] **A14: 人間代理ボット v2(打撃)と打撃バランス**
  - 依存: A13(と T1 のログがあればそれ)。E0・B1・B2 と並列可。**E3・E4 より先に完了する**。担当ファイル: 新規 `model/sim/{human-bot,human-game}.ts`、`model/sim/human-bot.test.ts`、`model/sim/bot-balance.test.ts`、`model/batting/{params,result-table,batted-ball,assist}.ts` の**値**。
  - やること: 「人間代理ボット v2」(失敗の型・悲観シナリオ・時間予算を含む)を実装し、受け入れ帯(E 群)を満たすよう、ロックオン強度・結果表・強さのしきい値・`foulRatio`・`qualityPenalty` を調整する。**検出力テストを先に通す**(調整先は共有パラメータだけ)。旧ボット(A〜E)は「補助なし・理想知覚」の参照として残す。
  - 動かしてよい値(この順に): `ASSIST_TABLE` の `lockStrength`(±0.15)・`captureRadius`(±0.4)・`qualityPenalty`(0.2〜0.5)、`linerHalfBand`(0.08〜0.22)、`mediumFrom`(0.28〜0.45)、`strongFrom`(0.5〜0.75)、`RESULT_TABLE` の重み(v2 の不変条件を守る範囲で各セル ±8)、`foulRatio`(0.6〜0.8)。**動かさない値**: `contactWindowMs`・`powerWindowScale`・`centerRatio`・`lateCutoffMs`・`inputLatencyMs`・`ballReachX/Y`・`meetBaseRx`・`aimGraceMs`・`regripBeforeMs`、ボットの「リング無し」の `biasMs`。
  - 完了条件: `npx vitest run src/features/baseball/model/sim` 成功、E 群の帯をすべて満たす。満たせない帯は緩めずに理由と最良の値を報告。ボットテストの時間予算内。**E3 の後(E11)に再実行され、帯を外れたら A14b で再較正される**(上の「T1 と段階 E の重なり」)。

## 段階 E: キャラクターの作り直し

標準の度合い(推奨)で書く。「最小」の場合に残る範囲は character 分冊 §3-4-11。**描画予算(draw call・三角形)の目標と品質ティアは character 分冊 §3-4-10**。

- [ ] **E0: 段階 E の契約と定数の凍結**(直列。A13 の後。A14・B1・B2 と並列可)
  - 依存: A13。担当ファイル: `types/{team,game,scene,stage,view}.ts`(段階 E の分)、新規 `render/character/parts.ts`(型と定数のみ)、`render/test-fixtures.ts`(E の新フィールドの既定値)、`model/world/space/params.ts`(E の分の値)。
  - やること: contract 分冊 §5-2 のとおり、`PlayerLook`・`FaceExpression`・`CharacterJoint`・`CharacterSlot`・`CharacterLookData`・`QualityTier`・`SceneFrame.runners`/`wipe`・`CharacterPose` の追加フィールド・`GameState.lastAdvance`・`PitchOutcomeView.runners`・`StageHandle.setLook`/`setQualityTier`・`CharacterRig` の分割・`GameStageViewProps` の `wipe`/`qualityTier` を定義し、**`render/character/parts.ts` に `CharacterParts` 契約(`SkinnedMesh` 方式のハンドル)と `JOINT_ORDER`・`FACE_PATCH`・`DECAL_SIZE`・`WIPE_LAYER` を置く**。`WORLD_PARAMS` に `character`・`runners`・`wipe`・`qualityTier`・`actors.framingScale` を入れる。`motion/*`・`teams.ts`・`state.ts` には**触れない**(各担当ステップが埋める)。壊れる箇所の一覧を完了報告に書く。
  - 完了条件: 担当ファイルの lint 0 件・typecheck 起因 0 件。`types/` が他セグメントを import していない。`render/character/parts.ts` が型と定数だけ(実行時の three のコードを持たない)で、`render/` 以外から import されない。E5・E6 が `parts.ts` だけを見て並列に作業できる(`CharacterParts` の全フィールドに意味が書かれている)。

#### ウェーブ E-1(4 並列。E0 の後)

- [ ] **E1: 見た目のデータ・表情のタイムライン・ティア・表示倍率の純関数**
  - 依存: E0。担当ファイル: `model/data/teams.ts`(+test)、新規 `model/character/{look,expression,quality-tier,framing-scale}.ts`(+test)。
  - やること: 20 人の `PlayerLook`(髪型・髪色・肌・体格・目・眉・フォーム・背番号)を `teams.ts` に加算(判定・乱数に影響しない)。`look.ts`: 守備/走者のスロットへの割り当て。`expression.ts`: `expressionAt`。`quality-tier.ts`: `nextTier`。`framing-scale.ts`: `framingScaleAt(slot, cameraBlend)`。
  - 完了条件: 単体テスト — **20 人全員で (髪型, 髪色, 肌, 体格, 目) の組が異なり、背番号がチーム内で一意**、全スロットに look が割り当たる、**全 `outcome.kind × inPlay.result × plate × 役割` で `expressionAt` が定義される**、まばたきが決定論(位相がスロット番号から決まる)で周期 2.8 秒・120ms、`nextTier` が閾値・連続窓・上限(T3)・自動で上げないことを満たす、**`framingScaleAt` が連続で `cameraBlend = 1` のとき全スロット 1.0・走者/野手/捕手は常に 1.0**。
- [ ] **E2: 顔・背番号・ユニフォーム柄のラスタ(純粋関数)**
  - 依存: E0。担当ファイル: 新規 `model/character/raster/{face,number,fabric,primitives}.ts`(+test)。
  - やること: SDF のプリミティブ(楕円・弧・線・星・汗)で、96×96 のセル 8 表情の顔アトラス(384×192 RGBA)を `PlayerLook`(目の形・眉・口)から生成。**各セルの外周 4px は肌色で塗る**(mipmap の滲み防止)。0〜99 の背番号(自前の 5×7 ビットマップ拡大)、ピンストライプの縞(64×64)。
  - 完了条件: 単体テスト — **8 表情のセルが互いに異なる画素を持つ**、同じ入力で同じ出力(決定論。ハッシュ固定)、目の中心画素が不透明で期待位置(頭の幅比 0.36 間隔・高さ 45%)にある、目の形 4 種が異なる、背番号 0〜99 が全て描ける、アトラスの大きさ 384×192×4、**各セルの外周 4px が肌色**。生成時間は node で 1 体あたりを**参考値として出力するだけ**(判定には使わない。CI で揺れるため。レビュー R2-m12)。`document`・`window`・`three` を import しない。
- [ ] **E5: render — キャラクターの造形(`SkinnedMesh`・メッシュ統合・LOD)**
  - 依存: E0(`render/character/parts.ts` の契約)。担当ファイル: 新規 `render/character/{index,geometry-merge,skeleton,head,hair,headwear,torso,limbs,gear,outline,lod}.ts`(+test)、削除 `render/character.ts`(置換)。
  - やること: 頭(少し縦長の球・あご・耳)・髪 6 種・ヘルメット(打者。**投手側の左耳**のフラップ)/帽子(つば・パネル)・胴・腕(上腕+前腕+手+グローブ)・脚(大腿+下腿+靴)・バットを、**自前の `mergeGeometries`(`skinIndex`・`skinWeight` を保持)で 1 つの `BufferGeometry` に統合**し(頂点カラー。各頂点を 12(打者 13)本のボーンのいずれか 1 本に剛体として割り当てる)、`Skeleton` + `Bone` を作って `SkinnedMesh` を 1 つにする。**輪郭は体のジオメトリを法線方向に押し出した複製の `SkinnedMesh`(同じ `Skeleton` を共有・`BackSide`)**。顔(頭ボーンの子の球面パッチ)と背番号(胴ボーンの子のクアッド。近景のみ)は通常の `Mesh`。`CharacterParts` 契約を満たす `createCharacterParts(look, lod)` と `dispose()`・`setWipeLayer`。体格(幅の倍率)。LOD: 近景(体+輪郭+顔+背番号)・遠景(体+顔のみ)。`render/` は `types/` と `three` だけを import し、`BufferGeometryUtils` を使わない。**character 分冊 §3-4-10 の「`SkinnedMesh` の確認事項」1〜6 を r186 で確認し、結果を完了報告に書く**(境界球/カリング・破棄/`boneTexture`・共有スケルトン・`skinIndex` の型・影・トゥーン材質+頂点カラー)。
  - 完了条件: 単体テスト(smoke)— **近景 1 体の draw call(描画されるメッシュ数)= 体 1 + 輪郭 1 + 顔 1 + 背番号 1 = 4(影のパスを除く)、遠景 = 体 1 + 顔 1 = 2**、三角形 近景 ≤ 4000(輪郭込みで ≤ 6000)・遠景 ≤ 1200、体格 3 種で幅の比が 0.9:1.0:1.15、ボーン数 12(打者 13)、体と輪郭が同じ `Skeleton` を共有、破棄でリークなし(`skeleton`・ジオメトリ・材質・テクスチャ)、`BufferGeometryUtils` を import していない。**`SkinnedMesh` で致命的な問題が出て回避できない場合は、実装せずに上申する**(character 分冊 §3-4-10 の代替: 予算の再計算と度合いの再相談)。
- [ ] **E6: render — 顔・ユニフォーム・表情の適用・ボーンへのポーズ**
  - 依存: E0(`CharacterParts` 契約)。**E5 の実装を待たない**(偽の `CharacterParts` で単体テストする)。担当ファイル: 新規 `render/{character-look,textures}.ts`、`render/pose-apply.ts`(+test)。
  - やること: `applyLook(parts, data)`(`CharacterLookData` の RGBA から `DataTexture` を作り、顔アトラス・背番号・縞を貼る。**`magFilter = LinearFilter`・`minFilter = LinearMipmapLinearFilter`・`generateMipmaps = true`**。キャッシュと破棄)、`applyExpression(parts, expression)`(**`offset` の UV 切替だけ。再アップロードなし**)、ユニフォーム色・肌色・髪色・ヘルメット色の反映、`pose-apply.ts` に**ボーン**(`parts.bones`)への回転の適用(肘・膝を含む。`CharacterPose.scale` の適用)。
  - 完了条件: 単体テスト — 表情の切替で `texture.offset` だけが変わり `needsUpdate` が立たない、`applyLook` の再呼び出しで古いテクスチャが破棄される、顔のテクスチャが Linear+mipmap、肘・膝のボーンの回転が反映される、`CharacterPose.scale` が root に反映される、`document`・`window` を使わない。

#### ウェーブ E-1b(2 並列。A14 の完了と T1 の結果の反映の後)

- [ ] **E3: リグ・フォーム・投手の拡大**
  - 依存: E0, **A14 の完了**, T1 の結果(A2 の修正が必要ならその修正の後)。担当ファイル: `model/world/motion/{rig,pose,fk,batter,pitcher,fielder}.ts`、新規 `model/world/motion/forms.ts`、`model/world/space/params.ts`(`actors.pitcher.scale 1.30`・`RELEASE_POINT` の値のみ)、`camera/{rig,project}.test.ts`・`path/pitch-path.test.ts`・`path/pitch-screen.test.ts`・`motion/*.test.ts`(数値の更新)。
  - やること: 腕を上腕+前腕・脚を大腿+下腿に分ける(`CHARACTER_RIG`・`JointPose`・FK。`CharacterPose` に `expression`・`elbowL/R`・`kneeL/R`・`scale` を出す)。`forms.ts`: 投球フォーム 3 種・打撃の構え 3 種・野手(待機・走り・捕球・ゴロ捕球・送球)・走者(リード・走り・喜び)・感情のポーズ(うなだれ・ガッツポーズ)。**投手を scale 1.30(構図の倍率)にし、`RELEASE_POINT` を FK の手先に合わせて更新**(「固定」の例外。投手フォームの手先が 0.15m 以内。**フォーム別のリリース点は採らない**)。カメラの `fit` が自動で追従することを `rig.test`/`project.test` の数値(E 完了後の列: ゾーン y 433〜608・lift ≈ 0.192)で確認する。`pitch-screen.test` の S300 が崩れるときは `speedProfile`(0.45 以上)の範囲で調整。
  - 完了条件: 単体テスト — **投球 3 種の FK の手先がリリース点から 0.15m 以内**、打撃の構え 3 種が縦長の構図でゾーン枠・格子と重ならない、野手の捕球ポーズでグローブが落下点に届く、全フォームで関節の角度が有限・連続、**全身の高さ ÷ 頭の高さが全体格で 2.0〜2.6**、390×844 の打撃で投手の頭頂 y ≥ HUD 下端 + 8px・身長 ≥ 90px・頭径 ≥ 40px。`pitch-screen.test`・`bot-balance.test`(px の整合)が成功。
- [ ] **E4: 進塁の事実・走者・捕球・送球の計画**
  - 依存: E0, **A14 の完了**(reducer・state を触るため)。担当ファイル: `model/game/{state,outcome,view}.ts`(加算のみ)、**`model/game/{reducer,state}.test.ts`(`GameState` 全体の `toEqual` が `lastAdvance` で崩れる箇所の更新)**、`model/world/path/{runners,fielders}.ts`(+test)、`sequence/world-consistency.test.ts` の追記。
  - やること: reducer が結果の適用時に `GameState.lastAdvance` を記録(乱数・判定には影響しない)し、`view.ts` が `PitchOutcomeView.runners` を作る。`runners.ts`: 塁間の経路上の位置と時刻(1 塁 1.6 秒・最大 3.0 秒・ホームランは動かさない)。`fielders.ts`: 捕球・ゴロ捕球・送球(一塁・二塁)の計画と送球のボール軌道(`throwBallAt`)。結果ごとの演出の表。
  - 完了条件: 単体テスト — `lastAdvance` の追加で reducer の既存の決定論テスト(乱数の消費・判定の結果)が不変(全体 `toEqual` は `lastAdvance` を含むよう更新)、**全結果 × 塁状況の組で走者の最終位置が `after` と一致・得点数と本塁に着いた走者の数が一致・アニメの長さ ≤ 3.0s**、アウトのとき送球のボールが走者より先に着く・安打のとき走者が先に着く、併殺で 2 回送球、ホームランで走者が動かない。

#### ウェーブ E-2(4 並列)

- [ ] **E7: render — ステージ(14 体のプール・ワイプ・品質ティア)**
  - 依存: E5, E6。担当ファイル: `render/{stage,look,stadium}.ts`(+test)。
  - やること: 近景 4 体・遠景 10 体(野手 7・走者 3)のプール(`SceneFrame.runners`・各 `CharacterPose.expression` を反映)。足元の影の円盤(遠景)は `InstancedMesh` 1 つ。`StageHandle.setLook`。**ワイプ**: `SceneFrame.wipe` を `setScissor`/`setViewport` の第 2 パスで描く。対象キャラクターだけに `setWipeLayer(true)` し、ワイプ用カメラは `layers.set(WIPE_LAYER)`・地面と空だけを同じレイヤーにして、影・マーカー・他のキャラクター・球場は描かない(第 2 パスの draw call ≤ 12)。`setQualityTier`(character 分冊 §3-4-10 の表: 画素比・影・遠景の関節更新・ワイプの有無)。**ティアの切替は飛行中(`inFlight`)ならペンディングにし、`idle`/`holding` で実行**(影の ON/OFF の再コンパイルを避ける)。`stats()` に品質ティアとワイプの有無を含む。
  - 完了条件: 単体テスト(smoke)— プールの生成・破棄、ティアの切替で遠景の更新・影・ワイプの可否が変わる、**飛行中の `setQualityTier` がペンディングされ `idle` で適用される**、`setLook` が未知のスロットを無視、ワイプの第 2 パスで描かれるメッシュが対象キャラクター+背景のみ、`window`/`document`/`matchMedia` を使うのは `stage.ts` のみ。
- [ ] **E8: sequence の合成 E(表情・フォーム・走者・送球・ワイプ・内野カメラ・表示倍率)**
  - 依存: E1, E3, E4(A11 の後)。担当ファイル: `model/world/sequence/{frame,play-plan}.ts`(+test)、新規 `model/world/camera/{infield,wipe}.ts`(+test)。
  - やること: 各キャラクターの `expression`(`expressionAt`)・フォーム(`look.pitchForm`/`batStance`)・`CharacterPose.scale`(`framingScaleAt`。カメラの blend に合わせて 1.0 へ)・`SceneFrame.runners`・野手の捕球/送球・送球のボール・走者が動くプレーでの内野カメラへの blend(400ms)・ワイプ(場面と対象。`wipe.ts` が顔の正面を捉えるカメラ姿勢。**矩形は HUD の下端 + 20px の位置から決める**)を合成。**打席の紹介はワイプで出す**(打席前に打者が振り向く動きは作らない。character 分冊 §3-4-9 の③は削除)。`PlayPlan` に走者・送球・ワイプの区間を追加し、走者が動くとき `endMs` を最大 +3.0 秒延ばす。
  - 完了条件: 単体テスト — **ワイプのカメラの前方と顔の向きの内積 ≤ −0.6**(打者・投手)、矩形が 390×844 と 390×664 でゾーン・ボールの通り道・HUD と重ならない、走者が動くプレーだけ内野カメラへ blend し(動かないプレーは blend しない)カメラが連続、**`CharacterPose.scale` が連続で blend 終了時に 1.0**、`endMs` の上限、既存の性質(決定論・入力を変更しない・全数値が有限・ボールが一度消えたら再出現しない)を維持。各関数 60 行以内。
- [ ] **E9: hooks — 見た目のデータの受け渡し・品質ティア**
  - 依存: E2。担当ファイル: 新規 `hooks/{useCharacterLooks,useQualityTier}.ts`。
  - やること: `useCharacterLooks`(打席・攻守交代でスロットの `PlayerLook` が変わったら `model/character/raster` で `CharacterLookData` を作り `stage.setLook`。キャッシュ。**1 フレーム 1 体まで・飛行中/演出中は生成しない・ゲーム開始直後と攻守交代の `idle`/`holding` で先読みする。生成が間に合わないスロットには起動時に 1 度だけ作る無地の仮の顔を貼って進行を止めない**)。`useQualityTier`(`useFramePerf` の窓の p95 を `nextTier` に渡し `stage.setQualityTier`。**飛行中はペンディングにして次の `idle` で呼ぶ**。開発の `?tier=` で固定。切替をログへ。保存は任意)。全 effect に cleanup。
  - 完了条件: lint 0 件・typecheck 起因 0 件。`hooks/` から `three` を import していない。`useCharacterLooks` が同じ look を二度生成しない(キャッシュ)。飛行中に生成・ティア切替を呼ばない。
- [ ] **E10: UI — ワイプの縁取り・打席の紹介**
  - 依存: E0。担当ファイル: 新規 `ui/CutIn.tsx`+CSS、`ui/StageView.tsx`。
  - やること: `CutIn`(ワイプの矩形に重ねる丸い縁・名前・背番号・役割ラベル。props のみ。`pointer-events: none`)、`StageView` に `wipe` の描画と `data-wipe`・`data-quality-tier`・`data-expr-*`(E2E の目印)を追加。打席の紹介カード(番号・名前。短く、非ブロッキング)。
  - 完了条件: lint 0 件・typecheck 起因 0 件。`ui/` が `../model`・`../render`・`../audio` を import していない。縁取りが `pointer-events: none`。

#### ウェーブ E-3

- [ ] **E11: 統合 E と全体確認(キャラクター)**(直列)
  - 依存: E7〜E10。担当ファイル: `hooks/{useStageDirector,useGameStage,useStage3d}.ts`、`ui/GameScreen.tsx`、必要最小限の修正(**`model/world/sequence/*` は対象外**: B5 が `frame.ts`・`play-plan.ts` を並行して触りうるため。必要な修正が見つかったら編集せず上申する。レビュー R2-m9)。
  - やること: director が `runners`・`wipe`・表情・フォームの入力を渡し、`useGameStage` が `useCharacterLooks`・`useQualityTier` を結線し、`StageView` に `wipe`・`qualityTier` を渡す。全体の typecheck・lint・test・build を通す。**`renderer.info` で描画予算を実測**(`stats()`: ティア T0〜T3 の draw call・三角形・キャラクター 1 体あたりのメッシュ数・ワイプの第 2 パスの draw call)し、character 分冊 §3-4-10 の目標(キャラクター全体 ≤ 60、ワイプ ≤ 12、シーン全体 T0 ≤ 200 / T2 ≤ 160 / T3 ≤ 110、三角形 ≤ 120k)に対する結果を完了報告に書く(超える場合は球場側の統合も作業に入れて報告)。knip レポート・バンドルサイズを記録。**`model/sim` のボットのテストを再実行**し、帯を外れたら値を触らず上申(A14b)。**キャラクターの確認用のスクリーンショット**(打撃・守備・表情シート・個性・フォーム・走者・ワイプ。390×844 と 390×664)を撮り、`docs/tests/assets/2026-10-27-baseball-game-v3/characters/` に保存する(1 枚 500KB 以下)。
  - 完了条件: 全体の typecheck・lint・test・build が成功。構造検査 1〜15 が pass。描画予算の目標を満たす(満たさない項目は理由と対策を報告)。`model/sim` のテストの結果を報告。
  - **→ T1b(キャラクターの見た目の確認。ゲート1で承認を得た場合)**: orchestrator が上のスクリーンショットと試遊ビルドを人間に渡し、「パワプロっぽいか(はい/まだ足りない)」と足りない点を `AskUserQuestion` で聞く。足りない点は段階 B 以降の前に E の調整(E2 の顔の描き込み・E5 の造形・E3 のフォーム)に回す。

## 段階 B: 投球の骨格

- [ ] **B1: 投球入力の状態機械**
  - 依存: A13。担当ファイル: 新規 `model/world/sequence/pitch-input.ts`(+test)。
  - やること: `reducePitchInput(state, event, ctx)`(`idle` → `aiming` → `gauge` → `throwing`)。ゲージ開始から `stopGuardMs` の停止は無視。副作用は `effect`。`holding`・`enabled` が偽なら無視。**持ち越しの指(スキップに使った指)の規則**: その指の離しはゲージを始めない(`none`)、その指の最初の move で狙い開始(`aiming`)、複数あるときは最初に下りた `pointerId` を昇格(`shouldPromoteHeld` を共用)。
  - 完了条件: 全組み合わせの単体テスト — 離し=確定+ゲージ開始、ゲージ中の押す=停止+投球(質は `gaugeErrorMs`。入力種別の遅延補正)、`stopGuardMs` 未満の停止は無視、`ringMs + graceMs` で自動投球(失投)、ゲージ中の動きは狙いを変えない、`aimLimit`、キー・ボタンでも同じ遷移、`timeScale`、`holding` 中は何も起きない、**持ち越しの指を離してもゲージが始まらない・その指の最初の move で `aiming` になる・複数の持ち越しの指で最初に下りた pointerId が昇格する**。
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
  - やること: `usePitchingControls`(ポインタ・操作ボタン・キーから `reducePitchInput` を駆動、`aim`/`quality` を `onThrow` で渡す、`PitchInputView` の公開、タイマー解除。`pickZone`・`getZoneRect`・`holding`・`onSkip` を注入で受け、演出中のスキップは `routeStagePointer` を先に通す。**持ち越しの指を `pointerId` の ref で持ち、離してもゲージを始めず、最初の move で狙い開始**)。`usePitchKeyboard`(矢印・Space/Enter。`defaultPrevented` で排他。[[dom-key-input-exclusivity]])。
  - 完了条件: lint 0 件・typecheck 起因 0 件。ゲージ時刻は `event.timeStamp` 経由。`timeScale` を反映。`getBoundingClientRect` を自分では使わない。Space の keydown 1回でスキップと投球が同時に起きない。スキップに使った指の離しでゲージが始まらない。
- [ ] **B5: sequence の合成 B(照準・ゲージ)**
  - 依存: A5, B1, E8。担当ファイル: `model/world/sequence/{frame,play-plan}.ts`(+test)。
  - やること: `pitchInput` から守備の `guide`(`reticle`・散布円・ゲージのリング)を合成。`layout` は人間守備なら `"pitching"`。**狙いと着弾の重ね表示は DOM(`ZoneFeedback`)なので `frame.ts` では合成しない**(B6 の director が `zoneFeedbackOfPitch` を props に渡す)。
  - 完了条件: 単体テスト — 守備の `guide.mode = "reticle"`・ゲージ中のリングが `gaugeRingAt` に一致・飛行中は狙い(投げた時点の値)を保持し選択の変更で動かない、段階 A・E の性質テストが不変。
- [ ] **B6: 統合 B と全体確認(投球)**(直列)
  - 依存: B2〜B5, E11。担当ファイル: `hooks/{useStageDirector,useGameStage,useGame,useStage3d}.ts`、`ui/GameScreen.tsx`、必要最小限の修正。
  - やること: director が `pitchInput` を渡し、`layoutOf` を「人間守備 = pitching」に。windup を `humanWindupMs` で。人間守備のモードで `usePitchingControls` のハンドラをステージの入力面に渡す。`inputActive` を人間守備中も真に。`onThrow` を新しい `PitchCommand` に。**`zoneFeedback`(`zoneFeedbackOfPitch`)を props に渡す**。`GameScreen` から `selection`(セル)を削除。投球のログ。全体の typecheck・lint・test・build を通す。
  - 完了条件: 全体が緑。`skip()` が reducer に触れない。守備の入力面で `touch-action: none` が有効。

## 段階 C: 演出・音

- [ ] **C1: 演出の純関数(バナー・接触演出)**
  - 依存: B6。担当ファイル: 新規 `model/world/sequence/{banner,hit-fx}.ts`(+test)。
  - やること: `bannerFor`(`BannerView`。帯の位置は play 分冊 §3-2)、`hitFxAt`(`reducedMotion` は入力)。
  - 完了条件: 単体テスト — `bannerFor` が全 `kind × inPlay.result × plate` を網羅(なしは `null`)、帯が y 312〜408px の範囲(`bandTopRatio`・`bandHeightPx`)、`hitFxAt` が連続・`reducedMotion` で 0。
- [ ] **C2: 音・触覚の対応表**
  - 依存: B6。担当ファイル: 新規 `model/sound/{cues,sfx-plan,haptics}.ts`(+test)。
  - やること: `SFX_RECIPES`(`throw`・`catch` を含む)、`sfxEventsOf`(リリース・到達・スイング・接触・テロップ開始・歓声・送球・捕球)、`gaugeTicksOf`、`hapticFor`(最短 15〜20ms)。
  - 完了条件: 単体テスト — 全 `SfxCue` にレシピ、長さ ≤ 2.5s・ゲイン ≤ 1・周波数 20〜12000Hz、`sfxEventsOf` が結果種別ごとに期待する cue を `atMs` 昇順で返す(接触なしは打撃音なし・アウトの送球は `throw`)、決定論、`hapticFor` の最短が 15ms 以上。
- [ ] **C3: audio — Web Audio エンジン**
  - 依存: B6。担当ファイル: 新規 `audio/{engine,voices,index}.ts`(+test)。
  - やること: `createAudioEngine({ recipes, createContext })`(`unlock()` はユーザー操作として認められるイベントの中で。`resume()` による復帰、ミュート、同時発音 8、終了後の切断、`dispose`)。ノイズバッファは mulberry32 で 1 回。
  - 完了条件: 偽のコンテキストで単体テスト — `unlock` 前は無音、`suspended` から復帰、ミュートで node 0、同時発音の上限、切断(リーク 0)、`dispose` が冪等。`AudioContext` に触れるのは `audio/` のみ。
- [ ] **C4: UI — 演出の表示・音ボタン・画質**
  - 依存: B6(A0 の型)。担当ファイル: 新規 `ui/EffectBanner.tsx`+CSS、`ui/{StageView,StageTelop,TitleScreen,ScoreHud,GameLayout}.tsx`+CSS。
  - やること: `EffectBanner`(位置は play 分冊 §3-2。ホームランの全面フラッシュと紙吹雪(CSS)・`pointer-events: none`・`prefers-reduced-motion`)、ゲージ中のヒント文、バナーが出る間はテロップを出さない。HUD にスピーカーボタンと「?」、タイトルに音・振動の切替・「画質: 自動/標準/低」・「あそびかた」・(試遊ビルドだけ)「試遊ログ」。`GameLayout` に `sound`・`onOpenHelp`。
  - 完了条件: lint 0 件・typecheck 起因 0 件。`ui/` が `../model`・`../render`・`../audio` を import していない。バナーが `pointer-events: none`。ボタンは 44px 以上。
- [ ] **C5: hooks — 音・触覚**
  - 依存: C2, C3。担当ファイル: 新規 `hooks/{useSfx,useHaptics}.ts`。
  - やること: `useSfx`(エンジンの生成・**`pointerup`/`touchend`/`click`/`keydown` で `unlock`**・`visibilitychange` で `resume`・`fire(prevMs, nowMs)`・ミュート・UI 音)、`useHaptics`。全 effect に cleanup。
  - 完了条件: lint 0 件・typecheck 起因 0 件。`hooks/` から `three` を import していない。`pointerdown` のみで `unlock` していない。
- [ ] **C6: sequence の合成 C(バナー・ヒットストップ・カメラ演出)**
  - 依存: C1。担当ファイル: `model/world/sequence/{frame,play-plan,telop}.ts`(+test)。
  - やること: `PlayPlan` に `banner`・`hitStopMs`(打球・野手・走者・テロップ・終了時刻を後ろへずらす)、カメラへ `hitFx`、バナーのある結果はテロップを `null`。
  - 完了条件: 単体テスト — 接触時のカメラが連続(ヒットストップ中も)、ヒットストップが 0 のとき段階 A・E と同じ時刻表、`reducedMotion` で `hitFx` が 0、バナー有りでテロップが `null`、`endMs ≤ D + 上限`(最長の滞空+走者の進塁+テロップ+余韻から式で計算)。
- [ ] **C7: 統合 C と全体確認(演出・音)**(直列)
  - 依存: C4〜C6。担当ファイル: `hooks/{useStageDirector,useGameStage}.ts`、`ui/GameScreen.tsx`、必要最小限の修正。
  - やること: director が `reducedMotion` を渡し、`banner` を props に入れる。`useGameStage` が `useSfx`・`useHaptics` を結線。`GameLayout` へ `sound`・`onOpenHelp`・`banner`。全体の typecheck・lint・test・build、バンドルサイズ・knip レポートを記録。
  - 完了条件: 全体が緑。構造検査 1〜15 が pass。

## 段階 D: 検証・調整

- [ ] **D1: 投球ボットと投球バランス**
  - 依存: B6, C7。担当ファイル: 新規 `model/sim/pitch-bot.ts`、`model/sim/pitch-bot.test.ts`、`model/cpu/difficulty.ts`・`model/pitch/params.ts` の**値**。
  - やること: 「投球ボット」を実装し、F 群の帯を満たすよう調整する。A14 の打撃ボットの帯・`balance.test.ts` は基準を変えずに成功させる(競合したら A14 の帯を優先し orchestrator に上申)。
  - 完了条件: F 群の帯を満たす。`balance.test.ts`・`human-bot.test.ts` 成功。
- [ ] **D2: E2E とドキュメント**
  - 依存: A14, B3, D1, C7。担当ファイル: `e2e/baseball.spec.ts`、`playwright.config.ts`、`sample-app/README.md`、`docs/process/sample-app-dev.md`。
  - やること: E2E の更新・追加(テスト戦略)。**tutorial 以外の spec は `addInitScript` で既読・球数ヒントの設定**、**試遊ログは `DEV` で常に有効なので「入口が無い」確認は preview ビルドの別 project**、`index.html` の viewport meta の固定。README・`sample-app-dev.md`(新ボット・試遊ビルド・`BOT_FULL=1`・品質ティア・`?tier=`)を更新。「パワプロ」等の名称は書かない。seed を再探索。
  - 完了条件: `cd sample-app && npm run test:e2e --workspace frontend` が 3 回連続で成功(`home.spec.ts` は無改変)。新しいテストを `--repeat-each=5 --workers=2` で実行して失敗 0 件。
- [ ] **D3: 見た目の確認と調整**
  - 依存: C7。**例外として次を調整してよい**: `WORLD_PARAMS` の「調整可」の値、`render/*` の見た目の値、`ui/*.css`、**`model/character/raster/*` の顔の描き込み・`render/character/*` の造形の寸法**(構造は変えない)。
  - やること: 390×844・745・664(`hasTouch`)と 375×667・360×640・1280×720 で、v2 との前後のスクリーンショット(仮想時計+手動 rAF のハーネス。[[swiftshader-playwright-input-latency]])を比較し、「ゲート1で人間に見せるもの」の画面一覧とモックの数値に対して〇×を付ける(打者の占有・バット到達・予告とリング・ボールの最小径とハロー・バナーの位置・ピル・**位置ずれ(DOM のミニ図)がホームラン・ライナー・ゴロの追跡カメラ上でボールに重ならないか**・守備のバー・ホームランの頂点と HUD・ヒットストップ・**投手の顔の可読性・表情・個性・ワイプ・走者・送球**)。画像(1 枚 500KB 以下、30 枚程度)を `docs/tests/assets/2026-10-27-baseball-game-v3/` に保存。最大 3 ラウンド、未達は理由を報告してゲートへ引き継ぐ。
  - 調整可の値: `actors.batter.portraitScale`(0.62〜0.80)・`portraitX`(−0.85〜−0.60)・`portraitBatLength`(**接触時の先端 ≥ +0.28m を保つ範囲**)、**`actors.pitcher.portraitScale`(1.1〜1.4。頭頂が HUD に掛からない範囲。1.5 まで上げると 390×664 の打撃ゾーン幅が約 116px で A2 の下限 115px にぎりぎりなので 1.4 を上限とし、変えたら A2 の 390×664 の下限をその場で再確認する。レビュー R2-m13)**、`ball.minScreenDiameterRatioFlight`(0.014〜0.022)、`halo.opacity`(0.2〜0.5)、`guide.previewRing.startRadius`(0.24〜0.36)、`fx`・`telop`・`banner`・`zoneFeedback` の値、`fit.pitching.defaultSafeArea.bottom`、`wipe.rectPortrait`、`runners.msPerBase`(1.2〜2.0 秒)。カメラ・ゾーンの px を変えたら **A14 のボットテストを再実行**。
  - 完了条件: 受け入れ基準の A・B・C・G・L 群が〇、または未達の理由が報告されている。`npm run lint`・`typecheck`・`test` が成功。**D1〜D3 のすべてが完了した後に、orchestrator が E2E を最終実行して成功を確認する。**
