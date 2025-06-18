/**
 * Renkei System - メインエントリーポイント
 */

import { configManager } from './managers/config-manager';
import { RenkeiError } from './interfaces/types';
import chalk from 'chalk';

async function main(): Promise<void> {
  console.log(chalk.blue.bold('🚀 Renkei System 起動中...'));

  try {
    // 設定管理システムの初期化
    console.log(chalk.yellow('📋 設定を初期化しています...'));
    await configManager.initialize();
    
    const config = configManager.getConfig();
    console.log(chalk.green('✅ 設定の初期化が完了しました'));
    console.log(chalk.gray(`   バージョン: ${config.version}`));
    console.log(chalk.gray(`   ワークスペース: ${config.workspaceDir}`));
    console.log(chalk.gray(`   セッション保存先: ${config.sessionDir}`));

    // システム情報の表示
    console.log(chalk.yellow('🔍 システム情報を取得しています...'));
    const systemInfo = await configManager.getSystemInfo();
    console.log(chalk.green('✅ システム情報:'));
    console.log(chalk.gray(`   プラットフォーム: ${systemInfo.platform}`));
    console.log(chalk.gray(`   Node.js: ${systemInfo.nodeVersion}`));
    console.log(chalk.gray(`   tmux: ${systemInfo.tmuxVersion || '未検出'}`));
    console.log(chalk.gray(`   ClaudeCode: ${systemInfo.claudeCodeVersion || '未検出'}`));
    console.log(chalk.gray(`   Renkei: ${systemInfo.renkeiVersion}`));

    // ClaudeCode設定ファイルの生成
    console.log(chalk.yellow('⚙️  ClaudeCode設定を生成しています...'));
    await configManager.generateClaudeCodeSettings();
    console.log(chalk.green('✅ ClaudeCode設定ファイルを生成しました'));

    console.log(chalk.blue.bold('\n🎉 Renkei System の基盤が正常に初期化されました！'));
    console.log(chalk.gray('次のステップ: ClaudeCode統合とtmux UIの実装'));

  } catch (error) {
    if (error instanceof RenkeiError) {
      console.error(chalk.red.bold(`❌ エラー [${error.code}]: ${error.message}`));
      if (error.details) {
        console.error(chalk.red(`   詳細: ${error.details}`));
      }
    } else {
      console.error(chalk.red.bold('❌ 予期しないエラーが発生しました:'));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    }
    process.exit(1);
  }
}

// メイン関数の実行
if (require.main === module) {
  main().catch((error) => {
    console.error(chalk.red.bold('❌ 致命的なエラー:'), error);
    process.exit(1);
  });
}

export { main };
