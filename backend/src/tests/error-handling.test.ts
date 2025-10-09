import { describe, it, expect, vi, beforeEach } from 'vitest';
import { importController } from '../controllers/import';
import { importService } from '../services/importService';
import { csvImportProcessor } from '../workers/csvImportWorker';
import { cleanupTempFile } from '../middleware/upload';

// Mock dependencies
vi.mock('../services/importService', () => ({
  importService: {
    createBatch: vi.fn(),
    queueCsvImportWithFile: vi.fn(),
    getBatchById: vi.fn(),
    getJobStatus: vi.fn(),
    getRecentBatches: vi.fn(),
    markBatchProcessing: vi.fn(),
    processCsvFile: vi.fn(),
    failBatch: vi.fn(),
    processCsvBatch: vi.fn(),
  },
}));

vi.mock('../middleware/upload', () => ({
  cleanupTempFile: vi.fn(),
}));

vi.mock('../config/queue', () => ({
  csvImportQueue: {
    opts: { connection: {} },
  },
  QUEUE_NAMES: {
    CSV_IMPORT: 'csv-import',
  },
}));

// Use processor function for testing
const processorFunction = csvImportProcessor;

describe('Error Handling Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Controller Error Handling', () => {
    it('should handle file upload errors gracefully', async () => {
      const req = {
        file: undefined,
        body: {},
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await importController.uploadCsv(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'CSV file is required.' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle service errors during batch creation', async () => {
      const error = new Error('Database connection failed');
      vi.mocked(importService.createBatch).mockRejectedValue(error);

      const req = {
        file: { originalname: 'test.csv', path: 'temp/test.csv', size: 1024 },
        body: {},
      };
      const res = {
        status: vi.fn(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await importController.uploadCsv(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('should handle invalid batch ID in getBatchStatus', async () => {
      const req = { params: {}, query: {} };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await importController.getBatchStatus(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Batch ID is required.' });
    });

    it('should handle batch not found errors', async () => {
      vi.mocked(importService.getBatchById).mockResolvedValue(null);

      const req = { params: { batchId: 'non-existent' }, query: {} };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await importController.getBatchStatus(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Batch non-existent not found.' });
    });

    it('should handle invalid job ID in getJobStatus', async () => {
      const req = { params: {} };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await importController.getJobStatus(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Job ID is required.' });
    });

    it('should handle job not found errors', async () => {
      vi.mocked(importService.getJobStatus).mockResolvedValue(null);

      const req = { params: { jobId: 'non-existent-job' } };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await importController.getJobStatus(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Job non-existent-job not found.' });
    });
  });

  describe('Worker Error Handling', () => {
    it('should handle missing filePath and payload', async () => {
      const job = {
        id: 'job-1',
        data: { batchId: 'batch-1' },
        updateProgress: vi.fn(),
      };

      await expect(processorFunction(job)).rejects.toThrow(
        'Either filePath or payload must be provided'
      );
    });

    it('should handle batch processing errors', async () => {
      const processingError = new Error('Database constraint violation');
      vi.mocked(importService.markBatchProcessing).mockRejectedValue(processingError);
      vi.mocked(importService.failBatch).mockResolvedValue({ id: 'batch-1', status: 'FAILED' });
      vi.mocked(cleanupTempFile).mockResolvedValue(undefined);

      const job = {
        id: 'job-1',
        data: {
          batchId: 'batch-1',
          filePath: 'temp/test.csv',
        },
        updateProgress: vi.fn(),
      };

      await expect(processorFunction(job)).rejects.toThrow('Database constraint violation');

      expect(importService.failBatch).toHaveBeenCalledWith('batch-1', {
        error: 'Database constraint violation',
        jobId: 'job-1',
        timestamp: expect.any(String),
      });
      expect(cleanupTempFile).toHaveBeenCalledWith('temp/test.csv');
    });

    it('should handle CSV processing errors', async () => {
      const csvError = new Error('Invalid CSV format');
      vi.mocked(importService.markBatchProcessing).mockResolvedValue({ id: 'batch-1', status: 'PROCESSING' });
      vi.mocked(importService.processCsvFile).mockRejectedValue(csvError);
      vi.mocked(importService.failBatch).mockResolvedValue({ id: 'batch-1', status: 'FAILED' });
      vi.mocked(cleanupTempFile).mockResolvedValue(undefined);

      const job = {
        id: 'job-1',
        data: {
          batchId: 'batch-1',
          filePath: 'temp/test.csv',
        },
        updateProgress: vi.fn(),
      };

      await expect(processorFunction(job)).rejects.toThrow('Invalid CSV format');

      expect(importService.failBatch).toHaveBeenCalledWith('batch-1', {
        error: 'Invalid CSV format',
        jobId: 'job-1',
        timestamp: expect.any(String),
      });
      expect(cleanupTempFile).toHaveBeenCalledWith('temp/test.csv');
    });

    it('should handle non-Error objects thrown during processing', async () => {
      const stringError = 'String error message';
      vi.mocked(importService.markBatchProcessing).mockResolvedValue({ id: 'batch-1', status: 'PROCESSING' });
      vi.mocked(importService.processCsvFile).mockRejectedValue(stringError);
      vi.mocked(importService.failBatch).mockResolvedValue({ id: 'batch-1', status: 'FAILED' });
      vi.mocked(cleanupTempFile).mockResolvedValue(undefined);

      const job = {
        id: 'job-1',
        data: {
          batchId: 'batch-1',
          filePath: 'temp/test.csv',
        },
        updateProgress: vi.fn(),
      };

      await expect(processorFunction(job)).rejects.toThrow('String error message');

      expect(importService.failBatch).toHaveBeenCalledWith('batch-1', {
        error: 'Unknown error',
        jobId: 'job-1',
        timestamp: expect.any(String),
      });
    });

    it('should handle cleanup errors gracefully', async () => {
      const processingError = new Error('Processing failed');
      const cleanupError = new Error('Cleanup failed');

      vi.mocked(importService.markBatchProcessing).mockResolvedValue({ id: 'batch-1', status: 'PROCESSING' });
      vi.mocked(importService.processCsvFile).mockRejectedValue(processingError);
      vi.mocked(cleanupTempFile).mockRejectedValue(cleanupError);
      vi.mocked(importService.failBatch).mockResolvedValue({ id: 'batch-1', status: 'FAILED' });

      const job = {
        id: 'job-1',
        data: {
          batchId: 'batch-1',
          filePath: 'temp/test.csv',
        },
        updateProgress: vi.fn(),
      };

      await expect(processorFunction(job)).rejects.toThrow('Processing failed');

      // Cleanup should still be attempted even if it fails
      expect(cleanupTempFile).toHaveBeenCalledWith('temp/test.csv');
      expect(importService.failBatch).toHaveBeenCalled();
    });

    it('should not attempt cleanup for payload-based processing', async () => {
      const processingError = new Error('Payload processing failed');
      vi.mocked(importService.markBatchProcessing).mockResolvedValue({ id: 'batch-1', status: 'PROCESSING' });
      vi.mocked(importService.processCsvBatch).mockRejectedValue(processingError);
      vi.mocked(importService.failBatch).mockResolvedValue({ id: 'batch-1', status: 'FAILED' });

      const job = {
        id: 'job-1',
        data: {
          batchId: 'batch-1',
          payload: { cases: [] },
        },
        updateProgress: vi.fn(),
      };

      await expect(processorFunction(job)).rejects.toThrow('Payload processing failed');

      expect(cleanupTempFile).not.toHaveBeenCalled();
    });
  });

  describe('Service Error Handling', () => {
    it('should handle queue creation errors', async () => {
      const queueError = new Error('Redis connection failed');
      vi.mocked(importService.queueCsvImportWithFile).mockRejectedValue(queueError);

      const req = {
        file: { originalname: 'test.csv', path: 'temp/test.csv', size: 1024 },
        body: {},
      };
      const res = {
        status: vi.fn(),
        json: vi.fn(),
      };
      const next = vi.fn();

      // Mock successful batch creation
      vi.mocked(importService.createBatch).mockResolvedValue({ id: 'batch-1' });

      await importController.uploadCsv(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(queueError);
    });

    it('should handle batch retrieval errors', async () => {
      const dbError = new Error('Database query failed');
      vi.mocked(importService.getBatchById).mockRejectedValue(dbError);

      const req = { params: { batchId: 'batch-1' }, query: {} };
      const res = {
        status: vi.fn(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await importController.getBatchStatus(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(dbError);
    });

    it('should handle job status retrieval errors', async () => {
      const queueError = new Error('Queue unavailable');
      vi.mocked(importService.getJobStatus).mockRejectedValue(queueError);

      const req = { params: { jobId: 'job-1' } };
      const res = {
        status: vi.fn(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await importController.getJobStatus(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(queueError);
    });

    it('should handle recent batches retrieval errors', async () => {
      const dbError = new Error('Query timeout');
      vi.mocked(importService.getRecentBatches).mockRejectedValue(dbError);

      const req = { query: {} };
      const res = {
        status: vi.fn(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await importController.listRecentBatches(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(dbError);
    });
  });

  describe('Middleware Error Handling', () => {
    it('should handle cleanup errors gracefully', async () => {
      const cleanupError = new Error('File system error');
      vi.mocked(cleanupTempFile).mockRejectedValue(cleanupError);

      // This should not throw in normal operation
      await expect(cleanupTempFile('/nonexistent/file.csv')).rejects.toThrow('File system error');
    });
  });

  describe('JSON Parsing Error Handling', () => {
    it('should handle invalid JSON in metadata', async () => {
      const req = {
        file: { originalname: 'test.csv', path: 'temp/test.csv', size: 1024 },
        body: {
          metadata: 'invalid json {{{',
        },
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      // Mock successful service calls
      vi.mocked(importService.createBatch).mockResolvedValue({ id: 'batch-1' });
      vi.mocked(importService.queueCsvImportWithFile).mockResolvedValue({ jobId: 'job-1', batchId: 'batch-1' });

      await importController.uploadCsv(req as any, res as any, next);

      // Should succeed with default values despite invalid JSON
      expect(res.status).toHaveBeenCalledWith(202);
      expect(importService.createBatch).toHaveBeenCalledWith(
        expect.objectContaining({
          createdBy: 'system', // Default value
        })
      );
    });

    it('should handle invalid JSON in options', async () => {
      const req = {
        file: { originalname: 'test.csv', path: 'temp/test.csv', size: 1024 },
        body: {
          options: 'invalid json [[[',
        },
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      // Mock successful service calls
      vi.mocked(importService.createBatch).mockResolvedValue({ id: 'batch-1' });
      vi.mocked(importService.queueCsvImportWithFile).mockResolvedValue({ jobId: 'job-1', batchId: 'batch-1' });

      await importController.uploadCsv(req as any, res as any, next);

      // Should succeed with empty options despite invalid JSON
      expect(res.status).toHaveBeenCalledWith(202);
      expect(importService.queueCsvImportWithFile).toHaveBeenCalledWith('batch-1', 'temp/test.csv', {});
    });
  });

  describe('File System Error Handling', () => {
    it('should handle file access errors during cleanup', async () => {
      const fsError = new Error('Permission denied');
      vi.mocked(cleanupTempFile).mockRejectedValue(fsError);

      // Simulate worker error handling
      const processingError = new Error('Processing failed');
      vi.mocked(importService.markBatchProcessing).mockResolvedValue({ id: 'batch-1', status: 'PROCESSING' });
      vi.mocked(importService.processCsvFile).mockRejectedValue(processingError);
      vi.mocked(importService.failBatch).mockResolvedValue({ id: 'batch-1', status: 'FAILED' });

      const job = {
        id: 'job-1',
        data: {
          batchId: 'batch-1',
          filePath: 'temp/test.csv',
        },
        updateProgress: vi.fn(),
      };

      await expect(processorFunction(job)).rejects.toThrow('Processing failed');

      // Cleanup should be attempted even if it fails
      expect(cleanupTempFile).toHaveBeenCalledWith('temp/test.csv');
    });
  });

  describe('Progress Update Error Handling', () => {
    it('should handle progress update errors gracefully', async () => {
      const progressError = new Error('Progress update failed');
      const mockJob = {
        id: 'job-1',
        data: {
          batchId: 'batch-1',
          filePath: 'temp/test.csv',
        },
        updateProgress: vi.fn().mockRejectedValue(progressError),
      };

      vi.mocked(importService.markBatchProcessing).mockResolvedValue({ id: 'batch-1', status: 'PROCESSING' });
      vi.mocked(importService.processCsvFile).mockResolvedValue({
        batchId: 'batch-1',
        totals: { totalRecords: 1, successfulRecords: 1, failedRecords: 0 },
      });
      vi.mocked(cleanupTempFile).mockResolvedValue(undefined);

      // Should complete successfully despite progress update failure
      const result = await processorFunction(mockJob);

      expect(result).toBeDefined();
      expect(mockJob.updateProgress).toHaveBeenCalled();
    });
  });
});
