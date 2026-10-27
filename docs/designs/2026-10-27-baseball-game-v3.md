# 設計: ブラウザ野球 v3(打てる・投げられる・パワプロっぽい手応え — 打撃と投球の骨格の作り直し+構図・演出・音)

- 日付: 2026-10-27
- ステータス: レビュー待ち
- 対応する調査ドキュメント: [docs/investigations/2026-10-27-baseball-game-v3.md](../investigations/2026-10-27-baseball-game-v3.md)(統合)。観点別: [打撃](../investigations/_parts/baseball-game-v3/batting.md)・[投球](../investigations/_parts/baseball-game-v3/pitching.md)・[見た目](../investigations/_parts/baseball-game-v3/visual.md)
- 前版の設計: [docs/designs/2026-10-12-baseball-game.md](2026-10-12-baseball-game.md)(第1版+Three.js 3D 化+「修正設計(H0〜H13)」。以下「v2 設計」)。本書は v2 設計を**置き換えずに上から重ねる**。矛盾する箇所は本書が優先する(覆す決定は「決定の見直し一覧」に全て列挙)。
- 前回のテストレポート(ゲート2承認 → 実機で不合格になった版): [docs/tests/2026-10-19-baseball-game-feel.md](../tests/2026-10-19-baseball-game-feel.md)
- 承認者: (承認ゲート通過時に記入)
- 承認日: (承認ゲート通過時に記入)

## 要旨(先に読む)

- **何を直すか**: v2 修正版は自動テスト全合格・ボット安打率 33%・コードレビュー PASS で通ったが、ユーザーがスマホで遊ぶと「打てない」「投げるのもカス」「パワプロに程遠い」と不合格になった。調査の結論は、(1) 打撃は**着弾点が事前に分からず、振る合図が無く、操作の説明も無い**、(2) 投球は**人間の腕前が結果に効かない**(結果は乱数だけ)、(3) 画面は**打者の後頭部が画面の半分を占め、音が一切ない**、(4) **検証が人間の代理になっていなかった**(ボットが理想的な知覚を持っていた)。
- **v3 の基本線(調査の案C = P0)**: 打撃の骨格(着弾点の予告・縮むリング・ロックオン・「離した瞬間がスイング」・ボールの視認性・初回の説明)、投球の骨格(ゾーンを直接なぞって狙い、縮むリングにタップを合わせるゲージで質が決まる)、見た目・手応え(打者を小さく端へ・カットイン/バナー・Web Audio の合成効果音・振動・位置ずれ表示)、検証の作り直し(人間代理ボット v2・投球ボット・実機の試遊ログ)。**キャラクターの顔・個性・走者の3D化・球場の作り込みは P1(対象外)**で、実機 fps の計測を入れてから可否を判断する。
- **覆す v2 の決定**: 「タップでスイング」(ゲート1 Q-A)、「サウンドはやらない」、「初心者アシストはやらない」、「守備側の操作改善はやらない」、「縦長カメラ x −0.25(Q-B)」。**維持**: 外部素材禁止、three addons 不使用、チームごとの色、タップでの演出スキップ、演出の後に更新、ホーム画面のレイアウト。
- **実装**: 26 ステップ(V0〜V25)、7 ウェーブ。1 ステップ 1 タスク。**ゲート2の前に、ボット以外の「人間が実機で遊ぶ」確認を必ず入れる**(試遊ログで診断できるようにする)。

## 目的・スコープ

### 目的

スマホで遊んで、**打てる・投げられる・パワプロっぽい手応えがある**ブラウザ野球にする。自動テストの数値(特に v2 のボット)を人間の根拠にせず、「人間が遊んで楽しいか」を受け入れ基準の中心にする。

### v2 で何が起きたか(前回の失敗と再発防止)

| 前回の失敗 | 原因 | v3 での再発防止(本書の該当箇所) |
| --- | --- | --- |
| 打率 33% のボットが合格だったのに人間は「打てない」 | ボットが (a) ストライクだけ振る (b) 到達時刻を偏りなく知覚する (c) 着弾点を 3D の直線外挿で完全に推定する (d) 指の移動・持ち替え時間が無い (e) 個人差が無い(調査 batting.md 2.6) | 「検証 — 人間代理ボット v2」: 見分け誤り・知覚の偏り・2D からの推定誤差・Fitts の法則・**個人差の分布(P10/P50/P90)**を入れ、**v2 設定で「打てない」を再現できること(検出力テスト)**を受け入れ基準にする |
| 守備側(投球)は腕前が結果に効かないまま、検証も無かった | 投球の結果は狙いセル中心にガウス誤差を足すだけ。人間も CPU も同じ腕前(pitching.md) | 投球の腕前(狙いの精度+ゲージ)を結果に効かせ、**投球ボット**で「上手い人ほど抑えられる・同じ配球の連打は打たれる」を数値で守る |
| 見た目・音が「やらないこと」に落ちたままゲート1を通った(`visual-scope-must-be-shown-at-gate1` の再発) | サウンド・カットイン・構図を「スコープ外」にして承認を得た | 「ゲート1で人間に見せるもの」に、**変更後の打撃・守備画面のモック(構図の数値つき)・操作の流れ図・音のデモ・ロックオン強度の表**を列挙する |
| 実機で遊ぶまで不満が見えなかった | 実機の入力・体感のデータが無い | 「実機の試遊ログ」(端末内に記録、取り出して診断)と「遊べる版を人間に渡すタイミング」を設計に入れる |

### やること(P0)

1. **打撃の骨格**: ①着弾点の予告(`exact`/`fade`)②縮むリング(到達の先行合図。枠の発光は結果の合図として残す)③ロックオン(難易度で強さを変える。ふつうは初心者が打てる既定)④**操作を「触れる→スライド→離した瞬間がスイング」に**(ボタン・2本目の指・キー・マウスと共存)⑤ボールの視認性(最小径・縁取り・縫い目と回転・ハロー)⑥初回のチュートリアル表示と、最初の数球の画面内ヒント。
2. **投球の骨格**: 調査の案 C(ゾーン直接ドラッグ+ゲージ)の簡略版を採る(理由は「投球の骨格」節)。狙い→ゲージ(縮むリングをタップで止める)→質(ナイス/グッド/ふつう/失投)が着弾のばらつきを決める。狙いと着弾の重ね表示、windup の短縮、1球のテンポ短縮、CPU 打者の反応(位置・質)。
3. **見た目・手応え(P0)**: 打撃・守備の構図(打者を小さく端へ、守備はゾーンを大きく)、カットイン/バナー演出(ヒット・ジャスト・ホームラン・三振・四球)、接触演出(ヒットストップ・カメラの食いつき)、位置ずれ表示、Web Audio の**合成効果音**(外部素材なし)、振動(Android のみ)、音・振動のミュート設定。
4. **検証の作り直し**: 人間代理ボット v2、投球ボット、検出力テスト、**実機の試遊ログ**(開発/試遊ビルド限定)、実機 fps・draw call の計測(P1 の可否判断用)。
5. **決定の見直し**: 下の一覧のとおり。

### やらないこと(スコープ外)

- **キャラクターの顔・個性・体型・フォームの個別化、走者の3D表示、打者走者、球場の作り込み(広告・照明塔・観客の動き・時間帯・天候)**: P1。実機 fps の計測結果を見て、ゲート2で可否を判断する(基準は「実機 fps・draw call の計測」節)。
- 外部素材(画像・GLTF・音声ファイル・外部フォント)、three addons(`EffectComposer` 等)、react-three-fiber。
- リプレイ、実況(音声・`speechSynthesis`)、BGM、応援歌。効果音は**短い合成音の効果音と歓声のノイズ**のみ。
- 横持ち(横画面)専用の構図。デスクトップ(横長)は v2 のまま動くことだけを回帰で守る(縦長 ≤ 0.7 だけが v3 の新構図。補間域は v2 の `portraitBlendAt` のまま)。
- 守備操作(野手を動かす)・送球・走塁、判定窓(±150ms)・ファウル窓・ジャスト窓・見逃し確定 D+250ms の変更。
- 練習モード(打撃10球など)。初回のチュートリアル表示で代える(練習モードは P1 の候補)。
- backend・`@sample-app/shared`・ホーム画面(`/`)・`home.spec.ts` の変更。
- 実機の自動検証(Playwright は headless のみ)。実機は人間の試遊と試遊ログで確認する。

### 決定の見直し一覧(v2 → v3)

v2 設計の「やらないこと」・ゲート1の決定・規約と、v3 の施策のぶつかる箇所を一覧にする。**覆すものは人間がゲート1で承認する**。

