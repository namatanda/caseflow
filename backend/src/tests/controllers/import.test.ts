import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { ImportController } from '../../controllers/import';
import { importService } from '../../services/importService';

// Mock the import service
vi.mock('../../services/importService', () => ({
  importService: {
    createBatch: vi.fn(),
    markBatchProcessing: vi.fn(),
    processCsvBatch: vi.fn(),
    failBatch: vi.fn(),
    getBatchById: vi.fn(),
    getRecentBatches: vi.fn(),
    exportCasesForCsv: vi.fn(),
    queueCsvImportWithFile: vi.fn(),
    getJobStatus: vi.fn(),
  },
}));

describe('ImportController', () => {
  let controller: ImportController;
  let mockReq: any;
  let mockRes: any;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new ImportController(importService);

    mockReq = {
      file: {
        originalname: 'test.csv',
        path: '/temp/test.csv',
        size: 1024,
      } as Express.Multer.File,
      body: {},
      params: {},
      query: {},
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
      write: vi.fn().mockReturnThis(),
      end: vi.fn(),
    };

    mockNext = vi.fn();
  });

  describe('uploadCsv', () => {
    it('should return 400 if no file is uploaded', async () => {
      mockReq.file = undefined;

      await controller.uploadCsv(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'CSV file is required.' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should create batch and queue job with valid file', async () => {
      const mockBatch = { id: 'batch-1', status: 'PENDING' };
      const mockJobResult = { jobId: 'job-1', batchId: 'batch-1' };

      vi.mocked(importService.createBatch).mockResolvedValue(mockBatch);
      vi.mocked(importService.queueCsvImportWithFile).mockResolvedValue(mockJobResult);

      await controller.uploadCsv(mockReq as Request, mockRes as Response, mockNext);

      expect(importService.createBatch).toHaveBeenCalledWith({
        importDate: expect.any(Date),
        filename: 'test.csv',
        fileSize: 1024,
        fileChecksum: 'unknown',
        totalRecords: 0,
        createdBy: 'system',
      });

      expect(importService.queueCsvImportWithFile).toHaveBeenCalledWith(
        'batch-1',
        '/temp/test.csv',
        {}
      );

      expect(mockRes.status).toHaveBeenCalledWith(202);
      expect(mockRes.json).toHaveBeenCalledWith({
        batchId: 'batch-1',
        jobId: 'job-1',
        status: 'queued',
        message: 'CSV import job has been queued for processing',
      });
    });

    it('should parse metadata from request body', async () => {
      const mockBatch = { id: 'batch-1', status: 'PENDING' };
      const mockJobResult = { jobId: 'job-1', batchId: 'batch-1' };

      mockReq.body = {
        metadata: JSON.stringify({
          importDate: '2024-01-01',
          createdBy: 'test-user',
          userConfig: { notify: true },
          estimatedCompletionTime: '2024-01-02T10:00:00Z',
        }),
      };

      vi.mocked(importService.createBatch).mockResolvedValue(mockBatch);
      vi.mocked(importService.queueCsvImportWithFile).mockResolvedValue(mockJobResult);

      await controller.uploadCsv(mockReq as Request, mockRes as Response, mockNext);

      expect(importService.createBatch).toHaveBeenCalledWith({
        importDate: new Date('2024-01-01'),
        filename: 'test.csv',
        fileSize: 1024,
        fileChecksum: 'unknown',
        totalRecords: 0,
        createdBy: 'test-user',
        estimatedCompletionTime: new Date('2024-01-02T10:00:00Z'),
        userConfig: { notify: true },
      });
    });

    it('should parse options from request body', async () => {
      const mockBatch = { id: 'batch-1', status: 'PENDING' };
      const mockJobResult = { jobId: 'job-1', batchId: 'batch-1' };

      mockReq.body = {
        options: JSON.stringify({
          chunkSize: 500,
          errorLogs: ['test error'],
          completedAt: '2024-01-02T10:00:00Z',
        }),
      };

      vi.mocked(importService.createBatch).mockResolvedValue(mockBatch);
      vi.mocked(importService.queueCsvImportWithFile).mockResolvedValue(mockJobResult);

      await controller.uploadCsv(mockReq as Request, mockRes as Response, mockNext);

      expect(importService.queueCsvImportWithFile).toHaveBeenCalledWith(
        'batch-1',
        '/temp/test.csv',
        {
          chunkSize: 500,
          errorLogs: ['test error'],
          completedAt: new Date('2024-01-02T10:00:00Z'),
        }
      );
    });

    it('should handle invalid JSON in metadata gracefully', async () => {
      const mockBatch = { id: 'batch-1', status: 'PENDING' };
      const mockJobResult = { jobId: 'job-1', batchId: 'batch-1' };

      mockReq.body = {
        metadata: 'invalid json',
      };

      vi.mocked(importService.createBatch).mockResolvedValue(mockBatch);
      vi.mocked(importService.queueCsvImportWithFile).mockResolvedValue(mockJobResult);

      await controller.uploadCsv(mockReq as Request, mockRes as Response, mockNext);

      // Should use default values
      expect(importService.createBatch).toHaveBeenCalledWith({
        importDate: expect.any(Date),
        filename: 'test.csv',
        fileSize: 1024,
        fileChecksum: 'unknown',
        totalRecords: 0,
        createdBy: 'system',
      });
    });

    it('should handle invalid JSON in options gracefully', async () => {
      const mockBatch = { id: 'batch-1', status: 'PENDING' };
      const mockJobResult = { jobId: 'job-1', batchId: 'batch-1' };

      mockReq.body = {
        options: 'invalid json',
      };

      vi.mocked(importService.createBatch).mockResolvedValue(mockBatch);
      vi.mocked(importService.queueCsvImportWithFile).mockResolvedValue(mockJobResult);

      await controller.uploadCsv(mockReq as Request, mockRes as Response, mockNext);

      expect(importService.queueCsvImportWithFile).toHaveBeenCalledWith(
        'batch-1',
        '/temp/test.csv',
        {}
      );
    });

    it('should call next with error on service failure', async () => {
      const error = new Error('Service error');
      vi.mocked(importService.createBatch).mockRejectedValue(error);

      await controller.uploadCsv(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('getBatchStatus', () => {
    it('should return 400 if batchId is missing', async () => {
      mockReq.params = {};

      await controller.getBatchStatus(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Batch ID is required.' });
    });

    it('should return batch status successfully', async () => {
      const mockBatch = { id: 'batch-1', status: 'COMPLETED' };
      mockReq.params = { batchId: 'batch-1' };
      mockReq.query = {};

      vi.mocked(importService.getBatchById).mockResolvedValue(mockBatch);

      await controller.getBatchStatus(mockReq as Request, mockRes as Response, mockNext);

      expect(importService.getBatchById).toHaveBeenCalledWith('batch-1', {
        includeErrorDetails: false,
      });
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(mockBatch);
    });

    it('should include error details when requested', async () => {
      const mockBatch = { id: 'batch-1', status: 'FAILED', errorDetails: [] };
      mockReq.params = { batchId: 'batch-1' };
      mockReq.query = { includeErrors: 'true' };

      vi.mocked(importService.getBatchById).mockResolvedValue(mockBatch);

      await controller.getBatchStatus(mockReq as Request, mockRes as Response, mockNext);

      expect(importService.getBatchById).toHaveBeenCalledWith('batch-1', {
        includeErrorDetails: true,
      });
    });

    it('should return 404 if batch not found', async () => {
      mockReq.params = { batchId: 'batch-1' };

      vi.mocked(importService.getBatchById).mockResolvedValue(null);

      await controller.getBatchStatus(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Batch batch-1 not found.' });
    });

    it('should call next with error on service failure', async () => {
      const error = new Error('Service error');
      mockReq.params = { batchId: 'batch-1' };

      vi.mocked(importService.getBatchById).mockRejectedValue(error);

      await controller.getBatchStatus(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('getJobStatus', () => {
    it('should return 400 if jobId is missing', async () => {
      mockReq.params = {};

      await controller.getJobStatus(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Job ID is required.' });
    });

    it('should return job status successfully', async () => {
      const mockJobStatus = {
        jobId: 'job-1',
        state: 'completed',
        progress: 100,
        data: {},
        opts: {},
        attemptsMade: 1,
        finishedOn: Date.now(),
        processedOn: Date.now(),
        failedReason: null,
      };
      mockReq.params = { jobId: 'job-1' };

      vi.mocked(importService.getJobStatus).mockResolvedValue(mockJobStatus);

      await controller.getJobStatus(mockReq as Request, mockRes as Response, mockNext);

      expect(importService.getJobStatus).toHaveBeenCalledWith('job-1');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(mockJobStatus);
    });

    it('should return 404 if job not found', async () => {
      mockReq.params = { jobId: 'job-1' };

      vi.mocked(importService.getJobStatus).mockResolvedValue(null);

      await controller.getJobStatus(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Job job-1 not found.' });
    });

    it('should call next with error on service failure', async () => {
      const error = new Error('Service error');
      mockReq.params = { jobId: 'job-1' };

      vi.mocked(importService.getJobStatus).mockRejectedValue(error);

      await controller.getJobStatus(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('listRecentBatches', () => {
    it('should return recent batches with default limit', async () => {
      const mockBatches = [{ id: 'batch-1' }, { id: 'batch-2' }];
      mockReq.query = {};

      vi.mocked(importService.getRecentBatches).mockResolvedValue(mockBatches);

      await controller.listRecentBatches(mockReq as Request, mockRes as Response, mockNext);

      expect(importService.getRecentBatches).toHaveBeenCalledWith(10);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({ batches: mockBatches });
    });

    it('should use custom limit from query', async () => {
      const mockBatches = [{ id: 'batch-1' }];
      mockReq.query = { limit: '5' };

      vi.mocked(importService.getRecentBatches).mockResolvedValue(mockBatches);

      await controller.listRecentBatches(mockReq as Request, mockRes as Response, mockNext);

      expect(importService.getRecentBatches).toHaveBeenCalledWith(5);
    });

    it('should cap limit at 100', async () => {
      mockReq.query = { limit: '200' };

      vi.mocked(importService.getRecentBatches).mockResolvedValue([]);

      await controller.listRecentBatches(mockReq as Request, mockRes as Response, mockNext);

      expect(importService.getRecentBatches).toHaveBeenCalledWith(100);
    });

    it('should use default limit for invalid values', async () => {
      mockReq.query = { limit: 'invalid' };

      vi.mocked(importService.getRecentBatches).mockResolvedValue([]);

      await controller.listRecentBatches(mockReq as Request, mockRes as Response, mockNext);

      expect(importService.getRecentBatches).toHaveBeenCalledWith(10);
    });

    it('should call next with error on service failure', async () => {
      const error = new Error('Service error');

      vi.mocked(importService.getRecentBatches).mockRejectedValue(error);

      await controller.listRecentBatches(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('exportCases', () => {
    it('should export cases to CSV with default parameters', async () => {
      const mockCases = [
        {
          caseNumber: 'CASE-001',
          courtName: 'High Court',
          caseType: { caseTypeName: 'Civil' },
          filedDate: new Date('2024-01-01'),
          status: 'ACTIVE',
          totalActivities: 2,
        },
      ];

      const mockIterator = {
        [Symbol.asyncIterator]: () => ({
          next: vi.fn()
            .mockResolvedValueOnce({ value: mockCases, done: false })
            .mockResolvedValueOnce({ value: undefined, done: true }),
        }),
      };

      mockReq.query = {};
      vi.mocked(importService.exportCasesForCsv).mockReturnValue(mockIterator as any);

      await controller.exportCases(mockReq as Request, mockRes as Response, mockNext);

      expect(importService.exportCasesForCsv).toHaveBeenCalledWith({}, {
        include: { caseType: true },
      });

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringMatching(/^attachment; filename="cases-export-\d+\.csv"$/)
      );
      expect(mockRes.write).toHaveBeenCalledWith('caseNumber,courtName,caseType,filedDate,status,totalActivities\n');
      expect(mockRes.write).toHaveBeenCalledWith('CASE-001,High Court,Civil,2024-01-01,ACTIVE,2\n');
      expect(mockRes.end).toHaveBeenCalled();
    });

    it('should handle search parameters', async () => {
      const mockIterator = {
        [Symbol.asyncIterator]: () => ({
          next: vi.fn()
            .mockResolvedValue({ value: undefined, done: true }),
        }),
      };

      mockReq.query = {
        courtName: 'High Court',
        caseTypeId: 'type-1',
        status: 'ACTIVE',
        filedFrom: '2024-01-01',
        filedTo: '2024-12-31',
        pageSize: '100',
      };

      vi.mocked(importService.exportCasesForCsv).mockReturnValue(mockIterator as any);

      await controller.exportCases(mockReq as Request, mockRes as Response, mockNext);

      expect(importService.exportCasesForCsv).toHaveBeenCalledWith(
        {
          courtName: 'High Court',
          caseTypeId: 'type-1',
          status: 'ACTIVE',
          filedFrom: new Date('2024-01-01'),
          filedTo: new Date('2024-12-31'),
        },
        {
          pageSize: 100,
          include: { caseType: true },
        }
      );
    });

    it('should escape CSV values containing commas and quotes', async () => {
      const mockCases = [
        {
          caseNumber: 'CASE-001',
          courtName: 'High Court, Nairobi',
          caseType: { caseTypeName: 'Civil "Case"' },
          filedDate: new Date('2024-01-01'),
          status: 'ACTIVE',
          totalActivities: 2,
        },
      ];

      const mockIterator = {
        [Symbol.asyncIterator]: () => ({
          next: vi.fn()
            .mockResolvedValueOnce({ value: mockCases, done: false })
            .mockResolvedValueOnce({ value: undefined, done: true }),
        }),
      };

      vi.mocked(importService.exportCasesForCsv).mockReturnValue(mockIterator as any);

      await controller.exportCases(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.write).toHaveBeenCalledWith('CASE-001,"High Court, Nairobi","Civil ""Case""",2024-01-01,ACTIVE,2\n');
    });

    it('should handle null/undefined values in CSV export', async () => {
      const mockCases = [
        {
          caseNumber: 'CASE-001',
          courtName: 'High Court',
          caseType: null,
          filedDate: null,
          status: 'ACTIVE',
          totalActivities: null,
        },
      ];

      const mockIterator = {
        [Symbol.asyncIterator]: () => ({
          next: vi.fn()
            .mockResolvedValueOnce({ value: mockCases, done: false })
            .mockResolvedValueOnce({ value: undefined, done: true }),
        }),
      };

      vi.mocked(importService.exportCasesForCsv).mockReturnValue(mockIterator as any);

      await controller.exportCases(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.write).toHaveBeenCalledWith('CASE-001,High Court,,,ACTIVE,0\n');
    });

    it('should call next with error on service failure', async () => {
      const error = new Error('Service error');

      vi.mocked(importService.exportCasesForCsv).mockImplementation(() => {
        throw error;
      });

      await controller.exportCases(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });
});