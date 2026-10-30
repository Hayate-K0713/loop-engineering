# 設計(分冊): ブラウザ野球 v3 — 契約・変更ファイル・構図の手計算(§5〜§7)

- 本書は [2026-10-27-baseball-game-v3.md](2026-10-27-baseball-game-v3.md)(本体)の分冊。「アーキテクチャ・変更概要」の §5 契約、§6 変更ファイル、§7 構図の手計算にあたる。分冊の一覧は本体の冒頭の表を参照。
- 改訂: 2026-10-29(ラウンド2の反映: 段階 E の契約を A0 から E0 に分離、位置ずれ表示を DOM に変更、頭の右端をヘルメット込みの 109px に)
- 改訂: 2026-10-30(ゲート1回答後の変更: **Q1 = タップ方式の維持**により `IgnoredInputReason`・`BATTING_PARAMS` を整理、**Q-char = 最大**により §5-4(M0 が凍結する契約)と段階 M の変更ファイルを追加、`infieldCamera` の画角を追加。**未再レビュー**)

## 5. 契約(`types/`・`WORLD_PARAMS`・主要な関数)

`types/` は並列実装の契約で、**段階ごとに凍結する**: **A0 が段階 A・B・C の分**、**E0 が段階 E の分**、**M0 が段階 M(最大)の分**。後段の型を前段の完了ゲート(A13 の全体緑・T1)に混ぜない。並列中の不足は編集せず完了報告で上申する(orchestrator がウェーブ間で直列に反映する)。**並列ステップが共有する型はすべてここに置く**。

### 5-1. A0 が凍結する契約(段階 A・B・C)

**`types/batting.ts`**: `AssistParams`(`preview: "exact" | "fade" | "none"`)、`SwingInput.assistK?: number`、`SwingMeta`、**`IgnoredInputReason = "not-ready" | "holding" | "tap-too-long" | "tap-moved" | "cancel" | "held-release"`**(**タップ方式のまま**。押したのにスイングにならなかった理由を記録・ヒント表示するための型。`tap-too-long` = 持続が 180ms 超、`tap-moved` = 移動が 10px 超、`held-release` = スキップに使った指の離し)、`ContactFeedback`。操作の入力ルート(`routeStagePointer`/`routeStageMove`/`routeStageRelease`/`isTapGesture`)の型と定数(`TAP_MAX_DURATION_MS`・`TAP_MAX_MOVE_PX`・`TAP_ARRIVAL_HOLD_MS`)は **v2 のまま**。

**`types/pitch.ts`**: `PitchQuality`、`PitchCommand = { kind; aim: ZonePoint; quality }`、`CpuPitchChoice = { kind; cell }`、`PitchFlight.quality`。**投球入力の型**: `PitchInputPhase`・`PitchInputState`・`PitchInputEvent`・`PitchInputCtx`・`PitchInputEffect`・`PitchInputView = { phase; aim; gaugeElapsedMs: number | null; quality: PitchQuality | null }`。投球入力の `PitchInputState` は**持ち越しの指(スキップに使った指)の `carriedPointerId`** を持つ(B1。守備は「離して確定」なので、スキップに使った指の離しで狙い・ゲージが始まらないための規則)。

**`types/game.ts`**: `PlaybackSpeed.humanWindupMs`(通常 280 / fast 20)。`cpuWaitMs` 通常 550。

**`types/scene.ts`**(`SceneFrame` の追加。`aim` は削除し `guide` に置き換える。**v2 の `feedback` 相当の 3D の位置ずれ表示は追加しない**: 位置ずれは DOM(`ZoneFeedbackView`)で出す):
- `guide: { visible; mode: "exact" | "fade" | "reticle" | "none"; position: Vec3; markerRadius; fadeRadius; alpha; ring: { visible; radius; width; tone: "preview" | "gauge"; glow }; spread: { visible; radius } }`。
- `cursor` に `raw: { visible; position }`。
- `ball` に `rotation: Rot3`・`halo: number`・`outlineScale: number`。`ball.scale` は飛行中も 1 以上。
- `BatPose.lengthScale`(チルトグループの z 方向の拡大)。

**位置ずれ表示の型(DOM。`types/view.ts`)**: `ZoneFeedbackView = { tone: "swing" | "pitch"; from: ZonePoint; to: ZonePoint; ringRadiusZone: number; alpha: number; label: string | null }`(座標はゾーン単位。ゾーン矩形への px 換算は `ui/ZoneFeedback.tsx` が `zoneRect` で行う)。`swing` は from = カーソル(有効カーソルの最終位置)、to = ボールの着弾点。`pitch` は from = 狙い、to = 着弾。

**`types/stage.ts`**: `StageHandle.stats()`。

**`types/sound.ts`(新規)**: `SfxCue`、`SfxEvent`、`SfxLayer`・`SfxRecipe`・`SfxRecipeTable`、`HapticCue`。**`types/telemetry.ts`(新規)**: `PlaytestRecord`、`PlaytestSummary`。

**`types/view.ts`**: `GameView.difficulty`・`assist`、`pitcher.repertoire` に `speedKmh`・`arrow`。`BannerKind`・`BannerView`、`TutorialStep`、`ZoneFeedbackView`。

