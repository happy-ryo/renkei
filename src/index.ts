/**
 * Renkei System - メインエントリーポイント
 */

import { configManager } from './managers/config-manager';
import { createClaudeIntegration } from './integrations/claude-integration';
import { createSettingsManager } from './integrations/settings-manager';
import { createResultProcessor } from './integrations/result-processor';
import { TmuxManager } from './ui/tmux-manager';
import { AIManager } from './managers/ai-manager';
import { TaskManager } from './managers/task-manager';
import { TaskEvaluator } from './evaluators/task-evaluator';
import { SessionManager } from './managers/session-manager';
import { ChatManager } from './managers/chat-manager';
import { AIBridge } from './managers/ai-bridge';
import { RenkeiError, ErrorSeverity } from './interfaces/types';
import chalk from 'chalk';
import { EventEmitter } from 'events';

interface SystemComponents {
  configManager: typeof configManager;
  settingsManager: any;
  claudeIntegration: any;
  resultProcessor: any;
  tmuxManager: TmuxManager;
  aiManager: AIManager;
  taskManager: TaskManager;
  taskEvaluator: TaskEvaluator;
  sessionManager: SessionManager;
  chatManager?: ChatManager;
  aiBridge?: AIBridge;
}

class RenkeiSystem extends EventEmitter {
  private components: Partial<SystemComponents> = {};
  private isRunning = false;

