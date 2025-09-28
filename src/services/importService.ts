import type { Prisma } from '@prisma/client';
import { ImportStatus } from '@prisma/client';

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

export interface ProcessCsvBatchOptions extends CaseCsvImportOptions {
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
            errorLogs: [],
            status: ImportStatus.PENDING,
            createdBy: input.createdBy,
            estimatedCompletionTime: input.estimatedCompletionTime ?? null,
            processingStartTime: null,
            userConfig: input.userConfig ?? {},
            validationWarnings: input.validationWarnings ?? [],
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
    const { chunkSize, skipDuplicates, totals, errorDetails, errorLogs, validationWarnings, completedAt } = options;

    const importOptions: CaseCsvImportOptions = {};
    if (typeof chunkSize === 'number') {
      importOptions.chunkSize = chunkSize;
    }
    if (typeof skipDuplicates === 'boolean') {
      importOptions.skipDuplicates = skipDuplicates;
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

  failBatch(batchId: string, errorLogs: Prisma.InputJsonValue) {
    return this.batchService.failBatch(batchId, errorLogs);
  }

  exportCasesForCsv(params: CaseSearchParams = {}, options: CaseCsvExportOptions = {}) {
    return this.csvService.exportCasesForCsv(params, options);
  }

  getBatchById(batchId: string, options: { includeErrorDetails?: boolean } = {}) {
    return this.batchService.getBatchById(batchId, options);
  }

  getRecentBatches(limit = 10) {
    return this.batchService.getRecentBatches(limit);
  }
}

export const importService = new ImportService();