| # | v2 の決定(出典) | v3 | 理由 |
| --- | --- | --- | --- |
| 1 | **タップでスイング**(修正設計 ゲート1 Q-A。1本指のタップ=離した時点で出る。判定時刻は押下) | **覆す**: 1本指は「触れる→スライド→離した瞬間がスイング」。判定時刻は離した時刻。タップ(動かさず離す)も同じ規則。2本目の指・スイングボタン・キー・マウスのクリックは v2 のまま維持 | パワプロの操作の骨格。v2 は「ドラッグ→離す→タップ」の3動作で、離してもスイングしないのが黙って無効になっていた(batting.md #3)。判定時刻と見た目の開始が一致する |
| 2 | サウンド・効果音・BGM は「やらないこと」(第2版・修正設計) | **覆す(効果音のみ)**: Web Audio の合成音。BGM・実況・音声ファイルは引き続き対象外 | 音の有無が「ゲーム感」を決める(visual.md #3)。外部素材なしで可能(合成音) |
| 3 | 外部素材(画像・GLTF・外部フォント・音声)の読み込み禁止 | **維持**: 音もすべて合成。画像・フォントは使わない | ライセンス・取得環境の制約 |
| 4 | three addons / r3f / Phaser / Pixi の不使用 | **維持**: ポストプロセスは CSS(フラッシュ・ビネット)で代える | バンドル・保守 |
| 5 | 初心者向けアシスト(カーソルの自動寄せ・吸着)は「やらないこと」(修正設計) | **覆す**: ロックオン+着弾点の予告。強さは難易度で変える(ふつう=初心者が打てる既定、むずかしい=ほぼ無し) | 「打てない」の主因が着弾点の読めなさ(batting.md #1)。パワプロの初心者設定と同じ方向 |
| 6 | 守備側(人間が投げる)の操作改善(windup 短縮・狙いと着弾の重ね表示)は「やらないこと」(修正設計) | **覆す**: 投球の骨格を作り直す | 腕前が結果に効かない(pitching.md #1) |
| 7 | 5×5 のコース格子+「投げる」ボタン(N10)。選択を 3D のゾーンへハイライト | **覆す**: ゾーンを直接なぞって狙う(格子は薄い目安線として残す)。「投げる」ボタンは「投げる/とめる!」の1つの操作ボタンに変える(アクセシビリティと E2E の確実な経路) | 間接的で遠い入力(pitching.md #3) |
| 8 | 結果の見せ方は黄色のテロップ1種(N 節) | **覆す(追加)**: ヒット・ホームラン・三振・四球・ジャスト等にバナー/カットインを追加。ボール/ストライク等のテロップは残す | 演出が1種だけ(visual.md #5) |
| 9 | 縦長の打撃カメラ x −0.25・打者 x −0.65・scale 0.92(Q-B)。打者が画面の半分を占める構図を承認 | **覆す**: カメラ x 0・打者 scale 0.70・x −0.75(縦長のみ)。**ゲート1で構図のモックを再承認** | 打者の後頭部が画面の 54% を占める(visual.md #1) |
| 10 | 守備レイアウトの構図(ゾーンを小さくして格子を操作バーの上に収める。390×844 で 102×115px) | **覆す**: 格子を操作バーから外すので、守備もゾーンを打撃と同じ大きさにする(155×175px) | 直接ドラッグにはゾーンが大きい必要がある |
| 11 | 球種の曲がりは誇張なし(`bendGain` 1.0。ゲート1 Q-C) | **維持** | ユーザー決定。球種の見分けは回転・チップ(球速・曲がり矢印)で補う |
| 12 | 判定窓 ±150ms・ファウル窓・ジャスト窓・見逃し確定 D+250ms・遅延補正(タッチ 70 / マウス・キー 20)・ゾーン実寸・ボール半径の当たり範囲 | **維持**(「動かさない値」)。ただし**指が下りている間は到達通知を D+250+120ms まで保留**する(離した時刻の判定を遅延で落とさないため) | v2 の検証済みの値 |
| 13 | 「実機は人間の試遊で確認する(実機の自動検証はしない)」 | **補強**: 実機の試遊ログを端末内に記録して取り出せるようにし、診断できるようにする | 前回は不満の原因を実機で見られなかった |
| 14 | `render/` は three だけ、`model/world/` は three 非依存 | **維持**。音は新セグメント `audio/`(Web Audio の副作用アダプタ。`render/` と同格)+ 純粋データ `model/world/sound/` に分ける | `frontend-3d-three-in-render-segment` の境界を保つ |
| 15 | スコア更新は演出の後・タップで演出スキップ・チームごとの色・ホーム画面(`/`)の構成 | **維持**(ユーザー決定) | — |
| 16 | CPU 打者・難易度(`aimSigmaScale` 等)・ボット帯の値(B 30〜35% ほか) | **変更**: CPU 打者は球の位置・質に反応する。ボットは v2(個人差・知覚誤差入り)に置き換え、帯を再設定 | 検証の作り直し |

## アーキテクチャ・変更概要

### 全体方針

- 構成は v2 のまま `features/baseball/` の `types/`・`model/`・`render/`・`hooks/`・`ui/` を守る。`model/world/` は three 非依存の純粋関数、`from "three"` は `render/` のみ、`model/` と `render/` は互いに import せず、つなぐのは `hooks/` だけ([[frontend-3d-three-in-render-segment]])。**追加は `audio/` セグメント1つだけ**(Web Audio。`types/` だけを import し、`AudioContext` に触れるのは `audio/` だけ)。
- 新しいロジックはすべて純粋関数(`model/`)に切り出す([[pure-function-extraction]])。hooks と ui は薄いグルー。乱数は `Math.random` 禁止・シード付き PRNG か `seq` から導く決定論の関数([[sample-app-lint-random-and-index-access]])。
- 時計は v2 のまま1本(`usePitchFlight.getElapsedMs()`)。ゲージ(投球)はゲーム時計ではなく壁時計(`event.timeStamp`)で測り、`speed.timeScale` で割る(`fast=1` の E2E で短くなる)。
- 判定は reducer の責務のまま。ただし投球の質(`PitchQuality`)と打撃のロックオン(`assistK`)は**判定への入力**として reducer・`resolvePitch` に渡す(表示専用ではない)。

### 1. 打撃の骨格

#### 1-1. 操作(触れる→スライド→離した瞬間=スイング)

v2 との差と共存を表にする(「ステージ」= 入力面 `bb-stage__input`)。

| 入力 | v3 の動作 | v2 との差 |
| --- | --- | --- |
| タッチ1本目 pointerdown | 狙い(aiming)開始。**カーソルは動かさない**(相対ドラッグ)。`holding`(演出中)ならスキップ | v2 の「タップ候補」を廃止 |
| タッチ1本目 pointermove | 指の移動量だけカーソルが動く(1:1。ロックオンで補正される。下記) | 同じ |
| **タッチ1本目 pointerup** | `swingReady` なら**離した時刻でスイング**(動かさずに離した場合も同じ)。カーソル位置は離した時点の有効カーソル。`swingReady` が偽(windup 中など)なら何も起きない(カーソルを置くだけ) | **新**(v2: ≤180ms・≤10px のタップだけがスイング) |
| タッチ2本目以降 pointerdown | 現在のカーソル位置で**即スイング**(押した時刻) | 同じ |
| スイングボタン pointerdown | 即スイング(押した時刻)。1本目の指が狙っている最中でも押せる | 同じ(ボタンは両手持ち用の補助として残す) |
| マウス move / pointerdown | 絶対位置で追従 / 押した時刻でスイング | 同じ |
| キー(矢印/WASD、Space/Enter、Z/X) | v2 のまま | 同じ(`defaultPrevented` の排他も同じ。[[dom-key-input-exclusivity]]) |
| pointercancel・ステージ外での離し | スイングしない(狙いを捨てる) | 同じ |
| 演出中の pointerdown / Space・Enter | スキップ(押しっぱなしの指は演出後の最初の move で狙い再開) | 同じ |

- **離した時刻の判定**: `atMs = (離した pointerup の timeStamp − リリース時刻)×timeScale − 70ms`(`swingAtMs` に `origin = {timeStamp: 離し, sourceTimeStamp: 離し, inputKind: "touch"}` を渡す。式は v2 §2 のまま)。
- **誤爆ガード**: リリース直後 `earlyReleaseGuardMs`(出発値 200ms)以内の離しは、持ち替えとみなしてスイングしない(窓 ±150ms の人間には振る意味がない時刻のため)。それ以外の早すぎる離しは「早い −xxx ms」の空振りとして返す(黙って捨てない)。
- **到達通知の保留**: **指が下りている間(狙い中)は、到達通知(見逃しの確定)を D + `lateCutoffMs`(250) + `aimGraceMs`(120)まで保留**する(離した入力の処理が描画で遅れても落とさない)。その後も指が下りていれば見逃しが確定し、後の離しは無視される。保留は純関数 `arrivalDue` が判断する(v2 の `holdArrivalFor(200)` の方式を、指の状態を毎フレーム渡す方式に置き換える)。
- **スイング種別(ミート/強振)**: ボタン・Z/X キーのまま。操作の途中で切り替えたいときは、もう片方の親指で切替ボタンを押す(1本指だけなら、狙う前に選ぶ)。

#### 1-2. 着弾点の予告(`preview`)と縮むリング(先行合図)

投球がリリースされた瞬間(`flight` の出現。t = 0)から、**着弾点に予告の印**を出し、その周りに**D に向かって縮むリング**を出す。リリース前(windup 中)は着弾点が決まっていないので出さない(パワプロは投球モーションの開始で出すが、v3 は `CPU_PITCH` の dispatch がリリース時なので、リリースと同時。残り約 1.3 秒ある)。

- **リング**: 着弾点(ゾーン平面)を中心に、半径が t = 0 で `startRadius`(0.30m。390 幅で約 89px)、t = D で `endRadius = ballRadius × 1.25 = 0.125m`(約 37px。ボールの縁のすぐ外)になる**線形**の縮小(時間写像は掛けない。D 以降は D の半径で保持)。**ボールが着弾点に着いた瞬間にリングがボールを囲む**。これが「先行する今の合図」(v2 のゾーン枠の発光は D−20ms からの結果の合図で、反応時間 200ms 超の人間には使えなかった)。ゾーン枠の発光は残す(確認用)。
- **点の見せ方は難易度で変える**(アシストの `preview`): `exact` = 着弾点の真上に小さな点(半径 0.04m・シアン・黒縁)。`fade` = フェードカーソル(点は出さず、半径 `fadeRadius` の薄い円を、着弾点から `seq` から決まる決定論のずれ `fadeJitter` 以内で動かした位置に出す。円は必ず真の着弾点を含む)。リングは `fade` のときも円の中心に出す。**色はシアン(0x5ce1ff)**にして、黄色のカーソルと区別する。
- **変化球**: 予告は**最終の着弾点**(曲がり終わった位置)に出す(`flight.landing`)。軌道の曲がりは従来どおり(誇張なし)。
- **ボール球かストライクかは、予告の点がゾーン枠の内か外かで分かる**(ふつうまで)。むずかしいでは円がゾーン枠をまたぐことがある(見分けが要る)。
- 出現は 120ms でフェードイン(`fadeInMs`)。D + `hold`(接触なしは消失時刻)まで残す。

#### 1-3. ロックオン(カーソルの補正)とアシストの強さ

ロックオン = 指で動かした「素のカーソル」(`raw`)を、飛行中に着弾点へ**部分的に引き寄せた「有効カーソル」**を判定と表示の両方に使う(表示と判定は常に同じ有効カーソル。カーソルが指の位置とずれて見えるのは、補正が効いているとき)。

```
progress p = clamp(t / D, 0, 1)
dist       = ゾーン単位での raw と landing の距離(ユークリッド)
capture    = 1 − smoothstep(captureRadius, captureRadius × 1.6, dist)   // 遠すぎるボールは引き寄せない
ramp       = smoothstep(rampStart, rampEnd, p)                          // 早い時刻は素のカーソル、終盤で効く
k          = lockStrength × capture × ramp
effective  = raw + (landing − raw) × k
```

- 判定に使うカーソルは `effective`(`SwingInput.cursor`)。`SwingInput.assistK = k` も渡す。**質 q は `k` が大きいほど下げる**: `q' = q × (1 − qualityPenalty × k)`(補助なしの上手い人のほうが強い打球を打てる。ロックオンだけで全てライナーになる問題を避ける)。
- 難易度ごとの出発値(`ASSIST_TABLE`。V22 がボットで調整してよい。範囲は V22 の「動かしてよい値」):

| 難易度 | lockStrength | captureRadius(ゾーン単位) | rampStart / rampEnd | preview | fadeRadius / fadeJitter | qualityPenalty |
| --- | --- | --- | --- | --- | --- | --- |
| かんたん | 0.80 | 1.6 | 0.30 / 0.80 | exact | — | 0.30 |
| **ふつう(既定)** | **0.55** | **1.2** | 0.35 / 0.85 | exact | — | 0.35 |
| むずかしい | 0.20 | 0.7 | 0.40 / 0.90 | fade | 0.45 / 0.25 | 0.40 |

- アシストは**難易度に連動**する(タイトルの難易度ボタンは CPU の強さとアシストの両方を決める。新しい設定 UI は作らない)。独立の「アシスト」設定にするかはゲート1の論点(Q2)。
- 「むずかしい」は v2 に近い(ロックオンほぼ無し)が、**縮むリングと視認性の改善は全難易度に入る**(打てない主因が着弾点の読めなさ・合図の無さだったため)。

#### 1-4. ボールの視認性

| 項目 | v2 | v3 |
| --- | --- | --- |
| 飛行中の最小表示径 | 無し(リリース 7.5px。中継カメラ中だけ 0.95%) | **飛行中も最小表示径**: `ballScaleFor(camera, ball, minRatio)` に飛行用の `minScreenDiameterRatioFlight = 0.0175`(390×844 で約 14.8px)。リリース直後は約 2.0 倍、D−655ms 付近(径 16.6px)で 1 倍に戻る(連続・単調) |
| 縁取り | 球の 1.12 倍の黒い殻(径 17px 未満で 1px 未満) | 殻の太さを**画面で 2px 以上**に保つ(縮小時は殻の倍率を `1 + 2px/径` まで上げる。`render/markers.ts`) |
| 白い服との重なり | 重なる(画面 y<250 = 飛行の 58%) | **ハロー**(球の 1.9 倍の暖色の半透明円。不透明度 0.35)を球の後ろに敷く。輪郭と合わせて背景によらず見える |
| 回転・縫い目 | 無し | **赤い縫い目(2本の半円弧)**と**回転**。球種で回転軸・速さを変える(ストレート=バックスピン、カーブ=トップスピン、スライダー=斜め、フォーク=ほぼ無回転、シュート=逆斜め)。球種の見分け(パワプロの「回転で判断」)の手がかり |
| 位置の手がかり | 影(円盤1つ) | 影は残す。予告の点とリングが主役 |

#### 1-5. 説明(チュートリアル)

- **初回の表示**: 初めて人間が打つ(または投げる)ときに、1球目を始める前に**カード**(3 ページ。「つぎへ/はじめる」ボタン 44px 以上)を出す。表示中は `holding` と同じく次の投球を始めない(`useGameStage` が `tutorialActive` を `holding` に合成する)。既読は `localStorage`(`bb-tutorial-v1`)。HUD の「?」(あそびかた)でいつでも再表示(投球が飛んでいない `idle` のときだけ押せる)。
- **打撃のカード**: ①「ゆびをのせて スライドすると カーソル(きいろ)が うごく」②「ボールが くる ところに ● が でる。カーソルを ● に あわせる」③「リングが ● に かさなる しゅんかんに ゆびを はなす = スイング!(2本目のゆび・スイングボタンでも ふれる)」。**投球のカード**: ①「球しゅを えらぶ」②「ゾーンを なぞって ねらいを きめて ゆびを はなす」③「リングが ちぢんで ねらいに かさなる しゅんかんに タップ!(ぴったりで ナイスピッチ)」。
- **最初の数球のヒント**: 人間の打撃・投球のそれぞれ最初の 5 球は、画面下に 1 行のヒント(「リングが ● に かさなったら ゆびを はなす!」/「リングが ねらいに かさなったら タップ!」。`localStorage` で球数を数える)。
- 画面の絵(指のアニメーション)は CSS だけで描く(画像なし)。

### 2. 投球の骨格(案 C の簡略版: ゾーン直接ドラッグ+リングゲージ)

**選択肢(調査 pitching.md)と選択**

| 案 | 内容 | 腕前の要素 | パワプロらしさ | 工数 | v3 の判断 |
| --- | --- | --- | --- | --- | --- |
| A 現行改善 | 格子は残し windup 短縮・重ね表示・σ 調整 | 無し | 低 | S〜M | 採らない(腕前が戻らない) |
| B ゲージ追加 | 格子+ゲージ | ゲージ | 中 | M〜L | 採らない(格子は遠く間接的) |
| **C ゾーン直接ドラッグ+ゲージ** | ゾーンをなぞって狙い、離して確定、ゲージをタップで止める | **位置+ゲージ** | **高** | L | **採用(簡略版)** |
| D ワンジェスチャ | 押したまま動かして離して投げる | 位置のみ | 中 | M〜L | 採らない(誤タップ・腕前が弱い) |

**採用理由**: (1) 打撃の操作(ゾーンを相対ドラッグ+縮むリング)と同じ言語になり、1つのチュートリアルで済む(リングは同じ描画部品を使う)。(2) 腕前が2要素(位置の精度・タイミング)で結果に効く。(3) ゾーンが大きく見える構図(155×175px)にでき、格子を操作バーから外すので画面が空く。簡略化の点: パワプロの A タイプの「球種→場所→ゲージ」を、「球種チップ(常時選べる)→ ステージで狙いを動かし離す → リングをタップ」の 2 ジェスチャにした。

**流れ(人間守備)**

```
[球種チップを選ぶ] (常時。球速と曲がり矢印つき)
        ↓
(idle) ステージに指を置く → (aiming) 狙いの照準が出る。スライドで動く(相対ドラッグ、散布円で「ブレの目安」を表示)
        ↓ 指を離す(= 狙いを確定)
(gauge) 照準の周りのリングが 900ms かけて縮む(戻らない。終点を過ぎても 300ms は縮み続ける)
        ↓ リングが照準に重なる瞬間にタップ(ステージのどこでも / 「とめる!」ボタン / Space)
(throwing) 質が決まる(ナイス / グッド / ふつう / 失投) → windup 280ms → 投球 → 飛行 → 着弾
        ↓
着弾から 700ms: 狙い(白の照準)と着弾(シアンの点)を重ねて表示 + 「ナイスピッチ!」「ズレ 0.2」等
```

- **質の決まり方**: ゲージの誤差 `e = (停止時刻 − 遅延補正 70ms) − (ゲージ開始 + 900ms)`。`|e| ≤ 40ms` = ナイス、`≤ 90ms` = グッド、`≤ 160ms` = ふつう、それ以外・タップなし(自動投球)= 失投。
- **着弾のばらつき**: v2 の σ(`baseSigma 0.28 × 制球 × 疲労`、人間の制球 63 で約 0.384)に質の倍率を掛ける: ナイス ×0.35 / グッド ×0.65 / ふつう ×1.0 / 失投 ×1.7 かつ**狙いを真ん中やや高め(0, 0.15)へ 60% 引き寄せる**(パワプロの「失投はボールゾーンか真ん中」の簡略)。乱数の消費数は変えない(ガウス 2 回のまま)ので、既存の決定論テストの構造は保たれる。
- **狙いは連続座標**(ゾーン単位。±1.67 に制限)。`PitchCommand` を `{ kind, aim: ZonePoint, quality }` に変え、CPU は `CpuPitchChoice { kind, cell }`(セル)を返し、reducer がセル中心を `aim` に直して `quality: "normal"` で投げる(CPU の挙動・既存の CPU テストの構造は保つ)。
- **PC・キー**: マウスは動かすと狙いが追従(絶対位置)、クリックで確定(ゲージ開始)、もう一度クリック(または Space)で停止。キーは矢印で狙いを動かし、Space/Enter で確定→停止。「投げる」ボタン(`throw-pitch`)は、`idle`/`aiming` では「確定」、`gauge` では「とめる!」を同じ操作として受ける(スマホで片手・ボタンだけでも投げられる)。
- **球種チップ**: 球種名・球速(km/h)・曲がり矢印(↘ ↙ ↓ など)を出す。1つ 76×52px。常に選べる(飛行中も次の球の準備として選べる)。

**CPU 打者との整合**(投球が腕前で変わるための反応)

- `PitchFlight.quality` と着弾位置の「縁度」(`extent = max(|x|, |y|)`)で、CPU 打者の入力ノイズを変える。`cursorSigma × qualityFactor × locationFactor`、`timingSigmaMs × (qualityFactor^0.5) × locationFactor'`。`qualityFactor` = ナイス 1.7 / グッド 1.25 / ふつう 1.0 / 失投 0.65(難易度の `qualitySensitivity` で冪にする: かんたん 1.2 / ふつう 1.0 / むずかしい 0.6)。`locationFactor = 1 + 0.9 × max(0, extent − 0.5)`、`locationFactor' = 1 + 0.4 × max(0, extent − 0.5)`。失投は振る確率も ×1.25(上限あり)。
- **同じ球種の連投は不利**にする: 直前の球種が同じなら `cursorSigma` を ×0.85(CPU の連投ペナルティと対称。`lastPitchKind` は既にある)。
- CPU 同士(`balance.test.ts`)も位置・質に反応するので打率が下がる。V4 が `cursorSigma`/`timingSigmaMs`/`zoneSwingRate` の出発値を調整し、**`balance.test.ts` の基準は変えない**(打率 .23〜.29 を保つ)。

**テンポ**: 人間の windup 700ms → **280ms**(`PlaybackSpeed.humanWindupMs`)、CPU の windup 700ms → **550ms**(`cpuWaitMs`)、テロップ: ボール 500 → 380ms、空振り 700 → 520ms、ファウル 700 → 520ms、インプレー 1100 → 900ms、余韻 200 → 120ms。1球(CPU 投手・見逃し)は約 2.7 秒 → 約 2.4 秒。人間の投球は(狙い 約 0.5 秒+ゲージ 約 1.0 秒+windup 0.28+飛行 1.33+結果 0.5)で約 3.6 秒(v2 の 2.7 秒より長いが、腕前の要素の対価。スキップ可。ゲート1の論点 Q9)。

### 3. 見た目・手応え(P0)

#### 3-1. 構図(390×844。数値の根拠は「構図の手計算」節)

| 要素 | v2 | v3 |
| --- | --- | --- |
| カメラ(縦長) | 位置 (−0.25, 1.75, 2.6)・注視 (−0.25, 0.55, −18) | **位置 (0, 1.75, 2.6)・注視 (0, 0.55, −18)**(高さ・奥行き・FOV の式 `fit` は v2 のまま)。ゾーンと投手が画面中央(x 195)で縦に並び、ボールの通り道が打者から離れる |
| 打者(縦長) | scale 0.92・x −0.65。頭が x 0〜212(画面幅の 54%) | **scale 0.70・x −0.75**。頭の中心 x ≈ −31px・半径 ≈ 106px(**画面内に見える頭は x ≤ 74px = 19%**)。胴の右端 ≈ 38px |
| バット | 打者の scale に従う(長さ 0.87m) | **バットの長さだけ 1.45 倍**(`BatPose.lengthScale`)。打者を小さくしても接触時の先端が x +0.285m(ゾーン右端 0.26m の外)に届く |
| 守備レイアウト | tan 0.38。ゾーン 102×115px。格子を操作バーの上に収める | **打撃と同じ構図**(tan 0.25・ゾーン 155×175px)。操作バーが ≈ 130px に縮む(格子を外すため) |
| 打者(守備側の CPU 打者) | 左 1/3 を覆い格子の約 10% を隠す | 同じ縮小・端寄せ(打撃と同じ打者配置) |

#### 3-2. 演出(バナー・カットイン・接触演出・位置ずれ)

- **バナー(`ui/EffectBanner`、DOM+CSS)**: 純関数 `bannerFor(outcome, landing, timing)` が文言・種類・色・表示区間を決める。種類: `just`(ジャストミート!)、`hit`(ヒット/二塁打/三塁打)、`homerun`(全面フラッシュ+大文字+紙吹雪の CSS)、`strikeout`(三振!)、`walk`(フォアボール)、`out`(アウト系は小さく)、`nice-pitch`(守備のナイスピッチ)。画面上から 30〜42% の斜めの帯(チーム色の縁取り)。ボール/ストライク/空振り/ファウルは v2 のテロップのまま。バナーが出る結果はテロップを出さない(重複させない)。スキップ(タップ)で即消える。
- **接触演出(純関数 `hitFxAt`)**: ジャスト・強い当たりで**ヒットストップ**(バットと打球を 60ms〜40ms 止める。`PlayPlan.hitStopMs`。演出の時刻表を後ろへずらす)、**ズームパンチ**(接触後 140ms で FOV を 4% 狭めて戻す)、**微小なシェイク**(振幅 0.012m)。`prefers-reduced-motion` では全て無効(入力の `reducedMotion`)。
- **位置ずれ表示**: スイング後 900ms、3D に**白い十字(有効カーソルの中心)・シアンの輪(ボールの着弾点)・両者を結ぶ細い線**を重ね、タイミングのピルを 2 行にする(1 行目 = 「ジャスト!」「早い −62ms」「遅い +48ms」、2 行目 = 「芯」「ふつう」「かすり」「ミス」。純関数 `contactFeedbackOf`)。空振り・ファウルの理由が分かり、学習できる。

#### 3-3. 音と触覚

- **音(Web Audio の合成。`audio/` + `model/world/sound/`)**: 外部素材なし。効果音一覧(`SfxCue`): `pitch-release`(ヒュッ)、`mitt`(パン。ボール・ストライクの到達)、`swing-miss`(ブンッ)、`hit-just`(カキーン。高い打撃音+余韻)、`hit-normal`、`hit-weak`、`foul`、`grounder`、`homerun`(打撃音+歓声のうねり 2 秒)、`cheer-small`・`cheer-big`(ノイズ+帯域フィルタの歓声)、`strike`・`ball`・`out`・`strikeout`・`walk`(短いジングル)、`ui-tap`・`ui-select`、`gauge-tick`(ゲージの接近音)、`nice-pitch`。音色は「レシピ」(オシレータ・ノイズ・フィルタ・エンベロープのデータ表)で定義し、純関数 `sfxEventsOf(plan, flight)` が「いつ・どの音を・どの強さで」を決める(単体テストできる)。`audio/engine.ts` がレシピを実行する(`AudioContext` はユーザー操作で作成・resume。ミュート・同時発音数の上限 8)。
- **既定は ON**(ユーザー操作の後)。HUD のスピーカーボタンと、タイトルの切替で ON/OFF(`localStorage` の `bb-prefs-v1`)。iOS のサイレントスイッチ(マナーモード)では Web Audio も鳴らないので、チュートリアルに一言書く。**ゲート1で音のデモ(`sfx-demo.html`。使い捨て)を聴いて決める**(Q3)。
- **触覚(`navigator.vibrate`。Android のみ)**: パターン表(`haptics.ts`): スイング 8ms、ジャスト 25ms+短い間+35ms、ヒット 18ms、ホームラン [30,40,30,40,90]、三振 30ms、ナイスピッチ 20ms。80ms 未満の連続は間引く。`prefers-reduced-motion`・設定 OFF で無効。iOS は非対応(何もしない)。

### 4. 検証の作り直し

#### 4-1. 人間代理ボット v2(打撃)

v2 のボット(`model/sim/bot-sim.ts`)の欠点(調査 batting.md 2.6)を直した、**個人差のある複数の仮想プレイヤー**。`model/sim/human-bot.ts`(+PA シミュレータ `human-game.ts`)に置く(テスト専用層。`*.test.ts` 以外から import しない)。乱数は mulberry32。

**1 人の仮想プレイヤーのパラメータ**(レベルごとの分布から 1 人 1 組サンプルし、レベルあたり 40 人 × 各 2000 球。結果は P10/P50/P90 で見る):

| パラメータ | 意味・根拠 | 初心者 | 中級 | 上級 |
| --- | --- | --- | --- | --- |
| `reactMs` | 見て動き出すまで(反応時間 200〜250ms。batting.md) | N(280, 40) | N(230, 30) | N(190, 25) |
| `biasMs`(リング有り) | 到達の知覚の偏り(正 = 遅く感じて遅く離す)。リングが収束を明示するので v2(+130ms の looming)より小さい | N(+40, 45) | N(+15, 35) | N(0, 25) |
| `biasMs`(リング無し = v2 設定) | looming のみ。検出力テスト用(batting.md 2.5 の +130ms 前後) | N(+130, 50) | N(+90, 40) | N(+40, 30) |
| `timingSigmaMs` | 離す時刻のばらつき | 85 | 60 | 40 |
| `latencyMs` | 表示+入力の遅延(端末) | N(80, 20) | N(80, 20) | N(70, 15) |
| `fingerSigmaPx` | カーソルの最終位置の指のぶれ | 12 | 8 | 5 |
| `perceiveSigmaZone`(予告 exact) | 予告の点の位置の知覚誤差(ゾーン単位) | 0.18 | 0.10 | 0.06 |
| `swingAtStrike` / `chaseBall` | ストライク/ボール球を振る率の基準(予告の見分けの誤りに加えて) | 0.80 / 0.30 | 0.85 / 0.20 | 0.90 / 0.12 |
| Fitts の `a, b, W` | カーソルの移動時間 `MT = a + b·log2(1 + 距離px / W)`(a=120ms, b=140ms/bit, W=40px) | 同 | 同 | b=110 |

**知覚の定義**(v2 ボットとの違い):
- **ボール/ストライクの見分け**: 予告(exact)の知覚位置 = 真の着弾 + N(0, perceiveSigma)。ゾーンの外か内かを、知覚位置と「境界の余白(N(0.15, 0.2))」で判断して振る/見送る。予告なし(v2 設定)では、2D 画面の座標から「現在の画面速度で等速に進む」と外挿して着弾を逆投影する(奥行きの推定誤差が出る。投影は `camera/project.ts`)。2 ストライクでは境界を広げて守りに行く(ゾーン外 +0.4 まで振る)。
- **カーソルの動き**: `reactMs` 後に動き出し、Fitts の移動時間で目標へ向かう(間に合わなければ途中位置で離す)。**開始位置は前の球で最後にあった位置**(v2 の持ち替え)。ロックオンは有効カーソルの式をそのまま使う。
- **離す時刻**: `event = D + biasMs + latencyMs + N(0, timingSigmaMs)`。見逃し確定(D+250+120)を超えたら見逃し扱い。判定時刻は `swingAtMs`(`− 70ms`)。誤爆ガード・保留は実装と同じ式を使う。
- **出力(レベルごと、P10/P50/P90)**: 打率(安打 ÷ (打席 − 四球))、三振率、四球率、コンタクト率(スイングのうち空振りでない割合)、ストライクを振る率・ボールを振る率、離す時刻の平均と SD、カーソルと着弾点の距離の中央値(px)。

**PA シミュレータ**: `reduce`(CPU 投手→ボットのスイング/見逃し)を直接駆動し、カウント・四球・三振を含めた打席結果を数える(`simulate.ts` の CPU 同士と同じ reducer。人間のスイングを `SWING`、見逃しを `PITCH_ARRIVED` で入れる)。

**検出力テスト(前回の再発防止の核)**: ボットは「v2 設定」(`ASSIST_OFF`: ロックオン 0・予告なし・リングなし・`biasMs` は v2 表の値・タップ入力)で、**前回ユーザーが「打てない」と評価した状態を再現できなければならない**。受け入れ: 初心者の打率 P50 ≤ .17 かつコンタクト率 P50 ≤ 50%、中級の打率 P50 ≤ .22。再現できなければボットのパラメータが楽観的なので、人間らしい範囲(上表)で調整して通す(調整内容を完了報告に書く)。

**実機ログでの較正**: 試遊ログ(4-3)の `fitBotParams(records)` が、実測の離す時刻の平均・SD、距離の中央値から `biasMs`・`timingSigmaMs`・`fingerSigmaPx` を推定して出力する。V22 は、ユーザーの試遊ログが得られていればそれを使ってレベルの分布の中心を較正する(得られていなければ上表の値で進め、ゲート2のログで較正する)。

#### 4-2. 投球ボット

`model/sim/pitch-bot.ts`。仮想プレイヤー(レベルあたり 40 人)のパラメータ: ゲージのタップ時刻のばらつき `timingSigmaMs`(初心者 110 / 中級 70 / 上級 45)とバイアス(0 / +20 / 0)、指のぶれ `fingerSigmaPx`(10 / 7 / 5。ゾーン単位へは `pxPerZoneUnit` で換算)、配球戦略(初心者=ゾーン内をほぼ中央・同じ球種、中級=縁を 40%・球種を変える、上級=縁 60%+球種とコースを変える、「中央連打」=比較用)。CPU 打者(ふつう)との PA を `reduce` で回し、被打率・ストライク率・四球率・ナイス率を出す(受け入れは「テスト戦略」)。

#### 4-3. 実機の試遊ログ(開発/試遊ビルド限定)

- **有効化**: `import.meta.env.DEV` または `VITE_PLAYTEST=1` でビルドしたときだけ。通常の本番ビルドでは UI も記録も無い(`hooks/usePlaytestLog.ts` の定数で分岐し、バンドルから落とす)。
- **記録(端末内の `localStorage`、キー `bb-playtest-v1`、最大 600 件のリングバッファ。外部送信なし・個人情報なし)**:
  - 打撃 1 球ごと: 球種・D・着弾点・予告モード・難易度/アシスト、**スイングの入力種別(touch-release / touch-second / button / mouse / key)・離した時刻(リリースからの ms)・判定時刻 `atMs`・`dtMs`(= atMs − D)・素のカーソル・有効カーソル・`assistK`・カーソルとボールの距離(楕円正規化 d と px)・指の総移動量**、結果(種別・インプレー結果・打席結果・接触したか)。スイングしなかった球は「見逃し」とその着弾がゾーン内か。
  - 投球 1 球ごと: 狙い・着弾・ゲージの停止時刻と誤差 `errMs`・質・結果。
  - 共通: セッション ID、端末情報(`innerWidth/Height`・`devicePixelRatio`・`pointer: coarse`・`visualViewport.scale`・UA)、飛行中の fps(rAF の間隔の中央値・p95・落ちたフレームの割合)。
  - 起動時 1 回: `renderer.info.render.calls` と三角形数(`StageHandle.stats()`)。
- **取り出し(タイトルの「試遊ログ」)**: 要約表(打席数・打率・コンタクト率・ストライクを振る率・ボールを振る率・離す時刻の平均と SD・距離の中央値 px・ナイス率)、「コピー」(JSON を `navigator.clipboard`)、「ダウンロード」(`.json`)、「共有」(Web Share が使えれば)、「消去」。画面が縮小表示されている疑い(`innerWidth ≥ 900` かつ `pointer: coarse`)を警告する(試遊ページに viewport meta が無い問題の検出。調査 batting.md #10)。
- **診断の使い方**: 人間が 20 打席(約 60 球)遊んでログを渡す → `summarize(records)` の出力で「打てない原因」を切り分ける(下表)。

| 症状(ログの値) | 疑う原因 | 打つ手 |
| --- | --- | --- |
| 離す時刻の平均 `dtMs` が +80ms 以上 | 到達の知覚の偏り・遅延補正の不足 | 遅延補正(70ms)の見直し、リングの見せ方 |
| `dtMs` の SD が 100ms 以上 | リズムが取れない(合図が弱い) | リングの太さ・音・球速 |
| 距離の中央値が 60px 以上 | カーソルが間に合わない・ロックオンが弱い | ロックオン強度・ドラッグの感度 |
| 離した入力が `touch-second`/`button` ばかり | 1 本指の「離す=スイング」が使われていない | チュートリアルの見直し |
| ボールを振る率が高い | 予告(ゾーン内外)が読めていない | 予告の見せ方 |
| fps の p95 が 33ms 超 | 描画負荷 | 描画予算(pixelRatio・影・メッシュ統合) |

#### 4-4. 実機 fps・draw call の計測(P1 の可否判断)

- 計測: (1) `StageHandle.stats()` で draw call・三角形数(起動時+各投球の最初のフレーム)、(2) `hooks/useFramePerf` で飛行中の rAF 間隔(中央値・p95)。いずれも試遊ログに入る。
- **P1(顔・個性・走者の3D化)へ進む条件(出発値。ゲート2でユーザーが判断)**: ユーザーの実機で、打撃の飛行中の fps の中央値 ≥ 55、p95 のフレーム時間 ≤ 25ms、draw call ≤ 400(v2 の推定は約 350+影)。満たさなければ P1 は先に描画予算(メッシュ統合・影の対象を絞る・`pixelRatio` の見直し)を作業とする。

### 5. 契約(`types/`・`WORLD_PARAMS`・主要な関数)

`types/` は並列実装の契約で、**ステップ V0 で凍結**する。並列中の不足は編集せず完了報告で上申する(orchestrator がウェーブ間で直列に反映する)。

**`types/batting.ts`**: `AssistParams`(上の表の列。`preview: "exact" | "fade"`)、`SwingInput.assistK?: number`(省略 = 0)、`SwingMeta = { input: "touch-release" | "touch-second" | "button" | "mouse" | "key"; rawCursor: ZonePoint; eventMs: number; fingerMovedPx: number }`、`ContactFeedback = { dx: number; dy: number; d: number; band: "center" | "near" | "edge" | "scrape" | "miss" }`。

**`types/pitch.ts`**: `PitchQuality = "nice" | "good" | "normal" | "miss"`、`PitchCommand = { kind; aim: ZonePoint; quality: PitchQuality }`、`CpuPitchChoice = { kind; cell: CourseCell }`(`chooseCpuPitch` の戻り)、`PitchFlight.quality: PitchQuality`。

**`types/game.ts`**: `PlaybackSpeed.humanWindupMs: number`(通常 280 / fast 20)。`cpuWaitMs` は通常 550。

**`types/scene.ts`**(`SceneFrame` の追加。`aim`(セルのハイライト)は削除し `guide` に置き換える):
- `guide: { visible: boolean; mode: "exact" | "fade" | "reticle"; position: Vec3; markerRadius: number; fadeRadius: number; alpha: number; ring: { visible: boolean; radius: number; tone: "preview" | "gauge"; glow: number }; spread: { visible: boolean; radius: number } }`(打撃=予告、守備=照準+散布円。リングは同じ描画部品)。
- `feedback: { visible: boolean; tone: "swing" | "pitch"; from: Vec3; to: Vec3; alpha: number }`(位置ずれ・狙いと着弾の重ね表示)。
- `cursor` に `raw: { visible: boolean; position: Vec3 }`(指の素のカーソルの淡い印。有効カーソルと離れているときだけ見せる)。
- `ball` に `rotation: Rot3`・`halo: number`(0〜1)。`ball.scale` は飛行中も 1 以上(視認性)。
- `BatPose.lengthScale: number`(既定 1)。

**`types/stage.ts`**: `StageHandle.stats(): { drawCalls: number; triangles: number } | null`。

**`types/sound.ts`(新規)**: `SfxCue`(上の一覧)、`SfxEvent = { atMs: number; cue: SfxCue; gain: number }`、`HapticCue`。**`types/telemetry.ts`(新規)**: `PlaytestRecord`(打撃/投球の2種の判別共用体)、`PlaytestSummary`。

**`types/view.ts`**: `GameView.difficulty`・`GameView.assist: AssistParams`(`assistFor(difficulty)` の値)、`pitcher.repertoire` の各要素に `speedKmh: number`・`arrow: "none" | "right" | "left" | "down" | "down-right" | "down-left"`。

**`WORLD_PARAMS` の追加・変更(V0 で値まで入れる)**:
- `battingCameraPortrait`: position `(0, 1.75, 2.6)`・target `(0, 0.55, −18)`。
- `actors.batter`: `portraitX −0.75`、`portraitScale 0.70`、`portraitBatScale 1.45`(横長は 0.92・−0.8・1.0 のまま。縦横比の補間 `k` で混ぜる)。
- `framing.fit.pitching`: `defaultHalfWidthTan 0.25`・`maxHalfWidthTan 0.65`・`defaultSafeArea { top 0.1837, bottom 0.846 }`(守備の操作バーが約 130px になる前提)。
- `ball`: `minScreenDiameterRatioFlight 0.0175`、`halo { scale 1.9, opacity 0.35 }`、`spin`(球種ごとの軸と角速度の表)、`shellMinPx 2`。
- `guide`: `previewRing { startRadius 0.30, endRadiusRatio 1.25 }`、`dot { radius 0.04 }`、`fadeInMs 120`、`gaugeRing { startRadius 0.40, endRadius 0.12, afterRatio 0.4 }`、`feedbackMs 900`、`resultOverlayMs 700`。
- `fx`: `contactPunch { ms 140, fovScale 0.96, shake 0.012 }`、`hitStop { justMs 60, strongMs 40 }`。
- `telop`: `inPlayMs 900, foulMs 520, swingMissMs 520, takeMs 380, afterglowMs 120`。バナーの区間(`banner { hitMs 900, homerunMs 1600, strikeoutMs 1000, walkMs 900, justMs 700 }`)。

**`BATTING_PARAMS` の追加**: `aimGraceMs 120`、`earlyReleaseGuardMs 200`(他は v2 のまま。「動かさない値」は v2 の一覧を継承)。**`PITCH_PARAMS` の追加**: `gauge { ringMs 900, graceMs 300, windows { nice 40, good 90, normal 160 }, sigmaScale { nice 0.35, good 0.65, normal 1.0, miss 1.7 }, missPull { x 0, y 0.15, ratio 0.6 }, aimLimit 1.67 }`。

**主要な関数のシグネチャ(実装は担当ステップ)**:
- `model/batting/assist.ts`: `ASSIST_TABLE`・`assistFor(difficulty): AssistParams`(V0)、`lockOnCursor({ raw, landing, progress, assist }): { cursor: ZonePoint; k: number }`、`previewCenterOf(flight, assist): ZonePoint`(`fade` の決定論のずれ)、`qualityScaleOf(k, assist): number`(V1)。
- `model/pitch/gauge.ts`: `pitchQualityOf(errMs): PitchQuality`、`sigmaScaleOf(quality): number`、`gaugeErrorMs({ startedAtMs, stopAtMs, latencyMs, timeScale }): number`、`gaugeRingAt(elapsedMs, timeScale): { radius: number; glow: number; expired: boolean }`(V3)。`deliverPitch` は `command.quality` から σ を決める。
- `model/world/sequence/pitch-input.ts`: `reducePitchInput(state, event, ctx): { state; effect }`(`idle | aiming | gauge | throwing` の状態機械。V6)。
- `model/world/sequence/session.ts`: `SwingRecord` に `meta?: SwingMeta` を持たせ、`recordSwing(current, seq, input, meta?)`(V5)。
- `model/world/sequence/{banner,contact-feedback,ball-look,guide,hit-fx}.ts`(V7): `bannerFor`、`contactFeedbackOf`、`ballSpinAt(kind, tMs): Rot3`・`ballHaloAt`、`guideFrameAt(...)`・`previewRingAt(durationMs, tMs)`、`hitFxAt(sinceContactMs, intensity, reducedMotion)`。
- `model/world/sound/{cues,sfx-plan,haptics}.ts`(V8): `SFX_RECIPES`、`sfxEventsOf(plan, flight)`、`gaugeTicksOf(startMs)`、`hapticFor(cue)`。
- `model/world/motion/batter-layout.ts`(V2): `batterRootFor(aspect)`(位置・scale)、`batLengthScaleFor(aspect)`、`batTipX(root, lengthScale, sweepYaw)`。
- `model/telemetry/*`(V12): `appendRecord`(リングバッファ)、`summarize(records)`、`toCsv(records)`、`fitBotParams(records)`。`model/prefs/prefs.ts`: `parsePrefs`・`DEFAULT_PREFS`(`sound`・`haptics`・`tutorialSeen`)。`model/tutorial/steps.ts`: `tutorialStepsFor(role)`・`nextTutorialStep`。
- `audio/engine.ts`(V11): `createAudioEngine(options): { unlock(): void; play(cue, gain?): void; setMuted(muted): void; dispose(): void }`(`AudioContext` は注入可能。単体テストは偽のコンテキスト)。
- `hooks`: `useSfx`・`useHaptics`・`usePreferences`・`usePlaytestLog`・`useFramePerf`(V16)、`usePitchingControls`・`usePitchKeyboard`(V18)。`usePointerInput`・`useBattingControls`・`usePitchFlight`・`useKeyboardInput` は V17 が変更。
- `ui` の props 契約(V14 と V20 の取り合い): `GameLayout` は `selection`・`onSelectCell`・`CourseGrid` 関連を削除し、`pitch: { selectedKind; onSelectKind; action: { label: "投げる" | "とめる!"; enabled: boolean; onAction: () => void }; inputState }`・`sound: { muted; onToggle }`・`onOpenHelp`・`banner: BannerView | null`(`StageView` へ)・`tutorial`/`playtest` スロット(V15 の部品)を追加する。

### 6. 変更ファイル(概要)

パスは `sample-app/frontend/src/features/baseball/` 相対(E2E・ドキュメントを除く)。担当は「実装ステップ」の V 番号。

| 区分 | ファイル | 内容 | 担当 |
| --- | --- | --- | --- |
| 変更 | `types/{batting,pitch,game,scene,stage,view}.ts`、新規 `types/{sound,telemetry}.ts` | 契約(§5) | V0 |
| 変更 | `model/world/space/params.ts`、`model/batting/params.ts`、`model/pitch/params.ts`、新規 `model/batting/assist.ts`(表と `assistFor`) | 定数の凍結 | V0 |
| 変更/新規 | `model/batting/{assist,contact,resolve-pitch}.ts`(+test) | ロックオン・予告の中心・質の補正 | V1 |
| 変更/新規 | `model/world/camera/{rig,project}.ts`(+test)、新規 `model/world/motion/batter-layout.ts`(+test) | 縦長の構図・守備の同一構図・打者のレイアウト・バット到達 | V2 |
| 変更/新規 | `model/pitch/{delivery,params}.ts`、新規 `model/pitch/gauge.ts`、`model/game/{reducer,view,test-fixtures,launch-params}.ts`、`model/cpu/cpu-pitcher.ts`(+test) | 投球コマンドの移行・ゲージ・質・view・windup | V3 |
| 変更 | `model/cpu/{cpu-batter,difficulty}.ts`(+test)、`model/game/balance.test.ts`(基準は不変) | CPU 打者の位置・質への反応 | V4 |
| 変更 | `model/world/sequence/{input-route,arrival,session}.ts`(+test) | 離す=スイング・到達通知の保留・スイング記録の meta | V5 |
| 新規 | `model/world/sequence/pitch-input.ts`(+test) | 投球入力の状態機械 | V6 |
| 新規 | `model/world/sequence/{banner,contact-feedback,ball-look,guide,hit-fx}.ts`(+test) | 演出の純関数 | V7 |
| 新規 | `model/world/sound/{cues,sfx-plan,haptics}.ts`(+test) | 音・触覚の対応表 | V8 |
| 変更 | `render/{markers,look}.ts`(+test) | 予告・リング・照準・ハロー・縫い目・位置ずれ | V9 |
| 変更 | `render/{stage,pose-apply,test-fixtures}.ts`(+test) | `stats()`・バット長・フレーム適用 | V10 |
| 新規 | `audio/{engine,voices,index}.ts`(+test) | Web Audio エンジン | V11 |
| 新規 | `model/telemetry/*`、`model/prefs/prefs.ts`、`model/tutorial/steps.ts`(+test) | ログ・設定・説明の純粋ロジック | V12 |
| 新規/変更 | `ui/{EffectBanner,StageView,StageTelop}.tsx`+CSS | バナー・ピル・フィードバック表示 | V13 |
| 変更/削除 | `ui/{GameLayout,PitchingControls,PitchKindButtons,TitleScreen,SwingControls,ScoreHud}.tsx`、`ui/CourseGrid.tsx`(削除)、`ui/baseball-stage.css`、`ui/baseball.css` | 操作バー・タイトル・音ボタン | V14 |
| 新規 | `ui/{Tutorial,PlaytestPanel}.tsx`+CSS | 説明・試遊ログ画面 | V15 |
| 新規 | `hooks/{usePreferences,useSfx,useHaptics,usePlaytestLog,useFramePerf}.ts` | 設定・音・触覚・ログ・fps | V16 |
| 変更 | `hooks/{usePointerInput,useBattingControls,usePitchFlight,useKeyboardInput}.ts` | 離す=スイング・有効カーソル・保留 | V17 |
| 新規 | `hooks/{usePitchingControls,usePitchKeyboard}.ts` | 投球入力 | V18 |
| 変更 | `model/world/sequence/{frame,play-plan,telop}.ts`(+test)、`sequence/{world-consistency,batter-screen}.test.ts` | 合成(予告・リング・ボール・打者・フィードバック・バナー・ヒットストップ) | V19 |
| 変更 | `hooks/{useStageDirector,useGameStage,useGame,useStage3d}.ts`、`ui/{GameScreen,BaseballGamePage}.tsx` | 統合 | V20 |
| 新規/変更 | `model/sim/{human-bot,human-game,pitch-bot}.ts`、`model/sim/*.test.ts`、`model/batting/{params,result-table,batted-ball,assist}.ts` の値、`model/cpu/difficulty.ts` の値 | ボットと帯・調整 | V22・V23 |
| 変更 | `sample-app/frontend/e2e/baseball.spec.ts`、`sample-app/README.md`、`docs/process/sample-app-dev.md` | E2E・ドキュメント | V24 |
| 変更 | 「調整可」の `WORLD_PARAMS`、`render/*` の見た目の値、`ui/*.css` | 見た目の調整 | V25 |
| 不変 | backend、`@sample-app/shared`、`routes/`、`App.tsx`、`ci.yml`、ホーム(`/`)・`home.spec.ts`、reducer の乱数消費の順序 | — | — |

#### DBスキーマ設計

なし(DB の変更は無い。`db-designer` への委譲は行わない)。

#### フロントエンド構成

既存 feature `features/baseball/` への追加で、構成判断は次の 1 点だけ: **新セグメント `audio/`**(`render/` と同格の副作用アダプタ。Web Audio)。理由は、`render/` は「three だけ・DOM と GL に触れるのは `stage.ts` だけ」という既存決定([[frontend-3d-three-in-render-segment]])があり、`AudioContext` をそこへ入れると境界が崩れるため。`audio/` は `types/` だけを import し、何をいつ鳴らすかの表は `model/world/sound/` に置く(つなぐのは `hooks/` だけ)。**この環境では `frontend-designer` サブエージェントを呼び出せなかったため、構成案は本書で決めた**。`design-reviewer` がセグメント境界の妥当性を確認すること。構造検査(grep)に追加するもの: `AudioContext`・`webkitAudioContext` が `audio/` だけ、`audio/` が `types/` 以外を import しない、`model/` が `audio/` を import しない。

### 7. 構図の手計算(根拠。式と出典)

出典は `model/world/camera/{rig,project}.ts`(ピンホール投影 + `lift`)と `space/params.ts`。**投影の式**: カメラ位置 C・注視 T から前方 f = normalize(T − C)、右 r = (1,0,0)、上 u = r × f。点 P で rel = P − C、depth = rel·f、`x_px = W/2 · (1 + rel·r / (depth · h))`、`y_px = (0.5 − 0.5 · (rel·u) / (depth · tanV) − lift) · H`(h = 水平半幅 tan、tanV = h / aspect)。縦長の姿勢 C = (c, 1.75, 2.6)・T = (c, 0.55, −18) で f = (0, −0.05815, −0.99831)、u = (0, 0.99831, −0.05815)。

**v2 の計算値の再現(式の検証)**: 390×844・打撃。h = 0.25(`fit` の既定)、tanV = 0.541。lift = 0.5 + cHead·σ − (top + headGap) = 0.5 − 0.0846 × 0.9242 − (0.1837 + 0.019) = **0.2191**(σ = aspect/(2h) = 0.9242。cHead は投手の頭頂の係数 −0.0846 = v2 の R3 修正後の値)。ゾーン中心 (0, 0.72, 0.03): depth 2.6256 → 水平 **297.1px/m**(= 195 / (0.25 × 2.6256))、`y = 498.2px`。ゾーン枠は幅 = 2 × 0.26 × 297.1 = **154.5px**・y 410〜585(**175px**)。これは v2 の実測(155.5×174.5、y 410〜585。テストレポート)と ±1.5px で一致する。

**v3 の値(c = 0)**:

| 要素 | 計算 | 値(390×844) |
| --- | --- | --- |
| ゾーン枠 | x = 195 ± 77.3(c = 0 でゾーンが中央)、y は v2 と同じ | **x 117.7〜272.3、y 410〜585**(155×175) |
| 投手の頭頂 | (0, 2.30, −18.4): depth 20.93、ndcY = 0.1563 → y = (0.5 − 0.0782 − 0.2191) × 844 | **y ≈ 171**(HUD 下端 155 の 16px 下)、x = 195(中央)。足元 y ≈ 247(身長 約 76px) |
| リリースの位置 | (−0.3, 1.65, −18.1): depth 20.67、ndcX = −0.0581 → x = 183.7、y = 195.4 | **(184, 195)**(v2 は x 193) |
| ボール径(真) | 0.2m を ppm で換算。リリース 7.5px、ゾーン面 59.4px | 7.5 → 59.4px |
| ボール径(表示。最小径 0.0175 × 844 = 14.8px) | 倍率 = 14.8 / 7.5 ≈ 1.96(リリース時の dist 20.7m)。径 14.8px を下回る D−655ms まで | 14.8px 以上(連続・単調) |
| 予告のリング | 半径 0.30m → 0.125m を 297.1px/m で換算 | **89px → 37px**(ゾーン面。ボールの半径 29.7px+25%) |
| 予告の点 | 半径 0.04m | 半径 12px(径 24px) |
| カーソル(ミート能力 56) | rx = 0.5 + 0.004 × 56 = 0.724、ry = 0.6 × rx = 0.434(ゾーン単位) × (77.3, 87.2 px) | **112 × 76px**、中心 (195, 497.5) |
| 打者の頭(scale 0.70・x −0.75) | 頭の中心 (−0.75, 1.07, 0.05): depth 2.585、ndcX = −1.160 → **x = −31.3**、y = 397。頭の半径 = 0.50 × 0.70 = 0.35m × 301.7px/m = **105.6px** | 頭は x −137〜**74**・y 291〜503。**画面内の頭は x ≤ 74px(19%)** |
| 打者の胴 | 半径 0.31 × 0.70 × 1.05 ≈ 0.228m = 69px、中心 x = −31 | 右端 **x ≈ 38px** |
| 打者の足元 | (−0.75, 0, 0.05): depth 2.6475、ndcY = −1.116 → y = 708 | y ≈ 708(操作バー y 663 の下に隠れる。v2 と同じ) |
| バット先端(接触) | 先端 x = x_b + 1.025 × (0.70 × 1.45) × cos(0.1) = −0.75 + 1.035 | **+0.285m**(ゾーン右端 0.26m の外)。画面 x ≈ 280px |

**打者の占有の比較**: v2 は頭が x 0〜212(54%)・全身の高さ約 70%。v3 は頭が x ≤ 74(19%)で高さは y 291〜708(49%)。ボールの通り道(x 118〜273)は打者の頭の右端(74px)と 44px 以上離れる(v2 は内角の球が頭の縁の内側を落ちていた)。

**守備の操作バー**: 球種チップ 52px+上下余白+ティッカー 52px ≈ 130px。空き領域の下端 = (844 − 130) / 844 = 0.846。5×5 格子の下端(係数 0.5204): y = 0.5 + 0.5204 × 0.9242 − 0.2191 = 0.762 → **643px**(バー上端 714px の 71px 上)。`hReq = 0.46209 × (0.5204 + 0.0846) / (2 × (0.846 − 0.008 − 0.1837 − 0.019)) = 0.2198 < 0.25` なので tan は既定の 0.25 になり、**守備のゾーンは打撃と同じ 155×175px**になる。

**390×664(ツールバーあり)**: 打撃は空き領域の上 155px・下 181px とすると `hReq = 0.5873 × 0.5305 / (2 × 0.467) = 0.334` → tan ≈ 0.33、lift ≈ 0.173、ゾーン幅 ≈ 116px(v2 の実測は 125.7px で、実際のオーバーレイの高さが想定と異なる)。**この画面の数値は「実装時に実測して確定」**(受け入れは下限で書く)。

## 実装ステップ

実装順のチェックリスト。**同じファイルを複数ステップで触らない**(例外: V0 が型・定数を先に入れる `params.ts`・`assist.ts` を後続が引き継ぐ。「担当ファイル」に明記)。並列欄のステップ同士は同時に dispatch できる(ファイル所有が重ならず、依存も無い)。実装者は担当ファイル以外を編集しない。`types/` は V0 で凍結し、型の変更が必要になったら編集せず報告する。

| ウェーブ | ステップ | 並列 |
| --- | --- | --- |
| 1 | V0 | — |
| 2(純粋ロジック) | V1, V2, V3, V4, V5, V6, V7, V8 | 並列可(8。V0 の型・定数だけに依存) |
| 3(部品・UI) | V9, V10, V11, V12, V13, V14, V15 | 並列可(7。V0 のみに依存。V13・V14 は表示の文言・props の契約に依存し、ウェーブ 2 の関数は import しない) |
| 4(接続・合成) | V16, V17, V18, V19 | 並列可(4。V16 は V8・V11・V12、V17 は V1・V5、V18 は V3・V6、V19 は V1・V2・V3・V7 の後) |
| 5 | V20 | 直列(V9〜V19 の後) |
| 6 | V21 | 直列(全体の緑。ここで**人間の試遊ビルド T1**) |
| 7(検証・調整) | V22, V23, V24, V25 | 並列可(V22・V23 は V21 と T1 の後) |

**全体の typecheck の扱い**: V0 で `PitchCommand`・`SceneFrame`・`StageHandle`・`PlaybackSpeed` の型を変えるので、**V0〜V19 の間は全体の typecheck が緑にならない**(担当外のファイルでエラーが残る)。各ステップの完了条件は「`cd sample-app && npm run typecheck` の出力を担当パスで絞り込み、担当ファイル起因が 0 件(他ステップ起因のエラーは完了報告に列挙)」。V0 は型変更で壊れる箇所の一覧(ファイル・理由・解消ステップ)を完了報告に書く。**全体の lint・typecheck・build・単体テストの緑は V21 の完了条件**。この間のコミットは出荷しない。

**共通の完了条件**: 担当ファイルが `cd sample-app && npx eslint <担当パス>` で 0 件。型は上記。テストがあるステップは `cd sample-app/frontend && npx vitest run <担当パス>` が成功。コミット・共有メモリへの書き込みは並列 dispatch 中は行わない(orchestrator が集約)。**lint の注意([[sample-app-lint-random-and-index-access]])**: `Math.random` 禁止(シード付き mulberry32・`seq` から導く決定論)、変数添字の `arr[i]` 禁止(`.at`/`Map`/`for...of`/`switch`)、`// TODO` 禁止、`toSorted`/`with` 禁止(ES2022)、テストでリテラル同士の assertion 禁止・小数の `toBe` 禁止(`toBeCloseTo`)・ネスト関数 4 段禁止、定数オブジェクトは `DeepReadonly<typeof PARAMS>`、補間は `a*(1−k) + b*k`。

### ウェーブ 1

- [ ] **V0: 契約と定数の凍結**(直列)
  - 依存: なし。担当ファイル: `types/{batting,pitch,game,scene,stage,view}.ts`、新規 `types/{sound,telemetry}.ts`、`model/world/space/params.ts`、`model/batting/params.ts`、`model/pitch/params.ts`、新規 `model/batting/assist.ts`(型の import・`ASSIST_TABLE`・`assistFor` だけ。関数は V1)。
  - やること: 「契約」節のとおり型を定義し、`WORLD_PARAMS`・`BATTING_PARAMS`・`PITCH_PARAMS` に値まで入れる(カメラ x 0・打者 `portraitX/portraitScale/portraitBatScale`・`fit.pitching`・`ball`/`guide`/`fx`/`telop`/`banner`)。`launch-params.ts` の速度値は V3 の担当(型だけここ)。型の変更で壊れる箇所を完了報告に一覧する(`PitchCommand` を使う `GameScreen`・`useGameStage`・`reducer`・`cpu-pitcher`・テスト、`SceneFrame.aim` を使う `frame.ts`・`markers.ts`・`test-fixtures.ts` など)。
  - 完了条件: 担当ファイルの lint 0 件・typecheck 起因 0 件。`types/` が他セグメントを import していない。値を参照する既存テスト(`WORLD_PARAMS`・`BATTING_PARAMS`)がリテラルで固定されていないことを確認し、落ちるものを担当ステップに申し送る。

### ウェーブ 2(純粋ロジック。8 並列)

- [ ] **V1: アシスト(ロックオン・予告・質の補正)**
  - 依存: V0。担当ファイル: `model/batting/assist.ts`(+test)、`model/batting/contact.ts`(+test)、`model/batting/resolve-pitch.ts`(+test)。
  - やること: `lockOnCursor`・`previewCenterOf`・`qualityScaleOf` を実装。`measureContact` が `swing.assistK` で `q` を `qualityScaleOf` 倍する(`assistK` 省略は 0 で v2 と同値)。
  - 完了条件: 単体テスト — `lockStrength 0` で恒等、`progress < rampStart` で素のカーソル、`k ∈ [0,1]`・`progress` と `dist` に対して単調、`captureRadius` の外で `k = 0`、有効カーソルは常に raw と landing の線分上、`fade` の中心が決定論(同じ `seq` で同値)かつ `|ずれ| ≤ fadeJitter` で円が真の着弾を含む、`assistK` 省略時に v2 と同じ `measureContact` の結果(既存の contact テストが無改変で通る)。
- [ ] **V2: 構図(カメラ・打者のレイアウト・バット到達)**
  - 依存: V0。担当ファイル: `model/world/camera/{rig,project}.ts`(+test)、新規 `model/world/motion/batter-layout.ts`(+test)。
  - やること: `rig.ts` の式・定数参照を v3 の姿勢・`fit.pitching` に合わせる(式は変えず、`WORLD_PARAMS` の値から導く構造を保つ)。`batter-layout.ts`: `batterRootFor(aspect)`(`portraitBlendAt` で x・scale を補間)・`batLengthScaleFor`・`batTipX`。テストを v3 の数値に更新する。
  - 完了条件: 単体テスト — 390×844 の打撃・守備でゾーン矩形が x 117.7〜272.3・y 410〜585(±3px)、幅×高 ≥ 150×170。打者の頭の右端 ≤ 90px・胴の右端 ≤ 60px、頭の中心 x が負(画面の左端寄り)。**接触時のバット先端 x ≥ +0.28(縦長)・横長は v2 と同値**。守備の格子の下端が空き領域の下端(0.846)から 8px 以上上。高さ 560〜900px の走査で、ゾーン/格子が下のオーバーレイに掛からない(高さ 640 以上で投手の頭が HUD に掛からない)。`aspect ≥ 1.0` の横長の姿勢は v2 と厳密に一致(回帰)。診断の案 B' の検算テストは新姿勢の検算に置き換える。
- [ ] **V3: 投球モデル(コマンド移行・ゲージ・質・view・windup)**
  - 依存: V0。担当ファイル: `model/pitch/{delivery,params}.ts`(+test)、新規 `model/pitch/gauge.ts`(+test)、`model/game/{reducer,view,test-fixtures,launch-params}.ts`(+test)、`model/cpu/cpu-pitcher.ts`(+test)。
  - やること: `deliverPitch` が `command.aim`(連続)と `command.quality` から σ を決める(乱数の消費数は不変。失投の引き寄せは出力の計算だけ)。`gauge.ts` を実装。`chooseCpuPitch` が `CpuPitchChoice` を返し、reducer がセル中心を `aim`・`quality: "normal"` にして `launchPitch`。`view.ts` が `difficulty`・`assist`(`assistFor`)・チップ用の `speedKmh`/`arrow` を出す。`launch-params.ts` の速度値を更新(通常 `cpuWaitMs 550`・`humanWindupMs 280`、fast 20/20)。
  - 完了条件: 単体テスト — `pitchQualityOf` の境界(40/90/160ms ちょうど・負・NaN)、`sigmaScaleOf` が質に対して単調非減少、`deliverPitch` の乱数消費が 24 個のまま・CPU の既存の決定論テストが構造を保って通る(期待値は再導出)、失投で着弾が狙いより `(0, 0.15)` 側へ寄る(平均)、`gaugeRingAt` が `elapsed = ringMs` で `radius = endRadius`・単調減少・`graceMs` 後に `expired`、`aim` が ±1.67 に収まる。`balance.test.ts` は CPU 打者の変更(V4)の後に確認。
- [ ] **V4: CPU 打者の反応(位置・質・連投)**
  - 依存: V0。担当ファイル: `model/cpu/{cpu-batter,difficulty}.ts`(+test)、`model/game/balance.test.ts`(基準は不変。落ちるなら CPU 側を調整)。
  - やること: 「CPU 打者との整合」の式を実装し、`DifficultyParams` に `qualitySensitivity` を追加。`cursorSigma`・`timingSigmaMs`・`zoneSwingRate` の出発値を、CPU 同士の打率 .23〜.29・三振率・四球率の基準を保つよう調整する。
  - 完了条件: 単体テスト — ナイスは ふつう より cursorSigma の実効値が大きい(`hard` では差が小さい)、縁(extent 1.0)は中央より大きい、失投は振る確率が上がる(上限あり)、`quality: "normal"` かつ extent ≤ 0.5 で v2 と同値。`balance.test.ts` が**基準を変えずに**成功。難易度の順序(ノイズ easy > normal > hard)を維持。
- [ ] **V5: 入力ルート(離す=スイング・保留・スイング記録)**
  - 依存: V0。担当ファイル: `model/world/sequence/{input-route,arrival,session}.ts`(+test)。
  - やること: `routeStageRelease` を「タッチ1本目で `aiming` だった指の離し → `swing-release`(`earlyReleaseGuard` 内は `none`)」に変更し、タップ判定(`isTapGesture`・`TAP_*` 定数)を削除。`arrivalDue` は `aiming`(指が下りている)のとき D + `lateCutoffMs` + `aimGraceMs` まで保留する純関数にする(`holdArrival`/`TAP_ARRIVAL_HOLD_MS` の方式を置き換える)。`session.ts` の `SwingRecord` に `meta?: SwingMeta` を持たせ、`recordSwing` が受ける(試遊ログ用。1つの `seq` につき最初の1回だけ、の規則は不変)。
  - 完了条件: `input-route.test.ts` が v2 の判定表(§3)を v3 に更新し**全組み合わせを走査** — (1) 2本目以降のタッチは `swing-here`/`ignore` のみで `skip` にならない、(2) `holding` が真の 1本目は必ず `skip`(離しは `none`)、(3) スキップに使った指の離しは `none`、(4) `swingReady` が偽の離しは `none`、(5) 誤爆ガード内は `none`、(6) マウス/ペンの離しは `none`。`arrival.test.ts`: `aiming` 中は D+250+120 まで通知されず、離した後は即通知、`aiming` でなければ v2 と同じ。`session.test.ts`: `meta` が保たれ、既存の性質(最初の1回だけ・`planSwingOf` の捨て判定)が不変。`isSkipKey` は不変。
- [ ] **V6: 投球入力の状態機械**
  - 依存: V0。担当ファイル: 新規 `model/world/sequence/pitch-input.ts`(+test)。
  - やること: `reducePitchInput(state, event, ctx)`(`idle` → `aiming` → `gauge` → `throwing`)。入力: 押す・動く・離す(タッチは相対ドラッグ、マウスは絶対追従、クリックで確定・停止)・ボタン(確定/停止の共通操作)・キー・tick(自動投球の期限)・cancel。副作用は `effect`(`start-gauge`・`throw`)で返す。`holding`・`enabled` が偽なら無視(スキップは別ルート)。
  - 完了条件: 表の全組み合わせを走査する単体テスト — 離し=確定+ゲージ開始、ゲージ中の押す=停止+投球(質は `gaugeErrorMs` から)、`ringMs + graceMs` で自動投球(失投)、ゲージ中の動きは狙いを変えない、`aimLimit` を超えない、キー・ボタンでも同じ遷移、`timeScale` で期限が縮む、`holding` 中は何も起きない。
- [ ] **V7: 演出の純関数**
  - 依存: V0。担当ファイル: 新規 `model/world/sequence/{banner,contact-feedback,ball-look,guide,hit-fx}.ts`(+各 test)。
  - やること: `bannerFor`(結果・落下点・タイミング → 種類・文言・色・区間)、`contactFeedbackOf`(カーソルとボールの差 → 帯)、`ballSpinAt`・`ballHaloAt`、`guideFrameAt`・`previewRingAt`(打撃の予告+リング、守備の照準+散布円+ゲージのリング、結果の重ね表示)、`hitFxAt`(ズーム・シェイク・ヒットストップ長)。`reducedMotion` は入力で受ける。
  - 完了条件: 単体テスト — `bannerFor` が全 `kind × inPlay.result × plate` の組を網羅(バナーなしは `null`)、リング半径が `t = 0` で startRadius・`t = D` で endRadius(±1e-9)・単調減少・D 以降は保持、`exact` の点が `flight.landing` に厳密一致、`ballSpinAt` が球種ごとに異なりフォークの角速度が最小、`hitFxAt` が `sinceContactMs` に対して連続・`reducedMotion` で 0、`contactFeedbackOf` の帯が中心から外れるほど悪化(単調)。
- [ ] **V8: 音・触覚の対応表**
  - 依存: V0。担当ファイル: 新規 `model/world/sound/{cues,sfx-plan,haptics}.ts`(+各 test)。
  - やること: `SFX_RECIPES`(各 `SfxCue` のレシピ = オシレータ/ノイズ/フィルタ/エンベロープのデータ表。ノイズは決定論の PRNG 指定)、`sfxEventsOf(plan, flight)`(リリース・到達・スイング・接触・テロップ開始・歓声)、`gaugeTicksOf`、`hapticFor`。
  - 完了条件: 単体テスト — 全 `SfxCue` にレシピがある、各レシピの長さ ≤ 2.5s・ゲイン ≤ 1・周波数が 20〜12000Hz、`sfxEventsOf` が結果種別(ボール・ストライク・空振り・ファウル・ヒット・ホームラン・三振・四球)ごとに期待する cue を `atMs` 昇順で返す(接触なしは打撃音なし)、ジャストはジャスト音、同じ入力で同じ結果(決定論)、`hapticFor` が 80ms の間引きに使える長さを持つ。

### ウェーブ 3(部品・UI。7 並列)

- [ ] **V9: render — マーカー(予告・リング・照準・ボール・位置ずれ)**
  - 依存: V0。担当ファイル: `render/{markers,look}.ts`(+`markers`・`look` の test)。
  - やること: `SceneFrame.guide`(点・fade の円・縮むリング(シアン/白〜ゴールド、線幅 3px)・照準・散布円)、`feedback`(十字・輪・線)、`cursor.raw`、`ball.rotation`/`halo`、縫い目(赤の半円弧 2 本)、殻の太さを画面で 2px 以上に保つ処理、旧 `aim`(セルのハイライト)の削除を実装。描画順は v2 の規則(ボール 12・輪郭 11.5・カーソル 11・オーバーレイ 10 以下)に新要素を割り当てる(予告の点・リングはカーソルより奥、ボールより奥)。`render/` は `types/` と `three` だけを import する。
  - 完了条件: 単体テスト(smoke)— 新要素の生成・可視の切替・破棄(リークなし)、ボールの縫い目が `rotation` に従う、リングの半径が `guide.ring.radius` に一致、ボールが `transparent`/`depthTest false` のまま、`glow` でリングの色が変わる。`import * as THREE`・`document`・`window` が無い。
- [ ] **V10: render — ステージ・ポーズ・統計**
  - 依存: V0。担当ファイル: `render/{stage,pose-apply,test-fixtures}.ts`(+関連 test)。
  - やること: `StageHandle.stats()`(`renderer.info.render`)、`pose-apply.ts` が `BatPose.lengthScale` をバットのグループに適用、`test-fixtures.ts` の `makeFrame` に新フィールドの既定値、`applyStage` が新フィールドを含むフレームを `applyMarkers` へ渡す(V9 の契約に合わせる)。
  - 完了条件: 担当 test 成功。`stats()` が破棄後 `null`。`window`/`document`/`matchMedia` を使うのは `stage.ts` のみ。
- [ ] **V11: audio — Web Audio エンジン**
  - 依存: V0。担当ファイル: 新規 `audio/{engine,voices,index}.ts`(+test)。
  - やること: `createAudioEngine`(`AudioContext` は注入可能。`unlock()` = 最初のユーザー操作で作成・`resume`・無音バッファ再生(iOS)、`play(cue, gain)` = レシピ(型は V0。レシピ本体は V8 の表を hooks が渡す、または `voices.ts` が受ける)から音を組み立てて再生、同時発音 8 まで、終了後に node を切断、`setMuted`、`dispose`)。ノイズバッファは mulberry32 で 1 回だけ生成。`audio/` は `types/` だけを import。
  - 完了条件: 偽のコンテキストで単体テスト — `unlock` 前は音が出ない・`play` が例外を投げない、ミュートで node を作らない、同時発音の上限、終了で切断(リーク 0)、`dispose` が冪等。`AudioContext` に触れるのは `audio/` のみ(grep)。
- [ ] **V12: telemetry・prefs・tutorial の純粋ロジック**
  - 依存: V0。担当ファイル: 新規 `model/telemetry/{record,ring-buffer,summary,export,fit-bot}.ts`、`model/prefs/prefs.ts`、`model/tutorial/steps.ts`(+各 test)。
  - やること: 記録の組み立て(`PlaytestRecord`)、リングバッファ(最大 600、古い順に捨てる、JSON の往復)、`summarize`(打率・コンタクト率・振る率・離す時刻の平均/SD・距離の中央値・ナイス率)、`toCsv`、`fitBotParams`、`parsePrefs`(壊れた値は既定値)、チュートリアルのカードと次ページの遷移・最初の 5 球ヒントの残り数。
  - 完了条件: 単体テスト — 600 件を超えると先頭が落ちる・JSON 往復で不変・不正な JSON は空、`summarize` を手計算のフィクスチャと一致、`toCsv` の列と行数、`fitBotParams` が既知の分布(平均 +50・SD 70 のフィクスチャ)を ±5% で復元、`parsePrefs` が欠損・型違いを既定値で補う。
- [ ] **V13: UI — 演出の表示(バナー・ピル・フィードバック)**
  - 依存: V0。担当ファイル: 新規 `ui/EffectBanner.tsx`+`ui/effect-banner.css`、`ui/{StageView,StageTelop}.tsx`。
  - やること: `EffectBanner`(種類別の斜めの帯・ホームランの全面フラッシュと紙吹雪(CSS)・`aria-hidden`・`pointer-events: none`・`prefers-reduced-motion` で動きを止める)、`StageView` のタイミングのピルを 2 行(ジャスト等+芯/かすり)にして位置ずれの文言を出す、守備のゲージ中のヒント文(「リングが ねらいに かさなったら タップ!」)と最初の数球のヒント、`data-banner`・`data-pitch-quality`・`data-input-state`・`data-guide` の `data-*` ミラー。バナーが出る間はテロップを出さない。
  - 完了条件: lint 0 件・typecheck 起因 0 件。`ui/` から `../model`・`../render` を import していない。バナーとピルが `pointer-events: none`。
- [ ] **V14: UI — 操作バー・タイトル・音ボタン**
  - 依存: V0。担当ファイル: `ui/{GameLayout,PitchingControls,PitchKindButtons,TitleScreen,SwingControls,ScoreHud}.tsx`、削除 `ui/CourseGrid.tsx`、`ui/baseball-stage.css`、`ui/baseball.css`。
  - やること: 「契約」の `GameLayout` の props 契約どおりに、守備の操作バーを「球種チップ(球速・矢印つき、76×52px)+ 操作ボタン(投げる/とめる!、96×52px)」に作り直す(高さ ≈ 130px、800px 未満で ≤ 140px)。`SwingControls` は縮小(ボタン 80px)。HUD にスピーカーボタンと「?」(あそびかた)、タイトルに音・振動の切替と「あそびかた」と(試遊ビルドだけ)「試遊ログ」への入口。`data-inset` 等の空き領域の印(v2 §4)は維持。
  - 完了条件: lint 0 件・typecheck 起因 0 件。`ui/` が `../model`・`../render` を import していない。守備の `bb-overlay__bottom` の高さを 390×844・390×745・390×664 で測った値を完了報告に書く(≤ 135 / ≤ 140 / ≤ 140px が目標)。ボタン・チップは 44px 以上。
- [ ] **V15: UI — チュートリアルと試遊ログ画面**
  - 依存: V0。担当ファイル: 新規 `ui/{Tutorial,PlaytestPanel}.tsx`+各 CSS。
  - やること: `Tutorial`(カード表示・「つぎへ/はじめる」・指のアニメーションは CSS・打撃/投球の 2 種、props のみ)。`PlaytestPanel`(要約表・コピー・ダウンロード・共有・消去・縮小表示の警告。props のみで、記録の取得・保存は `usePlaytestLog` が担う)。
  - 完了条件: lint 0 件・typecheck 起因 0 件。hooks を呼ばない(props のみ)。ボタン 44px 以上。

### ウェーブ 4(接続・合成。4 並列)

- [ ] **V16: hooks — 設定・音・触覚・ログ・fps**
  - 依存: V0, V8, V11, V12。担当ファイル: 新規 `hooks/{usePreferences,useSfx,useHaptics,usePlaytestLog,useFramePerf}.ts`。
  - やること: `usePreferences`(`localStorage`・`parsePrefs`)、`useSfx`(エンジンの生成・最初のユーザー操作で `unlock`・`sfxEventsOf` のイベントを時刻 `t` の区間で発火する `fire(prevMs, nowMs)`・ミュート)、`useHaptics`(`navigator.vibrate`・80ms の間引き・設定とリデュースモーション)、`usePlaytestLog`(`PLAYTEST_ENABLED` の判定・記録・要約・エクスポート。無効ビルドでは何もしない)、`useFramePerf`(rAF 間隔の収集)。全 effect に cleanup を付ける。
  - 完了条件: lint 0 件・typecheck 起因 0 件。`hooks/` から `three` を import していない。`PLAYTEST_ENABLED` が偽のとき `localStorage` に書かない。
- [ ] **V17: hooks — 打撃入力(離す=スイング・有効カーソル・保留)**
  - 依存: V0, V1, V5。担当ファイル: `hooks/{usePointerInput,useBattingControls,usePitchFlight,useKeyboardInput}.ts`。
  - やること: `usePointerInput` を `routeStagePointer`/`routeStageMove`/`routeStageRelease` の戻り値だけで分岐(`holding` を直接見ない)。1本目の指の `aiming` を ref で持ち、`usePitchFlight` に `isAiming()` を渡して到達通知の保留に使う。`useBattingControls` が有効カーソル(`lockOnCursor`。進行度は離した/押した時刻の経過÷D)を毎フレーム director へ、`swingNow` が `cursor = 有効カーソル`・`assistK` を渡す(`SwingRecord` の `meta` も)。`useKeyboardInput` は変更なし(`origin` の受け渡しのみ維持)。
  - 完了条件: lint 0 件・typecheck 起因 0 件。`usePointerInput` が `holding` を直接参照していない。unmount・pointercancel で `aiming` が解除される。スキップに使った指の離しでスイングしない(`routeStageRelease` の結果のみ)。
- [ ] **V18: hooks — 投球入力**
  - 依存: V0, V3, V6。担当ファイル: 新規 `hooks/{usePitchingControls,usePitchKeyboard}.ts`。
  - やること: `usePitchingControls`(ステージの入力面のポインタ・操作ボタン・キーから `reducePitchInput` を駆動、狙いの ref、ゲージの開始時刻、`aim`/`quality` を `onThrow({kind, aim, quality})` で渡す、`input-state` の公開、unmount のタイマー解除)。`usePitchKeyboard`(矢印・Space/Enter。`defaultPrevented` と `preventDefault` で打撃のスイング・スキップと排他。[[dom-key-input-exclusivity]])。
  - 完了条件: lint 0 件・typecheck 起因 0 件。ゲージ時刻は `event.timeStamp` から求める(`performance.now()` の差だけで求めていない)。`timeScale` を反映。Space の keydown 1回でスキップと投球が同時に起きない。
- [ ] **V19: sequence の合成(frame・play-plan・telop)**
  - 依存: V0, V1, V2, V3, V7。担当ファイル: `model/world/sequence/{frame,play-plan,telop}.ts`(+各 test)、`sequence/{world-consistency,batter-screen}.test.ts`。
  - やること: `SceneFrame` に `guide`・`feedback`・`cursor.raw`・`ball.rotation/halo/scale(飛行中の最小径)`・`BatPose.lengthScale`・打者の `batterRootFor`・カメラへの `hitFx`(ズーム・シェイク)を合成。`PlayPlan` に `banner`・`hitStopMs`・`feedback` 区間を追加し、ヒットストップで打球・野手・テロップ・終了時刻を後ろへずらす。バナーのある結果はテロップを `null` にする。`SceneFrameInput` に `assist`・`reducedMotion`・`pitchInput`(守備の照準・ゲージ・散布円)・`swingFeedback` を追加。
  - 完了条件: 単体テスト — `guide` の `exact` がリリースから D+hold まで可視で `position = zoneToWorld(landing)`、リング半径が `previewRingAt` に一致、ボールの表示径が飛行中ずっと最小径以上(v2 の「一度消えたら再出現しない」性質テストを維持)、接触時のカメラが連続(16ms あたりの FOV 変化 ≤ 閾値・ヒットストップ中も連続)、ヒットストップが 0 のとき v2 と同じ時刻表、`reducedMotion` で `hitFx` が 0、守備の `guide.mode = "reticle"`・ゲージ中のリングが `gaugeRingAt` に一致、既存の性質(決定論・入力を変更しない・全数値が有限)を維持。`batter-screen.test.ts` は v3 の数値(頭の右端 ≤ 90px 等)に更新。各関数 60 行以内。

### ウェーブ 5

- [ ] **V20: 統合(director・useGameStage・GameScreen)**(直列)
  - 依存: V9〜V19。担当ファイル: `hooks/{useStageDirector,useGameStage,useGame,useStage3d}.ts`、`ui/{GameScreen,BaseballGamePage}.tsx`。
  - やること: director が `SceneFrameInput` の新項目(`assist`・`pitchInput`・`reducedMotion`・`swingFeedback`)を毎フレーム渡し、`layoutOf` を「人間守備 = pitching」に変更(セル選択に依存しない)、人間の投球の windup を `humanWindupMs` で行う。`useGameStage` が `tutorialActive` を `holding` に合成(チュートリアル表示中は次の投球を始めない)、`usePitchingControls`・`useSfx`・`useHaptics`・`usePlaytestLog`・`useFramePerf` を結線し、`onThrow` を新しい `PitchCommand` に。`GameScreen` から `selection`(セル)を削除して `selectedKind` だけにし、`GameLayout` へ契約どおりに渡す。`stage.stats()` を起動時にログへ。**`skip()` は reducer に触れない・`stage === null` でも進行が止まらない(v2 の構造検査 8)**を維持。
  - 完了条件: lint 0 件・`cd sample-app && npm run typecheck` が**全体で**成功(ここで全体が緑になる)。`useStageDirector` に `Math.random`・DOM 直接アクセスが無い。

### ウェーブ 6

- [ ] **V21: 全体確認と構造検査**(直列)
  - 依存: V20。担当ファイル: 残った型・lint エラーの解消に必要な最小限のファイル(担当外を直す場合は完了報告に明記)。
  - やること: `cd sample-app && npm run typecheck && npm run lint && npm run test && npm run build` を通す(固定シード依存の既存テストは性質を保って期待値を再導出し、基準を緩めない)。構造検査(テスト戦略)を grep で確認。`index` チャンクと `GameScreen` チャンクのサイズを記録。**試遊ビルド**(`VITE_PLAYTEST=1`)を作り、起動して 1 試合が通ることを確認する。
  - 完了条件: 上記がすべて成功。構造検査 1〜12 が pass。試遊ビルドの手順(ビルドコマンド・配布方法・ログの取り出し方)を完了報告にまとめる。
  - **→ T1(人間の試遊 1 回目。ゲート1で承認を得た場合に実施)**: orchestrator が試遊ビルドを人間に渡し、「**打撃 20 打席(約 60 球)と、守備 20 球を遊んで、試遊ログをコピーして貼る**」ことと「打てた/微妙/打てない」「投げられた/微妙/投げにくい」の 3 択を `AskUserQuestion` で聞く。ログは V22 のボット較正・難易度のアシスト強度の調整に使う。

### ウェーブ 7(検証・調整。4 並列)

- [ ] **V22: 人間代理ボット v2(打撃)と打撃バランス**
  - 依存: V21(と T1 のログがあればそれ)。担当ファイル: 新規 `model/sim/{human-bot,human-game}.ts`、`model/sim/human-bot.test.ts`(新規。帯の検証)、`model/sim/bot-balance.test.ts`(旧ボットの帯の更新)、`model/batting/{params,result-table,batted-ball,assist}.ts` の**値**。
  - やること: 「人間代理ボット v2」を実装し、受け入れ帯(テスト戦略 E 群)を満たすよう、ロックオン強度・結果表・強さのしきい値・`foulRatio`・`qualityPenalty` を調整する(動かしてよい値と動かさない値は下記)。**検出力テスト**を先に通す(v2 設定で「打てない」を再現)。旧ボット(A〜E)は「補助なし・理想知覚」の参照として残し、帯を変える場合は理由を完了報告に書く。ボットの px/ゾーン単位が `camera/project.ts` の値と ±8% で一致するテストを維持。
  - 動かしてよい値(この順に): `ASSIST_TABLE` の `lockStrength`(±0.15)・`captureRadius`(±0.4)・`qualityPenalty`(0.2〜0.5)、`linerHalfBand`(0.08〜0.22)、`mediumFrom`(0.28〜0.45)、`strongFrom`(0.5〜0.75)、`RESULT_TABLE` の重み(v2 の不変条件を守る範囲で各セル ±8)、`foulRatio`(0.6〜0.8)。**動かさない値**: `contactWindowMs`・`powerWindowScale`・`centerRatio`・`lateCutoffMs`・`inputLatencyMs`・`ballReachX/Y`・`meetBaseRx`・`aimGraceMs`。
  - 完了条件: `npx vitest run src/features/baseball/model/sim` 成功、E 群の帯(P10/P50/P90)をすべて満たす。満たせない帯は緩めずに理由と最良の値を報告(設計の見直しとして上申)。`model/sim/` を `*.test.ts` 以外が import していない。
- [ ] **V23: 投球ボットと投球バランス**
  - 依存: V21。担当ファイル: 新規 `model/sim/pitch-bot.ts`、`model/sim/pitch-bot.test.ts`、`model/cpu/difficulty.ts` の**値**(`qualitySensitivity`・`cursorSigma` 等)、`model/pitch/params.ts` の**値**(`gauge.windows`・`sigmaScale`)。
  - やること: 「投球ボット」を実装し、F 群の帯を満たすよう調整する。CPU 同士(`balance.test.ts`)は基準を変えずに成功させる(V22 と `difficulty.ts` の値で競合したら、V22 の帯を優先して V23 は `cpu-batter.ts` の係数で吸収せず orchestrator に上申)。
  - 完了条件: F 群の帯を満たす。`balance.test.ts` 成功。
- [ ] **V24: E2E とドキュメント**
  - 依存: V21。担当ファイル: `sample-app/frontend/e2e/baseball.spec.ts`、`sample-app/README.md`、`docs/process/sample-app-dev.md`。
  - やること: E2E(テスト戦略)の更新・追加、README の操作説明(離す=スイング・ロックオン・予告とリング・投球のゲージ・音と振動・試遊ログ)、`sample-app-dev.md` に新ボット・試遊ビルド・ログの見方を追記。「パワプロ」等の名称は書かない(「みたいな」に留める)。E2E の seed を再探索。
  - 完了条件: `cd sample-app && npm run test:e2e --workspace frontend` が 3 回連続で成功(`home.spec.ts` は無改変)。新しいタッチ・投球・音のテストを `--repeat-each=5 --workers=2` で実行して失敗 0 件(有効試行が得られず失敗した件数は報告)。
- [ ] **V25: 見た目の確認と調整**
  - 依存: V21。**例外として次を調整してよい**: `WORLD_PARAMS` の「調整可」の値(下の範囲内)、`render/{look,markers,stadium}.ts` の見た目の値、`ui/*.css`。それ以外が必要なら変更せず報告。
  - やること: 390×844・390×745・390×664(`hasTouch`)と 375×667・360×640・1280×720 で、v2 との前後のスクリーンショット(仮想時計+手動 rAF のハーネスで決定論的に撮る。[[swiftshader-playwright-input-latency]])を比較し、「ゲート1で人間に見せるもの」の画面一覧とモックの数値に対して〇×を付ける(打者の占有・バット到達・予告とリングの見え方・ボールの最小径・バナーとテロップ・ピルとの重なり・守備のバー・ホームランの頂点と HUD・接触時のカメラ・ヒットストップの違和感)。画像(1 枚 500KB 以下、25 枚程度)を `docs/tests/assets/2026-10-27-baseball-game-v3/` に保存。最大 3 ラウンド、未達は理由を報告してゲートへ引き継ぐ。
  - 調整可の値: `actors.batter.portraitScale`(0.62〜0.80)・`portraitX`(−0.85〜−0.65)・`portraitBatScale`(接触時の先端が +0.27 以上になる範囲)、`ball.minScreenDiameterRatioFlight`(0.014〜0.022)、`guide.previewRing.startRadius`(0.24〜0.36)、`halo.opacity`(0.2〜0.5)、`fx` の各値、`telop`/`banner` の長さ、`fit.pitching.defaultSafeArea.bottom`。カメラ・ゾーンの px を変えたら **V22 のボットテストを再実行**。
  - 完了条件: 受け入れ基準の A・B・C・G 群が〇、または未達の理由が報告されている。`npm run lint`・`typecheck`・`test` が成功。**V24 と V25 の両方が完了した後に、orchestrator が E2E を最終実行して成功を確認する。**

## テスト戦略

**自動テストを新規作成するか:** する。対象と配置は各ステップの「完了条件」に書いたとおり(**作成も各ステップのタスクに含む**)。単体(vitest・node)は `model/` と `audio/`(偽のコンテキスト)と `render/`(smoke)に同居。E2E(Playwright)は V24。期待値は `WORLD_PARAMS`/`BATTING_PARAMS`/`PITCH_PARAMS`/`ASSIST_TABLE` から計算し、調整してよい値のリテラルを書かない。

### 受け入れ基準(数値)

測り方: A〜D・G・H は単体テスト/画面の実測(V25 の連写)。E・F はボット(`model/sim/*.test.ts`、固定シード、レベルあたり 40 人 × 各 2000 球)。「実測確定」は V25 が実機に近い画面で測って確定する値。

| # | 群 | 指標 | 目標 | 守る場所 |
| --- | --- | --- | --- | --- |
| A1 | 構図 | ゾーン枠(390×844、打撃・守備とも) | x 117.7〜272.3、y 410〜585(±3px)、幅×高 ≥ 150×170 | `rig.test`・`project.test`、E2E(`data-zone-rect`) |
| A2 | 構図 | ゾーン枠(390×745 / 390×664 / 375×667 / 360×640、打撃・守備) | 幅×高 ≥ 150×170 / ≥ 105×120 / ≥ 100×112 / ≥ 95×108。**実測確定** | `rig.test`・E2E |
| A3 | 構図 | 打者の頭の右端(390×844 縦長) / 胴の右端 / 画面内の打者の外接幅 | ≤ 90px(設計値 74)/ ≤ 60px(38)/ ≤ 25% = 98px(v2: 54%) | `batter-layout.test`・`batter-screen.test`・画像 |
| A4 | 構図 | 構え中の手・バットとゾーン枠の重なり | 0px | 画像(V25) |
| A5 | 構図 | 接触時のバット先端 x(縦長) / バットとボールの画面上のずれ(ゾーン中央・四隅) | ≥ +0.28m / ≤ 20px | `batter-layout.test`・画像 |
| A6 | 構図 | 投手の頭頂 y / 中心 x(390×844) | ≥ HUD 下端+8px(設計値 171)/ 195 ± 3px | `rig.test`・画像 |
| A7 | 構図 | 守備の操作バー(`bb-overlay__bottom`)の高さ | ≤ 135px(844)・≤ 140px(745・664)。格子の下端が上端から 8px 以上上 | E2E の幾何検証 |
| B1 | ボール | 飛行中(リリース〜D)の表示径 | 常に ≥ 0.0175 × 画面高 − 1px(844 で ≥ 13.8px)。倍率は連続・単調非増加 | `frame.test`・`rig.test` |
| B2 | ボール | 縁取りの画面上の太さ | ≥ 2px 相当 | `markers.test` |
| B3 | ボール | 回転 | 球種ごとに軸・角速度が異なり、フォークが最小。縫い目が回転に従う | `ball-look.test`・`markers.test` |
| C1 | 予告 | リング半径 | `t = 0` で 0.30m、`t = D` で 0.125m(±1e-9)、単調減少、D 以降保持 | `guide.test` |
| C2 | 予告 | `exact` の点 / `fade` の円 | 点 = `flight.landing` に厳密一致 / 円は着弾を含み中心のずれ ≤ `fadeJitter`・決定論 | `assist.test`・`guide.test` |
| C3 | 予告 | リリース直後の可視 | 120ms のフェードイン後は不透明度 ≥ 0.9 を D+hold まで保つ | `frame.test` |
| C4 | ロックオン | 式の性質 | `lockStrength 0` で恒等、`progress < rampStart` で素、有効カーソルは raw と landing の線分上、`k ∈ [0,1]` | `assist.test` |
| C5 | ロックオン | 表示と判定の一致 | 離した時刻の `SwingInput.cursor` が、その時刻に表示されていた有効カーソルと一致 | `useBattingControls` の純関数部のテスト・E2E |
| D1 | 入力 | 離す=スイング | 判定表の全組み合わせ(V5)。1本目の離し → `swing-release`、2本目・ボタン・マウス・キーは v2 と同じ | `input-route.test` |
| D2 | 入力 | 判定時刻 | `atMs = (離し − 開始)×timeScale − 70`(`swingAtMs`)。`timeScale` で補正が換算されない | `swing-time.test` |
| D3 | 入力 | 到達通知の保留 | 指が下りている間は D+370ms まで確定しない。離せば即。その後は見逃し | `arrival.test`・E2E |
| D4 | 入力 | 誤爆ガード | リリース後 200ms 以内の離しはスイングにならず、それ以降の早い離しは「早い」の空振りで返る | `input-route.test` |
| E1 | 打撃ボット | **検出力**(v2 設定 = `ASSIST_OFF`・リング無し・v2 の知覚の偏り) | 初心者の打率 P50 ≤ .17 かつ コンタクト率 P50 ≤ 50%、中級の打率 P50 ≤ .22(前回の「打てない」を再現できる) | `human-bot.test` |
| E2 | 打撃ボット | ふつう(既定)の打率(安打 ÷ (打席 − 四球)、P50) | 初心者 .20〜.30、中級 .26〜.34、上級 .32〜.45。P10 ≥ .13(全レベル)、P90 ≤ .52 | `human-bot.test` |
| E3 | 打撃ボット | コンタクト率(P50) / 三振率(P50) | 初心者 ≥ 55% / ≤ 35%、中級 ≥ 70% / ≤ 25%、上級 ≥ 82% / ≤ 18% | 同上 |
| E4 | 打撃ボット | 技量の勾配 | 上級 − 中級 ≥ .04、中級 − 初心者 ≥ .03(P50) | 同上 |
| E5 | 打撃ボット | むずかしい(アシスト弱・fade)の中級の打率 P50 | .20〜.28(ふつうより ≥ .04 低い) | 同上 |
| E6 | 打撃ボット | かんたんの初心者の打率 P50 | ふつうの初心者 + .02 以上 | 同上 |
| E7 | 打撃ボット | ボール球を振る率(中級・ふつう) / ストライクを振る率 | ≤ 30% / ≥ 70% | 同上 |
| E8 | 旧ボット | 補助なし・理想知覚の参照(B 安打率) | v2 の帯 30〜35% を目安に、変えるなら理由を完了報告に | `bot-balance.test` |
| E9 | CPU | CPU 同士(ふつう)の打率 / 三振率 / 四球率 | `balance.test` の基準を**変えず**に成功(打率 .18〜.34、目標 .23〜.29) | `balance.test` |
| F1 | 投球 | ゲージの質の境界 | 40 / 90 / 160ms ちょうどの扱い・負・NaN・タップなし = 失投 | `gauge.test` |
| F2 | 投球 | σ の倍率 | ナイス 0.35 < グッド 0.65 < ふつう 1.0 < 失投 1.7。乱数の消費数 24 個で不変 | `delivery.test` |
| F3 | 投球ボット | 被打率(CPU ふつう、P50) | 初心者(中央寄り・単調)**.27〜.34**、中級(縁を混ぜる)**.22〜.29**、上級 **.16〜.24**。各レベルの差 ≥ .03 | `pitch-bot.test` |
| F4 | 投球ボット | 配球の意味 | 上級のタイミングで「中央連打」の被打率 ≥ 「縁+球種を混ぜる」+ .03 | 同上 |
| F5 | 投球ボット | ストライク率 / 四球率(初心者) | ≥ 50% / ≤ 14%(PA あたり) | 同上 |
| F6 | 投球ボット | ナイス率(中級) | 30〜50%(質の分布が極端でない) | 同上 |
| F7 | 投球 | 照準の範囲 | `aim` が ±1.67 に収まる | `pitch-input.test` |
| G1 | 演出 | バナーの網羅 | 全 `outcome.kind × inPlay.result × plate` に対して `bannerFor` が定義(なし=`null`)。バナー有りの結果でテロップが `null` | `banner.test`・`play-plan.test` |
| G2 | 演出 | 接触演出 | `hitFxAt` が連続。ヒットストップ 0 のとき時刻表が v2 と同じ。`reducedMotion` で 0 | `hit-fx.test`・`frame.test` |
| G3 | 演出 | 位置ずれ | `contactFeedbackOf` の帯が中心から外れるほど悪化(単調)。表示は 900ms | `contact-feedback.test` |
| G4 | 演出 | テンポ | CPU 投手・見逃しの 1球 ≤ 2.5s(windup 550+D+380+120)、人間の windup 280ms。インプレーの `endMs ≤ D + 上限`(最長の滞空+テロップ+余韻から式で計算) | `play-plan.test`・`launch-params.test` |
| H1 | 音 | レシピ | 全 cue にレシピ。長さ ≤ 2.5s・ゲイン ≤ 1・周波数 20〜12000Hz | `cues.test` |
| H2 | 音 | イベント | 結果種別ごとに期待する cue が `atMs` 昇順で返る(接触なしは打撃音なし) | `sfx-plan.test` |
| H3 | 音 | エンジン | `unlock` 前は無音・ミュートで node 0・同時発音 ≤ 8・終了で切断 | `engine.test` |
| H4 | 触覚 | パターン | 80ms 未満の連続を間引く。設定 OFF・リデュースモーションで無効 | `haptics.test`・`useHaptics` |
| I1 | ログ | 記録 | リングバッファ ≤ 600・JSON 往復で不変・無効ビルドで書かない | `ring-buffer.test`・`usePlaytestLog` |
| I2 | ログ | 要約・較正 | `summarize` が手計算と一致。`fitBotParams` が既知の分布を ±5% で復元 | `summary.test`・`fit-bot.test` |
| J1 | 性能 | バンドル | `index` チャンク ≤ 201.04KB + 8KB。`GameScreen` チャンク(gzip) ≤ 173.97KB + 25KB | `npm run build`(V21) |
| J2 | 性能 | 計測の仕組み | `stats()` が `drawCalls`/`triangles` を返し、ログに入る | `stage` の smoke・`usePlaytestLog` |
| K | 構造 | 構造検査 | 下記 1〜12 が pass | grep(V21) |

**ボットの前提の根拠(E 群)**: 反応時間 200〜250ms・見た目の到達の偏り(+130ms で位置が完璧でも 39% が空振り)・人間の打撃タイミングの精度は調査 batting.md 2.5・出典(Smeets ほか)と v2 診断。**値は仮定で、実機の試遊ログで較正する**(ゲート2のログが最初の実測)。帯はボットの出力の期待であり、人間の手触りの保証ではない([[game-feel-needs-playability-check]])。

### 構造検査(`/test`・`code-reviewer` が grep)

(1) `from "three"` が `render/` のみ。(2) `render/` が `../model`・`../hooks`・`../ui`・`../audio` を import しない。(3) `model/` が `three`・`react`・`../render`・`../hooks`・`../ui`・`../audio` を import しない。(4) `AudioContext`・`webkitAudioContext` が `audio/` のみ、`audio/` が `types/` 以外を import しない。(5) `model/world/` に `Math.random`・`Date`・`performance`・`window`・`document` が無い。(6) `usePointerInput` が `routeStage*` の戻り値で分岐し、`holding` を直接参照していない。(7) スイング時刻を `performance.now()` の差だけで求めていない(`swingAtMs` 経由)・ゲージ時刻も `event.timeStamp` 経由。(8) `model/sim/` を import しているのが `*.test.ts` だけ。(9) `skip()` が reducer に触れない・`stage === null` でも plan を進める(v2 の検査 8)。(10) `getBoundingClientRect` を使う hooks が `useSafeArea.ts`・`useStage3d.ts`・`usePointerInput.ts` に限られる。(11) `PLAYTEST_ENABLED` が偽のとき `localStorage` に書く経路が無い。(12) 「パワプロ」「パワフル」が 0 件(ソース・UI 文言)。

### E2E(Playwright。V24)

既存の 24 件(1 イニング通し・WebGL 不可でも進行・スキップ・Space/Enter・タッチ・幾何検証)を、v3 の操作・DOM に合わせて更新し、次を追加する。**SwiftShader では実入力が 0.2〜1 秒以上遅れる**ので、時間窓を狙うテストは「ページ内で入力の `event.timeStamp`・飛行開始・D を記録し、アプリと同じ計算で有効試行だけを検証、無効は次の投球で再試行(最大 5 回)」にする([[swiftshader-playwright-input-latency]])。有効試行が得られなければ「環境が遅すぎる」と明示して失敗する。

1. **離す=スイング(タッチ)**: `hasTouch`・390×844。1本目の指を置いてドラッグし、飛行中に離す → `data-timing` が出て `data-play-kind` がスイング結果。有効試行(`dtMs` が窓内)のときだけ `dtMs` を検証。
2. **持ち替えは捨てる**: リリース後 100ms 以内の離しでスイングにならない(`data-swing-dropped` に数えない・結果は見逃し)。
3. **保留**: 指を置いたまま D+250 をまたぎ、D+300 に離す → 見逃しではなく空振り(遅い)。D+400 に離す → 見逃し。
4. **2本目の指・スイングボタン・Space**: v2 のテストを維持(1本目が狙い中でも 2本目で即スイング)。
5. **予告とリング**: 人間打撃で `data-guide="exact"`(ふつう)、むずかしいで `fade`。リング半径がリリース直後 > D で減る(ページ内サンプリング)。
6. **投球**: PC(マウス: 動かす→クリック→クリック)・キー(矢印→Space→Space)・ボタン(`throw-pitch` を 2 回)で 1 球投げられ、`data-pitch-quality` が出る。自動投球(停止しない)で失投になり試合が止まらない。`fast=1` でゲージが短縮される。
7. **チュートリアル**: 初回に出て「はじめる」で閉じ、再読み込みで出ない。表示中は投球が始まらない(`holding`)。
8. **音**: `addInitScript` で `AudioContext` を計数スタブに差し替え、最初の操作の後に `unlock`、1 球で `pitch-release`・`mitt`(またはスイング音)が呼ばれる。ミュートで呼ばれない。**音質は自動では検証できない**(手動確認と音のデモ)。
9. **試遊ログ(`VITE_PLAYTEST=1` ビルド)**: スイングごとに記録が増え、要約が表示され、「消去」で 0 になる。通常ビルドでは入口が無い。
10. **幾何**: 縦長 3 高さ+デスクトップ+タブレットの打撃・守備(守備のバー ≤ 135/140px、格子がバーに掛からない、打者の頭の右端 ≤ 90px、ゾーンがオーバーレイと 4px 以上離れる)。
11. **回帰**: 1 イニング通し・WebGL 不可・スキップ・Enter/Space 長押しで再試合しない・`home.spec.ts`。seed は判定・CPU の変更で変わるので再探索する。

### 手動確認(ゲート2の前に `tester` が実施し、人間が実機で再確認)

① スマホ縦(390×844・390×745・390×664)で、打撃・守備の構図(打者が小さく端・ゾーンが中央・ボールの通り道が打者から離れる)、予告の点とリング、ボールの見え方(リリース直後から追える)。② 1本指で「スライド→離す」で振れる、持ち替えが誤爆しない、2本目の指・スイングボタンも使える。③ 守備でゾーンをなぞって狙い、リングに合わせてタップでき、狙いと着弾の重ね表示とナイスピッチの表示が出る。④ バナー(ヒット・ジャスト・ホームラン・三振・四球)・ヒットストップ・位置ずれ表示。⑤ 音(打撃音・ミット音・歓声・UI 音)と振動(Android)、ミュート。⑥ チュートリアルと最初の数球のヒント。⑦ ボットの出力(E・F 群の表)を完了報告に貼る。⑧ **実機の試遊ログ**(下記)。

### 「人間が遊んで打てるか」の検証手順と、遊べる版を人間に渡すタイミング

1. **ボット(代理)**: 打撃・投球ボットの帯を満たす。**検出力テスト(E1)で前回の不合格を再現できること**が前提。
2. **T1 — 試遊 1 回目(V21 の直後、レビュー・`/test` の前)**: orchestrator が試遊ビルド(`VITE_PLAYTEST=1`)を人間に渡す。人間は**打撃 20 打席(約 60 球)と守備 20 球**を遊び、試遊ログをコピーして貼る。診断(4-3 の表)で原因を切り分け、ロックオン強度・予告・遅延補正・ボットの較正に反映する(V22)。**ゲート1で承認を得る**(Q8)。得られなければ T1 を省き、ゲート2のログで較正する。
3. **T2 — 試遊 2 回目(`/test` 完了後 = ゲート2)**: 必須。合格の目安は、**人間の主観**(`AskUserQuestion` の 3 択: 「打てた・投げられた」/「微妙」/「打てない」)と、ログの客観値(初回 20 球の目安: コンタクト率 ≥ 55%、ストライクを振る率 ≥ 70%、離す時刻の SD ≤ 100ms、距離の中央値 ≤ 60px、fps の p95 ≤ 33ms)。**主観が「打てない」なら、ボットが合格していても不合格**とし、ログの診断表で原因を特定して `/design` か `/implement` に戻る。
4. 試遊環境の確認: ログの「縮小表示の警告」と端末情報で、どの画面(ブラウザ単体/アーティファクトの iframe/アプリ内)で遊んだかを記録する(viewport meta の問題の再発防止)。リポジトリの `index.html` の viewport meta を E2E で固定する。

## ゲート1で人間に見せるもの

[[visual-scope-must-be-shown-at-gate1]] の適用。**モックは別担当が作る**。以下の画面・状態・数値をそのまま指定する。モックは静止画でよいが、構図・要素の位置と大きさは下の数値(390×844、CSS px、手計算。実装時に実測して確定する値は「≈」)に合わせる。比較のため、**v2(現行)の同じ状態の画像を左に並べる**(`docs/tests/assets/2026-10-19-baseball-game-feel-test/` の画像、または別担当が撮り直す)。

### 画面と状態の一覧(必要なモック)

| ID | 画面 | 状態 | 見せたいこと |
| --- | --- | --- | --- |
| M1 | 打撃 390×844 | 待機(windup。リリース前) | 構図: 打者が左端で小さい、投手とゾーンが中央に縦に並ぶ、HUD・操作バー |
| M2 | 打撃 | リリース直後(D−1250ms) | 予告の点+大きなリング、ボールが小さくても見える(最小径+ハロー+縫い目) |
| M3 | 打撃 | D−400ms | リングが縮んだ状態、ボールの拡大、ロックオン中のカーソル(素のカーソルの淡い印が離れている) |
| M4 | 打撃 | D(到達。指を離す瞬間) | リングがボールを囲む、ゾーン枠の発光 |
| M5 | 打撃 | スイング直後 | バットの接触、2 行のピル(「ジャスト!」+「芯」)、白い十字とシアンの輪の位置ずれ表示 |
| M6 | 打撃 | ヒット/ホームラン/三振のバナー(3 枚) | バナーの形・位置・色、ホームランの全面フラッシュ |
| M7 | 打撃 | チュートリアル(打撃カード 1〜3) | 説明の文言・指のアニメーションの見せ方 |
| M8 | 守備 390×844 | 狙い中(aiming) | 同じ構図・大きなゾーン・薄い格子・照準と散布円・球種チップの操作バー(高さ ≈ 130px)・CPU 打者が左端 |
| M9 | 守備 | ゲージ中 | 照準の周りのリングが縮む、ヒント文「リングが ねらいに かさなったら タップ!」、バーの「とめる!」 |
| M10 | 守備 | 着弾後 | 狙い(白の照準)と着弾(シアンの点)の重ね表示、「ナイスピッチ!」バナー |
| M11 | 打撃・守備 390×664 | 低い画面 | 同じ構図がツールバーありでも成立する(ゾーン幅 ≈ 116px) |
| M12 | 操作の流れ図 | 打撃・守備(下の 2 つ) | 指の動きと画面の対応 |
| M13 | 音のデモ(`sfx-demo.html`。別担当が使い捨てで作る) | 10 個のボタン(ミット・打撃音ジャスト/通常/弱・空振り・歓声小/大・ホームラン・ゲージのティック・ナイスピッチ) | 合成音の品質(チープさ)を聴いて、既定 ON/OFF を決める |
| M14 | ロックオン強度の比較表 | かんたん/ふつう/むずかしい | 難易度ごとの予告の出し方・補正の強さ(上の表 + 各 1 枚の模式図) |

### 構図の数値(390×844、打撃。守備も同じ)

| 要素 | 位置・大きさ |
| --- | --- |
| カメラ | 位置 (0, 1.75, 2.6)・注視 (0, 0.55, −18)・水平半幅 tan 0.25(縦 FOV 56.8°)・lift 0.219 |
| HUD(上) | 高さ 155px(左上=スコア、右上=ネームプレート。v2 のまま) |
| 投手 | 中心 x 195、頭頂 y ≈ 171、足元 y ≈ 247(身長 ≈ 76px) |
| ボールの出現 | (184, 195)。径は真 7.5px → **表示 ≥ 14.8px**。到達 (195 ± 77, 410〜585) で径 59px |
| ゾーン枠 | x 117.7〜272.3、y 410〜585(155×175)。中心 (195, 497.5) |
| 予告の点(exact) | 着弾点に径 24px のシアン(#5ce1ff)・黒縁 2px |
| 予告のリング | 着弾点中心。半径 89px(リリース)→ 37px(D)。線幅 3px。白〜シアン。D で金色に光る |
| カーソル(ミート 56) | 112×76px。初期は中心 (195, 497.5)。黄 #ffd23f(塗り α 0.32+リング) |
| 素のカーソルの印 | 有効カーソルと 12px 以上離れているとき、直径 10px の淡い白 |
| 打者(縦長) | 頭の中心 (−31, 397)・半径 106px(画面内 x ≤ 74)。胴の右端 x ≈ 38。足元 y ≈ 708(バー y 663 の下)。**バットは通常の 1.45 倍の長さ**で、接触時に画面 x ≈ 280px まで届く |
| タイミングのピル | ゾーン枠の上端中央の直上(中心 x 195、y ≈ 380)。幅 ≈ 130px・2 行 |
| 位置ずれ表示 | 白の十字(径 16px)・シアンの輪(径 30px)・両者を結ぶ線 |
| バナー | 画面上から 30〜42%(y 253〜355)、幅 390px・高さ ≈ 96px の斜めの帯(チーム色の縁取り)。ホームランは全面フラッシュ+紙吹雪 |
| テロップ(ボール・ストライク等) | 上から 38%(v2 のまま) |
| スイングボタン | 右下 80px(小さくする)。ミート/強振の切替は隣 |
| ティッカー・操作バー | 下端から 181px(打撃。v2 のまま) |
| 守備の操作バー | 下端から ≈ 130px。球種チップ 4〜5 個(各 76×52px。球種名・球速・矢印)+右端に操作ボタン 96×52px(「投げる」/「とめる!」) |
| 守備の照準 | 外周径 44px の白い輪+十字。散布円 = 半径 ≈ 45px(ふつうのブレの目安)の薄い白 |
| 守備のゲージのリング | 照準中心。半径 119px → 36px(0.9 秒)。**ナイス帯**は終点の ± 40ms(金色の細い輪) |
| 5×5 格子(守備) | 薄い線(不透明度 0.2)。外周 x 66〜324、y 352〜643 |

**390×664**: 打撃のゾーン幅 ≈ 116px(式の出力。実測確定)。守備の操作バー ≤ 140px。他の要素は同じ規則で縮む。

### 操作の流れ図(M12 の元)

**打撃**:

```
[指を置く]──カーソルは動かない(相対ドラッグの起点)
   │
[スライド]──指の移動量だけカーソルが動く。終盤はロックオンで ● に吸い寄せられる
   │            (windup 中も動かしてよい。飛行中に動かし続けてよい)
   │  投球がリリースされた瞬間: ● と大きなリングが出る → リングが D に向けて縮む
   ▼
[リングが ● にぴったり重なる瞬間に 指を離す] = スイング
   │   判定時刻 = 離した時刻 − 70ms(タッチの遅延補正)
   ▼
結果: 「ジャスト!/早い −62ms/遅い +48ms」+「芯/かすり」+ 位置ずれ(十字と輪)+ 打球音・振動
   ▼
打球カメラ → バナー(ヒット/ホームラン/三振…)→ タップでスキップ可 → 次の球
別の振り方: 2本目の指をタップ(その場で即スイング)/ スイングボタン / PC はクリック・Space
```

**投球**:

```
[球種チップを選ぶ(常時)]
   ▼
[指を置く]──照準が出る → [スライド]──照準が動く(散布円がブレの目安) → [指を離す] = 狙い確定、ゲージ開始
   ▼
リングが 0.9 秒かけて照準に向けて縮む(過ぎても 0.3 秒は縮み続ける)
   ▼
[リングが照準にぴったり重なる瞬間に タップ(どこでも / 「とめる!」)]
   → 質: ナイス(±40ms)/ グッド(±90)/ ふつう(±160)/ 失投
   ▼
windup 0.28 秒 → 投球 → 着弾 → 狙い(白)と着弾(シアン)の重ね表示 + 「ナイスピッチ!」
PC: マウスで狙い → クリック(確定)→ クリック/Space(停止)
```

## リスク・トレードオフ

- **離す=スイングの誤爆(Q1)**: ドラッグ中に指を離すと(持ち替え)スイングになる。誤爆ガード(リリース後 200ms 以内は無視)とチュートリアルで緩和する。許容できなければ、v2 のタップ方式を維持して予告・リング・ロックオンだけを入れる(`routeStageRelease` を `none` にし、タップ判定を戻すだけ。V5 を差し替え)。
- **アシストで打撃が易しくなりすぎる/「球を見て打つ」感が減る**: ロックオンと予告で安打が増え、全てライナーになる(v2 診断 §0)。`qualityPenalty` と難易度の差(むずかしい = fade・弱いロックオン)で緩和し、V22 が帯(E 群)に合わせる。「打てない」を優先するため、ふつうの出発値は強めにした(0.55)。
- **ボットは代理にすぎない**: 検出力テスト(E1)で前回の不合格を再現できることを要求するが、パラメータは仮定。実機の試遊ログ(T1・T2)で較正する。帯を満たしても、人間の主観が「打てない」なら不合格とする。
- **投球の操作が 2 ジェスチャで、テンポが遅くなる**(約 3.6 秒/球)。腕前の要素の対価。windup 短縮・テロップ短縮で相殺し、スキップ可。許容できなければ「ゲージなし(案 D: 狙いの精度だけ)」に落とせる(`gauge` の質を常に「グッド」にする)。
- **打者を小さくしてバットを 1.45 倍にする**ので、体とバットの比率が不自然に見える可能性がある(バットだけ大きい)。接触時の先端到達(+0.285m)を守るための補正で、V25 が `portraitScale`(0.62〜0.80)・`portraitBatScale` を調整する。モックで人間が確認する(Q4)。
- **音のチープさ・自動再生制限・iOS のサイレントスイッチ**: 合成音の品質は自動検証できない。デモ(M13)で事前に聴く。ユーザー操作で `unlock`、ミュートを常に出す。iOS のマナーモードでは鳴らない(チュートリアルに注記)。
- **予告がリリースと同時(windup 中には出せない)**: パワプロは投球モーションの開始で出すが、v3 は CPU の dispatch がリリース時のため。残り約 1.3 秒あるので許容。windup 中に出す案は reducer の順序変更が要るので P1。
- **CPU 打者の変更(位置・質への反応)で CPU 同士の打率が下がる**: V4 が出発値を調整して `balance.test` の基準を保つ。固定シード依存のテストと E2E の seed は再導出・再探索が要る。
- **`SceneFrame`/`PitchCommand`/`PlaybackSpeed` の型変更**で V0〜V19 の間は typecheck が赤い(出荷しない。V20 で緑、V21 で全体確認)。
- **ヒットストップ・ズームパンチ・シェイク**は酔い・頭痛の懸念。`prefers-reduced-motion` で無効、設定に出す余地あり(P1)。
- **実機 fps は未計測**: v3 は描画負荷を大きくは増やさない(ボールのハロー・縫い目・予告のリング程度)が、実測は試遊ログで確認する。P1 に進む条件は「実機 fps・draw call の計測」節。
- **規模**: 26 ステップ・新セグメント 1 つ・約 40 の新規ファイル。段階導入の余地(ゲート1で調整): 音(V8・V11・V16)とバナー(V7・V13)を後ろへ回しても、打撃・投球の骨格は成立する(`SceneFrame` の新項目を optional のまま残せば V19 の範囲が減る)。
- **試遊環境**: 前回は `play.html` に viewport meta が無かった可能性(調査 #10)。ログの端末情報と警告で検出。リポジトリの `index.html` は E2E で固定。

## ロールバック方針

- 変更は上の「変更ファイル」に閉じる(DB・外部システム・データ移行なし。`localStorage` のキー `bb-tutorial-v1`・`bb-prefs-v1`・`bb-playtest-v1` はゲーム内だけで、削除しても支障はない)。問題が出たら PR 単位で `git revert` する。ホーム(`/`)と `home.spec.ts` には影響しない。
- 部分的な切り戻し: (1) **操作**: V5 の `routeStageRelease` を `none` にしてタップ判定を戻す(v2 のタップ方式)。(2) **アシスト**: `ASSIST_TABLE` の `lockStrength` を 0・`preview` を `fade` にすると v2 に近い。(3) **構図**: `battingCameraPortrait` の x と `actors.batter.portrait*` を v2 の値(−0.25 / −0.65 / 0.92 / 1.0)に戻す。(4) **投球**: `gauge.sigmaScale` をすべて 1.0 にし windows を ∞ にするとゲージが無効(質が常にふつう)。(5) **音・触覚・ログ**: 設定の既定を OFF にする/`VITE_PLAYTEST` を付けない(コードは残してよい)。
- 判定・バランス(`BATTING_PARAMS`・結果表・CPU 難易度)は、元の値に戻せば v2 の挙動に戻る(`bot-balance.test` の帯は戻した値に合わせて見直す)。

## 未解決の疑問(ゲート1用に整理)

ユーザーに聞くべき論点(`AskUserQuestion` の選択肢の形で提示する。**推奨を先頭に**)。

1. **Q1 打撃の操作方式**: (推奨)「触れる→スライド→離した瞬間=スイング」(パワプロ式。タップ方式を覆す。ボタン・2本目の指・キーは残る)/ v2 のタップ方式のまま予告・リングだけ追加。
2. **Q2 ロックオンの既定の強さとアシストの持たせ方**: (推奨)難易度に連動(かんたん強・ふつう中・むずかしい弱)、既定の「ふつう」で初心者が打てる強さ(0.55)/ 難易度と独立の「アシスト」設定をタイトルに追加 / ロックオンは無し(予告とリングだけ)。
3. **Q3 サウンドの既定 ON/OFF**: (推奨)既定 ON(ユーザー操作の後)・HUD にミュートボタン。公共の場の配慮が必要なら既定 OFF。**音のデモ(M13)を聴いて決める**。振動の既定(推奨 ON。Android のみ)。
4. **Q4 打者の構図**: (推奨)案 M1 = 打者 scale 0.70・x −0.75・バット 1.45 倍(画面内の打者が左 19%)/ 案 M2 = scale 0.78・x −0.70・バット 1.30 倍(やや控えめ。左 24%)/ 打者を半透明にする。**モックを 2 案並べて選ぶ**。
5. **Q5 投球の方式**: (推奨)ゾーンを直接なぞる+リングゲージ(案 C 簡略版)/ ゾーンを直接なぞるだけでゲージなし(案 D)/ 現行の格子を残してゲージだけ追加(案 B)。
6. **Q6 難易度ボタンの意味**: タイトルの「かんたん/ふつう/むずかしい」を、CPU の強さとアシストの強さの両方に使ってよいか。
7. **Q7 横持ち(横画面)**: (推奨)今回は対象外(縦持ち前提。デスクトップの横長は v2 のまま)/ v3 に含める(構図・操作バーの作り直しが要る。工数大)。ユーザーの持ち方(縦/横)を教えてほしい。
8. **Q8 中間試遊(T1)を入れるか**: (推奨)V21 の直後に試遊ビルドを人間に渡し、20 打席のログと「打てた/微妙/打てない」を聞く(ゲート1・2 以外の人間確認が 1 回増える)/ ゲート2 でのみ試遊する。
9. **Q9 投球のテンポ**: 人間の投球が 1 球あたり約 3.6 秒(v2 は約 2.7 秒)になる。許容か、ゲージを短く(0.9 秒 → 0.7 秒)するか、ゲージなし(Q5)にするか。
10. **Q10 P1(顔・個性・走者の3D化)に進む基準**: 「実機 fps・draw call の計測」節の出発値(fps 中央値 ≥ 55・p95 ≤ 25ms・draw call ≤ 400)でよいか。
11. **Q11 ユーザーが指す「パワプロ」の作品・端末・持ち方・音を出して遊んだか**(調査の未確認事項)。回答しだいで構図(横持ち)・音の優先度が変わる。
12. **Q12 試遊の環境**: どこで遊ぶか(ブラウザ単体 / claude.ai のアーティファクトの iframe / アプリ内)。試遊ビルドの置き場と、ログを渡す方法(貼り付け/ファイル)。
13. **Q13 バナーの文言・派手さ**: 「ジャストミート!」「ホームラン!!」などの文言は自前(パワプロの文言・ロゴ・BGM を模倣しない)。派手さ(フラッシュ・紙吹雪)の上限と、リデュースモーションの扱い。

設計内の未確定の値(V22・V25 が実測で確定する): 打者の `portraitScale/portraitX/portraitBatScale`、ロックオンの強度・`qualityPenalty`、ボットの帯の境界(出発値は仮定)、390×664 以下のゾーン寸法、操作バーの高さ(≈ 130px)、`guide` の各半径。

## 設計レビュー結果

`design-reviewer` による自動レビュー(最大2ラウンド、`/design` 実行時)の記録。

| ラウンド | 判定 | 主な指摘 |
| --- | --- | --- |
| 1 | (未実施) |  |
| 2(ラウンド1がMAJORの場合のみ) | (未実施) |  |

未解決のMAJORが残った場合: (レビュー後に記入)

## コードレビュー結果

`code-reviewer` による自動レビュー(最大2ラウンド、`/implement` 実行時)の記録。

| ラウンド | 判定 | 主な指摘 |
| --- | --- | --- |
| 1 | (未実施) |  |
| 2(ラウンド1がMAJORの場合のみ) | (未実施) |  |

未解決のMAJORが残った場合: (なければ「なし」。テストレポートにも引き継ぐこと)

## 人間確認ゲート記録

| 日時 | 判断 | コメント |
| --- | --- | --- |
|  | 承認 / 修正依頼 / 差し戻し |  |

## 適用した共有メモリ

- 適用: [[visual-scope-must-be-shown-at-gate1]](ゲート1で見せるもの)、[[game-feel-needs-playability-check]](ボット v2・検出力テスト・試遊ログ・数値の受け入れ基準)、[[frontend-3d-three-in-render-segment]](境界の維持・`audio/` の追加)、[[three-r186-pitfalls]](render の追加描画物)、[[sample-app-lint-random-and-index-access]](ボット・音・ジッタの決定論と lint)、[[dom-key-input-exclusivity]](投球のキーの排他)、[[swiftshader-playwright-input-latency]](E2E の有効試行)、[[pure-function-extraction]]、[[feature-segment-import-boundaries-not-enforced]](`audio/` の構造検査)。
- 上のエントリの `related_topics` に `baseball-game-v3` を追記済み(いずれも 2 件目なので、スキル化候補にはまだ達していない。`related_topics` が 3 件以上になったエントリは無い)。
- メモリ候補(ゲート通過後に orchestrator が `docs/memory/` へ記録を検討): decision「打撃の操作は離した瞬間=スイング(v2 のタップ方式を覆した)」、decision「効果音は Web Audio の合成のみ・新セグメント `audio/`」、pitfall/convention「人間代理ボットは個人差の分布・知覚誤差・Fitts を持ち、前回不合格だった設定で『打てない』を再現できる(検出力テスト)ことを受け入れ基準にする」、convention「実機の試遊ログ(端末内記録・要約・較正)を、操作の手触りが価値の機能の設計に入れる」、open-question「横持ち対応の要否」。
