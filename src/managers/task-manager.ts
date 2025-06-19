/**
 * Task Manager - タスク実行・評価システムの中核
 *
 * AI管理者からのタスクを受け取り、実行制御、監視、評価を行う
 * 継続判断システムと連携してタスクの完了まで自動管理します。
 */

import { EventEmitter } from 'events';
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  QualityEvaluator,
  EvaluationResult,
  createQualityEvaluator,
} from '../evaluators/quality-evaluator';
import { ClaudeIntegration } from '../integrations/claude-integration';
import { AIManager } from './ai-manager';
import { ConfigManager } from './config-manager';
import { TmuxManager } from '../ui/tmux-manager';

/**
 * タスク実行状態
 */
export type TaskStatus =
  | 'pending' // 待機中
  | 'planning' // 計画中
  | 'executing' // 実行中
  | 'evaluating' // 評価中
  | 'completed' // 完了
  | 'failed' // 失敗
  | 'cancelled'; // キャンセル

/**
 * タスク定義
 */
export interface Task {
  id: string;
  title: string;
  description: string;
  requirements: string[];
  acceptanceCriteria: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimatedDuration: number; // minutes
  dependencies?: string[]; // 依存するタスクのID
  metadata?: Record<string, any>;
}

/**
 * タスク実行コンテキスト
 */
export interface TaskContext {
  task: Task;
  status: TaskStatus;
  startTime?: Date;
  endTime?: Date;
  currentStep?: string;
  progress: number; // 0-100
  iterations: TaskIteration[];
  evaluationResults: EvaluationResult[];
  errors: TaskError[];
  metrics: TaskMetrics;
}

/**
 * タスク実行イテレーション
 */
export interface TaskIteration {
  id: string;
  startTime: Date;
  endTime?: Date;
  plan: string;
  execution: ExecutionStep[];
  evaluation?: EvaluationResult;
  decision: ContinuationDecision;
  notes?: string;
}

/**
 * 実行ステップ
 */
export interface ExecutionStep {
  id: string;
  type: 'analysis' | 'implementation' | 'testing' | 'documentation';
  description: string;
  startTime: Date;
  endTime?: Date;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: string;
  artifacts?: string[]; // 生成されたファイルパス
}

/**
 * 継続判断結果
 */
export interface ContinuationDecision {
  decision: 'continue' | 'complete' | 'abort' | 'escalate';
  confidence: number; // 0-1
  reasoning: string;
  nextActions?: string[];
  estimatedRemainingTime?: number; // minutes
}

/**
 * タスクエラー
 */
export interface TaskError {
  timestamp: Date;
  type: 'execution' | 'evaluation' | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details?: string;
  recovery?: string;
}

/**
 * タスクメトリクス
 */
export interface TaskMetrics {
  totalDuration?: number; // minutes
  iterationCount: number;
  qualityScore?: number;
  codeChanges: {
    filesModified: number;
    linesAdded: number;
    linesRemoved: number;
  };
  testResults: {
    passed: number;
    failed: number;
    coverage: number;
  };
  costEstimate: {
    aiApiCalls: number;
    estimatedCost: number; // USD
  };
}

/**
 * タスク管理設定
 */
export interface TaskManagerConfig {
  maxIterations: number;
  maxDuration: number; // minutes
  qualityThreshold: number; // 0-100
  autoEvaluationInterval: number; // minutes
  enableContinuousImprovement: boolean;
  escalationThreshold: number; // 失敗回数
}

/**
 * タスクマネージャー
 *
 * タスクの実行、監視、評価、継続判断を自動化する中核システム
 */
export class TaskManager extends EventEmitter {
  private config: TaskManagerConfig;
  private claudeIntegration: ClaudeIntegration;
  private qualityEvaluator: QualityEvaluator;
  private logFilePath: string;
  private tmuxManager?: TmuxManager;
  private outputPaneId?: string;

  private activeTasks = new Map<string, TaskContext>();
  private taskQueue: Task[] = [];
  private isProcessing = false;

