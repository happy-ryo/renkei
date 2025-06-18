import { EventEmitter } from 'events';
import { ExecutionResult, TaskMetrics } from '../interfaces/types.js';

/**
 * タスク評価システム
 * 実行中・実行後のタスク品質評価と継続判断を行う
 */
export class TaskEvaluator extends EventEmitter {
  private qualityThreshold: number;
  private completenessThreshold: number;
  private performanceMetrics: Map<string, number> = new Map();

  constructor(
    options: {
      qualityThreshold?: number;
      completenessThreshold?: number;
    } = {}
  ) {
    super();
    this.qualityThreshold = options.qualityThreshold || 0.7;
    this.completenessThreshold = options.completenessThreshold || 0.8;
  }

  /**
   * 中間進捗での実行継続判断
   */
  async shouldContinueExecution(phaseResult: any): Promise<boolean> {
    try {
      // 基本的な成功判定
      if (!phaseResult.success) {
        this.emit('continue_evaluation', {
          phaseResult,
          decision: false,
          reason: 'Phase failed',
        });
        return false;
      }

      // エラー率チェック
      const errorRate = this.calculateErrorRate(phaseResult);
      if (errorRate > 0.3) {
        this.emit('continue_evaluation', {
          phaseResult,
          decision: false,
          reason: 'High error rate',
        });
        return false;
      }

      // 品質スコア評価
      const qualityScore = await this.evaluatePhaseQuality(phaseResult);
      if (qualityScore < this.qualityThreshold) {
        this.emit('continue_evaluation', {
          phaseResult,
          decision: false,
          reason: 'Low quality score',
        });
        return false;
      }

      this.emit('continue_evaluation', {
        phaseResult,
        decision: true,
        reason: 'Quality criteria met',
      });
      return true;
    } catch (error) {
      this.emit('evaluation_error', { error, phaseResult });
      // エラーが発生した場合は安全側に倒して停止
      return false;
    }
  }

  /**
   * フェーズ品質評価
   */
  private async evaluatePhaseQuality(phaseResult: any): Promise<number> {
    let totalScore = 0;
    let criteriaCount = 0;

    // 1. 成功率評価 (30%)
    const successRate = this.calculateSuccessRate(phaseResult);
    totalScore += successRate * 0.3;
    criteriaCount++;

    // 2. 完了度評価 (25%)
    const completeness = this.calculateCompleteness(phaseResult);
    totalScore += completeness * 0.25;
    criteriaCount++;

    // 3. パフォーマンス評価 (20%)
    const performance = this.evaluatePerformance(phaseResult);
    totalScore += performance * 0.2;
    criteriaCount++;

    // 4. 成果物品質評価 (25%)
    const deliverableQuality = await this.evaluateDeliverables(phaseResult);
    totalScore += deliverableQuality * 0.25;
    criteriaCount++;

    return criteriaCount > 0 ? totalScore : 0;
  }

  /**
   * 最終タスク結果評価
   */
  async evaluateTaskResult(executionResult: ExecutionResult): Promise<{
    quality: number;
    completeness: number;
    needsImprovement: boolean;
    improvements: string[];
    nextActions: string[];
  }> {
    const quality = await this.calculateOverallQuality(executionResult);
    const completeness = this.calculateOverallCompleteness(executionResult);
    const needsImprovement =
      quality < this.qualityThreshold ||
      completeness < this.completenessThreshold;

    const improvements = await this.generateImprovementSuggestions(
      executionResult,
      quality,
      completeness
    );
    const nextActions = await this.generateNextActions(
      executionResult,
      quality,
      completeness
    );

    const evaluation = {
      quality,
      completeness,
      needsImprovement,
      improvements,
      nextActions,
    };

    this.emit('task_evaluation_completed', {
      result: executionResult,
      evaluation,
    });
    return evaluation;
  }