**`hooks/useGameStage.ts` の `GameStageViewProps`**(A0 で型だけ): 既存に加えて `banner`・`guideMode`・`inputState: PitchInputView | null`・`pitchQuality`・`hint`・`tapHint`(タップが通らなかったときの短いヒント)・**`zoneFeedback: ZoneFeedbackView | null`**。

**`WORLD_PARAMS` の追加・変更(A0 で値まで入れる。ただし `actors.pitcher.scale` と `RELEASE_POINT` は段階 A の間は v2 の値のまま、E3 が更新)**:
- `battingCameraPortrait`: position `(0, 1.75, 2.6)`・target `(0, 0.55, −18)`。
- `actors.batter`: `portraitX −0.65`、`portraitScale 0.70`、`portraitBatLength 1.35`(横長は 0.92・−0.8・1.0)。
- `framing.fit.pitching`: `defaultHalfWidthTan 0.25`・`maxHalfWidthTan 0.65`・`defaultSafeArea { top 0.1837, bottom 0.846 }`。
- `ball`: `minScreenDiameterRatioFlight 0.0175`、`shellMinRatio 0.0024`、`halo { scale 1.9, opacity 0.35, color 0xffd9a0 }`、`spin`、`seam { widthRatio 0.18 }`。
- `guide`: `previewRing { startRadius 0.30, endRadiusRatio 1.25 }`、`ringWidthRatio 0.0036`、`dot { radius 0.04 }`、`fadeInMs 120`、`gaugeRing { startRadius 0.40, endRadius 0.12, afterRatio 0.4 }`。
- **`zoneFeedback`**: `{ swingMs 900, pitchMs 700, lineWidthPx 3, crossPx 16, ringPx 30, frameAlpha 0.35 }`。
- `fx`: `contactPunch { ms 140, fovScale 0.96, shake 0.012 }`、`hitStop { justMs 60, strongMs 40 }`。(`chaseDelayMs` は無い: 接触後の追跡カメラは v2 のまま `chaseFromMs = contactMs`。)
- `banner`: `{ hitMs 900, homerunMs 1600, strikeoutMs 1000, walkMs 900, justMs 700, bandTopRatio 0.37, bandHeightPx 96 }`。
- `telop`: `inPlayMs 900, foulMs 520, swingMissMs 520, takeMs 380, afterglowMs 120`。

**`BATTING_PARAMS`**: **v2 のまま変更しない**(`lateCutoffMs`・判定窓・遅延補正など)。**`aimGraceMs`・`regripBeforeMs` は追加しない**(離す=スイングを採らないため)。**`PITCH_PARAMS` の追加**: `gauge { ringMs 900, graceMs 300, stopGuardMs 250, windows { nice 40, good 90, normal 160 }, sigmaScale { nice 0.35, good 0.65, normal 1.0, miss 1.7 }, missPull { x 0, y 0.15, ratio 0.6 }, aimLimit 1.67 }`。

### 5-2. E0 が凍結する契約(段階 E)

E0 は A13(段階 A の全体緑・T1 のビルド)の**後**に置く。型の追加により、段階 E の統合(E11)まで全体の typecheck は赤になる(各ステップの完了条件は「担当パスで絞り込んだ起因 0 件」)。**E0 の担当ファイルは下の型・定数・`render/character/parts.ts`・`render/test-fixtures.ts`だけ**で、`motion/*`・`teams.ts`・`state.ts`などに仮の値を入れる作業は各担当ステップ(E1・E3・E4・E5)で行う。

**`types/team.ts`**: `PlayerLook`(`{ number, skin(0〜4), hair{style,color}, build, eyes, brow, restMouth, pitchForm, batStance }`)、`Team.pitcher.look`・`Team.batters[i].look`、`Team.pinstripe: boolean`。

**`types/game.ts`**: **`GameState.lastAdvance: RunnerAdvanceRecord | null`**(進塁の事実。表示専用。reducer の乱数・判定に影響しない)。

**`types/scene.ts`**:
- `FaceExpression`(8 種)、`CharacterPose` に `expression: FaceExpression`・`elbowL/elbowR/kneeL/kneeR: Rot3`・`scale: number`(`framingScale`。character 分冊 §3-4-1)、`CharacterJoint`(関節名の和: `"root" | "pelvis" | "torso" | "head" | "upperArmL" | "foreArmL" | "upperArmR" | "foreArmR" | "thighL" | "shinL" | "thighR" | "shinR" | "bat"`)。
- `CharacterSlot = "pitcher" | "catcher" | "batter" | "runner0".."runner3" | "fielder0".."fielder6"`、`SceneFrame.runners: readonly CharacterPose[]`(固定 4)、`SceneFrame.wipe: { visible; target: CharacterSlot; camera: CameraPose; rect: { x; y; width; height }; alpha }`(矩形は px。画面の空き領域の上端から決める。character 分冊 §3-4-9)。`QualityTier = 0 | 1 | 2 | 3`。
- **キャラクターの見た目のデータ(model → hooks → render の受け渡し)**: `CharacterLookData = { slot; skin: number; build; hair: { style; color }; eyes; faceAtlas: { width; height; cell: number; rgba: Uint8Array }; numberDecal: { width; height; rgba: Uint8Array }; uniform: { base; pants; accent; socks; cap; helmet; pattern: Uint8Array | null } }`。

