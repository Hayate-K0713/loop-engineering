# 設計: ブラウザ野球 v3(打てる・投げられる・パワプロっぽい手応え — 打撃と投球の骨格の作り直し+構図・演出・音)

- 日付: 2026-10-27
- ステータス: レビュー待ち(設計レビュー ラウンド1の指摘を反映済み。ラウンド2で確認される前提)
- 対応する調査ドキュメント: [docs/investigations/2026-10-27-baseball-game-v3.md](../investigations/2026-10-27-baseball-game-v3.md)(統合)。観点別: [打撃](../investigations/_parts/baseball-game-v3/batting.md)・[投球](../investigations/_parts/baseball-game-v3/pitching.md)・[見た目](../investigations/_parts/baseball-game-v3/visual.md)
- 前版の設計: [docs/designs/2026-10-12-baseball-game.md](2026-10-12-baseball-game.md)(第1版+Three.js 3D 化+「修正設計(H0〜H13)」。以下「v2 設計」)。本書は v2 設計を**置き換えずに上から重ねる**。矛盾する箇所は本書が優先する(覆す決定は「決定の見直し一覧」に全て列挙)。
- 前回のテストレポート(ゲート2承認 → 実機で不合格になった版): [docs/tests/2026-10-19-baseball-game-feel.md](../tests/2026-10-19-baseball-game-feel.md)
- 承認者: (承認ゲート通過時に記入)
- 承認日: (承認ゲート通過時に記入)

## 要旨(先に読む)

- **何を直すか**: v2 修正版は自動テスト全合格・ボット安打率 33%・コードレビュー PASS で通ったが、ユーザーがスマホで遊ぶと「打てない」「投げるのもカス」「パワプロに程遠い」と不合格になった。調査の結論は、(1) 打撃は**着弾点が事前に分からず、振る合図が無く、操作の説明も無い**、(2) 投球は**人間の腕前が結果に効かない**(結果は乱数だけ)、(3) 画面は**打者の後頭部が画面の半分を占め、音が一切ない**、(4) **検証が人間の代理になっていなかった**(ボットが理想的な知覚を持っていた)。
- **v3 の基本線(調査の案C = P0)**: 打撃の骨格(着弾点の予告・縮むリング・ロックオン・「離した瞬間がスイング」・ボールの視認性・初回の説明)、投球の骨格(ゾーンを直接なぞって狙い、縮むリングにタップを合わせるゲージで質が決まる)、見た目・手応え(打者を小さく端へ・カットイン/バナー・Web Audio の合成効果音・振動・位置ずれ表示)、検証の作り直し(人間代理ボット v2・投球ボット・実機の試遊ログ)。**キャラクターの顔・個性・走者の3D化・球場の作り込みは P1(対象外)**で、実機 fps の計測を入れてから可否を判断する。
- **覆す v2 の決定**: 「タップでスイング」(ゲート1 Q-A)、「サウンドはやらない」、「初心者アシストはやらない」、「守備側の操作改善はやらない」、「縦長カメラ x −0.25(Q-B)」。**維持**: 外部素材禁止、three addons 不使用、チームごとの色、タップでの演出スキップ、演出の後に更新、ホーム画面のレイアウト、見逃し確定 D+250ms。
- **実装は 4 段階(A 打撃の骨格 → B 投球の骨格 → C 演出・音 → D 検証・調整)**で、31 ステップ。**A の完了時点で、打撃の骨格だけが通しで遊べるビルドを人間に渡す(中間試遊 T1)**。各段階の終わりに全体が緑になる(typecheck・lint・test・build)。ゲート2の前に、ボット以外の「人間が実機で遊ぶ」確認を必ず入れる。

## ゲート1でユーザーに決めてもらう論点(4 つだけ)

ユーザーにしか決められない論点だけを先頭にまとめる。**これ以外(ロックオンの強さ・構図の細部・投球方式・難易度連動・テンポ・P1 の基準・バナーの文言ほか)は、本書の推奨既定値で進める**(モック・音のデモで見て異論があればゲート1で言ってもらう。詳細は末尾「未解決の疑問」)。

| # | 論点 | 推奨(先頭)と選択肢 |
| --- | --- | --- |
| Q1 | **打撃の操作方式** | (推奨)「触れる→スライド→離した瞬間=スイング」(パワプロ式。v2 のタップ方式を覆す。ボタン・2本目の指・キーは残る)。**見逃すときは指を離さず待つ**(離すとスイング扱い。締切 D+250ms を過ぎた離しは見逃し。球が来る前(D−300ms より前)の離しは持ち替えとみなして無視)。/ 選択肢: v2 のタップ方式のまま予告・リングだけ追加 |
| Q3 | **サウンドの既定** | (推奨)既定 ON(最初の操作の後)・HUD にミュートボタン。振動も既定 ON(Android のみ)。/ 選択肢: 既定 OFF。**音のデモ(`sfx-demo.html`)を聴いて決める** |
| Q7 | **横持ち(横画面)** | (推奨)今回は対象外(縦持ち前提。デスクトップの横長は v2 のまま)。/ 選択肢: v3 に含める(構図・操作バーの作り直しで工数大)。ユーザーの持ち方(縦/横)も教えてほしい |
| Q8 | **中間試遊(T1)を入れるか** | (推奨)入れる。**段階 A(打撃の骨格だけ)が通しで動いた時点**で試遊ビルドを渡し、20 打席のログと「打てた/微妙/打てない」を聞く(ゲート1・2 以外の人間確認が 1 回増える)。この結果で投球・演出に進む前にアシスト強度などを較正できる。/ 選択肢: ゲート2 でのみ試遊する |

## 目的・スコープ

### 目的

スマホで遊んで、**打てる・投げられる・パワプロっぽい手応えがある**ブラウザ野球にする。自動テストの数値(特に v2 のボット)を人間の根拠にせず、「人間が遊んで楽しいか」を受け入れ基準の中心にする。

### v2 で何が起きたか(前回の失敗と再発防止)

| 前回の失敗 | 原因 | v3 での再発防止(本書の該当箇所) |
| --- | --- | --- |
| 打率 33% のボットが合格だったのに人間は「打てない」 | ボットが (a) ストライクだけ振る (b) 到達時刻を偏りなく知覚する (c) 着弾点を 3D の直線外挿で完全に推定する (d) 指の移動・持ち替え時間が無い (e) 個人差が無い(調査 batting.md 2.6) | 「検証 — 人間代理ボット v2」: 見分け誤り・知覚の偏り・2D からの推定誤差・Fitts の法則・**個人差の分布(P10/P50/P90)**・**v3 で新たに生じる失敗の型(見逃し後の離し・飛行中の持ち替え・pointercancel・リングを使わない人)**を入れ、**v2 設定で「打てない」を再現できること(検出力テスト。調整先は共有パラメータに限る)**と**悲観シナリオ**を受け入れ基準にする |
| 守備側(投球)は腕前が結果に効かないまま、検証も無かった | 投球の結果は狙いセル中心にガウス誤差を足すだけ。人間も CPU も同じ腕前(pitching.md) | 投球の腕前(狙いの精度+ゲージ)を結果に効かせ、**投球ボット**で「上手い人ほど抑えられる・同じ配球の連打は打たれる」を数値で守る |
| 見た目・音が「やらないこと」に落ちたままゲート1を通った(`visual-scope-must-be-shown-at-gate1` の再発) | サウンド・カットイン・構図を「スコープ外」にして承認を得た | 「ゲート1で人間に見せるもの」に、**変更後の打撃・守備画面のモック(構図の数値つき)・操作の流れ図・音のデモ・ロックオン強度の表**を列挙する |
| 実機で遊ぶまで不満が見えなかった | 実機の入力・体感のデータが無い | 「実機の試遊ログ」(端末内に記録、**localStorage に依存せず画面から取り出せる**)と「遊べる版を人間に渡すタイミング(T1・T2)」を設計に入れる |

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
- 守備操作(野手を動かす)・送球・走塁、判定窓(±150ms)・ファウル窓・ジャスト窓・**見逃し確定 D+250ms(入力イベントの時刻で判定)**の変更。
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
| 12 | 判定窓 ±150ms・ファウル窓・ジャスト窓・**見逃し確定 D+250ms(入力イベントの時刻で比べる)**・遅延補正(タッチ 70 / マウス・キー 20)・ゾーン実寸・ボール半径の当たり範囲 | **維持**(「動かさない値」)。**指が下りている間の到達通知の保留(D+250+120ms まで)は、離しの処理が描画で遅れても落とさないための「処理遅延の吸収」だけ**で、受理するかは**離した入力のイベント時刻 ≤ D+250ms** で決める(超えたら見逃し) | v2 の検証済みの値。保留で締切を延ばすと、見逃した球の後の自然な指離しが空振りストライクになる(レビュー M1) |
| 13 | 「実機は人間の試遊で確認する(実機の自動検証はしない)」 | **補強**: 実機の試遊ログを端末内に記録して取り出せるようにし、診断できるようにする | 前回は不満の原因を実機で見られなかった |
| 14 | `render/` は three だけ、`model/world/` は three 非依存 | **維持**。音は新セグメント `audio/`(Web Audio の副作用アダプタ。`render/` と同格)+ 純粋データ `model/sound/` に分ける | `frontend-3d-three-in-render-segment` の境界を保つ |
| 15 | スコア更新は演出の後・タップで演出スキップ・チームごとの色・ホーム画面(`/`)の構成 | **維持**(ユーザー決定) | — |
| 16 | CPU 打者・難易度(`aimSigmaScale` 等)・ボット帯の値(B 30〜35% ほか) | **変更**: CPU 打者は球の位置・質に反応する。ボットは v2(個人差・知覚誤差入り)に置き換え、帯を再設定 | 検証の作り直し |

## アーキテクチャ・変更概要

### 全体方針

- 構成は v2 のまま `features/baseball/` の `types/`・`model/`・`render/`・`hooks/`・`ui/` を守る。`model/world/` は three 非依存の純粋関数、`from "three"` は `render/` のみ、`model/` と `render/` は互いに import せず、つなぐのは `hooks/` だけ([[frontend-3d-three-in-render-segment]])。**追加は `audio/` セグメント1つだけ**(Web Audio。`types/` だけを import し、`AudioContext` に触れるのは `audio/` だけ。`audio/` を import するのは `hooks/` だけ)。
- 新しいロジックはすべて純粋関数(`model/`)に切り出す([[pure-function-extraction]])。hooks と ui は薄いグルー。乱数は `Math.random` 禁止・シード付き PRNG か `seq` から導く決定論の関数([[sample-app-lint-random-and-index-access]])。
- 時計は v2 のまま1本(`usePitchFlight.getElapsedMs()`)。ゲージ(投球)はゲーム時計ではなく壁時計(`event.timeStamp`)で測り、`speed.timeScale` で割る(`fast=1` の E2E で短くなる)。
- 判定は reducer の責務のまま。ただし投球の質(`PitchQuality`)と打撃のロックオン(`assistK`)は**判定への入力**として reducer・`resolvePitch` に渡す(表示専用ではない)。
- **ブラウザ保存(`localStorage`)に依存しない**: ユーザーは公開アーティファクト(claude.ai の sandbox iframe)で遊んでいる可能性があり、iframe では `localStorage` が例外を投げ、clipboard・ダウンロードも使えないことがある。現コードは `localStorage` を一切使っていない。v3 は、設定・説明の既読・試遊ログを**メモリを主**とし、`localStorage` は `try/catch` で守った**任意の保存**にする(失敗しても何も起きず、次回の起動で既読が戻るだけ)。

### 1. 打撃の骨格

#### 1-1. 操作(触れる→スライド→離した瞬間=スイング)

v2 との差と共存を表にする(「ステージ」= 入力面 `bb-stage__input`)。**狙いの指(aiming)は `pointerId` で管理する**(「1本目」を `isPrimary` で決めない)。

| 入力 | v3 の動作 | v2 との差 |
| --- | --- | --- |
| タッチ pointerdown(演出中 = `holding`) | スキップ。この指は「持ち越しの指(held)」になる | 同じ |
| タッチ pointerdown(狙いの指が**いない**) | その指が**狙いの指(aiming)**になる。**カーソルは動かさない**(相対ドラッグ) | v2 の「タップ候補」「1本目」を廃止。`isPrimary` ではなく「狙いの指がいるか」で決める |
| タッチ pointerdown(狙いの指が**いる**。2本目以降) | 現在のカーソル位置で**即スイング**(押した時刻。`swingReady` でなければ何もしない) | 同じ |
| タッチ pointermove(狙いの指) | 指の移動量だけカーソルが動く(1:1。ロックオンで補正される) | 同じ |
| **タッチ pointerup(狙いの指)** | `swingReady` かつ**離したイベント時刻が D−300ms 以上 D+250ms 以下**ならその時刻でスイング(動かさずに離した場合も同じ)。それ以外は何もしない(理由は試遊ログに記録: `late` = 見逃し、`regrip` = 持ち替え、`not-ready`、`holding`) | **新**(v2: ≤180ms・≤10px のタップだけがスイング) |
| 持ち越しの指(held)・取り残された指 | **演出が終わった時点で狙いの指に昇格**する(狙いの指がいなければ。相対ドラッグの起点は昇格時点のその指の位置とカーソル位置)。以後は通常の規則(離すとスイング) | **新**: v2 の「演出中に置いて動かさなかった指は離しても振れない」(黙って無効)を直す(レビュー M2) |
| 狙いの指が離れた/キャンセルされたとき他の指が下りている | その指は、次の pointermove で狙いの指に昇格する(`held` の一般化) | 新 |
| スイングボタン pointerdown | 即スイング(押した時刻)。狙いの指がいても押せる | 同じ(両手持ち用の補助) |
| マウス move / pointerdown | 絶対位置で追従 / 押した時刻でスイング | 同じ |
| キー(矢印/WASD、Space/Enter、Z/X) | v2 のまま | 同じ(`defaultPrevented` の排他も同じ。[[dom-key-input-exclusivity]]) |
| pointercancel | スイングしない(狙いを捨てる。回数を試遊ログに記録) | 同じ |

- **離した時刻の判定**: `atMs = (離した pointerup の timeStamp − リリース時刻)×timeScale − 70ms`(`swingAtMs` に `origin = {timeStamp: 離し, sourceTimeStamp: 離し, inputKind: "touch"}` を渡す。式は v2 §2 のまま)。**受理の判定はイベント時刻 `eventMs = (離し − リリース)×timeScale`(遅延補正前)で行う**: `eventMs > D + lateCutoffMs(250)` なら**スイングにせず見逃し**(即座に到達通知)。ボタン・2本目の指・キー・マウスが保留中に処理された場合も同じ基準(`useBattingControls.swingNow` が `eventElapsedMs(origin)` を見る)。
- **見逃し = 指を離さず待つ**: 人は球が過ぎたのを見て反応 200〜250ms 後に離すので、離す時刻は D+250 以降に集まる。この離しは締切を過ぎているので**見逃し**になり、空振りストライクにならない(v2 の見逃し確定 D+250ms と整合)。チュートリアル・ヒントに「見逃すときは 指を はなさずに まつ」を入れる。
- **持ち替え(早い離し)**: 離したイベント時刻が **D−300ms より前**(窓 ±150ms・遅延補正 70ms・余白 80ms を足した、当たる可能性が無い時刻)の離しは、持ち替えとみなして**スイングにせず無視**する(ヒント「リングが ● に かさなるまで 指を はなさない」を最大 3 回まで出す)。D−300ms〜D−150ms の離しは「早い −xxx ms」の空振りとして返す(黙って捨てない)。相対ドラッグで置き直す人が「打てない」と感じる経路を避けるため(レビュー MINOR 4)。マウス・ボタン・2本目の指・キーには適用しない(明示的な操作)。
- **到達通知の保留**: 狙いの指が下りている間は、到達通知(見逃しの確定)を **D + `lateCutoffMs`(250) + `aimGraceMs`(120)まで**保留する。**これは離しの処理が描画で遅れても、イベント時刻が締切内の離しを落とさないため**で、保留中に D+250 を超えたイベント時刻の離しは上の規則で見逃しになる。保留は純関数 `arrivalDue` が毎フレーム判断する(v2 の `holdArrivalFor(200)` の方式を、狙いの指の有無を毎フレーム渡す方式に置き換える)。
- **スイング種別(ミート/強振)**: ボタン・Z/X キーのまま。操作の途中で切り替えたいときは、もう片方の親指で切替ボタンを押す(1本指だけなら、狙う前に選ぶ)。
- **守備中のステージもスクロール・長押しを無効にする**(レビュー M6): `.bb-stage__input--active`(`touch-action: none`)は人間打撃中だけでなく**人間守備中も付ける**。`-webkit-touch-callout: none`・`-webkit-user-select: none` を付け、ステージの `contextmenu` を `preventDefault` する(iOS の長押しコールアウトや画面端のスワイプでの pointercancel を避ける)。Playwright の touch エミュレーションでは再現できないので、**試遊ログに pointercancel の回数と時刻・離しが無視された理由を記録**し、診断表に行を足す。

#### 1-2. 着弾点の予告(`preview`)と縮むリング(先行合図)

投球がリリースされた瞬間(`flight` の出現。t = 0)から、**着弾点に予告の印**を出し、その周りに**D に向かって縮むリング**を出す。リリース前(windup 中)は着弾点が決まっていないので出さない(パワプロは投球モーションの開始で出すが、v3 は `CPU_PITCH` の dispatch がリリース時なので、リリースと同時。残り約 1.3 秒ある)。

- **リング**: 着弾点(ゾーン平面)を中心に、半径が t = 0 で `startRadius`(0.30m。390 幅で約 89px)、t = D で `endRadius = ballRadius × 1.25 = 0.125m`(約 37px。ボールの縁のすぐ外)になる**線形**の縮小(時間写像は掛けない。D 以降は D の半径で保持)。**ボールが着弾点に着いた瞬間にリングがボールを囲む**。これが「先行する今の合図」(v2 のゾーン枠の発光は D−20ms からの結果の合図で、反応時間 200ms 超の人間には使えなかった)。ゾーン枠の発光は残す(確認用)。線幅は画面で約 3px(下の「画面上の px の扱い」)。
- **点の見せ方は難易度で変える**(アシストの `preview`): `exact` = 着弾点の真上に小さな点(半径 0.04m・シアン・黒縁)。`fade` = フェードカーソル(点は出さず、半径 `fadeRadius` の薄い円を、着弾点から `seq` から決まる決定論のずれ `fadeJitter` 以内で動かした位置に出す。円は必ず真の着弾点を含む)。`none` = 点も円も出さない(リングは出る。ボットの v2 設定とロールバック用)。リングは `fade` のときも円の中心に出す。**色はシアン(0x5ce1ff)**にして、黄色のカーソルと区別する。
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
- 難易度ごとの出発値(`ASSIST_TABLE`。A14 がボットで調整してよい。範囲は A14 の「動かしてよい値」):

| 難易度 | lockStrength | captureRadius(ゾーン単位) | rampStart / rampEnd | preview | fadeRadius / fadeJitter | qualityPenalty |
| --- | --- | --- | --- | --- | --- | --- |
| かんたん | 0.80 | 1.6 | 0.30 / 0.80 | exact | — | 0.30 |
| **ふつう(既定)** | **0.55** | **1.2** | 0.35 / 0.85 | exact | — | 0.35 |
| むずかしい | 0.20 | 0.7 | 0.40 / 0.90 | fade | 0.45 / 0.25 | 0.40 |

- アシストは**難易度に連動**する(タイトルの難易度ボタンは CPU の強さとアシストの両方を決める。新しい設定 UI は作らない)。
- 「むずかしい」は v2 に近い(ロックオンほぼ無し)が、**縮むリングと視認性の改善は全難易度に入る**(打てない主因が着弾点の読めなさ・合図の無さだったため)。

#### 1-4. ボールの視認性と「画面上の px の扱い」

| 項目 | v2 | v3 |
| --- | --- | --- |
| 飛行中の最小表示径 | 無し(リリース 7.5px。中継カメラ中だけ 0.95%) | **飛行中も最小表示径**: `ballScaleFor(camera, ball, minRatio)` に飛行用の `minScreenDiameterRatioFlight = 0.0175`(390×844 で約 14.8px)。リリース直後は約 2.0 倍、**D−730ms 付近**(真の径が 14.8px に達する時刻)で 1 倍に戻る(連続・単調) |
| 縁取り | 球の 1.12 倍の黒い殻(径 17px 未満で 1px 未満) | 殻の太さを**画面で 2px 以上**に保つ(`outlineScaleFor(camera, ball, minRatio)`。`ball.outlineScale` として SceneFrame に入れる) |
| 白い服との重なり | 重なる(画面 y<250 = 飛行の 58%) | **ハロー**(球の 1.9 倍の暖色の半透明円。不透明度 0.35)を球の後ろに敷く。輪郭と合わせて背景によらず見える |
| 回転・縫い目 | 無し | **赤い縫い目(2本の半円弧)**と**回転**。球種で回転軸・速さを変える(ストレート=バックスピン、カーブ=トップスピン、スライダー=斜め、フォーク=ほぼ無回転、シュート=逆斜め)。球種の見分け(パワプロの「回転で判断」)の手がかり |
| 位置の手がかり | 影(円盤1つ) | 影は残す。予告の点とリングが主役 |

