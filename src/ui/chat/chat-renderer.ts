/**
 * Chat Renderer - チャットメッセージの表示
 * ターミナルでのメッセージフォーマットと表示を管理
 */

import {
  ChatMessage,
  ChatError,
  ChatCommand,
  ChatDisplayOptions,
  IOutputFormatter,
  ChatCommandConfig
} from '../../interfaces/chat-types';

export class ChatRenderer implements IOutputFormatter {
  private options: ChatDisplayOptions;
  
  constructor(options: ChatDisplayOptions) {
    this.options = options;
  }

  /**
   * メッセージを表示
   */
  displayMessage(message: ChatMessage): void {
    const formatted = this.formatMessage(message);
    console.log(formatted);
  }

  /**
   * エラーを表示
   */
  displayError(error: ChatError): void {
    const formatted = this.formatError(error);
    console.error(formatted);
  }

  /**
   * メッセージをフォーマット
   */
  formatMessage(message: ChatMessage): string {
    const parts: string[] = [];
    
    // タイムスタンプ
    if (this.options.showTimestamp) {
      const timestamp = message.timestamp.toLocaleTimeString();
      parts.push(this.colorize(`[${timestamp}]`, this.options.theme.timestampColor));
    }

    // ロール
    const roleColor = this.getRoleColor(message.role);
    const rolePrefix = this.getRolePrefix(message.role);
    parts.push(this.colorize(rolePrefix, roleColor));

    // コンテンツ
    const content = this.wrapText(message.content, this.options.maxLineWidth);
    parts.push(content);

    // メタデータ
    if (this.options.showTokenCount && message.metadata?.tokenCount) {
      parts.push(this.colorize(`(${message.metadata.tokenCount} tokens)`, this.options.theme.timestampColor));
    }

    return parts.join(' ');
  }

  /**
   * エラーをフォーマット
   */
  formatError(error: ChatError): string {
    const parts: string[] = [];
    
    // タイムスタンプ
    if (this.options.showTimestamp) {
      const timestamp = error.timestamp.toLocaleTimeString();
      parts.push(this.colorize(`[${timestamp}]`, this.options.theme.timestampColor));
    }

    // エラープレフィックス
    parts.push(this.colorize('❌ ERROR:', this.options.theme.errorColor));

    // エラーメッセージ
    parts.push(this.colorize(error.message, this.options.theme.errorColor));

    // 詳細情報
    if (error.details) {
      parts.push('\n' + this.colorize(`Details: ${JSON.stringify(error.details, null, 2)}`, this.options.theme.timestampColor));
    }

    return parts.join(' ');
  }

  /**
   * コマンドをフォーマット
   */
  formatCommand(command: ChatCommand): string {
    return this.colorize(`/${command.type} ${command.args?.join(' ') || ''}`, this.options.theme.commandColor);
  }

  /**
   * 履歴をフォーマット
   */
  formatHistory(messages: ChatMessage[]): string {
    if (messages.length === 0) {
      return '📜 No messages in history';
    }

    const header = `📜 Chat History (${messages.length} messages)\n${'─'.repeat(50)}`;
    const formattedMessages = messages.map((msg, index) => {
      const num = `${index + 1}.`;
      return `${num.padEnd(4)} ${this.formatMessage(msg)}`;
    }).join('\n');

    return `${header}\n${formattedMessages}\n${'─'.repeat(50)}`;
  }

  /**
   * ウェルカムメッセージをフォーマット
   */
  formatWelcome(config: { welcomeMessage?: string; commands: ChatCommandConfig[] }): string {
    const lines: string[] = [];
    
    lines.push('━'.repeat(60));
    lines.push(this.colorize('🤖 Renkei Interactive Chat', this.options.theme.assistantColor));
    lines.push('━'.repeat(60));
    
    if (config.welcomeMessage) {
      lines.push(config.welcomeMessage);
    }
    
    lines.push('');
    lines.push('Type /help for available commands');
    lines.push('');
    
    return lines.join('\n');
  }

  /**
   * ヘルプをフォーマット
   */
  formatHelp(commands: ChatCommandConfig[]): string {
    const lines: string[] = [];
    
    lines.push('📚 Available Commands');
    lines.push('━'.repeat(40));
    
    // デフォルトコマンド
    const defaultCommands = [
      { command: '/help', description: 'Show this help message' },
      { command: '/clear', description: 'Clear chat history' },
      { command: '/history [n]', description: 'Show last n messages' },
      { command: '/export [format]', description: 'Export chat (json/text/markdown)' },
      { command: '/status', description: 'Show session status' },
      { command: '/pause', description: 'Pause session' },
      { command: '/resume', description: 'Resume session' },
      { command: '/exit', description: 'End chat session' }
    ];

    // すべてのコマンドを結合
    const allCommands = [...defaultCommands, ...commands];
    
    // 最大コマンド長を計算
    const maxCmdLength = Math.max(...allCommands.map(cmd => cmd.command.length));
    
    // コマンドをフォーマット
    allCommands.forEach(cmd => {
      const paddedCmd = cmd.command.padEnd(maxCmdLength + 2);
      lines.push(`  ${this.colorize(paddedCmd, this.options.theme.commandColor)} ${cmd.description}`);
    });
    
    lines.push('━'.repeat(40));
    
    return lines.join('\n');
  }

  /**
   * 画面をクリア
   */
  clear(): void {
    console.clear();
  }

  /**
   * Private helper methods
   */
  private getRoleColor(role: 'user' | 'assistant' | 'system'): string {
    switch (role) {
      case 'user':
        return this.options.theme.userColor;
      case 'assistant':
        return this.options.theme.assistantColor;
      case 'system':
        return this.options.theme.systemColor;
      default:
        return '';
    }
  }

  private getRolePrefix(role: 'user' | 'assistant' | 'system'): string {
    switch (role) {
      case 'user':
        return '👤 You:';
      case 'assistant':
        return '🤖 AI:';
      case 'system':
        return '📢 System:';
      default:
        return `${role}:`;
    }
  }

  private colorize(text: string, color: string): string {
    if (!this.options.colorize) {
      return text;
    }
    return `${color}${text}\x1b[0m`;
  }

  private wrapText(text: string, maxWidth: number): string {
    if (text.length <= maxWidth) {
      return text;
    }

    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if (currentLine.length + word.length + 1 > maxWidth) {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          // 単語が長すぎる場合は強制的に分割
          lines.push(word.substring(0, maxWidth));
          currentLine = word.substring(maxWidth);
        }
      } else {
        currentLine = currentLine ? `${currentLine} ${word}` : word;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    // インデント付きで結合
    return lines.join('\n       ');
  }
}