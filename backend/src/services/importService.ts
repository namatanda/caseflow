import type { Prisma } from '@prisma/client';
import { ImportStatus } from '@prisma/client';
import { csvImportQueue } from '@/config/queue';
import type { CsvImportJobData } from '@/workers/csvImportWorker';

import {
  dailyImportBatchRepository,
  DailyImportBatchRepository,
} from '@/repositories/dailyImportBatchRepository';
import type { CaseSearchParams } from './caseService';
import {
  CaseCsvService,
  caseCsvService,
  type CaseCsvImportPayload,
  type CaseCsvImportOptions,
  type CaseCsvExportOptions,
} from './caseCsvService';
import {
  DailyImportBatchService,
  dailyImportBatchService,
} from './dailyImportBatchService';
import { BaseService, type ServiceContext } from './baseService';

export interface CreateImportBatchInput {
  importDate: Date;
  filename: string;
  fileSize: number;
  fileChecksum: string;
  totalRecords: number;
  createdBy: string;
  estimatedCompletionTime?: Date;
  userConfig?: Prisma.InputJsonValue;
  validationWarnings?: Prisma.InputJsonValue;
  emptyRowsSkipped?: number;
}

export interface MarkBatchProcessingOptions {
  processingStartTime?: Date;
  estimatedCompletionTime?: Date;
}

export interface ProcessCsvBatchOptions {
  chunkSize?: number;
  totals?: {
    totalRecords: number;
    failedRecords?: number;
  };
  errorDetails?: Prisma.ImportErrorDetailCreateManyInput[];
  errorLogs?: Prisma.InputJsonValue;
  validationWarnings?: Prisma.InputJsonValue;
  completedAt?: Date;
}

export class ImportService extends BaseService<DailyImportBatchRepository> {
  private readonly csvService: CaseCsvService;
  private readonly batchService: DailyImportBatchService;

  constructor(
    repository: DailyImportBatchRepository = dailyImportBatchRepository,
    csvService: CaseCsvService = caseCsvService,
    batchService: DailyImportBatchService = dailyImportBatchService,
    context: ServiceContext = {}
  ) {
    super(repository, context);
    this.csvService = csvService;
    this.batchService = batchService;
  }

  createBatch(input: CreateImportBatchInput) {
    return this.execute(() =>
      this.repository.create(
        {
          data: {
            importDate: input.importDate,
            filename: input.filename,
            fileSize: input.fileSize,
            fileChecksum: input.fileChecksum,
            totalRecords: input.totalRecords,
            successfulRecords: 0,
            failedRecords: 0,
            errorLogs: '[]',
            status: ImportStatus.PENDING,
            createdBy: input.createdBy,
            estimatedCompletionTime: input.estimatedCompletionTime ?? null,
            processingStartTime: null,
            userConfig: JSON.stringify(input.userConfig ?? {}),
            validationWarnings: JSON.stringify(input.validationWarnings ?? []),
            emptyRowsSkipped: input.emptyRowsSkipped ?? 0,
          },
        } satisfies Prisma.DailyImportBatchCreateArgs
      )
    );
  }

  markBatchProcessing(batchId: string, options: MarkBatchProcessingOptions = {}) {
    return this.execute(() =>
      this.repository.update(
        {
          where: { id: batchId },
          data: {
            status: ImportStatus.PROCESSING,
            processingStartTime: options.processingStartTime ?? new Date(),
            estimatedCompletionTime: options.estimatedCompletionTime ?? null,
          },
        } satisfies Prisma.DailyImportBatchUpdateArgs
      )
    );
  }

  async processCsvBatch(
    batchId: string,
    payload: CaseCsvImportPayload,
    options: ProcessCsvBatchOptions = {}
  ) {
    const { chunkSize, totals, errorDetails, errorLogs, validationWarnings, completedAt } = options;

    const importOptions: CaseCsvImportOptions = {};
    if (typeof chunkSize === 'number') {
      importOptions.chunkSize = chunkSize;
    }

    const importResult = await this.csvService.importCaseData(payload, importOptions);

    const totalRecords = totals?.totalRecords ?? payload.cases.length;
    const successfulRecords = importResult.cases;
    const failedRecords = totals?.failedRecords ?? Math.max(totalRecords - successfulRecords, 0);

    await this.batchService.completeBatch(
      batchId,
      {
        successfulRecords,
        failedRecords,
        ...(typeof errorLogs !== 'undefined' ? { errorLogs } : {}),
        ...(typeof completedAt !== 'undefined' ? { completedAt } : {}),
        ...(typeof validationWarnings !== 'undefined' ? { validationWarnings } : {}),
      },
      errorDetails ?? []
    );

    return {
      batchId,
      totals: {
        totalRecords,
        successfulRecords,
        failedRecords,
      },
      importResult,
    };
  }

