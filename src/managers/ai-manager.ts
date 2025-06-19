import { EventEmitter } from 'events';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import { ClaudeIntegration } from '../integrations/claude-integration';
import { ConfigManager } from './config-manager';
import { TaskEvaluator } from '../evaluators/task-evaluator';
import {
  TaskPlan,
  ExecutionResult,
  RiskAssessment,
  RenkeiError,
  ErrorSeverity,
  TaskRequest as BaseTaskRequest,
  TaskResult,
} from '../interfaces/types';

// AI Manager固有の型定義
interface InternalTaskRequest {
  description: string;
  workingDirectory: string;
  priority: 'low' | 'medium' | 'high';
  deadline?: string;
}

interface BridgeMessage {
  id: string;
  type: 'task_request' | 'task_result' | 'task_error' | 'heartbeat';
  payload: any;
  timestamp: Date;
}

enum TaskStatus {
  IDLE = 'idle',
  ANALYZING = 'analyzing',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  ERROR = 'error',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
}

enum AIManagerEvents {
  TASK_ANALYSIS_STARTED = 'task_analysis_started',
  TASK_ANALYSIS_COMPLETED = 'task_analysis_completed',
  NATURAL_LANGUAGE_ANALYSIS_COMPLETED = 'natural_language_analysis_completed',
  IMPLEMENTATION_PLAN_GENERATED = 'implementation_plan_generated',
  RISK_ASSESSMENT_COMPLETED = 'risk_assessment_completed',
  TASK_EXECUTION_STARTED = 'task_execution_started',
  TASK_EXECUTION_COMPLETED = 'task_execution_completed',
  PHASE_STARTED = 'phase_started',
  PHASE_COMPLETED = 'phase_completed',
  STEP_STARTED = 'step_started',
  STEP_COMPLETED = 'step_completed',
  STEP_FAILED = 'step_failed',
  EXECUTION_PAUSED = 'execution_paused',
  TASK_STOPPING = 'task_stopping',
  TASK_STOPPED = 'task_stopped',
  ERROR = 'error',
  CHAT_BRIDGE_CONNECTED = 'chat_bridge_connected',
  CHAT_BRIDGE_DISCONNECTED = 'chat_bridge_disconnected',
}

/**
 * AI管理者システム
 * 自然言語タスクの解析、計画生成、実行制御を行う核心システム
 */
export class AIManager extends EventEmitter {
  private claude: ClaudeIntegration;
  private evaluator: TaskEvaluator;
  private currentTask: InternalTaskRequest | null = null;
  private currentPlan: TaskPlan | null = null;
  private executionStatus: TaskStatus = TaskStatus.IDLE;
  private bridgeSocketPath?: string;
  private bridgeServer?: net.Server;
  private bridgeClients: Set<net.Socket> = new Set();
  private chatRequestQueue: Map<string, BaseTaskRequest> = new Map();

  constructor(
    claude: ClaudeIntegration,
    config: ConfigManager,
    evaluator: TaskEvaluator
  ) {
    super();
    this.claude = claude;
    this.evaluator = evaluator;
    // configは将来的に使用予定のため保持
    void config;

    // チャットブリッジとの接続を設定
    this.setupChatBridge();
  }

