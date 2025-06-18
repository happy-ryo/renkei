/**
 * ClaudeCode SDK 型定義
 */

// ClaudeCode SDK の基本型
export interface SDKMessage {
  type: 'result' | 'error' | 'progress' | 'input_request';
  subtype?: string;
  content?: string;
  data?: unknown;
  timestamp: Date;
}

export interface SDKResult extends SDKMessage {
  type: 'result';
  subtype: 'success' | 'partial' | 'failure';
  sessionId: string;
  files?: SDKFileChange[];
  output: string;
  metrics?: SDKMetrics;
}

export interface SDKError extends SDKMessage {
  type: 'error';
  code: string;
  message: string;
  details?: string;
  recoverable: boolean;
}

export interface SDKProgress extends SDKMessage {
  type: 'progress';
  subtype: 'thinking' | 'executing' | 'validating' | 'completing';
  progress: number; // 0-100
  currentStep: string;
  estimatedTimeRemaining?: number;
}

export interface SDKInputRequest extends SDKMessage {
  type: 'input_request';
  prompt: string;
  options?: string[];
  required: boolean;
}

export interface SDKFileChange {
  path: string;
  action: 'create' | 'modify' | 'delete' | 'read';
  content?: string;
  size?: number;
  permissions?: string;
}

export interface SDKMetrics {
  tokensUsed: number;
  apiCalls: number;
  executionTime: number;
  cost?: number;
}

// ClaudeCode クエリオプション
export interface ClaudeQueryOptions {
  prompt: string;
  options?: ClaudeExecutionOptions;
}

export interface ClaudeExecutionOptions {
  allowedTools?: string[];
  outputFormat?: 'json' | 'text';
  maxTurns?: number;
  timeout?: number;
  workingDirectory?: string;
  sessionId?: string;
  autoApprove?: boolean;
  permissions?: ClaudePermissions;
}

export interface ClaudePermissions {
  allow: string[];
  deny: string[];
  autoApprove: boolean;
}

// ClaudeCode セッション管理
export interface ClaudeSession {
  sessionId: string;
  status: 'active' | 'paused' | 'completed' | 'error';
  startTime: Date;
  lastActivity: Date;
  messages: SDKMessage[];
  context: ClaudeSessionContext;
}

export interface ClaudeSessionContext {
  workingDirectory: string;
  files: string[];
  variables: Record<string, string>;
  history: string[];
}

// ClaudeCode コントローラー用の型
export interface ClaudeControllerConfig {
  apiKey?: string;
  maxRetries: number;
  retryDelay: number;
  timeout: number;
  defaultOptions: ClaudeExecutionOptions;
}

export interface ClaudeTaskExecution {
  taskId: string;
  sessionId: string;
  prompt: string;
  options: ClaudeExecutionOptions;
  startTime: Date;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  messages: SDKMessage[];
  result?: SDKResult;
  error?: SDKError;
}

// ClaudeCode API レスポンス型
export interface ClaudeAPIResponse {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    details?: string;
  };
  metadata?: {
    requestId: string;
    timestamp: Date;
    processingTime: number;
  };
}

// ClaudeCode 設定型
export interface ClaudeCodeSettings {
  permissions: {
    allow: string[];
    deny: string[];
  };
  autoApprove: boolean;
  workspaceRestrictions: {
    allowedDirectories: string[];
    forbiddenDirectories: string[];
    maxFileSize: number;
  };
  executionLimits: {
    maxExecutionTime: number;
    maxMemoryUsage: number;
    maxApiCalls: number;
  };
  security: {
    dangerousCommands: string[];
    requireConfirmation: string[];
    logAllCommands: boolean;
  };
}

// ClaudeCode エラー型
export enum ClaudeErrorCode {
  API_ERROR = 'API_ERROR',
  TIMEOUT = 'TIMEOUT',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  INVALID_REQUEST = 'INVALID_REQUEST',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INSUFFICIENT_CREDITS = 'INSUFFICIENT_CREDITS',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export class ClaudeCodeError extends Error {
  constructor(
    public code: ClaudeErrorCode,
    message: string,
    public details?: string,
    public recoverable: boolean = false
  ) {
    super(message);
    this.name = 'ClaudeCodeError';
  }
}

// ClaudeCode イベント型
export interface ClaudeEvent {
  type: string;
  timestamp: Date;
  sessionId: string;
  data: unknown;
}

export interface ClaudeTaskStartEvent extends ClaudeEvent {
  type: 'task_start';
  data: {
    taskId: string;
    prompt: string;
    options: ClaudeExecutionOptions;
  };
}

export interface ClaudeProgressEvent extends ClaudeEvent {
  type: 'progress';
  data: SDKProgress;
}

export interface ClaudeTaskCompleteEvent extends ClaudeEvent {
  type: 'task_complete';
  data: {
    taskId: string;
    result: SDKResult;
  };
}

export interface ClaudeErrorEvent extends ClaudeEvent {
  type: 'error';
  data: SDKError;
}

export type ClaudeEventType =
  | ClaudeTaskStartEvent
  | ClaudeProgressEvent
  | ClaudeTaskCompleteEvent
  | ClaudeErrorEvent;

// ClaudeCode ユーティリティ型
export type ClaudeMessageHandler = (
  message: SDKMessage
) => void | Promise<void>;

export type ClaudeProgressHandler = (progress: SDKProgress) => void;

export type ClaudeErrorHandler = (error: SDKError) => void;

export interface ClaudeHandlers {
  onMessage?: ClaudeMessageHandler;
  onProgress?: ClaudeProgressHandler;
  onError?: ClaudeErrorHandler;
  onComplete?: (result: SDKResult) => void;
}

// ClaudeCode 統計情報
export interface ClaudeUsageStats {
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  totalTokensUsed: number;
  totalCost: number;
  averageExecutionTime: number;
  mostUsedTools: Array<{
    tool: string;
    count: number;
  }>;
}

// ClaudeCode バッチ処理用
export interface ClaudeBatchTask {
  id: string;
  prompt: string;
  options?: ClaudeExecutionOptions;
  priority: number;
  dependencies?: string[];
}

export interface ClaudeBatchResult {
  batchId: string;
  tasks: Array<{
    taskId: string;
    status: 'completed' | 'failed' | 'skipped';
    result?: SDKResult;
    error?: SDKError;
  }>;
  summary: {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
    totalTime: number;
  };
}
