# Renkei System - 許可システム設計

## 概要

RenkeiシステムにおけるClaudeCodeの許可システムは、セキュリティと利便性のバランスを取りながら、自動実行を可能にする重要なコンポーネントです。

## 許可システムの設計原則

### 1. セキュリティファースト
- **デフォルト拒否**: 明示的に許可されていない操作は自動拒否
- **最小権限の原則**: 必要最小限の権限のみ付与
- **サンドボックス実行**: 指定された作業ディレクトリ内での実行制限

### 2. 自動化重視
- **事前許可**: 初回セットアップで安全な操作を一括許可
- **パターンマッチング**: ワイルドカードによる柔軟な許可制御
- **段階的権限**: フェーズごとの適切な権限管理

### 3. 透明性確保
- **操作ログ**: すべての許可・拒否判定を記録
- **ユーザー通知**: 重要な権限変更の通知
- **監査機能**: 権限使用状況の追跡

## ClaudeCode許可メカニズム

### 1. settings.json による設定

ClaudeCode公式の許可システムを活用し、以下の階層で権限を制御します：

```typescript
interface PermissionSettings {
    permissions: {
        allow: string[];    // 許可ツール・コマンド
        deny: string[];     // 拒否ツール・コマンド
    };
}
```

### 2. 許可設定の優先順位

ClaudeCodeドキュメント準拠の優先順位：
1. **Command line arguments** (実行時指定)
2. **Local project settings** (`.claude/settings.local.json`)
3. **Shared project settings** (`.claude/settings.json`)
4. **User settings** (`~/.claude/settings.json`)

## 許可カテゴリ設計

### 1. ファイル操作権限

```json
{
  "permissions": {
    "allow": [
      "Write",           // ファイル作成・書き込み
      "Read",            // ファイル読み取り
      "Edit",            // ファイル編集
      "MultiEdit"        // 複数ファイル編集
    ]
  }
}
```

**安全性考慮事項:**
- ワークスペース内のファイルのみ操作可能
- 最大ファイルサイズ制限 (10MB)
- 許可拡張子のみ処理可能

### 2. コマンド実行権限

```json
{
  "permissions": {
    "allow": [
      "Bash(npm:*)",     // npm関連コマンド全般
      "Bash(git:*)",     // git操作全般
      "Bash(mkdir:*)",   // ディレクトリ作成
      "Bash(ls:*)",      // ファイル一覧
      "Bash(pwd)",       // 現在ディレクトリ
      "Bash(cat:*)",     // ファイル内容表示
      "Bash(echo:*)",    // 文字列出力
      "Bash(touch:*)"    // ファイル作成
    ],
    "deny": [
      "Bash(rm:*)",      // ファイル削除系
      "Bash(rmdir:*)",   // ディレクトリ削除
      "Bash(sudo:*)",    // 管理者権限
      "Bash(curl:*)",    // 外部通信
      "Bash(wget:*)",    // ダウンロード
      "WebFetch",        // Web取得
      "WebSearch"        // Web検索
    ]
  }
}
```

### 3. 開発ツール権限

```typescript
class DevelopmentToolsPermissions {
    getNodejsPermissions(): string[] {
        return [
            "Bash(npm install:*)",
            "Bash(npm run:*)",
            "Bash(npm test:*)",
            "Bash(npm build:*)",
            "Bash(npm start:*)",
            "Bash(npx:*)"
        ];
    }
    
    getPythonPermissions(): string[] {
        return [
            "Bash(pip install:*)",
            "Bash(python:*)",
            "Bash(python3:*)",
            "Bash(pytest:*)"
        ];
    }
    
    getGitPermissions(): string[] {
        return [
            "Bash(git add:*)",
            "Bash(git commit:*)",
            "Bash(git push:*)",
            "Bash(git pull:*)",
            "Bash(git status)",
            "Bash(git log:*)",
            "Bash(git diff:*)"
        ];
    }
}
```

## 動的許可管理

### 1. フェーズベース許可