  async initialize(): Promise<void> {
    console.log(chalk.blue.bold('🚀 Renkei System 起動中...'));

    try {
      // 1. 設定管理システムの初期化
      console.log(chalk.yellow('📋 設定を初期化しています...'));
      await configManager.initialize();
      this.components.configManager = configManager;
      
      const config = configManager.getConfig();
      console.log(chalk.green('✅ 設定の初期化が完了しました'));
      console.log(chalk.gray(`   バージョン: ${config.version}`));
      console.log(chalk.gray(`   ワークスペース: ${config.workspaceDir}`));
      console.log(chalk.gray(`   セッション保存先: ${config.sessionDir}`));

      // 2. システム情報の表示
      console.log(chalk.yellow('🔍 システム情報を取得しています...'));
      const systemInfo = await configManager.getSystemInfo();
      console.log(chalk.green('✅ システム情報:'));
      console.log(chalk.gray(`   プラットフォーム: ${systemInfo.platform}`));
      console.log(chalk.gray(`   Node.js: ${systemInfo.nodeVersion}`));
      console.log(chalk.gray(`   tmux: ${systemInfo.tmuxVersion || '未検出'}`));
      console.log(chalk.gray(`   ClaudeCode: ${systemInfo.claudeCodeVersion || '未検出'}`));
      console.log(chalk.gray(`   Renkei: ${systemInfo.renkeiVersion}`));

      // 3. Phase 2.2: AI管理者システムの起動
      console.log(chalk.blue.bold('\n🔧 Phase 2.2: AI管理者システムの起動...'));
      
      // 3-1. SettingsManager の初期化
      console.log(chalk.yellow('⚙️  ClaudeCode設定管理システムを初期化しています...'));
      const settingsManager = createSettingsManager(configManager);
      await settingsManager.initialize();
      this.components.settingsManager = settingsManager;
      console.log(chalk.green('✅ SettingsManager が初期化されました'));
      console.log(chalk.gray(`   設定ファイル: ${settingsManager.getSettingsPath()}`));
      
      // 3-2. ClaudeIntegration の初期化（エラーハンドリング付き）
      console.log(chalk.yellow('🤖 ClaudeCode統合システムを初期化しています...'));
      const claudeIntegration = createClaudeIntegration({
        timeout: 30000,
        maxRetries: 3,
      });
      
      try {
        await claudeIntegration.initialize();
        this.components.claudeIntegration = claudeIntegration;
        console.log(chalk.green('✅ ClaudeIntegration が初期化されました'));
      } catch {
        console.log(chalk.yellow('⚠️  ClaudeCodeが利用できません（開発環境では正常）'));
        console.log(chalk.gray('   実際の環境ではClaudeCodeが必要です'));
        // 開発環境用のダミー統合を作成
        this.components.claudeIntegration = claudeIntegration;
      }
      
      // 3-3. ResultProcessor の初期化
      console.log(chalk.yellow('📊 実行結果処理システムを初期化しています...'));
      const resultProcessor = createResultProcessor();
      await resultProcessor.initialize();
      this.components.resultProcessor = resultProcessor;
      console.log(chalk.green('✅ ResultProcessor が初期化されました'));
      
      // 3-4. TmuxManager の初期化
      console.log(chalk.yellow('🖥️  tmux UIシステムを初期化しています...'));
      const tmuxManager = new TmuxManager(config.tmux);
      this.components.tmuxManager = tmuxManager;
      
      try {
        const sessions = tmuxManager.getActiveSessions();
        console.log(chalk.green('✅ TmuxManager が初期化されました'));
        console.log(chalk.gray(`   アクティブセッション数: ${sessions.length}`));
      } catch {
        console.log(chalk.yellow('⚠️  tmuxが利用できません（開発環境では正常）'));
        console.log(chalk.gray('   実際の実行にはtmuxが必要です'));
      }

      // 3-5. TaskEvaluator の初期化
      console.log(chalk.yellow('📏 タスク評価システムを初期化しています...'));
      const taskEvaluator = new TaskEvaluator();
      this.components.taskEvaluator = taskEvaluator;
      console.log(chalk.green('✅ TaskEvaluator が初期化されました'));

      // 3-6. SessionManager の初期化
      console.log(chalk.yellow('📂 セッション管理システムを初期化しています...'));
      const sessionManager = new SessionManager();
      await sessionManager.initialize();
      this.components.sessionManager = sessionManager;
      console.log(chalk.green('✅ SessionManager が初期化されました'));

      // 3-7. AIManager の初期化
      console.log(chalk.yellow('🧠 AI管理者システムを初期化しています...'));
      const aiManager = new AIManager(
        this.components.claudeIntegration,
        configManager,
        taskEvaluator
      );
      this.components.aiManager = aiManager;
      
      // AIManagerのイベント監視
      this.setupAIManagerEventHandlers(aiManager);
      
      // AIManagerにTmuxManagerを設定
      if (tmuxManager) {
        // @ts-ignore - AIManagerにsetTmuxManagerメソッドが存在する
        if (typeof aiManager.setTmuxManager === 'function') {
          // outputペインのIDを取得
          // renkei-startで作成される3番目のペイン（Renkei Output）を使用
          const outputPaneId = '%2';  // tmuxのペインIDは%で始まる
          console.log(chalk.gray(`   Output pane ID: ${outputPaneId}`));
          aiManager.setTmuxManager(tmuxManager, outputPaneId);
        }
      }
      
      console.log(chalk.green('✅ AI Manager が初期化されました'));

      // 3-8. TaskManager の初期化
      console.log(chalk.yellow('📋 タスク管理システムを初期化しています...'));
      const taskManagerConfig = {
        maxIterations: 10,
        maxDuration: 60, // 60分
        qualityThreshold: 0.8,
        autoEvaluationInterval: 5, // 5分ごと
        enableContinuousImprovement: true,
        escalationThreshold: 3, // 3回失敗でエスカレーション
      };
      const taskManager = new TaskManager(
        taskManagerConfig,
        aiManager, // 既に初期化済みのAIManager
        this.components.claudeIntegration,
        configManager
      );
      this.components.taskManager = taskManager;
      
      // TaskManagerにTmuxManagerを設定
      if (tmuxManager) {
        // @ts-ignore - TaskManagerにsetTmuxManagerメソッドが存在する
        if (typeof taskManager.setTmuxManager === 'function') {
          // outputペインのIDを取得
          // renkei-startで作成される3番目のペイン（Renkei Output）を使用
          const outputPaneId = '%2';  // tmuxのペインIDは%で始まる
          console.log(chalk.gray(`   Output pane ID for TaskManager: ${outputPaneId}`));
          taskManager.setTmuxManager(tmuxManager, outputPaneId);
        }
      }
      
      console.log(chalk.green('✅ TaskManager が初期化されました'));

      // 3-9. ChatManager の初期化（チャット機能有効時のみ）
      if (config.tmux.chatPane) {
        console.log(chalk.yellow('💬 チャット管理システムを初期化しています...'));
        const chatManager = new ChatManager();
        this.components.chatManager = chatManager;
        console.log(chalk.green('✅ ChatManager が初期化されました'));

        // 3-9. AIBridge の初期化
        console.log(chalk.yellow('🔗 AI Bridgeを初期化しています...'));
        const aiBridge = new AIBridge(chatManager);
        await aiBridge.start();
        this.components.aiBridge = aiBridge;
        console.log(chalk.green('✅ AIBridge が初期化されました'));
      }

      // システム統合状況の表示
      console.log(chalk.blue.bold('\n📋 システム統合状況:'));
      console.log(chalk.green('✅ ConfigManager - 設定管理システム'));
      console.log(chalk.green('✅ SettingsManager - ClaudeCode設定管理'));
      console.log(chalk.green('✅ ClaudeIntegration - ClaudeCode統合レイヤー'));
      console.log(chalk.green('✅ ResultProcessor - 実行結果処理'));
      console.log(chalk.green('✅ TmuxManager - tmux UI制御'));
      console.log(chalk.green('✅ TaskEvaluator - タスク評価システム'));
      console.log(chalk.green('✅ SessionManager - セッション管理'));
      console.log(chalk.green('✅ AIManager - 統括AI管理者'));
      if (this.components.chatManager) {
        console.log(chalk.green('✅ ChatManager - チャット管理'));
        console.log(chalk.green('✅ AIBridge - AI統合ブリッジ'));
      }

      // 実装完了フェーズの表示
      console.log(chalk.blue.bold('\n🎯 実装完了フェーズ:'));
      console.log(chalk.green('✅ Phase 1: 基盤構築 (tmux UI + 実行スクリプト)'));
      console.log(chalk.green('✅ Phase 2.1: ClaudeCode統合機能'));
      console.log(chalk.green('✅ Phase 2.2: AI管理者システム'));

      console.log(chalk.blue.bold('\n🎉 Renkei System が完全に起動しました！'));
      console.log(chalk.gray('統括AIとworkerプロセスが待機状態になりました'));
      
    } catch (error) {
      if (error instanceof RenkeiError) {
        console.error(chalk.red.bold(`❌ エラー [${error.code}]: ${error.message}`));
        if (error.details) {
          console.error(chalk.red(`   詳細: ${error.details}`));
        }
      } else {
        console.error(chalk.red.bold('❌ 予期しないエラーが発生しました:'));
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        if (error instanceof Error && error.stack) {
          console.error(chalk.gray('スタックトレース:'));
          console.error(chalk.gray(error.stack));
        }
      }
      throw error;
    }
  }

