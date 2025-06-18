/**
 * Input Handler - ユーザー入力の処理
 * readlineインターフェースを使用してターミナル入力を管理
 */

import { EventEmitter } from 'events';
import * as readline from 'readline';
import { IInputHandler } from '../../interfaces/chat-types';

export class InputHandler extends EventEmitter implements IInputHandler {
  private rl?: readline.Interface;
  private prompt: string = '> ';
  private isActive: boolean = false;
  private history: string[] = [];
  private historyIndex: number = -1;
  private currentInput: string = '';

  constructor() {
    super();
  }

  start(): void {
    if (this.isActive) {
      return;
    }

    this.isActive = true;
    
    // readline interfaceを作成
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
      prompt: this.prompt,
      historySize: 100
    });

    this.setupEventHandlers();
    this.rl.prompt();
  }

  stop(): void {
    if (!this.isActive || !this.rl) {
      return;
    }

    this.isActive = false;
    this.rl.close();
    this.rl = undefined as any;
  }

  setPrompt(prompt: string): void {
    this.prompt = prompt;
    if (this.rl) {
      this.rl.setPrompt(prompt);
    }
  }

  private setupEventHandlers(): void {
    if (!this.rl) return;

    // 行入力イベント
    this.rl.on('line', (input: string) => {
      const trimmed = input.trim();
      
      if (trimmed) {
        // 履歴に追加
        this.addToHistory(trimmed);
        
        // イベント発行
        this.emit('input', trimmed);
      }

      // 次の入力を待つ
      if (this.isActive && this.rl) {
        this.rl.prompt();
      }
    });

    // Ctrl+C (SIGINT) ハンドリング
    this.rl.on('SIGINT', () => {
      this.emit('interrupt');
      
      // 現在の入力をクリア
      if (this.rl) {
        this.rl.write('', { ctrl: true, name: 'u' });
        this.rl.prompt();
      }
    });

    // 終了イベント
    this.rl.on('close', () => {
      this.isActive = false;
    });

    // キー入力のカスタムハンドリング
    if (process.stdin.isTTY) {
      process.stdin.on('keypress', (_chunk: string, key: any) => {
        if (!this.rl || !this.isActive) return;

        // 上矢印キー - 履歴を遡る
        if (key && key.name === 'up') {
          this.navigateHistory(-1);
        }
        // 下矢印キー - 履歴を進む
        else if (key && key.name === 'down') {
          this.navigateHistory(1);
        }
        // Ctrl+L - 画面クリア
        else if (key && key.ctrl && key.name === 'l') {
          console.clear();
          this.rl.prompt(true);
        }
      });
    }
  }

  private addToHistory(input: string): void {
    // 重複を避ける
    const lastItem = this.history[this.history.length - 1];
    if (lastItem !== input) {
      this.history.push(input);
      
      // 履歴サイズ制限
      if (this.history.length > 100) {
        this.history.shift();
      }
    }
    
    // 履歴インデックスをリセット
    this.historyIndex = this.history.length;
    this.currentInput = '';
  }

  private navigateHistory(direction: number): void {
    if (!this.rl || this.history.length === 0) return;

    // 現在の入力を保存
    if (this.historyIndex === this.history.length) {
      this.currentInput = this.rl.line;
    }

    // インデックスを更新
    const newIndex = this.historyIndex + direction;
    
    if (newIndex < 0 || newIndex > this.history.length) {
      return;
    }

    this.historyIndex = newIndex;

    // 新しい内容を設定
    let newLine: string;
    if (this.historyIndex === this.history.length) {
      newLine = this.currentInput;
    } else {
      newLine = this.history[this.historyIndex] || '';  // undefinedの場合は空文字列
    }

    // 現在の行をクリアして新しい内容を設定
    this.rl.write(null, { ctrl: true, name: 'u' });
    this.rl.write(newLine);
  }
}

// TypeScript interface declaration
declare module 'readline' {
  interface Interface {
    readonly line: string;
  }
}