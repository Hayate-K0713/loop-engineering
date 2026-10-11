---
name: skill-search
description: "skills.sh から外部の Claude Code Skill を検索・インストールする(Skills CLI: npx skills)。Triggers: 'Skillを探して', '〇〇ができるSkillない?', 'find skills', 'npx skills', 'スキルを検索', '便利なSkillある?', 'Skill おすすめ', 'スキル インストール', 'install skill'。Do NOT use for: 新規Skillの作成・既存Skillの改良(→ skill-creator)、インストール済みSkillの更新(→ npx skills check/update を直接案内)。"
---

# skill-search: skills.sh Skill検索・インストール

skills.sh のオープンエコシステムから Claude Code 向け Skill を検索し、選択・インストール・使い方案内までを一貫して行う。ユーザーは「〇〇に使える Skill ない?」と聞くだけでよく、検索クエリの生成・品質評価・インストール操作は自動で実行する。外部プラグインに依存しない、このリポジトリ独自のスキル。

## Examples

- 「Reactのベストプラクティスを教えてくれるSkillない?」→ クエリ "react best practices" で検索 → 候補提示 → 選択 → インストール → 使い方を案内
- 「Skillを探して」→ 目的をユーザーに確認 → 英語キーワードに変換して検索 → 候補提示

## 前提チェック

```bash
which node && which npx
```

見つからない場合は、Node.js を https://nodejs.org/ からインストールしてClaude Codeを再起動するよう案内し、このスキルを終了する。

## ワークフロー

### Step 1: ニーズの把握

- 技術キーワードが含まれる場合(例:「React」「Docker」「SQL」): そのまま英語検索クエリを生成する。ユーザーへの質問は不要
- 業務目的のみで技術キーワードがない場合: `AskUserQuestion` で具体的なニーズ(例: コード品質・レビュー / テスト自動化 / ドキュメント作成 / その他自由入力)を確認する
- 日本語の入力は自動的に英語キーワードに変換する(例:「テスト自動化」→ "test automation")

### Step 2: 検索実行

```bash
npx -y skills find "{query}"
```

出力は `owner/repo@skill-name  N installs` 形式。出力形式はバージョンにより変わる可能性があるため柔軟にパースする。検索結果が0件の場合は Step 6 へ。

### Step 3: 結果提示・選択

`AskUserQuestion` で候補をテーブル形式で提示する。各候補に「品質評価の基準」に基づく評価を付与し、インストール数が最も多い・信頼ソースのものには「(推奨)」を付ける。

選択肢: 各候補の番号 / 「別のキーワードで検索し直す」(Step 1へ) / 「キャンセル」(終了) / 「その他(自由入力)」

### Step 4: インストール確認・実行

`AskUserQuestion` でインストール確認を行う(インストール数が100未満の場合は「利用実績が少ない」と警告を添える)。承認後、`owner/repo@skill-name` を分解して実行する。

```bash
npx -y skills add {owner/repo} --skill {skill-name} -g -y
```

スコープは常にグローバル(`-g`)固定。ユーザーにスコープの判断を求めない。インストールエラー時は平易なメッセージで状況を伝え、リトライまたはキャンセルを提案する。「やめる」選択時は Step 3 に戻る。

### Step 5: インストール後ガイド

1. `npx -y skills list` でインストールされたことを確認する
2. インストールしたSkillの使い方(トリガーとなるフレーズ・使い方の例)を案内する
3. `AskUserQuestion` で「続けて別のSkillを探す」/「終了する」/「その他」を確認する

### Step 6: 該当なし時(検索結果0件)

`AskUserQuestion` で「別のキーワードで検索する」/「skills.sh(https://skills.sh)で手動検索する」/「Skillなしで作業を進める」/「その他」を提示する。

## 品質評価の基準

### 信頼ソース

`vercel-labs`, `anthropics`, `google-labs-code` 等、信頼度の高い組織が公開するSkillには「公式」「信頼ソース」等のラベルを付ける。

### インストール数の目安

| インストール数 | 評価 | 表示 |
|--------------|------|------|
| 10,000以上 | 非常に人気 | 推奨 |
| 1,000以上 | 人気 | 推奨 |
| 100以上 | 一定の利用実績あり | -- |
| 100未満 | 利用実績が少ない | 警告を表示 |

## トラブルシューティング

| 状況 | 対応 |
|------|------|
| Node.js 未インストール | 前提チェックで案内して終了 |
| ネットワークエラー | https://skills.sh を案内し、ブラウザからの手動検索を提案 |
| npx コマンドタイムアウト | リトライを提案。改善しない場合は skills.sh URL を案内 |
| インストール失敗 | エラー内容を平易に伝え、リトライまたは別のSkillを提案 |
