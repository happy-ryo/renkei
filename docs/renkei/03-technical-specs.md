# Renkei System - 技術仕様書

## 技術スタック

### 基盤技術
- **Runtime**: Node.js 18.x以上
- **言語**: TypeScript 5.0以上
- **プロセス管理**: tmux 3.0以上
- **AI統合**: ClaudeCode SDK (`@anthropic-ai/claude-code`)

### 依存関係
```json
{
  "dependencies": {
    "@anthropic-ai/claude-code": "^1.0.0",
    "commander": "^11.0.0",
    "inquirer": "^9.0.0",
    "chalk": "^5.0.0",
    "ora": "^7.0.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/uuid": "^9.0.0",
    "typescript": "^5.0.0",
    "ts-node": "^10.0.0",
    "nodemon": "^3.0.0"
  }
}
```

## プロジェクト構成

### ディレクトリ構造
```
renkei-system/
├── src/                        # TypeScriptソースコード
│   ├── main-controller.ts      # メインコントローラー
│   ├── managers/               # 管理クラス
│   │   ├── ai-manager.ts       # AI管理者
│   │   ├── claude-controller.ts # ClaudeCode制御
│   │   ├── session-manager.ts  # セッション管理
│   │   ├── tmux-manager.ts     # tmux制御
│   │   └── config-manager.ts   # 設定管理
│   ├── evaluators/             # 評価エンジン
│   │   ├── task-evaluator.ts   # タスク評価
│   │   └── quality-checker.ts  # 品質チェック
│   ├── interfaces/             # 型定義
│   │   ├── types.ts            # 共通型
│   │   ├── claude-types.ts     # ClaudeCode関連型
│   │   └── session-types.ts    # セッション関連型
│   ├── utils/                  # ユーティリティ
│   │   ├── logger.ts           # ログ管理
│   │   ├── error-handler.ts    # エラーハンドリング
│   │   └── file-utils.ts       # ファイル操作
│   └── ui/                     # UI関連
│       ├── progress-display.ts # 進捗表示
│       └── status-monitor.ts   # ステータス監視
├── scripts/                    # 実行スクリプト
│   ├── renkei-setup*           # セットアップスクリプト
│   ├── renkei-start*           # 起動スクリプト
│   └── renkei-stop*            # 停止スクリプト
├── config/                     # 設定ファイル
│   ├── default-settings.json   # デフォルト設定
│   └── templates/              # 設定テンプレート
├── data/                       # データディレクトリ
│   ├── sessions/               # セッション履歴
│   └── logs/                   # ログファイル
├── workspace/                  # 作業ディレクトリ
├── .claude/                    # ClaudeCode設定
│   ├── settings.json           # 許可設定
│   └── settings.local.json     # ローカル設定
├── dist/                       # コンパイル済みJS
├── docs/                       # ドキュメント
├── package.json                # Node.js設定
├── tsconfig.json               # TypeScript設定
└── README.md                   # プロジェクト説明
```

## 型定義仕様

### 共通型定義
```typescript
// src/interfaces/types.ts

export interface TaskRequest {
    id: string;
    userPrompt: string;
    timestamp: Date;
    priority: 'low' | 'medium' | 'high';
    context?: Record<string, any>;
}

export interface TaskResult {
    id: string;
    sessionId: string;
    status: 'success' | 'error' | 'partial';
    result: string;
    totalCost: number;
    duration: number;
    turnCount: number;
    files: FileChange[];
    errors?: ErrorInfo[];
}

export interface FileChange {
    path: string;
    action: 'created' | 'modified' | 'deleted';
    content?: string;
    size?: number;
}

export interface ErrorInfo {
    code: string;
    message: string;
    stack?: string;
    timestamp: Date;
}
```

### ClaudeCode SDK型定義
```typescript
// src/interfaces/claude-types.ts

import { SDKMessage } from '@anthropic-ai/claude-code';

export interface ClaudeExecutionOptions {
    allowedTools: string[];
    outputFormat: 'json' | 'text' | 'stream-json';
    maxTurns: number;
    sessionId?: string;
    verbose?: boolean;
}

export interface ClaudeTaskResult {
    type: 'result';
    subtype: 'success' | 'error_max_turns' | 'error_during_execution';
    sessionId: string;
    result: string;
    totalCostUsd: number;
    durationMs: number;
    numTurns: number;
    isError: boolean;
}

export interface ProgressMessage {
    type: 'progress';
    phase: string;
    message: string;
    percentage?: number;
    timestamp: Date;
}
```

