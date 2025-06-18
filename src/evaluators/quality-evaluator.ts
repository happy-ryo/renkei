/**
 * Quality Evaluator - コード品質と機能完成度の評価システム
 *
 * 実装されたコードの品質を多角的に評価し、
 * 継続的改善のための具体的なフィードバックを提供します。
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

/**
 * 品質評価メトリクス
 */
export interface QualityMetrics {
  // コード品質スコア
  codeQuality: {
    score: number; // 0-100
    lintErrors: number;
    typeErrors: number;
    testCoverage: number;
    complexity: number;
  };

  // 機能完成度スコア
  functionality: {
    score: number; // 0-100
    implementedFeatures: string[];
    missingFeatures: string[];
    workingTests: number;
    totalTests: number;
  };

  // ユーザビリティスコア
  usability: {
    score: number; // 0-100
    errorHandling: number;
    documentation: number;
    apiConsistency: number;
    performanceScore: number;
  };

  // 総合スコア
  overall: {
    score: number; // 0-100
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    recommendation: string;
  };
}

/**
 * 評価結果詳細
 */
export interface EvaluationResult {
  timestamp: Date;
  projectPath: string;
  metrics: QualityMetrics;
  issues: QualityIssue[];
  suggestions: QualitySuggestion[];
  executionTime: number; // ms
}

/**
 * 品質課題
 */
export interface QualityIssue {
  severity: 'critical' | 'major' | 'minor' | 'info';
  category: 'code' | 'functionality' | 'usability' | 'performance';
  file?: string;
  line?: number;
  message: string;
  suggestion: string;
}

/**
 * 品質改善提案
 */
export interface QualitySuggestion {
  priority: 'high' | 'medium' | 'low';
  category: 'refactoring' | 'testing' | 'documentation' | 'performance';
  title: string;
  description: string;
  estimatedEffort: 'small' | 'medium' | 'large';
  expectedImpact: string;
}

/**
 * 評価設定
 */
export interface EvaluationConfig {
  projectPath: string;
  includePatterns: string[];
  excludePatterns: string[];

  // 評価重み設定
  weights: {
    codeQuality: number;
    functionality: number;
    usability: number;
  };

  // しきい値設定
  thresholds: {
    minCoverage: number;
    maxComplexity: number;
    minScore: number;
  };
}

/**
 * 品質評価エンジン
 *
 * コード品質、機能完成度、ユーザビリティを総合的に評価し、
 * 改善提案を生成するシステム
 */
export class QualityEvaluator extends EventEmitter {
  private config: EvaluationConfig;
  private isEvaluating = false;

  constructor(config: EvaluationConfig) {
    super();
    this.config = config;
  }

  /**
   * 総合品質評価を実行
   */
  async evaluate(): Promise<EvaluationResult> {
    if (this.isEvaluating) {
      throw new Error('Evaluation already in progress');
    }

    const startTime = Date.now();
    this.isEvaluating = true;

    try {
      this.emit('evaluationStarted');

      // 各種メトリクス収集
      const [codeQuality, functionality, usability] = await Promise.all([
        this.evaluateCodeQuality(),
        this.evaluateFunctionality(),
        this.evaluateUsability(),
      ]);

      // 総合スコア計算
      const overall = this.calculateOverallScore(
        codeQuality,
        functionality,
        usability
      );

      const metrics: QualityMetrics = {
        codeQuality,
        functionality,
        usability,
        overall,
      };

      // 課題と提案生成
      const [issues, suggestions] = await Promise.all([
        this.identifyIssues(metrics),
        this.generateSuggestions(metrics),
      ]);

      const result: EvaluationResult = {
        timestamp: new Date(),
        projectPath: this.config.projectPath,
        metrics,
        issues,
        suggestions,
        executionTime: Date.now() - startTime,
      };

      this.emit('evaluationCompleted', result);
      return result;
    } catch (error) {
      this.emit('evaluationError', error);
      throw error;
    } finally {
      this.isEvaluating = false;
    }
  }