  constructor(
    config: TaskManagerConfig,
    _aiManager: AIManager,
    claudeIntegration: ClaudeIntegration,
    configManager: ConfigManager
  ) {
    super();
    this.config = config;
    this.claudeIntegration = claudeIntegration;

    // ログファイルパスを設定
    this.logFilePath = join(process.cwd(), 'data', 'logs', 'renkei-worker.log');
    this.ensureLogDirectory();

    // 品質評価器を初期化
    this.qualityEvaluator = createQualityEvaluator({
      projectPath: configManager.getConfig().workspaceDir,
    });

    this.setupEventHandlers();
    this.logWorkerStatus('🚀 TaskManager initialized', 'info');
  }

  /**
   * TmuxManagerとoutputペインを設定
   */
  setTmuxManager(tmuxManager: TmuxManager, outputPaneId: string): void {
    this.tmuxManager = tmuxManager;
    this.outputPaneId = outputPaneId;
    this.logWorkerStatus('📺 TmuxManager connected', 'info');
  }

  /**
   * タスクを実行キューに追加
   */
  async addTask(task: Task): Promise<void> {
    // 依存関係チェック
    if (task.dependencies?.length) {
      const unmetDependencies = task.dependencies.filter(
        (depId) => !this.isTaskCompleted(depId)
      );

      if (unmetDependencies.length > 0) {
        this.logWorkerStatus(
          `⚠️ Task "${task.title}" has unmet dependencies: ${unmetDependencies.join(', ')}`,
          'warn'
        );
        throw new Error(`Unmet dependencies: ${unmetDependencies.join(', ')}`);
      }
    }

    this.taskQueue.push(task);
    this.logWorkerStatus(
      `📋 Task "${task.title}" added to queue (Priority: ${task.priority})`
    );
    this.emit('taskQueued', { task });

    if (!this.isProcessing) {
      await this.processNextTask();
    }
  }

