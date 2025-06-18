/**
 * ConfigManager テストスイート
 */

import { ConfigManager } from '../config-manager';
import { RenkeiConfig } from '../../interfaces/types';
import * as fs from 'fs/promises';
import * as path from 'path';

// fs/promisesのモック
jest.mock('fs/promises');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  const testConfigDir = '/test/config';
  const testUserConfigDir = '/test/data';
  const mockConfig: RenkeiConfig = {
    version: '1.0.0',
    workspaceDir: '/test/workspace',
    sessionDir: '/test/sessions',
    tmux: {
      sessionName: 'test-session',
      mainPaneTitle: 'Main',
      subPaneTitle: 'Sub',
      splitDirection: 'vertical',
      mainPaneSize: 80,
    },
    claude: {
      maxTurns: 10,
      timeout: 30000,
      outputFormat: 'json',
      allowedTools: ['file_operations', 'terminal'],
    },
    permissions: {
      permissions: {
        allow: ['read', 'write'],
        deny: ['delete'],
      },
      autoApprove: false,
      dangerousCommands: ['rm -rf', 'format'],
    },
  };

  beforeEach(() => {
    configManager = new ConfigManager(testConfigDir, testUserConfigDir);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('loadConfig', () => {
    it('should load config from user config file successfully', async () => {
      const configContent = JSON.stringify(mockConfig, null, 2);
      mockFs.access.mockResolvedValueOnce(undefined); // user config exists
      mockFs.readFile.mockResolvedValue(configContent);

      const result = await configManager.loadConfig();

      expect(mockFs.readFile).toHaveBeenCalledWith(
        path.join(testUserConfigDir, 'user-settings.json'),
        'utf-8'
      );
      expect(result).toEqual(mockConfig);
    });

    it('should load default config when user config does not exist', async () => {
      const defaultConfigContent = JSON.stringify(mockConfig, null, 2);
      mockFs.access.mockRejectedValueOnce(new Error('File not found')); // user config doesn't exist
      mockFs.readFile.mockResolvedValue(defaultConfigContent);
      mockFs.writeFile.mockResolvedValue();

      const result = await configManager.loadConfig();

      expect(mockFs.readFile).toHaveBeenCalledWith(
        path.join(testConfigDir, 'default-settings.json'),
        'utf-8'
      );
      expect(result).toEqual(mockConfig);
    });

    it('should handle file read error', async () => {
      const error = new Error('Permission denied');
      mockFs.access.mockResolvedValueOnce(undefined);
      mockFs.readFile.mockRejectedValue(error);

      await expect(configManager.loadConfig()).rejects.toThrow();
    });

    it('should handle invalid JSON in config file', async () => {
      const invalidJson = '{ invalid json content';
      mockFs.access.mockResolvedValueOnce(undefined);
      mockFs.readFile.mockResolvedValue(invalidJson);

      await expect(configManager.loadConfig()).rejects.toThrow();
    });
  });

  describe('saveConfig', () => {
    it('should save config to file successfully', async () => {
      mockFs.writeFile.mockResolvedValue();

      await configManager.saveConfig(mockConfig);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(testUserConfigDir, 'user-settings.json'),
        JSON.stringify(mockConfig, null, 2),
        'utf-8'
      );
    });

    it('should handle write error', async () => {
      const error = new Error('Permission denied');
      mockFs.writeFile.mockRejectedValue(error);

      await expect(configManager.saveConfig(mockConfig)).rejects.toThrow();
    });

    it('should throw error when no config to save', async () => {
      await expect(configManager.saveConfig()).rejects.toThrow();
    });
  });

  describe('getConfig', () => {
    it('should return current config', async () => {
      const configContent = JSON.stringify(mockConfig, null, 2);
      mockFs.access.mockResolvedValueOnce(undefined);
      mockFs.readFile.mockResolvedValue(configContent);

      await configManager.loadConfig();
      const result = configManager.getConfig();

      expect(result).toEqual(mockConfig);
    });

    it('should throw error when no config is loaded', () => {
      expect(() => configManager.getConfig()).toThrow();
    });
  });

  describe('updateConfig', () => {
    beforeEach(async () => {
      const configContent = JSON.stringify(mockConfig, null, 2);
      mockFs.access.mockResolvedValueOnce(undefined);
      mockFs.readFile.mockResolvedValue(configContent);
      await configManager.loadConfig();
    });

    it('should update config partially', async () => {
      mockFs.writeFile.mockResolvedValue();

      const updates = {
        tmux: {
          sessionName: 'updated-session',
        },
      };

      await configManager.updateConfig(updates);
      const updatedConfig = configManager.getConfig();

      expect(updatedConfig.tmux.sessionName).toBe('updated-session');
      expect(updatedConfig.tmux.mainPaneTitle).toBe('Main'); // 既存値は保持
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should update nested config properties', async () => {
      mockFs.writeFile.mockResolvedValue();

      const updates = {
        claude: {
          maxTurns: 20,
          timeout: 60000,
        },
      };

      await configManager.updateConfig(updates);
      const updatedConfig = configManager.getConfig();

      expect(updatedConfig.claude.maxTurns).toBe(20);
      expect(updatedConfig.claude.timeout).toBe(60000);
      expect(updatedConfig.claude.outputFormat).toBe('json'); // 既存値は保持
    });

    it('should throw error when no config is loaded', async () => {
      const newConfigManager = new ConfigManager('/test/path');
      const updates = { version: '2.0.0' };

      await expect(newConfigManager.updateConfig(updates)).rejects.toThrow();
    });
  });

  describe('resetConfig', () => {
    beforeEach(async () => {
      const configContent = JSON.stringify(mockConfig, null, 2);
      mockFs.access.mockResolvedValueOnce(undefined);
      mockFs.readFile.mockResolvedValue(configContent);
      await configManager.loadConfig();
    });

    it('should reset config to default values', async () => {
      const defaultConfigContent = JSON.stringify(
        {
          ...mockConfig,
          tmux: { ...mockConfig.tmux, sessionName: 'renkei-session' },
        },
        null,
        2
      );

      mockFs.readFile.mockResolvedValueOnce(defaultConfigContent);
      mockFs.writeFile.mockResolvedValue();

      await configManager.resetConfig();
      const resetConfig = configManager.getConfig();

      expect(resetConfig.tmux.sessionName).toBe('renkei-session');
      expect(mockFs.writeFile).toHaveBeenCalled();
    });
  });

  describe('backupConfig', () => {
    beforeEach(async () => {
      const configContent = JSON.stringify(mockConfig, null, 2);
      mockFs.access.mockResolvedValueOnce(undefined);
      mockFs.readFile.mockResolvedValue(configContent);
      await configManager.loadConfig();
    });

    it('should create config backup', async () => {
      mockFs.access.mockResolvedValueOnce(undefined); // file exists
      mockFs.copyFile.mockResolvedValue();

      const backupPath = await configManager.backupConfig();

      expect(backupPath).toMatch(/user-settings-backup-.*\.json$/);
      expect(mockFs.copyFile).toHaveBeenCalled();
    });
  });

  describe('getUserPreferences', () => {
    beforeEach(async () => {
      const configWithPrefs = {
        ...mockConfig,
        userPreferences: {
          theme: 'light',
          language: 'en',
          notifications: false,
          autoSave: false,
          debugMode: true,
        },
      };
      const configContent = JSON.stringify(configWithPrefs, null, 2);
      mockFs.access.mockResolvedValueOnce(undefined);
      mockFs.readFile.mockResolvedValue(configContent);
      await configManager.loadConfig();
    });

    it('should return user preferences', () => {
      const preferences = configManager.getUserPreferences();

      expect(preferences.theme).toBe('light');
      expect(preferences.language).toBe('en');
      expect(preferences.notifications).toBe(false);
      expect(preferences.autoSave).toBe(false);
      expect(preferences.debugMode).toBe(true);
    });
  });

  describe('updateUserPreferences', () => {
    beforeEach(async () => {
      const configContent = JSON.stringify(mockConfig, null, 2);
      mockFs.access.mockResolvedValueOnce(undefined);
      mockFs.readFile.mockResolvedValue(configContent);
      await configManager.loadConfig();
    });

    it('should update user preferences', async () => {
      mockFs.writeFile.mockResolvedValue();

      const newPreferences = {
        theme: 'light' as const,
        notifications: false,
      };

      await configManager.updateUserPreferences(newPreferences);
      const preferences = configManager.getUserPreferences();

      expect(preferences.theme).toBe('light');
      expect(preferences.notifications).toBe(false);
      expect(preferences.language).toBe('ja'); // デフォルト値は保持
    });
  });

  describe('generateClaudeCodeSettings', () => {
    beforeEach(async () => {
      const configContent = JSON.stringify(mockConfig, null, 2);
      mockFs.access.mockResolvedValueOnce(undefined);
      mockFs.readFile.mockResolvedValue(configContent);
      await configManager.loadConfig();
    });

    it('should generate ClaudeCode settings file', async () => {
      mockFs.access.mockRejectedValueOnce(new Error('Directory not found'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue();

      await configManager.generateClaudeCodeSettings();

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(mockConfig.workspaceDir, 'settings.json'),
        expect.stringContaining('"permissions"'),
        'utf-8'
      );
    });
  });

  describe('getSystemInfo', () => {
    it('should return system information', async () => {
      mockFs.readFile.mockResolvedValue('{"version": "1.0.0"}');

      const systemInfo = await configManager.getSystemInfo();

      expect(systemInfo.platform).toBe(process.platform);
      expect(systemInfo.nodeVersion).toBe(process.version);
      expect(systemInfo.renkeiVersion).toBe('1.0.0');
    });
  });
});