  async processCsvFile(
    batchId: string,
    filePath: string,
    options: ProcessCsvBatchOptions = {}
  ) {
    // Import required modules
    const csv = await import('csv-parser');
    const fs = await import('fs');
    const crypto = await import('crypto');

    return new Promise((resolve, reject) => {
      const results: any[] = [];
      let totalRecords = 0;

      fs.createReadStream(filePath)
        .pipe(csv.default())
        .on('data', (data: any) => {
          results.push(data);
          totalRecords++;
        })
        .on('end', async () => {
          try {
            // Calculate file checksum
            const fileBuffer = fs.readFileSync(filePath);
            const checksum = crypto.default.createHash('md5').update(fileBuffer).digest('hex');

            // Update batch with actual record count and checksum
            await this.repository.update({
              where: { id: batchId },
              data: {
                totalRecords,
                fileChecksum: checksum,
              },
            });

            // Convert CSV data to the expected format
            const cases: any[] = results.map((row, index) => ({
              caseNumber: row.caseNumber || `unknown-${index}`,
              courtName: row.courtName || 'Unknown Court',
              caseTypeId: row.caseTypeId || 'unknown',
              filedDate: row.filedDate ? new Date(row.filedDate) : new Date(),
              status: (row.status) || 'ACTIVE',
              totalActivities: parseInt(row.totalActivities) || 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            }));

            // Process the parsed data
            const result = await this.processCsvBatch(
              batchId,
              { cases },
              { ...options, totals: { totalRecords, failedRecords: 0 } }
            );

            resolve(result);
          } catch (error) {
            reject(error);
          }
        })
        .on('error', (error: Error) => {
          reject(error);
        });
    });
  }

  failBatch(batchId: string, errorLogs: Prisma.InputJsonValue) {
    return this.batchService.failBatch(batchId, errorLogs);
  }

  exportCasesForCsv(params: CaseSearchParams = {}, options: CaseCsvExportOptions = {}) {
    return this.csvService.exportCasesForCsv(params, options);
  }

  getBatchById(batchId: string, options: { includeErrorDetails?: boolean } = {}) {
    return this.batchService.getBatchById(batchId, options);
  }

  async queueCsvImport(
    batchId: string,
    payload: CaseCsvImportPayload,
    options: ProcessCsvBatchOptions = {}
  ) {
    const jobOptions: CsvImportJobData['options'] = {};

    if (options.chunkSize !== undefined) jobOptions.chunkSize = options.chunkSize;
    if (options.totals !== undefined) jobOptions.totals = options.totals;
    if (options.errorDetails !== undefined) jobOptions.errorDetails = options.errorDetails;
    if (options.errorLogs !== undefined) jobOptions.errorLogs = options.errorLogs;
    if (options.validationWarnings !== undefined) jobOptions.validationWarnings = options.validationWarnings;
    if (options.completedAt !== undefined) jobOptions.completedAt = options.completedAt.toISOString();

    const jobData: CsvImportJobData = {
      batchId,
      payload,
      options: jobOptions,
    };

    const job = await csvImportQueue.add('csv-import', jobData, {
      priority: 1, // High priority for imports
      delay: 0, // Start immediately
    });

    return {
      jobId: job.id,
      batchId,
    };
  }

  async queueCsvImportWithFile(
    batchId: string,
    filePath: string,
    options: ProcessCsvBatchOptions = {}
  ) {
    const jobOptions: CsvImportJobData['options'] = {};

    if (options.chunkSize !== undefined) jobOptions.chunkSize = options.chunkSize;
    if (options.totals !== undefined) jobOptions.totals = options.totals;
    if (options.errorDetails !== undefined) jobOptions.errorDetails = options.errorDetails;
    if (options.errorLogs !== undefined) jobOptions.errorLogs = options.errorLogs;
    if (options.validationWarnings !== undefined) jobOptions.validationWarnings = options.validationWarnings;
    if (options.completedAt !== undefined) jobOptions.completedAt = options.completedAt.toISOString();

    const jobData: CsvImportJobData = {
      batchId,
      filePath,
      options: jobOptions,
    };

    const job = await csvImportQueue.add('csv-import-file', jobData, {
      priority: 1, // High priority for imports
      delay: 0, // Start immediately
    });

    return {
      jobId: job.id,
      batchId,
    };
  }

  async getJobStatus(jobId: string) {
    try {
      const job = await csvImportQueue.getJob(jobId);
      if (!job) {
        return null;
      }

      const state = await job.getState();
      const progress = job.progress;

      return {
        jobId,
        state,
        progress,
        data: job.data,
        opts: job.opts,
        attemptsMade: job.attemptsMade,
        finishedOn: job.finishedOn,
        processedOn: job.processedOn,
        failedReason: job.failedReason,
      };
    } catch (error) {
      throw new Error(`Failed to get job status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  getRecentBatches(limit = 10) {
    return this.batchService.getRecentBatches(limit);
  }
}

export const importService = new ImportService();