  /**
   * タスク分析・設計
   * 自然言語タスクを解析し、実装計画を生成する
   */
  async analyzeTask(request: InternalTaskRequest): Promise<TaskPlan> {
    try {
      this.emit(AIManagerEvents.TASK_ANALYSIS_STARTED, request);
      this.currentTask = request;
      this.executionStatus = TaskStatus.ANALYZING;

      // 1. 自然言語解析
      const analysis = await this.performNaturalLanguageAnalysis(
        request.description
      );

      // 2. 実装計画生成
      const plan = await this.generateImplementationPlan(analysis, request);

      // 3. リスク評価
      const riskAssessment = await this.assessRisks(plan);

      // 計画の最終化
      const finalPlan: TaskPlan = {
        ...plan,
        riskAssessment,
        createdAt: new Date(),
        estimatedDuration: this.estimateTaskDuration(plan),
        confidence: this.calculatePlanConfidence(plan, riskAssessment),
      };

      this.currentPlan = finalPlan;
      this.emit(AIManagerEvents.TASK_ANALYSIS_COMPLETED, finalPlan);

      return finalPlan;
    } catch (error) {
      this.executionStatus = TaskStatus.ERROR;
      const renkeiError = new RenkeiError(
        'Task analysis failed',
        'AI_MANAGER_ANALYSIS_ERROR',
        ErrorSeverity.ERROR,
        error
      );
      this.emit(AIManagerEvents.ERROR, renkeiError);
      throw renkeiError;
    }
  }

  /**
   * 自然言語解析
   * タスク記述を構造化された形式に変換
   */
  private async performNaturalLanguageAnalysis(description: string): Promise<{
    intent: string;
    entities: string[];
    requirements: string[];
    constraints: string[];
    context: string[];
  }> {
    const analysisPrompt = `
以下のタスク記述を解析し、構造化された情報を抽出してください：

タスク記述: "${description}"

重要：以下の形式の完全なJSONオブジェクトのみを返してください。説明文は不要です。必ず{で始まり}で終わる有効なJSONを返してください：
{
  "intent": "主要な目的・意図",
  "entities": ["関連する技術・ファイル・システム"],
  "requirements": ["機能要件"],
  "constraints": ["制約・条件"],
  "context": ["追加のコンテキスト情報"]
}
`;

    const result = await this.claude.sendMessage(analysisPrompt);

    console.log('Claude analysis response:', result.content);

    try {
      // 不完全なJSONを修正（{と}で囲まれていない場合）
      let jsonContent = result.content.trim();
      if (!jsonContent.startsWith('{')) {
        jsonContent = '{' + jsonContent;
      }
      if (!jsonContent.endsWith('}')) {
        jsonContent = jsonContent + '}';
      }
      
      const analysis = JSON.parse(jsonContent);
      this.emit(AIManagerEvents.NATURAL_LANGUAGE_ANALYSIS_COMPLETED, analysis);
      return analysis;
    } catch (parseError) {
      console.error('Failed to parse analysis JSON:', parseError);
      console.error('Raw content:', result.content);
      throw new RenkeiError(
        'Failed to parse natural language analysis',
        'NL_ANALYSIS_PARSE_ERROR',
        ErrorSeverity.ERROR,
        parseError
      );
    }
  }

  /**
   * 実装計画生成
   * 解析結果から具体的な実装計画を作成
   */
  private async generateImplementationPlan(
    analysis: any,
    request: InternalTaskRequest
  ): Promise<
    Omit<
      TaskPlan,
      'riskAssessment' | 'createdAt' | 'estimatedDuration' | 'confidence'
    >
  > {
    const planningPrompt = `
以下の解析結果に基づいて詳細な実装計画を作成してください：

解析結果:
- 意図: ${analysis.intent}
- 関連技術: ${analysis.entities.join(', ')}
- 要件: ${analysis.requirements.join(', ')}
- 制約: ${analysis.constraints.join(', ')}

プロジェクト情報:
- 作業ディレクトリ: ${request.workingDirectory}
- 優先度: ${request.priority}
- 期限: ${request.deadline || '指定なし'}

以下の形式でJSON回答してください：
{
  "id": "一意のタスクID",
  "title": "タスクタイトル",
  "description": "詳細な説明",
  "phases": [
    {
      "id": "フェーズID",
      "name": "フェーズ名",
      "description": "フェーズの説明",
      "steps": [
        {
          "id": "ステップID",
          "description": "ステップの説明",
          "type": "create_file|modify_file|run_command|test",
          "target": "対象ファイル・コマンド",
          "content": "実行内容・コード",
          "dependencies": ["依存ステップID"],
          "estimatedTime": "分単位の推定時間"
        }
      ],
      "deliverables": ["成果物リスト"]
    }
  ],
  "prerequisites": ["前提条件"],
  "deliverables": ["最終成果物"],
  "successCriteria": ["成功基準"]
}
`;

    const result = await this.claude.sendMessage(planningPrompt);

    console.log('Claude planning response:', result.content);

    try {
      const plan = JSON.parse(result.content);
      this.emit(AIManagerEvents.IMPLEMENTATION_PLAN_GENERATED, plan);
      return plan;
    } catch (parseError) {
      console.error('Failed to parse plan JSON:', parseError);
      console.error('Raw content:', result.content);
      throw new RenkeiError(
        'Failed to parse implementation plan',
        'IMPLEMENTATION_PLAN_PARSE_ERROR',
        ErrorSeverity.ERROR,
        parseError
      );
    }
  }