**画面上の px の扱い(レビュー MINOR 8)**: 「画面で 2px 以上」「線幅 3px」は、ボール位置での px/m(= 描画高さ・距離・FOV)が要る。`applyMarkers` はフレームしか受け取らないので、**px ではなく画面高さに対する比で model が決め、m に直して SceneFrame に入れる**: `shellMinRatio = 0.0024`(844px で 2px)・`ringWidthRatio = 0.0036`(844px で 3px)を `WORLD_PARAMS` に置き、`model/world/camera/rig.ts` の `outlineScaleFor`・`ringWidthFor(camera, point, widthRatio)` が `ratio × 2 × dist × tan(fov/2)` で m に換算する(`ballScaleFor` と同じ式)。結果は `SceneFrame.ball.outlineScale`・`SceneFrame.guide.ring.width`(m)。render は受け取った値をそのまま使う(縮尺を知らなくてよい)。

#### 1-5. 説明(チュートリアル)

- **初回の表示**: 初めて人間が打つ(または投げる)ときに、1球目を始める前に**カード**(3 ページ。「つぎへ/はじめる」ボタン 44px 以上)を出す。**表示中は専用のフラグ `tutorialActive` で次の投球を始めない**(`holding` には合成しない: `holding` に合成するとステージのタップがスキップとして扱われ、Space/Enter が `isSkipKey` に消費されて「つぎへ」をキーで押せない。`tutorialActive` 中はステージの入力を `enabled = false` にし、`useCpuTurn`・人間の投球開始はこのフラグも見る)。既読は `localStorage`(`bb-tutorial-v1`。使えない環境ではメモリのみ = 再読み込みで再表示される)。HUD の「?」(あそびかた)でいつでも再表示(投球が飛んでいない `idle` のときだけ押せる)。
- **打撃のカード**: ①「ゆびをのせて スライドすると カーソル(きいろ)が うごく」②「ボールが くる ところに ● が でる。カーソルを ● に あわせる」③「リングが ● に かさなる しゅんかんに ゆびを はなす = スイング! **みおくる ときは ゆびを はなさずに まつ**」。**投球のカード**: ①「球しゅを えらぶ」②「ゾーンを なぞって ねらいを きめて ゆびを はなす」③「リングが ちぢんで ねらいに かさなる しゅんかんに タップ!(ぴったりで ナイスピッチ)」。
- **最初の数球のヒント**: 人間の打撃・投球のそれぞれ最初の 5 球は、画面下に 1 行のヒント(「リングが ● に かさなったら ゆびを はなす!」/「リングが ねらいに かさなったら タップ!」。球数は `localStorage` が使えればそこに、無ければメモリで数える)。
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

- **質の決まり方**: ゲージの誤差 `e = (停止時刻 − 入力種別の遅延補正) − (ゲージ開始 + 900ms)`。遅延補正は**入力の種類別**(タッチ 70ms・マウス/キー 20ms。`BATTING_PARAMS.inputLatencyMs` と同じ値。`gaugeErrorMs` に `latencyMs` を渡す)。`|e| ≤ 40ms` = ナイス、`≤ 90ms` = グッド、`≤ 160ms` = ふつう、それ以外・タップなし(自動投球)= 失投。**ゲージ開始から `stopGuardMs`(250ms)は停止を受け付けない**(素早い 2 回タップ=ダブルクリックが「確定→即停止」で失投になるのを防ぐ。受け付けなかった入力は無視し、ゲージは続く)。
- **着弾のばらつき**: v2 の σ(`baseSigma 0.28 × 制球 × 疲労`、人間の制球 63 で約 0.384)に質の倍率を掛ける: ナイス ×0.35 / グッド ×0.65 / ふつう ×1.0 / 失投 ×1.7 かつ**狙いを真ん中やや高め(0, 0.15)へ 60% 引き寄せる**(パワプロの「失投はボールゾーンか真ん中」の簡略)。乱数の消費数は変えない(ガウス 2 回のまま)ので、既存の決定論テストの構造は保たれる。
- **狙いは連続座標**(ゾーン単位。±1.67 に制限)。`PitchCommand` を `{ kind, aim: ZonePoint, quality }` に変え、CPU は `CpuPitchChoice { kind, cell }`(セル)を返し、reducer がセル中心を `aim` に直して `quality: "normal"` で投げる(CPU の挙動・既存の CPU テストの構造は保つ)。
- **PC・キー**: マウスは動かすと狙いが追従(絶対位置)、クリックで確定(ゲージ開始)、もう一度クリック(または Space)で停止。キーは矢印で狙いを動かし、Space/Enter で確定→停止。「投げる」ボタン(`throw-pitch`)は、`idle`/`aiming` では「確定」、`gauge` では「とめる!」を同じ操作として受ける(スマホで片手・ボタンだけでも投げられる)。
- **入力面の受け持ち(レビュー MINOR 9)**: 守備中の `bb-stage__input` のポインタイベントは `usePitchingControls` が受け、打撃中は `usePointerInput` が受ける(`useGameStage` が人間打撃/守備のモードで選ぶ)。**演出中のスキップは守備でも `routeStagePointer`(`holding` なら `skip`)を先に通す**ので、振り分けの規則は 1 つ。`usePitchingControls` は座標変換のため `pickZone`・`getZoneRect`(`useStage3d` 由来)を注入で受ける(`getBoundingClientRect` を hooks で使うのは `useSafeArea`・`useStage3d`・`usePointerInput` に限る既存の構造検査 10 と整合: `usePitchingControls` は自分では測らない)。
- **球種チップ**: 球種名・球速(km/h)・曲がり矢印(↘ ↙ ↓ など)を出す。1つ 76×52px。常に選べる(飛行中も次の球の準備として選べる)。

**CPU 打者との整合**(投球が腕前で変わるための反応)

- `PitchFlight.quality` と着弾位置の「縁度」(`extent = max(|x|, |y|)`)で、CPU 打者の入力ノイズを変える。`cursorSigma × qualityFactor × locationFactor`、`timingSigmaMs × (qualityFactor^0.5) × locationFactor'`。`qualityFactor` = ナイス 1.7 / グッド 1.25 / ふつう 1.0 / 失投 0.65(難易度の `qualitySensitivity` で冪にする: かんたん 1.2 / ふつう 1.0 / むずかしい 0.6)。`locationFactor = 1 + 0.9 × max(0, extent − 0.5)`、`locationFactor' = 1 + 0.4 × max(0, extent − 0.5)`。失投は振る確率も ×1.25(上限あり)。
- **同じ球種の連投は不利**にする: 直前の球種が同じなら `cursorSigma` を ×0.85(CPU の連投ペナルティと対称。`lastPitchKind` は既にある)。
- CPU 同士(`balance.test.ts`)も位置・質に反応するので打率が下がる。B3 が `cursorSigma`/`timingSigmaMs`/`zoneSwingRate` の出発値を調整し、**`balance.test.ts` の基準は変えない**(打率 .23〜.29 を保つ)。

**テンポ**: 人間の windup 700ms → **280ms**(`PlaybackSpeed.humanWindupMs`)、CPU の windup 700ms → **550ms**(`cpuWaitMs`)、テロップ: ボール 500 → 380ms、空振り 700 → 520ms、ファウル 700 → 520ms、インプレー 1100 → 900ms、余韻 200 → 120ms。**1球の所要(スキップなし)の式**: `windup + D + (人間打者で指が無い見逃し: lateCutoffMs / CPU 打者: 前倒し分を引いて 0)+ テロップ + 余韻`。ストレート(D = 1310ms)の CPU 投手・人間打者の見逃しで 550 + 1310 + 250 + 380 + 120 ≈ **2.6 秒**(v2 は 700 + 1310 + 250 + 500 + 200 ≈ 3.0 秒)、カーブ(D = 1652ms)は +342ms。指を下ろしたままの見逃しは D+370ms で確定するので +120ms。人間の投球は(狙い 約 0.5 秒+ゲージ 約 1.0 秒+windup 0.28+飛行 1.33+結果 0.5)で約 3.6 秒(v2 の 2.7 秒より長いが、腕前の要素の対価。スキップ可)。

### 3. 見た目・手応え(P0)

#### 3-1. 構図(390×844。数値の根拠は「構図の手計算」節)

| 要素 | v2 | v3 |
| --- | --- | --- |
| カメラ(縦長) | 位置 (−0.25, 1.75, 2.6)・注視 (−0.25, 0.55, −18) | **位置 (0, 1.75, 2.6)・注視 (0, 0.55, −18)**(高さ・奥行き・FOV の式 `fit` は v2 のまま)。ゾーンと投手が画面中央(x 195)で縦に並び、ボールの通り道が打者から離れる |
| 打者(縦長) | scale 0.92・x −0.65。頭が x 0〜212(画面幅の 54%) | **scale 0.70・x −0.75**。頭の中心 x ≈ −31px・半径 ≈ 106px(**画面内に見える頭は x ≤ 74px = 19%**)。胴の右端 ≈ 38px |
| バット | 打者の scale に従う(長さ 0.87m) | **バット軸の長さだけ 1.50 倍**(`BatPose.lengthScale`。**チルトグループの z 方向の拡大**で、太さ・スイング軸の位置オフセット 0.05m は伸ばさない)。打者を小さくしても接触時の先端が x ≈ +0.30m(ゾーン右端 0.26m の外)に届く。式: `先端 x = x_b + scale × (0.05 + 0.975 × L × cos(tilt) × cos(sweepYaw))`(接触時 tilt −0.05・sweepYaw −0.1) |
| 守備レイアウト | tan 0.38。ゾーン 102×115px。格子を操作バーの上に収める | **打撃と同じ構図**(tan 0.25・ゾーン 155×175px)。操作バーが ≈ 130px に縮む(格子を外すため) |
| 打者(守備側の CPU 打者) | 左 1/3 を覆い格子の約 10% を隠す | 同じ縮小・端寄せ(打撃と同じ打者配置) |

#### 3-2. 演出(バナー・カットイン・接触演出・位置ずれ)

- **バナー(`ui/EffectBanner`、DOM+CSS)**: 純関数 `bannerFor(outcome, landing, timing)` が文言・種類・色・表示区間を決める。種類: `just`(ジャストミート!)、`hit`(ヒット/二塁打/三塁打)、`homerun`(全面フラッシュ+大文字+紙吹雪の CSS)、`strikeout`(三振!)、`walk`(フォアボール)、`out`(アウト系は小さく)、`nice-pitch`(守備のナイスピッチ)。画面上から 30〜42% の斜めの帯(チーム色の縁取り)。ボール/ストライク/空振り/ファウルは v2 のテロップのまま。バナーが出る結果はテロップを出さない(重複させない)。スキップ(タップ)で即消える。
- **接触演出(純関数 `hitFxAt`)**: ジャスト・強い当たりで**ヒットストップ**(バットと打球を 60ms〜40ms 止める。`PlayPlan.hitStopMs`。演出の時刻表を後ろへずらす)、**ズームパンチ**(接触後 140ms で FOV を 4% 狭めて戻す)、**微小なシェイク**(振幅 0.012m)。`prefers-reduced-motion` では全て無効(入力の `reducedMotion`)。
- **位置ずれ表示**: スイング後 900ms、3D に**白い十字(有効カーソルの中心)・シアンの輪(ボールの着弾点)・両者を結ぶ細い線**を重ね、タイミングのピルを 2 行にする(1 行目 = 「ジャスト!」「早い −62ms」「遅い +48ms」、2 行目 = 「芯」「ふつう」「かすり」「ミス」。純関数 `contactFeedbackOf`)。空振り・ファウルの理由が分かり、学習できる。

#### 3-3. 音と触覚

- **音(Web Audio の合成。`audio/` + `model/sound/`)**: 外部素材なし。効果音一覧(`SfxCue`): `pitch-release`(ヒュッ)、`mitt`(パン。ボール・ストライクの到達)、`swing-miss`(ブンッ)、`hit-just`(カキーン。高い打撃音+余韻)、`hit-normal`、`hit-weak`、`foul`、`grounder`、`homerun`(打撃音+歓声のうねり 2 秒)、`cheer-small`・`cheer-big`(ノイズ+帯域フィルタの歓声)、`strike`・`ball`・`out`・`strikeout`・`walk`(短いジングル)、`ui-tap`・`ui-select`、`gauge-tick`(ゲージの接近音)、`nice-pitch`。音色は「レシピ」(型 `SfxRecipe`。オシレータ・ノイズ・フィルタ・エンベロープのデータ表)で定義し、純関数 `sfxEventsOf(plan, flight)` が「いつ・どの音を・どの強さで」を決める(単体テストできる)。`audio/engine.ts` は **`createAudioEngine({ recipes, createContext })`**(レシピ表は hooks が `model/sound/` から取って渡す。`audio/` は `types/` の `SfxRecipe` だけに依存)でレシピを実行する(ミュート・同時発音数の上限 8)。
- **iOS・autoplay**: `AudioContext` の作成と `unlock()` は、**ユーザー操作として認められるイベント**(タッチなら `pointerup`/`touchend`、`click`、`keydown`。`pointerdown` では解除されない)の中で行う。`suspended`/`interrupted` からの復帰は `visibilitychange` と次の操作で `resume()`。
- **既定は ON**(最初の操作の後)。HUD のスピーカーボタンと、タイトルの切替で ON/OFF(`bb-prefs-v1`。保存は任意)。iOS のサイレントスイッチ(マナーモード)では Web Audio も鳴らないので、チュートリアルに一言書く。**ゲート1で音のデモ(`sfx-demo.html`。使い捨て)を聴いて決める**(Q3)。
- **触覚(`navigator.vibrate`。Android のみ)**: パターン表(`haptics.ts`。多くの Android 端末は 15ms 未満を無視するので**最短 15〜20ms**): スイング 15ms、ジャスト 25ms+短い間+35ms、ヒット 20ms、ホームラン [30,40,30,40,90]、三振 30ms、ナイスピッチ 20ms。80ms 未満の連続は間引く。`prefers-reduced-motion`・設定 OFF で無効。iOS は非対応(何もしない)。

### 4. 検証の作り直し

#### 4-1. 人間代理ボット v2(打撃)

v2 のボット(`model/sim/bot-sim.ts`)の欠点(調査 batting.md 2.6)を直した、**個人差のある複数の仮想プレイヤー**。`model/sim/human-bot.ts`(+PA シミュレータ `human-game.ts`)に置く(テスト専用層。`*.test.ts` 以外から import しない)。乱数は mulberry32。

**1 人の仮想プレイヤーのパラメータ**(レベルごとの分布から 1 人 1 組サンプルし、レベルあたり 40 人 × 各 2000 球。結果は P10/P50/P90 で見る):

| パラメータ | 意味・根拠 | 初心者 | 中級 | 上級 |
| --- | --- | --- | --- | --- |
| `reactMs` | 見て動き出すまで(反応時間 200〜250ms。batting.md) | N(280, 40) | N(230, 30) | N(190, 25) |
| `biasMs`(リング有り) | 到達の知覚の偏り(正 = 遅く感じて遅く離す)。リングが収束を明示するので v2(+130ms の looming)より小さい**と仮定した値(根拠なし。T1・T2 のログで較正する)** | N(+40, 45) | N(+15, 35) | N(0, 25) |
| `biasMs`(リング無し = v2 設定) | looming のみ。**調査(batting.md 2.5)の値 +130ms 前後で固定**。検出力テストを通すために動かしてはならない | N(+130, 50) | N(+130, 50) | N(+100, 40) |
| `timingSigmaMs` | 離す時刻のばらつき | 85 | 60 | 40 |
| `latencyMs` | 表示+入力の遅延(端末) | N(80, 20) | N(80, 20) | N(70, 15) |
| `fingerSigmaPx` | カーソルの最終位置の指のぶれ | 12 | 8 | 5 |
| `perceiveSigmaZone`(予告 exact) | 予告の点の位置の知覚誤差(ゾーン単位) | 0.18 | 0.10 | 0.06 |
| `swingAtStrike` / `chaseBall` | ストライク/ボール球を振る率の基準(予告の見分けの誤りに加えて) | 0.80 / 0.30 | 0.85 / 0.20 | 0.90 / 0.12 |
| Fitts の `a, b, W` | カーソルの移動時間 `MT = a + b·log2(1 + 距離px / W)`(a=120ms, b=140ms/bit, W=40px) | 同 | 同 | b=110 |
| **失敗の型(v3 で新たに生じる)** | | | | |
| `takeRelease` | 見送る球で、**指を下ろしたまま D + reactMs に離してしまう**(見逃しの合図を知らない・反射で離す)確率。離す時刻が D+250 以内ならスイング扱いになる | 0.35 | 0.15 | 0.03 |
| `regripRate` | 飛行中に**持ち替え**(D−300ms より前に離す)する確率/球 | 0.08 | 0.04 | 0.01 |
| `cancelRate` | pointercancel でスイングが無くなる確率/球(スクロール・端スワイプ) | 0.02 | 0.01 | 0.005 |
| `ignoreRing` | リングを使わず、v2 と同じ知覚(`biasMs` のリング無しの値)で打つ人の割合 | 0.25 | 0.15 | 0.05 |

**知覚の定義**(v2 ボットとの違い):
- **ボール/ストライクの見分け**: 予告(exact)の知覚位置 = 真の着弾 + N(0, perceiveSigma)。ゾーンの外か内かを、知覚位置と「境界の余白(N(0.15, 0.2))」で判断して振る/見送る。予告なし(v2 設定)では、2D 画面の座標から「現在の画面速度で等速に進む」と外挿して着弾を逆投影する(奥行きの推定誤差が出る。投影は `camera/project.ts`)。2 ストライクでは境界を広げて守りに行く(ゾーン外 +0.4 まで振る)。
- **カーソルの動き**: `reactMs` 後に動き出し、Fitts の移動時間で目標へ向かう(間に合わなければ途中位置で離す)。**開始位置は前の球で最後にあった位置**(v2 の持ち替え)。ロックオンは有効カーソルの式をそのまま使う。
- **離す時刻**: `event = D + biasMs + latencyMs + N(0, timingSigmaMs)`。**イベント時刻が D+250 を超えたら見逃し扱い**(実装と同じ受理判定。保留 +120ms は処理遅延の吸収なのでボットでは使わない)。判定時刻は `swingAtMs`(`− 70ms`)。持ち替えガード(D−300ms)・pointercancel・見逃しの離しは上の確率で入れる。
- **出力(レベルごと、P10/P50/P90)**: 打率(安打 ÷ (打席 − 四球))、三振率、四球率、コンタクト率(スイングのうち空振りでない割合)、ストライクを振る率・ボールを振る率、**見送る球での誤スイング率**(`takeRelease` で離してスイング扱いになった割合)、離す時刻の平均と SD、カーソルと着弾点の距離の中央値(px)。

**PA シミュレータ**: `reduce`(CPU 投手→ボットのスイング/見逃し)を直接駆動し、カウント・四球・三振を含めた打席結果を数える(`simulate.ts` の CPU 同士と同じ reducer。人間のスイングを `SWING`、見逃しを `PITCH_ARRIVED` で入れる)。

**検出力テスト(前回の再発防止の核)と調整先の限定**: ボットは「v2 設定」(`ASSIST_OFF`: ロックオン 0・予告 `none`・リングなし・`biasMs` はリング無しの値・タップ入力)で、**前回ユーザーが「打てない」と評価した状態を再現できなければならない**。受け入れ: 初心者の打率 P50 ≤ .17 かつコンタクト率 P50 ≤ 50%、中級の打率 P50 ≤ .22。**E1 を通すための調整は、v3 の帯(E2〜E7)にも同じ値で効く共有パラメータ(`timingSigmaMs`・`fingerSigmaPx`・`reactMs`・Fitts・`perceiveSigmaZone`・失敗の型)に限り、「リング無し」の `biasMs` は調査の値で固定する**(`biasMs` だけを上げて E1 を通す抜け道を塞ぐ)。同じ母集団を E2〜E7 にも適用する。再現できなければボットのパラメータが楽観的なので、人間らしい範囲(上表の ±30%)で共有パラメータを調整し、調整の推移を完了報告に書く。

**悲観シナリオ**(v3 の楽観の検出): リング有りの `biasMs` を「リング無しの値と上表の値の中間」(初心者 +85)にしても、初心者の打率 P50 ≥ .15・コンタクト率 P50 ≥ 45% を要求する。満たさなければ、リングの見せ方・ロックオン強度に余裕が無いことを意味するので、値の推移を完了報告に出して設計の見直しとして上申する。

