#!/usr/bin/env node

/**
 * Renkei Chat CLI - チャットインターフェースのスタンドアロン起動
 * tmuxペイン内で実行されることを想定
 */

import { ChatInterface, defaultChatConfig } from './ui/chat';
import { ChatConfig } from './interfaces/chat-types';
import * as fs from 'fs';
import * as path from 'path';

// 設定ファイルの読み込み
function loadChatConfig(): ChatConfig {
  const configPath = path.join(process.cwd(), 'data', 'chat-config.json');
  
  if (fs.existsSync(configPath)) {
    try {
      const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return { ...defaultChatConfig, ...userConfig };
    } catch (error) {
      console.error('Failed to load chat config:', error);
    }
  }
  
  return defaultChatConfig as ChatConfig;
}

// メイン関数
async function main() {
  console.clear();
  
  // 設定読み込み
  const config = loadChatConfig();
  
  // チャットインターフェース初期化
  const chat = new ChatInterface(config);
  
  // AIブリッジとの接続設定（後で実装）
  chat.on('message', (message) => {
    if (message.role === 'user') {
      // TODO: AIManagerにメッセージを送信
      // 仮の応答
      setTimeout(() => {
        chat.sendMessage({
          id: Date.now().toString(),
          role: 'assistant',
          content: `I received your message: "${message.content}". The AI Manager integration is coming soon!`,
          timestamp: new Date()
        });
      }, 500);
    }
  });
  
  // エラーハンドリング
  chat.on('error', (error) => {
    console.error('Chat error:', error);
  });
  
  // セッション終了時の処理
  chat.on('session_end', () => {
    process.exit(0);
  });
  
  // プロセス終了時のクリーンアップ
  process.on('SIGINT', async () => {
    await chat.endSession();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    await chat.endSession();
    process.exit(0);
  });
  
  // チャットセッション開始
  try {
    await chat.startSession();
  } catch (error) {
    console.error('Failed to start chat session:', error);
    process.exit(1);
  }
}

// 実行
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main };