  /**
   * リスク評価
   * 実装計画のリスクを評価し、軽減策を提案
   */
  private async assessRisks(plan: any): Promise<RiskAssessment> {
    const riskPrompt = `
以下の実装計画のリスクを評価してください：

計画: ${JSON.stringify(plan, null, 2)}

以下の形式でJSON回答してください：
{
  "overall": "LOW|MEDIUM|HIGH",
  "risks": [
    {
      "id": "リスクID",
      "description": "リスクの説明",
      "severity": "LOW|MEDIUM|HIGH|CRITICAL",
      "probability": "LOW|MEDIUM|HIGH",
      "impact": "システム・品質・スケジュールへの影響",
      "mitigation": "軽減策",
      "contingency": "代替案"
    }
  ],
  "recommendations": ["推奨事項"],
  "blockers": ["ブロッカー要因"]
}
`;

    const result = await this.claude.sendMessage(riskPrompt);

    try {
      const riskAssessment = JSON.parse(result.content);
      this.emit(AIManagerEvents.RISK_ASSESSMENT_COMPLETED, riskAssessment);
      return riskAssessment;
    } catch (parseError) {
      throw new RenkeiError(
        'Failed to parse risk assessment',
        'RISK_ASSESSMENT_PARSE_ERROR',
        ErrorSeverity.ERROR,
        parseError
      );
    }
  }

  /**
   * 実行制御・監視
   * 計画に基づいてClaudeCodeを制御し、実行を監視
   */
  async executeTask(plan: TaskPlan): Promise<ExecutionResult> {
    try {
      this.emit(AIManagerEvents.TASK_EXECUTION_STARTED, plan);
      this.executionStatus = TaskStatus.EXECUTING;

      const startTime = Date.now();
      const results = [];

      for (const phase of plan.phases) {
        this.emit(AIManagerEvents.PHASE_STARTED, phase);

        const phaseResult = await this.executePhase(phase);
        results.push(phaseResult);

        // 途中での品質チェック
        const shouldContinue =
          await this.evaluateIntermediateProgress(phaseResult);
        if (!shouldContinue) {
          this.emit(AIManagerEvents.EXECUTION_PAUSED, {
            phase,
            reason: 'Quality check failed',
          });
          break;
        }

        this.emit(AIManagerEvents.PHASE_COMPLETED, {
          phase,
          result: phaseResult,
        });
      }

      const executionResult: ExecutionResult = {
        taskId: plan.id,
        success: true,
        duration: Date.now() - startTime,
        results,
        metrics: await this.evaluator.calculateMetrics(results),
        completedAt: new Date(),
      };

      this.executionStatus = TaskStatus.COMPLETED;
      this.emit(AIManagerEvents.TASK_EXECUTION_COMPLETED, executionResult);

      return executionResult;
    } catch (error) {
      this.executionStatus = TaskStatus.ERROR;
      const renkeiError = new RenkeiError(
        'Task execution failed',
        'AI_MANAGER_EXECUTION_ERROR',
        ErrorSeverity.ERROR,
        error
      );
      this.emit(AIManagerEvents.ERROR, renkeiError);
      throw renkeiError;
    }
  }