**実機ログでの較正**: 試遊ログ(4-3)の `fitBotParams(records)` が、実測の離す時刻の平均・SD、距離の中央値、持ち替え・pointercancel・見送りでの離しの率から `biasMs`・`timingSigmaMs`・`fingerSigmaPx`・失敗の型を推定して出力する。A14 は、T1 のログが得られていればそれを使ってレベルの分布の中心を較正する(得られていなければ上表の値で進め、ゲート2のログで較正する)。

**ボットテストの時間予算(レビュー MINOR 11)**: 3 レベル × 40 人 × 2000 球 × (v3 設定・v2 設定・悲観・難易度 3 種)と旧ボット・投球ボットは `npm run test` と CI の時間に効く。**通常のテストは縮約(1 レベル 30 人 × 1000 球)で実行し、帯は統計誤差(P50 の標準誤差)を見込んで引く。完全版(40 人 × 2000 球)は環境変数 `BOT_FULL=1` のときだけ**走らせる(`/test` と完了報告は完全版)。ボットのテストは 1 ファイル 60 秒以内・`vitest` のタイムアウトを明記し、ファイルを分けて並列に回す。全体の増加は 90 秒以内を目標とする。

#### 4-2. 投球ボット

`model/sim/pitch-bot.ts`。仮想プレイヤー(レベルあたり 40 人)のパラメータ: ゲージのタップ時刻のばらつき `timingSigmaMs`(初心者 110 / 中級 70 / 上級 45)とバイアス(0 / +20 / 0)、指のぶれ `fingerSigmaPx`(10 / 7 / 5。ゾーン単位へは `pxPerZoneUnit` で換算)、配球戦略(初心者=ゾーン内をほぼ中央・同じ球種、中級=縁を 40%・球種を変える、上級=縁 60%+球種とコースを変える、「中央連打」=比較用)。ダブルクリック(ゲージ開始から 250ms 未満の停止)は `stopGuardMs` で無視される。CPU 打者(ふつう)との PA を `reduce` で回し、被打率・ストライク率・四球率・ナイス率を出す(受け入れは「テスト戦略」)。

#### 4-3. 実機の試遊ログ(開発/試遊ビルド限定。localStorage に依存しない)

- **有効化**: `import.meta.env.DEV` または `VITE_PLAYTEST=1` でビルドしたときだけ。通常の本番ビルドでは UI も記録も無い(`hooks/usePlaytestLog.ts` の定数で分岐し、バンドルから落とす)。
- **記録の置き場**(レビュー M7): **メモリ(`useRef` のリングバッファ、最大 600 件)を主**とし、`localStorage`(キー `bb-playtest-v1`)への保存は `try/catch` で守った**任意**(失敗・容量超過は握りつぶさず、パネルに「保存できません(このまま画面から取り出してください)」と出す)。外部送信なし・個人情報なし。
- **記録の内容**:
  - 打撃 1 球ごと: 球種・D・着弾点・予告モード・難易度/アシスト、**スイングの入力種別(touch-release / touch-second / button / mouse / key)・離した時刻(リリースからの ms)・判定時刻 `atMs`・`dtMs`(= atMs − D)・素のカーソル・有効カーソル・`assistK`・カーソルとボールの距離(楕円正規化 d と px)・指の総移動量**、結果(種別・インプレー結果・打席結果・接触したか)。スイングしなかった球は「見逃し」とその着弾がゾーン内か。
  - **無視された入力**(離しが受理されなかった): 理由(`late` / `regrip` / `not-ready` / `holding`)・イベント時刻・**pointercancel の回数と時刻**。
  - 投球 1 球ごと: 狙い・着弾・ゲージの停止時刻と誤差 `errMs`・質・結果。
  - 共通: セッション ID、端末情報(`innerWidth/Height`・`devicePixelRatio`・`pointer: coarse`・`visualViewport.scale`・UA)、飛行中の fps(rAF の間隔の中央値・p95・落ちたフレームの割合)。
  - 起動時 1 回: `renderer.info.render.calls` と三角形数(`StageHandle.stats()`)。
- **取り出し(タイトルの「試遊ログ」)**: **必ず動く経路は「画面表示」**: 要約表(打席数・打率・コンタクト率・ストライクを振る率・ボールを振る率・離す時刻の平均と SD・距離の中央値 px・ナイス率・無視された入力の内訳)と、**全選択できる `<textarea readonly>`(JSON)**(長押し→コピーで取り出せる)。加えて「コピー」(`navigator.clipboard`)、「ダウンロード」(`.json` と `.csv`)、「共有」(Web Share が使えれば)、「消去」。sandbox の iframe で使えない経路はボタンを無効化せず、失敗を表示する。画面が縮小表示されている疑い(`innerWidth ≥ 900` かつ `pointer: coarse`)を警告する(公開アーティファクトの HTML には viewport meta があることを確認済みなので、これは別環境・将来の退行の検出用)。
- **診断の使い方**: 人間が 20 打席(約 60 球)遊んでログを渡す → `summarize(records)` の出力で「打てない原因」を切り分ける(下表)。

| 症状(ログの値) | 疑う原因 | 打つ手 |
| --- | --- | --- |
| 離す時刻の平均 `dtMs` が +80ms 以上 | 到達の知覚の偏り・遅延補正の不足 | 遅延補正(70ms)の見直し、リングの見せ方 |
| `dtMs` の SD が 100ms 以上 | リズムが取れない(合図が弱い) | リングの太さ・音・球速 |
| 距離の中央値が 60px 以上 | カーソルが間に合わない・ロックオンが弱い | ロックオン強度・ドラッグの感度 |
| 離した入力が `touch-second`/`button` ばかり | 1 本指の「離す=スイング」が使われていない | チュートリアルの見直し |
| ボールを振る率が高い | 予告(ゾーン内外)が読めていない | 予告の見せ方 |
| 無視された離しの `late` が多い | 見逃し時に指を離してしまう(「待つ」が伝わっていない) | ヒント・チュートリアル・締切の見直し |
| 無視された離しの `regrip` が多い | 持ち替えの多用 | ガード時刻・ヒントの見直し |
| **pointercancel が多い** | 守備・打撃でスクロール/コールアウト/端スワイプが効いている | `touch-action`・端のマージン・コンテキストメニュー抑止の見直し |
| fps の p95 が 33ms 超 | 描画負荷 | 描画予算(pixelRatio・影・メッシュ統合) |

#### 4-4. 実機 fps・draw call の計測(P1 の可否判断)

- 計測: (1) `StageHandle.stats()` で draw call・三角形数(起動時+各投球の最初のフレーム)、(2) `hooks/useFramePerf` で飛行中の rAF 間隔(中央値・p95)。いずれも試遊ログに入る。
- **P1(顔・個性・走者の3D化)へ進む条件(出発値。ゲート2でユーザーが判断)**: ユーザーの実機で、打撃の飛行中の fps の中央値 ≥ 55、p95 のフレーム時間 ≤ 25ms、draw call ≤ 400(v2 の推定は約 350+影)。満たさなければ P1 は先に描画予算(メッシュ統合・影の対象を絞る・`pixelRatio` の見直し)を作業とする。

### 5. 契約(`types/`・`WORLD_PARAMS`・主要な関数)

`types/` は並列実装の契約で、**ステップ A0 で段階 A〜C の分をすべて凍結**する。並列中の不足は編集せず完了報告で上申する(orchestrator がウェーブ間で直列に反映する)。**並列ステップが共有する型はすべてここに置く**(レビュー M4)。

**`types/batting.ts`**: `AssistParams`(上の表の列。`preview: "exact" | "fade" | "none"`)、`SwingInput.assistK?: number`(省略 = 0)、`SwingMeta = { input: "touch-release" | "touch-second" | "button" | "mouse" | "key"; rawCursor: ZonePoint; eventMs: number; fingerMovedPx: number }`、`IgnoredInputReason = "late" | "regrip" | "not-ready" | "holding"`、`ContactFeedback = { dx: number; dy: number; d: number; band: "center" | "near" | "edge" | "scrape" | "miss" }`。

**`types/pitch.ts`**: `PitchQuality = "nice" | "good" | "normal" | "miss"`、`PitchCommand = { kind; aim: ZonePoint; quality: PitchQuality }`、`CpuPitchChoice = { kind; cell: CourseCell }`(`chooseCpuPitch` の戻り)、`PitchFlight.quality: PitchQuality`。**投球入力の型(B1・B4・B5・B6 と UI が共有)**: `PitchInputPhase = "idle" | "aiming" | "gauge" | "throwing"`、`PitchInputState`(`phase`・`aim`・`pointerId`・`gaugeStartedAtMs`)、`PitchInputEvent`(down/move/up/button/key/tick/cancel の判別共用体)、`PitchInputCtx`(`enabled`・`holding`・`timeScale`・`inputKind`・`nowMs`)、`PitchInputEffect = "none" | "start-gauge" | "throw"`、`PitchInputView = { phase; aim: ZonePoint; gaugeElapsedMs: number | null; quality: PitchQuality | null }`(SceneFrameInput・UI の `data-input-state`・`GameLayout` の `inputState` に使う)。

**`types/game.ts`**: `PlaybackSpeed.humanWindupMs: number`(通常 280 / fast 20)。`cpuWaitMs` は通常 550。

**`types/scene.ts`**(`SceneFrame` の追加。`aim`(セルのハイライト)は削除し `guide` に置き換える):
- `guide: { visible: boolean; mode: "exact" | "fade" | "reticle" | "none"; position: Vec3; markerRadius: number; fadeRadius: number; alpha: number; ring: { visible: boolean; radius: number; width: number; tone: "preview" | "gauge"; glow: number }; spread: { visible: boolean; radius: number } }`(打撃=予告、守備=照準+散布円。リングは同じ描画部品。`ring.width` は m で model が換算)。
- `feedback: { visible: boolean; tone: "swing" | "pitch"; from: Vec3; to: Vec3; alpha: number }`(位置ずれ・狙いと着弾の重ね表示)。
- `cursor` に `raw: { visible: boolean; position: Vec3 }`(指の素のカーソルの淡い印。有効カーソルと離れているときだけ見せる)。
- `ball` に `rotation: Rot3`・`halo: number`(0〜1)・`outlineScale: number`(殻の倍率)。`ball.scale` は飛行中も 1 以上(視認性)。
- `BatPose.lengthScale: number`(既定 1。チルトグループの z 方向の拡大)。

**`types/stage.ts`**: `StageHandle.stats(): { drawCalls: number; triangles: number } | null`。

**`types/sound.ts`(新規)**: `SfxCue`(上の一覧)、`SfxEvent = { atMs: number; cue: SfxCue; gain: number }`、**`SfxLayer`・`SfxRecipe = { durationMs: number; layers: readonly SfxLayer[] }`・`SfxRecipeTable = ReadonlyMap<SfxCue, SfxRecipe>`**(`audio/` と `model/sound/` と hooks が共有)、`HapticCue`。**`types/telemetry.ts`(新規)**: `PlaytestRecord`(打撃/投球/無視された入力の判別共用体)、`PlaytestSummary`。

**`types/view.ts`**: `GameView.difficulty`・`GameView.assist: AssistParams`(`assistFor(difficulty)` の値)、`pitcher.repertoire` の各要素に `speedKmh: number`・`arrow: "none" | "right" | "left" | "down" | "down-right" | "down-left"`。**`BannerKind = "just" | "hit" | "homerun" | "strikeout" | "walk" | "out" | "nice-pitch"`・`BannerView = { kind; text; subtext: string | null; tone: "team" | "gold" | "red"; startMs: number; endMs: number }`**(`bannerFor` が返し、`StageView`・`EffectBanner` が受ける)、**`TutorialStep = { id: string; role: "batting" | "pitching"; title: string; body: string; art: "slide" | "release" | "aim" | "gauge" }`**(`model/tutorial/steps.ts` が返し、`Tutorial` が受ける)。

**`hooks/useGameStage.ts` の `GameStageViewProps`**(A0 で型だけ追加。`StageView` の props はこれ。値の実装は各段階の統合ステップ): 既存に加えて `banner: BannerView | null`・`guideMode`・`inputState: PitchInputView | null`・`pitchQuality: PitchQuality | null`・`hint: string | null`・`regripHint: boolean`。`GameLayout` の `stageProps` はこの型をそのまま渡す。

**`WORLD_PARAMS` の追加・変更(A0 で値まで入れる)**:
- `battingCameraPortrait`: position `(0, 1.75, 2.6)`・target `(0, 0.55, −18)`。
- `actors.batter`: `portraitX −0.75`、`portraitScale 0.70`、`portraitBatLength 1.50`(横長は 0.92・−0.8・1.0 のまま。縦横比の補間 `k` で混ぜる)。
- `framing.fit.pitching`: `defaultHalfWidthTan 0.25`・`maxHalfWidthTan 0.65`・`defaultSafeArea { top 0.1837, bottom 0.846 }`(守備の操作バーが約 130px になる前提。実際の構図は `useSafeArea` の実測値で決まる)。
- `ball`: `minScreenDiameterRatioFlight 0.0175`、`shellMinRatio 0.0024`、`halo { scale 1.9, opacity 0.35 }`、`spin`(球種ごとの軸と角速度の表)。
- `guide`: `previewRing { startRadius 0.30, endRadiusRatio 1.25 }`、`ringWidthRatio 0.0036`、`dot { radius 0.04 }`、`fadeInMs 120`、`gaugeRing { startRadius 0.40, endRadius 0.12, afterRatio 0.4 }`、`feedbackMs 900`、`resultOverlayMs 700`。
- `fx`: `contactPunch { ms 140, fovScale 0.96, shake 0.012 }`、`hitStop { justMs 60, strongMs 40 }`。
- `telop`: `inPlayMs 900, foulMs 520, swingMissMs 520, takeMs 380, afterglowMs 120`。バナーの区間(`banner { hitMs 900, homerunMs 1600, strikeoutMs 1000, walkMs 900, justMs 700 }`)。

**`BATTING_PARAMS` の追加**: `aimGraceMs 120`、`regripBeforeMs 300`(離したイベント時刻が D−この値より前は持ち替え)(他は v2 のまま。「動かさない値」は v2 の一覧を継承)。**`PITCH_PARAMS` の追加**: `gauge { ringMs 900, graceMs 300, stopGuardMs 250, windows { nice 40, good 90, normal 160 }, sigmaScale { nice 0.35, good 0.65, normal 1.0, miss 1.7 }, missPull { x 0, y 0.15, ratio 0.6 }, aimLimit 1.67 }`。

**主要な関数のシグネチャ(実装は担当ステップ)**:
- `model/batting/assist.ts`: `ASSIST_TABLE`・`assistFor(difficulty): AssistParams`(A0)、`lockOnCursor({ raw, landing, progress, assist }): { cursor: ZonePoint; k: number }`、`previewCenterOf(flight, assist): ZonePoint`(`fade` の決定論のずれ)、`qualityScaleOf(k, assist): number`(A1)。
- `model/world/camera/rig.ts`(A2): `ballScaleFor(camera, ball, minRatio)`(**シグネチャ変更**。中継カメラ中は `ball.minScreenDiameterRatio`、飛行中は `minScreenDiameterRatioFlight` を渡す)、`outlineScaleFor(camera, ball, minRatio)`、`ringWidthFor(camera, point, widthRatio)`。
- `model/pitch/gauge.ts`(A3): `pitchQualityOf(errMs)`、`sigmaScaleOf(quality)`、`gaugeErrorMs({ startedAtMs, stopAtMs, latencyMs, timeScale })`、`isStopAccepted(elapsedMs, timeScale)`(`stopGuardMs`)、`gaugeRingAt(elapsedMs, timeScale): { radius; glow; expired }`。`deliverPitch` は `command.quality` から σ を決める。
- `model/world/sequence/swing-time.ts`(A4): `eventElapsedMs({ origin, startedAtMs, timeScale })`(遅延補正前の離し/押下のリリースからの経過)。`input-route.ts`: `routeStagePointer({ holding, enabled, pointerType, aiming, button })`、`routeStageMove`(`held` の昇格を含む)、`routeStageRelease({ pointerType, isAimingPointer, swingReady, holding, enabled, eventMs, durationMs }): { action: "swing-release" | "none"; reason: IgnoredInputReason | null }`、`shouldPromoteHeld({ holding, enabled, held, aiming })`。`arrival.ts`: `arrivalDue({ elapsedMs, arriveAtMs, aiming, aimGraceMs, ... })`。`session.ts`: `SwingRecord` に `meta?: SwingMeta`、`recordSwing(current, seq, input, meta?)`。
- `model/world/sequence/pitch-input.ts`(B1): `reducePitchInput(state, event, ctx): { state; effect }`。
- `model/world/sequence/{guide,ball-look,contact-feedback}.ts`(A5): `guideFrameAt(...)`・`previewRingAt(durationMs, tMs)`・`pitchGuideAt(...)`(守備の照準・散布円・ゲージのリング・結果の重ね表示)、`ballSpinAt(kind, tMs): Rot3`・`ballHaloAt`、`contactFeedbackOf`。`model/world/sequence/{banner,hit-fx}.ts`(C1): `bannerFor`、`hitFxAt(sinceContactMs, intensity, reducedMotion)`。
- `model/sound/{cues,sfx-plan,haptics}.ts`(C2。**3D の世界と無関係なので `model/world/` の外**): `SFX_RECIPES: SfxRecipeTable`、`sfxEventsOf(plan, flight)`、`gaugeTicksOf(startMs)`、`hapticFor(cue)`。
- `model/world/motion/batter-layout.ts`(A2): `batterRootFor(aspect)`(位置・scale。**補間後の scale を返す**)、`batLengthScaleFor(aspect)`、`batTipX(root, lengthScale, tilt, sweepYaw)`(上の式)。`sequence/frame.ts` の `batHeightInRoot` は定数 `ACTORS.batter.scale` ではなく**この補間後の scale** で割る(A11。でないとバットがボールの高さからずれる)。
- `model/telemetry/*`(A6): `appendRecord`(リングバッファ)、`summarize(records)`、`toCsv(records)`(`PlaytestPanel` のダウンロードから使う)、`fitBotParams(records)`。`model/prefs/{prefs,safe-store}.ts`: `parsePrefs`・`DEFAULT_PREFS`、**`createSafeStore(getStorage)`(`localStorage` が例外を投げても握りつぶしてメモリで動く。node で偽のストレージを注入してテスト)**。`model/tutorial/steps.ts`: `tutorialStepsFor(role): readonly TutorialStep[]`・`nextTutorialStep`。
- `audio/engine.ts`(C3): `createAudioEngine({ recipes, createContext }): { unlock(): void; play(cue, gain?): void; setMuted(muted): void; dispose(): void }`。
- `hooks`: `usePreferences`・`usePlaytestLog`・`useFramePerf`(A10)、`useSfx`・`useHaptics`(C5)、`usePitchingControls`・`usePitchKeyboard`(B4)。`usePointerInput`・`useBattingControls`・`usePitchFlight`・`useKeyboardInput` は A9 が変更。
- `ui` の props 契約(各段階の UI ステップと統合ステップの取り合い): `GameLayout` は A12 で `tutorial`/`playtest` スロットを追加、B2 で `selection`・`onSelectCell`・`CourseGrid` 関連を削除して `pitch: { selectedKind; onSelectKind; action: { label: "投げる" | "とめる!"; enabled: boolean; onAction: () => void }; inputState: PitchInputView | null }` を追加、C4 で `sound: { muted; onToggle }`・`onOpenHelp` を追加する。

### 6. 変更ファイル(概要)

パスは `sample-app/frontend/src/features/baseball/` 相対(E2E・ドキュメントを除く)。担当は「実装ステップ」の ID。