**`types/stage.ts`**: **`StageHandle.setLook(slot, data)`**・**`StageHandle.setQualityTier(tier)`**(飛行中はペンディング)。`CharacterRig` に `upperArm`・`foreArm`・`thigh`・`shin`(肘・膝の分割)を加える。

**`types/view.ts`**: **`PitchOutcomeView.runners: { before: Bases; after: Bases; scored: number; batterTo: 0|1|2|3|4; advances: readonly { from: 0|1|2|3; to: 0|1|2|3|4 }[] } | null`**。**`GameStageViewProps`**: `wipe: { visible; rect; label: string | null } | null`・`qualityTier: QualityTier`。

**`render/character/parts.ts`(E0 が作る。`render/` 内の契約。型のみ+定数)**: E5(造形)と E6(顔・表情の適用)を並列にするための共通の取り決め。`types/` に置かないのは three の型を含むため。
- `CharacterParts = { root: Group; skeleton: Skeleton; bones: Readonly<Record<CharacterJoint, Bone | null>>(`bat` は打者のみ); body: SkinnedMesh; outline: SkinnedMesh | null(遠景は null); face: Mesh; faceMaterial: MeshBasicMaterial; numberDecal: Mesh | null; decalMaterial: MeshBasicMaterial | null; bodyMaterial: MeshToonMaterial; setWipeLayer(on: boolean): void; dispose(): void }`。
- 定数: `JOINT_ORDER`、`FACE_PATCH`(アトラス 4×2 の各セルの `offset` と `repeat`、セル外周 4px の余白を除いた内側の範囲)、`DECAL_SIZE`、`WIPE_LAYER = 1`。
- E5 は `createCharacterParts(look, lod)` を実装、E6 は `CharacterParts` だけを受けて `applyLook`・`applyExpression`・`applyPose` を実装する(E6 は偽の `CharacterParts` で単体テストできる)。

**`WORLD_PARAMS` の追加(E0 で値まで入れる)**:
- `actors.pitcher.portraitScale 1.30`(E3 が適用)、`actors.framingScale { batter 0.70, pitcher 1.30, others 1.0 }`。
- **`character`**: `proportion { headToBody: 2.2 }`、`face { cell 96, columns 4, rows 2, padPx 4, blinkPeriodMs 2800, blinkMs 120 }`、`build { slim 0.9, normal 1.0, stocky 1.15 }`、`lod { nearTriangles 4000, farTriangles 1200 }`、`bones { count 12, batter 13 }`、`budget { characterCalls 60, wipePassCalls 12, sceneCallsT0 200, sceneCallsT2 160, sceneCallsT3 110, triangles 120000 }`(段階 M で上書きされる値は §5-4)。
- **`runners`**: `{ msPerBase 1.6e3, maxMs 3000, leadOffsetM 0.8 }`、**`infieldCamera { position (0, 22, 10), target (0, 0, −20), blendMs 400, halfWidthTan 0.60 }`**(画角: 縦長でも一塁・三塁(x ±19.4m)と、ダグアウトの手前が入る。max 分冊 §3-5-1)。
- **`wipe`**: `{ showMs 1200, rectPortrait { sizePx 94, marginRightPx 6, belowHudPx 20 }, batterDistanceM 2.2, fovDeg 30 }`。
- **`qualityTier`**: `{ windowMs 2000, p95ThresholdMs 28, heavyP95Ms 45, heavyLongFrameRatio 0.10, consecutiveWindows 2, tiers: [...] }`(character 分冊 §3-4-10 の表。`heavy*` は段階 M で使う 2 段降格の条件)。

### 5-3. 主要な関数のシグネチャ(実装は担当ステップ)

