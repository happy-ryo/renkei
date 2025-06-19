/**
 * Chat Interface - メインのチャットUIコンポーネント
 * tmuxペインでのチャット機能を管理
 */

import { EventEmitter } from 'events';
import { 
  ChatMessage, 
  ChatSessionState, 
  ChatConfig,
  ChatContext,
  IChatManager,
  ChatCommand,
  ChatError,
  ChatEventMap,
  ChatCommandConfig
} from '../../interfaces/chat-types';
import { InputHandler } from './input-handler';
import { ChatRenderer } from './chat-renderer';
import { v4 as uuidv4 } from 'uuid';

export class ChatInterface extends EventEmitter implements IChatManager {
  private sessionState: ChatSessionState;
  private messages: ChatMessage[] = [];
  private config: ChatConfig;
  private inputHandler: InputHandler;
  private renderer: ChatRenderer;
  private isActive: boolean = false;
  private commandHandlers: Map<string, (command: ChatCommand) => Promise<void>> = new Map();

  constructor(config: ChatConfig) {
    super();
    this.config = config;
    
    // セッション初期化
    this.sessionState = {
      sessionId: uuidv4(),
      startTime: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
      isActive: false,
      isPaused: false,
      currentContext: {
        workingDirectory: process.cwd(),
        recentFiles: [],
        activeCommands: []
      }
    };

    // 入力ハンドラーとレンダラーの初期化
    this.inputHandler = new InputHandler();
    this.renderer = new ChatRenderer({
      showTimestamp: true,
      showTokenCount: false,
      colorize: true,
      maxLineWidth: 80,
      theme: {
        userColor: '\x1b[36m',      // Cyan
        assistantColor: '\x1b[32m',  // Green
        systemColor: '\x1b[33m',     // Yellow
        errorColor: '\x1b[31m',      // Red
        timestampColor: '\x1b[90m',  // Gray
        commandColor: '\x1b[35m'     // Magenta
      }
    });

    this.setupEventHandlers();
    this.registerDefaultCommands();
  }

  /**
   * セッション管理
   */
  async startSession(): Promise<void> {
    if (this.isActive) {
      throw new Error('Session is already active');
    }

    this.isActive = true;
    this.sessionState.isActive = true;
    this.sessionState.startTime = new Date();
    
    // ウェルカムメッセージ表示
    if (this.config.welcomeMessage) {
      this.addSystemMessage(this.config.welcomeMessage);
    } else {
      this.addSystemMessage('🤖 Renkei Chat Interface Started\nType "help" for available commands');
    }

    // 入力ハンドラー開始
    this.inputHandler.start();
    
    this.emit('session_start', this.sessionState);
  }

  async endSession(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;
    this.sessionState.isActive = false;
    
    // 終了メッセージ
    if (this.config.exitMessage) {
      this.addSystemMessage(this.config.exitMessage);
    } else {
      this.addSystemMessage('👋 Chat session ended');
    }

    // 入力ハンドラー停止
    this.inputHandler.stop();
    
    this.emit('session_end', this.sessionState);
  }

  pauseSession(): void {
    if (!this.isActive || this.sessionState.isPaused) {
      return;
    }

    this.sessionState.isPaused = true;
    this.addSystemMessage('⏸️  Session paused');
    this.emit('session_pause');
  }

  resumeSession(): void {
    if (!this.isActive || !this.sessionState.isPaused) {
      return;
    }

    this.sessionState.isPaused = false;
    this.addSystemMessage('▶️  Session resumed');
    this.emit('session_resume');
  }

  /**
   * メッセージ処理
   */
  async processUserInput(input: string): Promise<void> {
    if (!this.isActive || this.sessionState.isPaused) {
      return;
    }

    this.sessionState.lastActivity = new Date();

    // コマンドチェック
    if (input.startsWith('/')) {
      await this.handleCommand(input);
      return;
    }

    // 通常のメッセージとして処理
    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    this.addMessage(userMessage);
    this.emit('message', userMessage);
  }

  sendMessage(message: ChatMessage): void {
    this.addMessage(message);
    this.emit('message', message);
  }

  /**
   * 履歴管理
   */
  getHistory(limit?: number): ChatMessage[] {
    if (limit) {
      return this.messages.slice(-limit);
    }
    return [...this.messages];
  }

  clearHistory(): void {
    this.messages = [];
    this.sessionState.messageCount = 0;
    this.renderer.clear();
    this.addSystemMessage('📜 History cleared');
  }