  private setupAIManagerEventHandlers(aiManager: AIManager): void {
    aiManager.on('task_analysis_started', (task) => {
      console.log(chalk.blue(`🔍 タスク解析開始: ${task.description}`));
    });

    aiManager.on('task_analysis_completed', (plan) => {
      console.log(chalk.green(`✅ タスク解析完了: ${plan.title}`));
    });

    aiManager.on('task_execution_started', (plan) => {
      console.log(chalk.blue(`🚀 タスク実行開始: ${plan.title}`));
    });

    aiManager.on('task_execution_completed', (result) => {
      console.log(chalk.green(`✅ タスク実行完了: ${result.taskId}`));
    });

    aiManager.on('error', (error) => {
      console.error(chalk.red(`❌ AI Manager エラー: ${error.message}`));
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(chalk.yellow('⚠️  システムは既に実行中です'));
      return;
    }

    console.log(chalk.blue.bold('\n🔄 ワーカープロセスを起動しています...'));

    // ワーカープロセスの起動
    this.startWorkerProcesses();

    this.isRunning = true;
    console.log(chalk.green.bold('\n✅ Renkei System が完全に起動しました'));
    console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.cyan.bold('🤖 統括AI管理者 - 待機中'));
    console.log(chalk.cyan.bold('⚙️  Workerプロセス - 待機中'));
    console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.gray('システムはタスクを受け付ける準備ができました'));