| 区分 | ファイル | 内容 | 担当 |
| --- | --- | --- | --- |
| 変更 | `types/{batting,pitch,game,scene,stage,view}.ts`、新規 `types/{sound,telemetry}.ts`、`hooks/useGameStage.ts`(型のみ)、`render/test-fixtures.ts`(`makeFrame` の既定値) | 契約(§5。段階 A〜C の分) | A0 |
| 変更 | `model/world/space/params.ts`、`model/batting/params.ts`、`model/pitch/params.ts`、新規 `model/batting/assist.ts`(表と `assistFor`) | 定数の凍結 | A0 |
| 変更/新規 | `model/batting/{assist,contact,resolve-pitch}.ts`(+test) | ロックオン・予告の中心・質の補正 | A1 |
| 変更/新規 | `model/world/camera/{rig,project}.ts`(+test)、新規 `model/world/motion/batter-layout.ts`(+test) | 縦長の構図・守備の同一構図・打者のレイアウト・バット到達・px 比の換算 | A2 |
| 変更/新規 | `model/pitch/{delivery,params}.ts`、新規 `model/pitch/gauge.ts`、`model/game/{reducer,view,test-fixtures,launch-params}.ts`、`model/cpu/cpu-pitcher.ts`、`model/sim/bot-sim.ts`(型の追従のみ)(+test) | 投球コマンドの移行(CPU は変換)・ゲージ・質・view・windup | A3 |
| 変更 | `model/world/sequence/{input-route,arrival,session,swing-time}.ts`(+test) | 離す=スイング・指の管理と昇格・見逃し/持ち替えの判定・保留 | A4 |
| 新規 | `model/world/sequence/{guide,ball-look,contact-feedback}.ts`(+test) | 予告・照準・ゲージのリング・ボールの回転・位置ずれ | A5 |
| 新規 | `model/telemetry/*`、`model/prefs/{prefs,safe-store}.ts`、`model/tutorial/steps.ts`(+test) | ログ・設定・説明の純粋ロジック | A6 |
| 変更 | `render/{markers,look}.ts`、`render/dispose.test.ts`(+test) | 予告・リング・照準・ハロー・縫い目・位置ずれ | A7 |
| 変更 | `render/{stage,pose-apply}.ts`(+test) | `stats()`・バット長・フレーム適用 | A8 |
| 変更 | `hooks/{usePointerInput,useBattingControls,usePitchFlight,useKeyboardInput}.ts` | 離す=スイング・指の管理・有効カーソル・保留 | A9 |
| 新規 | `hooks/{usePreferences,usePlaytestLog,useFramePerf}.ts` | 設定・ログ・fps | A10 |
| 変更 | `model/world/sequence/{frame,play-plan}.ts`(+test)、`sequence/{world-consistency,batter-screen}.test.ts` | 合成 A(予告・リング・ボール・打者・フィードバック) | A11 |
| 新規/変更 | `ui/{Tutorial,PlaytestPanel,StageView,SwingControls,GameLayout}.tsx`+CSS(`touch-action`・callout・contextmenu を含む) | 説明・試遊ログ画面・ピル・ヒント | A12 |
| 変更 | `hooks/{useStageDirector,useGameStage,useGame,useStage3d}.ts`、`ui/{GameScreen,BaseballGamePage}.tsx` | 統合 A(打撃)。守備は旧格子 UI を新コマンドへ変換して維持 | A13 |
| 新規/変更 | `model/sim/{human-bot,human-game}.ts`、`model/sim/*.test.ts`、`model/batting/{params,result-table,batted-ball,assist}.ts` の値 | 打撃ボットと帯・調整 | A14 |
| 新規 | `model/world/sequence/pitch-input.ts`(+test) | 投球入力の状態機械 | B1 |
| 変更/削除 | `ui/{GameLayout,PitchingControls,PitchKindButtons}.tsx`、`ui/CourseGrid.tsx`(削除)、`ui/baseball-stage.css`、`ui/baseball.css` | 守備の操作バー | B2 |
| 変更 | `model/cpu/{cpu-batter,difficulty}.ts`(+test)、`model/game/balance.test.ts`(基準は不変) | CPU 打者の位置・質への反応 | B3 |
| 新規 | `hooks/{usePitchingControls,usePitchKeyboard}.ts` | 投球入力 | B4 |
| 変更 | `model/world/sequence/{frame,play-plan}.ts`(+test) | 合成 B(照準・ゲージ・狙いと着弾の重ね) | B5 |
| 変更 | `hooks/{useStageDirector,useGameStage,useGame,useStage3d}.ts`、`ui/GameScreen.tsx` | 統合 B(投球) | B6 |
| 新規 | `model/world/sequence/{banner,hit-fx}.ts`(+test) | バナー・接触演出 | C1 |
| 新規 | `model/sound/{cues,sfx-plan,haptics}.ts`(+test) | 音・触覚の対応表 | C2 |
| 新規 | `audio/{engine,voices,index}.ts`(+test) | Web Audio エンジン | C3 |
| 新規/変更 | `ui/{EffectBanner,StageView,StageTelop,TitleScreen,ScoreHud,GameLayout}.tsx`+CSS | バナー・音ボタン | C4 |
| 新規 | `hooks/{useSfx,useHaptics}.ts` | 音・触覚 | C5 |
| 変更 | `model/world/sequence/{frame,play-plan,telop}.ts`(+test) | 合成 C(バナー・ヒットストップ・カメラ演出) | C6 |
| 変更 | `hooks/{useStageDirector,useGameStage}.ts`、`ui/GameScreen.tsx` | 統合 C | C7 |
| 新規 | `model/sim/{pitch-bot}.ts`(+test)、`model/cpu/difficulty.ts`・`model/pitch/params.ts` の値 | 投球ボットと調整 | D1 |
| 変更 | `sample-app/frontend/e2e/baseball.spec.ts`、`sample-app/README.md`、`docs/process/sample-app-dev.md` | E2E・ドキュメント | D2 |
| 変更 | 「調整可」の `WORLD_PARAMS`、`render/*` の見た目の値、`ui/*.css` | 見た目の調整 | D3 |
| 不変 | backend、`@sample-app/shared`、`routes/`、`App.tsx`、`ci.yml`、ホーム(`/`)・`home.spec.ts`、reducer の乱数消費の順序 | — | — |

#### DBスキーマ設計

なし(DB の変更は無い。`db-designer` への委譲は行わない)。

#### フロントエンド構成

既存 feature `features/baseball/` への追加で、構成判断は次の 1 点だけ: **新セグメント `audio/`**(`render/` と同格の副作用アダプタ。Web Audio)。理由は、`render/` は「three だけ・DOM と GL に触れるのは `stage.ts` だけ」という既存決定([[frontend-3d-three-in-render-segment]])があり、`AudioContext` をそこへ入れると境界が崩れるため。`audio/` は `types/` だけを import し、何をいつ鳴らすかの表は `model/sound/`(3D の世界と無関係なので `model/world/` の外)に置く(つなぐのは `hooks/` だけ)。**この環境では `frontend-designer` サブエージェントを呼び出せなかったため、構成案は本書で決めた**。`design-reviewer` がセグメント境界の妥当性を確認すること。構造検査(grep)に追加するもの: `AudioContext`・`webkitAudioContext` が `audio/` だけ、`audio/` が `types/` 以外を import しない、`model/` と `render/` と `ui/` が `audio/` を import しない(import するのは `hooks/` だけ)。

### 7. 構図の手計算(根拠。式と出典)

出典は `model/world/camera/{rig,project}.ts`(ピンホール投影 + `lift`)と `space/params.ts`。**投影の式**: カメラ位置 C・注視 T から前方 f = normalize(T − C)、右 r = (1,0,0)、上 u = r × f。点 P で rel = P − C、depth = rel·f、`x_px = W/2 · (1 + rel·r / (depth · h))`、`y_px = (0.5 − 0.5 · (rel·u) / (depth · tanV) − lift) · H`(h = 水平半幅 tan、tanV = h / aspect)。縦長の姿勢 C = (c, 1.75, 2.6)・T = (c, 0.55, −18) で f = (0, −0.05815, −0.99831)、u = (0, 0.99831, −0.05815)。

**v2 の計算値の再現(式の検証)**: 390×844・打撃。h = 0.25(`fit` の既定)、tanV = 0.541。lift = 0.5 + cHead·σ − (top + headGap) = 0.5 − 0.0846 × 0.9242 − (0.1837 + 0.019) = **0.2191**(σ = aspect/(2h) = 0.9242。cHead は投手の頭頂の係数 −0.0846 = v2 の R3 修正後の値)。ゾーン中心 (0, 0.72, 0.03): depth 2.6256 → 水平 **297.1px/m**(= 195 / (0.25 × 2.6256))、`y = 498.2px`。ゾーン枠は幅 = 2 × 0.26 × 297.1 = **154.5px**・y 410〜585(**175px**)。これは v2 の実測(155.5×174.5、y 410〜585。テストレポート)と ±1.5px で一致する。設計レビューのラウンド1でも、基底・lift・ゾーン・投手頭頂・リリース位置・リング半径が検算で一致することを確認済み。

**v3 の値(c = 0)**:

| 要素 | 計算 | 値(390×844) |
| --- | --- | --- |
| ゾーン枠 | x = 195 ± 77.3(c = 0 でゾーンが中央)、y は v2 と同じ | **x 117.7〜272.3、y 410〜585**(155×175) |
| 投手の頭頂 | (0, 2.30, −18.4): depth 20.93、ndcY = 0.1563 → y = (0.5 − 0.0782 − 0.2191) × 844 | **y ≈ 171**(HUD 下端 155 の 16px 下)、x = 195(中央)。足元 y ≈ 247(身長 約 76px) |
| リリースの位置 | (−0.3, 1.65, −18.1): depth 20.67、ndcX = −0.0581 → x = 183.7、y = 195.4 | **(184, 195)**(v2 は x 193) |
| ボール径(真) | 0.2m を ppm で換算。リリース 7.5px、ゾーン面 59.4px | 7.5 → 59.4px |
| ボール径(表示。最小径 0.0175 × 844 = 14.8px) | 倍率 = 14.8 / 7.5 ≈ 1.96(リリース時の dist 20.7m)。真の径が 14.8px に達する D−730ms 付近まで | 14.8px 以上(連続・単調) |
| 予告のリング | 半径 0.30m → 0.125m を 297.1px/m で換算 | **89px → 37px**(ゾーン面。ボールの半径 29.7px+25%) |
| 予告の点 | 半径 0.04m | 半径 12px(径 24px) |
| カーソル(ミート能力 56) | rx = 0.5 + 0.004 × 56 = 0.724、ry = 0.6 × rx = 0.434(ゾーン単位) × (77.3, 87.2 px) | **112 × 76px**、中心 (195, 497.5) |
| 打者の頭(scale 0.70・x −0.75) | 頭の中心 (−0.75, 1.07, 0.05): depth 2.585、ndcX = −1.160 → **x = −31.3**、y = 397。頭の半径 = 0.50 × 0.70 = 0.35m × 301.7px/m = **105.6px** | 頭は x −137〜**74**・y 291〜503。**画面内の頭は x ≤ 74px(19%)** |
| 打者の胴 | 半径 0.31 × 0.70 × 1.05 ≈ 0.228m = 69px、中心 x = −31 | 右端 **x ≈ 38px** |
| 打者の足元 | (−0.75, 0, 0.05): depth 2.6475、ndcY = −1.116 → y = 708 | y ≈ 708(操作バー y 663 の下に隠れる。v2 と同じ) |
| バット先端(接触) | `x_b + scale × (0.05 + 0.975 × L × cos(−0.05) × cos(−0.1))` = −0.75 + 0.70 × (0.05 + 0.975 × 1.50 × 0.99875 × 0.995) = −0.75 + 0.70 × 1.5034(L = 1.45 だと +0.269、1.47 で +0.28) | **L = 1.50 で +0.302m**(ゾーン右端 0.26m の外)。画面 x ≈ 285px |

**打者の占有の比較**: v2 は頭が x 0〜212(54%)・全身の高さ約 70%。v3 は頭が x ≤ 74(19%)で高さは y 291〜708(49%)。ボールの通り道(x 118〜273)は打者の頭の右端(74px)と 44px 以上離れる(v2 は内角の球が頭の縁の内側を落ちていた)。

**守備の操作バー**: 球種チップ 52px+上下余白+ティッカー 52px ≈ 130px。空き領域の下端 = (844 − 130) / 844 = 0.846。5×5 格子の下端(係数 0.5204): y = 0.5 + 0.5204 × 0.9242 − 0.2191 = 0.762 → **643px**(バー上端 714px の 71px 上)。`hReq = 0.46209 × (0.5204 + 0.0846) / (2 × (0.846 − 0.008 − 0.1837 − 0.019)) = 0.2198 < 0.25` なので tan は既定の 0.25 になり、**守備のゾーンは打撃と同じ 155×175px**になる。390×745 でも同じ。

**390×664(ツールバーあり)**: 打撃は空き領域の上 155px・下 181px とすると `hReq = 0.5873 × 0.5305 / (2 × 0.467) = 0.334` → tan ≈ 0.33、lift ≈ 0.173、ゾーン幅 ≈ 116px(v2 の実測は 125.7px で、実際のオーバーレイの高さが想定と異なる)。**この画面の数値は「実装時に実測して確定」**(受け入れは下限で書く)。

## 実装ステップ

**4 段階で作り、各段階の終わりに全体(typecheck・lint・test・build)を緑にする**。段階 A の終わりで、打撃の骨格だけが通しで動くビルドを人間に渡す(**中間試遊 T1**)。

| 段階 | 内容 | 終わりの状態 |
| --- | --- | --- |
| A(A0〜A14) | 契約の凍結+**打撃の骨格**(予告・リング・ロックオン・離す=スイング・視認性・構図・チュートリアル・試遊ログ)。投球側は旧格子 UI のまま動く(新しいコマンドへ変換するだけ。操作は v2 と同じ)。演出・音は無い | **T1: 打撃だけを人間が試遊**(A13 の直後)。A14 は T1 のログを使う |
| B(B1〜B6) | **投球の骨格**(ゾーン直接ドラッグ+ゲージ・CPU 打者の反応・操作バー) | 全体緑(投球が新操作) |
| C(C1〜C7) | **演出・音**(バナー・接触演出・効果音・触覚) | 全体緑 |
| D(D1〜D3) | 投球ボット・E2E とドキュメント・見た目の調整 | 最終の E2E 実行 |

**ファイルの所有**: 同じファイルを**並列のステップ**で触らない。段階をまたいで同じファイルを順番に触るのは許す(例: `frame.ts` は A11 → B5 → C6、`GameLayout.tsx` は A12 → B2 → C4、`useStageDirector.ts` は A13 → B6 → C7、`StageView.tsx` は A12 → C4)。V0 相当の A0 が型・定数を先に入れる `params.ts`・`assist.ts` は、後続が引き継ぐ(担当ファイルに明記)。実装者は担当ファイル以外を編集しない。`types/` は A0 で凍結し、型の変更が必要になったら編集せず報告する。

### ウェーブ構成と依存

| ウェーブ | ステップ | 並列・依存 |
| --- | --- | --- |
| A-1 | A0 | 直列 |
| A-2 | A1, A2, A3, A4, A5, A6, A7, A8 | 並列可(8。A0 の型・定数だけに依存) |
| A-3 | A9, A10, A11, A12 | 並列可(4。A9 は A1・A4、A10 は A6、A11 は A1・A2・A3・A5、A12 は A6 の文言契約) |
| A-4 | A13 | 直列(A7〜A12 の後)。**→ T1 中間試遊** |
| A-5 | A14 | A13 と T1 のログの後。B-1 と並列可(ファイルが重ならない) |
| B-1 | B1, B2 | 並列可(A13 の後。A14 とも並列可) |
| B-2 | B3, B4, B5 | 並列可(3。B3 は **A14 の後**(結果表の調整が CPU 同士の打率に効くため)、B4 は B1、B5 は B1・A5) |
| B-3 | B6 | 直列(B2〜B5 の後) |
| C-1 | C1, C2, C3, C4 | 並列可(4。B6 の後。C4 の UI は A0 の型契約だけに依存) |
| C-2 | C5, C6 | 並列可(C5 は C2・C3、C6 は C1) |
| C-3 | C7 | 直列(C4〜C6 の後) |
| D | D1, D3 → D2 | D1(B6・C7 の後)と D3(C7 の後)は並列可。**D2(E2E の seed 探索)は判定と CPU の値を調整する A14・B3・D1 の後**。最終の E2E は D1〜D3 のすべての後に orchestrator が実行する |

**全体の typecheck の扱い**: A0 で `PitchCommand`・`SceneFrame`・`StageHandle`・`PlaybackSpeed` の型を変えるので、**A0〜A12 の間は全体の typecheck が緑にならない**(担当外のファイルでエラーが残る)。各ステップの完了条件は「`cd sample-app && npm run typecheck` の出力を担当パスで絞り込み、担当ファイル起因が 0 件(他ステップ起因のエラーは完了報告に列挙)」。A0 は型変更で壊れる箇所の一覧(ファイル・理由・解消ステップ)を完了報告に書く。段階 B・C の途中(ウェーブの並列中)も同様で、**各段階の統合ステップ(A13・B6・C7)の完了条件で全体が緑に戻る**。この間のコミットは出荷しない。

**共通の完了条件**: 担当ファイルが `cd sample-app && npx eslint <担当パス>` で 0 件。型は上記。テストがあるステップは `cd sample-app/frontend && npx vitest run <担当パス>` が成功。コミット・共有メモリへの書き込みは並列 dispatch 中は行わない(orchestrator が集約)。**lint の注意([[sample-app-lint-random-and-index-access]])**: `Math.random` 禁止(シード付き mulberry32・`seq` から導く決定論)、変数添字の `arr[i]` 禁止(`.at`/`Map`/`for...of`/`switch`)、`// TODO` 禁止、`toSorted`/`with` 禁止(ES2022)、テストでリテラル同士の assertion 禁止・小数の `toBe` 禁止(`toBeCloseTo`)・ネスト関数 4 段禁止、定数オブジェクトは `DeepReadonly<typeof PARAMS>`、補間は `a*(1−k) + b*k`。

### 段階 A: 打撃の骨格

- [ ] **A0: 契約と定数の凍結**(直列)
  - 依存: なし。担当ファイル: `types/{batting,pitch,game,scene,stage,view}.ts`、新規 `types/{sound,telemetry}.ts`、`hooks/useGameStage.ts`(`GameStageViewProps` の型だけ。値は各統合ステップ)、`render/test-fixtures.ts`(`makeFrame` の新フィールドの既定値)、`model/world/space/params.ts`、`model/batting/params.ts`、`model/pitch/params.ts`、新規 `model/batting/assist.ts`(型の import・`ASSIST_TABLE`・`assistFor` だけ。関数は A1)。
  - やること: 「契約」節のとおり、**段階 A〜C の分の型をすべて**定義し(`BannerView`・`SfxRecipe`/`SfxRecipeTable`・投球入力の型・`TutorialStep`・`GameStageViewProps` を含む)、`WORLD_PARAMS`・`BATTING_PARAMS`・`PITCH_PARAMS` に値まで入れる(カメラ x 0・打者 `portraitX/portraitScale/portraitBatLength`・`fit.pitching`・`ball`/`guide`/`fx`/`telop`/`banner`・`regripBeforeMs`・`stopGuardMs`)。`launch-params.ts` の速度値は A3 の担当(型だけここ)。型の変更で壊れる箇所を完了報告に一覧する(`PitchCommand` を使う `GameScreen`・`useGameStage`・`reducer`・`cpu-pitcher`・`bot-sim`・テスト、`SceneFrame.aim` を使う `frame.ts`・`markers.ts` など)。
  - 完了条件: 担当ファイルの lint 0 件・typecheck 起因 0 件。`types/` が他セグメントを import していない。値を参照する既存テスト(`WORLD_PARAMS`・`BATTING_PARAMS`)がリテラルで固定されていないことを確認し、落ちるものを担当ステップに申し送る。

#### ウェーブ A-2(純粋ロジック・部品。8 並列)

- [ ] **A1: アシスト(ロックオン・予告・質の補正)**
  - 依存: A0。担当ファイル: `model/batting/assist.ts`(+test)、`model/batting/contact.ts`(+test)、`model/batting/resolve-pitch.ts`(+test)。
  - やること: `lockOnCursor`・`previewCenterOf`・`qualityScaleOf` を実装。`measureContact` が `swing.assistK` で `q` を `qualityScaleOf` 倍する(`assistK` 省略は 0 で v2 と同値)。
  - 完了条件: 単体テスト — `lockStrength 0` で恒等、`progress < rampStart` で素のカーソル、`k ∈ [0,1]`・`progress` と `dist` に対して単調、`captureRadius` の外で `k = 0`、有効カーソルは常に raw と landing の線分上、`fade` の中心が決定論(同じ `seq` で同値)かつ `|ずれ| ≤ fadeJitter` で円が真の着弾を含む、`preview: "none"` の扱い、`assistK` 省略時に v2 と同じ `measureContact` の結果(既存の contact テストが無改変で通る)。
- [ ] **A2: 構図・カメラ関数・打者のレイアウト**
  - 依存: A0。担当ファイル: `model/world/camera/{rig,project}.ts`(+test)、新規 `model/world/motion/batter-layout.ts`(+test)。
  - やること: `rig.ts` の式・定数参照を v3 の姿勢・`fit.pitching` に合わせる(式は変えず、`WORLD_PARAMS` の値から導く構造を保つ)。**`ballScaleFor(camera, ball, minRatio)` のシグネチャ変更**と `outlineScaleFor`・`ringWidthFor`(画面高さに対する比 → m の換算)を追加。`batter-layout.ts`: `batterRootFor(aspect)`(`portraitBlendAt` で x・scale を補間し、補間後の scale を返す)・`batLengthScaleFor`・`batTipX`(「構図」節の式)。テストを v3 の数値に更新する。
  - 完了条件: 単体テスト — 390×844 の打撃・守備でゾーン矩形が x 117.7〜272.3・y 410〜585(±3px)、幅×高 ≥ 150×170。打者の頭の右端 ≤ 90px・胴の右端 ≤ 60px、頭の中心 x が負。**接触時のバット先端 x ≥ +0.28(縦長。`batTipX` の式で L = 1.50 のとき +0.30 前後)・横長は v2 と同値**。守備の格子の下端が空き領域の下端(0.846)から 8px 以上上。高さ 560〜900px の走査で、ゾーン/格子が下のオーバーレイに掛からない(高さ 640 以上で投手の頭が HUD に掛からない)。`aspect ≥ 1.0` の横長の姿勢は v2 と厳密に一致(回帰)。`ballScaleFor`・`outlineScaleFor`・`ringWidthFor` が `ratio × 2 × dist × tan(fov/2)` の式と一致。診断の案 B' の検算テストは新姿勢の検算に置き換える。