### セッション管理型定義
```typescript
// src/interfaces/session-types.ts

export interface SessionState {
    sessionId: string;
    status: SessionStatus;
    userRequest: string;
    phases: TaskPhase[];
    metadata: SessionMetadata;
    createdAt: Date;
    updatedAt: Date;
}

export type SessionStatus = 
    | 'initializing'
    | 'analyzing'
    | 'executing'
    | 'evaluating'
    | 'completed'
    | 'failed'
    | 'cancelled';

export interface TaskPhase {
    id: string;
    name: string;
    prompt: string;
    result?: string;
    status: PhaseStatus;
    startTime: Date;
    endTime?: Date;
    cost: number;
}

export type PhaseStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface SessionMetadata {
    totalCost: number;
    totalDuration: number;
    totalTurns: number;
    filesCreated: number;
    filesModified: number;
}
```

## API仕様

### メインコントローラーAPI
```typescript
// src/main-controller.ts

export class MainController {
    private aiManager: AIManager;
    private tmuxManager: TmuxManager;
    private sessionManager: SessionManager;
    
    /**
     * システム初期化
     */
    async initialize(): Promise<void> {
        await this.loadConfiguration();
        await this.setupTmuxSession();
        await this.initializeManagers();
    }
    
    /**
     * ユーザータスク実行
     */
    async executeUserTask(request: TaskRequest): Promise<TaskResult> {
        const sessionId = await this.sessionManager.createSession(request);
        
        try {
            const result = await this.aiManager.processTask(request);
            await this.sessionManager.completeSession(sessionId, result);
            return result;
        } catch (error) {
            await this.sessionManager.failSession(sessionId, error);
            throw error;
        }
    }
    
    /**
     * システム終了
     */
    async shutdown(): Promise<void> {
        await this.tmuxManager.closeSession();
        await this.sessionManager.saveState();
    }
}
```

### ClaudeCode制御API
```typescript
// src/managers/claude-controller.ts

export class ClaudeController {
    private activeSession: string | null = null;
    private progressCallback?: (message: ProgressMessage) => void;
    
    /**
     * タスク実行
     */
    async executeTask(
        prompt: string, 
        options?: Partial<ClaudeExecutionOptions>
    ): Promise<ClaudeTaskResult> {
        const executionOptions: ClaudeExecutionOptions = {
            allowedTools: this.getDefaultAllowedTools(),
            outputFormat: 'json',
            maxTurns: 10,
            sessionId: this.activeSession,
            ...options
        };
        
        const messages: SDKMessage[] = [];
        
        for await (const message of query({
            prompt,
            options: executionOptions
        })) {
            messages.push(message);
            this.handleMessage(message);
        }
        
        const result = this.parseResult(messages);
        this.activeSession = result.sessionId;
        
        return result;
    }
    
    /**
     * セッション継続
     */
    async continueTask(
        feedback: string,
        sessionId: string
    ): Promise<ClaudeTaskResult> {
        this.activeSession = sessionId;
        return this.executeTask(feedback);
    }
    
    /**
     * 進捗コールバック設定
     */
    setProgressCallback(callback: (message: ProgressMessage) => void): void {
        this.progressCallback = callback;
    }
    
    private getDefaultAllowedTools(): string[] {
        return [
            "Write", "Read", "Edit", "MultiEdit",
            "Bash(npm:*)", "Bash(git:*)", "Bash(mkdir:*)",
            "Bash(ls:*)", "Bash(pwd)", "Bash(cat:*)",
            "Bash(echo:*)", "Bash(touch:*)"
        ];
    }
}
```

### AI管理者API
```typescript
// src/managers/ai-manager.ts

export class AIManager {
    private claudeController: ClaudeController;
    private taskEvaluator: TaskEvaluator;
    
    /**
     * タスク処理
     */
    async processTask(request: TaskRequest): Promise<TaskResult> {
        console.log(`🤖 タスク開始: ${request.userPrompt}`);
        
        // フェーズ1: 分析
        const analysis = await this.analyzeTask(request);
        
        // フェーズ2: 実行計画
        const plan = await this.createExecutionPlan(analysis);
        
        // フェーズ3: 実装
        let result = await this.claudeController.executeTask(plan);
        
        // フェーズ4: 評価ループ
        let iteration = 0;
        while (!this.taskEvaluator.isComplete(result, request) && iteration < 3) {
            console.log(`🔄 改善フェーズ ${iteration + 1}`);
            
            const feedback = await this.taskEvaluator.generateFeedback(result, request);
            result = await this.claudeController.continueTask(feedback, result.sessionId);
            
            iteration++;
        }
        
        console.log(`✅ タスク完了: ${result.result}`);
        return this.formatResult(result, request);
    }
    
    private async analyzeTask(request: TaskRequest): Promise<string> {
        return this.claudeController.executeTask(`
            以下のユーザー要求を分析し、実装に必要な技術要素を特定してください：
            
            要求: ${request.userPrompt}
            
            分析観点:
            1. 必要な技術スタック
            2. ファイル構成
            3. 実装手順
            4. 考慮すべき課題
        `).then(result => result.result);
    }
}
```