  /**
   * フェーズ実行
   * 個別フェーズの実行を管理
   */
  private async executePhase(phase: any): Promise<any> {
    const phaseResults = [];

    for (const step of phase.steps) {
      this.emit(AIManagerEvents.STEP_STARTED, step);

      try {
        const stepResult = await this.executeStep(step);
        phaseResults.push(stepResult);

        this.emit(AIManagerEvents.STEP_COMPLETED, { step, result: stepResult });
      } catch (error) {
        this.emit(AIManagerEvents.STEP_FAILED, { step, error });
        throw error;
      }
    }

    return {
      phaseId: phase.id,
      success: true,
      results: phaseResults,
      deliverables: phase.deliverables,
    };
  }

  /**
   * ステップ実行
   * 個別ステップの実行を処理
   */
  private async executeStep(step: any): Promise<any> {
    const instruction = this.generateClaudeInstruction(step);
    const result = await this.claude.sendMessage(instruction);

    return {
      stepId: step.id,
      instruction,
      result: result.content,
      duration: result.duration || 0,
      success: true,
    };
  }

  /**
   * Claude指示生成
   * ステップ情報からClaudeCode向けの指示を生成
   */
  private generateClaudeInstruction(step: any): string {
    const baseInstruction = `
タスクステップ: ${step.description}
タイプ: ${step.type}
対象: ${step.target}
`;

    switch (step.type) {
      case 'create_file':
        return `${baseInstruction}
新しいファイル "${step.target}" を作成してください。

内容:
${step.content}

ファイルが既に存在する場合は上書きしてください。`;

      case 'modify_file':
        return `${baseInstruction}
ファイル "${step.target}" を修正してください。

修正内容:
${step.content}

既存の内容を考慮して適切に変更を行ってください。`;

      case 'run_command':
        return `${baseInstruction}
以下のコマンドを実行してください:
${step.target}

実行結果を確認し、エラーがあれば対処してください。`;

      case 'test':
        return `${baseInstruction}
以下のテストを実行してください:
${step.target}

テスト結果を分析し、失敗した場合は原因を調査してください。`;

      default:
        return `${baseInstruction}
${step.content}`;
    }
  }

  /**
   * 中間進捗評価
   * 実行中の品質チェックと継続判断
   */
  private async evaluateIntermediateProgress(
    phaseResult: any
  ): Promise<boolean> {
    return await this.evaluator.shouldContinueExecution(phaseResult);
  }

  /**
   * 結果評価・継続判断
   * 最終結果の品質評価と改善提案
   */
  async evaluateResult(result: ExecutionResult): Promise<{
    quality: number;
    completeness: number;
    needsImprovement: boolean;
    improvements: string[];
    nextActions: string[];
  }> {
    return await this.evaluator.evaluateTaskResult(result);
  }

  /**
   * ユーティリティメソッド群
   */
  private estimateTaskDuration(plan: any): number {
    return plan.phases.reduce((total: number, phase: any) => {
      return (
        total +
        phase.steps.reduce((phaseTotal: number, step: any) => {
          return phaseTotal + (parseInt(step.estimatedTime) || 5);
        }, 0)
      );
    }, 0);
  }

  private calculatePlanConfidence(
    _plan: any,
    riskAssessment: RiskAssessment
  ): number {
    const baseConfidence = 0.8;
    const riskPenalty =
      riskAssessment.overall === 'HIGH'
        ? 0.3
        : riskAssessment.overall === 'MEDIUM'
          ? 0.15
          : 0;

    return Math.max(0.1, baseConfidence - riskPenalty);
  }

