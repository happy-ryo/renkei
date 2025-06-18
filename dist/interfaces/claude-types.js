"use strict";
/**
 * ClaudeCode SDK 型定義
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeCodeError = exports.ClaudeErrorCode = void 0;
// ClaudeCode エラー型
var ClaudeErrorCode;
(function (ClaudeErrorCode) {
    ClaudeErrorCode["API_ERROR"] = "API_ERROR";
    ClaudeErrorCode["TIMEOUT"] = "TIMEOUT";
    ClaudeErrorCode["PERMISSION_DENIED"] = "PERMISSION_DENIED";
    ClaudeErrorCode["INVALID_REQUEST"] = "INVALID_REQUEST";
    ClaudeErrorCode["SESSION_NOT_FOUND"] = "SESSION_NOT_FOUND";
    ClaudeErrorCode["RATE_LIMIT_EXCEEDED"] = "RATE_LIMIT_EXCEEDED";
    ClaudeErrorCode["INSUFFICIENT_CREDITS"] = "INSUFFICIENT_CREDITS";
    ClaudeErrorCode["NETWORK_ERROR"] = "NETWORK_ERROR";
    ClaudeErrorCode["INTERNAL_ERROR"] = "INTERNAL_ERROR";
})(ClaudeErrorCode || (exports.ClaudeErrorCode = ClaudeErrorCode = {}));
class ClaudeCodeError extends Error {
    constructor(code, message, details, recoverable = false) {
        super(message);
        this.code = code;
        this.details = details;
        this.recoverable = recoverable;
        this.name = 'ClaudeCodeError';
    }
}
exports.ClaudeCodeError = ClaudeCodeError;
//# sourceMappingURL=claude-types.js.map