- `model/batting/assist.ts`: `ASSIST_TABLE`・`assistFor`(A0)、`lockOnCursor`・`previewCenterOf`・`qualityScaleOf`(A1)。
- `model/world/camera/rig.ts`(A2): `ballScaleFor(camera, ball, minRatio)`(**シグネチャ変更**)、`outlineScaleFor`、`ringWidthFor`。`camera/infield.ts`・`camera/wipe.ts`(E8)。
- `model/pitch/gauge.ts`(A3)、`model/world/sequence/input-route.ts`(A4。**v2 の関数は不変**。追加は `tapReleaseReason`(タップが通らなかった理由の分類。純関数)と、`isTapGesture` の境界テスト)、`pitch-input.ts`(B1)、`guide.ts`/`ball-look.ts`/`contact-feedback.ts`(A5。`contact-feedback.ts` は `zoneFeedbackOfSwing`・`zoneFeedbackOfPitch`)、`banner.ts`/`hit-fx.ts`(C1)。
- `model/world/motion/batter-layout.ts`(A2): `batterRootFor(aspect)`(補間後の scale を返す)・`batLengthScaleFor`・`batTipX`。`frame.ts` の `batHeightInRoot` は補間後の scale で割る。
- **`model/character/`(E)**: `look.ts`、`expression.ts`(`expressionAt`)、`quality-tier.ts`(`nextTier`。M で 2 段降格を追加)、`framing-scale.ts`、`raster/{face,number,fabric,primitives}.ts`。`model/world/path/{runners,fielders}.ts`(E4)、`motion/forms.ts`(E3)。
- `model/sound/*`(C2)、`model/telemetry/*`・`model/prefs/{prefs,safe-store}.ts`・`model/tutorial/steps.ts`(A6)、`audio/engine.ts`(C3)。
- `hooks`: `usePreferences`・`usePlaytestLog`・`useFramePerf`(A10)、`useCharacterLooks`・`useQualityTier`(E9)、`usePitchingControls`・`usePitchKeyboard`(B4)、`useSfx`・`useHaptics`(C5)、**`useReplay`・`useStadiumState`(M10)**。
- `ui`: `ZoneFeedback.tsx`(A12)、`GameLayout` の props は A12 → B2 → C4 → M11 の順に加える。`ui/CutIn.tsx`(E10)、**`ui/{ReplayControls,TimeTint,ScoreboardZoom}.tsx`(M11)**。

### 5-4. M0 が凍結する契約(段階 M = 「最大」。ゲート1回答で追加)

M0 は C7(段階 C の全体緑)の**後**に置く。M0〜M12 の間は全体の typecheck が赤(M13 で緑)。

**`types/team.ts`**: `PlayerLook.signature: SignatureId`、`SignatureForm = { id; base: PitchForm | BatStance; params: SignatureParams; extras: readonly SignatureExtra[]; celebration: CelebrationId; slideStyle: "feet" | "head"; gloveStyle: "high" | "low"; throwStyle: "over" | "side" }`、`SignatureParams`(構えの幅・バットの傾き・手の高さ・waggle 周期・leg kick 量・頭の傾き)、`SignatureExtra`(追加のキーフレーム列)。

**`types/scene.ts`**: `TimeOfDay = "day" | "evening" | "night"`、`SceneFrame.stadium: { timeOfDay: TimeOfDay; blend: number; crowd: { excitement: number; wavePhase: number }; scoreboard: ScoreboardView; lampGlow: number }`、`SceneFrame.fx: { dust: readonly { position: Vec3; age: number }[] }`(土煙。最大 24)、`CharacterPose` は変更なし(スライディング等は既存の関節のキーフレームで表す)。`StageHandle.setCrowdTier(tier)`(内部で `setQualityTier` から呼ばれる。単独では公開しない場合は不要)。

**`types/view.ts`**: `ScoreboardView = { awayName: string; homeName: string; awayRuns: number; homeRuns: number; inning: number; half: "top" | "bottom"; outs: number; strikes: number; balls: number }`、`ReplayView = { available: boolean; active: boolean; label: string | null; progress: number }`、`GameStageViewProps` に `timeOfDay`・`replay: ReplayView`・`scoreboardZoom: boolean`・`tint: { color: string; opacity: number }`。

**`types/replay.ts`(新規)**: `ReplayRecord = { flight; plan; swing; outcomeView; looks: Readonly<Record<CharacterSlot, PlayerLook>>; timeOfDay; scoreboard: ScoreboardView; seq: number }`(すべて不変の値)、`ReplayCameraKind = "backstop" | "firstbase" | "outfield"`、`ReplayCommand`。

**`render/stadium/parts.ts`(M0 が作る。`render/` 内の契約。型と定数のみ)**: M6(球場の静的部分)・M7(観客・土煙)・M8(ステージへの結線)を並列にするための共通の取り決め。`StadiumParts = { root: Group; ground: Mesh; stands: Mesh; fence: Mesh; adBoards: Mesh; towers: Mesh; lamps: Mesh | null; dugouts: Mesh; scoreboard: { frame: Mesh; face: Mesh; texture: DataTexture }; sky: { set(timeOfDay: TimeOfDay, blend: number): void }; lights: { hemisphere: HemisphereLight; sun: DirectionalLight }; setTimeOfDay(timeOfDay: TimeOfDay, blend: number): void; setScoreboard(rgba: Uint8Array): void; dispose(): void }`、`CrowdParts = { bodies: InstancedMesh; heads: InstancedMesh; capacity: number; setCount(n: number): void; update(poses: Float32Array): void; dispose(): void }`、`DustParts = { points: Points; update(items): void; dispose(): void }`、定数 `CROWD_CAPACITY = 480`・`DUST_CAPACITY = 24`。