- [ ] **A3: 投球コマンドの移行(CPU は変換)・ゲージの純関数**
  - 依存: A0。担当ファイル: `model/pitch/{delivery,params}.ts`(+test)、新規 `model/pitch/gauge.ts`(+test)、`model/game/{reducer,view,test-fixtures,launch-params}.ts`(+test)、`model/cpu/cpu-pitcher.ts`(+test)、`model/sim/bot-sim.ts`(`chooseCpuPitch`/`deliverPitch` の型の追従だけ)。
  - やること: `deliverPitch` が `command.aim`(連続)と `command.quality` から σ を決める(乱数の消費数は不変。失投の引き寄せは出力の計算だけ)。`gauge.ts` を実装(段階 B で使う)。`chooseCpuPitch` が `CpuPitchChoice` を返し、reducer がセル中心を `aim`・`quality: "normal"` にして `launchPitch`。`view.ts` が `difficulty`・`assist`(`assistFor`)・チップ用の `speedKmh`/`arrow` を出す。`launch-params.ts` の速度値を更新(通常 `cpuWaitMs 550`・`humanWindupMs 280`、fast 20/20)。
  - 完了条件: 単体テスト — `pitchQualityOf` の境界(40/90/160ms ちょうど・負・NaN)、`sigmaScaleOf` が質に対して単調非減少、`isStopAccepted` が `stopGuardMs` 未満で偽、`deliverPitch` の乱数消費が 24 個のまま・CPU の既存の決定論テストが構造を保って通る(期待値は再導出)、失投で着弾が狙いより `(0, 0.15)` 側へ寄る(平均)、`gaugeRingAt` が `elapsed = ringMs` で `radius = endRadius`・単調減少・`graceMs` 後に `expired`、`aim` が ±1.67 に収まる。`balance.test.ts` は B3 の後に最終確認(A3 時点では CPU の挙動が不変なので成功する)。
- [ ] **A4: 入力ルート(離す=スイング・指の管理・見逃し/持ち替え・保留・スイング記録)**
  - 依存: A0。担当ファイル: `model/world/sequence/{input-route,arrival,session,swing-time}.ts`(+test)。
  - やること: 「操作」節の表を実装する。`routeStagePointer` は `isPrimary` ではなく `aiming`(狙いの指がいるか)で振り分ける。`routeStageRelease` は `{ isAimingPointer, swingReady, holding, enabled, eventMs, durationMs }` から `{ action, reason }` を返す(`eventMs > D + lateCutoffMs` = `late`、`eventMs < D − regripBeforeMs` = `regrip`)。`shouldPromoteHeld`(演出が終わった時点で持ち越しの指を狙いの指に昇格)。`swing-time.ts` に `eventElapsedMs`。`arrivalDue` は狙いの指がいる間 D + `lateCutoffMs` + `aimGraceMs` まで保留。タップ判定(`isTapGesture`・`TAP_*`)を削除。`session.ts` の `SwingRecord` に `meta?: SwingMeta`。
  - 完了条件: `input-route.test.ts` が v2 の判定表(§3)を v3 に更新し**全組み合わせを走査** — (1) 狙いの指がいるときの追加のタッチは `swing-here`/`ignore` のみで `skip` にならない、(2) `holding` が真のタッチは必ず `skip`、(3) 狙いの指がいなければ `isPrimary` に関わらず `drag-start`、(4) スキップに使った指の離しは `none`(`holding` / 昇格前)、(5) `swingReady` が偽の離しは `none`(理由 `not-ready`)、(6) `eventMs > D+250` は `none`(`late`)・`eventMs < D−300` は `none`(`regrip`)・D−300〜D+250 は `swing-release`(境界ちょうどを含む)、(7) マウス/ペンの離しは `none`、(8) **持ち越しの指は `holding` が終わると昇格し、離すとスイング(誤爆ガード・`swingReady` に従う)**、(9) 狙いの指が離れたとき他の指が下りていれば次の move で昇格。`arrival.test.ts`: 狙いの指がいる間は D+250+120 まで通知されず、離した後は即通知、いなければ v2 と同じ。`swing-time.test.ts`: `eventElapsedMs` が遅延補正を引かず `timeScale` を換算する。`session.test.ts`: `meta` が保たれ、既存の性質(最初の1回だけ・`planSwingOf` の捨て判定)が不変。`isSkipKey` は不変。
- [ ] **A5: 演出の純関数(打撃・投球の照準とリング・ボールの回転・位置ずれ)**
  - 依存: A0。担当ファイル: 新規 `model/world/sequence/{guide,ball-look,contact-feedback}.ts`(+各 test)。
  - やること: `guideFrameAt`・`previewRingAt`(打撃の予告+リング)、`pitchGuideAt`(守備の照準+散布円+ゲージのリング+結果の重ね表示。段階 B で使う)、`ballSpinAt`・`ballHaloAt`、`contactFeedbackOf`。リングの線幅は `ringWidthFor` の結果を引数で受ける(model の同じ層の関数。`guide.ts` が `camera/rig` を import してよい)。
  - 完了条件: 単体テスト — リング半径が `t = 0` で startRadius・`t = D` で endRadius(±1e-9)・単調減少・D 以降は保持、`exact` の点が `flight.landing` に厳密一致、`fade` の円が着弾を含む、`none` で点が出ない、`ballSpinAt` が球種ごとに異なりフォークの角速度が最小、`contactFeedbackOf` の帯が中心から外れるほど悪化(単調)、`pitchGuideAt` のゲージのリングが `gaugeRingAt` に一致。
- [ ] **A6: telemetry・prefs・tutorial の純粋ロジック**
  - 依存: A0。担当ファイル: 新規 `model/telemetry/{record,ring-buffer,summary,export,fit-bot}.ts`、`model/prefs/{prefs,safe-store}.ts`、`model/tutorial/steps.ts`(+各 test)。
  - やること: 記録の組み立て(`PlaytestRecord`。打撃・投球・無視された入力)、リングバッファ(最大 600、古い順に捨てる、JSON の往復)、`summarize`(打率・コンタクト率・振る率・離す時刻の平均/SD・距離の中央値・ナイス率・無視された入力の内訳・pointercancel)、`toCsv`、`fitBotParams`、`parsePrefs`(壊れた値は既定値)、**`createSafeStore(getStorage)`(取得・読み書きが例外でもメモリで動く)**、チュートリアルのカード(`TutorialStep`)と次ページの遷移・最初の 5 球ヒントの残り数。
  - 完了条件: 単体テスト — 600 件を超えると先頭が落ちる・JSON 往復で不変・不正な JSON は空、`summarize` を手計算のフィクスチャと一致、`toCsv` の列と行数、`fitBotParams` が既知の分布(平均 +50・SD 70 のフィクスチャ)を ±5% で復元、`parsePrefs` が欠損・型違いを既定値で補う、**`getStorage` が例外を投げる・`setItem` が容量超過で投げる偽のストレージでも `createSafeStore` が例外を出さずメモリの値を返す**。
- [ ] **A7: render — マーカー(予告・リング・照準・ボール・位置ずれ)**
  - 依存: A0。担当ファイル: `render/{markers,look}.ts`、`render/dispose.test.ts`(+`markers`・`look` の test)。
  - やること: `SceneFrame.guide`(点・fade の円・縮むリング(シアン/白〜ゴールド。線幅は `ring.width`)・照準・散布円)、`feedback`(十字・輪・線)、`cursor.raw`、`ball.rotation`/`halo`/`outlineScale`、縫い目(赤の半円弧 2 本)、`BatPose` 以外の旧 `aim`(セルのハイライト)の削除を実装。描画順は v2 の規則(ボール 12・輪郭 11.5・カーソル 11・オーバーレイ 10 以下)に新要素を割り当てる(予告の点・リングはカーソルより奥、ボールより奥)。`render/` は `types/` と `three` だけを import する。縮尺は知らない(受け取った値をそのまま使う)。
  - 完了条件: 単体テスト(smoke。`makeFrame` は A0 が用意)— 新要素の生成・可視の切替・破棄(リークなし。`dispose.test.ts` の対象に追加)、ボールの縫い目が `rotation` に従う、リングの半径・線幅が `guide.ring` に一致、ボールが `transparent`/`depthTest false` のまま、`glow` でリングの色が変わる。`import * as THREE`・`document`・`window` が無い。
- [ ] **A8: render — ステージ・ポーズ・統計**
  - 依存: A0。担当ファイル: `render/{stage,pose-apply}.ts`(+関連 test)。
  - やること: `StageHandle.stats()`(`renderer.info.render`)、`pose-apply.ts` が `BatPose.lengthScale` をバットの**チルトグループの z 方向**に適用、`applyStage` が新フィールドを含むフレームを `applyMarkers` へ渡す。
  - 完了条件: 担当 test 成功。`stats()` が破棄後 `null`。バットの `lengthScale` がチルトグループの z スケールに反映され、スイング軸の位置・太さは不変。`window`/`document`/`matchMedia` を使うのは `stage.ts` のみ。

#### ウェーブ A-3(接続・合成・UI。4 並列)

- [ ] **A9: hooks — 打撃入力(離す=スイング・指の管理・有効カーソル・保留)**
  - 依存: A0, A1, A4。担当ファイル: `hooks/{usePointerInput,useBattingControls,usePitchFlight,useKeyboardInput}.ts`。
  - やること: `usePointerInput` を `routeStagePointer`/`routeStageMove`/`routeStageRelease`/`shouldPromoteHeld` の戻り値だけで分岐(`holding` を直接見ない)。**狙いの指を `pointerId` の ref で持ち**、持ち越しの指・取り残された指の昇格を実装する。`usePitchFlight` に `isAiming()` を渡して到達通知の保留に使う。`useBattingControls` が有効カーソル(`lockOnCursor`。進行度は離した/押した時刻の経過÷D)を毎フレーム director へ渡し、`swingNow` が `cursor = 有効カーソル`・`assistK` を渡す(`SwingRecord` の `meta` も)。**`swingNow` はボタン・2本目の指・キーでも `eventElapsedMs(origin) > D + lateCutoffMs` なら何もしない**。無視された入力(`reason`)と pointercancel を呼び出し側のコールバックで通知する。`useKeyboardInput` は変更なし(`origin` の受け渡しのみ維持)。
  - 完了条件: lint 0 件・typecheck 起因 0 件。`usePointerInput` が `holding` を直接参照していない。unmount・pointercancel で狙いの指が解除される。スキップに使った指の離しでスイングしない(`routeStageRelease` の結果のみ)。
- [ ] **A10: hooks — 設定・ログ・fps**
  - 依存: A0, A6。担当ファイル: 新規 `hooks/{usePreferences,usePlaytestLog,useFramePerf}.ts`。
  - やること: `usePreferences`(`createSafeStore(() => window.localStorage)`・`parsePrefs`。取得時の例外も握りつぶす)、`usePlaytestLog`(`PLAYTEST_ENABLED` の判定・**メモリのリングバッファを主**・任意の保存・要約・エクスポート。無効ビルドでは何もしない)、`useFramePerf`(rAF 間隔の収集)。全 effect に cleanup を付ける。
  - 完了条件: lint 0 件・typecheck 起因 0 件。`hooks/` から `three` を import していない。`PLAYTEST_ENABLED` が偽のとき `localStorage` に書かない。`localStorage` へのアクセスは `createSafeStore` を通る(直接呼ばない)。
- [ ] **A11: sequence の合成 A(予告・リング・ボール・打者・フィードバック)**
  - 依存: A0, A1, A2, A3, A5。担当ファイル: `model/world/sequence/{frame,play-plan}.ts`(+各 test)、`sequence/{world-consistency,batter-screen}.test.ts`。
  - やること: `SceneFrame` に `guide`(打撃の予告)・`feedback`(位置ずれ)・`cursor.raw`・`ball.rotation/halo/scale(飛行中の最小径)/outlineScale`・`BatPose.lengthScale`・打者の `batterRootFor` を合成。**`batHeightInRoot` は補間後の scale で割る**。`SceneFrameInput` に `assist`・`swingFeedback` を追加(`pitchInput`・`reducedMotion` は型だけ(A0)で、値は段階 B・C)。`PlayPlan` に位置ずれの表示区間を追加。旧 `aim` を削除。
  - 完了条件: 単体テスト — `guide` の `exact` がリリースから D+hold まで可視で `position = zoneToWorld(landing)`、リング半径が `previewRingAt` に一致、ボールの表示径が飛行中ずっと最小径以上(v2 の「一度消えたら再出現しない」性質テストを維持)、**縦横比の補間域でもバットの高さがボールの高さと一致**、既存の性質(決定論・入力を変更しない・全数値が有限)を維持。`batter-screen.test.ts` は v3 の数値(頭の右端 ≤ 90px 等)に更新。各関数 60 行以内。
- [ ] **A12: UI — 説明・試遊ログ画面・ピル・ヒント・入力面の抑止**
  - 依存: A0, A6(文言の契約)。担当ファイル: 新規 `ui/{Tutorial,PlaytestPanel}.tsx`+各 CSS、`ui/{StageView,SwingControls,GameLayout}.tsx`、`ui/baseball-stage.css`。
  - やること: `Tutorial`(カード表示・「つぎへ/はじめる」・指のアニメーションは CSS・打撃/投球の 2 種、props のみ)。`PlaytestPanel`(要約表・**全選択できる `<textarea readonly>` の JSON**・コピー・ダウンロード(`.json`/`.csv`)・共有・消去・保存失敗の表示・縮小表示の警告。props のみ)。`StageView` のタイミングのピルを 2 行(ジャスト等+芯/かすり)にして位置ずれの文言を出す、ヒント文(打撃の最初の 5 球・持ち替えのヒント)、`data-guide`・`data-input-state` 等の `data-*` ミラー、**ステージの `contextmenu` を `preventDefault`**。`SwingControls` は縮小(ボタン 80px)。`GameLayout` に `tutorial`/`playtest` スロットを追加。CSS: **`.bb-stage__input--active`(`touch-action: none`)に `-webkit-touch-callout: none`・`-webkit-user-select: none` を足し、人間守備中も付けられる構造にする**(付与は統合ステップ)。`data-inset` 等の空き領域の印(v2 §4)は維持。
  - 完了条件: lint 0 件・typecheck 起因 0 件。`ui/` が `../model`・`../render`・`../audio` を import していない。hooks を呼ばない(props のみ)。ピル・ヒントが `pointer-events: none`。ボタンは 44px 以上。

#### ウェーブ A-4

- [ ] **A13: 統合 A と全体確認(打撃の骨格)**(直列)
  - 依存: A7〜A12。担当ファイル: `hooks/{useStageDirector,useGameStage,useGame,useStage3d}.ts`、`ui/{GameScreen,BaseballGamePage}.tsx`、残った型・lint エラーの解消に必要な最小限のファイル(担当外を直す場合は完了報告に明記)。
  - やること: director が `SceneFrameInput` の新項目(`assist`・`swingFeedback`)を毎フレーム渡し、有効カーソルを表示する。`useGameStage` が `tutorialActive`(`holding` とは**別のフラグ**。表示中は次の投球・ステージ入力を止める)・`usePreferences`・`usePlaytestLog`・`useFramePerf` を結線し、`stage.stats()` を起動時にログへ。`inputActive`(`touch-action: none`)を人間打撃中に付ける。**人間守備は旧格子 UI のまま**、`onThrow` が `{ kind, aim: セル中心, quality: "normal" }` を作って新しい `PitchCommand` に渡す(`GameScreen` の `selection` は維持)。**`skip()` は reducer に触れない・`stage === null` でも進行が止まらない(v2 の構造検査 8)**を維持。`cd sample-app && npm run typecheck && npm run lint && npm run test && npm run build` を通す(固定シード依存の既存テストは性質を保って期待値を再導出し、基準を緩めない)。構造検査(テスト戦略)・knip レポートを確認。`index` チャンクと `GameScreen` チャンクのサイズを記録。**試遊ビルド**(`VITE_PLAYTEST=1`)を作り、起動して 1 試合が通ることを確認する。E2E は D2 で更新するので、この時点では 1 イニング通しの手動確認(Playwright の使い捨てスクリプト)だけを行う。
  - 完了条件: 上記がすべて成功(typecheck は全体で緑)。構造検査 1〜13 が pass。**試遊ビルドの手順(ビルドコマンド・配布方法・ログの取り出し方)を完了報告にまとめる**。
  - **→ T1(中間試遊。ゲート1で承認を得た場合に実施)**: orchestrator が試遊ビルドを人間に渡し、「**打撃 20 打席(約 60 球)を遊んで、試遊ログ(画面の JSON)をコピーして貼る**」ことと「打てた/微妙/打てない」の 3 択を `AskUserQuestion` で聞く(演出・音・新しい投球は未実装で、守備は v2 の操作のまま)。ログは A14 のボット較正・難易度のアシスト強度の調整に使い、T1 の結果によっては段階 B 以降の前に A1・A2・A4 を直す。

- [ ] **A14: 人間代理ボット v2(打撃)と打撃バランス**
  - 依存: A13(と T1 のログがあればそれ)。B-1 と並列可。担当ファイル: 新規 `model/sim/{human-bot,human-game}.ts`、`model/sim/human-bot.test.ts`(新規。帯の検証)、`model/sim/bot-balance.test.ts`(旧ボットの帯の更新)、`model/batting/{params,result-table,batted-ball,assist}.ts` の**値**。
  - やること: 「人間代理ボット v2」(失敗の型・悲観シナリオ・時間予算を含む)を実装し、受け入れ帯(テスト戦略 E 群)を満たすよう、ロックオン強度・結果表・強さのしきい値・`foulRatio`・`qualityPenalty` を調整する(動かしてよい値と動かさない値は下記)。**検出力テストを先に通す**(v2 設定で「打てない」を再現。調整先は共有パラメータだけ)。旧ボット(A〜E)は「補助なし・理想知覚」の参照として残し、帯を変える場合は理由を完了報告に書く。ボットの px/ゾーン単位が `camera/project.ts` の値と ±8% で一致するテストを維持。
  - 動かしてよい値(この順に): `ASSIST_TABLE` の `lockStrength`(±0.15)・`captureRadius`(±0.4)・`qualityPenalty`(0.2〜0.5)、`linerHalfBand`(0.08〜0.22)、`mediumFrom`(0.28〜0.45)、`strongFrom`(0.5〜0.75)、`RESULT_TABLE` の重み(v2 の不変条件を守る範囲で各セル ±8)、`foulRatio`(0.6〜0.8)。**動かさない値**: `contactWindowMs`・`powerWindowScale`・`centerRatio`・`lateCutoffMs`・`inputLatencyMs`・`ballReachX/Y`・`meetBaseRx`・`aimGraceMs`・`regripBeforeMs`、ボットの「リング無し」の `biasMs`。
  - 完了条件: `npx vitest run src/features/baseball/model/sim` 成功、E 群の帯(P10/P50/P90)をすべて満たす。満たせない帯は緩めずに理由と最良の値を報告(設計の見直しとして上申)。`model/sim/` を `*.test.ts` 以外が import していない。ボットテストの時間予算内。

### 段階 B: 投球の骨格

- [ ] **B1: 投球入力の状態機械**
  - 依存: A13。担当ファイル: 新規 `model/world/sequence/pitch-input.ts`(+test)。
  - やること: `reducePitchInput(state, event, ctx)`(`idle` → `aiming` → `gauge` → `throwing`。型は A0)。入力: 押す・動く・離す(タッチは相対ドラッグ、マウスは絶対追従、クリックで確定・停止)・ボタン(確定/停止の共通操作)・キー・tick(自動投球の期限)・cancel。ゲージ開始から `stopGuardMs` の停止は無視。副作用は `effect`(`start-gauge`・`throw`)で返す。`holding`・`enabled` が偽なら無視(スキップは別ルート)。
  - 完了条件: 表の全組み合わせを走査する単体テスト — 離し=確定+ゲージ開始、ゲージ中の押す=停止+投球(質は `gaugeErrorMs` から。入力種別の遅延補正)、`stopGuardMs` 未満の停止は無視(ダブルクリックで失投にならない)、`ringMs + graceMs` で自動投球(失投)、ゲージ中の動きは狙いを変えない、`aimLimit` を超えない、キー・ボタンでも同じ遷移、`timeScale` で期限が縮む、`holding` 中は何も起きない。
