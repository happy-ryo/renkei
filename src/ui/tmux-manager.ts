/**
 * Renkei System - Tmux Manager
 * tmux session management and pane control
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { TmuxConfig, PaneState, RenkeiError, ErrorSeverity } from '../interfaces/types';

export interface TmuxSession {
  sessionId: string;
  sessionName: string;
  mainPaneId: string;
  subPaneId?: string;
  status: 'active' | 'inactive' | 'error';
  createdAt: Date;
}

export interface PaneInfo {
  paneId: string;
  index: number;
  width: number;
  height: number;
  isActive: boolean;
  title?: string;
}

export type SplitDirection = 'horizontal' | 'vertical';

export interface InputHandler {
  (input: string, paneId: string): Promise<void>;
}

/**
 * TmuxManager - tmux session and pane management
 */
export class TmuxManager extends EventEmitter {
  private sessions: Map<string, TmuxSession> = new Map();
  private controlProcess: ChildProcess | null = null;
  private inputHandlers: Map<string, InputHandler> = new Map();
  private paneStates: Map<string, PaneState> = new Map();

  constructor(private config: TmuxConfig) {
    super();
    this.setupEventHandlers();
  }

  /**
   * セッション管理
   */
  async createSession(sessionName?: string): Promise<string> {
    const actualSessionName = sessionName || this.config.sessionName;
    const sessionId = `renkei-${Date.now()}`;

    try {
      // tmux control mode でセッション作成
      await this.executeCommand([
        'new-session',
        '-d',
        '-s',
        actualSessionName,
        '-x',
        '120',
        '-y',
        '40'
      ]);

      // メインペインの情報を取得
      const mainPaneId = await this.getMainPaneId(actualSessionName);

      // セッション情報を保存
      const session: TmuxSession = {
        sessionId,
        sessionName: actualSessionName,
        mainPaneId,
        status: 'active',
        createdAt: new Date()
      };

      this.sessions.set(sessionId, session);

      // メインペインのタイトル設定
      await this.setPaneTitle(mainPaneId, this.config.mainPaneTitle);

      this.emit('session_created', session);
      return sessionId;
    } catch (error) {
      throw new RenkeiError(
        `Failed to create tmux session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'TMUX_ERROR',
        ErrorSeverity.ERROR,
        error,
        `Session name: ${actualSessionName}`
      );
    }
  }

  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new RenkeiError(
        `Session not found: ${sessionId}`,
        'SESSION_ERROR',
        ErrorSeverity.ERROR
      );
    }

    try {
      await this.executeCommand([
        'kill-session',
        '-t',
        session.sessionName
      ]);

      this.sessions.delete(sessionId);
      this.emit('session_destroyed', session);
    } catch (error) {
      throw new RenkeiError(
        `Failed to destroy session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'TMUX_ERROR',
        ErrorSeverity.ERROR,
        error,
        `Session: ${session.sessionName}`
      );
    }
  }

  async getSessionStatus(sessionId: string): Promise<TmuxSession | null> {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * ペイン制御
   */
  async splitPane(sessionId: string, direction: SplitDirection): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new RenkeiError(
        `Session not found: ${sessionId}`,
        'SESSION_ERROR',
        ErrorSeverity.ERROR
      );
    }