```typescript
class PhaseBasedPermissionManager {
    private phases = {
        analysis: {
            allowedTools: ["Read", "Bash(ls:*)", "Bash(pwd)", "Bash(cat:*)"],
            description: "プロジェクト分析フェーズ - 読み取り専用"
        },
        
        setup: {
            allowedTools: ["Write", "Bash(mkdir:*)", "Bash(npm install:*)"],
            description: "プロジェクトセットアップ - 基本構造作成"
        },
        
        development: {
            allowedTools: [
                "Write", "Read", "Edit", "MultiEdit",
                "Bash(npm:*)", "Bash(git:*)", "Bash(mkdir:*)"
            ],
            description: "開発フェーズ - 全開発ツール利用可能"
        },
        
        testing: {
            allowedTools: [
                "Read", "Bash(npm test:*)", "Bash(npm run:*)",
                "Bash(pytest:*)", "Bash(git status)"
            ],
            description: "テストフェーズ - テスト実行のみ"
        }
    };
    
    getCurrentPhasePermissions(phase: string): string[] {
        return this.phases[phase]?.allowedTools || [];
    }
}
```

### 2. コンテキスト依存許可

```typescript
class ContextualPermissionManager {
    evaluatePermission(
        tool: string, 
        context: TaskContext
    ): PermissionDecision {
        
        // プロジェクトタイプに基づく許可判定
        if (context.projectType === 'web-app') {
            return this.evaluateWebAppPermissions(tool, context);
        } else if (context.projectType === 'python-script') {
            return this.evaluatePythonPermissions(tool, context);
        }
        
        // デフォルト安全許可
        return this.evaluateDefaultPermissions(tool);
    }
    
    private evaluateWebAppPermissions(
        tool: string, 
        context: TaskContext
    ): PermissionDecision {
        const webAppTools = [
            "Bash(npm:*)", "Bash(yarn:*)", 
            "Write", "Read", "Edit",
            "Bash(git:*)"
        ];
        
        if (webAppTools.some(allowed => this.matchesTool(tool, allowed))) {
            return { allow: true, reason: "Web開発に必要なツール" };
        }
        
        return { allow: false, reason: "Web開発に不要なツール" };
    }
}
```

## セキュリティ検証機能

### 1. 危険コマンド検出

```typescript
class SecurityValidator {
    private dangerousPatterns = [
        /rm\s+-rf/,           // 強制削除
        /sudo\s+/,            // 管理者権限
        /curl\s+.*\|\s*sh/,   // 外部スクリプト実行
        /wget\s+.*\|\s*sh/,   // 外部スクリプト実行
        />\s*\/dev\/null/,    // 出力隠蔽
        /&\s*$/,              // バックグラウンド実行
        /;\s*rm/,             // コマンド連鎖削除
        /`.*`/,               // コマンド置換
        /\$\(.*\)/            // コマンド置換
    ];
    
    validateCommand(command: string): SecurityCheckResult {
        for (const pattern of this.dangerousPatterns) {
            if (pattern.test(command)) {
                return {
                    safe: false,
                    reason: `危険なパターンを検出: ${pattern.source}`,
                    command: command
                };
            }
        }
        
        return { safe: true, reason: "安全なコマンド" };
    }
}
```

### 2. パス検証機能

```typescript
class PathValidator {
    private workspaceBase: string;
    private allowedDirectories: Set<string>;
    
    constructor(workspaceBase: string) {
        this.workspaceBase = path.resolve(workspaceBase);
        this.allowedDirectories = new Set([
            this.workspaceBase,
            path.join(this.workspaceBase, 'projects'),
            path.join(this.workspaceBase, 'temp')
        ]);
    }
    
    validatePath(filePath: string): PathValidationResult {
        const resolvedPath = path.resolve(filePath);
        
        // ワークスペース内チェック
        if (!resolvedPath.startsWith(this.workspaceBase)) {
            return {
                valid: false,
                reason: "ワークスペース外のパスアクセス",
                path: resolvedPath
            };
        }
        
        // 危険なパスパターンチェック
        const dangerousPaths = [
            '/etc/', '/usr/', '/var/', '/sys/', '/proc/',
            '~/.ssh/', '~/.aws/', '~/.config/'
        ];
        
        for (const dangerous of dangerousPaths) {
            if (resolvedPath.includes(dangerous)) {
                return {
                    valid: false,
                    reason: `危険なシステムパス: ${dangerous}`,
                    path: resolvedPath
                };
            }
        }
        
        return { valid: true, reason: "安全なパス" };
    }
}
```

## 許可システムの実装

### 1. 設定ファイル生成

