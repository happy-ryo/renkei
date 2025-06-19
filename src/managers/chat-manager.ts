/**
 * Chat Manager - チャットセッションとAI Managerの統合管理
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import {
  ChatMessage,
  ChatSessionState,
  ChatContext,
  ChatMetrics,
} from '../interfaces/chat-types';
import { TaskRequest, TaskResult } from '../interfaces/types';
import { v4 as uuidv4 } from 'uuid';

export class ChatManager extends EventEmitter {
  // private sessionId: string;
  private sessions: Map<string, ChatSessionState> = new Map();
  private messageHistory: Map<string, ChatMessage[]> = new Map();
  private metrics: ChatMetrics;
  private aiManagerConnected: boolean = false;
  private pendingRequests: Map<
    string,
    {
      messageId: string;
      resolve: (result: TaskResult) => void;
      reject: (error: Error) => void;
    }
  > = new Map();

  constructor() {
    super();
    // this.sessionId = uuidv4();
    this.metrics = {
      totalMessages: 0,
      averageResponseTime: 0,
      totalTokensUsed: 0,
      errorRate: 0,
      sessionDuration: 0,
      commandsExecuted: {} as any,
    };
  }

  /**
   * 新しいチャットセッションを作成
   */
  createSession(context?: Partial<ChatContext>): ChatSessionState {
    const sessionId = uuidv4();
    const session: ChatSessionState = {
      sessionId,
      startTime: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
      isActive: true,
      isPaused: false,
      currentContext: {
        workingDirectory: process.cwd(),
        recentFiles: [],
        activeCommands: [],
        ...context,
      },
    };

    this.sessions.set(sessionId, session);
    this.messageHistory.set(sessionId, []);

    this.emit('session_created', session);
    return session;
  }

  /**
   * メッセージをAI Managerに送信
   */
  async sendToAIManager(
    sessionId: string,
    message: ChatMessage
  ): Promise<TaskResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // タスクリクエストを作成
    const taskRequest: TaskRequest = {
      id: uuidv4(),
      userPrompt: message.content,
      description: `Chat message from session ${sessionId}`,
      workingDirectory:
        session.currentContext?.workingDirectory || process.cwd(),
      priority: 'medium',
      timestamp: new Date(),
      context: {
        workingDirectory:
          session.currentContext?.workingDirectory || process.cwd(),
        previousTasks: [],
        sessionId: session.sessionId,
        files: session.currentContext?.recentFiles || [],
      },
    };

    // メトリクス更新
    const startTime = Date.now();
    this.metrics.totalMessages++;

    try {
      // AI Managerにタスクを送信
      const result = await this.submitTaskToAIManager(taskRequest);

      // 応答時間を記録
      const responseTime = Date.now() - startTime;
      this.updateAverageResponseTime(responseTime);

      // トークン使用量を記録
      if (result.metrics.tokensUsed) {
        this.metrics.totalTokensUsed += result.metrics.tokensUsed;
      }

      return result;
    } catch (error) {
      // エラー率を更新
      this.metrics.errorRate =
        (this.metrics.errorRate * (this.metrics.totalMessages - 1) + 1) /
        this.metrics.totalMessages;
      throw error;
    }
  }

  /**
   * AI Managerにタスクを送信（実際の通信はAIBridgeで実装）
   */
  private async submitTaskToAIManager(
    taskRequest: TaskRequest
  ): Promise<TaskResult> {
    return new Promise((resolve, reject) => {
      const requestId = taskRequest.id;

      // ペンディングリクエストとして保存
      this.pendingRequests.set(requestId, {
        messageId: taskRequest.id,
        resolve,
        reject,
      });

      // AIBridgeイベントを発行
      this.emit('task_submit', taskRequest);

      // タイムアウト設定
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Task submission timeout'));
        }
      }, 30000); // 30秒のタイムアウト
    });
  }

  /**
   * AI Managerからの結果を処理
   */
  handleAIManagerResult(taskId: string, result: TaskResult): void {
    const pending = this.pendingRequests.get(taskId);
    if (pending) {
      this.pendingRequests.delete(taskId);
      pending.resolve(result);
    }
  }

  /**
   * AI Managerからのエラーを処理
   */
  handleAIManagerError(taskId: string, error: Error): void {
    const pending = this.pendingRequests.get(taskId);
    if (pending) {
      this.pendingRequests.delete(taskId);
      pending.reject(error);
    }
  }

  /**
   * セッションの履歴を取得
   */
  getSessionHistory(sessionId: string): ChatMessage[] {
    return this.messageHistory.get(sessionId) || [];
  }

  /**
   * セッションに メッセージを追加
   */
  addMessageToSession(sessionId: string, message: ChatMessage): void {
    const history = this.messageHistory.get(sessionId) || [];
    history.push(message);
    this.messageHistory.set(sessionId, history);

    const session = this.sessions.get(sessionId);
    if (session) {
      session.messageCount++;
      session.lastActivity = new Date();
    }
  }

  /**
   * セッションのコンテキストを更新
   */
  updateSessionContext(sessionId: string, context: Partial<ChatContext>): void {
    const session = this.sessions.get(sessionId);
    if (session && session.currentContext) {
      session.currentContext = {
        ...session.currentContext,
        ...context,
      };
      this.emit('context_updated', {
        sessionId,
        context: session.currentContext,
      });
    }
  }

  /**
   * セッションを終了
   */
  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isActive = false;

      // セッション期間を計算
      const duration = Date.now() - session.startTime.getTime();
      this.metrics.sessionDuration += duration;

      // 履歴を保存
      this.saveSessionHistory(sessionId);

      this.emit('session_ended', session);
    }
  }

  /**
   * セッション履歴をファイルに保存
   */
  private saveSessionHistory(sessionId: string): void {
    const history = this.messageHistory.get(sessionId);
    const session = this.sessions.get(sessionId);

    if (!history || !session) return;

    const historyDir = path.join(process.cwd(), 'data', 'chat-history');
    if (!fs.existsSync(historyDir)) {
      fs.mkdirSync(historyDir, { recursive: true });
    }

    const filename = `chat-${sessionId}-${Date.now()}.json`;
    const filepath = path.join(historyDir, filename);

    const data = {
      session,
      messages: history,
      metrics: this.getMetrics(),
    };

    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  }

  /**
   * メトリクスを取得
   */
  getMetrics(): ChatMetrics {
    return { ...this.metrics };
  }

  /**
   * 平均応答時間を更新
   */
  private updateAverageResponseTime(newTime: number): void {
    const total =
      this.metrics.averageResponseTime * (this.metrics.totalMessages - 1) +
      newTime;
    this.metrics.averageResponseTime = total / this.metrics.totalMessages;
  }

  /**
   * AI Manager接続状態を設定
   */
  setAIManagerConnected(connected: boolean): void {
    this.aiManagerConnected = connected;
    this.emit('ai_manager_connection', connected);
  }

  /**
   * AI Manager接続状態を取得
   */
  isAIManagerConnected(): boolean {
    return this.aiManagerConnected;
  }
}
