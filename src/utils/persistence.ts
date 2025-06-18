/**
 * Renkei System - 永続化ユーティリティ
 * セッション状態の保存・復元・履歴管理を提供
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import {
  SessionState,
  SessionMetadata,
  RenkeiError,
  ErrorSeverity,
} from '../interfaces/types.js';

/**
 * 永続化設定
 */
export interface PersistenceConfig {
  sessionDir: string;
  maxHistoryCount: number;
  backupInterval: number;
  compressionEnabled: boolean;
}

/**
 * セッション履歴エントリ
 */
export interface SessionHistoryEntry {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  status: 'active' | 'paused' | 'completed' | 'failed';
  taskCount: number;
  metadata: SessionMetadata;
}

/**
 * セッション永続化管理クラス
 */
export class SessionPersistence {
  private config: PersistenceConfig;
  private sessionFilePath: string;
  private historyFilePath: string;
  private backupDir: string;

  constructor(config: PersistenceConfig) {
    this.config = config;
    this.sessionFilePath = path.join(config.sessionDir, 'current_session.json');
    this.historyFilePath = path.join(config.sessionDir, 'session_history.json');
    this.backupDir = path.join(config.sessionDir, 'backups');
  }

  /**
   * 初期化 - 必要なディレクトリを作成
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.config.sessionDir, { recursive: true });
      await fs.mkdir(this.backupDir, { recursive: true });
    } catch (error) {
      throw new RenkeiError(
        'Failed to initialize session persistence',
        'PERSISTENCE_INIT_ERROR',
        ErrorSeverity.ERROR,
        error
      );
    }
  }

  /**
   * セッション状態を保存
   */
  async saveSession(sessionState: SessionState): Promise<void> {
    try {
      // 現在のセッションをバックアップ
      await this.createBackup(sessionState.sessionId);

      // セッション状態をJSON形式で保存
      const sessionData = {
        ...sessionState,
        lastSaved: new Date(),
        version: '1.0',
      };

      await fs.writeFile(
        this.sessionFilePath,
        JSON.stringify(sessionData, null, 2),
        'utf8'
      );

      // 履歴を更新
      await this.updateHistory(sessionState);
    } catch (error) {
      throw new RenkeiError(
        `Failed to save session ${sessionState.sessionId}`,
        'SESSION_SAVE_ERROR',
        ErrorSeverity.ERROR,
        error
      );
    }
  }

  /**
   * セッション状態を復元
   */
  async restoreSession(): Promise<SessionState | null> {
    try {
      // セッションファイルの存在確認
      try {
        await fs.access(this.sessionFilePath);
      } catch {
        return null; // セッションファイルが存在しない
      }

      // セッションファイルを読み込み
      const sessionData = await fs.readFile(this.sessionFilePath, 'utf8');
      const parsedSession = JSON.parse(sessionData);

      // 型変換とバリデーション
      const sessionState: SessionState = {
        sessionId: parsedSession.sessionId,
        status: parsedSession.status,
        startTime: new Date(parsedSession.startTime),
        lastActivity: new Date(parsedSession.lastActivity),
        taskHistory: parsedSession.taskHistory.map((task: any) => ({
          ...task,
          timestamp: new Date(task.timestamp),
          deadline: task.deadline ? new Date(task.deadline) : undefined,
        })),
        context: parsedSession.context,
        metadata: parsedSession.metadata,
      };

      return sessionState;
    } catch (error) {
      throw new RenkeiError(
        'Failed to restore session',
        'SESSION_RESTORE_ERROR',
        ErrorSeverity.ERROR,
        error
      );
    }
  }

  /**
   * セッションのバックアップを作成
   */
  async createBackup(sessionId: string): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `session_${sessionId}_${timestamp}.json`;
      const backupPath = path.join(this.backupDir, backupFileName);

      // 現在のセッションファイルが存在する場合のみバックアップ
      try {
        await fs.access(this.sessionFilePath);
        await fs.copyFile(this.sessionFilePath, backupPath);
      } catch {
        // セッションファイルが存在しない場合は空のバックアップを作成
        await fs.writeFile(
          backupPath,
          JSON.stringify(
            {
              sessionId,
              status: 'active',
              startTime: new Date(),
              lastActivity: new Date(),
              taskHistory: [],
              context: {
                workingDirectory: process.cwd(),
                environment: {},
                openFiles: [],
              },
              metadata: {
                totalTasks: 0,
                successfulTasks: 0,
                failedTasks: 0,
                totalExecutionTime: 0,
                totalCost: 0,
              },
            },
            null,
            2
          )
        );
      }

      // 古いバックアップを清理
      await this.cleanupOldBackups();