## 設定仕様

### システム設定
```typescript
// src/interfaces/config-types.ts

export interface SystemConfig {
    permissions: PermissionConfig;
    workspace: WorkspaceConfig;
    ui: UIConfig;
    ai: AIConfig;
    session: SessionConfig;
}

export interface PermissionConfig {
    allowedTools: string[];
    deniedTools: string[];
    workspaceRestriction: boolean;
    maxFileSize: number; // MB
    allowedExtensions: string[];
}

export interface WorkspaceConfig {
    baseDirectory: string;
    projectSubdirectories: string[];
    autoCleanup: boolean;
    maxProjects: number;
}

export interface UIConfig {
    theme: 'dark' | 'light';
    updateInterval: number; // ms
    showCost: boolean;
    showDuration: boolean;
    progressAnimations: boolean;
}

export interface AIConfig {
    maxTurns: number;
    timeoutMs: number;
    retryAttempts: number;
    costWarningThreshold: number; // USD
}

export interface SessionConfig {
    maxHistory: number;
    autoSave: boolean;
    compressionEnabled: boolean;
}
```

### デフォルト設定ファイル
```json
{
  "permissions": {
    "allowedTools": [
      "Write", "Read", "Edit", "MultiEdit",
      "Bash(npm:*)", "Bash(git:*)", "Bash(mkdir:*)",
      "Bash(ls:*)", "Bash(pwd)", "Bash(cat:*)",
      "Bash(echo:*)", "Bash(touch:*)"
    ],
    "deniedTools": [
      "Bash(rm:*)", "Bash(rmdir:*)", "Bash(sudo:*)",
      "Bash(curl:*)", "WebFetch", "WebSearch"
    ],
    "workspaceRestriction": true,
    "maxFileSize": 10,
    "allowedExtensions": [
      ".js", ".ts", ".tsx", ".jsx", ".json", ".md",
      ".html", ".css", ".scss", ".py", ".sh"
    ]
  },
  "workspace": {
    "baseDirectory": "./workspace",
    "projectSubdirectories": ["projects", "temp", "archive"],
    "autoCleanup": true,
    "maxProjects": 50
  },
  "ui": {
    "theme": "dark",
    "updateInterval": 1000,
    "showCost": true,
    "showDuration": true,
    "progressAnimations": true
  },
  "ai": {
    "maxTurns": 15,
    "timeoutMs": 60000,
    "retryAttempts": 3,
    "costWarningThreshold": 1.0
  },
  "session": {
    "maxHistory": 100,
    "autoSave": true,
    "compressionEnabled": true
  }
}
```

## エラーハンドリング仕様

### エラー分類
```typescript
// src/utils/error-handler.ts

export enum ErrorCode {
    // システムエラー
    SYSTEM_INIT_FAILED = 'SYS_001',
    TMUX_SESSION_FAILED = 'SYS_002',
    CONFIG_LOAD_FAILED = 'SYS_003',
    
    // ClaudeCodeエラー
    CLAUDE_API_ERROR = 'CLD_001',
    CLAUDE_TIMEOUT = 'CLD_002',
    CLAUDE_PERMISSION_DENIED = 'CLD_003',
    CLAUDE_SESSION_LOST = 'CLD_004',
    
    // タスクエラー
    TASK_VALIDATION_FAILED = 'TSK_001',
    TASK_EXECUTION_FAILED = 'TSK_002',
    TASK_EVALUATION_FAILED = 'TSK_003',
    
    // ワークスペースエラー
    WORKSPACE_ACCESS_DENIED = 'WKS_001',
    WORKSPACE_FULL = 'WKS_002',
    FILE_SIZE_EXCEEDED = 'WKS_003'
}

export class RenkeiError extends Error {
    constructor(
        public code: ErrorCode,
        message: string,
        public context?: Record<string, any>
    ) {
        super(message);
        this.name = 'RenkeiError';
    }
}

export class ErrorHandler {
    async handleError(error: Error): Promise<void> {
        if (error instanceof RenkeiError) {
            await this.handleRenkeiError(error);
        } else {
            await this.handleUnknownError(error);
        }
    }
    
    private async handleRenkeiError(error: RenkeiError): Promise<void> {
        const logEntry = {
            code: error.code,
            message: error.message,
            context: error.context,
            timestamp: new Date()
        };
        
        await this.logError(logEntry);
        
        switch (error.code) {
            case ErrorCode.CLAUDE_SESSION_LOST:
                await this.recoverSession();
                break;
            case ErrorCode.TASK_EXECUTION_FAILED:
                await this.retryTask();
                break;
            default:
                await this.showUserError(error);
        }
    }
}
```