**`WORLD_PARAMS` の追加(M0 で値まで入れる)**:
- **`stadiumMax`**: `crowd { capacity 480, rows 6, bandBottomM 3.25, bandTopM 7, headTriangles 20, bodyTriangles 12, bounceMaxM 0.35, tiltMaxRad 0.2, standScaleMax 1.25 }`、`timeOfDay { switchMs 1200, tint { evening { color "rgba(255,150,60,1)", opacity 0.10 }, night { color "rgba(20,30,80,1)", opacity 0.18 } } }`、`lamps { glowNight 1.0 }`、`scoreboard { widthPx 128, heightPx 64, mount { height 12, width 14 } }`、`intro { ms 2000, tierMs { t2 1000 } }`、`scoreboardZoomMs 800`。
- **`replay`**: `{ ringCount 3, maxMs 7000, slowWindowMs 600, slowFactor 0.35, slowFactorT2 0.5, offerMs 4000, autoPlayDefault false, cameras { backstop { back 6, height 9 }, firstbase { out 8, height 1.5 }, outfield { out 10, height 8 } }, crossBlendMs 300 }`。
- **`slide`**: `{ ms 500, dustMs 700 }`、**`cover`**: `{ leadMs 200 }`。
- **`budget` の更新(段階 M の分)**: `sceneCallsT0 215, sceneCallsT1 205, sceneCallsT2 166, sceneCallsT3 113`、`triangles { t0 145000, t1 130000, t2 110000, t3 80000 }`、`crowdCountByTier [480, 240, 96, 0]`、`crowdUpdateEvery [1, 2, 4, 0]`。

**主要な関数(担当ステップ)**: `model/character/signature.ts`(`signatureOf`・20 件の定義。M1)、`model/world/motion/{signature,slide}.ts`(M1・M2)、`model/world/path/{runners,fielders}.ts` の `slidePlanOf`・`coverPlan`(M3)、`model/stadium/{layout,time-of-day,crowd,scoreboard}.ts`・`raster/{grass,ads,sky,scoreboard}.ts`(M4)、`model/replay/{record,timeline,camera,policy}.ts`(M5)、`render/stadium/*`(M6)、`render/crowd/*`(M7)、`render/stage.ts` の結線(M8)、`model/world/sequence/{frame,play-plan}.ts`・`camera/intro.ts`(M9)、`hooks/{useReplay,useStadiumState}.ts`(M10)、`ui/{ReplayControls,TimeTint,ScoreboardZoom}.tsx`(M11)、`model/sound/*`・`audio/voices.ts`(M12)。

## 6. 変更ファイル(概要)

パスは `sample-app/frontend/src/features/baseball/` 相対(E2E・ドキュメントを除く)。

