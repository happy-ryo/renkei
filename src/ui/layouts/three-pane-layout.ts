/**
 * Three-pane tmux layout manager
 * Handles the creation and management of a 3-pane tmux layout for the interactive chat feature
 */

import { execSync } from 'child_process';

export interface ThreePaneLayoutConfig {
  sessionName: string;
  mainPaneTitle: string;
  chatPaneTitle: string;
  statusPaneTitle: string;
  mainPaneHeightPercent?: number;  // デフォルト: 50
  chatPaneWidthPercent?: number;   // デフォルト: 50
}

export interface ThreePaneLayoutResult {
  sessionName: string;
  mainPaneId: string;
  chatPaneId: string;
  statusPaneId: string;
}

export class ThreePaneLayout {
  private config: Required<ThreePaneLayoutConfig>;

  constructor(config: ThreePaneLayoutConfig) {
    this.config = {
      mainPaneHeightPercent: 50,
      chatPaneWidthPercent: 50,
      ...config
    };
  }

  /**
   * 3ペインレイアウトを作成
   * 
   * Layout structure:
   * ┌─────────────────────────┐
   * │     Main (AI Manager)   │ 50%
   * ├────────────┬────────────┤
   * │  Chat      │  Status    │ 25% each
   * └────────────┴────────────┘
   */
  public createLayout(): ThreePaneLayoutResult {
    const { sessionName } = this.config;

    try {
      // 1. まず下部用のペインを作成（メインペインを上下に分割）
      const bottomPaneId = this.createBottomPane();
      
      // 2. 下部ペインを左右に分割してチャットとステータスペインを作成
      const { chatPaneId, statusPaneId } = this.splitBottomPane(bottomPaneId);
      
      // 3. 各ペインのタイトルを設定
      this.setPaneTitles(chatPaneId, statusPaneId);
      
      // 4. メインペインIDを取得
      const mainPaneId = this.getMainPaneId();
      
      // 5. メインペインにフォーカスを戻す
      execSync(`tmux select-pane -t ${sessionName}:0.0`, { stdio: 'pipe' });
      
      return {
        sessionName,
        mainPaneId,
        chatPaneId,
        statusPaneId
      };
    } catch (error) {
      throw new Error(`Failed to create three-pane layout: ${error}`);
    }
  }

  /**
   * 既存の2ペインレイアウトを3ペインに変換
   */
  public convertFromTwoPane(existingStatusPaneId: string): ThreePaneLayoutResult {
    const { sessionName } = this.config;

    try {
      // 1. 既存のステータスペインを左右に分割
      const chatPaneId = execSync(
        `tmux split-window -t ${existingStatusPaneId} -h -b -p ${this.config.chatPaneWidthPercent} -P -F "#{pane_id}"`,
        { encoding: 'utf8' }
      ).trim();
      
      // 2. ペインタイトルを設定
      execSync(`tmux select-pane -t ${chatPaneId} -T "${this.config.chatPaneTitle}"`, { stdio: 'pipe' });
      
      // 3. メインペインIDを取得
      const mainPaneId = this.getMainPaneId();
      
      // 4. メインペインにフォーカスを戻す
      execSync(`tmux select-pane -t ${sessionName}:0.0`, { stdio: 'pipe' });
      
      return {
        sessionName,
        mainPaneId,
        chatPaneId,
        statusPaneId: existingStatusPaneId
      };
    } catch (error) {
      throw new Error(`Failed to convert to three-pane layout: ${error}`);
    }
  }

  private createBottomPane(): string {
    const { sessionName } = this.config;
    
    // メインペインを垂直に分割（下部用のペインを作成）
    // tmux 3.4では-lオプションを使用して行数で指定
    const bottomPaneId = execSync(
      `tmux split-window -t ${sessionName}:0 -v -l 20 -P -F "#{pane_id}"`,
      { encoding: 'utf8' }
    ).trim();
    
    return bottomPaneId;
  }

  private splitBottomPane(bottomPaneId: string): { chatPaneId: string; statusPaneId: string } {
    // 下部ペインを水平に分割（左: チャット、右: ステータス）
    // -lオプションで列数を指定（60列）
    const statusPaneId = execSync(
      `tmux split-window -t ${bottomPaneId} -h -l 60 -P -F "#{pane_id}"`,
      { encoding: 'utf8' }
    ).trim();
    
    // bottomPaneIdがチャットペインになる
    return {
      chatPaneId: bottomPaneId,
      statusPaneId
    };
  }

  private setPaneTitles(chatPaneId: string, statusPaneId: string): void {
    const { sessionName, mainPaneTitle, chatPaneTitle, statusPaneTitle } = this.config;
    
    // メインペインのタイトル
    execSync(`tmux select-pane -t ${sessionName}:0.0 -T "${mainPaneTitle}"`, { stdio: 'pipe' });
    
    // チャットペインのタイトル
    execSync(`tmux select-pane -t ${chatPaneId} -T "${chatPaneTitle}"`, { stdio: 'pipe' });
    
    // ステータスペインのタイトル  
    execSync(`tmux select-pane -t ${statusPaneId} -T "${statusPaneTitle}"`, { stdio: 'pipe' });
  }

  private getMainPaneId(): string {
    const { sessionName } = this.config;
    
    // 最初のペインIDを取得（メインペイン）
    return execSync(
      `tmux list-panes -t ${sessionName} -F "#{pane_id}" | head -n 1`,
      { encoding: 'utf8' }
    ).trim();
  }

  /**
   * レイアウトのサイズを調整
   */
  public adjustLayout(mainHeightPercent?: number, chatWidthPercent?: number): void {
    const { sessionName } = this.config;
    
    if (mainHeightPercent !== undefined) {
      this.config.mainPaneHeightPercent = mainHeightPercent;
    }
    
    if (chatWidthPercent !== undefined) {
      this.config.chatPaneWidthPercent = chatWidthPercent;
    }
    
    // tmuxのlayout-evenコマンドで再配置
    execSync(`tmux select-layout -t ${sessionName} main-horizontal`, { stdio: 'pipe' });
  }
}