  /**
   * コード品質評価
   */
  private async evaluateCodeQuality(): Promise<QualityMetrics['codeQuality']> {
    this.emit('progress', { phase: 'codeQuality', status: 'started' });

    const [lintErrors, typeErrors, testCoverage, complexity] =
      await Promise.all([
        this.runLintCheck(),
        this.runTypeCheck(),
        this.measureTestCoverage(),
        this.measureComplexity(),
      ]);

    // スコア計算（各指標を正規化して重み付け平均）
    const lintScore = Math.max(0, 100 - lintErrors * 5);
    const typeScore = Math.max(0, 100 - typeErrors * 10);
    const coverageScore = testCoverage;
    const complexityScore = Math.max(
      0,
      100 - Math.max(0, complexity - this.config.thresholds.maxComplexity) * 10
    );

    const score = Math.round(
      (lintScore + typeScore + coverageScore + complexityScore) / 4
    );

    this.emit('progress', { phase: 'codeQuality', status: 'completed', score });

    return {
      score,
      lintErrors,
      typeErrors,
      testCoverage,
      complexity,
    };
  }

  /**
   * 機能完成度評価
   */
  private async evaluateFunctionality(): Promise<
    QualityMetrics['functionality']
  > {
    this.emit('progress', { phase: 'functionality', status: 'started' });

    const [testResults, featureAnalysis] = await Promise.all([
      this.runTests(),
      this.analyzeFeatureCompleteness(),
    ]);

    const workingTestsRatio =
      testResults.total > 0
        ? (testResults.passed / testResults.total) * 100
        : 0;

    const featureCompletionRatio =
      featureAnalysis.total > 0
        ? (featureAnalysis.implemented.length / featureAnalysis.total) * 100
        : 0;

    const score = Math.round((workingTestsRatio + featureCompletionRatio) / 2);

    this.emit('progress', {
      phase: 'functionality',
      status: 'completed',
      score,
    });

    return {
      score,
      implementedFeatures: featureAnalysis.implemented,
      missingFeatures: featureAnalysis.missing,
      workingTests: testResults.passed,
      totalTests: testResults.total,
    };
  }

  /**
   * ユーザビリティ評価
   */
  private async evaluateUsability(): Promise<QualityMetrics['usability']> {
    this.emit('progress', { phase: 'usability', status: 'started' });

    const [errorHandling, documentation, apiConsistency, performance] =
      await Promise.all([
        this.evaluateErrorHandling(),
        this.evaluateDocumentation(),
        this.evaluateApiConsistency(),
        this.evaluatePerformance(),
      ]);

    const score = Math.round(
      (errorHandling + documentation + apiConsistency + performance) / 4
    );

    this.emit('progress', { phase: 'usability', status: 'completed', score });

    return {
      score,
      errorHandling,
      documentation,
      apiConsistency,
      performanceScore: performance,
    };
  }

  /**
   * 総合スコア計算
   */
  private calculateOverallScore(
    codeQuality: QualityMetrics['codeQuality'],
    functionality: QualityMetrics['functionality'],
    usability: QualityMetrics['usability']
  ): QualityMetrics['overall'] {
    const weights = this.config.weights;
    const totalWeight =
      weights.codeQuality + weights.functionality + weights.usability;

    const score = Math.round(
      (codeQuality.score * weights.codeQuality +
        functionality.score * weights.functionality +
        usability.score * weights.usability) /
        totalWeight
    );

    // グレード決定
    let grade: QualityMetrics['overall']['grade'];
    if (score >= 90) grade = 'A';
    else if (score >= 80) grade = 'B';
    else if (score >= 70) grade = 'C';
    else if (score >= 60) grade = 'D';
    else grade = 'F';

    // 推奨事項生成
    const recommendation = this.generateRecommendation(score, grade);

    return { score, grade, recommendation };
  }

  /**
   * Lint チェック実行
   */
  private async runLintCheck(): Promise<number> {
    try {
      const result = await this.executeCommand('npx', [
        'eslint',
        '--format',
        'json',
        '.',
      ]);
      const lintResult = JSON.parse(result.stdout);
      return lintResult.reduce(
        (total: number, file: any) => total + file.errorCount,
        0
      );
    } catch (error) {
      console.warn('Lint check failed:', error);
      return 0;
    }
  }

  /**
   * 型チェック実行
   */
  private async runTypeCheck(): Promise<number> {
    try {
      const result = await this.executeCommand('npx', ['tsc', '--noEmit']);
      // TypeScriptのエラー出力から行数をカウント
      const errorLines = result.stderr
        .split('\n')
        .filter(
          (line) => line.includes('error TS') && !line.includes('Found ')
        );
      return errorLines.length;
    } catch (error) {
      console.warn('Type check failed:', error);
      return 0;
    }
  }

