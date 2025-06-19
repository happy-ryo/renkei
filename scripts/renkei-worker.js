#!/usr/bin/env node

/**
 * Renkei Worker - タスク実行ワーカー
 * AIManagerを使用してタスクを実行し、tmux outputペインに出力
 */

const { RenkeiSystem } = require('../dist/index.js');
const { execSync } = require('child_process');

// tmux出力用のヘルパー関数
function sendToTmux(message) {
  if (process.env.RENKEI_TMUX_OUTPUT === '1') {
    try {
      // outputペインのIDを取得
      const panes = execSync('tmux list-panes -t renkei -F "#{pane_id}:#{pane_title}"', { encoding: 'utf8' });
      const outputPaneId = panes.split('\n')
        .map(line => line.split(':'))
        .find(([_, title]) => title && title.includes('Output'))?.[0];
      
      if (outputPaneId) {
        const lines = message.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            execSync(`tmux send-keys -t ${outputPaneId} "${line.replace(/"/g, '\\"')}" Enter`);
          } else {
            execSync(`tmux send-keys -t ${outputPaneId} Enter`);
          }
        }
      }
    } catch (error) {
      console.log(message);
    }
  } else {
    console.log(message);
  }
}

// メイン処理
async function main() {
  const taskDescription = process.argv[2];
  
  if (!taskDescription) {
    console.error('タスクの説明が必要です');
    process.exit(1);
  }
  
  try {
    sendToTmux('🔧 RenkeiSystemを初期化しています...');
    
    // RenkeiSystemの初期化
    const system = new RenkeiSystem();
    await system.initialize();
    
    // tmuxペインの接続
    const components = system.getComponents();
    if (components.aiManager && components.tmuxManager) {
      // outputペインのIDを取得
      try {
        const panes = execSync('tmux list-panes -t renkei -F "#{pane_id}:#{pane_title}"', { encoding: 'utf8' });
        const outputPaneId = panes.split('\n')
          .map(line => line.split(':'))
          .find(([_, title]) => title && title.includes('Output'))?.[0];
        
        if (outputPaneId) {
          components.aiManager.setTmuxManager(components.tmuxManager, outputPaneId);
          sendToTmux('✅ AI ManagerとTmux outputペインを接続しました');
        }
      } catch (error) {
        sendToTmux('⚠️  Tmux outputペインへの接続をスキップ');
      }
    }
    
    // システムを起動（必要に応じて）
    if (!system.isSystemRunning()) {
      await system.start();
    }
    
    sendToTmux('');
    sendToTmux('🚀 タスクを実行中...');
    sendToTmux('');
    
    // タスクを実行
    const result = await system.executeTaskOnly(taskDescription);
    
    sendToTmux('');
    sendToTmux('📋 実行結果:');
    sendToTmux(result);
    
    // 部分的なクリーンアップ
    await system.partialShutdown();
    
  } catch (error) {
    sendToTmux('');
    sendToTmux(`❌ エラー: ${error.message}`);
    if (error.stack) {
      sendToTmux('スタックトレース:');
      sendToTmux(error.stack);
    }
    process.exit(1);
  }
}

// 実行
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});