- [ ] **B2: UI — 守備の操作バー**
  - 依存: A13。担当ファイル: `ui/{GameLayout,PitchingControls,PitchKindButtons}.tsx`、削除 `ui/CourseGrid.tsx`、`ui/baseball-stage.css`、`ui/baseball.css`。
  - やること: 「契約」の `GameLayout` の props 契約どおりに、守備の操作バーを「球種チップ(球速・矢印つき、76×52px)+ 操作ボタン(投げる/とめる!、96×52px)」に作り直す(高さ ≈ 130px、800px 未満で ≤ 140px)。`inputState`(`PitchInputView`)を `data-input-state` に反映。守備中も `.bb-stage__input--active` が付く前提の CSS(A12)を確認。
  - 完了条件: lint 0 件・typecheck 起因 0 件。`ui/` が `../model`・`../render`・`../audio` を import していない。守備の `bb-overlay__bottom` の高さを 390×844・390×745・390×664 で測った値を完了報告に書く(≤ 135 / ≤ 140 / ≤ 140px が目標)。ボタン・チップは 44px 以上。
- [ ] **B3: CPU 打者の反応(位置・質・連投)**
  - 依存: A14(結果表・アシストの調整が終わってから)。担当ファイル: `model/cpu/{cpu-batter,difficulty}.ts`(+test)、`model/game/balance.test.ts`(基準は不変。落ちるなら CPU 側を調整)。
  - やること: 「CPU 打者との整合」の式を実装し、`DifficultyParams` に `qualitySensitivity` を追加。`cursorSigma`・`timingSigmaMs`・`zoneSwingRate` の出発値を、CPU 同士の打率 .23〜.29・三振率・四球率の基準を保つよう調整する。
  - 完了条件: 単体テスト — ナイスは ふつう より cursorSigma の実効値が大きい(`hard` では差が小さい)、縁(extent 1.0)は中央より大きい、失投は振る確率が上がる(上限あり)、`quality: "normal"` かつ extent ≤ 0.5 で v2 と同値。`balance.test.ts` が**基準を変えずに**成功。難易度の順序(ノイズ easy > normal > hard)を維持。
- [ ] **B4: hooks — 投球入力**
  - 依存: B1。担当ファイル: 新規 `hooks/{usePitchingControls,usePitchKeyboard}.ts`。
  - やること: `usePitchingControls`(ステージの入力面のポインタ・操作ボタン・キーから `reducePitchInput` を駆動、狙いの ref、ゲージの開始時刻、`aim`/`quality` を `onThrow({kind, aim, quality})` で渡す、`PitchInputView` の公開、unmount のタイマー解除。**`pickZone`・`getZoneRect`・`holding`・`onSkip` を注入で受け、演出中のスキップは `routeStagePointer` を先に通す**。pointercancel と離しの無視理由を通知)。`usePitchKeyboard`(矢印・Space/Enter。`defaultPrevented` と `preventDefault` で打撃のスイング・スキップと排他。[[dom-key-input-exclusivity]])。
  - 完了条件: lint 0 件・typecheck 起因 0 件。ゲージ時刻は `event.timeStamp` から求める(`performance.now()` の差だけで求めていない)。`timeScale` を反映。`getBoundingClientRect` を自分では使わない。Space の keydown 1回でスキップと投球が同時に起きない。
- [ ] **B5: sequence の合成 B(照準・ゲージ・狙いと着弾の重ね)**
  - 依存: A5, B1。担当ファイル: `model/world/sequence/{frame,play-plan}.ts`(+各 test)。
  - やること: `SceneFrameInput.pitchInput`(`PitchInputView`)から守備の `guide`(`mode = "reticle"`・散布円・ゲージのリング)を合成。投球後 `resultOverlayMs` の `feedback`(狙いと着弾の重ね。`tone: "pitch"`)。`layout` は人間守備なら `"pitching"`(セル選択に依存しない)。
  - 完了条件: 単体テスト — 守備の `guide.mode = "reticle"`・ゲージ中のリングが `gaugeRingAt` に一致・飛行中は狙い(投げた時点の値)を保持し**選択の変更で動かない**、重ね表示が着弾から 700ms で消える、段階 A の性質テストが不変。
- [ ] **B6: 統合 B と全体確認(投球)**(直列)
  - 依存: B2〜B5。担当ファイル: `hooks/{useStageDirector,useGameStage,useGame,useStage3d}.ts`、`ui/GameScreen.tsx`、必要最小限の修正。
  - やること: director が `pitchInput` を毎フレーム渡し、`layoutOf` を「人間守備 = pitching」に変更。人間の投球の windup を `humanWindupMs` で行う。`useGameStage` が人間守備のモードで `usePitchingControls` のハンドラをステージの入力面に渡す(人間打撃は `usePointerInput`)。`inputActive` を**人間守備中も真**にする。`onThrow` を新しい `PitchCommand` に。`GameScreen` から `selection`(セル)を削除して `selectedKind` だけにし、`GameLayout` へ契約どおりに渡す。投球のログ(質・誤差)を `usePlaytestLog` へ。全体の typecheck・lint・test・build を通す。
  - 完了条件: 全体の typecheck・lint・test・build が成功。`skip()` が reducer に触れない・`stage === null` でも進行が止まらない。守備の入力面で `touch-action: none` が有効。

### 段階 C: 演出・音

- [ ] **C1: 演出の純関数(バナー・接触演出)**
  - 依存: B6。担当ファイル: 新規 `model/world/sequence/{banner,hit-fx}.ts`(+各 test)。
  - やること: `bannerFor`(結果・落下点・タイミング → `BannerView`)、`hitFxAt`(ズーム・シェイク・ヒットストップ長。`reducedMotion` は入力で受ける)。
  - 完了条件: 単体テスト — `bannerFor` が全 `kind × inPlay.result × plate` の組を網羅(バナーなしは `null`)、`hitFxAt` が `sinceContactMs` に対して連続・`reducedMotion` で 0。
- [ ] **C2: 音・触覚の対応表**
  - 依存: B6。担当ファイル: 新規 `model/sound/{cues,sfx-plan,haptics}.ts`(+各 test)。
  - やること: `SFX_RECIPES`(各 `SfxCue` のレシピ = オシレータ/ノイズ/フィルタ/エンベロープのデータ表。ノイズは決定論の PRNG 指定)、`sfxEventsOf(plan, flight)`(リリース・到達・スイング・接触・テロップ開始・歓声)、`gaugeTicksOf`、`hapticFor`(最短 15〜20ms)。
  - 完了条件: 単体テスト — 全 `SfxCue` にレシピがある、各レシピの長さ ≤ 2.5s・ゲイン ≤ 1・周波数が 20〜12000Hz、`sfxEventsOf` が結果種別(ボール・ストライク・空振り・ファウル・ヒット・ホームラン・三振・四球)ごとに期待する cue を `atMs` 昇順で返す(接触なしは打撃音なし)、ジャストはジャスト音、同じ入力で同じ結果(決定論)、`hapticFor` の最短が 15ms 以上。
- [ ] **C3: audio — Web Audio エンジン**
  - 依存: B6。担当ファイル: 新規 `audio/{engine,voices,index}.ts`(+test)。
  - やること: `createAudioEngine({ recipes, createContext })`(`AudioContext` は注入可能。`unlock()` = ユーザー操作として認められるイベントの中で作成・`resume`・無音バッファ再生(iOS)、`resume()` による `suspended`/`interrupted` からの復帰、`play(cue, gain)` = 渡されたレシピから音を組み立てて再生、同時発音 8 まで、終了後に node を切断、`setMuted`、`dispose`)。ノイズバッファは mulberry32 で 1 回だけ生成。`audio/` は `types/` だけを import。
  - 完了条件: 偽のコンテキストで単体テスト — `unlock` 前は音が出ない・`play` が例外を投げない、`suspended` から `resume` で復帰、ミュートで node を作らない、同時発音の上限、終了で切断(リーク 0)、`dispose` が冪等。`AudioContext` に触れるのは `audio/` のみ(grep)。
- [ ] **C4: UI — 演出の表示・音ボタン**
  - 依存: B6(A0 の型契約)。担当ファイル: 新規 `ui/EffectBanner.tsx`+`ui/effect-banner.css`、`ui/{StageView,StageTelop,TitleScreen,ScoreHud,GameLayout}.tsx`+CSS。
  - やること: `EffectBanner`(種類別の斜めの帯・ホームランの全面フラッシュと紙吹雪(CSS)・`aria-hidden`・`pointer-events: none`・`prefers-reduced-motion` で動きを止める)、守備のゲージ中のヒント文と `data-banner`・`data-pitch-quality`、バナーが出る間はテロップを出さない。HUD にスピーカーボタンと「?」(あそびかた)、タイトルに音・振動の切替と「あそびかた」と(試遊ビルドだけ)「試遊ログ」への入口。`GameLayout` に `sound`・`onOpenHelp` を追加。
  - 完了条件: lint 0 件・typecheck 起因 0 件。`ui/` から `../model`・`../render`・`../audio` を import していない。バナーとピルが `pointer-events: none`。ボタンは 44px 以上。
- [ ] **C5: hooks — 音・触覚**
  - 依存: C2, C3。担当ファイル: 新規 `hooks/{useSfx,useHaptics}.ts`。
  - やること: `useSfx`(エンジンの生成(`recipes` を `model/sound/` から取って渡す)・**ユーザー操作として認められるイベント(`pointerup`/`touchend`/`click`/`keydown`。`pointerdown` ではない)で `unlock`**・`visibilitychange` で `resume`・`sfxEventsOf` のイベントを時刻 `t` の区間で発火する `fire(prevMs, nowMs)`・ミュート・UI 音)、`useHaptics`(`navigator.vibrate`・80ms の間引き・設定とリデュースモーション)。全 effect に cleanup。
  - 完了条件: lint 0 件・typecheck 起因 0 件。`hooks/` から `three` を import していない。`pointerdown` のみで `unlock` していない。
- [ ] **C6: sequence の合成 C(バナー・ヒットストップ・カメラ演出)**
  - 依存: C1。担当ファイル: `model/world/sequence/{frame,play-plan,telop}.ts`(+各 test)。
  - やること: `PlayPlan` に `banner`・`hitStopMs` を追加し、ヒットストップで打球・野手・テロップ・終了時刻を後ろへずらす。カメラへ `hitFx`(ズーム・シェイク)を合成。バナーのある結果はテロップを `null` にする。`SceneFrameInput.reducedMotion` を使う。
  - 完了条件: 単体テスト — 接触時のカメラが連続(16ms あたりの FOV 変化 ≤ 閾値・ヒットストップ中も連続)、ヒットストップが 0 のとき v2 と同じ時刻表、`reducedMotion` で `hitFx` が 0、バナー有りの結果でテロップが `null`、`endMs ≤ D + 上限`(最長の滞空+テロップ+余韻から式で計算)。
- [ ] **C7: 統合 C と全体確認(演出・音)**(直列)
  - 依存: C4〜C6。担当ファイル: `hooks/{useStageDirector,useGameStage}.ts`、`ui/GameScreen.tsx`、必要最小限の修正。
  - やること: director が `reducedMotion`(`matchMedia` は `hooks` で読む)を渡し、`banner` を `GameStageViewProps` に入れる。`useGameStage` が `useSfx`・`useHaptics` を結線(スイング・接触・結果・UI・ゲージの cue と触覚)。`GameLayout` へ `sound`・`onOpenHelp`・`banner`。全体の typecheck・lint・test・build を通し、`index`・`GameScreen` チャンクのサイズと knip レポートを記録する。
  - 完了条件: 全体の typecheck・lint・test・build が成功。構造検査 1〜13 が pass。

### 段階 D: 検証・調整

- [ ] **D1: 投球ボットと投球バランス**
  - 依存: B6, C7。担当ファイル: 新規 `model/sim/pitch-bot.ts`、`model/sim/pitch-bot.test.ts`、`model/cpu/difficulty.ts` の**値**(`qualitySensitivity`・`cursorSigma` 等)、`model/pitch/params.ts` の**値**(`gauge.windows`・`sigmaScale`)。
  - やること: 「投球ボット」を実装し、F 群の帯を満たすよう調整する。CPU 同士(`balance.test.ts`)・A14 の打撃ボットの帯は基準を変えずに成功させる(競合したら A14 の帯を優先し、`cpu-batter.ts` の係数で吸収せず orchestrator に上申)。
  - 完了条件: F 群の帯を満たす。`balance.test.ts`・`human-bot.test.ts` 成功。
- [ ] **D2: E2E とドキュメント**
  - 依存: A14, B3, D1(判定と CPU の値が確定してから seed を探索)、C7。担当ファイル: `sample-app/frontend/e2e/baseball.spec.ts`、必要なら `sample-app/frontend/playwright.config.ts`、`sample-app/README.md`、`docs/process/sample-app-dev.md`。
  - やること: E2E(テスト戦略)の更新・追加。**チュートリアルとヒントは初回表示で止まるので、tutorial 以外の spec は `addInitScript` で既読・球数ヒントの設定を入れる**。**Playwright は `npm run dev`(`DEV = true`)で起動するので試遊ログ機能が常に有効**になる。「通常ビルドでは入口が無い」ことの確認は `vite build && vite preview` で起動する別の Playwright project(試遊ログ無効)で行う。`index.html` の viewport meta の固定もここ。README の操作説明(離す=スイング・ロックオン・予告とリング・見逃しは離さず待つ・投球のゲージ・音と振動・試遊ログ)、`sample-app-dev.md` に新ボット・試遊ビルド・ログの見方・`BOT_FULL=1` を追記。「パワプロ」等の名称は書かない(「みたいな」に留める)。E2E の seed を再探索。
  - 完了条件: `cd sample-app && npm run test:e2e --workspace frontend` が 3 回連続で成功(`home.spec.ts` は無改変)。新しいタッチ・投球・音のテストを `--repeat-each=5 --workers=2` で実行して失敗 0 件(有効試行が得られず失敗した件数は報告)。
- [ ] **D3: 見た目の確認と調整**
  - 依存: C7。**例外として次を調整してよい**: `WORLD_PARAMS` の「調整可」の値(下の範囲内)、`render/{look,markers,stadium}.ts` の見た目の値、`ui/*.css`。それ以外が必要なら変更せず報告。
  - やること: 390×844・390×745・390×664(`hasTouch`)と 375×667・360×640・1280×720 で、v2 との前後のスクリーンショット(仮想時計+手動 rAF のハーネスで決定論的に撮る。[[swiftshader-playwright-input-latency]])を比較し、「ゲート1で人間に見せるもの」の画面一覧とモックの数値に対して〇×を付ける(打者の占有・バット到達・予告とリングの見え方・ボールの最小径・バナーとテロップ・ピルとの重なり・守備のバー・ホームランの頂点と HUD・接触時のカメラ・ヒットストップの違和感)。画像(1 枚 500KB 以下、25 枚程度)を `docs/tests/assets/2026-10-27-baseball-game-v3/` に保存。最大 3 ラウンド、未達は理由を報告してゲートへ引き継ぐ。
  - 調整可の値: `actors.batter.portraitScale`(0.62〜0.80)・`portraitX`(−0.85〜−0.65)・`portraitBatLength`(**接触時の先端 ≥ +0.28m を保つ範囲**。`batTipX` で確認)、`ball.minScreenDiameterRatioFlight`(0.014〜0.022)、`guide.previewRing.startRadius`(0.24〜0.36)、`halo.opacity`(0.2〜0.5)、`fx` の各値、`telop`/`banner` の長さ、`fit.pitching.defaultSafeArea.bottom`。カメラ・ゾーンの px を変えたら **A14 のボットテストを再実行**。
  - 完了条件: 受け入れ基準の A・B・C・G 群が〇、または未達の理由が報告されている。`npm run lint`・`typecheck`・`test` が成功。**D1〜D3 のすべてが完了した後に、orchestrator が E2E を最終実行して成功を確認する。**

## テスト戦略

**自動テストを新規作成するか:** する。対象と配置は各ステップの「完了条件」に書いたとおり(**作成も各ステップのタスクに含む**)。単体(vitest・node)は `model/` と `audio/`(偽のコンテキスト)と `render/`(smoke)に同居。E2E(Playwright)は D2。期待値は `WORLD_PARAMS`/`BATTING_PARAMS`/`PITCH_PARAMS`/`ASSIST_TABLE` から計算し、調整してよい値のリテラルを書かない。

### 受け入れ基準(数値)

測り方: A〜D・G・H は単体テスト/画面の実測(D3 の連写)。E・F はボット(`model/sim/*.test.ts`、固定シード。通常は縮約、完全版は `BOT_FULL=1` で レベルあたり 40 人 × 各 2000 球)。「実測確定」は D3 が実機に近い画面で測って確定する値。

