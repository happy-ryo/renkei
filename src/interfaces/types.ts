/**
 * Renkei System - 基本型定義
 */

// システム全体の基本型
export interface RenkeiConfig {
  version: string;
  workspaceDir: string;
  sessionDir: string;
  tmux: TmuxConfig;
  claude: ClaudeConfig;
  permissions: PermissionConfig;
}

export interface TmuxConfig {
  sessionName: string;
  mainPaneTitle: string;
  subPaneTitle: string;
  splitDirection: 'horizontal' | 'vertical';
  mainPaneSize: number;
}

export interface ClaudeConfig {
  apiKey?: string;
  maxTurns: number;
  timeout: number;
  outputFormat: 'json' | 'text';
  allowedTools: string[];
}

export interface PermissionConfig {
  permissions: {
    allow: string[];
    deny: string[];
  };
  autoApprove: boolean;
  dangerousCommands: string[];
}

// タスク関連の型
export interface TaskRequest {
  id: string;
  userPrompt: string;
  timestamp: Date;
  priority: 'low' | 'medium' | 'high';
  context?: TaskContext;
}

export interface TaskContext {
  workingDirectory: string;
  previousTasks: string[];
  sessionId?: string;
  files?: string[];
}

export interface TaskResult {
  id: string;
  status: 'success' | 'failure' | 'partial' | 'in_progress';
  sessionId: string;
  output: string;
  files: FileChange[];
  errors: TaskError[];
  metrics: TaskMetrics;
  timestamp: Date;
}

export interface FileChange {
  path: string;
  action: 'created' | 'modified' | 'deleted';
  content?: string;
  size?: number;
}

export interface TaskError {
  code: string;
  message: string;
  details?: string;
  timestamp: Date;
}

export interface TaskMetrics {
  executionTime: number;
  apiCalls: number;
  tokensUsed: number;
  cost?: number;
}

// セッション管理の型
export interface SessionState {
  sessionId: string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  startTime: Date;
  lastActivity: Date;
  taskHistory: TaskRequest[];
  context: SessionContext;
  metadata: SessionMetadata;
}

export interface SessionContext {
  workingDirectory: string;
  environment: Record<string, string>;
  openFiles: string[];
  currentTask?: TaskRequest;
}

export interface SessionMetadata {
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  totalExecutionTime: number;
  totalCost: number;
}

// UI関連の型
export interface UIState {
  mainPane: PaneState;
  subPane: PaneState;
  currentView: 'task' | 'progress' | 'history' | 'settings';
}

export interface PaneState {
  content: string[];
  scrollPosition: number;
  isActive: boolean;
  lastUpdate: Date;
}

// エラー処理の型
export enum ErrorCode {
  CLAUDE_API_ERROR = 'CLAUDE_API_ERROR',
  CLAUDE_TIMEOUT = 'CLAUDE_TIMEOUT',
  TMUX_ERROR = 'TMUX_ERROR',
  SESSION_ERROR = 'SESSION_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  CONFIG_ERROR = 'CONFIG_ERROR',
  FILE_ERROR = 'FILE_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR'
}

export class RenkeiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: string
  ) {
    super(message);
    this.name = 'RenkeiError';
  }
}

// ユーティリティ型
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// イベント関連の型
export interface SystemEvent {
  type: string;
  timestamp: Date;
  data: unknown;
}

export interface TaskStartEvent extends SystemEvent {
  type: 'task_start';
  data: {
    taskId: string;
    prompt: string;
  };
}

export interface TaskCompleteEvent extends SystemEvent {
  type: 'task_complete';
  data: {
    taskId: string;
    result: TaskResult;
  };
}

export interface SessionUpdateEvent extends SystemEvent {
  type: 'session_update';
  data: {
    sessionId: string;
    state: SessionState;
  };
}

export type RenkeiEvent = TaskStartEvent | TaskCompleteEvent | SessionUpdateEvent;

// 設定の型
export interface UserPreferences {
  theme: 'light' | 'dark';
  language: 'ja' | 'en';
  notifications: boolean;
  autoSave: boolean;
  debugMode: boolean;
}

export interface SystemInfo {
  platform: string;
  nodeVersion: string;
  tmuxVersion?: string | undefined;
  claudeCodeVersion?: string | undefined;
  renkeiVersion: string;
}
