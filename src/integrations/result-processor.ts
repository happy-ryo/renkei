/**
 * ClaudeCode実行結果処理機能
 * ファイル変更検出・ログ解析・メトリクス収集を担当
 */

import path from 'path';
import fs from 'fs/promises';
import { EventEmitter } from 'events';
import { watch, FSWatcher } from 'chokidar';
import {
  SDKResult,
  SDKFileChange,
  ClaudeCodeError,
  ClaudeErrorCode,
} from '../interfaces/claude-types.js';
import { TaskMetrics, FileChange } from '../interfaces/types.js';

/**
 * ファイル変更検出結果
 */
export interface FileChangeDetection {
  sessionId: string;
  changes: FileChange[];
  timestamp: Date;
  summary: {
    created: number;
    modified: number;
    deleted: number;
    totalSize: number;
  };
}

/**
 * ログ解析結果
 */
export interface LogAnalysis {
  sessionId: string;
  commands: Array<{
    command: string;
    timestamp: Date;
    exitCode?: number;
    duration?: number;
  }>;
  errors: Array<{
    message: string;
    timestamp: Date;
    severity: 'warning' | 'error' | 'critical';
  }>;
  summary: {
    totalCommands: number;
    successfulCommands: number;
    failedCommands: number;
    totalErrors: number;
  };
}

/**
 * メトリクス収集結果
 */
export interface MetricsCollection {
  sessionId: string;
  taskId?: string;
  metrics: TaskMetrics;
  resourceUsage: {
    memoryUsage?: number;
    cpuUsage?: number;
    diskUsage?: number;
  };
  performance: {
    responseTime: number;
    throughput: number;
    errorRate: number;
  };
  timestamp: Date;
}

/**
 * ClaudeCode実行結果処理クラス
 */
export class ResultProcessor extends EventEmitter {
  private watchers: Map<string, FSWatcher> = new Map();
  private sessionLogs: Map<string, string[]> = new Map();
  private sessionMetrics: Map<string, MetricsCollection> = new Map();
  private isInitialized = false;

  constructor() {
    super();
  }

