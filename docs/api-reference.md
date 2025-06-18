# Renkei System - API Reference

> Renkei システムの完全なAPI リファレンス

**最終更新**: 2025-06-18  
**バージョン**: 1.0.0

---

## 📚 目次

1. [概要](#概要)
2. [核心クラス](#核心クラス)
3. [統合機能](#統合機能)
4. [UI管理](#ui管理)
5. [評価システム](#評価システム)
6. [ユーティリティ](#ユーティリティ)
7. [設定・型定義](#設定型定義)
8. [使用例](#使用例)

---

## 概要

Renkei システムは自然言語タスクの自動実行を可能にする包括的なフレームワークです。ClaudeCode統合により、高度な AI 支援開発を実現します。

### アーキテクチャ概要

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   UI Manager    │    │   AI Manager    │    │ Claude Integration │
│   (tmux)        │◄──►│   (核心制御)     │◄──►│   (ClaudeCode)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         ▲                       ▲                       ▲
         │                       │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Session Manager │    │  Task Manager   │    │ Quality Evaluator│
│   (状態管理)     │    │   (実行制御)     │    │   (品質評価)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

---

## 核心クラス

### AIManager

自然言語タスクの解析、計画生成、実行制御を行う中核システム。

#### 基本使用法

```typescript
import { AIManager } from './managers/ai-manager.js';
import { ClaudeIntegration } from './integrations/claude-integration.js';
import { ConfigManager } from './managers/config-manager.js';
import { TaskEvaluator } from './evaluators/task-evaluator.js';

// 初期化
const claudeIntegration = new ClaudeIntegration({
  maxRetries: 3,
  timeout: 30000,
  defaultOptions: {
    maxTurns: 10,
    autoApprove: false,
    allowedTools: ['read_file', 'write_to_file', 'execute_command'],
  }
});

const configManager = new ConfigManager();
const taskEvaluator = new TaskEvaluator();
const aiManager = new AIManager(claudeIntegration, configManager, taskEvaluator);
```

#### メソッド

##### `analyzeTask(request: TaskRequest): Promise<TaskPlan>`

自然言語タスクを解析し、実装計画を生成します。

**パラメータ**:
- `request`: タスクリクエスト
  - `description: string` - タスクの説明
  - `workingDirectory: string` - 作業ディレクトリ
  - `priority: 'low' | 'medium' | 'high'` - 優先度

**戻り値**: `TaskPlan` - 詳細な実装計画

**例**:
```typescript
const taskRequest = {
  description: 'Create a React component for user profile display',
  workingDirectory: './src/components',
  priority: 'medium'
};

const plan = await aiManager.analyzeTask(taskRequest);
console.log(`Generated plan with ${plan.phases.length} phases`);
```

##### `executeTask(plan: TaskPlan): Promise<ExecutionResult>`

生成された計画に基づいてタスクを実行します。

**パラメータ**:
- `plan: TaskPlan` - analyzeTask()で生成された計画

**戻り値**: `ExecutionResult` - 実行結果と詳細情報

**例**:
```typescript
const result = await aiManager.executeTask(plan);
if (result.success) {
  console.log(`Task completed in ${result.duration}ms`);
} else {
  console.error('Task execution failed');
}
```

##### `evaluateResult(result: ExecutionResult): Promise<EvaluationSummary>`

実行結果の品質を評価し、改善提案を生成します。

**戻り値**: 品質スコア、完全性、改善提案を含む評価サマリー

##### `getStatus(): AIManagerStatus`

現在の状態を取得します。

**戻り値**:
```typescript
{
  currentTask: TaskRequest | null;
  currentPlan: TaskPlan | null;
  executionStatus: TaskStatus;
}
```

#### イベント

AIManagerは以下のイベントを発行します：

```typescript
aiManager.on('task_analysis_started', (request) => {
  console.log('Task analysis started:', request.description);
});

aiManager.on('task_execution_completed', (result) => {
  console.log('Task completed successfully');
});

aiManager.on('phase_started', (phase) => {
  console.log(`Starting phase: ${phase.name}`);
});

aiManager.on('error', (error) => {
  console.error('AI Manager error:', error.message);
});
```

---

### ClaudeIntegration

ClaudeCode APIとの統合を提供する統合レイヤー。

#### 初期化

```typescript
const claude = new ClaudeIntegration({
  maxRetries: 3,
  retryDelay: 1000,
  timeout: 30000,
  defaultOptions: {
    maxTurns: 10,
    autoApprove: false,
    allowedTools: ['read_file', 'write_to_file', 'execute_command'],
    outputFormat: 'text'
  }
});

await claude.initialize();
```

#### メソッド

##### `createSession(workingDirectory?: string): Promise<string>`

新しいClaudeCodeセッションを作成します。

##### `executeTask(sessionId: string, query: ClaudeQueryOptions): Promise<string>`

指定されたセッションでタスクを実行します。

##### `sendMessage(prompt: string, sessionId?: string): Promise<{content: string, duration?: number}>`

簡易メッセージ送信インターフェース。

**例**:
```typescript
const response = await claude.sendMessage(
  'Create a utility function for data validation'
);
console.log('Generated code:', response.content);
```

---

### TaskManager

タスクの実行、監視、評価、継続判断を自動化します。

#### 初期化

```typescript
import { TaskManager, defaultTaskManagerConfig } from './managers/task-manager.js';

const taskManager = new TaskManager(
  defaultTaskManagerConfig,
  aiManager,
  claudeIntegration,
  configManager
);
```

#### メソッド

##### `addTask(task: Task): Promise<void>`

実行キューにタスクを追加します。

```typescript
const task = {
  id: 'task_001',
  title: 'Implement User Authentication',
  description: 'Create login/logout functionality',
  requirements: ['JWT tokens', 'Password hashing', 'Session management'],
  acceptanceCriteria: ['Login works', 'Logout works', 'Sessions persist'],
  priority: 'high',
  estimatedDuration: 120 // minutes
};

await taskManager.addTask(task);
```

##### `executeTask(taskId: string): Promise<TaskContext>`

タスクを実行し、完了まで監視します。

##### `getTaskStatus(taskId: string): TaskContext | undefined`

指定されたタスクの現在状態を取得します。

---

### SessionManager

セッション状態の管理と永続化を提供します。

#### 基本使用法

```typescript
const sessionManager = new SessionManager({
  autoSaveInterval: 30000, // 30秒間隔で自動保存
  maxConcurrentSessions: 5,
  sessionTimeout: 3600000 // 1時間
});

await sessionManager.initialize();
```

#### メソッド

##### `createSession(initialContext?: Partial<SessionContext>): Promise<string>`

新しいセッションを作成します。

```typescript
const sessionId = await sessionManager.createSession({
  workingDirectory: './my-project',
  environment: { NODE_ENV: 'development' }
});
```

##### `getSession(sessionId?: string): SessionState | null`

セッション情報を取得します。

##### `updateContext(contextUpdate: Partial<SessionContext>, sessionId?: string): Promise<void>`

セッションコンテキストを更新します。

---

## UI管理

### TmuxManager

tmuxを使用したターミナルUIの管理を行います。

#### 初期化

```typescript
const tmuxConfig: TmuxConfig = {
  sessionName: 'renkei-session',
  mainPaneTitle: 'Main Output',
  subPaneTitle: 'Status',
  splitDirection: 'horizontal',
  mainPaneSize: 70
};

const tmuxManager = new TmuxManager(tmuxConfig);
```

#### メソッド

##### `createSession(sessionName?: string): Promise<string>`

新しいtmuxセッションを作成します。

##### `updatePane(paneId: string, content: string): Promise<void>`

指定されたペインの内容を更新します。

```typescript
await tmuxManager.updatePane('main', 'Task execution started...');
```

---

## 評価システム

### QualityEvaluator

コード品質と機能完成度の包括的評価を提供します。

#### 初期化

```typescript
import { createQualityEvaluator } from './evaluators/quality-evaluator.js';

const qualityEvaluator = createQualityEvaluator({
  projectPath: './src',
  weights: {
    codeQuality: 0.4,
    functionality: 0.4,
    usability: 0.2
  },
  thresholds: {
    minCoverage: 70,
    maxComplexity: 10,
    minScore: 70
  }
});
```

#### メソッド

##### `evaluate(): Promise<EvaluationResult>`

プロジェクトの総合品質評価を実行します。

```typescript
const result = await qualityEvaluator.evaluate();
console.log(`Overall quality score: ${result.metrics.overall.score}`);
console.log(`Grade: ${result.metrics.overall.grade}`);
```

---

## ユーティリティ

### PerformanceOptimizer

システムパフォーマンスの監視と自動最適化を提供します。

#### 初期化

```typescript
import { createPerformanceOptimizer } from './utils/performance-optimizer.js';

const optimizer = createPerformanceOptimizer({
  monitoringInterval: 30000,
  thresholds: {
    cpu: { warning: 70, critical: 90 },
    memory: { warning: 80, critical: 95 }
  },
  autoOptimization: {
    enabled: true,
    allowedOptimizations: ['memory_cleanup']
  }
});

await optimizer.startMonitoring();
```

#### メソッド

##### `collectMetrics(): Promise<PerformanceMetrics>`

現在のパフォーマンスメトリクスを収集します。

##### `generatePerformanceReport(): PerformanceReport`

詳細なパフォーマンスレポートを生成します。

---

## 設定・型定義

### 主要な型定義

#### TaskPlan

```typescript
interface TaskPlan {
  id: string;
  title: string;
  description: string;
  phases: TaskPhase[];
  prerequisites: string[];
  deliverables: string[];
  successCriteria: string[];
  riskAssessment: RiskAssessment;
  createdAt: Date;
  estimatedDuration: number;
  confidence: number;
}
```

#### TaskPhase

```typescript
interface TaskPhase {
  id: string;
  name: string;
  description: string;
  steps: TaskStep[];
  deliverables: string[];
}
```

#### ExecutionResult

```typescript
interface ExecutionResult {
  taskId: string;
  success: boolean;
  duration: number;
  results: any[];
  metrics: any;
  completedAt: Date;
}
```

---

## 使用例

### 完全なワークフロー例

```typescript
// 1. システム初期化
const claudeIntegration = new ClaudeIntegration(claudeConfig);
const configManager = new ConfigManager();
const taskEvaluator = new TaskEvaluator();
const aiManager = new AIManager(claudeIntegration, configManager, taskEvaluator);
const sessionManager = new SessionManager();

await claudeIntegration.initialize();
await sessionManager.initialize();

// 2. セッション作成
const sessionId = await sessionManager.createSession({
  workingDirectory: './my-project'
});

// 3. タスク分析と実行
const taskRequest = {
  description: 'Create a RESTful API for user management',
  workingDirectory: './api',
  priority: 'high'
};

// タスク分析
const plan = await aiManager.analyzeTask(taskRequest);
console.log(`Generated plan: ${plan.title}`);
console.log(`Estimated duration: ${plan.estimatedDuration} minutes`);
console.log(`Confidence: ${Math.round(plan.confidence * 100)}%`);

// リスク評価の確認
if (plan.riskAssessment.overall === 'HIGH') {
  console.warn('High risk detected. Proceeding with caution.');
  plan.riskAssessment.risks.forEach(risk => {
    console.warn(`- ${risk.description}`);
  });
}

// タスク実行
const executionResult = await aiManager.executeTask(plan);

if (executionResult.success) {
  console.log('✅ Task completed successfully');
  
  // 結果評価
  const evaluation = await aiManager.evaluateResult(executionResult);
  console.log(`Quality: ${Math.round(evaluation.quality * 100)}%`);
  console.log(`Completeness: ${Math.round(evaluation.completeness * 100)}%`);
  
  if (evaluation.needsImprovement) {
    console.log('Improvement suggestions:');
    evaluation.improvements.forEach(suggestion => {
      console.log(`- ${suggestion}`);
    });
  }
} else {
  console.error('❌ Task execution failed');
}

// 4. セッション終了
await sessionManager.completeSession(sessionId);
```

### エラーハンドリングの例

```typescript
try {
  const plan = await aiManager.analyzeTask(taskRequest);
  const result = await aiManager.executeTask(plan);
} catch (error) {
  if (error instanceof RenkeiError) {
    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        console.error('Critical error:', error.message);
        // システム停止など
        break;
      case ErrorSeverity.ERROR:
        console.error('Error:', error.message);
        // リトライ処理など
        break;
      case ErrorSeverity.WARNING:
        console.warn('Warning:', error.message);
        // 継続可能
        break;
    }
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### パフォーマンス測定の例

```typescript
import { measurePerformance } from './utils/performance-optimizer.js';

class MyService {
  @measurePerformance(optimizer, 'data_processing')
  async processData(data: any[]): Promise<any[]> {
    // 重い処理
    return data.map(item => this.transform(item));
  }
}
```

---

## 📖 関連ドキュメント

- [Getting Started Guide](./getting-started.md)
- [Troubleshooting Guide](./troubleshooting.md)
- [Best Practices](./best-practices.md)
- [Configuration Reference](./configuration.md)

---

## 🤝 サポート

質問やフィードバックは以下まで：

- **Issues**: GitHub Issues
- **Documentation**: `/docs`
- **Examples**: `/examples`

---

**注意**: このAPIリファレンスは v1.0.0 時点の情報です。最新の情報は常にソースコードを確認してください。
