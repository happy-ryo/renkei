/**
 * Renkei System - Pane Controller
 * Individual pane management and control
 */

import { EventEmitter } from 'events';
import { TmuxManager, SplitDirection } from './tmux-manager';
import { PaneState, RenkeiError, ErrorSeverity } from '../interfaces/types';

export interface PaneLayout {
  main: PaneConfig;
  sub?: PaneConfig;
}

export interface PaneConfig {
  title: string;
  size: number;
  position: 'left' | 'right' | 'top' | 'bottom';
  scrollable: boolean;
  content: string[];
}

export interface PaneUpdate {
  paneId: string;
  type: 'content' | 'title' | 'size' | 'focus';
  data: any;
  timestamp: Date;
}

/**
 * PaneController - 個別ペインの制御とレイアウト管理
 */
export class PaneController extends EventEmitter {
  private paneLayouts: Map<string, PaneLayout> = new Map();
  private updateQueue: PaneUpdate[] = [];
  private isProcessingUpdates = false;

  constructor(private tmuxManager: TmuxManager) {
    super();
    this.setupTmuxEventHandlers();
  }

  /**
   * レイアウト制御
   */
  async createLayout(sessionId: string, layout: PaneLayout): Promise<void> {
    const session = await this.tmuxManager.getSessionStatus(sessionId);
    if (!session) {
      throw new RenkeiError(
        `Session not found: ${sessionId}`,
        'SESSION_ERROR',
        ErrorSeverity.ERROR
      );
    }

    try {
      // メインペインの設定
      await this.configurePaneByConfig(session.mainPaneId, layout.main);

      // サブペインが必要な場合は分割
      if (layout.sub) {
        const direction = this.determineSplitDirection(
          layout.main.position,
          layout.sub.position
        );
        const subPaneId = await this.tmuxManager.splitPane(
          sessionId,
          direction
        );
        await this.configurePaneByConfig(subPaneId, layout.sub);
      }

      this.paneLayouts.set(sessionId, layout);
      this.emit('layout_created', { sessionId, layout });
    } catch (error) {
      throw new RenkeiError(
        `Failed to create layout: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'TMUX_ERROR',
        ErrorSeverity.ERROR,
        error,
        `Session: ${sessionId}`
      );
    }
  }

  async updateLayout(
    sessionId: string,
    layout: Partial<PaneLayout>
  ): Promise<void> {
    const currentLayout = this.paneLayouts.get(sessionId);
    if (!currentLayout) {
      throw new RenkeiError(
        `No layout found for session: ${sessionId}`,
        'SESSION_ERROR',
        ErrorSeverity.ERROR
      );
    }

    const updatedLayout: PaneLayout = {
      main: { ...currentLayout.main, ...layout.main },
    };

    // subが存在する場合のみ設定
    if (layout.sub) {
      updatedLayout.sub = { ...currentLayout.sub, ...layout.sub };
    } else if (currentLayout.sub) {
      updatedLayout.sub = currentLayout.sub;
    }

    await this.createLayout(sessionId, updatedLayout);
    this.emit('layout_updated', { sessionId, layout: updatedLayout });
  }

  /**
   * 個別ペイン制御
   */
  async updatePaneContent(
    paneId: string,
    content: string[],
    append = false
  ): Promise<void> {
    const update: PaneUpdate = {
      paneId,
      type: 'content',
      data: { content, append },
      timestamp: new Date(),
    };

    this.queueUpdate(update);
  }

  async updatePaneTitle(paneId: string, title: string): Promise<void> {
    const update: PaneUpdate = {
      paneId,
      type: 'title',
      data: { title },
      timestamp: new Date(),
    };

    this.queueUpdate(update);
  }

  async resizePane(paneId: string, size: number): Promise<void> {
    const update: PaneUpdate = {
      paneId,
      type: 'size',
      data: { size },
      timestamp: new Date(),
    };

    this.queueUpdate(update);
  }

  async focusPane(paneId: string): Promise<void> {
    const update: PaneUpdate = {
      paneId,
      type: 'focus',
      data: {},
      timestamp: new Date(),
    };

    this.queueUpdate(update);
  }

  /**
   * コンテンツ管理
   */
  async appendLineToPane(paneId: string, line: string): Promise<void> {
    await this.updatePaneContent(paneId, [line], true);
  }

  async clearPaneContent(paneId: string): Promise<void> {
    await this.tmuxManager.clearPane(paneId);
    this.emit('pane_content_cleared', { paneId });
  }

  async scrollPane(
    paneId: string,
    direction: 'up' | 'down',
    lines = 1
  ): Promise<void> {
    try {
      const scrollKey = direction === 'up' ? 'Page_Up' : 'Page_Down';

      // tmux copy mode に入る
      await this.tmuxManager.sendKeys(paneId, 'C-b [');

      // スクロール実行
      for (let i = 0; i < lines; i++) {
        await this.tmuxManager.sendKeys(paneId, scrollKey);
      }

      // copy mode から抜ける
      await this.tmuxManager.sendKeys(paneId, 'q');

      this.emit('pane_scrolled', { paneId, direction, lines });
    } catch (error) {
      throw new RenkeiError(
        `Failed to scroll pane: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'TMUX_ERROR',
        ErrorSeverity.ERROR,
        error,
        `Pane: ${paneId}, Direction: ${direction}`
      );
    }
  }