  /**
   * 結果処理システムの初期化
   */
  async initialize(): Promise<void> {
    try {
      this.isInitialized = true;
      this.emit('initialized');
    } catch (error) {
      throw new ClaudeCodeError(
        ClaudeErrorCode.INTERNAL_ERROR,
        '結果処理システムの初期化に失敗しました',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * セッションのファイル変更監視を開始
   */
  async startFileWatching(
    sessionId: string,
    watchDirectory: string,
    ignoredPaths?: string[]
  ): Promise<void> {
    this.ensureInitialized();

    // 既存のウォッチャーがあれば停止
    await this.stopFileWatching(sessionId);

    const defaultIgnored = [
      '**/.git/**',
      '**/node_modules/**',
      '**/.DS_Store',
      '**/Thumbs.db',
      '**/*.tmp',
      '**/*.temp',
      '**/workspace/logs/**',
      ...(ignoredPaths || []),
    ];

    const watcher = watch(watchDirectory, {
      ignored: defaultIgnored,
      persistent: true,
      ignoreInitial: true,
      usePolling: false,
      depth: 10,
    });

    const changes: FileChange[] = [];
    let changeTimeout: ReturnType<typeof setTimeout> | null = null;

    // ファイル変更イベントのハンドリング
    const handleChange = (
      eventType: 'created' | 'modified' | 'deleted',
      filePath: string
    ) => {
      changes.push({
        path: path.relative(watchDirectory, filePath),
        action: eventType,
        size: 0, // 後で取得
      });

      // デバウンス処理（500ms後に変更をまとめて処理）
      if (changeTimeout) {
        clearTimeout(changeTimeout);
      }
      changeTimeout = setTimeout(async () => {
        await this.processFileChanges(
          sessionId,
          changes.splice(0),
          watchDirectory
        );
      }, 500);
    };

    watcher
      .on('add', (filePath) => handleChange('created', filePath))
      .on('change', (filePath) => handleChange('modified', filePath))
      .on('unlink', (filePath) => handleChange('deleted', filePath))
      .on('error', () => {
        this.emit('file_watch_error', {
          sessionId,
          error: 'File watching error occurred',
        });
      });

    this.watchers.set(sessionId, watcher);
    this.emit('file_watching_started', {
      sessionId,
      directory: watchDirectory,
    });
  }

  /**
   * セッションのファイル変更監視を停止
   */
  async stopFileWatching(sessionId: string): Promise<void> {
    const watcher = this.watchers.get(sessionId);
    if (watcher) {
      await watcher.close();
      this.watchers.delete(sessionId);
      this.emit('file_watching_stopped', { sessionId });
    }
  }

  /**
   * ファイル変更の処理
   */
  private async processFileChanges(
    sessionId: string,
    changes: FileChange[],
    baseDirectory: string
  ): Promise<void> {
    if (changes.length === 0) return;

    // ファイルサイズを取得
    for (const change of changes) {
      if (change.action !== 'deleted') {
        try {
          const fullPath = path.join(baseDirectory, change.path);
          const stats = await fs.stat(fullPath);
          change.size = stats.size;
        } catch {
          // ファイルが既に削除されている場合などは無視
          change.size = 0;
        }
      }
    }

    const detection: FileChangeDetection = {
      sessionId,
      changes,
      timestamp: new Date(),
      summary: {
        created: changes.filter((c) => c.action === 'created').length,
        modified: changes.filter((c) => c.action === 'modified').length,
        deleted: changes.filter((c) => c.action === 'deleted').length,
        totalSize: changes.reduce((sum, c) => sum + (c.size || 0), 0),
      },
    };

    this.emit('file_changes_detected', detection);
  }

  /**
   * 実行ログの解析
   */
  async analyzeExecutionLogs(
    sessionId: string,
    logs: string[],
    options?: {
      parseCommands?: boolean;
      detectErrors?: boolean;
      extractTimestamps?: boolean;
    }
  ): Promise<LogAnalysis> {
    this.ensureInitialized();

    const {
      parseCommands = true,
      detectErrors = true,
      extractTimestamps = true,
    } = options || {};

    const commands: LogAnalysis['commands'] = [];
    const errors: LogAnalysis['errors'] = [];

    // ログを保存
    this.sessionLogs.set(sessionId, logs);

    for (const logLine of logs) {
      // コマンド実行の検出
      if (parseCommands) {
        const commandMatch = logLine.match(
          /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z)?\s*\$\s+(.+)$/
        );
        if (commandMatch && commandMatch[2]) {
          const [, timestampStr, command] = commandMatch;
          commands.push({
            command: command.trim(),
            timestamp: timestampStr ? new Date(timestampStr) : new Date(),
          });
        }

        // 終了コードの検出
        const exitCodeMatch = logLine.match(
          /Command\s+.+\s+exited\s+with\s+code\s+(\d+)/
        );
        if (exitCodeMatch && exitCodeMatch[1] && commands.length > 0) {
          const lastCommand = commands[commands.length - 1];
          if (lastCommand) {
            lastCommand.exitCode = parseInt(exitCodeMatch[1], 10);
          }
        }
      }

      // エラーの検出
      if (detectErrors) {
        const errorPatterns = [
          { pattern: /error|ERROR/i, severity: 'error' as const },
          { pattern: /warning|WARNING|warn/i, severity: 'warning' as const },
          {
            pattern: /critical|CRITICAL|fatal|FATAL/i,
            severity: 'critical' as const,
          },
        ];

        for (const { pattern, severity } of errorPatterns) {
          if (pattern.test(logLine)) {
            const timestampMatch = extractTimestamps
              ? logLine.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z)/)
              : null;

            errors.push({
              message: logLine.trim(),
              timestamp:
                timestampMatch && timestampMatch[1]
                  ? new Date(timestampMatch[1])
                  : new Date(),
              severity,
            });
            break;
          }
        }
      }
    }

    const analysis: LogAnalysis = {
      sessionId,
      commands,
      errors,
      summary: {
        totalCommands: commands.length,
        successfulCommands: commands.filter(
          (c) => c.exitCode === 0 || c.exitCode === undefined
        ).length,
        failedCommands: commands.filter(
          (c) => c.exitCode !== undefined && c.exitCode !== 0
        ).length,
        totalErrors: errors.length,
      },
    };

    this.emit('log_analysis_complete', analysis);
    return analysis;
  }

  /**
   * メトリクスの収集
   */
  async collectMetrics(
    sessionId: string,
    sdkResult: SDKResult,
    taskId?: string,
    startTime?: Date
  ): Promise<MetricsCollection> {
    this.ensureInitialized();

    const endTime = new Date();
    const executionTime = startTime
      ? endTime.getTime() - startTime.getTime()
      : 0;

    // SDKメトリクスからTaskMetricsに変換
    const taskMetrics: TaskMetrics = {
      executionTime,
      apiCalls: sdkResult.metrics?.apiCalls || 0,
      tokensUsed: sdkResult.metrics?.tokensUsed || 0,
      ...(sdkResult.metrics?.cost !== undefined && {
        cost: sdkResult.metrics.cost,
      }),
    };

    // システムリソース使用量を取得（Node.jsのprocess.memoryUsage()を使用）
    const memoryUsage = process.memoryUsage();
    const resourceUsage = {
      memoryUsage: memoryUsage.heapUsed,
      cpuUsage: process.cpuUsage().user,
      diskUsage: 0, // 実装は簡略化
    };

    // パフォーマンス指標を計算
    const performance = {
      responseTime: executionTime,
      throughput: taskMetrics.tokensUsed / Math.max(executionTime / 1000, 1), // tokens per second
      errorRate: sdkResult.subtype === 'failure' ? 1.0 : 0.0,
    };

    const metricsCollection: MetricsCollection = {
      sessionId,
      ...(taskId && { taskId }),
      metrics: taskMetrics,
      resourceUsage,
      performance,
      timestamp: endTime,
    };

    // セッションメトリクスを保存
    this.sessionMetrics.set(sessionId, metricsCollection);

    this.emit('metrics_collected', metricsCollection);
    return metricsCollection;
  }

