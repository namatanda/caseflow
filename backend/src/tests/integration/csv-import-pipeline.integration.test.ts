import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateFileChecksum } from '../../utils/checksum';
import { parseCsvFile } from '../../utils/csvParser';
import { websocketService } from '../../services/websocketService';
import { validateRequest } from '../../middleware/validation';
import { z } from 'zod';
import fs from 'fs/promises';
import type { Server as HttpServer } from 'http';

// Mock file operations
vi.mock('fs/promises');
vi.mock('fs');

// Mock logger
vi.mock('../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Phase 1 Integration Tests', () => {
  let mockHttpServer: Partial<HttpServer>;

  beforeEach(() => {
    mockHttpServer = {};
    vi.clearAllMocks();
  });

  afterEach(() => {
    websocketService.close();
  });

  describe('CSV Import Pipeline Integration', () => {
    it('should execute complete CSV processing pipeline', async () => {
      // 1. File checksum calculation
      const mockFilePath = '/test/data.csv';
      
      // Mock successful file stats
      vi.mocked(fs.stat).mockResolvedValue({
        size: 1024,
      } as any);

      // Mock successful stream reading
      const mockCreateReadStream = vi.fn(() => ({
        on: vi.fn((event, handler) => {
          if (event === 'data') {
            setTimeout(() => handler(Buffer.from('test,data\nvalue1,value2')), 0);
          } else if (event === 'end') {
            setTimeout(() => handler(), 5);
          }
          return mockCreateReadStream();
        }),
      }));
      
      const fs = await import('fs');
      vi.mocked(fs.createReadStream).mockImplementation(mockCreateReadStream as any);

      // Calculate checksum
      const checksumResult = await calculateFileChecksum(mockFilePath, 'md5');
      
      expect(checksumResult).toHaveProperty('checksum');
      expect(checksumResult).toHaveProperty('fileSize', 1024);
      expect(checksumResult).toHaveProperty('algorithm', 'md5');
      expect(checksumResult).toHaveProperty('computeTime');
      expect(typeof checksumResult.checksum).toBe('string');
      expect(checksumResult.checksum.length).toBe(32); // MD5 length

      // 2. CSV parsing and validation
      const csvParser = await import('csv-parser');
      const mockCsvParser = vi.fn(() => ({
        on: vi.fn(function (event, handler) {
          if (event === 'headers') {
            setTimeout(() => handler(['name', 'email']), 0);
          } else if (event === 'data') {
            setTimeout(() => {
              handler({ name: 'John', email: 'john@example.com' });
              handler({ name: 'Jane', email: 'jane@example.com' });
            }, 0);
          } else if (event === 'end') {
            setTimeout(() => handler(), 10);
          }
          return this;
        }),
      }));

      vi.doMock('csv-parser', () => ({ default: mockCsvParser }));

      const mockStream = {
        pipe: vi.fn().mockReturnValue({
          on: vi.fn(function (event, handler) {
            if (event === 'headers') {
              setTimeout(() => handler(['name', 'email']), 0);
            } else if (event === 'data') {
              setTimeout(() => {
                handler({ name: 'John', email: 'john@example.com' });
                handler({ name: 'Jane', email: 'jane@example.com' });
              }, 0);
            } else if (event === 'end') {
              setTimeout(() => handler(), 10);
            }
            return this;
          }),
        }),
      };

      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      const parseResult = await parseCsvFile(mockFilePath);

      expect(parseResult.data).toHaveLength(2);
      expect(parseResult.successfulRows).toBe(2);
      expect(parseResult.failedRows).toBe(0);
      expect(parseResult.headers).toEqual(['name', 'email']);
      expect(parseResult.data[0]).toEqual({ name: 'John', email: 'john@example.com' });
      expect(parseResult.data[1]).toEqual({ name: 'Jane', email: 'jane@example.com' });

      // 3. WebSocket real-time progress
      websocketService.initialize(mockHttpServer as HttpServer);

      const progressPayload = {
        batchId: 'test-batch-123',
        jobId: 'test-job-456',
        progress: 50,
        stage: 'importing' as const,
        processedRecords: 1,
        totalRecords: 2,
      };

      websocketService.emitImportProgress(progressPayload);

      // Verify WebSocket is working
      expect(websocketService['io']).toBeDefined();

      // 4. Request validation
      const schema = z.object({
        filename: z.string().min(1),
        checksum: z.string().length(32),
        rows: z.number().positive(),
      });

      const mockReq = {
        body: {
          filename: 'data.csv',
          checksum: checksumResult.checksum,
          rows: parseResult.successfulRows,
        },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      const validationMiddleware = validateRequest({ body: schema });
      validationMiddleware(mockReq as any, mockRes as any, mockNext);

      // Should pass validation with our integrated data
      expect(mockNext).toHaveBeenCalledWith();
      expect(mockReq.body.filename).toBe('data.csv');
      expect(mockReq.body.checksum).toBe(checksumResult.checksum);
      expect(mockReq.body.rows).toBe(2);

      // 5. Complete integration success
      const completedPayload = {
        batchId: 'test-batch-123',
        jobId: 'test-job-456',
        totalRecords: parseResult.successfulRows,
        successfulRecords: parseResult.successfulRows,
        failedRecords: parseResult.failedRows,
        duration: 1500,
      };

      websocketService.emitImportCompleted(completedPayload);

      // Integration verification
      expect(checksumResult.fileSize).toBeGreaterThan(0);
      expect(parseResult.data.length).toBe(completedPayload.totalRecords);
      expect(completedPayload.successfulRecords).toBe(parseResult.successfulRows);
      expect(completedPayload.failedRecords).toBe(parseResult.failedRows);
    });

    it('should handle error scenarios throughout pipeline', async () => {
      // 1. Checksum calculation failure
      const mockErrorStream = {
        on: vi.fn((event, handler) => {
          if (event === 'error') {
            setTimeout(() => handler(new Error('File access denied')), 0);
          }
          return mockErrorStream;
        }),
      };

      const fs = await import('fs');
      vi.mocked(fs.createReadStream).mockReturnValue(mockErrorStream as any);

      await expect(
        calculateFileChecksum('/inaccessible/file.csv')
      ).rejects.toThrow('File access denied');

      // 2. WebSocket error handling (when not initialized)
      websocketService.close(); // Ensure not initialized

      // Should not throw when emitting to uninitialized service
      expect(() => {
        websocketService.emitImportFailed({
          batchId: 'failed-batch',
          jobId: 'failed-job',
          error: 'Processing failed',
          timestamp: new Date().toISOString(),
        });
      }).not.toThrow();

      // 3. Validation failure
      const strictSchema = z.object({
        requiredField: z.string().min(10),
      });

      const mockReq = {
        body: {
          requiredField: 'short', // Will fail validation
        },
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockNext = vi.fn();

      const validationMiddleware = validateRequest({ body: strictSchema });
      validationMiddleware(mockReq as any, mockRes as any, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeDefined();
      expect(error.message).toContain('requiredField');
    });

    it('should demonstrate complete Phase 1 feature set', async () => {
      // Initialize WebSocket service
      websocketService.initialize(mockHttpServer as HttpServer);

      // 1. File Upload with Checksum
      const uploadedFile = {
        path: '/uploads/cases.csv',
        originalname: 'cases.csv',
        mimetype: 'text/csv',
        size: 2048,
      };

      // Mock successful checksum
      vi.mocked(fs.stat).mockResolvedValue({ size: 2048 } as any);
      
      const mockStream = {
        on: vi.fn((event, handler) => {
          if (event === 'data') {
            setTimeout(() => handler(Buffer.from('case_number,status\nC001,open\nC002,closed')), 0);
          } else if (event === 'end') {
            setTimeout(() => handler(), 5);
          }
          return mockStream;
        }),
      };

      const fs = await import('fs');
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      const fileChecksum = await calculateFileChecksum(uploadedFile.path, 'sha256');

      // 2. CSV Parsing with Validation
      const csvSchema = z.object({
        case_number: z.string().regex(/^C\d{3}$/),
        status: z.enum(['open', 'closed', 'pending']),
      });

      const mockCsvStream = {
        pipe: vi.fn().mockReturnValue({
          on: vi.fn(function (event, handler) {
            if (event === 'headers') {
              setTimeout(() => handler(['case_number', 'status']), 0);
            } else if (event === 'data') {
              setTimeout(() => {
                handler({ case_number: 'C001', status: 'open' });
                handler({ case_number: 'C002', status: 'closed' });
              }, 0);
            } else if (event === 'end') {
              setTimeout(() => handler(), 10);
            }
            return this;
          }),
        }),
      };

      vi.mocked(fs.createReadStream).mockReturnValue(mockCsvStream as any);

      const csvResult = await parseCsvFile(uploadedFile.path, {
        validationSchema: csvSchema,
      });

      // 3. Real-time Progress Updates
      const batchId = `batch_${Date.now()}`;
      const jobId = `job_${Date.now()}`;

      // Validation stage
      websocketService.emitImportProgress({
        batchId,
        jobId,
        progress: 0,
        stage: 'validation',
        processedRecords: 0,
        totalRecords: csvResult.data.length,
      });

      // Parsing stage
      websocketService.emitImportProgress({
        batchId,
        jobId,
        progress: 33,
        stage: 'parsing',
        processedRecords: 0,
        totalRecords: csvResult.data.length,
      });

      // Importing stage
      websocketService.emitImportProgress({
        batchId,
        jobId,
        progress: 66,
        stage: 'importing',
        processedRecords: 1,
        totalRecords: csvResult.data.length,
      });

      // Completion
      websocketService.emitImportCompleted({
        batchId,
        jobId,
        totalRecords: csvResult.data.length,
        successfulRecords: csvResult.successfulRows,
        failedRecords: csvResult.failedRows,
        duration: 3000,
      });

      // 4. Validation of Complete Pipeline
      expect(fileChecksum.algorithm).toBe('sha256');
      expect(fileChecksum.checksum).toHaveLength(64); // SHA256 length
      expect(fileChecksum.fileSize).toBe(2048);

      expect(csvResult.successfulRows).toBe(2);
      expect(csvResult.failedRows).toBe(0);
      expect(csvResult.headers).toEqual(['case_number', 'status']);

      expect(websocketService['io']).toBeDefined();

      // Integration assertions
      expect(csvResult.data).toEqual([
        { case_number: 'C001', status: 'open' },
        { case_number: 'C002', status: 'closed' },
      ]);
    });
  });

  describe('Performance and Resource Management', () => {
    it('should handle multiple checksum algorithms efficiently', async () => {
      const mockPath = '/test/performance.csv';
      
      vi.mocked(fs.stat).mockResolvedValue({ size: 10240 } as any);

      const mockStream = {
        on: vi.fn((event, handler) => {
          if (event === 'data') {
            // Simulate larger data chunks
            setTimeout(() => {
              for (let i = 0; i < 10; i++) {
                handler(Buffer.from('performance test data chunk ' + i));
              }
            }, 0);
          } else if (event === 'end') {
            setTimeout(() => handler(), 5);
          }
          return mockStream;
        }),
      };

      const fs = await import('fs');
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      const startTime = Date.now();
      
      // Calculate multiple checksums
      const [md5Result, sha256Result] = await Promise.all([
        calculateFileChecksum(mockPath, 'md5'),
        calculateFileChecksum(mockPath, 'sha256'),
      ]);

      const duration = Date.now() - startTime;

      // Performance assertions
      expect(duration).toBeLessThan(1000); // Should complete quickly
      expect(md5Result.checksum).toHaveLength(32);
      expect(sha256Result.checksum).toHaveLength(64);
      expect(md5Result.fileSize).toBe(sha256Result.fileSize);
      expect(md5Result.checksum).not.toBe(sha256Result.checksum);
    });

    it('should demonstrate WebSocket room management', async () => {
      websocketService.initialize(mockHttpServer as HttpServer);

      // Simulate multiple batch operations
      const batches = ['batch_001', 'batch_002', 'batch_003'];

      batches.forEach((batchId, index) => {
        websocketService.emitImportProgress({
          batchId,
          jobId: `job_${index}`,
          progress: index * 25,
          stage: 'importing',
          processedRecords: index * 100,
          totalRecords: 1000,
        });
      });

      // All should be handled without conflict
      expect(websocketService['io']).toBeDefined();
    });
  });
});