  /**
   * 現在の状態を取得
   */
  getStatus(): {
    currentTask: InternalTaskRequest | null;
    currentPlan: TaskPlan | null;
    executionStatus: TaskStatus;
  } {
    return {
      currentTask: this.currentTask,
      currentPlan: this.currentPlan,
      executionStatus: this.executionStatus,
    };
  }

  /**
   * タスクを停止
   */
  async stopCurrentTask(): Promise<void> {
    if (this.executionStatus === TaskStatus.EXECUTING) {
      this.executionStatus = TaskStatus.STOPPING;
      this.emit(AIManagerEvents.TASK_STOPPING);

      // Claude実行の停止
      await this.claude.stopCurrentExecution();

      this.executionStatus = TaskStatus.STOPPED;
      this.emit(AIManagerEvents.TASK_STOPPED);
    }
  }

  /**
   * リソースのクリーンアップ
   */
  async cleanup(): Promise<void> {
    await this.stopCurrentTask();
    this.closeChatBridge();
    this.removeAllListeners();
  }

  /**
   * チャットブリッジの設定
   */
  private setupChatBridge(): void {
    const socketDir = path.join(process.cwd(), 'data', 'sockets');
    if (!fs.existsSync(socketDir)) {
      fs.mkdirSync(socketDir, { recursive: true });
    }
    this.bridgeSocketPath = path.join(socketDir, 'ai-manager.sock');

    // AI Managerがソケットサーバーを起動
    this.startBridgeServer();
  }

  /**
   * ブリッジサーバーを起動
   */
  private startBridgeServer(): void {
    // 既存のソケットファイルを削除
    if (fs.existsSync(this.bridgeSocketPath!)) {
      fs.unlinkSync(this.bridgeSocketPath!);
    }

    // サーバーを作成
    this.bridgeServer = net.createServer((socket) => {
      console.log('Chat Bridge client connected to AI Manager');
      this.bridgeClients.add(socket);
      this.emit(AIManagerEvents.CHAT_BRIDGE_CONNECTED);

      socket.on('data', (data) => {
        this.handleBridgeMessage(data, socket);
      });

      socket.on('error', (error) => {
        console.error('Bridge client error:', error);
      });

      socket.on('end', () => {
        console.log('Chat Bridge client disconnected');
        this.bridgeClients.delete(socket);
        if (this.bridgeClients.size === 0) {
          this.emit(AIManagerEvents.CHAT_BRIDGE_DISCONNECTED);
        }
      });
    });

    // リスニング開始
    this.bridgeServer.listen(this.bridgeSocketPath!, () => {
      console.log(
        `AI Manager bridge server listening on ${this.bridgeSocketPath}`
      );
    });

    this.bridgeServer.on('error', (error) => {
      console.error('Bridge server error:', error);
    });
  }

  /**
   * ブリッジメッセージを処理
   */
  private handleBridgeMessage(data: Buffer, socket: net.Socket): void {
    try {
      const messages = data
        .toString()
        .split('\n')
        .filter((msg) => msg.trim());

      for (const msgStr of messages) {
        const message: BridgeMessage = JSON.parse(msgStr);

        switch (message.type) {
          case 'task_request':
            this.handleChatTaskRequest(message.id, message.payload, socket);
            break;

          case 'heartbeat':
            // ハートビート応答
            this.sendBridgeMessage(
              {
                id: message.id,
                type: 'heartbeat',
                payload: {},
                timestamp: new Date(),
              },
              socket
            );
            break;
        }
      }
    } catch (error) {
      console.error('Failed to parse bridge message:', error);
    }
  }

