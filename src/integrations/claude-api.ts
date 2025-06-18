/**
 * Claude API 統合
 * 実際のClaude AIとの直接通信
 */

export interface ClaudeAPIConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeResponse {
  content: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  stop_reason: string;
}

/**
 * Claude API クライアント
 */
export class ClaudeAPI {
  private config: ClaudeAPIConfig;
  private conversationHistory: ClaudeMessage[] = [];

  constructor(config: Partial<ClaudeAPIConfig> = {}) {
    this.config = {
      apiKey: config.apiKey || process.env['CLAUDE_API_KEY'] || '',
      model: config.model || 'claude-sonnet-4-20250514',
      maxTokens: config.maxTokens || 4096,
      temperature: config.temperature || 0.7,
    };

    if (!this.config.apiKey) {
      console.warn(
        '⚠️  CLAUDE_API_KEY が設定されていません。環境変数またはconfigで設定してください。'
      );
    }
  }

  /**
   * Claude APIにメッセージを送信
   */
  async sendMessage(
    userMessage: string,
    systemPrompt?: string,
    includeHistory: boolean = true
  ): Promise<ClaudeResponse> {
    try {
      if (!this.config.apiKey) {
        throw new Error('Claude API key is not configured');
      }

      // メッセージ履歴の構築
      const messages: ClaudeMessage[] = [];

      if (includeHistory) {
        messages.push(...this.conversationHistory);
      }

      messages.push({
        role: 'user',
        content: userMessage,
      });

      // API リクエストの構築
      const requestBody: any = {
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        messages,
      };

      if (systemPrompt) {
        requestBody.system = systemPrompt;
      }

      // Claude APIへのリクエスト (global fetchを使用)
      const response = await (global as any).fetch(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.config.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Claude API error: ${response.status} - ${errorText}`);
      }

      const result = (await response.json()) as any;

      // レスポンスの処理
      const claudeResponse: ClaudeResponse = {
        content: result.content?.[0]?.text || '',
        usage: result.usage || { input_tokens: 0, output_tokens: 0 },
        stop_reason: result.stop_reason || 'unknown',
      };

      // 会話履歴の更新
      if (includeHistory) {
        this.conversationHistory.push(
          { role: 'user', content: userMessage },
          { role: 'assistant', content: claudeResponse.content }
        );

        // 履歴が長くなりすぎた場合の制限
        if (this.conversationHistory.length > 20) {
          this.conversationHistory = this.conversationHistory.slice(-20);
        }
      }

      return claudeResponse;
    } catch (error) {
      console.error('Claude API Error:', error);
      throw new Error(
        `Failed to communicate with Claude API: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * プロジェクトコンテキスト付きでタスク実行
   */
  async executeTaskWithContext(
    taskDescription: string,
    projectContext: ProjectContext
  ): Promise<ClaudeResponse> {
    const systemPrompt = this.buildSystemPrompt(projectContext);
    const taskPrompt = this.buildTaskPrompt(taskDescription, projectContext);

    return await this.sendMessage(taskPrompt, systemPrompt, true);
  }

  /**
   * システムプロンプトの構築
   */
  private buildSystemPrompt(context: ProjectContext): string {
    return `あなたは熟練したソフトウェア開発者のアシスタントです。

プロジェクト情報:
- 名前: ${context.projectName}
- 言語: ${context.language}
- フレームワーク: ${context.frameworks.join(', ')}
- 説明: ${context.description}

作業ディレクトリ: ${context.workingDirectory}

現在のファイル構造:
${context.fileStructure.map((file) => `- ${file}`).join('\n')}

あなたの役割:
1. ユーザーのタスクを理解し、具体的な実装計画を立てる
2. 必要に応じてファイルの作成・編集を提案する
3. 実行可能なコマンドを提供する
4. ベストプラクティスに従った提案をする

回答は以下の形式で行ってください:
- 理解したタスクの説明
- 実装計画（ステップごと）
- 具体的なコード例
- 実行すべきコマンド（あれば）
- 注意点や補足事項
`;
  }

  /**
   * タスクプロンプトの構築
   */
  private buildTaskPrompt(
    taskDescription: string,
    context: ProjectContext
  ): string {
    return `以下のタスクを実行してください:

${taskDescription}

現在の状況:
- 最後に変更されたファイル: ${context.lastModifiedFiles.join(', ') || 'なし'}
- 実行中のプロセス: ${context.runningProcesses.join(', ') || 'なし'}
- Gitステータス: ${context.gitStatus}

このタスクを実行するための詳細な手順と、必要なコード例を提供してください。`;
  }

  /**
   * 会話履歴のクリア
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * 会話履歴の取得
   */
  getHistory(): ClaudeMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * API設定の更新
   */
  updateConfig(newConfig: Partial<ClaudeAPIConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

/**
 * プロジェクトコンテキスト情報
 */
export interface ProjectContext {
  projectName: string;
  description: string;
  language: string;
  frameworks: string[];
  workingDirectory: string;
  fileStructure: string[];
  lastModifiedFiles: string[];
  runningProcesses: string[];
  gitStatus: string;
}

/**
 * プロジェクトコンテキストの収集
 */
export class ProjectContextCollector {
  async collectContext(
    workingDirectory: string = process.cwd()
  ): Promise<ProjectContext> {
    const fs = require('fs');
    const path = require('path');
    const { execSync } = require('child_process');

    try {
      // package.json の読み込み
      let projectName = 'Unknown';
      let description = '';
      const frameworks: string[] = [];

      const packageJsonPath = path.join(workingDirectory, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageData = JSON.parse(
          fs.readFileSync(packageJsonPath, 'utf8')
        );
        projectName = packageData.name || 'Unknown';
        description = packageData.description || '';

        // 依存関係からフレームワークを推測
        const deps = {
          ...packageData.dependencies,
          ...packageData.devDependencies,
        };
        if (deps.react) frameworks.push('React');
        if (deps.vue) frameworks.push('Vue');
        if (deps.angular) frameworks.push('Angular');
        if (deps.express) frameworks.push('Express');
        if (deps.typescript) frameworks.push('TypeScript');
        if (deps.jest) frameworks.push('Jest');
      }

      // 言語の検出
      let language = 'JavaScript';
      if (fs.existsSync(path.join(workingDirectory, 'tsconfig.json'))) {
        language = 'TypeScript';
      }

      // ファイル構造の収集
      const fileStructure = this.collectFileStructure(workingDirectory);

      // 最近変更されたファイル
      const lastModifiedFiles = this.getRecentlyModifiedFiles(workingDirectory);

      // 実行中プロセス（tmux関連）
      const runningProcesses = this.getRunningProcesses();

      // Git ステータス
      let gitStatus = 'Not a git repository';
      try {
        const status = execSync('git status --porcelain', {
          cwd: workingDirectory,
          encoding: 'utf8',
          stdio: 'pipe',
        });
        const branch = execSync('git branch --show-current', {
          cwd: workingDirectory,
          encoding: 'utf8',
          stdio: 'pipe',
        }).trim();

        if (status.trim() === '') {
          gitStatus = `Branch: ${branch} (clean)`;
        } else {
          const changes = status
            .split('\n')
            .filter((line: string) => line.trim()).length;
          gitStatus = `Branch: ${branch} (${changes} changes)`;
        }
      } catch (error) {
        // Git がない場合はそのまま
      }

      return {
        projectName,
        description,
        language,
        frameworks,
        workingDirectory,
        fileStructure,
        lastModifiedFiles,
        runningProcesses,
        gitStatus,
      };
    } catch (error) {
      console.error('Context collection error:', error);
      throw new Error(
        `Failed to collect project context: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private collectFileStructure(workingDirectory: string): string[] {
    const fs = require('fs');
    const path = require('path');
    const files: string[] = [];

    const walk = (dir: string, depth: number = 0) => {
      if (depth > 3) return; // 深度制限

      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          if (
            item.startsWith('.') ||
            item === 'node_modules' ||
            item === 'dist'
          )
            continue;

          const fullPath = path.join(dir, item);
          const relativePath = path.relative(workingDirectory, fullPath);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            files.push(`${relativePath}/`);
            walk(fullPath, depth + 1);
          } else {
            files.push(relativePath);
          }
        }
      } catch (error) {
        // アクセスできないディレクトリはスキップ
      }
    };

    walk(workingDirectory);
    return files.slice(0, 50); // ファイル数制限
  }

  private getRecentlyModifiedFiles(workingDirectory: string): string[] {
    const fs = require('fs');
    const path = require('path');
    const files: Array<{ path: string; mtime: Date }> = [];

    const walk = (dir: string) => {
      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          if (
            item.startsWith('.') ||
            item === 'node_modules' ||
            item === 'dist'
          )
            continue;

          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);

          if (stat.isFile()) {
            const relativePath = path.relative(workingDirectory, fullPath);
            files.push({ path: relativePath, mtime: stat.mtime });
          } else if (stat.isDirectory()) {
            walk(fullPath);
          }
        }
      } catch (error) {
        // エラーはスキップ
      }
    };

    walk(workingDirectory);

    // 最近の5ファイルを返す
    return files
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
      .slice(0, 5)
      .map((f) => f.path);
  }

  private getRunningProcesses(): string[] {
    try {
      const { execSync } = require('child_process');
      const sessions = execSync('tmux list-sessions -F "#{session_name}"', {
        encoding: 'utf8',
        stdio: 'pipe',
      });
      return sessions.trim().split('\n').filter(Boolean);
    } catch (error) {
      return [];
    }
  }
}

/**
 * デフォルトのClaudeAPI インスタンス
 */
export const claudeAPI = new ClaudeAPI();
export const projectContextCollector = new ProjectContextCollector();