| 区分 | ファイル | 内容 | 担当 |
| --- | --- | --- | --- |
| 変更 | `types/{batting,pitch,game,scene,stage,view}.ts`、新規 `types/{sound,telemetry}.ts`、`hooks/useGameStage.ts`(型のみ)、`render/test-fixtures.ts`、`model/world/space/params.ts`、`model/{batting,pitch}/params.ts`、新規 `model/batting/assist.ts`(表) | 契約・定数(段階 A・B・C の分) | A0 |
| 変更/新規 | `model/batting/{assist,contact,resolve-pitch}.ts` | ロックオン・予告・質の補正 | A1 |
| 変更/新規 | `model/world/camera/{rig,project}.ts`(+test)、新規 `model/world/motion/batter-layout.ts`、`model/world/path/{pitch-path,pitch-screen}.test.ts` | 構図・打者のレイアウト・バット到達・px 比の換算 | A2 |
| 変更/新規 | `model/pitch/{delivery,params}.ts`、新規 `model/pitch/gauge.ts`、`model/game/{reducer,view,test-fixtures,launch-params}.ts`、`model/cpu/cpu-pitcher.ts`、`model/sim/bot-sim.ts`(型の追従) | 投球コマンドの移行・ゲージ・windup | A3 |
| 変更 | `model/world/sequence/input-route.ts`(+test)、`session.ts`(+test) | **タップ方式のまま**: 理由の分類 `tapReleaseReason`・境界テストの強化 | A4 |
| 新規 | `model/world/sequence/{guide,ball-look,contact-feedback}.ts` | 予告・照準・ボールの回転・位置ずれ(DOM 用のデータ) | A5 |
| 新規 | `model/telemetry/*`、`model/prefs/{prefs,safe-store}.ts`、`model/tutorial/steps.ts` | ログ・設定・説明 | A6 |
| 変更 | `render/{markers,look}.ts`、`render/dispose.test.ts` | 予告・リング・ハロー・縫い目の帯 | A7 |
| 変更 | `render/{stage,pose-apply}.ts` | `stats()`・バット長 | A8 |
| 変更 | `hooks/{usePointerInput,useBattingControls,usePitchFlight,useKeyboardInput}.ts` | 打撃入力(有効カーソル・理由の通知。タップ判定は不変) | A9 |
| 新規 | `hooks/{usePreferences,usePlaytestLog,useFramePerf}.ts` | 設定・ログ・fps | A10 |
| 変更 | `model/world/sequence/{frame,play-plan}.ts`(+test) | 合成 A(予告・リング・ボール・打者) | A11 |
| 新規/変更 | `ui/{Tutorial,PlaytestPanel,ZoneFeedback,StageView,SwingControls,GameLayout}.tsx`+CSS | 説明・試遊ログ画面・位置ずれ(DOM)・ピル・タップのヒント | A12 |
| 変更 | `hooks/{useStageDirector,useGameStage,useGame,useStage3d}.ts`、`ui/{GameScreen,BaseballGamePage}.tsx` | 統合 A | A13 |
| 新規/変更 | `model/sim/{human-bot,human-game}.ts`、`model/batting/*` の値 | 打撃ボット・調整 | A14 |
| 変更/新規 | `types/{team,game,scene,stage,view}.ts`(E の分)、新規 `render/character/parts.ts`、`render/test-fixtures.ts`、`model/world/space/params.ts`(E の分) | 契約・定数(段階 E の分) | E0 |
| 変更/新規 | `model/data/teams.ts`、新規 `model/character/{look,expression,quality-tier,framing-scale}.ts` | 20 人の個性・表情・ティア・表示倍率 | E1 |
| 新規 | `model/character/raster/*` | 顔・背番号・ユニフォームのラスタ | E2 |
| 変更/新規 | `model/world/motion/{rig,pose,fk,batter,pitcher,fielder,forms}.ts`、`space/params.ts`(`pitcher.scale`・`RELEASE_POINT`)、`camera/*.test.ts`・`path/pitch-*.test.ts` | 肘・膝・フォーム・投手の拡大 | E3 |
| 変更/新規 | `model/game/{state,outcome,view}.ts`、`model/game/{reducer,state}.test.ts`、`model/world/path/{runners,fielders}.ts` | 進塁の事実・走者・捕球・送球の計画 | E4 |
| 置換/新規 | `render/character/*`(旧 `render/character.ts` を置換。`SkinnedMesh` 方式) | 造形・メッシュ統合・スケルトン・LOD | E5 |
| 新規/変更 | `render/{character-look,textures,pose-apply}.ts` | 顔・ユニフォーム・表情の適用、ボーンへのポーズ | E6 |
| 変更 | `render/{stage,look,stadium}.ts` | 14 体のプール・ワイプ・品質ティア | E7 |
| 変更/新規 | `model/world/sequence/{frame,play-plan}.ts`、新規 `model/world/camera/{infield,wipe}.ts` | 合成 E | E8 |
| 新規 | `hooks/{useCharacterLooks,useQualityTier}.ts` | 見た目のデータの受け渡し・ティア | E9 |
| 新規/変更 | `ui/{CutIn,StageView}.tsx`+CSS | ワイプの縁取り・打席の紹介 | E10 |
| 変更 | `hooks/{useStageDirector,useGameStage,useStage3d}.ts`、`ui/GameScreen.tsx` | 統合 E | E11 |
| 新規 | `model/world/sequence/pitch-input.ts` | 投球入力 | B1 |
| 変更/削除 | `ui/{GameLayout,PitchingControls,PitchKindButtons}.tsx`、`ui/CourseGrid.tsx`(削除)、CSS | 守備の操作バー | B2 |
| 変更 | `model/cpu/{cpu-batter,difficulty}.ts`、`balance.test.ts`(基準は不変) | CPU 打者の反応 | B3 |
| 新規 | `hooks/{usePitchingControls,usePitchKeyboard}.ts` | 投球入力 | B4 |
| 変更 | `model/world/sequence/{frame,play-plan}.ts` | 合成 B | B5 |
| 変更 | `hooks/{useStageDirector,useGameStage,useGame,useStage3d}.ts`、`ui/GameScreen.tsx` | 統合 B | B6 |
| 新規 | `model/world/sequence/{banner,hit-fx}.ts` | バナー・接触演出 | C1 |
| 新規 | `model/sound/*` | 音・触覚の表 | C2 |
| 新規 | `audio/*` | Web Audio エンジン | C3 |
| 新規/変更 | `ui/{EffectBanner,StageView,StageTelop,TitleScreen,ScoreHud,GameLayout}.tsx`+CSS | バナー・音・画質ボタン | C4 |
| 新規 | `hooks/{useSfx,useHaptics}.ts` | 音・触覚 | C5 |
| 変更 | `model/world/sequence/{frame,play-plan,telop}.ts` | 合成 C | C6 |
| 変更 | `hooks/{useStageDirector,useGameStage}.ts`、`ui/GameScreen.tsx` | 統合 C | C7 |
| 変更/新規 | `types/{team,scene,view}.ts`・新規 `types/replay.ts`(M の分)、新規 `render/stadium/parts.ts`、`render/test-fixtures.ts`、`model/world/space/params.ts`(M の分) | 契約・定数(段階 M の分) | **M0** |
| 変更/新規 | `model/data/teams.ts`(`signature`)、新規 `model/character/signature.ts`、`model/world/motion/signature.ts` | 20 人の固有フォーム | M1 |
| 新規 | `model/world/motion/slide.ts`、`motion/{forms,fielder}.ts`(追加のキーフレーム) | スライディング・ベースカバー・喜びのポーズのキーフレーム | M2 |
| 変更 | `model/world/path/{runners,fielders}.ts`、`sequence/world-consistency.test.ts` | スライディングの計画・ベースカバーの計画・土煙 | M3 |
| 新規 | `model/stadium/*`(`layout`・`time-of-day`・`crowd`・`scoreboard`)、`model/stadium/raster/*` | 球場・時間帯・観客・スコアボードの純関数とラスタ | M4 |
| 新規 | `model/replay/*`、`model/world/camera/intro.ts` | リプレイの記録・時間写像・カメラ・出す条件、イントロのカメラ | M5 |
| 置換/新規 | `render/stadium/*`(旧 `render/stadium.ts` を置換)、`render/look.ts`(光・空) | 看板・照明塔・ダグアウト・スコアボード・芝・時間帯 | M6 |
| 新規 | `render/crowd/*` | 観客のインスタンス描画・土煙 | M7 |
| 変更 | `render/stage.ts`(+test) | 球場・観客・土煙・時間帯・ティア・リプレイ/イントロのカメラの結線 | M8 |
| 変更 | `model/world/sequence/{frame,play-plan}.ts`(+test) | 合成 M(固有フォーム・スライディング・カバー・観客・時間帯・スコアボード・イントロ) | M9 |
| 新規 | `hooks/{useReplay,useStadiumState}.ts` | リプレイのモード・記録・時間帯 | M10 |
| 新規/変更 | `ui/{ReplayControls,TimeTint,ScoreboardZoom}.tsx`+CSS、`ui/{StageView,TitleScreen,GameLayout}.tsx` | リプレイのボタン・色の膜・スコアボードのズーム・設定 | M11 |
| 変更 | `model/sound/*`、`audio/voices.ts` | 観客の反応・スライディング・リプレイの効果音 | M12 |
| 変更 | `hooks/{useStageDirector,useGameStage,useStage3d}.ts`、`ui/GameScreen.tsx` | 統合 M | M13 |
| 新規 | `model/sim/pitch-bot.ts`、`difficulty.ts`・`pitch/params.ts` の値 | 投球ボット | D1 |
| 変更 | `e2e/baseball.spec.ts`、`playwright.config.ts`、README、`docs/process/sample-app-dev.md` | E2E・ドキュメント | D2 |
| 変更 | 「調整可」の値、`render/*` の見た目の値、`ui/*.css` | 見た目の調整 | D3 |
| 不変 | backend、`@sample-app/shared`、`routes/`、`App.tsx`、`ci.yml`、ホーム(`/`)・`home.spec.ts`、reducer の乱数消費の順序、**v2 のタップ判定の定数と関数(`TAP_*`・`isTapGesture`・`routeStage*`・`arrival.ts`)** | — | — |

