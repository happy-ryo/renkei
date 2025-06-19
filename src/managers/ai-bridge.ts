/**
 * AI Bridge - Chat ManagerとAI Managerの間の通信ブリッジ
 */

import { EventEmitter } from 'events';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import { TaskRequest, TaskResult } from '../interfaces/types';
import { ChatManager } from './chat-manager';
import { v4 as uuidv4 } from 'uuid';

interface BridgeMessage {
  id: string;
  type: 'task_request' | 'task_result' | 'task_error' | 'heartbeat';
  payload: any;
  timestamp: Date;
}

export class AIBridge extends EventEmitter {
  private chatManager: ChatManager;
  private client?: net.Socket | undefined;
  private isConnected: boolean = false;
  private messageQueue: BridgeMessage[] = [];
  private reconnectTimer?: NodeJS.Timeout | undefined;
  private heartbeatTimer?: NodeJS.Timeout | undefined;

  constructor(chatManager: ChatManager) {
    super();
    this.chatManager = chatManager;

    // Unixソケットのパスを設定
    const socketDir = path.join(process.cwd(), 'data', 'sockets');
    if (!fs.existsSync(socketDir)) {
      fs.mkdirSync(socketDir, { recursive: true });
    }
    // AIBridgeはサーバーではなくクライアントとして動作
    // this.socketPath = path.join(socketDir, 'ai-bridge.sock');

    this.setupEventHandlers();
  }

  /**
   * ブリッジを開始
   */
  async start(): Promise<void> {
    // AIBridgeはクライアントとして動作するので、サーバーは不要
    console.log('AI Bridge started as client mode');

    // AI Managerへの接続を試みる
    await this.connectToAIManager();
  }

  /**
   * ブリッジを停止
   */
  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.client) {
      this.client.end();
    }
  }

  /**
   * AI Managerに接続
   */
  async connectToAIManager(): Promise<void> {
    // AI Managerのソケットパスを探す
    const aiManagerSocketPath = path.join(
      process.cwd(),
      'data',
      'sockets',
      'ai-manager.sock'
    );

    if (!fs.existsSync(aiManagerSocketPath)) {
      // ソケットが存在しない場合は、後で再試行
      this.scheduleReconnect();
      return;
    }

    this.client = net.createConnection(aiManagerSocketPath, () => {
      this.isConnected = true;
      this.chatManager.setAIManagerConnected(true);
      console.log('Connected to AI Manager');

      // キューに溜まっているメッセージを送信
      this.flushMessageQueue();

      // ハートビート開始
      this.startHeartbeat();
    });

    this.client.on('data', (data) => {
      this.handleAIManagerMessage(data);
    });

    this.client.on('error', (error) => {
      console.error('AI Manager connection error:', error);
      this.handleDisconnection();
    });

    this.client.on('end', () => {
      console.log('Disconnected from AI Manager');
      this.handleDisconnection();
    });
  }

  /**
   * イベントハンドラーの設定
   */
  private setupEventHandlers(): void {
    // ChatManagerからのタスク送信イベント
    this.chatManager.on('task_submit', (taskRequest: TaskRequest) => {
      this.sendTaskToAIManager(taskRequest);
    });
  }

  /**
   * AI Managerからのメッセージを処理
   */
  private handleAIManagerMessage(data: Buffer): void {
    try {
      const messages = data
        .toString()
        .split('\n')
        .filter((msg) => msg.trim());

      for (const msgStr of messages) {
        const message: BridgeMessage = JSON.parse(msgStr);

        switch (message.type) {
          case 'task_result':
            this.handleTaskResult(message.payload);
            break;

          case 'task_error':
            this.handleTaskError(message.payload);
            break;

          case 'heartbeat':
            // ハートビート応答
            break;

          default:
            console.warn('Unknown AI Manager message type:', message.type);
        }
      }
    } catch (error) {
      console.error('Failed to parse AI Manager message:', error);
    }
  }

  /**
   * タスクをAI Managerに送信
   */
  private sendTaskToAIManager(taskRequest: TaskRequest): void {
    const message: BridgeMessage = {
      id: uuidv4(),
      type: 'task_request',
      payload: taskRequest,
      timestamp: new Date(),
    };

    if (this.isConnected && this.client) {
      this.client.write(JSON.stringify(message) + '\n');
    } else {
      // 接続されていない場合はキューに追加
      this.messageQueue.push(message);

      // 接続を試みる
      if (!this.reconnectTimer) {
        this.connectToAIManager();
      }
    }
  }

  /**
   * タスク結果を処理
   */
  private handleTaskResult(result: TaskResult): void {
    this.chatManager.handleAIManagerResult(result.id, result);
  }

  /**
   * タスクエラーを処理
   */
  private handleTaskError(error: { taskId: string; error: string }): void {
    this.chatManager.handleAIManagerError(error.taskId, new Error(error.error));
  }

  /**
   * 切断を処理
   */
  private handleDisconnection(): void {
    this.isConnected = false;
    this.chatManager.setAIManagerConnected(false);

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined as any;
    }

    this.client = undefined as any;
    this.scheduleReconnect();
  }

  /**
   * 再接続をスケジュール
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined as any;
      this.connectToAIManager();
    }, 5000); // 5秒後に再接続
  }

  /**
   * メッセージキューをフラッシュ
   */
  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected && this.client) {
      const message = this.messageQueue.shift()!;
      this.client.write(JSON.stringify(message) + '\n');
    }
  }

  /**
   * ハートビートを開始
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected && this.client) {
        const heartbeat: BridgeMessage = {
          id: uuidv4(),
          type: 'heartbeat',
          payload: {},
          timestamp: new Date(),
        };
        this.client.write(JSON.stringify(heartbeat) + '\n');
      }
    }, 30000); // 30秒ごと
  }
}

/**
 * シンプルなブリッジの作成（既存のAI Managerとの互換性のため）
 */
export async function createSimpleAIBridge(
  chatManager: ChatManager
): Promise<void> {
  // AI Managerとの通信用のファイルベースのブリッジ
  const bridgeDir = path.join(process.cwd(), 'data', 'bridge');
  if (!fs.existsSync(bridgeDir)) {
    fs.mkdirSync(bridgeDir, { recursive: true });
  }

  const requestFile = path.join(bridgeDir, 'chat-requests.json');
  // const responseFile = path.join(bridgeDir, 'chat-responses.json');

  // ChatManagerからのタスク送信を監視
  chatManager.on('task_submit', async (taskRequest: TaskRequest) => {
    try {
      // リクエストをファイルに書き込む
      const requests = fs.existsSync(requestFile)
        ? JSON.parse(fs.readFileSync(requestFile, 'utf8'))
        : [];

      requests.push({
        ...taskRequest,
        timestamp: new Date().toISOString(),
      });

      fs.writeFileSync(requestFile, JSON.stringify(requests, null, 2));

      // 仮の応答を生成（実際のAI Manager統合までの暫定措置）
      setTimeout(() => {
        const result: TaskResult = {
          id: taskRequest.id,
          status: 'success',
          sessionId: taskRequest.context?.sessionId || 'unknown',
          output: `こんにちは！ご要望の通り、シンプルにお答えします。\n\nこんにちは！`,
          files: [],
          errors: [],
          metrics: {
            executionTime: 1000,
            apiCalls: 1,
            tokensUsed: 50,
          },
          timestamp: new Date(),
        };

        chatManager.handleAIManagerResult(taskRequest.id, result);
      }, 1000);
    } catch (error) {
      chatManager.handleAIManagerError(taskRequest.id, error as Error);
    }
  });
}
