"use strict";
/**
 * Renkei System - 基本型定義
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RenkeiError = exports.ErrorCode = void 0;
// エラー処理の型
var ErrorCode;
(function (ErrorCode) {
    ErrorCode["CLAUDE_API_ERROR"] = "CLAUDE_API_ERROR";
    ErrorCode["CLAUDE_TIMEOUT"] = "CLAUDE_TIMEOUT";
    ErrorCode["TMUX_ERROR"] = "TMUX_ERROR";
    ErrorCode["SESSION_ERROR"] = "SESSION_ERROR";
    ErrorCode["PERMISSION_DENIED"] = "PERMISSION_DENIED";
    ErrorCode["CONFIG_ERROR"] = "CONFIG_ERROR";
    ErrorCode["FILE_ERROR"] = "FILE_ERROR";
    ErrorCode["VALIDATION_ERROR"] = "VALIDATION_ERROR";
})(ErrorCode || (exports.ErrorCode = ErrorCode = {}));
class RenkeiError extends Error {
    constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'RenkeiError';
    }
}
exports.RenkeiError = RenkeiError;
//# sourceMappingURL=types.js.map