import { EventEmitter } from 'events';
import { ClaudeIntegration } from '../integrations/claude-integration';
import { ConfigManager } from './config-manager';
import { TaskEvaluator } from '../evaluators/task-evaluator';
import {
  TaskPlan,
  ExecutionResult,
  RiskAssessment,
  RenkeiError,
  ErrorSeverity,
} from '../interfaces/types';

// AI Manager固有の型定義
interface TaskRequest {
  description: string;
  workingDirectory: string;
  priority: 'low' | 'medium' | 'high';
  deadline?: string;
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
}

/**
 * AI管理者システム
 * 自然言語タスクの解析、計画生成、実行制御を行う核心システム
 */
export class AIManager extends EventEmitter {
  private claude: ClaudeIntegration;
  private evaluator: TaskEvaluator;
  private currentTask: TaskRequest | null = null;
  private currentPlan: TaskPlan | null = null;
  private executionStatus: TaskStatus = TaskStatus.IDLE;

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
  }

  /**
   * タスク分析・設計
   * 自然言語タスクを解析し、実装計画を生成する
   */
  async analyzeTask(request: TaskRequest): Promise<TaskPlan> {
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

以下の形式でJSON回答してください：
{
  "intent": "主要な目的・意図",
  "entities": ["関連する技術・ファイル・システム"],
  "requirements": ["機能要件"],
  "constraints": ["制約・条件"],
  "context": ["追加のコンテキスト情報"]
}
`;

    const result = await this.claude.sendMessage(analysisPrompt);

    try {
      const analysis = JSON.parse(result.content);
      this.emit(AIManagerEvents.NATURAL_LANGUAGE_ANALYSIS_COMPLETED, analysis);
      return analysis;
    } catch (parseError) {
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
    request: TaskRequest
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

    try {
      const plan = JSON.parse(result.content);
      this.emit(AIManagerEvents.IMPLEMENTATION_PLAN_GENERATED, plan);
      return plan;
    } catch (parseError) {
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
    currentTask: TaskRequest | null;
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
    this.removeAllListeners();
  }
}