      return backupPath;
    } catch (error) {
      throw new RenkeiError(
        `Failed to create backup for session ${sessionId}`,
        'BACKUP_CREATE_ERROR',
        ErrorSeverity.WARNING,
        error
      );
    }
  }

  /**
   * セッション履歴を取得
   */
  async getSessionHistory(): Promise<SessionHistoryEntry[]> {
    try {
      try {
        await fs.access(this.historyFilePath);
      } catch {
        return []; // 履歴ファイルが存在しない
      }

      const historyData = await fs.readFile(this.historyFilePath, 'utf8');
      const history = JSON.parse(historyData);

      return history.map((entry: any) => ({
        ...entry,
        startTime: new Date(entry.startTime),
        endTime: entry.endTime ? new Date(entry.endTime) : undefined,
      }));
    } catch (error) {
      throw new RenkeiError(
        'Failed to get session history',
        'HISTORY_GET_ERROR',
        ErrorSeverity.WARNING,
        error
      );
    }
  }

  /**
   * セッション履歴を更新
   */
  private async updateHistory(sessionState: SessionState): Promise<void> {
    try {
      const history = await this.getSessionHistory();

      // 既存のエントリを検索
      const existingIndex = history.findIndex(
        (entry) => entry.sessionId === sessionState.sessionId
      );

      const historyEntry: SessionHistoryEntry = {
        sessionId: sessionState.sessionId,
        startTime: sessionState.startTime,
        ...(sessionState.status === 'completed' ||
        sessionState.status === 'failed'
          ? { endTime: new Date() }
          : {}),
        status: sessionState.status,
        taskCount: sessionState.taskHistory.length,
        metadata: sessionState.metadata,
      };

      if (existingIndex >= 0) {
        // 既存エントリを更新
        history[existingIndex] = historyEntry;
      } else {
        // 新しいエントリを追加
        history.push(historyEntry);
      }

      // 履歴数制限
      if (history.length > this.config.maxHistoryCount) {
        history.splice(0, history.length - this.config.maxHistoryCount);
      }

      await fs.writeFile(
        this.historyFilePath,
        JSON.stringify(history, null, 2),
        'utf8'
      );
    } catch (error) {
      throw new RenkeiError(
        'Failed to update session history',
        'HISTORY_UPDATE_ERROR',
        ErrorSeverity.WARNING,
        error
      );
    }
  }

  /**
   * 古いバックアップファイルを清理
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files
        .filter((file) => file.startsWith('session_') && file.endsWith('.json'))
        .map((file) => ({
          name: file,
          path: path.join(this.backupDir, file),
          timestamp: this.extractTimestampFromFilename(file),
        }))
        .filter(
          (file): file is { name: string; path: string; timestamp: Date } =>
            file.timestamp !== null
        )
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      // 最新のバックアップを保持し、古いものを削除
      const maxBackups = 10; // 最大バックアップ数
      if (backupFiles.length > maxBackups) {
        const filesToDelete = backupFiles.slice(maxBackups);
        for (const file of filesToDelete) {
          await fs.unlink(file.path);
        }
      }
    } catch (error) {
      // バックアップ清理の失敗は警告レベル
      console.warn('Failed to cleanup old backups:', error);
    }
  }

  /**
   * ファイル名からタイムスタンプを抽出
   */
  private extractTimestampFromFilename(filename: string): Date | null {
    const match = filename.match(/session_[^_]+_(.+)\.json$/);
    if (!match || !match[1]) return null;

    try {
      const timestampStr = match[1].replace(/-/g, ':');
      return new Date(timestampStr);
    } catch {
      return null;
    }
  }

  /**
   * セッションデータをクリア
   */
  async clearSession(): Promise<void> {
    try {
      await fs.unlink(this.sessionFilePath);
    } catch (error) {
      // ファイルが存在しない場合は無視
      if ((error as any).code !== 'ENOENT') {
        throw new RenkeiError(
          'Failed to clear session',
          'SESSION_CLEAR_ERROR',
          ErrorSeverity.WARNING,
          error
        );
      }
    }
  }

  /**
   * 特定のセッションをバックアップから復元
   */
  async restoreFromBackup(backupFileName: string): Promise<SessionState> {
    try {
      const backupPath = path.join(this.backupDir, backupFileName);
      await fs.access(backupPath);

      const backupData = await fs.readFile(backupPath, 'utf8');
      const sessionData = JSON.parse(backupData);

      const sessionState: SessionState = {
        sessionId: sessionData.sessionId,
        status: sessionData.status,
        startTime: new Date(sessionData.startTime),
        lastActivity: new Date(sessionData.lastActivity),
        taskHistory: sessionData.taskHistory.map((task: any) => ({
          ...task,
          timestamp: new Date(task.timestamp),
          deadline: task.deadline ? new Date(task.deadline) : undefined,
        })),
        context: sessionData.context,
        metadata: sessionData.metadata,
      };

      return sessionState;
    } catch (error) {
      throw new RenkeiError(
        `Failed to restore from backup ${backupFileName}`,
        'BACKUP_RESTORE_ERROR',
        ErrorSeverity.ERROR,
        error
      );
    }
  }

  /**
   * 利用可能なバックアップファイル一覧を取得
   */
  async getAvailableBackups(): Promise<
    Array<{ filename: string; timestamp: Date; sessionId: string }>
  > {
    try {
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files
        .filter((file) => file.startsWith('session_') && file.endsWith('.json'))
        .map((file) => {
          const sessionIdMatch = file.match(/session_([^_]+)_/);
          const timestamp = this.extractTimestampFromFilename(file);
          return {
            filename: file,
            timestamp: timestamp || new Date(0),
            sessionId: sessionIdMatch?.[1] || 'unknown',
          };
        })
        .filter((file) => file.timestamp.getTime() > 0)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      return backupFiles;
    } catch (error) {
      throw new RenkeiError(
        'Failed to get available backups',
        'BACKUP_LIST_ERROR',
        ErrorSeverity.WARNING,
        error
      );
    }
  }
}

/**
 * デフォルトの永続化設定
 */
export const defaultPersistenceConfig: PersistenceConfig = {
  sessionDir: path.join(process.cwd(), 'workspace', 'sessions'),
  maxHistoryCount: 50,
  backupInterval: 300000, // 5分間隔
  compressionEnabled: false,
};