## 7. 構図の手計算(根拠。式と出典)

出典は `model/world/camera/{rig,project}.ts`(ピンホール投影 + `lift`)と `space/params.ts`。**投影の式**: カメラ位置 C・注視 T から前方 f = normalize(T − C)、右 r = (1,0,0)、上 u = r × f。点 P で rel = P − C、depth = rel·f、`x_px = W/2 · (1 + rel·r / (depth · h))`、`y_px = (0.5 − 0.5 · (rel·u) / (depth · tanV) − lift) · H`(h = 水平半幅 tan、tanV = h / aspect)。縦長の姿勢 C = (c, 1.75, 2.6)・T = (c, 0.55, −18) で f = (0, −0.05815, −0.99831)、u = (0, 0.99831, −0.05815)。

**v2 の計算値の再現(式の検証)**: 390×844・打撃。h = 0.25、tanV = 0.541。lift = 0.5 + cHead·σ − (top + headGap) = 0.5 − 0.0846 × 0.9242 − (0.1837 + 0.019) = **0.2191**。ゾーン中心 (0, 0.72, 0.03): depth 2.6256 → 水平 **297.1px/m**、y = 498.2px。ゾーン枠は幅 154.5px・y 410〜585(175px)。v2 の実測(155.5×174.5、y 410〜585)と ±1.5px で一致する。設計レビューのラウンド1・2でも検算で一致を確認済み。

**v3 の値(c = 0)**: 「段階 A 完了時」= 投手 scale 1.0(v2 のキャラ)、「E 完了後」= 投手 scale 1.30。