```typescript
class PermissionConfigGenerator {
    generateBaseConfig(projectType: ProjectType): PermissionConfig {
        const baseConfig: PermissionConfig = {
            permissions: {
                allow: this.getBaseAllowedTools(),
                deny: this.getBaseDeniedTools()
            }
        };
        
        // プロジェクトタイプ別の拡張
        switch (projectType) {
            case 'web-app':
                baseConfig.permissions.allow.push(...this.getWebAppTools());
                break;
            case 'python-script':
                baseConfig.permissions.allow.push(...this.getPythonTools());
                break;
            case 'node-cli':
                baseConfig.permissions.allow.push(...this.getNodeCliTools());
                break;
        }
        
        return baseConfig;
    }
    
    private getBaseAllowedTools(): string[] {
        return [
            "Write", "Read", "Edit", "MultiEdit",
            "Bash(ls:*)", "Bash(pwd)", "Bash(cat:*)",
            "Bash(echo:*)", "Bash(mkdir:*)", "Bash(touch:*)"
        ];
    }
    
    private getBaseDeniedTools(): string[] {
        return [
            "Bash(rm:*)", "Bash(rmdir:*)", "Bash(sudo:*)",
            "Bash(curl:*)", "Bash(wget:*)", "WebFetch", "WebSearch",
            "Bash(chmod +x:*)", "Bash(chown:*)"
        ];
    }
}
```

### 2. 実行時許可チェック

```typescript
class RuntimePermissionChecker {
    private config: PermissionConfig;
    private validator: SecurityValidator;
    
    async checkPermission(
        tool: string, 
        params: any
    ): Promise<PermissionResult> {
        
        // 1. 基本許可チェック
        const basicCheck = this.checkBasicPermission(tool);
        if (!basicCheck.allowed) {
            return basicCheck;
        }
        
        // 2. セキュリティ検証
        if (tool.startsWith('Bash(')) {
            const command = this.extractCommand(tool, params);
            const securityCheck = await this.validator.validateCommand(command);
            
            if (!securityCheck.safe) {
                return {
                    allowed: false,
                    reason: `セキュリティチェック失敗: ${securityCheck.reason}`,
                    tool: tool
                };
            }
        }
        
        // 3. パス検証（ファイル操作系）
        if (this.isFileOperation(tool)) {
            const pathCheck = this.validateFilePaths(params);
            if (!pathCheck.valid) {
                return {
                    allowed: false,
                    reason: `パス検証失敗: ${pathCheck.reason}`,
                    tool: tool
                };
            }
        }
        
        return { allowed: true, reason: "許可されたツール" };
    }
    
    private checkBasicPermission(tool: string): PermissionResult {
        // 拒否リストチェック
        if (this.config.permissions.deny.some(denied => 
            this.matchesTool(tool, denied))) {
            return {
                allowed: false,
                reason: "明示的に拒否されたツール",
                tool: tool
            };
        }
        
        // 許可リストチェック
        if (this.config.permissions.allow.some(allowed => 
            this.matchesTool(tool, allowed))) {
            return {
                allowed: true,
                reason: "許可リストに含まれるツール",
                tool: tool
            };
        }
        
        // デフォルト拒否
        return {
            allowed: false,
            reason: "許可リストに含まれていないツール",
            tool: tool
        };
    }
}
```

## 監査・ログ機能

### 1. 許可判定ログ

```typescript
interface PermissionAuditLog {
    timestamp: Date;
    sessionId: string;
    tool: string;
    params: any;
    decision: 'allowed' | 'denied';
    reason: string;
    context: {
        phase: string;
        projectType: string;
        userRequest: string;
    };
}

class PermissionAuditor {
    private logs: PermissionAuditLog[] = [];
    
    logPermissionDecision(
        sessionId: string,
        tool: string,
        params: any,
        decision: PermissionResult,
        context: TaskContext
    ): void {
        const auditLog: PermissionAuditLog = {
            timestamp: new Date(),
            sessionId,
            tool,
            params,
            decision: decision.allowed ? 'allowed' : 'denied',
            reason: decision.reason,
            context: {
                phase: context.currentPhase,
                projectType: context.projectType,
                userRequest: context.originalRequest
            }
        };
        
        this.logs.push(auditLog);
        this.persistLog(auditLog);
    }
    
    generateAuditReport(sessionId: string): AuditReport {
        const sessionLogs = this.logs.filter(log => log.sessionId === sessionId);
        
        return {
            sessionId,
            totalRequests: sessionLogs.length,
            allowedRequests: sessionLogs.filter(log => log.decision === 'allowed').length,
            deniedRequests: sessionLogs.filter(log => log.decision === 'denied').length,
            topDeniedTools: this.getTopDeniedTools(sessionLogs),
            securityIncidents: this.getSecurityIncidents(sessionLogs)
        };
    }
}
```

