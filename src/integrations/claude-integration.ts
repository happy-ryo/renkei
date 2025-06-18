/**
 * ClaudeCode統合機能
 * ClaudeCode APIとの通信・制御を担当する統合レイヤー
 */

import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import {
  ClaudeSession,
  ClaudeTaskExecution,
  ClaudeControllerConfig,
  ClaudeQueryOptions,
  ClaudeHandlers,
  ClaudeCodeSettings,
  ClaudeCodeError,
  ClaudeErrorCode,
  SDKMessage,
  SDKResult,
  SDKError,
  SDKProgress,
} from '../interfaces/claude-types';

/**
 * ClaudeCode APIラッパークラス
 * ClaudeCode SDKとの統合とセッション管理を担当
 */
export class ClaudeIntegration extends EventEmitter {
  private sessions: Map<string, ClaudeSession> = new Map();
  private activeTasks: Map<string, ClaudeTaskExecution> = new Map();
  private config: ClaudeControllerConfig;
  private claudeProcess: ChildProcess | null = null;
  private isInitialized = false;

  constructor(config: ClaudeControllerConfig) {
    super();
    const defaultConfig: ClaudeControllerConfig = {
      maxRetries: 3,
      retryDelay: 1000,
      timeout: 30000,
      defaultOptions: {
        maxTurns: 10,
        autoApprove: false,
        allowedTools: ['read_file', 'write_to_file', 'execute_command'],
        outputFormat: 'text',
        timeout: 30000,
      },
    };
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * ClaudeCode統合システムの初期化
   */
  async initialize(): Promise<void> {
    try {
      // ClaudeCodeが利用可能かチェック
      await this.checkClaudeCodeAvailability();

      // 設定ファイルの準備
      await this.prepareSettingsFile();

      this.isInitialized = true;
      this.emit('initialized');
    } catch (error) {
      throw new ClaudeCodeError(
        ClaudeErrorCode.INTERNAL_ERROR,
        'ClaudeCode統合の初期化に失敗しました',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * ClaudeCodeが利用可能かチェック
   */
  private async checkClaudeCodeAvailability(): Promise<void> {
    return new Promise((resolve, reject) => {
      const process = spawn('claude', ['--version'], { stdio: 'pipe' });

      let stderr = '';
      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new ClaudeCodeError(
              ClaudeErrorCode.API_ERROR,
              'ClaudeCodeが見つからないか、実行できません',
              stderr
            )
          );
        }
      });

      process.on('error', (_error) => {
        reject(
          new ClaudeCodeError(
            ClaudeErrorCode.NETWORK_ERROR,
            'ClaudeCodeプロセスの起動に失敗しました'
          )
        );
      });
    });
  }

