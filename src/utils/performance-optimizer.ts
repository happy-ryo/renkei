/**
 * Performance Optimizer - 性能最適化システム
 * 
 * システムのパフォーマンスを監視し、ボトルネックを特定して
 * 自動的な最適化とレコメンデーションを提供します。
 */

import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { cpus, totalmem, freemem } from 'os';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

/**
 * パフォーマンスメトリクス
 */
export interface PerformanceMetrics {
  timestamp: Date;
  
  // CPU使用率
  cpu: {
    usage: number; // %
    cores: number;
    loadAverage: number[];
  };
  
  // メモリ使用量
  memory: {
    total: number; // bytes
    free: number; // bytes
    used: number; // bytes
    usagePercent: number; // %
    heapUsed: number; // bytes
    heapTotal: number; // bytes
  };
  
  // I/O パフォーマンス
  io: {
    readOps: number;
    writeOps: number;
    responseTime: number; // ms
  };
  
  // ネットワーク
  network: {
    connections: number;
    latency: number; // ms
    throughput: number; // bytes/s
  };
  
  // アプリケーション固有
  application: {
    activeConnections: number;
    queuedTasks: number;
    averageResponseTime: number; // ms
    errorRate: number; // %
    throughput: number; // requests/s
  };
}

/**
 * パフォーマンス問題
 */
export interface PerformanceIssue {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'cpu' | 'memory' | 'io' | 'network' | 'application';
  title: string;
  description: string;
  metrics: Partial<PerformanceMetrics>;
  recommendations: PerformanceRecommendation[];
  detectedAt: Date;
  resolved: boolean;
}

/**
 * パフォーマンス改善提案
 */
export interface PerformanceRecommendation {
  id: string;
  type: 'immediate' | 'configuration' | 'refactoring' | 'infrastructure';
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  implementation: string;
  expectedImprovement: string;
  estimatedEffort: 'small' | 'medium' | 'large';
  automated: boolean;
}

/**
 * 最適化設定
 */
export interface OptimizerConfig {
  // 監視間隔 (ms)
  monitoringInterval: number;
  
  // しきい値設定
  thresholds: {
    cpu: {
      warning: number; // %
      critical: number; // %
    };
    memory: {
      warning: number; // %
      critical: number; // %
    };
    responseTime: {
      warning: number; // ms
      critical: number; // ms
    };
    errorRate: {
      warning: number; // %
      critical: number; // %
    };
  };
  
  // 自動最適化設定
  autoOptimization: {
    enabled: boolean;
    allowedOptimizations: string[];
    maxAutomaticChanges: number;
  };
  
  // 履歴保持期間
  historyRetention: {
    detailed: number; // hours
    aggregated: number; // days
  };
}

/**
 * パフォーマンス最適化エンジン
 */
export class PerformanceOptimizer extends EventEmitter {
  private config: OptimizerConfig;
  private isMonitoring = false;
  private monitoringTimer: NodeJS.Timeout | null = null;
  
  private metricsHistory: PerformanceMetrics[] = [];
  private activeIssues: Map<string, PerformanceIssue> = new Map();
  private recommendations: Map<string, PerformanceRecommendation> = new Map();
  
  // パフォーマンス追跡
  private operationTimings: Map<string, number[]> = new Map();
  private requestCounts: Map<string, number> = new Map();
  private errorCounts: Map<string, number> = new Map();

  constructor(config: Partial<OptimizerConfig> = {}) {
    super();
    
    this.config = {
      monitoringInterval: 30000, // 30秒間隔
      thresholds: {
        cpu: { warning: 70, critical: 90 },
        memory: { warning: 80, critical: 95 },
        responseTime: { warning: 1000, critical: 5000 },
        errorRate: { warning: 5, critical: 10 },
      },
      autoOptimization: {
        enabled: false,
        allowedOptimizations: ['cache', 'connection_pooling', 'memory_cleanup'],
        maxAutomaticChanges: 3,
      },
      historyRetention: {
        detailed: 24, // 24時間
        aggregated: 30, // 30日
      },
      ...config,
    };
  }