### 2. セキュリティアラート

```typescript
class SecurityAlertManager {
    private alertThresholds = {
        deniedRequests: 10,      // 10回拒否でアラート
        suspiciousCommands: 3,   // 危険コマンド3回でアラート
        pathViolations: 5        // パス違反5回でアラート
    };
    
    checkSecurityThresholds(
        sessionId: string,
        auditLogs: PermissionAuditLog[]
    ): SecurityAlert[] {
        const alerts: SecurityAlert[] = [];
        
        // 拒否回数チェック
        const deniedCount = auditLogs.filter(log => 
            log.decision === 'denied').length;
        
        if (deniedCount >= this.alertThresholds.deniedRequests) {
            alerts.push({
                type: 'HIGH_DENIAL_RATE',
                message: `セッション ${sessionId} で ${deniedCount} 回の拒否`,
                severity: 'medium',
                sessionId
            });
        }
        
        // 危険コマンドチェック
        const suspiciousCommands = auditLogs.filter(log =>
            log.reason.includes('危険なパターン')).length;
        
        if (suspiciousCommands >= this.alertThresholds.suspiciousCommands) {
            alerts.push({
                type: 'SUSPICIOUS_COMMANDS',
                message: `危険なコマンドパターンを ${suspiciousCommands} 回検出`,
                severity: 'high',
                sessionId
            });
        }
        
        return alerts;
    }
}
```

## 設定管理インターフェース

### 1. 設定更新API

```typescript
class PermissionConfigManager {
    async updatePermissions(
        configUpdate: PermissionConfigUpdate
    ): Promise<void> {
        // 現在の設定を読み込み
        const currentConfig = await this.loadCurrentConfig();
        
        // 設定のマージ
        const newConfig = this.mergeConfigs(currentConfig, configUpdate);
        
        // 設定の検証
        const validationResult = await this.validateConfig(newConfig);
        if (!validationResult.valid) {
            throw new Error(`設定エラー: ${validationResult.errors.join(', ')}`);
        }
        
        // 設定の保存
        await this.saveConfig(newConfig);
        
        // 設定の再読み込み
        await this.reloadConfig();
    }
    
    async addAllowedTool(tool: string): Promise<void> {
        await this.updatePermissions({
            permissions: {
                allow: { $push: [tool] }
            }
        });
    }
    
    async removeAllowedTool(tool: string): Promise<void> {
        await this.updatePermissions({
            permissions: {
                allow: { $pull: [tool] }
            }
        });
    }
}
```

## トラブルシューティング

### 1. 一般的な許可エラー

| エラー | 原因 | 解決方法 |
|--------|------|----------|
| `Bash(rm:*) は拒否されました` | 削除コマンドが拒否リスト | 安全な削除方法を使用 |
| `WebFetch は許可されていません` | 外部通信が制限 | ローカルファイルを使用 |
| `パス検証失敗` | ワークスペース外アクセス | パスを確認・修正 |

### 2. 許可システムのデバッグ

```typescript
class PermissionDebugger {
    async diagnosePermissionIssue(
        tool: string,
        params: any
    ): Promise<DiagnosisResult> {
        const steps: DiagnosisStep[] = [];
        
        // ステップ1: 基本設定チェック
        const configCheck = await this.checkConfiguration();
        steps.push({
            step: "設定ファイル確認",
            status: configCheck.valid ? "OK" : "NG",
            details: configCheck.message
        });
        
        // ステップ2: ツールマッチングチェック
        const matchCheck = this.checkToolMatching(tool);
        steps.push({
            step: "ツールマッチング",
            status: matchCheck.matched ? "OK" : "NG",
            details: `${tool} -> ${matchCheck.matchedPattern || 'なし'}`
        });
        
        // ステップ3: セキュリティチェック
        if (tool.startsWith('Bash(')) {
            const securityCheck = await this.checkSecurity(tool, params);
            steps.push({
                step: "セキュリティ検証",
                status: securityCheck.safe ? "OK" : "NG",
                details: securityCheck.reason
            });
        }
        
        return {
            tool,
            params,
            steps,
            recommendation: this.generateRecommendation(steps)
        };
    }
}
```

## 次のステップ

1. **ユーザーエクスペリエンス設計** → `05-user-experience.md`
2. **実装計画策定** → `06-implementation-plan.md`
3. **プロトタイプ開発開始**