  /**
   * ClaudeCode設定ファイルの準備
   */
  private async prepareSettingsFile(): Promise<void> {
    const workspaceDir = process.cwd();
    const settingsPath = path.join(workspaceDir, 'workspace', 'settings.json');

    try {
      // ワークスペースディレクトリを作成
      await fs.mkdir(path.dirname(settingsPath), { recursive: true });

      // デフォルト設定を生成
      const defaultSettings: ClaudeCodeSettings = {
        permissions: {
          allow: ['*'],
          deny: ['rm -rf', 'sudo', 'chmod +x'],
        },
        autoApprove: false,
        workspaceRestrictions: {
          allowedDirectories: [workspaceDir],
          forbiddenDirectories: ['/etc', '/var', '/sys'],
          maxFileSize: 10 * 1024 * 1024, // 10MB
        },
        executionLimits: {
          maxExecutionTime: 300000, // 5分
          maxMemoryUsage: 512 * 1024 * 1024, // 512MB
          maxApiCalls: 100,
        },
        security: {
          dangerousCommands: ['rm -rf', 'sudo', 'chmod', 'chown'],
          requireConfirmation: ['npm install', 'git clone'],
          logAllCommands: true,
        },
      };

      // 設定ファイルが存在しない場合は作成
      try {
        await fs.access(settingsPath);
      } catch {
        await fs.writeFile(
          settingsPath,
          JSON.stringify(defaultSettings, null, 2),
          'utf8'
        );
      }
    } catch (error) {
      throw new ClaudeCodeError(
        ClaudeErrorCode.INTERNAL_ERROR,
        '設定ファイルの準備に失敗しました',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * 新しいClaudeCodeセッションを作成
   */
  async createSession(workingDirectory?: string): Promise<string> {
    this.ensureInitialized();

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const session: ClaudeSession = {
      sessionId,
      status: 'active',
      startTime: new Date(),
      lastActivity: new Date(),
      messages: [],
      context: {
        workingDirectory: workingDirectory || process.cwd(),
        files: [],
        variables: {},
        history: [],
      },
    };

    this.sessions.set(sessionId, session);
    this.emit('session_created', { sessionId, session });

    return sessionId;
  }

  /**
   * セッションを終了
   */
  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new ClaudeCodeError(
        ClaudeErrorCode.SESSION_NOT_FOUND,
        `セッション ${sessionId} が見つかりません`
      );
    }

    // セッションに関連するタスクをキャンセル
    for (const [taskId, task] of this.activeTasks) {
      if (task.sessionId === sessionId) {
        await this.cancelTask(taskId);
      }
    }

    session.status = 'completed';
    this.sessions.delete(sessionId);
    this.emit('session_destroyed', { sessionId });
  }

  /**
   * ClaudeCodeタスクを実行
   */
  async executeTask(
    sessionId: string,
    query: ClaudeQueryOptions,
    handlers?: ClaudeHandlers
  ): Promise<string> {
    this.ensureInitialized();

    const session = this.getSession(sessionId);
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const task: ClaudeTaskExecution = {
      taskId,
      sessionId,
      prompt: query.prompt,
      options: { ...this.config.defaultOptions, ...query.options },
      startTime: new Date(),
      status: 'pending',
      messages: [],
    };

    this.activeTasks.set(taskId, task);

    try {
      // タスク開始イベント
      this.emit('task_start', { taskId, sessionId, query });

      // ClaudeCodeプロセスを起動
      const result = await this.runClaudeCodeProcess(task, handlers);

      // タスク完了
      task.status = 'completed';
      task.result = result;
      session.lastActivity = new Date();

      this.emit('task_complete', { taskId, result });

      return taskId;
    } catch (error) {
      task.status = 'failed';
      if (error instanceof ClaudeCodeError) {
        task.error = {
          type: 'error',
          code: error.code,
          message: error.message,
          details: error.details || '',
          recoverable: error.recoverable,
          timestamp: new Date(),
        };
      } else {
        task.error = {
          type: 'error',
          code: ClaudeErrorCode.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : String(error),
          details: '',
          recoverable: false,
          timestamp: new Date(),
        };
      }

      this.emit('task_error', { taskId, error: task.error });
      throw error;
    } finally {
      this.activeTasks.delete(taskId);
    }
  }

  /**
   * ClaudeCodeプロセスを実行
   */
  private async runClaudeCodeProcess(
    task: ClaudeTaskExecution,
    handlers?: ClaudeHandlers
  ): Promise<SDKResult> {
    const session = this.getSession(task.sessionId);

    return new Promise((resolve, reject) => {
      const args = this.buildClaudeCodeArgs(task);

      this.claudeProcess = spawn('claude', args, {
        cwd: session.context.workingDirectory,
        stdio: 'pipe',
      });

      let stdout = '';
      let stderr = '';
      const messages: SDKMessage[] = [];

      // stdout処理
      this.claudeProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        stdout += output;

        // メッセージを解析
        try {
          const lines = output
            .split('\n')
            .filter((line: string) => line.trim());
          for (const line of lines) {
            if (line.startsWith('{')) {
              const message = JSON.parse(line) as SDKMessage;
              messages.push(message);
              task.messages.push(message);

              this.handleSDKMessage(message, handlers);
            }
          }
        } catch {
          // JSON解析エラーは無視（通常の出力として扱う）
        }
      });

      // stderr処理
      this.claudeProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // プロセス終了処理
      this.claudeProcess.on('close', (code) => {
        if (code === 0) {
          // 成功時の結果を構築
          const result: SDKResult = {
            type: 'result',
            subtype: 'success',
            sessionId: task.sessionId,
            output: stdout,
            timestamp: new Date(),
          };
          resolve(result);
        } else {
          reject(
            new ClaudeCodeError(
              ClaudeErrorCode.API_ERROR,
              `ClaudeCodeプロセスがエラーで終了しました (code: ${code})`,
              stderr
            )
          );
        }
      });

      // プロセスエラー処理
      this.claudeProcess.on('error', (_error) => {
        reject(
          new ClaudeCodeError(
            ClaudeErrorCode.NETWORK_ERROR,
            'ClaudeCodeプロセスでエラーが発生しました'
          )
        );
      });

      // タスクのプロンプトを送信
      this.claudeProcess.stdin?.write(task.prompt + '\n');
      this.claudeProcess.stdin?.end();

      // タイムアウト処理
      setTimeout(() => {
        if (this.claudeProcess && !this.claudeProcess.killed) {
          this.claudeProcess.kill();
          reject(
            new ClaudeCodeError(
              ClaudeErrorCode.TIMEOUT,
              'ClaudeCodeタスクがタイムアウトしました',
              `タイムアウト時間: ${task.options.timeout}ms`
            )
          );
        }
      }, task.options.timeout || this.config.timeout);
    });
  }

  /**
   * ClaudeCodeのコマンドライン引数を構築
   */
  private buildClaudeCodeArgs(task: ClaudeTaskExecution): string[] {
    const args: string[] = [];

    // 基本オプション
    args.push('--non-interactive');

    if (task.options.outputFormat) {
      args.push(`--output-format=${task.options.outputFormat}`);
    }

    if (task.options.maxTurns) {
      args.push(`--max-turns=${task.options.maxTurns}`);
    }

    if (task.options.autoApprove) {
      args.push('--auto-approve');
    }

    if (task.options.allowedTools) {
      args.push(`--allowed-tools=${task.options.allowedTools.join(',')}`);
    }

    if (task.options.workingDirectory) {
      args.push(`--working-directory=${task.options.workingDirectory}`);
    }

    return args;
  }

  /**
   * SDKメッセージを処理
   */
  private handleSDKMessage(
    message: SDKMessage,
    handlers?: ClaudeHandlers
  ): void {
    // 基本ハンドラー
    if (handlers?.onMessage) {
      handlers.onMessage(message);
    }

    // タイプ別ハンドラー
    switch (message.type) {
      case 'progress':
        if (handlers?.onProgress) {
          handlers.onProgress(message as SDKProgress);
        }
        this.emit('progress', message);
        break;

      case 'error':
        if (handlers?.onError) {
          handlers.onError(message as SDKError);
        }
        this.emit('error', message);
        break;

      case 'result':
        if (handlers?.onComplete) {
          handlers.onComplete(message as SDKResult);
        }
        this.emit('result', message);
        break;

      case 'input_request':
        this.emit('input_request', message);
        break;
    }
  }

  /**
   * タスクをキャンセル
   */
  async cancelTask(taskId: string): Promise<void> {
    const task = this.activeTasks.get(taskId);
    if (!task) {
      throw new ClaudeCodeError(
        ClaudeErrorCode.INVALID_REQUEST,
        `タスク ${taskId} が見つかりません`
      );
    }

    if (this.claudeProcess && !this.claudeProcess.killed) {
      this.claudeProcess.kill();
    }

    task.status = 'cancelled';
    this.activeTasks.delete(taskId);
    this.emit('task_cancelled', { taskId });
  }

  /**
   * セッション情報を取得
   */
  getSession(sessionId: string): ClaudeSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new ClaudeCodeError(
        ClaudeErrorCode.SESSION_NOT_FOUND,
        `セッション ${sessionId} が見つかりません`
      );
    }
    return session;
  }

  /**
   * アクティブなタスク一覧を取得
   */
  getActiveTasks(): ClaudeTaskExecution[] {
    return Array.from(this.activeTasks.values());
  }

  /**
   * セッション一覧を取得
   */
  getSessions(): ClaudeSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * 初期化状態をチェック
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new ClaudeCodeError(
        ClaudeErrorCode.INTERNAL_ERROR,
        'ClaudeCode統合が初期化されていません。initialize()を先に呼び出してください'
      );
    }
  }

  /**
   * メッセージを送信（AIManager用の簡易インターフェース）
   */
  async sendMessage(
    prompt: string,
    sessionId?: string
  ): Promise<{ content: string; duration?: number }> {
    const targetSessionId = sessionId || (await this.createSession());

    const startTime = Date.now();
    const taskId = await this.executeTask(targetSessionId, {
      prompt,
      options: {
        maxTurns: 1,
        autoApprove: true,
        outputFormat: 'text',
      },
    });

    // タスク結果を取得
    const task = this.activeTasks.get(taskId);
    const duration = Date.now() - startTime;

    if (task?.result) {
      return {
        content: task.result.output || '',
        duration,
      };
    } else {
      return {
        content: '',
        duration,
      };
    }
  }

  /**
   * 現在の実行を停止（AIManager用）
   */
  async stopCurrentExecution(): Promise<void> {
    if (this.claudeProcess && !this.claudeProcess.killed) {
      this.claudeProcess.kill();
    }

    // 全てのアクティブタスクをキャンセル
    for (const taskId of this.activeTasks.keys()) {
      await this.cancelTask(taskId);
    }
  }

  /**
   * リソースのクリーンアップ
   */
  async cleanup(): Promise<void> {
    // 全セッションを終了
    for (const sessionId of this.sessions.keys()) {
      try {
        await this.destroySession(sessionId);
      } catch (error) {
        console.warn(`セッション ${sessionId} の終了に失敗:`, error);
      }
    }

    // プロセスを終了
    if (this.claudeProcess && !this.claudeProcess.killed) {
      this.claudeProcess.kill();
    }

    this.isInitialized = false;
    this.emit('cleanup_complete');
  }
}

/**
 * ClaudeCode統合のファクトリー関数
 */
export function createClaudeIntegration(
  config?: Partial<ClaudeControllerConfig>
): ClaudeIntegration {
  const defaultConfig: ClaudeControllerConfig = {
    maxRetries: 3,
    retryDelay: 1000,
    timeout: 30000,
    defaultOptions: {
      maxTurns: 10,
      autoApprove: false,
      allowedTools: ['read_file', 'write_to_file', 'execute_command'],
      outputFormat: 'text',
      timeout: 30000,
    },
  };

  return new ClaudeIntegration({ ...defaultConfig, ...config });
}