| 要素 | 計算 | 段階 A 完了時 | E 完了後 |
| --- | --- | --- | --- |
| lift | 投手頭頂の係数 cHead: scale 1.0 で −0.0846、**scale 1.30 で −0.1141**(頭頂 y 2.915m: rel y 1.165、depth 20.90、ndcY 0.2282)→ lift = 0.5 + cHead·0.9242 − 0.2027 | 0.2191 | **0.1918**(−0.0273 = ゾーンが約 23px 下がる) |
| ゾーン枠 | x = 195 ± 77.3(c = 0)、y は lift で平行移動 | **x 117.7〜272.3、y 410〜585**(155×175)。中心 (195, 498) | **x 117.7〜272.3、y 433〜608**。中心 (195, 521) |
| 投手 | 頭頂は HUD の直下 y ≈ 171 に固定(fit)。足元は scale で下がる | 頭頂 171・足元 247(身長 76px・頭径 34px) | 頭頂 171・足元 **≈ 270(身長 ≈ 99px・頭径 ≈ 44px)**・x 195 |
| リリースの位置 | scale 1.0: (−0.3, 1.65, −18.1): depth 20.67 → (184, 195)。scale 1.30: FK の手先 ≈ (−0.39, 2.0, −18.0): depth 20.55、ndcY 0.1302 → (180, 205) | (184, 195) | **(180, 205)(FK で確定)** |
| ボール径(真) | 0.2m を ppm で換算 | 7.5 → 59.4px | 同じ |
| ボール径(表示。最小径 0.0175 × 844 = 14.8px) | 倍率 ≈ 1.96(リリース時)。真の径が 14.8px に達する D−730ms 付近まで | 14.8px 以上 | 同じ |
| 予告のリング | 0.30m → 0.125m を 297.1px/m で換算 | 89px → 37px | 同じ |
| カーソル(ミート 56) | rx 0.724・ry 0.434 × (77.3, 87.2px) | 112 × 76px | 同じ(中心は y 521) |
| 打者の頭(scale 0.70・x −0.65) | 頭の中心 (−0.65, 1.07, 0.05): depth 2.585、ndcX = −0.6/…= **−1.006** → x = **−1.1px**。素の頭の半径 = 0.50 × 0.70 = 0.35m × 301.7px/m = 105.6px。**ヘルメット込み(外径 +約 4〜5%)で半径 ≈ 110px** | 頭は x −111〜**約 109(ヘルメット込み)**・素の頭は約 104。y 291〜503 | y は +23: 314〜526 |
| 打者の胴 | 半径 0.31 × 0.70 × 1.05 ≈ 0.228m = 69px、中心 x ≈ −1 | 右端 **≈ 68px** | 同じ |
| 打者の足元 | (−0.65, 0, 0.05): depth 2.6475、ndcY −1.116 → y = 708 | y ≈ 708 | y ≈ 731(操作バー y 663 の下) |
| バット先端(接触) | `x_b + scale × (0.05 + 0.975 × L × 0.99375)` = −0.65 + 0.70 × (0.05 + 0.975 × 1.35 × 0.99375) = −0.65 + 0.70 × 1.358 | **+0.301m**(ゾーン右端 0.26m の外)。画面 x ≈ 284px | 同じ |
| ゾーン枠の左端と頭の右端の間 | 117.7 − 109(ヘルメット込み) | 約 9px(素の頭なら約 14px) | 同じ |

**キャラクター(段階 E)の頭・顔の画面上の大きさ**: 投手(scale 1.30、depth ≈ 21m で 37px/m): 頭の幅 ≈ 0.92 × 1.30 × 37 ≈ 44px、目 1 つの幅 ≈ 0.14 × 44 ≈ 6px(読める下限。ワイプで補う)。打者(後ろ姿): 髪・耳・ヘルメットが半径 約 110px の頭に載る。

**位置ずれ表示(DOM)の大きさ**: ゾーン枠 155×175px に対し、十字の径 16px・輪の径 30px・線幅 3px(`zoneFeedback`)。ゾーン単位 → px は 1 単位 ≈ 77px(幅)・87px(高さ)。

**追跡カメラとの関係(位置ずれ表示をカメラの動きと切り離す根拠)**: 打撃カメラ C = (0, 1.75, 2.6)・lift 0.219 のまま接触後に待つ案(旧 `chaseDelayMs = 300`)では、ホームラン(115m・頂点 27.6m・滞空 4220ms)は接触後 150ms で画面 y ≈ −172px、300ms で y ≈ −379px と**画面の上に消える**。ライナー(60m・頂点 4.8m)は 300ms で y ≈ 66px で HUD(155px)の下に隠れる。画面に残るのはゴロだけ。**よって接触後に打撃カメラのまま待つ案は成立しない**。位置ずれ表示は DOM(ゾーン矩形に固定)にし、`chaseFromMs = contactMs`(v2 のまま)とする。

**打撃カメラに映る球場の要素(段階 M の根拠。max 分冊 §3-5-1 の表)**: 水平線 y ≈ 192、フェンス y 181〜205、観客席の下段 y 155〜181(HUD の裏の手前まで)、それより上(観客席の上段・スコアボード・照明塔・空)は HUD の裏。ダグアウトは画面外(奥行 15m で半幅 ±3.8m)。

**守備の操作バー**: 球種チップ 52px+上下余白+ティッカー 52px ≈ 130px。空き領域の下端 = (844 − 130) / 844 = 0.846。5×5 格子の下端(係数 0.5204)は段階 A 完了時 y 643・E 完了後 y 666(バー上端 714px の 48px 上)。`hReq ≈ 0.22 < 0.25` なので tan は既定の 0.25 になり、**守備のゾーンは打撃と同じ 155×175px**。

**390×664(ツールバーあり)**: モックの実測は、打撃のゾーン幅 **125.7px**(想定 116px より大きい。v2 のテストの実測と一致)、守備は v2 の 69px → **131px**(格子を外すため)。守備のほうが打撃より大きくなる場合の方針は play 分冊 §3-1。**他の高さの数値は「実装時に実測して確定」**(受け入れは下限)。

**ワイプの矩形**: 390×844 で x 290〜384・y 175〜269(94×94px。HUD 下端 155px + 20px)。ボールの通り道(x 118〜273)と HUD を避ける。390×664 など低い画面では HUD の下端(`safeArea.top`)から 20px 下に置くので HUD と重ならない。