    try {
      const splitFlag = direction === 'horizontal' ? '-h' : '-v';
      const result = await this.executeCommand([
        'split-window',
        splitFlag,
        '-t',
        session.sessionName,
        '-P',
        '-F',
        '#{pane_id}'
      ]);

      const newPaneId = result.trim();
      session.subPaneId = newPaneId;

      // サブペインのタイトル設定
      await this.setPaneTitle(newPaneId, this.config.subPaneTitle);

      // ペインサイズ調整
      await this.resizePane(session.mainPaneId, this.config.mainPaneSize);

      this.emit('pane_split', { sessionId, paneId: newPaneId, direction });
      return newPaneId;
    } catch (error) {
      throw new RenkeiError(
        `Failed to split pane: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'TMUX_ERROR',
        ErrorSeverity.ERROR,
        error,
        `Session: ${session.sessionName}, Direction: ${direction}`
      );
    }
  }

  async resizePane(paneId: string, size: number): Promise<void> {
    try {
      await this.executeCommand([
        'resize-pane',
        '-t',
        paneId,
        '-x',
        size.toString()
      ]);

      this.emit('pane_resized', { paneId, size });
    } catch (error) {
      throw new RenkeiError(
        `Failed to resize pane: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'TMUX_ERROR',
        ErrorSeverity.ERROR,
        error,
        `Pane: ${paneId}, Size: ${size}`
      );
    }
  }

  async focusPane(paneId: string): Promise<void> {
    try {
      await this.executeCommand([
        'select-pane',
        '-t',
        paneId
      ]);

      this.emit('pane_focused', { paneId });
    } catch (error) {
      throw new RenkeiError(
        `Failed to focus pane: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'TMUX_ERROR',
        ErrorSeverity.ERROR,
        error,
        `Pane: ${paneId}`
      );
    }
  }

  /**
   * 内容更新
   */
  async updatePaneContent(paneId: string, content: string): Promise<void> {
    try {
      // 既存の内容をクリア
      await this.clearPane(paneId);
      
      // 新しい内容を設定
      await this.appendToPaneContent(paneId, content);

      // 状態を更新
      this.updatePaneState(paneId, content);

      this.emit('pane_updated', { paneId, content });
    } catch (error) {
      throw new RenkeiError(
        `Failed to update pane content: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'TMUX_ERROR',
        ErrorSeverity.ERROR,
        error,
        `Pane: ${paneId}`
      );
    }
  }

  async appendToPaneContent(paneId: string, content: string): Promise<void> {
    try {
      // 複数行の場合は行ごとに処理
      const lines = content.split('\n');
      
      for (const line of lines) {
        if (line.trim()) {
          await this.executeCommand([
            'send-keys',
            '-t',
            paneId,
            line,
            'Enter'
          ]);
        } else {
          await this.executeCommand([
            'send-keys',
            '-t',
            paneId,
            'Enter'
          ]);
        }
      }

      this.emit('pane_content_appended', { paneId, content });
    } catch (error) {
      throw new RenkeiError(
        `Failed to append to pane: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'TMUX_ERROR',
        ErrorSeverity.ERROR,
        error,
        `Pane: ${paneId}`
      );
    }
  }

  async clearPane(paneId: string): Promise<void> {
    try {
      await this.executeCommand([
        'send-keys',
        '-t',
        paneId,
        'C-c'
      ]);

      await this.executeCommand([
        'send-keys',
        '-t',
        paneId,
        'clear',
        'Enter'
      ]);

      this.emit('pane_cleared', { paneId });
    } catch (error) {
      throw new RenkeiError(
        `Failed to clear pane: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'TMUX_ERROR',
        ErrorSeverity.ERROR,
        error,
        `Pane: ${paneId}`
      );
    }
  }

  /**
   * 入力処理
   */
  async setupInputHandler(paneId: string, handler: InputHandler): Promise<void> {
    this.inputHandlers.set(paneId, handler);
    this.emit('input_handler_setup', { paneId });
  }

  async sendKeys(paneId: string, keys: string): Promise<void> {
    try {
      await this.executeCommand([
        'send-keys',
        '-t',
        paneId,
        keys
      ]);

      this.emit('keys_sent', { paneId, keys });
    } catch (error) {
      throw new RenkeiError(
        `Failed to send keys: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'TMUX_ERROR',
        ErrorSeverity.ERROR,
        error,
        `Pane: ${paneId}, Keys: ${keys}`
      );
    }
  }

  async handleUserInput(input: string, paneId?: string): Promise<void> {
    const targetPaneId = paneId || this.getActivePaneId();
    
    if (!targetPaneId) {
      throw new RenkeiError(
        'No active pane found for input handling',
        'TMUX_ERROR',
        ErrorSeverity.ERROR
      );
    }

    const handler = this.inputHandlers.get(targetPaneId);
    if (handler) {
      await handler(input, targetPaneId);
    } else {
      // デフォルトの入力処理
      await this.sendKeys(targetPaneId, input);
    }

    this.emit('user_input_handled', { paneId: targetPaneId, input });
  }

  /**
   * ユーティリティメソッド
   */
  private async executeCommand(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('tmux', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      if (child.stdout) {
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });
      }

      if (child.stderr) {
        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`tmux command failed: ${stderr || 'Unknown error'}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  private async getMainPaneId(sessionName: string): Promise<string> {
    const result = await this.executeCommand([
      'list-panes',
      '-t',
      sessionName,
      '-F',
      '#{pane_id}'
    ]);

    const panes = result.trim().split('\n');
    const firstPane = panes[0];
    
    if (!firstPane) {
      throw new RenkeiError(
        'No panes found in session',
        'TMUX_ERROR',
        ErrorSeverity.ERROR,
        undefined,
        `Session: ${sessionName}`
      );
    }

    return firstPane;
  }

  private async setPaneTitle(paneId: string, title: string): Promise<void> {
    await this.executeCommand([
      'select-pane',
      '-t',
      paneId,
      '-T',
      title
    ]);
  }

  private updatePaneState(paneId: string, content: string): void {
    const currentState = this.paneStates.get(paneId) || {
      content: [],
      scrollPosition: 0,
      isActive: false,
      lastUpdate: new Date()
    };

    const updatedState: PaneState = {
      ...currentState,
      content: content.split('\n'),
      lastUpdate: new Date()
    };

    this.paneStates.set(paneId, updatedState);
  }

  private getActivePaneId(): string | null {
    for (const [paneId, state] of this.paneStates.entries()) {
      if (state.isActive) {
        return paneId;
      }
    }

    // フォールバック: 最初のセッションのメインペイン
    const firstSession = Array.from(this.sessions.values())[0];
    return firstSession?.mainPaneId || null;
  }

  private setupEventHandlers(): void {
    // プロセス終了時のクリーンアップ
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  private async cleanup(): Promise<void> {
    try {
      // 全セッションを削除
      for (const sessionId of this.sessions.keys()) {
        await this.destroySession(sessionId);
      }

      // コントロールプロセスを終了
      if (this.controlProcess) {
        this.controlProcess.kill();
      }
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  /**
   * 公開メソッド - 状態取得
   */
  getActiveSessions(): TmuxSession[] {
    return Array.from(this.sessions.values()).filter(
      session => session.status === 'active'
    );
  }

  getPaneState(paneId: string): PaneState | null {
    return this.paneStates.get(paneId) || null;
  }

  getAllPaneStates(): Map<string, PaneState> {
    return new Map(this.paneStates);
  }
}