  /**
   * パフォーマンス監視を開始
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.emit('monitoring_started');

    // 初回メトリクス取得
    await this.collectMetrics();

    // 定期的な監視を開始
    this.monitoringTimer = setInterval(async () => {
      try {
        await this.collectMetrics();
      } catch (error) {
        this.emit('monitoring_error', error);
      }
    }, this.config.monitoringInterval);
  }

  /**
   * パフォーマンス監視を停止
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }

    this.emit('monitoring_stopped');
  }

  /**
   * 現在のパフォーマンスメトリクスを取得
   */
  async collectMetrics(): Promise<PerformanceMetrics> {
    const timestamp = new Date();
    
    const [cpuMetrics, memoryMetrics, ioMetrics, networkMetrics, appMetrics] = 
      await Promise.all([
        this.getCpuMetrics(),
        this.getMemoryMetrics(),
        this.getIoMetrics(),
        this.getNetworkMetrics(),
        this.getApplicationMetrics(),
      ]);

    const metrics: PerformanceMetrics = {
      timestamp,
      cpu: cpuMetrics,
      memory: memoryMetrics,
      io: ioMetrics,
      network: networkMetrics,
      application: appMetrics,
    };

    // 履歴に追加
    this.metricsHistory.push(metrics);
    this.cleanupHistory();

    // 問題検出
    await this.detectIssues(metrics);

    this.emit('metrics_collected', metrics);
    return metrics;
  }

  /**
   * CPU メトリクス取得
   */
  private async getCpuMetrics(): Promise<PerformanceMetrics['cpu']> {
    const cores = cpus();
    const loadAvg = process.platform !== 'win32' ? 
      await this.getLoadAverage() : [0, 0, 0];

    // CPU使用率計算（簡易版）
    let totalIdle = 0;
    let totalTick = 0;

    cores.forEach(core => {
      const { user, nice, sys, idle, irq } = core.times;
      totalIdle += idle;
      totalTick += user + nice + sys + idle + irq;
    });

    const usage = totalTick > 0 ? 
      Math.round(((totalTick - totalIdle) / totalTick) * 100) : 0;

    return {
      usage,
      cores: cores.length,
      loadAverage: loadAvg,
    };
  }

  /**
   * メモリメトリクス取得
   */
  private getMemoryMetrics(): PerformanceMetrics['memory'] {
    const totalMem = totalmem();
    const freeMem = freemem();
    const usedMem = totalMem - freeMem;
    const usagePercent = Math.round((usedMem / totalMem) * 100);

    const heapStats = process.memoryUsage();

    return {
      total: totalMem,
      free: freeMem,
      used: usedMem,
      usagePercent,
      heapUsed: heapStats.heapUsed,
      heapTotal: heapStats.heapTotal,
    };
  }

  /**
   * I/O メトリクス取得
   */
  private async getIoMetrics(): Promise<PerformanceMetrics['io']> {
    // Node.js の fs.Stats を使用してI/O統計を取得
    // 簡易実装
    return {
      readOps: 0,
      writeOps: 0,
      responseTime: 0,
    };
  }

  /**
   * ネットワークメトリクス取得
   */
  private async getNetworkMetrics(): Promise<PerformanceMetrics['network']> {
    // ネットワーク統計の取得（簡易実装）
    const latency = await this.measureLatency();

    return {
      connections: 0,
      latency,
      throughput: 0,
    };
  }

  /**
   * アプリケーションメトリクス取得
   */
  private getApplicationMetrics(): PerformanceMetrics['application'] {
    const now = Date.now();
    const recentWindow = 60000; // 1分間のウィンドウ

    // 平均応答時間計算
    let totalResponseTime = 0;
    let totalRequests = 0;

    for (const [operation, timings] of this.operationTimings) {
      const recentTimings = timings.filter(t => (now - t) < recentWindow);
      totalResponseTime += recentTimings.reduce((sum, t) => sum + t, 0);
      totalRequests += recentTimings.length;
    }

    const averageResponseTime = totalRequests > 0 ? 
      totalResponseTime / totalRequests : 0;

    // エラー率計算
    const totalErrors = Array.from(this.errorCounts.values())
      .reduce((sum, count) => sum + count, 0);
    const errorRate = totalRequests > 0 ? 
      (totalErrors / totalRequests) * 100 : 0;

    // スループット計算
    const throughput = totalRequests / (recentWindow / 1000); // requests/second

    return {
      activeConnections: 0, // 実装依存
      queuedTasks: 0, // 実装依存
      averageResponseTime,
      errorRate,
      throughput,
    };
  }