  /**
   * メトリクス計算
   */
  async calculateMetrics(results: any[]): Promise<TaskMetrics> {
    const totalDuration = results.reduce((sum, result) => {
      return sum + (result.duration || 0);
    }, 0);

    const apiCalls = results.reduce((sum, result) => {
      return sum + (result.apiCalls || 1);
    }, 0);

    // トークン使用量の推定（実際のAPIからは取得できないので推定）
    const tokensUsed = results.reduce((sum, result) => {
      const contentLength = JSON.stringify(result).length;
      return sum + Math.ceil(contentLength / 4); // 大まかな推定
    }, 0);

    const metrics: TaskMetrics = {
      executionTime: totalDuration,
      apiCalls,
      tokensUsed,
      cost: this.calculateCost(tokensUsed, apiCalls),
    };

    this.emit('metrics_calculated', metrics);
    return metrics;
  }

  /**
   * プライベートメソッド群
   */

  private calculateErrorRate(phaseResult: any): number {
    if (!phaseResult.results || phaseResult.results.length === 0) {
      return 0;
    }

    const errorCount = phaseResult.results.filter(
      (result: any) => !result.success
    ).length;
    return errorCount / phaseResult.results.length;
  }

  private calculateSuccessRate(phaseResult: any): number {
    if (!phaseResult.results || phaseResult.results.length === 0) {
      return 0;
    }

    const successCount = phaseResult.results.filter(
      (result: any) => result.success
    ).length;
    return successCount / phaseResult.results.length;
  }

  private calculateCompleteness(phaseResult: any): number {
    // 成果物の完成度を評価
    if (!phaseResult.deliverables || phaseResult.deliverables.length === 0) {
      return 0.5; // 成果物情報がない場合は中間値
    }

    // 成果物が期待通りに作成されているかチェック
    // 実際の実装では、ファイルの存在確認、内容チェックなどを行う
    return 0.8; // 仮の値
  }

  private evaluatePerformance(phaseResult: any): number {
    const duration = phaseResult.duration || 0;
    const stepCount = phaseResult.results?.length || 1;

    // 1ステップあたりの平均時間
    const avgTimePerStep = duration / stepCount;

    // パフォーマンス評価（5秒/ステップを基準とする）
    const baselineTime = 5000; // 5秒
    const performanceScore = Math.min(1, baselineTime / avgTimePerStep);

    return Math.max(0, performanceScore);
  }

  private async evaluateDeliverables(phaseResult: any): Promise<number> {
    // 成果物の品質を評価
    // 実際の実装では、ファイル内容の解析、構文チェック、テスト実行などを行う

    if (!phaseResult.deliverables) {
      return 0.5;
    }

    // 基本的な評価（実際にはより詳細な分析が必要）
    let qualityScore = 0.7;

    // エラーがあった場合は品質を下げる
    if (phaseResult.results) {
      const hasErrors = phaseResult.results.some(
        (result: any) => !result.success
      );
      if (hasErrors) {
        qualityScore *= 0.8;
      }
    }

    return qualityScore;
  }

  private async calculateOverallQuality(
    result: ExecutionResult
  ): Promise<number> {
    if (!result.results || result.results.length === 0) {
      return 0;
    }

    let totalQuality = 0;
    for (const phaseResult of result.results) {
      const phaseQuality = await this.evaluatePhaseQuality(phaseResult);
      totalQuality += phaseQuality;
    }

    return totalQuality / result.results.length;
  }

  private calculateOverallCompleteness(result: ExecutionResult): number {
    if (!result.results || result.results.length === 0) {
      return 0;
    }

    let totalCompleteness = 0;
    for (const phaseResult of result.results) {
      const completeness = this.calculateCompleteness(phaseResult);
      totalCompleteness += completeness;
    }

    return totalCompleteness / result.results.length;
  }