  /**
   * 状態管理
   */
  async getPane<T = any>(
    paneId: string
  ): Promise<(PaneState & { custom?: T }) | null> {
    const state = this.tmuxManager.getPaneState(paneId);
    return state as (PaneState & { custom?: T }) | null;
  }

  async updatePaneCustomData<T = any>(
    paneId: string,
    customData: T
  ): Promise<void> {
    // ペインの状態にカスタムデータを追加
    const currentState = await this.getPane(paneId);
    if (currentState) {
      // カスタムデータの更新をイベントで通知
      this.emit('pane_custom_data_updated', { paneId, customData });
    }
  }

  getPaneLayout(sessionId: string): PaneLayout | null {
    return this.paneLayouts.get(sessionId) || null;
  }

  getAllPaneLayouts(): Map<string, PaneLayout> {
    return new Map(this.paneLayouts);
  }

  /**
   * 高度なペイン操作
   */
  async swapPanes(paneId1: string, paneId2: string): Promise<void> {
    try {
      await this.tmuxManager.sendKeys(
        paneId1,
        `C-b :swap-pane -s ${paneId1} -t ${paneId2}`
      );
      await this.tmuxManager.sendKeys(paneId1, 'Enter');

      this.emit('panes_swapped', { paneId1, paneId2 });
    } catch (error) {
      throw new RenkeiError(
        `Failed to swap panes: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'TMUX_ERROR',
        ErrorSeverity.ERROR,
        error,
        `Panes: ${paneId1}, ${paneId2}`
      );
    }
  }

  async breakPane(paneId: string, newWindowName?: string): Promise<string> {
    try {
      const windowName = newWindowName || `window-${Date.now()}`;
      await this.tmuxManager.sendKeys(
        paneId,
        `C-b :break-pane -n ${windowName}`
      );
      await this.tmuxManager.sendKeys(paneId, 'Enter');

      this.emit('pane_broken', { paneId, windowName });
      return windowName;
    } catch (error) {
      throw new RenkeiError(
        `Failed to break pane: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'TMUX_ERROR',
        ErrorSeverity.ERROR,
        error,
        `Pane: ${paneId}`
      );
    }
  }

  /**
   * バッチ更新処理
   */
  private queueUpdate(update: PaneUpdate): void {
    this.updateQueue.push(update);

    if (!this.isProcessingUpdates) {
      // 非同期でバッチ処理を開始
      setTimeout(() => this.processUpdateQueue(), 0);
    }
  }