  /**
   * SDKResult全体の処理
   */
  async processSDKResult(
    result: SDKResult,
    options?: {
      watchDirectory?: string;
      includeFileChanges?: boolean;
      analyzeLogs?: boolean;
      collectMetrics?: boolean;
      startTime?: Date;
    }
  ): Promise<{
    fileChanges?: FileChangeDetection;
    logAnalysis?: LogAnalysis;
    metrics?: MetricsCollection;
  }> {
    this.ensureInitialized();

    const {
      includeFileChanges = true,
      analyzeLogs = true,
      collectMetrics = true,
      startTime,
    } = options || {};

    const processedResult: {
      fileChanges?: FileChangeDetection;
      logAnalysis?: LogAnalysis;
      metrics?: MetricsCollection;
    } = {};

    // ファイル変更の処理
    if (includeFileChanges && result.files && result.files.length > 0) {
      const changes: FileChange[] = result.files.map(
        (sdkFile: SDKFileChange) => ({
          path: sdkFile.path,
          action: this.mapSDKActionToFileAction(sdkFile.action),
          ...(sdkFile.content && { content: sdkFile.content }),
          ...(sdkFile.size !== undefined && { size: sdkFile.size }),
        })
      );

      processedResult.fileChanges = {
        sessionId: result.sessionId,
        changes,
        timestamp: new Date(),
        summary: {
          created: changes.filter((c) => c.action === 'created').length,
          modified: changes.filter((c) => c.action === 'modified').length,
          deleted: changes.filter((c) => c.action === 'deleted').length,
          totalSize: changes.reduce((sum, c) => sum + (c.size || 0), 0),
        },
      };
    }

    // ログ解析
    if (analyzeLogs && result.output) {
      const logs = result.output.split('\n').filter((line) => line.trim());
      processedResult.logAnalysis = await this.analyzeExecutionLogs(
        result.sessionId,
        logs
      );
    }

    // メトリクス収集
    if (collectMetrics) {
      processedResult.metrics = await this.collectMetrics(
        result.sessionId,
        result,
        undefined,
        startTime
      );
    }

    this.emit('sdk_result_processed', {
      sessionId: result.sessionId,
      result: processedResult,
    });

    return processedResult;
  }

  /**
   * SDKアクションをFileActionにマップ
   */
  private mapSDKActionToFileAction(action: string): FileChange['action'] {
    switch (action) {
      case 'create':
        return 'created';
      case 'modify':
        return 'modified';
      case 'delete':
        return 'deleted';
      case 'read':
        return 'modified'; // 読み取りは変更として扱う
      default:
        return 'modified';
    }
  }

  /**
   * セッションの統計情報を取得
   */
  getSessionStatistics(sessionId: string): {
    logs?: string[];
    metrics?: MetricsCollection;
    totalFileChanges: number;
    totalErrors: number;
  } {
    const logs = this.sessionLogs.get(sessionId);
    const metrics = this.sessionMetrics.get(sessionId);

    return {
      ...(logs && { logs }),
      ...(metrics && { metrics }),
      totalFileChanges: 0, // 実装簡略化
      totalErrors: 0, // 実装簡略化
    };
  }

  /**
   * 初期化状態をチェック
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new ClaudeCodeError(
        ClaudeErrorCode.INTERNAL_ERROR,
        'ResultProcessorが初期化されていません。initialize()を先に呼び出してください'
      );
    }
  }

  /**
   * リソースのクリーンアップ
   */
  async cleanup(): Promise<void> {
    // 全てのファイルウォッチャーを停止
    for (const [sessionId] of this.watchers) {
      await this.stopFileWatching(sessionId);
    }

    // データをクリア
    this.sessionLogs.clear();
    this.sessionMetrics.clear();

    this.isInitialized = false;
    this.removeAllListeners();
    this.emit('cleanup_complete');
  }
}

/**
 * ResultProcessorのファクトリー関数
 */
export function createResultProcessor(): ResultProcessor {
  return new ResultProcessor();
}
