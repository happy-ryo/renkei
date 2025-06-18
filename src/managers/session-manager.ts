/**
 * Renkei System - セッション管理機能
 * セッション状態の管理、中断・復元制御、マルチセッション対応を提供
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { SessionState, SessionContext, TaskRequest, RenkeiError, ErrorSeverity } from '../interfaces/types.js';
import { SessionPersistence, PersistenceConfig, defaultPersistenceConfig, SessionHistoryEntry } from '../utils/persistence.js';

/**
 * セッション管理設定
 */
export interface SessionManagerConfig {
  persistence: PersistenceConfig;
  autoSaveInterval: number;
  maxConcurrentSessions: number;
  sessionTimeout: number;
  contextRetentionSize: number;
}

/**
 * セッション管理イベント
 */
export enum SessionManagerEvents {
  SESSION_CREATED = 'session_created',
  SESSION_RESTORED = 'session_restored',
  SESSION_SAVED = 'session_saved',
  SESSION_PAUSED = 'session_paused',
  SESSION_RESUMED = 'session_resumed',
  SESSION_COMPLETED = 'session_completed',
  SESSION_FAILED = 'session_failed',
  SESSION_TIMEOUT = 'session_timeout',
  TASK_ADDED = 'task_added',
  CONTEXT_UPDATED = 'context_updated',
  AUTO_SAVE = 'auto_save',
  ERROR = 'error',
}

/**
 * セッション管理クラス
 */
