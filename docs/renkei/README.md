# Renkei System - AI協調開発環境

> tmuxベースのAI協調開発環境。生成AI管理者とClaudeCodeが連携し、自然言語でのタスク指示から高品質なソフトウェアを自動生成します。

## 🌟 システム概要

RenkeiシステムはユーザーとAIの理想的な協調開発を実現する革新的なツールです。

### 主な特徴

- **🚀 ワンコマンド起動**: 複雑な設定なしにすぐ使用開始
- **🤖 AI管理者による品質保証**: タスクの分析・評価・継続的改善
- **🔒 セキュアな実行環境**: 事前設定による自動許可システム
- **📊 リアルタイム進捗表示**: tmux 2ペインでの透明性の高いUI
- **🔄 セッション継続**: 中断・復元による柔軟な作業管理

### システム構成

```
┌─ メインペイン ──────────────┬─ サブペイン ─────────────┐
│ AI管理者                    │ ClaudeCode実行状況        │
│ - ユーザー対話              │ - 進捗表示               │
│ - タスク設計                │ - 実行ログ               │
│ - 結果評価                  │ - ステータス情報         │
│ - 継続判断                  │ - コスト・時間情報       │
└─────────────────────────────┴──────────────────────────┘
```

## 🚀 クイックスタート

### 前提条件

```bash
# 必要な環境
Node.js 18.x以上
tmux 3.0以上
ClaudeCode CLI (npm install -g @anthropic-ai/claude-code)
ANTHROPIC_API_KEY 環境変数設定
```

### インストール・セットアップ

```bash
# 1. プロジェクト取得
git clone https://github.com/your-org/renkei-system.git
cd renkei-system

# 2. 初回セットアップ (ワンコマンド!)
./renkei-setup

# 3. システム起動
./renkei-start
```

### 基本的な使用例

```bash
# システム起動後、メインペインで自然言語で指示
> Reactのメモアプリを作成してください

🤖 承知しました！Reactメモアプリを作成します
   - タスク分析中... ✅
   - 実行計画作成中... ✅  
   - 実装開始... 🔧

# 数分後...
✅ メモアプリが完成しました！
📁 作成場所: ./workspace/memo-app/
🚀 試すには: cd workspace/memo-app && npm start
```

## 📚 ドキュメント

### 設計ドキュメント

| ドキュメント | 内容 | 対象者 |
|-------------|------|--------|
| [01-project-overview.md](01-project-overview.md) | システム概要・要件・目的 | 全員 |
| [02-architecture-design.md](02-architecture-design.md) | アーキテクチャ・通信設計 | 開発者・アーキテクト |
| [03-technical-specs.md](03-technical-specs.md) | 技術仕様・API・型定義 | 開発者 |
| [04-permission-system.md](04-permission-system.md) | 許可システム・セキュリティ | 開発者・運用者 |
| [05-user-experience.md](05-user-experience.md) | UX設計・画面フロー | デザイナー・PM |
| [06-implementation-plan.md](06-implementation-plan.md) | 実装計画・開発手順 | 開発者・PM |

### 実装関連

```
renkei-system/
├── docs/renkei/                # 📚 本設計ドキュメント
├── src/                        # 💻 TypeScriptソースコード
│   ├── main-controller.ts      # メインコントローラー
│   ├── managers/               # 管理クラス群
│   ├── evaluators/             # 評価エンジン
│   ├── interfaces/             # 型定義
│   ├── utils/                  # ユーティリティ
│   └── ui/                     # UI関連
├── scripts/                    # 🔧 実行スクリプト
│   ├── renkei-setup*           # セットアップ
│   ├── renkei-start*           # 起動
│   └── renkei-stop*            # 停止
├── config/                     # ⚙️ 設定ファイル
├── workspace/                  # 📁 作業ディレクトリ
└── .claude/                    # 🔐 ClaudeCode設定
```

## 🔧 技術スタック

### コア技術
- **Runtime**: Node.js 18.x, TypeScript 5.0
- **AI統合**: ClaudeCode SDK (`@anthropic-ai/claude-code`)
- **UI**: tmux (ターミナル分割)
- **許可管理**: ClaudeCode settings.json

### 主要依存関係
```json
{
  "dependencies": {
    "@anthropic-ai/claude-code": "^1.0.0",
    "commander": "^11.0.0",
    "inquirer": "^9.0.0",
    "chalk": "^5.0.0",
    "uuid": "^9.0.0"
  }
}
```

## 💡 使用例・ユースケース

### Web開発
```
> React + TypeScript でタスク管理アプリを作成して

✅ 成果物:
   - Modern React hooks使用
   - TypeScript完全対応
   - レスポンシブデザイン
   - ローカルストレージ対応
   - エラーハンドリング実装
```

