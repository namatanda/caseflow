import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Job } from 'bullmq';

// Mock dependencies
vi.mock('@/config/queue', () => ({
  csvImportQueue: {
    opts: { connection: {} },
  },
  QUEUE_NAMES: {
    CSV_IMPORT: 'csv-import',
  },
}));

vi.mock('@/services/importService', () => ({
  importService: {
    markBatchProcessing: vi.fn(),
    processCsvFile: vi.fn(),
    processCsvBatch: vi.fn(),
    failBatch: vi.fn(),
  },
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@/middleware/upload', () => ({
  cleanupTempFile: vi.fn(),
}));

import { csvImportProcessor, csvImportWorker, closeWorker } from '../../workers/csvImportWorker';
import { importService } from '../../services/importService';
import { logger } from '../../utils/logger';
import { cleanupTempFile } from '../../middleware/upload';

// Use processor function for testing
const processorFunction = csvImportProcessor;

describe('CSV Import Worker', () => {
  let mockJob: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockJob = {
      id: 'job-1',
      data: {
        batchId: 'batch-1',
        filePath: '/temp/test.csv',
        options: {
          chunkSize: 100,
          totals: { totalRecords: 50, failedRecords: 2 },
        },
      },
      updateProgress: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('File-based CSV import processing', () => {
    it('should process CSV file successfully', async () => {
      const mockResult = {
        batchId: 'batch-1',
        totals: { totalRecords: 50, successfulRecords: 48, failedRecords: 2 },
        importResult: { cases: 48, activities: 10, assignments: 5 },
      };

      vi.mocked(importService.markBatchProcessing).mockResolvedValue({ id: 'batch-1', status: 'PROCESSING' });
      vi.mocked(importService.processCsvFile).mockResolvedValue(mockResult);
      vi.mocked(cleanupTempFile).mockResolvedValue(undefined);

      const result = await processorFunction(mockJob);

      expect(importService.markBatchProcessing).toHaveBeenCalledWith('batch-1');
      expect(importService.processCsvFile).toHaveBeenCalledWith('batch-1', '/temp/test.csv', {
        chunkSize: 100,
        totals: { totalRecords: 50, failedRecords: 2 },
      });
      expect(mockJob.updateProgress).toHaveBeenCalledWith(10);
      expect(mockJob.updateProgress).toHaveBeenCalledWith(20);
      expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
      expect(cleanupTempFile).toHaveBeenCalledWith('/temp/test.csv');
      expect(logger.info).toHaveBeenCalledWith('Completed CSV import job job-1 for batch batch-1', {
        successfulRecords: 48,
        failedRecords: 2,
      });
      expect(result).toBe(mockResult);
    });

    it('should process payload-based CSV import', async () => {
      mockJob.data = {
        batchId: 'batch-2',
        payload: {
          cases: [{ id: 'case-1', caseNumber: 'CASE-001' }],
          activities: [{ id: 'activity-1', caseId: 'case-1' }],
          assignments: [{ caseId: 'case-1', judgeId: 'judge-1' }],
        },
        options: {
          errorLogs: ['validation error'],
          completedAt: '2024-01-01T10:00:00Z',
        },
      };

      const mockResult = {
        batchId: 'batch-2',
        totals: { totalRecords: 1, successfulRecords: 1, failedRecords: 0 },
        importResult: { cases: 1, activities: 1, assignments: 1 },
      };

      vi.mocked(importService.markBatchProcessing).mockResolvedValue({ id: 'batch-2', status: 'PROCESSING' });
      vi.mocked(importService.processCsvBatch).mockResolvedValue(mockResult);

      const result = await processorFunction(mockJob);

      expect(importService.processCsvBatch).toHaveBeenCalledWith('batch-2', {
        cases: [{ id: 'case-1', caseNumber: 'CASE-001' }],
        activities: [{ id: 'activity-1', caseId: 'case-1' }],
        assignments: [{ caseId: 'case-1', judgeId: 'judge-1' }],
      }, {
        errorLogs: ['validation error'],
        completedAt: new Date('2024-01-01T10:00:00Z'),
      });
      expect(result).toBe(mockResult);
    });

    it('should throw error when neither filePath nor payload is provided', async () => {
      mockJob.data = {
        batchId: 'batch-3',
        options: {},
      };

      vi.mocked(importService.markBatchProcessing).mockResolvedValue({ id: 'batch-3', status: 'PROCESSING' });

      await expect(processorFunction(mockJob)).rejects.toThrow(
        'Either filePath or payload must be provided'
      );
    });

    it('should handle processing errors and cleanup', async () => {
      const processingError = new Error('CSV parsing failed');

      vi.mocked(importService.markBatchProcessing).mockResolvedValue({ id: 'batch-1', status: 'PROCESSING' });
      vi.mocked(importService.processCsvFile).mockRejectedValue(processingError);
      vi.mocked(cleanupTempFile).mockResolvedValue(undefined);
      vi.mocked(importService.failBatch).mockResolvedValue({ id: 'batch-1', status: 'FAILED' });

      await expect(processorFunction(mockJob)).rejects.toThrow('CSV parsing failed');

      expect(cleanupTempFile).toHaveBeenCalledWith('/temp/test.csv');
      expect(importService.failBatch).toHaveBeenCalledWith('batch-1', {
        error: 'CSV parsing failed',
        jobId: 'job-1',
        timestamp: expect.any(String),
      });
      expect(logger.error).toHaveBeenCalledWith('Failed CSV import job job-1 for batch batch-1:', processingError);
    });

    it('should handle non-Error processing errors', async () => {
      const processingError = 'String error';

      vi.mocked(importService.markBatchProcessing).mockResolvedValue({ id: 'batch-1', status: 'PROCESSING' });
      vi.mocked(importService.processCsvFile).mockRejectedValue(processingError);
      vi.mocked(cleanupTempFile).mockResolvedValue(undefined);
      vi.mocked(importService.failBatch).mockResolvedValue({ id: 'batch-1', status: 'FAILED' });

      await expect(processorFunction(mockJob)).rejects.toThrow('String error');

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

      await expect(processorFunction(mockJob)).rejects.toThrow('Processing failed');

      // Cleanup should still be attempted even if it fails
      expect(cleanupTempFile).toHaveBeenCalledWith('/temp/test.csv');
    });

    it('should not attempt cleanup for payload-based imports', async () => {
      mockJob.data = {
        batchId: 'batch-2',
        payload: {
          cases: [{ id: 'case-1', caseNumber: 'CASE-001' }],
        },
      };

      const mockResult = {
        batchId: 'batch-2',
        totals: { totalRecords: 1, successfulRecords: 1, failedRecords: 0 },
        importResult: { cases: 1, activities: 0, assignments: 0 },
      };

      vi.mocked(importService.markBatchProcessing).mockResolvedValue({ id: 'batch-2', status: 'PROCESSING' });
      vi.mocked(importService.processCsvBatch).mockResolvedValue(mockResult);

      await processorFunction(mockJob);

      expect(cleanupTempFile).not.toHaveBeenCalled();
    });

    it('should handle options with all fields', async () => {
      mockJob.data = {
        batchId: 'batch-1',
        filePath: '/temp/test.csv',
        options: {
          chunkSize: 500,
          totals: { totalRecords: 100, failedRecords: 5 },
          errorDetails: [{ batchId: 'batch-1', rowNumber: 10, errorType: 'VALIDATION', errorMessage: 'Invalid data', severity: 'ERROR' }],
          errorLogs: ['Error on row 10'],
          validationWarnings: ['Warning on row 5'],
          completedAt: '2024-01-01T12:00:00Z',
        },
      };

      const mockResult = {
        batchId: 'batch-1',
        totals: { totalRecords: 100, successfulRecords: 95, failedRecords: 5 },
        importResult: { cases: 95, activities: 20, assignments: 10 },
      };

      vi.mocked(importService.markBatchProcessing).mockResolvedValue({ id: 'batch-1', status: 'PROCESSING' });
      vi.mocked(importService.processCsvFile).mockResolvedValue(mockResult);
      vi.mocked(cleanupTempFile).mockResolvedValue(undefined);

      await processorFunction(mockJob);

      expect(importService.processCsvFile).toHaveBeenCalledWith('batch-1', '/temp/test.csv', {
        chunkSize: 500,
        totals: { totalRecords: 100, failedRecords: 5 },
        errorDetails: [{ batchId: 'batch-1', rowNumber: 10, errorType: 'VALIDATION', errorMessage: 'Invalid data', severity: 'ERROR' }],
        errorLogs: ['Error on row 10'],
        validationWarnings: ['Warning on row 5'],
        completedAt: new Date('2024-01-01T12:00:00Z'),
      });
    });

    it('should handle empty options', async () => {
      mockJob.data = {
        batchId: 'batch-1',
        filePath: '/temp/test.csv',
      };

      const mockResult = {
        batchId: 'batch-1',
        totals: { totalRecords: 10, successfulRecords: 10, failedRecords: 0 },
        importResult: { cases: 10, activities: 0, assignments: 0 },
      };

      vi.mocked(importService.markBatchProcessing).mockResolvedValue({ id: 'batch-1', status: 'PROCESSING' });
      vi.mocked(importService.processCsvFile).mockResolvedValue(mockResult);
      vi.mocked(cleanupTempFile).mockResolvedValue(undefined);

      await processorFunction(mockJob);

      expect(importService.processCsvFile).toHaveBeenCalledWith('batch-1', '/temp/test.csv', {});
    });
  });

  describe('Worker event handlers', () => {
    it('should log job completion', () => {
      const mockJob = { id: 'job-1' } as Job;

      // Trigger the completed event
      (csvImportWorker as any).emit('completed', mockJob);

      expect(logger.info).toHaveBeenCalledWith('Job job-1 completed successfully');
    });

    it('should log job failure', () => {
      const mockJob = { id: 'job-1' } as Job;
      const error = new Error('Job failed');

      // Trigger the failed event
      (csvImportWorker as any).emit('failed', mockJob, error);

      expect(logger.error).toHaveBeenCalledWith('Job job-1 failed:', error);
    });

    it('should handle undefined job in failure', () => {
      const error = new Error('Job failed');

      // Trigger the failed event with undefined job
      (csvImportWorker as any).emit('failed', undefined, error);

      expect(logger.error).toHaveBeenCalledWith('Job undefined failed:', error);
    });

    it('should log job progress', () => {
      const mockJob = { id: 'job-1' } as Job;
      const progress = 50;

      // Trigger the progress event
      (csvImportWorker as any).emit('progress', mockJob, progress);

      expect(logger.debug).toHaveBeenCalledWith('Job job-1 progress: 50%');
    });

    it('should log stalled jobs', () => {
      const jobId = 'job-1';

      // Trigger the stalled event
      (csvImportWorker as any).emit('stalled', jobId);

      expect(logger.warn).toHaveBeenCalledWith('Job job-1 stalled');
    });
  });

  describe('Worker configuration', () => {
    it('should be configured with correct options', () => {
      // The worker should be created with the correct configuration
      expect(csvImportWorker).toBeDefined();
      expect(csvImportWorker.opts.concurrency).toBe(2);
      expect(csvImportWorker.opts.limiter).toEqual({
        max: 10,
        duration: 1000,
      });
    });
  });

  describe('closeWorker function', () => {
    it('should close worker successfully', async () => {
      const mockClose = vi.fn().mockResolvedValue(undefined);
      // Mock the worker's close method
      Object.defineProperty(csvImportWorker, 'close', {
        value: mockClose,
        writable: true,
      });

      await closeWorker();

      expect(mockClose).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('CSV import worker closed successfully');
    });

    it('should handle close errors', async () => {
      const closeError = new Error('Close failed');
      const mockClose = vi.fn().mockRejectedValue(closeError);
      // Mock the worker's close method
      Object.defineProperty(csvImportWorker, 'close', {
        value: mockClose,
        writable: true,
      });

      await closeWorker();

      expect(mockClose).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith('Error closing CSV import worker:', closeError);
    });
  });
});