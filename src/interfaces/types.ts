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
  limits?: LimitsConfig;
  logging?: LoggingConfig;
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
  autoApprove?: boolean;
}

export interface PermissionConfig {
  permissions: {
    allow: string[];
    deny: string[];
  };
  autoApprove: boolean;
  dangerousCommands: string[];
  allowedCommands?: string[];
  deniedCommands?: string[];
}

export interface LimitsConfig {
  maxFileSize?: number;
  maxExecutionTime?: number;
  maxMemoryUsage?: number;
  maxApiCalls?: number;
}

export interface LoggingConfig {
  commandLogging?: boolean;
  level?: 'debug' | 'info' | 'warn' | 'error';
  outputFile?: string;
}

// タスク関連の型
export interface TaskRequest {
  id: string;
  userPrompt: string;
  description: string;
  workingDirectory: string;
  priority: 'low' | 'medium' | 'high';
  deadline?: Date;
  timestamp: Date;
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
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}

export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export class RenkeiError extends Error {
  constructor(
    message: string,
    public code: string,
    public severity: ErrorSeverity,
    public originalError?: unknown,
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

export type OptionalFields<T, K extends keyof T> = Omit<T, K> &
  Partial<Pick<T, K>>;

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

export type RenkeiEvent =
  | TaskStartEvent
  | TaskCompleteEvent
  | SessionUpdateEvent;

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

// AI Manager関連の型定義
export interface AIManagerConfig {
  analysisTimeout: number;
  planningTimeout: number;
  executionTimeout: number;
  maxRetries: number;
  qualityThreshold: number;
}

export interface TaskPlan {
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

export interface TaskPhase {
  id: string;
  name: string;
  description: string;
  steps: TaskStep[];
  deliverables: string[];
}

export interface TaskStep {
  id: string;
  description: string;
  type: 'create_file' | 'modify_file' | 'run_command' | 'test';
  target: string;
  content: string;
  dependencies: string[];
  estimatedTime: string;
}

export interface RiskAssessment {
  overall: 'LOW' | 'MEDIUM' | 'HIGH';
  risks: Risk[];
  recommendations: string[];
  blockers: string[];
}

export interface Risk {
  id: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  probability: 'LOW' | 'MEDIUM' | 'HIGH';
  impact: string;
  mitigation: string;
  contingency: string;
}

export interface ExecutionResult {
  taskId: string;
  success: boolean;
  duration: number;
  results: any[];
  metrics: any;
  completedAt: Date;
}

export enum TaskStatus {
  IDLE = 'idle',
  ANALYZING = 'analyzing',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  ERROR = 'error',
  STOPPING = 'stopping',
  STOPPED = 'stopped'
}

export enum AIManagerEvents {
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
  ERROR = 'error'
}