export class SessionManager extends EventEmitter {
  private config: SessionManagerConfig;
  private persistence: SessionPersistence;
  private currentSession: SessionState | null = null;
  private activeSessions: Map<string, SessionState> = new Map();
  private autoSaveTimer: NodeJS.Timeout | null = null;
  private timeoutTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: Partial<SessionManagerConfig> = {}) {
    super();
    
    this.config = {
      persistence: config.persistence || defaultPersistenceConfig,
      autoSaveInterval: config.autoSaveInterval || 30000, // 30秒間隔
      maxConcurrentSessions: config.maxConcurrentSessions || 5,
      sessionTimeout: config.sessionTimeout || 3600000, // 1時間
      contextRetentionSize: config.contextRetentionSize || 100
    };

    this.persistence = new SessionPersistence(this.config.persistence);
  }

  /**
   * 初期化
   */
  async initialize(): Promise<void> {
    try {
      await this.persistence.initialize();
      
      // 既存セッションの復元試行
      await this.attemptSessionRestore();
      
      // 自動保存の開始
      this.startAutoSave();
      
      this.emit(SessionManagerEvents.SESSION_RESTORED);
    } catch (error) {
      throw new RenkeiError(
        'Failed to initialize session manager',
        'SESSION_MANAGER_INIT_ERROR',
        ErrorSeverity.ERROR,
        error
      );
    }
  }

  /**
   * 新しいセッションを作成
   */
  async createSession(initialContext?: Partial<SessionContext>): Promise<string> {
    try {
      // 最大セッション数チェック
      if (this.activeSessions.size >= this.config.maxConcurrentSessions) {
        throw new RenkeiError(
          `Maximum concurrent sessions (${this.config.maxConcurrentSessions}) reached`,
          'MAX_SESSIONS_EXCEEDED',
          ErrorSeverity.ERROR
        );
      }

      const sessionId = uuidv4();
      const now = new Date();

      const sessionState: SessionState = {
        sessionId,
        status: 'active',
        startTime: now,
        lastActivity: now,
        taskHistory: [],
        context: {
          workingDirectory: initialContext?.workingDirectory || process.cwd(),
          environment: initialContext?.environment || {},
          openFiles: initialContext?.openFiles || [],
          ...(initialContext?.currentTask ? { currentTask: initialContext.currentTask } : {})
        },
        metadata: {
          totalTasks: 0,
          successfulTasks: 0,
          failedTasks: 0,
          totalExecutionTime: 0,
          totalCost: 0
        }
      };

      // セッションを登録
      this.activeSessions.set(sessionId, sessionState);
      this.currentSession = sessionState;

      // タイムアウトタイマーを設定
      this.setSessionTimeout(sessionId);

      // セッションを保存
      await this.persistence.saveSession(sessionState);

      this.emit(SessionManagerEvents.SESSION_CREATED, { sessionId, sessionState });
      return sessionId;

    } catch (error) {
      throw new RenkeiError(
        'Failed to create session',
        'SESSION_CREATE_ERROR',
        ErrorSeverity.ERROR,
        error
      );
    }
  }

  /**
   * セッションを取得
   */
  getSession(sessionId?: string): SessionState | null {
    if (!sessionId) {
      return this.currentSession;
    }
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * 現在のセッションを取得
   */
  getCurrentSession(): SessionState | null {
    return this.currentSession;
  }

  /**
   * アクティブなセッション一覧を取得
   */
  getActiveSessions(): SessionState[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * セッションにタスクを追加
   */
  async addTask(task: TaskRequest, sessionId?: string): Promise<void> {
    try {
      const targetSessionId = sessionId || this.currentSession?.sessionId;
      if (!targetSessionId) {
        throw new RenkeiError(
          'No active session to add task to',
          'NO_ACTIVE_SESSION',
          ErrorSeverity.ERROR
        );
      }

      const session = this.activeSessions.get(targetSessionId);
      if (!session) {
        throw new RenkeiError(
          `Session ${targetSessionId} not found`,
          'SESSION_NOT_FOUND',
          ErrorSeverity.ERROR
        );
      }

      // タスクをセッションに追加
      session.taskHistory.push(task);
      session.context.currentTask = task;
      session.lastActivity = new Date();
      session.metadata.totalTasks++;

      // セッションを保存
      await this.persistence.saveSession(session);

      // タイムアウトタイマーをリセット
      this.setSessionTimeout(targetSessionId);

      this.emit(SessionManagerEvents.TASK_ADDED, { sessionId: targetSessionId, task });

    } catch (error) {
      throw new RenkeiError(
        'Failed to add task to session',
        'TASK_ADD_ERROR',
        ErrorSeverity.ERROR,
        error
      );
    }
  }

  /**
   * セッションコンテキストを更新
   */
  async updateContext(contextUpdate: Partial<SessionContext>, sessionId?: string): Promise<void> {
    try {
      const targetSessionId = sessionId || this.currentSession?.sessionId;
      if (!targetSessionId) {
        throw new RenkeiError(
          'No active session to update context',
          'NO_ACTIVE_SESSION',
          ErrorSeverity.ERROR
        );
      }

      const session = this.activeSessions.get(targetSessionId);
      if (!session) {
        throw new RenkeiError(
          `Session ${targetSessionId} not found`,
          'SESSION_NOT_FOUND',
          ErrorSeverity.ERROR
        );
      }

      // コンテキストを更新
      session.context = {
        ...session.context,
        ...contextUpdate
      };
      session.lastActivity = new Date();

      // セッションを保存
      await this.persistence.saveSession(session);

      // タイムアウトタイマーをリセット
      this.setSessionTimeout(targetSessionId);

      this.emit(SessionManagerEvents.CONTEXT_UPDATED, { sessionId: targetSessionId, context: session.context });

    } catch (error) {
      throw new RenkeiError(
        'Failed to update session context',
        'CONTEXT_UPDATE_ERROR',
        ErrorSeverity.ERROR,
        error
      );
    }
  }

  /**
   * セッションを一時停止
   */
  async pauseSession(sessionId?: string): Promise<void> {
    try {
      const targetSessionId = sessionId || this.currentSession?.sessionId;
      if (!targetSessionId) {
        throw new RenkeiError(
          'No active session to pause',
          'NO_ACTIVE_SESSION',
          ErrorSeverity.ERROR
        );
      }

      const session = this.activeSessions.get(targetSessionId);
      if (!session) {
        throw new RenkeiError(
          `Session ${targetSessionId} not found`,
          'SESSION_NOT_FOUND',
          ErrorSeverity.ERROR
        );
      }

      // セッション状態を一時停止に変更
      session.status = 'paused';
      session.lastActivity = new Date();

      // セッションを保存
      await this.persistence.saveSession(session);

      // タイムアウトタイマーをクリア
      this.clearSessionTimeout(targetSessionId);

      this.emit(SessionManagerEvents.SESSION_PAUSED, { sessionId: targetSessionId });

    } catch (error) {
      throw new RenkeiError(
        'Failed to pause session',
        'SESSION_PAUSE_ERROR',
        ErrorSeverity.ERROR,
        error
      );
    }
  }

  /**
   * セッションを再開
   */
  async resumeSession(sessionId: string): Promise<void> {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        // バックアップから復元を試行
        const backups = await this.persistence.getAvailableBackups();
        const targetBackup = backups.find(backup => backup.sessionId === sessionId);
        
        if (targetBackup) {
          const restoredSession = await this.persistence.restoreFromBackup(targetBackup.filename);
          this.activeSessions.set(sessionId, restoredSession);
          this.currentSession = restoredSession;
        } else {
          throw new RenkeiError(
            `Session ${sessionId} not found`,
            'SESSION_NOT_FOUND',
            ErrorSeverity.ERROR
          );
        }
      }

      const targetSession = this.activeSessions.get(sessionId)!;
      
      // セッション状態をアクティブに変更
      targetSession.status = 'active';
      targetSession.lastActivity = new Date();
      this.currentSession = targetSession;

      // セッションを保存
      await this.persistence.saveSession(targetSession);

      // タイムアウトタイマーを設定
      this.setSessionTimeout(sessionId);

      this.emit(SessionManagerEvents.SESSION_RESUMED, { sessionId });

    } catch (error) {
      throw new RenkeiError(
        'Failed to resume session',
        'SESSION_RESUME_ERROR',
        ErrorSeverity.ERROR,
        error
      );
    }
  }

  /**
   * セッションを完了
   */
  async completeSession(sessionId?: string): Promise<void> {
    try {
      const targetSessionId = sessionId || this.currentSession?.sessionId;
      if (!targetSessionId) {
        throw new RenkeiError(
          'No active session to complete',
          'NO_ACTIVE_SESSION',
          ErrorSeverity.ERROR
        );
      }

      const session = this.activeSessions.get(targetSessionId);
      if (!session) {
        throw new RenkeiError(
          `Session ${targetSessionId} not found`,
          'SESSION_NOT_FOUND',
          ErrorSeverity.ERROR
        );
      }

      // セッション状態を完了に変更
      session.status = 'completed';
      session.lastActivity = new Date();

      // セッションを保存
      await this.persistence.saveSession(session);

      // セッションをアクティブリストから削除
      this.activeSessions.delete(targetSessionId);
      if (this.currentSession?.sessionId === targetSessionId) {
        this.currentSession = null;
      }

      // タイムアウトタイマーをクリア
      this.clearSessionTimeout(targetSessionId);

      this.emit(SessionManagerEvents.SESSION_COMPLETED, { sessionId: targetSessionId });

    } catch (error) {
      throw new RenkeiError(
        'Failed to complete session',
        'SESSION_COMPLETE_ERROR',
        ErrorSeverity.ERROR,
        error
      );
    }
  }

  /**
   * セッション履歴を取得
   */
  async getSessionHistory(): Promise<SessionHistoryEntry[]> {
    try {
      return await this.persistence.getSessionHistory();
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
   * 利用可能なバックアップを取得
   */
  async getAvailableBackups(): Promise<Array<{ filename: string; timestamp: Date; sessionId: string }>> {
    try {
      return await this.persistence.getAvailableBackups();
    } catch (error) {
      throw new RenkeiError(
        'Failed to get available backups',
        'BACKUP_LIST_ERROR',
        ErrorSeverity.WARNING,
        error
      );
    }
  }

  /**
   * バックアップからセッションを復元
   */
  async restoreFromBackup(backupFileName: string): Promise<string> {
    try {
      const restoredSession = await this.persistence.restoreFromBackup(backupFileName);
      
      // セッションをアクティブに設定
      restoredSession.status = 'active';
      restoredSession.lastActivity = new Date();
      
      this.activeSessions.set(restoredSession.sessionId, restoredSession);
      this.currentSession = restoredSession;

      // タイムアウトタイマーを設定
      this.setSessionTimeout(restoredSession.sessionId);

      this.emit(SessionManagerEvents.SESSION_RESTORED, { sessionId: restoredSession.sessionId });
      
      return restoredSession.sessionId;

    } catch (error) {
      throw new RenkeiError(
        'Failed to restore session from backup',
        'SESSION_RESTORE_ERROR',
        ErrorSeverity.ERROR,
        error
      );
    }
  }

  /**
   * セッション管理を終了
   */
  async shutdown(): Promise<void> {
    try {
      // 自動保存を停止
      this.stopAutoSave();

      // すべてのタイムアウトタイマーをクリア
      for (const sessionId of this.timeoutTimers.keys()) {
        this.clearSessionTimeout(sessionId);
      }

      // アクティブなセッションを保存
      for (const session of this.activeSessions.values()) {
        if (session.status === 'active') {
          session.status = 'paused';
          await this.persistence.saveSession(session);
        }
      }

      // メモリをクリア
      this.activeSessions.clear();
      this.currentSession = null;

    } catch (error) {
      throw new RenkeiError(
        'Failed to shutdown session manager',
        'SESSION_MANAGER_SHUTDOWN_ERROR',
        ErrorSeverity.WARNING,
        error
      );
    }
  }

  /**
   * 既存セッションの復元を試行
   */
  private async attemptSessionRestore(): Promise<void> {
    try {
      const existingSession = await this.persistence.restoreSession();
      if (existingSession && existingSession.status === 'active') {
        // セッションを復元
        this.activeSessions.set(existingSession.sessionId, existingSession);
        this.currentSession = existingSession;
        
        // タイムアウトタイマーを設定
        this.setSessionTimeout(existingSession.sessionId);
      }
    } catch (error) {
      // セッション復元の失敗は警告レベル
      this.emit(SessionManagerEvents.ERROR, new RenkeiError(
        'Failed to restore existing session',
        'SESSION_RESTORE_WARNING',
        ErrorSeverity.WARNING,
        error
      ));
    }
  }

  /**
   * 自動保存を開始
   */
  private startAutoSave(): void {
    this.autoSaveTimer = setInterval(async () => {
      try {
        if (this.currentSession) {
          await this.persistence.saveSession(this.currentSession);
          this.emit(SessionManagerEvents.AUTO_SAVE, { sessionId: this.currentSession.sessionId });
        }
      } catch (error) {
        this.emit(SessionManagerEvents.ERROR, new RenkeiError(
          'Auto-save failed',
          'AUTO_SAVE_ERROR',
          ErrorSeverity.WARNING,
          error
        ));
      }
    }, this.config.autoSaveInterval);
  }

  /**
   * 自動保存を停止
   */
  private stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * セッションタイムアウトタイマーを設定
   */
  private setSessionTimeout(sessionId: string): void {
    // 既存のタイマーをクリア
    this.clearSessionTimeout(sessionId);

    // 新しいタイマーを設定
    const timer = setTimeout(async () => {
      try {
        const session = this.activeSessions.get(sessionId);
        if (session && session.status === 'active') {
          session.status = 'paused';
          await this.persistence.saveSession(session);
          this.emit(SessionManagerEvents.SESSION_TIMEOUT, { sessionId });
        }
      } catch (error) {
        this.emit(SessionManagerEvents.ERROR, new RenkeiError(
          'Session timeout handling failed',
          'SESSION_TIMEOUT_ERROR',
          ErrorSeverity.WARNING,
          error
        ));
      }
    }, this.config.sessionTimeout);

    this.timeoutTimers.set(sessionId, timer);
  }

  /**
   * セッションタイムアウトタイマーをクリア
   */
  private clearSessionTimeout(sessionId: string): void {
    const timer = this.timeoutTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.timeoutTimers.delete(sessionId);
    }
  }
}

/**
 * デフォルトのセッション管理設定
 */
export const defaultSessionManagerConfig: SessionManagerConfig = {
  persistence: defaultPersistenceConfig,
  autoSaveInterval: 30000, // 30秒
  maxConcurrentSessions: 5,
  sessionTimeout: 3600000, // 1時間
  contextRetentionSize: 100
};