## ログ仕様

### ログレベル
```typescript
export enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3,
    TRACE = 4
}

export interface LogEntry {
    level: LogLevel;
    timestamp: Date;
    component: string;
    message: string;
    metadata?: Record<string, any>;
}

export class Logger {
    private logLevel: LogLevel = LogLevel.INFO;
    
    error(component: string, message: string, metadata?: Record<string, any>): void {
        this.log(LogLevel.ERROR, component, message, metadata);
    }
    
    warn(component: string, message: string, metadata?: Record<string, any>): void {
        this.log(LogLevel.WARN, component, message, metadata);
    }
    
    info(component: string, message: string, metadata?: Record<string, any>): void {
        this.log(LogLevel.INFO, component, message, metadata);
    }
    
    private log(
        level: LogLevel, 
        component: string, 
        message: string, 
        metadata?: Record<string, any>
    ): void {
        if (level <= this.logLevel) {
            const entry: LogEntry = {
                level,
                timestamp: new Date(),
                component,
                message,
                metadata
            };
            
            this.writeLog(entry);
        }
    }
}
```

## パフォーマンス仕様

### 性能目標
- **起動時間**: 5秒以内
- **応答時間**: 平均2秒以内
- **メモリ使用量**: 512MB以下
- **CPU使用率**: 平均50%以下

### 最適化戦略
```typescript
// src/utils/performance-optimizer.ts

export class PerformanceOptimizer {
    private static readonly MEMORY_LIMIT_MB = 512;
    private static readonly CPU_LIMIT_PERCENT = 50;
    
    async monitorPerformance(): Promise<void> {
        setInterval(() => {
            this.checkMemoryUsage();
            this.checkCPUUsage();
        }, 10000); // 10秒間隔
    }
    
    private checkMemoryUsage(): void {
        const usage = process.memoryUsage();
        const usageMB = usage.heapUsed / 1024 / 1024;
        
        if (usageMB > PerformanceOptimizer.MEMORY_LIMIT_MB) {
            this.triggerGarbageCollection();
        }
    }
    
    private triggerGarbageCollection(): void {
        if (global.gc) {
            global.gc();
        }
    }
}
```

## セキュリティ仕様

### 基本セキュリティ原則
1. **最小権限の原則**: 必要最小限の許可のみ付与
2. **サンドボックス実行**: 作業ディレクトリ内での実行制限
3. **入力検証**: すべての外部入力の検証
4. **ログ監視**: セキュリティイベントの記録

### 実装例
```typescript
// src/utils/security-validator.ts

export class SecurityValidator {
    private dangerousCommands = [
        'rm -rf', 'sudo', 'curl', 'wget', 'nc', 'netcat'
    ];
    
    validateCommand(command: string): boolean {
        return !this.dangerousCommands.some(dangerous => 
            command.toLowerCase().includes(dangerous)
        );
    }
    
    validatePath(path: string): boolean {
        const resolved = require('path').resolve(path);
        const workspaceBase = require('path').resolve('./workspace');
        
        return resolved.startsWith(workspaceBase);
    }
    
    sanitizeInput(input: string): string {
        return input
            .replace(/[<>]/g, '')  // HTMLタグ除去
            .replace(/[;&|`]/g, '') // シェル特殊文字除去
            .trim();
    }
}
```

## 次のステップ

1. **許可システム詳細設計** → `04-permission-system.md`
2. **ユーザーエクスペリエンス設計** → `05-user-experience.md`
3. **実装計画策定** → `06-implementation-plan.md`