  /**
   * テストカバレッジ測定
   */
  private async measureTestCoverage(): Promise<number> {
    try {
      await this.executeCommand('npx', [
        'jest',
        '--coverage',
        '--coverageReporters=json-summary',
      ]);
      const coveragePath = path.join(
        this.config.projectPath,
        'coverage/coverage-summary.json'
      );
      const coverage = JSON.parse(await fs.readFile(coveragePath, 'utf-8'));
      return Math.round(coverage.total.lines.pct);
    } catch (error) {
      console.warn('Coverage measurement failed:', error);
      return 0;
    }
  }

  /**
   * 複雑度測定
   */
  private async measureComplexity(): Promise<number> {
    try {
      // TypeScriptファイルを解析して循環的複雑度を計算
      const tsFiles = await this.findTypeScriptFiles();
      let totalComplexity = 0;
      let fileCount = 0;

      for (const file of tsFiles) {
        const content = await fs.readFile(file, 'utf-8');
        const complexity = this.calculateFileComplexity(content);
        totalComplexity += complexity;
        fileCount++;
      }

      return fileCount > 0 ? Math.round(totalComplexity / fileCount) : 0;
    } catch (error) {
      console.warn('Complexity measurement failed:', error);
      return 0;
    }
  }

  /**
   * テスト実行
   */
  private async runTests(): Promise<{ passed: number; total: number }> {
    try {
      const result = await this.executeCommand('npx', ['jest', '--json']);
      const testResult = JSON.parse(result.stdout);
      return {
        passed: testResult.numPassedTests,
        total: testResult.numTotalTests,
      };
    } catch (error) {
      console.warn('Test execution failed:', error);
      return { passed: 0, total: 0 };
    }
  }

  /**
   * 機能完成度分析
   */
  private async analyzeFeatureCompleteness(): Promise<{
    implemented: string[];
    missing: string[];
    total: number;
  }> {
    // TODO: 実装計画ドキュメントと実際のコードを比較して機能完成度を分析
    // 現在は簡易実装
    const implemented = ['TmuxManager', 'PaneController', 'ConfigManager'];
    const missing = ['SessionManager', 'QualityEvaluator']; // 例

    return {
      implemented,
      missing,
      total: implemented.length + missing.length,
    };
  }

