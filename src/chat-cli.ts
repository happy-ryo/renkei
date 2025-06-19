#!/usr/bin/env node

/**
 * Renkei Chat CLI - チャットインターフェースのスタンドアロン起動
 * tmuxペイン内で実行されることを想定
 */

import { ChatInterface, defaultChatConfig } from './ui/chat';
import { ChatConfig, ChatMessage } from './interfaces/chat-types';
import { ChatManager } from './managers/chat-manager';
import { AIBridge, createSimpleAIBridge } from './managers/ai-bridge';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

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
  
  // チャットマネージャー初期化
  console.log(chalk.blue('🔄 Initializing Chat Manager...'));
  const chatManager = new ChatManager();
  
  // AIブリッジ初期化
  console.log(chalk.blue('🔄 Initializing AI Bridge...'));
  let aiBridge: AIBridge | null = null;
  
  try {
    // ソケットベースのAIBridgeを試す
    aiBridge = new AIBridge(chatManager);
    await aiBridge.start();
    console.log(chalk.green('✅ AI Bridge started successfully'));
    
    // AI Managerへの接続を試みる
    await aiBridge.connectToAIManager();
  } catch (error) {
    console.log(chalk.yellow('⚠️  Socket-based AI Bridge failed, using simple bridge'));
    // フォールバック：シンプルブリッジを使用
    await createSimpleAIBridge(chatManager);
  }
  
  // チャットインターフェース初期化
  const chat = new ChatInterface(config);
  
  // セッション作成
  const session = chatManager.createSession({
    workingDirectory: process.cwd()
  });
  
  // AI Manager接続状態の監視
  chatManager.on('ai_manager_connection', (connected: boolean) => {
    if (connected) {
      const systemMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'system',
        content: chalk.green('🔗 AI Managerと接続しました'),
        timestamp: new Date()
      };
      chat.sendMessage(systemMessage);
    } else {
      const disconnectMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'system',
        content: chalk.yellow('⚠️  AI Managerとの接続が切断されました'),
        timestamp: new Date()
      };
      chat.sendMessage(disconnectMessage);
    }
  });
  
  // チャットメッセージの処理
  chat.on('message', async (message: ChatMessage) => {
    if (message.role === 'user') {
      // セッションにメッセージを追加
      chatManager.addMessageToSession(session.sessionId, message);
      
      try {
        // AI Managerにメッセージを送信
        const result = await chatManager.sendToAIManager(session.sessionId, message);
        
        // 応答をチャットに表示
        const aiResponse: ChatMessage = {
          id: result.id,
          role: 'assistant',
          content: result.output,
          timestamp: new Date(result.timestamp)
        };
        
        chat.sendMessage(aiResponse);
        chatManager.addMessageToSession(session.sessionId, aiResponse);
        
      } catch (error) {
        // エラーメッセージを表示
        const errorMessage: ChatMessage = {
          id: Date.now().toString(),
          role: 'system',
          content: chalk.red(`❌ エラー: ${error instanceof Error ? error.message : 'Unknown error'}`),
          timestamp: new Date()
        };
        chat.sendMessage(errorMessage);
      }
    }
  });
  
  // エラーハンドリング
  chat.on('error', (error) => {
    console.error('Chat error:', error);
  });
  
  // セッション終了時の処理
  chat.on('session_end', async () => {
    chatManager.endSession(session.sessionId);
    if (aiBridge) {
      await aiBridge.stop();
    }
    process.exit(0);
  });
  
  // プロセス終了時のクリーンアップ
  process.on('SIGINT', async () => {
    await chat.endSession();
    chatManager.endSession(session.sessionId);
    if (aiBridge) {
      await aiBridge.stop();
    }
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    await chat.endSession();
    chatManager.endSession(session.sessionId);
    if (aiBridge) {
      await aiBridge.stop();
    }
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