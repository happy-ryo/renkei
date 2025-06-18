# Renkei System - AI統合セットアップガイド

## 🤖 Claude API統合の有効化

### 1. Claude APIキーの取得

1. [Anthropic Console](https://console.anthropic.com/) にアクセス
2. アカウント作成・ログイン
3. APIキーを生成
4. 使用量・課金設定を確認

### 2. 環境変数の設定

#### Linux/Mac:
```bash
# ~/.bashrc または ~/.zshrc に追加
export CLAUDE_API_KEY="your-api-key-here"

# 再読み込み
source ~/.bashrc
```

#### Windows:
```cmd
# 環境変数の設定
set CLAUDE_API_KEY=your-api-key-here
```

### 3. 設定ファイルでの指定（推奨）

```bash
# プロジェクトルートに .env ファイルを作成
echo "CLAUDE_API_KEY=your-api-key-here" > .env
```

### 4. 動作確認

```bash
# AI統合の確認
./scripts/renkei-task "Hello Claude, プロジェクトを分析してください"

# 複雑なタスクのテスト
./scripts/renkei-task "新しいTypeScriptクラスを作成して、単体テストも含めてください"
```

## 🔧 実際のAI統合機能

### 有効化されると利用可能になる機能：

#### 1. **自然言語タスク理解**
```bash
./scripts/renkei-task "React コンポーネントを作成したいのですが、ユーザープロフィール表示用のものです"
```

#### 2. **プロジェクト コンテキスト理解**
- 現在のファイル構造を理解
- 使用中のフレームワーク・ライブラリを認識
- Git状態・最近の変更を考慮

#### 3. **実装計画・コード生成**
- 段階的な実装計画
- 具体的なコード例
- 実行すべきコマンド提案

#### 4. **自動実行の試行**
- Claude AIの指示から実行可能なコマンドを抽出
- 安全な範囲で自動実行
- 結果のフィードバック

## 📊 AI使用量の監視

統合後は以下の情報が表示されます：
- 入力トークン数
- 出力トークン数  
- API使用量
- 推定コスト

## 🔄 フォールバック機能

Claude APIが利用できない場合：
- 自動的にルールベース処理に切り替え
- 基本的なタスクは継続実行可能
- エラーメッセージで状況を明確化

## 🚀 使用例

### 基本的な指示
```bash
./scripts/renkei-task "READMEファイルを改善してください"
./scripts/renkei-task "package.jsonの依存関係を最新化したい"
```

### 高度な開発タスク
```bash
./scripts/renkei-task "認証機能を実装してください。JWT トークンベースで"
./scripts/renkei-task "APIエンドポイントのテストケースを作成して"
./scripts/renkei-task "コードレビューを実行して、改善点を提案してください"
```

### プロジェクト管理
```bash
./scripts/renkei-task "プロジェクトの技術的負債を分析してください"  
./scripts/renkei-task "セキュリティ上の問題をチェックして"
./scripts/renkei-task "パフォーマンスを改善する方法を提案してください"
```

## ⚠️ 注意事項

1. **API使用量**: Claude APIは従量課金制です
2. **セキュリティ**: APIキーは安全に管理してください
3. **コスト管理**: 大量のリクエストは料金が発生します
4. **レート制限**: APIには1分間のリクエスト数制限があります

## 🔗 参考リンク

- [Anthropic API Documentation](https://docs.anthropic.com/claude/reference/getting-started-with-the-api)
- [Claude API Pricing](https://www.anthropic.com/pricing)
- [Renkei System Architecture](./renkei/02-architecture-design.md)