  /**
   * エラーハンドリング評価
   */
  private async evaluateErrorHandling(): Promise<number> {
    try {
      const tsFiles = await this.findTypeScriptFiles();
      let totalFiles = 0;
      let filesWithErrorHandling = 0;

      for (const file of tsFiles) {
        const content = await fs.readFile(file, 'utf-8');
        totalFiles++;

        // try-catch、エラーハンドリングパターンをチェック
        if (
          content.includes('try {') ||
          content.includes('catch (') ||
          content.includes('throw new') ||
          content.includes('.catch(')
        ) {
          filesWithErrorHandling++;
        }
      }

      return totalFiles > 0
        ? Math.round((filesWithErrorHandling / totalFiles) * 100)
        : 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * ドキュメント評価
   */
  private async evaluateDocumentation(): Promise<number> {
    try {
      const tsFiles = await this.findTypeScriptFiles();
      let totalFunctions = 0;
      let documentedFunctions = 0;

      for (const file of tsFiles) {
        const content = await fs.readFile(file, 'utf-8');

        // 関数とクラスの総数をカウント
        const functionMatches =
          content.match(/(?:function|class|interface|type)\s+\w+/g) || [];
        totalFunctions += functionMatches.length;

        // JSDocコメントの数をカウント
        const docMatches = content.match(/\/\*\*[\s\S]*?\*\//g) || [];
        documentedFunctions += docMatches.length;
      }

      return totalFunctions > 0
        ? Math.round((documentedFunctions / totalFunctions) * 100)
        : 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * API一貫性評価
   */
  private async evaluateApiConsistency(): Promise<number> {
    // TODO: API命名規則、戻り値の型一貫性などを評価
    // 現在は簡易実装
    return 85;
  }

  /**
   * パフォーマンス評価
   */
  private async evaluatePerformance(): Promise<number> {
    // TODO: 実際のパフォーマンステストを実行
    // 現在は簡易実装
    return 80;
  }

  /**
   * 課題識別
   */
  private async identifyIssues(
    metrics: QualityMetrics
  ): Promise<QualityIssue[]> {
    const issues: QualityIssue[] = [];

    // コード品質課題
    if (metrics.codeQuality.lintErrors > 0) {
      issues.push({
        severity: 'major',
        category: 'code',
        message: `${metrics.codeQuality.lintErrors} lint errors found`,
        suggestion: 'Run "npm run lint:fix" to auto-fix issues',
      });
    }

    if (metrics.codeQuality.testCoverage < this.config.thresholds.minCoverage) {
      issues.push({
        severity: 'major',
        category: 'code',
        message: `Test coverage ${metrics.codeQuality.testCoverage}% is below threshold ${this.config.thresholds.minCoverage}%`,
        suggestion: 'Add more unit tests to increase coverage',
      });
    }

    // 機能性課題
    if (metrics.functionality.missingFeatures.length > 0) {
      issues.push({
        severity: 'critical',
        category: 'functionality',
        message: `${metrics.functionality.missingFeatures.length} features are not implemented`,
        suggestion:
          'Implement missing features: ' +
          metrics.functionality.missingFeatures.join(', '),
      });
    }

    return issues;
  }

  /**
   * 改善提案生成
   */
  private async generateSuggestions(
    metrics: QualityMetrics
  ): Promise<QualitySuggestion[]> {
    const suggestions: QualitySuggestion[] = [];

    if (metrics.codeQuality.score < 80) {
      suggestions.push({
        priority: 'high',
        category: 'refactoring',
        title: 'Code Quality Improvement',
        description: 'Focus on reducing lint errors and improving type safety',
        estimatedEffort: 'medium',
        expectedImpact: 'Improved maintainability and reliability',
      });
    }

    if (metrics.usability.documentation < 70) {
      suggestions.push({
        priority: 'medium',
        category: 'documentation',
        title: 'Documentation Enhancement',
        description:
          'Add JSDoc comments to public APIs and create usage examples',
        estimatedEffort: 'small',
        expectedImpact: 'Better developer experience',
      });
    }

    return suggestions;
  }

  /**
   * 推奨事項生成
   */
  private generateRecommendation(score: number, _grade: string): string {
    if (score >= 90) {
      return 'Excellent quality! Consider minor optimizations for peak performance.';
    } else if (score >= 80) {
      return 'Good quality. Focus on addressing remaining issues.';
    } else if (score >= 70) {
      return 'Acceptable quality. Significant improvements needed in key areas.';
    } else if (score >= 60) {
      return 'Below average quality. Major refactoring recommended.';
    } else {
      return 'Poor quality. Comprehensive review and restructuring required.';
    }
  }

  /**
   * ファイル複雑度計算
   */
  private calculateFileComplexity(content: string): number {
    // 簡易的な循環的複雑度計算
    let complexity = 1; // 基本複雑度

    // 分岐構造をカウント
    const patterns = [
      /if\s*\(/g,
      /else\s+if\s*\(/g,
      /while\s*\(/g,
      /for\s*\(/g,
      /catch\s*\(/g,
      /case\s+/g,
      /&&/g,
      /\|\|/g,
      /\?/g, // 三項演算子
    ];

    patterns.forEach((pattern) => {
      const matches = content.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    });

    return complexity;
  }

  /**
   * TypeScriptファイル検索
   */
  private async findTypeScriptFiles(): Promise<string[]> {
    const files: string[] = [];

    const searchDir = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (
          entry.isDirectory() &&
          !entry.name.startsWith('.') &&
          entry.name !== 'node_modules'
        ) {
          await searchDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
          files.push(fullPath);
        }
      }
    };

    await searchDir(this.config.projectPath);
    return files;
  }

  /**
   * コマンド実行ユーティリティ
   */
  private executeCommand(
    command: string,
    args: string[]
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args, {
        cwd: this.config.projectPath,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0 || command.includes('tsc')) {
          // tscはエラーでもコード0以外を返すことがある
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      process.on('error', reject);
    });
  }

  /**
   * 設定更新
   */
  updateConfig(newConfig: Partial<EvaluationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 評価中かどうか
   */
  isRunning(): boolean {
    return this.isEvaluating;
  }
}

/**
 * デフォルト設定
 */
export const defaultEvaluationConfig: EvaluationConfig = {
  projectPath: process.cwd(),
  includePatterns: ['src/**/*.ts', 'test/**/*.ts'],
  excludePatterns: ['node_modules/**', 'dist/**', 'coverage/**'],

  weights: {
    codeQuality: 0.4,
    functionality: 0.4,
    usability: 0.2,
  },

  thresholds: {
    minCoverage: 70,
    maxComplexity: 10,
    minScore: 70,
  },
};

/**
 * QualityEvaluatorファクトリ関数
 */
export function createQualityEvaluator(
  config?: Partial<EvaluationConfig>
): QualityEvaluator {
  const finalConfig = { ...defaultEvaluationConfig, ...config };
  return new QualityEvaluator(finalConfig);
}
