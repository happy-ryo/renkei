"use strict";
/**
 * Renkei System - メインエントリーポイント
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const config_manager_js_1 = require("./managers/config-manager.js");
const types_js_1 = require("./interfaces/types.js");
const chalk_1 = __importDefault(require("chalk"));
async function main() {
    console.log(chalk_1.default.blue.bold('🚀 Renkei System 起動中...'));
    try {
        // 設定管理システムの初期化
        console.log(chalk_1.default.yellow('📋 設定を初期化しています...'));
        await config_manager_js_1.configManager.initialize();
        const config = config_manager_js_1.configManager.getConfig();
        console.log(chalk_1.default.green('✅ 設定の初期化が完了しました'));
        console.log(chalk_1.default.gray(`   バージョン: ${config.version}`));
        console.log(chalk_1.default.gray(`   ワークスペース: ${config.workspaceDir}`));
        console.log(chalk_1.default.gray(`   セッション保存先: ${config.sessionDir}`));
        // システム情報の表示
        console.log(chalk_1.default.yellow('🔍 システム情報を取得しています...'));
        const systemInfo = await config_manager_js_1.configManager.getSystemInfo();
        console.log(chalk_1.default.green('✅ システム情報:'));
        console.log(chalk_1.default.gray(`   プラットフォーム: ${systemInfo.platform}`));
        console.log(chalk_1.default.gray(`   Node.js: ${systemInfo.nodeVersion}`));
        console.log(chalk_1.default.gray(`   tmux: ${systemInfo.tmuxVersion || '未検出'}`));
        console.log(chalk_1.default.gray(`   ClaudeCode: ${systemInfo.claudeCodeVersion || '未検出'}`));
        console.log(chalk_1.default.gray(`   Renkei: ${systemInfo.renkeiVersion}`));
        // ClaudeCode設定ファイルの生成
        console.log(chalk_1.default.yellow('⚙️  ClaudeCode設定を生成しています...'));
        await config_manager_js_1.configManager.generateClaudeCodeSettings();
        console.log(chalk_1.default.green('✅ ClaudeCode設定ファイルを生成しました'));
        console.log(chalk_1.default.blue.bold('\n🎉 Renkei System の基盤が正常に初期化されました！'));
        console.log(chalk_1.default.gray('次のステップ: ClaudeCode統合とtmux UIの実装'));
    }
    catch (error) {
        if (error instanceof types_js_1.RenkeiError) {
            console.error(chalk_1.default.red.bold(`❌ エラー [${error.code}]: ${error.message}`));
            if (error.details) {
                console.error(chalk_1.default.red(`   詳細: ${error.details}`));
            }
        }
        else {
            console.error(chalk_1.default.red.bold('❌ 予期しないエラーが発生しました:'));
            console.error(chalk_1.default.red(error instanceof Error ? error.message : String(error)));
        }
        process.exit(1);
    }
}
// メイン関数の実行
if (require.main === module) {
    main().catch((error) => {
        console.error(chalk_1.default.red.bold('❌ 致命的なエラー:'), error);
        process.exit(1);
    });
}
//# sourceMappingURL=index.js.map