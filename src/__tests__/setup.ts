/**
 * Jest テストセットアップファイル
 */

// テスト環境の初期化
beforeEach(() => {
  // 各テスト前にモックをクリア
  jest.clearAllMocks();
});

afterEach(() => {
  // 各テスト後のクリーンアップ
  jest.restoreAllMocks();
});

// グローバルテストタイムアウト
jest.setTimeout(10000);

// 環境変数設定
process.env['NODE_ENV'] = 'test';
process.env['RENKEI_TEST_MODE'] = 'true';

// コンソール出力の制御（テスト中は不要なログを抑制）
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});
