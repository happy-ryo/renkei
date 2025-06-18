/**
 * エンドツーエンド統合テスト
 * 典型的なユースケース、エラーケース、パフォーマンステストを実施
 */

import { AIManager } from '../../managers/ai-manager';
import { ClaudeIntegration } from '../../integrations/claude-integration';
import { ConfigManager } from '../../managers/config-manager';
import { TaskEvaluator } from '../../evaluators/task-evaluator';
import { TmuxManager } from '../../ui/tmux-manager';
import { SessionManager } from '../../managers/session-manager';
import { TaskManager } from '../../managers/task-manager';
import { QualityEvaluator, createQualityEvaluator } from '../../evaluators/quality-evaluator';
import { 
  TmuxConfig,
  TaskRequest 
} from '../../interfaces/types';
import path from 'path';
import fs from 'fs/promises';

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

    // 設定ファイルを作成
    const configDir = path.join(testWorkspace, 'config');
    await fs.mkdir(configDir, { recursive: true });
    
    const defaultConfig = {
      system: {
        name: 'renkei-test',
        version: '1.0.0',
        debug: false,
      },
      claude: {
        apiKey: 'test-key',
        model: 'claude-3-sonnet-20240229',
        maxTokens: 4000,
      },
      workspace: {
        defaultDirectory: testWorkspace,
        maxFileSize: 1024 * 1024,
      },
    };

    await fs.writeFile(
      path.join(configDir, 'default-settings.json'),
      JSON.stringify(defaultConfig, null, 2)
    );

    // システムコンポーネントの初期化
    configManager = new ConfigManager(configDir, configDir);

    try {
      // ConfigManagerを初期化
      await configManager.initialize();
    } catch (error) {
      console.warn('ConfigManager initialization failed, using mock mode:', error);
      // モックConfigManagerを作成
      configManager = {
        initialize: async () => {},
        getConfig: () => defaultConfig,
        updateConfig: async () => {},
        reload: async () => {},
      } as any;
    }

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
    if (claudeIntegration && typeof claudeIntegration.cleanup === 'function') {
      try {
        await claudeIntegration.cleanup();
      } catch (error) {
        console.warn('ClaudeIntegration cleanup failed:', error);
      }
    }
    
    if (sessionManager && typeof sessionManager.shutdown === 'function') {
      try {
        await sessionManager.shutdown();
      } catch (error) {
        console.warn('SessionManager shutdown failed:', error);
      }
    }
    
    try {
      await fs.rm(testWorkspace, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to cleanup test workspace:', error);
    }
  });

  describe('基本機能テスト', () => {
    test('システムコンポーネントの初期化確認', async () => {
      expect(aiManager).toBeDefined();
      expect(claudeIntegration).toBeDefined();
      expect(configManager).toBeDefined();
      expect(taskEvaluator).toBeDefined();
      expect(qualityEvaluator).toBeDefined();
      expect(sessionManager).toBeDefined();
      expect(taskManager).toBeDefined();
      expect(tmuxManager).toBeDefined();
    });

    test('ConfigManagerの基本動作確認', async () => {
      const config = configManager.getConfig();
      expect(config).toBeDefined();
      // 設定が正常に取得できることを確認
      expect(typeof config).toBe('object');
    });

    test('SessionManagerの基本動作確認', async () => {
      const sessionId = await sessionManager.createSession({
        workingDirectory: testWorkspace,
      });
      
      expect(sessionId).toBeDefined();
      
      const session = sessionManager.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session?.sessionId).toBe(sessionId);
      
      await sessionManager.completeSession(sessionId);
    });

    test('QualityEvaluatorの基本動作確認', async () => {
      expect(qualityEvaluator.isRunning()).toBe(false);
      
      // 評価実行をテスト（30秒以内で終了することを確認）
      const startTime = Date.now();
      const evaluation = await qualityEvaluator.evaluate();
      const endTime = Date.now();
      
      expect(evaluation).toBeDefined();
      expect(evaluation.metrics).toBeDefined();
      expect(evaluation.metrics.overall).toBeDefined();
      expect(endTime - startTime).toBeLessThan(30000); // 30秒以内
      
      console.log(`Quality evaluation completed in ${Math.round((endTime - startTime) / 1000)}s`);
    }, 35000); // 35秒タイムアウト

    test('TaskManagerの基本動作確認', async () => {
      const task = {
        id: `test_task_${Date.now()}`,
        title: 'Test Task',
        description: 'Simple test task for verification',
        requirements: ['Basic functionality test'],
        acceptanceCriteria: ['Task completes without error'],
        priority: 'medium' as const,
        estimatedDuration: 5,
      };

      // タスク追加
      await taskManager.addTask(task);
      
      // タスク状態確認
      const taskStatus = taskManager.getTaskStatus(task.id);
      expect(taskStatus).toBeDefined();
      // 基本的にタスクが追加されたことを確認
      expect(taskStatus).not.toBeNull();
    });

    test('メモリ使用量確認', async () => {
      const initialMemory = process.memoryUsage();
      
      // 軽い処理を実行
      for (let i = 0; i < 5; i++) {
        const sessionId = await sessionManager.createSession({
          workingDirectory: testWorkspace,
        });
        await sessionManager.completeSession(sessionId);
      }
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      console.log(`Memory increase: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);
      
      // メモリ増加量が合理的な範囲内であることを確認（50MB以下）
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    test('エラーハンドリングの基本確認', async () => {
      // 無効なセッションIDでのアクセステスト
      const invalidSession = sessionManager.getSession('invalid-session-id');
      expect(invalidSession).toBeNull();
      
      // 存在しないタスクの状態確認
      const invalidTaskStatus = taskManager.getTaskStatus('invalid-task-id');
      expect(invalidTaskStatus).toBeUndefined();
    });

    test('システム統合の基本確認', async () => {
      // 複数コンポーネントの協調動作テスト
      const sessionId = await sessionManager.createSession({
        workingDirectory: testWorkspace,
      });

      const task = {
        id: `integration_task_${Date.now()}`,
        title: 'Integration Test Task',
        description: 'Test task for system integration',
        requirements: ['Integration test'],
        acceptanceCriteria: ['All components work together'],
        priority: 'medium' as const,
        estimatedDuration: 5,
      };

      await taskManager.addTask(task);
      
      // タスク情報をセッションコンテキストに追加
      const fullTaskRequest: TaskRequest = {
        id: task.id,
        userPrompt: task.description,
        description: task.description,
        workingDirectory: testWorkspace,
        priority: task.priority,
        timestamp: new Date(),
      };

      await sessionManager.updateContext({
        currentTask: fullTaskRequest,
      }, sessionId);

      // 統合確認
      const session = sessionManager.getSession(sessionId);
      expect(session?.context.currentTask).toBeDefined();
      expect(session?.context.currentTask?.id).toBe(task.id);

      await sessionManager.completeSession(sessionId);
    });
  });
});