| # | 群 | 指標 | 目標 | 守る場所 |
| --- | --- | --- | --- | --- |
| A1 | 構図 | ゾーン枠(390×844、打撃・守備とも) | x 117.7〜272.3、y 410〜585(±3px)、幅×高 ≥ 150×170 | `rig.test`・`project.test`、E2E(`data-zone-rect`) |
| A2 | 構図 | ゾーン枠(390×745 / 390×664 / 375×667 / 360×640、打撃・守備) | 幅×高 ≥ 150×170 / ≥ 105×120 / ≥ 100×112 / ≥ 95×108。**実測確定** | `rig.test`・E2E |
| A3 | 構図 | 打者の頭の右端(390×844 縦長) / 胴の右端 / 画面内の打者の外接幅 | ≤ 90px(設計値 74)/ ≤ 60px(38)/ ≤ 25% = 98px(v2: 54%) | `batter-layout.test`・`batter-screen.test`・画像 |
| A4 | 構図 | 構え中の手・バットとゾーン枠の重なり | 0px | 画像(D3) |
| A5 | 構図 | 接触時のバット先端 x(縦長。`batTipX` の式) / バットとボールの画面上のずれ(ゾーン中央・四隅) | ≥ +0.28m(L = 1.50 で +0.30)/ ≤ 20px。縦横比の補間域でバットの高さがボールの高さと一致 | `batter-layout.test`・`frame.test`・画像 |
| A6 | 構図 | 投手の頭頂 y / 中心 x(390×844) | ≥ HUD 下端+8px(設計値 171)/ 195 ± 3px | `rig.test`・画像 |
| A7 | 構図 | 守備の操作バー(`bb-overlay__bottom`)の高さ | ≤ 135px(844)・≤ 140px(745・664)。格子の下端が上端から 8px 以上上 | E2E の幾何検証 |
| B1 | ボール | 飛行中(リリース〜D)の表示径 | 常に ≥ 0.0175 × 画面高 − 1px(844 で ≥ 13.8px)。倍率は連続・単調非増加 | `frame.test`・`rig.test` |
| B2 | ボール | 縁取りの画面上の太さ | ≥ 2px 相当(`outlineScaleFor` が `shellMinRatio` から換算) | `rig.test`・`markers.test` |
| B3 | ボール | 回転 | 球種ごとに軸・角速度が異なり、フォークが最小。縫い目が回転に従う | `ball-look.test`・`markers.test` |
| C1 | 予告 | リング半径 | `t = 0` で 0.30m、`t = D` で 0.125m(±1e-9)、単調減少、D 以降保持。線幅 = `ringWidthFor` の値 | `guide.test` |
| C2 | 予告 | `exact` の点 / `fade` の円 | 点 = `flight.landing` に厳密一致 / 円は着弾を含み中心のずれ ≤ `fadeJitter`・決定論 | `assist.test`・`guide.test` |
| C3 | 予告 | リリース直後の可視 | 120ms のフェードイン後は不透明度 ≥ 0.9 を D+hold まで保つ | `frame.test` |
| C4 | ロックオン | 式の性質 | `lockStrength 0` で恒等、`progress < rampStart` で素、有効カーソルは raw と landing の線分上、`k ∈ [0,1]` | `assist.test` |
| C5 | ロックオン | 表示と判定の一致 | 離した時刻の `SwingInput.cursor` が、その時刻に表示されていた有効カーソルと一致 | `useBattingControls` の純関数部のテスト・E2E |
| D1 | 入力 | 離す=スイング・指の管理 | 判定表の全組み合わせ(A4)。狙いの指の離し → `swing-release`、追加の指・ボタン・マウス・キーは v2 と同じ。**狙いの指がいなければ `isPrimary` に関わらず `drag-start`** | `input-route.test` |
| D2 | 入力 | 判定時刻 | `atMs = (離し − 開始)×timeScale − 70`(`swingAtMs`)。`timeScale` で補正が換算されない | `swing-time.test` |
| D3 | 入力 | 見逃し・保留 | **離したイベント時刻 > D+250 は見逃し(スイングにならない)**。狙いの指がいる間は D+370 まで通知を保留(処理遅延の吸収。受理判定は変えない)。D+250 以内の離しは処理が D+370 までに届けば受理 | `input-route.test`・`arrival.test`・E2E |
| D4 | 入力 | 持ち替え | **離したイベント時刻 < D−300ms は無視**(ヒントを出す)。D−300〜D−150ms は「早い」の空振りで返る | `input-route.test` |
| D5 | 入力 | 持ち越しの指の昇格 | 演出中に置いて動かさなかった指を、次の球で離す → スイング(誤爆ガード・`swingReady` に従う)。狙いの指が離れたとき残った指が次の move で昇格 | `input-route.test`・E2E |
| D6 | 入力 | 守備の入力面 | 人間守備中も `touch-action: none`・callout 抑止・contextmenu 抑止。pointercancel・無視された離しの理由がログに残る | E2E(CSS・属性)・`summary.test` |
| E1 | 打撃ボット | **検出力**(v2 設定 = `ASSIST_OFF`・リング無し・v2 の知覚の偏り=調査の値で固定) | 初心者の打率 P50 ≤ .17 かつ コンタクト率 P50 ≤ 50%、中級の打率 P50 ≤ .22(前回の「打てない」を再現できる)。**調整は共有パラメータのみ** | `human-bot.test` |
| E2 | 打撃ボット | ふつう(既定)の打率(安打 ÷ (打席 − 四球)、P50) | 初心者 .20〜.30、中級 .26〜.34、上級 .32〜.45。P10 ≥ .13(全レベル)、P90 ≤ .52 | `human-bot.test` |
| E3 | 打撃ボット | コンタクト率(P50) / 三振率(P50) | 初心者 ≥ 55% / ≤ 35%、中級 ≥ 70% / ≤ 25%、上級 ≥ 82% / ≤ 18% | 同上 |
| E4 | 打撃ボット | 技量の勾配 | 上級 − 中級 ≥ .04、中級 − 初心者 ≥ .03(P50) | 同上 |
| E5 | 打撃ボット | むずかしい(アシスト弱・fade)の中級の打率 P50 | .20〜.28(ふつうより ≥ .04 低い) | 同上 |
| E6 | 打撃ボット | かんたんの初心者の打率 P50 | ふつうの初心者 + .02 以上 | 同上 |
| E7 | 打撃ボット | ボール球を振る率(中級・ふつう) / ストライクを振る率 | ≤ 30% / ≥ 70% | 同上 |
| E8 | 旧ボット | 補助なし・理想知覚の参照(B 安打率) | v2 の帯 30〜35% を目安に、変えるなら理由を完了報告に | `bot-balance.test` |
| E9 | CPU | CPU 同士(ふつう)の打率 / 三振率 / 四球率 | `balance.test` の基準を**変えず**に成功(打率 .18〜.34、目標 .23〜.29) | `balance.test` |
| E10 | 打撃ボット | **悲観シナリオ**(リング有りの `biasMs` を中間値 = 初心者 +85) | 初心者の打率 P50 ≥ .15・コンタクト率 P50 ≥ 45%。満たさなければ値の推移を完了報告に出して上申 | `human-bot.test` |
| E11 | 打撃ボット | **失敗の型**(`takeRelease`・`regripRate`・`cancelRate`・`ignoreRing` を入れた母集団) | 見送る球での誤スイング率 P50 ≤ 20%(初心者)/ ≤ 10%(中級)。超えるなら見逃しの合図(ヒント・チュートリアル)が不足。E2〜E7 はこの母集団で判定 | `human-bot.test` |
| F1 | 投球 | ゲージの質の境界・停止ガード | 40 / 90 / 160ms ちょうどの扱い・負・NaN・タップなし = 失投。ゲージ開始から 250ms 未満の停止は無視(ダブルクリックで失投にならない)。遅延補正は入力種別(タッチ 70 / マウス・キー 20) | `gauge.test`・`pitch-input.test` |
| F2 | 投球 | σ の倍率 | ナイス 0.35 < グッド 0.65 < ふつう 1.0 < 失投 1.7。乱数の消費数 24 個で不変 | `delivery.test` |
| F3 | 投球ボット | 被打率(CPU ふつう、P50) | 初心者(中央寄り・単調)**.27〜.34**、中級(縁を混ぜる)**.22〜.29**、上級 **.16〜.24**。各レベルの差 ≥ .03 | `pitch-bot.test` |
| F4 | 投球ボット | 配球の意味 | 上級のタイミングで「中央連打」の被打率 ≥ 「縁+球種を混ぜる」+ .03 | 同上 |
| F5 | 投球ボット | ストライク率 / 四球率(初心者) | ≥ 50% / ≤ 14%(PA あたり) | 同上 |
| F6 | 投球ボット | ナイス率(中級) | 30〜50%(質の分布が極端でない) | 同上 |
| F7 | 投球 | 照準の範囲・受け持ち | `aim` が ±1.67 に収まる。守備中の入力面は `usePitchingControls` が受け、スキップは `routeStagePointer` を先に通る | `pitch-input.test`・構造検査 |
| G1 | 演出 | バナーの網羅 | 全 `outcome.kind × inPlay.result × plate` に対して `bannerFor` が定義(なし=`null`)。バナー有りの結果でテロップが `null` | `banner.test`・`play-plan.test` |
| G2 | 演出 | 接触演出 | `hitFxAt` が連続。ヒットストップ 0 のとき時刻表が v2 と同じ。`reducedMotion` で 0 | `hit-fx.test`・`frame.test` |
| G3 | 演出 | 位置ずれ | `contactFeedbackOf` の帯が中心から外れるほど悪化(単調)。表示は 900ms | `contact-feedback.test` |
| G4 | 演出 | テンポ | 1球の所要(スキップなし)= `windup + D + (人間打者で指が無い見逃し: 250 / CPU 打者: 0)+ テロップ + 余韻` の式で、**ストレート(D = 1310)の CPU 投手・人間打者の見逃しが ≤ 2.65s、カーブ(D = 1652)は ≤ 3.0s**(指を下ろしたままは +120ms)。人間の windup 280ms。インプレーの `endMs ≤ D + 上限`(最長の滞空+テロップ+余韻から式で計算) | `play-plan.test`・`launch-params.test` |
| H1 | 音 | レシピ | 全 cue にレシピ。長さ ≤ 2.5s・ゲイン ≤ 1・周波数 20〜12000Hz | `cues.test` |
| H2 | 音 | イベント | 結果種別ごとに期待する cue が `atMs` 昇順で返る(接触なしは打撃音なし) | `sfx-plan.test` |
| H3 | 音 | エンジン | `unlock` 前は無音・`suspended` から復帰・ミュートで node 0・同時発音 ≤ 8・終了で切断。`pointerdown` だけでは `unlock` しない | `engine.test`・構造検査 |
| H4 | 触覚 | パターン | 最短 15ms 以上。80ms 未満の連続を間引く。設定 OFF・リデュースモーションで無効 | `haptics.test`・`useHaptics` |
| I1 | ログ | 記録 | リングバッファ ≤ 600・JSON 往復で不変・無効ビルドで書かない。**`localStorage` が例外を投げる環境でもゲームと記録が動く** | `ring-buffer.test`・`safe-store.test`・E2E |
| I2 | ログ | 要約・較正 | `summarize` が手計算と一致。`fitBotParams` が既知の分布を ±5% で復元 | `summary.test`・`fit-bot.test` |
| I3 | ログ | 取り出し | iframe 相当(clipboard・ダウンロードが使えない)でも、画面の `<textarea>` に全 JSON が出る | E2E(clipboard を無効化して確認) |
| J1 | 性能 | バンドル | `index` チャンク ≤ 201.04KB + 8KB。`GameScreen` チャンク(gzip) ≤ 173.97KB + 25KB | `npm run build`(各統合ステップ) |
| J2 | 性能 | 計測の仕組み | `stats()` が `drawCalls`/`triangles` を返し、ログに入る | `stage` の smoke・`usePlaytestLog` |
| J3 | 性能 | テスト時間 | ボット・投球ボットのテストの増加が `npm run test` で 90 秒以内(縮約モード) | A14・D1 の完了報告 |
| K | 構造 | 構造検査 | 下記 1〜13 が pass。knip レポートの新規の未使用 export を確認(`toCsv` は `PlaytestPanel` から使う) | grep(各統合ステップ) |

**ボットの前提の根拠(E 群)**: 反応時間 200〜250ms・見た目の到達の偏り(+130ms で位置が完璧でも 39% が空振り)・人間の打撃タイミングの精度は調査 batting.md 2.5・出典(Smeets ほか)と v2 診断。**リング有りの `biasMs` などの v3 固有の値は仮定**で、悲観シナリオ(E10)で楽観に偏っていないかを見る。T1・T2 の試遊ログで較正する(ゲート2のログが最初の完全な実測)。帯はボットの出力の期待であり、人間の手触りの保証ではない([[game-feel-needs-playability-check]])。

### 構造検査(`/test`・`code-reviewer` が grep)

(1) `from "three"` が `render/` のみ。(2) `render/` が `../model`・`../hooks`・`../ui`・`../audio` を import しない。(3) `model/` が `three`・`react`・`../render`・`../hooks`・`../ui`・`../audio` を import しない。(4) `AudioContext`・`webkitAudioContext` が `audio/` のみ、`audio/` が `types/` 以外を import しない。(5) `model/world/` に `Math.random`・`Date`・`performance`・`window`・`document` が無い。(6) `usePointerInput` が `routeStage*` の戻り値で分岐し、`holding` を直接参照していない。(7) スイング時刻を `performance.now()` の差だけで求めていない(`swingAtMs`・`eventElapsedMs` 経由)・ゲージ時刻も `event.timeStamp` 経由。(8) `model/sim/` を import しているのが `*.test.ts` だけ。(9) `skip()` が reducer に触れない・`stage === null` でも plan を進める(v2 の検査 8)。(10) `getBoundingClientRect` を使う hooks が `useSafeArea.ts`・`useStage3d.ts`・`usePointerInput.ts` に限られる(`usePitchingControls` は使わない)。(11) `PLAYTEST_ENABLED` が偽のとき `localStorage` に書く経路が無い。`localStorage` への直接アクセスが `model/prefs/safe-store.ts` を通す箇所以外に無い。(12) 「パワプロ」「パワフル」が 0 件(ソース・UI 文言)。**(13) `ui/` が `../audio` を import しない(`audio/` を import するのは `hooks/` だけ)。**

### E2E(Playwright。D2)

既存の 24 件(1 イニング通し・WebGL 不可でも進行・スキップ・Space/Enter・タッチ・幾何検証)を、v3 の操作・DOM に合わせて更新し、次を追加する。**SwiftShader では実入力が 0.2〜1 秒以上遅れる**ので、時間窓を狙うテストは「ページ内で入力の `event.timeStamp`・飛行開始・D を記録し、アプリと同じ計算で有効試行だけを検証、無効は次の投球で再試行(最大 5 回)」にする([[swiftshader-playwright-input-latency]])。有効試行が得られなければ「環境が遅すぎる」と明示して失敗する。**前提**: tutorial 以外の spec は `addInitScript` で既読・球数ヒントの設定を入れる。試遊ログは `DEV` で常に有効なので、「入口が無い」確認は preview ビルドの別 project で行う。

1. **離す=スイング(タッチ)**: `hasTouch`・390×844。指を置いてドラッグし、飛行中に離す → `data-timing` が出て `data-play-kind` がスイング結果。有効試行(`dtMs` が窓内)のときだけ `dtMs` を検証。
2. **持ち替えは捨てる**: D−300ms より前の離しでスイングにならない(結果は見逃し。ヒントが出る)。D−300〜D−150ms の離しは「早い」の空振り。
3. **見逃し(指を離さず待つ)**: 指を置いたまま D+250 をまたぎ、**イベント時刻 D+300 に離す → 見逃し**(空振りストライクにならない)。D+200 に離す → 空振り(遅い)。D+400 に離す → 見逃し。
4. **持ち越しの指**: 演出中にタップでスキップして指を置いたまま、次の球で離す → スイング(昇格)。
5. **追加の指・スイングボタン・Space**: v2 のテストを維持(狙いの指がいても追加の指で即スイング)。
6. **予告とリング**: 人間打撃で `data-guide="exact"`(ふつう)、むずかしいで `fade`。リング半径がリリース直後 > D で減る(ページ内サンプリング)。
7. **投球**: PC(マウス: 動かす→クリック→クリック)・キー(矢印→Space→Space)・ボタン(`throw-pitch` を 2 回。**2 回目はゲージ開始から 250ms 以上後**)で 1 球投げられ、`data-pitch-quality` が出る。自動投球(停止しない)で失投になり試合が止まらない。ダブルクリックで失投にならない。`fast=1` でゲージが短縮される。守備の入力面の `touch-action` が `none`。
8. **チュートリアル**: 初回に出て「はじめる」で閉じる。表示中は投球が始まらず、**Space/Enter でスキップされず「つぎへ」がキーで押せる**。
9. **音**: `addInitScript` で `AudioContext` を計数スタブに差し替え、最初の操作(`pointerup`/`click`/`keydown`)の後に `unlock`、1 球で `pitch-release`・`mitt`(またはスイング音)が呼ばれる。ミュートで呼ばれない。**音質は自動では検証できない**(手動確認と音のデモ)。
10. **試遊ログ**: スイングごとに記録が増え、要約と `<textarea>` の JSON が表示され、「消去」で 0 になる。**`localStorage` が例外を投げる(`Storage.prototype.setItem` を差し替える)環境でも 1 試合が通り、記録が画面に出る**。clipboard を無効化しても取り出せる。preview ビルド(試遊ログ無効)では入口が無い。
11. **幾何**: 縦長 3 高さ+デスクトップ+タブレットの打撃・守備(守備のバー ≤ 135/140px、格子がバーに掛からない、打者の頭の右端 ≤ 90px、ゾーンがオーバーレイと 4px 以上離れる)。`index.html` に viewport meta がある。
12. **回帰**: 1 イニング通し・WebGL 不可・スキップ・Enter/Space 長押しで再試合しない・`home.spec.ts`。seed は判定・CPU の変更で変わるので、**値を調整する A14・B3・D1 の後に**再探索する。

### 手動確認(ゲート2の前に `tester` が実施し、人間が実機で再確認)

① スマホ縦(390×844・390×745・390×664)で、打撃・守備の構図(打者が小さく端・ゾーンが中央・ボールの通り道が打者から離れる)、予告の点とリング、ボールの見え方(リリース直後から追える)。② 1本指で「スライド→離す」で振れる、見逃すときに指を離さず待てる、持ち替えが誤爆しない、スキップした指をそのまま次の球で離せる、追加の指・スイングボタンも使える。③ 守備でゾーンをなぞって狙い、リングに合わせてタップでき、狙いと着弾の重ね表示とナイスピッチの表示が出る。スクロール・長押しのメニューが出ない。④ バナー(ヒット・ジャスト・ホームラン・三振・四球)・ヒットストップ・位置ずれ表示。⑤ 音(打撃音・ミット音・歓声・UI 音)と振動(Android)、ミュート。⑥ チュートリアルと最初の数球のヒント。⑦ ボットの出力(E・F 群の表)を完了報告に貼る。⑧ **実機の試遊ログ**(下記)。

### 「人間が遊んで打てるか」の検証手順と、遊べる版を人間に渡すタイミング

1. **ボット(代理)**: 打撃・投球ボットの帯を満たす。**検出力テスト(E1)で前回の不合格を再現できること**・**悲観シナリオ(E10)と失敗の型(E11)**が前提。
2. **T1 — 中間試遊(段階 A の完了直後 = A13。段階 B・C の前)**: orchestrator が試遊ビルド(`VITE_PLAYTEST=1`)を人間に渡す。人間は**打撃 20 打席(約 60 球)**を遊び、画面の試遊ログ(JSON)をコピーして貼る(守備・演出・音はこの時点では未実装)。診断(4-3 の表)で原因を切り分け、ロックオン強度・予告・遅延補正・見逃し/持ち替えの規則・ボットの較正に反映する(A14。必要なら A1・A2・A4 を直す)。**ゲート1で承認を得る**(Q8)。得られなければ T1 を省き、ゲート2のログで較正する。
3. **T2 — 最終試遊(`/test` 完了後 = ゲート2)**: 必須。**打撃 20 打席(約 60 球)と守備 20 球**を遊ぶ。合格の目安は、**人間の主観**(`AskUserQuestion` の 3 択: 「打てた・投げられた」/「微妙」/「打てない」)と、ログの客観値(**最初の 20 打席**の目安: コンタクト率 ≥ 55%、ストライクを振る率 ≥ 70%、離す時刻の SD ≤ 100ms、距離の中央値 ≤ 60px、無視された離しのうち `late` + `regrip` ≤ 20%、fps の p95 ≤ 33ms)。**主観が「打てない」なら、ボットが合格していても不合格**とし、ログの診断表で原因を特定して `/design` か `/implement` に戻る。
4. 試遊環境の確認: ログの端末情報と縮小表示の警告で、どの画面(ブラウザ単体/アーティファクトの iframe/アプリ内)で遊んだかを記録する。公開アーティファクトの HTML には viewport meta がある(調査で確認済み)ので、リポジトリの `index.html` の viewport meta を E2E で固定するにとどめる。取り出しは画面の `<textarea>` が必ず動く(clipboard・ダウンロードに依存しない)。

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
| M7 | 打撃 | チュートリアル(打撃カード 1〜3。③に「みおくる ときは ゆびを はなさずに まつ」) | 説明の文言・指のアニメーションの見せ方 |
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
| 打者(縦長) | 頭の中心 (−31, 397)・半径 106px(画面内 x ≤ 74)。胴の右端 x ≈ 38。足元 y ≈ 708(バー y 663 の下)。**バットは通常の 1.50 倍の長さ**で、接触時に画面 x ≈ 285px まで届く |
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
[指を置く]──カーソルは動かない(相対ドラッグの起点。演出中に置いた指は演出後にそのまま狙いの指になる)
   │
[スライド]──指の移動量だけカーソルが動く。終盤はロックオンで ● に吸い寄せられる
   │            (windup 中も動かしてよい。飛行中に動かし続けてよい)
   │  投球がリリースされた瞬間: ● と大きなリングが出る → リングが D に向けて縮む
   ▼
[リングが ● にぴったり重なる瞬間に 指を離す] = スイング
   │   判定時刻 = 離した時刻 − 70ms(タッチの遅延補正)
   │   ※ 球が来る前(D−300ms より前)の離しは「持ち替え」で無視 / 見逃すときは指を離さず待つ(D+250ms を過ぎた離しは見逃し)
   ▼
結果: 「ジャスト!/早い −62ms/遅い +48ms」+「芯/かすり」+ 位置ずれ(十字と輪)+ 打球音・振動
   ▼
打球カメラ → バナー(ヒット/ホームラン/三振…)→ タップでスキップ可 → 次の球
別の振り方: 追加の指をタップ(その場で即スイング)/ スイングボタン / PC はクリック・Space
```

**投球**:

```
[球種チップを選ぶ(常時)]
   ▼
[指を置く]──照準が出る → [スライド]──照準が動く(散布円がブレの目安) → [指を離す] = 狙い確定、ゲージ開始
   ▼
リングが 0.9 秒かけて照準に向けて縮む(過ぎても 0.3 秒は縮み続ける。開始から 0.25 秒は停止できない)
   ▼
[リングが照準にぴったり重なる瞬間に タップ(どこでも / 「とめる!」)]
   → 質: ナイス(±40ms)/ グッド(±90)/ ふつう(±160)/ 失投
   ▼