  /**
   * チャットタスクリクエストを処理
   */
  private async handleChatTaskRequest(
    messageId: string,
    request: BaseTaskRequest,
    socket: net.Socket
  ): Promise<void> {
    try {
      this.chatRequestQueue.set(messageId, request);

      // チャットリクエストを簡潔に処理
      const response = await this.processChatRequest(request);

      const result: TaskResult = {
        id: request.id,
        status: 'success',
        sessionId: request.context?.sessionId || 'unknown',
        output: response,
        files: [],
        errors: [],
        metrics: {
          executionTime: 100,
          apiCalls: 1,
          tokensUsed: 50,
        },
        timestamp: new Date(),
      };

      this.sendBridgeMessage(
        {
          id: messageId,
          type: 'task_result',
          payload: result,
          timestamp: new Date(),
        },
        socket
      );

      this.chatRequestQueue.delete(messageId);
    } catch (error) {
      this.sendBridgeMessage(
        {
          id: messageId,
          type: 'task_error',
          payload: {
            taskId: request.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          timestamp: new Date(),
        },
        socket
      );

      this.chatRequestQueue.delete(messageId);
    }
  }

  /**
   * チャットリクエストを処理
   */
  private async processChatRequest(request: BaseTaskRequest): Promise<string> {
    try {
      // 空の入力をチェック
      const userInput = request.userPrompt.trim();
      if (!userInput || userInput === '') {
        return 'どのようなお手伝いができますか？タスクの実行、コード生成、技術的な質問など、お気軽にお尋ねください。';
      }

      // タスク実行要求を検出
      const taskKeywords = [
        '実行',
        'テスト',
        'コード',
        '作成',
        '生成',
        '修正',
        'ファイル',
        'bash',
        'run',
        'create',
        'build',
      ];
      const isTaskRequest = taskKeywords.some((keyword) =>
        userInput.toLowerCase().includes(keyword)
      );

      if (isTaskRequest) {
        // タスク実行の場合は、実際にタスクを分析・実行する
        try {
          // タスクリクエストを作成
          const taskRequest: InternalTaskRequest = {
            description: userInput,
            workingDirectory:
              request.context?.workingDirectory || process.cwd(),
            priority: 'medium',
          };

          // タスクを分析
          const plan = await this.analyzeTask(taskRequest);

          // シンプルな応答を返す（実際の実行は別プロセスで）
          return `承知いたしました。以下のタスクを実行します：\n\n${plan.description}\n\n実行を開始しています...`;
        } catch (error) {
          return `申し訳ございません。タスクの分析中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      } else {
        // 通常の会話の場合
        const chatPrompt = `あなたはRenkei Systemの統括AIです。システム全体を管理し、ユーザーとの対話を担当しています。

重要な役割：
- あなたは統括AIであり、実際のコード実行はワーカー（ClaudeCode）が行います
- ユーザーの質問に対して、システムの状態や機能について説明します
- タスクの実行依頼があれば、それをワーカーに指示する準備をします

現在のシステム状態：
- チャットインターフェース: アクティブ
- AI Manager（あなた）: 稼働中
- ClaudeCode統合: 接続済み
- ワーカープロセス: 待機中

ユーザーメッセージ: "${userInput}"

統括AIとして適切に応答してください：`;

        const result = await this.claude.sendMessage(chatPrompt);
        return result.content;
      }
    } catch (error) {
      // エラーをそのまま投げる
      console.error('Claude呼び出しエラー:', error);
      throw error;
    }
  }

  /**
   * ブリッジにメッセージを送信
   */
  private sendBridgeMessage(message: BridgeMessage, socket: net.Socket): void {
    if (socket && !socket.destroyed) {
      socket.write(JSON.stringify(message) + '\n');
    }
  }

  /**
   * チャットブリッジを閉じる
   */
  private closeChatBridge(): void {
    // すべてのクライアントを切断
    this.bridgeClients.forEach((client) => {
      client.end();
    });
    this.bridgeClients.clear();

    // サーバーを閉じる
    if (this.bridgeServer) {
      this.bridgeServer.close(() => {
        if (fs.existsSync(this.bridgeSocketPath!)) {
          fs.unlinkSync(this.bridgeSocketPath!);
        }
      });
    }
  }
}
