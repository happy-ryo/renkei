/**
 * TmuxManager テストスイート
 */

import { TmuxManager } from '../tmux-manager';
import { TmuxConfig } from '../../interfaces/types';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// child_processのモック
jest.mock('child_process');
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

describe('TmuxManager', () => {
  let tmuxManager: TmuxManager;
  let mockConfig: TmuxConfig;
  let mockChildProcess: Partial<ChildProcess>;

  beforeEach(() => {
    mockConfig = {
      sessionName: 'test-session',
      mainPaneTitle: 'Main',
      subPaneTitle: 'Sub',
      splitDirection: 'vertical',
      mainPaneSize: 80
    };

    mockChildProcess = {
      stdout: null,
      stderr: null,
      on: jest.fn(),
      kill: jest.fn()
    };

    mockSpawn.mockReturnValue(mockChildProcess as any);
    tmuxManager = new TmuxManager(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct config', () => {
      expect(tmuxManager).toBeInstanceOf(TmuxManager);
      expect(tmuxManager).toBeInstanceOf(EventEmitter);
    });
  });

  describe('createSession', () => {
    it('should create a new tmux session successfully', async () => {
      // モックの設定
      const mockPaneId = '%0';
      
      mockSpawn.mockImplementation(() => {
        const mockChild = new EventEmitter() as any;
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        
        // 非同期でclose イベントをエミット
        setTimeout(() => {
          if (mockChild.stdout) {
            mockChild.stdout.emit('data', mockPaneId + '\n');
          }
          mockChild.emit('close', 0);
        }, 10);
        
        return mockChild;
      });

      const sessionId = await tmuxManager.createSession();
      
      expect(mockSpawn).toHaveBeenCalledWith('tmux', [
        'new-session',
        '-d',
        '-s',
        'test-session',
        '-x',
        '120',
        '-y',
        '40'
      ], { stdio: ['pipe', 'pipe', 'pipe'] });
      
      expect(sessionId).toMatch(/^renkei-\d+$/);
    });

    it('should handle session creation errors', async () => {
      mockSpawn.mockImplementation(() => {
        const mockChild = new EventEmitter() as any;
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        
        setTimeout(() => {
          mockChild.emit('close', 1);
        }, 10);
        
        return mockChild;
      });

      await expect(tmuxManager.createSession()).rejects.toThrow();
    });

    it('should use custom session name when provided', async () => {
      const customSessionName = 'custom-session';
      
      mockSpawn.mockImplementation(() => {
        const mockChild = new EventEmitter() as any;
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        
        setTimeout(() => {
          if (mockChild.stdout) {
            mockChild.stdout.emit('data', '%0\n');
          }
          mockChild.emit('close', 0);
        }, 10);
        
        return mockChild;
      });

      await tmuxManager.createSession(customSessionName);
      
      expect(mockSpawn).toHaveBeenCalledWith('tmux', 
        expect.arrayContaining(['-s', customSessionName]),
        expect.any(Object)
      );
    });
  });

  describe('destroySession', () => {
    let sessionId: string;

    beforeEach(async () => {
      mockSpawn.mockImplementation(() => {
        const mockChild = new EventEmitter() as any;
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        
        setTimeout(() => {
          if (mockChild.stdout) {
            mockChild.stdout.emit('data', '%0\n');
          }
          mockChild.emit('close', 0);
        }, 10);
        
        return mockChild;
      });

      sessionId = await tmuxManager.createSession();
    });

    it('should destroy an existing session', async () => {
      mockSpawn.mockImplementation(() => {
        const mockChild = new EventEmitter() as any;
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        
        setTimeout(() => {
          mockChild.emit('close', 0);
        }, 10);
        
        return mockChild;
      });

      await tmuxManager.destroySession(sessionId);
      
      expect(mockSpawn).toHaveBeenCalledWith('tmux', [
        'kill-session',
        '-t',
        'test-session'
      ], { stdio: ['pipe', 'pipe', 'pipe'] });
    });

    it('should throw error for non-existent session', async () => {
      const nonExistentSessionId = 'non-existent';
      
      await expect(tmuxManager.destroySession(nonExistentSessionId))
        .rejects.toThrow('Session not found');
    });
  });

  describe('splitPane', () => {
    let sessionId: string;

    beforeEach(async () => {
      mockSpawn.mockImplementation(() => {
        const mockChild = new EventEmitter() as any;
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        
        setTimeout(() => {
          if (mockChild.stdout) {
            mockChild.stdout.emit('data', '%0\n');
          }
          mockChild.emit('close', 0);
        }, 10);
        
        return mockChild;
      });

      sessionId = await tmuxManager.createSession();
    });

    it('should split pane horizontally', async () => {
      mockSpawn.mockImplementation(() => {
        const mockChild = new EventEmitter() as any;
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        
        setTimeout(() => {
          if (mockChild.stdout) {
            mockChild.stdout.emit('data', '%1\n');
          }
          mockChild.emit('close', 0);
        }, 10);
        
        return mockChild;
      });

      const paneId = await tmuxManager.splitPane(sessionId, 'horizontal');
      
      expect(mockSpawn).toHaveBeenCalledWith('tmux', [
        'split-window',
        '-h',
        '-t',
        'test-session',
        '-P',
        '-F',
        '#{pane_id}'
      ], { stdio: ['pipe', 'pipe', 'pipe'] });
      
      expect(paneId).toBe('%1');
    });

    it('should split pane vertically', async () => {
      mockSpawn.mockImplementation(() => {
        const mockChild = new EventEmitter() as any;
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        
        setTimeout(() => {
          if (mockChild.stdout) {
            mockChild.stdout.emit('data', '%1\n');
          }
          mockChild.emit('close', 0);
        }, 10);
        
        return mockChild;
      });

      const paneId = await tmuxManager.splitPane(sessionId, 'vertical');
      
      expect(mockSpawn).toHaveBeenCalledWith('tmux', [
        'split-window',
        '-v',
        '-t',
        'test-session',
        '-P',
        '-F',
        '#{pane_id}'
      ], { stdio: ['pipe', 'pipe', 'pipe'] });
      
      expect(paneId).toBe('%1');
    });
  });

  describe('updatePaneContent', () => {
    it('should update pane content successfully', async () => {
      const paneId = '%0';
      const content = 'Test content\nLine 2';

      mockSpawn.mockImplementation(() => {
        const mockChild = new EventEmitter() as any;
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        
        setTimeout(() => {
          mockChild.emit('close', 0);
        }, 10);
        
        return mockChild;
      });

      await tmuxManager.updatePaneContent(paneId, content);
      
      // clearPane と appendToPaneContent が呼ばれることを確認
      expect(mockSpawn).toHaveBeenCalledWith('tmux', [
        'send-keys',
        '-t',
        paneId,
        'C-c'
      ], { stdio: ['pipe', 'pipe', 'pipe'] });
    });
  });

  describe('resizePane', () => {
    it('should resize pane successfully', async () => {
      const paneId = '%0';
      const size = 60;

      mockSpawn.mockImplementation(() => {
        const mockChild = new EventEmitter() as any;
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        
        setTimeout(() => {
          mockChild.emit('close', 0);
        }, 10);
        
        return mockChild;
      });

      await tmuxManager.resizePane(paneId, size);
      
      expect(mockSpawn).toHaveBeenCalledWith('tmux', [
        'resize-pane',
        '-t',
        paneId,
        '-x',
        '60'
      ], { stdio: ['pipe', 'pipe', 'pipe'] });
    });
  });

  describe('sendKeys', () => {
    it('should send keys to pane successfully', async () => {
      const paneId = '%0';
      const keys = 'ls -la';

      mockSpawn.mockImplementation(() => {
        const mockChild = new EventEmitter() as any;
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        
        setTimeout(() => {
          mockChild.emit('close', 0);
        }, 10);
        
        return mockChild;
      });

      await tmuxManager.sendKeys(paneId, keys);
      
      expect(mockSpawn).toHaveBeenCalledWith('tmux', [
        'send-keys',
        '-t',
        paneId,
        keys
      ], { stdio: ['pipe', 'pipe', 'pipe'] });
    });
  });

  describe('getActiveSessions', () => {
    it('should return empty array when no sessions', () => {
      const sessions = tmuxManager.getActiveSessions();
      expect(sessions).toEqual([]);
    });

    it('should return active sessions', async () => {
      mockSpawn.mockImplementation(() => {
        const mockChild = new EventEmitter() as any;
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        
        setTimeout(() => {
          if (mockChild.stdout) {
            mockChild.stdout.emit('data', '%0\n');
          }
          mockChild.emit('close', 0);
        }, 10);
        
        return mockChild;
      });

      const sessionId = await tmuxManager.createSession();
      const sessions = tmuxManager.getActiveSessions();
      
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.sessionId).toBe(sessionId);
      expect(sessions[0]?.status).toBe('active');
    });
  });

  describe('error handling', () => {
    it('should handle tmux command errors gracefully', async () => {
      mockSpawn.mockImplementation(() => {
        const mockChild = new EventEmitter() as any;
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        
        setTimeout(() => {
          if (mockChild.stderr) {
            mockChild.stderr.emit('data', 'tmux: command not found');
          }
          mockChild.emit('close', 1);
        }, 10);
        
        return mockChild;
      });

      await expect(tmuxManager.createSession()).rejects.toThrow();
    });
  });

  describe('events', () => {
    it('should emit session_created event', async () => {
      const eventSpy = jest.fn();
      tmuxManager.on('session_created', eventSpy);

      mockSpawn.mockImplementation(() => {
        const mockChild = new EventEmitter() as any;
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        
        setTimeout(() => {
          if (mockChild.stdout) {
            mockChild.stdout.emit('data', '%0\n');
          }
          mockChild.emit('close', 0);
        }, 10);
        
        return mockChild;
      });

      await tmuxManager.createSession();
      
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionName: 'test-session',
          status: 'active'
        })
      );
    });
  });
});
