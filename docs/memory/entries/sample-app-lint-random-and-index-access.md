---
name: sample-app-lint-random-and-index-access
type: pitfall
status: active
related_topics: [baseball-game]
created: 2026-10-11
updated: 2026-10-11
---

<!-- related_topics には、この規約/落とし穴を実際に適用したtopic-slugを追記していく(convention/pitfallで特に重要)。
     3つ以上になったらスキル化候補(詳細は`docs/process/shared-memory.md`の「再利用パターンのSkill化」)。 -->

sample-appのlintでは、**`Math.random()`(`sonarjs/pseudo-random`)、変数添字の `arr[i]`・`obj[k]`(`security/detect-object-injection`)、`// TODO` コメント(`sonarjs/todo-tag`)がすべてerror**になる。乱数はシード付きPRNG(mulberry32等、`Math.imul`・ビット演算は通過)を自前実装して注入し、添字アクセスは `for...of`・`.map`・`.at(i)`・`Map#get`・`switch`・リテラル添字(`arr[0]`)で書く。残課題はTODOコメントではなくdocsに書く。また **テストファイル(`*.test.ts`)ではリテラル同士の assertion(`expect(1).toBe(1)` 等)が `sonarjs/no-trivial-assertions` でerror** になるため、関数の戻り値を期待値と比べる形で書く。ネスト三項(`sonarjs/no-nested-conditional`)と case 1つ以下の `switch`(`sonarjs/no-small-switch`。明示 case 2つは通過)もerror。プリミティブだけの型エイリアス(`type RngState = number`)は `sonarjs/redundant-type-aliases` でerror(baseball-gameでは `Readonly<number>` で回避)。`{away, home}` のような組の変数添字は `side === "away" ? pair.away : pair.home` の小関数(`bySide`)に寄せる。また tsconfig の `lib` は ES2022 のため、`toSorted`/`with` 等の ES2023 メソッドは vitest では動いても `npm run typecheck` で TS2550 になる。テストでも for の4段ネストは `max-depth` で error になるので `flatMap`/`filter` で平坦化する。

**背景:** [docs/investigations/2026-10-11-baseball-game.md](../../investigations/2026-10-11-baseball-game.md) の調査中に、orchestratorが `npx eslint --stdin --stdin-filename frontend/src/probe.ts` で実測して確認した(2026-10-11)。ゲームのようにグリッド・テーブル・乱数を多用するコードは、典型的な書き方のままだとCIの `checks` ジョブが落ちる。`detect-object-injection` は構文だけで判定する(`property` が素のIdentifierのcomputed accessは無条件でreport)ため、型が安全でも回避できない。インラインの `eslint-disable` はプロジェクト方針で禁止([[eslint-strictness-ratchet-v2]])。

**適用範囲:** sample-appで配列・テーブル参照・乱数を扱うコードを設計(`/design`)・実装(`/implement`)・レビュー(`code-reviewer`)する場面。真に必要な例外が出た場合は `eslint.config.mjs` 側にパス限定・理由付きで書く。

**関連:** [[eslint-strictness-ratchet-v2]] [[pure-function-extraction]]
