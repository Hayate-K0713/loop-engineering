# 開発・検証コマンド

このドキュメントは `CLAUDE.md` から参照される、実装対象プロジェクトの開発・検証に関する詳細である。

実装対象プロジェクトは `sample-app/`(TypeScript, npm workspaces: `shared`=型定義, `backend`=NestJS, `frontend`=Vite+React)。静的解析・テスト運用方針(次節以降)を実地で確認するための最小構成で、詳細は `sample-app/README.md` を参照。`/test` は以下のコマンドを実行する。

- 型チェック: `cd sample-app && npm run typecheck`(shared/backend/frontend すべて)
- Lint: `cd sample-app && npm run lint`(サイズ/複雑さ/型/`sonarjs`/`security`/フォーマット(`prettier`)のルールは全て`error`まで昇格済み。詳細は「静的解析・自動チェックの考え方」)
- 自動テスト(backend+frontendの純粋関数): `cd sample-app && npm run test`
- ビルド: `cd sample-app && npm run build`
- E2E(frontend+backendを自動起動、要 `npx playwright install chromium`。ブラウザ野球の e2e(`e2e/baseball.spec.ts`)を含む): `cd sample-app && npm run test:e2e --workspace frontend`(ブラウザ野球の画面は WebGL2 の 3D 描画で、headless Chromium では SwiftShader のソフトウェア描画になるため、1試合を通すテストは数十秒かかる。詳細は「手動確認の使い分け」の WebGL の注意)
- ボット試算(打撃バランス): `cd sample-app/frontend && npx vitest run src/features/baseball/model/sim/bot-balance.test.ts`(`npm run test` にも含まれる。見方は次の「ブラウザ野球の打撃バランスのボット試算」)
- 手動確認: API は `curl`、画面は Playwright CLI(「手動確認の使い分け」参照)

同じチェックは `.github/workflows/ci.yml` がpush/PRごとにも実行する(CIは人間の直pushに対する最後の砦。「静的解析・自動チェックの考え方」の「壊れたら赤くなる」層の一部)。

`backend`のAPI境界は `shared` パッケージの型(`QuoteInput`等)を実装するclass-validator製DTO(例: `quote-query.dto.ts`)で検証する。手書きの`Number()`パースに頼らない。新しいエンドポイントを追加する際もこのパターンに従うこと。

新しいトピックで別のアプリケーション/言語を対象にする場合は、このドキュメントを該当プロジェクトのコマンドで上書きすること。

## ブラウザ野球の打撃バランスのボット試算(`model/sim/bot-balance.test.ts`)

人間のプレイは自動テストで再現できないので、「人間のように振る」ボットを多数回(20000 球 × 9 種類)回して、打撃の判定・結果表・CPU 難易度・カメラ(画面上の大きさ)を変えたときにゲームとして遊べる範囲に収まっているかを数値で確認する(`docs/memory/entries/game-feel-needs-playability-check.md`)。ボットは `model/sim/bot-sim.ts` にあり、**テスト専用層**(`*.test.ts` 以外は import しない)。

- **ボットの種類**: A(上手い人)・B(スマホ標準。基準)・B@664(画面の高さ 664px の縦長)・F(片手。ドラッグしてタップ)・C(スマホ初心者)・D(到達を +60ms 遅く感じる)・E(PC マウス)・B-強振、および CPU 打者(ふつう)。画面上の px とゾーン単位の換算は `camera/project.ts`(`pxPerZoneUnit`)から取るので、カメラの構図を変えると結果が変わる。
- **見る指標**: 無効率(スイングが受理されない割合。基準 0%)、空振り率、ファウル率、安打率(B は 30〜35%)、ボット間の勾配(A > B > C は各 3 ポイント以上)、遅延補正と px/ゾーン単位の整合(±8%)。帯の一覧と根拠は設計書の「修正設計」§10・§15 を参照。
- **失敗したとき**: 帯を緩めない。判定の定数(`BATTING_PARAMS`: `foulRatio`・`mediumFrom`・`strongFrom` など)・結果表・CPU 難易度を調整するか、設計の見直しとして上申する。カメラ・ゾーンの px を変えたら(見た目の調整を含む)このテストを必ず再実行する。
- **出力**: 失敗しなくてもボットごとの表(無効・空振り・ファウル・インプレー・安打・本塁打の割合)を標準出力に出す(`/test` の手動確認では出力を完了報告に貼る)。

## 手動確認の使い分け(自動テストが無い/不十分な場合)

