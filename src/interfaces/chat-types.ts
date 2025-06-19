/**
 * Interactive Chat Feature - Type Definitions
 * 対話型チャット機能の型定義
 */

import { EventEmitter } from 'events';

// チャットメッセージの基本型
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: MessageMetadata;
}

export interface MessageMetadata {
  tokenCount?: number;
  processingTime?: number;
  error?: boolean;
  commandType?: ChatCommandType;
}

// チャットコマンドの型
export type ChatCommandType =
  | 'help'
  | 'clear'
  | 'history'
  | 'export'
  | 'status'
  | 'pause'
  | 'resume'
  | 'exit';

export interface ChatCommand {
  type: ChatCommandType;
  args?: string[];
  raw: string;
}

// チャットセッションの状態
export interface ChatSessionState {
  sessionId: string;
  startTime: Date;
  lastActivity: Date;
  messageCount: number;
  isActive: boolean;
  isPaused: boolean;
  currentContext?: ChatContext;
}

export interface ChatContext {
  taskId?: string;
  workingDirectory: string;
  recentFiles: string[];
  activeCommands: string[];
}

// チャット履歴管理
export interface ChatHistory {
  messages: ChatMessage[];
  maxMessages: number;
  totalTokens: number;
}

// チャット設定
export interface ChatConfig {
  maxHistorySize: number;
  autoSave: boolean;
  saveInterval: number;
  promptPrefix?: string;
  welcomeMessage?: string;
  exitMessage?: string;
  commands: ChatCommandConfig[];
}

export interface ChatCommandConfig {
  command: string;
  description: string;
  aliases?: string[];
  handler: string;
}

// チャットイベント
export interface ChatEventMap {
  message: (message: ChatMessage) => void;
  command: (command: ChatCommand) => void;
  error: (error: ChatError) => void;
  session_start: (session: ChatSessionState) => void;
  session_end: (session: ChatSessionState) => void;
  session_pause: () => void;
  session_resume: () => void;
  history_export: (format: 'json' | 'text' | 'markdown') => void;
}

export interface ChatError {
  code: string;
  message: string;
  details?: unknown;
  timestamp: Date;
}

// チャットマネージャーのインターフェース
export interface IChatManager extends EventEmitter {
  // セッション管理
  startSession(): Promise<void>;
  endSession(): Promise<void>;
  pauseSession(): void;
  resumeSession(): void;

  // メッセージ処理
  processUserInput(input: string): Promise<void>;
  sendMessage(message: ChatMessage): void;

  // 履歴管理
  getHistory(limit?: number): ChatMessage[];
  clearHistory(): void;
  exportHistory(format: 'json' | 'text' | 'markdown'): string;

  // 状態管理
  getSessionState(): ChatSessionState;
  getContext(): ChatContext | undefined;
  updateContext(context: Partial<ChatContext>): void;

  // コマンド処理
  executeCommand(command: ChatCommand): Promise<void>;
  registerCommand(config: ChatCommandConfig): void;
}

// 入力ハンドラーのインターフェース
export interface IInputHandler {
  start(): void;
  stop(): void;
  on(event: 'input', listener: (input: string) => void): void;
  on(event: 'interrupt', listener: () => void): void;
  setPrompt(prompt: string): void;
}

// 出力フォーマッターのインターフェース
export interface IOutputFormatter {
  formatMessage(message: ChatMessage): string;
  formatError(error: ChatError): string;
  formatCommand(command: ChatCommand): string;
  formatHistory(messages: ChatMessage[]): string;
  formatWelcome(config: ChatConfig): string;
  formatHelp(commands: ChatCommandConfig[]): string;
}

// チャット表示オプション
export interface ChatDisplayOptions {
  showTimestamp: boolean;
  showTokenCount: boolean;
  colorize: boolean;
  maxLineWidth: number;
  theme: ChatTheme;
}

export interface ChatTheme {
  userColor: string;
  assistantColor: string;
  systemColor: string;
  errorColor: string;
  timestampColor: string;
  commandColor: string;
}

// チャット統合設定
export interface ChatIntegrationConfig {
  aiManagerEndpoint: string;
  messageQueueSize: number;
  responseTimeout: number;
  retryAttempts: number;
  retryDelay: number;
}

// メッセージキューアイテム
export interface QueuedMessage {
  message: ChatMessage;
  priority: 'high' | 'normal' | 'low';
  retryCount: number;
  callback?: (response: ChatMessage) => void;
}

// チャットメトリクス
export interface ChatMetrics {
  totalMessages: number;
  averageResponseTime: number;
  totalTokensUsed: number;
  errorRate: number;
  sessionDuration: number;
  commandsExecuted: Record<ChatCommandType, number>;
}

// エクスポート形式
export interface ExportFormat {
  format: 'json' | 'text' | 'markdown';
  includeMetadata: boolean;
  includeTimestamps: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
}