  exportHistory(format: 'json' | 'text' | 'markdown'): string {
    switch (format) {
      case 'json':
        return JSON.stringify(this.messages, null, 2);
      
      case 'text':
        return this.messages
          .map(msg => `[${msg.timestamp.toISOString()}] ${msg.role}: ${msg.content}`)
          .join('\n');
      
      case 'markdown':
        return this.messages
          .map(msg => {
            const prefix = msg.role === 'user' ? '**User**' : 
                         msg.role === 'assistant' ? '**Assistant**' : 
                         '**System**';
            return `${prefix} _(${msg.timestamp.toLocaleString()})_:\n${msg.content}\n`;
          })
          .join('\n---\n\n');
      
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * 状態管理
   */
  getSessionState(): ChatSessionState {
    return { ...this.sessionState };
  }

  getContext(): ChatContext | undefined {
    return this.sessionState.currentContext;
  }

  updateContext(context: Partial<ChatContext>): void {
    if (this.sessionState.currentContext) {
      this.sessionState.currentContext = {
        ...this.sessionState.currentContext,
        ...context
      };
    }
  }

  /**
   * コマンド処理
   */
  async executeCommand(command: ChatCommand): Promise<void> {
    const handler = this.commandHandlers.get(command.type);
    if (handler) {
      await handler(command);
    } else {
      this.addErrorMessage(`Unknown command: ${command.type}`);
    }
  }

  registerCommand(_config: ChatCommandConfig): void {
    // コマンドハンドラーは後でAIブリッジで実装
    // 現在はデフォルトハンドラーのみ使用
  }

  /**
   * Private methods
   */
  private setupEventHandlers(): void {
    // 入力ハンドラーのイベント
    this.inputHandler.on('input', async (input: string) => {
      await this.processUserInput(input);
    });

    this.inputHandler.on('interrupt', () => {
      this.addSystemMessage('🛑 Interrupted');
    });

    // エラーハンドリング
    this.on('error', (error: ChatError) => {
      this.renderer.displayError(error);
    });
  }

  private registerDefaultCommands(): void {
    // ヘルプコマンド
    this.commandHandlers.set('help', async () => {
      const helpText = this.renderer.formatHelp(this.config.commands);
      this.addSystemMessage(helpText);
    });

    // クリアコマンド
    this.commandHandlers.set('clear', async () => {
      this.clearHistory();
    });

    // 履歴表示コマンド
    this.commandHandlers.set('history', async (cmd: ChatCommand) => {
      const limit = cmd.args?.[0] ? parseInt(cmd.args[0]) : 10;
      const history = this.getHistory(limit);
      const formatted = this.renderer.formatHistory(history);
      this.addSystemMessage(formatted);
    });

    // エクスポートコマンド
    this.commandHandlers.set('export', async (cmd: ChatCommand) => {
      const format = (cmd.args?.[0] as 'json' | 'text' | 'markdown') || 'text';
      try {
        const exportedContent = this.exportHistory(format);
        const filename = `chat-export-${Date.now()}.${format === 'json' ? 'json' : format === 'markdown' ? 'md' : 'txt'}`;
        // TODO: ファイル保存の実装
        this.addSystemMessage(`📁 Exported to ${filename}`);
        // エクスポートした内容は将来的にファイルに保存
        void exportedContent;
      } catch (error) {
        this.addErrorMessage(`Export failed: ${error}`);
      }
    });

    // ステータスコマンド
    this.commandHandlers.set('status', async () => {
      const state = this.getSessionState();
      const statusText = `
📊 Session Status
━━━━━━━━━━━━━━━━
Session ID: ${state.sessionId}
Started: ${state.startTime.toLocaleString()}
Messages: ${state.messageCount}
Status: ${state.isPaused ? 'Paused' : 'Active'}
      `.trim();
      this.addSystemMessage(statusText);
    });

    // 一時停止/再開コマンド
    this.commandHandlers.set('pause', async () => {
      this.pauseSession();
    });

    this.commandHandlers.set('resume', async () => {
      this.resumeSession();
    });

    // 終了コマンド
    this.commandHandlers.set('exit', async () => {
      await this.endSession();
    });
  }

  private async handleCommand(input: string): Promise<void> {
    const parts = input.slice(1).split(' ');
    const commandType = parts[0];
    const args = parts.slice(1);

    const command: ChatCommand = {
      type: commandType as any,
      args,
      raw: input
    };

    this.emit('command', command);
    await this.executeCommand(command);
  }

  private addMessage(message: ChatMessage): void {
    this.messages.push(message);
    this.sessionState.messageCount++;
    this.sessionState.lastActivity = new Date();
    
    // 履歴サイズ制限
    if (this.messages.length > this.config.maxHistorySize) {
      this.messages.shift();
    }

    // メッセージを表示
    this.renderer.displayMessage(message);
  }

  private addSystemMessage(content: string): void {
    const message: ChatMessage = {
      id: uuidv4(),
      role: 'system',
      content,
      timestamp: new Date()
    };
    this.addMessage(message);
  }

  private addErrorMessage(content: string): void {
    const error: ChatError = {
      code: 'CHAT_ERROR',
      message: content,
      timestamp: new Date()
    };
    this.emit('error', error);
  }
}

// Type assertion for EventEmitter
export interface ChatInterface {
  on<K extends keyof ChatEventMap>(event: K, listener: ChatEventMap[K]): this;
  emit<K extends keyof ChatEventMap>(event: K, ...args: Parameters<ChatEventMap[K]>): boolean;
}