### データ分析
```
> Python で株価データを分析するツールを作って

✅ 成果物:
   - Yahoo Finance API連携
   - pandas でのデータ処理
   - matplotlib でのグラフ化
   - テクニカル指標計算
   - レポート自動生成
```

### API開発
```
> Node.js + Express でREST APIを作成

✅ 成果物:
   - Express.js サーバー
   - データベース連携
   - 認証・認可機能
   - OpenAPI仕様書
   - 単体・統合テスト
```

## 🔒 セキュリティ

### 安全な実行環境
- **サンドボックス実行**: `./workspace` ディレクトリ内に制限
- **危険コマンド拒否**: `rm -rf`, `sudo` 等を自動拒否
- **許可ベースシステム**: 明示的に許可されたツールのみ実行
- **操作ログ**: すべての実行を監査ログに記録

### 許可されるツール例
```json
{
  "permissions": {
    "allow": [
      "Write", "Read", "Edit", "MultiEdit",
      "Bash(npm:*)", "Bash(git:*)", "Bash(mkdir:*)"
    ],
    "deny": [
      "Bash(rm:*)", "Bash(sudo:*)", "WebFetch", "WebSearch"
    ]
  }
}
```

## 📊 パフォーマンス

### 目標指標
- **起動時間**: 5秒以内
- **応答時間**: 平均2秒以内  
- **メモリ使用量**: 512MB以下
- **成功率**: 90%以上

### 実際の性能例
```
📊 典型的なタスク性能:
   シンプルなWebページ: 1-2分, $0.10-0.20
   Reactアプリ: 3-5分, $0.30-0.60
   Python分析ツール: 5-8分, $0.50-1.00
   複雑なAPI: 8-12分, $0.80-1.50
```

## 🎯 品質保証

### AI管理者による品質管理
1. **タスク分析**: 要求の理解と実装計画
2. **段階的実装**: フェーズ分割による確実な実行
3. **品質評価**: 完成度・機能性・使いやすさの評価
4. **継続改善**: 未完了時の自動改善指示

### 品質チェック項目
- ✅ 機能要件の完全実装
- ✅ エラーハンドリングの適切性
- ✅ コード品質・可読性
- ✅ ユーザビリティ・アクセシビリティ
- ✅ パフォーマンス・セキュリティ

## 🚦 開発状況

### 実装フェーズ

| フェーズ | 期間 | 状況 | 内容 |
|---------|------|------|------|
| Phase 1 | Week 1-2 | 📋 計画中 | 基盤構築 |
| Phase 2 | Week 3-4 | 📋 計画中 | ClaudeCode統合 |
| Phase 3 | Week 5-6 | 📋 計画中 | tmux UI構築 |
| Phase 4 | Week 7-8 | 📋 計画中 | AI管理者実装 |
| Phase 5 | Week 9-10 | 📋 計画中 | 統合・最適化 |

### 開発に参加するには

```bash
# 開発環境セットアップ
git clone https://github.com/your-org/renkei-system.git
cd renkei-system
npm install
npm run build

# 開発サーバー起動
npm run dev

# テスト実行
npm test
```

## 🤝 コントリビューション

### 開発ガイドライン
- **TypeScript**: 厳格モード使用
- **テスト**: カバレッジ80%以上
- **ESLint**: Airbnb設定準拠
- **コミット**: Conventional Commits

### 課題・要望
- GitHub Issues でバグ報告・機能要望
- Pull Requests で改善提案
- Discussions で技術的な質問

## 📄 ライセンス

MIT License - 詳細は [LICENSE](LICENSE) ファイルを参照

## 🙏 謝辞

- [Anthropic](https://www.anthropic.com/) - ClaudeCode SDK提供
- [tmux](https://github.com/tmux/tmux) - 優秀なターミナルマルチプレクサ
- コミュニティの皆様 - フィードバック・改善提案

---

## 📞 サポート・問い合わせ

### よくある質問

**Q: エラーが発生した場合は？**
A: `./renkei-diagnose` で自己診断、または GitHub Issues で報告

**Q: カスタマイズは可能？**  
A: `.claude/settings.json` で許可設定、`config/` で各種設定をカスタマイズ可能

**Q: 他のAIツールとの連携は？**
A: ClaudeCode以外のAI統合は将来のロードマップに含まれています

### 連絡先
- **GitHub Issues**: バグ報告・機能要望
- **GitHub Discussions**: 技術的質問・アイデア
- **Email**: [開発チーム連絡先]

---

**🚀 Renkei - AI協調開発の新時代を始めましょう！**
