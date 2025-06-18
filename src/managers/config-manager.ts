/**
 * Renkei System - 設定管理システム
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { 
  RenkeiConfig, 
  UserPreferences, 
  SystemInfo, 
  ErrorCode, 
  RenkeiError,
  DeepPartial 
} from '../interfaces/types';

export class ConfigManager {
  private config: RenkeiConfig | null = null;
  private readonly configPath: string;
  private readonly defaultConfigPath: string;
  private readonly userConfigPath: string;

  constructor(
    configDir: string = './config',
    userConfigDir: string = './data'
  ) {
    this.defaultConfigPath = path.join(configDir, 'default-settings.json');
    this.userConfigPath = path.join(userConfigDir, 'user-settings.json');
    this.configPath = this.userConfigPath;
  }

  /**
   * 設定を初期化
   */
  async initialize(): Promise<void> {
    try {
      await this.ensureDirectories();
      await this.loadConfig();
      await this.validateConfig();
    } catch (error) {
      throw new RenkeiError(
        ErrorCode.CONFIG_ERROR,
        '設定の初期化に失敗しました',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * 設定を読み込み
   */
  async loadConfig(): Promise<RenkeiConfig> {
    try {
      // ユーザー設定が存在する場合は読み込み
      if (await this.fileExists(this.userConfigPath)) {
        const userConfig = await this.loadConfigFile(this.userConfigPath);
        this.config = userConfig;
      } else {
        // デフォルト設定をコピーしてユーザー設定を作成
        const defaultConfig = await this.loadConfigFile(this.defaultConfigPath);
        await this.saveConfig(defaultConfig);
        this.config = defaultConfig;
      }

      return this.config;
    } catch (error) {
      throw new RenkeiError(
        ErrorCode.CONFIG_ERROR,
        '設定ファイルの読み込みに失敗しました',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * 設定を保存
   */
  async saveConfig(config?: RenkeiConfig): Promise<void> {
    const configToSave = config || this.config;
    if (!configToSave) {
      throw new RenkeiError(ErrorCode.CONFIG_ERROR, '保存する設定がありません');
    }

    try {
      await fs.writeFile(
        this.configPath,
        JSON.stringify(configToSave, null, 2),
        'utf-8'
      );
      this.config = configToSave;
    } catch (error) {
      throw new RenkeiError(
        ErrorCode.CONFIG_ERROR,
        '設定ファイルの保存に失敗しました',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * 設定を取得
   */
  getConfig(): RenkeiConfig {
    if (!this.config) {
      throw new RenkeiError(ErrorCode.CONFIG_ERROR, '設定が初期化されていません');
    }
    return this.config;
  }

  /**
   * 設定を部分的に更新
   */
  async updateConfig(updates: DeepPartial<RenkeiConfig>): Promise<void> {
    if (!this.config) {
      throw new RenkeiError(ErrorCode.CONFIG_ERROR, '設定が初期化されていません');
    }

    try {
      this.config = this.mergeConfig(this.config, updates);
      await this.validateConfig();
      await this.saveConfig();
    } catch (error) {
      throw new RenkeiError(
        ErrorCode.CONFIG_ERROR,
        '設定の更新に失敗しました',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * ユーザー設定を取得
   */
  getUserPreferences(): UserPreferences {
    const config = this.getConfig();
    return (config as any).userPreferences || {
      theme: 'dark',
      language: 'ja',
      notifications: true,
      autoSave: true,
      debugMode: false
    };
  }

  /**
   * ユーザー設定を更新
   */
  async updateUserPreferences(preferences: Partial<UserPreferences>): Promise<void> {
    const currentPreferences = this.getUserPreferences();
    const updatedPreferences = { ...currentPreferences, ...preferences };
    
    await this.updateConfig({
      userPreferences: updatedPreferences
    } as any);
  }

  /**
   * ClaudeCode用のsettings.jsonを生成
   */
  async generateClaudeCodeSettings(): Promise<void> {
    const config = this.getConfig();
    const claudeSettings = {
      permissions: config.permissions.permissions,
      autoApprove: config.permissions.autoApprove
    };

    const settingsPath = path.join(config.workspaceDir, 'settings.json');
    
    try {
      await this.ensureDirectory(path.dirname(settingsPath));
      await fs.writeFile(
        settingsPath,
        JSON.stringify(claudeSettings, null, 2),
        'utf-8'
      );
    } catch (error) {
      throw new RenkeiError(
        ErrorCode.CONFIG_ERROR,
        'ClaudeCode設定ファイルの生成に失敗しました',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * システム情報を取得
   */
  async getSystemInfo(): Promise<SystemInfo> {
    const packageJson = await this.loadPackageJson();
    
    return {
      platform: process.platform,
      nodeVersion: process.version,
      tmuxVersion: await this.getTmuxVersion(),
      claudeCodeVersion: await this.getClaudeCodeVersion(),
      renkeiVersion: packageJson.version || '1.0.0'
    };
  }

  /**
   * 設定をリセット（デフォルトに戻す）
   */
  async resetConfig(): Promise<void> {
    try {
      const defaultConfig = await this.loadConfigFile(this.defaultConfigPath);
      await this.saveConfig(defaultConfig);
    } catch (error) {
      throw new RenkeiError(
        ErrorCode.CONFIG_ERROR,
        '設定のリセットに失敗しました',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * 設定をバックアップ
   */
  async backupConfig(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(
      path.dirname(this.configPath),
      `user-settings-backup-${timestamp}.json`
    );

    try {
      if (await this.fileExists(this.configPath)) {
        await fs.copyFile(this.configPath, backupPath);
      }
      return backupPath;
    } catch (error) {
      throw new RenkeiError(
        ErrorCode.CONFIG_ERROR,
        '設定のバックアップに失敗しました',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  // プライベートメソッド

  private async loadConfigFile(filePath: string): Promise<RenkeiConfig> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as RenkeiConfig;
    } catch (error) {
      throw new Error(`設定ファイル ${filePath} の読み込みに失敗: ${error}`);
    }
  }

  private async validateConfig(): Promise<void> {
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
    if (!config.permissions?.permissions?.allow || !Array.isArray(config.permissions.permissions.allow)) {
      throw new Error('許可リストが必要です');
    }

    if (!config.permissions?.permissions?.deny || !Array.isArray(config.permissions.permissions.deny)) {
      throw new Error('拒否リストが必要です');
    }
  }

  private mergeConfig(base: RenkeiConfig, updates: DeepPartial<RenkeiConfig>): RenkeiConfig {
    const result = { ...base };

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          (result as any)[key] = { ...(base as any)[key], ...value };
        } else {
          (result as any)[key] = value;
        }
      }
    }

    return result;
  }

  private async ensureDirectories(): Promise<void> {
    const dirs = [
      path.dirname(this.userConfigPath),
      path.dirname(this.defaultConfigPath)
    ];

    for (const dir of dirs) {
      await this.ensureDirectory(dir);
    }
  }

  private async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async loadPackageJson(): Promise<any> {
    try {
      const content = await fs.readFile('./package.json', 'utf-8');
      return JSON.parse(content);
    } catch {
      return { version: '1.0.0' };
    }
  }

  private async getTmuxVersion(): Promise<string | undefined> {
    try {
      const { execSync } = await import('child_process');
      const output = execSync('tmux -V', { encoding: 'utf-8' });
      return output.trim();
    } catch {
      return undefined;
    }
  }

  private async getClaudeCodeVersion(): Promise<string | undefined> {
    try {
      const { execSync } = await import('child_process');
      const output = execSync('claude-code --version', { encoding: 'utf-8' });
      return output.trim();
    } catch {
      return undefined;
    }
  }
}

// シングルトンインスタンス
export const configManager = new ConfigManager();
