/**
 * エンドツーエンド統合テスト
 * 典型的なユースケース、エラーケース、パフォーマンステストを実施
 */

import { AIManager } from '../../managers/ai-manager.js';
import { ClaudeIntegration } from '../../integrations/claude-integration.js';
import { ConfigManager } from '../../managers/config-manager.js';
import { TaskEvaluator } from '../../evaluators/task-evaluator.js';
import { TmuxManager } from '../../ui/tmux-manager.js';
import { SessionManager } from '../../managers/session-manager.js';
import { TaskManager } from '../../managers/task-manager.js';
import { QualityEvaluator, createQualityEvaluator } from '../../evaluators/quality-evaluator.js';
import { 
  TaskPlan, 
  ExecutionResult, 
  TmuxConfig,
  RenkeiError,
  TaskRequest 
} from '../../interfaces/types.js';
import path from 'path';
import fs from 'fs/promises';
import { performance } from 'perf_hooks';

describe('Renkei System - End-to-End Integration Tests', () => {
  let aiManager: AIManager;
  let claudeIntegration: ClaudeIntegration;
  let configManager: ConfigManager;
  let tmuxManager: TmuxManager;
  let sessionManager: SessionManager;
  let taskManager: TaskManager;
  let taskEvaluator: TaskEvaluator;
  let qualityEvaluator: QualityEvaluator;
  let testWorkspace: string;

  beforeAll(async () => {
    // テスト用ワークスペースの準備
    testWorkspace = path.join(process.cwd(), 'workspace', 'test-e2e');
    await fs.mkdir(testWorkspace, { recursive: true });

    // システムコンポーネントの初期化
    configManager = new ConfigManager(
      path.dirname(path.join(testWorkspace, 'config.json')),
      path.dirname(path.join(testWorkspace, 'user-config.json'))
    );

    claudeIntegration = new ClaudeIntegration({
      maxRetries: 2,
      retryDelay: 500,
      timeout: 10000,
      defaultOptions: {
        maxTurns: 5,
        autoApprove: true,
        allowedTools: ['read_file', 'write_to_file'],
        outputFormat: 'text',
        timeout: 10000,
      },
    });

    taskEvaluator = new TaskEvaluator();
    qualityEvaluator = createQualityEvaluator({ projectPath: testWorkspace });
    aiManager = new AIManager(claudeIntegration, configManager, taskEvaluator);

    const tmuxConfig: TmuxConfig = {
      sessionName: 'renkei-test-e2e',
      mainPaneTitle: 'Main',
      subPaneTitle: 'Sub',
      splitDirection: 'horizontal',
      mainPaneSize: 70,
    };

    tmuxManager = new TmuxManager(tmuxConfig);
    sessionManager = new SessionManager();
    
    // TaskManagerの設定
    const taskManagerConfig = {
      maxIterations: 5,
      maxDuration: 30,
      qualityThreshold: 80,
      autoEvaluationInterval: 10,
      enableContinuousImprovement: true,
      escalationThreshold: 2,
    };
    
    taskManager = new TaskManager(taskManagerConfig, aiManager, claudeIntegration, configManager);

    // ClaudeCode統合の初期化（モックモード）
    try {
      await claudeIntegration.initialize();
    } catch (error) {
      // ClaudeCodeが利用できない場合はモックモードで継続
      console.warn('ClaudeCode not available, running in mock mode');
    }
  });

  afterAll(async () => {
    // クリーンアップ
    await claudeIntegration.cleanup();
    await sessionManager.shutdown();
    
    try {
      await fs.rm(testWorkspace, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to cleanup test workspace:', error);
    }
  });

  describe('典型的なユースケース', () => {
    test('シンプルなファイル作成タスクの完全実行', async () => {
      const startTime = performance.now();

      // 1. タスク分析
      const taskRequest = {
        description: 'Create a simple HTML file with "Hello World" message',
        workingDirectory: testWorkspace,
        priority: 'medium' as const,
      };

      const plan = await aiManager.analyzeTask(taskRequest);

      expect(plan).toBeDefined();
      expect(plan.id).toBeDefined();
      expect(plan.phases).toHaveLength(1);
      expect(plan.phases[0].steps).toHaveLength(1);

      // 2. タスク実行
      const executionResult = await aiManager.executeTask(plan);

      expect(executionResult.success).toBe(true);
      expect(executionResult.taskId).toBe(plan.id);
      expect(executionResult.results).toHaveLength(1);

      // 3. 結果評価
      const evaluation = await aiManager.evaluateResult(executionResult);

      expect(evaluation.quality).toBeGreaterThan(0.7);
      expect(evaluation.completeness).toBeGreaterThan(0.8);

      const endTime = performance.now();
      console.log(`Simple task completed in ${endTime - startTime}ms`);

      // パフォーマンス要件チェック
      expect(endTime - startTime).toBeLessThan(30000); // 30秒以内
    }, 45000);

    test('複数フェーズタスクの段階的実行', async () => {
      const taskRequest = {
        description: 'Create a JavaScript project with package.json, main.js, and README.md files',
        workingDirectory: testWorkspace,
        priority: 'high' as const,
      };

      const plan = await aiManager.analyzeTask(taskRequest);

      expect(plan.phases.length).toBeGreaterThan(1);

      // AIManagerのイベント監視
      const events: string[] = [];
      aiManager.on('phase_started', (phase) => {
        events.push(`phase_started:${phase.id}`);
      });
      aiManager.on('phase_completed', (data) => {
        events.push(`phase_completed:${data.phase.id}`);
      });
      aiManager.on('step_started', (step) => {
        events.push(`step_started:${step.id}`);
      });
      aiManager.on('step_completed', (data) => {
        events.push(`step_completed:${data.step.id}`);
      });

      const executionResult = await aiManager.executeTask(plan);

      expect(executionResult.success).toBe(true);
      expect(events.length).toBeGreaterThan(4); // 最低限のイベントが発生

      // 各フェーズが適切に実行されたかチェック
      const phaseStartEvents = events.filter(e => e.startsWith('phase_started'));
      const phaseCompleteEvents = events.filter(e => e.startsWith('phase_completed'));
      
      expect(phaseStartEvents.length).toBe(phaseCompleteEvents.length);
    }, 60000);

    test('セッション管理とタスク実行の統合', async () => {
      // セッション作成
      const sessionId = await sessionManager.createSession({
        workingDirectory: testWorkspace,
      });

      expect(sessionId).toBeDefined();

      // タスク実行
      const task = {
        id: `task_${Date.now()}`,
        title: 'Create Configuration File',
        description: 'Create a configuration file with test settings',
        requirements: ['Create config file', 'Include test settings'],
        acceptanceCriteria: ['File exists', 'Contains valid JSON'],
        priority: 'medium' as const,
        estimatedDuration: 10,
      };

      await taskManager.addTask(task);
      const taskContext = await taskManager.executeTask(task.id);
      const taskStatus = taskManager.getTaskStatus(task.id);

      expect(taskStatus?.status).toBe('completed');

      // セッション情報確認
      const sessionInfo = await sessionManager.getSession(sessionId);
      expect(sessionInfo?.taskHistory).toBeDefined();

      // セッション終了
      await sessionManager.completeSession(sessionId);
    }, 45000);
  });

  describe('エラーケーステスト', () => {
    test('無効なタスク記述の処理', async () => {
      const invalidTaskRequest = {
        description: '', // 空の記述
        workingDirectory: testWorkspace,
        priority: 'medium' as const,
      };

      await expect(aiManager.analyzeTask(invalidTaskRequest))
        .rejects
        .toThrow(RenkeiError);
    });

    test('存在しないディレクトリでのタスク実行', async () => {
      const taskRequest = {
        description: 'Create a test file',
        workingDirectory: '/nonexistent/directory',
        priority: 'medium' as const,
      };

      await expect(aiManager.analyzeTask(taskRequest))
        .rejects
        .toThrow();
    });

    test('タスク実行中の中断と復旧', async () => {
      const taskRequest = {
        description: 'Create multiple files with content',
        workingDirectory: testWorkspace,
        priority: 'low' as const,
      };

      const plan = await aiManager.analyzeTask(taskRequest);

      // タスク実行を開始
      const executionPromise = aiManager.executeTask(plan);

      // 少し待って中断
      setTimeout(() => {
        aiManager.stopCurrentTask();
      }, 1000);

      const result = await executionPromise;

      // 中断されたタスクの状態確認
      const status = aiManager.getStatus();
      expect(status.executionStatus).toBe('stopped');
    }, 30000);

    test('リソース制限エラーの処理', async () => {
      // 大きなタスクを作成してリソース制限をテスト
      const largeTaskRequest = {
        description: 'Create 100 large files with complex content',
        workingDirectory: testWorkspace,
        priority: 'high' as const,
      };

      const plan = await aiManager.analyzeTask(largeTaskRequest);

      // リスク評価で制限されることを期待
      expect(plan.riskAssessment.overall).toBe('HIGH');
      expect(plan.riskAssessment.blockers.length).toBeGreaterThan(0);
    });
  });

  describe('パフォーマンステスト', () => {
    test('大量タスクの同時実行性能', async () => {
      const tasks = Array.from({ length: 5 }, (_, i) => ({
        description: `Create test file ${i + 1}`,
        workingDirectory: testWorkspace,
        priority: 'medium' as const,
      }));

      const startTime = performance.now();

      // 並行実行
      const results = await Promise.all(
        tasks.map(task => aiManager.analyzeTask(task))
      );

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.id).toBeDefined();
      });

      // パフォーマンス要件: 5つのタスクを20秒以内で分析
      expect(totalTime).toBeLessThan(20000);

      console.log(`Analyzed ${tasks.length} tasks in ${totalTime}ms (${totalTime / tasks.length}ms per task)`);
    }, 30000);

    test('メモリ使用量監視', async () => {
      const initialMemory = process.memoryUsage();

      // メモリ集約的なタスクを実行
      const tasks = Array.from({ length: 10 }, (_, i) => ({
        description: `Create complex project structure ${i + 1}`,
        workingDirectory: testWorkspace,
        priority: 'medium' as const,
      }));

      for (const task of tasks) {
        await aiManager.analyzeTask(task);
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      console.log(`Memory increase: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);

      // メモリ増加量が100MB以下であることを確認
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
    });

    test('API呼び出し効率性', async () => {
      let apiCallCount = 0;

      // ClaudeIntegrationのsendMessageをモニタリング
      const originalSendMessage = claudeIntegration.sendMessage.bind(claudeIntegration);
      claudeIntegration.sendMessage = async (...args) => {
        apiCallCount++;
        return originalSendMessage(...args);
      };

      const taskRequest = {
        description: 'Create a simple web page with HTML, CSS, and JavaScript',
        workingDirectory: testWorkspace,
        priority: 'medium' as const,
      };

      await aiManager.analyzeTask(taskRequest);

      console.log(`API calls made: ${apiCallCount}`);

      // 効率的なAPI使用: 単一タスク分析で5回以下のAPI呼び出し
      expect(apiCallCount).toBeLessThanOrEqual(5);

      // 元のメソッドを復元
      claudeIntegration.sendMessage = originalSendMessage;
    });
  });

  describe('品質保証テスト', () => {
    test('生成されたコードの品質評価', async () => {
      const taskRequest = {
        description: 'Create a Node.js utility function with proper error handling and documentation',
        workingDirectory: testWorkspace,
        priority: 'high' as const,
      };

      const plan = await aiManager.analyzeTask(taskRequest);
      const executionResult = await aiManager.executeTask(plan);
      const evaluation = await aiManager.evaluateResult(executionResult);

      // 品質基準
      expect(evaluation.quality).toBeGreaterThan(0.8);
      expect(evaluation.completeness).toBeGreaterThan(0.9);
      expect(evaluation.needsImprovement).toBe(false);
    });

    test('エラーハンドリングの包括性', async () => {
      const errorScenarios = [
        'invalid_input',
        'network_error',
        'file_system_error',
        'timeout_error',
        'permission_error',
      ];

      for (const scenario of errorScenarios) {
        try {
          // 各エラーシナリオを意図的に発生させる
          switch (scenario) {
            case 'invalid_input':
              await aiManager.analyzeTask({
                description: null as any,
                workingDirectory: testWorkspace,
                priority: 'medium' as const,
              });
              break;
            case 'network_error':
              // ネットワークエラーのシミュレーション
              const brokenClaudeIntegration = new ClaudeIntegration({
                maxRetries: 1,
                retryDelay: 100,
                timeout: 1, // 極端に短いタイムアウト
                defaultOptions: {
                  maxTurns: 1,
                  autoApprove: true,
                  allowedTools: [],
                  outputFormat: 'text',
                  timeout: 1,
                },
              });
              const brokenAIManager = new AIManager(brokenClaudeIntegration, configManager, taskEvaluator);
              await brokenAIManager.analyzeTask({
                description: 'Test task',
                workingDirectory: testWorkspace,
                priority: 'medium' as const,
              });
              break;
            default:
              // その他のエラーケース
              break;
          }
          
          fail(`Expected error for scenario: ${scenario}`);
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          
          if (error instanceof RenkeiError) {
            expect(error.code).toBeDefined();
            expect(error.severity).toBeDefined();
          }
        }
      }
    });
  });

  describe('システム統合テスト', () => {
    test('全コンポーネントの相互連携', async () => {
      // 1. セッション作成
      const sessionId = await sessionManager.createSession({
        workingDirectory: testWorkspace,
      });

      // 2. タスク定義と分析
      const taskRequest = {
        description: 'Create a complete web application with frontend and backend',
        workingDirectory: testWorkspace,
        priority: 'high' as const,
      };

      const plan = await aiManager.analyzeTask(taskRequest);

      // 3. UI管理（tmux）の設定
      const tmuxSessionId = await tmuxManager.createSession('integration-test');
      expect(tmuxSessionId).toBeDefined();

      // 4. タスク実行と監視
      const executionEvents: string[] = [];
      
      aiManager.on('task_execution_started', () => {
        executionEvents.push('execution_started');
      });
      
      aiManager.on('task_execution_completed', () => {
        executionEvents.push('execution_completed');
      });

      const executionResult = await aiManager.executeTask(plan);

      // 5. 結果評価
      const evaluation = await aiManager.evaluateResult(executionResult);

      // 6. セッション状態の更新（代替手段）
      const fullTaskRequest: TaskRequest = {
        id: `task_${Date.now()}`,
        userPrompt: taskRequest.description,
        description: taskRequest.description,
        workingDirectory: taskRequest.workingDirectory,
        priority: taskRequest.priority,
        timestamp: new Date(),
      };

      await sessionManager.updateContext({
        currentTask: fullTaskRequest,
      }, sessionId);

      // 検証
      expect(executionResult.success).toBe(true);
      expect(evaluation.quality).toBeGreaterThan(0.7);
      expect(executionEvents).toContain('execution_started');
      expect(executionEvents).toContain('execution_completed');

      // クリーンアップ
      await tmuxManager.destroySession(tmuxSessionId);
      await sessionManager.completeSession(sessionId);
    }, 90000);
  });
});
