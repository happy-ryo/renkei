/**
 * ClaudeCode設定ファイル管理機能
 * settings.json の生成・同期・管理を担当
 */

import path from 'path';
import fs from 'fs/promises';
import { EventEmitter } from 'events';
import { ConfigManager } from '../managers/config-manager.js';
import {
  ClaudeCodeSettings,
  ClaudeCodeError,
  ClaudeErrorCode,
} from '../interfaces/claude-types.js';

/**
 * ClaudeCode設定ファイル管理クラス
 */
export class SettingsManager extends EventEmitter {
  private configManager: ConfigManager;
  private workspaceDir: string;
  private settingsPath: string;
  private isInitialized = false;

  constructor(configManager: ConfigManager, workspaceDir?: string) {
    super();
    this.configManager = configManager;
    this.workspaceDir = workspaceDir || process.cwd();
    this.settingsPath = path.join(
      this.workspaceDir,
      'workspace',
      'settings.json'
    );
  }

  /**
   * 設定管理システムの初期化
   */
  async initialize(): Promise<void> {
    try {
      // ワークスペースディレクトリを作成
      await fs.mkdir(path.dirname(this.settingsPath), { recursive: true });

      // 設定ファイルが存在しない場合は作成
      const exists = await this.settingsFileExists();
      if (!exists) {
        await this.generateDefaultSettings();
      }

      // 設定ファイルを検証
      await this.validateSettingsFile();

      this.isInitialized = true;
      this.emit('initialized');
    } catch (error) {
      throw new ClaudeCodeError(
        ClaudeErrorCode.INTERNAL_ERROR,
        '設定管理システムの初期化に失敗しました',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * デフォルト設定ファイルを生成
   */
  async generateDefaultSettings(): Promise<void> {
    const renkeiConfig = this.configManager.getConfig();

    const defaultSettings: ClaudeCodeSettings = {
      permissions: {
        allow: ['*'],
        deny: [
          'rm -rf',
          'sudo',
          'chmod +x',
          'dd if=',
          'mkfs',
          'fdisk',
          'parted',
        ],
      },
      autoApprove: renkeiConfig.claude?.autoApprove || false,
      workspaceRestrictions: {
        allowedDirectories: [
          this.workspaceDir,
          path.join(this.workspaceDir, 'workspace'),
          path.join(this.workspaceDir, 'data'),
          path.join(this.workspaceDir, 'src'),
          path.join(this.workspaceDir, 'docs'),
        ],
        forbiddenDirectories: [
          '/etc',
          '/var',
          '/sys',
          '/proc',
          '/boot',
          '/root',
          '/home/*/.ssh',
          '/home/*/.aws',
        ],
        maxFileSize: renkeiConfig.limits?.maxFileSize || 10 * 1024 * 1024, // 10MB
      },
      executionLimits: {
        maxExecutionTime: renkeiConfig.limits?.maxExecutionTime || 300000, // 5分
        maxMemoryUsage:
          renkeiConfig.limits?.maxMemoryUsage || 512 * 1024 * 1024, // 512MB
        maxApiCalls: renkeiConfig.limits?.maxApiCalls || 100,
      },
      security: {
        dangerousCommands: [
          'rm -rf',
          'sudo',
          'chmod',
          'chown',
          'dd',
          'mkfs',
          'fdisk',
          'parted',
          'mount',
          'umount',
          'systemctl',
          'service',
          'kill -9',
          'killall',
        ],
        requireConfirmation: [
          'npm install',
          'yarn install',
          'pip install',
          'git clone',
          'git push',
          'git reset --hard',
          'git clean -fd',
          'docker run',
          'docker build',
        ],
        logAllCommands: renkeiConfig.logging?.commandLogging || true,
      },
    };

    await this.writeSettingsFile(defaultSettings);
    this.emit('settings_generated', {
      path: this.settingsPath,
      settings: defaultSettings,
    });
  }

  /**
   * Renkei設定との同期
   */
  async syncWithRenkeiConfig(): Promise<void> {
    this.ensureInitialized();

    const renkeiConfig = this.configManager.getConfig();
    const currentSettings = await this.loadSettingsFile();

    // Renkei設定から設定値を更新
    const updatedSettings: ClaudeCodeSettings = {
      ...currentSettings,
      autoApprove:
        renkeiConfig.claude?.autoApprove || currentSettings.autoApprove,
      workspaceRestrictions: {
        ...currentSettings.workspaceRestrictions,
        maxFileSize:
          renkeiConfig.limits?.maxFileSize ||
          currentSettings.workspaceRestrictions.maxFileSize,
      },
      executionLimits: {
        ...currentSettings.executionLimits,
        maxExecutionTime:
          renkeiConfig.limits?.maxExecutionTime ||
          currentSettings.executionLimits.maxExecutionTime,
        maxMemoryUsage:
          renkeiConfig.limits?.maxMemoryUsage ||
          currentSettings.executionLimits.maxMemoryUsage,
        maxApiCalls:
          renkeiConfig.limits?.maxApiCalls ||
          currentSettings.executionLimits.maxApiCalls,
      },
      security: {
        ...currentSettings.security,
        logAllCommands:
          renkeiConfig.logging?.commandLogging !== undefined
            ? renkeiConfig.logging.commandLogging
            : currentSettings.security.logAllCommands,
      },
    };

    // プロジェクト固有の許可設定を追加
    if (renkeiConfig.permissions) {
      updatedSettings.permissions = {
        allow: [
          ...new Set([
            ...currentSettings.permissions.allow,
            ...(renkeiConfig.permissions.allowedCommands || []),
          ]),
        ],
        deny: [
          ...new Set([
            ...currentSettings.permissions.deny,
            ...(renkeiConfig.permissions.deniedCommands || []),
          ]),
        ],
      };
    }

    await this.writeSettingsFile(updatedSettings);
    this.emit('settings_synced', { settings: updatedSettings });
  }

  /**
   * プロジェクト固有設定の適用
   */
  async applyProjectSpecificSettings(
    projectSettings: Partial<ClaudeCodeSettings>
  ): Promise<void> {
    this.ensureInitialized();

    const currentSettings = await this.loadSettingsFile();
    const mergedSettings = this.mergeSettings(currentSettings, projectSettings);

    await this.writeSettingsFile(mergedSettings);
    this.emit('project_settings_applied', { settings: mergedSettings });
  }

  /**
   * 許可設定の更新
   */
  async updatePermissions(
    allow?: string[],
    deny?: string[],
    merge: boolean = true
  ): Promise<void> {
    this.ensureInitialized();

    const currentSettings = await this.loadSettingsFile();

    if (merge) {
      // 既存設定とマージ
      if (allow) {
        currentSettings.permissions.allow = [
          ...new Set([...currentSettings.permissions.allow, ...allow]),
        ];
      }
      if (deny) {
        currentSettings.permissions.deny = [
          ...new Set([...currentSettings.permissions.deny, ...deny]),
        ];
      }
    } else {
      // 完全に置き換え
      if (allow) {
        currentSettings.permissions.allow = allow;
      }
      if (deny) {
        currentSettings.permissions.deny = deny;
      }
    }

    await this.writeSettingsFile(currentSettings);
    this.emit('permissions_updated', {
      permissions: currentSettings.permissions,
    });
  }

  /**
   * セキュリティ設定の更新
   */
  async updateSecuritySettings(
    dangerousCommands?: string[],
    requireConfirmation?: string[],
    logAllCommands?: boolean
  ): Promise<void> {
    this.ensureInitialized();

    const currentSettings = await this.loadSettingsFile();

    if (dangerousCommands !== undefined) {
      currentSettings.security.dangerousCommands = dangerousCommands;
    }
    if (requireConfirmation !== undefined) {
      currentSettings.security.requireConfirmation = requireConfirmation;
    }
    if (logAllCommands !== undefined) {
      currentSettings.security.logAllCommands = logAllCommands;
    }

    await this.writeSettingsFile(currentSettings);
    this.emit('security_updated', { security: currentSettings.security });
  }

  /**
   * 実行制限の更新
   */
  async updateExecutionLimits(
    limits: Partial<ClaudeCodeSettings['executionLimits']>
  ): Promise<void> {
    this.ensureInitialized();

    const currentSettings = await this.loadSettingsFile();
    currentSettings.executionLimits = {
      ...currentSettings.executionLimits,
      ...limits,
    };

    await this.writeSettingsFile(currentSettings);
    this.emit('execution_limits_updated', {
      limits: currentSettings.executionLimits,
    });
  }

  /**
   * 設定ファイルの読み込み
   */
  async loadSettingsFile(): Promise<ClaudeCodeSettings> {
    try {
      const content = await fs.readFile(this.settingsPath, 'utf8');
      return JSON.parse(content) as ClaudeCodeSettings;
    } catch (error) {
      throw new ClaudeCodeError(
        ClaudeErrorCode.INTERNAL_ERROR,
        '設定ファイルの読み込みに失敗しました',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * 設定ファイルの書き込み
   */
  async writeSettingsFile(settings: ClaudeCodeSettings): Promise<void> {
    try {
      const content = JSON.stringify(settings, null, 2);
      await fs.writeFile(this.settingsPath, content, 'utf8');
    } catch (error) {
      throw new ClaudeCodeError(
        ClaudeErrorCode.INTERNAL_ERROR,
        '設定ファイルの書き込みに失敗しました',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * 設定ファイルの存在確認
   */
  async settingsFileExists(): Promise<boolean> {
    try {
      await fs.access(this.settingsPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 設定ファイルの検証
   */
  async validateSettingsFile(): Promise<void> {
    const settings = await this.loadSettingsFile();

    // 必須フィールドの確認
    if (
      !settings.permissions ||
      !settings.permissions.allow ||
      !settings.permissions.deny
    ) {
      throw new ClaudeCodeError(
        ClaudeErrorCode.INVALID_REQUEST,
        '設定ファイルの permissions フィールドが不正です'
      );
    }

    if (!settings.workspaceRestrictions) {
      throw new ClaudeCodeError(
        ClaudeErrorCode.INVALID_REQUEST,
        '設定ファイルの workspaceRestrictions フィールドが不正です'
      );
    }

    if (!settings.executionLimits) {
      throw new ClaudeCodeError(
        ClaudeErrorCode.INVALID_REQUEST,
        '設定ファイルの executionLimits フィールドが不正です'
      );
    }

    if (!settings.security) {
      throw new ClaudeCodeError(
        ClaudeErrorCode.INVALID_REQUEST,
        '設定ファイルの security フィールドが不正です'
      );
    }

    this.emit('settings_validated', { settings });
  }

  /**
   * 設定のマージ
   */
  private mergeSettings(
    current: ClaudeCodeSettings,
    updates: Partial<ClaudeCodeSettings>
  ): ClaudeCodeSettings {
    return {
      permissions: updates.permissions
        ? {
            allow: updates.permissions.allow || current.permissions.allow,
            deny: updates.permissions.deny || current.permissions.deny,
          }
        : current.permissions,
      autoApprove:
        updates.autoApprove !== undefined
          ? updates.autoApprove
          : current.autoApprove,
      workspaceRestrictions: updates.workspaceRestrictions
        ? {
            ...current.workspaceRestrictions,
            ...updates.workspaceRestrictions,
          }
        : current.workspaceRestrictions,
      executionLimits: updates.executionLimits
        ? {
            ...current.executionLimits,
            ...updates.executionLimits,
          }
        : current.executionLimits,
      security: updates.security
        ? {
            ...current.security,
            ...updates.security,
          }
        : current.security,
    };
  }

  /**
   * 設定のバックアップ作成
   */
  async createBackup(): Promise<string> {
    this.ensureInitialized();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(
      path.dirname(this.settingsPath),
      `settings-backup-${timestamp}.json`
    );

    const settings = await this.loadSettingsFile();
    await fs.writeFile(backupPath, JSON.stringify(settings, null, 2), 'utf8');

    this.emit('backup_created', { backupPath, settings });
    return backupPath;
  }

  /**
   * バックアップからの復元
   */
  async restoreFromBackup(backupPath: string): Promise<void> {
    this.ensureInitialized();

    try {
      const content = await fs.readFile(backupPath, 'utf8');
      const settings = JSON.parse(content) as ClaudeCodeSettings;

      // 設定を検証
      await this.validateSettings(settings);

      // 現在の設定をバックアップ
      await this.createBackup();

      // 設定を復元
      await this.writeSettingsFile(settings);

      this.emit('settings_restored', { backupPath, settings });
    } catch (error) {
      throw new ClaudeCodeError(
        ClaudeErrorCode.INTERNAL_ERROR,
        'バックアップからの復元に失敗しました',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * 設定の検証（オブジェクトレベル）
   */
  private async validateSettings(settings: any): Promise<void> {
    if (!settings || typeof settings !== 'object') {
      throw new ClaudeCodeError(
        ClaudeErrorCode.INVALID_REQUEST,
        '設定オブジェクトが不正です'
      );
    }

    // 必須フィールドの型チェックなど...
    // 簡略化のため基本的なチェックのみ実装
  }

  /**
   * 設定パスの取得
   */
  getSettingsPath(): string {
    return this.settingsPath;
  }

  /**
   * 現在の設定を取得
   */
  async getCurrentSettings(): Promise<ClaudeCodeSettings> {
    this.ensureInitialized();
    return await this.loadSettingsFile();
  }

  /**
   * 初期化状態をチェック
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new ClaudeCodeError(
        ClaudeErrorCode.INTERNAL_ERROR,
        'SettingsManagerが初期化されていません。initialize()を先に呼び出してください'
      );
    }
  }

  /**
   * リソースのクリーンアップ
   */
  async cleanup(): Promise<void> {
    this.isInitialized = false;
    this.removeAllListeners();
    this.emit('cleanup_complete');
  }
}

/**
 * SettingsManagerのファクトリー関数
 */
export function createSettingsManager(
  configManager: ConfigManager,
  workspaceDir?: string
): SettingsManager {
  return new SettingsManager(configManager, workspaceDir);
}
