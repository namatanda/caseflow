import { Worker, Job } from 'bullmq';
import { csvImportQueue, QUEUE_NAMES } from '@/config/queue';
import { importService } from '@/services/importService';
import { logger } from '@/utils/logger';
import { cleanupTempFile } from '@/middleware/upload';
import { websocketService } from '@/services/websocketService';

// Job data interface
export interface CsvImportJobData {
  batchId: string;
  // Either payload (for JSON data) or filePath (for file upload)
  payload?: {
    cases: any[];
    activities?: any[];
    assignments?: any[];
  };
  filePath?: string;
  options?: {
    chunkSize?: number;
    totals?: {
      totalRecords: number;
      failedRecords?: number;
    };
    errorDetails?: any[];
    errorLogs?: any;
    validationWarnings?: any;
    completedAt?: string;
  };
}

// Processor function
export const csvImportProcessor = async (job: Job<CsvImportJobData>) => {
  const { batchId, payload, filePath, options = {} } = job.data;

  logger.info(`Starting CSV import job ${job.id} for batch ${batchId}`);

  try {
    // Emit import started event
    websocketService.emitImportProgress({
      batchId,
      jobId: job.id as string,
      progress: 0,
      stage: 'validation',
      message: 'Starting import process',
    });

    // Update job progress
    try {
      await job.updateProgress(10);
    } catch (error) {
      logger.warn('Failed to update progress:', error);
    }

    // Mark batch as processing
    await importService.markBatchProcessing(batchId);

    // Emit progress update
    websocketService.emitImportProgress({
      batchId,
      jobId: job.id as string,
      progress: 20,
      stage: 'parsing',
      message: 'Parsing CSV file',
    });

    try {
      await job.updateProgress(50);
    } catch (error) {
      logger.warn('Failed to update progress:', error);
    }

    // Emit progress update
    websocketService.emitImportProgress({
      batchId,
      jobId: job.id as string,
      progress: 50,
      stage: 'importing',
      message: 'Importing records',
    });

    // Process the CSV batch
    const processOptions: any = {};
    if (options?.chunkSize) processOptions.chunkSize = options.chunkSize;
    if (options?.totals) processOptions.totals = options.totals;
    if (options?.errorDetails) processOptions.errorDetails = options.errorDetails;
    if (options?.errorLogs) processOptions.errorLogs = options.errorLogs;
    if (options?.validationWarnings) processOptions.validationWarnings = options.validationWarnings;
    if (options?.completedAt) processOptions.completedAt = new Date(options.completedAt);

    let result;

    if (filePath) {
      // Handle file-based import
      result = await importService.processCsvFile(batchId, filePath, processOptions);
    } else if (payload) {
      // Handle payload-based import (legacy)
      result = await importService.processCsvBatch(
        batchId,
        {
          cases: payload.cases,
          ...(payload.activities && { activities: payload.activities }),
          ...(payload.assignments && { assignments: payload.assignments }),
        },
        processOptions
      );
    } else {
      throw new Error('Either filePath or payload must be provided');
    }

    try {
      await job.updateProgress(100);
    } catch (error) {
      logger.warn('Failed to update progress:', error);
    }

    // Emit completion event
    websocketService.emitImportCompleted({
      batchId,
      jobId: job.id as string,
      totalRecords: (result as any).totals.totalRecords,
      successfulRecords: (result as any).totals.successfulRecords,
      failedRecords: (result as any).totals.failedRecords,
      duration: Date.now() - job.processedOn!,
    });

    logger.info(`Completed CSV import job ${job.id} for batch ${batchId}`, {
      successfulRecords: (result as any).totals.successfulRecords,
      failedRecords: (result as any).totals.failedRecords,
    });

    // Clean up temp file after successful processing
    if (filePath) {
      try {
        await cleanupTempFile(filePath);
        logger.debug(`Cleaned up temp file: ${filePath}`);
      } catch (error) {
        logger.error('Error cleaning up temp file:', error);
      }
    }

    return result;
  } catch (error) {
    logger.error(`Failed CSV import job ${job.id} for batch ${batchId}:`, error);

    // Emit failure event
    websocketService.emitImportFailed({
      batchId,
      jobId: job.id as string,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });

    // Clean up temp file on error
    if (filePath) {
      try {
        await cleanupTempFile(filePath);
        logger.debug(`Cleaned up temp file after error: ${filePath}`);
      } catch (cleanupError) {
        logger.error('Error cleaning up temp file after error:', cleanupError);
      }
    }

    // Mark batch as failed
    await importService.failBatch(batchId, {
      error: error instanceof Error ? error.message : 'Unknown error',
      jobId: job.id,
      timestamp: new Date().toISOString(),
    });

    throw error;
  }
};

// Create worker
export const csvImportWorker = new Worker<CsvImportJobData>(
  QUEUE_NAMES.CSV_IMPORT,
  csvImportProcessor,
  {
    connection: csvImportQueue.opts.connection,
    concurrency: 2, // Process 2 jobs concurrently
    limiter: {
      max: 10, // Max 10 jobs per duration
      duration: 1000, // Per second
    },
  }
);

// Worker event handlers
csvImportWorker.on('completed', (job: Job<CsvImportJobData>) => {
  logger.info(`Job ${job.id} completed successfully`);
});

csvImportWorker.on('failed', (job: Job<CsvImportJobData> | undefined, err: Error) => {
  logger.error(`Job ${job?.id} failed:`, err);
});

csvImportWorker.on('progress', (job: Job<CsvImportJobData>, progress: any) => {
  logger.debug(`Job ${job.id} progress: ${progress}%`);
});

csvImportWorker.on('stalled', (jobId: string) => {
  logger.warn(`Job ${jobId} stalled`);
});

// Graceful shutdown
export async function closeWorker(): Promise<void> {
  try {
    await csvImportWorker.close();
    logger.info('CSV import worker closed successfully');
  } catch (error) {
    logger.error('Error closing CSV import worker:', error);
  }
}