  private async processUpdateQueue(): Promise<void> {
    if (this.isProcessingUpdates || this.updateQueue.length === 0) {
      return;
    }

    this.isProcessingUpdates = true;

    try {
      // 同じペインの更新をまとめる
      const groupedUpdates = this.groupUpdatesByPane();

      for (const [paneId, updates] of groupedUpdates.entries()) {
        await this.processPaneUpdates(paneId, updates);
      }

      this.updateQueue = [];
    } catch (error) {
      console.error('Failed to process update queue:', error);
    } finally {
      this.isProcessingUpdates = false;
    }
  }

  private groupUpdatesByPane(): Map<string, PaneUpdate[]> {
    const grouped = new Map<string, PaneUpdate[]>();

    for (const update of this.updateQueue) {
      const existing = grouped.get(update.paneId) || [];
      existing.push(update);
      grouped.set(update.paneId, existing);
    }

    return grouped;
  }

  private async processPaneUpdates(
    paneId: string,
    updates: PaneUpdate[]
  ): Promise<void> {
    // 更新タイプごとに最新のものを適用
    const latestUpdates = new Map<string, PaneUpdate>();

    for (const update of updates) {
      latestUpdates.set(update.type, update);
    }

    // 順序を保って更新を適用
    const orderedTypes = ['size', 'title', 'content', 'focus'];

    for (const type of orderedTypes) {
      const update = latestUpdates.get(type);
      if (update) {
        await this.applyPaneUpdate(paneId, update);
      }
    }
  }

  private async applyPaneUpdate(
    paneId: string,
    update: PaneUpdate
  ): Promise<void> {
    try {
      switch (update.type) {
        case 'content':
          if (update.data.append) {
            await this.tmuxManager.appendToPaneContent(
              paneId,
              update.data.content.join('\n')
            );
          } else {
            await this.tmuxManager.updatePaneContent(
              paneId,
              update.data.content.join('\n')
            );
          }
          break;

        case 'title':
          // タイトル更新のためのプライベートメソッドが必要
          await this.tmuxManager.sendKeys(
            paneId,
            `C-b :select-pane -T '${update.data.title}'`
          );
          await this.tmuxManager.sendKeys(paneId, 'Enter');
          break;

        case 'size':
          await this.tmuxManager.resizePane(paneId, update.data.size);
          break;

        case 'focus':
          await this.tmuxManager.focusPane(paneId);
          break;
      }

      this.emit('pane_update_applied', { paneId, update });
    } catch (error) {
      this.emit('pane_update_failed', { paneId, update, error });
    }
  }

  /**
   * ヘルパーメソッド
   */
  private async configurePaneByConfig(
    paneId: string,
    config: PaneConfig
  ): Promise<void> {
    // タイトル設定
    await this.updatePaneTitle(paneId, config.title);

    // サイズ設定
    await this.resizePane(paneId, config.size);

    // 初期コンテンツ設定
    if (config.content.length > 0) {
      await this.updatePaneContent(paneId, config.content);
    }
  }

  private determineSplitDirection(
    mainPos: string,
    subPos: string
  ): SplitDirection {
    if (
      (mainPos === 'left' && subPos === 'right') ||
      (mainPos === 'right' && subPos === 'left')
    ) {
      return 'horizontal';
    } else if (
      (mainPos === 'top' && subPos === 'bottom') ||
      (mainPos === 'bottom' && subPos === 'top')
    ) {
      return 'vertical';
    } else {
      // デフォルトは垂直分割
      return 'vertical';
    }
  }

  private setupTmuxEventHandlers(): void {
    // TmuxManagerからのイベントを中継
    this.tmuxManager.on('pane_split', (data: any) => {
      this.emit('pane_split', data);
    });

    this.tmuxManager.on('pane_updated', (data: any) => {
      this.emit('pane_updated', data);
    });

    this.tmuxManager.on('pane_focused', (data: any) => {
      this.emit('pane_focused', data);
    });

    this.tmuxManager.on('pane_resized', (data: any) => {
      this.emit('pane_resized', data);
    });
  }

  /**
   * クリーンアップ
   */
  async cleanup(): Promise<void> {
    this.updateQueue = [];
    this.paneLayouts.clear();
    this.removeAllListeners();
  }
}
