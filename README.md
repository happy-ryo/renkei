# Renkei System 🤖

現在開発中。

> AI-powered Development Assistant with tmux Integration

Renkei（連携）は、ClaudeCodeと連携してAI支援開発を実現する高度なシステムです。tmuxベースのユーザーインターフェースを通じて、自然言語でのタスク指示から自動的な実装・評価・改善サイクルを提供することを目的としています。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)](https://www.typescriptlang.org/)

## ✨ 主要機能

### 🎯 AI駆動開発サイクル
- **自然言語タスク解析**: 日本語・英語でのタスク指示を自動解析
- **実装計画自動生成**: タスクから詳細な実装計画を自動作成
- **ClaudeCode統合実行**: AI による自動コード生成・編集
- **品質評価・改善**: 実装結果の自動評価と継続的改善

### 🖥️ 直感的なUI体験
- **tmux統合インターフェース**: 分割画面での効率的な作業環境
- **リアルタイム進捗表示**: 実行状況のライブモニタリング
- **インタラクティブ制御**: キーボードによる直感的な操作
- **対話型AIチャット**: 専用ペインでAIと自然な会話
- **セッション永続化**: 作業状態の保存・復元

### ⚙️ 高度なシステム機能
- **設定プロファイル管理**: 環境別設定の切り替え
- **セッション復元**: 過去の作業状態から再開
- **システム診断**: 環境・パフォーマンスの自動チェック
- **自動メンテナンス**: ログローテーション・キャッシュ管理

## 🚀 クイックスタート

### 前提条件

- **Node.js** 18.0.0 以上
- **tmux** 3.0 以上
- **Claude CLI** (`claude` コマンド) - [Anthropic Claude](https://claude.ai/)
- **Git**

### インストール

```bash
# プロジェクトをクローン
git clone https://github.com/your-org/renkei.git
cd renkei

# 環境セットアップ（自動）
./scripts/renkei-setup

# システム起動
./scripts/renkei-start
```

### 初回セットアップ（詳細）

```bash
# 1. 依存関係インストール
npm install

# 2. TypeScript ビルド
npm run build

# 3. テスト実行（オプション）
npm test

# 4. 設定ファイル初期化
cp config/default-settings.json data/user-settings.json

# 5. Claude CLI設定
# Claudeコマンドが利用できるか確認
./scripts/check-claude

# 必要に応じてパスを設定
# data/user-settings.json の claude.executablePath を編集
```

## 📖 使用方法

### 基本的な使用フロー

1. **システム起動**
   ```bash
   ./scripts/renkei-start
   ```

2. **タスク指示**（メインペインで入力）
   ```
   「Reactでタスクリストコンポーネントを作成してください」
   「APIエンドポイントのエラーハンドリングを改善して」
   「テストケースを追加して品質を向上させて」
   ```

3. **AI実行監視**（サブペインで進捗確認）
   - 実装計画の表示
   - 実行ログのリアルタイム更新
   - 品質評価結果の表示

4. **対話型AIチャット**（チャットペインで会話）
   - 自然な会話形式でタスクを依頼
   - リアルタイムで応答を確認
   - コマンド: /help, /clear, /history, /exit

5. **結果確認・継続判断**
   - 実装結果の自動評価
   - 改善提案の確認
   - 次のアクションの決定

### 高度な起動オプション

```bash
# デバッグモードで起動
./scripts/renkei-start --debug

# 特定のプロファイルで起動
./scripts/renkei-start --profile development

# 過去のセッションを復元
./scripts/renkei-start --restore latest

# システム診断を実行してから起動
./scripts/renkei-start --diagnose

# tmuxにアタッチせずにバックグラウンド起動
./scripts/renkei-start --no-attach
```

### セッション管理

```bash
# セッション状態の確認
ls data/sessions/

# 特定のセッションを復元
./scripts/renkei-start --restore session-2025-06-18T15-30-00-000Z

# セッション一覧の表示
./scripts/renkei-start --help
```

## ⚙️ 設定

### 基本設定ファイル

**`data/user-settings.json`** - メイン設定ファイル
```json
{
  "tmux": {
    "sessionName": "renkei-dev",
    "splitDirection": "vertical",
    "mainPaneTitle": "Renkei Main",
    "subPaneTitle": "System Monitor",
    "chatPaneTitle": "💬 Interactive Chat",
    "chatPane": true
  },
  "claude": {
    "timeout": 30000,
    "maxRetries": 3,
    "autoApprove": false,
    "executablePath": null  // nullの場合自動検出、またはフルパスを指定
  },
  "workspace": {
    "projectRoot": "./workspace",
    "outputDir": "./output",
    "tempDir": "./data/temp"
  }
}
```

### プロファイル設定

**`config/profiles/development.json`** - 開発用プロファイル
```json
{
  "tmux": {
    "sessionName": "renkei-dev",
    "splitDirection": "horizontal"
  },
  "claude": {
    "autoApprove": false,
    "timeout": 60000
  },
  "debug": true,
  "verbose": true
}
```

**`config/profiles/production.json`** - 本番用プロファイル
```json
{
  "tmux": {
    "sessionName": "renkei-prod",
    "splitDirection": "vertical"
  },
  "claude": {
    "autoApprove": true,
    "timeout": 30000
  },
  "debug": false,
  "logging": {
    "level": "info",
    "rotation": true
  }
}
```

### ClaudeCode設定

**`.vscode/settings.json`** (自動生成)
```json
{
  "renkei.enabled": true,
  "renkei.permissions": {
    "fileOperations": true,
    "shellCommands": true,
    "networkAccess": false
  },
  "renkei.workspace": "./workspace"
}
```

## 🧪 開発・テスト

### 開発環境セットアップ

```bash
# 開発依存関係のインストール
npm install

# 型チェック
npm run type-check

# Linting
npm run lint

# フォーマット
npm run format

# 全テスト実行
npm test

# カバレッジ付きテスト
npm run test:coverage

# ウォッチモード
npm run test:watch
```

### コードスタイル

このプロジェクトでは以下のツールを使用しています：

- **TypeScript** - 型安全性とモダンJS機能
- **ESLint** - コード品質・スタイルチェック
- **Prettier** - コードフォーマット
- **Husky** - Git フック管理
- **Jest** - テストフレームワーク

### プロジェクト構造

```
renkei/
├── src/                    # ソースコード
│   ├── ui/                 # tmux UI関連
│   ├── integrations/       # ClaudeCode統合
│   ├── managers/           # システム管理
│   ├── evaluators/         # 品質評価
│   ├── interfaces/         # 型定義
│   └── utils/              # ユーティリティ
├── scripts/                # 実行スクリプト
│   ├── renkei-setup        # セットアップ
│   ├── renkei-start        # システム起動
│   └── renkei-stop         # システム停止
├── config/                 # 設定ファイル
│   ├── default-settings.json
│   └── profiles/           # プロファイル設定
├── data/                   # データ・ログ
│   ├── sessions/           # セッション状態
│   ├── logs/               # システムログ
│   └── backups/            # 設定バックアップ
├── workspace/              # 作業ディレクトリ
├── docs/                   # ドキュメント
└── tests/                  # テストファイル
```

## 🔧 メンテナンス

### ログ管理

```bash
# ログファイルの確認
ls data/logs/

# ログローテーション（手動）
./scripts/renkei-start --diagnose

# ログクリア
rm data/logs/*.log
```

### キャッシュ管理

```bash
# キャッシュクリア
rm -rf node_modules/.cache
rm -rf dist/
npm cache clean --force
```

### 設定バックアップ

```bash
# バックアップ一覧
ls data/backups/

# 手動バックアップ作成
cp -r config/ data/backups/config-$(date +%Y%m%d)/
```

## 🚨 トラブルシューティング

### よくある問題

**Q: tmuxセッションが作成できない**
```bash
# tmuxのバージョン確認
tmux -V

# tmuxサーバー再起動
tmux kill-server
```

**Q: Claudeコマンドが見つからない**
```bash
# Claudeコマンドの利用可能性をチェック
./scripts/check-claude

# パスを設定ファイルに追加
vi data/user-settings.json
# "executablePath": "/path/to/claude" を追加

# Voltaを使用している場合
volta install claude

# 一般的なインストール方法
npm install -g @anthropic-ai/claude
```

**Q: ClaudeCodeとの接続が失敗する**
```bash
# ClaudeCode設定確認
cat .vscode/settings.json

# 権限設定の確認
./scripts/renkei-start --diagnose
```

**Q: TypeScriptビルドが失敗する**
```bash
# 依存関係の再インストール
rm -rf node_modules/
npm install

# TypeScript設定確認
npx tsc --noEmit
```

### 診断機能

```bash
# システム全体の診断
./scripts/renkei-start --diagnose

# Claudeコマンドの診断
./scripts/check-claude

# 詳細な環境情報表示
./scripts/renkei-start --debug --diagnose
```

### ログレベル設定

```json
{
  "logging": {
    "level": "debug",    // debug, info, warn, error
    "output": "file",    // console, file, both
    "rotation": true
  }
}
```

## 🤝 コントリビューション

### バグレポート

[GitHub Issues](https://github.com/your-org/renkei/issues) にて報告してください。

**バグレポートに含めてください：**
- OS・Node.js・tmuxのバージョン
- 実行したコマンド
- エラーメッセージ
- 期待される動作
- 実際の動作

### 機能要求

新機能のリクエストも Issues で受け付けています。

### プルリクエスト

1. フォークしてブランチ作成
2. 機能実装・テスト追加
3. コミットメッセージは規約に従う
4. プルリクエスト作成

## 📋 ロードマップ

### Phase 4.3: 対話型AIチャット機能 (完了)
- [x] 3ペインレイアウト実装
- [x] ChatInterface/ChatManager実装
- [x] AI Manager統合
- [x] Claude CLI統合

### Phase 4.4: 統合テスト・最適化 (進行中)
- [ ] エンドツーエンドテスト
- [ ] パフォーマンス最適化
- [ ] ドキュメント整備

### 今後の拡張予定
- [ ] VS Code拡張機能
- [ ] Webインターフェース
- [ ] マルチ言語対応
- [ ] クラウド統合

## 📄 ライセンス

[MIT License](LICENSE) - 詳細は LICENSE ファイルを参照してください。

## 🙏 謝辞

- [Anthropic](https://www.anthropic.com/) - Claude AI technology
- [tmux](https://github.com/tmux/tmux) - Terminal multiplexer
- すべてのコントリビューターに感謝します

---

**Renkei System** - AI時代の開発を加速する 🚀

```
作成日: 2025-06-18
バージョン: 1.0.0
ステータス: 99% 完成（Phase 4.3 完了）
対話型AIチャット機能を統合
