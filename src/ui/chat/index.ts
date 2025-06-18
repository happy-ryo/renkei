/**
 * Chat UI Module - エクスポート
 */

export { ChatInterface } from './chat-interface';
export { InputHandler } from './input-handler';
export { ChatRenderer } from './chat-renderer';

// デフォルトのチャット設定
export const defaultChatConfig = {
  maxHistorySize: 1000,
  autoSave: true,
  saveInterval: 60000, // 1分
  commands: [],
  welcomeMessage: `🤖 Welcome to Renkei Interactive Chat!
This is a direct interface to communicate with the AI Manager.
Your messages will be processed by the AI system to help with your tasks.`,
  exitMessage: '👋 Thank you for using Renkei Chat. Goodbye!'
};