  /**
   * タスクを実行
   */
  async executeTask(taskId: string): Promise<TaskContext> {
    const context = this.activeTasks.get(taskId);
    if (!context) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (context.status !== 'pending') {
      throw new Error(`Task ${taskId} is not in pending status`);
    }

    try {
      context.status = 'planning';
      context.startTime = new Date();
      this.logTaskEvent(taskId, '🚀 Started execution');
      this.emit('taskStarted', { context });

      // メイン実行ループ
      while (context.iterations.length < this.config.maxIterations) {
        this.logTaskEvent(
          taskId,
          `⚙️ Starting iteration ${context.iterations.length + 1}/${this.config.maxIterations}`
        );

        const iteration = await this.executeIteration(context);
        context.iterations.push(iteration);
        context.metrics.iterationCount = context.iterations.length;

        // 継続判断ログ
        const decision = iteration.decision.decision;
        const confidence = Math.round(iteration.decision.confidence * 100);
        this.logTaskEvent(
          taskId,
          `🤔 Decision: ${decision} (${confidence}% confidence) - ${iteration.decision.reasoning}`
        );

        // 継続判断
        if (iteration.decision.decision === 'complete') {
          context.status = 'completed';
          context.endTime = new Date();
          const duration = Math.round(
            (context.endTime.getTime() - context.startTime!.getTime()) / 1000
          );
          this.logTaskEvent(taskId, `✅ Completed successfully`, {
            duration: `${duration}s`,
          });
          break;
        } else if (iteration.decision.decision === 'abort') {
          context.status = 'failed';
          context.endTime = new Date();
          this.logTaskEvent(taskId, `❌ Aborted`, {
            error: iteration.decision.reasoning,
          });
          break;
        } else if (iteration.decision.decision === 'escalate') {
          this.logTaskEvent(taskId, `🔺 Escalating to human intervention`);
          await this.escalateTask(context);
          break;
        }

        // 制限時間チェック
        if (this.isTimeoutExceeded(context)) {
          context.status = 'failed';
          context.errors.push({
            timestamp: new Date(),
            type: 'execution',
            severity: 'high',
            message: 'Task execution timeout exceeded',
          });
          this.logTaskEvent(taskId, `⏰ Timeout exceeded`, {
            error: 'Maximum duration reached',
          });
          break;
        }
      }

      // 最終評価
      if (context.status === 'completed') {
        const finalEvaluation = await this.performFinalEvaluation();
        context.evaluationResults.push(finalEvaluation);
        context.metrics.qualityScore = finalEvaluation.metrics.overall.score;
        this.logTaskEvent(
          taskId,
          `📊 Quality score: ${finalEvaluation.metrics.overall.score}%`
        );
      }

      this.emit('taskCompleted', { context });
      return context;
    } catch (error) {
      context.status = 'failed';
      context.endTime = new Date();
      context.errors.push({
        timestamp: new Date(),
        type: 'execution',
        severity: 'critical',
        message: error instanceof Error ? error.message : 'Unknown error',
      });

      this.logTaskEvent(taskId, `💥 Execution failed`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      this.emit('taskFailed', { context, error });
      throw error;
    }
  }

  /**
   * 単一イテレーションの実行
   */
  private async executeIteration(context: TaskContext): Promise<TaskIteration> {
    const iterationId = `iter_${Date.now()}`;
    const iteration: TaskIteration = {
      id: iterationId,
      startTime: new Date(),
      plan: '',
      execution: [],
      decision: {
        decision: 'continue',
        confidence: 0,
        reasoning: '',
      },
    };

    try {
      this.emit('iterationStarted', { context, iteration });

      // 1. 計画フェーズ
      context.status = 'planning';
      iteration.plan = await this.generateExecutionPlan(context);

      // 2. 実行フェーズ
      context.status = 'executing';
      iteration.execution = await this.executeSteps(context, iteration.plan);

      // 3. 評価フェーズ
      context.status = 'evaluating';
      if (this.shouldEvaluate(context)) {
        iteration.evaluation = await this.evaluateProgress();
        context.evaluationResults.push(iteration.evaluation);
      }

      // 4. 継続判断
      iteration.decision = await this.makeContinuationDecision(
        context,
        iteration
      );

      iteration.endTime = new Date();
      this.emit('iterationCompleted', { context, iteration });

      return iteration;
    } catch (error) {
      iteration.decision = {
        decision: 'abort',
        confidence: 1,
        reasoning: `Iteration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };

      this.emit('iterationFailed', { context, iteration, error });
      return iteration;
    }
  }

  /**
   * 実行計画の生成
   */
  private async generateExecutionPlan(context: TaskContext): Promise<string> {
    const prompt = this.buildPlanningPrompt(context);

    try {
      // ClaudeIntegrationを使用して計画を生成
      const response = await this.claudeIntegration.sendMessage(prompt);
      return response.content;
    } catch (error) {
      throw new Error(
        `Failed to generate execution plan: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 実行ステップの処理
   */
  private async executeSteps(
    context: TaskContext,
    plan: string
  ): Promise<ExecutionStep[]> {
    const steps = this.parsePlanIntoSteps(plan);
    const executedSteps: ExecutionStep[] = [];

    for (const step of steps) {
      try {
        step.startTime = new Date();
        step.status = 'running';

        this.emit('stepStarted', { context, step });

        // Claude Codeでステップを実行
        const sessionId = await this.claudeIntegration.createSession();

        // outputペインに実行開始を表示
        if (this.tmuxManager && this.outputPaneId) {
          await this.tmuxManager.appendToPaneContent(
            this.outputPaneId,
            `\n🔧 実行ステップ: ${step.description}\n${'─'.repeat(50)}\n`
          );
        }

        // ClaudeCodeの出力をリアルタイムで表示するハンドラー
        const handlers = {
          onMessage: async (message: any) => {
            if (this.tmuxManager && this.outputPaneId && message.content) {
              await this.tmuxManager.appendToPaneContent(
                this.outputPaneId,
                message.content
              );
            }
          },
          onProgress: async (progress: any) => {
            if (this.tmuxManager && this.outputPaneId) {
              await this.tmuxManager.appendToPaneContent(
                this.outputPaneId,
                `⏳ ${progress.message || '処理中...'}\n`
              );
            }
          },
          onComplete: async (_result: any) => {
            if (this.tmuxManager && this.outputPaneId) {
              await this.tmuxManager.appendToPaneContent(
                this.outputPaneId,
                `\n✅ ステップ完了\n${'─'.repeat(50)}\n`
              );
            }
          },
        };

        const taskId = await this.claudeIntegration.executeTask(
          sessionId,
          {
            prompt: step.description,
            options: {
              maxTurns: 1,
              autoApprove: true,
            },
          },
          handlers
        );

        step.output = `Task ${taskId} executed`;
        step.artifacts = [];
        step.status = 'completed';
        step.endTime = new Date();

        // メトリクス更新
        this.updateMetrics(context, { taskId });

        this.emit('stepCompleted', { context, step });
      } catch (error) {
        step.status = 'failed';
        step.endTime = new Date();
        step.output = error instanceof Error ? error.message : 'Unknown error';

        this.emit('stepFailed', { context, step, error });
      }

      executedSteps.push(step);
    }

    return executedSteps;
  }

  /**
   * 進捗評価
   */
  private async evaluateProgress(): Promise<EvaluationResult> {
    try {
      return await this.qualityEvaluator.evaluate();
    } catch (error) {
      throw new Error(
        `Progress evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 継続判断
   */
  private async makeContinuationDecision(
    context: TaskContext,
    iteration: TaskIteration
  ): Promise<ContinuationDecision> {
    // 受け入れ基準チェック
    const acceptanceMet = await this.checkAcceptanceCriteria(context);
    if (acceptanceMet.allMet) {
      return {
        decision: 'complete',
        confidence: acceptanceMet.confidence,
        reasoning: 'All acceptance criteria have been met',
      };
    }

    // 品質評価チェック
    if (iteration.evaluation) {
      const qualityScore = iteration.evaluation.metrics.overall.score;
      if (qualityScore >= this.config.qualityThreshold) {
        return {
          decision: 'complete',
          confidence: 0.9,
          reasoning: `Quality threshold met (${qualityScore}%)`,
        };
      }
    }

    // 進捗停滞チェック
    if (this.isProgressStagnant(context)) {
      return {
        decision: 'escalate',
        confidence: 0.8,
        reasoning: 'Progress has stagnated, human intervention may be needed',
      };
    }

    // エラー率チェック
    const errorRate = this.calculateErrorRate(context);
    if (errorRate > 0.5) {
      return {
        decision: 'abort',
        confidence: 0.9,
        reasoning: `High error rate detected (${Math.round(errorRate * 100)}%)`,
      };
    }

    // 継続
    const remainingTime = this.estimateRemainingTime(context);
    return {
      decision: 'continue',
      confidence: 0.7,
      reasoning: 'Task is progressing, continuing with next iteration',
      estimatedRemainingTime: remainingTime,
      nextActions: this.suggestNextActions(context),
    };
  }

  /**
   * 受け入れ基準チェック
   */
  private async checkAcceptanceCriteria(context: TaskContext): Promise<{
    allMet: boolean;
    confidence: number;
    details: Record<string, boolean>;
  }> {
    const details: Record<string, boolean> = {};
    let metCount = 0;

    for (const criteria of context.task.acceptanceCriteria) {
      // ClaudeIntegrationを使用して各基準の達成状況を確認
      try {
        const response = await this.claudeIntegration.sendMessage(
          `Check if the following acceptance criteria is met: "${criteria}". 
           Current progress: ${context.progress}%. 
           Respond with only "true" or "false".`
        );
        const isMet = response.content.toLowerCase().includes('true');
        details[criteria] = isMet;
        if (isMet) metCount++;
      } catch (error) {
        // エラーの場合は未達成とみなす
        details[criteria] = false;
      }
    }

    const allMet = metCount === context.task.acceptanceCriteria.length;
    const confidence =
      context.task.acceptanceCriteria.length > 0
        ? metCount / context.task.acceptanceCriteria.length
        : 1;

    return { allMet, confidence, details };
  }

  /**
   * 次のタスクを処理
   */
  private async processNextTask(): Promise<void> {
    if (this.taskQueue.length === 0 || this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    const task = this.taskQueue.shift()!;

    try {
      this.logWorkerStatus(
        `📤 Processing task "${task.title}" from queue (${this.taskQueue.length} remaining)`
      );
      const context = this.createTaskContext(task);
      this.activeTasks.set(task.id, context);

      await this.executeTask(task.id);

      // 次のタスクを処理
      if (this.taskQueue.length > 0) {
        this.logWorkerStatus(
          `📋 ${this.taskQueue.length} tasks remaining in queue`
        );
        setTimeout(() => this.processNextTask(), 0);
      } else {
        this.logWorkerStatus(`✨ Task queue is now empty`);
      }
    } catch (error) {
      this.logWorkerStatus(
        `💥 Failed to process task "${task.title}": ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );
      this.emit('taskProcessingError', { task, error });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * タスクコンテキスト作成
   */
  private createTaskContext(task: Task): TaskContext {
    return {
      task,
      status: 'pending',
      progress: 0,
      iterations: [],
      evaluationResults: [],
      errors: [],
      metrics: {
        iterationCount: 0,
        codeChanges: {
          filesModified: 0,
          linesAdded: 0,
          linesRemoved: 0,
        },
        testResults: {
          passed: 0,
          failed: 0,
          coverage: 0,
        },
        costEstimate: {
          aiApiCalls: 0,
          estimatedCost: 0,
        },
      },
    };
  }

  /**
   * ヘルパーメソッド群
   */
  private setupEventHandlers(): void {
    this.qualityEvaluator.on('evaluationCompleted', (result) => {
      this.emit('qualityEvaluationCompleted', result);
    });
  }

  private buildPlanningPrompt(context: TaskContext): string {
    return `
Task: ${context.task.title}
Description: ${context.task.description}
Requirements: ${context.task.requirements.join(', ')}
Progress: ${context.progress}%
Previous iterations: ${context.iterations.length}

Generate a detailed execution plan for the next iteration.
    `.trim();
  }

  private parsePlanIntoSteps(plan: string): ExecutionStep[] {
    // 計画を実行可能なステップに分解
    const lines = plan.split('\n').filter((line) => line.trim());
    return lines.map((line, index) => ({
      id: `step_${index}`,
      type: this.determineStepType(line),
      description: line.trim(),
      startTime: new Date(),
      status: 'pending',
    }));
  }

  private determineStepType(description: string): ExecutionStep['type'] {
    if (description.toLowerCase().includes('test')) return 'testing';
    if (description.toLowerCase().includes('doc')) return 'documentation';
    if (description.toLowerCase().includes('analyze')) return 'analysis';
    return 'implementation';
  }

  private updateMetrics(context: TaskContext, result: any): void {
    if (result.filesModified) {
      context.metrics.codeChanges.filesModified += result.filesModified.length;
    }
    context.metrics.costEstimate.aiApiCalls++;
    context.metrics.costEstimate.estimatedCost += 0.01; // 概算
  }

  private shouldEvaluate(context: TaskContext): boolean {
    // 一定間隔または重要なマイルストーン時に評価
    return context.iterations.length % 2 === 0 || context.progress > 80;
  }

  private isTimeoutExceeded(context: TaskContext): boolean {
    if (!context.startTime) return false;
    const elapsed = Date.now() - context.startTime.getTime();
    return elapsed > this.config.maxDuration * 60 * 1000;
  }

  private async performFinalEvaluation(): Promise<EvaluationResult> {
    return this.qualityEvaluator.evaluate();
  }

  private async escalateTask(context: TaskContext): Promise<void> {
    this.emit('taskEscalated', { context });
    // 人間への通知、ログ記録など
  }

  private isTaskCompleted(taskId: string): boolean {
    const context = this.activeTasks.get(taskId);
    return context?.status === 'completed';
  }

  private isProgressStagnant(context: TaskContext): boolean {
    if (context.iterations.length < 3) return false;

    const recentIterations = context.iterations.slice(-3);
    const progressChanges = recentIterations.map(
      (iter) => iter.evaluation?.metrics.overall.score || 0
    );

    const maxChange =
      Math.max(...progressChanges) - Math.min(...progressChanges);
    return maxChange < 5; // 5%未満の変化
  }

  private calculateErrorRate(context: TaskContext): number {
    const totalSteps = context.iterations.reduce(
      (sum, iter) => sum + iter.execution.length,
      0
    );
    const failedSteps = context.iterations.reduce(
      (sum, iter) =>
        sum + iter.execution.filter((step) => step.status === 'failed').length,
      0
    );

    return totalSteps > 0 ? failedSteps / totalSteps : 0;
  }

  private estimateRemainingTime(context: TaskContext): number {
    const avgIterationTime = this.calculateAverageIterationTime(context);
    const estimatedIterationsLeft = Math.max(1, 5 - context.iterations.length);
    return avgIterationTime * estimatedIterationsLeft;
  }

  private calculateAverageIterationTime(context: TaskContext): number {
    if (context.iterations.length === 0) return 30; // デフォルト30分

    const completedIterations = context.iterations.filter(
      (iter) => iter.endTime
    );
    if (completedIterations.length === 0) return 30;

    const totalTime = completedIterations.reduce((sum, iter) => {
      const duration = iter.endTime!.getTime() - iter.startTime.getTime();
      return sum + duration;
    }, 0);

    return Math.round(totalTime / completedIterations.length / (1000 * 60)); // 分単位
  }

  private suggestNextActions(context: TaskContext): string[] {
    const suggestions: string[] = [];

    if (context.evaluationResults.length > 0) {
      const latest =
        context.evaluationResults[context.evaluationResults.length - 1];
      if (latest?.suggestions) {
        suggestions.push(...latest.suggestions.map((s) => s.title));
      }
    }

    return suggestions;
  }

  /**
   * 公開API
   */
  getTaskStatus(taskId: string): TaskContext | undefined {
    return this.activeTasks.get(taskId);
  }

  getQueueLength(): number {
    return this.taskQueue.length;
  }

  getActiveTaskIds(): string[] {
    return Array.from(this.activeTasks.keys());
  }

  async cancelTask(taskId: string): Promise<void> {
    const context = this.activeTasks.get(taskId);
    if (
      context &&
      context.status !== 'completed' &&
      context.status !== 'failed'
    ) {
      context.status = 'cancelled';
      context.endTime = new Date();
      this.emit('taskCancelled', { context });
    }
  }

  updateConfig(newConfig: Partial<TaskManagerConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * ログ関連のメソッド
   */
  private ensureLogDirectory(): void {
    const logDir = join(process.cwd(), 'data', 'logs');
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
  }

  private logWorkerStatus(
    message: string,
    level: 'info' | 'warn' | 'error' = 'info'
  ): void {
    const timestamp = new Date().toISOString();
    const emoji = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️';
    const logMessage = `[${timestamp}] ${emoji} ${message}`;

    try {
      appendFileSync(this.logFilePath, logMessage + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  private logTaskEvent(taskId: string, event: string, details?: any): void {
    const task = this.activeTasks.get(taskId);
    const taskTitle = task?.task.title || taskId;
    let message = `Task "${taskTitle}": ${event}`;

    if (details) {
      if (details.progress !== undefined) {
        message += ` (${details.progress}% complete)`;
      }
      if (details.duration !== undefined) {
        message += ` [${details.duration}ms]`;
      }
      if (details.error) {
        message += ` - Error: ${details.error}`;
      }
    }

    this.logWorkerStatus(message);
  }
}

/**
 * デフォルト設定
 */
export const defaultTaskManagerConfig: TaskManagerConfig = {
  maxIterations: 10,
  maxDuration: 120, // 2 hours
  qualityThreshold: 80,
  autoEvaluationInterval: 30, // 30 minutes
  enableContinuousImprovement: true,
  escalationThreshold: 3,
};

/**
 * TaskManagerファクトリ関数
 */
export function createTaskManager(
  aiManager: AIManager,
  claudeIntegration: ClaudeIntegration,
  configManager: ConfigManager,
  config?: Partial<TaskManagerConfig>
): TaskManager {
  const finalConfig = { ...defaultTaskManagerConfig, ...config };
  return new TaskManager(
    finalConfig,
    aiManager,
    claudeIntegration,
    configManager
  );
}
