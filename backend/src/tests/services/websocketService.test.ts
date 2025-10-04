import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server as HttpServer } from 'http';
import type { Server as SocketServer, Socket } from 'socket.io';
import { websocketService } from '../../services/websocketService';

// Mock socket.io
vi.mock('socket.io', () => {
  const mockSocket = {
    id: 'mock-socket-id',
    join: vi.fn(),
    emit: vi.fn(),
    on: vi.fn(),
    disconnect: vi.fn(),
  };

  const mockIo = {
    on: vi.fn(),
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
    close: vi.fn(),
    sockets: {
      sockets: new Map([['mock-socket-id', mockSocket]]),
    },
  };

  return {
    Server: vi.fn(() => mockIo),
  };
});

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('WebSocket Service', () => {
  let mockHttpServer: Partial<HttpServer>;
  let mockIo: any;

  beforeEach(() => {
    mockHttpServer = {};
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (websocketService['io']) {
      websocketService.close();
    }
  });

  describe('initialize', () => {
    it('should initialize Socket.IO server', () => {
      websocketService.initialize(mockHttpServer as HttpServer);

      expect(websocketService['io']).toBeDefined();
    });

    it('should set up connection event handler', () => {
      websocketService.initialize(mockHttpServer as HttpServer);
      const io = websocketService['io'];

      expect(io?.on).toHaveBeenCalledWith('connection', expect.any(Function));
    });

    it('should not reinitialize if already initialized', () => {
      websocketService.initialize(mockHttpServer as HttpServer);
      const firstIo = websocketService['io'];

      websocketService.initialize(mockHttpServer as HttpServer);
      const secondIo = websocketService['io'];

      expect(firstIo).toBe(secondIo);
    });
  });

  describe('emitImportProgress', () => {
    beforeEach(() => {
      websocketService.initialize(mockHttpServer as HttpServer);
    });

    it('should emit progress event to specific batch room', () => {
      const batchId = 'batch_12345';
      const progress = {
        batchId,
        jobId: 'job_1',
        progress: 50,
        currentRow: 500,
        totalRows: 1000,
        status: 'processing' as const,
      };

      websocketService.emitImportProgress(progress);

      const io = websocketService['io'];
      expect(io?.to).toHaveBeenCalledWith(`batch_${batchId}`);
      expect(io?.emit).toHaveBeenCalledWith('import:progress', progress);
    });

    it('should handle progress with stage information', () => {
      const progress = {
        batchId: 'batch_789',
        jobId: 'job_2',
        progress: 25,
        currentRow: 0,
        totalRows: 1000,
        status: 'processing' as const,
        stage: 'validation',
      };

      websocketService.emitImportProgress(progress);

      const io = websocketService['io'];
      expect(io?.emit).toHaveBeenCalledWith('import:progress', expect.objectContaining({
        stage: 'validation',
      }));
    });
  });

  describe('emitImportCompleted', () => {
    beforeEach(() => {
      websocketService.initialize(mockHttpServer as HttpServer);
    });

    it('should emit completion event with results', () => {
      const result = {
        batchId: 'batch_complete',
        jobId: 'job_3',
        successCount: 950,
        failureCount: 50,
        totalRows: 1000,
        duration: 45000,
      };

      websocketService.emitImportCompleted(result);

      const io = websocketService['io'];
      expect(io?.to).toHaveBeenCalledWith(`batch_${result.batchId}`);
      expect(io?.emit).toHaveBeenCalledWith('import:completed', result);
    });

    it('should handle completion with no failures', () => {
      const result = {
        batchId: 'batch_perfect',
        jobId: 'job_4',
        successCount: 1000,
        failureCount: 0,
        totalRows: 1000,
        duration: 30000,
      };

      websocketService.emitImportCompleted(result);

      const io = websocketService['io'];
      expect(io?.emit).toHaveBeenCalledWith('import:completed', expect.objectContaining({
        failureCount: 0,
      }));
    });
  });

  describe('emitImportFailed', () => {
    beforeEach(() => {
      websocketService.initialize(mockHttpServer as HttpServer);
    });

    it('should emit failure event with error details', () => {
      const failure = {
        batchId: 'batch_failed',
        jobId: 'job_5',
        error: 'Invalid CSV format',
        failedAt: 'validation',
      };

      websocketService.emitImportFailed(failure);

      const io = websocketService['io'];
      expect(io?.to).toHaveBeenCalledWith(`batch_${failure.batchId}`);
      expect(io?.emit).toHaveBeenCalledWith('import:failed', failure);
    });

    it('should handle failures with partial progress', () => {
      const failure = {
        batchId: 'batch_partial_fail',
        jobId: 'job_6',
        error: 'Database connection lost',
        failedAt: 'importing',
        processedRows: 500,
        totalRows: 1000,
      };

      websocketService.emitImportFailed(failure);

      const io = websocketService['io'];
      expect(io?.emit).toHaveBeenCalledWith('import:failed', expect.objectContaining({
        processedRows: 500,
      }));
    });
  });

  describe('Room management', () => {
    it('should allow clients to join batch rooms', () => {
      websocketService.initialize(mockHttpServer as HttpServer);
      const io = websocketService['io'];

      // Simulate connection event
      const connectionHandler = vi.mocked(io?.on).mock.calls.find(
        call => call[0] === 'connection'
      )?.[1];

      const mockSocket = {
        id: 'client_socket_1',
        join: vi.fn(),
        on: vi.fn(),
      };

      connectionHandler?.(mockSocket as unknown as Socket);

      // Verify socket joined event listener was set up
      expect(mockSocket.on).toHaveBeenCalledWith('join:batch', expect.any(Function));
    });

    it('should broadcast to all clients in a batch room', () => {
      websocketService.initialize(mockHttpServer as HttpServer);

      const progress = {
        batchId: 'batch_broadcast',
        jobId: 'job_7',
        progress: 75,
        currentRow: 750,
        totalRows: 1000,
        status: 'processing' as const,
      };

      websocketService.emitImportProgress(progress);

      const io = websocketService['io'];
      // Should target the specific batch room
      expect(io?.to).toHaveBeenCalledWith('batch_batch_broadcast');
    });
  });

  describe('close', () => {
    it('should close Socket.IO server gracefully', () => {
      websocketService.initialize(mockHttpServer as HttpServer);
      const io = websocketService['io'];

      websocketService.close();

      expect(io?.close).toHaveBeenCalled();
    });

    it('should set io to null after closing', () => {
      websocketService.initialize(mockHttpServer as HttpServer);
      websocketService.close();

      expect(websocketService['io']).toBeNull();
    });

    it('should handle closing when not initialized', () => {
      expect(() => {
        websocketService.close();
      }).not.toThrow();
    });
  });

  describe('Error handling', () => {
    it('should handle emit errors gracefully when not initialized', () => {
      expect(() => {
        websocketService.emitImportProgress({
          batchId: 'batch_1',
          jobId: 'job_1',
          progress: 50,
          currentRow: 500,
          totalRows: 1000,
          status: 'processing',
        });
      }).not.toThrow();
    });

    it('should handle multiple rapid progress updates', () => {
      websocketService.initialize(mockHttpServer as HttpServer);

      for (let i = 0; i < 100; i++) {
        websocketService.emitImportProgress({
          batchId: 'batch_rapid',
          jobId: 'job_rapid',
          progress: i,
          currentRow: i * 10,
          totalRows: 1000,
          status: 'processing',
        });
      }

      const io = websocketService['io'];
      expect(io?.emit).toHaveBeenCalledTimes(100);
    });
  });

  describe('Integration scenarios', () => {
    beforeEach(() => {
      websocketService.initialize(mockHttpServer as HttpServer);
    });

    it('should handle complete import lifecycle', () => {
      const batchId = 'batch_lifecycle';
      const jobId = 'job_lifecycle';

      // Start
      websocketService.emitImportProgress({
        batchId,
        jobId,
        progress: 0,
        currentRow: 0,
        totalRows: 1000,
        status: 'processing',
        stage: 'validation',
      });

      // Progress updates
      websocketService.emitImportProgress({
        batchId,
        jobId,
        progress: 50,
        currentRow: 500,
        totalRows: 1000,
        status: 'processing',
        stage: 'importing',
      });

      // Complete
      websocketService.emitImportCompleted({
        batchId,
        jobId,
        successCount: 1000,
        failureCount: 0,
        totalRows: 1000,
        duration: 60000,
      });

      const io = websocketService['io'];
      expect(io?.emit).toHaveBeenCalledTimes(3);
      expect(io?.emit).toHaveBeenNthCalledWith(1, 'import:progress', expect.any(Object));
      expect(io?.emit).toHaveBeenNthCalledWith(2, 'import:progress', expect.any(Object));
      expect(io?.emit).toHaveBeenNthCalledWith(3, 'import:completed', expect.any(Object));
    });

    it('should handle import failure scenario', () => {
      const batchId = 'batch_fail_scenario';
      const jobId = 'job_fail_scenario';

      // Start
      websocketService.emitImportProgress({
        batchId,
        jobId,
        progress: 0,
        currentRow: 0,
        totalRows: 1000,
        status: 'processing',
      });

      // Fail
      websocketService.emitImportFailed({
        batchId,
        jobId,
        error: 'Validation failed at row 250',
        failedAt: 'validation',
        processedRows: 250,
        totalRows: 1000,
      });

      const io = websocketService['io'];
      expect(io?.emit).toHaveBeenCalledWith('import:failed', expect.objectContaining({
        error: 'Validation failed at row 250',
      }));
    });
  });
});