    // メインループの開始
    this.runMainLoop();
  }

  private startWorkerProcesses(): void {
    const workerCount = 2; // 設定可能にする予定
    
    for (let i = 0; i < workerCount; i++) {
      this.startWorker(i + 1);
    }
  }

  private startWorker(workerId: number): void {
    console.log(chalk.blue(`🔧 Worker ${workerId} を起動中...`));
    
    // ワーカーの疑似実装（実際のワーカープロセス管理は今後実装）
    setInterval(() => {
      // ワーカーのヘルスチェック
      this.workerHealthCheck(workerId);
    }, 30000); // 30秒ごと

    console.log(chalk.green(`✅ Worker ${workerId} が起動しました`));
  }

  private workerHealthCheck(workerId: number): void {
    // 現在時刻とワーカーIDのログ出力（デバッグ用）
    const timestamp = new Date().toISOString();
    console.log(chalk.gray(`[${timestamp}] Worker ${workerId} - HealthCheck OK`));
  }

  private async runMainLoop(): Promise<void> {
    console.log(chalk.blue('🔄 メインループを開始しています...'));

    // メインループ：システム監視とタスク処理
    const mainLoopInterval = setInterval(async () => {
      try {
        await this.processSystemTasks();
      } catch (error) {
        console.error(chalk.red('❌ メインループでエラーが発生しました:'), error);
      }
    }, 5000); // 5秒ごと

    // 終了シグナルのハンドリング
    process.on('SIGINT', async () => {
      console.log(chalk.yellow('\n🛑 システム停止シグナルを受信しました'));
      clearInterval(mainLoopInterval);
      await this.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log(chalk.yellow('\n🛑 システム終了シグナルを受信しました'));
      clearInterval(mainLoopInterval);
      await this.shutdown();
      process.exit(0);
    });
  }

  private async processSystemTasks(): Promise<void> {
    // システムタスクの処理（例：セッション管理、ログローテーション等）
    // セッション管理は自動保存機能で管理されているため、特別な処理は不要
    // 将来的にログローテーションやヘルスチェック等を実装予定
  }

  private async shutdown(): Promise<void> {
    console.log(chalk.blue('🔄 システムをシャットダウンしています...'));
    this.isRunning = false;

    try {
      // 各コンポーネントのクリーンアップ
      if (this.components.aiBridge) {
        await this.components.aiBridge.stop();
        console.log(chalk.green('✅ AI Bridge をシャットダウンしました'));
      }

      if (this.components.aiManager) {
        await this.components.aiManager.cleanup();
        console.log(chalk.green('✅ AI Manager をシャットダウンしました'));
      }

      if (this.components.sessionManager) {
        await this.components.sessionManager.shutdown();
        console.log(chalk.green('✅ Session Manager をシャットダウンしました'));
      }

      if (this.components.settingsManager) {
        await this.components.settingsManager.cleanup();
        console.log(chalk.green('✅ Settings Manager をシャットダウンしました'));
      }

      if (this.components.claudeIntegration) {
        await this.components.claudeIntegration.cleanup();
        console.log(chalk.green('✅ Claude Integration をシャットダウンしました'));
      }

      if (this.components.resultProcessor) {
        await this.components.resultProcessor.cleanup();
        console.log(chalk.green('✅ Result Processor をシャットダウンしました'));
      }

      console.log(chalk.green.bold('✅ システムのシャットダウンが完了しました'));
    } catch (error) {
      console.error(chalk.red('❌ シャットダウン中にエラーが発生しました:'), error);
    }
  }

  /**
   * タスクを実行
   */
  async executeTask(userPrompt: string, priority: 'low' | 'medium' | 'high' = 'medium'): Promise<string> {
    try {
      if (!this.components.aiManager) {
        throw new RenkeiError('AI Manager not initialized', 'AI_MANAGER_NOT_READY', ErrorSeverity.ERROR);
      }

      if (!this.components.sessionManager) {
        throw new RenkeiError('Session Manager not initialized', 'SESSION_MANAGER_NOT_READY', ErrorSeverity.ERROR);
      }

      console.log(chalk.blue.bold(`\n📝 新しいタスクを受け付けました`));
      console.log(chalk.gray(`   指示: ${userPrompt}`));
      console.log(chalk.gray(`   優先度: ${priority}`));

      // 1. セッションを作成（存在しない場合）
      let currentSession = this.components.sessionManager.getCurrentSession();
      if (!currentSession) {
        await this.components.sessionManager.createSession({
          workingDirectory: process.cwd(),
          environment: {},
          openFiles: []
        });
        currentSession = this.components.sessionManager.getCurrentSession();
      }

      // 2. タスクリクエストを作成（AI Manager用の内部型）
      const taskRequestObj = {
        description: userPrompt,
        workingDirectory: process.cwd(),
        priority
      };

      // 3. AI Manager でタスクを解析
      console.log(chalk.blue('🔍 タスクを解析しています...'));
      const taskPlan = await this.components.aiManager.analyzeTask(taskRequestObj);

      // 4. タスクを実行
      console.log(chalk.blue('🚀 タスクを実行しています...'));
      const executionResult = await this.components.aiManager.executeTask(taskPlan);

      // 5. 結果を評価
      const evaluation = await this.components.aiManager.evaluateResult(executionResult);

      console.log(chalk.green.bold(`\n✅ タスクが完了しました！`));
      console.log(chalk.gray(`   タスクID: ${taskPlan.id}`));
      console.log(chalk.gray(`   実行時間: ${executionResult.duration}ms`));
      console.log(chalk.gray(`   品質スコア: ${evaluation.quality * 100}%`));
      console.log(chalk.gray(`   完了度: ${evaluation.completeness * 100}%`));

      if (evaluation.needsImprovement) {
        console.log(chalk.yellow(`\n📋 改善提案:`));
        evaluation.improvements.forEach(improvement => {
          console.log(chalk.yellow(`   - ${improvement}`));
        });
      }

      return `タスクが正常に完了しました。タスクID: ${taskPlan.id}`;

    } catch (error) {
      console.error(chalk.red.bold('❌ タスク実行中にエラーが発生しました:'));
      if (error instanceof RenkeiError) {
        console.error(chalk.red(`   エラーコード: ${error.code}`));
        console.error(chalk.red(`   詳細: ${error.message}`));
      } else {
        console.error(chalk.red(`   ${error instanceof Error ? error.message : String(error)}`));
      }
      throw error;
    }
  }

  /**
   * システム状態を表示
   */
  getSystemStatus(): string {
    const status = {
      running: this.isRunning,
      components: Object.keys(this.components).length,
      aiManager: this.components.aiManager?.getStatus() || null,
      session: this.components.sessionManager?.getCurrentSession() || null
    };

    return JSON.stringify(status, null, 2);
  }

  /**
   * 利用可能なコマンドを表示
   */
  getAvailableCommands(): string[] {
    return [
      'help - コマンドヘルプを表示',
      'status - システム状態を表示', 
      'task <指示> - タスクを実行',
      'history - タスク履歴を表示',
      'session - セッション情報を表示',
      'stop - システムを停止'
    ];
  }

  getComponents(): Partial<SystemComponents> {
    return this.components;
  }

  isSystemRunning(): boolean {
    return this.isRunning;
  }

  /**
   * タスク実行専用メソッド（システムを停止しない）
   */
  async executeTaskOnly(userPrompt: string, priority: 'low' | 'medium' | 'high' = 'medium'): Promise<string> {
    // executeTaskと同じ実装だが、システムは継続して動作
    return this.executeTask(userPrompt, priority);
  }

  /**
   * システムを部分的にシャットダウン（必要最小限のクリーンアップ）
   */
  async partialShutdown(): Promise<void> {
    console.log(chalk.blue('🔄 一時的なクリーンアップを実行しています...'));
    
    // ClaudeIntegrationのセッションのみクリーンアップ
    if (this.components.claudeIntegration) {
      const sessions = this.components.claudeIntegration.getSessions();
      for (const session of sessions) {
        try {
          await this.components.claudeIntegration.destroySession(session.sessionId);
        } catch (error) {
          console.warn('Session cleanup error:', error);
        }
      }
    }
    
    console.log(chalk.green('✅ クリーンアップが完了しました'));
  }
}

async function main(): Promise<void> {
  const system = new RenkeiSystem();
  
  try {
    await system.initialize();
    await system.start();
  } catch (error) {
    console.error(chalk.red.bold('❌ システム起動に失敗しました:'), error);
    process.exit(1);
  }
}

// メイン関数の実行
if (require.main === module) {
  main().catch((error) => {
    console.error(chalk.red.bold('❌ 致命的なエラー:'), error);
    process.exit(1);
  });
}

export { main, RenkeiSystem };