  /**
   * パフォーマンス問題検出
   */
  private async detectIssues(metrics: PerformanceMetrics): Promise<void> {
    const issues: PerformanceIssue[] = [];

    // CPU使用率チェック
    if (metrics.cpu.usage >= this.config.thresholds.cpu.critical) {
      issues.push(this.createIssue('critical', 'cpu', 'Critical CPU Usage', 
        `CPU usage is ${metrics.cpu.usage}%`, metrics));
    } else if (metrics.cpu.usage >= this.config.thresholds.cpu.warning) {
      issues.push(this.createIssue('high', 'cpu', 'High CPU Usage', 
        `CPU usage is ${metrics.cpu.usage}%`, metrics));
    }

    // メモリ使用率チェック
    if (metrics.memory.usagePercent >= this.config.thresholds.memory.critical) {
      issues.push(this.createIssue('critical', 'memory', 'Critical Memory Usage', 
        `Memory usage is ${metrics.memory.usagePercent}%`, metrics));
    } else if (metrics.memory.usagePercent >= this.config.thresholds.memory.warning) {
      issues.push(this.createIssue('high', 'memory', 'High Memory Usage', 
        `Memory usage is ${metrics.memory.usagePercent}%`, metrics));
    }

    // 応答時間チェック
    if (metrics.application.averageResponseTime >= this.config.thresholds.responseTime.critical) {
      issues.push(this.createIssue('critical', 'application', 'Slow Response Time', 
        `Average response time is ${metrics.application.averageResponseTime}ms`, metrics));
    } else if (metrics.application.averageResponseTime >= this.config.thresholds.responseTime.warning) {
      issues.push(this.createIssue('high', 'application', 'Degraded Response Time', 
        `Average response time is ${metrics.application.averageResponseTime}ms`, metrics));
    }

    // エラー率チェック
    if (metrics.application.errorRate >= this.config.thresholds.errorRate.critical) {
      issues.push(this.createIssue('critical', 'application', 'High Error Rate', 
        `Error rate is ${metrics.application.errorRate}%`, metrics));
    } else if (metrics.application.errorRate >= this.config.thresholds.errorRate.warning) {
      issues.push(this.createIssue('high', 'application', 'Elevated Error Rate', 
        `Error rate is ${metrics.application.errorRate}%`, metrics));
    }

    // 新しい問題を処理
    for (const issue of issues) {
      if (!this.activeIssues.has(issue.id)) {
        this.activeIssues.set(issue.id, issue);
        await this.generateRecommendations(issue);
        this.emit('issue_detected', issue);

        // 自動最適化の実行
        if (this.config.autoOptimization.enabled) {
          await this.tryAutoOptimization(issue);
        }
      }
    }
  }