  private async generateImprovementSuggestions(
    _executionResult: ExecutionResult,
    quality: number,
    completeness: number
  ): Promise<string[]> {
    const suggestions: string[] = [];

    if (quality < 0.7) {
      suggestions.push(
        'コード品質の向上: より詳細なエラーハンドリングと入力検証を追加'
      );
      suggestions.push('テストカバレッジの改善: 単体テストと統合テストの追加');
    }

    if (completeness < 0.8) {
      suggestions.push('機能の完全性向上: 未実装の機能を完成させる');
      suggestions.push('ドキュメント整備: API仕様書とユーザーガイドの充実');
    }

    if (_executionResult.duration > 300000) {
      // 5分以上
      suggestions.push('パフォーマンス最適化: 実行時間の短縮');
      suggestions.push('処理の並列化: 非同期処理の活用');
    }

    // 結果に基づいた具体的な提案
    const errorCount = this.countErrors(_executionResult);
    if (errorCount > 0) {
      suggestions.push(`エラー修正: ${errorCount}件のエラーを解決`);
    }

    return suggestions;
  }

  private async generateNextActions(
    _executionResult: ExecutionResult,
    quality: number,
    completeness: number
  ): Promise<string[]> {
    const actions: string[] = [];

    if (quality >= 0.8 && completeness >= 0.8) {
      actions.push('タスク完了: 品質基準を満たしています');
      actions.push('本番環境への展開準備');
      actions.push('ユーザーテストの実施');
    } else if (quality >= 0.6 && completeness >= 0.6) {
      actions.push('部分的な改善実施');
      actions.push('優先度の高い問題の修正');
      actions.push('段階的リリースの検討');
    } else {
      actions.push('大幅な見直し・修正が必要');
      actions.push('設計の再検討');
      actions.push('実装アプローチの変更');
    }

    // 具体的な次のステップ
    if (completeness < 0.8) {
      actions.push('残りの機能実装を継続');
    }

    if (quality < 0.7) {
      actions.push('品質改善に集中');
      actions.push('コードレビューの実施');
    }

    return actions;
  }

  private calculateCost(tokensUsed: number, apiCalls: number): number {
    // 仮のコスト計算（実際のAPIプライシングに基づいて調整）
    const tokenCost = tokensUsed * 0.00001; // $0.00001 per token
    const callCost = apiCalls * 0.001; // $0.001 per call
    return tokenCost + callCost;
  }

  private countErrors(result: ExecutionResult): number {
    if (!result.results) return 0;

    return result.results.reduce((count, phaseResult) => {
      if (!phaseResult.results) return count;
      return count + phaseResult.results.filter((r: any) => !r.success).length;
    }, 0);
  }

  /**
   * 評価履歴の取得
   */
  getPerformanceMetrics(): Record<string, number> {
    return Object.fromEntries(this.performanceMetrics);
  }

  /**
   * 評価基準の更新
   */
  updateThresholds(quality: number, completeness: number): void {
    this.qualityThreshold = Math.max(0, Math.min(1, quality));
    this.completenessThreshold = Math.max(0, Math.min(1, completeness));

    this.emit('thresholds_updated', {
      qualityThreshold: this.qualityThreshold,
      completenessThreshold: this.completenessThreshold,
    });
  }

  /**
   * 評価レポート生成
   */
  generateEvaluationReport(result: ExecutionResult, evaluation: any): string {
    const report = `
# タスク評価レポート

## 実行サマリー
- タスクID: ${result.taskId}
- 実行時間: ${(result.duration / 1000).toFixed(2)}秒
- 完了日時: ${result.completedAt.toISOString()}

## 品質評価
- 全体品質: ${(evaluation.quality * 100).toFixed(1)}%
- 完了度: ${(evaluation.completeness * 100).toFixed(1)}%
- 改善必要: ${evaluation.needsImprovement ? 'はい' : 'いいえ'}

## 改善提案
${evaluation.improvements.map((imp: string) => `- ${imp}`).join('\n')}

## 次のアクション
${evaluation.nextActions.map((action: string) => `- ${action}`).join('\n')}

## メトリクス
- API呼び出し数: ${result.metrics?.apiCalls || 0}
- トークン使用量: ${result.metrics?.tokensUsed || 0}
- 推定コスト: $${result.metrics?.cost?.toFixed(4) || '0.0000'}
`;

    return report;
  }
}