- **API・バックエンド**: `curl` で実際にエンドポイントを叩いて確認する。
- **フロントエンド(画面・UI)**: Playwright CLI(`npx playwright test` 等)で確認する。ブラウザ野球の画面は `npm run dev:frontend` で起動して `/#/baseball` を開き、`?seed=<uint32>&innings=1&fast=1` を付けて決定論的・高速に確認する(これらのパラメータは開発サーバーでのみ有効で、本番ビルドでは無視される)。
  - **ゲーム画面は Three.js の 3D 描画なので、見た目は必ずスクリーンショットで確認する**(DOM の存在やテキストだけでは、ステージが映っているか・HUD や操作バーがゾーン枠・投手・打者を覆っていないかが分からない)。使い捨てのスクリプトで `page.screenshot()` を撮り、画像として読んで判定する(スクリプトとスクリーンショットはコミットしない。残す場合は `docs/tests/assets/<topic>/` に 1 枚 500KB 以下で)。デスクトップ(1280×720)とスマホ縦(390×844、`hasTouch`)の両方で、タイトル・人間打撃・人間守備・結果画面を確認する。オーバーレイの幾何(ゾーン枠・守備の格子を覆わない等)は `e2e/baseball.spec.ts` のレイアウト検証が機械的に確認する(スマホ縦は高さ 844・745・664、ほかにデスクトップ 1280×720 とタブレット 768×1024)。スマホ縦は幅 390px でも、ブラウザのツールバーの有無で実際の高さが変わるので、高さ違いを必ず見る。
  - **WebGL の注意**: (1) WebGL2 が必要(three r163 以降は WebGL1 不可)。Playwright 1.62 の headless Chromium は追加の起動引数なしで WebGL2 を作れるが SwiftShader のソフトウェア描画で重く(1280×720 で 1 フレーム約 50ms)、3D 画面では `locator.click()` が数秒かかることがある。(2) 短い演出区間を狙う操作は、先に `page.mouse.move()` で位置を決めてから `page.mouse.down()`/`up()` だけを送る。ループ内の状態確認は `page.evaluate`・`count()` を使い、`isEnabled()` など要素が無いと既定のタイムアウトまで待つ API を避ける。短い区間の検出は `page.waitForFunction(..., { polling: "raf" })`(`toHaveAttribute` のポーリングでは取り逃す)。(3) `stage-3d` の `data-status`(`loading`/`ready`/`unsupported`/`lost`)・`data-phase`・`data-play-kind`・`data-zone-rect` 等の `data-*` を読むと、描画結果を見なくても状態を確認できる。(4) WebGL が使えない場合の進行は、`page.addInitScript` で `HTMLCanvasElement.prototype.getContext` が `webgl`/`webgl2` に `null` を返すようにして確認する(このときブラウザが出す WebGL 生成失敗のログは想定内)。(5) クラウド実行環境では Playwright のブラウザ revision が合わないことがある(`docs/memory/entries/playwright-browser-revision-mismatch.md`)。(6) 描画で詰まった画面では、実入力(マウス・キー・タッチ)がページに届くまで 0.2〜1 秒以上遅れる(`docs/memory/entries/swiftshader-playwright-input-latency.md`)。スイングのような時間窓を狙う E2E は、入力の時刻・投球の開始・D をページ内で記録し、アプリと同じ計算で「前提を満たした試行(有効な試行)」だけを検証して、無効な試行は次の投球で再試行する(`e2e/baseball.spec.ts` の `runUntilValid`)。有効な試行が得られなければ「環境が遅すぎる」と明示して失敗する。CDP のタッチイベントは 1 つずつ待つと 1 つあたり 0.5〜1.5 秒かかるので、続けて送る。
- どちらにも当てはまらない対象(バッチ処理・スクリプト等)は、妥当な方法(直接実行など)で確認する。

`/test` および `tester` はこの使い分けに従うこと。

## 自動テストの追加

手動確認(curl/Playwright)だけに頼り続けるとテストカバレッジが増えない。そのため `/design` は「テスト戦略」で**自動テストを新規作成するかどうかを毎回明示的に決める**(する/しない+理由)。「する」場合は実装ステップのチェックリストにテスト作成タスクを含め、`/implement` はそれもタスクの1つとして `implementer` に委譲する。`design-reviewer` はこの判断が安易な「しない」になっていないかを確認する。

## 静的解析・自動チェックの考え方(壊れたら赤くなる仕組み)

このプロジェクトのレビュー体制は、人間が差分を目視で読むことを前提にしていない(`design-reviewer`・`code-reviewer`による自動レビューが担う)。目視レビューの代わりに、**「壊れたら赤くなる」自動チェックの層を積み上げる**ことで品質を担保する方針を取る。実装対象プロジェクトにLint・型チェック・複雑度チェック等を導入する際は、以下の原則に従う。

- **構成されているチェックは必須で実行する。** `/test`・`code-reviewer` は、Lint・型チェック・複雑度チェックが構成されている場合、実行を省略してはならない。失敗はそのまま不合格/`MAJOR`の理由になる(「あれば実行する」程度の扱いにしない)。
- **新しいルールは初日からブロックしない。** 新しいLint/静的解析ルールを追加する場合、まず`report`(警告のみ・非ブロッキング)で導入し、既存コードの指摘をゼロにしてから`error`(ブロッキング)に昇格させる。初日からブロックすると、コメントで無視する等の「回避の作法」が定着してしまう。この移行計画自体を設計ドキュメントの decision として記録する。
- **例外はインラインではなく設定ファイルに理由付きで書く。** `eslint-disable` 相当をコード中に理由なく埋め込むことを禁止する。抑制が必要な場合は設定ファイル側に「なぜ必要か」「いつ解消するか」を明記する。理由のない抑制は `code-reviewer` が `MAJOR` として指摘する。
- **重複コード検出・デッドコード検出(jscpd/knip相当)は、導入するならまずレポートのみ(非ブロッキング)から始める。** いきなりゲート化しない。

(この方針は https://zenn.dev/singularity/articles/stopped-reviewing-my-code の「壊れたら赤くなる仕組みを積み上げ、人間はレビューではなく実際の挙動を見る」という考え方を参考にしている。)
