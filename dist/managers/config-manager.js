"use strict";
/**
 * Renkei System - 設定管理システム
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.configManager = exports.ConfigManager = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const types_1 = require("../interfaces/types");
class ConfigManager {
    constructor(configDir = './config', userConfigDir = './data') {
        this.config = null;
        this.defaultConfigPath = path.join(configDir, 'default-settings.json');
        this.userConfigPath = path.join(userConfigDir, 'user-settings.json');
        this.configPath = this.userConfigPath;
    }
    /**
     * 設定を初期化
     */
    async initialize() {
        try {
            await this.ensureDirectories();
            await this.loadConfig();
            await this.validateConfig();
        }
        catch (error) {
            throw new types_1.RenkeiError(types_1.ErrorCode.CONFIG_ERROR, '設定の初期化に失敗しました', error instanceof Error ? error.message : String(error));
        }
    }
    /**
     * 設定を読み込み
     */
    async loadConfig() {
        try {
            // ユーザー設定が存在する場合は読み込み
            if (await this.fileExists(this.userConfigPath)) {
                const userConfig = await this.loadConfigFile(this.userConfigPath);
                this.config = userConfig;
            }
            else {
                // デフォルト設定をコピーしてユーザー設定を作成
                const defaultConfig = await this.loadConfigFile(this.defaultConfigPath);
                await this.saveConfig(defaultConfig);
                this.config = defaultConfig;
            }
            return this.config;
        }
        catch (error) {
            throw new types_1.RenkeiError(types_1.ErrorCode.CONFIG_ERROR, '設定ファイルの読み込みに失敗しました', error instanceof Error ? error.message : String(error));
        }
    }
    /**
     * 設定を保存
     */
    async saveConfig(config) {
        const configToSave = config || this.config;
        if (!configToSave) {
            throw new types_1.RenkeiError(types_1.ErrorCode.CONFIG_ERROR, '保存する設定がありません');
        }
        try {
            await fs.writeFile(this.configPath, JSON.stringify(configToSave, null, 2), 'utf-8');
            this.config = configToSave;
        }
        catch (error) {
            throw new types_1.RenkeiError(types_1.ErrorCode.CONFIG_ERROR, '設定ファイルの保存に失敗しました', error instanceof Error ? error.message : String(error));
        }
    }
    /**
     * 設定を取得
     */
    getConfig() {
        if (!this.config) {
            throw new types_1.RenkeiError(types_1.ErrorCode.CONFIG_ERROR, '設定が初期化されていません');
        }
        return this.config;
    }
    /**
     * 設定を部分的に更新
     */
    async updateConfig(updates) {
        if (!this.config) {
            throw new types_1.RenkeiError(types_1.ErrorCode.CONFIG_ERROR, '設定が初期化されていません');
        }
        try {
            this.config = this.mergeConfig(this.config, updates);
            await this.validateConfig();
            await this.saveConfig();
        }
        catch (error) {
            throw new types_1.RenkeiError(types_1.ErrorCode.CONFIG_ERROR, '設定の更新に失敗しました', error instanceof Error ? error.message : String(error));
        }
    }
    /**
     * ユーザー設定を取得
     */
    getUserPreferences() {
        const config = this.getConfig();
        return (config.userPreferences || {
            theme: 'dark',
            language: 'ja',
            notifications: true,
            autoSave: true,
            debugMode: false,
        });
    }
    /**
     * ユーザー設定を更新
     */
    async updateUserPreferences(preferences) {
        const currentPreferences = this.getUserPreferences();
        const updatedPreferences = { ...currentPreferences, ...preferences };
        await this.updateConfig({
            userPreferences: updatedPreferences,
        });
    }
    /**
     * ClaudeCode用のsettings.jsonを生成
     */
    async generateClaudeCodeSettings() {
        const config = this.getConfig();
        const claudeSettings = {
            permissions: config.permissions.permissions,
            autoApprove: config.permissions.autoApprove,
        };
        const settingsPath = path.join(config.workspaceDir, 'settings.json');
        try {
            await this.ensureDirectory(path.dirname(settingsPath));
            await fs.writeFile(settingsPath, JSON.stringify(claudeSettings, null, 2), 'utf-8');
        }
        catch (error) {
            throw new types_1.RenkeiError(types_1.ErrorCode.CONFIG_ERROR, 'ClaudeCode設定ファイルの生成に失敗しました', error instanceof Error ? error.message : String(error));
        }
    }
    /**
     * システム情報を取得
     */
    async getSystemInfo() {
        const packageJson = await this.loadPackageJson();
        return {
            platform: process.platform,
            nodeVersion: process.version,
            tmuxVersion: await this.getTmuxVersion(),
            claudeCodeVersion: await this.getClaudeCodeVersion(),
            renkeiVersion: packageJson.version || '1.0.0',
        };
    }
    /**
     * 設定をリセット（デフォルトに戻す）
     */
    async resetConfig() {
        try {
            const defaultConfig = await this.loadConfigFile(this.defaultConfigPath);
            await this.saveConfig(defaultConfig);
        }
        catch (error) {
            throw new types_1.RenkeiError(types_1.ErrorCode.CONFIG_ERROR, '設定のリセットに失敗しました', error instanceof Error ? error.message : String(error));
        }
    }
    /**
     * 設定をバックアップ
     */
    async backupConfig() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(path.dirname(this.configPath), `user-settings-backup-${timestamp}.json`);
        try {
            if (await this.fileExists(this.configPath)) {
                await fs.copyFile(this.configPath, backupPath);
            }
            return backupPath;
        }
        catch (error) {
            throw new types_1.RenkeiError(types_1.ErrorCode.CONFIG_ERROR, '設定のバックアップに失敗しました', error instanceof Error ? error.message : String(error));
        }
    }
    // プライベートメソッド
    async loadConfigFile(filePath) {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            throw new Error(`設定ファイル ${filePath} の読み込みに失敗: ${error}`);
        }
    }
    async validateConfig() {
        if (!this.config) {
            throw new Error('設定が存在しません');
        }
        const config = this.config;
        // 必須フィールドの検証
        if (!config.version) {
            throw new Error('バージョン情報が必要です');
        }
        if (!config.workspaceDir) {
            throw new Error('ワークスペースディレクトリが必要です');
        }
        if (!config.sessionDir) {
            throw new Error('セッションディレクトリが必要です');
        }
        // tmux設定の検証
        if (!config.tmux?.sessionName) {
            throw new Error('tmuxセッション名が必要です');
        }
        // Claude設定の検証
        if (!config.claude?.maxTurns || config.claude.maxTurns < 1) {
            throw new Error('Claude最大ターン数は1以上である必要があります');
        }
        if (!config.claude?.timeout || config.claude.timeout < 1000) {
            throw new Error('Claudeタイムアウトは1000ms以上である必要があります');
        }
        // 許可設定の検証
        if (!config.permissions?.permissions?.allow ||
            !Array.isArray(config.permissions.permissions.allow)) {
            throw new Error('許可リストが必要です');
        }
        if (!config.permissions?.permissions?.deny ||
            !Array.isArray(config.permissions.permissions.deny)) {
            throw new Error('拒否リストが必要です');
        }
    }
    mergeConfig(base, updates) {
        const result = { ...base };
        for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined) {
                if (typeof value === 'object' &&
                    value !== null &&
                    !Array.isArray(value)) {
                    result[key] = { ...base[key], ...value };
                }
                else {
                    result[key] = value;
                }
            }
        }
        return result;
    }
    async ensureDirectories() {
        const dirs = [
            path.dirname(this.userConfigPath),
            path.dirname(this.defaultConfigPath),
        ];
        for (const dir of dirs) {
            await this.ensureDirectory(dir);
        }
    }
    async ensureDirectory(dirPath) {
        try {
            await fs.access(dirPath);
        }
        catch {
            await fs.mkdir(dirPath, { recursive: true });
        }
    }
    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        }
        catch {
            return false;
        }
    }
    async loadPackageJson() {
        try {
            const content = await fs.readFile('./package.json', 'utf-8');
            return JSON.parse(content);
        }
        catch {
            return { version: '1.0.0' };
        }
    }
    async getTmuxVersion() {
        try {
            const { execSync } = await Promise.resolve().then(() => __importStar(require('child_process')));
            const output = execSync('tmux -V', { encoding: 'utf-8' });
            return output.trim();
        }
        catch {
            return undefined;
        }
    }
    async getClaudeCodeVersion() {
        try {
            const { execSync } = await Promise.resolve().then(() => __importStar(require('child_process')));
            const output = execSync('claude-code --version', { encoding: 'utf-8' });
            return output.trim();
        }
        catch {
            return undefined;
        }
    }
}
exports.ConfigManager = ConfigManager;
// シングルトンインスタンス
exports.configManager = new ConfigManager();
//# sourceMappingURL=config-manager.js.map