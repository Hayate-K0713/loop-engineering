---
name: conventional-commits
description: Conventional Commits仕様(@commitlint/config-conventionalが実装する規約と同じtype一覧)に沿ったコミットメッセージを生成する。「conventional commit」「semantic commit」「commitlintに沿って」等の依頼時に使う。外部プラグインに依存しない、このリポジトリ独自のスキル(adapted from patricio0312rev/skills, MIT License, Copyright (c) 2025 Patricio Marroquin)。
---

# conventional-commits: 規約に沿ったコミットメッセージ生成

`@commitlint/config-conventional` が実装する Conventional Commits 仕様に沿って、標準化されたコミットメッセージを書く。

## フォーマット

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

## type一覧(commitlintのtype-enumと同一)

| type | 用途 | semver |
|------|------|--------|
| `feat` | 新機能 | MINOR |
| `fix` | バグ修正 | PATCH |
| `docs` | ドキュメントのみ | - |
| `style` | フォーマット・空白 | - |
| `refactor` | 機能追加・修正を伴わないコード変更 | - |
| `perf` | パフォーマンス改善 | PATCH |
| `test` | テストの追加・修正 | - |
| `build` | ビルドシステム・依存関係 | - |
| `ci` | CI/CD設定 | - |
| `chore` | 雑務(それ以外) | - |
| `revert` | 直前のコミットの取り消し | - |

## scope

変更対象を示す任意の要素(コンポーネント・モジュール・ファイル等)を丸括弧で付ける。

```
feat(auth): add OAuth2 support
fix(api): handle timeout errors
docs(readme): add installation steps
```

## Breaking Change

`!` 記法または `BREAKING CHANGE` フッターで示す。

```
feat(api)!: change response format to JSON:API
```

```
feat(api): change response format

BREAKING CHANGE: Response now follows JSON:API specification.
Clients must update their parsers.
```

## description(1行目)の書き方

- 命令形("add" not "added"/"adds")
- 72文字以内
- 小文字始まり、末尾ピリオドなし
- 具体的に。「fix: fixed it」「chore: misc changes」のような曖昧な記述は避ける

## body

自明でない複雑な変更・breaking changeの移行手順・複数の関連変更をまとめた場合に書く。「何を」ではなく「なぜ」を説明する。

## footer

| token | 用途 | 例 |
|-------|------|-----|
| `Fixes` / `Closes` | issueを閉じる | `Fixes #123` |
| `Refs` | issueを参照 | `Refs #789` |
| `BREAKING CHANGE` | 破壊的変更の説明 | `BREAKING CHANGE: ...` |
| `Co-authored-by` | 共著者 | `Co-authored-by: Name <email>` |

このリポジトリでClaude Codeがコミットする場合は、トップレベルのシステム指示にある `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` / `Claude-Session: <url>` フッターと併記してよい(両者は独立したフッタートークンとして共存できる)。

## 生成手順

1. `git diff --cached --name-only` でステージ済みの変更ファイルを確認する
2. 変更内容からtypeを判定する(新規ファイル→`feat`が多い、テストファイルのみ→`test`、ドキュメントのみ→`docs`、バグ修正のキーワード→`fix` 等)
3. 変更パスからscopeを判定する(例: `src/components/Button.tsx` → `components` や `ui`)
4. 1行目のdescriptionを命令形・72文字以内で書く
5. 複雑な変更やbreaking changeがあればbody・footerを追加する

## commitlint設定の対応関係(参考)

```javascript
// commitlint.config.js
module.exports = {
  extends: ['@commitlint/config-conventional'],
};
```

このリポジトリにcommitlintを導入する場合は、上記のtype一覧がそのまま `type-enum` に対応する。
