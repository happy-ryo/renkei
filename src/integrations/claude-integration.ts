/**
 * ClaudeCode統合機能
 * ClaudeCode APIとの通信・制御を担当する統合レイヤー
 */

import { EventEmitter } from 'events';
import { spawn, ChildProcess, execSync } from 'child_process';
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
  private claudeExecutablePath: string | null = null;

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
    if (this.isInitialized) {
      return;
    }

    try {
      // ClaudeCodeが利用可能かチェック
      await this.checkClaudeCodeAvailability();

      // 設定ファイルの準備
      await this.prepareSettingsFile();

      this.isInitialized = true;
      this.emit('initialized');
    } catch (error) {
      console.error('ClaudeCode初期化エラー:', error);
      // エラーを上位に伝播して、問題を明確にする
      throw new ClaudeCodeError(
        ClaudeErrorCode.INTERNAL_ERROR,
        'ClaudeCode統合の初期化に失敗しました',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Claude実行ファイルのパスを取得
   */
  private async findClaudeExecutable(): Promise<string> {
    // 1. 設定ファイルからパスを確認
    const configPath = (this.config as any).executablePath;
    if (configPath && (await this.isExecutable(configPath))) {
      console.log(`Claude found from config: ${configPath}`);
      return configPath;
    }

    // 2. PATHから検索
    try {
      const whichResult = execSync('which claude', { encoding: 'utf8' }).trim();
      if (whichResult && (await this.isExecutable(whichResult))) {
        console.log(`Claude found in PATH: ${whichResult}`);
        return whichResult;
      }
    } catch {
      // whichコマンドが失敗
    }

    // 3. 一般的なパスを試す
    const commonPaths = [
      '/home/happy_ryo/.volta/tools/image/node/22.5.1/bin/claude', // 確実に存在するパス
      '/home/happy_ryo/.volta/bin/claude',
      `${process.env['HOME']}/.volta/bin/claude`,
      '/usr/local/bin/claude',
      '/usr/bin/claude',
      `${process.env['HOME']}/.local/bin/claude`,
      `${process.env['HOME']}/bin/claude`,
    ];

    for (const path of commonPaths) {
      if (await this.isExecutable(path)) {
        console.log(`Claude found at: ${path}`);
        return path;
      }
    }

    throw new ClaudeCodeError(
      ClaudeErrorCode.API_ERROR,
      'Claudeコマンドが見つかりません。executablePathを設定してください'
    );
  }

  /**
   * ファイルが実行可能かチェック
   */
  private async isExecutable(path: string): Promise<boolean> {
    try {
      await fs.access(path, fs.constants.F_OK); // まず存在確認
      await fs.access(path, fs.constants.X_OK); // 実行権限確認
      return true;
    } catch (error) {
      console.log(`Path ${path} is not accessible:`, error);
      return false;
    }
  }

  /**
   * ClaudeCodeが利用可能かチェック
   */
  private async checkClaudeCodeAvailability(): Promise<void> {
    // Claude実行ファイルを検索
    this.claudeExecutablePath = await this.findClaudeExecutable();

    console.log(
      `Checking Claude availability at: ${this.claudeExecutablePath}`
    );

    return new Promise((resolve, reject) => {
      const claudeProcess = spawn(this.claudeExecutablePath!, ['--version'], {
        stdio: 'pipe',
        env: { ...process.env }, // 環境変数を継承
      });

      let stdout = '';
      let stderr = '';

      claudeProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      claudeProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      claudeProcess.on('close', (code) => {
        if (code === 0) {
          console.log('Claude version:', stdout.trim());
          resolve();
        } else {
          console.error(`Claude version check failed with code ${code}`);
          console.error('stdout:', stdout);
          console.error('stderr:', stderr);
          reject(
            new ClaudeCodeError(
              ClaudeErrorCode.API_ERROR,
              `ClaudeCodeが見つからないか、実行できません (exit code: ${code})`,
              `stdout: ${stdout}\nstderr: ${stderr}`
            )
          );
        }
      });

      claudeProcess.on('error', (error) => {
        console.error('Failed to spawn Claude process:', error);
        reject(
          new ClaudeCodeError(
            ClaudeErrorCode.NETWORK_ERROR,
            `ClaudeCodeプロセスの起動に失敗しました: ${error.message}`,
            error.stack || error.message
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
    _sessionId?: string
  ): Promise<{ content: string; duration?: number }> {
    this.ensureInitialized();

    const startTime = Date.now();

    // モックモードは使わない - 常に実際のClaudeを使う

    return new Promise((resolve, reject) => {
      // プロンプトは標準入力から渡す
      const args = ['--print', '--output-format', 'text'];
      let output = '';
      let errorOutput = '';

      // 保存されたclaudeパスを使用
      const claudePath = this.claudeExecutablePath || 'claude';

      console.log(
        `Executing Claude: ${claudePath} --print --output-format text`
      );

      const claudeProcess = spawn(claudePath, args, {
        cwd: process.cwd(),
        env: { ...process.env },
      });

      claudeProcess.stdout?.on('data', (data) => {
        output += data.toString();
      });

      claudeProcess.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });

      claudeProcess.on('close', (code) => {
        const duration = Date.now() - startTime;
        console.log(
          `Claude process exited with code ${code}, duration: ${duration}ms`
        );

        if (code === 0) {
          resolve({
            content: output.trim(),
            duration,
          });
        } else {
          // エラーが発生した場合は、AI Managerのモックモードにフォールバック
          reject(
            new ClaudeCodeError(
              ClaudeErrorCode.API_ERROR,
              `Claude process exited with code ${code}`,
              errorOutput
            )
          );
        }
      });

      claudeProcess.on('error', (error) => {
        console.error(`Failed to spawn Claude process: ${error.message}`);
        reject(
          new ClaudeCodeError(
            ClaudeErrorCode.NETWORK_ERROR,
            'Failed to spawn Claude process',
            error.message
          )
        );
      });

      // タイムアウト処理を追加
      const timeout = setTimeout(() => {
        if (!claudeProcess.killed) {
          console.error('Claude process timeout after 60 seconds');
          claudeProcess.kill();
          reject(
            new ClaudeCodeError(
              ClaudeErrorCode.TIMEOUT,
              'Claude process timeout',
              'Process did not complete within 60 seconds'
            )
          );
        }
      }, 60000); // 60秒に延長

      // プロセスが終了したらタイムアウトをクリア
      claudeProcess.on('exit', () => {
        clearTimeout(timeout);
      });
      
      // プロンプトを標準入力に送信
      if (claudeProcess.stdin) {
        claudeProcess.stdin.write(prompt);
        claudeProcess.stdin.end();
      }
    });
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
