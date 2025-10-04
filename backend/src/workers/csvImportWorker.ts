import { Worker, Job } from 'bullmq';
import { csvImportQueue, QUEUE_NAMES } from '@/config/queue';
import { importService } from '@/services/importService';
import { logger } from '@/utils/logger';
import { cleanupTempFile } from '@/middleware/upload';
import { websocketService } from '@/services/websocketService';
import {
  csvImportJobsTotal,
  csvImportDuration,
  csvImportRecords,
  csvImportBatchSize,
  csvImportRowProcessingDuration,
  csvImportMemoryUsage,
  csvImportErrorsTotal,
  csvImportThroughput,
  csvImportQueueWaitDuration,
  csvImportBatchProcessingDuration,
} from '@/config/metrics';

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
  const startTime = Date.now();

  logger.info(`Starting CSV import job ${job.id} for batch ${batchId}`);

  // Track queue wait time
  const queueWaitTime = (job.processedOn! - job.timestamp) / 1000;
  csvImportQueueWaitDuration.observe(queueWaitTime);

  // Track initial memory usage
  csvImportMemoryUsage.set(process.memoryUsage().heapUsed);

  // Track job started
  csvImportJobsTotal.inc({ status: 'processing' });

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

    // Track batch processing start
    const processingStartTime = Date.now();

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

    // Calculate batch processing metrics
    const processingDuration = (Date.now() - processingStartTime) / 1000;
    csvImportBatchProcessingDuration.observe(processingDuration);

    const totalRecords = (result as any).totals.totalRecords || 0;
    const throughput = totalRecords > 0 ? totalRecords / processingDuration : 0;
    csvImportThroughput.set(throughput);

    // Track final memory usage
    csvImportMemoryUsage.set(process.memoryUsage().heapUsed);

    // Track batch size and records
    csvImportBatchSize.set(totalRecords);
    csvImportRecords.inc({ status: 'successful' }, (result as any).totals.successfulRecords || 0);
    csvImportRecords.inc({ status: 'failed' }, (result as any).totals.failedRecords || 0);

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

    // Track job completion metrics
    csvImportJobsTotal.inc({ status: 'completed' });
    csvImportDuration.observe({ status: 'success' }, (Date.now() - startTime) / 1000);

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
    // Track error metrics
    const errorType = error instanceof Error && error.message.includes('validation') ? 'validation' :
                      error instanceof Error && error.message.includes('database') ? 'database' : 'unknown';
    csvImportErrorsTotal.inc({ error_type: errorType });
    csvImportJobsTotal.inc({ status: 'failed' });
    csvImportDuration.observe({ status: 'failed' }, (Date.now() - startTime) / 1000);

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