windup 0.28 秒 → 投球 → 着弾 → 狙い(白)と着弾(シアン)の重ね表示 + 「ナイスピッチ!」
PC: マウスで狙い → クリック(確定)→ クリック/Space(停止)
```

## リスク・トレードオフ

- **離す=スイングの誤爆(Q1)**: ドラッグ中に指を離すと(持ち替え)スイングになりうる。D−300ms より前の離しは無視し、ヒントとチュートリアルで緩和する。**見逃すときは指を離さず待つ**という新しい作法が要るので、見逃しの離しは締切 D+250ms を過ぎれば見逃し(空振りにならない)にし、ボットの `takeRelease` で誤スイング率を監視する(E11)。許容できなければ、v2 のタップ方式を維持して予告・リング・ロックオンだけを入れる(`routeStageRelease` を `none` にし、タップ判定を戻すだけ。A4 を差し替え)。
- **アシストで打撃が易しくなりすぎる/「球を見て打つ」感が減る**: ロックオンと予告で安打が増え、全てライナーになる(v2 診断 §0)。`qualityPenalty` と難易度の差(むずかしい = fade・弱いロックオン)で緩和し、A14 が帯(E 群)に合わせる。「打てない」を優先するため、ふつうの出発値は強めにした(0.55)。
- **ボットは代理にすぎない**: 検出力テスト(E1。調整先は共有パラメータに限る)・悲観シナリオ(E10)・失敗の型(E11)で楽観を抑えるが、パラメータは仮定。実機の試遊ログ(T1・T2)で較正する。帯を満たしても、人間の主観が「打てない」なら不合格とする。
- **試遊ログの取り出し**: sandbox の iframe では `localStorage`・clipboard・ダウンロードが使えないことがある。メモリを主・画面の `<textarea>` を必ず動く経路にして緩和。それでも長いログの手書き転記は人間の負担になるので、要約表(数行)だけでも診断できる粒度にしてある。
- **投球の操作が 2 ジェスチャで、テンポが遅くなる**(約 3.6 秒/球)。腕前の要素の対価。windup 短縮・テロップ短縮で相殺し、スキップ可。許容できなければ「ゲージなし(案 D: 狙いの精度だけ)」に落とせる(`gauge` の質を常に「グッド」にする)。
- **守備のドラッグが実機でスクロール・pointercancel で壊れる**: `touch-action: none`・callout/user-select 抑止・contextmenu 抑止を守備でも入れた。Playwright の touch エミュレーションでは再現できないので、T1(打撃)・T2(守備を含む)の試遊ログの pointercancel の回数で確認する。
- **打者を小さくしてバット軸を 1.50 倍にする**ので、体とバットの比率が不自然に見える可能性がある(バットだけ長い。太さは変えない)。接触時の先端到達(+0.30m)を守るための補正で、D3 が `portraitScale`(0.62〜0.80)・`portraitBatLength` を調整する。モックで人間が確認する。
- **音のチープさ・自動再生制限・iOS のサイレントスイッチ**: 合成音の品質は自動検証できない。デモ(M13)で事前に聴く。ユーザー操作として認められるイベントで `unlock`、ミュートを常に出す。iOS のマナーモードでは鳴らない(チュートリアルに注記)。
- **予告がリリースと同時(windup 中には出せない)**: パワプロは投球モーションの開始で出すが、v3 は CPU の dispatch がリリース時のため。残り約 1.3 秒あるので許容。windup 中に出す案は reducer の順序変更が要るので P1。
- **CPU 打者の変更(位置・質への反応)で CPU 同士の打率が下がる**: B3 が出発値を調整して `balance.test` の基準を保つ。固定シード依存のテストと E2E の seed は再導出・再探索が要る(D2 は値の確定後)。
- **段階導入のコスト**: 段階 A の守備は旧格子 UI を新コマンドへ変換して維持する(使い捨ての変換が A13 に入り、B6 で消える)。ファイルを段階ごとに再編集するので、同じファイルの変更が 2〜3 回に分かれる(並列ステップでは触らない規則で衝突は避ける)。その代わり、T1 で打撃の骨格を人間が早く触れる。
- **`SceneFrame`/`PitchCommand`/`PlaybackSpeed` の型変更**で A0〜A12 の間は typecheck が赤い(出荷しない。A13 で緑)。
- **ヒットストップ・ズームパンチ・シェイク**は酔い・頭痛の懸念。`prefers-reduced-motion` で無効、設定に出す余地あり(P1)。
- **実機 fps は未計測**: v3 は描画負荷を大きくは増やさない(ボールのハロー・縫い目・予告のリング程度)が、実測は試遊ログで確認する。P1 に進む条件は「実機 fps・draw call の計測」節。
- **規模**: 31 ステップ・新セグメント 1 つ・約 45 の新規ファイル。段階 C(演出・音)は、打撃・投球の骨格(A・B)と独立しているので、ゲート1で規模を調整する場合は C を後続の別サイクルに回せる(A0 の型契約に C の分を含めてあるので、その場合は C の型・定数を残して未使用にする)。

## ロールバック方針

- 変更は上の「変更ファイル」に閉じる(DB・外部システム・データ移行なし。`localStorage` のキー `bb-tutorial-v1`・`bb-prefs-v1`・`bb-playtest-v1` はゲーム内だけで、削除しても支障はない)。問題が出たら PR 単位で `git revert` する。ホーム(`/`)と `home.spec.ts` には影響しない。
- 部分的な切り戻し: (1) **操作**: A4 の `routeStageRelease` を `none` にしてタップ判定を戻す(v2 のタップ方式)。(2) **アシスト**: `ASSIST_TABLE` の `lockStrength` を 0・`preview` を `"none"` にすると補正も予告も無くなる(リングと視認性の改善は残る。`fade` は円が出るので v2 には戻らない)。(3) **構図**: `battingCameraPortrait` の x と `actors.batter.portrait*` を v2 の値(−0.25 / −0.65 / 0.92 / 1.0)に戻す。(4) **投球**: `gauge.sigmaScale` をすべて 1.0 にし windows を ∞ にするとゲージが無効(質が常にふつう)。(5) **音・触覚・ログ**: 設定の既定を OFF にする/`VITE_PLAYTEST` を付けない(コードは残してよい)。
- 判定・バランス(`BATTING_PARAMS`・結果表・CPU 難易度)は、元の値に戻せば v2 の挙動に戻る(`bot-balance.test` の帯は戻した値に合わせて見直す)。

## 未解決の疑問(ゲート1用に整理)

**ユーザーに決めてもらう 4 論点(Q1・Q3・Q7・Q8)は冒頭の表**。以下は**推奨既定値で進める項目**(異論があればゲート1で言ってもらう。モック・音のデモで確認できる)。

- **Q2 ロックオンの強さとアシストの持たせ方**: 既定は難易度に連動(かんたん強 0.80・ふつう中 0.55・むずかしい弱 0.20)。独立の「アシスト」設定をタイトルに足す案・ロックオン無し(予告とリングだけ)の案は採らない。強度は T1 のログと A14 のボットで調整する。
- **Q4 打者の構図**: 既定は案 M1 = 打者 scale 0.70・x −0.75・バット軸 1.50 倍(画面内の打者が左 19%)。控えめ案 M2 = scale 0.78・x −0.70・バット軸 1.30 倍(左 24%)をモックに並べる(計算上、先端は +0.32m で届く)。打者を半透明にする案は採らない。
- **Q5 投球の方式**: 既定は案 C 簡略版(ゾーンを直接なぞる+リングゲージ)。ゲージなし(案 D)は、テンポ(Q9)を理由に許容できないとゲート1で言われたときの落とし先として残す。
- **Q6 難易度ボタンの意味**: タイトルの「かんたん/ふつう/むずかしい」を、CPU の強さとアシストの強さの両方に使う。
- **Q9 投球のテンポ**: 人間の投球は 1 球約 3.6 秒(v2 は約 2.7 秒)。既定のまま(ゲージ 0.9 秒)。短くする余地は `gauge.ringMs`。
- **Q10 P1 に進む基準**: 「実機 fps・draw call の計測」節の出発値(fps 中央値 ≥ 55・p95 ≤ 25ms・draw call ≤ 400)。ゲート2でユーザーが最終判断する。
- **Q11 ユーザーが指す「パワプロ」の作品・端末・持ち方・音を出して遊んだか**(調査の未確認事項): T1 の依頼文で一緒に聞く(設計は変えず、Q3・Q7 の判断材料にする)。
- **Q12 試遊の環境**: 公開アーティファクト(iframe)でも動くよう、ログの取り出しは画面の `<textarea>` を必ず動く経路にした(clipboard・ダウンロード・`localStorage` に依存しない)ので、配布方法の確定を段階 A の前提にはしない。T1 の依頼時に、遊んだ場所を一言聞く。
- **Q13 バナーの文言・派手さ**: 文言は自前(パワプロの文言・ロゴ・BGM を模倣しない)。フラッシュ・紙吹雪は `prefers-reduced-motion` で止める。

設計内の未確定の値(A14・D3 が実測で確定する): 打者の `portraitScale/portraitX/portraitBatLength`、ロックオンの強度・`qualityPenalty`、ボットの帯の境界(出発値は仮定)、390×664 以下のゾーン寸法、操作バーの高さ(≈ 130px)、`guide` の各半径。

## 設計レビュー結果

`design-reviewer` による自動レビュー(最大2ラウンド、`/design` 実行時)の記録。

| ラウンド | 判定 | 主な指摘 |
| --- | --- | --- |
| 1 | MAJOR(MAJOR 7・MINOR 15・NIT 5) | 下の「ラウンド1の指摘と対応」。方向性(案C・P0、決定の見直し一覧、T2 で人の主観が拒否権を持つこと)は妥当。構図の検算は設計値と一致 |
| 2(ラウンド1がMAJORの場合のみ) | (未実施。下の対応が反映されているかを確認する) |  |

未解決のMAJORが残った場合: (ラウンド2の後に記入)

### ラウンド1の指摘と対応

反映しない指摘は無い(M7 の「Q12 を V21 より前に確定」だけは、確定を待たずに済む設計(取り出しの経路を必ず動くものにする)に変えて満たした。理由は M7 の行)。

| # | 指摘 | 対応と対応箇所 |
| --- | --- | --- |
| M1 | 到達通知を D+370 まで保留すると、見逃し後の自然な指離しが空振りストライクになる | **反映**。受理の判定を離した入力の**イベント時刻 ≤ D+250** にし、超えたら見逃し(即座に到達通知)。保留は処理遅延の吸収だけと明記。ボタン・追加の指も同じ基準(`eventElapsedMs`)。E2E #3 を「D+300 に離す → 見逃し」に反転。チュートリアル・ヒント・Q1 に「見逃すときは指を離さず待つ」。ボットに `takeRelease`(見逃しの離し)と誤スイング率を追加。箇所: §1-1(操作・見逃し・到達通知の保留)、決定の見直し #12、やらないこと、§1-5、§4-1(失敗の型・離す時刻)、契約(`eventElapsedMs`・`routeStageRelease`)、A4・A9、受け入れ D3・E11、E2E #3、冒頭 Q1 |
| M2 | 演出中に置いて動かさなかった指は離してもスイングにならない/「1本目」を isPrimary で判定 | **反映**。狙いの指を `pointerId` で管理し、持ち越しの指は演出終了時に狙いの指へ昇格、狙いの指が離れたら他の指が次の move で昇格。`routeStagePointer` は `isPrimary` ではなく `aiming` で振り分ける。箇所: §1-1 の表、契約(`shouldPromoteHeld`)、A4(判定表 (3)(8)(9))・A9、受け入れ D1・D5、E2E #4 |
| M3 | 検出力テストが v3 の楽観を検出できない | **反映**。「リング無し」の `biasMs` は調査の値で固定し、E1 を通す調整は共有パラメータに限定して同じ母集団を E2〜E7 にも適用。リング有りの `biasMs` を仮定と明記。悲観シナリオ(E10)と失敗の型(`takeRelease`・`regripRate`・`cancelRate`・`ignoreRing`。E11)を追加。箇所: §4-1(パラメータ表・検出力テストと調整先の限定・悲観シナリオ)、A14、受け入れ E1・E10・E11 |
| M4 | 並列ステップが共有する型が V0 に無い | **反映**。`BannerView`・`BannerKind`・`SfxRecipe`/`SfxLayer`/`SfxRecipeTable`・投球入力の型(`PitchInputState` ほか)・`TutorialStep`・`GameStageViewProps`・`ballScaleFor` のシグネチャ変更を A0/A2 に追加。`createAudioEngine({ recipes, createContext })` に一本化。`batHeightInRoot` は補間後の scale で割ると A11 に明記。箇所: §5(契約)、A0・A2・A11・C3 |
| M5 | バット先端の数値が実際の描画モデルと合わない | **反映**。`lengthScale` を「チルトグループの z 方向の拡大(軸の長さだけ。位置オフセット 0.05 は伸ばさない)」と定義し、式 `x_b + scale × (0.05 + 0.975 × L × cos(tilt) × cos(sweep))` に統一。L を 1.45 → **1.50**(先端 +0.302m)に変更し、A5・A2・D3 の基準を ≥ +0.28 にそろえた(L = 1.45 は +0.269 で満たさない)。`portraitBatScale` を `portraitBatLength` に改名。箇所: §3-1、§7、契約(`batTipX`・`BatPose.lengthScale`)、A2・A8・A11、受け入れ A5、D3 |
| M6 | 守備の直接ドラッグが実機ではスクロール・pointercancel で壊れる | **反映**。人間守備中も `.bb-stage__input--active`(`touch-action: none`)を付け、callout/user-select 抑止・`contextmenu` の `preventDefault`。試遊ログに pointercancel の回数・時刻と無視された離しの理由を記録し診断表に行を追加。箇所: §1-1(末尾)、§4-3、A12・B6、受け入れ D6、E2E #7 |
| M7 | ユーザーの試遊環境では試遊ログと設定の保存が機能しない可能性 | **反映(Q12 の確定時期だけ方法を変更)**。記録はメモリを主、`localStorage` は `try/catch` の任意保存(`createSafeStore`)。取り出しは画面の `<textarea>`・要約表を必ず動く経路にし、clipboard・ダウンロードは補助。単体(`safe-store.test`)と E2E に「`localStorage` が例外を投げても 1 試合が通る」を追加。**Q12(試遊場所と配布方法)の確定を待たなくても成立する設計にした**ので前提から外した(T1 の依頼時に遊んだ場所を聞く)。箇所: 全体方針、§1-5、§4-3、A6・A10、受け入れ I1・I3、E2E #10、未解決の疑問 Q12 |
| m1 | V24(seed 探索)は値を調整する V22・V23 の後に | **反映**。D2 を A14・B3・D1 の後に置き、最終の E2E は D1〜D3 の後。箇所: ウェーブ構成、D2 |
| m2 | E2E の前提の抜け(チュートリアルで既存 24 件が止まる、DEV で試遊ログが常に有効、viewport meta の固定が無い) | **反映**。tutorial 以外の spec は `addInitScript` で既読設定、「入口が無い」確認は preview ビルドの別 project、viewport meta の固定を D2 と E2E #11 に追加。箇所: D2、E2E の前提・#10・#11 |
| m3 | 担当者のいないファイル | **反映**。`model/sim/bot-sim.ts` は A3(型の追従)、`render/dispose.test.ts` は A7、`render/test-fixtures.ts` は A0、`difficulty.ts` は B3(構造)と D1(値)に限定(A14 には含めない)、A7 のテストは A0 の `makeFrame` に依存。箇所: 変更ファイル表、A0・A3・A7・B3・D1 |
| m4 | 飛行途中の持ち替え(早離し) | **反映**。D−300ms より前の離しは持ち替えとして無視しヒントを出す(`regripBeforeMs`)。ボットに `regripRate`。箇所: §1-1、契約(`BATTING_PARAMS`)、A4、受け入れ D4、E11、E2E #2 |
| m5 | 投球ゲージの失敗(ダブルクリック・遅延補正の種別) | **反映**。ゲージ開始から `stopGuardMs`(250ms)は停止を無視。遅延補正は入力種別別(タッチ 70・マウス/キー 20)。箇所: §2、契約(`PITCH_PARAMS`・`isStopAccepted`)、A3・B1、受け入れ F1、E2E #7 |
| m6 | チュートリアルを holding に合成している | **反映**。専用フラグ `tutorialActive` にし、`holding` と別にして入力面を無効化(Space/Enter・タップがスキップに消費されない)。箇所: §1-5、A13、E2E #8 |
| m7 | iOS の音・容量超過 | **反映**。`unlock` はユーザー操作として認められるイベント(`pointerup`/`touchend`/`click`/`keydown`)で行い `pointerdown` は使わない。`visibilitychange` で `resume`。`setItem` の例外は `createSafeStore` で捕捉。箇所: §3-3、A6・C3・C5、受け入れ H3 |
| m8 | 画面上の px 指定を描画側で求められない | **反映**。px ではなく画面高さに対する比(`shellMinRatio`・`ringWidthRatio`)にして model が m に換算し、`ball.outlineScale`・`guide.ring.width` として SceneFrame に入れる。箇所: §1-4(画面上の px の扱い)、契約、A2・A5・A7、受け入れ B2・C1 |
| m9 | `usePitchingControls` の座標変換と受け持ち | **反映**。`pickZone`・`getZoneRect`・`holding`・`onSkip` を注入で受け、守備中の入力面は `usePitchingControls`、スキップは `routeStagePointer` を先に通す。構造検査 10 と整合。箇所: §2(入力面の受け持ち)、B4・B6、受け入れ F7 |
| m10 | G4(1球 ≤ 2.5s)の定義 | **反映**。式(windup + D + 人間打者の見逃しの締切 + テロップ + 余韻)で定義し、ストレート ≤ 2.65s・カーブ ≤ 3.0s に。箇所: §2(テンポ)、受け入れ G4 |
| m11 | ボットテストの実行時間 | **反映**。通常は縮約(30 人 × 1000 球)、完全版は `BOT_FULL=1`、ファイル分割・1 ファイル 60 秒以内・全体 +90 秒以内。箇所: §4-1(時間予算)、受け入れ J3、A14・D1 |
| m12 | knip | **反映**。各統合ステップに knip レポート確認を追加。`toCsv` は `PlaytestPanel` のダウンロードから使う。箇所: A13・C7、受け入れ K |
| m13 | 人間の試遊が遅い(T1 が V21) | **反映**。実装を A〜D の 4 段階にし、打撃の骨格だけを先に通しで作って**中間試遊 T1**(A13 直後)を前倒し。ウェーブ構成と依存を作り直した(守備は段階 A では旧 UI を新コマンドへ変換して維持)。ゲート1の論点 Q8 を拡張。箇所: 冒頭・実装ステップ全体、リスク(段階導入のコスト)、検証手順 |
| m14 | viewport meta の記述の食い違い | **反映**。「公開 HTML に viewport meta あり = 確認済み」にそろえ、「無かった可能性」の記述を削除。ログの縮小表示の警告は別環境・退行の検出用と位置づけた。箇所: §4-3、検証手順 4、リスク |
| m15 | 構造検査の追加(ui が audio を import しない) | **反映**。構造検査 13 に追加。箇所: 構造検査、フロントエンド構成、A12・B2・C4 の完了条件 |
| n1 | 「D−655ms で 1 倍」は誤り | **反映**。真の径が最小径 14.8px に達する D−730ms 付近に訂正。箇所: §1-4、§7 |
| n2 | T1(20 打席)と T2(初回 20 球)の記述がそろっていない | **反映**。T1・T2 とも「20 打席(約 60 球)」(T2 は守備 20 球を加える)にそろえた。箇所: 検証手順、A13 |
| n3 | ロールバック(2)「fade で v2 に近い」は誤り | **反映**。`preview: "none"` を追加し、ロールバックは「`lockStrength` 0・`preview` `"none"`」に変更(リングと視認性の改善は残る)。箇所: §1-2、契約(`AssistParams`)、ロールバック |
| n4 | 振動 8ms は多くの Android で無視される | **反映**。最短 15〜20ms にし(スイング 15ms・ヒット 20ms)、受け入れ H4 に「最短 15ms 以上」。箇所: §3-3、C2 |
| n5 | `model/world/sound/` は `model/sound/` の方が意味が通る | **反映**。`model/sound/` に変更(`audio/` との関係は同じ)。箇所: §3-3、契約、変更ファイル表、C2 |

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

- 適用: [[visual-scope-must-be-shown-at-gate1]](ゲート1で見せるもの)、[[game-feel-needs-playability-check]](ボット v2・検出力テスト・試遊ログ・数値の受け入れ基準)、[[frontend-3d-three-in-render-segment]](境界の維持・`audio/` の追加)、[[three-r186-pitfalls]](render の追加描画物)、[[sample-app-lint-random-and-index-access]](ボット・音・ジッタの決定論と lint)、[[dom-key-input-exclusivity]](投球のキーの排他・チュートリアルのキー)、[[swiftshader-playwright-input-latency]](E2E の有効試行)、[[pure-function-extraction]]、[[feature-segment-import-boundaries-not-enforced]](`audio/` の構造検査)。
- 上のエントリの `related_topics` に `baseball-game-v3` を追記済み(いずれも 2 件目なので、スキル化候補にはまだ達していない。`related_topics` が 3 件以上になったエントリは無い)。
- メモリ候補(ゲート通過後に orchestrator が `docs/memory/` へ記録を検討): decision「打撃の操作は離した瞬間=スイング。見逃しは指を離さず待つ(v2 のタップ方式を覆した)」、decision「効果音は Web Audio の合成のみ・新セグメント `audio/`(`model/sound/` が対応表)」、pitfall/convention「人間代理ボットは個人差の分布・知覚誤差・Fitts・新しい操作で生じる失敗の型を持ち、前回不合格だった設定で『打てない』を再現できる(検出力テスト。調整先は共有パラメータに限る)ことを受け入れ基準にする」、convention「実機の試遊ログは `localStorage`・clipboard に依存せず画面から取り出せる形にする(sandbox の iframe 対策)」、pitfall「`localStorage` を新規に使うときは `try/catch` の安全なストアを通す(アーティファクトの iframe で例外になる)」、open-question「横持ち対応の要否」。
