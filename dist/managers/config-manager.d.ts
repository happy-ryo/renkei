/**
 * Renkei System - 設定管理システム
 */
import { RenkeiConfig, UserPreferences, SystemInfo, DeepPartial } from '../interfaces/types';
export declare class ConfigManager {
    private config;
    private readonly configPath;
    private readonly defaultConfigPath;
    private readonly userConfigPath;
    constructor(configDir?: string, userConfigDir?: string);
    /**
     * 設定を初期化
     */
    initialize(): Promise<void>;
    /**
     * 設定を読み込み
     */
    loadConfig(): Promise<RenkeiConfig>;
    /**
     * 設定を保存
     */
    saveConfig(config?: RenkeiConfig): Promise<void>;
    /**
     * 設定を取得
     */
    getConfig(): RenkeiConfig;
    /**
     * 設定を部分的に更新
     */
    updateConfig(updates: DeepPartial<RenkeiConfig>): Promise<void>;
    /**
     * ユーザー設定を取得
     */
    getUserPreferences(): UserPreferences;
    /**
     * ユーザー設定を更新
     */
    updateUserPreferences(preferences: Partial<UserPreferences>): Promise<void>;
    /**
     * ClaudeCode用のsettings.jsonを生成
     */
    generateClaudeCodeSettings(): Promise<void>;
    /**
     * システム情報を取得
     */
    getSystemInfo(): Promise<SystemInfo>;
    /**
     * 設定をリセット（デフォルトに戻す）
     */
    resetConfig(): Promise<void>;
    /**
     * 設定をバックアップ
     */
    backupConfig(): Promise<string>;
    private loadConfigFile;
    private validateConfig;
    private mergeConfig;
    private ensureDirectories;
    private ensureDirectory;
    private fileExists;
    private loadPackageJson;
    private getTmuxVersion;
    private getClaudeCodeVersion;
}
export declare const configManager: ConfigManager;
//# sourceMappingURL=config-manager.d.ts.map