  /**
   * パフォーマンス問題を作成
   */
  private createIssue(
    severity: PerformanceIssue['severity'],
    category: PerformanceIssue['category'],
    title: string,
    description: string,
    metrics: PerformanceMetrics
  ): PerformanceIssue {
    return {
      id: `${category}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      severity,
      category,
      title,
      description,
      metrics,
      recommendations: [],
      detectedAt: new Date(),
      resolved: false,
    };
  }

  /**
   * 改善提案を生成
   */
  private async generateRecommendations(issue: PerformanceIssue): Promise<void> {
    const recommendations: PerformanceRecommendation[] = [];

    switch (issue.category) {
      case 'cpu':
        recommendations.push({
          id: `cpu_opt_${Date.now()}`,
          type: 'configuration',
          priority: 'high',
          title: 'Optimize CPU Usage',
          description: 'Reduce CPU-intensive operations and implement caching',
          implementation: 'Enable response caching and optimize database queries',
          expectedImprovement: 'Reduce CPU usage by 20-30%',
          estimatedEffort: 'medium',
          automated: false,
        });
        break;

      case 'memory':
        recommendations.push({
          id: `mem_opt_${Date.now()}`,
          type: 'immediate',
          priority: 'critical',
          title: 'Memory Cleanup',
          description: 'Free up memory by cleaning unused objects and optimizing data structures',
          implementation: 'Run garbage collection and clear caches',
          expectedImprovement: 'Free up 15-25% memory',
          estimatedEffort: 'small',
          automated: true,
        });
        break;

      case 'application':
        if (issue.title.includes('Response Time')) {
          recommendations.push({
            id: `resp_opt_${Date.now()}`,
            type: 'configuration',
            priority: 'high',
            title: 'Optimize Response Time',
            description: 'Implement connection pooling and query optimization',
            implementation: 'Configure connection pools and add database indexes',
            expectedImprovement: 'Reduce response time by 40-60%',
            estimatedEffort: 'medium',
            automated: false,
          });
        }
        break;
    }

    issue.recommendations = recommendations;
    
    for (const rec of recommendations) {
      this.recommendations.set(rec.id, rec);
      this.emit('recommendation_generated', rec);
    }
  }

  /**
   * 自動最適化の試行
   */
  private async tryAutoOptimization(issue: PerformanceIssue): Promise<void> {
    const automatedRecommendations = issue.recommendations.filter(r => r.automated);

    for (const rec of automatedRecommendations) {
      if (this.config.autoOptimization.allowedOptimizations.includes(rec.type)) {
        try {
          await this.executeOptimization(rec);
          this.emit('auto_optimization_applied', rec);
        } catch (error) {
          this.emit('auto_optimization_failed', { recommendation: rec, error });
        }
      }
    }
  }

  /**
   * 最適化を実行
   */
  private async executeOptimization(recommendation: PerformanceRecommendation): Promise<void> {
    switch (recommendation.type) {
      case 'immediate':
        if (recommendation.title.includes('Memory Cleanup')) {
          // メモリクリーンアップ
          if (global.gc) {
            global.gc();
          }
          
          // キャッシュクリア
          this.clearOperationHistory();
        }
        break;

      case 'configuration':
        // 設定変更（実装依存）
        break;
    }
  }

  /**
   * 操作のパフォーマンスを記録
   */
  recordOperation(operation: string, duration: number): void {
    if (!this.operationTimings.has(operation)) {
      this.operationTimings.set(operation, []);
    }

    const timings = this.operationTimings.get(operation)!;
    timings.push(duration);

    // 古いデータを削除（最新1000件まで保持）
    if (timings.length > 1000) {
      timings.splice(0, timings.length - 1000);
    }

    // リクエストカウント更新
    const currentCount = this.requestCounts.get(operation) || 0;
    this.requestCounts.set(operation, currentCount + 1);
  }

  /**
   * エラーを記録
   */
  recordError(operation: string): void {
    const currentCount = this.errorCounts.get(operation) || 0;
    this.errorCounts.set(operation, currentCount + 1);
  }

  /**
   * パフォーマンス分析レポートを生成
   */
  generatePerformanceReport(): {
    summary: PerformanceMetrics | null;
    trends: any;
    issues: PerformanceIssue[];
    recommendations: PerformanceRecommendation[];
  } {
    const latestMetrics = this.metricsHistory[this.metricsHistory.length - 1] || null;
    const trends = this.analyzeTrends();
    
    return {
      summary: latestMetrics,
      trends,
      issues: Array.from(this.activeIssues.values()).filter(i => !i.resolved),
      recommendations: Array.from(this.recommendations.values()),
    };
  }

  /**
   * トレンド分析
   */
  private analyzeTrends(): any {
    if (this.metricsHistory.length < 2) {
      return null;
    }

    const recent = this.metricsHistory.slice(-10);
    const cpuTrend = this.calculateTrend(recent.map(m => m.cpu.usage));
    const memoryTrend = this.calculateTrend(recent.map(m => m.memory.usagePercent));
    const responseTrend = this.calculateTrend(recent.map(m => m.application.averageResponseTime));

    return {
      cpu: { trend: cpuTrend, direction: cpuTrend > 0 ? 'increasing' : 'decreasing' },
      memory: { trend: memoryTrend, direction: memoryTrend > 0 ? 'increasing' : 'decreasing' },
      responseTime: { trend: responseTrend, direction: responseTrend > 0 ? 'increasing' : 'decreasing' },
    };
  }

  /**
   * トレンド計算（線形回帰の傾き）
   */
  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;

    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((sum, val) => sum + val, 0);
    const sumXY = values.reduce((sum, val, i) => sum + (i * val), 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }

  /**
   * ユーティリティメソッド
   */
  private async getLoadAverage(): Promise<number[]> {
    try {
      const { stdout } = await execAsync('uptime');
      const match = stdout.match(/load average: ([\d.]+), ([\d.]+), ([\d.]+)/);
      if (match && match[1] && match[2] && match[3]) {
        return [parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3])];
      }
    } catch (error) {
      // Windows等でuptimeが使えない場合
    }
    return [0, 0, 0];
  }

  private async measureLatency(): Promise<number> {
    const start = performance.now();
    // 簡易的なレイテンシ測定（ローカルでのファイルアクセス時間）
    try {
      await import('fs').then(fs => fs.promises.access('.'));
      return performance.now() - start;
    } catch {
      return 0;
    }
  }

  private clearOperationHistory(): void {
    const cutoff = Date.now() - (60 * 60 * 1000); // 1時間前
    
    for (const [operation, timings] of this.operationTimings) {
      const filtered = timings.filter(t => t > cutoff);
      this.operationTimings.set(operation, filtered);
    }
  }

  private cleanupHistory(): void {
    const maxDetailedEntries = Math.floor(
      (this.config.historyRetention.detailed * 60 * 60 * 1000) / 
      this.config.monitoringInterval
    );

    if (this.metricsHistory.length > maxDetailedEntries) {
      this.metricsHistory.splice(0, this.metricsHistory.length - maxDetailedEntries);
    }
  }

  /**
   * 設定更新
   */
  updateConfig(newConfig: Partial<OptimizerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit('config_updated', this.config);
  }

  /**
   * 現在の状態を取得
   */
  getStatus(): {
    isMonitoring: boolean;
    activeIssues: number;
    pendingRecommendations: number;
    latestMetrics?: PerformanceMetrics;
  } {
    const latestMetrics = this.metricsHistory[this.metricsHistory.length - 1];
    return {
      isMonitoring: this.isMonitoring,
      activeIssues: this.activeIssues.size,
      pendingRecommendations: this.recommendations.size,
      ...(latestMetrics && { latestMetrics }),
    };
  }

  /**
   * リソースクリーンアップ
   */
  cleanup(): void {
    this.stopMonitoring();
    this.removeAllListeners();
    this.metricsHistory = [];
    this.activeIssues.clear();
    this.recommendations.clear();
    this.operationTimings.clear();
    this.requestCounts.clear();
    this.errorCounts.clear();
  }
}

/**
 * パフォーマンス測定デコレータ
 */
export function measurePerformance(optimizer: PerformanceOptimizer, operation: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const start = performance.now();
      try {
        const result = await method.apply(this, args);
        const duration = performance.now() - start;
        optimizer.recordOperation(operation, duration);
        return result;
      } catch (error) {
        const duration = performance.now() - start;
        optimizer.recordOperation(operation, duration);
        optimizer.recordError(operation);
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * デフォルト設定
 */
export const defaultOptimizerConfig: OptimizerConfig = {
  monitoringInterval: 30000,
  thresholds: {
    cpu: { warning: 70, critical: 90 },
    memory: { warning: 80, critical: 95 },
    responseTime: { warning: 1000, critical: 5000 },
    errorRate: { warning: 5, critical: 10 },
  },
  autoOptimization: {
    enabled: false,
    allowedOptimizations: ['memory_cleanup'],
    maxAutomaticChanges: 3,
  },
  historyRetention: {
    detailed: 24,
    aggregated: 30,
  },
};

/**
 * ファクトリ関数
 */
export function createPerformanceOptimizer(config?: Partial<OptimizerConfig>): PerformanceOptimizer {
  return new PerformanceOptimizer({ ...defaultOptimizerConfig, ...config });
}
